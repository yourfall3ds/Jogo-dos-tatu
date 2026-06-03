// ─────────────────────────────────────────────────────────────────
//  DropPod — cápsula procedural que envolve o player durante skydive.
//
//  Lucas pediu QUEDA DIRETO NO CHÃO (sem paraquedas), com IMPACTO no
//  pouso. O pod aqui é estético: cápsula sci-fi envolvendo o avatar
//  durante a queda, abre nos últimos metros antes do pouso.
//
//  Modelo procedural (sem Quaternius pra evitar download extra agora):
//  - 4 painéis curvos formando uma cápsula
//  - Luzes piscando nas bordas
//  - Animação de abertura nos painéis quando perto do chão
// ─────────────────────────────────────────────────────────────────

export class DropPod {
  constructor(scene) {
    this.scene = scene;
    this._pod = null;
    this._panels = [];
    this._lights = [];
    this._openT = 0;
    this._opening = false;
  }

  /** Constrói pod ao redor do mesh do player. */
  attach(playerMesh) {
    if (this._pod) this.dispose();
    if (!playerMesh) return;

    const root = new BABYLON.TransformNode('dropPod', this.scene);
    // Acompanha o player
    root.parent = playerMesh;
    root.position.set(0, 0.9, 0);

    // 4 painéis verticais formando a cápsula (cones cortados)
    const panelCount = 4;
    for (let i = 0; i < panelCount; i++) {
      const angle = (i / panelCount) * Math.PI * 2;
      const panel = BABYLON.MeshBuilder.CreateCylinder('podPanel_' + i, {
        height: 2.4,
        diameterTop: 0.4,
        diameterBottom: 1.2,
        tessellation: 12,
        arc: 1 / panelCount + 0.02,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
      }, this.scene);
      panel.parent = root;
      panel.rotation.y = angle;
      // Material metálico cinza-azulado
      const mat = new BABYLON.StandardMaterial('podMat_' + i, this.scene);
      mat.diffuseColor = new BABYLON.Color3(0.30, 0.38, 0.48);
      mat.specularColor = new BABYLON.Color3(0.7, 0.8, 0.9);
      mat.emissiveColor = new BABYLON.Color3(0.02, 0.06, 0.10);
      mat.specularPower = 64;
      panel.material = mat;
      panel.isPickable = false;
      panel._baseAngle = angle;
      this._panels.push(panel);
    }

    // Anel de luz cyan na base (efeito de escudo)
    const ring = BABYLON.MeshBuilder.CreateTorus('podRing', {
      diameter: 1.4, thickness: 0.06, tessellation: 24,
    }, this.scene);
    ring.parent = root;
    ring.position.y = -1.0;
    const ringMat = new BABYLON.StandardMaterial('podRingMat', this.scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.18, 0.93, 0.71);
    ringMat.disableLighting = true;
    ring.material = ringMat;
    ring.isPickable = false;
    this._ring = ring;

    // 3 lights pulsantes em pontos ao redor
    for (let i = 0; i < 3; i++) {
      const lAngle = (i / 3) * Math.PI * 2;
      const led = BABYLON.MeshBuilder.CreateSphere('podLed_' + i, {
        diameter: 0.12, segments: 8,
      }, this.scene);
      led.parent = root;
      led.position.set(Math.cos(lAngle) * 0.55, 0.3, Math.sin(lAngle) * 0.55);
      const lm = new BABYLON.StandardMaterial('podLedMat_' + i, this.scene);
      lm.emissiveColor = new BABYLON.Color3(1, 0.4, 0.1);
      lm.disableLighting = true;
      led.material = lm;
      led.isPickable = false;
      this._lights.push(led);
    }

    this._pod = root;
    this._startObserver();
  }

  _startObserver() {
    let t0 = performance.now();
    this._observer = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - t0) * 0.005;
      // Pulse lights
      this._lights.forEach((led, i) => {
        if (led.material) {
          const phase = t + i * 1.2;
          const intensity = 0.6 + Math.sin(phase) * 0.4;
          led.material.emissiveColor = new BABYLON.Color3(intensity, 0.4 * intensity, 0.1 * intensity);
        }
      });
      // Anel pulsa cyan
      if (this._ring?.material) {
        const intensity = 0.7 + Math.sin(t * 1.5) * 0.3;
        this._ring.material.emissiveColor = new BABYLON.Color3(0.18 * intensity, 0.93 * intensity, 0.71 * intensity);
      }
      // Abertura: anima painéis girando pra fora
      if (this._opening) {
        this._openT = Math.min(1, this._openT + 0.04);
        this._panels.forEach((p, i) => {
          const a = p._baseAngle + this._openT * 0.6;
          p.rotation.y = a;
          p.position.x = Math.cos(p._baseAngle) * this._openT * 1.5;
          p.position.z = Math.sin(p._baseAngle) * this._openT * 1.5;
          if (p.material) p.material.alpha = Math.max(0, 1 - this._openT * 1.5);
        });
        if (this._openT >= 1) {
          // Dispose final dos painéis
          setTimeout(() => this.dispose(), 200);
        }
      }
    });
  }

  /** Abre o pod (chamar quando alt < ~30m). */
  open() {
    if (this._opening || !this._pod) return;
    this._opening = true;
    // Som de pneumática abrindo
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const t0 = ctx.currentTime;
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / 8000);
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.value = 0.12;
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(t0); noise.stop(t0 + 0.5);
    } catch (_) {}
  }

  dispose() {
    if (this._observer) { try { this.scene.onBeforeRenderObservable.remove(this._observer); } catch (_) {} this._observer = null; }
    if (this._pod) { try { this._pod.dispose(false, true); } catch (_) {} this._pod = null; }
    this._panels = []; this._lights = []; this._ring = null;
    this._opening = false; this._openT = 0;
  }
}
