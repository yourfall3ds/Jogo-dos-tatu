// ─────────────────────────────────────────────────────────────────
//  RemoteDrop — visual de drop server-authoritative.
//
//  Lê DropState (id/kind/value/x/y/z). Mesh procedural simples:
//   - coin: moeda dourada girando
//   - gem: gema azul flutuante
//   - hp_potion: garrafa vermelha
//   - mp_potion: garrafa azul
//
//  Pickup quando jogador local chega perto: chama mp.sendPickup(id).
//  Servidor valida range, deleta do state, broadcasta 'pickup'.
// ─────────────────────────────────────────────────────────────────

const KIND_COLORS = {
  coin:      { d: [1.0, 0.85, 0.20], e: [0.50, 0.40, 0.05], shape: 'cylinder' },
  gem:       { d: [0.30, 0.70, 1.0], e: [0.10, 0.30, 0.50], shape: 'octahedron' },
  hp_potion: { d: [0.95, 0.20, 0.25], e: [0.40, 0.05, 0.08], shape: 'capsule' },
  mp_potion: { d: [0.25, 0.40, 1.0], e: [0.08, 0.15, 0.40], shape: 'capsule' },
  material:  { d: [0.65, 0.60, 0.55], e: [0.20, 0.18, 0.15], shape: 'box' },
};

export class RemoteDrop {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.id = state.id;
    this.kind = state.kind;
    this.value = state.value || 1;
    this._collected = false;

    this.root = new BABYLON.TransformNode(`drop_${this.id}`, scene);
    this.root.position.set(state.x || 0, state.y || 0.3, state.z || 0);

    const cfg = KIND_COLORS[this.kind] || KIND_COLORS.coin;
    let mesh;
    if (cfg.shape === 'cylinder') {
      mesh = BABYLON.MeshBuilder.CreateCylinder(`drop_mesh_${this.id}`, {
        height: 0.10, diameter: 0.35, tessellation: 16,
      }, scene);
    } else if (cfg.shape === 'octahedron') {
      mesh = BABYLON.MeshBuilder.CreatePolyhedron(`drop_mesh_${this.id}`, { type: 1, size: 0.18 }, scene);
    } else if (cfg.shape === 'capsule') {
      mesh = BABYLON.MeshBuilder.CreateCapsule(`drop_mesh_${this.id}`, {
        radius: 0.10, height: 0.30, tessellation: 12,
      }, scene);
    } else {
      mesh = BABYLON.MeshBuilder.CreateBox(`drop_mesh_${this.id}`, { size: 0.25 }, scene);
    }
    mesh.parent = this.root;
    mesh.position.y = 0.4;

    const mat = new BABYLON.StandardMaterial(`drop_mat_${this.id}`, scene);
    mat.diffuseColor = new BABYLON.Color3(...cfg.d);
    mat.emissiveColor = new BABYLON.Color3(...cfg.e);
    mat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
    mat.specularPower = 64;
    mesh.material = mat;
    mesh.isPickable = false;
    this.mesh = mesh;

    // Glow beam (cylinder semi-transparente vertical pra destacar à distância)
    const beam = BABYLON.MeshBuilder.CreateCylinder(`drop_beam_${this.id}`, {
      height: 2.5, diameter: 0.18, tessellation: 8,
    }, scene);
    beam.parent = this.root;
    beam.position.y = 1.2;
    const bmat = new BABYLON.StandardMaterial(`drop_beammat_${this.id}`, scene);
    bmat.diffuseColor = new BABYLON.Color3(...cfg.d);
    bmat.emissiveColor = new BABYLON.Color3(cfg.d[0] * 0.7, cfg.d[1] * 0.7, cfg.d[2] * 0.7);
    bmat.specularColor = BABYLON.Color3.Black();
    bmat.alpha = 0.22;
    bmat.backFaceCulling = false;
    beam.material = bmat;
    beam.isPickable = false;
    this.beam = beam;

    this._spinT = Math.random() * Math.PI * 2; // offset pra não ficarem todos sincronizados
    this._bobT = Math.random() * Math.PI * 2;

    // Atualiza posição se o state mudar
    if (typeof state.listen === 'function') {
      state.listen('x', () => this.root.position.x = state.x);
      state.listen('y', () => this.root.position.y = state.y);
      state.listen('z', () => this.root.position.z = state.z);
    }
  }

  /** Distância XZ entre o drop e o player local. */
  distanceTo(playerPos) {
    if (!playerPos) return Infinity;
    const dx = this.root.position.x - playerPos.x;
    const dz = this.root.position.z - playerPos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  update(dt) {
    // Spin + bob
    this._spinT += dt * 2.5;
    this._bobT += dt * 2.0;
    if (this.mesh) {
      this.mesh.rotation.y = this._spinT;
      this.mesh.position.y = 0.4 + Math.sin(this._bobT) * 0.08;
    }
  }

  dispose() {
    try { this.mesh?.dispose(); } catch (_) {}
    try { this.beam?.dispose(); } catch (_) {}
    try { this.root?.dispose(); } catch (_) {}
  }
}
