// ─────────────────────────────────────────────────────────────────
//  LobbyHall — saguão 3D vivo.
//
//  Quando entra numa sala BR, antes da partida começar, o player vê:
//   - Mapa "Estação Espacial" carregado como cenário
//   - Avatar visível em pose idle
//   - Outros players da sala andando livremente
//   - Spotlight giratório (atmosfera)
//   - Música ambient
//   - Câmera 3rd person seguindo o player
//
//  O player anda WASD mas SEM combate. É social/visual antes do match.
// ─────────────────────────────────────────────────────────────────

export class LobbyHall {
  constructor(scene, chibataMaps) {
    this.scene = scene;
    this.chibataMaps = chibataMaps;
    this._active = false;
    this._spotlights = [];
    this._ambientHum = null;
  }

  /** Carrega o cenário do saguão. */
  async enter(mapId = 'spaceStation') {
    if (this._active) return;
    this._active = true;
    console.log('[LobbyHall] carregando saguão:', mapId);
    try {
      // Carrega mapa via chibataMaps (assumindo API .load(id))
      if (this.chibataMaps?.load) {
        await this.chibataMaps.load(mapId);
      }
    } catch (e) {
      console.warn('[LobbyHall] falhou carregar mapa', e);
    }
    this._addAmbientLights();
    this._addCentralBeacon();
    this._startAmbientHum();
  }

  _addAmbientLights() {
    // 3 spotlights coloridos rotativos no teto
    const colors = [
      new BABYLON.Color3(0.4, 0.9, 1.0),  // cyan
      new BABYLON.Color3(0.9, 0.6, 1.0),  // magenta
      new BABYLON.Color3(0.5, 1.0, 0.7),  // green
    ];
    for (let i = 0; i < 3; i++) {
      try {
        const spot = new BABYLON.SpotLight(`lobbySpot${i}`,
          new BABYLON.Vector3(Math.cos(i * 2.1) * 10, 18, Math.sin(i * 2.1) * 10),
          new BABYLON.Vector3(0, -1, 0), Math.PI / 6, 2, this.scene);
        spot.diffuse = colors[i];
        spot.specular = colors[i];
        spot.intensity = 1.2;
        this._spotlights.push(spot);
      } catch (_) {}
    }
    // Animação simples no render loop
    let t0 = performance.now();
    this._spotObserver = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - t0) * 0.0005;
      this._spotlights.forEach((s, i) => {
        const r = 12;
        const angle = t + i * 2.1;
        if (s.position) {
          s.position.x = Math.cos(angle) * r;
          s.position.z = Math.sin(angle) * r;
        }
      });
    });
  }

  _addCentralBeacon() {
    try {
      // Coluna de luz central (sci-fi teleport vibe)
      const beam = BABYLON.MeshBuilder.CreateCylinder('lobbyBeam',
        { height: 30, diameter: 4, tessellation: 24,
          sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
      beam.position.set(0, 15, 0);
      beam.isPickable = false;
      const mat = new BABYLON.StandardMaterial('beamMat', this.scene);
      mat.emissiveColor = new BABYLON.Color3(0.3, 0.9, 0.9);
      mat.alpha = 0.18;
      mat.disableLighting = true;
      beam.material = mat;
      this._beam = beam;
      // Pulsa
      let t0 = performance.now();
      this._beamObserver = this.scene.onBeforeRenderObservable.add(() => {
        const t = (performance.now() - t0) * 0.002;
        const a = 0.12 + Math.sin(t) * 0.08;
        if (beam.material) beam.material.alpha = a;
      });
    } catch (_) {}
  }

  _startAmbientHum() {
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      // Drone bem suave - oscilador 60Hz com lowpass
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      filter.Q.value = 5;
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc.start();
      this._ambientHum = { osc, gain };
    } catch (_) {}
  }

  /** Sai do saguão (limpa lights/beam/audio). */
  exit() {
    if (!this._active) return;
    this._active = false;
    this._spotlights.forEach(s => { try { s.dispose(); } catch (_) {} });
    this._spotlights = [];
    if (this._beam) { try { this._beam.dispose(); } catch (_) {} this._beam = null; }
    if (this._spotObserver) { try { this.scene.onBeforeRenderObservable.remove(this._spotObserver); } catch (_) {} }
    if (this._beamObserver) { try { this.scene.onBeforeRenderObservable.remove(this._beamObserver); } catch (_) {} }
    if (this._ambientHum) {
      try { this._ambientHum.osc.stop(); this._ambientHum.gain.disconnect(); } catch (_) {}
      this._ambientHum = null;
    }
  }

  isActive() { return this._active; }
}
