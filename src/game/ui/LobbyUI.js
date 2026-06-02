// ─────────────────────────────────────────────────────────────────
//  LobbyUI — usando Colyseus matchmaking.
//
//  Fluxo:
//   - getAvailableRooms('arena') lista salas (auto refresh 3s)
//   - Botão CRIAR cria via client.create('arena', {...})
//   - Clicar numa sala entra via client.joinById
//   - Dentro da sala: botão PRONTO toggle + chat
//   - Se for host: botão INICIAR PARTIDA (libera quando todos prontos)
//   - Botão 🔗 copia link ?room=<roomId>
// ─────────────────────────────────────────────────────────────────
import { MapCatalog } from '../scene/ChibataMapLoader.js';

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class LobbyUI {
  constructor(auth, colyseusClient) {
    this.auth = auth;
    this.cs = colyseusClient;
    this._visible = false;
    this._refreshTimer = null;
    this._onEnterGame = null;
    this._build();

    // Listeners do Colyseus pra atualizar UI in-room
    this.cs.on('player_add', () => this._refreshRoomView());
    this.cs.on('player_remove', () => this._refreshRoomView());
    this.cs.on('player_change', () => this._refreshRoomView());
    this.cs.on('chat', (m) => this._appendChat(m));
    this.cs.on('match_started', () => this._onMatchStarted());
    this.cs.on('error', (m) => this._setStatus('erro: ' + (m.msg || m.code || 'desconhecido'), '#f55'));
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'lobby-ui';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 460;
      display: none; flex-direction: column;
      background: radial-gradient(ellipse at 50% 35%, #0a1230 0%, #050816 55%, #02030a 100%);
      color: #fff; font-family: 'Segoe UI', monospace;
    `;
    el.innerHTML = `
      <header style="display:flex;align-items:center;justify-content:space-between;
                     padding:14px 24px;border-bottom:1px solid rgba(120,180,255,0.25);
                     background:rgba(10,15,30,0.7);">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:1.4em;font-weight:900;letter-spacing:2px;color:#5cf;">🌐 LOBBY</span>
          <span id="lb-room-name" style="color:#888;font-size:0.9em;"></span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <span id="lb-status" style="font-size:0.78em;color:#789;">—</span>
          <button id="lb-close" style="background:transparent;border:1px solid rgba(255,90,106,0.35);
                  color:#ff7a8a;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.85em;">
            ✕ sair
          </button>
        </div>
      </header>

      <div style="flex:1;display:flex;gap:14px;padding:14px;min-height:0;">
        <aside style="flex:0 0 320px;display:flex;flex-direction:column;gap:10px;
                      background:rgba(15,20,40,0.65);border-radius:12px;
                      border:1px solid rgba(120,180,255,0.18);padding:12px;">
          <div style="display:flex;gap:6px;">
            <button id="lb-refresh" style="flex:1;background:#1e3a6f;color:#cef;
                    border:1px solid #3a5ca0;padding:8px;border-radius:6px;
                    cursor:pointer;font-size:0.85em;">↻ atualizar</button>
            <button id="lb-create" style="flex:1;background:#1e6f3a;color:#cfa;
                    border:1px solid #3aa05c;padding:8px;border-radius:6px;
                    cursor:pointer;font-size:0.85em;">＋ criar</button>
          </div>
          <div id="lb-rooms-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;">
            <div style="color:#789;font-size:0.85em;text-align:center;padding:20px;">carregando…</div>
          </div>
        </aside>

        <main style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:0;">
          <div id="lb-empty" style="flex:1;display:flex;align-items:center;justify-content:center;
                                    background:rgba(15,20,40,0.45);border-radius:12px;
                                    border:1px dashed rgba(120,180,255,0.20);color:#789;
                                    font-size:0.92em;text-align:center;padding:30px;">
            selecione uma sala à esquerda<br>ou crie a sua
          </div>

          <div id="lb-room" style="display:none;flex:1;flex-direction:column;gap:10px;min-height:0;">
            <div style="background:rgba(15,20,40,0.65);padding:12px 16px;
                        border-radius:10px;border:1px solid rgba(120,180,255,0.18);">
              <div style="font-size:0.7em;color:#789;letter-spacing:1.5px;">SALA</div>
              <div id="lb-room-title" style="font-size:1.3em;font-weight:700;color:#5cf;">—</div>
              <div id="lb-room-meta" style="font-size:0.78em;color:#9aa;margin-top:3px;">—</div>
            </div>

            <div style="display:flex;gap:10px;flex:1;min-height:0;">
              <div style="flex:0 0 240px;background:rgba(15,20,40,0.65);
                          border-radius:10px;border:1px solid rgba(120,180,255,0.18);
                          padding:10px;display:flex;flex-direction:column;gap:6px;">
                <div style="font-size:0.7em;color:#789;letter-spacing:1.5px;">PLAYERS</div>
                <div id="lb-players" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;"></div>
              </div>

              <div style="flex:1;display:flex;flex-direction:column;gap:6px;
                          background:rgba(15,20,40,0.65);border-radius:10px;
                          border:1px solid rgba(120,180,255,0.18);padding:10px;min-width:0;">
                <div style="font-size:0.7em;color:#789;letter-spacing:1.5px;">CHAT</div>
                <div id="lb-chat" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;
                                         gap:3px;font-size:0.85em;padding-right:4px;"></div>
                <div style="display:flex;gap:6px;">
                  <input id="lb-chat-input" type="text" maxlength="500" placeholder="digite…"
                         style="flex:1;padding:8px 12px;background:#0a0f1c;
                                border:1px solid rgba(120,180,255,0.25);color:#fff;
                                border-radius:6px;font-family:inherit;font-size:0.9em;"/>
                  <button id="lb-chat-send" style="background:#1e3a6f;color:#cef;
                          border:1px solid #3a5ca0;padding:8px 14px;border-radius:6px;
                          cursor:pointer;">enviar</button>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button id="lb-ready" style="flex:1;min-width:140px;padding:13px;
                      background:#2a3a55;color:#fff;border:1px solid #4a6a90;
                      border-radius:10px;cursor:pointer;font-weight:700;font-size:0.95em;">
                ☐ PRONTO
              </button>
              <button id="lb-copy-invite" style="flex:0 0 auto;padding:13px 16px;
                      background:rgba(120,180,255,0.18);color:#cef;
                      border:1px solid rgba(120,180,255,0.45);border-radius:10px;
                      cursor:pointer;font-weight:600;font-size:0.9em;">
                🔗 link
              </button>
              <button id="lb-start" disabled style="flex:2;min-width:160px;padding:13px;
                      background:linear-gradient(135deg,#3aa05c,#1e6f3a);
                      color:#fff;border:none;border-radius:10px;
                      cursor:pointer;font-weight:900;letter-spacing:1.5px;font-size:1em;
                      box-shadow:0 4px 18px rgba(58,160,92,0.30);opacity:0.5;">
                ▶ INICIAR PARTIDA
              </button>
            </div>
          </div>
        </main>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#lb-close').onclick = () => this._doExit();
    el.querySelector('#lb-refresh').onclick = () => this._loadRooms();
    el.querySelector('#lb-create').onclick = () => this._openCreate();
    el.querySelector('#lb-chat-send').onclick = () => this._sendChat();
    el.querySelector('#lb-chat-input').onkeydown = (e) => { if (e.key === 'Enter') this._sendChat(); };
    el.querySelector('#lb-ready').onclick = () => this._toggleReady();
    el.querySelector('#lb-start').onclick = () => this.cs.sendStartMatch();
    el.querySelector('#lb-copy-invite').onclick = () => this._copyInvite();
  }

  async _loadRooms() {
    try {
      await this.cs.subscribeLobby((rooms) => {
        this._renderRoomsList(rooms);
        this._setStatus(`${rooms.length} sala(s)`, '#7efa9a');
      });
    } catch (e) {
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  _renderRoomsList(rooms) {
    const list = this._el.querySelector('#lb-rooms-list');
    if (!rooms.length) {
      list.innerHTML = '<div style="color:#789;font-size:0.85em;text-align:center;padding:20px;">nenhuma sala aberta</div>';
      return;
    }
    list.innerHTML = '';
    for (const r of rooms) {
      const row = document.createElement('div');
      const isCurrent = (this.cs.room?.id === r.roomId);
      row.style.cssText = `
        background: ${isCurrent ? 'rgba(92,204,255,0.18)' : 'rgba(15,25,50,0.5)'};
        border: 1px solid ${isCurrent ? '#5cf' : 'rgba(120,180,255,0.18)'};
        padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: .15s;
      `;
      const meta = r.metadata || {};
      const mapInfo = Object.values(MapCatalog).find((m) => m.id === meta.map);
      const mapName = mapInfo?.name || meta.map || 'default';
      const name = meta.name || ('Sala ' + r.roomId.slice(0, 6));
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">
            ${_esc(name)}
            ${meta.has_password ? '<span style="color:#ffcc00;font-size:0.8em;margin-left:4px;">🔒</span>' : ''}
          </div>
          <div style="font-size:0.78em;color:#7efa9a;font-weight:700;">${r.clients}/${r.maxClients}</div>
        </div>
        <div style="font-size:0.72em;color:#789;margin-top:3px;">${_esc(mapName)}</div>
      `;
      row.onclick = () => this._joinRoom(r);
      row.onmouseenter = () => { if (!isCurrent) row.style.background = 'rgba(120,180,255,0.10)'; };
      row.onmouseleave = () => { if (!isCurrent) row.style.background = 'rgba(15,25,50,0.5)'; };
      list.appendChild(row);
    }
  }

  async _joinRoom(roomInfo) {
    if (this.cs.room?.id === roomInfo.roomId) return;
    if (this.cs.room) { try { await this.cs.leave(); } catch (_) {} }
    let password = null;
    if (roomInfo.metadata?.has_password) {
      password = prompt('Senha da sala:');
      if (password == null) return;
    }
    try {
      const session = await this.auth.getSupabase().auth.getSession();
      const token = session.data?.session?.access_token;
      const avatarUrl = this.auth.profile?.avatar_url || this.auth.user?.user_metadata?.avatar_url || '';
      this.cs.setPlayerId(this.auth.getUserId());
      await this.cs.joinRoomById({
        roomId: roomInfo.roomId,
        token, nickname: this.auth.getNickname(), avatar_url: avatarUrl, password,
      });
      this._refreshRoomView();
      this._setStatus('entrou em ' + (roomInfo.metadata?.name || 'sala'), '#7efa9a');
    } catch (e) {
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  async _openCreate() {
    const name = prompt('Nome da sala:', 'Sala de ' + this.auth.getNickname());
    if (!name) return;
    const maps = Object.entries(MapCatalog);
    const list = maps.map(([k, v], i) => `${i + 1}. ${v.name}`).join('\n');
    const choice = prompt(`Mapa:\n${list}\n\nDigite o número:`, '1');
    const idx = Math.max(0, Math.min(maps.length - 1, parseInt(choice || '1') - 1));
    const map = maps[idx][1].id || 'default';
    const max = parseInt(prompt('Máximo de players (2-16):', '8')) || 8;

    try {
      if (this.cs.room) { try { await this.cs.leave(); } catch (_) {} }
      const session = await this.auth.getSupabase().auth.getSession();
      const token = session.data?.session?.access_token;
      const avatarUrl = this.auth.profile?.avatar_url || this.auth.user?.user_metadata?.avatar_url || '';
      this.cs.setPlayerId(this.auth.getUserId());
      await this.cs.createRoom({
        token, nickname: this.auth.getNickname(), avatar_url: avatarUrl,
        name, map, max_players: max, password: null,
      });
      this._refreshRoomView();
      this._setStatus('sala criada', '#7efa9a');
    } catch (e) {
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  _refreshRoomView() {
    if (!this.cs.room || !this.cs.state) {
      this._el.querySelector('#lb-empty').style.display = 'flex';
      this._el.querySelector('#lb-room').style.display = 'none';
      return;
    }
    this._el.querySelector('#lb-empty').style.display = 'none';
    this._el.querySelector('#lb-room').style.display = 'flex';

    const meta = this.cs.room.metadata || {};
    const mapInfo = Object.values(MapCatalog).find((m) => m.id === this.cs.state.map_id);
    this._el.querySelector('#lb-room-title').textContent = meta.name || 'Sala';
    const playersCount = this.cs.state.players?.size || 0;
    this._el.querySelector('#lb-room-meta').textContent =
      `${mapInfo?.name || this.cs.state.map_id} · ${playersCount}/${this.cs.room.maxClients || '?'} players`;
    this._el.querySelector('#lb-room-name').textContent = '· em: ' + (meta.name || 'sala');

    const myId = this.auth.getUserId();
    const playersDiv = this._el.querySelector('#lb-players');
    playersDiv.innerHTML = '';
    let allReady = true;
    let amHost = false;
    this.cs.state.players.forEach((p) => {
      if (!p.is_ready) allReady = false;
      if (p.id === myId && p.is_host) amHost = true;
      const isMe = p.id === myId;
      const row = document.createElement('div');
      row.style.cssText = `
        padding:5px 7px;background:rgba(120,180,255,0.08);border-radius:5px;
        font-size:0.85em;color:${isMe ? '#7efa9a' : '#cdd'};
        display:flex;align-items:center;gap:6px;
        ${p.is_host ? 'border-left:3px solid #ffcc00;' : ''}
      `;
      const readyIcon = p.is_ready ? '<span style="color:#7efa9a;">✓</span>' : '<span style="color:#666;">☐</span>';
      const pvpIcon = p.pvp_on ? ' <span style="color:#ff5050;" title="PvP ON">⚔</span>' : '';
      const hostBadge = p.is_host ? ' <span style="color:#ffcc00;font-size:0.85em;">[host]</span>' : '';
      const meBadge = isMe ? ' <span style="color:#7efa9a;font-size:0.85em;">(você)</span>' : '';
      row.innerHTML = `${readyIcon} ${_esc(p.nickname || 'player')}${hostBadge}${meBadge}${pvpIcon}`;
      playersDiv.appendChild(row);
    });

    // Atualiza botão Ready do próprio player
    const me = this.cs.state.players.get(myId);
    const readyBtn = this._el.querySelector('#lb-ready');
    if (me) {
      if (me.is_ready) {
        readyBtn.innerHTML = '✓ PRONTO';
        readyBtn.style.background = 'linear-gradient(135deg,#3aa05c,#1e6f3a)';
        readyBtn.style.borderColor = '#5fcc88';
      } else {
        readyBtn.innerHTML = '☐ MARCAR PRONTO';
        readyBtn.style.background = '#2a3a55';
        readyBtn.style.borderColor = '#4a6a90';
      }
    }

    // Botão Iniciar libera se host E todos prontos
    const startBtn = this._el.querySelector('#lb-start');
    const canStart = amHost && allReady && playersCount >= 1;
    startBtn.disabled = !canStart;
    startBtn.style.opacity = canStart ? '1' : '0.4';
    startBtn.style.cursor = canStart ? 'pointer' : 'not-allowed';
    if (!amHost) startBtn.textContent = '⏳ AGUARDANDO HOST';
    else if (!allReady) startBtn.textContent = '⏳ AGUARDANDO PRONTOS';
    else startBtn.textContent = '▶ INICIAR PARTIDA';
  }

  _toggleReady() {
    if (!this.cs.room) return;
    const me = this.cs.state.players.get(this.auth.getUserId());
    if (!me) return;
    this.cs.sendReady(!me.is_ready);
  }

  _sendChat() {
    const input = this._el.querySelector('#lb-chat-input');
    const msg = input.value.trim();
    if (!msg || !this.cs.room) return;
    input.value = '';
    this.cs.sendChat(msg);
  }

  _appendChat(m) {
    const chat = this._el.querySelector('#lb-chat');
    if (!chat) return;
    const div = document.createElement('div');
    const isMe = m.from === this.auth.getUserId();
    div.style.cssText = `padding:2px 0;color:${isMe ? '#7efa9a' : '#cdd'};`;
    div.innerHTML = `<b style="color:${isMe ? '#7efa9a' : '#5cf'};">${_esc(m.nick || 'player')}:</b> ${_esc(m.msg)}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  async _copyInvite() {
    if (!this.cs.room) return;
    const url = window.location.origin + window.location.pathname + '?room=' + this.cs.room.id;
    try {
      await navigator.clipboard.writeText(url);
      this._setStatus('🔗 link copiado!', '#7efa9a');
    } catch (e) { prompt('Copie manualmente:', url); }
  }

  /** Match começou — fecha lobby e entra no jogo. */
  _onMatchStarted() {
    if (this._onEnterGame) this._onEnterGame(this.cs.room);
    this.hide();
  }

  async checkInviteLink() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (!roomId) return false;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    this.show();
    await this._joinRoom({ roomId, metadata: {} });
    return true;
  }

  async _doExit() {
    if (this.cs.room) {
      try { await this.cs.leave(); } catch (_) {}
    }
    this.hide();
  }

  _setStatus(text, color = '#789') {
    const el = this._el?.querySelector('#lb-status');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  onEnterGame(cb) { this._onEnterGame = cb; }

  show() {
    if (!this.auth.isAuthenticated() || this.auth.isGuest()) {
      alert('Multiplayer requer login Google.');
      return;
    }
    this._visible = true;
    this._el.style.display = 'flex';
    this._loadRooms();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      if (!this.cs.room) this._loadRooms();
    }, 3000);
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  }
}
