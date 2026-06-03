// ─────────────────────────────────────────────────────────────────
//  Breakable — destruição estilo sandbox para objetos colocados.
//
//   • Bate em sequência → hp (em GOLPES) cai e RACHADURAS aparecem
//     (material escurece + brasa avermelhada cresce + "squash" no hit).
//   • Parou de bater por uns segundos → REGENERA (hp volta, rachadura some).
//   • hp chega a 0 → QUEBRA: chama onBreak() (dropa o asset pro inventário
//     + sincroniza/remoção) e some com uma animação curta.
//
//  O CombatSystem chama .hit() quando um golpe acerta uma malha taggeada
//  com `mesh._breakable = <instância>`.
// ─────────────────────────────────────────────────────────────────

const REGEN_DELAY_MS = 2200;   // tempo parado sem apanhar até começar a regenerar
const REGEN_STEP_MS  = 520;    // intervalo de cada +1 hp na regeneração

export class Breakable {
  /**
   * @param {BABYLON.TransformNode} root  raiz do objeto (será disposed ao quebrar)
   * @param {Array} meshes  malhas com material (pra tingir as rachaduras)
   * @param {{ hp?: number, onBreak?: Function }} opts
   */
  constructor(root, meshes, { hp = 5, onBreak = null } = {}) {
    this.root   = root;
    this.meshes = (meshes || []).filter(m => m && m.material);
    this.maxHp  = Math.max(1, hp | 0);
    this.hp     = this.maxHp;
    this.broken = false;
    this.onBreak = onBreak;
    this._regenTimer = null;
    this._regenInterval = null;
    this._mats = [];
    this._baseScale = root?.scaling ? root.scaling.clone() : null;
    this._captureMaterials();
  }

  _captureMaterials() {
    const seen = new Set();
    for (const m of this.meshes) {
      const mat = m.material;
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      const base = mat.albedoColor || mat.diffuseColor || null;   // PBR ou Standard
      const emis = mat.emissiveColor || null;
      this._mats.push({
        mat,
        base, baseOrig: base?.clone?.() || null,
        emis, emisOrig: emis?.clone?.() || null,
      });
    }
  }

  /** Aplica um golpe (1 hp). dmg/dir ignorados além do feedback. */
  hit() {
    if (this.broken) return;
    this.hp = Math.max(0, this.hp - 1);
    this._refreshDamageVisual();
    this._squash();
    if (this.hp <= 0) { this.break(); return; }
    this._scheduleRegen();
  }

  _refreshDamageVisual() {
    const pct = this.hp / this.maxHp;       // 1 = inteiro, 0 = destruído
    const dmg = 1 - pct;                     // 0..1 quão danificado
    for (const e of this._mats) {
      try {
        if (e.base && e.baseOrig) {
          const k = 0.40 + 0.60 * pct;       // escurece até 40% no talo
          e.base.set(e.baseOrig.r * k, e.baseOrig.g * k, e.baseOrig.b * k);
        }
        if (e.emis && e.emisOrig) {
          // brasa avermelhada de "rachadura quente" cresce com o dano
          e.emis.set(
            e.emisOrig.r + dmg * 0.55,
            e.emisOrig.g + dmg * 0.06,
            e.emisOrig.b + dmg * 0.04,
          );
        }
      } catch (_) {}
    }
  }

  /** "squash" rápido no impacto (feedback de pancada). */
  _squash() {
    const root = this.root;
    if (!root?.scaling || !this._baseScale) return;
    const b = this._baseScale;
    try { root.scaling.set(b.x * 1.08, b.y * 0.88, b.z * 1.08); } catch (_) {}
    const t0 = performance.now();
    const tick = () => {
      if (this.broken || !root?.scaling) return;
      const k = Math.min(1, (performance.now() - t0) / 120);
      const s = 1 + (1 - k) * 0; // restaura
      try {
        root.scaling.set(
          b.x + (b.x * 1.08 - b.x) * (1 - k),
          b.y + (b.y * 0.88 - b.y) * (1 - k),
          b.z + (b.z * 1.08 - b.z) * (1 - k),
        );
      } catch (_) {}
      if (k < 1) requestAnimationFrame(tick);
      else { try { root.scaling.copyFrom(b); } catch (_) {} }
    };
    requestAnimationFrame(tick);
  }

  _scheduleRegen() {
    this._clearRegen();
    this._regenTimer = setTimeout(() => {
      this._regenInterval = setInterval(() => {
        if (this.broken) { this._clearRegen(); return; }
        if (this.hp >= this.maxHp) { this._restoreVisual(); this._clearRegen(); return; }
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this._refreshDamageVisual();
      }, REGEN_STEP_MS);
    }, REGEN_DELAY_MS);
  }

  _restoreVisual() {
    for (const e of this._mats) {
      try {
        if (e.base && e.baseOrig) e.base.copyFrom(e.baseOrig);
        if (e.emis && e.emisOrig) e.emis.copyFrom(e.emisOrig);
      } catch (_) {}
    }
  }

  _clearRegen() {
    if (this._regenTimer) { clearTimeout(this._regenTimer); this._regenTimer = null; }
    if (this._regenInterval) { clearInterval(this._regenInterval); this._regenInterval = null; }
  }

  /** Quebra: dropa/sincroniza (onBreak) e some com animação curta. */
  break() {
    if (this.broken) return;
    this.broken = true;
    this._clearRegen();
    try { this.onBreak?.(); } catch (_) {}
    this._vanish();
  }

  _vanish() {
    const root = this.root;
    if (!root) return;
    const t0 = performance.now();
    const base = this._baseScale || (root.scaling ? root.scaling.clone() : null);
    const dur = 220;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      try {
        if (root.scaling && base) {
          const s = Math.max(0.001, 1 - k);
          root.scaling.set(base.x * s, base.y * s, base.z * s);
        }
      } catch (_) {}
      if (k < 1) requestAnimationFrame(tick);
      else { try { root.dispose(); } catch (_) {} }
    };
    requestAnimationFrame(tick);
  }

  /** Cleanup sem quebrar (objeto removido por undo/sync). */
  dispose() {
    this._clearRegen();
    this.broken = true;
  }
}
