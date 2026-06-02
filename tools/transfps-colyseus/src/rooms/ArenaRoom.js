// ─────────────────────────────────────────────────────────────────
//  ArenaRoom — sala de partida server-authoritative.
//
//  Responsabilidades:
//   - onAuth: valida JWT do Supabase (RS256/HS256) e extrai user id
//   - onJoin: cria PlayerState, define host se primeiro
//   - tick 20Hz (default Colyseus): IA dos mobs, validação física básica
//   - mensagens recebidas: input do player, hits, ready, pvp_toggle,
//     start_match, spawn_mob, chat
// ─────────────────────────────────────────────────────────────────
import { Room } from '@colyseus/core';
import { ArenaState, PlayerState, MobState } from '../schema/ArenaState.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://myylkpoisqijfnptlnyk.supabase.co';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''; // HS256 secret (preferencial)
const JWT_REQUIRED = process.env.JWT_REQUIRED !== '0';

// JWKS para RS256 (fallback se não tiver shared secret)
const JWKS = createRemoteJWKSet(new URL(SUPABASE_URL + '/auth/v1/.well-known/jwks.json'));

const MOB_KINDS = [
  { kind: 'cb_zombie',        hp:  60, dmg: 12, speed: 3.5, range: 2.2, atkCd: 1.4, tier: 'rookie' },
  { kind: 'cb_skeleton',      hp:  70, dmg: 14, speed: 5.0, range: 2.4, atkCd: 1.3, tier: 'rookie' },
  { kind: 'cb_goblin',        hp:  50, dmg: 10, speed: 6.5, range: 2.0, atkCd: 1.0, tier: 'rookie' },
  { kind: 'cb_ghoul',         hp:  95, dmg: 18, speed: 5.0, range: 2.4, atkCd: 1.2, tier: 'rookie' },
  { kind: 'cb_skeletonRogue', hp:  70, dmg: 18, speed: 7.0, range: 2.2, atkCd: 0.9, tier: 'rookie' },
  { kind: 'cb_orc',           hp: 180, dmg: 24, speed: 4.5, range: 2.8, atkCd: 1.6, tier: 'champion' },
  { kind: 'cb_demon',         hp: 220, dmg: 30, speed: 5.5, range: 2.8, atkCd: 1.4, tier: 'champion' },
  { kind: 'cb_necromancer',   hp: 160, dmg: 26, speed: 4.5, range: 3.0, atkCd: 1.6, tier: 'champion' },
];

let _mobUid = 0;

export class ArenaRoom extends Room {
  // metadata visivel no lobby
  static metadata = { type: 'arena' };

  async onCreate(options) {
    this.maxClients = Math.max(2, Math.min(16, parseInt(options.maxPlayers) || 8));
    this.state = new ArenaState();
    this.state.host_id = '';
    this.state.started = false;
    this.state.map_id = String(options.map || 'default');
    this.state.started_at = 0;
    this._lastTick = Date.now();
    this._cooldowns = new Map(); // mobId → { cdT, lastAttack }

    // metadata pra LobbyRoom listar com player_count + name + map
    this.setMetadata({
      name: String(options.name || 'Sala'),
      map: this.state.map_id,
      has_password: !!options.password,
      host_nickname: options.host_nickname || '',
    });

    if (options.password) {
      this.setPrivate(false); // listada mas requer senha
      this._password = String(options.password);
    }

    // Tick autoritativo de IA de mobs (10Hz é suficiente; client lerpea)
    this.setSimulationInterval((deltaTime) => this._tick(deltaTime / 1000), 100);

    // Handlers de input
    this.onMessage('input', (client, payload) => this._onInput(client, payload));
    this.onMessage('hit_player', (client, payload) => this._onHitPlayer(client, payload));
    this.onMessage('hit_mob', (client, payload) => this._onHitMob(client, payload));
    this.onMessage('ready', (client, payload) => this._onReady(client, payload));
    this.onMessage('pvp_toggle', (client, payload) => this._onPvpToggle(client, payload));
    this.onMessage('start_match', (client) => this._onStartMatch(client));
    this.onMessage('spawn_mob', (client, payload) => this._onSpawnMob(client, payload));
    this.onMessage('clear_mobs', (client) => this._onClearMobs(client));
    this.onMessage('respawn', (client) => this._onRespawn(client));
    this.onMessage('chat', (client, payload) => this._onChat(client, payload));

    console.log(`[ArenaRoom] criada id=${this.roomId} map=${this.state.map_id} max=${this.maxClients}`);
  }

