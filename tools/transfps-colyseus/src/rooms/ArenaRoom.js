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
import { ArenaState, PlayerState, MobState, DropState, PropState, FxState } from '../schema/ArenaState.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { validateHit, getWeapon } from './WeaponTable.js';
import { validateSkillCast, getSkill } from './SkillTable.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://myylkpoisqijfnptlnyk.supabase.co';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''; // HS256 secret (preferencial)
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_REQUIRED = process.env.JWT_REQUIRED !== '0';

/**
 * Persiste stats do player em transfps.profiles ao sair.
 * Usa RPC dedicada transfps_apply_match_result (criada na migration).
 * Service role bypassa RLS — só o servidor MP pode chamar.
 */
async function persistStats(player) {
  if (!SUPABASE_SERVICE_ROLE) return;
  if (!player.id || player.id.length < 10) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/transfps_apply_match_result', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_player_id: player.id,
        p_kills_delta: player.kills | 0,
        p_deaths_delta: player.deaths | 0,
        p_xp_gained: player.xp | 0,
        p_coins_gained: player.coins | 0,
        p_final_level: player.level | 0,
      }),
    });
    if (r.status >= 400) {
      console.warn(`[persistStats] HTTP ${r.status} ${await r.text().catch(() => '')}`);
    } else {
      console.log(`[persistStats] ${player.nickname} kills=${player.kills} xp=${player.xp} level=${player.level} coins=${player.coins}`);
    }
  } catch (e) {
    console.warn('[persistStats] erro:', e.message);
  }
}

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
let _dropUid = 0;
let _propUid = 0;
let _fxUid = 0;

