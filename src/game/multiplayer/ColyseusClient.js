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
      'match_started': new Set(), 'died': new Set(), 'respawn': new Set(),
      'mob_attack': new Set(), 'mob_killed': new Set(), 'chat': new Set(),
      'state_change': new Set(), 'error': new Set(),
    };
    this._lastInputSent = 0;
    this.INPUT_RATE_MS = 50; // 20Hz
  }

  /** Conecta ao gameServer (URL base sem path). */
  connect(wsUrl) {
    this.client = new Client(wsUrl);
  }

  /**
   * Conecta no LobbyRoom built-in para receber lista de arenas em REALTIME.
   * O LobbyRoom emite 'rooms' (snapshot inicial) e '+/-' (incremental).
   * Callback recebe Array<RoomListingData>.
   */
  async subscribeLobby(onRooms) {
    if (!this.client) throw new Error('client not initialized');
    if (this._lobby) { try { await this._lobby.leave(); } catch (_) {} }
    this._lobby = await this.client.joinOrCreate('lobby');
    this._lobbyRooms = [];
    this._lobby.onMessage('rooms', (rooms) => {
      this._lobbyRooms = rooms || [];
      onRooms?.(this._lobbyRooms.slice());
    });
    this._lobby.onMessage('+', ([roomId, data]) => {
      const idx = this._lobbyRooms.findIndex((r) => r.roomId === roomId);
      if (idx >= 0) this._lobbyRooms[idx] = data;
      else this._lobbyRooms.push(data);
      onRooms?.(this._lobbyRooms.slice());
    });
    this._lobby.onMessage('-', (roomId) => {
      this._lobbyRooms = this._lobbyRooms.filter((r) => r.roomId !== roomId);
      onRooms?.(this._lobbyRooms.slice());
    });
    return this._lobby;
  }

  /** Snapshot atual cached pelo lobby (após subscribeLobby). */
  getLobbyRooms() {
    return (this._lobbyRooms || []).slice();
  }

  async leaveLobby() {
    if (this._lobby) {
      try { await this._lobby.leave(); } catch (_) {}
      this._lobby = null;
      this._lobbyRooms = [];
    }
  }

  /** Cria nova sala arena. */
  async createRoom({ token, nickname, avatar_url, name, map, max_players, password }) {
    if (!this.client) throw new Error('client not initialized');
    const options = {
      token, nickname, avatar_url,
      name: name || ('Sala de ' + (nickname || 'Player')),
      map: map || 'default',
      maxPlayers: max_players || 8,
      password: password || null,
      host_nickname: nickname || '',
    };
    this.room = await this.client.create('arena', options);
    this._bindRoom();
    return this.room;
  }

  /** Entra em sala existente por id. */
  async joinRoomById({ roomId, token, nickname, avatar_url, password }) {
    if (!this.client) throw new Error('client not initialized');
    this.room = await this.client.joinById(roomId, {
      token, nickname, avatar_url, password,
    });
    this._bindRoom();
    return this.room;
  }

  /** Entra em qualquer sala (matchmaking). */
  async quickPlay({ token, nickname, avatar_url, map }) {
    this.room = await this.client.joinOrCreate('arena', {
      token, nickname, avatar_url, map: map || 'default',
      name: 'QuickPlay', maxPlayers: 8,
    });
    this._bindRoom();
    return this.room;
  }

  _bindRoom() {
    if (!this.room) return;
    this.sessionId = this.room.sessionId;
    // Aguarda primeiro state sync antes de attachar listeners
    this.room.onStateChange.once(() => this._attachStateListeners());

    // Mensagens broadcasted pelo servidor (sempre disponíveis)
    this.room.onMessage('match_started', () => this._notify('match_started'));
    this.room.onMessage('died', (m) => this._notify('died', m));
    this.room.onMessage('respawn', (m) => this._notify('respawn', m));
    this.room.onMessage('mob_attack', (m) => this._notify('mob_attack', m));
    this.room.onMessage('mob_killed', (m) => this._notify('mob_killed', m));
    this.room.onMessage('chat', (m) => this._notify('chat', m));
    this.room.onMessage('error', (m) => this._notify('error', m));

    this.room.onLeave((code) => {
      console.log('[Colyseus] left room, code=', code);
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
    if (!this.room?.state) return;
    this.nickname = this.room.state.players?.get?.(this.playerId)?.nickname || this.nickname;

    // Usa API getStateCallbacks (@colyseus/schema@3.0)
    const $ = getStateCallbacks(this.room);

    // Players
    $(this.room.state).players.onAdd((player, key) => {
      this._notify('player_add', { id: key, state: player });
      $(player).listen('hp', (v) => this._notify('player_change', { id: key, field: 'hp', value: v, state: player }));
      $(player).listen('dead', (v) => this._notify('player_change', { id: key, field: 'dead', value: v, state: player }));
      $(player).listen('pvp_on', (v) => this._notify('player_change', { id: key, field: 'pvp_on', value: v, state: player }));
      $(player).listen('is_ready', (v) => this._notify('player_change', { id: key, field: 'is_ready', value: v, state: player }));
      $(player).listen('weapon', (v) => this._notify('player_change', { id: key, field: 'weapon', value: v, state: player }));
      $(player).listen('x', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('y', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('z', () => this._notify('player_change', { id: key, field: 'pos', value: null, state: player }));
      $(player).listen('ry', () => this._notify('player_change', { id: key, field: 'ry', value: null, state: player }));
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

    // Root listeners
    $(this.room.state).listen('started', (v) => {
      if (v === true) this._notify('match_started');
    });
    $(this.room.state).listen('host_id', () => {});

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
    this.room.send('input', {
      x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2),
      ry: +(player.yaw || 0).toFixed(1),
      vy: +(player.velY || 0).toFixed(1),
      state: player.stateMachine?.state || 'idle',
      weapon: player.weapon?.getCurrentWeapon?.()?.id || 'unarmed',
    });
  }

  sendHitPlayer(targetId, dmg, weapon) {
    this.room?.send('hit_player', { to: targetId, dmg, weapon });
  }
  sendHitMob(mobId, dmg, weapon) {
    this.room?.send('hit_mob', { mob_id: mobId, dmg, weapon });
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

  /** Snapshot da sala (state read-only). */
  get state() { return this.room?.state || null; }
  isHost() {
    const me = this.room?.state?.players?.get(this.playerId);
    return !!me?.is_host;
  }
  isStarted() { return !!this.room?.state?.started; }
  get connected() { return !!this.room; }

  setPlayerId(id) { this.playerId = id; }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(cb);
    return () => this._listeners[event].delete(cb);
  }
  _notify(event, payload) {
    const set = this._listeners[event]; if (!set) return;
    for (const cb of set) try { cb(payload); } catch (e) { console.warn('[Colyseus] cb erro:', event, e); }
  }

  async leave() {
    if (this.room) {
      try { await this.room.leave(true); } catch (_) {}
      this.room = null;
    }
  }
}
