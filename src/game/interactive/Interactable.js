// ─────────────────────────────────────────────────────────────────
//  Interactable — comportamento interativo anexado a um objeto colocado.
//
//  Tipos (v1):
//   • door   — gira em torno de uma DOBRADIÇA (borda) entre 0° e ângulo; ao abrir
//              desliga a colisão (dá pra atravessar), ao fechar religa.
//   • mover  — translada entre base e base+offset (elevador). Pode ser 'auto'
//              (pingpong contínuo) ou por gatilho. CARREGA o player que está em cima.
//   • button — apertar afunda levemente (cosmético) — gancho p/ ligar a outros depois.
//
//  Animação = tween por RAF no update(dt). Sem GLB animado. Guardado/robusto:
//  qualquer erro é silencioso e não derruba o jogo.
// ─────────────────────────────────────────────────────────────────
const EASE = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class Interactable {
  /**
   * @param {BABYLON.TransformNode} root  objeto colocado (raiz).
   * @param {object} cfg { id, type, motion:{kind,axis,amount,duration,up}, trigger:{kind,range}, loop }
   */
  constructor(root, cfg) {
    this.root = root;
    this.cfg = cfg || {};
    this.id = cfg.id;
    this.type = cfg.type || 'door';
    this.scene = root.getScene();
    this.state = 0;        // 0 = fechado/base · 1 = aberto/topo
    this._t = 0;           // progresso 0..1
    this._dir = 0;         // direção da anim (-1/0/+1)

    const m = cfg.motion || {};
    this._dur = Math.max(0.15, m.duration || 0.8);
    this._axis = new BABYLON.Vector3(...(Array.isArray(m.axis) ? m.axis : [0, 1, 0]));
    this._angle = ((typeof m.amount === 'number') ? m.amount : 90) * Math.PI / 180;   // door
    this._offset = Array.isArray(m.amount)
      ? new BABYLON.Vector3(m.amount[0], m.amount[1], m.amount[2])
      : new BABYLON.Vector3(0, (m.up ?? 4), 0);                                        // mover
    this._auto = cfg.loop === 'pingpong' || cfg.trigger?.kind === 'auto';
    this.range = cfg.trigger?.range ?? 3.5;

    this._basePos = root.position.clone();
    this._setup();
    if (this._auto) this._dir = 1;   // elevador automático começa subindo
  }

  _setup() {
    try {
      if (this.type === 'door') {
        // Dobradiça: pivot na borda esquerda (minX) do objeto, eixo vertical.
        const bb = this.root.getHierarchyBoundingVectors(true);
        const hinge = new BABYLON.TransformNode('hinge_' + this.id, this.scene);
        hinge.position.set(bb.min.x, this.root.position.y, (bb.min.z + bb.max.z) / 2);
        this._origParent = this.root.parent;
        this.root.setParent(hinge);   // preserva transform mundial
        this._pivot = hinge;
        this._baseRotY = hinge.rotation.y;
      }
    } catch (e) { console.warn('[Interactable] setup', e?.message); }
  }

  /** Gatilho do player (E). Movers automáticos ignoram. */
  trigger() {
    if (this._auto) return;
    this._dir = (this.state === 0) ? 1 : -1;
    // Porta: ao começar a ABRIR, libera passagem (desliga colisão).
    if (this.type === 'door' && this._dir === 1) this._setCollision(false);
  }

  /** Define o estado (sync futuro). */
  setState(s) { if (!this._auto) this._dir = (s > this.state) ? 1 : (s < this.state ? -1 : this._dir); }

  update(dt, player) {
    if (this._dir === 0) return;
    this._t += this._dir * dt / this._dur;
    let done = false;
    if (this._t >= 1) { this._t = 1; if (this._auto) this._dir = -1; else { this._dir = 0; this.state = 1; done = true; } }
    else if (this._t <= 0) { this._t = 0; if (this._auto) this._dir = 1; else { this._dir = 0; this.state = 0; done = true; } }
    const e = EASE(this._t);

    try {
      if (this.type === 'door' && this._pivot) {
        this._pivot.rotation.y = this._baseRotY + this._axis.y * this._angle * e
                                                + this._axis.x * this._angle * e;  // eixo Y dominante
        if (this._axis.y === 0) this._pivot.rotation.set(this._axis.x * this._angle * e, 0, this._axis.z * this._angle * e);
        if (done && this.state === 0) this._setCollision(true);   // fechou → religa colisão
      } else if (this.type === 'mover') {
        const nx = this._basePos.x + this._offset.x * e;
        const ny = this._basePos.y + this._offset.y * e;
        const nz = this._basePos.z + this._offset.z * e;
        const dx = nx - this.root.position.x, dy = ny - this.root.position.y, dz = nz - this.root.position.z;
        this.root.position.set(nx, ny, nz);
        this._carry(player, dx, dy, dz);
      } else if (this.type === 'button') {
        this.root.position.y = this._basePos.y - 0.12 * e;   // afunda (cosmético)
      }
    } catch (_) {}
  }

  // Carrega o player que está EM CIMA do mover (dentro da pegada XZ + perto do topo).
  _carry(player, dx, dy, dz) {
    try {
      const pm = player?.mesh; if (!pm) return;
      const bb = this.root.getHierarchyBoundingVectors(true);
      const p = pm.position;
      const onTop = p.x >= bb.min.x - 0.4 && p.x <= bb.max.x + 0.4 &&
                    p.z >= bb.min.z - 0.4 && p.z <= bb.max.z + 0.4 &&
                    p.y >= bb.max.y - 0.6 && p.y <= bb.max.y + 2.2;
      if (!onTop) return;
      p.x += dx; p.y += dy; p.z += dz;
      if (dy > 0 && player.velY < 0) player.velY = 0;   // não "afunda" subindo
    } catch (_) {}
  }

  _setCollision(on) {
    try {
      const all = [this.root, ...(this.root.getChildMeshes?.(false) || [])];
      for (const m of all) { if (m.checkCollisions !== undefined) m.checkCollisions = on; }
      // Havok: liga/desliga o corpo estático se existir.
      if (this.root._staticBody?.setEnabled) this.root._staticBody.setEnabled(on);
    } catch (_) {}
  }

  dispose() {
    try {
      if (this._pivot) { this.root.setParent(this._origParent || null); this._pivot.dispose(); this._pivot = null; }
    } catch (_) {}
  }
}

// ── Presets (o que o editor cria com 1 clique) ──────────────────────
export const INTERACT_PRESETS = {
  door:     { type: 'door',  motion: { kind: 'rotate', axis: [0, 1, 0], amount: 95, duration: 0.55 }, trigger: { kind: 'interact', range: 3.5 } },
  elevator: { type: 'mover', motion: { kind: 'translate', amount: [0, 5, 0], duration: 2.2 },         trigger: { kind: 'auto' }, loop: 'pingpong' },
  lift:     { type: 'mover', motion: { kind: 'translate', amount: [0, 5, 0], duration: 1.6 },         trigger: { kind: 'interact', range: 3.5 } },
  button:   { type: 'button', motion: { duration: 0.18 }, trigger: { kind: 'interact', range: 3 } },
};
