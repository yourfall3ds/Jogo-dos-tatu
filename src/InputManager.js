// ─────────────────────────────────────────────────────────────────
//  InputManager — teclado + mouse + pointer lock
//
//  Pointer lock confina o cursor dentro da janela.
//  Quando o browser libera o lock (ESC, alt-tab, clique fora),
//  onDeactivated() é chamado para sincronizar o estado da UI.
// ─────────────────────────────────────────────────────────────────
export class InputManager {
  constructor(canvas) {
    this.canvas        = canvas;
    this.keys          = {};
    this._mouseX       = 0;
    this._mouseY       = 0;
    this._clicked      = false;
    this._rightClicked = false;
    this._wheelDelta   = 0;     // acumula scroll p/ trocar de arma
    this.gameActive    = false;

    // Double-tap W para dash
    this._lastWPressTime = 0;
    this._wDoubleTap     = false;

    // Callback chamado quando o jogo é desativado (pointer lock perdido, ESC, etc.)
    // Definido externamente: input.onDeactivated = () => { ... }
    this.onDeactivated = null;

    // ── Teclado ──────────────────────────────────────────────────────
    // Limpa teclas presas quando o usuário foca num campo de texto
    document.addEventListener('focusin', e => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') this.keys = {};
    });

    window.addEventListener('keydown', e => {
      // Não intercepta quando o usuário está digitando num input/textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Ignora auto-repeat do SO (keydown dispara ~30x/s enquanto segura).
      // Sem isso, segurar W gerava "double-tap" falso o tempo todo.
      if (e.repeat) { this.keys[e.code] = true; return; }

      const wasDown = this.keys[e.code];
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();

      // Double-tap W → dash. Só conta como NOVO toque se a tecla estava
      // solta antes (wasDown=false) E gameActive. Segurar W não dispara.
      if (e.code === 'KeyW' && this.gameActive && !wasDown) {
        const now = performance.now();
        if (now - this._lastWPressTime < 280) {
          this._wDoubleTap = true;
          this._lastWPressTime = 0;   // zera p/ exigir nova sequência (1 dash por par)
        } else {
          this._lastWPressTime = now;
        }
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // ── Mouse movement ───────────────────────────────────────────────
    document.addEventListener('mousemove', e => {
      if (!this.gameActive) return;
      this._mouseX += e.movementX;
      this._mouseY += e.movementY;
    });

    // ── Click: atirar + re-adquirir lock se perdido ──────────────────
    document.addEventListener('mousedown', e => {
      if (!this.gameActive) return;
      if (e.target?.id === 'focus-btn') return;
      // Re-adquire lock se perdido (chamado dentro de handler de clique = gesto válido)
      if (!document.pointerLockElement) this._requestLock();
      // Conta os cliques (não só um boolean) → mashing rápido não perde
      // cliques no mesmo frame; o combo encadeia todos.
      if (e.button === 0) { this._clicked = true;      this._clicks      = (this._clicks      || 0) + 1; }
      if (e.button === 2) { this._rightClicked = true; this._rightClicks = (this._rightClicks || 0) + 1; }
    });

    // Impede menu de contexto do browser no canvas durante o jogo
    canvas.addEventListener('contextmenu', e => {
      if (this.gameActive) e.preventDefault();
    });

    // ── Scroll do mouse → troca de arma ──────────────────────────────
    window.addEventListener('wheel', e => {
      if (!this.gameActive) return;
      this._wheelDelta += Math.sign(e.deltaY);
    }, { passive: true });

    // ── Pointer lock change ─────────────────────────────────────────
    // O browser libera o pointer lock quando o usuário pressiona ESC,
    // alt-tab, clica fora da janela, etc.
    // Nesse caso precisamos sincronizar nosso estado gameActive.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.gameActive) {
        // Lock foi liberado pelo browser → pausa o jogo
        this._internalDeactivate();
      }
    });
  }

  // ── Solicita pointer lock no canvas ──────────────────────────────
  _requestLock() {
    try {
      this.canvas.focus();              // garante foco no elemento
      this.canvas.requestPointerLock(); // API simples, síncrona, confiável
    } catch (_) {}
  }

  // ── Deactivation interna (usada pelo pointerlockchange) ──────────
  _internalDeactivate() {
    this.gameActive = false;
    document.body.classList.remove('game-active');
    this._mouseX = 0; this._mouseY = 0; this._clicked = false;
    this.onDeactivated?.();   // notifica main.js para atualizar a UI
  }

  /** Liga — gameActive=true, esconde cursor, pede pointer lock */
  activate() {
    this.gameActive = true;
    document.body.classList.add('game-active');
    this._requestLock();
  }

  /** Pausa manualmente — mostra cursor, libera pointer lock */
  deactivate() {
    this.gameActive = false;
    document.body.classList.remove('game-active');
    try { document.exitPointerLock?.(); } catch (_) {}
    this._mouseX = 0; this._mouseY = 0; this._clicked = false;
    // Não chama onDeactivated aqui pois quem chamou deactivate() já sabe
  }

  toggle() {
    if (this.gameActive) this.deactivate();
    else                 this.activate();
  }

  isDown(code) { return !!this.keys[code]; }

  consumeMouseDelta() {
    const dx = this._mouseX, dy = this._mouseY;
    this._mouseX = 0; this._mouseY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this._clicked;
    this._clicked = false; this._clicks = 0;
    return c;
  }

  consumeRightClick() {
    const c = this._rightClicked;
    this._rightClicked = false; this._rightClicks = 0;
    return c;
  }

  /** Quantos cliques esquerdos desde o último consumo (p/ combo mashing). */
  consumeClickCount() {
    const n = this._clicks || 0;
    this._clicks = 0; this._clicked = false;
    return n;
  }

  /** Quantos cliques direitos desde o último consumo. */
  consumeRightClickCount() {
    const n = this._rightClicks || 0;
    this._rightClicks = 0; this._rightClicked = false;
    return n;
  }

  consumeDoubleTapW() {
    const c = this._wDoubleTap;
    this._wDoubleTap = false;
    return c;
  }

  /** Retorna o acumulado de scroll desde a última chamada (-n / +n) e zera */
  consumeWheel() {
    const w = this._wheelDelta;
    this._wheelDelta = 0;
    return w;
  }
}
