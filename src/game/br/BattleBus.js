// ─────────────────────────────────────────────────────────────────
//  BattleBus — avião cargo cruza o mapa em altitude alta e ejeta
//  os players em fila. Substitui o "todos saltam juntos" do TakeoffSequence.
//
//  Mecânica de gênero (sem copyright):
//   - Curve3 atravessa o mapa em ~12s
//   - Players ejetam em fila (0.4s entre cada)
//   - Som de motor + porta abrindo
//   - Após o último ejetar, o bus continua e sai do mapa
// ─────────────────────────────────────────────────────────────────

export class BattleBus {
  constructor(scene) {
    this.scene = scene;
    this._bus = null;
    this._busObserver = null;
    this._engineHum = null;
  }

  /** Inicia: cria mesh do bus, anima ao longo da Curve3.
   *  @param avatars - lista de meshes (player local + remoteplayers)
   *  @param onEjectAll - callback após o último player ejetar
   */
  run(avatars, onEjectAll) {
    this._buildBus();
    this._startEngineHum();

    // Curve3: passa por cima do mapa numa diagonal
    const start = new BABYLON.Vector3(-400, 250, -400);
    const end = new BABYLON.Vector3(400, 250, 400);
    const control1 = new BABYLON.Vector3(-100, 280, 100);
    const control2 = new BABYLON.Vector3(100, 280, -100);
    const curve = BABYLON.Curve3.CreateCubicBezier(start, control1, control2, end, 100);
    const points = curve.getPoints();
    this._bus.position.copyFrom(points[0]);

    const startT = performance.now();
    const FLIGHT_MS = 14000; // bus leva 14s atravessando
    const EJECT_START = 3000; // começa ejetar com 3s de voo
    const EJECT_GAP = 400;    // 0.4s entre cada player

    let ejectedIdx = 0;
    let lastDir = new BABYLON.Vector3(0, 0, 1);

    this._busObserver = this.scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() - startT;
      const k = Math.min(1, t / FLIGHT_MS);
      const idx = Math.min(points.length - 2, Math.floor(k * (points.length - 1)));
      const cur = points[idx];
      const nxt = points[idx + 1];
      this._bus.position.copyFrom(cur);
      // Orienta bus na direção do movimento
      const dir = nxt.subtract(cur);
      if (dir.lengthSquared() > 0.0001) {
        dir.normalize();
        this._bus.rotation.y = Math.atan2(dir.x, dir.z);
        lastDir = dir;
      }

      // Eject players em sequência
      const ejectT = t - EJECT_START;
      if (ejectT > 0) {
        const shouldEject = Math.floor(ejectT / EJECT_GAP);
        while (ejectedIdx < shouldEject && ejectedIdx < avatars.length) {
          this._ejectOne(avatars[ejectedIdx], this._bus.position.clone());
          ejectedIdx++;
        }
      }

      // Fim: bus dispose + callback
      if (k >= 1) {
        try { this.scene.onBeforeRenderObservable.remove(this._busObserver); } catch (_) {}
        this._busObserver = null;
        this._stopEngineHum();
        setTimeout(() => this._dispose(), 1000);
        try { onEjectAll?.(); } catch (_) {}
      }
    });
  }

  _buildBus() {
    // Bus = avião cargo procedural simples
    const root = new BABYLON.TransformNode('battleBus', this.scene);
    // Fuselagem
    const body = BABYLON.MeshBuilder.CreateCylinder('busBody',
      { height: 28, diameterTop: 5, diameterBottom: 6, tessellation: 12 }, this.scene);
    body.rotation.x = Math.PI / 2;
    body.parent = root;
    const bodyMat = new BABYLON.StandardMaterial('busBodyMat', this.scene);
    bodyMat.diffuseColor = new BABYLON.Color3(0.35, 0.4, 0.5);
    bodyMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    body.material = bodyMat;
    // Asas
    const wing = BABYLON.MeshBuilder.CreateBox('busWing',
      { width: 22, height: 0.6, depth: 4 }, this.scene);
    wing.parent = root;
    wing.position.y = -1;
    wing.material = bodyMat;
    // Cauda vertical
    const tail = BABYLON.MeshBuilder.CreateBox('busTail',
      { width: 0.6, height: 4, depth: 5 }, this.scene);
    tail.parent = root;
    tail.position.z = -12;
    tail.position.y = 2;
    tail.material = bodyMat;
    // Luzes piscantes nas asas (efeito)
    [-10, 10].forEach((dx, i) => {
      const light = BABYLON.MeshBuilder.CreateSphere('busLight_' + i,
        { diameter: 0.5 }, this.scene);
      light.parent = root;
      light.position.set(dx, -1, 0);
      const lm = new BABYLON.StandardMaterial('busLightMat', this.scene);
      lm.emissiveColor = i === 0
        ? new BABYLON.Color3(1, 0.2, 0.2)
        : new BABYLON.Color3(0.2, 1, 0.2);
      lm.disableLighting = true;
      light.material = lm;
      light.isPickable = false;
    });
    root.getChildMeshes().forEach(m => { m.isPickable = false; });
    this._bus = root;
  }

  _ejectOne(avatar, busPos) {
    const mesh = avatar?.mesh || avatar?.root || avatar;
    if (!mesh?.position) return;
    // Teleporta avatar pra debaixo do bus
    mesh.position.set(busPos.x, busPos.y - 3, busPos.z);
    if (mesh.setEnabled) mesh.setEnabled(true);
    else mesh.isVisible = true;
    if (mesh.scaling) mesh.scaling.set(1, 1, 1);
    // Pequeno empurrão pra baixo simulando queda
    if (avatar._physBody?.setLinearVelocity) {
      try { avatar._physBody.setLinearVelocity(new BABYLON.Vector3(0, -5, 0)); } catch (_) {}
    }
    // Som de eject (whoosh curto)
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const t0 = ctx.currentTime;
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / 4000);
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.value = 0.18;
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(t0); noise.stop(t0 + 0.3);
    } catch (_) {}
  }

  _startEngineHum() {
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth'; osc1.frequency.value = 80;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth'; osc2.frequency.value = 82.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 300; filter.Q.value = 4;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc1.start(); osc2.start();
      this._engineHum = { osc1, osc2, gain };
    } catch (_) {}
  }

  _stopEngineHum() {
    if (!this._engineHum) return;
    try {
      const t0 = (window._audioCtx?.currentTime || 0);
      this._engineHum.gain.gain.linearRampToValueAtTime(0, t0 + 0.5);
      setTimeout(() => {
        try { this._engineHum.osc1.stop(); this._engineHum.osc2.stop(); } catch (_) {}
      }, 600);
    } catch (_) {}
    this._engineHum = null;
  }

  _dispose() {
    if (this._bus) { try { this._bus.dispose(false, true); } catch (_) {} this._bus = null; }
    this._stopEngineHum();
  }
}
