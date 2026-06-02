// ─────────────────────────────────────────────────────────────────
//  HitStop — freeze-frame de impacto (estilo Grand Chase / God of War)
//
//  Quando um golpe FORTE conecta, a tela CONGELA por alguns frames:
//    • para a lógica do jogo (o main loop pula os updates)
//    • congela TODAS as animações (scene.animationsEnabled = false)
//    • pausa a física (timestep 0)
//    • dá um "zoom punch" na câmera (close de impacto)
//    • flash branco + vinheta (aquele efeito de pancada)
//
//  Tudo volta sozinho quando o timer (em tempo REAL) zera.
//
//  Uso:
//    const hitStop = new HitStop(scene, engine, camera);
//    // no loop, ANTES da lógica:
//    const frozen = hitStop.update(dt);
//    if (!frozen) { player.update(dt); level.update(dt); ... }
//    // ao acertar forte:
//    hitStop.hit(0.11, { zoom: 0.10, flash: 0.32 });
// ─────────────────────────────────────────────────────────────────

export class HitStop {
  constructor(scene, engine, camera) {
    this.scene  = scene;
    this.engine = engine;
    this.camera = camera;

    this._t = 0;          // tempo restante de congelamento (s, tempo real)
    this._flash = 0;      // opacidade atual do flash
    this._fovSaved = null;
    this._stepSaved = null;

    this._buildOverlay();
  }

  /**
   * Dispara um freeze-frame.
   * @param {number} dur   duração em segundos (0.03 micro · 0.10+ forte)
   * @param {object} opts  { zoom: 0..0.2 (punch de FOV), flash: 0..1 }
   */
  hit(dur = 0.06, { zoom = 0, flash = 0 } = {}) {
    // Não empilha: pega o maior tempo (um crit no meio de micro-stops vence)
    this._t = Math.max(this._t, dur);

    // Congela animações + física
    if (this.scene.animationsEnabled !== false) {
      this.scene.animationsEnabled = false;
    }
    const pe = this.scene.getPhysicsEngine?.();
    if (pe && this._stepSaved == null) {
      this._stepSaved = pe.getTimeStep();
      pe.setTimeStep(0);
    }

    // Zoom punch (close de impacto) — a câmera segura congelada durante o freeze
    if (zoom > 0 && this.camera) {
      if (this._fovSaved == null) this._fovSaved = this.camera.fov;
      this.camera.fov = this._fovSaved * (1 - zoom);
    }

    // Flash + vinheta
    if (flash > 0) {
      this._flash = Math.max(this._flash, flash);
      this._overlay.style.opacity = String(this._flash);
      this._overlay.style.display = 'block';
    }
  }

  /** Tick com dt REAL. Retorna true enquanto está congelado (pule a lógica). */
  update(dt) {
    if (this._t <= 0) {
      // fade do flash residual (depois do descongelamento)
      if (this._flash > 0) {
        this._flash = Math.max(0, this._flash - dt * 3.5);
        this._overlay.style.opacity = String(this._flash);
        if (this._flash <= 0) this._overlay.style.display = 'none';
      }
      return false;
    }

    this._t -= dt;
    if (this._t <= 0) this._thaw();
    return this._t > 0;
  }

  /** Descongela: restaura animações, física, FOV. */
  _thaw() {
    this._t = 0;
    this.scene.animationsEnabled = true;
    const pe = this.scene.getPhysicsEngine?.();
    if (pe && this._stepSaved != null) {
      pe.setTimeStep(this._stepSaved);
      this._stepSaved = null;
    }
    if (this._fovSaved != null && this.camera) {
      this.camera.fov = this._fovSaved;   // o player reassume no próximo frame
      this._fovSaved = null;
    }
  }

  get active() { return this._t > 0; }

  _buildOverlay() {
    let el = document.getElementById('hitstop-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hitstop-overlay';
      el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:55', 'pointer-events:none',
        'display:none', 'opacity:0', 'mix-blend-mode:screen',
        // flash branco-quente no centro + vinheta escura nas bordas (close)
        'background:radial-gradient(circle at 50% 50%,' +
          'rgba(255,250,230,0.9) 0%, rgba(255,235,190,0.35) 22%, rgba(255,255,255,0) 55%)',
        'box-shadow:inset 0 0 220px 80px rgba(0,0,0,0.5)',
        'transition:opacity 0.04s linear'
      ].join(';');
      document.body.appendChild(el);
    }
    this._overlay = el;
  }
}
