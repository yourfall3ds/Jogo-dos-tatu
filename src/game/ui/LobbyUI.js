// ─────────────────────────────────────────────────────────────────
//  LobbyUI — lista salas, criar, entrar, chat in-lobby
//
//  Salas vêm da view public.transfps_rooms_listing (Supabase).
//  Criar/entrar/sair = RPC. Refresh manual + polling 4s.
// ─────────────────────────────────────────────────────────────────

import { MapCatalog } from '../scene/ChibataMapLoader.js';

export class LobbyUI {
  constructor(authSystem, multiplayerClient) {
    this.auth = authSystem;
    this.mp = multiplayerClient;
    this._visible = false;
    this.currentRoom = null;
    this._refreshTimer = null;
    this._onEnterGame = null;
    this._build();
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
      <header style="display:flex; align-items:center; justify-content:space-between;
                     padding:14px 24px; border-bottom:1px solid rgba(120,180,255,0.25);
                     background:rgba(10,15,30,0.7);">
        <div style="display:flex; align-items:center; gap:14px;">
          <span style="font-size:1.4em; font-weight:900; letter-spacing:2px; color:#5cf;">🌐 LOBBY</span>
          <span id="lb-room-name" style="color:#888; font-size:0.9em;"></span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <span id="lb-status" style="font-size:0.78em; color:#789;">—</span>
          <button id="lb-close" style="background:transparent; border:1px solid rgba(255,90,106,0.35);
                  color:#ff7a8a; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:0.85em;">
            ✕ sair
          </button>
        </div>
      </header>

      <div style="flex:1; display:flex; gap:14px; padding:14px; min-height:0;">

        <!-- Coluna esquerda: lista de salas / criar -->
        <aside style="flex:0 0 320px; display:flex; flex-direction:column; gap:10px;
                      background:rgba(15,20,40,0.65); border-radius:12px;
                      border:1px solid rgba(120,180,255,0.18); padding:12px;">
          <div style="display:flex; gap:6px;">
            <button id="lb-refresh" style="flex:1; background:#1e3a6f; color:#cef;
                    border:1px solid #3a5ca0; padding:8px; border-radius:6px;
                    cursor:pointer; font-size:0.85em;">↻ atualizar</button>
            <button id="lb-create" style="flex:1; background:#1e6f3a; color:#cfa;
                    border:1px solid #3aa05c; padding:8px; border-radius:6px;
                    cursor:pointer; font-size:0.85em;">＋ criar</button>
          </div>
          <div id="lb-rooms-list" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
            <div style="color:#789; font-size:0.85em; text-align:center; padding:20px;">carregando…</div>
          </div>
        </aside>

        <!-- Painel central: detalhes / sala atual / chat -->
        <main style="flex:1; display:flex; flex-direction:column; gap:10px; min-width:0;">

          <!-- Modo: NENHUMA sala selecionada -->
          <div id="lb-empty" style="flex:1; display:flex; align-items:center; justify-content:center;
                                    background:rgba(15,20,40,0.45); border-radius:12px;
                                    border:1px dashed rgba(120,180,255,0.20); color:#789;
                                    font-size:0.92em; text-align:center; padding:30px;">
            selecione uma sala à esquerda<br>ou crie a sua
          </div>

          <!-- Modo: EM SALA -->
          <div id="lb-room" style="display:none; flex:1; flex-direction:column; gap:10px; min-height:0;">
            <div style="background:rgba(15,20,40,0.65); padding:12px 16px;
                        border-radius:10px; border:1px solid rgba(120,180,255,0.18);">
              <div style="font-size:0.7em; color:#789; letter-spacing:1.5px;">SALA</div>
              <div id="lb-room-title" style="font-size:1.3em; font-weight:700; color:#5cf;">—</div>
              <div id="lb-room-meta" style="font-size:0.78em; color:#9aa; margin-top:3px;">—</div>
            </div>

            <div style="display:flex; gap:10px; flex:1; min-height:0;">

              <!-- Players na sala -->
              <div style="flex:0 0 220px; background:rgba(15,20,40,0.65);
                          border-radius:10px; border:1px solid rgba(120,180,255,0.18);
                          padding:10px; display:flex; flex-direction:column; gap:6px;">
                <div style="font-size:0.7em; color:#789; letter-spacing:1.5px;">PLAYERS</div>
                <div id="lb-players" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px;"></div>
              </div>

              <!-- Chat -->
              <div style="flex:1; display:flex; flex-direction:column; gap:6px;
                          background:rgba(15,20,40,0.65); border-radius:10px;
                          border:1px solid rgba(120,180,255,0.18); padding:10px; min-width:0;">
                <div style="font-size:0.7em; color:#789; letter-spacing:1.5px;">CHAT</div>
                <div id="lb-chat" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;
                                         gap:3px; font-size:0.85em; padding-right:4px;"></div>
                <div style="display:flex; gap:6px;">
                  <input id="lb-chat-input" type="text" maxlength="500" placeholder="digite…"
                         style="flex:1; padding:8px 12px; background:#0a0f1c;
                                border:1px solid rgba(120,180,255,0.25); color:#fff;
                                border-radius:6px; font-family:inherit; font-size:0.9em;" />
                  <button id="lb-chat-send" style="background:#1e3a6f; color:#cef;
                          border:1px solid #3a5ca0; padding:8px 14px; border-radius:6px;
                          cursor:pointer;">enviar</button>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:8px;">
              <button id="lb-copy-invite" style="flex:0 0 auto; padding:13px 18px;
                      background:rgba(120,180,255,0.18); color:#cef;
                      border:1px solid rgba(120,180,255,0.45); border-radius:10px;
                      cursor:pointer; font-weight:700; font-size:0.95em;">
                🔗 copiar link
              </button>
              <button id="lb-enter-game" style="flex:1; padding:13px; background:linear-gradient(135deg,#3aa05c,#1e6f3a);
                      color:#fff; border:none; border-radius:10px; cursor:pointer;
                      font-weight:900; letter-spacing:1.5px; font-size:1em;
                      box-shadow:0 4px 18px rgba(58,160,92,0.30);">
                ▶ ENTRAR NA PARTIDA
              </button>
            </div>
          </div>
        </main>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#lb-close').onclick   = () => this._doExit();
    el.querySelector('#lb-refresh').onclick = () => this._loadRooms();
    el.querySelector('#lb-create').onclick  = () => this._openCreate();
    el.querySelector('#lb-chat-send').onclick = () => this._sendChat();
    el.querySelector('#lb-chat-input').onkeydown = (e) => {
      if (e.key === 'Enter') this._sendChat();
    };
    el.querySelector('#lb-enter-game').onclick = () => this._enterGame();
    el.querySelector('#lb-copy-invite').onclick = () => this._copyInvite();
  }

