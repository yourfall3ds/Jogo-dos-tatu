// ─────────────────────────────────────────────────────────────────
//  ColyseusClient — cliente do servidor Colyseus self-hosted
//
//  Substitui o relay caseiro. Usa @colyseus/colyseus.js via CDN ESM.
//
//  Fluxo:
//    1. createClient(wsUrl)
//    2. joinOrCreate('arena', { token, nickname, avatar_url, ... })
//    3. room.state.players.onAdd / onRemove / onChange
//    4. room.send('input', ...) / room.send('hit_mob', ...)
//
//  Estado autoritativo vem do servidor — cliente é puro consumer.
// ─────────────────────────────────────────────────────────────────

import * as Colyseus from 'https://esm.sh/colyseus.js@0.16.6';
import { MpGuard } from './MpGuard.js';

const { Client, getStateCallbacks } = Colyseus;

export class ColyseusClient {
  constructor() {
    this.client = null;
    this.room = null;
    this.sessionId = null;
    this.playerId = null;
    this.nickname = null;
    this.avatarUrl = null;
    this._listeners = {
      open: new Set(), close: new Set(),
      'player_add': new Set(), 'player_remove': new Set(), 'player_change': new Set(),
      'mob_add': new Set(), 'mob_remove': new Set(), 'mob_change': new Set(),
      'drop_add': new Set(), 'drop_remove': new Set(),
      'match_started': new Set(), 'died': new Set(), 'respawn': new Set(),
      'mob_attack': new Set(), 'mob_killed': new Set(), 'chat': new Set(),
      'state_change': new Set(), 'error': new Set(),
      'hit_confirmed': new Set(), 'pickup': new Set(), 'pickup_denied': new Set(),
      'remote_sfx': new Set(),
      'skill_cast': new Set(), 'xp_gain': new Set(), 'level_up': new Set(),
      'prop_add': new Set(), 'prop_remove': new Set(), 'prop_change': new Set(),
      'prop_hit': new Set(), 'prop_broken': new Set(),
      'world_object_add': new Set(),
      'world_object_remove': new Set(),
      'world_object_change': new Set(),
      'world_object_placed': new Set(),
      'world_object_hit': new Set(),
      'world_object_destroyed': new Set(),
      'fx_add': new Set(), 'fx_remove': new Set(),
      'pong': new Set(),
      // Frente B/C
      'match_countdown': new Set(), 'match_finished': new Set(), 'lobby_reset': new Set(),
      'wave_up': new Set(),
      'boss_appeared': new Set(), 'boss_killed': new Set(), 'boss_phase': new Set(),
      'boss_attack': new Set(),
      // Frente A
      'profile_loaded': new Set(),
      // Frente D
      'quest_claimed': new Set(),
      // Frente H
      'party_invite': new Set(), 'party_joined': new Set(), 'party_left': new Set(),
      // Battle Royale
      'br_takeoff': new Set(), 'br_skydive_phase': new Set(), 'br_landed': new Set(),
      'br_running': new Set(), 'br_finished': new Set(),
      'br_zone_warning': new Set(), 'br_zone_shrinking': new Set(), 'br_zone_idle': new Set(),
      'br_player_died': new Set(),
      'player_skydive': new Set(),
      'remote_fire': new Set(),
      // A7+B2: knockback PvP replicado pelo server
      'player_knockback': new Set(),
    };
    this.ping = 0;
    this._lastInputSent = 0;
    this.INPUT_RATE_MS = 50; // 20Hz
  }

  /** Conecta ao gameServer (URL base sem path). */
  connect(wsUrl) {
    this._wsUrl = wsUrl;
    this.client = new Client(wsUrl);
  }

