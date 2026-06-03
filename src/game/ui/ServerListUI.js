// ─────────────────────────────────────────────────────────────────
//  ServerListUI — substitui a LobbyUI no fluxo do TransFPS.
//
//  Mostra lista de servidores PERSISTENTES (mode: OPEN_WORLD).
//  Click → loading screen → join direto → spawn do céu.
//
//  NÃO tem: criar sala, ready, chat lobby, painel de room.
//  É plug-and-play: pediu pra entrar, entra. Game On.
// ─────────────────────────────────────────────────────────────────
import { MapCatalog } from '../scene/ChibataMapLoader.js';

const REGION_LABEL = {
  BR: '🇧🇷 Brasil',
  US: '🇺🇸 EUA',
  EU: '🇪🇺 Europa',
};

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class ServerListUI {
  constructor(auth, colyseusClient) {
    this.auth = auth;
    this.cs = colyseusClient;
    this._visible = false;
    this._onEnterGame = null;
    this._servers = [];
    this._joining = false;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'server-list-ui';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 460;
      display: none; flex-direction: column;
      background: radial-gradient(ellipse at 50% 30%, #0a1230 0%, #050816 55%, #02030a 100%);
      color: #fff; font-family: 'Segoe UI', monospace;
    `;
    el.innerHTML = `
      <header style="display:flex;align-items:center;justify-content:space-between;
                     padding:14px 24px;border-bottom:1px solid rgba(120,180,255,0.25);
                     background:rgba(10,15,30,0.7);">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:1.6em;font-weight:900;letter-spacing:3px;
                       background:linear-gradient(180deg,#fff5cc,#ffcc00,#ff9a2c);
                       -webkit-background-clip:text;background-clip:text;color:transparent;
                       filter:drop-shadow(0 0 12px rgba(255,180,40,.5));">🪂 SERVIDORES</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <span id="sl-status" style="font-size:0.82em;color:#8aa;"></span>
          <button id="sl-refresh" style="background:#1e3a6f;color:#cef;border:1px solid #3a5ca0;
                  padding:7px 14px;border-radius:6px;cursor:pointer;font-size:0.85em;">↻ atualizar</button>
          <button id="sl-logout" style="background:transparent;border:1px solid rgba(255,90,106,0.35);
                  color:#ff7a8a;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:0.85em;">
            ✕ sair da conta
          </button>
        </div>
      </header>

      <div style="flex:1;display:flex;justify-content:center;padding:24px;overflow-y:auto;">
        <div style="width:100%;max-width:780px;">
          <div id="sl-list" style="display:flex;flex-direction:column;gap:10px;"></div>
          <div id="sl-empty" style="display:none;text-align:center;color:#789;padding:48px;font-size:0.95em;">
            nenhum servidor disponível agora<br>
            <span style="font-size:0.78em;opacity:0.7;">aguarde o BRASIL 1 ficar online…</span>
          </div>
        </div>
      </div>

      <div style="text-align:center;padding:14px;font-size:0.72em;color:#456;letter-spacing:2px;">
        TRANSFPS · ENTRE NUM SERVIDOR PRA CAIR DE CABEÇA NO MUNDO
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    el.querySelector('#sl-refresh').onclick = () => this._refreshNow();
    el.querySelector('#sl-logout').onclick = () => this._doLogout();
  }

  async show() {
    this._visible = true;
    this._el.style.display = 'flex';
    this._renderServers();
    this._setStatus('procurando servidores…');
    await this._startSubscription();
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
  }

  onEnterGame(cb) { this._onEnterGame = cb; }

  async _startSubscription() {
    try {
      await this.cs.subscribeLobby((rooms) => {
        this._servers = (rooms || []).filter(r => r.metadata?.mode === 'OPEN_WORLD');
        this._renderServers();
        this._setStatus(`${this._servers.length} servidor(es)`);
      });
    } catch (e) {
      console.error('[ServerList] subscribeLobby:', e);
      this._setStatus('erro: ' + e.message, '#f55');
    }
  }

  async _refreshNow() {
    this._setStatus('atualizando…');
    await this._startSubscription();
  }

  _setStatus(text, color = '#8aa') {
    const el = this._el?.querySelector('#sl-status');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  _renderServers() {
    const list = this._el.querySelector('#sl-list');
    const empty = this._el.querySelector('#sl-empty');
    if (!this._servers.length) {
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.style.display = 'flex';
    list.innerHTML = '';

    for (const r of this._servers) {
      const meta = r.metadata || {};
      const name = meta.name || 'Servidor';
      const region = REGION_LABEL[meta.region] || meta.region || '🌐 Online';
      const mapInfo = Object.values(MapCatalog).find(m => m.id === meta.map);
      const mapName = mapInfo?.name || meta.map || '—';
      const players = r.clients ?? 0;
      const max = r.maxClients ?? 50;
      const fullness = max ? players / max : 0;
      const dotColor = fullness >= 1 ? '#ff5a5a' : fullness >= 0.8 ? '#ffaa3a' : '#7efa9a';
      const cardBorder = fullness >= 1 ? 'rgba(255,90,90,0.4)' : 'rgba(120,180,255,0.25)';

      const row = document.createElement('div');
      row.style.cssText = `
        background:linear-gradient(180deg, rgba(15,25,55,0.7), rgba(8,15,35,0.7));
        border:1px solid ${cardBorder};
        border-radius:14px; padding:18px 22px; cursor:${fullness >= 1 ? 'not-allowed' : 'pointer'};
        transition: transform .15s, box-shadow .15s, border-color .15s;
        display:grid; grid-template-columns: 1fr auto; gap:14px; align-items:center;
        ${fullness >= 1 ? 'opacity:0.55;' : ''}
      `;
      row.innerHTML = `
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:9px;height:9px;border-radius:50%;background:${dotColor};
                         box-shadow:0 0 8px ${dotColor};"></span>
            <span style="font-weight:900;font-size:1.4em;color:#fff;letter-spacing:1.5px;">
              ${_esc(name)}
            </span>
            <span style="font-size:0.78em;color:#8aa;background:rgba(120,180,255,0.12);
                         padding:2px 8px;border-radius:4px;letter-spacing:1px;">
              ${_esc(region)}
            </span>
          </div>
          <div style="margin-top:8px;font-size:0.85em;color:#9ab;">
            mapa: <span style="color:#cef;">${_esc(mapName)}</span>
            &nbsp;·&nbsp; modo: <span style="color:#ffd54a;">OPEN WORLD</span>
            &nbsp;·&nbsp; respawn: <span style="color:#cef;">5s no céu</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div style="font-size:1.6em;font-weight:900;color:${dotColor};font-family:monospace;">
            ${players}<span style="color:#456;">/${max}</span>
          </div>
          <button class="sl-join-btn" style="
            padding:10px 26px;
            background:linear-gradient(135deg,#ffd84a,#ffaa2c);
            color:#1a1400;border:none;border-radius:8px;
            font-weight:900;font-size:0.95em;letter-spacing:2px;cursor:pointer;
            box-shadow:0 4px 14px rgba(255,170,40,.35);
            ${fullness >= 1 ? 'opacity:0.4;cursor:not-allowed;' : ''}
          ">▶ ENTRAR</button>
        </div>
      `;
      const btn = row.querySelector('.sl-join-btn');
      const doJoin = (ev) => {
        ev?.stopPropagation?.();
        if (this._joining || fullness >= 1) return;
        this._joinServer(r);
      };
      row.onclick = doJoin;
      btn.onclick = doJoin;
      row.onmouseenter = () => {
        if (fullness < 1) {
          row.style.transform = 'translateY(-2px)';
          row.style.borderColor = 'rgba(255,213,74,0.45)';
          row.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
        }
      };
      row.onmouseleave = () => {
        row.style.transform = '';
        row.style.borderColor = cardBorder;
        row.style.boxShadow = '';
      };
      list.appendChild(row);
    }
  }

  async _joinServer(roomInfo) {
    if (this._joining) return;
    this._joining = true;
    this._setStatus(`entrando em ${roomInfo.metadata?.name || 'servidor'}…`, '#ffd54a');

    try {
      if (this.cs.room) {
        try { await this.cs.leave(); }
        catch (e) { console.error('[ServerList] leave atual:', e); }
      }
      const session = await this.auth.getSupabase().auth.getSession();
      const token = session.data?.session?.access_token;
      const avatarUrl =
        this.auth.profile?.avatar_url ??
        this.auth.user?.user_metadata?.avatar_url ?? null;
      this.cs.setPlayerId(this.auth.getUserId());

      await this.cs.joinRoomById({
        roomId: roomInfo.roomId,
        token,
        nickname: this.auth.getNickname(),
        avatar_url: avatarUrl,
        password: null,
      });

      this.hide();
      try { await this.cs.leaveLobby?.(); } catch (_) {}

      if (this._onEnterGame) {
        await this._onEnterGame(this.cs.room);
      }
    } catch (e) {
      console.error('[ServerList] join:', e);
      this._setStatus('erro: ' + (e.message || 'falha ao entrar'), '#f55');
      this._joining = false;
      if (!this._visible) this.show();
    } finally {
      this._joining = false;
    }
  }

  async _doLogout() {
    try { await this.cs.leave(); } catch (_) {}
    try { await this.cs.leaveLobby?.(); } catch (_) {}
    try { await this.auth.signOut(); } catch (e) { console.error('[ServerList] logout:', e); }
    this.hide();
    if (window._loginScreen) window._loginScreen.show();
  }
}
