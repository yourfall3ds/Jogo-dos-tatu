// ─────────────────────────────────────────────────────────────────
//  BootLoadGuard — overlay forte que TRANCA a UI durante o boot.
//
//  Razão: enquanto carrega ~22 GLBs (armas + props + decoração),
//  o jogo fica pesado e clicar em botões dá sensação de travado.
//  Esse overlay bloqueia toda interação até load chegar a 100%,
//  com feedback claro do progresso.
// ─────────────────────────────────────────────────────────────────

export class BootLoadGuard {
  constructor() {
    this._lastPct = 0;
    this._lastLabel = '';
    this._build();
    this._tipIdx = 0;
    this._tips = [
      'WASD anda · clique ataca · barra de espaço pula',
      'Duplo W/A/S/D dá DASH na direção',
      'Pressione W+S juntos pra dash vertical (pra cima)',
      'TAB = scoreboard · T = chat · U = missões · F1 = ranking',
      'Modo BATTLE ROYALE: caia do céu, sobreviva à storm, último vivo ganha',
      'F2 = amigos · F3 = sair da party · ESC = pausa',
    ];
    this._startTipRotation();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'boot-load-guard';
    el.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:radial-gradient(ellipse at 50% 35%, #0a1230 0%, #050816 55%, #02030a 100%);
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      color:#dff5ff; font-family:'Segoe UI',monospace;
      pointer-events:all;  /* tranca toda interação */
    `;
    el.innerHTML = `
      <div style="font-size:54px; font-weight:900; letter-spacing:8px;
                  background:linear-gradient(180deg,#fff5cc,#ffcc00,#ff9a2c);
                  -webkit-background-clip:text; background-clip:text; color:transparent;
                  filter:drop-shadow(0 0 24px rgba(255,180,40,.55));">
        TransFPS
      </div>
      <div style="font:600 12px monospace; opacity:0.6; margin-top:6px; letter-spacing:2px;">
        preparando arsenal e cenário
      </div>

      <div style="margin-top:32px; width:420px; max-width:80vw;">
        <div style="display:flex; justify-content:space-between; font:700 11px monospace; opacity:0.7; margin-bottom:5px;">
          <span id="blg-label">iniciando…</span>
          <span id="blg-pct">0%</span>
        </div>
        <div style="height:8px; background:rgba(0,0,0,0.7); border:1px solid rgba(126,239,196,0.4); border-radius:4px; overflow:hidden;">
          <div id="blg-fill" style="height:100%; width:0%;
               background:linear-gradient(90deg,#2effb6 0%,#3aa8ff 50%,#ffd54a 100%);
               transition:width 0.3s; border-radius:4px;"></div>
        </div>
      </div>

      <div id="blg-spinner" style="margin-top:24px; width:32px; height:32px;
           border:3px solid rgba(126,239,196,0.2); border-top-color:#2effb6;
           border-radius:50%; animation:blg-spin 0.8s linear infinite;"></div>

      <div id="blg-tip" style="margin-top:36px; max-width:520px; min-height:34px;
           padding:10px 18px; background:rgba(0,0,0,0.5);
           border-left:3px solid #ffd54a; border-radius:4px;
           font:600 12px monospace; opacity:0.85; transition:opacity 0.3s;">
        💡 ${this._tips ? this._tips[0] : ''}
      </div>

      <div style="position:absolute; bottom:24px; font:600 10px monospace; opacity:0.4;">
        ESC durante o jogo pra abrir menu · v1.0
      </div>
    `;

    if (!document.getElementById('blg-css')) {
      const s = document.createElement('style');
      s.id = 'blg-css';
      s.textContent = `
        @keyframes blg-spin { to { transform: rotate(360deg); } }
        #boot-load-guard.done { opacity: 0; pointer-events: none; transition: opacity 0.5s; }
      `;
      document.head.appendChild(s);
    }
    document.body.appendChild(el);
    this._el = el;
    this._fill = el.querySelector('#blg-fill');
    this._lbl = el.querySelector('#blg-label');
    this._pct = el.querySelector('#blg-pct');
    this._spinner = el.querySelector('#blg-spinner');
    this._tip = el.querySelector('#blg-tip');
  }

  _startTipRotation() {
    this._tipTimer = setInterval(() => {
      if (!this._tip || !this._tips) return;
      this._tipIdx = (this._tipIdx + 1) % this._tips.length;
      this._tip.style.opacity = '0';
      setTimeout(() => {
        if (this._tip) {
          this._tip.innerHTML = '💡 ' + this._tips[this._tipIdx];
          this._tip.style.opacity = '0.85';
        }
      }, 280);
    }, 4500);
  }

  update(pct, label) {
    const p = Math.max(this._lastPct, Math.max(0, Math.min(100, Math.round(pct))));
    this._lastPct = p;
    if (this._fill) this._fill.style.width = p + '%';
    if (this._pct) this._pct.textContent = p + '%';
    if (label && this._lbl) {
      this._lbl.textContent = label;
      this._lastLabel = label;
    }
  }

  done() {
    if (!this._el) return;
    this.update(100, 'pronto!');
    if (this._tipTimer) { clearInterval(this._tipTimer); this._tipTimer = null; }
    setTimeout(() => {
      if (!this._el) return;
      this._el.classList.add('done');
      setTimeout(() => { try { this._el.remove(); } catch (_) {} this._el = null; }, 600);
    }, 300);
  }
}
