// ─────────────────────────────────────────────────────────────────
//  WorldPortal — portal monstrão no mapa atual que leva ao mundo de
//  biomas. Efeitos: disco brilhante girando, anel emissivo, coluna de
//  partículas, luz pulsante. Detecta quando o player entra (proximidade)
//  e dispara o callback de transição.
// ─────────────────────────────────────────────────────────────────

export class WorldPortal {
  /**
   * @param {object} scene  Babylon scene
   * @param {BABYLON.Vector3} pos  onde fica o portal no mapa
   * @param {() => void} onEnter  chamado quando o player entra no portal
   */
  constructor(scene, pos, onEnter) {
    this.scene = scene;
    this.pos = pos.clone();
    this.onEnter = onEnter || (() => {});
    this._entered = false;
    this._t = 0;
    this.root = new BABYLON.TransformNode('worldPortal', scene);
    this.root.position.copyFrom(this.pos);
    this._build();
  }

  _build() {
    const scene = this.scene;

    // ── Disco do portal (plano emissivo girando, gradiente roxo/ciano) ──
    const disc = BABYLON.MeshBuilder.CreateDisc('portalDisc', { radius: 2.6, tessellation: 48 }, scene);
    disc.parent = this.root;
    disc.position.y = 2.8;
    disc.rotation.x = 0;                 // de pé (encara o player)
    const dm = new BABYLON.StandardMaterial('portalDiscMat', scene);
    dm.emissiveColor = new BABYLON.Color3(0.45, 0.2, 0.9);
    dm.diffuseColor = new BABYLON.Color3(0.1, 0.05, 0.2);
    dm.disableLighting = true;
    dm.alpha = 0.82;
    dm.backFaceCulling = false;
    disc.material = dm;
    this._disc = disc;
    this._discMat = dm;

    // ── Anel emissivo (torus) em volta ──
    const ring = BABYLON.MeshBuilder.CreateTorus('portalRing',
      { diameter: 6.0, thickness: 0.45, tessellation: 40 }, scene);
    ring.parent = this.root;
    ring.position.y = 2.8;
    ring.rotation.x = Math.PI / 2;
    const rm = new BABYLON.StandardMaterial('portalRingMat', scene);
    rm.emissiveColor = new BABYLON.Color3(0.35, 0.7, 1.0);
    rm.disableLighting = true;
    ring.material = rm;
    this._ring = ring;

    // ── Base/pedestal (cilindro escuro) ──
    const base = BABYLON.MeshBuilder.CreateCylinder('portalBase',
      { height: 0.5, diameterTop: 5.2, diameterBottom: 6.2, tessellation: 24 }, scene);
    base.parent = this.root;
    base.position.y = 0.25;
    const bm = new BABYLON.StandardMaterial('portalBaseMat', scene);
    bm.diffuseColor = new BABYLON.Color3(0.06, 0.06, 0.09);
    bm.emissiveColor = new BABYLON.Color3(0.1, 0.04, 0.16);
    base.material = bm;

    // ── Coluna de partículas subindo ──
    try {
      const ps = new BABYLON.ParticleSystem('portalFx', 600, scene);
      ps.particleTexture = null;
      ps.emitter = this.root;
      ps.minEmitBox = new BABYLON.Vector3(-2.2, 0.2, -0.2);
      ps.maxEmitBox = new BABYLON.Vector3(2.2, 0.4, 0.2);
      ps.color1 = new BABYLON.Color4(0.5, 0.3, 1.0, 0.8);
      ps.color2 = new BABYLON.Color4(0.3, 0.7, 1.0, 0.8);
      ps.colorDead = new BABYLON.Color4(0.1, 0.1, 0.3, 0);
      ps.minSize = 0.12; ps.maxSize = 0.4;
      ps.minLifeTime = 0.8; ps.maxLifeTime = 1.8;
      ps.emitRate = 220;
      ps.direction1 = new BABYLON.Vector3(-0.3, 4, -0.3);
      ps.direction2 = new BABYLON.Vector3(0.3, 6, 0.3);
      ps.gravity = new BABYLON.Vector3(0, 1.5, 0);
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
      ps.start();
      this._ps = ps;
    } catch (_) {}

    // ── Luz pulsante ──
    try {
      const light = new BABYLON.PointLight('portalLight',
        this.pos.add(new BABYLON.Vector3(0, 3, 0)), scene);
      light.diffuse = new BABYLON.Color3(0.5, 0.4, 1.0);
      light.intensity = 0.8;
      light.range = 18;
      this._light = light;
    } catch (_) {}

    // ── Prompt flutuante ──
    const tag = new BABYLON.TransformNode('portalTag', scene);
    tag.parent = this.root;

    // Anima no render loop.
    this._obs = scene.onBeforeRenderObservable.add(() => this._tick());
  }

  _tick() {
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this._t += dt;
    // disco e anel girando, pulso de brilho
    if (this._disc) this._disc.rotation.z += dt * 1.2;
    if (this._ring) this._ring.rotation.y += dt * 0.6;
    const pulse = 0.6 + Math.sin(this._t * 3) * 0.25;
    if (this._discMat) this._discMat.emissiveColor.set(0.45 * pulse + 0.2, 0.2 * pulse, 0.9 * pulse + 0.1);
    if (this._light) this._light.intensity = 0.6 + Math.sin(this._t * 3) * 0.3;

    // detecção de entrada: player perto o suficiente
    if (this._entered) return;
    const p = window._gamePlayer?.mesh?.position;
    if (!p) return;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < 2.4 * 2.4) {                     // raio de gatilho ~2.4m
      this._entered = true;
      try { this.onEnter(); } catch (e) { console.error('[Portal] onEnter:', e); }
    }
  }

  /** rearма o portal (pra poder entrar de novo). */
  rearm() { this._entered = false; }

  dispose() {
    try { this.scene.onBeforeRenderObservable.remove(this._obs); } catch (_) {}
    try { this._ps?.dispose(); } catch (_) {}
    try { this._light?.dispose(); } catch (_) {}
    try { this.root.dispose(); } catch (_) {}
  }
}