  async _loadRooms() {
    const supabase = this.auth.getSupabase();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('transfps_rooms_listing')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      this._setStatus('erro: ' + error.message, '#f55');
      return;
    }
    this._renderRoomsList(data || []);
    this._setStatus(`${(data || []).length} sala(s)`, '#7efa9a');
  }

  _renderRoomsList(rooms) {
    const list = this._el.querySelector('#lb-rooms-list');
    if (!rooms.length) {
      list.innerHTML = '<div style="color:#789; font-size:0.85em; text-align:center; padding:20px;">nenhuma sala aberta</div>';
      return;
    }
    list.innerHTML = '';
    for (const r of rooms) {
      const row = document.createElement('div');
      const isCurrent = (this.currentRoom?.id === r.id);
      row.style.cssText = `
        background: ${isCurrent ? 'rgba(92,204,255,0.18)' : 'rgba(15,25,50,0.5)'};
        border: 1px solid ${isCurrent ? '#5cf' : 'rgba(120,180,255,0.18)'};
        padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: .15s;
      `;
      const mapInfo = Object.values(MapCatalog).find(m => m.id === r.map);
      const mapName = mapInfo?.name || r.map;
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
            ${this._esc(r.name)}
            ${r.has_password ? '<span style="color:#ffcc00; font-size:0.8em; margin-left:4px;">🔒</span>' : ''}
          </div>
          <div style="font-size:0.78em; color:#7efa9a; font-weight:700;">${r.player_count}/${r.max_players}</div>
        </div>
        <div style="font-size:0.72em; color:#789; margin-top:3px;">${this._esc(mapName)} · ${r.status}</div>
      `;
      row.onclick = () => this._joinRoom(r);
      row.onmouseenter = () => { if (!isCurrent) row.style.background = 'rgba(120,180,255,0.10)'; };
      row.onmouseleave = () => { if (!isCurrent) row.style.background = 'rgba(15,25,50,0.5)'; };
      list.appendChild(row);
    }
  }

  async _joinRoom(room) {
    if (this.currentRoom?.id === room.id) return;
    let password = null;
    if (room.has_password) {
      password = prompt(`Senha da sala "${room.name}":`);
      if (password == null) return;
    }
    const supabase = this.auth.getSupabase();
    const { data, error } = await supabase.rpc('transfps_join_room', {
      p_room_id: room.id,
      p_password: password,
    });
    if (error || data === false) {
      this._setStatus('erro: ' + (error?.message || 'sala cheia/fechada/senha errada'), '#f55');
      return;
    }
    this.currentRoom = room;
    await this._loadRoomDetails();
    await this._loadChat();
    this._subscribeRealtime(room.id);
    this._setStatus(`entrou em ${room.name}`, '#7efa9a');
  }

  /** Verifica se a URL tem ?room=UUID e auto-entra. */
  async checkInviteLink() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (!roomId) return false;
    // Limpa o param da URL pra não disparar de novo no refresh
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    const supabase = this.auth.getSupabase();
    const { data } = await supabase
      .from('transfps_rooms_listing')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();
    if (!data) {
      alert('Sala não encontrada ou já fechada.');
      return false;
    }
    this.show();
    await this._joinRoom(data);
    return true;
  }

  /** Copia o link de convite pra clipboard. */
  async _copyInvite() {
    if (!this.currentRoom) return;
    const url = window.location.origin + window.location.pathname + '?room=' + this.currentRoom.id;
    try {
      await navigator.clipboard.writeText(url);
      this._setStatus('🔗 link copiado!', '#7efa9a');
    } catch (e) {
      prompt('Copie o link manualmente:', url);
    }
  }

  async _loadRoomDetails() {
    if (!this.currentRoom) return;
    const supabase = this.auth.getSupabase();
    // Player count via RPC simples: re-fetch from view
    const { data } = await supabase
      .from('transfps_rooms_listing')
      .select('*')
      .eq('id', this.currentRoom.id)
      .maybeSingle();
    if (data) this.currentRoom = data;

    this._el.querySelector('#lb-empty').style.display = 'none';
    const roomDiv = this._el.querySelector('#lb-room');
    roomDiv.style.display = 'flex';

    this._el.querySelector('#lb-room-title').textContent = this.currentRoom.name;
    const mapInfo = Object.values(MapCatalog).find(m => m.id === this.currentRoom.map);
    const mapName = mapInfo?.name || this.currentRoom.map;
    this._el.querySelector('#lb-room-meta').textContent =
      `${mapName} · ${this.currentRoom.player_count}/${this.currentRoom.max_players} players · ${this.currentRoom.status}`;
    this._el.querySelector('#lb-room-name').textContent = '· em: ' + this.currentRoom.name;

    // Lista de players via room_players direto
    const { data: rp } = await supabase
      .from('transfps_room_players_v') // requires view (see DB section below or fallback)
      .select('*')
      .eq('room_id', this.currentRoom.id)
      .catch(() => ({ data: null }));
    // Fallback: usa só o player atual
    const playersDiv = this._el.querySelector('#lb-players');
    if (!rp || !Array.isArray(rp)) {
      playersDiv.innerHTML = `<div style="color:#7efa9a; padding:4px;">${this._esc(this.auth.getNickname())} (você)</div>`;
    } else {
      playersDiv.innerHTML = rp.map(p => `
        <div style="padding:4px 6px; background:rgba(120,180,255,0.08); border-radius:4px;
                    font-size:0.85em; color:${p.player_id === this.auth.getUserId() ? '#7efa9a' : '#cdd'};">
          ${this._esc(p.nickname || 'player')}
          ${p.player_id === this.auth.getUserId() ? ' <span style="color:#7efa9a;">(você)</span>' : ''}
        </div>
      `).join('');
    }
  }

  async _loadChat() {
    if (!this.currentRoom) return;
    const supabase = this.auth.getSupabase();
    const { data, error } = await supabase
      .from('chat_messages_v') // fallback abaixo
      .select('*')
      .eq('room_id', this.currentRoom.id)
      .order('created_at', { ascending: true })
      .limit(50)
      .catch(() => ({ data: null }));
    const chat = this._el.querySelector('#lb-chat');
    chat.innerHTML = '';
    if (Array.isArray(data)) {
      for (const m of data) this._appendChat(m);
    }
  }

  _subscribeRealtime(roomId) {
    const supabase = this.auth.getSupabase();
    if (this._chatChannel) supabase.removeChannel(this._chatChannel);
    this._chatChannel = supabase
      .channel(`chat:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'transfps', table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        this._appendChat(payload.new);
      })
      .on('postgres_changes', {
        event: '*', schema: 'transfps', table: 'room_players',
        filter: `room_id=eq.${roomId}`,
      }, () => {
        this._loadRoomDetails();
      })
      .subscribe();
  }

  _appendChat(m) {
    const chat = this._el.querySelector('#lb-chat');
    const div = document.createElement('div');
    const isMe = m.player_id === this.auth.getUserId();
    div.style.cssText = `padding:2px 0; color:${isMe ? '#7efa9a' : '#cdd'};`;
    div.innerHTML = `<b style="color:${isMe ? '#7efa9a' : '#5cf'};">${this._esc(m.nickname || 'player')}:</b> ${this._esc(m.message)}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  async _sendChat() {
    const input = this._el.querySelector('#lb-chat-input');
    const msg = input.value.trim();
    if (!msg || !this.currentRoom) return;
    input.value = '';
    const supabase = this.auth.getSupabase();
    const { error } = await supabase.rpc('transfps_send_chat', {
      p_room_id: this.currentRoom.id,
      p_message: msg,
    });
    if (error) this._setStatus('chat erro: ' + error.message, '#f55');
  }

  async _openCreate() {
    const name = prompt('Nome da sala:', `Sala de ${this.auth.getNickname()}`);
    if (!name) return;
    const maps = Object.entries(MapCatalog);
    const mapsList = maps.map(([k, v], i) => `${i + 1}. ${v.name}`).join('\n');
    const choice = prompt(`Mapa:\n${mapsList}\n\nDigite o número (ou Enter pra padrão):`, '1');
    const idx = Math.max(0, Math.min(maps.length - 1, parseInt(choice || '1') - 1));
    const map = maps[idx][1].id || 'default';
    const max = parseInt(prompt('Máximo de players (2-16):', '8')) || 8;

    const supabase = this.auth.getSupabase();
    const { data, error } = await supabase.rpc('transfps_create_room', {
      p_name: name,
      p_map: map,
      p_max_players: max,
      p_is_public: true,
      p_password: null,
    });
    if (error) { this._setStatus('erro: ' + error.message, '#f55'); return; }
    // Re-fetch e seleciona
    await this._loadRooms();
    const fresh = await supabase
      .from('transfps_rooms_listing')
      .select('*')
      .eq('id', data)
      .maybeSingle();
    if (fresh.data) await this._joinRoom(fresh.data);
  }

  _enterGame() {
    if (!this.currentRoom) return;
    if (this._onEnterGame) this._onEnterGame(this.currentRoom);
    this.hide();
  }

  async _doExit() {
    if (this.currentRoom) {
      const supabase = this.auth.getSupabase();
      await supabase.rpc('transfps_leave_room', { p_room_id: this.currentRoom.id });
      if (this._chatChannel) supabase.removeChannel(this._chatChannel);
      this.currentRoom = null;
    }
    this.hide();
  }

  _setStatus(text, color = '#789') {
    const el = this._el?.querySelector('#lb-status');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    this._refreshTimer = setInterval(() => {
      if (!this.currentRoom) this._loadRooms();
    }, 4000);
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  }
}
