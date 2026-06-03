import { PistolaBucaneira } from './game/weapons/PistolaBucaneira.js';
import { RiflePesado }      from './game/weapons/RiflePesado.js';
import { EspadaPaladin }    from './game/weapons/EspadaPaladin.js';
import { EspadaZweihander } from './game/weapons/EspadaZweihander.js';
import { Chibata }          from './game/weapons/Chibata.js';
import { LocalDB }           from './game/data/LocalDB.js';

/**
 * WeaponSystem - Controla o inventário e troca de armas.
 */
export class WeaponSystem {
  constructor(camera, scene, level = null) {
    this.camera = camera;
    this.scene  = scene;
    this.level  = level;

    // ── Instâncias das Armas ──────────────────────────────────────
    this.slot1 = new PistolaBucaneira(scene);
    this.slot1.id = 'pistol';

    this.slot2 = new RiflePesado(scene);
    this.slot2.id = 'rifle';

    // ── Espadas (melee) — ordem ao ciclar com scroll ──
    this.slot3 = new EspadaPaladin(scene);
    this.slot3.id = 'sword_paladin';

    this.slot4 = new EspadaZweihander(scene);
    this.slot4.id = 'sword_zweihander';

    // ── Chibata (whip) ──
    this.slot5 = new Chibata(scene);
    this.slot5.id = 'chibata';

    this.weapons = [this.slot1, this.slot2, this.slot3, this.slot4, this.slot5];
    this.currentWeaponIndex = 0;

    // Stats atuais (serão sobrescritos pelo init())
    const startW = this.weapons[0];
    this.ammo      = startW.ammo;
    this.maxAmmo   = startW.maxAmmo;
    this.reloading = false;
    this._reloadT  = 0;
    this._reloadDur = 1.5;     // duração total da recarga atual (p/ cancel)
    this._chambered = false;   // tinha bala na câmara ao começar a recarga? (tactical = mag+1)
    this.FIRE_RATE = startW.fireRate;
    this._fireT    = 0;

    // Efeitos
    this._recoilPitch = 0; this._recoilVel = 0;
    this._bobT = 0; this._bobAmt = 0;
    this._tiltZ = 0; this._tiltVel = 0;

    // ── Recoil de CÂMERA (kick vertical que decai) ──
    // Acumula no fire (GRAUS). O Player CONSOME via consumeRecoilPitch() e
    // aplica como OFFSET de pitch dentro de _updateCamera (NUNCA escreve direto
    // em camera.rotation, que é totalmente reconstruída por setTarget todo frame).
    // Decai *0.85/frame até zerar → a mira volta exatamente pro centro.
    // Só PITCH, nunca yaw. Visual: não altera o pitch base real do Player.
    this._recoilKick = 0;        // pitch acumulado em GRAUS, decai por frame

    this._weaponMeshes = {}; // { id: root } 1ª Pessoa
    this._tpsMeshes    = {}; // { id: root } 3ª Pessoa
    this._glbRoot      = null;

    // Wrapper para a arma, permite animar recoil sem quebrar a rotação do modelo
    this._root = new BABYLON.TransformNode('weaponRoot', scene);
    this._root.parent = this.camera;

    // Ponto cego genérico, será parentado na arma ativa
    this._muzzlePoint = new BABYLON.TransformNode('muzzlePoint', scene);

    this._buildMuzzleFlash();
    this._buildHitPool();
    this._buildTracerPool();
    this._buildDecalMaterial();
    this._buildMuzzleLight();
    this._buildHitLight();
    this._buildGlowLayer();

    this.onHit = null;
    this.onFired = null;
    this.onWeaponSwitched = null;
    this._tpsRayOrigin = null;

    // ── VR: arma na mão, mira pelo controle ──────────────────────────
    //  Setado pelo VRSystem. Quando _vrMode é true, o tiro sai da boca da
    //  arma (na mão) na direção pra onde o controle aponta, e o update()
    //  não mexe na câmera XR (recoil/ADS de viewmodel são desligados).
    this._vrMode = false;
    this._vrAimOrigin = null;   // BABYLON.Vector3 — origem do ray do controle
    this._vrAimDir = null;      // BABYLON.Vector3 — direção do ray do controle

    // Inicialização assíncrona dos stats via LocalDB
    this._init();
  }

