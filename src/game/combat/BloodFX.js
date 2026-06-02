// ─────────────────────────────────────────────────────────────────
//  BloodFX — sistema de partículas de sangue
//
//  Níveis de intensidade (controlados pelas settings):
//    'off'           → desligado
//    'normal'        → respingos discretos, 12-20 partículas
//    'extremo'       → jato forte, 60-100 partículas, decals no chão
//    'desnecessario' → CASCATA absurda 250-400 partículas, poças grandes,
//                      gushes contínuos por 1.5s após o golpe
//
//  Persistência: localStorage 'transfps_blood'
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'transfps_blood';

export const BLOOD_LEVELS = ['off', 'normal', 'extremo', 'desnecessario'];

const PRESETS = {
  off: {
    countMin: 0, countMax: 0,
    decalRadius: 0, decalChance: 0,
    gushDuration: 0, gushRate: 0,
    speed: 0, sizeMin: 0, sizeMax: 0,
  },
  normal: {
    countMin: 12, countMax: 22,
    decalRadius: 0.30, decalChance: 0.35,
    gushDuration: 0, gushRate: 0,
    speed: 6, sizeMin: 0.05, sizeMax: 0.14,
  },
  extremo: {
    countMin: 55, countMax: 95,
    decalRadius: 0.70, decalChance: 0.80,
    gushDuration: 0.5, gushRate: 40,
    speed: 11, sizeMin: 0.08, sizeMax: 0.22,
  },
  desnecessario: {
    countMin: 220, countMax: 380,
    decalRadius: 1.40, decalChance: 1.0,
    gushDuration: 1.8, gushRate: 140,
    speed: 16, sizeMin: 0.12, sizeMax: 0.32,
  },
};

export class BloodFX {
  constructor(scene) {
    this.scene = scene;
    this.level = this._loadLevel();
    this._activeGushes = [];   // { source, until, rate, accum }
    this._decalMat = null;     // material compartilhado pra decals de poça
    this._buildDecalMat();
  }

