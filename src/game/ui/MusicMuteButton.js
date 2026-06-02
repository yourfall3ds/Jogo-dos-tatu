// ─────────────────────────────────────────────────────────────────
//  MusicMuteButton — botão flutuante SEMPRE visível pra mutar música
//
//  Posição: canto superior-esquerdo, abaixo do server-status pill.
//  Atalho: tecla M alterna mute também.
// ─────────────────────────────────────────────────────────────────

export class MusicMuteButton {
  constructor(musicSystem) {
    this.music = musicSystem;
    this._build();
    this._wasM = false;
  }

  _build() {
    const btn = document.createElement('button');
    btn.id = 'music-mute-btn';
    btn.style.cssText = `
      position: fixed; top: 50px; left: 14px; z-index: 9300;
      display: flex; align-items: center; gap: 6px;
      background: rgba(0,0,0,0.62); border: 1px solid rgba(255,255,255,0.15);
      color: #e0e0e0; padding: 6px 12px; border-radius: 20px;
      font-family: 'Segoe UI', monospace; font-size: 12px; font-weight: 600;
      cursor: pointer; user-select: none; transition: 0.15s;
      backdrop-filter: blur(6px);
    `;
    btn.innerHTML = `
      <span id="mmb-icon" style="font-size:14px;">♪</span>
      <span id="mmb-label">música</span>
    `;
    btn.title = 'Mutar/desmutar música (M)';
    btn.onclick = () => this.toggle();
    btn.onmouseenter = () => { btn.style.borderColor = 'rgba(255,255,255,0.30)'; };
    btn.onmouseleave = () => { btn.style.borderColor = this.music.isMuted() ? 'rgba(255,90,106,0.40)' : 'rgba(255,255,255,0.15)'; };
    document.body.appendChild(btn);
    this._el = btn;
    this._refresh();
  }

  toggle() {
    this.music.setMuted(!this.music.isMuted());
    this._refresh();
  }

  _refresh() {
    const muted = this.music.isMuted();
    const icon = this._el.querySelector('#mmb-icon');
    const label = this._el.querySelector('#mmb-label');
    if (muted) {
      icon.textContent = '🔇';
      label.textContent = 'mudo';
      this._el.style.color = '#ff8080';
      this._el.style.borderColor = 'rgba(255,90,106,0.40)';
    } else {
      icon.textContent = '♪';
      label.textContent = this.music.isStarted() ? 'tocando' : 'música';
      this._el.style.color = '#7efa9a';
      this._el.style.borderColor = 'rgba(40,220,100,0.30)';
    }
  }

  /** Chamado pelo loop pra processar atalho M e atualizar visual. */
  update(input) {
    const mNow = input?.keys?.KeyM === true;
    if (mNow && !this._wasM) this.toggle();
    this._wasM = mNow;
    // Atualiza label periodicamente (caso start() rolou)
    if (this._started !== this.music.isStarted()) {
      this._started = this.music.isStarted();
      this._refresh();
    }
  }
}
