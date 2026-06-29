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
  // normal opcional: vetor da superfície atingida → faíscas saem PRA FORA da
  // parede (cone direcionado) em vez de esfericamente, evitando que atravessem
  // a geometria (item 12 — anti-pierce barato, sem colisão por-partícula).
  spawnSparks(at, normal = null) {
    if (!at) return;
    try {
      const ps = new BABYLON.ParticleSystem("sparks_" + (++_tracerSeq), 24, this.scene);
      // empurra a origem ~5cm pra fora da superfície (não nasce dentro da parede)
      const n = (normal && normal.length && normal.length() > 0.01)
        ? normal.clone().normalize() : null;
      ps.emitter = n ? at.clone().add(n.scale(0.05)) : at.clone();
      ps.minEmitBox = new BABYLON.Vector3(-0.05,-0.05,-0.05);
      ps.maxEmitBox = new BABYLON.Vector3(0.05,0.05,0.05);
      ps.color1 = new BABYLON.Color4(1, 0.8, 0.2, 1);
      ps.color2 = new BABYLON.Color4(1, 0.4, 0.0, 1);
      ps.minSize = 0.05; ps.maxSize = 0.15;
      // vida mais curta = faíscas não viajam longe o bastante pra furar parede
      ps.minLifeTime = 0.08; ps.maxLifeTime = 0.18;
      ps.emitRate = 300;
      ps.minEmitPower = 2; ps.maxEmitPower = 5;
      if (n) {
        // cone hemisférico ao redor da normal (faíscas ricocheteiam pra fora)
        ps.direction1 = n.add(new BABYLON.Vector3(-0.6, -0.6, -0.6));
        ps.direction2 = n.add(new BABYLON.Vector3( 0.6,  0.6,  0.6));
      }
      ps.gravity = new BABYLON.Vector3(0, -9, 0);
      ps.start();
      setTimeout(() => { try { ps.stop(); } catch(_){} setTimeout(()=>{try{ps.dispose();}catch(_){}}, 300); }, 60);
    } catch (e) { console.error("[Sparks]", e); }
  }
}
