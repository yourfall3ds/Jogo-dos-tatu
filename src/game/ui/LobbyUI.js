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

function _esc(s) {
  if (s == null) throw new Error('[_esc] valor null/undefined — dado server-side faltando');
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
    el.querySelector('#lb-start').onclick = () => {
      const btn = el.querySelector('#lb-start');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.dataset._origText = btn.textContent;
      btn.textContent = '⏳ INICIANDO…';
      btn.style.opacity = '0.7';
      this.cs.sendStartMatch();
      // Watchdog: server tem 5s pra emitir countdown. Timeout = erro vermelho.
      setTimeout(() => {
        if (btn.disabled && btn.textContent.includes('INICIANDO')) {
          console.error('[Lobby] server timeout em sendStartMatch (5s)');
          btn.textContent = btn.dataset._origText || '▶ INICIAR PARTIDA';
          btn.disabled = false;
          btn.style.opacity = '1';
          this._setStatus('erro: servidor nao respondeu, recarregue a pagina', '#f55');
        }
      }, 5000);
    };
    el.querySelector('#lb-copy-invite').onclick = () => this._copyInvite();
    // Quando o COUNTDOWN começa, esconde lobby (CountdownScreen mostra)
    this.cs.on('match_countdown', () => { this.hide(); });
  }

  async _loadRooms() {
    try {
      await this.cs.subscribeLobby((rooms) => {
        this._renderRoomsList(rooms);
        this._setStatus(`${rooms.length} sala(s)`, '#7efa9a');
      });
    } catch (e) {
      console.error('[Lobby] subscribeLobby:', e);
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
      if (!r.metadata) throw new Error('[Lobby] sala sem metadata: ' + r.roomId);
      const meta = r.metadata;
      if (!meta.map) throw new Error('[Lobby] sala sem map em metadata: ' + r.roomId);
      const mapInfo = Object.values(MapCatalog).find((m) => m.id === meta.map);
      if (!mapInfo) throw new Error('[Lobby] mapa desconhecido em sala ' + r.roomId + ': ' + meta.map);
      if (!meta.name) throw new Error('[Lobby] sala sem name: ' + r.roomId);
      const mapName = mapInfo.name;
      const name = meta.name;
      const modeIcon = meta.mode === 'BATTLE_ROYALE'
        ? '<span style="color:#ffd54a;background:rgba(255,213,74,0.15);padding:1px 6px;border-radius:3px;font-size:0.65em;margin-left:4px;letter-spacing:1px;">BR</span>'
        : '';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">
            ${_esc(name)}${modeIcon}
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
    if (this.cs.room) {
      try { await this.cs.leave(); }
      catch (e) { console.error('[Lobby] _joinRoom leave atual:', e); }
    }
    let password = null;
    if (roomInfo.metadata?.has_password) {
      password = await this._showPasswordModal();
      if (password == null) return;
    }
    try {
      const session = await this.auth.getSupabase().auth.getSession();
      const token = session.data?.session?.access_token;
      const avatarUrl = this.auth.profile?.avatar_url ?? this.auth.user?.user_metadata?.avatar_url ?? null;
      this.cs.setPlayerId(this.auth.getUserId());
      await this.cs.joinRoomById({
        roomId: roomInfo.roomId,
        token, nickname: this.auth.getNickname(), avatar_url: avatarUrl, password,
      });
      this._refreshRoomView();
      this._setStatus('entrou em ' + (roomInfo.metadata?.name || 'sala'), '#7efa9a');
    } catch (e) {
      console.error('[Lobby] joinRoom:', e);
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  _showPasswordModal() {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position:fixed; inset:0; z-index:500; background:rgba(0,0,0,0.85);
        display:flex; align-items:center; justify-content:center;
        color:#dff5ff; font-family:'Segoe UI',monospace;
      `;
      modal.innerHTML = `
        <div style="background:linear-gradient(180deg,#0a1a2a,#040810);
                    border:1px solid rgba(126,239,196,0.5); border-radius:10px;
                    padding:30px; width:420px; max-width:92vw;">
          <div style="font:900 16px monospace; letter-spacing:3px; color:#2effb6; margin-bottom:14px;">
            🔒 SENHA DA SALA
          </div>
          <input id="pw-input" type="password" maxlength="60" placeholder="senha"
                 style="width:100%; padding:10px 14px; background:rgba(0,0,0,0.6);
                        border:1px solid rgba(126,239,196,0.3); color:#fff;
                        border-radius:5px; font:inherit; margin-bottom:16px;">
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="pw-cancel" style="background:transparent; color:#fff;
                    border:1px solid rgba(255,255,255,0.2); padding:9px 22px;
                    border-radius:5px; cursor:pointer; font:700 12px monospace;
                    letter-spacing:2px;">CANCELAR</button>
            <button id="pw-ok" style="background:#2effb6; color:#04101a; border:0;
                    padding:9px 26px; border-radius:5px; cursor:pointer;
                    font:800 12px monospace; letter-spacing:2px;">ENTRAR</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const input = modal.querySelector('#pw-input');
      input.focus();
      const close = (val) => { modal.remove(); resolve(val); };
      modal.querySelector('#pw-cancel').onclick = () => close(null);
      modal.querySelector('#pw-ok').onclick = () => close(input.value);
      input.onkeydown = (e) => { if (e.key === 'Enter') close(input.value); };
    });
  }

  async _openCreate() {
    // Modal estilizado em vez de prompt() nativo
    const config = await this._showCreateModal();
    if (!config) return;
    try {
      if (this.cs.room) {
        try { await this.cs.leave(); }
        catch (e) { console.error('[Lobby] _openCreate leave:', e); }
      }
      const session = await this.auth.getSupabase().auth.getSession();
      const token = session.data?.session?.access_token;
      const avatarUrl = this.auth.profile?.avatar_url ?? this.auth.user?.user_metadata?.avatar_url ?? null;
      this.cs.setPlayerId(this.auth.getUserId());
      await this.cs.createRoom({
        token, nickname: this.auth.getNickname(), avatar_url: avatarUrl,
        name: config.name, map: config.map, max_players: config.max,
        password: null, mode: config.mode,
      });
      this._refreshRoomView();
      this._setStatus(`sala criada (${config.mode})`, '#7efa9a');
    } catch (e) {
      console.error('[Lobby] _openCreate:', e);
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  _showCreateModal() {
    return new Promise(resolve => {
      const maps = Object.entries(MapCatalog);
      const modal = document.createElement('div');
      modal.style.cssText = `
        position:fixed; inset:0; z-index:500; background:rgba(0,0,0,0.85);
        display:flex; align-items:center; justify-content:center;
        color:#dff5ff; font-family:'Segoe UI',monospace;
      `;
      modal.innerHTML = `
        <div style="background:linear-gradient(180deg,#0a1a2a,#040810);
                    border:1px solid rgba(126,239,196,0.5); border-radius:10px;
                    padding:30px; width:520px; max-width:92vw;">
          <div style="font:900 18px monospace; letter-spacing:3px; color:#2effb6; margin-bottom:18px;">
            ＋ CRIAR SALA
          </div>
          <label style="display:block; font:700 11px monospace; opacity:0.6; letter-spacing:2px; margin-bottom:5px;">NOME</label>
          <input id="cr-name" value="Sala de ${this.auth.getNickname()}" maxlength="40"
                 style="width:100%; padding:9px 12px; background:rgba(0,0,0,0.6); border:1px solid rgba(126,239,196,0.3);
                        color:#fff; border-radius:5px; font:inherit; margin-bottom:14px;">

          <label style="display:block; font:700 11px monospace; opacity:0.6; letter-spacing:2px; margin-bottom:5px;">MODO</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
            <div data-mode="CLASSIC" class="mode-opt sel" style="
              background:rgba(46,255,182,0.15); border:1px solid #2effb6; border-radius:5px;
              padding:10px 12px; cursor:pointer; text-align:center;">
              <div style="font:900 14px monospace;">⚔ CLASSIC</div>
              <div style="font:600 10px monospace; opacity:0.7;">PvE + Boss</div>
            </div>
            <div data-mode="BATTLE_ROYALE" class="mode-opt" style="
              background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); border-radius:5px;
              padding:10px 12px; cursor:pointer; text-align:center;">
              <div style="font:900 14px monospace;">🪂 BATTLE ROYALE</div>
              <div style="font:600 10px monospace; opacity:0.7;">queda + zona + último vivo</div>
            </div>
          </div>

          <label style="display:block; font:700 11px monospace; opacity:0.6; letter-spacing:2px; margin-bottom:5px;">MAPA</label>
          <select id="cr-map" style="
            width:100%; padding:9px 12px; background:rgba(0,0,0,0.6); border:1px solid rgba(126,239,196,0.3);
            color:#fff; border-radius:5px; font:inherit; margin-bottom:14px;">
            ${maps.map(([k, v]) => `<option value="${v.id || 'default'}">${v.name}</option>`).join('')}
          </select>

          <label style="display:block; font:700 11px monospace; opacity:0.6; letter-spacing:2px; margin-bottom:5px;">MÁX PLAYERS</label>
          <input id="cr-max" type="number" min="2" max="60" value="8"
                 style="width:100%; padding:9px 12px; background:rgba(0,0,0,0.6); border:1px solid rgba(126,239,196,0.3);
                        color:#fff; border-radius:5px; font:inherit; margin-bottom:20px;">

          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="cr-cancel" style="background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.2);
                    padding:9px 22px; border-radius:5px; cursor:pointer; font:700 12px monospace; letter-spacing:2px;">CANCELAR</button>
            <button id="cr-ok" style="background:#2effb6; color:#04101a; border:0;
                    padding:9px 26px; border-radius:5px; cursor:pointer; font:800 12px monospace; letter-spacing:2px;">CRIAR</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      let mode = 'CLASSIC';
      modal.querySelectorAll('.mode-opt').forEach(opt => {
        opt.onclick = () => {
          mode = opt.getAttribute('data-mode');
          modal.querySelectorAll('.mode-opt').forEach(o => {
            o.style.background = 'rgba(0,0,0,0.4)';
            o.style.border = '1px solid rgba(255,255,255,0.1)';
          });
          opt.style.background = 'rgba(46,255,182,0.15)';
          opt.style.border = '1px solid #2effb6';
          // BR sugere mapa "spaceStation" e max alto
          if (mode === 'BATTLE_ROYALE') {
            modal.querySelector('#cr-map').value = 'spaceStation';
            const maxEl = modal.querySelector('#cr-max');
            if (parseInt(maxEl.value) < 16) maxEl.value = 16;
          }
        };
      });
      modal.querySelector('#cr-cancel').onclick = () => { modal.remove(); resolve(null); };
      modal.querySelector('#cr-ok').onclick = () => {
        const nameEl = modal.querySelector('#cr-name');
        const maxEl = modal.querySelector('#cr-max');
        const name = nameEl.value.trim();
        const map = modal.querySelector('#cr-map').value;
        const maxParsed = parseInt(maxEl.value);
        // Validacao visivel: campo invalido fica vermelho, modal nao fecha.
        let invalid = false;
        nameEl.style.borderColor = 'rgba(126,239,196,0.3)';
        maxEl.style.borderColor = 'rgba(126,239,196,0.3)';
        if (!name) {
          nameEl.style.borderColor = '#f55';
          invalid = true;
        }
        if (!Number.isFinite(maxParsed) || maxParsed < 2 || maxParsed > 60) {
          maxEl.style.borderColor = '#f55';
          invalid = true;
        }
        if (!map) {
          console.error('[CreateModal] map vazio — MapCatalog quebrado?');
          invalid = true;
        }
        if (invalid) return;
        modal.remove();
        resolve({ name, map, max: maxParsed, mode });
      };
    });
  }

  _refreshRoomView() {
    if (!this.cs.room || !this.cs.state) {
      this._el.querySelector('#lb-empty').style.display = 'flex';
      this._el.querySelector('#lb-room').style.display = 'none';
      return;
    }
    this._el.querySelector('#lb-empty').style.display = 'none';
    this._el.querySelector('#lb-room').style.display = 'flex';

    if (!this.cs.room.metadata) {
      console.error('[Lobby] _refreshRoomView: sala sem metadata');
      return;
    }
    const meta = this.cs.room.metadata;
    if (!meta.name) {
      console.error('[Lobby] _refreshRoomView: sala sem name em metadata');
      return;
    }
    if (!this.cs.state.map_id) {
      console.error('[Lobby] _refreshRoomView: state sem map_id');
      return;
    }
    const mapInfo = Object.values(MapCatalog).find((m) => m.id === this.cs.state.map_id);
    if (!mapInfo) {
      console.error('[Lobby] _refreshRoomView: mapa desconhecido:', this.cs.state.map_id);
      return;
    }
    if (this.cs.state.players?.size == null) {
      console.error('[Lobby] _refreshRoomView: state.players sem size');
      return;
    }
    if (!this.cs.room.maxClients) {
      console.error('[Lobby] _refreshRoomView: room sem maxClients');
      return;
    }
    this._el.querySelector('#lb-room-title').textContent = meta.name;
    const playersCount = this.cs.state.players.size;
    this._el.querySelector('#lb-room-meta').textContent =
      `${mapInfo.name} · ${playersCount}/${this.cs.room.maxClients} players`;
    this._el.querySelector('#lb-room-name').textContent = '· em: ' + meta.name;

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
      if (!p.nickname) throw new Error('[Lobby] player sem nickname no state: ' + p.id);
      row.innerHTML = `${readyIcon} ${_esc(p.nickname)}${hostBadge}${meBadge}${pvpIcon}`;
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
    if (!m.nick) throw new Error('[Chat] mensagem sem nick (from=' + m.from + ')');
    div.innerHTML = `<b style="color:${isMe ? '#7efa9a' : '#5cf'};">${_esc(m.nick)}:</b> ${_esc(m.msg)}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  async _copyInvite() {
    if (!this.cs.room) return;
    const url = window.location.origin + window.location.pathname + '?room=' + this.cs.room.id;
    try {
      await navigator.clipboard.writeText(url);
      this._setStatus('🔗 link copiado!', '#7efa9a');
    } catch (e) {
      console.error('[Lobby] clipboard:', e);
      this._setStatus('erro ao copiar link — veja console', '#f55');
    }
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
    // ── [Nav] LobbyUI._doExit → sai da sala (se houver) e roteia pro LoginScreen ──
    console.log('[Nav] saindo do LobbyUI → LoginScreen');

    // 1) Pre-condicao: auth precisa existir pra decidir rota
    if (!this.auth) {
      console.error('[Lobby] _doExit: auth ausente — abortando rota');
      return;
    }

    // 2) Cleanup: sai da sala se ainda dentro
    if (this.cs?.room) {
      try { await this.cs.leave(); }
      catch (e) { console.error('[MP] _doExit falha ao sair da sala:', e); return; }
    }

    // 3) Cleanup: esconde a UI do lobby
    this.hide();

    // 4) Transicao: sempre volta pra LoginScreen (estado anterior do lobby)
    try { window._loginScreen?.show?.(); }
    catch (e) { console.error('[Auth] _doExit falha ao mostrar LoginScreen:', e); return; }
    console.log('[Nav] entrou no LoginScreen');
  }

  _setStatus(text, color = '#789') {
    const el = this._el?.querySelector('#lb-status');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  onEnterGame(cb) { this._onEnterGame = cb; }

  show() {
    if (!this.auth.isAuthenticated()) {
      // Sem login Google → manda pra LoginScreen
      console.error('[Lobby] show() sem autenticacao — redirecionando pra login');
      try { window._loginScreen?.show?.(); }
      catch (e) { console.error('[Lobby] show LoginScreen:', e); throw e; }
      return;
    }
    this._visible = true;
    this._el.style.display = 'flex';
    this._loadRooms();
    // SEM setInterval: LobbyRoom do Colyseus já emite '+/-' em tempo real,
    // refresh manual é só pelo botão "↻ atualizar".
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  }
}
