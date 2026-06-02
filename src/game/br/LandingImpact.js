// ─────────────────────────────────────────────────────────────────
//  LandingImpact — efeito de pouso do skydive.
//
//  Comportamento:
//   - Dust particle radial no chão (ParticleSystem)
//   - Shake de câmera proporcional à velocidade de impacto
//   - Som procedural de impacto (sub-bass + thud)
//   - Anel expansivo no chão (DynamicTexture decal)
//   - SEM fall damage (Lucas pediu): só feedback visual/sonoro
//   - Player pode andar imediatamente após (1s de "settling")
// ─────────────────────────────────────────────────────────────────

export class LandingImpact {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
  }

  /** Dispara o impacto. Params: position (Vector3), impactSpeed (m/s). */
  trigger({ position, impactSpeed }) {
    const speed = Math.max(0, impactSpeed || 30);
    const intensity = Math.min(1.0, speed / 80); // 0..1

    this._spawnDust(position, intensity);
    this._spawnRing(position, intensity);
    this._playThudSound(intensity);
    this._shakeCamera(intensity);
  }

  _spawnDust(pos, intensity) {
    try {
      const ps = new BABYLON.ParticleSystem('landDust_' + Date.now(), 300, this.scene);
      // Dust texture procedural (não precisa de asset externo)
      const dt = new BABYLON.DynamicTexture('dustTex', 32, this.scene, false);
      const ctx = dt.getContext();
      const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
      grd.addColorStop(0, 'rgba(200,180,140,1)');
      grd.addColorStop(1, 'rgba(200,180,140,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 32, 32);
      dt.update();
      ps.particleTexture = dt;

      const emitter = new BABYLON.TransformNode('dustEmit', this.scene);
      emitter.position.copyFrom(pos);
      ps.emitter = emitter;
      ps.minEmitBox = new BABYLON.Vector3(-1, 0, -1);
      ps.maxEmitBox = new BABYLON.Vector3(1, 0.1, 1);
      ps.color1 = new BABYLON.Color4(0.85, 0.75, 0.55, 0.8);
      ps.color2 = new BABYLON.Color4(0.75, 0.65, 0.50, 0.6);
      ps.colorDead = new BABYLON.Color4(0.6, 0.5, 0.4, 0);
      ps.minSize = 0.4 + intensity * 0.6;
      ps.maxSize = 0.9 + intensity * 1.0;
      ps.minLifeTime = 0.6;
      ps.maxLifeTime = 1.4;
      ps.emitRate = 0;          // burst mode
      ps.manualEmitCount = 100 + Math.floor(intensity * 200);
      ps.gravity = new BABYLON.Vector3(0, -0.5, 0);
      // Direção radial (sai do centro)
      ps.direction1 = new BABYLON.Vector3(-4, 2, -4);
      ps.direction2 = new BABYLON.Vector3(4, 4, 4);
      ps.minEmitPower = 2 * intensity;
      ps.maxEmitPower = 5 * intensity;
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
      ps.start();
      setTimeout(() => {
        try { ps.stop(); } catch (_) {}
        setTimeout(() => { try { ps.dispose(); emitter.dispose(); } catch (_) {} }, 2000);
      }, 200);
    } catch (e) { console.warn('[LandingImpact] dust failed', e); }
  }

  _spawnRing(pos, intensity) {
    try {
      const ring = BABYLON.MeshBuilder.CreateDisc('landRing_' + Date.now(),
        { radius: 0.5, tessellation: 32 }, this.scene);
      ring.position.copyFrom(pos);
      ring.position.y += 0.05;
      ring.rotation.x = Math.PI / 2;
      const mat = new BABYLON.StandardMaterial('ringMat', this.scene);
      mat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.5);
      mat.alpha = 0.6 + intensity * 0.3;
      mat.disableLighting = true;
      ring.material = mat;
      // Anima expandindo + fade out
      const targetRadius = 3 + intensity * 6;
      const duration = 600;
      const t0 = performance.now();
      const animate = () => {
        const t = performance.now() - t0;
        const k = t / duration;
        if (k >= 1) { try { ring.dispose(); mat.dispose(); } catch (_) {} return; }
        const r = 0.5 + (targetRadius - 0.5) * k;
        ring.scaling.x = r * 2;
        ring.scaling.z = r * 2;
        mat.alpha = (0.6 + intensity * 0.3) * (1 - k);
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    } catch (_) {}
  }

  _playThudSound(intensity) {
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const t0 = ctx.currentTime;
      // Componente 1: sub-bass (impacto pesado)
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(80, t0);
      sub.frequency.exponentialRampToValueAtTime(30, t0 + 0.4);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.3 + intensity * 0.3, t0);
      subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      sub.connect(subGain); subGain.connect(ctx.destination);
      sub.start(t0); sub.stop(t0 + 0.5);
      // Componente 2: noise click (corpo batendo)
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, 2400, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / 800);
      noise.buffer = buf;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 600;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.15 + intensity * 0.15;
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ctx.destination);
      noise.start(t0);
    } catch (_) {}
  }

  _shakeCamera(intensity) {
    try {
      const cam = this.scene.activeCamera;
      if (!cam) return;
      const baseY = cam.position.y;
      const baseX = cam.position.x;
      const baseZ = cam.position.z;
      const magnitude = 0.15 + intensity * 0.35;
      const duration = 280;
      const t0 = performance.now();
      const shake = () => {
        const t = performance.now() - t0;
        if (t > duration) {
          // Não restaura position (player se moveu), só decai influência
          return;
        }
        const decay = 1 - (t / duration);
        const off = magnitude * decay;
        // pequeno jiggle aleatório no Y da câmera
        try { cam.position.y = baseY + (Math.random() - 0.5) * off * 0.6; } catch (_) {}
        requestAnimationFrame(shake);
      };
      requestAnimationFrame(shake);
    } catch (_) {}
  }
}