  /**
   * Retry com backoff exponencial p/ operações de join. O Colyseus pode demorar
   * pra aceitar conexão logo após um restart (cold start) ou sob rede instável —
   * sem retry, o usuário vê "erro ao conectar" no primeiro tropeço. Aqui a gente
   * tenta de novo com 300ms → 600ms → 1200ms (+jitter), até `tries` vezes.
   *
   * Erros NÃO-transitórios (senha incorreta, sala cheia/locked, JWT inválido) NÃO
   * são retriados — re-lança na hora pra UI mostrar a mensagem correta.
   * @param {() => Promise<any>} fn  closure que executa o join
   * @param {string} label  rótulo p/ log
   * @param {number} tries  máximo de tentativas (default 4)
   */
  async _withRetry(fn, label = 'join', tries = 4) {
    const NON_RETRYABLE = /senha incorreta|password|locked|is locked|full|lotad|JWT|unauthorized|forbidden|not found|seat reservation expired/i;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const msg = e?.message || String(e);
        if (NON_RETRYABLE.test(msg)) {
          console.warn(`[Colyseus] ${label}: erro não-retriável, abortando:`, msg);
          throw e;
        }
        if (i === tries - 1) break;
        const base = 300 * Math.pow(2, i);           // 300, 600, 1200
        const jitter = Math.floor(base * 0.3 * ((i * 7 + 3) % 10) / 10); // determinístico, sem Math.random
        const delay = base + jitter;
        console.warn(`[Colyseus] ${label} tentativa ${i + 1}/${tries} falhou (${msg}); retry em ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    console.error(`[Colyseus] ${label}: todas as ${tries} tentativas falharam.`);
    throw lastErr;
  }

  /**
   * Conecta no LobbyRoom built-in para receber lista de arenas em REALTIME.
   * O LobbyRoom emite 'rooms' (snapshot inicial) e '+/-' (incremental).
   * Callback recebe Array<RoomListingData>.
   */
  async subscribeLobby(onRooms) {
    if (!this.client) throw new Error('client not initialized');
    // Se já tem lobby ativo (não em CLOSING/CLOSED), só atualiza callback e retorna.
    // Evita race condition de criar WS novo enquanto o anterior fecha.
    if (this._lobby && this._lobby.connection?.isOpen) {
      this._lobbyCallback = onRooms;
      // Já dispara com snapshot atual
      if (this._lobbyRooms) onRooms?.(this._lobbyRooms.slice());
      return this._lobby;
    }
    // Race-guard: se já tem subscribe em andamento, aguarda
    if (this._lobbyPromise) {
      try { await this._lobbyPromise; }
      catch (e) { console.error('[Lobby] subscribe await:', e); throw e; }
      if (this._lobby?.connection?.isOpen) {
        this._lobbyCallback = onRooms;
        if (this._lobbyRooms) onRooms?.(this._lobbyRooms.slice());
        return this._lobby;
      }
    }
    // Limpa lobby antigo se em CLOSING/CLOSED
    if (this._lobby) {
      try { await this._lobby.leave(false); }
      catch (e) { console.error('[Lobby] leave antigo:', e); }
      this._lobby = null;
    }
    this._lobbyCallback = onRooms;
    this._lobbyPromise = (async () => {
      this._lobby = await this._withRetry(() => this.client.joinOrCreate('lobby'), 'subscribeLobby');
      this._lobbyRooms = [];
      this._lobby.onMessage('rooms', (rooms) => {
        this._lobbyRooms = rooms || [];
        this._lobbyCallback?.(this._lobbyRooms.slice());
      });
      this._lobby.onMessage('+', ([roomId, data]) => {
        const idx = this._lobbyRooms.findIndex((r) => r.roomId === roomId);
        if (idx >= 0) this._lobbyRooms[idx] = data;
        else this._lobbyRooms.push(data);
        this._lobbyCallback?.(this._lobbyRooms.slice());
      });
      this._lobby.onMessage('-', (roomId) => {
        this._lobbyRooms = this._lobbyRooms.filter((r) => r.roomId !== roomId);
        this._lobbyCallback?.(this._lobbyRooms.slice());
      });
      // Limpa lobby quando desconectar
      this._lobby.onLeave?.(() => { this._lobby = null; this._lobbyRooms = []; });
      return this._lobby;
    })();
    try {
      const r = await this._lobbyPromise;
      this._lobbyPromise = null;
      return r;
    } catch (e) {
      this._lobbyPromise = null;
      this._lobby = null;
      throw e;
    }
  }

  /** Snapshot atual cached pelo lobby (após subscribeLobby). */
  getLobbyRooms() {
    return (this._lobbyRooms || []).slice();
  }

  async leaveLobby() {
    if (this._lobby) {
      try { await this._lobby.leave(); }
      catch (e) { console.error('[Lobby] leave:', e); }
      this._lobby = null;
      this._lobbyRooms = [];
    }
  }

  /** Cria nova sala arena. */
  async createRoom({ token, nickname, avatar_url, name, map, max_players, password, mode }) {
    if (!this.client) throw new Error('client not initialized');
    if (!nickname) throw new Error('[CreateRoom] nickname obrigatorio');
    if (!map) throw new Error('[CreateRoom] map obrigatorio');
    if (!max_players) throw new Error('[CreateRoom] max_players obrigatorio');
    if (!mode) throw new Error('[CreateRoom] mode obrigatorio');
    const options = {
      token, nickname, avatar_url,
      player_id: this.stableId(),   // chave estável p/ o server (ver stableId())
      name: name || `Sala de ${nickname}`,
      map,
      maxPlayers: max_players,
      password: password ?? null,
      host_nickname: nickname,
      mode,
    };
    this.room = await this._withRetry(() => this.client.create('arena', options), 'createRoom');
    this._bindRoom();
    return this.room;
  }

  /** Entra em sala existente por id. Se o roomId estiver morto (sala fechou),
   *  cai p/ joinOrCreate por matchmaking — nunca trava num roomId cacheado. */
  async joinRoomById({ roomId, token, nickname, avatar_url, password, map, mode }) {
    if (!this.client) throw new Error('client not initialized');
    try {
      this.room = await this._withRetry(
        () => this.client.joinById(roomId, { token, nickname, avatar_url, password, player_id: this.stableId() }),
        'joinById',
      );
    } catch (e) {
      const msg = e?.message || String(e);
      // Sala morta / inexistente: NÃO insistir no id cacheado. Tenta matchmaking
      // (a menos que tenha senha — aí o usuário precisa escolher outra sala).
      if (/not found|seat reservation|no rooms/i.test(msg) && !password && nickname && map) {
        console.warn('[Colyseus] joinById falhou (sala morta?), caindo p/ joinOrCreate:', msg);
        this.room = await this._withRetry(
          () => this.client.joinOrCreate('arena', { token, nickname, avatar_url, player_id: this.stableId(), map, mode: mode || 'DEATHMATCH', name: 'QuickPlay', maxPlayers: 8 }),
          'joinById→joinOrCreate',
        );
      } else {
        throw e;
      }
    }
    this._bindRoom();
    return this.room;
  }

  /** Entra em qualquer sala (matchmaking). */
  async quickPlay({ token, nickname, avatar_url, map }) {
    if (!nickname) throw new Error('[QuickPlay] nickname obrigatorio');
    if (!map) throw new Error('[QuickPlay] map obrigatorio');
    this.room = await this._withRetry(
      () => this.client.joinOrCreate('arena', {
        token, nickname, avatar_url, player_id: this.stableId(), map,
        name: 'QuickPlay', maxPlayers: 8,
      }),
      'quickPlay',
    );
    this._bindRoom();
    return this.room;
  }

  _bindRoom() {
    if (!this.room) return;
    this.sessionId = this.room.sessionId;
    // ── RELOAD / FECHAR ABA: leave CONSENTIDO na hora ────────────────
    //  Ctrl+F5 / fechar caía como QUEDA ACIDENTAL → o servidor segurava o
    //  assento 15s (allowReconnection) e o reload virava FANTASMA (os outros
    //  viam a sessão velha; o player novo não era visto / sumia 15s depois).
    //  Mandando leave(consented=true) no pagehide, o assento sai NA HORA e o
    //  reload entra limpo. (Queda de REDE real não dispara pagehide → mantém o
    //  grace de 15s pra reconectar.)
    ColyseusClient._active = this;
    if (!ColyseusClient._unloadHooked) {
      ColyseusClient._unloadHooked = true;
      const bail = () => { try { ColyseusClient._active?.room?.leave(true); } catch (_) {} };
      window.addEventListener('pagehide', bail);
      window.addEventListener('beforeunload', bail);
    }
    // CRÍTICO: o playerId local TEM que ser a mesma chave que mandamos no join
    // (player_id) — é por ela que o server guarda nosso PlayerState. Sem isto,
    // players.get(playerId) = null e o jogo achava que não estávamos na sala.
    this.playerId = this.stableId();
    // ⚠️ MpGuard ATIVO — bloqueia spawns locais a partir de AGORA.
    MpGuard.enterRoom(this.room.roomId);
    // Aguarda primeiro state sync antes de attachar listeners de schema (.onAdd, .listen)
    this.room.onStateChange.once(() => {
      this._attachStateListeners();
      // SKIN/CLASSE: reenvia a classe salva (localStorage espelha o Supabase
      // settings via CloudSave) ao entrar, pro avatar certo aparecer pros
      // outros AO VIVO sem precisar reabrir a seleção. Handler já existe no
      // servidor (br_class_select) — zero redeploy.
      try {
        const saved = parseInt(localStorage.getItem('transfps_class_id') || '0');
        if (Number.isFinite(saved)) this.sendMessage('br_class_select', { class_id: saved });
      } catch (_) {}
    });
    // Listener GERAL de qualquer patch no state — re-emite 'state_change' pra UI re-renderizar.
    // Isso eh CRITICO pro Lobby: map_id/host_id/mode/br_phase chegam em deltas posteriores ao
    // welcome. Sem isso, _refreshRoomView fica preso no early-return de map_id e a sala
    // aparece vazia mesmo com player ja no state.
    this.room.onStateChange((state) => {
      this._notify('state_change', { reason: 'patch' });
    });

    // Mensagens broadcasted pelo servidor (sempre disponíveis)
    this.room.onMessage('match_started', () => this._notify('match_started'));
    this.room.onMessage('died', (m) => this._notify('died', m));
    this.room.onMessage('respawn', (m) => this._notify('respawn', m));
    this.room.onMessage('mob_attack', (m) => this._notify('mob_attack', m));
    this.room.onMessage('mob_killed', (m) => this._notify('mob_killed', m));
    this.room.onMessage('chat', (m) => this._notify('chat', m));
    this.room.onMessage('error', (m) => this._notify('error', m));
    this.room.onMessage('hit_confirmed', (m) => this._notify('hit_confirmed', m));
    this.room.onMessage('pickup', (m) => this._notify('pickup', m));
    this.room.onMessage('pickup_denied', (m) => this._notify('pickup_denied', m));
    this.room.onMessage('skill_cast', (m) => this._notify('skill_cast', m));
    this.room.onMessage('xp_gain', (m) => this._notify('xp_gain', m));
    this.room.onMessage('level_up', (m) => this._notify('level_up', m));
    this.room.onMessage('prop_hit', (m) => this._notify('prop_hit', m));
    this.room.onMessage('prop_broken', (m) => this._notify('prop_broken', m));
    this.room.onMessage('world_object_placed', (m) => this._notify('world_object_placed', m));
    this.room.onMessage('world_object_hit', (m) => this._notify('world_object_hit', m));
    this.room.onMessage('world_object_destroyed', (m) => this._notify('world_object_destroyed', m));
    // Som posicional de tiro/golpe do parceiro (rebroadcast do server)
    this.room.onMessage('remote_fire', (m) => this._notify('remote_fire', m));
    // SFX de movimento do parceiro (pulo/dash/pouso) — som espacial
    this.room.onMessage('remote_sfx', (m) => this._notify('remote_sfx', m));
    this.room.onMessage('player_knockback', (m) => this._notify('player_knockback', m));
    // Frentes B/C
    this.room.onMessage('match_countdown', (m) => this._notify('match_countdown', m));
    this.room.onMessage('match_finished', (m) => this._notify('match_finished', m));
    this.room.onMessage('lobby_reset', (m) => this._notify('lobby_reset', m));
    this.room.onMessage('wave_up', (m) => this._notify('wave_up', m));
    this.room.onMessage('boss_appeared', (m) => this._notify('boss_appeared', m));
    this.room.onMessage('boss_killed', (m) => this._notify('boss_killed', m));
    this.room.onMessage('boss_phase', (m) => this._notify('boss_phase', m));
    this.room.onMessage('boss_attack', (m) => this._notify('boss_attack', m));
    // Frente A
    this.room.onMessage('profile_loaded', (m) => this._notify('profile_loaded', m));
    // Frente D
    this.room.onMessage('quest_claimed', (m) => this._notify('quest_claimed', m));
    // Frente H
    this.room.onMessage('party_invite', (m) => this._notify('party_invite', m));
    this.room.onMessage('party_joined', (m) => this._notify('party_joined', m));
    this.room.onMessage('party_left', (m) => this._notify('party_left', m));
    // Battle Royale
    this.room.onMessage('br_takeoff', (m) => this._notify('br_takeoff', m));
    this.room.onMessage('player_skydive', (m) => this._notify('player_skydive', m));
    this.room.onMessage('br_skydive_phase', (m) => this._notify('br_skydive_phase', m));
    this.room.onMessage('br_landed', (m) => this._notify('br_landed', m));
    this.room.onMessage('br_running', (m) => this._notify('br_running', m));
    this.room.onMessage('br_finished', (m) => this._notify('br_finished', m));
    this.room.onMessage('br_zone_warning', (m) => this._notify('br_zone_warning', m));
    this.room.onMessage('br_zone_shrinking', (m) => this._notify('br_zone_shrinking', m));
    this.room.onMessage('br_zone_idle', (m) => this._notify('br_zone_idle', m));
    this.room.onMessage('br_player_died', (m) => this._notify('br_player_died', m));
    this.room.onMessage('pong', (m) => {
      const now = performance.now();
      const rtt = Math.max(0, now - (m.t || now));
      this.ping = rtt | 0;
      if (m && Number.isFinite(m.server_t)) {
        this.serverTimeDelta = m.server_t - Date.now();
      }
      this._notify('pong', { rtt: this.ping, server_t: m.server_t });
    });

    this.room.onLeave((code) => {
      console.log('[Colyseus] left room, code=', code);
      MpGuard.exitRoom(); // libera spawns locais de novo
      this._notify('close', { code });
      this.room = null;
    });

    this.room.onError((code, msg) => {
      console.warn('[Colyseus] room error:', code, msg);
      this._notify('error', { code, msg });
    });

    this._notify('open');
  }

  _attachStateListeners() {
    if (!this.room?.state) { console.error('[CS] _attachStateListeners SEM room.state'); return; }
    const playersInState = [];
    this.room.state.players?.forEach?.((p, k) => playersInState.push({ k, nick: p?.nickname }));
    console.log('[CS] _attachStateListeners playerId=', this.playerId, 'playersInState=', playersInState, 'map_id=', this.room.state.map_id);
    const serverNick = this.room.state.players?.get?.(this.playerId)?.nickname;
    if (!serverNick) {
      // NÃO throw — atacha listeners mesmo assim. Welcome às vezes chega sem o próprio player (race),
      // os listeners onAdd vão capturar quando ele aparecer.
      console.warn('[CS] _attachStateListeners: player próprio ainda não no state (playerId=' + this.playerId + '). Listeners attached mesmo assim.');
    } else {
      this.nickname = serverNick;
    }

    // Usa API getStateCallbacks (@colyseus/schema@3.0)
    const $ = getStateCallbacks(this.room);

    // Players
    $(this.room.state).players.onAdd((player, key) => {
      this._notify('player_add', { id: key, state: player });
      $(player).listen('hp', (v) => this._notify('player_change', { id: key, field: 'hp', value: v, state: player }));
      $(player).listen('maxHp', (v) => this._notify('player_change', { id: key, field: 'maxHp', value: v, state: player }));
      $(player).listen('dead', (v) => this._notify('player_change', { id: key, field: 'dead', value: v, state: player }));
      $(player).listen('pvp_on', (v) => this._notify('player_change', { id: key, field: 'pvp_on', value: v, state: player }));
      $(player).listen('is_ready', (v) => this._notify('player_change', { id: key, field: 'is_ready', value: v, state: player }));
      $(player).listen('weapon', (v) => this._notify('player_change', { id: key, field: 'weapon', value: v, state: player }));
      $(player).listen('held_item', (v) => this._notify('player_change', { id: key, field: 'held_item', value: v, state: player }));
      $(player).listen('class_id', (v) => this._notify('player_change', { id: key, field: 'class_id', value: v, state: player }));
      $(player).listen('equip_skin', (v) => this._notify('player_change', { id: key, field: 'equip_skin', value: v, state: player }));
      $(player).listen('x', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('y', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('z', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('ry', () => this._notify('player_change', { id: key, field: 'ry', value: null, state: player }));
      // anim_state: sem isto o parceiro fica em T-pose/idle e os PASSOS nunca tocam
      // (RemotePlayer._maybePlayFootstep depende de anim_state walk/run).
      $(player).listen('anim_state', (v) => this._notify('player_change', { id: key, field: 'anim_state', value: v, state: player }));
    });
    $(this.room.state).players.onRemove((player, key) => {
      this._notify('player_remove', { id: key, state: player });
    });

    // Mobs
    $(this.room.state).mobs.onAdd((mob, key) => {
      this._notify('mob_add', { id: key, state: mob });
      $(mob).listen('hp', (v) => this._notify('mob_change', { id: key, field: 'hp', value: v, state: mob }));
      $(mob).listen('state', (v) => this._notify('mob_change', { id: key, field: 'state', value: v, state: mob }));
      $(mob).listen('x', () => this._notify('mob_change', { id: key, field: 'pos', value: null, state: mob }));
      $(mob).listen('z', () => this._notify('mob_change', { id: key, field: 'pos', value: null, state: mob }));
      $(mob).listen('ry', () => this._notify('mob_change', { id: key, field: 'ry', value: null, state: mob }));
    });
    $(this.room.state).mobs.onRemove((mob, key) => {
      this._notify('mob_remove', { id: key, state: mob });
    });

    // Drops (loot server-authoritative)
    $(this.room.state).drops.onAdd((drop, key) => {
      this._notify('drop_add', { id: key, state: drop });
    });
    $(this.room.state).drops.onRemove((drop, key) => {
      this._notify('drop_remove', { id: key, state: drop });
    });

    // Props destrutiveis
    $(this.room.state).props.onAdd((prop, key) => {
      this._notify('prop_add', { id: key, state: prop });
      $(prop).listen('hp', (v) => this._notify('prop_change', { id: key, field: 'hp', value: v, state: prop }));
      $(prop).listen('broken', (v) => this._notify('prop_change', { id: key, field: 'broken', value: v, state: prop }));
    });
    $(this.room.state).props.onRemove((prop, key) => {
      this._notify('prop_remove', { id: key, state: prop });
    });

    // World Objects (dinâmicos: placed/hit/destroyed)
    if (this.room.state.world_objects) {
      $(this.room.state).world_objects.onAdd((wo, key) => {
        this._notify('world_object_add', { id: key, state: wo });
        $(wo).listen('hp', (v) => this._notify('world_object_change', { id: key, field: 'hp', value: v, state: wo }));
      });
      $(this.room.state).world_objects.onRemove((wo, key) => {
        this._notify('world_object_remove', { id: key, state: wo });
      });
    }

    // FX (eventos visuais compartilhados)
    $(this.room.state).fx.onAdd((fx, key) => {
      this._notify('fx_add', { id: key, state: fx });
    });
    $(this.room.state).fx.onRemove((fx, key) => {
      this._notify('fx_remove', { id: key, state: fx });
    });

    // Root listeners
    $(this.room.state).listen('started', (v) => {
      if (v === true) this._notify('match_started');
    });
    // map_id e host_id chegam no welcome via delta de root, DEPOIS de players.onAdd.
    // A UI do lobby precisa re-renderizar quando esses campos sincronizam — senao
    // o render fica preso no guard `if (!mapId) return` da primeira passada (pre-sync).
    $(this.room.state).listen('map_id', () => this._notify('state_change', { field: 'map_id' }));
    $(this.room.state).listen('host_id', () => this._notify('state_change', { field: 'host_id' }));

    // Re-emite players já no welcome (se chegaram antes do listener)
    this.room.state.players.forEach((player, key) => {
      this._notify('player_add', { id: key, state: player });
    });
    this.room.state.mobs.forEach((mob, key) => {
      this._notify('mob_add', { id: key, state: mob });
    });
  }

  /** Envia input do player (posição/rotação/anim) — rate-limited. */
  sendInput(player) {
    if (!this.room) return;
    const now = performance.now();
    if (now - this._lastInputSent < this.INPUT_RATE_MS) return;
    this._lastInputSent = now;
    const pos = player.mesh?.position;
    if (!pos) return;
    const weaponId = player.weapon?.getCurrentWeapon?.()?.id || 'unarmed';
    // held_item = o que está REALMENTE na mão: um construível da hotbar em modo
    // de colocar (player._heldItem, ex.: 'asset:crate') tem prioridade; senão a arma.
    const heldItem = (typeof player._heldItem === 'string' && player._heldItem) ? player._heldItem : weaponId;
    // ── anim_state = LOCOMOÇÃO real (idle/walk/run), NÃO o estado do FSM de combate.
    //    O PlayerStateMachine só conhece armed/unarmed/sword/attacking/... — nunca
    //    'walk'/'run'. Mandar o FSM aqui fazia o RemotePlayer._maybePlayFootstep
    //    (que casa anim_state.includes('walk'|'run')) NUNCA tocar passos, e o
    //    matcher de animação do GLB remoto também nunca encontrava walk/run.
    //    Deriva da velocidade horizontal + sprint pra os parceiros OUVIREM os passos
    //    e verem a anim de corrida/caminhada do avatar. ──
    const _vx = player._vx || 0, _vz = player._vz || 0;
    const _speed = Math.hypot(_vx, _vz);
    const _grounded = (player.isGrounded !== false);
    // ── THRESHOLD calibrado pela FISICA REAL do Player ──
    //   Player.SPEED = 11 (walk em regime), sprint = 11 * 1.75 ≈ 19.25.
    //   O corte antigo (_speed > 6.5) classificava TODA caminhada como 'run'
    //   (porque andar normal ja da _speed ~= 11 > 6.5), e 'walk' so aparecia
    //   na rampa de aceleracao — o remoto via Correndo o tempo todo.
    //   Agora 'run' depende da FLAG de sprint (criterio primario) OU de um corte
    //   ENTRE walk(11) e sprint(19.25) -> 14, separando walk de run de verdade.
    // ── PARIDADE com a locomoção LOCAL (AnimationController.updateLocomotion) ──
    //   O remoto agora roda o MESMO moveset; então mandamos os MESMOS estados
    //   que o local escolhe: idle / walk / run / run_fast (sprint) e jump vs fall
    //   no ar. Antes mandava só idle/walk/run/fall e o sprint virava "run" comum.
    const _vy = +(player.velY || 0);
    let animState;
    if (!_grounded)                animState = (_vy > 3) ? 'jump' : 'fall';
    else if (player._sprinting)    animState = 'run_fast';   // sprint → corrida acelerada
    else if (_speed > 8)           animState = 'run';         // corrida normal
    else if (_speed > 0.8)         animState = 'walk';        // caminhada
    else                           animState = 'idle';
    this.room.send('input', {
      x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2),
      ry: +(player.yaw || 0).toFixed(1),
      vy: +(player.velY || 0).toFixed(1),
      state: animState,
      weapon: weaponId,
      held_item: heldItem,
    });
  }

  /** ⚠️ dmg NÃO é enviado — servidor calcula via WeaponTable.
   *  launch = golpe que ARREMESSA (chute ou crit) → o server manda knockback
   *  forte + crit (sobe e voa). Sem isso só chega o empurrão normal. */
  sendHitPlayer(targetId, _dmgIgnored, weapon, launch = false) {
    const msg = { to: targetId, weapon };
    if (launch) msg.launch = true;
    this.room?.send('hit_player', msg);
  }
  /** ⚠️ dmg NÃO é enviado — servidor calcula via WeaponTable. */
  sendHitMob(mobId, _dmgIgnored, weapon) {
    this.room?.send('hit_mob', { mob_id: mobId, weapon });
  }
  sendReady(isReady) {
    this.room?.send('ready', { is_ready: !!isReady });
  }
  sendPvpToggle(pvpOn) {
    this.room?.send('pvp_toggle', { pvp_on: !!pvpOn });
  }
  sendStartMatch() {
    this.room?.send('start_match', {});
  }
  sendSpawnMob(kind) {
    this.room?.send('spawn_mob', { kind: kind || null });
  }
  sendClearMobs() {
    this.room?.send('clear_mobs', {});
  }
  sendRespawn() {
    this.room?.send('respawn', {});
  }
  sendChat(msg) {
    this.room?.send('chat', { msg });
  }
  /** Pickup de drop server-validated. Server valida range, deleta state, broadcasta. */
  sendPickup(dropId) {
    this.room?.send('pickup_drop', { drop_id: dropId });
  }
  /** Cast de skill — server valida cooldown e broadcasta pra todos renderizarem. */
  sendCastSkill(skillId, { dirX = null, dirZ = null } = {}) {
    this.room?.send('cast_skill', { skill_id: skillId, dir_x: dirX, dir_z: dirZ });
  }
  /**
   * Avisa o server que DISPAROU/GOLPEOU (pra parceiros OUVIREM o tiro/swing mesmo no erro).
   * Server rebroadcast posicional (remote_fire) com a pos autoritativa do atirador.
   */
  sendFire(weapon, melee = false, dir = null, anim = null) {
    const msg = { weapon: weapon || 'unarmed', melee: !!melee };
    if (dir && Number.isFinite(dir.dx)) { msg.dx = dir.dx; msg.dy = dir.dy; msg.dz = dir.dz; }
    // anim = NOME do clipe REAL que o player local está tocando (punch_03,
    // sword_combo_2, …). Permite o avatar remoto tocar EXATAMENTE o mesmo golpe.
    if (typeof anim === 'string' && anim) msg.anim = anim.slice(0, 32);
    this.room?.send('fire_sound', msg);
  }
  /** SFX de movimento (jump/dash/land) — server rebroadcasta posicional p/ os
   *  parceiros OUVIREM o pulo/dash/pouso espacialmente, como o tiro/golpe. */
  sendSfx(kind) {
    this.room?.send('player_sfx', { kind: String(kind || '').slice(0, 16) });
  }
  /** Hit em prop destrutivel (barril/caixa). Servidor calcula dmg. */
  sendHitProp(propId, weapon) {
    this.room?.send('hit_prop', { prop_id: propId, weapon });
  }
  /** Pede FX visual compartilhado (whitelist: spray, explosion, splash...). */
  sendSpawnFx(kind, { x, y, z } = {}) {
    this.room?.send('spawn_fx', { kind, x, y, z });
  }
  /** Ping: client envia performance.now(), server ecoa em pong. */
  sendPing() {
    if (!this.room) return;
    this.room.send('ping', { t: performance.now(), ping: this.ping });
  }
  getPing() { return this.ping; }
  /** Equipa item do bag ou starter. Server valida ownership. */
  sendEquip(itemId) {
    this.room?.send('equip', { item: itemId });
  }
  /** Usa item consumível do bag. Server valida + aplica efeito. */
  sendUseItem(itemId) {
    this.room?.send('use_item', { item: itemId });
  }
  /** Joga item no chão (spawna drop pra outros pegarem). */
  sendDropItem(itemId) {
    this.room?.send('drop_item', { item: itemId });
  }
  /** Envia mensagem genérica (claim_quest, party_invite/accept/leave, etc). */
  sendMessage(type, payload) {
    this.room?.send(type, payload || {});
  }
  /** Snapshot da sala (state read-only). */
  get state() { return this.room?.state || null; }
  /** Estado do MEU player no schema (autoritativo do server) ou null. */
  getMyState() { return this.room?.state?.players?.get(this.playerId) || null; }
  /** Saldo de coins AUTORITATIVO do server (coin + gem*3 já somados). */
  getMyCoins() { const me = this.getMyState(); return me?.coins ?? null; }
  isHost() {
    const me = this.room?.state?.players?.get(this.playerId);
    return !!me?.is_host;
  }
  isStarted() { return !!this.room?.state?.started; }
  get connected() { return !!this.room; }

  setPlayerId(id) { if (id) this.playerId = id; }

  /**
   * ID ESTÁVEL do cliente — a CHAVE pela qual o servidor guarda este player
   * no state (auth.sub). O servidor usa `options.player_id || sessionId`, então
   * SEMPRE mandamos esse id no join. Logado = userId do Supabase. Anônimo = UUID
   * persistente no localStorage (mesmo id entre reloads → reconexão funciona).
   * Sem isso, o server caía pro sessionId e o cliente procurava pelo userId →
   * `players.get(meuId)` = null → TAB dizia "não está na sala" mesmo conectado.
   */
  stableId() {
    let uid = null;
    try { uid = window._auth?.getUserId?.() || null; } catch (_) {}
    if (uid) return uid;
    try {
      let anon = localStorage.getItem('transfps_anon_id');
      if (!anon) {
        anon = 'anon-' + (crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
        localStorage.setItem('transfps_anon_id', anon);
      }
      return anon;
    } catch (_) {
      return 'anon-' + Math.random().toString(36).slice(2);
    }
  }

  on(event, cb) {
    // RESILIENTE: um evento faltando NUNCA pode matar o boot (era throw → tela
    // ERRO). Se o nome não existe no mapa, cria o set on-demand e avisa. Pior
    // caso: o evento simplesmente nunca dispara, mas o jogo carrega normal.
    if (!this._listeners[event]) {
      console.warn('[CS] evento "' + event + '" não pré-registrado — criando on-demand');
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(cb);
    return () => this._listeners[event].delete(cb);
  }
  _notify(event, payload) {
    const set = this._listeners[event]; if (!set) return;
    for (const cb of set) {
      try { cb(payload); }
      catch (e) { console.error('[Colyseus] cb erro:', event, e); }
    }
  }

  /** Sai da sala (volta pro lobby). */
  async leave() {
    if (this.room) {
      try { await this.room.leave(true); }
      catch (e) { console.error('[CS] leave async:', e); }
      this.room = null;
    }
  }
}
