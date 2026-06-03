// VRSystem — integracao WebXR para Meta Quest 2/3.
// API:
//   const vr = new VRSystem(scene, player, cs);
//   await vr.init();   // detecta Quest, prepara WebXRDefaultExperience
//   vr.enterVR();      // dispara session imersiva (precisa user gesture)
//   vr.isQuest;        // bool: navegador eh Quest
//   vr.isSupported;    // bool: WebXR immersive-vr suportado
//
// Sincronia:
//   - Camera VR usa head pose -> envia yaw/pitch pro server via input
//   - Controllers Quest -> trigger = atirar; squeeze = jump
//   - Sync de movimento via thumbstick esquerdo (anda) + direito (gira)
//   - Mantem compat com modo flat (FPS desktop)

export class VRSystem {
  constructor(scene, player, cs) {
    this.scene = scene;
    this.player = player;
    this.cs = cs;
    this.xr = null;
    this.xrCamera = null;
    this.leftController = null;
    this.rightController = null;
    this.inSession = false;
    this.isQuest = this._detectQuest();
    this.isSupported = false;
    this._lastInputSent = 0;
  }

  _detectQuest() {
    try {
      const ua = navigator.userAgent || "";
      return /OculusBrowser|Quest|Meta Quest/i.test(ua);
    } catch (_) { return false; }
  }

  async init() {
    try {
      // WebXR não funciona com WebGPUEngine — abort se for o caso
      if (this.scene.getEngine?.()?.constructor?.name === "WebGPUEngine") {
        console.warn("[VR] WebGPUEngine ativo — WebXR não suportado. Recarregue com ?webgl ou abra no Quest browser (auto-detect).");
        return;
      }
      if (!navigator.xr) {
        console.warn("[VR] WebXR nao disponivel no navegador");
        return;
      }
      this.isSupported = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
      if (!this.isSupported) {
        console.log("[VR] immersive-vr nao suportado (provavel desktop sem HMD)");
        return;
      }
      console.log("[VR] WebXR immersive-vr suportado. Quest detectado:", this.isQuest);
      this.xr = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes: this._findFloorMeshes(),
        disableTeleportation: false,
        optionalFeatures: true,
      });
      if (!this.xr?.baseExperience) {
        console.warn("[VR] createDefaultXRExperienceAsync falhou");
        return;
      }
      this._wireSession();
      this._wireControllers();
      console.log("[VR] inicializado, pronto pra enterVR()");
    } catch (e) {
      console.error("[VR] init falhou:", e?.message, e);
    }
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

  _wireSession() {
    const base = this.xr.baseExperience;
    base.onStateChangedObservable.add((state) => {
      const STATE = BABYLON.WebXRState || {};
      if (state === STATE.IN_XR) {
        this.inSession = true;
        console.log("[VR] SESSION ATIVA");
        try { this.xrCamera = base.camera; } catch (_) {}
        try { document.body.classList.add("vr-active"); } catch (_) {}
        try { if (this.player) this.player._vrControlsCamera = true; } catch (_) {}
      } else if (state === STATE.NOT_IN_XR) {
        this.inSession = false;
        console.log("[VR] SESSION ENCERRADA");
        try { document.body.classList.remove("vr-active"); } catch (_) {}
        try { if (this.player) this.player._vrControlsCamera = false; } catch (_) {}
      }
    });
    // Sync de head pose -> envia yaw via input pro server
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.inSession || !this.xrCamera) return;
      this._syncHeadPose();
    });
  }

  _wireControllers() {
    const im = this.xr.input;
    if (!im) return;
    im.onControllerAddedObservable.add((controller) => {
      controller.onMotionControllerInitObservable.add((mc) => {
        const hand = mc.handedness;
        if (hand === "left") this.leftController = controller;
        else if (hand === "right") this.rightController = controller;
        console.log("[VR] controller", hand, "init");
        this._bindControllerInputs(controller, mc, hand);
      });
    });
  }

  _bindControllerInputs(controller, mc, hand) {
    try {
      const trigger = mc.getComponent("xr-standard-trigger");
      if (trigger) {
        trigger.onButtonStateChangedObservable.add(() => {
          if (trigger.changes.pressed && trigger.pressed && hand === "right") {
            // Atira (direito = arma)
            try { window._gameInput?.simulateFire?.(); } catch (_) {}
            try { this.cs?.sendInput?.({ fire: true }); } catch (_) {}
          }
        });
      }
      const squeeze = mc.getComponent("xr-standard-squeeze");
      if (squeeze) {
        squeeze.onButtonStateChangedObservable.add(() => {
          if (squeeze.changes.pressed && squeeze.pressed && hand === "left") {
            // Jump
            try { window._gameInput?.simulateJump?.(); } catch (_) {}
          }
        });
      }
      const thumbstick = mc.getComponent("xr-standard-thumbstick");
      if (thumbstick) {
        thumbstick.onAxisValueChangedObservable.add((values) => {
          // Left thumbstick: WASD; Right thumbstick: girar
          if (hand === "left") {
            const k = window._gameInput?.keys;
            if (!k) return;
            const t = 0.3;
            k.KeyW = values.y < -t;
            k.KeyS = values.y > t;
            k.KeyA = values.x < -t;
            k.KeyD = values.x > t;
          } else if (hand === "right" && this.player?.mesh) {
            const t = 0.3;
            if (Math.abs(values.x) > t) {
              this.player.yaw = (this.player.yaw || 0) + values.x * 0.04;
            }
          }
        });
      }
    } catch (e) { console.error("[VR] bindControllerInputs", e); }
  }

  _syncHeadPose() {
    if (!this.xrCamera || !this.player?.mesh) return;
    // Move o player local pro pe do XR camera (XZ) e usa yaw da camera
    try {
      const cam = this.xrCamera;
      this.player.mesh.position.x = cam.globalPosition.x;
      this.player.mesh.position.z = cam.globalPosition.z;
      // Yaw da camera vira yaw do player
      this.player.yaw = cam.rotationQuaternion ? cam.rotationQuaternion.toEulerAngles().y : (cam.rotation.y || 0);
    } catch (_) {}
  }

  async enterVR() {
    if (!this.xr?.baseExperience) {
      console.warn("[VR] nao inicializado, abortando enterVR");
      return false;
    }
    try {
      await this.xr.baseExperience.enterXRAsync("immersive-vr", "local-floor");
      return true;
    } catch (e) {
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
