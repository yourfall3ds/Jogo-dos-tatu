// ─────────────────────────────────────────────────────────────────
//  LoginScreen — overlay de login antes do botão JOGAR
//
//  Mostra:
//   - Botão Google OAuth
//   - Botão "Jogar como convidado" (local, sem Supabase)
//   - Após login: nickname + botão CONTINUAR + LOBBY + LOGOUT
// ─────────────────────────────────────────────────────────────────

import { injectGameUI, ambientBackdrop } from './GameUIKit.js';

// Paleta cyber-cyan do GameUIKit (consistencia total com as outras telas).
const CYAN = '#2effb6';
const CYAN_RGB = '46,255,182';
const FONT_HEAD = "'Share Tech Mono','Fira Code',monospace";
const FONT_BODY = "'Fira Code','Share Tech Mono',monospace";

export class LoginScreen {
  constructor(authSystem) {
    this.auth = authSystem;
    this._visible = false;
    this._onContinue = null;
    this._onOpenLobby = null;
    this._build();

    // Atualiza UI quando auth muda
    this.auth.onAuthChange(() => this._refresh());
  }

  _build() {
    injectGameUI();   // tokens/fontes/classes gui-* (idempotente)
    const el = document.createElement('div');
    el.id = 'login-screen';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 450;
      display: none; flex-direction: column;
      align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 32%, #0a1230 0%, #050816 55%, #02030a 100%);
      color: var(--cy-text,#dfeaf2); font-family: ${FONT_BODY};
    `;
    // Fundo de jogo com profundidade (grid/scanlines/particulas/glow/vinheta).
    el.appendChild(ambientBackdrop({ particles: 16 }));

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative; z-index:2; width:100%; display:flex; justify-content:center;';
    wrap.innerHTML = `
      <div class="gui-panel" style="max-width:440px; width:92%; padding:34px 30px; text-align:center;">
        <h1 class="gui-title gui-title-glitch" data-text="TRANSFPS"
            style="font-size:3em; letter-spacing:7px; margin-bottom:4px;">TRANSFPS</h1>
        <p class="gui-dim" style="font-size:0.82em; margin:0 0 26px; letter-spacing:2px;
                                  text-transform:uppercase;">
          entre pra cair de cabeça no mundo
        </p>

        <!-- Estado: NÃO LOGADO -->
        <div id="ls-anon" style="display:flex; flex-direction:column; gap:12px;">
          <button id="ls-google" class="gui-btn" style="
            justify-content:center; gap:10px; padding:14px 22px; width:100%;
            font-family:${FONT_HEAD}; letter-spacing:1.5px;">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            ENTRAR COM GOOGLE
          </button>

          <!-- Modo offline/teste (sem login, sem rede) — testa VR + IA local -->
          <button id="ls-offline" class="gui-btn" style="
            justify-content:center; gap:8px; padding:12px 20px; width:100%;
            font-size:12px; letter-spacing:1px; opacity:0.85;">
            🎮 JOGAR OFFLINE · TESTE VR / IA
          </button>
        </div>

        <!-- Estado: LOGADO -->
        <div id="ls-loggedin" style="display:none; flex-direction:column; gap:14px;">
          <div class="gui-card" style="display:flex; align-items:center; gap:14px; margin:0;
                      cursor:default;">
            <img id="ls-avatar" src="" style="width:42px; height:42px; border-radius:50%;
                 border:2px solid ${CYAN}; box-shadow:0 0 12px rgba(${CYAN_RGB},0.5); display:none;" />
            <div style="flex:1; text-align:left; min-width:0;">
              <div class="gui-dim" style="text-transform:uppercase;">jogando como</div>
              <div id="ls-nickname" style="font-family:${FONT_HEAD}; font-size:1.1em; letter-spacing:1px;
                   color:${CYAN}; text-shadow:0 0 10px rgba(${CYAN_RGB},0.5);
                   overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">—</div>
            </div>
            <button id="ls-edit-nick" title="Editar nickname" class="gui-btn" style="
              padding:6px 10px; font-size:13px;">✏</button>
          </div>
          <button id="ls-lobby" class="gui-btn gui-btn-primary" style="
            width:100%; font-size:16px; padding:15px 22px; letter-spacing:3px;">
            🪂 JOGAR ONLINE
          </button>
          <button id="ls-logout" class="gui-btn" style="
            padding:8px 14px; font-size:11px; opacity:0.6; letter-spacing:1px;">
            sair da conta
          </button>
        </div>

        <!-- Edit nickname inline -->
        <div id="ls-nick-edit" style="display:none; margin-top:14px;">
          <input id="ls-nick-input" type="text" maxlength="24" placeholder="seu nickname"
                 style="width:100%; padding:11px 14px; background:rgba(8,13,26,0.9);
                        border:1px solid rgba(${CYAN_RGB},0.3); color:var(--cy-text,#dfeaf2);
                        font-family:${FONT_BODY}; font-size:0.95em; outline:none;
                        clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);" />
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="ls-nick-save" class="gui-btn" style="flex:1; padding:9px; font-size:12px;">SALVAR</button>
            <button id="ls-nick-cancel" class="gui-btn" style="flex:1; padding:9px; font-size:12px; opacity:0.6;">CANCELAR</button>
          </div>
        </div>

        <!-- Status -->
        <div id="ls-status" class="gui-dim" style="margin-top:16px; font-size:0.78em; min-height:18px;"></div>
      </div>
    `;
    el.appendChild(wrap);
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#ls-google').onclick = () => this._doGoogle();
    el.querySelector('#ls-offline').onclick = () => this._doOffline();
    el.querySelector('#ls-lobby').onclick    = () => this._doContinue(true);
    el.querySelector('#ls-logout').onclick   = () => this._doLogout();
    el.querySelector('#ls-edit-nick').onclick = () => this._openNickEdit();
    el.querySelector('#ls-nick-save').onclick = () => this._saveNick();
    el.querySelector('#ls-nick-cancel').onclick = () => this._closeNickEdit();
    // hover/glow agora vem das classes .gui-btn do kit (sem listener manual).
  }

  async _doGoogle() {
    // Tranca o botao pra impedir user abrir 500 janelas
    const btn = this._el?.querySelector('#ls-google');
    if (btn?.disabled) return; // ja em andamento
    if (btn) {
      btn.dataset._origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.style.cursor = 'wait';
      btn.style.opacity = '0.7';
      btn.innerHTML = `
        <span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(46,255,182,0.3);
                     border-top-color:#2effb6;border-radius:50%;
                     animation:lgspin 0.7s linear infinite;margin-right:8px;
                     vertical-align:middle;"></span>
        <span style="vertical-align:middle;">AGUARDANDO GOOGLE…</span>
      `;
      if (!document.getElementById('lgspin-css')) {
        const s = document.createElement('style');
        s.id = 'lgspin-css';
        s.textContent = '@keyframes lgspin { to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
      }
    }
    this._setStatus('Aguardando autenticação na janela do Google…', '#2effb6');
    try {
      await this.auth.signInWithGoogle();
      this._setStatus('✓ Logado com sucesso — entrando…', '#2effb6');
      // Espera o profile carregar (onAuthStateChange dispara _loadProfile assincrono)
      // e ENTRA NO LOBBY automaticamente. NAO deixa user travado na tela de login.
      let tries = 0;
      const waitProfile = () => new Promise((resolve) => {
        const tick = () => {
          tries++;
          if (this.auth.user && this.auth.profile) return resolve();
          if (tries > 50) return resolve(); // 5s timeout - segue mesmo sem profile
          setTimeout(tick, 100);
        };
        tick();
      });
      await waitProfile();
      // Vai direto pra Lobby Multiplayer (era esse o intent do click do Google)
      this.hide();
      if (this._onOpenLobby) this._onOpenLobby();
      else if (this._onContinue) this._onContinue();
    } catch (e) {
      console.error('[Login] Google:', e);
      this._setStatus('Erro: ' + e.message, '#ff3b4e');
      // Destranca botao se erro pra user tentar de novo
      if (btn) {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
        if (btn.dataset._origHtml) btn.innerHTML = btn.dataset._origHtml;
      }
    }
  }
  // _doGuest removido: produto pessoal exige credenciais 100% Lucas.
  // Veja feedback_credenciais_pessoais.md.

  /** Entra em modo offline/teste: sem login Google, sem rede. Vai direto pro
   *  mundo aberto pra testar VR (Quest) e a IA local (tecla H spawna inimigos). */
  async _doOffline() {
    const btn = this._el?.querySelector('#ls-offline');
    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.style.cursor = 'wait'; btn.style.opacity = '0.7'; }
    this._setStatus('Iniciando modo offline…', '#2effb6');
    try {
      await this.auth.signInOffline();
      this._setStatus('✓ Offline — entrando…', '#2effb6');
      this.hide();
      if (this._onOffline) this._onOffline();
      else if (this._onContinue) this._onContinue();
    } catch (e) {
      console.error('[Login] offline:', e);
      this._setStatus('Erro: ' + e.message, '#ff3b4e');
      if (btn) { btn.disabled = false; btn.style.cursor = 'pointer'; btn.style.opacity = '1'; }
    }
  }

  _doContinue(openLobby) {
    this.hide();
    if (openLobby && this._onOpenLobby) this._onOpenLobby();
    else if (this._onContinue) this._onContinue();
  }

  async _doLogout() {
    await this.auth.signOut();
  }

  _openNickEdit() {
    const wrap = this._el.querySelector('#ls-nick-edit');
    const input = this._el.querySelector('#ls-nick-input');
    wrap.style.display = 'block';
    input.value = this.auth.getNickname();
    input.focus();
    input.select();
  }
  _closeNickEdit() {
    this._el.querySelector('#ls-nick-edit').style.display = 'none';
  }
  async _saveNick() {
    const input = this._el.querySelector('#ls-nick-input');
    const nick = input.value.trim();
    if (nick.length < 2 || nick.length > 24) {
      this._setStatus('Nickname 2-24 chars', '#ff3b4e');
      return;
    }
    await this.auth.updateNickname(nick);
    this._refresh();
    this._closeNickEdit();
  }

  _refresh() {
    if (!this._el) return;
    const anon = this._el.querySelector('#ls-anon');
    const logged = this._el.querySelector('#ls-loggedin');
    if (this.auth.isAuthenticated()) {
      anon.style.display = 'none';
      logged.style.display = 'flex';
      this._el.querySelector('#ls-nickname').textContent = this.auth.getNickname();
      const avatar = this._el.querySelector('#ls-avatar');
      const url = this.auth.profile?.avatar_url || this.auth.user?.user_metadata?.avatar_url;
      if (url) { avatar.src = url; avatar.style.display = 'block'; }
      else avatar.style.display = 'none';
      this._setStatus('', '#789');
    } else {
      anon.style.display = 'flex';
      logged.style.display = 'none';
    }
  }

  _setStatus(text, color = '#789') {
    const el = this._el?.querySelector('#ls-status');
    if (el) { el.textContent = text; el.style.color = color; }
  }

  onContinue(cb) { this._onContinue = cb; }
  onOpenLobby(cb) { this._onOpenLobby = cb; }
  onOffline(cb) { this._onOffline = cb; }
  show() {
    this._visible = true;
    this._el.style.display = 'flex';
    // transicao de entrada (fade+slide) — fluir como jogo.
    const panel = this._el.querySelector('.gui-panel');
    if (panel) {
      panel.classList.remove('gui-screen-enter');
      void panel.offsetWidth;            // reflow → reinicia a animacao
      panel.classList.add('gui-screen-enter');
    }
    this._refresh();
  }
  hide() { this._visible = false; this._el.style.display = 'none'; }
}
