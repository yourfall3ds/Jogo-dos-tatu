// ─────────────────────────────────────────────────────────────────
//  SkydiveController — queda livre com controle WASD aéreo.
//
//  Física (modelo real de skydiving):
//    - Terminal velocity belly-down (pose horizontal): ~30 m/s
//    - Terminal velocity head-down (pose vertical):    ~80 m/s
//    - Horizontal speed: até 25 m/s (depende do pitch)
//    - Pitch: 0 = horizontal (drag alto), 75 = picada (drag baixo)
//    - Yaw: rotação de direção via A/D + olhar
//
//  Controles:
//    W = inclina pra frente (pitch++, mais vertical, mais rápido)
//    S = inclina pra trás (pitch--, mais horizontal, mais lento)
//    A/D = strafe lateral + rotação visual
//    Mouse = altera yaw cinemático (camera-relative)
//
//  Sem fall damage. Last 8m antes do chão entra LandingImpact.
// ─────────────────────────────────────────────────────────────────

const PHYSICS = {
  GRAVITY: 9.81,             // m/s²
  TERMINAL_HORIZONTAL: 30,   // m/s (pose belly-down)
  TERMINAL_VERTICAL: 80,     // m/s (pose head-down)
  MAX_HORIZONTAL: 25,        // m/s
  PITCH_MIN: 0,              // graus (totalmente horizontal)
  PITCH_MAX: 75,             // graus (quase vertical)
  PITCH_RATE: 60,            // graus/s (velocidade de mudança)
  YAW_RATE: 90,              // graus/s
  STRAFE_RATE: 12,           // m/s
  LANDING_THRESHOLD: 8,      // metros do chão pra trigger landing
  AIR_DRAG_BASE: 0.4,        // base drag
};

export class SkydiveController {
  constructor(scene, player, cs) {
    this.scene = scene;
    this.player = player;
    this.cs = cs;
    this.active = false;

    // Estado da queda
    this.pitch = 30;       // começa numa inclinação média
    this.yaw = 0;          // direção horizontal
    this.velocity = new BABYLON.Vector3(0, -10, 0);
    this.altitude = 200;
    this.startPos = null;

    // Audio context (wind loop)
    this._windOsc = null;
    this._windGain = null;

    // Visual elements
    this._trailParticles = null;
    this._poseAngle = 0;

    // Last frame snapshot pra detectar landing
    this._lastY = null;
    this._onLanded = null;
  }

  /** Inicia a queda numa posição (geralmente acima do mapa). */
  start(startPos, onLanded) {
    this.active = true;
    this.startPos = startPos.clone();
    this.player.mesh.position.copyFrom(startPos);
    this.altitude = startPos.y;
    this.velocity.set(0, -10, 0);
    this.pitch = 30;
    this.yaw = this.player.yaw || 0;
    this._lastY = startPos.y;
    this._onLanded = onLanded;

    // Desativa colisão normal do player (vai usar kinematic durante skydive)
    if (this.player.body?.setMotionType) {
      try { this.player.body.setMotionType(BABYLON.PhysicsMotionType.KINEMATIC); } catch (_) {}
    }

    // Inicia som de vento (loop procedural)
    this._startWindAudio();

    // Inicia partículas de trail
    this._startTrail();

    // Notifica server
    try { this.cs?.sendMessage?.('br_skydive_start', { x: startPos.x, y: startPos.y, z: startPos.z }); } catch (_) {}
  }