  _loadLevel() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (BLOOD_LEVELS.includes(v)) return v;
    } catch (_) {}
    // Default: EXTREMO (Lucas: usuario reduz/aumenta/desliga depois nas configs)
    return 'extremo';
  }

  setLevel(lvl) {
    if (!BLOOD_LEVELS.includes(lvl)) return;
    this.level = lvl;
    try { localStorage.setItem(STORAGE_KEY, lvl); } catch (_) {}
    console.log(`[BloodFX] nível: ${lvl}`);
  }

  getLevel() { return this.level; }

  _buildDecalMat() {
    const mat = new BABYLON.StandardMaterial('bloodDecalMat', this.scene);
    mat.diffuseColor = new BABYLON.Color3(0.55, 0.05, 0.07);
    mat.emissiveColor = new BABYLON.Color3(0.30, 0.02, 0.03);
    mat.specularColor = BABYLON.Color3.Black();
    mat.alpha = 0.92;
    mat.backFaceCulling = false;
    this._decalMat = mat;
  }

  /**
   * Dispara burst de sangue em uma posição.
   * @param {BABYLON.Vector3} position - origem do impacto
   * @param {BABYLON.Vector3} direction - direção (normalizada, pra onde o sangue voa)
   * @param {{ multiplier?: number, sourceNode?: BABYLON.TransformNode, isHeavy?: boolean }} opts
   */
  spawn(position, direction = null, opts = {}) {
    if (this.level === 'off') return;
    const preset = PRESETS[this.level];
    const mult = opts.multiplier || 1;
    const isHeavy = !!opts.isHeavy;
    const dir = (direction && direction.length() > 0.01)
      ? direction.clone().normalize()
      : BABYLON.Vector3.Up();

    // Burst inicial
    const count = Math.floor(
      (preset.countMin + Math.random() * (preset.countMax - preset.countMin)) * mult
    );
    this._spawnBurst(position, dir, count, preset);

    // Decal no chão (poça)
    if (Math.random() < preset.decalChance) {
      this._spawnDecal(position, preset.decalRadius * mult);
    }

    // Gushes (sangue contínuo seguindo o inimigo) — só em extremo/desnecessario
    if (preset.gushDuration > 0 && opts.sourceNode) {
      this._activeGushes.push({
        source: opts.sourceNode,
        offset: position.subtract(opts.sourceNode.getAbsolutePosition()),
        until: performance.now() / 1000 + preset.gushDuration * (isHeavy ? 1.4 : 1),
        rate: preset.gushRate * mult,
        accum: 0,
        preset,
        baseDir: dir.clone(),
      });
    }
  }

  _spawnBurst(position, dir, count, preset) {
    if (count <= 0) return;
    // Usa Babylon ParticleSystem para perf
    const ps = new BABYLON.ParticleSystem(`blood_${Date.now()}_${Math.random()}`, count, this.scene);
    ps.particleTexture = this._getDropTexture();
    ps.emitter = position.clone();
    ps.minEmitBox = new BABYLON.Vector3(-0.05, -0.05, -0.05);
    ps.maxEmitBox = new BABYLON.Vector3( 0.05,  0.05,  0.05);

    ps.color1 = new BABYLON.Color4(0.78, 0.08, 0.10, 1.0);
    ps.color2 = new BABYLON.Color4(0.50, 0.02, 0.04, 1.0);
    ps.colorDead = new BABYLON.Color4(0.30, 0.0, 0.0, 0.0);

    ps.minSize = preset.sizeMin;
    ps.maxSize = preset.sizeMax;
    ps.minLifeTime = 0.35;
    ps.maxLifeTime = 0.85;
    ps.emitRate = count * 10;
    ps.gravity = new BABYLON.Vector3(0, -18, 0);
    ps.direction1 = new BABYLON.Vector3(dir.x * preset.speed - 2, preset.speed * 0.6, dir.z * preset.speed - 2);
    ps.direction2 = new BABYLON.Vector3(dir.x * preset.speed + 2, preset.speed * 1.1, dir.z * preset.speed + 2);
    ps.minAngularSpeed = -Math.PI * 2;
    ps.maxAngularSpeed =  Math.PI * 2;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.manualEmitCount = count;

    ps.start();
    // Auto-stop after 1 frame (one-shot) + dispose após lifetime
    setTimeout(() => { try { ps.stop(); } catch (_) {} }, 50);
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1200);
  }

  _getDropTexture() {
    if (this._dropTex) return this._dropTex;
    // Gera textura procedural (gota vermelha radial)
    const tex = new BABYLON.DynamicTexture('bloodDrop', { width: 32, height: 32 }, this.scene, false);
    const ctx = tex.getContext();
    const grd = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    grd.addColorStop(0, 'rgba(180,20,25,1)');
    grd.addColorStop(0.6, 'rgba(130,5,12,0.95)');
    grd.addColorStop(1, 'rgba(80,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    tex.hasAlpha = true;
    this._dropTex = tex;
    return tex;
  }

  /**
   * Pool de poças (decals chão) — limite pra não vazar memória
   */
  _spawnDecal(position, radius) {
    if (!this._decalPool) this._decalPool = [];
    const MAX_POOL = 60;

    // Raycast pra baixo do ponto de impacto pra achar chão
    const ray = new BABYLON.Ray(position.clone().add(new BABYLON.Vector3(0, 0.2, 0)), BABYLON.Vector3.Down(), 6);
    const hit = this.scene.pickWithRay(ray, m =>
      m.isEnabled() && m.isPickable !== false && m !== this.scene.activeCamera?._parent &&
      !m.name.startsWith('enemy_') && !m.name.startsWith('hitbox') &&
      !m.name.startsWith('bloodDecal') && !m.name.startsWith('xglb')
    );
    if (!hit?.hit || !hit.pickedMesh) return;

    const size = radius + Math.random() * radius * 0.5;
    try {
      const decal = BABYLON.MeshBuilder.CreateDecal('bloodDecal', hit.pickedMesh, {
        position: hit.pickedPoint,
        normal: hit.getNormal(true),
        size: new BABYLON.Vector3(size, size, size),
        angle: Math.random() * Math.PI * 2,
      });
      decal.material = this._decalMat;
      decal.isPickable = false;
      this._decalPool.push(decal);
      // FIFO: descarta mais antigos
      while (this._decalPool.length > MAX_POOL) {
        const old = this._decalPool.shift();
        try { old.dispose(); } catch (_) {}
      }
    } catch (e) {
      // Decal pode falhar em meshes complexos — silencioso
    }
  }

  /**
   * Update por frame — processa gushes (sangue contínuo seguindo o inimigo).
   */
  update(dt) {
    if (!this._activeGushes.length) return;
    const now = performance.now() / 1000;
    for (let i = this._activeGushes.length - 1; i >= 0; i--) {
      const g = this._activeGushes[i];
      if (now > g.until || !g.source || g.source.isDisposed?.()) {
        this._activeGushes.splice(i, 1);
        continue;
      }
      g.accum += g.rate * dt;
      const emit = Math.floor(g.accum);
      if (emit > 0) {
        g.accum -= emit;
        const pos = g.source.getAbsolutePosition().add(g.offset);
        // Mini-burst contínuo (jorrando)
        this._spawnBurst(pos, g.baseDir, Math.min(emit, 25), g.preset);
      }
    }
  }

  cleanup() {
    // Limpa pool de decais e gushes
    if (this._decalPool) {
      this._decalPool.forEach(d => { try { d.dispose(); } catch (_) {} });
      this._decalPool = [];
    }
    this._activeGushes = [];
  }
}
