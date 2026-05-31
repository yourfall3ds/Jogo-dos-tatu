export class AnimationController {
  constructor(library) {
    this.library = library;
    this.currentAnim = null;
    this.currentName = "";

    // ── Crossfade por peso (acaba com o "robótico") ──────────────────
    // A animação saindo (prev) faz fade-out enquanto a nova (cur) faz
    // fade-in. Ambas tocam simultaneamente — Babylon blenda.
    this._prev    = null;
    this._fadeT   = 0;
    this._fadeDur = 0;
  }

  /**
   * Toca uma animação por nome com crossfade.
   * options: { loop, speed, fade, onComplete }
   *   fade = duração do crossfade em segundos (default 0.12)
   */
  play(name, options = {}) {
    const loop  = options.loop  !== false;        // default true
    const speed = options.speed ?? 1.0;
    const fade  = options.fade  ?? 0.12;

    // Já tocando esta animação em loop → não reinicia, mas ATUALIZA a
    // velocidade (pra run/walk acelerarem junto com o movimento — senão a
    // passada fica travada na velocidade do primeiro play).
    if (this.currentName === name && loop) {
      if (this.currentAnim && options.speed != null) {
        try { this.currentAnim.speedRatio = options.speed; } catch (_) {}
      }
      return;
    }

    const anim = this.library.get(name);
    if (!anim) {
      console.warn(`[AnimationController] Animação '${name}' não encontrada!`);
      if (options.onComplete) options.onComplete();
      return;
    }

    // Mesmo grupo já é o atual → só atualiza o nome
    if (this.currentAnim === anim) { this.currentName = name; return; }

    // Descarta um fade-out anterior ainda em andamento
    if (this._prev && this._prev !== anim) {
      this._prev.setWeightForAllAnimatables(0);
      this._prev.stop();
    }
    // A animação atual vira o "prev" (vai fazer fade-out)
    this._prev = this.currentAnim;

    // Inicia a nova com peso 0 (sobe via update)
    anim.start(loop, speed, anim.from, anim.to, false);
    anim.setWeightForAllAnimatables(fade > 0 ? 0 : 1);

    this.currentAnim = anim;
    this.currentName  = name;
    this._fadeT   = 0;
    this._fadeDur = fade;

    // Callback de fim (usado pelos ataques para encadear combos).
    // onAnimationGroupEndObservable = fim do GRUPO inteiro (mais confiável
    // que onAnimationEndObservable, que dispara por animação-osso).
    if (!loop && options.onComplete) {
      const obs = anim.onAnimationGroupEndObservable || anim.onAnimationEndObservable;
      obs.addOnce(() => options.onComplete());
    }
  }

  /** Duração (em segundos) de uma animação, p/ timeouts de segurança */
  getDuration(name) {
    const anim = this.library.get(name);
    if (!anim) return 0;
    const fps = anim.targetedAnimations?.[0]?.animation?.framePerSecond || 60;
    return Math.abs((anim.to - anim.from) / fps);
  }

  /** Tick do crossfade — chamar a cada frame com dt em segundos */
  update(dt) {
    if (this._fadeDur <= 0 || this._fadeT >= this._fadeDur) return;
    this._fadeT += dt;
    const t = Math.min(this._fadeT / this._fadeDur, 1);
    const e = t * t * (3 - 2 * t);   // smoothstep

    if (this.currentAnim) this.currentAnim.setWeightForAllAnimatables(e);
    if (this._prev)       this._prev.setWeightForAllAnimatables(1 - e);

    if (t >= 1) {
      if (this._prev) {
        this._prev.setWeightForAllAnimatables(0);
        this._prev.stop();
        this._prev = null;
      }
      if (this.currentAnim) this.currentAnim.setWeightForAllAnimatables(1);
      this._fadeDur = 0;
    }
  }

  /**
   * Mistura/decide a locomoção com base na velocidade de input.
   * Walk/run são in-place — o player é movido pelo código.
   */
  updateLocomotion(moveAmount) {
    if (moveAmount < 0.1) {
      this.play("idle", { loop: true, speed: 1.0, fade: 0.20 });
    } else if (moveAmount < 0.45) {
      // bem devagar (strafe/desacelerando) → andar
      this.play("walk", { loop: true, speed: Math.max(0.8, moveAmount * 2.2), fade: 0.16 });
    } else if (moveAmount < 1.18) {
      // velocidade NORMAL → corrida normal
      this.play("run", { loop: true, speed: 0.9 + moveAmount * 0.3, fade: 0.18 });
    } else {
      // SPRINT (segurando Shift, speed > ~13) → run_fast (corrida acelerada)
      const runAnim = this.library.has('run_fast') ? 'run_fast' : 'run';
      this.play(runAnim, { loop: true, speed: 1.0 + (moveAmount - 1.18) * 0.5, fade: 0.16 });
    }
  }

  stopAll() {
    if (this._prev) { this._prev.stop(); this._prev = null; }
    if (this.currentAnim) { this.currentAnim.stop(); this.currentAnim = null; }
    this.currentName = "";
    this._fadeDur = 0;
  }
}
