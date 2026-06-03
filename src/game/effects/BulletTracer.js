// BulletTracer — linha amarela curta + impact spark
let _tracerSeq = 0;

export class BulletTracer {
  constructor(scene) { this.scene = scene; this._mat = null; }
  _ensureMaterial() {
    if (this._mat) return this._mat;
    const m = new BABYLON.StandardMaterial("bullet_tracer_mat", this.scene);
    m.emissiveColor = new BABYLON.Color3(1, 0.85, 0.2);
    m.disableLighting = true;
    this._mat = m;
    return m;
  }
  spawn(from, to) {
    if (!from || !to) return;
    const points = [from.clone(), to.clone()];
    const id = "tracer_" + (++_tracerSeq);
    const line = BABYLON.MeshBuilder.CreateLines(id, { points, updatable: false }, this.scene);
    line.color = new BABYLON.Color3(1, 0.85, 0.2);
    setTimeout(() => { try { line.dispose(); } catch (_) {} }, 80);
  }
  spawnImpact(at) {
    if (!at) return;
    const id = "impact_" + (++_tracerSeq);
    const s = BABYLON.MeshBuilder.CreateSphere(id, { diameter: 0.3, segments: 6 }, this.scene);
    s.position.copyFrom(at);
    s.material = this._ensureMaterial();
    setTimeout(() => { try { s.dispose(); } catch (_) {} }, 120);
  }
}
