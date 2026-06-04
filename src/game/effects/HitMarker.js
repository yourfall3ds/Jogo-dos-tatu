// ─────────────────────────────────────────────────────────────────
//  HitMarker — confirmação visual de acerto no crosshair (PvP/PvE).
//
//  Overlay DOM puro (4 ticks angulares) centrado na tela que PISCA
//  quando o ATACANTE conecta um golpe (melee ou tiro). É o feedback
//  que faltava no PvP rápido: o jogador precisa SABER que acertou,
//  não só ver o número de dano flutuante distante.
//
//  Tiers por dano:
//    normal  → branco
//    forte   → âmbar  (dmg >= 50)
//    crit    → vermelho (dmg >= 80 OU flag crit)
//    kill    → X vermelho maior + tick mais largo (alvo morreu)
//
//  Zero dependência (sem BABYLON, sem assets). Lazy-cria o DOM no 1º
//  hit. Self-contained: não toca em nenhum outro sistema.
// ─────────────────────────────────────────────────────────────────

export class HitMarker {
  constructor() {
    this._el = null;
    this._ticks = [];
    this._hideTimer = null;
    this._injectStyle();
  }

  _injectStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('hitmarker-style')) return;
    const s = document.createElement('style');
    s.id = 'hitmarker-style';
    s.textContent = `
      #hitmarker {
        position: fixed; left: 50%; top: 50%;
        width: 40px; height: 40px; margin: -20px 0 0 -20px;
        pointer-events: none; z-index: 95;
        opacity: 0; transform: scale(1.35) rotate(0deg);
      }
      #hitmarker.hm-show {
        animation: hmPop 0.22s ease-out forwards;
      }
      #hitmarker .hm-tick {
        position: absolute; width: 10px; height: 2px;
        background: #fff; border-radius: 1px;
        box-shadow: 0 0 3px rgba(0,0,0,0.9);
      }
      @keyframes hmPop {
        0%   { opacity: 0;   transform: scale(1.6)  rotate(0deg); }
        18%  { opacity: 1;   transform: scale(0.85) rotate(0deg); }
        100% { opacity: 0;   transform: scale(1.0)  rotate(0deg); }
      }
    `;
    document.head.appendChild(s);
  }

  _ensureDom() {
    if (this._el || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.id = 'hitmarker';
    // 4 ticks em diagonal (cantos), padrão clássico de hitmarker de FPS.
    const POS = [
      { x: -13, y: -13, deg:  45 },
      { x:  13, y: -13, deg: -45 },
      { x: -13, y:  13, deg: -45 },
      { x:  13, y:  13, deg:  45 },
    ];
    for (const p of POS) {
      const t = document.createElement('div');
      t.className = 'hm-tick';
      t.style.left = (20 + p.x - 5) + 'px';
      t.style.top  = (20 + p.y - 1) + 'px';
      t.style.transform = `rotate(${p.deg}deg)`;
      el.appendChild(t);
      this._ticks.push(t);
    }
    document.body.appendChild(el);
    this._el = el;
  }

  /**
   * Dispara o hitmarker. Chamado SÓ no cliente do ATACANTE quando o golpe
   * conecta (detecção local) ou quando o server confirma (hit_confirmed
   * com from === meuId).
   * @param {object} opts
   * @param {number} [opts.dmg]  dano (define o tier de cor)
   * @param {boolean}[opts.crit] força tier crítico
   * @param {boolean}[opts.kill] alvo morreu (X vermelho maior)
   */
  hit({ dmg = 0, crit = false, kill = false } = {}) {
    if (typeof document === 'undefined') return;
    this._ensureDom();
    if (!this._el) return;

    let color = '#ffffff';
    if (kill || crit || dmg >= 80) color = '#ff3b3b';
    else if (dmg >= 50)           color = '#ffc04d';

    const w = kill ? 13 : 10;
    for (const t of this._ticks) {
      t.style.background = color;
      t.style.width = w + 'px';
      t.style.boxShadow = `0 0 4px ${color}, 0 0 2px rgba(0,0,0,0.9)`;
    }

    // Restart da animação: remove a classe, força reflow, re-adiciona.
    this._el.classList.remove('hm-show');
    // eslint-disable-next-line no-unused-expressions
    void this._el.offsetWidth;
    this._el.classList.add('hm-show');

    if (this._hideTimer) { clearTimeout(this._hideTimer); }
    this._hideTimer = setTimeout(() => {
      this._el?.classList.remove('hm-show');
      this._hideTimer = null;
    }, 240);
  }

  dispose() {
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
    try { this._el?.remove(); } catch (_) {}
    this._el = null;
    this._ticks = [];
  }
}
