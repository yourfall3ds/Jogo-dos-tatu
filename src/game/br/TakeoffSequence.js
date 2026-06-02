// ─────────────────────────────────────────────────────────────────
//  TakeoffSequence — cinemática de decolagem antes do loading.
//
//  Quando match_countdown chega a 0:
//   1. Todos avatares ficam em pose "agachado" 0.5s
//   2. SALTO pra cima (Bezier curve, ~600m up em 1.2s)
//   3. Trail de luz (cone neon), som de boost (rocket whoosh)
//   4. Avatar fica pequeno até desaparecer
//   5. Loading overlay aparece
// ─────────────────────────────────────────────────────────────────

export class TakeoffSequence {
  constructor(scene) {
    this.scene = scene;
    this._lights = [];
    this._trails = [];
  }

  /** Dispara em todos os avatares listados. avatars = [{mesh}] */
  trigger(avatars, onComplete) {
    if (!Array.isArray(avatars) || avatars.length === 0) {
      onComplete?.();
      return;
    }
    avatars.forEach((a, i) => {
      setTimeout(() => this._launchOne(a), i * 80);
    });
    // Total duration ≈ 600ms last avatar + 1500ms flight = ~2100ms
    const total = avatars.length * 80 + 1800;
    setTimeout(() => {
      this._cleanup();
      onComplete?.();
    }, total);
  }

  _launchOne(avatar) {
    const mesh = avatar?.mesh || avatar?.root || avatar;
    if (!mesh?.position) return;

    const startPos = mesh.position.clone();
    const endPos = startPos.add(new BABYLON.Vector3(
      (Math.random() - 0.5) * 8,  // drift lateral pequeno
      300,                          // 300m pro alto
      (Math.random() - 0.5) * 8
    ));

    // ── 1) Spotlight neon embaixo do avatar (subindo junto) ──
    try {
      const light = new BABYLON.PointLight('takeoffLight', startPos.add(new BABYLON.Vector3(0, 0.5, 0)), this.scene);
      light.diffuse = new BABYLON.Color3(0.4, 0.95, 0.7);
      light.specular = new BABYLON.Color3(0.5, 1, 0.8);
      light.intensity = 4;
      light.range = 12;
      this._lights.push(light);
      // Anima luz acompanhando (simplificado: dispose após launch)
      setTimeout(() => { try { light.dispose(); } catch (_) {} }, 1400);
    } catch (_) {}

    // ── 2) Trail de partículas cyan/cyber ──
    try {
      const ps = new BABYLON.ParticleSystem('takeoffTrail', 200, this.scene);
      const dt = new BABYLON.DynamicTexture('boostTex', 16, this.scene, false);
      const ctx = dt.getContext();
      const grd = ctx.createRadialGradient(8, 8, 2, 8, 8, 8);
      grd.addColorStop(0, 'rgba(126,239,196,1)');
      grd.addColorStop(0.5, 'rgba(58,168,255,0.6)');
      grd.addColorStop(1, 'rgba(58,168,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 16, 16);
      dt.update();
      ps.particleTexture = dt;
      ps.emitter = mesh;
      ps.minEmitBox = new BABYLON.Vector3(-0.3, -0.1, -0.3);
      ps.maxEmitBox = new BABYLON.Vector3(0.3, 0.1, 0.3);
      ps.color1 = new BABYLON.Color4(0.18, 0.93, 0.71, 1);
      ps.color2 = new BABYLON.Color4(0.22, 0.66, 1, 0.9);
      ps.colorDead = new BABYLON.Color4(0.18, 0.4, 0.8, 0);
      ps.minSize = 0.3; ps.maxSize = 0.7;
      ps.minLifeTime = 0.4; ps.maxLifeTime = 0.9;
      ps.emitRate = 200;
      ps.gravity = new BABYLON.Vector3(0, -2, 0);
      ps.direction1 = new BABYLON.Vector3(-1, -3, -1);
      ps.direction2 = new BABYLON.Vector3(1, -1, 1);
      ps.minEmitPower = 2; ps.maxEmitPower = 4;
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
      ps.start();
      this._trails.push(ps);
      setTimeout(() => { try { ps.stop(); setTimeout(() => ps.dispose(), 800); } catch (_) {} }, 1300);
    } catch (_) {}

    // ── 3) Anima posição: Bezier (curva acelerada) ──
    const startT = performance.now();
    const duration = 1200;
    const animate = () => {
      const t = performance.now() - startT;
      const k = Math.min(1, t / duration);
      // Easing: quadratic out (acelera no início, sobe rápido)
      const eased = k * (2 - k);
      mesh.position.x = BABYLON.Scalar.Lerp(startPos.x, endPos.x, eased);
      mesh.position.y = BABYLON.Scalar.Lerp(startPos.y, endPos.y, eased);
      mesh.position.z = BABYLON.Scalar.Lerp(startPos.z, endPos.z, eased);
      // Avatar encolhe (perspectiva: tá indo longe)
      const scale = BABYLON.Scalar.Lerp(1, 0.1, eased);
      if (mesh.scaling) { mesh.scaling.x = mesh.scaling.y = mesh.scaling.z = scale; }
      if (k < 1) requestAnimationFrame(animate);
      else {
        // Esconde mesh
        if (mesh.setEnabled) mesh.setEnabled(false);
        else mesh.isVisible = false;
      }
    };
    requestAnimationFrame(animate);

    // ── 4) Som de decolagem (rocket whoosh procedural) ──
    this._playBoostSound();
  }

  _playBoostSound() {
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const t0 = ctx.currentTime;
      // Whoosh: low-pass swept noise
      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1);
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, t0);
      filter.frequency.exponentialRampToValueAtTime(4000, t0 + 0.8);
      filter.Q.value = 8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.05);
      gain.gain.linearRampToValueAtTime(0.15, t0 + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(t0); noise.stop(t0 + 1.0);
      // Sub-bass thump no início
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(60, t0);
      sub.frequency.exponentialRampToValueAtTime(180, t0 + 0.15);
      const subG = ctx.createGain();
      subG.gain.setValueAtTime(0.25, t0);
      subG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      sub.connect(subG); subG.connect(ctx.destination);
      sub.start(t0); sub.stop(t0 + 0.35);
    } catch (_) {}
  }

  _cleanup() {
    this._lights.forEach(l => { try { l.dispose(); } catch (_) {} });
    this._trails.forEach(p => { try { p.dispose(); } catch (_) {} });
    this._lights = []; this._trails = [];
  }
}
