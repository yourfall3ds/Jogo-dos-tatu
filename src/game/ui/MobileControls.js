// ─────────────────────────────────────────────────────────────────
//  MobileControls — controles na tela pra jogar no CELULAR (de lado).
//   • Joystick virtual (esquerda) → andar (WASD virtual)
//   • Olhar: arrastar na metade direita da tela → mira/câmera
//   • Botões (direita): Atacar, Pular, Esquiva, Skill
//
//  Injeta teclas virtuais no InputManager (this.keys / cliques) pra reusar
//  TODA a lógica de gameplay que já existe (não duplica nada).
//  Só ativa quando window._isMobile === true.
// ─────────────────────────────────────────────────────────────────
export class MobileControls {
  constructor(input) {
    this.input = input;
    this._joyVec = { x: 0, y: 0 };
    this._build();
    this._wireJoystick();
    this._wireLook();
  }

  _build() {
    const wrap = document.createElement('div');
    wrap.id = 'mobile-controls';
    wrap.style.cssText = `
      position: fixed; inset: 0; z-index: 150; pointer-events: none;
      font-family: 'Oswald','Segoe UI',sans-serif; user-select: none;
      -webkit-user-select: none; touch-action: none;`;
    wrap.innerHTML = `
      <!-- Joystick (esquerda) -->
      <div id="mc-joy-base" style="position:absolute;left:5vw;bottom:9vh;
        width:34vw;max-width:170px;aspect-ratio:1;border-radius:50%;
        background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.25);
        pointer-events:auto;touch-action:none;">
        <div id="mc-joy-stick" style="position:absolute;left:50%;top:50%;
          width:42%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);
          background:rgba(120,200,255,.55);border:2px solid rgba(255,255,255,.5);
          box-shadow:0 0 16px rgba(90,180,255,.6);"></div>
      </div>

      <!-- Botões de ação (direita) -->
      <div style="position:absolute;right:5vw;bottom:8vh;display:grid;
        grid-template-columns:repeat(2,1fr);gap:14px;pointer-events:auto;">
        ${this._btn('mc-attack', '⚔', '#ff5a5a')}
        ${this._btn('mc-jump',   '⤴', '#5cc8ff')}
        ${this._btn('mc-dodge',  '🌀', '#ffd24a')}
        ${this._btn('mc-skill',  '✦', '#9b6bff')}
      </div>`;
    document.body.appendChild(wrap);
    this._wrap = wrap;
    this._joyBase = wrap.querySelector('#mc-joy-base');
    this._joyStick = wrap.querySelector('#mc-joy-stick');

    // botões → teclas/cliques virtuais
    this._bindButton('mc-attack', () => this._fire(true), () => this._fire(false));
    this._bindButton('mc-jump',  () => this._key('Space', true), () => this._key('Space', false));
    this._bindButton('mc-dodge', () => this._key('KeyC', true), () => this._key('KeyC', false));
    this._bindButton('mc-skill', () => this._key('KeyZ', true), () => this._key('KeyZ', false));
  }

  _btn(id, glyph, color) {
    return `<button id="${id}" style="width:72px;height:72px;border-radius:50%;
      border:2px solid ${color};background:rgba(10,14,26,.55);color:${color};
      font-size:30px;line-height:1;touch-action:none;
      box-shadow:0 0 14px ${color}66;">${glyph}</button>`;
  }

  _bindButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); el.style.filter = 'brightness(1.5)'; onDown(); };
    const up = (e) => { e.preventDefault(); el.style.filter = ''; onUp(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
  }

  // ── Joystick → WASD virtual ──────────────────────────────────────
  _wireJoystick() {
    const base = this._joyBase, stick = this._joyStick;
    let active = false, cx = 0, cy = 0, R = 60;

    const start = (e) => {
      active = true;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2;
      move(e);
    };
    const move = (e) => {
      if (!active) return;
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      let dx = (t.clientX) - cx, dy = (t.clientY) - cy;
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, R);
      dx = dx / d * cl; dy = dy / d * cl;
      stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this._joyVec.x = dx / R; this._joyVec.y = dy / R;
      this._applyJoystickKeys();
    };
    const end = (e) => {
      active = false;
      stick.style.transform = 'translate(-50%,-50%)';
      this._joyVec.x = 0; this._joyVec.y = 0;
      this._applyJoystickKeys();
    };
    base.addEventListener('touchstart', start, { passive: false });
    base.addEventListener('touchmove', move, { passive: false });
    base.addEventListener('touchend', end, { passive: false });
    base.addEventListener('touchcancel', end, { passive: false });
    base.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    // Guarda refs pra remover no dispose() (window listeners vazam senão).
    this._winMove = move;
    this._winUp = end;
  }

  /** Converte o vetor do joystick em teclas WASD (limiar 0.3). */
  _applyJoystickKeys() {
    const { x, y } = this._joyVec;
    const TH = 0.3;
    this._key('KeyW', y < -TH);
    this._key('KeyS', y > TH);
    this._key('KeyA', x < -TH);
    this._key('KeyD', x > TH);
  }

  // ── Olhar: arrastar na metade direita move a câmera ──────────────
  _wireLook() {
    let lastX = 0, lastY = 0, looking = false, touchId = null;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        // só a metade direita da tela é "olhar" (esquerda é joystick/botões)
        if (t.clientX > window.innerWidth * 0.45 && !this._onButton(t.target)) {
          looking = true; touchId = t.identifier;
          lastX = t.clientX; lastY = t.clientY;
        }
      }
    };
    const onMove = (e) => {
      if (!looking) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        // injeta no acumulador de mira do InputManager
        try { this.input._mouseX += dx * 1.4; this.input._mouseY += dy * 1.4; } catch (_) {}
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === touchId) { looking = false; touchId = null; }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    this._winTouchStart = onStart;
    this._winTouchMove = onMove;
    this._winTouchEnd = onEnd;
  }

  /** Remove os listeners de window (mousemove/mouseup + touch*) que de outra
   *  forma vazam quando o componente é destruído. */
  dispose() {
    if (this._winMove) window.removeEventListener('mousemove', this._winMove);
    if (this._winUp) window.removeEventListener('mouseup', this._winUp);
    if (this._winTouchStart) window.removeEventListener('touchstart', this._winTouchStart);
    if (this._winTouchMove) window.removeEventListener('touchmove', this._winTouchMove);
    if (this._winTouchEnd) {
      window.removeEventListener('touchend', this._winTouchEnd);
      window.removeEventListener('touchcancel', this._winTouchEnd);
    }
    this._winMove = this._winUp = null;
    this._winTouchStart = this._winTouchMove = this._winTouchEnd = null;
  }

  _onButton(el) {
    return !!(el?.closest && el.closest('#mobile-controls button, #mc-joy-base'));
  }

  // ── Injeção de input (reusa a lógica de teclado/mouse existente) ──
  _key(code, down) {
    try {
      this.input.keys[code] = !!down;
    } catch (_) {}
  }
  _fire(down) {
    try {
      if (down) { this.input._clicked = true; this.input._clicks = (this.input._clicks || 0) + 1; this.input._leftHeld = true; }
      else { this.input._leftHeld = false; }
    } catch (_) {}
  }

  show() { this._wrap.style.display = 'block'; }
  hide() { this._wrap.style.display = 'none'; }
}