  // ── AUTH: valida JWT do Supabase ANTES do join ───────────────
  async onAuth(client, options /*, request */) {
    const token = options?.token;
    if (!JWT_REQUIRED) {
      return { sub: options?.player_id || client.sessionId, nickname: options?.nickname || 'Player' };
    }
    if (!token) throw new Error('JWT obrigatorio');
    let payload;
    try {
      if (SUPABASE_JWT_SECRET) {
        const enc = new TextEncoder().encode(SUPABASE_JWT_SECRET);
        const r = await jwtVerify(token, enc, { algorithms: ['HS256'] });
        payload = r.payload;
      } else {
        const r = await jwtVerify(token, JWKS);
        payload = r.payload;
      }
    } catch (e) {
      console.warn('[onAuth] JWT inválido:', e.message);
      throw new Error('JWT inválido');
    }
    if (!payload.sub) throw new Error('JWT sem sub');
    if (options?.password && this._password && options.password !== this._password) {
      throw new Error('senha incorreta');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      nickname: options?.nickname || payload.email?.split('@')[0] || 'Player',
      avatar_url: options?.avatar_url || payload.user_metadata?.avatar_url || '',
    };
  }

  onJoin(client, options, auth) {
    if (auth?.sub && this.state.players.has(auth.sub)) {
      // Já conectado em outra session — remove sessão velha
      const old = this.state.players.get(auth.sub);
      console.log(`[ArenaRoom] reconnect: kickando session antiga de ${auth.sub.slice(0,8)}`);
    }
    const playerId = auth.sub;
    const p = new PlayerState();
    p.id = playerId;
    p.nickname = auth.nickname || 'Player';
    p.avatar_url = auth.avatar_url || '';
    p.is_host = !this.state.host_id;
    p.is_ready = false;
    p.pvp_on = false;
    p.hp = 100;
    p.maxHp = 100;
    p.x = 0; p.y = 1; p.z = 0;
    p.ry = 0; p.vy = 0;
    p.anim_state = 'idle';
    p.weapon = 'unarmed';
    p.dead = false;

    this.state.players.set(playerId, p);
    if (p.is_host) this.state.host_id = playerId;
    client.userData = { playerId };
    console.log(`[ArenaRoom] +${p.nickname} ${p.is_host ? '[HOST]' : ''} (${this.state.players.size} players)`);
  }

  onLeave(client, consented) {
    const pid = client.userData?.playerId;
    if (!pid) return;
    const player = this.state.players.get(pid);
    if (!player) return;
    console.log(`[ArenaRoom] -${player.nickname}`);

    // Se host saiu, transfere
    const wasHost = (pid === this.state.host_id);
    this.state.players.delete(pid);
    if (wasHost) {
      const next = this.state.players.values().next().value;
      if (next) {
        next.is_host = true;
        this.state.host_id = next.id;
        console.log(`[ArenaRoom] host transferido pra ${next.nickname}`);
      } else {
        this.state.host_id = '';
      }
    }
    // Reset ready quando partida ainda não começou pra forçar resync
    if (!this.state.started) {
      this.state.players.forEach((p) => { p.is_ready = false; });
    }
  }

