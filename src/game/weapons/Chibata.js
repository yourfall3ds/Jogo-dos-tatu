// ─────────────────────────────────────────────────────────────────
//  Chibata — chicote (whip) procedural
//
//  Não depende de GLB externo (não existe whip CC0). O modelo é
//  construído em runtime: cabo de couro + lash em tubo curvo
//  (Path3D animado por bezier). Marcado isMelee:true → cai no
//  pipeline de espada, com chain própria (CHIBATADA!).
// ─────────────────────────────────────────────────────────────────

export class Chibata {
  constructor(scene) {
    this.scene = scene;
    this.id    = 'chibata';
    this.label = 'Chibata 🐭';

    this.isMelee   = true;
    this.swordTier = 'whip';   // marcador especial pra CombatSystem
    this.automatic = false;

    this.damage   = 35;
    this.fireRate = 0.30;
    this.ammo     = 0;
    this.maxAmmo  = 0;
    this.fireSound = null;
    this.impactSound = 'chibatada'; // som no acerto (registrado no SoundManager)

    // Render: viewmodel grande (chicote vem da mão direita FPS)
    this.viewmodelScale    = 1.0;
    this.viewmodelPosition = new BABYLON.Vector3(0.32, -0.22, 0.45);
    this.viewmodelRotation = new BABYLON.Vector3(0, 0, 0);
    this.viewmodelPositionAim = this.viewmodelPosition;
    this.viewmodelRotationAim = this.viewmodelRotation;
    this.muzzleOffset = new BABYLON.Vector3(0, 0, 0);

    // TPS
    this.tpsScale    = 1.0;
    this.tpsRotation = new BABYLON.Vector3(0, 0, 0);
    this.tpsPosition = new BABYLON.Vector3(0.0, 0.08, 0.0);

    // FX dummy
    this.tracerColor    = [0.95, 0.65, 0.20];
    this.tracerAlpha    = 0.0;
    this.tracerWidth    = 0.001;
    this.muzzleColor    = [0.0, 0.0, 0.0];
    this.hitColor       = [1.0, 0.55, 0.10];
    this.lightIntensity = 0;
    this.lightRadius    = 0;

    this._origMaxDim = null;
    this._origCenter = null;

    // Estado do chicoteio (animação procedural)
    this._lashT = 0;         // 0..1 progresso do chicoteio
    this._lashing = false;
  }

  /**
   * Constrói uma mesh procedural de chicote ANTES de WeaponSystem chamar
   * setGLBWeapon. Devolve { meshes: [root] } no formato esperado.
   */
  static buildMesh(scene) {
    const root = new BABYLON.TransformNode('chibata_root', scene);

    // ── Cabo (cilindro de couro marrom) ──
    const handle = BABYLON.MeshBuilder.CreateCylinder('chibata_handle', {
      height: 0.22, diameterTop: 0.030, diameterBottom: 0.038, tessellation: 14,
    }, scene);
    handle.parent = root;
    handle.position.y = -0.11;
    handle.rotation.z = 0;
    const handleMat = new BABYLON.StandardMaterial('chibataHandleMat', scene);
    handleMat.diffuseColor = new BABYLON.Color3(0.32, 0.18, 0.10);
    handleMat.specularColor = new BABYLON.Color3(0.15, 0.10, 0.05);
    handleMat.specularPower = 18;
    handle.material = handleMat;

    // ── Pommel (anel metalico discreto no fim do cabo) ──
    // Reduzido de esfera 0.05 dourada -> anel 0.035 prata-fosco pra nao
    // dominar visualmente o chicote inteiro.
    const pommel = BABYLON.MeshBuilder.CreateTorus('chibata_pommel', {
      diameter: 0.035, thickness: 0.010, tessellation: 14,
    }, scene);
    pommel.parent = root;
    pommel.position.y = -0.225;
    pommel.rotation.x = Math.PI / 2;
    const pommelMat = new BABYLON.StandardMaterial('chibataPommelMat', scene);
    pommelMat.diffuseColor = new BABYLON.Color3(0.55, 0.50, 0.45);
    pommelMat.specularColor = new BABYLON.Color3(0.85, 0.80, 0.75);
    pommelMat.specularPower = 64;
    pommel.material = pommelMat;

    // ── Lash (corda do chicote — tube animado) ──
    //  Início enrolado/ondulado. Animação procedural extende e chicoteia.
    const lashMat = new BABYLON.StandardMaterial('chibataLashMat', scene);
    lashMat.diffuseColor = new BABYLON.Color3(0.18, 0.10, 0.06);
    lashMat.specularColor = new BABYLON.Color3(0.30, 0.20, 0.10);
    lashMat.specularPower = 22;

    // Path inicial: ondulado caindo
    const N = 24;
    const pts0 = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      pts0.push(new BABYLON.Vector3(
        Math.sin(t * 8) * 0.04,
        -t * 0.55,
        Math.cos(t * 6) * 0.03,
      ));
    }
    const lash = BABYLON.MeshBuilder.CreateTube('chibata_lash', {
      path: pts0,
      radius: 0.028,            // engrossado de 0.016 -> 0.028 (chicote visivel)
      tessellation: 8,
      updatable: true,
      cap: BABYLON.Mesh.CAP_ALL,
    }, scene);
    lash.parent = root;
    lash.material = lashMat;
    lash._chibataPath = pts0;
    lash._chibataN = N;
    lash._chibataRadius = 0.028;

