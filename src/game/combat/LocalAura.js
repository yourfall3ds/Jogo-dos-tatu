// ─────────────────────────────────────────────────────────────────
//  LocalAura — aura vermelha efervescente do PLAYER LOCAL.
//
//  ParticleSystem 3D em loop. Ativada quando pvp_on=true.
//  Plugada no mesh do player local (animator.root ou mesh capsule).
// ─────────────────────────────────────────────────────────────────

export class LocalAura {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this._active = false;

    // Cria texture procedural (gota fumaça vermelha)
    const tex = new BABYLON.DynamicTexture('localAuraTex',
      { width: 64, height: 64 }, scene, false);
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,90,40,1)');
    grd.addColorStop(0.5, 'rgba(220,30,15,0.55)');
    grd.addColorStop(1, 'rgba(60,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
    tex.update(); tex.hasAlpha = true;

    // PS principal (smoke rising)
    const ps = new BABYLON.ParticleSystem('localAura', 220, scene);
    ps.particleTexture = tex;
    ps.minEmitBox = new BABYLON.Vector3(-0.50, 0.0, -0.50);
    ps.maxEmitBox = new BABYLON.Vector3( 0.50, 1.8,  0.50);
    ps.color1 = new BABYLON.Color4(1.0, 0.35, 0.10, 0.95);
    ps.color2 = new BABYLON.Color4(0.78, 0.05, 0.05, 0.95);
    ps.colorDead = new BABYLON.Color4(0.18, 0.0, 0.0, 0);
    ps.minSize = 0.22; ps.maxSize = 0.55;
    ps.minLifeTime = 0.55; ps.maxLifeTime = 1.10;
    ps.emitRate = 130;
    ps.gravity = new BABYLON.Vector3(0, 1.8, 0);  // sobe (efervescente)
    ps.direction1 = new BABYLON.Vector3(-0.5, 0.5, -0.5);
    ps.direction2 = new BABYLON.Vector3( 0.5, 1.4,  0.5);
    ps.minAngularSpeed = -Math.PI * 1.5;
    ps.maxAngularSpeed =  Math.PI * 1.5;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.minScaleX = 0.7; ps.maxScaleX = 1.4;
    ps.minScaleY = 0.7; ps.maxScaleY = 1.4;
    this.ps = ps;

    // PS secundário (faíscas pequenas brancas/laranjas)
    const sparks = new BABYLON.ParticleSystem('localAuraSparks', 60, scene);
    sparks.particleTexture = tex;
    sparks.minEmitBox = new BABYLON.Vector3(-0.40, 0.2, -0.40);
    sparks.maxEmitBox = new BABYLON.Vector3( 0.40, 1.6,  0.40);
    sparks.color1 = new BABYLON.Color4(1.0, 0.85, 0.30, 1);
    sparks.color2 = new BABYLON.Color4(1.0, 0.45, 0.10, 1);
    sparks.colorDead = new BABYLON.Color4(0.5, 0.1, 0.0, 0);
    sparks.minSize = 0.04; sparks.maxSize = 0.12;
    sparks.minLifeTime = 0.35; sparks.maxLifeTime = 0.70;
    sparks.emitRate = 80;
    sparks.gravity = new BABYLON.Vector3(0, 2.4, 0);
    sparks.direction1 = new BABYLON.Vector3(-0.8, 1.0, -0.8);
    sparks.direction2 = new BABYLON.Vector3( 0.8, 2.2,  0.8);
    sparks.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this.sparks = sparks;

    // Shell glow mesh (cápsula semi-transparente vermelha em torno do player)
    const shell = BABYLON.MeshBuilder.CreateCapsule('localAuraShell',
      { radius: 0.55, height: 1.95, tessellation: 16 }, scene);
    shell.isPickable = false;
    shell.checkCollisions = false;
    const shellMat = new BABYLON.StandardMaterial('localAuraShellMat', scene);
    shellMat.diffuseColor = new BABYLON.Color3(0.7, 0.05, 0.05);
    shellMat.emissiveColor = new BABYLON.Color3(0.65, 0.05, 0.05);
    shellMat.specularColor = BABYLON.Color3.Black();
    shellMat.alpha = 0.18;
    shellMat.backFaceCulling = false;
    shell.material = shellMat;
    shell.setEnabled(false);
    this.shell = shell;
    this._shellPulse = 0;

    this._pickEmitter();
  }

  _pickEmitter() {
    // Prefere o mesh do animator (TPS) se existir, senão o mesh capsule
    const emitter = this.player.animator?.root || this.player.mesh;
    if (!emitter) return;
    this.ps.emitter = emitter;
    this.sparks.emitter = emitter;
    this.shell.parent = emitter;
    this.shell.position.y = 0.9; // centro da cápsula do player
  }

  setActive(on) {
    if (this._active === on) return;
    this._active = on;
    this._pickEmitter();
    if (on) {
      this.ps.start(); this.sparks.start(); this.shell.setEnabled(true);
    } else {
      this.ps.stop(); this.sparks.stop(); this.shell.setEnabled(false);
    }
  }

  isActive() { return this._active; }

  update(dt) {
    if (!this._active) return;
    // Pulse no shell pra ficar vivo
    this._shellPulse += dt * 4;
    const k = (Math.sin(this._shellPulse) + 1) * 0.5;
    if (this.shell?.material) {
      this.shell.material.alpha = 0.13 + k * 0.10;
    }
    // Re-attacha se animator foi recriado
    if (this.player.animator?.root && this.shell.parent !== this.player.animator.root) {
      this._pickEmitter();
    }
  }

  dispose() {
    try { this.ps?.dispose(); } catch (_) {}
    try { this.sparks?.dispose(); } catch (_) {}
    try { this.shell?.dispose(); } catch (_) {}
  }
}
