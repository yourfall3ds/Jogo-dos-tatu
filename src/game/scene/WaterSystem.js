// ─────────────────────────────────────────────────────────────────
//  WaterSystem — adiciona piscinas/poças ao mapa com:
//   • Detecção de "player na água" (volume box)
//   • Sons de splash (entrada) e squish (passos molhados — N tempo após sair)
//   • VFX de respingo ao entrar
//
//  Sons sintéticos via WebAudio (não depende de assets faltantes).
//  Persiste WaterPool spots; integra com SkillMapExtras pra o layout.
// ─────────────────────────────────────────────────────────────────

export class WaterSystem {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.pools = [];           // [{ box: Mesh, mesh: water plane, y: topo }]
    this._inWater = false;
    this._wetTimer = 0;        // segundos com pés molhados (decay quando seco)
    this._stepCooldown = 0;
    this._audioCtx = null;
  }

  build() {
    // Material de água (azul translúcido com leve onda)
    const waterMat = new BABYLON.StandardMaterial('waterMat', this.scene);
    waterMat.diffuseColor = new BABYLON.Color3(0.08, 0.32, 0.55);
    waterMat.emissiveColor = new BABYLON.Color3(0.04, 0.18, 0.28);
    waterMat.specularColor = new BABYLON.Color3(0.6, 0.7, 0.8);
    waterMat.specularPower = 80;
    waterMat.alpha = 0.72;
    waterMat.backFaceCulling = false;
    this.waterMat = waterMat;

    // 4 piscinas/poças espalhadas pelo mapa (skill map)
    const POOLS = [
      // [centerX, centerZ, width, depth, depthBelow]
      [-32, -25, 14, 10, 1.2],   // piscina noroeste — boa pra treinar dash sobre água
      [ 35,  20, 18, 12, 1.5],   // piscina sudeste — grande
      [  0, -45,  8,  8, 0.8],   // poça norte — rasa
      [ 25, -10, 10,  6, 1.0],   // poça lateral
    ];

    for (let i = 0; i < POOLS.length; i++) {
      const [cx, cz, w, d, depthBelow] = POOLS[i];
      this._buildPool(`pool_${i}`, cx, cz, w, d, depthBelow);
    }
  }

  _buildPool(name, cx, cz, w, d, depthBelow) {
    // Bacia rebaixada (parede + chão de pedra)
    const top = 0;        // nível da água
    const bottomY = -depthBelow;

    // Buraco no chão original já é assumido (o ground do Level é flat). Em vez
    // disso, criamos o "fundo" da piscina mais baixo e paredes laterais finas.
    const floor = BABYLON.MeshBuilder.CreateBox(`${name}_floor`, {
      width: w, height: 0.4, depth: d,
    }, this.scene);
    floor.position.set(cx, bottomY - 0.2, cz);
    const floorMat = new BABYLON.StandardMaterial(`${name}_floorMat`, this.scene);
    floorMat.diffuseColor = new BABYLON.Color3(0.18, 0.20, 0.24);
    floor.material = floorMat;
    floor.checkCollisions = true;
    floor.receiveShadows = true;
    if (this.scene.getPhysicsEngine?.()) {
      try { new BABYLON.PhysicsAggregate(floor, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, this.scene); }
      catch (_) {}
    }

    // Plano de água no topo
    const water = BABYLON.MeshBuilder.CreateGround(`${name}_surface`, {
      width: w - 0.2, height: d - 0.2,
    }, this.scene);
    water.position.set(cx, top, cz);
    water.material = this.waterMat;
    water.isPickable = false;
    water.checkCollisions = false; // player atravessa (entra na água)

    // Bordas (volume de detecção invisível pra teste de "na água")
    const volume = BABYLON.MeshBuilder.CreateBox(`${name}_vol`, {
      width: w - 0.5, height: depthBelow + 1.5, depth: d - 0.5,
    }, this.scene);
    volume.position.set(cx, top - (depthBelow + 1.5) / 2 + 0.5, cz);
    volume.isVisible = false;
    volume.isPickable = false;
    volume.checkCollisions = false;

    this.pools.push({ volume, surface: water, floor, cx, cz, w, d, top });
  }

  _isPlayerInWater(playerPos) {
    if (!playerPos) return null;
    for (const p of this.pools) {
      if (Math.abs(playerPos.x - p.cx) > p.w / 2) continue;
      if (Math.abs(playerPos.z - p.cz) > p.d / 2) continue;
      if (playerPos.y > p.top + 0.6) continue;     // muito alto
      if (playerPos.y < p.top - 3.0) continue;     // muito abaixo do chão
      return p;
    }
    return null;
  }

  update(dt, player) {
    if (!player?.mesh) return;
    const pos = player.mesh.position;
    const pool = this._isPlayerInWater(pos);
    const wasIn = this._inWater;
    this._inWater = !!pool;

    // ── Entrou na água ──
    if (this._inWater && !wasIn) {
      this._wetTimer = 6.0;   // 6s de pés molhados
      this._playSplash(pos, 0.85);
      this._spawnSplashFX(pos);
    }
    // ── Saiu da água ──
    else if (!this._inWater && wasIn) {
      // saída com salpico leve
      this._playSplash(pos, 0.4);
    }

    // ── Dentro da água: passos splash + abaixar velocidade ──
    if (this._inWater) {
      // Reduz velocidade horizontal (água viscosa)
      player._vx *= 0.85;
      player._vz *= 0.85;
      // Splash de cada passo (chute de cadência baseado em velocidade)
      this._stepCooldown -= dt;
      const moving = Math.abs(player._vx) + Math.abs(player._vz) > 4;
      if (moving && this._stepCooldown <= 0) {
        this._playSplash(pos, 0.5);
        this._stepCooldown = 0.32;
      }
    }
    // ── Fora da água com pés molhados → squish ──
    else if (this._wetTimer > 0) {
      this._wetTimer -= dt;
      this._stepCooldown -= dt;
      const moving = player.isGrounded &&
        (Math.abs(player._vx) + Math.abs(player._vz)) > 5;
      if (moving && this._stepCooldown <= 0) {
        this._playSquish(0.30 * Math.min(1, this._wetTimer / 3));
        this._stepCooldown = 0.36;
      }
    }
  }

  // ── Áudio sintético via WebAudio ────────────────────────────────
  _getCtx() {
    if (this._audioCtx) return this._audioCtx;
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
    return this._audioCtx;
  }

  _playSplash(pos, volume = 0.7) {
    const ctx = this._getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    // Splash = noise filtrado em low-pass com envelope rápido
    const bufSize = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + 0.35);
  }

  _playSquish(volume = 0.4) {
    const ctx = this._getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    // Squish = noise curto bem grave, pop molhado
    const bufSize = ctx.sampleRate * 0.13;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.8);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + 0.14);
  }

  _spawnSplashFX(pos) {
    // Partículas de água ao entrar
    const ps = new BABYLON.ParticleSystem('waterSplash', 40, this.scene);
    if (!this._waterTex) {
      const tex = new BABYLON.DynamicTexture('waterDrop', { width: 16, height: 16 }, this.scene, false);
      const ctx2 = tex.getContext();
      const grd = ctx2.createRadialGradient(8, 8, 1, 8, 8, 8);
      grd.addColorStop(0, 'rgba(200,230,255,1)');
      grd.addColorStop(1, 'rgba(120,180,220,0)');
      ctx2.fillStyle = grd;
      ctx2.fillRect(0, 0, 16, 16);
      tex.update();
      tex.hasAlpha = true;
      this._waterTex = tex;
    }
    ps.particleTexture = this._waterTex;
    ps.emitter = new BABYLON.Vector3(pos.x, pos.y, pos.z);
    ps.minEmitBox = new BABYLON.Vector3(-0.2, 0, -0.2);
    ps.maxEmitBox = new BABYLON.Vector3( 0.2, 0,  0.2);
    ps.color1 = new BABYLON.Color4(0.8, 0.95, 1.0, 1);
    ps.color2 = new BABYLON.Color4(0.5, 0.75, 0.9, 1);
    ps.colorDead = new BABYLON.Color4(0.3, 0.5, 0.7, 0);
    ps.minSize = 0.06;
    ps.maxSize = 0.14;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.9;
    ps.emitRate = 200;
    ps.gravity = new BABYLON.Vector3(0, -12, 0);
    ps.direction1 = new BABYLON.Vector3(-3, 6, -3);
    ps.direction2 = new BABYLON.Vector3(3, 9, 3);
    ps.manualEmitCount = 40;
    ps.start();
    setTimeout(() => { try { ps.stop(); } catch (_) {} }, 60);
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1200);
  }

  isInWater() { return this._inWater; }
  isWet() { return this._wetTimer > 0; }
}