    // Tip metálico (ponta cortante)
    const tip = BABYLON.MeshBuilder.CreateSphere('chibata_tip', {
      diameter: 0.055, segments: 10,
    }, scene);
    tip.parent = root;
    tip.position.copyFrom(pts0[N - 1]);
    const tipMat = new BABYLON.StandardMaterial('chibataTipMat', scene);
    tipMat.diffuseColor = new BABYLON.Color3(0.75, 0.75, 0.78);
    tipMat.specularColor = new BABYLON.Color3(1, 1, 1);
    tipMat.emissiveColor = new BABYLON.Color3(0.10, 0.08, 0.05);
    tip.material = tipMat;
    root._chibataTip = tip;
    root._chibataLash = lash;

    // Marca pra não ser pickable (não atrapalha hit detection)
    root.getChildMeshes(true).forEach(m => { m.isPickable = false; });

    return { meshes: [root] };
  }

  applyToMesh(glbRoot, isTPS = false) {
    glbRoot.rotationQuaternion = null;
    if (isTPS) {
      glbRoot.scaling.setAll(this.tpsScale);
      glbRoot.rotation.copyFrom(this.tpsRotation);
      glbRoot.position.copyFrom(this.tpsPosition);
    } else {
      glbRoot.scaling.setAll(this.viewmodelScale);
      glbRoot.rotation.copyFrom(this.viewmodelRotation);
      glbRoot.position.copyFrom(this.viewmodelPosition);
    }
  }

  /**
   * Dispara animação de chicoteio. Chamado pelo CombatSystem ao iniciar
   * o swing. Reusa a anim de espada (sword_*) mas anima o lash em paralelo.
   * @param {BABYLON.TransformNode} root - mesh do chicote (TPS ou FPS)
   */
  triggerLash(root) {
    if (!root || this._lashing) return;
    this._lashing = true;
    this._lashT = 0;
    this._lashRoot = root;
  }

  /**
   * Update de cada frame — anima o lash deformando o tube path.
   * Deve ser chamado pelo Player.update.
   */
  updateLash(dt, root) {
    if (!root) return;
    const lash = root._chibataLash;
    const tip = root._chibataTip;
    if (!lash || !tip) return;
    const N = lash._chibataN;

    // Quando está em chicoteio: 0..1 em ~0.35s
    if (this._lashing) {
      this._lashT += dt / 0.35;
      if (this._lashT >= 1) { this._lashing = false; this._lashT = 1; }
    } else {
      // Idle: leve oscilação (chicote balança no cinto)
      this._lashT = 0;
    }

    const t = this._lashT;
    const pts = [];
    const lashLen = 1.6 + t * 1.2;   // estica de 1.6 → 2.8 no chicoteio
    const now = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      let x, y, z;
      if (this._lashing) {
        // Chicoteio: curva pra frente que vira pra cima/lado no fim
        const arc = Math.sin(u * Math.PI) * t * 0.8;
        const tip_curl = Math.pow(u, 2.4) * t;
        x = arc * Math.cos(t * Math.PI * 1.5);
        y = -u * lashLen + tip_curl * 0.6;
        z = u * lashLen + arc * Math.sin(t * Math.PI * 1.5);
      } else {
        // Idle: oscilação suave (chicote enrolado)
        const wobble = Math.sin(now * 2 + u * 6) * 0.025;
        x = Math.sin(u * 8) * 0.04 + wobble;
        y = -u * 0.55;
        z = Math.cos(u * 6) * 0.03;
      }
      pts.push(new BABYLON.Vector3(x, y, z));
    }
    // Atualiza tube (Babylon permite path update se updatable: true)
    try {
      BABYLON.MeshBuilder.CreateTube('chibata_lash', {
        path: pts,
        radius: lash._chibataRadius || 0.028,
        instance: lash,
      }, this.scene || lash.getScene());
    } catch (_) {}
    tip.position.copyFrom(pts[N - 1]);
    lash._chibataPath = pts;
  }

  /** Ponto de impacto (ponta) em world-space — usado pra spawn sangue/FX. */
  getTipWorldPosition(root) {
    if (!root?._chibataTip) return null;
    return root._chibataTip.getAbsolutePosition().clone();
  }
}
