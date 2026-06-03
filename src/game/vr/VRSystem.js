// VRSystem — integração WebXR completa para Meta Quest 2/3 (Touch Plus).
//
// Filosofia: REAPROVEITA toda a simulação existente do jogo (character
// controller Havok, gravidade, pulo, sprint, colisão, sync multiplayer).
// Os controles do Quest apenas ALIMENTAM o mesmo input que o teclado/mouse
// alimentam — o player.update(dt) faz o resto. A câmera XR (cabeça) SEGUE o
// player.mesh; a arma fica presa na mão direita e mira pelo controle.
//
// API:
//   const vr = new VRSystem(scene, player, cs);
//   await vr.init();   // detecta Quest, prepara WebXRDefaultExperience
//   vr.enterVR();      // dispara session imersiva (precisa user gesture)
//   vr.isQuest;        // bool: navegador é Quest
//   vr.isSupported;    // bool: WebXR immersive-vr suportado
//
// Mapa de controles (Quest 3 Touch Plus):
//   Analógico esq.        → andar (W/A/S/D relativo à cabeça); empurrar tudo = correr
//   Analógico dir. (X)    → girar a câmera (SMOOTH/contínuo, proporcional)
//   Gatilho dir.          → atirar (segura = automático)
//   Botão A (dir.)        → pular
//   Botão B (dir.)        → recarregar
//   Grip (qualquer mão)   → pular (alternativo)
//   Botão X (esq.)        → arma anterior
//   Botão Y (esq.)        → próxima arma

export class VRSystem {
  constructor(scene, player, cs) {
    this.scene = scene;
    this.player = player;
    this.cs = cs;
    this.xr = null;
    this.xrCamera = null;
    this.rig = null;                 // nó-pai da câmera XR → movemos ele p/ seguir o player
    this.leftController = null;
    this.rightController = null;
    this.rightGrip = null;           // nó do grip da mão direita (onde a arma encaixa)
    this.rightPointer = null;        // nó de mira do controle direito (direção do tiro)
    this.inSession = false;
    this.isQuest = this._detectQuest();
    this.isSupported = false;
    this.lastError = null;       // último motivo de falha (mostrado na tela do Quest)

    // Cache dos eixos dos analógicos (atualizado por observable, lido no tick)
    this._leftAxes = { x: 0, y: 0 };
    this._rightAxes = { x: 0, y: 0 };
    this._fireHeld = false;
    this._turnSpeed = 2.2;           // rad/s na deflexão total (~126°/s) — giro SMOOTH contínuo
    this._rigYaw = 0;                // rotação acumulada do rig (yaw da virada)
    this._tickBound = null;

    // Empunhadura da arma na mão: gira a arma no eixo vertical pra apontar
    // pra frente (o modelo vem apontando pro lado). Ajustável se ficar torta.
    this._gunYaw = Math.PI / 2;      // +90° (cano pra frente; flip o sinal se virar pro lado errado)

    // IK dos braços (mãos do personagem seguem os controles) — encarnar avatar.
    this._ikR = null; this._ikL = null;
    this._headNode = null;
  }

  _detectQuest() {
    try {
      const ua = navigator.userAgent || "";
      return /OculusBrowser|Quest|Meta Quest/i.test(ua);
    } catch (_) { return false; }
  }

  async init() {
    try {
      this.engineKind = this.scene.getEngine?.()?.constructor?.name || "?";
      if (this.engineKind === "WebGPUEngine") {
        this.lastError = "Engine WebGPU ativo (WebXR exige WebGL2). Abra com ?webgl.";
        console.warn("[VR] WebGPUEngine ativo — WebXR não suportado. Recarregue com ?webgl ou abra no Quest browser (auto-detect).");
        return;
      }
      if (!window.isSecureContext) {
        this.lastError = "Página NÃO é contexto seguro. Use https:// ou localhost (adb reverse). VR bloqueado.";
        console.warn("[VR] não é contexto seguro — WebXR bloqueado. Use HTTPS ou localhost (adb reverse).");
        return;
      }
      if (!navigator.xr) {
        this.lastError = "navigator.xr ausente — navegador sem WebXR.";
        console.warn("[VR] WebXR não disponível no navegador");
        return;
      }
      this.isSupported = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
      if (!this.isSupported) {
        this.lastError = "immersive-vr não suportado (desktop sem HMD, ou contexto inseguro).";
        console.log("[VR] immersive-vr não suportado (provável desktop sem HMD)");
        return;
      }
      this.lastError = null;
      console.log("[VR] WebXR immersive-vr suportado. Quest detectado:", this.isQuest);

      this.xr = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: this._findFloorMeshes(),
        disableTeleportation: true,   // usamos locomoção por analógico, não teleporte
        optionalFeatures: true,
      });
      if (!this.xr?.baseExperience) {
        this.lastError = "createDefaultXRExperienceAsync falhou (sem baseExperience).";
        console.warn("[VR] createDefaultXRExperienceAsync falhou");
        return;
      }

