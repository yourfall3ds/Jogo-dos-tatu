// ─────────────────────────────────────────────────────────────────
//  LayeredAnimator — animação em CAMADAS (upper/lower body split)
//
//  Técnica AAA sem Blender: toca duas animações ao mesmo tempo, cada
//  uma afetando só um conjunto de ossos (máscara). Ex:
//    • pernas (lower)  → walk/run/idle  (locomoção)
//    • tronco+braços (upper) → aim/shoot/reload  (mira)
//
//  Como funciona: um AnimationGroup tem `targetedAnimations` (osso→track).
//  Criamos um grupo NOVO copiando só as tracks cujo osso pertence à máscara.
//  Assim "walk" só mexe nas pernas e "aim_shoot" só mexe no tronco.
//
//  Grupos mascarados são criados sob demanda e cacheados por (nome+camada).
// ─────────────────────────────────────────────────────────────────

// Ossos da metade INFERIOR (pernas + quadril). Tudo que NÃO está aqui
// é considerado UPPER (tronco, braços, mãos, pescoço, cabeça).
const LOWER_BONES = new Set([
  'Hips',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]);

// O quadril (Hips) fica SÓ na camada lower (locomoção). Se ele entrasse
// na upper também, animações de tronco que giram o Hips (ex: aim_hold =
// "Gun_Hold_Left_Turn") fariam o personagem girar parado. Deixando o Hips
// exclusivo da lower, a base fica estável e a upper só anima do Spine pra cima.
const SHARED_BONES = new Set();

export class LayeredAnimator {
  constructor(library, scene) {
    this.library = library;
    this.scene = scene;
    this._cache = new Map();   // `${name}::${layer}` → AnimationGroup mascarado

    // Estado por camada
    this._cur = { lower: null, upper: null };
    this._curName = { lower: null, upper: null };
    this._prev = { lower: null, upper: null };
    this._fadeT = { lower: 0, upper: 0 };
    this._fadeDur = { lower: 0, upper: 0 };

    this._enabled = false;   // só ativa quando explicitamente ligado
  }

  get enabled() { return this._enabled; }

  /** Liga/desliga o modo em camadas. Ao desligar, para as duas camadas. */
  setEnabled(on) {
    if (this._enabled === on) return;
    this._enabled = on;
    if (!on) this.stopAll();
  }

  // ── Cria (ou pega do cache) um grupo mascarado ──────────────────
  _masked(name, layer) {
    const key = `${name}::${layer}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const src = this.library.get(name);
    if (!src) return null;

    const ag = new BABYLON.AnimationGroup(`${name}_${layer}`, this.scene);
    for (const ta of src.targetedAnimations) {
      const boneName = ta.target?.name ?? '';
      const isLower = LOWER_BONES.has(boneName);
      const isShared = SHARED_BONES.has(boneName);
      const want = layer === 'lower'
        ? (isLower || isShared)
        : (!isLower || isShared);   // upper = tudo que não é lower (+ shared)
      if (want) ag.addTargetedAnimation(ta.animation, ta.target);
    }
    if (ag.targetedAnimations.length === 0) { ag.dispose(); this._cache.set(key, null); return null; }
    // Herda o range trimado do grupo original (from/to) — respeita o trim
    // feito por AnimationLibrary.configure().
    try { ag.normalize(src.from, src.to); } catch (_) {}
    ag.stop();
    this._cache.set(key, ag);
    return ag;
  }

  // ── Toca uma animação numa camada específica ────────────────────
  playLayer(layer, name, { loop = true, speed = 1.0, fade = 0.15 } = {}) {
    if (this._curName[layer] === name && loop) return;
    const ag = this._masked(name, layer);
    if (!ag) return false;
    if (this._cur[layer] === ag) { this._curName[layer] = name; return true; }

    if (this._prev[layer] && this._prev[layer] !== ag) {
      this._prev[layer].setWeightForAllAnimatables(0);
      this._prev[layer].stop();
    }
    this._prev[layer] = this._cur[layer];

    ag.start(loop, speed, ag.from, ag.to, false);
    ag.setWeightForAllAnimatables(fade > 0 ? 0 : 1);

    this._cur[layer] = ag;
    this._curName[layer] = name;
    this._fadeT[layer] = 0;
    this._fadeDur[layer] = fade;
    return true;
  }

  /**
   * Conveniência: define as duas camadas de uma vez.
   *   lower = animação das pernas (locomoção)
   *   upper = animação do tronco (mira/tiro/recarga)
   */
  playSplit(lowerName, upperName, opts = {}) {
    this.playLayer('lower', lowerName, { ...opts, speed: opts.lowerSpeed ?? opts.speed ?? 1.0 });
    this.playLayer('upper', upperName, { ...opts, speed: opts.upperSpeed ?? 1.0 });
  }

  // ── Crossfade tick (por camada) ─────────────────────────────────
  update(dt) {
    for (const layer of ['lower', 'upper']) {
      if (this._fadeDur[layer] <= 0 || this._fadeT[layer] >= this._fadeDur[layer]) continue;
      this._fadeT[layer] += dt;
      const t = Math.min(this._fadeT[layer] / this._fadeDur[layer], 1);
      const e = t * t * (3 - 2 * t);
      if (this._cur[layer]) this._cur[layer].setWeightForAllAnimatables(e);
      if (this._prev[layer]) this._prev[layer].setWeightForAllAnimatables(1 - e);
      if (t >= 1) {
        if (this._prev[layer]) { this._prev[layer].setWeightForAllAnimatables(0); this._prev[layer].stop(); this._prev[layer] = null; }
        if (this._cur[layer]) this._cur[layer].setWeightForAllAnimatables(1);
        this._fadeDur[layer] = 0;
      }
    }
  }

  stopAll() {
    for (const layer of ['lower', 'upper']) {
      if (this._prev[layer]) { this._prev[layer].stop(); this._prev[layer] = null; }
      if (this._cur[layer]) { this._cur[layer].stop(); this._cur[layer] = null; }
      this._curName[layer] = null;
      this._fadeDur[layer] = 0;
    }
  }
}
