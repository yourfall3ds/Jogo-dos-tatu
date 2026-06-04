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
import { ArenaState, PlayerState, MobState, DropState, PropState, FxState, InventoryState, InvSlot, BossState, ZoneState, WorldObjectState } from '../schema/ArenaState.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { validateHit, getWeapon } from './WeaponTable.js';
import { validateSkillCast, getSkill } from './SkillTable.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://myylkpoisqijfnptlnyk.supabase.co';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || ''; // HS256 secret (preferencial)
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_REQUIRED = process.env.JWT_REQUIRED !== '0';

/**
 * Persiste stats do player em transfps.profiles ao sair / fim de match.
 * V2: inclui wins/losses/playtime.
 */
async function persistStats(player, { won = false, playtimeSeconds = 0 } = {}) {
  if (!SUPABASE_SERVICE_ROLE) return;
  if (!player.id || player.id.length < 10) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/transfps_apply_match_result_v2', {
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
        p_won: !!won,
        p_playtime_seconds: playtimeSeconds | 0,
      }),
    });
    if (r.status >= 400) {
      console.warn(`[persistStats] HTTP ${r.status} ${await r.text().catch(() => '')}`);
    } else {
      console.log(`[persistStats] ${player.nickname} k=${player.kills} d=${player.deaths} xp=${player.xp} lv=${player.level} 🪙${player.coins} won=${won} t=${playtimeSeconds}s`);
    }
  } catch (e) {
    console.warn('[persistStats] erro:', e.message);
  }
}

/** Carrega profile do Supabase ao entrar na sala (hidrata XP/level/etc). */
async function loadProfile(playerId) {
  if (!SUPABASE_SERVICE_ROLE) return null;
  try {
    const r = await fetch(SUPABASE_URL + `/rest/v1/transfps_profiles?id=eq.${playerId}&select=*`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      },
    });
    if (!r.ok) return null;
    const arr = await r.json();
    return arr?.[0] || null;
  } catch (e) {
    console.warn('[loadProfile] erro:', e.message);
    return null;
  }
}

/** Server-side: incrementa progresso de quest do dia. Fire-and-forget. */
async function pushQuestProgress(playerId, questType, delta) {
  if (!SUPABASE_SERVICE_ROLE || !playerId || playerId.length < 10) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/transfps_quest_progress', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_player_id: playerId, p_quest_type: questType, p_delta: delta | 0 }),
    });
  } catch (_) {}
}

/** Server-side telemetry */
async function pushTelemetry({ playerId, roomId, mapId, duration, kills, deaths, outcome }) {
  if (!SUPABASE_SERVICE_ROLE || !playerId || playerId.length < 10) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/transfps_log_match_telemetry', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_room_id: String(roomId || '').slice(0, 32),
        p_map_id: String(mapId || 'default').slice(0, 32),
        p_duration: duration | 0,
        p_kills: kills | 0,
        p_deaths: deaths | 0,
        p_fps_avg: 0,
        p_outcome: outcome || 'abandoned',
      }),
    });
  } catch (_) {}
}