  /** Loop principal — chamar a cada frame com dt em segundos. */
  update(dt, input) {
    if (!this.active || !this.player?.mesh) return;

    // ── 1) Input: pitch (W/S) ──
    if (input?.keys?.KeyW || input?.forward) {
      this.pitch = Math.min(PHYSICS.PITCH_MAX, this.pitch + PHYSICS.PITCH_RATE * dt);
    }
    if (input?.keys?.KeyS || input?.back) {
      this.pitch = Math.max(PHYSICS.PITCH_MIN, this.pitch - PHYSICS.PITCH_RATE * dt);
    }

    // ── 2) Input: yaw (A/D) ──
    if (input?.keys?.KeyA || input?.left) {
      this.yaw -= PHYSICS.YAW_RATE * dt;
    }
    if (input?.keys?.KeyD || input?.right) {
      this.yaw += PHYSICS.YAW_RATE * dt;
    }

    // ── 3) Compute terminal velocity baseada no pitch ──
    // pitch 0 = belly down (30 m/s), pitch 75 = head down (80 m/s)
    const pitchRad = (this.pitch * Math.PI) / 180;
    const pitchT = Math.sin(pitchRad); // 0..0.96
    const terminalVy = -BABYLON.Scalar.Lerp(
      PHYSICS.TERMINAL_HORIZONTAL,
      PHYSICS.TERMINAL_VERTICAL,
      pitchT
    );

    // Horizontal speed cresce com pitch baixo (mais drag = mais glide)
    // pitch 0 = max horizontal (25), pitch 75 = pouco horizontal (~10)
    const horizontalMax = BABYLON.Scalar.Lerp(PHYSICS.MAX_HORIZONTAL, 10, pitchT);

    // ── 4) Aplica gravidade até atingir terminal ──
    if (this.velocity.y > terminalVy) {
      this.velocity.y -= PHYSICS.GRAVITY * dt * 1.5; // pull acelerado
      if (this.velocity.y < terminalVy) this.velocity.y = terminalVy;
    } else if (this.velocity.y < terminalVy) {
      // pose virou pra mais horizontal → freia subida
      this.velocity.y = BABYLON.Scalar.Lerp(this.velocity.y, terminalVy, Math.min(1, dt * 2));
    }

    // ── 5) Horizontal: direção do yaw + influence do pitch ──
    const yawRad = (this.yaw * Math.PI) / 180;
    const forwardX = Math.sin(yawRad) * horizontalMax;
    const forwardZ = Math.cos(yawRad) * horizontalMax;
    this.velocity.x = BABYLON.Scalar.Lerp(this.velocity.x, forwardX, Math.min(1, dt * 1.5));
    this.velocity.z = BABYLON.Scalar.Lerp(this.velocity.z, forwardZ, Math.min(1, dt * 1.5));

    // ── 6) Move ──
    const pos = this.player.mesh.position;
    pos.x += this.velocity.x * dt;
    pos.y += this.velocity.y * dt;
    pos.z += this.velocity.z * dt;
    this.altitude = Math.max(0, pos.y);

    // ── 7) Pose visual (inclina o avatar) ──
    // pitch 75 = avatar olhando pra baixo (rotação X = -75°)
    // pitch 0  = avatar horizontal (rotação X = -10°, head-up belly-down)
    if (this.player.mesh.rotation) {
      const targetPitchRad = -(BABYLON.Scalar.Lerp(10, 80, pitchT) * Math.PI / 180);
      this.player.mesh.rotation.x = BABYLON.Scalar.Lerp(
        this.player.mesh.rotation.x || 0,
        targetPitchRad,
        Math.min(1, dt * 5)
      );
      this.player.mesh.rotation.y = yawRad;
    }

    // ── 8) Atualiza câmera 3rd-person seguindo trás ──
    if (this.player.camera) {
      const camOffset = new BABYLON.Vector3(
        -Math.sin(yawRad) * 5,
        2.5,
        -Math.cos(yawRad) * 5
      );
      const camTarget = pos.add(camOffset);
      this.player.camera.position = BABYLON.Vector3.Lerp(
        this.player.camera.position,
        camTarget,
        Math.min(1, dt * 6)
      );
      this.player.camera.setTarget(pos.add(new BABYLON.Vector3(0, 0.5, 0)));
    }

    // ── 9) Áudio: pitch do vento varia com velocidade ──
    if (this._windOsc) {
      const speed = this.velocity.length();
      const targetFreq = 80 + speed * 4; // 80Hz parado, ~400Hz cheio
      try {
        this._windOsc.frequency.setTargetAtTime(targetFreq, this._audioCtx.currentTime, 0.1);
        this._windGain.gain.setTargetAtTime(Math.min(0.25, speed / 100), this._audioCtx.currentTime, 0.1);
      } catch (_) {}
    }

    // ── 10) Sync para servidor (5Hz) ──
    this._syncT = (this._syncT || 0) - dt;
    if (this._syncT <= 0) {
      try {
        this.cs?.sendMessage?.('br_skydive_input', {
          pitch: this.pitch, yaw: this.yaw, altitude: this.altitude,
          x: pos.x, y: pos.y, z: pos.z,
        });
      } catch (_) {}
      this._syncT = 0.2;
    }

    // ── 11) Detecta proximidade do chão pra trigger landing ──
    if (this._checkGroundProximity(pos)) {
      this._triggerLanding();
    }

    this._lastY = pos.y;
  }