// ── Spawn points por mapa ──
// Cada mapa tem 8 pontos espalhados em círculo de raio 15u em volta do centro
// para evitar 8 jogadores sobrepostos em 0,0,0.
function _ring(cx, cy, cz, radius, count = 8) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * radius, y: cy, z: cz + Math.sin(a) * radius });
  }
  return out;
}
const SPAWN_POINTS = {
  default:         _ring(0, 1, 0, 8),
  forest:          _ring(0, 1, 0, 10),
  lowpolyCity:     _ring(0, 1, 0, 12),
  westernTown:     _ring(0, 1, 0, 10),
  snowScene:       _ring(0, 1, 0, 11),
  cemetery:        _ring(0, 1, 0, 9),
  pirateFort:      _ring(0, 1, 0, 10),
  valleyVillage:   _ring(0, 1, 0, 11),
  calcata:         _ring(0, 1, 0, 14),
  hellArena:       _ring(0, 1, 0, 8),
  dungeonWarkarma: _ring(0, 1, 0, 7),
  castleInterior:  _ring(0, 1, 0, 8),
  nightCity:       _ring(0, 1, 0, 10),
  virtualCity:     _ring(0, 1, 0, 9),
  spaceStation:    _ring(0, 1, 0, 8),
  collisionWorld:  _ring(0, 1, 0, 6),
};

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
    this._atkCooldowns = new Map(); // `${playerId}:${weaponId}` → lastUseAt
    this._kills = new Map(); // playerId → kill count na partida atual
    this._lastInputAt = new Map(); // playerId → ts (anti-flood)
    // Rate limit global (msg/s por player)
    this._msgRate = new Map(); // playerId → { count, windowStart }
    this.MSG_RATE_MAX = 30;    // 30 msgs/s por player
    this.MSG_RATE_WINDOW = 1000;

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
    this.onMessage('pickup_drop', (client, payload) => this._onPickupDrop(client, payload));
    this.onMessage('cast_skill', (client, payload) => this._onCastSkill(client, payload));
    this.onMessage('ping', (client, payload) => {
      // Echo pra cliente calcular RTT
      const p = this.state.players.get(client.userData?.playerId);
      if (p && typeof payload?.ping === 'number') {
        p.ping = Math.max(0, Math.min(2000, payload.ping | 0));
      }
      client.send('pong', { t: payload?.t || 0, server_t: Date.now() });
    });
    this.onMessage('hit_prop', (client, payload) => this._onHitProp(client, payload));
    this.onMessage('spawn_fx', (client, payload) => this._onSpawnFx(client, payload));
    this._skillCooldowns = new Map();

    // ── IDLE TIMEOUT: se sala fica vazia por 60s, descarta. ──
    this.autoDispose = true; // Colyseus já dispara onDispose quando lastClient sai

    // ── IDLE TIMEOUT pra sala SEM matches começados (lobby fica aberto eterno) ──
    this._idleCheckT = setInterval(() => {
      if (this.state.players.size === 0) {
        console.log(`[ArenaRoom] idle vazia, descartando ${this.roomId}`);
        this.disconnect();
      } else if (!this.state.started) {
        // Lobby aberto há mais de 30 min sem iniciar = também encerra
        const ageMs = Date.now() - (this._createdAt || 0);
        if (ageMs > 30 * 60_000) {
          console.log(`[ArenaRoom] lobby velho (>30min), descartando ${this.roomId}`);
          this.disconnect();
        }
      }
    }, 60_000);
    this._createdAt = Date.now();

    console.log(`[ArenaRoom] criada id=${this.roomId} map=${this.state.map_id} max=${this.maxClients}`);
  }

  // ── Spawn points por mapa (server-authoritative) ──
  _pickSpawnPoint() {
    const sp = SPAWN_POINTS[this.state.map_id] || SPAWN_POINTS.default;
    // Round-robin pra não sobrepor
    this._spawnIdx = ((this._spawnIdx || 0) + 1) % sp.length;
    const point = sp[this._spawnIdx];
    // Jitter pra evitar overlap exato em respawn
    return {
      x: point.x + (Math.random() - 0.5) * 1.5,
      y: point.y,
      z: point.z + (Math.random() - 0.5) * 1.5,
    };
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
    const playerId = auth.sub;
    // ── RECONEXÃO: se player já existia, atualiza sessionId e mantém state ──
    if (playerId && this.state.players.has(playerId)) {
      const existing = this.state.players.get(playerId);
      console.log(`[ArenaRoom] 🔄 reconectou ${existing.nickname} (${playerId.slice(0,8)})`);
      client.userData = { playerId };
      // Se estava dead, mantém — cliente decide se respawnar
      // Limpa flag de "saindo" (caso ainda esteja no grace)
      this._pendingLeaves = this._pendingLeaves || new Map();
      const pending = this._pendingLeaves.get(playerId);
      if (pending) {
        clearTimeout(pending);
        this._pendingLeaves.delete(playerId);
      }
      return; // não cria novo PlayerState
    }

    const p = new PlayerState();
    p.id = playerId;
    p.nickname = auth.nickname || 'Player';
    p.avatar_url = auth.avatar_url || '';
    p.is_host = !this.state.host_id;
    p.is_ready = false;
    p.pvp_on = false;
    p.hp = 100;
    p.maxHp = 100;
    // Spawn point real ao invés de 0,0,0
    const sp = this._pickSpawnPoint();
    p.x = sp.x; p.y = sp.y; p.z = sp.z;
    p.ry = 0; p.vy = 0;
    p.anim_state = 'idle';
    p.weapon = 'unarmed';
    p.dead = false;
    p.xp = 0;
    p.level = 1;
    p.kills = 0;
    p.deaths = 0;
    p.coins = 0;

    this.state.players.set(playerId, p);
    if (p.is_host) this.state.host_id = playerId;
    client.userData = { playerId };
    console.log(`[ArenaRoom] +${p.nickname} ${p.is_host ? '[HOST]' : ''} (${this.state.players.size} players)`);
  }

  async onLeave(client, consented) {
    const pid = client.userData?.playerId;
    if (!pid) return;
    const player = this.state.players.get(pid);
    if (!player) return;

    // ── RECONEXÃO: se queda foi acidental, dá 15s pra voltar ──
    if (!consented) {
      console.log(`[ArenaRoom] ⏳ ${player.nickname} desconectou — aguardando 15s pra reconectar`);
      try {
        await this.allowReconnection(client, 15);
        console.log(`[ArenaRoom] ✅ ${player.nickname} reconectou em ${15}s`);
        return; // reconectou, state preservado
      } catch (e) {
        console.log(`[ArenaRoom] ❌ ${player.nickname} não voltou em 15s — finalizando`);
      }
    }

    console.log(`[ArenaRoom] -${player.nickname}`);

    // Persiste stats no Supabase (fire-and-forget)
    persistStats(player).catch(() => {});

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
    if (!attacker || !target) return;

    // ⚠️ SERVIDOR é dono do dano. Cliente envia só weapon+target.
    const weaponId = String(payload.weapon || attacker.weapon || 'unarmed').slice(0, 32);
    const v = validateHit({
      attacker, target, weaponId,
      now: Date.now(),
      cooldowns: this._atkCooldowns,
      pvpRequired: true,
    });
    if (!v.ok) {
      // Log de tentativa rejeitada (anti-cheat trace)
      if (v.reason !== 'cooldown') {
        console.log(`[hit_player rejected] ${attacker.nickname} → ${target.nickname} weapon=${weaponId} reason=${v.reason}`);
      }
      return;
    }

    target.hp = Math.max(0, target.hp - v.dmg);
    // Broadcast pra clientes mostrarem dmg number/sangue
    this.broadcast('hit_confirmed', {
      from: attacker.id, to: target.id,
      weapon: weaponId, dmg: v.dmg,
    });

    if (target.hp <= 0) {
      target.dead = true;
      target.deaths = (target.deaths || 0) + 1;
      target.respawn_at = Date.now() + 3000;
      this._kills.set(attacker.id, (this._kills.get(attacker.id) || 0) + 1);
      attacker.kills = (attacker.kills || 0) + 1;
      attacker.xp = (attacker.xp || 0) + 50;
      this.broadcast('died', { player_id: target.id, killer: attacker.id });
    }
  }

  _onHitMob(client, payload) {
    const pid = client.userData?.playerId;
    const attacker = this.state.players.get(pid);
    const mob = this.state.mobs.get(String(payload.mob_id || ''));
    if (!attacker || !mob) return;

    const weaponId = String(payload.weapon || attacker.weapon || 'unarmed').slice(0, 32);
    const v = validateHit({
      attacker, target: mob, weaponId,
      now: Date.now(),
      cooldowns: this._atkCooldowns,
      pvpRequired: false, // mobs sempre podem ser atacados
    });
    if (!v.ok) {
      if (v.reason !== 'cooldown') {
        console.log(`[hit_mob rejected] ${attacker.nickname} → ${mob.id} weapon=${weaponId} reason=${v.reason}`);
      }
      return;
    }

    mob.hp = Math.max(0, mob.hp - v.dmg);
    this.broadcast('hit_confirmed', {
      from: attacker.id, to: mob.id, mob: true,
      weapon: weaponId, dmg: v.dmg,
    });

    if (mob.hp <= 0) {
      mob.state = 'dead';
      this._kills.set(attacker.id, (this._kills.get(attacker.id) || 0) + 1);
      // ETAPA 4: XP/kills/level server-authoritative
      this._awardKill(attacker, mob);
      this.broadcast('mob_killed', { mob_id: mob.id, by: attacker.id });
      // Drops server-authoritative
      this._spawnDropsFromMob(mob);
      setTimeout(() => {
        if (this.state.mobs.has(mob.id)) this.state.mobs.delete(mob.id);
      }, 2000);
    }
  }

  /** Soma XP/kills no PlayerState e processa level-up. */
  _awardKill(player, mob) {
    const tierXp = { rookie: 20, champion: 45, ultimate: 90, mega: 180, boss: 400, chibata: 25 };
    const gain = tierXp[mob.tier || 'rookie'] || 20;
    player.xp = (player.xp || 0) + gain;
    player.kills = (player.kills || 0) + 1;
    // Level up: cada nível custa 100 * level XP
    while (player.xp >= player.level * 100) {
      player.xp -= player.level * 100;
      player.level = player.level + 1;
      player.maxHp = 100 + (player.level - 1) * 12;
      player.hp = player.maxHp; // cura no level up
      this.broadcast('level_up', { player_id: player.id, level: player.level });
    }
    this.broadcast('xp_gain', { player_id: player.id, gain, total: player.xp, level: player.level });
  }

  /** RNG de loot do servidor. Tier do mob define quantidade e raridade. */
  _spawnDropsFromMob(mob) {
    const tier = mob.tier || 'rookie';
    const tierBonus = { rookie: 1, champion: 1.6, ultimate: 2.4, mega: 3.5, boss: 5, chibata: 1.4 }[tier] || 1;

    // Sempre 1-3 moedas
    const coinCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < coinCount; i++) {
      this._spawnDrop({
        kind: 'coin',
        value: Math.ceil((3 + Math.random() * 6) * tierBonus),
        x: mob.x, z: mob.z, scatter: 1.5,
      });
    }

    // Chance de poção de HP (35% base)
    if (Math.random() < 0.35) {
      this._spawnDrop({
        kind: 'hp_potion',
        value: 30 + Math.floor(Math.random() * 20),
        x: mob.x, z: mob.z, scatter: 1.0,
      });
    }
    // Chance de poção de MP (15%)
    if (Math.random() < 0.15) {
      this._spawnDrop({
        kind: 'mp_potion',
        value: 25 + Math.floor(Math.random() * 15),
        x: mob.x, z: mob.z, scatter: 1.0,
      });
    }
    // Chance de gem raro (8% base, multiplicado pelo tier)
    if (Math.random() < 0.08 * tierBonus) {
      this._spawnDrop({
        kind: 'gem',
        value: Math.ceil(20 * tierBonus),
        x: mob.x, z: mob.z, scatter: 0.8,
      });
    }
  }

  _spawnDrop({ kind, value, x, z, scatter = 1.0 }) {
    if (this.state.drops.size >= 80) return; // cap defensivo
    const id = `drop_${++_dropUid}`;
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * scatter;
    const d = new DropState();
    d.id = id;
    d.kind = kind;
    d.value = value;
    d.x = x + Math.cos(ang) * r;
    d.y = 0.3;
    d.z = z + Math.sin(ang) * r;
    d.expires_at = Date.now() + 120000; // 2 min
    this.state.drops.set(id, d);
  }

  /**
   * Skill cast — server valida cd e broadcasta. Cliente renderiza VFX local.
   * Para skills com dano em AOE/ray, também aplica dano em alvos no raio.
   */
  _onCastSkill(client, payload) {
    const pid = client.userData?.playerId;
    const caster = this.state.players.get(pid);
    if (!caster) return;
    const skillId = String(payload.skill_id || '').slice(0, 32);
    const v = validateSkillCast({
      caster, skillId, now: Date.now(), cooldowns: this._skillCooldowns,
    });
    if (!v.ok) {
      if (v.reason !== 'cooldown') {
        console.log(`[cast_skill rejected] ${caster.nickname} skill=${skillId} reason=${v.reason}`);
      }
      return;
    }
    const s = v.skill;

    // Broadcast pra todos clientes renderizarem VFX
    this.broadcast('skill_cast', {
      caster_id: caster.id,
      skill_id: skillId,
      x: caster.x, y: caster.y, z: caster.z,
      ry: caster.ry,
      // Direção fornecida pelo cliente (alvo do mouse) — apenas pra VFX direcional
      dir_x: typeof payload.dir_x === 'number' ? payload.dir_x : null,
      dir_z: typeof payload.dir_z === 'number' ? payload.dir_z : null,
    });

    // Aplica dano AOE em alvos dentro do raio (mobs + outros players com pvp_on)
    if ((s.dmg || 0) > 0 && (s.radius || 0) > 0) {
      const r2 = (s.radius + 0.5) ** 2;
      // Mobs
      this.state.mobs.forEach((mob) => {
        if (mob.hp <= 0) return;
        const dx = mob.x - caster.x, dz = mob.z - caster.z;
        if (dx * dx + dz * dz > r2) return;
        mob.hp = Math.max(0, mob.hp - s.dmg);
        this.broadcast('hit_confirmed', {
          from: caster.id, to: mob.id, mob: true,
          weapon: 'skill:' + skillId, dmg: s.dmg,
        });
        if (mob.hp <= 0) {
          mob.state = 'dead';
          this._kills.set(caster.id, (this._kills.get(caster.id) || 0) + 1);
          this._awardKill(caster, mob);
          this.broadcast('mob_killed', { mob_id: mob.id, by: caster.id });
          this._spawnDropsFromMob(mob);
          setTimeout(() => { if (this.state.mobs.has(mob.id)) this.state.mobs.delete(mob.id); }, 2000);
        }
      });
      // Players com PvP ON (exclui caster)
      this.state.players.forEach((target, tid) => {
        if (tid === caster.id) return;
        if (target.dead) return;
        if (!caster.pvp_on || !target.pvp_on) return;
        const dx = target.x - caster.x, dz = target.z - caster.z;
        if (dx * dx + dz * dz > r2) return;
        target.hp = Math.max(0, target.hp - s.dmg);
        this.broadcast('hit_confirmed', {
          from: caster.id, to: target.id,
          weapon: 'skill:' + skillId, dmg: s.dmg,
        });
        if (target.hp <= 0) {
          target.dead = true;
          target.deaths = (target.deaths || 0) + 1;
          this.broadcast('died', { player_id: target.id, killer: caster.id });
        }
      });
    }
  }

  /** Hit em prop destruível (barril/caixa/etc). Server valida e gera FX. */
  _onHitProp(client, payload) {
    const pid = client.userData?.playerId;
    const attacker = this.state.players.get(pid);
    if (!attacker || attacker.dead) return;
    const prop = this.state.props.get(String(payload.prop_id || ''));
    if (!prop || prop.broken) return;
    const weaponId = String(payload.weapon || attacker.weapon || 'unarmed').slice(0, 32);
    const w = getWeapon(weaponId);

    // Range check
    const dx = (attacker.x ?? 0) - prop.x;
    const dz = (attacker.z ?? 0) - prop.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > w.range + 1.0) return;

    // Cooldown via mesma tabela
    const key = `${attacker.id}:${weaponId}`;
    const lastAt = this._atkCooldowns.get(key) || 0;
    const now = Date.now();
    if (now - lastAt < w.cdMs) return;
    this._atkCooldowns.set(key, now);

    prop.hp = Math.max(0, prop.hp - w.dmg);
    this.broadcast('prop_hit', {
      prop_id: prop.id, from: attacker.id,
      weapon: weaponId, dmg: w.dmg, hp: prop.hp,
    });

    if (prop.hp <= 0) {
      prop.broken = true;
      this.broadcast('prop_broken', { prop_id: prop.id, by: attacker.id });
      // Spawn FX de quebra (todos veem)
      this._spawnFx({ kind: 'prop_break_' + prop.kind, x: prop.x, y: prop.y, z: prop.z, ttl: 1500 });
      // Chance de drop (40% num barril)
      if (Math.random() < 0.40) {
        this._spawnDrop({
          kind: 'coin',
          value: 5 + Math.floor(Math.random() * 10),
          x: prop.x, z: prop.z, scatter: 0.5,
        });
      }
      // Despawn em 5s
      setTimeout(() => {
        if (this.state.props.has(prop.id)) this.state.props.delete(prop.id);
      }, 5000);
    }
  }

  /**
   * Cliente PEDE FX (ex: spray paint, splash). Server valida e adiciona no
   * state.fx — outros clientes vêem por TTL.
   *
   * Anti-spam: kinds whitelist + rate limit.
   */
  _onSpawnFx(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    const kind = String(payload?.kind || '').slice(0, 32);
    // Whitelist (cosméticos não-trivial)
    const ALLOWED = ['spray', 'footprint_blood', 'explosion', 'splash', 'sparks'];
    if (!ALLOWED.includes(kind)) return;
    // Rate limit por player
    const rate = this._msgRate.get(pid) || { count: 0, windowStart: Date.now() };
    if (Date.now() - rate.windowStart > 1000) { rate.count = 0; rate.windowStart = Date.now(); }
    if (rate.count > 5) return; // max 5 FX/s
    rate.count++;
    this._msgRate.set(pid, rate);
    this._spawnFx({
      kind,
      x: +payload.x || p.x,
      y: +payload.y || 0,
      z: +payload.z || p.z,
      ttl: 6000,
    });
  }

  _spawnFx({ kind, x, y, z, ttl }) {
    if (this.state.fx.size >= 50) {
      // Limpa o mais velho
      const oldest = Array.from(this.state.fx.values())[0];
      if (oldest) this.state.fx.delete(oldest.id);
    }
    const id = `fx_${++_fxUid}`;
    const fx = new FxState();
    fx.id = id;
    fx.kind = kind;
    fx.x = x; fx.y = y; fx.z = z;
    fx.expires_at = Date.now() + (ttl || 4000);
    this.state.fx.set(id, fx);
  }

  /** Spawna props (barris/caixas) ao iniciar match. */
  _spawnInitialProps() {
    const count = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 18;
      const kind = Math.random() < 0.6 ? 'barrel' : 'crate';
      const hp = kind === 'barrel' ? 35 : 60;
      const id = `prop_${++_propUid}`;
      const prop = new PropState();
      prop.id = id;
      prop.kind = kind;
      prop.hp = hp; prop.maxHp = hp;
      prop.x = Math.cos(ang) * r;
      prop.y = 0;
      prop.z = Math.sin(ang) * r;
      prop.broken = false;
      this.state.props.set(id, prop);
    }
  }

  _onPickupDrop(client, payload) {
    const pid = client.userData?.playerId;
    const player = this.state.players.get(pid);
    if (!player || player.dead) return;
    const drop = this.state.drops.get(String(payload.drop_id || ''));
    if (!drop) return;

    // Range check (server decide)
    const dx = (player.x ?? 0) - drop.x;
    const dz = (player.z ?? 0) - drop.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 2.5) {
      console.log(`[pickup rejected] ${player.nickname} too far (${dist.toFixed(1)}u)`);
      return;
    }

    // Aplica efeito server-side
    switch (drop.kind) {
      case 'coin':
        player.coins = (player.coins || 0) + drop.value;
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
      case 'gem':
        player.coins = (player.coins || 0) + drop.value * 3; // gem = 3x coin
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
      case 'hp_potion':
        player.hp = Math.min(player.maxHp, player.hp + drop.value);
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
      case 'mp_potion':
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
    }

    this.state.drops.delete(drop.id);
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
    // Spawn inicial de mobs
    const initial = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < initial; i++) this._spawnMob();
    // Spawn de props destrutíveis (barris/caixas)
    this._spawnInitialProps();
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
    // Só permite respawn se respawn_at já passou
    if (p.dead && p.respawn_at > Date.now()) return;
    p.hp = p.maxHp;
    p.dead = false;
    p.respawn_at = 0;
    const sp = this._pickSpawnPoint();
    p.x = sp.x; p.y = sp.y; p.z = sp.z;
    this.broadcast('respawn', { player_id: p.id });
  }

  _onChat(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p || !payload?.msg) return;
    const msg = String(payload.msg).slice(0, 500);
    this.broadcast('chat', { from: p.id, nick: p.nickname, msg });
  }

  // ── Tick autoritativo (IA mobs + expiração de drops) ──────────
  _tick(dt) {
    if (!this.state.started) return;

    // Expira drops antigos (auto-despawn 2 min)
    if (this.state.drops.size > 0) {
      const now = Date.now();
      const toDel = [];
      this.state.drops.forEach((d, id) => { if (d.expires_at && now > d.expires_at) toDel.push(id); });
      toDel.forEach((id) => this.state.drops.delete(id));
    }
    // Expira FX antigos
    if (this.state.fx.size > 0) {
      const now = Date.now();
      const toDel = [];
      this.state.fx.forEach((f, id) => { if (f.expires_at && now > f.expires_at) toDel.push(id); });
      toDel.forEach((id) => this.state.fx.delete(id));
    }

    if (this.state.mobs.size === 0) return;
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
    if (this._idleCheckT) clearInterval(this._idleCheckT);
    console.log(`[ArenaRoom] descartada ${this.roomId}`);
  }
}
