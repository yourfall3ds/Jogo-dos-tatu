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
    this._setupPlayerPositions();
    this._startPedestalGlow();
  }

  /** Coloca players em círculo ao redor do beacon central. */
  _setupPlayerPositions() {
    if (!window._remotePlayers) return;
    const players = Array.from(window._remotePlayers.values());
    const radius = 6;
    players.forEach((rp, i) => {
      const angle = (i / Math.max(1, players.length)) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (rp.root?.position) {
        rp.root.position.set(x, 0, z);
        // Olha pro centro
        rp.yaw = (Math.atan2(-x, -z)) * 180 / Math.PI;
        if (rp.root.rotation) rp.root.rotation.y = rp.yaw * Math.PI / 180;
      }
      // Marca como pose lobby (sem combate, idle)
      if (rp._lobbyMode !== undefined) rp._lobbyMode = true;
    });
  }

  /** Pedestal de luz cyan embaixo dos pés de cada player. */
  _startPedestalGlow() {
    this._pedestalObserver = this.scene.onBeforeRenderObservable.add(() => {
      const players = window._remotePlayers ? Array.from(window._remotePlayers.values()) : [];
      players.forEach(rp => {
        if (!rp.root || rp._pedestal) return;
        try {
          const ped = BABYLON.MeshBuilder.CreateDisc('lobbyPed_' + (rp.playerId || Math.random()),
            { radius: 0.7, tessellation: 24 }, this.scene);
          ped.rotation.x = Math.PI / 2;
          ped.position.y = 0.02;
          ped.parent = rp.root;
          const m = new BABYLON.StandardMaterial('pedMat', this.scene);
          m.emissiveColor = new BABYLON.Color3(0.18, 0.93, 0.71);
          m.alpha = 0.45;
          m.disableLighting = true;
          ped.material = m;
          ped.isPickable = false;
          rp._pedestal = ped;
        } catch (_) {}
      });
    });
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
    if (this._pedestalObserver) { try { this.scene.onBeforeRenderObservable.remove(this._pedestalObserver); } catch (_) {} }
    // Cleanup pedestals
    if (window._remotePlayers) {
      window._remotePlayers.forEach(rp => {
        if (rp._pedestal) { try { rp._pedestal.dispose(); } catch (_) {} rp._pedestal = null; }
        rp._lobbyMode = false;
      });
    }
    if (this._ambientHum) {
      try { this._ambientHum.osc.stop(); this._ambientHum.gain.disconnect(); } catch (_) {}
      this._ambientHum = null;
    }
  }

  isActive() { return this._active; }
}