  /** Raycast pra baixo pra ver se tá perto do chão. */
  _checkGroundProximity(pos) {
    const ray = new BABYLON.Ray(pos, new BABYLON.Vector3(0, -1, 0), PHYSICS.LANDING_THRESHOLD + 2);
    const hit = this.scene.pickWithRay(ray, (m) => m.isPickable && m !== this.player.mesh);
    if (hit?.hit && hit.distance < PHYSICS.LANDING_THRESHOLD) {
      return true;
    }
    return false;
  }

  _triggerLanding() {
    this.active = false;
    this._stopWindAudio();
    this._stopTrail();
    // Restaura motion type pra dynamic
    if (this.player.body?.setMotionType) {
      try { this.player.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); } catch (_) {}
    }
    // Zera rotação X (avatar fica em pé)
    if (this.player.mesh.rotation) this.player.mesh.rotation.x = 0;
    // Velocidade final (sem fall damage, mas mantém momentum horizontal pra slide-in)
    const finalVel = this.velocity.clone();
    finalVel.y = 0; // zera vertical
    // Callback
    if (this._onLanded) {
      this._onLanded({
        position: this.player.mesh.position.clone(),
        velocity: finalVel,
        impactSpeed: Math.abs(this.velocity.y),
      });
    }
    try { this.cs?.sendMessage?.('br_landed', { x: this.player.mesh.position.x, y: this.player.mesh.position.y, z: this.player.mesh.position.z }); } catch (_) {}
  }

  _startWindAudio() {
    try {
      this._audioCtx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const ctx = this._audioCtx;
      // Brown noise via biquad filtrado simula vento
      this._windOsc = ctx.createOscillator();
      this._windOsc.type = 'sawtooth';
      this._windOsc.frequency.value = 100;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 200;
      noiseFilter.Q.value = 0.5;
      this._windGain = ctx.createGain();
      this._windGain.gain.value = 0;
      this._windOsc.connect(noiseFilter);
      noiseFilter.connect(this._windGain);
      this._windGain.connect(ctx.destination);
      this._windOsc.start();
    } catch (_) {}
  }
  _stopWindAudio() {
    try { this._windOsc?.stop(); this._windOsc?.disconnect(); } catch (_) {}
    try { this._windGain?.disconnect(); } catch (_) {}
    this._windOsc = null; this._windGain = null;
  }

  _startTrail() {
    try {
      const ps = new BABYLON.ParticleSystem('skydiveTrail', 200, this.scene);
      const dt = new BABYLON.DynamicTexture('trailTex', 16, this.scene, false);
      const ctx = dt.getContext();
      ctx.fillStyle = 'rgba(220,235,255,1)';
      ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill();
      dt.update();
      ps.particleTexture = dt;
      ps.emitter = this.player.mesh;
      ps.minEmitBox = new BABYLON.Vector3(-0.2, 0, -0.2);
      ps.maxEmitBox = new BABYLON.Vector3(0.2, 0, 0.2);
      ps.color1 = new BABYLON.Color4(0.85, 0.95, 1, 0.5);
      ps.color2 = new BABYLON.Color4(0.6, 0.8, 1, 0.3);
      ps.colorDead = new BABYLON.Color4(0.4, 0.6, 1, 0);
      ps.minSize = 0.05; ps.maxSize = 0.18;
      ps.minLifeTime = 0.3; ps.maxLifeTime = 0.6;
      ps.emitRate = 60;
      ps.gravity = new BABYLON.Vector3(0, 0, 0);
      ps.direction1 = new BABYLON.Vector3(0, 2, 0);
      ps.direction2 = new BABYLON.Vector3(0, 4, 0);
      ps.minEmitPower = 1; ps.maxEmitPower = 2;
      ps.start();
      this._trailParticles = ps;
    } catch (_) {}
  }
  _stopTrail() {
    try { this._trailParticles?.stop(); setTimeout(() => this._trailParticles?.dispose(), 800); } catch (_) {}
    this._trailParticles = null;
  }

  stop() {
    this.active = false;
    this._stopWindAudio();
    this._stopTrail();
  }

  isActive() { return this.active; }
  getAltitude() { return this.altitude; }
  getVelocity() { return this.velocity.clone(); }
}