      // Rig: nó-pai da câmera XR. Movendo-o, a cabeça inteira segue o player,
      // enquanto o headset continua aplicando o movimento real da cabeça por cima.
      this.rig = new BABYLON.TransformNode("vrRig", this.scene);

      // Desliga o laser de seleção (atrapalha num shooter; menus usam DOM).
      try {
        this.xr.baseExperience.featuresManager?.disableFeature?.(BABYLON.WebXRFeatureName.POINTER_SELECTION);
      } catch (_) {}

      this._wireSession();
      this._wireControllers();
      this._ready = true;
      console.log("[VR] inicializado, pronto pra enterVR()");
    } catch (e) {
      this.lastError = "init exceção: " + (e?.message || e);
      console.error("[VR] init falhou:", e?.message, e);
    }
  }

  /** Diagnóstico legível pra mostrar NA TELA (sem console no Quest). */
  getDiagnostics() {
    return {
      engine: this.engineKind || "?",
      secureContext: !!window.isSecureContext,
      hasXR: !!navigator.xr,
      isQuest: this.isQuest,
      isSupported: this.isSupported,
      ready: !!this._ready,
      inSession: this.inSession,
      error: this.lastError,
    };
  }

  _findFloorMeshes() {
    const floors = [];
    try {
      const ow = this.scene.getMeshByName("openworld_ground");
      if (ow) floors.push(ow);
      this.scene.meshes.forEach(m => {
        if (m && m.name && /ground|floor|piso/i.test(m.name) && m !== ow) floors.push(m);
      });
    } catch (_) {}
    return floors;
  }

  // ───────────────────────────────────────────────────────────────────
  //  Sessão: entra/sai do modo imersivo
  // ───────────────────────────────────────────────────────────────────
  _wireSession() {
    const base = this.xr.baseExperience;
    base.onStateChangedObservable.add((state) => {
      const STATE = BABYLON.WebXRState || {};
      if (state === STATE.IN_XR) {
        this.inSession = true;
        this.xrCamera = base.camera;
        console.log("[VR] SESSION ATIVA");
        try { document.body.classList.add("vr-active"); } catch (_) {}

        // ⭐ Garante que o MUNDO existe (chão, player spawnado, menus escondidos).
        //  Sem isso, entrar em VR direto do menu mostra só o fundo (partículas)
        //  porque o mundo nunca foi carregado. Idempotente: ok chamar já em jogo.
        try { this.onEnterWorld?.(); } catch (e) { console.error("[VR] onEnterWorld", e); }

        // ⭐⭐ Desliga pós-processamento pesado (pipeline HDR, bloom, SSAO, glow,
        //  FXAA). É a causa nº1 do WebXR TRAVAR no "carregando": pipelines de
        //  post-process com render-target não deixam frame chegar ao headset.
        try { window._gfx?.disableForVR?.(); } catch (_) {}
        try { this.player?._fxaa?.dispose?.(); this.player._fxaa = null; } catch (_) {}

        // Câmera XR controlada pelo headset → desativa o _updateCamera manual.
        try { this.player._vrControlsCamera = true; } catch (_) {}
        // Garante que a lógica de jogo roda mesmo sem pointer-lock (impossível no HMD).
        try { this.player.input.gameActive = true; document.body.classList.add("game-active"); } catch (_) {}

        // Prende a câmera XR ao rig e zera a posição inicial sobre o player.
        try {
          this.xrCamera.parent = this.rig;
          this._rigYaw = 0;
          this.rig.rotation.set(0, 0, 0);
          const p = this.player.mesh.position;
          this.rig.position.set(p.x, p.y - this.player.HEIGHT / 2, p.z);
        } catch (_) {}

        // Arma vai pra mão direita (presa ao controle).
        this._attachWeaponToHand();

        // Encarna o avatar: mostra o corpo, esconde a cabeça, e liga o IK dos
        // braços pra as mãos do personagem seguirem os controles (1ª pessoa).
        this._setupVRAvatar();

        // Painel de boas-vindas VR (mostra os controles; também prova que o
        // render imersivo funcionou). Some ao apertar o gatilho.
        this._showVRMenu();

        // Tick por frame: roda DEPOIS do player.update (que move o mesh) e ANTES
        // do render → a câmera segue a posição nova; input alimenta o próximo frame.
        if (!this._tickBound) {
          this._tickBound = () => this._tick();
          this.scene.onBeforeRenderObservable.add(this._tickBound);
        }
      } else if (state === STATE.NOT_IN_XR) {
        this.inSession = false;
        console.log("[VR] SESSION ENCERRADA");
        try { document.body.classList.remove("vr-active"); } catch (_) {}
        try { this.player._vrControlsCamera = false; } catch (_) {}
        // Religa o pós-processamento ao sair do VR.
        try { window._gfx?.enableAfterVR?.(); } catch (_) {}
        this._hideVRMenu();
        // Desfaz o avatar VR (mostra cabeça de volta, desliga IK, esconde corpo).
        this._teardownVRAvatar();
        // Solta a câmera do rig e devolve a arma pra câmera FPS.
        try { if (this.xrCamera) this.xrCamera.parent = null; } catch (_) {}
        this._detachWeaponFromHand();
        // Zera as teclas que o VR pode ter deixado pressionadas.
        try {
          const k = this.player.input.keys;
          k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.Space = k.ShiftLeft = false;
        } catch (_) {}
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  Controles: descobre cada controle e liga botões/analógicos
  // ───────────────────────────────────────────────────────────────────
  _wireControllers() {
    const im = this.xr.input;
    if (!im) return;
    im.onControllerAddedObservable.add((controller) => {
      controller.onMotionControllerInitObservable.add((mc) => {
        const hand = mc.handedness;
        if (hand === "left") {
          this.leftController = controller;
        } else if (hand === "right") {
          this.rightController = controller;
          this.rightGrip = controller.grip || controller.pointer || null;
          this.rightPointer = controller.pointer || controller.grip || null;
          // Se a sessão já está ativa quando o controle conecta, encaixa a arma.
          if (this.inSession) this._attachWeaponToHand();
        }
        console.log("[VR] controle", hand, "pronto");
        this._bindControllerInputs(mc, hand);
      });
    });
  }

  _bindControllerInputs(mc, hand) {
    try {
      const trigger = mc.getComponent("xr-standard-trigger");
      const squeeze = mc.getComponent("xr-standard-squeeze");
      const thumb   = mc.getComponent("xr-standard-thumbstick");

      // ── Gatilho: atirar ────────────────────────────────────────────
      if (trigger && hand === "right") {
        trigger.onButtonStateChangedObservable.add(() => {
          if (!trigger.changes.pressed) return;
          // Painel VR aberto → 1º gatilho FECHA o menu e começa a jogar (não atira).
          if (trigger.pressed && this._vrMenuActive) { this._hideVRMenu(); return; }
          this._fireHeld = trigger.pressed;
          if (trigger.pressed) {
            // Semi-auto: 1 tiro por aperto (automático repete no tick).
            this._fire();
          }
        });
      }

      // ── Grip: pular (qualquer mão, alternativo ao A) ────────────────
      if (squeeze) {
        squeeze.onButtonStateChangedObservable.add(() => {
          if (!squeeze.changes.pressed) return;
          this._setJump(squeeze.pressed);
        });
      }

      // ── Analógicos: cacheia eixos (aplicados no tick) ───────────────
      if (thumb) {
        thumb.onAxisValueChangedObservable.add((v) => {
          if (hand === "left")  this._leftAxes  = { x: v.x, y: v.y };
          else                  this._rightAxes = { x: v.x, y: v.y };
        });
      }

      // ── Botões de face (A/B na direita, X/Y na esquerda) ────────────
      const aOrX = mc.getComponent("a-button") || mc.getComponent("x-button");
      const bOrY = mc.getComponent("b-button") || mc.getComponent("y-button");
      if (hand === "right") {
        if (aOrX) aOrX.onButtonStateChangedObservable.add(() => {
          if (aOrX.changes.pressed) this._setJump(aOrX.pressed);     // A → pula
        });
        if (bOrY) bOrY.onButtonStateChangedObservable.add(() => {
          if (bOrY.changes.pressed && bOrY.pressed) this._reload();  // B → recarrega
        });
      } else if (hand === "left") {
        if (aOrX) aOrX.onButtonStateChangedObservable.add(() => {
          if (aOrX.changes.pressed && aOrX.pressed) this._switchWeapon(-1); // X → arma anterior
        });
        if (bOrY) bOrY.onButtonStateChangedObservable.add(() => {
          if (bOrY.changes.pressed && bOrY.pressed) this._switchWeapon(+1); // Y → próxima arma
        });
      }
    } catch (e) { console.error("[VR] bindControllerInputs", e); }
  }

  // ───────────────────────────────────────────────────────────────────
  //  Tick por frame: aplica input cacheado + faz a câmera seguir o player
  // ───────────────────────────────────────────────────────────────────
  _tick() {
    if (!this.inSession || !this.xrCamera || !this.player?.mesh) return;
    const k = this.player.input.keys;
    if (!k) return;

    // 1) Direção da cabeça vira o "frente" da locomoção (anda pra onde olha).
    try {
      const f = this.xrCamera.getDirection(BABYLON.Axis.Z);
      this.player.yaw = Math.atan2(f.x, f.z) * 180 / Math.PI;
    } catch (_) {}

    // Painel VR aberto → PAUSA locomoção/tiro (lê os controles, gatilho começa).
    //  Mantém a câmera seguindo o player (passo 6) pra cena ficar visível.
    if (this._vrMenuActive) {
      k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.ShiftLeft = false;
      this._followFP();
      // auto-dismiss de segurança (caso o mapeamento do gatilho varie no controle)
      this._vrMenuT = (this._vrMenuT || 0) + ((this.scene.getEngine?.()?.getDeltaTime?.() || 16) / 1000);
      if (this._vrMenuT > 15) this._hideVRMenu();
      return;
    }

    // 2) Analógico esquerdo → WASD + correr. Deadzone maior mata o "drift"
    //    (controle parado mandando valor pequeno → personagem andava sozinho).
    const lx = this._leftAxes.x, ly = this._leftAxes.y;
    const dead = 0.35;
    const mag = Math.hypot(lx, ly);
    if (mag < dead) {
      k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.ShiftLeft = false;   // zona morta → parado
    } else {
      k.KeyW = ly < -dead;
      k.KeyS = ly >  dead;
      k.KeyA = lx < -dead;
      k.KeyD = lx >  dead;
      k.ShiftLeft = mag > 0.9;   // empurrar o analógico até o fim = correr
    }

    // 3) Analógico direito → giro SMOOTH (contínuo, proporcional à deflexão).
    //    Sem snap/passos: gira enquanto o stick estiver inclinado, na velocidade
    //    proporcional a quanto você empurra. dt vem do engine pra ser estável.
    const rx = this._rightAxes.x;
    const turnDead = 0.15;
    if (Math.abs(rx) > turnDead) {
      const dt = Math.min((this.scene.getEngine?.()?.getDeltaTime?.() || 16) / 1000, 0.05);
      const amt = (Math.abs(rx) - turnDead) / (1 - turnDead);   // 0..1 após a deadzone
      this._rigYaw += Math.sign(rx) * amt * this._turnSpeed * dt;
    }

    // 4) Tiro automático enquanto segura o gatilho.
    if (this._fireHeld && this.player.weapon?.getCurrentWeapon?.()?.automatic) {
      this._fire();
    }

    // 5) Atualiza o raio de mira da arma (origem + direção do controle direito).
    this._updateAimRay();

    // 5.5) Avatar VR: mãos do personagem seguem os controles (IK) + cabeça oculta.
    this._updateVRAvatar();

    // 6) Câmera em 1ª pessoa (trava sobre o personagem).
    this._followFP();
  }

  // Posiciona o rig (e a câmera XR) em 1ª PESSOA, travado SOBRE o personagem.
  //  Cancela o deslocamento físico do headset na sala (XZ) a cada frame — senão
  //  o offset te joga pro lado e parece 3ª pessoa, e o giro orbita um ponto ao
  //  lado. O Y (altura/agachar) fica livre pra você olhar/abaixar naturalmente.
  _followFP() {
    const p = this.player.mesh.position;
    this.rig.rotation.y = this._rigYaw;
    this.rig.position.set(p.x, p.y - this.player.HEIGHT / 2, p.z);
    try {
      this.rig.computeWorldMatrix(true);
      this.xrCamera.computeWorldMatrix(true);
      const cw = this.xrCamera.getAbsolutePosition();
      this.rig.position.x += p.x - cw.x;   // alinha a câmera ao personagem (horizontal)
      this.rig.position.z += p.z - cw.z;
    } catch (_) {}
  }

  // ───────────────────────────────────────────────────────────────────
  //  Avatar VR — encarnar o personagem em 1ª pessoa
  //   • mostra o corpo, esconde a cabeça (não tampa a visão)
  //   • IK de 2 ossos por braço → as mãos seguem os controles
  //  Tudo defensivo: se o IK falhar, fica só corpo + arma no controle.
  // ───────────────────────────────────────────────────────────────────
  _setupVRAvatar() {
    const p = this.player;
    try {
      p._tpsMode = false;                 // câmera é a XR (1ª pessoa), não a TPS
      p.animator?.setVisible?.(true);     // mostra o corpo do personagem
      this._hideHead(true);               // some com a cabeça (senão tampa a visão)
    } catch (e) { console.error("[VR avatar] mostrar corpo", e); }
    this._setupArmIK();
  }

  _hideHead(hide) {
    try {
      const root = this.player?.animator?.root;
      if (!root) return;
      this._headNode = this._headNode || root.getDescendants(false).find(n => n.name === "Head");
      if (this._headNode) this._headNode.scaling.setAll(hide ? 0.0001 : 1);
    } catch (_) {}
  }

  _setupArmIK() {
    this._ikR = this._ikL = null;
    try {
      if (!BABYLON.BoneIKController) { console.warn("[VR avatar] BoneIKController indisponível"); return; }
      const skinned = this.scene.meshes.find(m => m.skeleton && m.skeleton.bones?.some(b => b.name === "RightForeArm"));
      const skel = skinned?.skeleton;
      if (!skel) { console.warn("[VR avatar] sem skeleton p/ IK"); return; }
      const rFore = skel.bones.find(b => b.name === "RightForeArm");
      const lFore = skel.bones.find(b => b.name === "LeftForeArm");

      const mk = (name, parent) => { const t = new BABYLON.TransformNode(name, this.scene); if (parent) t.parent = parent; return t; };
      // Alvos das mãos = nós presos aos controles.
      this._rHandTarget = mk("vrRHandTarget", this.rightGrip || this.rightPointer);
      this._lHandTarget = mk("vrLHandTarget", this.leftController?.grip || this.leftController?.pointer);
      // Pole (cotovelo): pra fora, pra trás e pra baixo de cada ombro.
      this._rPole = mk("vrRPole", this.player.mesh); this._rPole.position.set(1.4, 0.2, -0.8);
      this._lPole = mk("vrLPole", this.player.mesh); this._lPole.position.set(-1.4, 0.2, -0.8);

      if (rFore && this._rHandTarget) {
        this._ikR = new BABYLON.BoneIKController(skinned, rFore, { targetMesh: this._rHandTarget, poleTargetMesh: this._rPole, slerpAmount: 0.7 });
      }
      if (lFore && this._lHandTarget) {
        this._ikL = new BABYLON.BoneIKController(skinned, lFore, { targetMesh: this._lHandTarget, poleTargetMesh: this._lPole, slerpAmount: 0.7 });
      }
      console.log("[VR avatar] IK de braços ligado:", { right: !!this._ikR, left: !!this._ikL });
    } catch (e) { console.error("[VR avatar] setupArmIK", e); this._ikR = this._ikL = null; }
  }

  _updateVRAvatar() {
    if (this._headNode) { try { this._headNode.scaling.setAll(0.0001); } catch (_) {} }
    if (this._ikR) { try { this._ikR.update(); } catch (_) {} }
    if (this._ikL) { try { this._ikL.update(); } catch (_) {} }
  }

  _teardownVRAvatar() {
    try { this._hideHead(false); } catch (_) {}
    this._ikR = this._ikL = null;
    [this._rHandTarget, this._lHandTarget, this._rPole, this._lPole].forEach(n => { try { n?.dispose?.(); } catch (_) {} });
    this._rHandTarget = this._lHandTarget = this._rPole = this._lPole = null;
    try { this.player?.animator?.setVisible?.(false); } catch (_) {}
  }

  // Mira: bala sai da boca da arma na direção pra onde o controle aponta.
  _updateAimRay() {
    const w = this.player.weapon;
    const ptr = this.rightPointer;
    if (!w || !ptr) return;
    try {
      const dir = ptr.getDirection(BABYLON.Axis.Z);
      w._vrAimDir = dir;
      // Origem: boca da arma se existir, senão um pouco à frente do controle.
      const muzzle = w._muzzlePoint?.parent ? w._muzzlePoint.getAbsolutePosition() : null;
      w._vrAimOrigin = muzzle || ptr.getAbsolutePosition().add(dir.scale(0.15));
    } catch (_) {}
  }

  // ───────────────────────────────────────────────────────────────────
  //  Menu VR — painel 3D flutuante (boas-vindas + controles). Some no gatilho.
  //  Também serve de PROVA de que o render imersivo funcionou (se você VÊ o
  //  painel no headset, o WebXR está renderizando).
  // ───────────────────────────────────────────────────────────────────
  _showVRMenu() {
    try {
      if (this._vrMenu) return;
      this._vrMenuT = 0;
      const plane = BABYLON.MeshBuilder.CreatePlane("vrMenuPanel", { width: 1.3, height: 0.78 }, this.scene);
      const dt = new BABYLON.DynamicTexture("vrMenuTex", { width: 1024, height: 614 }, this.scene, true);
      dt.hasAlpha = true;
      const ctx = dt.getContext();
      ctx.clearRect(0, 0, 1024, 614);
      // fundo arredondado
      ctx.fillStyle = "rgba(10,14,28,0.92)";
      this._roundRect(ctx, 14, 14, 996, 586, 34); ctx.fill();
      ctx.strokeStyle = "#3a8aff"; ctx.lineWidth = 6;
      this._roundRect(ctx, 14, 14, 996, 586, 34); ctx.stroke();
      // título
      ctx.textAlign = "center";
      ctx.fillStyle = "#7ec8ff"; ctx.font = "bold 78px Segoe UI, Arial, sans-serif";
      ctx.fillText("🥽 TRANSFPS — VR", 512, 120);
      // controles
      ctx.fillStyle = "#dffaff"; ctx.font = "40px Segoe UI, Arial, sans-serif";
      const lines = [
        "Analógico ESQ:  andar  ·  empurrar = correr",
        "Analógico DIR:  girar a câmera (suave)",
        "Gatilho:  atirar     A:  pular",
        "B:  recarregar     X / Y:  trocar arma",
      ];
      lines.forEach((t, i) => ctx.fillText(t, 512, 215 + i * 64));
      ctx.fillStyle = "#ffd84a"; ctx.font = "bold 46px Segoe UI, Arial, sans-serif";
      ctx.fillText("► aperte o GATILHO pra jogar", 512, 545);
      dt.update();

      const mat = new BABYLON.StandardMaterial("vrMenuMat", this.scene);
      mat.diffuseTexture = dt;
      mat.emissiveTexture = dt;        // legível sem depender de luz da cena
      mat.opacityTexture = dt;
      mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      plane.material = mat;
      plane.isPickable = false;
      // Flutua à frente da câmera XR (acompanha o olhar).
      plane.parent = this.xrCamera;
      plane.position.set(0, 0, 1.6);   // 1.6m à frente dos olhos
      this._vrMenu = plane;
      this._vrMenuActive = true;
      console.log("[VR] painel de boas-vindas exibido");
    } catch (e) { console.error("[VR] showVRMenu", e); }
  }

  _hideVRMenu() {
    this._vrMenuActive = false;
    try {
      this._vrMenu?.material?.diffuseTexture?.dispose?.();
      this._vrMenu?.material?.dispose?.();
      this._vrMenu?.dispose?.();
    } catch (_) {}
    this._vrMenu = null;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ───────────────────────────────────────────────────────────────────
  //  Arma na mão
  // ───────────────────────────────────────────────────────────────────
  _attachWeaponToHand() {
    const w = this.player?.weapon;
    const hand = this.rightGrip || this.rightPointer;
    if (!w?._root || !hand) return;
    try {
      w._vrMode = true;
      w._root.parent = hand;
      w._root.rotationQuaternion = null;
      w._root.position.set(0, 0, 0);
      w._root.rotation.set(0, 0, 0);
      w._root.setEnabled(true);

      const cur = w.getCurrentWeapon?.();
      const mesh = cur && w._weaponMeshes?.[cur.id];
      if (mesh) {
        mesh.parent = w._root;
        mesh.rotationQuaternion = null;
        // Empunhadura genérica: arma à frente da mão, girada pra apontar pra frente
        // (o modelo vem deitado pro lado → _gunYaw corrige no eixo vertical).
        mesh.position.set(0, -0.02, 0.06);
        mesh.rotation.set(0, this._gunYaw, 0);
        mesh.scaling.setAll(cur.viewmodelScale ?? 0.5);
        mesh.setEnabled(true);
        mesh.getChildMeshes().forEach(m => { m.setEnabled(true); m.isVisible = true; m.isPickable = false; });
        w._glbRoot = mesh;
        if (w._muzzlePoint) w._muzzlePoint.parent = mesh;
      }
      console.log("[VR] arma encaixada na mão:", cur?.id);
    } catch (e) { console.error("[VR] attachWeaponToHand", e); }
  }

  _detachWeaponFromHand() {
    const w = this.player?.weapon;
    if (!w?._root) return;
    try {
      w._vrMode = false;
      w._vrAimDir = null;
      w._vrAimOrigin = null;
      w._root.parent = this.player.camera;   // volta pro viewmodel FPS
      this.player._updateWeaponVisibility?.(); // reaplica offsets de câmera
    } catch (e) { console.error("[VR] detachWeaponFromHand", e); }
  }

  // ───────────────────────────────────────────────────────────────────
  //  Ações (reaproveitam os sistemas existentes do jogo)
  // ───────────────────────────────────────────────────────────────────
  _fire() {
    try {
      const w = this.player.weapon;
      const cur = w?.getCurrentWeapon?.();
      if (cur?.isMelee && this.player.combatSystem) {
        // Espada/chicote equipado → golpe melee (mesmo caminho do LMB).
        this.player.combatSystem.swordAttack?.();
      } else {
        w?.shoot?.();
      }
      this._pulse(this.rightController, 0.6, 50);
    } catch (_) {}
  }

  _reload() {
    try {
      this.player.weapon?.startReload?.();
      this._pulse(this.rightController, 0.4, 80);
    } catch (_) {}
  }

  // Pular reaproveita a tecla Space: o Player faz edge-detect e aplica
  // pulo/wall-jump/gravidade. Pressionar = Space true; soltar = false.
  _setJump(pressed) {
    try {
      const k = this.player.input.keys;
      if (k) k.Space = !!pressed;
    } catch (_) {}
  }

  _switchWeapon(dir) {
    const w = this.player?.weapon;
    if (!w?.weapons?.length) return;
    const n = w.weapons.length;
    const idx = ((w.currentWeaponIndex || 0) + dir + n) % n;
    try {
      Promise.resolve(w.switchWeapon(idx)).then(() => {
        this._attachWeaponToHand();   // re-encaixa na mão (switchWeapon reparenta na câmera)
        this._pulse(this.leftController, 0.3, 40);
      });
    } catch (_) {}
  }

  // Vibração (haptic). Tenta a API do motionController, com fallback no gamepad.
  _pulse(controller, intensity = 0.5, ms = 50) {
    try {
      const mc = controller?.motionController;
      if (mc?.pulse) { mc.pulse(intensity, ms); return; }
      const act = controller?.inputSource?.gamepad?.hapticActuators?.[0];
      act?.pulse?.(intensity, ms);
    } catch (_) {}
  }

  // ───────────────────────────────────────────────────────────────────
  async enterVR() {
    if (!this.xr?.baseExperience) {
      // init() não criou a sessão — o motivo já está em this.lastError.
      this.lastError = this.lastError || "VR não inicializado (init falhou antes do enterVR).";
      console.warn("[VR] não inicializado, abortando enterVR:", this.lastError);
      return false;
    }
    try {
      await this.xr.baseExperience.enterXRAsync("immersive-vr", "local-floor");
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = "enterXRAsync falhou: " + (e?.message || e);
      console.error("[VR] enterVR falhou:", e?.message);
      return false;
    }
  }

  async exitVR() {
    if (!this.xr?.baseExperience) return;
    try { await this.xr.baseExperience.exitXRAsync(); }
    catch (e) { console.error("[VR] exitVR", e); }
  }
}