/** Fórmula: level = floor(sqrt(xp/100)) + 1 */
function computeLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}
function xpForLevel(level) {
  // Inverso: xp = (level-1)^2 * 100
  return Math.max(0, (level - 1) * (level - 1) * 100);
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
    // OPEN_WORLD: sala unica persistente 24/7. Cap maior, sem dispose vazio.
    const isOpenWorld = String(options.mode || '').toUpperCase() === 'OPEN_WORLD';
    this.maxClients = isOpenWorld
      ? Math.max(2, Math.min(64, parseInt(options.maxPlayers) || 50))
      : Math.max(2, Math.min(16, parseInt(options.maxPlayers) || 8));
    this.state = new ArenaState();
    this.state.host_id = '';
    this.state.started = isOpenWorld; // ja "rodando" desde sempre
    this.state.map_id = String(options.map || 'default');
    this.state.started_at = isOpenWorld ? Date.now() : 0;
    this.state.match_state = isOpenWorld ? 'RUNNING' : 'WAITING';
    this.state.match_timer = 0;
    this.state.wave = 0;
    this.state.mobs_killed = 0;
    // Battle Royale / Open World: usam o mesmo loop de skydive/respawn no ceu
    this.state.mode = String(options.mode || 'CLASSIC').toUpperCase();
    // OPEN_WORLD: br_phase fica RUNNING permanente (cada player tem seu skydive local).
    this.state.br_phase = isOpenWorld ? 'RUNNING' : 'LOBBY';
    this.state.br_alive_count = 0;
    this.state.br_takeoff_at = 0;
    this.state.br_skydive_at = 0;
    // Flag interna pra logica de spawn-no-ceu (queda direta no onJoin)
    this._isOpenWorld = isOpenWorld;
    this._lastTick = Date.now();
    this._cooldowns = new Map(); // mobId → { cdT, lastAttack }
    this._atkCooldowns = new Map(); // `${playerId}:${weaponId}` → lastUseAt
    this._kills = new Map(); // playerId → kill count na partida atual
    this._lastInputAt = new Map(); // playerId → ts (anti-flood)
    // Rate limit global (msg/s por player)
    this._msgRate = new Map(); // playerId → { count, windowStart }
    this.MSG_RATE_MAX = 30;    // 30 msgs/s por player
    this.MSG_RATE_WINDOW = 1000;

    // metadata pra LobbyRoom listar com player_count + name + map + mode
    this.setMetadata({
      name: String(options.name || 'Sala'),
      map: this.state.map_id,
      mode: this.state.mode,
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
    this.onMessage('equip', (client, payload) => this._onEquip(client, payload));
    this.onMessage('use_item', (client, payload) => this._onUseItem(client, payload));
    this.onMessage('drop_item', (client, payload) => this._onDropItem(client, payload));
    this.onMessage('claim_quest', (client, payload) => this._onClaimQuest(client, payload));
    this.onMessage('party_invite', (client, payload) => this._onPartyInvite(client, payload));
    this.onMessage('party_accept', (client, payload) => this._onPartyAccept(client, payload));
    this.onMessage('party_leave', (client) => this._onPartyLeave(client));
    // Battle Royale handlers
    this.onMessage('br_skydive_start', (client, payload) => this._onBrSkydiveStart(client, payload));
    this.onMessage('br_skydive_input', (client, payload) => this._onBrSkydiveInput(client, payload));
    this.onMessage('br_landed', (client, payload) => this._onBrLanded(client, payload));
    this.onMessage('br_class_select', (client, payload) => this._onBrClassSelect(client, payload));
    this.onMessage("place_object", (client, payload) => this._onPlaceObject(client, payload));
    this.onMessage("remove_object", (client, payload) => this._onRemoveObject(client, payload));
    this.onMessage("hit_object", (client, payload) => this._onHitObject(client, payload));
    // Som de disparo/golpe (tiro/swing) — rebroadcast posicional p/ todos OUVIREM o parceiro
    // mesmo quando o tiro ERRA (hit_confirmed só dispara no acerto).
    this.onMessage('fire_sound', (client, payload) => this._onFireSound(client, payload));
    this._skillCooldowns = new Map();

    // ── IDLE TIMEOUT: OPEN_WORLD nunca descarta (sala 24/7). Demais salas: dispose vazio. ──
    this.autoDispose = !isOpenWorld;

    if (!isOpenWorld) {
      this._idleCheckT = setInterval(() => {
        if (this.state.players.size === 0) {
          console.log(`[ArenaRoom] idle vazia, descartando ${this.roomId}`);
          this.disconnect();
        } else if (!this.state.started) {
          const ageMs = Date.now() - (this._createdAt || 0);
          if (ageMs > 30 * 60_000) {
            console.log(`[ArenaRoom] lobby velho (>30min), descartando ${this.roomId}`);
            this.disconnect();
          }
        }
      }, 60_000);
    }
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

  // OPEN_WORLD: ring fixo de 8 pontos espacados ao redor do centro
  _pickSpawnPointOpenWorld() {
    this._owSpawnIdx = ((this._owSpawnIdx || 0) + 1) % 8;
    const angle = (this._owSpawnIdx / 8) * Math.PI * 2;
    const radius = 10;
    return {
      x: Math.cos(angle) * radius + (Math.random() - 0.5) * 1.2,
      y: 1.5,
      z: Math.sin(angle) * radius + (Math.random() - 0.5) * 1.2,
    };
  }

  // ── AUTH: valida JWT do Supabase ANTES do join ───────────────
  async onAuth(client, options /*, request */) {
    const token = options?.token;

    // Senha de sala SEMPRE validada (independe de login).
    const checkPassword = () => {
      if (this._password && options?.password !== this._password) {
        throw new Error('senha incorreta');
      }
    };

    // Token OPCIONAL: se vier, validamos (identidade confiável do Supabase).
    // Se NÃO vier e JWT não for obrigatório, aceitamos anônimo (jogar != logar).
    if (token) {
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
        // Token presente mas inválido: se JWT é obrigatório, rejeita; senão, cai p/ anônimo.
        if (JWT_REQUIRED) throw new Error('JWT inválido');
        payload = null;
      }
      if (payload?.sub) {
        checkPassword();
        return {
          sub: payload.sub,
          email: payload.email,
          nickname: options?.nickname || payload.email?.split('@')[0] || 'Player',
          avatar_url: options?.avatar_url || payload.user_metadata?.avatar_url || '',
        };
      }
    }

    // Sem token válido. Se JWT é obrigatório, barra; senão, entra anônimo.
    if (JWT_REQUIRED) throw new Error('JWT obrigatorio');
    checkPassword();
    return {
      sub: options?.player_id || client.sessionId,
      nickname: options?.nickname || 'Player',
      avatar_url: options?.avatar_url || '',
    };
  }

  /** Atalho usado nos hits: dispara progress de quest fire-and-forget. */
  _trackQuestProgress(playerId, questType, delta) {
    if (!playerId) return;
    pushQuestProgress(playerId, questType, delta).catch(() => {});
  }

  // ── FRENTE D: claim quest (server valida via Supabase RPC com JWT) ──
  _onClaimQuest(client, payload) {
    // Cliente chama RPC direto no Supabase (já authenticated com seu JWT).
    // Aqui só repassa broadcast pra HUD atualizar.
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p) return;
    this.broadcast('quest_claimed', { player_id: pid, quest_idx: payload?.quest_idx });
  }

  // ── FRENTE H: Party (até 4 players) ──
  _onPartyInvite(client, payload) {
    const pid = client.userData?.playerId;
    const inviter = this.state.players.get(pid);
    const target = this.state.players.get(String(payload?.target_id || ''));
    if (!inviter || !target || inviter.id === target.id) return;
    // Cria party_id se inviter ainda não tem
    if (!inviter.party_id) inviter.party_id = `party_${pid.slice(0, 8)}_${Date.now()}`;
    // Conta membros atuais da party
    let memberCount = 0;
    this.state.players.forEach((p) => { if (p.party_id === inviter.party_id) memberCount++; });
    if (memberCount >= 4) {
      client.send('error', { code: 'party_full', msg: 'Party cheia (4/4)' });
      return;
    }
    // Manda mensagem privada pro alvo (broadcast filtrado)
    this.broadcast('party_invite', {
      from: inviter.id, from_nick: inviter.nickname,
      to: target.id, party_id: inviter.party_id,
    });
  }

  _onPartyAccept(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p) return;
    const partyId = String(payload?.party_id || '').slice(0, 64);
    if (!partyId) return;
    // Checa cap 4
    let count = 0;
    this.state.players.forEach((pp) => { if (pp.party_id === partyId) count++; });
    if (count >= 4) return;
    p.party_id = partyId;
    this.broadcast('party_joined', { player_id: pid, party_id: partyId });
  }

  _onPartyLeave(client) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || !p.party_id) return;
    const oldParty = p.party_id;
    p.party_id = '';
    this.broadcast('party_left', { player_id: pid, party_id: oldParty });
  }

  async _hydrateFromProfile(player) {
    const prof = await loadProfile(player.id);
    if (!prof) return;
    player.xp = prof.xp || 0;
    player.level = computeLevel(player.xp);
    player.coins = prof.coins || 0;
    // kills/deaths nesta partida começam em 0 (apenas tracking de match)
    // mas damos persistência via persistStats no onLeave
    console.log(`[hydrate] ${player.nickname} lv${player.level} ${player.xp}xp ${player.coins}🪙`);
    this.broadcast('profile_loaded', {
      player_id: player.id,
      xp: player.xp, level: player.level, coins: player.coins,
    });
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
    const sp = this._isOpenWorld ? this._pickSpawnPointOpenWorld() : this._pickSpawnPoint();
    p.x = sp.x; p.y = sp.y; p.z = sp.z;
    p.ry = 0; p.vy = 0;
    p.anim_state = 'idle';
    p.weapon = 'unarmed';
    p.held_item = 'unarmed';
    p.dead = false;
    p.xp = 0;
    p.level = 1;
    p.kills = 0;
    p.inv = new InventoryState();
    p.inv.equip_primary = 'unarmed';
    p.inv.equip_secondary = '';
    p.inv.equip_skin = '';
    // Starter items
    const s1 = new InvSlot(); s1.item = 'hp_small'; s1.qty = 3; p.inv.bag.push(s1);
    const s2 = new InvSlot(); s2.item = 'mp_small'; s2.qty = 2; p.inv.bag.push(s2);
    p.deaths = 0;
    p.coins = 0;

    this.state.players.set(playerId, p);
    if (p.is_host) this.state.host_id = playerId;
    client.userData = { playerId, joinedAt: Date.now() };
    console.log(`[ArenaRoom] +${p.nickname} ${p.is_host ? '[HOST]' : ''} (${this.state.players.size} players)`);
    // Hidrata profile (xp/level/coins persistidos)
    this._hydrateFromProfile(p).catch(() => {});
    // OPEN_WORLD CLEAN: aparece no chao em spawn fixo (sem skydive)
    if (this._isOpenWorld) {
      p.br_state = "ALIVE"; p.altitude = 0; p.anim_state = "idle";
    }
  }

  /**
   * Joga o player no ar (br_state=SKYDIVE) para queda livre individual.
   * Usado tanto no onJoin (entrou no servidor) quanto no respawn pós-morte.
   */
  _dropPlayerFromSky(p) {
    if (!p) return;
    // Posicao XZ ao redor do centro do mapa, com jitter
    const sp = this._pickSpawnPoint();
    const radius = 60 + Math.random() * 40; // 60-100 unidades do centro
    const angle = Math.random() * Math.PI * 2;
    p.x = sp.x + Math.cos(angle) * radius;
    p.z = sp.z + Math.sin(angle) * radius;
    p.y = 200; // altitude inicial do drop
    p.ry = angle + Math.PI; // rosto pro centro
    p.vy = 0;
    p.altitude = 200;
    p.skydive_pitch = 60; // mergulhando
    p.skydive_yaw = p.ry;
    p.br_state = 'SKYDIVE';
    p.dead = false;
    p.respawn_at = 0;
    p.hp = p.maxHp;
    p.anim_state = 'falling';
    // Avisa SO o player do drop (anim de aterissagem) — outros veem via state
    this.broadcast('player_skydive', { player_id: p.id, x: p.x, y: p.y, z: p.z });
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

    // Calcula playtime e outcome
    const joinedAt = client.userData?.joinedAt || Date.now();
    const playtimeSeconds = Math.floor((Date.now() - joinedAt) / 1000);
    const won = this.state.match_state === 'FINISHED' && !player.dead;
    const outcome = this.state.match_state === 'FINISHED'
      ? (player.dead ? 'defeat' : 'victory')
      : 'abandoned';

    // Persiste stats no Supabase + telemetria
    persistStats(player, { won, playtimeSeconds }).catch(() => {});
    pushTelemetry({
      playerId: player.id,
      roomId: this.roomId,
      mapId: this.state.map_id,
      duration: playtimeSeconds,
      kills: player.kills,
      deaths: player.deaths,
      outcome,
    }).catch(() => {});

    // ── CLEANUP DE ESTADO POR-PLAYER (anti-leak sala 24/7) ──
    // Só executa em saída DEFINITIVA: se havia grace de reconexão (!consented),
    // este ponto só é alcançado depois do allowReconnection() expirar/falhar (catch acima).
    // Mobs (_cooldowns é keyed por mobId) NÃO entram aqui.
    this._purgePlayerState(pid);

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

  /**
   * Remove TODO o estado por-player dos Maps internos pra evitar vazamento
   * de memória numa sala 24/7 (OPEN_WORLD). Chamado SÓ em saída definitiva.
   * Maps com chave composta `${pid}:...` são varridos por prefixo; Maps com
   * chave = pid são deletados direto. _cooldowns (keyed por mobId) é ignorado.
   */
  _purgePlayerState(pid) {
    if (!pid) return;
    const prefix = `${pid}:`;
    // Maps de chave composta `${pid}:${algo}` → varre e deleta por prefixo/igualdade
    for (const m of [this._atkCooldowns, this._skillCooldowns]) {
      if (!m) continue;
      for (const key of m.keys()) {
        if (key === pid || (typeof key === 'string' && key.startsWith(prefix))) {
          m.delete(key);
        }
      }
    }
    // Maps de chave = pid → delete direto
    this._kills?.delete(pid);
    this._lastInputAt?.delete(pid);
    this._msgRate?.delete(pid);
    // B10: limpa canais de rate-limit (chave `${pid} ${channel}`)
    if (this._msgRateCh) {
      const chPrefix = `${pid} `;
      for (const key of this._msgRateCh.keys()) {
        if (typeof key === 'string' && key.startsWith(chPrefix)) this._msgRateCh.delete(key);
      }
    }
    this._fireSoundCd?.delete(pid);
    this._spawnRate?.delete(pid);
  }

  // ── Inputs ──────────────────────────────────────────────────
  /**
   * B10: rate-limit por player POR CANAL. MSG_RATE_MAX msgs por MSG_RATE_WINDOW
   * em cada canal (input / hit_player / fire_sound / hit_object …). Janela
   * deslizante simples. Retorna false quando o player estourou o limite naquele
   * canal (handler deve DROPAR a msg, sem derrubar a conexão).
   *
   * Por que POR CANAL e não um contador único: input legítimo roda a ~20Hz e
   * fire_sound a ~18Hz; um teto global de 30/s somando todos os canais barraria
   * o player honesto. Cada canal tem seu próprio orçamento de 30/s — folgado
   * pro tráfego legítimo, mas corta flood (ex.: 1000 hit_player/s de cheater).
   * Mapa separado (_msgRateCh) pra não colidir com o _msgRate usado por _onSpawnFx.
   */
  _checkMsgRate(pid, channel = 'global') {
    if (!pid) return false;
    if (!this._msgRateCh) this._msgRateCh = new Map();
    const key = pid + ' ' + channel;
    const now = Date.now();
    let rate = this._msgRateCh.get(key);
    if (!rate) { rate = { count: 0, windowStart: now }; this._msgRateCh.set(key, rate); }
    if (now - rate.windowStart > this.MSG_RATE_WINDOW) {
      rate.count = 0;
      rate.windowStart = now;
    }
    rate.count++;
    return rate.count <= this.MSG_RATE_MAX;
  }

  _onInput(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    // B10: rate-limit por canal (input vem a ~20Hz legítimo; 30/s dá folga + barra flood)
    if (!this._checkMsgRate(pid, 'input')) return;
    // Trust limitado: cliente envia posição (server-auth real exigiria simular),
    // mas server-side filtra deltas absurdos.
    const nx = +payload.x, ny = +payload.y, nz = +payload.z;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) return;
    // ── Anti-teleport (server-side física-aware) ────────────────────────────
    // SPEED=11, sprint ~19.25u/s, mas DASH_FORCE=52u/s → ~2.6u/tick@20Hz. Com
    // hitch de rede (1 envio carrega ~150-200ms de física) o dash legítimo chega
    // a ~8-10u/tick. 12 cobre dash+hitch SEM travar a mobilidade (6 dashes), MAS
    // ainda barra os 50u/tick antigos (=1000u/s, teleport/speedhack puro).
    const MAX_HORIZ_PER_TICK = 12; // u por mensagem de input (dash 52u/s + hitch)
    const dx = nx - p.x, dz = nz - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > MAX_HORIZ_PER_TICK) return; // REJEITA: mantém p.x/p.z anteriores

    // ── Validação de Y (altura) ─────────────────────────────────────────────
    // Spawn cai de y=200; chão ~0. Teto absoluto e piso absoluto barram
    // out-of-bounds vertical. Queda (vy negativo grande) é LEGÍTIMA → permite
    // descida ampla, mas SUBIDA instantânea grande é impossível (sem fly-hack).
    const Y_FLOOR = -50, Y_CEIL = 300;
    if (ny < Y_FLOOR || ny > Y_CEIL) return; // REJEITA: fora dos limites do mundo
    const dy = ny - p.y;
    // Dash pra cima = JUMP_FORCE*2 (~31u/s) → ~1.55u/tick@20Hz; com hitch de rede
    // (1 envio pode carregar ~150ms de física) o pico chega a ~4.6u. 10 dá margem
    // pra não travar pulo/dash legítimo, mas ainda barra fly-hack (subida contínua).
    const MAX_RISE_PER_TICK = 10;  // subida máx por tick (pulo/dash vertical + hitch)
    const MAX_FALL_PER_TICK = 60;  // queda livre do drop (y=200) é rápida → folgado
    if (dy > MAX_RISE_PER_TICK) return;   // REJEITA: subida impossível (fly-hack)
    if (dy < -MAX_FALL_PER_TICK) return;  // REJEITA: queda instantânea absurda

    p.x = nx; p.y = ny; p.z = nz;
    if (Number.isFinite(+payload.ry)) p.ry = +payload.ry;
    if (Number.isFinite(+payload.vy)) p.vy = +payload.vy;
    if (typeof payload.state === 'string') p.anim_state = payload.state.slice(0, 24);
    if (typeof payload.weapon === 'string') p.weapon = payload.weapon.slice(0, 32);
    if (typeof payload.held_item === 'string') p.held_item = payload.held_item.slice(0, 48);
  }

  /**
   * Som de disparo/golpe do parceiro. Rebroadcast posicional (pos do ATIRADOR) pra
   * todos OUVIREM o tiro/swing — inclusive quando ERRA (hit_confirmed só dispara no acerto).
   * Throttle por player pra não floodar (automática dispara muito rápido).
   */
  _onFireSound(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    // B10: rate-limit por canal (além do throttle de 55ms abaixo) — barra flood
    // de fire_sound. ~18/s legítimo cabe folgado em 30/s.
    if (!this._checkMsgRate(pid, 'fire_sound')) return;
    if (!this._fireSoundCd) this._fireSoundCd = new Map();
    const now = Date.now();
    const last = this._fireSoundCd.get(pid) || 0;
    if (now - last < 55) return; // ~18 sons/s máx por player
    this._fireSoundCd.set(pid, now);
    const melee = payload?.melee === true;
    const weapon = String(payload?.weapon || p.weapon || 'unarmed').slice(0, 32);
    // Direção de mira (do cliente) — só pra DESENHAR o tracer no parceiro; a
    // posição continua server-auth. Clampa em [-1,1] e ignora se não vier.
    const cl = (n) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : null);
    const dx = cl(payload?.dx), dy = cl(payload?.dy), dz = cl(payload?.dz);
    // Posição do ATIRADOR (server-auth) — não confiar em coords do cliente.
    this.broadcast('remote_fire', {
      id: p.id,
      x: p.x, y: p.y, z: p.z,
      weapon,
      melee,
      dx, dy, dz,
    });
  }

  _onHitPlayer(client, payload) {
    const pid = client.userData?.playerId;
    // B10: rate-limit por canal (hits legítimos são gated por cooldown de arma;
    // 30/s corta flood de hit_player de cheater sem afetar combo honesto).
    if (!this._checkMsgRate(pid, 'hit_player')) return;
    const attacker = this.state.players.get(pid);
    const target = this.state.players.get(String(payload.to || ''));
    if (!attacker || !target) return;
    // Guard: alvo já morto não leva mais hit (evita hp negativo / kill-steal).
    if (target.dead) return;

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
      from_x: attacker.x, from_y: attacker.y, from_z: attacker.z,
      weapon: weaponId, dmg: v.dmg,
    });

    // ── A7+B2: KNOCKBACK PvP REPLICADO ───────────────────────────────────
    // Server NÃO simula física: só calcula o VETOR (direção atacante→alvo no
    // plano XZ) + força (pela arma) + stun curto, e broadcasta. O cliente-alvo
    // soma em _vx/_vz (igual wall-kick) e os demais veem via RemotePlayer.playHit.
    // Antes o empurrão era só preditivo-cosmético no atacante → alvo nunca sentia.
    {
      const w = v.weapon || getWeapon(weaponId);
      let kdx = (target.x ?? 0) - (attacker.x ?? 0);
      let kdz = (target.z ?? 0) - (attacker.z ?? 0);
      let klen = Math.sqrt(kdx * kdx + kdz * kdz);
      if (klen < 1e-3) {
        // Atacante praticamente em cima do alvo: empurra na direção do facing dele.
        const ryRad = (Number.isFinite(attacker.ry) ? attacker.ry : 0) * Math.PI / 180;
        kdx = Math.sin(ryRad); kdz = Math.cos(ryRad); klen = 1;
      }
      kdx /= klen; kdz /= klen;
      // Força por tipo de arma (server-auth): melee/punho empurra menos, armas
      // grandes e tiro empurram mais. Crit (dmg alto) reforça.
      const KB_BY_KIND = { melee: 7, sword: 11, whip: 9, gun: 6, ranged: 6 };
      let force = KB_BY_KIND[w?.kind] ?? 7;
      if (v.dmg >= 80) force *= 1.5;        // golpe pesado/crit empurra mais
      else if (v.dmg >= 50) force *= 1.25;
      // Stun curto proporcional ao peso do golpe.
      const stunMs = v.dmg >= 80 ? 250 : (w?.kind === 'sword' ? 200 : 150);
      this.broadcast('player_knockback', {
        to: target.id,
        from: attacker.id,
        dirX: kdx, dirZ: kdz,
        force,
        stunMs,
        crit: v.dmg >= 80,
      });
    }

    if (target.hp <= 0) {
      target.dead = true;
      target.deaths = (target.deaths || 0) + 1;
      target.respawn_at = Date.now() + 5000;
      this._kills.set(attacker.id, (this._kills.get(attacker.id) || 0) + 1);
      attacker.kills = (attacker.kills || 0) + 1;
      this._awardPvpKill(attacker);
      // Quest tracking
      this._trackQuestProgress(attacker.id, 'kill_player', 1);
      this.broadcast('died', { player_id: target.id, killer: attacker.id });
    }
  }

  _onHitMob(client, payload) {
    const pid = client.userData?.playerId;
    const attacker = this.state.players.get(pid);
    // Roteia pro boss se mob_id casa
    if (this.state.boss && String(payload.mob_id) === this.state.boss.id) {
      this._onHitBoss(client, payload);
      return;
    }
    const mob = this.state.mobs.get(String(payload.mob_id || ''));
    if (!attacker || !mob) return;

    const weaponId = String(payload.weapon || attacker.weapon || 'unarmed').slice(0, 32);
    const v = validateHit({
      attacker, target: mob, weaponId,
      now: Date.now(),
      cooldowns: this._atkCooldowns,
      pvpRequired: false, // mobs sempre podem ser atacados
      requireAngle: false, // PvE: não barrar por cone (mantém comportamento antigo; Y-check segue ativo)
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
      from_x: attacker.x, from_y: attacker.y, from_z: attacker.z,
      weapon: weaponId, dmg: v.dmg,
    });

    if (mob.hp <= 0) {
      mob.state = 'dead';
      this._kills.set(attacker.id, (this._kills.get(attacker.id) || 0) + 1);
      this.state.mobs_killed = (this.state.mobs_killed || 0) + 1;
      // ETAPA 4: XP/kills/level server-authoritative
      this._awardKill(attacker, mob);
      // Quest tracking
      this._trackQuestProgress(attacker.id, 'kill_mob', 1);
      this.broadcast('mob_killed', { mob_id: mob.id, by: attacker.id });
      // Drops server-authoritative (quem matou tem prioridade de coleta)
      this._spawnDropsFromMob(mob, attacker.id);
      setTimeout(() => {
        if (this.state.mobs.has(mob.id)) this.state.mobs.delete(mob.id);
      }, 2000);
    }
  }

  /** Soma XP/kills e processa level-up usando fórmula sqrt(xp/100)+1. */
  _awardKill(player, mob) {
    // Spec: kill mob = 10 XP base, escalado por tier
    const tierMult = { rookie: 1, champion: 2.5, ultimate: 6, mega: 12, boss: 30, chibata: 1.4 }[mob.tier || 'rookie'] || 1;
    const gain = Math.round(10 * tierMult);
    const oldLevel = player.level;
    player.xp = (player.xp || 0) + gain;
    player.kills = (player.kills || 0) + 1;
    const newLevel = computeLevel(player.xp);
    if (newLevel > oldLevel) {
      player.level = newLevel;
      player.maxHp = 100 + (newLevel - 1) * 12;
      player.hp = player.maxHp;
      this.broadcast('level_up', { player_id: player.id, level: newLevel, prev: oldLevel });
    }
    this.broadcast('xp_gain', { player_id: player.id, gain, total: player.xp, level: player.level });
  }

  /** XP por kill em outro player (PvP). */
  _awardPvpKill(attacker) {
    const oldLevel = attacker.level;
    const gain = 50;
    attacker.xp = (attacker.xp || 0) + gain;
    const newLevel = computeLevel(attacker.xp);
    if (newLevel > oldLevel) {
      attacker.level = newLevel;
      attacker.maxHp = 100 + (newLevel - 1) * 12;
      attacker.hp = attacker.maxHp;
      this.broadcast('level_up', { player_id: attacker.id, level: newLevel, prev: oldLevel });
    }
    this.broadcast('xp_gain', { player_id: attacker.id, gain, total: attacker.xp, level: attacker.level });
  }

  /** XP por vitória (broadcast no fim de partida). */
  _awardVictory(player) {
    const oldLevel = player.level;
    const gain = 250;
    player.xp = (player.xp || 0) + gain;
    const newLevel = computeLevel(player.xp);
    if (newLevel > oldLevel) {
      player.level = newLevel;
      player.maxHp = 100 + (newLevel - 1) * 12;
      this.broadcast('level_up', { player_id: player.id, level: newLevel, prev: oldLevel });
    }
    this.broadcast('xp_gain', { player_id: player.id, gain, total: player.xp, level: player.level, victory: true });
  }

  /** RNG de loot do servidor. Tier do mob define quantidade e raridade. */
  _spawnDropsFromMob(mob, killerId = '') {
    const tier = mob.tier || 'rookie';
    const tierBonus = { rookie: 1, champion: 1.6, ultimate: 2.4, mega: 3.5, boss: 5, chibata: 1.4 }[tier] || 1;

    // Sempre 1-3 moedas
    const coinCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < coinCount; i++) {
      this._spawnDrop({
        kind: 'coin',
        value: Math.ceil((3 + Math.random() * 6) * tierBonus),
        x: mob.x, z: mob.z, scatter: 1.5, killerId,
      });
    }

    // Chance de poção de HP (35% base)
    if (Math.random() < 0.35) {
      this._spawnDrop({
        kind: 'hp_potion',
        value: 30 + Math.floor(Math.random() * 20),
        x: mob.x, z: mob.z, scatter: 1.0, killerId,
      });
    }
    // Chance de poção de MP (15%)
    if (Math.random() < 0.15) {
      this._spawnDrop({
        kind: 'mp_potion',
        value: 25 + Math.floor(Math.random() * 15),
        x: mob.x, z: mob.z, scatter: 1.0, killerId,
      });
    }
    // Chance de gem raro (8% base, multiplicado pelo tier)
    if (Math.random() < 0.08 * tierBonus) {
      this._spawnDrop({
        kind: 'gem',
        value: Math.ceil(20 * tierBonus),
        x: mob.x, z: mob.z, scatter: 0.8, killerId,
      });
    }
  }

  _spawnDrop({ kind, value, x, z, scatter = 1.0, killerId = '' }) {
    if (this.state.drops.size >= 80) return; // cap defensivo
    const id = `drop_${++_dropUid}`;
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * scatter;
    const now = Date.now();
    const d = new DropState();
    d.id = id;
    d.kind = kind;
    d.value = value;
    d.x = x + Math.cos(ang) * r;
    d.y = 0.3;
    d.z = z + Math.sin(ang) * r;
    d.expires_at = now + 120000; // 2 min
    d.killer_id = killerId || '';
    d.spawn_at = now;
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
          from_x: caster.x, from_y: caster.y, from_z: caster.z,
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
          from_x: caster.x, from_y: caster.y, from_z: caster.z,
          weapon: 'skill:' + skillId, dmg: s.dmg,
        });
        if (target.hp <= 0) {
          target.dead = true;
          target.deaths = (target.deaths || 0) + 1;
          target.respawn_at = Date.now() + 5000;
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

  // ── INVENTORY server-authoritative ──
  // Catálogo válido — qualquer item fora disso é rejeitado.
  static ITEM_CATALOG = {
    // Consumíveis
    hp_small:        { stackable: true,  use: 'heal',  amount: 30 },
    hp_big:          { stackable: true,  use: 'heal',  amount: 60 },
    mp_small:        { stackable: true,  use: 'mana',  amount: 25 },
    mp_big:          { stackable: true,  use: 'mana',  amount: 50 },
    // Armas (equipáveis)
    pistol:           { equipSlot: 'primary' },
    rifle:            { equipSlot: 'primary' },
    sword_paladin:    { equipSlot: 'primary' },
    sword_zweihander: { equipSlot: 'primary' },
    chibata:          { equipSlot: 'primary' },
    unarmed:          { equipSlot: 'primary' },
  };

  _findBagSlot(player, itemId) {
    if (!player.inv?.bag) return -1;
    for (let i = 0; i < player.inv.bag.length; i++) {
      if (player.inv.bag[i].item === itemId) return i;
    }
    return -1;
  }

  _addItemToBag(player, itemId, qty = 1) {
    const def = ArenaRoom.ITEM_CATALOG[itemId];
    if (!def) return false;
    if (def.stackable) {
      const idx = this._findBagSlot(player, itemId);
      if (idx >= 0) {
        player.inv.bag[idx].qty = Math.min(99, player.inv.bag[idx].qty + qty);
        return true;
      }
    }
    if (player.inv.bag.length >= 20) return false;
    const slot = new InvSlot();
    slot.item = itemId;
    slot.qty = qty;
    player.inv.bag.push(slot);
    return true;
  }

  _removeItemFromBag(player, itemId, qty = 1) {
    const idx = this._findBagSlot(player, itemId);
    if (idx < 0) return false;
    const slot = player.inv.bag[idx];
    if (slot.qty < qty) return false;
    slot.qty -= qty;
    if (slot.qty <= 0) player.inv.bag.splice(idx, 1);
    return true;
  }

  _onEquip(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    const itemId = String(payload?.item || '').slice(0, 32);
    const def = ArenaRoom.ITEM_CATALOG[itemId];
    if (!def || !def.equipSlot) return;
    // Tem que ter no bag OU já estar equipado OU ser arma starter (pistol/rifle/swords/chibata/unarmed disponíveis)
    const starterWeapons = ['pistol','rifle','sword_paladin','sword_zweihander','chibata','unarmed'];
    const owned = starterWeapons.includes(itemId) ||
                  this._findBagSlot(p, itemId) >= 0 ||
                  p.inv.equip_primary === itemId ||
                  p.inv.equip_secondary === itemId;
    if (!owned) {
      console.log(`[equip rejected] ${p.nickname} → ${itemId} (not owned)`);
      return;
    }
    if (def.equipSlot === 'primary') {
      p.inv.equip_primary = itemId;
      p.weapon = itemId; // sincroniza com PlayerState.weapon
    } else if (def.equipSlot === 'secondary') {
      p.inv.equip_secondary = itemId;
    } else if (def.equipSlot === 'skin') {
      p.inv.equip_skin = itemId;
    }
  }

  _onUseItem(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    const itemId = String(payload?.item || '').slice(0, 32);
    const def = ArenaRoom.ITEM_CATALOG[itemId];
    if (!def || !def.use) return;
    // Rate limit (anti-spam)
    const now = Date.now();
    const lastKey = `use:${pid}:${itemId}`;
    const lastAt = this._atkCooldowns.get(lastKey) || 0;
    if (now - lastAt < 500) return;
    this._atkCooldowns.set(lastKey, now);
    // Precisa ter no bag
    if (!this._removeItemFromBag(p, itemId, 1)) return;
    // Aplica efeito
    if (def.use === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + def.amount);
    } else if (def.use === 'mana') {
      // mp não está no schema ainda — broadcast pra cliente aplicar
      this.broadcast('mp_gain', { player_id: pid, amount: def.amount });
    }
    this.broadcast('item_used', { player_id: pid, item: itemId, amount: def.amount });
  }

  _onDropItem(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    const itemId = String(payload?.item || '').slice(0, 32);
    const def = ArenaRoom.ITEM_CATALOG[itemId];
    if (!def) return;
    if (!this._removeItemFromBag(p, itemId, 1)) return;
    // Cria drop visível pra todos pegarem
    this._spawnDrop({
      kind: itemId.startsWith('hp_') ? 'hp_potion' :
            itemId.startsWith('mp_') ? 'mp_potion' :
            'gem',
      value: def.amount || 1,
      x: p.x, z: p.z, scatter: 0.5,
    });
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

    // ── PRIORIDADE DO MATADOR ──────────────────────────────────────────
    //  Quem matou pode pegar primeiro nos PRIMEIROS 4s. Depois disso, ou se
    //  ninguém é dono, qualquer um pega. Drop é único (delete atômico abaixo).
    const PRIORITY_MS = 4000;
    if (drop.killer_id && drop.killer_id !== pid) {
      const within = Date.now() < (drop.spawn_at || 0) + PRIORITY_MS;
      if (within) {
        client.send('pickup_denied', { drop_id: drop.id, reason: 'killer_priority' });
        return;
      }
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
        // Adiciona ao bag em vez de aplicar imediato — player decide quando usar
        this._addItemToBag(player, drop.value >= 50 ? 'hp_big' : 'hp_small', 1);
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
      case 'mp_potion':
        this._addItemToBag(player, drop.value >= 40 ? 'mp_big' : 'mp_small', 1);
        this.broadcast('pickup', { player_id: pid, drop_id: drop.id, kind: drop.kind, value: drop.value });
        break;
    }

    this.state.drops.delete(drop.id);
    this._trackQuestProgress(pid, 'collect_drop', 1);
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
    if (this.state.players.size < 1) return;
    // Inicia countdown de 10s
    this.state.match_state = 'COUNTDOWN';
    this.state.match_timer = Date.now() + 10_000;
    this.broadcast('match_countdown', { ends_at: this.state.match_timer });
    console.log(`[ArenaRoom] countdown iniciado em ${this.roomId} (10s)`);
  }

  /** Transição WAITING→COUNTDOWN→RUNNING→BOSS_WAVE→FINISHED no tick. */
  _matchDirectorTick() {
    const now = Date.now();
    const ms = this.state.match_state;
    if (ms === 'COUNTDOWN') {
      if (now >= this.state.match_timer) {
        // BATTLE ROYALE branch: countdown termina → decolagem
        if (this.state.mode === 'BATTLE_ROYALE') {
          this._startBattleRoyale();
          this.broadcast('match_started', {});
          return;
        }
        this.state.match_state = 'RUNNING';
        this.state.started = true;
        this.state.started_at = now;
        this.state.wave = 1;
        this.state.mobs_killed = 0;
        this.broadcast('match_started', {});
        // Spawn inicial wave 1
        const initial = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < initial; i++) this._spawnMob();
        this._spawnInitialProps();
        console.log(`[ArenaRoom] RUNNING — wave 1 em ${this.roomId}`);
      }
    } else if (ms === 'RUNNING') {
      // Trigger boss após 20 kills OU 3 minutos
      const dur = now - (this.state.started_at || now);
      if (this.state.mobs_killed >= 20 || dur > 180_000) {
        this._enterBossWave();
      } else if (this.state.mobs.size < 3) {
        // Repõe mobs (mantém alvo de inimigos vivos)
        const wave = this.state.wave;
        const reposi = Math.min(5, 3 + wave);
        for (let i = 0; i < reposi; i++) this._spawnMob();
        if (this.state.mobs_killed > 0 && this.state.mobs_killed % 8 === 0) {
          this.state.wave = wave + 1;
          this.broadcast('wave_up', { wave: this.state.wave });
        }
      }
    } else if (ms === 'BOSS_WAVE') {
      // Boss morto? → FINISHED
      if (this.state.boss && this.state.boss.hp <= 0) {
        this._finishMatch(true);
      }
    } else if (ms === 'FINISHED') {
      // Auto-volta pra WAITING após 30s
      if (now >= this.state.match_timer) {
        this._resetToLobby();
      }
    }
  }

  /** IA simples do boss: persegue player mais próximo, ataque em range. */
  _tickBoss(dt) {
    const boss = this.state.boss;
    if (!boss || boss.hp <= 0) return;
    let best = null, bestDist = Infinity;
    this.state.players.forEach((p) => {
      if (p.dead) return;
      const dx = p.x - boss.x, dz = p.z - boss.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    if (!best) { boss.state = 'idle'; return; }
    boss.target_id = best.id;
    const BOSS_SPEED = 4.5;
    const BOSS_RANGE = 4.0;
    const BOSS_DMG = 35;
    const BOSS_CD_MS = 1800;
    const dx = best.x - boss.x, dz = best.z - boss.z;
    if (bestDist > BOSS_RANGE) {
      const nx = dx / bestDist, nz = dz / bestDist;
      const spd = boss.enraged ? BOSS_SPEED * 1.5 : BOSS_SPEED;
      boss.x += nx * spd * dt;
      boss.z += nz * spd * dt;
      boss.ry = Math.atan2(nx, nz) * 180 / Math.PI;
      boss.state = 'run';
    } else {
      boss.state = 'attack';
      const now = Date.now();
      const cdKey = `boss:${boss.id}`;
      const lastAt = this._atkCooldowns.get(cdKey) || 0;
      if (now - lastAt >= BOSS_CD_MS) {
        this._atkCooldowns.set(cdKey, now);
        const dmg = boss.enraged ? BOSS_DMG * 1.5 : BOSS_DMG;
        best.hp = Math.max(0, best.hp - dmg);
        this.broadcast('boss_attack', { boss_id: boss.id, target_id: best.id, dmg });
        if (best.hp <= 0) {
          best.dead = true;
          best.deaths = (best.deaths || 0) + 1;
          best.respawn_at = Date.now() + 5000;
          this.broadcast('died', { player_id: best.id, killer: boss.id });
        }
      }
    }
    // Phase change: aos 50% vira enraged
    if (!boss.enraged && boss.hp <= boss.maxHp * 0.5) {
      boss.enraged = true;
      boss.phase = 2;
      this.broadcast('boss_phase', { phase: 2, enraged: true });
    }
  }

  /** Recebe hit no boss (cliente envia hit_mob com mob_id = boss.id). */
  _onHitBoss(client, payload) {
    const pid = client.userData?.playerId;
    const attacker = this.state.players.get(pid);
    const boss = this.state.boss;
    if (!attacker || !boss || boss.hp <= 0) return;
    if (String(payload.mob_id) !== boss.id) return false;
    const weaponId = String(payload.weapon || attacker.weapon || 'unarmed').slice(0, 32);
    const v = validateHit({
      attacker, target: boss, weaponId,
      now: Date.now(), cooldowns: this._atkCooldowns,
      pvpRequired: false,
      requireAngle: false, // PvE: boss é alvo gigante; cone não se aplica (Y-check segue ativo)
    });
    if (!v.ok) return true; // tratado mas rejeitado
    boss.hp = Math.max(0, boss.hp - v.dmg);
    this.broadcast('hit_confirmed', {
      from: attacker.id, to: boss.id, mob: true,
      weapon: weaponId, dmg: v.dmg,
    });
    if (boss.hp <= 0) {
      boss.state = 'dead';
      this.broadcast('boss_killed', { boss_id: boss.id, by: attacker.id });
      // XP enorme + coins
      const oldL = attacker.level;
      attacker.xp = (attacker.xp || 0) + 500;
      attacker.coins = (attacker.coins || 0) + 200;
      attacker.kills = (attacker.kills || 0) + 1;
      const nL = computeLevel(attacker.xp);
      if (nL > oldL) {
        attacker.level = nL; attacker.maxHp = 100 + (nL - 1) * 12; attacker.hp = attacker.maxHp;
        this.broadcast('level_up', { player_id: attacker.id, level: nL, prev: oldL });
      }
      this.broadcast('xp_gain', { player_id: attacker.id, gain: 500, total: attacker.xp, level: attacker.level });
    }
    return true;
  }

  _enterBossWave() {
    this.state.match_state = 'BOSS_WAVE';
    // Limpa mobs comuns
    this.state.mobs.forEach((_, id) => this.state.mobs.delete(id));
    // Spawn boss
    const BOSSES = [
      { kind: 'cb_stormKingBoss',    name: 'Storm King',    hp: 1500 },
      { kind: 'cb_mushroomBoss',     name: 'Mushroom Lord', hp: 1300 },
      { kind: 'cb_theLich',          name: 'The Lich',      hp: 1800 },
      { kind: 'cb_dragonBig',        name: 'Great Dragon',  hp: 2200 },
      { kind: 'cb_drogonDragon',     name: 'Drogon',        hp: 2000 },
    ];
    const def = BOSSES[Math.floor(Math.random() * BOSSES.length)];
    const b = new BossState();
    b.id = `boss_${Date.now()}`;
    b.name = def.name;
    b.kind = def.kind;
    b.hp = def.hp;
    b.maxHp = def.hp;
    // Spawn no centro do mapa
    b.x = 0; b.y = 0; b.z = 0;
    b.ry = 0;
    b.phase = 1;
    b.state = 'idle';
    b.target_id = '';
    b.enraged = false;
    this.state.boss = b;
    this.broadcast('boss_appeared', { name: b.name, kind: b.kind, hp: b.hp });
    console.log(`[ArenaRoom] 🐉 BOSS WAVE — ${b.name} (${b.hp} hp)`);
  }

  _finishMatch(victory) {
    this.state.match_state = 'FINISHED';
    this.state.match_timer = Date.now() + 30_000;
    // XP vitória pra todos vivos
    const winners = [];
    this.state.players.forEach((p) => {
      if (!p.dead) {
        this._awardVictory(p);
        winners.push(p.id);
      }
    });
    this.broadcast('match_finished', {
      victory,
      winners,
      boss_name: this.state.boss?.name || null,
    });
    console.log(`[ArenaRoom] FINISHED victory=${victory} winners=${winners.length}`);
  }

  // ───────────────────────────── BATTLE ROYALE ─────────────────────────────

  _onBrClassSelect(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p) return;
    const cid = parseInt(payload?.class_id);
    if (!Number.isFinite(cid) || cid < 0 || cid > 99) return;
    p.class_id = cid;
  }

  _onBrSkydiveStart(client, payload) {
    if (this.state.mode !== 'BATTLE_ROYALE') return;
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p) return;
    if (this.state.br_phase !== 'SKYDIVE') return;
    p.br_state = 'SKYDIVE';
    p.altitude = parseFloat(payload?.y) || 200;
  }

  _onBrSkydiveInput(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.br_state !== 'SKYDIVE') return;
    // Server confia no cliente pro pitch/yaw (visual), mas valida bounds
    p.skydive_pitch = Math.max(0, Math.min(75, parseFloat(payload?.pitch) || 0));
    p.skydive_yaw = parseFloat(payload?.yaw) || 0;
    p.altitude = Math.max(0, parseFloat(payload?.altitude) || 0);
    // Posição: aceita do cliente nesse modo (vai validar no landed)
    if (Number.isFinite(payload?.x)) p.x = payload.x;
    if (Number.isFinite(payload?.y)) p.y = payload.y;
    if (Number.isFinite(payload?.z)) p.z = payload.z;
  }

  _onBrLanded(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p) return;
    if (p.br_state !== 'SKYDIVE' && p.br_state !== 'LANDING') return;
    p.br_state = 'ALIVE';
    p.skydive_pitch = 0;
    p.altitude = 0;
    if (Number.isFinite(payload?.x)) p.x = payload.x;
    if (Number.isFinite(payload?.y)) p.y = payload.y;
    if (Number.isFinite(payload?.z)) p.z = payload.z;
    this.broadcast('br_landed', { player_id: p.id, x: p.x, y: p.y, z: p.z });
  }

  _startBattleRoyale() {
    if (this.state.mode !== 'BATTLE_ROYALE') return;
    // Guarda: nunca rodar 2x. _matchDirectorTick chamava isto a cada frame
    // enquanto match_state continuava COUNTDOWN, broadcastando br_takeoff
    // em loop infinito (10Hz). Agora marcamos started=true + match_state.
    if (this.state.started) {
      console.warn('[BR] _startBattleRoyale chamado 2x - ignorado');
      return;
    }
    console.log('[BR] Starting battle royale match');
    this.state.started = true;
    this.state.started_at = Date.now();
    this.state.match_state = 'RUNNING'; // sai de COUNTDOWN
    this.state.br_phase = 'TAKEOFF';
    this.state.br_takeoff_at = Date.now() + 3_000;
    this.state.br_skydive_at = Date.now() + 6_000;
    this._initBrZone();
    this.state.players.forEach((p) => {
      p.br_state = 'TAKEOFF';
      p.dead = false;
      p.hp = p.maxHp;
      p.kills = 0;
      p.deaths = 0;
      p.place = 0;
    });
    this.state.br_alive_count = this.state.players.size;
    this.broadcast('br_takeoff', { skydive_at: this.state.br_skydive_at });
  }

  _initBrZone() {
    const Z = new ZoneState();
    Z.cx = 0;
    Z.cz = 0;
    Z.radius_current = 500;
    Z.radius_target = 500;
    Z.shrink_starts_at = Date.now() + 90_000;  // 1m30 pra começar a fechar
    Z.shrink_ends_at = Date.now() + 90_000 + 60_000; // shrink em 60s
    Z.damage_per_sec = 0;
    Z.wave = 0;
    Z.phase = 'IDLE';
    this.state.zone = Z;
  }

  _brZoneTick(dt) {
    if (this.state.mode !== 'BATTLE_ROYALE') return;
    const z = this.state.zone;
    if (!z) return;
    const now = Date.now();

    // Avança fase da zona
    if (z.phase === 'IDLE' && now >= z.shrink_starts_at - 10_000) {
      z.phase = 'WARNING';
      this.broadcast('br_zone_warning', { wave: z.wave + 1, starts_at: z.shrink_starts_at });
    }
    if (z.phase === 'WARNING' && now >= z.shrink_starts_at) {
      z.phase = 'SHRINKING';
      z.wave++;
      // Nova target radius
      const targets = [500, 200, 80, 25, 10];
      const dmgs = [0, 1, 3, 7, 15];
      const idx = Math.min(targets.length - 1, z.wave);
      z.radius_target = targets[idx];
      z.damage_per_sec = dmgs[idx];
      this.broadcast('br_zone_shrinking', { wave: z.wave, radius_target: z.radius_target });
    }
    if (z.phase === 'SHRINKING') {
      const totalShrink = z.shrink_ends_at - z.shrink_starts_at;
      const elapsed = now - z.shrink_starts_at;
      const k = Math.max(0, Math.min(1, elapsed / totalShrink));
      const startR = z.radius_current === z.radius_target ? z.radius_current : (z.wave === 1 ? 500 : z.radius_current);
      // Use store de radius inicial
      if (!z._startR) z._startR = z.radius_current;
      z.radius_current = z._startR + (z.radius_target - z._startR) * k;
      if (k >= 1) {
        z.phase = 'IDLE';
        z._startR = z.radius_current;
        // Próxima wave em 30-60s
        z.shrink_starts_at = now + (40_000 - z.wave * 5_000);
        z.shrink_ends_at = z.shrink_starts_at + Math.max(20_000, 60_000 - z.wave * 10_000);
        this.broadcast('br_zone_idle', { wave: z.wave, next_at: z.shrink_starts_at });
      }
    }

    // Aplica dano em quem tá fora da zona
    if (z.damage_per_sec > 0) {
      this.state.players.forEach((p) => {
        if (p.dead || p.br_state !== 'ALIVE') return;
        const dx = p.x - z.cx;
        const dz = p.z - z.cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > z.radius_current) {
          const dmg = z.damage_per_sec * dt;
          p.hp = Math.max(0, p.hp - dmg);
          if (p.hp <= 0) {
            this._brOnPlayerDeath(p, null, 'STORM');
          }
        }
      });
    }
  }

  _brOnPlayerDeath(player, killer, cause) {
    if (player.br_state === 'DEAD' || player.br_state === 'SPECTATING') return;
    player.dead = true;
    player.deaths++;
    // Define o "place" (ranking reverso)
    const alive = this._brCountAlive();
    player.place = alive + 1; // se 5 vivos e ele morreu, ele é o 6º colocado
    player.br_state = 'SPECTATING';
    this.broadcast('br_player_died', {
      player_id: player.id,
      killer: killer?.id || null,
      cause: cause || 'COMBAT',
      place: player.place,
    });
    if (killer) {
      killer.kills++;
      this._awardPvpKill?.(killer);
    }
    // Verifica se tem vencedor
    this._brCheckWinCondition();
  }

  _brCountAlive() {
    let n = 0;
    this.state.players.forEach((p) => {
      if (!p.dead && (p.br_state === 'ALIVE' || p.br_state === 'SKYDIVE' || p.br_state === 'TAKEOFF' || p.br_state === 'LANDING')) n++;
    });
    this.state.br_alive_count = n;
    return n;
  }

  _brCheckWinCondition() {
    const alive = this._brCountAlive();
    if (alive <= 1) {
      // Encontra o vencedor
      let winner = null;
      this.state.players.forEach((p) => {
        if (!p.dead) { winner = p; }
      });
      if (winner) {
        winner.place = 1;
        this._awardVictory?.(winner);
      }
      this.state.br_phase = 'FINISHED';
      this.state.match_state = 'FINISHED';
      this.state.match_timer = Date.now() + 30_000;
      this.broadcast('br_finished', {
        winner_id: winner?.id || null,
        winner_nick: winner?.nickname || null,
      });
      console.log(`[BR] FINISHED winner=${winner?.nickname || 'none'}`);
    }
  }

  _brTick(dt) {
    if (this.state.mode !== 'BATTLE_ROYALE') return;
    const now = Date.now();

    // Transição TAKEOFF → SKYDIVE
    if (this.state.br_phase === 'TAKEOFF' && now >= this.state.br_skydive_at) {
      this.state.br_phase = 'SKYDIVE';
      this.state.players.forEach((p) => {
        p.br_state = 'SKYDIVE';
        p.altitude = 200;
      });
      this.broadcast('br_skydive_phase', {});
    }

    // Transição SKYDIVE → RUNNING (quando todos pousaram OU 30s passou)
    if (this.state.br_phase === 'SKYDIVE') {
      let allLanded = true;
      this.state.players.forEach((p) => {
        if (p.br_state === 'SKYDIVE') allLanded = false;
      });
      if (allLanded || (now - this.state.br_skydive_at) > 60_000) {
        this.state.br_phase = 'RUNNING';
        this.state.match_state = 'RUNNING';
        this.state.started = true;
        this.state.started_at = now;
        this.broadcast('br_running', {});
      }
    }

    // Tick da zona (só durante RUNNING)
    if (this.state.br_phase === 'RUNNING') {
      this._brZoneTick(dt);
    }
  }

  _resetToLobby() {
    this.state.match_state = 'WAITING';
    this.state.started = false;
    this.state.started_at = 0;
    this.state.wave = 0;
    this.state.mobs_killed = 0;
    this.state.match_timer = 0;
    // BR reset
    if (this.state.mode === 'BATTLE_ROYALE') {
      this.state.br_phase = 'LOBBY';
      this.state.br_alive_count = 0;
      this.state.br_takeoff_at = 0;
      this.state.br_skydive_at = 0;
      this.state.zone = undefined;
      this.state.players.forEach((p) => {
        p.br_state = 'LOBBY';
        p.altitude = 0;
        p.skydive_pitch = 0;
        p.skydive_yaw = 0;
        p.place = 0;
      });
    }
    // Limpa mundo
    this.state.mobs.forEach((_, id) => this.state.mobs.delete(id));
    this.state.drops.forEach((_, id) => this.state.drops.delete(id));
    this.state.props.forEach((_, id) => this.state.props.delete(id));
    this.state.fx.forEach((_, id) => this.state.fx.delete(id));
    this.state.boss = undefined;
    // Reset ready/hp dos players
    this.state.players.forEach((p) => {
      p.is_ready = false;
      p.hp = p.maxHp;
      p.dead = false;
      p.respawn_at = 0;
      p.kills = 0;
      p.deaths = 0;
    });
    this.broadcast('lobby_reset', {});
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

  _onPlaceObject(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p || p.dead) return;
    const asset = String(payload?.asset_id || "").slice(0, 64);
    if (!asset) return;
    const x = parseFloat(payload?.x);
    const y = parseFloat(payload?.y);
    const z = parseFloat(payload?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const ry = Number.isFinite(parseFloat(payload?.ry)) ? parseFloat(payload.ry) : 0;
    const tier = parseInt(payload?.tier) || 0;
    const w = new WorldObjectState();
    this._woUid = (this._woUid || 0) + 1;
    w.id = "wo_" + this.roomId + "_" + this._woUid;
    w.owner_id = p.id;
    w.asset_id = asset;
    w.x = x; w.y = y; w.z = z; w.ry = ry;
    w.hp = 100 + tier * 100;
    w.max_hp = w.hp;
    w.tier = tier;
    w.created_at = Date.now();
    this.state.world_objects.set(w.id, w);
    this.broadcast("world_object_placed", { id: w.id, owner_id: w.owner_id, asset_id: w.asset_id, x, y, z, ry, tier });
  }

  _onRemoveObject(client, payload) {
    const p = this.state.players.get(client.userData?.playerId);
    if (!p) return;
    const id = String(payload?.id || "");
    const w = this.state.world_objects.get(id);
    if (!w) return;
    if (w.owner_id !== p.id) return;
    this.state.world_objects.delete(id);
  }

  _onHitObject(client, payload) {
    const pid = client.userData?.playerId;
    const p = this.state.players.get(pid);
    if (!p || p.dead) return;
    // B10: rate-limit por canal (dropa msgs acima do limite)
    if (!this._checkMsgRate(pid, 'hit_object')) return;
    const id = String(payload?.id || "");
    const w = this.state.world_objects.get(id);
    if (!w) return;
    // A12: dano SERVER-AUTH derivado da arma equipada (cliente NÃO manda dmg).
    const weaponId = String(payload?.weapon || p.weapon || 'unarmed').slice(0, 32);
    const weapon = getWeapon(weaponId);
    // Range check (XZ) — igual _onHitProp.
    const odx = (p.x ?? 0) - w.x;
    const odz = (p.z ?? 0) - w.z;
    const odist = Math.sqrt(odx * odx + odz * odz);
    if (odist > weapon.range + 1.0) return;
    // Cooldown por (player, arma) — mesma tabela do PvP/prop.
    const cdKey = `${p.id}:${weaponId}`;
    const lastAt = this._atkCooldowns.get(cdKey) || 0;
    const now = Date.now();
    if (now - lastAt < weapon.cdMs) return;
    this._atkCooldowns.set(cdKey, now);
    const dmg = weapon.dmg;
    w.hp = Math.max(0, w.hp - dmg);
    this.broadcast("world_object_hit", { id, hp: w.hp, max_hp: w.max_hp });
    if (w.hp === 0) {
      this.state.world_objects.delete(id);
      this.broadcast("world_object_destroyed", { id, asset_id: w.asset_id, owner_id: w.owner_id });
    }
  }

  // ── Tick autoritativo (MatchDirector + IA mobs + IA boss + expiração drops/fx) ──
  _tick(dt) {
    // OPEN_WORLD CLEAN: zero mob/boss/horda. Apenas players + respawn no chao.
    if (this._isOpenWorld) {
      const now = Date.now();
      this.state.players.forEach((p) => {
        if (p.dead && p.respawn_at > 0 && now >= p.respawn_at) {
          const sp = this._pickSpawnPointOpenWorld();
          p.x = sp.x; p.y = sp.y; p.z = sp.z;
          p.hp = p.maxHp; p.dead = false; p.respawn_at = 0;
          p.br_state = "ALIVE"; p.altitude = 0; p.anim_state = "idle";
        }
      });
      if (this.state.mobs.size > 0) this.state.mobs.forEach((_, id) => this.state.mobs.delete(id));
      if (this.state.drops.size > 0) this.state.drops.forEach((_, id) => this.state.drops.delete(id));
      if (this.state.props.size > 0) this.state.props.forEach((_, id) => this.state.props.delete(id));
      if (this.state.fx.size > 0) this.state.fx.forEach((_, id) => this.state.fx.delete(id));
      if (this.state.boss) this.state.boss = undefined;
      return; // SKIP director + brTick + boss
    }
    this._matchDirectorTick();
    this._brTick(dt);

    // IA do boss (quando existe)
    if (this.state.boss && this.state.boss.hp > 0) {
      this._tickBoss(dt);
    }

    if (!this.state.started && this.state.match_state !== 'BOSS_WAVE') return;

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
            best.deaths = (best.deaths || 0) + 1;
            best.respawn_at = Date.now() + 5000;
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
