// ─────────────────────────────────────────────────────────────────
//  BloodTrail — quando player local está ferido (HP < 40%), deixa
//  pegada de sangue server-broadcasted a cada N passos.
//
//  cs.sendSpawnFx('footprint_blood', { x, z }) → todos veem.
// ─────────────────────────────────────────────────────────────────

export class BloodTrail {
  constructor(cs, player) {
    this.cs = cs;
    this.player = player;
    this._lastDropAt = 0;
    this._lastX = 0;
    this._lastZ = 0;
    this.DROP_INTERVAL_MS = 600;   // a cada 0.6s
    this.MIN_MOVE = 1.4;            // ao menos 1.4u entre marcas
    this.HP_THRESHOLD = 0.40;       // ferido = HP < 40%
  }

  update(dt) {
    if (!this.cs?.connected) return;
    if (!this.player?.mesh) return;
    const hpPct = (this.player.hp || 0) / Math.max(1, this.player.maxHp || 100);
    if (hpPct >= this.HP_THRESHOLD) return;
    if (this.player._dead) return;
    const now = performance.now();
    if (now - this._lastDropAt < this.DROP_INTERVAL_MS) return;

    const pos = this.player.mesh.position;
    const dx = pos.x - this._lastX, dz = pos.z - this._lastZ;
    if (Math.sqrt(dx * dx + dz * dz) < this.MIN_MOVE) return;

    this._lastDropAt = now;
    this._lastX = pos.x;
    this._lastZ = pos.z;
    this.cs.sendSpawnFx('footprint_blood', { x: pos.x, y: 0.05, z: pos.z });
  }
}
