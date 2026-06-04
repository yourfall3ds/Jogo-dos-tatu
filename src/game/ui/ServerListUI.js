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
import { injectGameUI, button, card, ambientBackdrop } from './GameUIKit.js';

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
    injectGameUI();   // garante tokens/classes gui-* (idempotente)
    const el = document.createElement('div');
    el.id = 'server-list-ui';
    el.className = 'gui-scroll';
    // Fundo de menu cyberpunk (tokens --cy-* do GameUIKit; literais de fallback)
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 460;
      display: none; flex-direction: column;
      background: radial-gradient(ellipse at 50% 30%, var(--cy-bg-2,#0a0f1e) 0%, var(--cy-bg,#050816) 55%, #02030a 100%);
      color: var(--cy-text,#dfeaf2); font-family: var(--cy-font-body,'Fira Code',monospace);
    `;
    el.innerHTML = `
      <header style="position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;
                     padding:16px 28px;border-bottom:1px solid var(--cy-line,rgba(46,255,182,0.28));
                     background:rgba(8,13,26,0.7);">
        <div style="display:flex;align-items:center;gap:14px;">
          <span class="gui-header" style="font-size:1.4em;letter-spacing:5px;border:0;padding:0;">
            🪂 SERVIDORES
          </span>
        </div>
        <div style="display:flex;gap:12px;align-items:center;">
          <span id="sl-status" class="gui-dim" style="font-size:0.82em;"></span>
          <span id="sl-refresh-slot"></span>
          <span id="sl-logout-slot"></span>
        </div>
      </header>

      <div style="position:relative;z-index:2;flex:1;display:flex;justify-content:center;padding:26px;overflow-y:auto;" class="gui-scroll">
        <div style="width:100%;max-width:820px;">
          <div id="sl-list" style="display:flex;flex-direction:column;gap:12px;"></div>
          <div id="sl-empty" class="gui-panel" style="display:none;text-align:center;padding:48px;">
            <div class="gui-header" style="border:0;justify-content:center;padding:0;margin-bottom:8px;">
              NENHUM SERVIDOR ONLINE
            </div>
            <span class="gui-dim" style="font-size:0.82em;">aguarde o BRASIL 1 ficar online…</span>
          </div>
        </div>
      </div>

      <div class="gui-dim" style="position:relative;z-index:2;text-align:center;padding:16px;letter-spacing:3px;text-transform:uppercase;">
        TRANSFPS · ENTRE NUM SERVIDOR PRA CAIR DE CABEÇA NO MUNDO
      </div>
    `;
    // Fundo de jogo com profundidade (grid/scanlines/particulas/glow/vinheta),
    // atras de tudo (z-index:0). Inserido como 1o filho.
    el.insertBefore(ambientBackdrop({ particles: 20 }), el.firstChild);
    document.body.appendChild(el);
    this._el = el;

    // Botoes angulares do kit (mantem os MESMOS handlers de antes).
    const refreshBtn = button('↻ ATUALIZAR', () => this._refreshNow(), { id: 'sl-refresh' });
    const logoutBtn = button('✕ SAIR DA CONTA', () => this._doLogout(), { id: 'sl-logout', variant: 'danger' });
    el.querySelector('#sl-refresh-slot').replaceWith(refreshBtn);
    el.querySelector('#sl-logout-slot').replaceWith(logoutBtn);
  }

  async show() {
    this._visible = true;
    this._el.style.display = 'flex';
    // transicao de entrada (fade+slide) — fluir como jogo.
    this._el.classList.remove('gui-screen-enter');
    void this._el.offsetWidth;
    this._el.classList.add('gui-screen-enter');
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
      this._setStatus('erro: ' + e.message, 'var(--cy-danger,#ff3b4e)');
    }
  }

  async _refreshNow() {
    this._setStatus('atualizando…');
    await this._startSubscription();
  }

  _setStatus(text, color = 'var(--cy-text-dim,#7e93a6)') {
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
      const full = fullness >= 1;
      // dot/contador: verde cyan livre · ambar quase cheio · vermelho lotado.
      const dotColor = full ? 'var(--cy-danger,#ff3b4e)' : fullness >= 0.8 ? '#ffaa3a' : 'var(--cy-cyan,#2effb6)';

      // Card HUD do kit (chanfro + glow). Server lotado = variante danger.
      const row = card(`
        <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;">
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="width:9px;height:9px;border-radius:50%;background:${dotColor};
                           box-shadow:0 0 8px ${dotColor};flex-shrink:0;"></span>
              <span style="font-family:var(--cy-font-head,'Share Tech Mono',monospace);
                           font-size:1.3em;letter-spacing:2px;color:var(--cy-text,#eaffff);">
                ${_esc(name)}
              </span>
              <span class="gui-dim" style="background:var(--cy-cyan-soft,rgba(46,255,182,0.14));
                           padding:2px 8px;color:var(--cy-cyan,#2effb6);letter-spacing:1px;">
                ${_esc(region)}
              </span>
            </div>
            <div class="gui-dim" style="margin-top:8px;font-size:0.82em;">
              mapa: <span style="color:var(--cy-cyan,#2effb6);">${_esc(mapName)}</span>
              &nbsp;·&nbsp; modo: <span style="color:var(--cy-cyan,#2effb6);">OPEN WORLD</span>
              &nbsp;·&nbsp; respawn: <span style="color:var(--cy-text,#dfeaf2);">5s no céu</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
            <div class="gui-mono" style="font-family:var(--cy-font-head,'Share Tech Mono',monospace);
                 font-size:1.6em;color:${dotColor};">
              ${players}<span style="color:var(--cy-text-dim,#7e93a6);">/${max}</span>
            </div>
            <span class="sl-join-slot"></span>
          </div>
        </div>
      `, {
        glow: full ? 'danger' : undefined,
        className: full ? 'sl-card-full' : '',
      });
      if (full) row.style.opacity = '0.55';
      else row.style.cursor = 'pointer';

      // Botao ENTRAR angular do kit; desabilitado quando lotado.
      const btn = button('▶ ENTRAR', null, { disabled: full });
      row.querySelector('.sl-join-slot').replaceWith(btn);

      const doJoin = (ev) => {
        ev?.stopPropagation?.();
        if (this._joining || full) return;
        this._joinServer(r);
      };
      if (!full) {
        row.onclick = doJoin;
        btn.addEventListener('click', doJoin);
      }
      list.appendChild(row);
    }
  }

  async _joinServer(roomInfo) {
    if (this._joining) return;

    // ── Tela de seleção de personagem ANTES do join real ──
    //  "Entrar" abre a CharacterSelectScreen; o "JOGAR" dela chama de volta
    //  o fluxo de join/spawn (this._doJoinFlow) com o avatar escolhido.
    //  Mantém o fluxo original 100% — só insere a tela no meio.
    const css = window._charSelectScreen;
    if (css && !this._inCharSelect) {
      this._inCharSelect = true;
      css.show(async (character) => {
        this._inCharSelect = false;
        // guarda o avatar escolhido pra aplicar via CharacterSwapper após o spawn
        this._pendingAvatar = character || null;
        await this._doJoinFlow(roomInfo);
      });
      return;
    }
    this._inCharSelect = false;
    await this._doJoinFlow(roomInfo);
  }

  async _doJoinFlow(roomInfo) {
    if (this._joining) return;
    this._joining = true;
    this._setStatus(`entrando em ${roomInfo.metadata?.name || 'servidor'}…`, 'var(--cy-cyan,#2effb6)');

    // ── FIX piscada: mostra o loading OPACO cobrindo TUDO no INSTANTE do click,
    //  ANTES de qualquer await (join de rede / leave / mapa). Assim NUNCA existe
    //  janela em que a lista some e a cena 3D aparece exposta antes do loading.
    //  Espera 1 frame pintado antes de iniciar a carga pesada.
    try {
      const _loading = window._loadingOverlay;
      if (_loading) {
        _loading.show('ENTRANDO NO SERVIDOR',
          `${roomInfo.metadata?.name || 'servidor'} · conectando…`, true);
        _loading.setProgress(5, 'conectando…');
        // garante 1 frame pintado (overlay visivel) antes de bloquear na rede
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
    } catch (e) { console.error('[ServerList] loading pre-join:', e); }

    try {
      if (this.cs.room) {
        try { await this.cs.leave(); }
        catch (e) { console.error('[ServerList] leave atual:', e); }
      }
      // Token é OPCIONAL (jogar não depende de login). Se a auth estiver offline/
      // anônima, segue sem token — o server aceita (JWT_REQUIRED=0).
      let token = null;
      try {
        const supa = this.auth.getSupabase?.();
        if (supa) {
          const session = await supa.auth.getSession();
          token = session.data?.session?.access_token ?? null;
        }
      } catch (e) { console.warn('[ServerList] getSession (segue anônimo):', e?.message); }

      const avatarUrl =
        this.auth.profile?.avatar_url ??
        this.auth.user?.user_metadata?.avatar_url ?? null;
      this.cs.setPlayerId(this.auth.getUserId());

      const _tJoin = (performance?.now?.() || 0);
      window._loadingOverlay?.setProgress?.(20, 'conectando ao servidor…');
      try { window.transfpsMark?.('JOIN: chamando joinRoomById'); } catch (_) {}
      await this.cs.joinRoomById({
        roomId: roomInfo.roomId,
        token,
        nickname: this.auth.getNickname?.() || 'Player',
        avatar_url: avatarUrl,
        password: null,
        // p/ fallback joinOrCreate se a sala estiver morta:
        map: roomInfo.metadata?.map || roomInfo.map || 'arena',
        mode: roomInfo.metadata?.mode || 'DEATHMATCH',
      });
      const _joinMs = ((performance?.now?.() || 0) - _tJoin).toFixed(0);
      console.log('%c[JOIN] sala conectada em ' + _joinMs + 'ms', 'color:#2effb6');
      try { window.transfpsMark?.('JOIN: sala conectada (' + _joinMs + 'ms)'); } catch (_) {}
      window._loadingOverlay?.setProgress?.(55, 'carregando mapa…');

      this.hide();
      try { await this.cs.leaveLobby?.(); } catch (_) {}

      if (this._onEnterGame) {
        const _tMap = (performance?.now?.() || 0);
        try { window.transfpsMark?.('JOIN: carregando mapa (_onEnterGame)'); } catch (_) {}
        await this._onEnterGame(this.cs.room);
        const _mapMs = ((performance?.now?.() || 0) - _tMap).toFixed(0);
        console.log('%c[JOIN] mapa carregado em ' + _mapMs + 'ms', 'color:#2effb6');
        try { window.transfpsMark?.('JOIN: mapa pronto (' + _mapMs + 'ms) — NO JOGO'); } catch (_) {}
        window._loadingOverlay?.setProgress?.(100, 'pronto!');
      }

      // ── Aplica o avatar escolhido (NÃO bloqueia o load) ──
      //  O swap carrega o GLB + re-vincula anims (pode demorar 10-30s) → NÃO
      //  pode ser await aqui senão trava o load infinito. Roda em background.
      //  Pra não aparecer o RATO primeiro: escondemos o mesh do player até o
      //  swap terminar (o player cai "invisível" e materializa já trocado).
      if (this._pendingAvatar) {
        const av = this._pendingAvatar;
        this._pendingAvatar = null;
        const swapper = window._charSwapper;
        const defaultUrl = 'assets/characters/player.glb';
        if (swapper && av.url && av.url !== defaultUrl) {
          try {
            const pl = window._gamePlayer || window._player;
            const meshRoot = pl?.mesh || pl?.root;
            // esconde o avatar atual (rato) enquanto troca
            try { meshRoot?.setEnabled?.(false); } catch (_) {}
            swapper.swap(av.url).then(r => {
              if (r?.warning) console.warn('[ServerList] swap avatar:', r.warning);
              try { meshRoot?.setEnabled?.(true); } catch (_) {}
            }).catch(e => {
              console.error('[ServerList] swap avatar:', e);
              try { meshRoot?.setEnabled?.(true); } catch (_) {}  // re-mostra mesmo em erro
            });
            // safety: re-mostra em 8s mesmo se o swap pendurar (nunca fica invisível)
            setTimeout(() => { try { meshRoot?.setEnabled?.(true); } catch (_) {} }, 8000);
          } catch (e) { console.error('[ServerList] apply avatar:', e); }
        }
      }
    } catch (e) {
      console.error('[ServerList] join:', e);
      // esconde o loading opaco antes de voltar pra lista (erro de join)
      try { window._loadingOverlay?.hide(); } catch (_) {}
      this._setStatus('erro: ' + (e.message || 'falha ao entrar'), 'var(--cy-danger,#ff3b4e)');
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