  // ── Inputs ──────────────────────────────────────────────────
  _onInput(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    // Trust limitado: cliente envia posição (server-auth real exigiria simular),
    // mas server-side filtra deltas absurdos.
    const nx = +payload.x, ny = +payload.y, nz = +payload.z;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return;
    // Anti-teleport (max 50u/tick — generoso pra dash)
    const dx = nx - p.x, dz = nz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 50) return; // rejeita
    p.x = nx; p.y = ny; p.z = nz;
    if (Number.isFinite(+payload.ry)) p.ry = +payload.ry;
    if (Number.isFinite(+payload.vy)) p.vy = +payload.vy;
    if (typeof payload.state === 'string') p.anim_state = payload.state.slice(0, 24);
    if (typeof payload.weapon === 'string') p.weapon = payload.weapon.slice(0, 32);
  }

  _onHitPlayer(client, payload) {
    const pid = client.userData?.playerId;
    const attacker = this.state.players.get(pid);
    const target = this.state.players.get(String(payload.to || ''));
    if (!attacker || !target || target.dead) return;
    if (!attacker.pvp_on || !target.pvp_on) return; // PvP gate
    const dmg = Math.max(0, Math.min(500, +payload.dmg || 0));
    target.hp = Math.max(0, target.hp - dmg);
    if (target.hp <= 0) {
      target.dead = true;
      this.broadcast('died', { player_id: target.id, killer: attacker.id });
    }
  }

  _onHitMob(client, payload) {
    const mob = this.state.mobs.get(String(payload.mob_id || ''));
    if (!mob || mob.hp <= 0) return;
    const dmg = Math.max(0, Math.min(500, +payload.dmg || 0));
    mob.hp = Math.max(0, mob.hp - dmg);
    if (mob.hp <= 0) {
      mob.state = 'dead';
      this.broadcast('mob_killed', { mob_id: mob.id, by: client.userData?.playerId });
      // Despawn em 2s
      setTimeout(() => {
        if (this.state.mobs.has(mob.id)) this.state.mobs.delete(mob.id);
      }, 2000);
    }
  }

  _onReady(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p || this.state.started) return;
    p.is_ready = !!payload.is_ready;
  }

  _onPvpToggle(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p) return;
    p.pvp_on = !!payload.pvp_on;
  }

  _onStartMatch(client) {
    const pid = client.userData?.playerId;
    if (pid !== this.state.host_id) return;
    let notReady = 0;
    this.state.players.forEach((p) => { if (!p.is_ready) notReady++; });
    if (notReady > 0) {
      client.send('error', { code: 'not_ready', msg: `${notReady} player(s) sem PRONTO` });
      return;
    }
    this.state.started = true;
    this.state.started_at = Date.now();
    this.broadcast('match_started', {});
    // Spawn inicial
    const initial = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < initial; i++) this._spawnMob();
    console.log(`[ArenaRoom] partida iniciada em ${this.roomId}`);
  }

  _onSpawnMob(client, payload) {
    if (!this.state.started) return;
    // Rate limit por player
    const pid = client.userData?.playerId;
    const now = Date.now();
    if (!this._spawnRate) this._spawnRate = new Map();
    const last = this._spawnRate.get(pid) || 0;
    if (now - last < 800) return;
    this._spawnRate.set(pid, now);
    this._spawnMob(payload?.kind);
  }

  _onClearMobs(client) {
    const pid = client.userData?.playerId;
    if (pid !== this.state.host_id) return;
    this.state.mobs.forEach((_, id) => this.state.mobs.delete(id));
  }

  _onRespawn(client) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p) return;
    p.hp = p.maxHp;
    p.dead = false;
    p.x = 0; p.y = 1; p.z = 0;
    this.broadcast('respawn', { player_id: p.id });
  }

  _onChat(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p || !payload?.msg) return;
    const msg = String(payload.msg).slice(0, 500);
    this.broadcast('chat', { from: p.id, nick: p.nickname, msg });
  }

  // ── Tick autoritativo (IA mobs) ──────────────────────────────
  _tick(dt) {
    if (!this.state.started || this.state.mobs.size === 0) return;
    const players = [];
    this.state.players.forEach((p) => { if (!p.dead) players.push(p); });
    if (!players.length) return;

    this.state.mobs.forEach((mob) => {
      if (mob.hp <= 0) return;
      const cd = this._cooldowns.get(mob.id) || { cdT: 0, lastAttack: 0 };
      if (cd.cdT > 0) cd.cdT = Math.max(0, cd.cdT - dt);

      // Acha player vivo mais próximo
      let best = null, bestDist = Infinity;
      for (const p of players) {
        const dx = p.x - mob.x, dz = p.z - mob.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestDist) { bestDist = d; best = p; }
      }
      if (!best || bestDist > 25) {
        mob.state = 'idle';
        this._cooldowns.set(mob.id, cd);
        return;
      }
      mob.target_id = best.id;
      const def = MOB_KINDS.find((k) => k.kind === mob.kind) || MOB_KINDS[0];

      const dx = best.x - mob.x, dz = best.z - mob.z;
      if (bestDist > def.range) {
        const nx = dx / bestDist, nz = dz / bestDist;
        mob.x += nx * def.speed * dt;
        mob.z += nz * def.speed * dt;
        mob.ry = Math.atan2(nx, nz) * 180 / Math.PI;
        mob.state = 'run';
      } else {
        mob.state = 'attack';
        if (cd.cdT <= 0) {
          cd.cdT = def.atkCd;
          cd.lastAttack = Date.now();
          // Aplica dano direto no state autoritativo
          best.hp = Math.max(0, best.hp - def.dmg);
          if (best.hp <= 0) {
            best.dead = true;
            this.broadcast('died', { player_id: best.id, killer: mob.id });
          }
          this.broadcast('mob_attack', { mob_id: mob.id, target_id: best.id, dmg: def.dmg });
        }
      }
      this._cooldowns.set(mob.id, cd);
    });
  }

  _spawnMob(kindReq) {
    if (this.state.mobs.size >= 40) return;
    const def = (typeof kindReq === 'string' && MOB_KINDS.find((k) => k.kind === kindReq))
      || MOB_KINDS[Math.floor(Math.random() * MOB_KINDS.length)];

    // Pos: perto de um player random
    let baseX = 0, baseZ = 0;
    const list = [];
    this.state.players.forEach((p) => { if (!p.dead) list.push(p); });
    if (list.length) {
      const t = list[Math.floor(Math.random() * list.length)];
      baseX = t.x; baseZ = t.z;
    }
    const ang = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 10;
    const id = `mob_${++_mobUid}`;
    const m = new MobState();
    m.id = id;
    m.kind = def.kind;
    m.tier = def.tier;
    m.x = baseX + Math.cos(ang) * dist;
    m.y = 0;
    m.z = baseZ + Math.sin(ang) * dist;
    m.ry = 0;
    m.hp = def.hp;
    m.maxHp = def.hp;
    m.state = 'idle';
    m.target_id = '';
    this.state.mobs.set(id, m);
  }

  onDispose() {
    console.log(`[ArenaRoom] descartada ${this.roomId}`);
  }
}
