// ─────────────────────────────────────────────────────────────────
//  ColliderDebug — visualiza os colliders da cena (tecla L)
//
//  • Ellipsoid AMARELO  = a forma REAL de colisão (moveWithCollisions
//    usa o ellipsoid, NÃO o box). É aqui que mora o bug das pedras:
//    se o ellipsoid é menor/maior que o visual, o objeto flutua/afunda.
//  • Box VERMELHO        = corpo físico invisível (GameObject *_col).
//  • Wireframe VERDE      = malha estática com checkCollisions.
//
//  Reutiliza helpers (não recria por frame) e segue os objetos que se
//  movem. Toggle por L ou window._colliderDebug.toggle().
// ─────────────────────────────────────────────────────────────────
export class ColliderDebug {
  constructor(scene) {
    this.scene    = scene;
    this.on       = false;
    this._obs     = null;
    this._helpers = new Map();   // mesh.uniqueId → { ell, box }
    this._mats    = {};
  }

  toggle() { this.on ? this.disable() : this.enable(); }

  enable() {
    if (this.on) return;
    this.on = true;
    this._obs = this.scene.onBeforeRenderObservable.add(() => this._update());
    console.log('[ColliderDebug] 🟡 ON — amarelo=ellipsoid, ciano=corpo Havok, vermelho=dinâmico, verde=estático');
  }

  disable() {
    this.on = false;
    if (this._obs) { this.scene.onBeforeRenderObservable.remove(this._obs); this._obs = null; }
    for (const h of this._helpers.values()) {
      try { h.ell?.dispose(); } catch (_) {}
      try { h.box?.dispose(); } catch (_) {}
    }
    this._helpers.clear();
    console.log('[ColliderDebug] ⚫ OFF');
  }

  _mat(key, rgb) {
    if (this._mats[key]) return this._mats[key];
    const m = new BABYLON.StandardMaterial('_dbgmat_' + key, this.scene);
    m.emissiveColor   = new BABYLON.Color3(...rgb);
    m.diffuseColor    = new BABYLON.Color3(...rgb);
    m.wireframe       = true;
    m.disableLighting = true;
    m.alpha           = 0.9;
    this._mats[key]   = m;
    return m;
  }

  _update() {
    const seen = new Set();

    for (const m of this.scene.meshes) {
      if (m.name.startsWith('_dbg')) continue;
      // Mostra: (a) checkCollisions (Babylon legado) OU (b) corpo físico Havok.
      //  Corpos Havok têm checkCollisions=false → eram INVISÍVEIS aqui antes
      //  (a causa do "algo invisível me bloqueia e o L não mostra nada").
      const hasHavok = !!(m.physicsBody || m._staticBody);
      if (!m.checkCollisions && !hasHavok) continue;
      seen.add(m.uniqueId);

      let h = this._helpers.get(m.uniqueId);
      if (!h) { h = {}; this._helpers.set(m.uniqueId, h); }

      // cor: ROXO/ciano = corpo Havok · vermelho = corpo dinâmico · verde = estático
      const isPhysBody = hasHavok || (m.name.includes('_col') && m.isVisible === false);
      const bodyKey    = hasHavok ? 'havok' : (isPhysBody ? 'phys' : 'static');
      const bodyRGB    = hasHavok ? [0.3, 0.85, 1] : (isPhysBody ? [1, 0.2, 0.2] : [0.2, 1, 0.3]);
      const pos = m.getAbsolutePosition();

      // ── Ellipsoid (forma REAL de colisão moveWithCollisions) — amarelo ──
      //  Só faz sentido p/ colisão legada; corpos Havok não usam ellipsoid.
      const e = m.checkCollisions ? m.ellipsoid : null;
      if (e) {
        if (!h.ell) {
          h.ell = BABYLON.MeshBuilder.CreateSphere('_dbgell', { segments: 8, diameter: 1 }, this.scene);
          h.ell.material  = this._mat('ell', [1, 0.85, 0]);
          h.ell.isPickable = false;
        }
        h.ell.scaling.set(e.x * 2, e.y * 2, e.z * 2);
        h.ell.position.copyFrom(pos).addInPlace(m.ellipsoidOffset || BABYLON.Vector3.Zero());
      }

      // ── Box do collider (físico=vermelho / estático=verde) ─────────
      if (!h.box) {
        h.box = BABYLON.MeshBuilder.CreateBox('_dbgbox', { size: 1 }, this.scene);
        h.box.isPickable = false;
      }
      h.box.material = this._mat(bodyKey, bodyRGB);
      // tamanho do box = bounding real do mesh
      const bi = m.getBoundingInfo().boundingBox;
      const size = bi.maximumWorld.subtract(bi.minimumWorld);
      h.box.scaling.set(Math.max(0.05, size.x), Math.max(0.05, size.y), Math.max(0.05, size.z));
      h.box.position.copyFrom(bi.centerWorld);
    }

    // Remove helpers de meshes que sumiram
    for (const [id, h] of this._helpers) {
      if (!seen.has(id)) {
        try { h.ell?.dispose(); } catch (_) {}
        try { h.box?.dispose(); } catch (_) {}
        this._helpers.delete(id);
      }
    }
  }
}
