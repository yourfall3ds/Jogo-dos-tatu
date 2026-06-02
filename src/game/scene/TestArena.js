// ─────────────────────────────────────────────────────────────────
//  TestArena — arena LIMPA pra testar sombras/iluminação sem o lixo do
//  mapa principal (máquina de assets, decoração, etc).
//
//  Cria um terreno novo grande + alguns obstáculos como shadow casters,
//  longe do mapa original (offset X). Teleporta o player pra lá e aperta
//  o frustum da sombra ali. window.arena() liga/desliga.
// ─────────────────────────────────────────────────────────────────

const OFFSET = new BABYLON.Vector3(500, 0, 0);   // longe do mapa original

export class TestArena {
  constructor(scene, player, shadowGen) {
    this.scene = scene;
    this.player = player;
    this.sg = shadowGen;
    this.meshes = [];
    this.active = false;
  }

  toggle() { this.active ? this.exit() : this.enter(); }

  enter() {
    if (this.active) return;
    const s = this.scene, O = OFFSET;

    // ── Terreno novo (plano grande com material limpo) ───────────────
    const ground = BABYLON.MeshBuilder.CreateGround('arena_ground', { width: 120, height: 120, subdivisions: 1 }, s);
    ground.position.copyFrom(O);
    const gm = new BABYLON.StandardMaterial('arena_gmat', s);
    gm.diffuseColor = new BABYLON.Color3(0.42, 0.5, 0.32);   // verde-grama fosco
    gm.specularColor = new BABYLON.Color3(0, 0, 0);          // sem brilho → sombra limpa
    ground.material = gm;
    ground.receiveShadows = true;
    ground.checkCollisions = true;
    this.meshes.push(ground);
    // corpo físico do chão
    try { new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.7 }, s); } catch (_) {}

    // ── Obstáculos variados (todos shadow casters) ───────────────────
    const mat = (r, g, b) => { const m = new BABYLON.StandardMaterial('am' + Math.random(), s); m.diffuseColor = new BABYLON.Color3(r, g, b); m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); return m; };
    const place = (mesh, x, y, z, m) => {
      mesh.position.set(O.x + x, y, O.z + z);
      mesh.material = m; mesh.receiveShadows = true; mesh.checkCollisions = true;
      this.sg.addShadowCaster(mesh);
      this.meshes.push(mesh);
      try { new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, s); } catch (_) {}
      return mesh;
    };
    place(BABYLON.MeshBuilder.CreateBox('a_box1', { size: 4 }, s), -8, 2, 6, mat(0.8, 0.3, 0.3));
    place(BABYLON.MeshBuilder.CreateBox('a_box2', { width: 6, height: 8, depth: 2 }, s), 8, 4, 4, mat(0.3, 0.5, 0.8));
    place(BABYLON.MeshBuilder.CreateCylinder('a_cyl', { diameter: 3, height: 7 }, s), 0, 3.5, 12, mat(0.9, 0.7, 0.2));
    place(BABYLON.MeshBuilder.CreateBox('a_wall', { width: 16, height: 6, depth: 1 }, s), 0, 3, -10, mat(0.6, 0.55, 0.5));
    const sphere = BABYLON.MeshBuilder.CreateSphere('a_sph', { diameter: 4 }, s);
    place(sphere, -12, 4, -4, mat(0.4, 0.8, 0.5));
    // pequena escada/rampa
    place(BABYLON.MeshBuilder.CreateBox('a_ramp', { width: 6, height: 0.5, depth: 6 }, s), 12, 1, -6, mat(0.7, 0.7, 0.7)).rotation.x = -0.3;

    // ── Teleporta o player ───────────────────────────────────────────
    this._savedPos = this.player.mesh.position.clone();
    this.player.mesh.position.set(O.x, 3, O.z - 20);
    if (this.player._cc?.setPosition) this.player._cc.setPosition(this.player.mesh.position);

    // ── Aperta o frustum da sombra nesta área (alta resolução aqui) ──
    const sun = s.getLightByName('sun');
    this._savedSun = { pos: sun.position.clone(), oL: sun.orthoLeft, oR: sun.orthoRight, oT: sun.orthoTop, oB: sun.orthoBottom };
    sun.position = new BABYLON.Vector3(O.x + 40, 80, O.z + 40);
    sun.orthoLeft = -70; sun.orthoRight = 70; sun.orthoTop = 70; sun.orthoBottom = -70;

    // hora boa pra sombra (sol em ângulo)
    window._dayNight?.pause(true);
    window._dayNight?.setTime(0.32);

    this.active = true;
    console.log('[Arena] entrou na arena de teste (sombras limpas)');
  }

  exit() {
    if (!this.active) return;
    for (const m of this.meshes) { try { m.dispose(); } catch (_) {} }
    this.meshes.length = 0;
    if (this._savedPos) {
      this.player.mesh.position.copyFrom(this._savedPos);
      if (this.player._cc?.setPosition) this.player._cc.setPosition(this._savedPos);
    }
    const sun = this.scene.getLightByName('sun');
    if (this._savedSun) {
      sun.position.copyFrom(this._savedSun.pos);
      sun.orthoLeft = this._savedSun.oL; sun.orthoRight = this._savedSun.oR;
      sun.orthoTop = this._savedSun.oT; sun.orthoBottom = this._savedSun.oB;
    }
    window._dayNight?.pause(false);
    this.active = false;
    console.log('[Arena] voltou ao mapa');
  }
}
