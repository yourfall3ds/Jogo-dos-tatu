// ─────────────────────────────────────────────────────────────────
//  Level — terreno + obstáculos (sem Havok, usa checkCollisions)
//
//  Objetos dinâmicos (barris / caixas) têm física simples manual:
//  DynamicObject rastreia velocidade e usa moveWithCollisions.
// ─────────────────────────────────────────────────────────────────
import { MonsterPlant } from './Enemy.js';
import { GameObject }   from './game/scene/GameObject.js';
import { LocalDB }      from './game/data/LocalDB.js';
import { AssetGroups }  from './game/data/AssetGroups.js';
import { DEBUG }        from './utils/debug.js';

// Codifica espaços e acentos em caminhos de textura
function enc(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

export class Level {
  constructor(scene, shadowGen) {
    this.scene     = scene;
    this.shadowGen = shadowGen;
    this.dynamics  = [];   // lista de GameObject
    this.enemies   = [];   // lista de inimigos ativos
    this.player    = null; // referência ao Player (setada em main.js)

    this._mats = {};
    this._createMaterials();
    this._createSky();
    this._createGround();
    this._createWallJumpAlley();
    this._createPlatformTower();
    this._createCombatZone();
    this._createObstacles();
    this._createCheese();
    // Sem paredes de borda: o jogador PODE cair do mapa e morrer (kill plane no Player).
    // this._createBoundaries();

    // Restaura posições salvas pelo SceneEditor (se existirem) via LocalDB
    this._applySavedTransforms();
  }

  /** Lê o LocalDB e aplica transforms + configs de gameplay salvos */
  async _applySavedTransforms() {
    const cfg = await LocalDB.get('scene', {});
    let count = 0;
    for (const [name, t] of Object.entries(cfg)) {
      const mesh = this.scene.getMeshByName(name) || this.scene.getNodeByName(name);
      if (!mesh) continue;
      
      // Aplica Transform
      if (t.p) mesh.position.set(t.p[0], t.p[1], t.p[2]);
      if (t.r) mesh.rotation.set(t.r[0], t.r[1], t.r[2]);
      if (t.s) mesh.scaling.set(t.s[0], t.s[1], t.s[2]);

      // Aplica Configurações de Gameplay (GameObject)
      // Se tiver qualquer flag de gameplay habilitada, cria o GameObject
      if (t.breakable || t.physics || t.collect) {
        this.addInteractiveObject({
          mesh: mesh,
          isBreakable:   t.breakable ?? false,
          hasPhysics:    t.physics   ?? false,
          isCollectable: t.collect   ?? false,
          bounce:        t.bounce    ?? 0.22,
          hp:            t.hp        ?? 3,
          itemId:        t.itemId    ?? null,
          persistenceKey: name // Usa o nome do mesh como chave de persistência
        });
      }

      count++;
    }
    if (count) DEBUG.log(`[Level] ✅ ${count} objetos restaurados via LocalDB.`);
  }

  // ── Materiais ─────────────────────────────────────────────────────
  _createMaterials() {
    const s = this.scene;
    const TEX = 'assets/itens 3d/ExternalAssets/PolyHaven/Textures/';

    // Helper: StandardMaterial com textura PolyHaven
    const texMat = (name, diffPath, norPath, uv = 8) => {
      const m = new BABYLON.StandardMaterial(name, s);
      const dt = new BABYLON.Texture(enc(TEX + diffPath), s);
      dt.uScale = uv; dt.vScale = uv;
      m.diffuseTexture = dt;
      if (norPath) {
        const nt = new BABYLON.Texture(enc(TEX + norPath), s);
        nt.uScale = uv; nt.vScale = uv;
        m.bumpTexture = nt;
      }
      m.specularColor = new BABYLON.Color3(.05, .05, .05);
      return m;
    };

    // Helper: material sólido (para objetos dinâmicos e cheeses)
    const mat = (name, r, g, b) => {
      const m = new BABYLON.StandardMaterial(name, s);
      m.diffuseColor  = new BABYLON.Color3(r, g, b);
      m.specularColor = new BABYLON.Color3(.08, .08, .08);
      return m;
    };

    // Chão — sparse grass, grande escala
    this._mats.ground = texMat('mGround',
      'sparse_grass/sparse_grass_diff_2k.jpg',
      'sparse_grass/sparse_grass_nor_gl_2k.jpg', 4);

    // Paredes de wall jump — ferro enferrujado
    this._mats.wall = texMat('mWall',
      'rusty_corrugated_iron/rusty_corrugated_iron_diff_2k.jpg',
      'rusty_corrugated_iron/rusty_corrugated_iron_nor_gl_2k.jpg', 6);

    // Plataformas — metal azul
    this._mats.platA = texMat('mPlatA',
      'blue_metal_plate/blue_metal_plate_diff_2k.jpg',
      'blue_metal_plate/blue_metal_plate_nor_gl_2k.jpg', 4);

    // Plataformas alternadas — pedra
    this._mats.platB = texMat('mPlatB',
      'rock_ground_02/rock_ground_02_diff_2k.jpg',
      'rock_ground_02/rock_ground_02_nor_gl_2k.jpg', 4);

    // Objetos dinâmicos (sólidos para performance)
    this._mats.barrel = mat('mBarrel', .72, .28, .14);
    this._mats.crate  = mat('mCrate',  .60, .46, .26);
    this._mats.cheese = mat('mCheese', 1.0, .88, .08);
    this._mats.accent = mat('mAccent', .20, .58, .80);

    this._mats.cheese.emissiveColor = new BABYLON.Color3(.35, .30, 0);
    // Accent emissivo (marcadores de entrada)
    this._mats.accent.emissiveColor = new BABYLON.Color3(.04, .12, .18);
  }

  // ── Sky dome ──────────────────────────────────────────────────────
  //  DESATIVADO: o DayNightCycle agora fornece o céu HD (SkyMaterial). Este
  //  skyBox emissivo simples sobrepunha o novo e estourava o céu. Mantido
  //  o método vazio pra compatibilidade (chamado no construtor).
  _createSky() { /* céu agora vem do DayNightCycle */ }

  // ── Helper: caixa estática com colisão ────────────────────────────
  _box(name, w, h, d, x, y, z, mat, ry = 0) {
    const b = BABYLON.MeshBuilder.CreateBox(name,
      { width: w, height: h, depth: d }, this.scene);
    b.position.set(x, y, z);
    b.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, ry);
    b.material       = mat;
    b.checkCollisions = true;   // ← colisão nativa (coexiste durante a migração)
    b.receiveShadows = true;
    // Chão/elevações de terreno NÃO projetam sombra (só recebem) — senão o
    //  plano gigante atrapalha o CSM. Paredes/plataformas continuam casters.
    if (!/^(ground|bump_)/.test(name)) this.shadowGen.addShadowCaster(b);
    // ── Corpo ESTÁTICO Havok (chão/parede/plataforma firmes) ──────────
    if (this.scene.getPhysicsEngine?.()) {
      try { new BABYLON.PhysicsAggregate(b, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.6, restitution: 0.1 }, this.scene); }
      catch (e) { console.warn('[Level] física da caixa falhou:', name, e.message); }
    }
    return b;
  }

  // ── Chão ──────────────────────────────────────────────────────────
  _createGround() {
    this._box('ground', 100, 0.5, 100, 0, -0.25, 0, this._mats.ground);

    // Elevações suaves
    for (const [x,z,w,d,h] of [
      [ 12,-20, 18,14,1.2],
      [-18,-18, 14,12,1.0],
      [ 20,  8, 10,18, .8],
    ]) {
      this._box(`bump_${x}_${z}`, w, h, d, x, h/2, z, this._mats.ground);
    }
  }

  // ── Corredor de wall jump ─────────────────────────────────────────
  _createWallJumpAlley() {
    const H = 24, D = 6, GAP = 3.6, CX = 0, CZ = 18;
    const W = 1.2;

    this._box('alley_L',    W, H, D,       CX-GAP/2, H/2,         CZ,        this._mats.wall);
    this._box('alley_R',    W, H, D,       CX+GAP/2, H/2,         CZ,        this._mats.wall);
    this._box('alley_back', GAP+W*2, H, W, CX,       H/2,  CZ+D/2+W/2,      this._mats.wall);
    this._box('alley_entry',GAP+W*2,.4, 3, CX,       0.2,  CZ-D/2-1,        this._mats.accent);

    // Marcador no topo
    const flag = BABYLON.MeshBuilder.CreateBox('alley_flag', {size:.6}, this.scene);
    flag.position.set(CX, H+.5, CZ);
    flag.material  = this._mats.cheese;
    flag.isPickable = false;
  }

  // ── Torre de plataformas com pares de paredes ──────────────────────
  _createPlatformTower() {
    const TX = -16, TZ = 8;
    this._box('towerBase', 6, .4, 6, TX, .2, TZ, this._mats.platA);

    const floors = [
      [3, 5, 4, 8, 3.2, 3.5],
      [8, 4, 4, 8, 3.0, 3.5],
      [13,4, 3, 8, 2.8, 3.5],
      [18,3, 3, 6, 2.6, 3.0],
    ];
    for (let i = 0; i < floors.length; i++) {
      const [y, pw, pd, wh, wgap, wd] = floors[i];
      const mat  = i%2===0 ? this._mats.platA : this._mats.platB;
      const side = i%2===0 ? -5 : 5;

      this._box(`tPlat_${i}`,  pw,  .4, pd, TX,              y,          TZ, mat);
      this._box(`tWallL_${i}`,  1,  wh, wd, TX-wgap/2+side,  y-wh/2+wh, TZ, this._mats.wall);
      this._box(`tWallR_${i}`,  1,  wh, wd, TX+wgap/2+side,  y-wh/2+wh, TZ, this._mats.wall);
    }
    this._box('towerTop', 5, .5, 5, TX, 22.5, TZ, this._mats.accent);
  }

  // ── Zona de combate ───────────────────────────────────────────────
  _createCombatZone() {
    const covers = [
      [-5,-8,4,1.5,.4,0], [5,-8,4,1.5,.4,0],
      [0,-12,.4,1.5,4,0], [-10,-14,3,1.5,.4,.3], [10,-12,3,1.5,.4,-.3],
      [0,-5,.4,2,5,0], [15,-18,5,2,.4,0], [-14,-18,5,2,.4,0], [0,-22,8,2.5,.4,0],
    ];
    for (const [x,z,w,h,d,ry] of covers)
      this._box(`cover_${x}_${z}`, w, h, d, x, h/2, z, this._mats.wall, ry);

    // Plataformas de sniper
    this._box('sniper_L', 4, .4, 4, -22,  8, -15, this._mats.platB);
    this._box('sniper_R', 4, .4, 4,  22,  8, -15, this._mats.platB);
    this._box('sniper_C', 3, .4, 3,   0, 12, -22, this._mats.accent);

    // Rampas
    this._ramp('ramp_L', 3.5, .3, 7, -22, 4, -10, -.40);
    this._ramp('ramp_R', 3.5, .3, 7,  22, 4, -10,  .40);
  }

  _ramp(name, w, h, d, x, y, z, rx) {
    const b = this._box(name, w, h, d, x, y, z, this._mats.wall);
    b.rotation.x = rx;
    return b;
  }

  // ── Obstáculos dinâmicos (barris e caixotes empurráveis) ──────────
  _createObstacles() {
    const barrels = [
      [-4,1,-4],[4,1,-6],[-7,1,-10],[7,1,-10],
      [0,1,-16],[-12,1,-7],[12,1,-7],[2,1,12],[-3,1,14],
    ];
    for (const [x,y,z] of barrels) {
      const b = BABYLON.MeshBuilder.CreateCylinder(`barrel_${x}_${z}`,
        { height: 1.5, diameter: .9, tessellation: 12 }, this.scene);
      b.position.set(x, y, z);
      b.material = this._mats.barrel;
      b.receiveShadows = true;
      this.shadowGen.addShadowCaster(b);
      this.dynamics.push(new GameObject(b, this.scene, { hasPhysics: true, isBreakable: true, hp: 5 }));
    }

    const crates = [
      [-6,.6,-3],[6,.6,-5],[0,.6,-9],
      [-9,.6,-14],[9,.6,-14],[-3,.6,-20],
      [14,.6,-5],[-14,.6,-5],
    ];
    for (const [x,y,z] of crates) {
      const b = BABYLON.MeshBuilder.CreateBox(`crate_${x}_${z}`,
        { width:1.2, height:1.2, depth:1.2 }, this.scene);
      b.position.set(x, y, z);
      b.rotation.y = Math.random() * Math.PI;
      b.material = this._mats.crate;
      b.receiveShadows = true;
      this.shadowGen.addShadowCaster(b);
      this.dynamics.push(new GameObject(b, this.scene, { hasPhysics: true, isBreakable: true, hp: 3 }));
    }
  }

  // ── Queijo ────────────────────────────────────────────────────────
  _createCheese() {
    this.cheese = BABYLON.MeshBuilder.CreateBox('cheese_main',
      { width:1.2, height:1.0, depth:1.0 }, this.scene);
    this.cheese.position.set(0, 25.5, 18);
    this.cheese.rotation.y = Math.PI/4;
    this.cheese.material   = this._mats.cheese;
    this.cheese.isPickable = false;

    this.cheese2 = BABYLON.MeshBuilder.CreateBox('cheese_tower',
      { size:.9 }, this.scene);
    this.cheese2.position.set(-16, 23.5, 8);
    this.cheese2.material   = this._mats.cheese;
    this.cheese2.isPickable = false;
  }

  // ── Paredes invisíveis de borda ───────────────────────────────────
  _createBoundaries() {
    const im = new BABYLON.StandardMaterial('invis', this.scene);
    im.alpha = 0;
    const sz = 100, H = 50;
    for (const [x,y,z,w,h,d] of [
      [0,H/2, sz/2, sz,H,1],[0,H/2,-sz/2, sz,H,1],
      [sz/2,H/2,0, 1,H,sz],[-sz/2,H/2,0, 1,H,sz],
    ]) {
      const b = BABYLON.MeshBuilder.CreateBox(`boundary_${x}_${z}`,
        { width:w, height:h, depth:d }, this.scene);
      b.position.set(x,y,z);
      b.material       = im;
      b.checkCollisions = true;
      b.isPickable      = false;
    }
  }

  /** 
   * Atalho fácil para adicionar objetos interativos.
   * Ex: this.addInteractiveObject({ mesh, isBreakable: true, hasPhysics: true, persistenceKey: 'crate_01' })
   */
  addInteractiveObject(config) {
    const obj = new GameObject(config.mesh, this.scene, config);
    this.dynamics.push(obj);
    return obj;
  }

  // ── Update ────────────────────────────────────────────────────────
  update(dt) {
    for (const d of this.dynamics) d.update(dt);

    // ── Debris ──────────────────────────────────────────────────
    const debrisList = this.scene._levelDebris;
    if (debrisList?.length) {
      for (let i = debrisList.length - 1; i >= 0; i--) {
        const d = debrisList[i];
        d.update(dt);
        // GameObject agora gerencia seu próprio ciclo de vida de debris, 
        // mas precisamos limpar o array da cena
        if (d._isDebris && !d.mesh.isEnabled()) {
          try { d.mesh.dispose(); } catch(_) {}
          debrisList.splice(i, 1);
        }
      }
    }
    if (this.cheese)  this.cheese.rotation.y  += dt * 1.2;
    if (this.cheese2) this.cheese2.rotation.y += dt * 0.9;
    // Anima itens flutuantes
    this._floatTime = (this._floatTime || 0) + dt;
    for (const fi of (this._floatingItems || [])) {
      fi.mesh.position.y = fi.baseY + Math.sin(this._floatTime * 1.8 + fi.phase) * 0.12;
      fi.mesh.rotation.y += dt * 0.9;
    }

    // ── Atualiza inimigos ────────────────────────────────────────
    const playerPos  = this.player?.mesh?.position ?? BABYLON.Vector3.Zero();
    const cameraPos  = this.player?.camera?.position ?? null;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const alive = this.enemies[i].update(dt, playerPos, cameraPos);
      if (!alive) this.enemies.splice(i, 1);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Métodos chamados pelo AssetLoader quando GLBs ficam prontos
  // ════════════════════════════════════════════════════════════════

  /** Substitui os DynamicObjects de caixote/ammoBox pelo GLB correspondente.
   *  UNIFICADO com o sistema de assets: cada caixa/barril ganha um assetId
   *  (crate→crateWood, ammoBox→barrel) e usa a ESCALA PADRÃO da biblioteca.
   *  Assim o Editor de Asset (📐 Escala) controla TODAS as cópias do mapa. */
  async replaceObstacles(type, meshes) {
    if (!meshes?.length) return;
    const glbRoot = meshes[0];

    const positions = type === 'crate'
      ? [[-6,.6,-3],[6,.6,-5],[0,.6,-9],[-9,.6,-14],[9,.6,-14],[-3,.6,-20],[14,.6,-5],[-14,.6,-5]]
      : [[-4,1,-4],[4,1,-6],[-7,1,-10],[7,1,-10],[0,1,-16],[-12,1,-7],[12,1,-7]];

    // Asset correspondente na biblioteca + escala base do GLB
    const assetId  = type === 'crate' ? 'crateWood' : 'barrel';
    const baseScale = type === 'crate' ? 0.012 : 0.010;
    // Escala padrão definida no Editor (multiplica a base do GLB)
    let mult = 1;
    try { const ds = await AssetGroups.getDefaultScale(assetId); if (ds != null) mult = ds; } catch (_) {}
    const scale = baseScale * mult;

    this._mapObstacles = this._mapObstacles || [];

    for (const [x, y, z] of positions) {
      const clone = glbRoot.clone(`${type}_glb_${x}_${z}`, null, false);
      if (!clone) continue;
      clone.position.set(x, y, z);
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.scaling.setAll(scale);
      clone.setEnabled(true);
      clone._assetId = assetId; clone._baseScale = baseScale;   // p/ escala unificada
      clone.getChildMeshes().forEach(m => { m.isPickable = false; });

      const col = BABYLON.MeshBuilder.CreateBox(`${type}_col_${x}_${z}`,
        { size: 1.2 }, this.scene);
      col.position.set(x, y, z);
      col.isVisible       = false;
      col.checkCollisions = true;
      col.isPickable      = true;
      col.scaling.setAll(mult);   // colisor acompanha a escala
      col._assetId = assetId;

      this.shadowGen?.addShadowCaster(clone, true);
      this._mapObstacles.push({ clone, col, assetId, baseScale });

      this.dynamics = this.dynamics.filter(d => {
        const p = d.mesh.position;
        if (Math.abs(p.x - x) < 0.5 && Math.abs(p.z - z) < 0.5) {
          d.mesh.setEnabled(false);
          return false;
        }
        return true;
      });

      this.addInteractiveObject({
        mesh: col,
        glb: clone,
        isBreakable: true,
        hasPhysics: true,
        hp: (type === 'crate') ? 3 : 5,
        persistenceKey: `${type}_${x.toFixed(0)}_${z.toFixed(0)}`
      });
    }
    glbRoot.setEnabled(false);
  }

  /** Reaplica a escala (multiplicador) a todas as caixas/barris fixos de um
   *  assetId. Chamado pelo BuildMode.applyScaleToAll pra unificar com a
   *  biblioteca. Retorna quantos foram afetados. */
  applyObstacleScale(assetId, mult) {
    let n = 0;
    for (const o of (this._mapObstacles || [])) {
      if (o.assetId !== assetId || !o.clone || o.clone.isDisposed?.()) continue;
      o.clone.scaling.setAll(o.baseScale * mult);
      if (o.col && !o.col.isDisposed?.()) o.col.scaling.setAll(mult);
      n++;
    }
    return n;
  }

  /** Espalha pickups flutuantes pelo mapa */
  async spawnPickups(type, meshes) {
    if (!meshes?.length) return;
    this._floatingItems = this._floatingItems || [];
    this._mapObstacles = this._mapObstacles || [];

    const glbRoot = meshes[0];
    const baseScale = type === 'medkit' ? 0.008 : 0.01;
    let mult = 1;
    try { const ds = await AssetGroups.getDefaultScale(type); if (ds != null) mult = ds; } catch (_) {}
    const scale = baseScale * mult;

    const spots = [
      [0, 1.5, 0], [-10, 1.5, -5], [10, 1.5, -5],
      [5, 1.5, -20], [-5, 1.5, -20], [0, 9, -22],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, y, z] = spots[i];
      const clone = glbRoot.clone(`${type}_${i}`, null, false);
      if (!clone) continue;
      clone.position.set(x, y, z);
      clone.scaling.setAll(scale);
      clone.setEnabled(true);
      clone._assetId = type; clone._baseScale = baseScale;
      this._mapObstacles.push({ clone, col: null, assetId: type, baseScale });
      this.shadowGen?.addShadowCaster(clone, true);
      
      // Agora pickups também são GameObjects (coletáveis com persistência)
      this.addInteractiveObject({
        mesh: clone,
        isCollectable: true,
        persistenceKey: `pickup_${type}_${i}`,
        itemId: type === 'medkit' ? 'hpSmall' : 'ammo_pack' // IDs baseados no ItemCatalog
      });

      // Mantém na lista de animação visual se necessário, 
      // mas o GameObject já cuida da coleta.
      this._floatingItems.push({ mesh: clone, baseY: y, phase: i * 1.1 });
    }
    glbRoot.setEnabled(false);
  }

  /** Coloca decoração/props estáticos pelo mapa */
  async placeDecor(type, meshes) {
    if (!meshes?.length) return;
    const glbRoot = meshes[0];

    const configs = {
      // ── Sketchfab assets ────────────────────────────────────────────
      neonSign:    { spots: [[-8,2,-12],[8,2,-12],[0,3.5,-22],[16,2,-18],[-16,2,-18]], scale: 0.012, ry: [0, Math.PI, Math.PI/2, -Math.PI/4, Math.PI/4] },
      mushrooms:   { spots: [[-25,0,-5],[-22,0,5],[25,0,-8],[22,0,3],[-18,0,-20],[18,0,-20]], scale: 0.008, ry: null },
      crystals:    { spots: [[-16,23,8],[0,25.5,18],[0,13,-22],[22,8,-15],[-22,8,-15]], scale: 0.015, ry: null },
      industrial:  { spots: [[-5,0,-25],[5,0,-25],[-20,0,-20],[20,0,-22]], scale: 0.01, ry: null },
      sciTube:     { spots: [[-3,0,-25],[3,0,-25],[0,0,-30],[-8,0,-28],[8,0,-28]], scale: 0.009, ry: null },
      pedestal:    { spots: [[0,0,18],[-8,0,18],[8,0,18]], scale: 0.012, ry: null },
      crystalAltar:{ spots: [[-16,22,8],[0,24.5,18]], scale: 0.01, ry: [0, Math.PI/3] },
      // ── Meshy AI props ───────────────────────────────────────────────
      obelisk:     { spots: [[-12,0,-10],[12,0,-10],[0,0,25],[-20,0,0],[20,0,0]], scale: 0.012, ry: null },
      gargoyle:    { spots: [[-22,0,0],[22,0,0],[0,0,-30]], scale: 0.010, ry: [0, Math.PI, Math.PI/4] },
      runicHare:   { spots: [[3,0,3],[8,0,-8],[-8,0,-8]], scale: 0.009, ry: null },
      stoneBlock:  { spots: [[-3,0,-8],[3,0,-8],[0,0,-15],[5,0,-20],[-5,0,-20]], scale: 0.013, ry: null },
      // ── Criaturas (estáticas decorativas) ───────────────────────────
      // monsterPlant → agora é inimigo; usa spawnEnemyPlants() em vez de placeDecor()
      cockatrice:  { spots: [[-30,0,-10],[30,0,-10],[0,0,-35]], scale: 0.008, ry: [0, Math.PI, Math.PI/2] },
    };

    const cfg = configs[type];
    if (!cfg) { console.warn(`placeDecor: tipo desconhecido "${type}"`); return; }

    // Log das dimensões para ajudar a calibrar scale
    const bb = glbRoot.getHierarchyBoundingVectors();
    const sz = bb.max.subtract(bb.min);
    DEBUG.log(`🏗️ decor [${type}]: bounds=(${sz.x.toFixed(1)},${sz.y.toFixed(1)},${sz.z.toFixed(1)}) scale=${cfg.scale} → altura≈${(sz.y * cfg.scale).toFixed(2)}u`);

    // Escala padrão da biblioteca (multiplicador sobre a base do GLB).
    //  type é o assetId em decor (neonSign, obelisk, crystals, ...).
    let mult = 1;
    try { const ds = await AssetGroups.getDefaultScale(type); if (ds != null) mult = ds; } catch (_) {}
    this._mapObstacles = this._mapObstacles || [];

    for (let i = 0; i < cfg.spots.length; i++) {
      const [x, y, z] = cfg.spots[i];
      const clone = glbRoot.clone(`${type}_decor_${i}`, null, false);
      if (!clone) continue;
      clone.position.set(x, y, z);
      clone.scaling.setAll(cfg.scale * mult);
      clone.rotation.y = cfg.ry ? cfg.ry[i % cfg.ry.length] : Math.random() * Math.PI * 2;
      clone.setEnabled(true);
      clone._assetId = type; clone._baseScale = cfg.scale;
      this.shadowGen?.addShadowCaster(clone, true);
      // Registra p/ a escala unificada do Editor de Asset pegar (sem col física)
      this._mapObstacles.push({ clone, col: null, assetId: type, baseScale: cfg.scale });
    }
    glbRoot.setEnabled(false);
  }

  /** Spawna o personagem rato (decorativo, no spawn) */
  spawnMouseCharacter(meshes) {
    if (!meshes?.length) return;
    const root = meshes[0];
    root.position.set(3, 0, -3);
    root.rotation.y = -Math.PI / 4;
    root.scaling.setAll(1.164);
    root.setEnabled(true);
    this.shadowGen?.addShadowCaster(root, true);

    // Toca a primeira animação disponível em loop
    const anims = meshes[0].getScene().animationGroups;
    if (anims?.length) {
      anims[0].start(true, 1.0, anims[0].from, anims[0].to, false);
    }
    this.mouseCharacter = root;
  }

  /** Reseta todos os inimigos para posição e estado inicial (após respawn do jogador) */
  resetEnemies() {
    for (const e of this.enemies) {
      e.reset?.();
    }
  }

  /** Spawna plantas carnívoras como inimigos interativos.
   *  DESATIVADO por padrão: o MonsterPlant é o sistema ANTIGO (sem aggro,
   *  sem navmesh, sem colisão — "vinha sempre e atravessava tudo"). Os
   *  inimigos agora vêm do AnimatedEnemy (catálogo 'blossomon' = planta) via
   *  a Horda (tecla H) / CatalogUI (K), que respeitam parede e aggro.
   *  Passe { force: true } só pra debug do MonsterPlant legado. */
  spawnEnemyPlants(meshes, { force = false } = {}) {
    if (!meshes?.length) return;
    meshes[0].setEnabled(false);   // oculta o template
    if (!force) return;            // não spawna o sistema antigo

    const spots = [
      new BABYLON.Vector3(-28, 0, 5),
      new BABYLON.Vector3( 28, 0, 5),
      new BABYLON.Vector3(-20, 0,-30),
      new BABYLON.Vector3( 20, 0,-30),
    ];
    for (const pos of spots) {
      const enemy = new MonsterPlant(this.scene, this.shadowGen, meshes, pos);
      enemy.onAttack = (dmg, attackType, fromPos, kbForce = 0) => {
        if (this.player) this.player.takeDamage(dmg, attackType, fromPos, kbForce);
      };
      enemy.onPlaySound = (id) => { this.player?.sounds?.playNow(id); };
      this.enemies.push(enemy);
    }
  }

  // ── Aplica impulso por proximidade (fallback quando _gameObject não existe) ─
  applyBulletImpact(hitPoint, direction, force = 8) {
    for (const d of this.dynamics) {
      if (d._broken || d._collected) continue;
      const dist = BABYLON.Vector3.Distance(d.mesh.position, hitPoint);
      if (dist < 2.5) {
        const mag     = force * (1 - dist / 2.5);
        const impulse = direction.scale(mag);
        d.applyImpulse(impulse, hitPoint);   // ← passa hitPoint para torque
      }
    }
  }
}