  async _init() {
    const dbWeapons = await LocalDB.get('weapons', {});
    if (Object.keys(dbWeapons).length === 0) return;

    for (const w of this.weapons) {
      const cfg = dbWeapons[w.id];
      if (cfg) {
        w.label    = cfg.label    ?? w.label;
        w.damage   = cfg.damage   ?? w.damage;
        w.fireRate = cfg.fireRate ?? w.fireRate;
        w.maxAmmo  = cfg.maxAmmo  ?? w.maxAmmo;
        w.ammo     = w.maxAmmo;

        if (cfg.viewmodelScale)    w.viewmodelScale    = cfg.viewmodelScale;
        if (cfg.viewmodelPosition) w.viewmodelPosition = new BABYLON.Vector3(...cfg.viewmodelPosition);
        if (cfg.viewmodelRotation) w.viewmodelRotation = new BABYLON.Vector3(...cfg.viewmodelRotation);
        if (cfg.muzzleOffset)      w.muzzleOffset      = new BABYLON.Vector3(...cfg.muzzleOffset);
        
        if (cfg.tpsScale)    w.tpsScale    = cfg.tpsScale;
        if (cfg.tpsRotation) w.tpsRotation = new BABYLON.Vector3(...cfg.tpsRotation);
        if (cfg.tpsPosition) w.tpsPosition = new BABYLON.Vector3(...cfg.tpsPosition);
        
        if (cfg.tracerColor) w.tracerColor = cfg.tracerColor;
        if (cfg.tracerAlpha) w.tracerAlpha = cfg.tracerAlpha;
      }
    }
    // Atualiza stats da arma atual
    const cur = this.getCurrentWeapon();
    this.ammo = cur.ammo;
    this.maxAmmo = cur.maxAmmo;
    this.FIRE_RATE = cur.fireRate;
    console.log(`[WeaponSystem] Stats carregados via LocalDB.`);
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeaponIndex];
  }

  getTPSWeaponMesh(weaponId) {
    return this._tpsMeshes[weaponId];
  }

  async switchWeapon(index) {
    if (index === this.currentWeaponIndex || index < 0 || index >= this.weapons.length) return;
    
    // Esconde atual
    const oldW = this.getCurrentWeapon();
    if (this._weaponMeshes[oldW.id]) this._weaponMeshes[oldW.id].setEnabled(false);
    if (this._tpsMeshes[oldW.id])    this._tpsMeshes[oldW.id].setEnabled(false);

    this.currentWeaponIndex = index;
    const w = this.getCurrentWeapon();
    
    this.ammo = w.ammo;
    this.maxAmmo = w.maxAmmo;
    this.FIRE_RATE = w.fireRate;
    
    if (this._weaponMeshes[w.id]) {
      this._glbRoot = this._weaponMeshes[w.id];
      this._glbRoot.setEnabled(true);
      if (this._muzzlePoint) {
          this._muzzlePoint.parent = this._glbRoot;
          this._muzzlePoint.position = w.muzzleOffset;
      }
      w.applyToMesh(this._glbRoot, false);
    }

    // ── Sincroniza modo do PlayerStateMachine ──
    // Espada equipada → state 'sword' (canAttack true); arma de fogo → 'armed'.
    const sm = this._stateMachine || window._gamePlayer?.stateMachine;
    if (sm) {
      // Trocar de arma SEMPRE deixa a arma pronta pra usar — equipa conforme
      // o tipo, sem depender de isArmedFlag (estar em modo luta não devia
      // pular a sincronização da arma de fogo).
      if (w.isMelee) sm.equipSword();
      else           sm.equipWeapon();
    }

    if (this.onWeaponSwitched) this.onWeaponSwitched(w);
  }

  setGLBWeapon(meshes, weaponId) {
    if (!meshes?.length) return;
    const glbRoot = meshes[0];
    this._weaponMeshes[weaponId] = glbRoot;
    glbRoot.parent = this._root;

    this._fitWebGPUMaterials(meshes);   // cabe no limite de 16 varyings do WebGPU

    const weaponRef = this.weapons.find(w => w.id === weaponId);
    if (!weaponRef) {
        console.warn(`[WeaponSystem] Tentou setar mesh para arma inexistente: ${weaponId}`);
        return;
    }

    // ── Mede bounds originais em model-space (antes de qualquer escala) ───────
    // Fazemos isso UMA VEZ aqui, antes do primeiro applyToMesh.
    // Detachamos temporariamente o parent para que getHierarchyBoundingVectors
    // retorne coordenadas no espaço local do modelo (não afetadas pela câmera).
    {
        const savedParent = glbRoot.parent;
        glbRoot.parent             = null;
        glbRoot.rotationQuaternion = null;
        glbRoot.rotation.copyFromFloats(0, 0, 0);
        glbRoot.scaling.copyFromFloats(1, 1, 1);
        glbRoot.position.copyFromFloats(0, 0, 0);

        const bb   = glbRoot.getHierarchyBoundingVectors(true);
        const size = bb.max.subtract(bb.min);
        weaponRef._origMaxDim = Math.max(size.x, size.y, size.z);
        weaponRef._origCenter = bb.min.add(bb.max).scale(0.5);

        glbRoot.parent = savedParent;
    }

    // Configura 1ª pessoa
    weaponRef.applyToMesh(glbRoot, false);
    meshes.forEach(m => { 
        m.isPickable = false; m.castShadows = false; m.receiveShadows = false; 
    });

    // Configura 3ª pessoa (Clone)
    // 3º arg = doNotCloneChildren → DEVE ser false, senão a arma vem sem geometria!
    const tpsRoot = glbRoot.clone(`tps_${weaponId}`, null, false);
    if (tpsRoot) {
      this._tpsMeshes[weaponId] = tpsRoot;
      tpsRoot.setEnabled(false);
      weaponRef.applyToMesh(tpsRoot, true);
      tpsRoot.getChildMeshes().forEach(m => {
          m.setEnabled(true); m.isVisible = true; m.isPickable = false;
          m.castShadows = true; m.receiveShadows = false;   // não recebe (varyings WebGPU)
      });
      this._fitWebGPUMaterials([tpsRoot, ...tpsRoot.getChildMeshes()]);   // limite de 16 varyings
    }

    if (weaponRef.id === this.getCurrentWeapon().id) {
        this._glbRoot = glbRoot;
        glbRoot.setEnabled(true);
        if (this._muzzlePoint) {
            this._muzzlePoint.parent = glbRoot;
            this._muzzlePoint.position = weaponRef.muzzleOffset;
        }
    } else {
        glbRoot.setEnabled(false);
    }
  }

  /**
   * Ajusta materiais de arma pro limite do WebGPU (máx 16 variáveis
   * inter-stage vertex→fragment). Materiais PBR pesados (4 texturas +
   * normal map) + extras da cena (clip planes da água, sombras) estouravam
   * 16 → o shader não compilava → "Invalid RenderPipeline" → tela preta em
   * 3ª pessoa. O `two-sided lighting` adiciona o `front_facing` (+1); desligá-lo
   * (com backface culling ligado) libera 1 varying e resolve. Só no WebGPU.
   */
  _fitWebGPUMaterials(meshes) {
    if (!window._webgpu || !meshes) return;
    const seen = new Set();
    for (const m of meshes) {
      // Arma NÃO precisa RECEBER sombra (continua PROJETANDO). Com sol+lua
      //  em CSM (8 cascatas somadas), receber sombra adiciona MUITAS varyings
      //  → estoura o limite de 16 do WebGPU. Desligar libera bastante folga.
      try { m.receiveShadows = false; } catch (_) {}
      const mat = m.material;
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      try {
        if ('twoSidedLighting' in mat) mat.twoSidedLighting = false;  // tira o front_facing (+1)
        mat.backFaceCulling = true;
      } catch (_) {}
    }
  }

  // ── Material de decal (buraco de bala na parede) ─────────────────
  _buildDecalMaterial() {
    // DynamicTexture: círculo escuro com borda queimada
    const tex = new BABYLON.DynamicTexture('bholeTex', { width: 64, height: 64 }, this.scene, false);
    const ctx = tex.getContext();
    const c   = 32;
    // Sombra exterior (queimada)
    const outer = ctx.createRadialGradient(c, c, 8, c, c, 30);
    outer.addColorStop(0,   'rgba(0,0,0,0.95)');
    outer.addColorStop(0.6, 'rgba(20,10,0,0.7)');
    outer.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.beginPath(); ctx.arc(c, c, 30, 0, Math.PI * 2); ctx.fill();
    // Buraco central
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath(); ctx.arc(c, c, 9, 0, Math.PI * 2); ctx.fill();
    tex.update();

    const mat = new BABYLON.StandardMaterial('bholeMat', this.scene);
    mat.diffuseTexture  = tex;
    mat.opacityTexture  = tex;
    mat.emissiveColor   = new BABYLON.Color3(0.06, 0.04, 0.02);
    mat.disableLighting = true;
    mat.zOffset         = -2;   // evita z-fighting com a parede

    this._decalMat   = mat;
    this._decalPool  = [];       // array de decals criados (para limpar os mais velhos)
    this._decalMax   = 40;       // máximo de buracos de bala na cena ao mesmo tempo
  }

  // Cria decal de buraco de bala na superfície
  _spawnDecal(pickedMesh, position, normal) {
    if (!pickedMesh || !position) return;
    try {
      const size = new BABYLON.Vector3(0.28, 0.28, 0.28);
      const decal = BABYLON.MeshBuilder.CreateDecal('bhole', pickedMesh, {
        position,
        normal: normal ?? BABYLON.Vector3.Up(),
        size,
        angle: Math.random() * Math.PI * 2,
      });
      decal.material  = this._decalMat;
      decal.isPickable = false;

      this._decalPool.push(decal);
      // Remove o mais antigo quando ultrapassa o limite
      if (this._decalPool.length > this._decalMax) {
        this._decalPool.shift().dispose();
      }
    } catch (_) {
      // Algumas geometrias procedurais não suportam decals — ignora silenciosamente
    }
  }

  _buildMuzzleFlash() {
    const mat = new BABYLON.StandardMaterial('muzzleMat', this.scene);
    mat.emissiveColor = new BABYLON.Color3(1, .8, .3);
    mat.disableLighting = true;
    this._flash = BABYLON.MeshBuilder.CreateSphere('muzzleFlash', { diameter: .22, segments: 5 }, this.scene);
    this._flash.parent   = this._muzzlePoint;
    this._flash.material = mat;
    this._flash.setEnabled(false);
    this._flash.isPickable = false;
  }

  _buildHitPool() {
    const mat = new BABYLON.StandardMaterial('hitMat', this.scene);
    mat.emissiveColor = new BABYLON.Color3(1, .5, .1);
    mat.disableLighting = true;
    this._hitPool = Array.from({ length: 20 }, (_, i) => {
      const m = BABYLON.MeshBuilder.CreateSphere(`hit_${i}`, { diameter: .06, segments: 3 }, this.scene);
      m.material = mat; m.setEnabled(false);
      return { mesh: m, life: 0 };
    });
    this._hitIdx = 0;
  }

  _buildTracerPool() {
    // Cada item do pool tem seu próprio material (para cor independente)
    this._tracerPool = Array.from({ length: 20 }, (_, i) => {
      const mat = new BABYLON.StandardMaterial(`tracerMat_${i}`, this.scene);
      mat.emissiveColor   = new BABYLON.Color3(1, 1, 0.6);
      mat.alpha           = 0.6;
      mat.disableLighting = true;
      mat.backFaceCulling = false;

      const m = BABYLON.MeshBuilder.CreateBox(`tracer_${i}`,
        { width: .015, height: .015, depth: 1 }, this.scene);
      m.material  = mat;
      m.setEnabled(false);
      m.isPickable = false;
      return { mesh: m, life: 0, maxLife: 0.12 };
    });
    this._tracerIdx = 0;
  }

  // ── PointLight: boca da arma ──────────────────────────────────────
  _buildMuzzleLight() {
    const l = new BABYLON.PointLight('muzzleLight', BABYLON.Vector3.Zero(), this.scene);
    l.intensity  = 0;
    l.range      = 8;
    l.diffuse    = new BABYLON.Color3(1, 0.8, 0.3);
    l.specular   = new BABYLON.Color3(0, 0, 0);
    this._muzzleLight     = l;
    this._muzzleLightT    = 0;
    this._muzzleLightMax  = 0.07;
    this._muzzleLightBase = 0;
  }

  // ── PointLight: ponto de impacto ──────────────────────────────────
  _buildHitLight() {
    const l = new BABYLON.PointLight('hitLight', BABYLON.Vector3.Zero(), this.scene);
    l.intensity  = 0;
    l.range      = 10;
    l.diffuse    = new BABYLON.Color3(1, 0.5, 0.1);
    l.specular   = new BABYLON.Color3(0, 0, 0);
    this._hitLight     = l;
    this._hitLightT    = 0;
    this._hitLightMax  = 0.20;
    this._hitLightBase = 0;
  }

  // ── GlowLayer: faz traçadores e flash brilharem ───────────────────
  _buildGlowLayer() {
    // ⚠️ DESLIGADO no WebGPU: o GlowLayer cria o PostProcessRTT-highlights que
    // injeta varyings extras no fragment shader → com PBR pesado o total passa
    // de 16 ("fragment input 17 > 16") → RenderPipeline inválido → tela quebrada
    // com spam de GPUValidationError todo frame. Glow só em WebGL2; em WebGPU os
    // tracers/muzzle ainda aparecem pelo emissivo, só sem o bloom de contorno.
    if (window._webgpu) {
      console.log('[WeaponSystem] GlowLayer desligado no WebGPU (evita estouro de 16 varyings)');
      return;
    }
    try {
      this._glowLayer = new BABYLON.GlowLayer('weaponGlow', this.scene, {
        mainTextureFixedSize: 256,
        blurKernelSize: 24,
      });
      this._glowLayer.intensity = 0.55;
      // Só aplica glow nos meshes de efeito (tracer/flash/hit) — não na cena inteira
      this._glowLayer.customEmissiveColorSelector = (mesh, _sub, _mat, result) => {
        const n = mesh.name;
        if (n.startsWith('tracer_') || n === 'muzzleFlash' || n.startsWith('hit_')) {
          result.set(mesh.material?.emissiveColor.r ?? 0,
                     mesh.material?.emissiveColor.g ?? 0,
                     mesh.material?.emissiveColor.b ?? 0, 1);
        } else {
          result.set(0, 0, 0, 0); // sem glow em outros meshes
        }
      };
    } catch(e) {
      console.warn('[WeaponSystem] GlowLayer não disponível:', e.message);
    }
  }

  // ── Spread (dispersão) — aplica desvio aleatório no vetor dir IN-PLACE ──
  // w.spread (rad). Mirando (ADS) multiplica por w.aimSpreadMult pra ficar
  // mais preciso. _aimAmount (0..1) eh interpolado em update().
  _applySpread(dir) {
    try {
      const w = this.getCurrentWeapon();
      const base = (w?.spread ?? 0.0);
      if (base <= 0) return;
      const aimMult = w?.aimSpreadMult ?? 0.3;
      const aim = this._aimAmount ?? 0;
      // Lerp spread entre quadril (base) e mira (base*aimMult)
      const spread = base * (1 - aim * (1 - aimMult));
      if (spread <= 0) return;
      // Desvio aleatorio em cone
      const yaw   = (Math.random() - 0.5) * 2 * spread;
      const pitch = (Math.random() - 0.5) * 2 * spread;
      const m = BABYLON.Matrix.RotationYawPitchRoll(yaw, pitch, 0);
      const out = BABYLON.Vector3.TransformNormal(dir, m);
      dir.copyFrom(out.normalize());
    } catch (_) {}
  }

  shoot() {
    // Melee (espada): WeaponSystem.shoot é no-op. Player.js detecta isMelee
    // e roteia LMB para combatSystem.swordAttack().
    const curW = this.getCurrentWeapon();
    if (curW?.isMelee) return;
    if (this.reloading || this.ammo <= 0 || this._fireT > 0) return;
    this.ammo--;
    this._fireT = this.FIRE_RATE;
    if (this.onFired) this.onFired();

    this._flash.setEnabled(true);
    this._flashT = .06;
    this._recoilVel = -8;

    // ── Camera kick (recoil vertical) — SÓ PITCH, sutil e visual ──
    // Acumula em _recoilKick (GRAUS). O Player consome em consumeRecoilPitch(),
    // aplica como offset de pitch e decai *0.85/frame até voltar ao centro.
    // w.recoil opcional por arma; clampa o acúmulo pra nunca dar salto absurdo.
    this._recoilKick += (this.getCurrentWeapon().recoil ?? 1.2);
    this._recoilKick = Math.min(this._recoilKick, 6); // teto: kick suave, sem virar pra trás

    // ── Cores por arma ──────────────────────────────────────────────
    const w = this.getCurrentWeapon();
    const [mr, mg, mb] = w.muzzleColor ?? w.tracerColor ?? [1, 0.8, 0.3];

    // Flash de boca: cor + escala proporcional à arma
    if (this._flash.material) {
      this._flash.material.emissiveColor.set(mr, mg, mb);
    }
    const flashScale = (w.tracerWidth ?? 0.015) / 0.015;
    this._flash.scaling.setAll(flashScale * 0.9 + 0.1);

    // Muzzle PointLight
    const mpos = this._muzzlePoint.getAbsolutePosition();
    this._muzzleLight.position.copyFrom(mpos);
    this._muzzleLight.diffuse.set(mr, mg, mb);
    this._muzzleLight.range     = w.lightRadius   ?? 8;
    this._muzzleLightBase       = (w.lightIntensity ?? 2) * 2.0;
    this._muzzleLight.intensity = this._muzzleLightBase;
    this._muzzleLightT          = this._muzzleLightMax;

    // ── Direção e origem do ray ───────────────────────────────────────
    // TPS: origem nos olhos do jogador (sem parallaxe do ombro)
    // FPS: origem na câmera
    // VR: direção/origem vêm do controle (mira pra onde aponta a mão).
    // Senão: direção da câmera (FPS/TPS).
    let dir, rayOrigin;
    if (this._vrMode && this._vrAimDir) {
      dir = this._vrAimDir.clone();
      this._applySpread(dir);
      rayOrigin = (this._vrAimOrigin || this.camera.position).clone();
    } else {
      dir = this.camera.getDirection(BABYLON.Vector3.Forward());
      // ── Spread (dispersão) — reduzido ao mirar (ADS) ──────────────────
      //  Cada arma define w.spread (rad, padrão 0.025). Mirar multiplica por
      //  w.aimSpreadMult (padrão 0.3 → 70% mais preciso). _aimAmount (0..1) é
      //  o quanto está mirando agora, interpolado em update().
      this._applySpread(dir);
      rayOrigin = this._tpsRayOrigin
        ? this._tpsRayOrigin.add(dir.scale(0.6))
        : this.camera.position.clone();
    }

    // FIX PvP fidelidade: alcance 500 (era 300) pra acertar de longe.
    const ray = new BABYLON.Ray(rayOrigin, dir, 500);

    // ── Filtro do ray — igual ao original ────────────────────────────
    // Exclui: meshes não-picáveis, invisíveis, e todos os efeitos visuais
    const hit = this.scene.pickWithRay(ray, m =>
      // FIX PvP: o hitbox-proxy do player remoto (capsule invisível mas habilitada)
      // tem _isHitProxy=true e DEVE ser sempre picável — bypassa os filtros de
      // visibilidade (ele é invisível de propósito) mas continua sendo alvo limpo
      // que segue o pulo (parentado no root interpolado). Sem isso o ray cai no
      // GLB skinnado (bind-pose, hitbox errado) e os tiros falham.
      (m._isHitProxy === true && m.isEnabled())
      || (
      m.isEnabled()
      && m.isPickable !== false           // <─ CRÍTICO: exclui personagem (isPickable=false)
      && m.isVisible  !== false
      && (m.visibility ?? 1) > 0.05
      && !m.name.startsWith('gun')
      && !m.name.startsWith('arm')
      && !m.name.startsWith('muzzle')
      && !m.name.startsWith('hit')
      && !m.name.startsWith('tracer')
      && !m.name.startsWith('spark')
      && !m.name.startsWith('expl')
      && !m.name.startsWith('bhole')
      && !m.name.startsWith('tps_')      // clone TPS da arma
      && !m.name.startsWith('weaponRoot')
      )
    );

    // ── Tracer: em FPS sai da boca da arma; em TPS sai da origem do ray
    // (em TPS o _root FPS está desabilitado — _muzzlePoint fica na posição
    //  errada da câmera, então usa rayOrigin que está nos olhos do jogador)
    const isTPS = !!this._tpsRayOrigin;
    const hasMuzzle = !isTPS && this._muzzlePoint.parent != null;
    const start = hasMuzzle
      ? this._muzzlePoint.getAbsolutePosition()
      : rayOrigin.clone();
    const end = hit?.hit ? hit.pickedPoint : rayOrigin.add(dir.scale(150));
    this._spawnTracer(start, end);

    if (hit?.hit && hit.pickedPoint) {
      this._spawnHitEffect(hit.pickedPoint);

      // ── Inimigo ──────────────────────────────────────────────────
      if (hit.pickedMesh?._enemyRef) {
        const dmg = this.getCurrentWeapon().damage;
        hit.pickedMesh._enemyRef.takeDamage(dmg, dir);
        // Número de dano flutuante no ponto do tiro
        window._dmgNumbers?.spawn(hit.pickedPoint || hit.pickedMesh.getAbsolutePosition(), dmg, { color: '#ffffff' });
        // SANGUE no ponto do tiro
        if (window._bloodFX) {
          window._bloodFX.spawn(
            hit.pickedPoint || hit.pickedMesh.getAbsolutePosition(),
            dir,
            { multiplier: dmg >= 60 ? 1.4 : 0.85, sourceNode: hit.pickedMesh }
          );
        }
      }

      // ── PvP: tiro acertou outro player remoto ──
      if (hit.pickedMesh?._isRemotePlayer && hit.pickedMesh._remoteRef) {
        const dmg = this.getCurrentWeapon().damage;
        window._cs?.sendHitPlayer?.(hit.pickedMesh._remoteRef.playerId, dmg, this.getCurrentWeapon().id);
        window._dmgNumbers?.spawn(hit.pickedPoint || hit.pickedMesh.getAbsolutePosition(), dmg, { color: '#ff6666' });
        // HITMARKER imediato no crosshair do atirador (tier por dano).
        window._hitMarker?.hit({ dmg, crit: dmg >= 80 });
        // Knockback + flinch PREDITIVO no alvo (visual, na direção do tiro).
        try { hit.pickedMesh._remoteRef.playHit?.(dir, dmg >= 60 ? 4 : 2.5, dmg >= 80 ? 1 : 0); } catch (_) {}
        if (window._bloodFX) {
          window._bloodFX.spawn(hit.pickedPoint, dir, {
            multiplier: dmg >= 60 ? 1.4 : 0.85, sourceNode: hit.pickedMesh,
          });
        }
      }

      // ── Tiro acertou mob remoto (server-auth) ──
      if (hit.pickedMesh?._isRemoteMob && hit.pickedMesh._mobRef) {
        const dmg = this.getCurrentWeapon().damage;
        window._cs?.sendHitMob?.(hit.pickedMesh._mobRef.id, dmg, this.getCurrentWeapon().id);
        window._dmgNumbers?.spawn(hit.pickedPoint || hit.pickedMesh.getAbsolutePosition(), dmg, { color: '#ffffff' });
        if (window._bloodFX) {
          window._bloodFX.spawn(hit.pickedPoint, dir, {
            multiplier: dmg >= 60 ? 1.4 : 0.85, sourceNode: hit.pickedMesh,
          });
        }
      }

      // ── Objeto dinâmico (_gameObject = GameObject) ───────────────
      const gameObj = hit.pickedMesh?._gameObject;
      if (gameObj) {
        const forceMag = this.getCurrentWeapon().damage * 0.60;
        gameObj.applyImpulse(dir.scale(forceMag), hit.pickedPoint);
      } else if (this.level) {
        // Fallback de proximidade para objetos sem _gameObject
        this.level.applyBulletImpact(hit.pickedPoint, dir,
          this.getCurrentWeapon().damage * 0.45);
      }

      // ── Decal de buraco de bala (só em superfícies estáticas) ────
      const isStaticSurface = !hit.pickedMesh?._enemyRef
        && !hit.pickedMesh?._gameObject
        && hit.pickedMesh?.checkCollisions
        && hit.pickedMesh?.isVisible !== false;
      if (isStaticSurface) {
        const normal = hit.getNormal(true);
        this._spawnDecal(hit.pickedMesh, hit.pickedPoint, normal);
      }

      if (this.onHit) this.onHit();
    }
    
    if (this.ammo <= 0) this.startReload();
  }

  _spawnTracer(start, end) {
    const item = this._tracerPool[this._tracerIdx];
    this._tracerIdx = (this._tracerIdx + 1) % this._tracerPool.length;

    const w = this.getCurrentWeapon();
    const [tr, tg, tb] = w.tracerColor ?? [1, 1, 0.6];
    const talpha  = w.tracerAlpha  ?? 0.6;
    const twidth  = w.tracerWidth  ?? 0.015;
    const wMult   = twidth / 0.015;            // multiplicador de largura

    const mat = item.mesh.material;
    if (mat) {
      mat.emissiveColor.set(tr, tg, tb);
      mat.alpha = talpha;
    }

    const m    = item.mesh;
    const dist = BABYLON.Vector3.Distance(start, end);
    m.scaling.x = wMult;
    m.scaling.y = wMult;
    m.scaling.z = dist;
    m.position  = BABYLON.Vector3.Lerp(start, end, 0.5);
    m.lookAt(end);

    item.life    = 0.13;
    item.maxLife = 0.13;
    m.visibility = 1;
    m.setEnabled(true);
  }

  _spawnHitEffect(pos) {
    const item = this._hitPool[this._hitIdx];
    this._hitIdx = (this._hitIdx + 1) % this._hitPool.length;

    const w = this.getCurrentWeapon();
    const [hr, hg, hb] = w.hitColor ?? [1, 0.5, 0.1];
    const mat = item.mesh.material;
    if (mat) mat.emissiveColor.set(hr, hg, hb);

    // Tamanho inicial proporcional à largura do traçador
    const startScale = ((w.tracerWidth ?? 0.015) / 0.015) * 1.2;

    item.mesh.setEnabled(true);
    item.mesh.position.copyFrom(pos);
    item.mesh.scaling.setAll(startScale);
    item.life = 0.22;

    // Hit PointLight — ilumina a superfície atingida
    this._hitLight.position.copyFrom(pos);
    this._hitLight.diffuse.set(hr, hg, hb);
    this._hitLight.range     = w.lightRadius   ?? 10;
    this._hitLightBase       = w.lightIntensity ?? 2;
    this._hitLight.intensity = this._hitLightBase;
    this._hitLightT          = this._hitLightMax;
  }

  startReload() {
    const curW = this.getCurrentWeapon();
    if (curW?.isMelee) return;
    if (this.reloading || this.ammo === this.maxAmmo) return;
    this.reloading = true;
    this._reloadT = 1.5;
    if (this.onReload) this.onReload(this._reloadT);   // dispara o som casando com a duração
  }

  update(dt, isMoving, speed) {
    this._fireT = Math.max(0, this._fireT - dt);
    if (this._flashT > 0) { this._flashT -= dt; if (this._flashT <= 0) this._flash.setEnabled(false); }
    if (this.reloading) { this._reloadT -= dt; if (this._reloadT <= 0) { this.ammo = this.maxAmmo; this.reloading = false; } }

    // ── Luzes dinâmicas ─────────────────────────────────────────────
    if (this._muzzleLightT > 0) {
      this._muzzleLightT -= dt;
      const f = Math.max(0, this._muzzleLightT / this._muzzleLightMax);
      this._muzzleLight.intensity = this._muzzleLightBase * f * f;
      if (this._muzzleLightT <= 0) this._muzzleLight.intensity = 0;
    }

    if (this._hitLightT > 0) {
      this._hitLightT -= dt;
      const f = Math.max(0, this._hitLightT / this._hitLightMax);
      this._hitLight.intensity = this._hitLightBase * f * f;
      if (this._hitLightT <= 0) this._hitLight.intensity = 0;
    }

    // ── Efeitos visuais ─────────────────────────────────────────────
    this._hitPool.forEach(item => {
      if (item.life > 0) {
        item.life -= dt;
        item.mesh.scaling.scaleInPlace(0.88);
        if (item.life <= 0) item.mesh.setEnabled(false);
      }
    });

    this._tracerPool.forEach(item => {
      if (item.life > 0) {
        item.life -= dt;
        item.mesh.visibility = Math.max(0, item.life / (item.maxLife || 0.13));
        if (item.life <= 0) item.mesh.setEnabled(false);
      }
    });

    this._recoilVel += (0 - this._recoilPitch) * 20 * dt;
    this._recoilVel *= 0.8;
    this._recoilPitch += this._recoilVel * dt;

    if (this._root) {
        this._root.rotation.x = BABYLON.Tools.ToRadians(this._recoilPitch * 2);
    }

    // ── Camera recoil ──
    // NÃO escrevemos mais em camera.rotation aqui: a câmera é totalmente
    // reconstruída por Player._updateCamera()->setTarget() todo frame, então
    // qualquer write direto era apagado e gerava tremor. O kick agora é um
    // OFFSET de pitch consumido pelo Player (consumeRecoilPitch), aplicado
    // dentro do setTarget e decaído suave até zero. Só pitch, nunca yaw.

    // ── Mira ADS (FPS): interpola arma entre quadril e mira ──────────
    // this._aimTarget é setado pelo Player (1 = mirando, 0 = quadril).
    const aimTarget = this._aimTarget ?? 0;
    this._aimAmount = (this._aimAmount ?? 0) + (aimTarget - (this._aimAmount ?? 0)) * Math.min(1, dt * 12);
    if (Math.abs(this._aimAmount - aimTarget) < 0.001) this._aimAmount = aimTarget;
    // Reaplica posição da arma FPS atual com o aimAmount interpolado.
    // Em VR a arma está presa na mão (offset próprio) — não reaplica o
    // offset de câmera, senão a arma "voa" pra frente do controle.
    if (!this._vrMode && this._glbRoot) {
      const w = this.getCurrentWeapon();
      if (w && w.applyToMesh) w.applyToMesh(this._glbRoot, false, this._aimAmount);
    }
  }

  /**
   * Consome o recoil de câmera (kick vertical) acumulado.
   * Decai *0.85/frame (normalizado a 60fps) e retorna o valor ATUAL em GRAUS.
   * O Player aplica como offset de pitch (sobe a mira) só no _updateCamera,
   * sem mexer no pitch base — a mira volta exatamente pro centro ao zerar.
   * @param {number} dt segundos do frame
   * @returns {number} kick atual em graus (>= 0)
   */
  consumeRecoilPitch(dt) {
    const decay = Math.pow(0.85, Math.max(0, dt) * 60);
    this._recoilKick *= decay;
    if (Math.abs(this._recoilKick) < 1e-3) this._recoilKick = 0;
    return this._recoilKick;
  }

  /** Chamado pelo Player a cada frame: aiming = true/false */
  setAiming(aiming) { this._aimTarget = aiming ? 1 : 0; }

  // Chamado pelo Player no wall jump — inclina visualmente a arma
  applyWallJumpTilt(deg) {
    this._tiltVel = deg;
  }

  getAmmoInfo() { return { ammo: this.ammo, max: this.maxAmmo, reloading: this.reloading }; }
}
