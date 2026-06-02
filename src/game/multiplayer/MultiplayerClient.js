// ─────────────────────────────────────────────────────────────────
//  MultiplayerClient — cliente WebSocket pro relay TransFPS
//
//  Protocolo JSON simples:
//    → join { room, player_id, nickname, jwt }
//    ← welcome { players: [...] }
//    ↔ snapshot { player_id, x, y, z, ry, vy, state, weapon } (20 Hz)
//    ↔ hit { from, to, dmg, weapon }
//    ↔ chat { from, nick, msg }  (canal extra além do Supabase)
//    ← player_joined { player_id, nickname }
//    ← player_left { player_id }
//
//  Reconexão automática com backoff exponencial.
// ─────────────────────────────────────────────────────────────────

export class MultiplayerClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.roomId = null;
    this.playerId = null;
    this.nickname = null;
    this.jwt = null;
    this.url = null;
    this.players = new Map();  // player_id → { x, y, z, ry, nickname, lastUpdate, weapon }
    this._listeners = { snapshot: new Set(), hit: new Set(), join: new Set(), leave: new Set(), chat: new Set(), open: new Set(), close: new Set(), hp: new Set(), died: new Set(), respawn: new Set() };
    this._snapshotInterval = null;
    this._snapshotRate = 20; // Hz
    this._lastSnapshot = 0;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
  }

  /** Conecta ao relay. */
  async connect(url, { roomId, playerId, nickname, jwt, avatarUrl }) {
    this.url = url;
    this.roomId = roomId;
    this.playerId = playerId;
    this.nickname = nickname;
    this.jwt = jwt;
    this.avatarUrl = avatarUrl || null;
    return this._openSocket();
  }

  _openSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e); return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        this._reconnectAttempts = 0;
        this._send({
          type: 'join',
          room: this.roomId,
          player_id: this.playerId,
          nickname: this.nickname,
          jwt: this.jwt,
          avatar_url: this.avatarUrl,
        });
        this._notify('open');
        resolve();
      };
      this.ws.onmessage = (e) => this._onMessage(e.data);
      this.ws.onclose = () => {
        this.connected = false;
        this._notify('close');
        this._scheduleReconnect();
      };
      this.ws.onerror = (e) => {
        console.warn('[MP] ws error', e);
        if (!this.connected) reject(new Error('WebSocket erro'));
      };
    });
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts > 6) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this._reconnectAttempts));
    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => this._openSocket().catch(() => {}), delay);
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    switch (msg.type) {
      case 'welcome':
        for (const p of (msg.players || [])) {
          if (p.player_id === this.playerId) continue;
          this.players.set(p.player_id, { ...p, lastUpdate: performance.now() });
          this._notify('join', p);
        }
        break;
      case 'snapshot':
        if (msg.player_id === this.playerId) return;
        this.players.set(msg.player_id, {
          ...msg,
          lastUpdate: performance.now(),
        });
        this._notify('snapshot', msg);
        break;
      case 'player_joined':
        if (msg.player_id === this.playerId) return;
        this.players.set(msg.player_id, { ...msg, lastUpdate: performance.now() });
        this._notify('join', msg);
        break;
      case 'player_left':
        this.players.delete(msg.player_id);
        this._notify('leave', msg);
        break;
      case 'hit':
        this._notify('hit', msg);
        break;
      case 'chat':
        this._notify('chat', msg);
        break;
      case 'hp':
        // Atualiza HP cacheado do player remoto
        if (this.players.has(msg.player_id)) {
          const p = this.players.get(msg.player_id);
          p.hp = msg.hp;
          p.maxHp = msg.maxHp;
        }
        this._notify('hp', msg);
        break;
      case 'died':
        this._notify('died', msg);
        break;
      case 'respawn':
        this._notify('respawn', msg);
        break;
    }
  }

  /** Envia snapshot da posição local. Chame a cada frame; rate limited. */
  sendSnapshot(player) {
    if (!this.connected) return;
    const now = performance.now();
    const interval = 1000 / this._snapshotRate;
    if (now - this._lastSnapshot < interval) return;
    this._lastSnapshot = now;
    const pos = player.mesh?.position;
    if (!pos) return;
    const w = player.weapon?.getCurrentWeapon?.()?.id || 'unarmed';
    this._send({
      type: 'snapshot',
      player_id: this.playerId,
      x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2),
      ry: +(player.yaw || 0).toFixed(1),
      vy: +(player.velY || 0).toFixed(1),
      state: player.stateMachine?.state || 'idle',
      weapon: w,
    });
  }

  /** Reporta hit em outro player. */
  sendHit(targetId, dmg, weapon) {
    this._send({ type: 'hit', from: this.playerId, to: targetId, dmg, weapon });
  }

  /** Anuncia HP atual (após dano/cura). */
  sendHp(hp, maxHp = 100) {
    this._send({ type: 'hp', hp, maxHp });
  }

  /** Anuncia morte (com matador opcional). */
  sendDied(killerId = null) {
    this._send({ type: 'died', killer: killerId });
  }

  /** Anuncia respawn. */
  sendRespawn() {
    this._send({ type: 'respawn' });
  }

  /** Chat in-game (canal extra além do Supabase). */
  sendChat(msg) {
    this._send({ type: 'chat', from: this.playerId, nick: this.nickname, msg });
  }

  _send(obj) {
    if (!this.connected) return;
    try { this.ws.send(JSON.stringify(obj)); } catch (_) {}
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(cb);
    return () => this._listeners[event].delete(cb);
  }

  _notify(event, payload) {
    const set = this._listeners[event];
    if (!set) return;
    for (const cb of set) try { cb(payload); } catch (e) { console.warn('[MP] cb erro:', e); }
  }

  disconnect() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectAttempts = 999;
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this.connected = false;
    this.players.clear();
  }
}
