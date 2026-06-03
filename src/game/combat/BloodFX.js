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
    // Textura de poça ORGÂNICA gerada via canvas (data-uri) — bordas irregulares,
    // não um disco vermelho chapado. Sem arquivo externo (zero 404 / zero CORS).
    const tex = this._buildSplatTexture();
    mat.diffuseTexture = tex;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;       // alpha vem do PNG (borda recortada)
    mat.opacityTexture = tex;                     // reforça o recorte da poça
    mat.diffuseColor = new BABYLON.Color3(0.45, 0.02, 0.02); // vermelho escuro (sangue seco)
    mat.emissiveColor = new BABYLON.Color3(0.10, 0.0, 0.0);
    mat.specularColor = BABYLON.Color3.Black();
    mat.alpha = 0.92;
    mat.backFaceCulling = false;
    // zOffset evita z-fighting do decal com o chão (recomendado pela doc oficial de Decals).
    // Polígono renderizado "à frente" do mesh-alvo sem perfurar a geometria.
    mat.zOffset = -2;
    this._decalMat = mat;
  }

  /**
   * Gera uma textura de respingo/poça de sangue ORGÂNICA via canvas (data-uri).
   * Núcleo escuro + blobs satélites irregulares + bordas recortadas (alpha).
   * Nada de arquivo externo: zero 404 / zero CORS (regra do projeto).
   */
  _buildSplatTexture() {
    if (this._splatTex) return this._splatTex;
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const cx = S / 2, cy = S / 2;

    // Mancha central irregular
    const core = ctx.createRadialGradient(cx, cy, S * 0.04, cx, cy, S * 0.42);
    core.addColorStop(0.0, 'rgba(150,12,16,0.98)');
    core.addColorStop(0.55, 'rgba(120,8,12,0.92)');
    core.addColorStop(0.85, 'rgba(80,3,6,0.55)');
    core.addColorStop(1.0, 'rgba(60,0,2,0)');
    ctx.fillStyle = core;
    // mancha central deformada (polígono irregular suavizado)
    ctx.beginPath();
    const blobs = 9;
    for (let i = 0; i <= blobs; i++) {
      const a = (i / blobs) * Math.PI * 2;
      const r = S * (0.26 + Math.random() * 0.14);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Manchas secundárias irregulares grudadas no núcleo (poça nunca é um disco liso)
    const lobes = 5;
    for (let i = 0; i < lobes; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = S * (0.14 + Math.random() * 0.16);
      const lx = cx + Math.cos(a) * dist;
      const ly = cy + Math.sin(a) * dist;
      const lr = S * (0.10 + Math.random() * 0.12);
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0.0, 'rgba(125,8,12,0.92)');
      lg.addColorStop(0.7, 'rgba(95,4,8,0.6)');
      lg.addColorStop(1.0, 'rgba(70,0,3,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pingos/escorridos alongados saindo da poça (streaks = respingo de verdade)
    const drips = 8;
    for (let i = 0; i < drips; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = S * 0.30;
      const len = S * (0.06 + Math.random() * 0.12);
      const x0 = cx + Math.cos(a) * r0;
      const y0 = cy + Math.sin(a) * r0;
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      const w = S * (0.012 + Math.random() * 0.025);
      const lg = ctx.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(120,7,11,0.85)');
      lg.addColorStop(1, 'rgba(90,2,5,0)');
      ctx.strokeStyle = lg;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // cabeça arredondada do pingo na ponta
      const hr = S * (0.012 + Math.random() * 0.03);
      const hg = ctx.createRadialGradient(x1, y1, 0, x1, y1, hr);
      hg.addColorStop(0, 'rgba(120,7,11,0.85)');
      hg.addColorStop(1, 'rgba(90,2,5,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x1, y1, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Respingos satélites (gotas espalhadas em volta = orgânico)
    const drops = 22;
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = S * (0.28 + Math.random() * 0.20);
      const dx = cx + Math.cos(a) * dist;
      const dy = cy + Math.sin(a) * dist;
      const rr = S * (0.015 + Math.random() * 0.045);
      const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr);
      g.addColorStop(0, 'rgba(130,8,12,0.9)');
      g.addColorStop(1, 'rgba(90,2,5,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(dx, dy, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new BABYLON.Texture(cv.toDataURL('image/png'), this.scene, true, false);
    tex.hasAlpha = true;
    this._splatTex = tex;
    return tex;
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

    // Gradiente: vermelho VIVO no nascimento -> vermelho ESCURO ao morrer.
    ps.color1 = new BABYLON.Color4(0.85, 0.07, 0.09, 1.0);   // vermelho vivo
    ps.color2 = new BABYLON.Color4(0.62, 0.03, 0.05, 1.0);   // vermelho médio
    ps.colorDead = new BABYLON.Color4(0.22, 0.0, 0.01, 0.0); // vermelho escuro -> some
    // Reforça o gradiente de cor ao longo da vida (vivo -> escuro -> transparente)
    if (ps.addColorGradient) {
      ps.addColorGradient(0.0, new BABYLON.Color4(0.90, 0.10, 0.12, 1.0));
      ps.addColorGradient(0.55, new BABYLON.Color4(0.55, 0.02, 0.04, 1.0));
      ps.addColorGradient(1.0, new BABYLON.Color4(0.20, 0.0, 0.0, 0.0));
    }

    // Respingos MENORES + mais densos = realismo (vs gota grande)
    ps.minSize = preset.sizeMin * 0.6;
    ps.maxSize = preset.sizeMax * 0.85;
    ps.minLifeTime = 0.28;   // vida curta
    ps.maxLifeTime = 0.50;   // caem rápido e somem
    ps.emitRate = count * 10;
    ps.gravity = new BABYLON.Vector3(0, -26, 0);   // gravidade FORTE = caem rápido
    // Espalhamento mais largo na direção do golpe = jato/leque de respingos
    ps.direction1 = new BABYLON.Vector3(dir.x * preset.speed - 3.5, preset.speed * 0.5, dir.z * preset.speed - 3.5);
    ps.direction2 = new BABYLON.Vector3(dir.x * preset.speed + 3.5, preset.speed * 1.25, dir.z * preset.speed + 3.5);
    ps.minAngularSpeed = -Math.PI * 2;
    ps.maxAngularSpeed =  Math.PI * 2;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;  // ALPHA (respeita alpha da textura redonda)
    ps.manualEmitCount = count;

    ps.start();
    // Auto-stop after 1 frame (one-shot) + dispose após lifetime
    setTimeout(() => { try { ps.stop(); } catch (_) {} }, 50);
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1200);
  }

  _getDropTexture() {
    if (this._dropTex) return this._dropTex;
    // Respingo IRREGULAR (não disco liso): núcleo deformado + micro-gotas satélites,
    // borda recortada por alpha. Branco -> as cores do ParticleSystem pintam de sangue.
    // Gerada via canvas data-uri — sem arquivo externo (zero 404 / zero CORS).
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const c = S / 2;

    // Núcleo deformado (polígono irregular) — gota de sangue, não círculo perfeito
    const grd = ctx.createRadialGradient(c, c, 0, c, c, c * 0.92);
    grd.addColorStop(0.0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,235,235,0.95)');
    grd.addColorStop(0.80, 'rgba(255,210,210,0.45)');
    grd.addColorStop(1.0, 'rgba(255,200,200,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    const pts = 8;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const r = c * (0.62 + Math.random() * 0.34);
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Micro-gotas destacadas (espalhamento de respingo)
    const sat = 5;
    for (let i = 0; i < sat; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = c * (0.45 + Math.random() * 0.45);
      const sx = c + Math.cos(a) * d;
      const sy = c + Math.sin(a) * d;
      const sr = c * (0.05 + Math.random() * 0.12);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, 'rgba(255,235,235,0.95)');
      sg.addColorStop(1, 'rgba(255,200,200,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new BABYLON.Texture(cv.toDataURL('image/png'), this.scene, true, false);
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
      // metadata pra fade-out suave depois de alguns segundos
      decal._bloodBorn = performance.now() / 1000;
      decal._bloodLife = 8 + Math.random() * 4;   // 8-12s antes de começar a sumir
      decal._bloodFade = 2.5;                      // dura 2.5s sumindo
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
    const now = performance.now() / 1000;

    // Fade-out das poças de sangue (visibility por-mesh, material é compartilhado)
    if (this._decalPool && this._decalPool.length) {
      for (let i = this._decalPool.length - 1; i >= 0; i--) {
        const d = this._decalPool[i];
        if (!d || d.isDisposed?.()) { this._decalPool.splice(i, 1); continue; }
        const age = now - (d._bloodBorn || now);
        if (age > d._bloodLife) {
          const t = (age - d._bloodLife) / d._bloodFade;
          if (t >= 1) {
            try { d.dispose(); } catch (_) {}
            this._decalPool.splice(i, 1);
          } else {
            d.visibility = 1 - t;
          }
        }
      }
    }

    if (!this._activeGushes.length) return;
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
