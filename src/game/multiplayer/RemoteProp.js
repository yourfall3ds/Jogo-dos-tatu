// ─────────────────────────────────────────────────────────────────
//  RemoteProp — objeto destrutível server-authoritative.
//
//  Estado vem do servidor (state.props). Hit detection client-side
//  dispara cs.sendHitProp(propId, weapon). Quebra é decidida no server.
// ─────────────────────────────────────────────────────────────────

const KIND_BUILDERS = {
  barrel: (scene, id) => {
    const m = BABYLON.MeshBuilder.CreateCylinder(`prop_${id}`, {
      height: 1.2, diameter: 0.85, tessellation: 12,
    }, scene);
    m.position.y = 0.6;
    const mat = new BABYLON.StandardMaterial(`pm_${id}`, scene);
    mat.diffuseColor = new BABYLON.Color3(0.55, 0.30, 0.12);
    mat.specularColor = new BABYLON.Color3(0.1, 0.08, 0.05);
    m.material = mat;
    return m;
  },
  crate: (scene, id) => {
    const m = BABYLON.MeshBuilder.CreateBox(`prop_${id}`, { size: 0.9 }, scene);
    m.position.y = 0.45;
    const mat = new BABYLON.StandardMaterial(`pm_${id}`, scene);
    mat.diffuseColor = new BABYLON.Color3(0.45, 0.32, 0.16);
    mat.specularColor = new BABYLON.Color3(0.1, 0.08, 0.05);
    m.material = mat;
    return m;
  },
};

export class RemoteProp {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.id = state.id;
    this.kind = state.kind;
    this.broken = false;

    this.root = new BABYLON.TransformNode(`propRoot_${this.id}`, scene);
    this.root.position.set(state.x || 0, state.y || 0, state.z || 0);

    const builder = KIND_BUILDERS[state.kind] || KIND_BUILDERS.barrel;
    this.mesh = builder(scene, this.id);
    this.mesh.parent = this.root;
    this.mesh.checkCollisions = true;
    this.mesh.isPickable = true;
    this.mesh._isRemoteProp = true;
    this.mesh._propRef = this;

    // Mini HP bar acima quando danificado
    this._hpBg = null;
    this._hpFill = null;
    this._lastHp = state.hp;
    this._maxHp = state.maxHp || state.hp || 1;
  }

  /** Recebe `prop_change` do ColyseusClient. */
  onSchemaChange(field) {
    if (field === 'hp') this._applyHp(this.state.hp);
    if (field === 'broken') this._applyBroken(this.state.broken === true);
  }

  _applyHp(hp) {
    this._lastHp = hp;
    // Visual: cor escurece e leve shake quando perde HP
    const pct = hp / Math.max(1, this._maxHp);
    if (this.mesh?.material) {
      const m = this.mesh.material;
      // Fica mais escuro conforme HP cai
      const k = 0.35 + 0.65 * pct;
      const base = this.kind === 'barrel' ? [0.55, 0.30, 0.12] : [0.45, 0.32, 0.16];
      m.diffuseColor.set(base[0] * k, base[1] * k, base[2] * k);
    }
  }

  _applyBroken(broken) {
    if (this.broken || !broken) return;
    this.broken = true;
    // Esconde o mesh (server vai despawn em 5s)
    if (this.mesh) {
      this.mesh.setEnabled(false);
      this.mesh.isPickable = false;
    }
  }

  dispose() {
    try { this.mesh?.dispose(); } catch (_) {}
    try { this.root?.dispose(); } catch (_) {}
  }
}
