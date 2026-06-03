// ─────────────────────────────────────────────────────────────────
//  LoginScreen — overlay de login antes do botão JOGAR
//
//  Mostra:
//   - Botão Google OAuth
//   - Botão "Jogar como convidado" (local, sem Supabase)
//   - Após login: nickname + botão CONTINUAR + LOBBY + LOGOUT
// ─────────────────────────────────────────────────────────────────

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
    const el = document.createElement('div');
    el.id = 'login-screen';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 450;
      display: none; flex-direction: column;
      align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 35%, #1a1640 0%, #0a0a1e 55%, #05050f 100%);
      color: #fff; font-family: 'Segoe UI', monospace;
    `;
    el.innerHTML = `
      <div style="position:relative; max-width:420px; width:92%; padding:32px 28px;
                  background:rgba(20,20,40,0.78); border:1px solid rgba(255,200,40,0.35);
                  border-radius:18px; box-shadow:0 0 50px rgba(255,180,40,0.25);
                  backdrop-filter:blur(10px); text-align:center;">
        <h1 style="margin:0 0 6px; font-size:2.6em; font-weight:900; letter-spacing:3px;
                   background:linear-gradient(180deg,#fff5cc,#ffcc00,#ff9a2c);
                   -webkit-background-clip:text; background-clip:text; color:transparent;
                   filter:drop-shadow(0 0 18px rgba(255,180,40,.55));">
          🐭 TransFPS
        </h1>
        <p style="color:#9aa; font-size:0.9em; margin:0 0 24px; letter-spacing:0.5px;">
          entre pra jogar online com seus amigos
        </p>

        <!-- Estado: NÃO LOGADO -->
        <div id="ls-anon" style="display:flex; flex-direction:column; gap:10px;">
          <button id="ls-google" style="
            display:flex; align-items:center; justify-content:center; gap:10px;
            padding:13px 22px; background:#fff; color:#333; border:none;
            border-radius:10px; font-size:1em; font-weight:700; cursor:pointer;
            transition:transform .15s, box-shadow .15s;
            box-shadow: 0 4px 14px rgba(0,0,0,.4);">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Entrar com Google
          </button>
        </div>

        <!-- Estado: LOGADO -->
        <div id="ls-loggedin" style="display:none; flex-direction:column; gap:14px;">
          <div style="display:flex; align-items:center; gap:14px; padding:12px;
                      background:rgba(255,255,255,0.06); border-radius:12px;">
            <img id="ls-avatar" src="" style="width:42px; height:42px; border-radius:50%;
                 border:2px solid #ffcc00; display:none;" />
            <div style="flex:1; text-align:left; min-width:0;">
              <div style="font-size:0.7em; color:#888; letter-spacing:1px; text-transform:uppercase;">jogando como</div>
              <div id="ls-nickname" style="font-size:1.1em; font-weight:700; color:#ffcc00; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">—</div>
            </div>
            <button id="ls-edit-nick" title="Editar nickname" style="
              background:none; border:1px solid #444; color:#888;
              padding:5px 9px; border-radius:6px; cursor:pointer; font-size:0.78em;">
              ✏️
            </button>
          </div>
          <button id="ls-continue" style="
            padding:13px 22px; background:linear-gradient(135deg,#ffd84a,#ffaa2c);
            color:#1a1400; border:none; border-radius:10px; cursor:pointer;
            font-size:1.05em; font-weight:900; letter-spacing:1px;
            box-shadow:0 4px 18px rgba(255,170,40,.4);">
            ▶ JOGAR (single)
          </button>
          <button id="ls-lobby" style="
            padding:11px 20px; background:rgba(120,180,255,0.18); color:#cef;
            border:1px solid rgba(120,180,255,0.40); border-radius:10px;
            cursor:pointer; font-size:1em; font-weight:600;">
            🌐 Multiplayer (lobby)
          </button>
          <button id="ls-logout" style="
            padding:8px 14px; background:none; color:#666;
            border:1px solid rgba(255,255,255,0.10); border-radius:8px;
            cursor:pointer; font-size:0.82em;">
            sair da conta
          </button>
        </div>

        <!-- Edit nickname inline -->
        <div id="ls-nick-edit" style="display:none; margin-top:14px;">
          <input id="ls-nick-input" type="text" maxlength="24" placeholder="seu nickname"
                 style="width:100%; padding:10px 14px; background:#0d1124;
                        border:1px solid rgba(255,255,255,.20); color:#fff;
                        border-radius:8px; font-family:inherit; font-size:0.95em;" />
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button id="ls-nick-save" style="flex:1; padding:8px;
                    background:#3a8; border:none; color:#fff; border-radius:6px;
                    cursor:pointer; font-weight:700;">salvar</button>
            <button id="ls-nick-cancel" style="flex:1; padding:8px;
                    background:#1a1f2a; border:1px solid #333; color:#888;
                    border-radius:6px; cursor:pointer;">cancelar</button>
          </div>
        </div>

        <!-- Status -->
        <div id="ls-status" style="margin-top:14px; font-size:0.78em; color:#789; min-height:18px;"></div>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#ls-google').onclick = () => this._doGoogle();
    el.querySelector('#ls-continue').onclick = () => this._doContinue(false);
    el.querySelector('#ls-lobby').onclick    = () => this._doContinue(true);
    el.querySelector('#ls-logout').onclick   = () => this._doLogout();
    el.querySelector('#ls-edit-nick').onclick = () => this._openNickEdit();
    el.querySelector('#ls-nick-save').onclick = () => this._saveNick();
    el.querySelector('#ls-nick-cancel').onclick = () => this._closeNickEdit();

    el.querySelectorAll('button').forEach(b => {
      b.onmouseenter = () => { b.style.filter = 'brightness(1.1)'; };
      b.onmouseleave = () => { b.style.filter = ''; };
    });
  }

  async _doGoogle() {
    this._setStatus('Redirecionando pro Google…', '#ffcc66');
    try { await this.auth.signInWithGoogle(); }
    catch (e) {
      console.error('[Login] Google:', e);
      this._setStatus('Erro: ' + e.message, '#f55');
    }
  }
  // _doGuest removido: produto pessoal exige credenciais 100% Lucas.
  // Veja feedback_credenciais_pessoais.md.

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
      this._setStatus('Nickname 2-24 chars', '#f55');
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
  show() { this._visible = true; this._el.style.display = 'flex'; this._refresh(); }
  hide() { this._visible = false; this._el.style.display = 'none'; }
}
