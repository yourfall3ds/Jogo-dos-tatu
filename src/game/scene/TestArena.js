// ─────────────────────────────────────────────────────────────────
//  TestArena — a cena BÁSICA do torus (exemplo oficial Babylon) que
//  comprovadamente projeta sombra. Cena 100% própria (sem o pós-proc do
//  jogo que matava a sombra). Câmera ArcRotate orbitando — mouse controla.
//
//  window.arena() / F9 → entra. De novo → volta pro jogo.
//  É a REFERÊNCIA visual: aqui a sombra funciona; usamos pra calibrar.
// ─────────────────────────────────────────────────────────────────

export class TestArena {
  constructor(gameScene, player, shadowGen) {
    this.gameScene = gameScene;
    this.player = player;
    this.engine = gameScene.getEngine();
    this.scene = null;
    this.active = false;
  }

  toggle() { this.active ? this.exit() : this.enter(); }

  enter() {
    if (this.active) return;
    const engine = this.engine;
    const scene = new BABYLON.Scene(engine);
    this.scene = scene;

    // Câmera orbital (mouse: arrasta = girar, scroll = zoom)
    const camera = new BABYLON.ArcRotateCamera('arenaCam', -1.0, 0.9, 90, BABYLON.Vector3.Zero(), scene);
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = (Math.PI / 2) * 0.95;
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 200;
    camera.attachControl(this.engine.getRenderingCanvas(), true);
    scene.activeCamera = camera;

    // Luz direcional (sol) — igual o exemplo
    const light = new BABYLON.DirectionalLight('dir01', new BABYLON.Vector3(-1, -2, -1), scene);
    light.position = new BABYLON.Vector3(20, 40, 20);

    // Esfera amarela marcando o sol
    const lightSphere = BABYLON.MeshBuilder.CreateSphere('sunMark', { diameter: 4, segments: 10 }, scene);
    lightSphere.position = light.position;
    const lsm = new BABYLON.StandardMaterial('lsm', scene);
    lsm.emissiveColor = new BABYLON.Color3(1, 1, 0); lsm.disableLighting = true;
    lightSphere.material = lsm;

    // Chão
    const ground = BABYLON.MeshBuilder.CreateGround('arenaGround', { width: 100, height: 100, subdivisions: 2 }, scene);
    const gm = new BABYLON.StandardMaterial('arenaGm', scene);
    gm.diffuseColor = new BABYLON.Color3(0.55, 0.6, 0.5);
    gm.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = gm;
    ground.position.y = -2;
    ground.receiveShadows = true;

    // Torus + caixa que giram (os shadow casters)
    const torus = BABYLON.MeshBuilder.CreateTorus('arenaTorus', { diameter: 8, thickness: 2, tessellation: 32 }, scene);
    const tm = new BABYLON.StandardMaterial('tm', scene);
    tm.diffuseColor = new BABYLON.Color3(0.85, 0.3, 0.3);
    torus.material = tm;

    const box = BABYLON.MeshBuilder.CreateBox('arenaBox', { size: 4 }, scene);
    box.position.set(-10, 2, 8);
    const bm = new BABYLON.StandardMaterial('bm', scene);
    bm.diffuseColor = new BABYLON.Color3(0.3, 0.5, 0.85);
    box.material = bm;

    const pillar = BABYLON.MeshBuilder.CreateCylinder('arenaPillar', { diameter: 3, height: 10 }, scene);
    pillar.position.set(12, 3, -6);
    const pm = new BABYLON.StandardMaterial('pm', scene);
    pm.diffuseColor = new BABYLON.Color3(0.9, 0.75, 0.25);
    pillar.material = pm;

    // Sombras — EXATAMENTE como o exemplo que funcionou
    const sg = new BABYLON.ShadowGenerator(1024, light);
    sg.getShadowMap().renderList.push(torus, box, pillar);
    sg.useBlurExponentialShadowMap = true;
    sg.useKernelBlur = true;
    sg.blurKernel = 64;
    box.receiveShadows = true;
    pillar.receiveShadows = true;

    // Animação do torus
    let alpha = 0;
    this._anim = scene.registerBeforeRender(() => {
      torus.rotation.x += 0.01;
      torus.rotation.z += 0.02;
      torus.position = new BABYLON.Vector3(Math.cos(alpha) * 25, 8, Math.sin(alpha) * 25);
      alpha += 0.01;
    });

    // Troca o render loop pra renderizar ESSA cena
    engine.stopRenderLoop();
    engine.runRenderLoop(() => scene.render());

    this.active = true;
    console.log('[Arena] cena do torus ativa (sombra de referência). F9 volta.');
  }

  exit() {
    if (!this.active) return;
    try { this.scene.dispose(); } catch (_) {}
    this.scene = null;
    this.active = false;
    // o jogo precisa religar seu render loop → recarrega
    console.log('[Arena] saindo — recarregue (F5) pra voltar ao jogo, ou já restaurado se houver loop');
    // restaura: o main.js tem o loop original; pedimos reload
    window.location.reload();
  }
}
