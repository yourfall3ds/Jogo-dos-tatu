// ─────────────────────────────────────────────────────────────────
//  BiomeWorld — mapão por biomas com STREAMING estilo Fortnite.
//
//  O OPEN_WORLD era um plano 800x800 vazio. Aqui dividimos o mundo em
//  biomas (cada um = um mapa GLB já pronto em assets/chibata-maps/),
//  posicionados SEM sobreposição numa grade, e carregamos/descarregamos
//  por PROXIMIDADE do player — nunca tudo de uma vez (boot rápido).
//
//  + props/árvores/baús do Forgotten Insanity espalhados deterministicamente
//    (mesma seed → todos os clientes veem igual) com colisor Havok.
//
//  Regras do dono:
//   - SÓ mapas íntegros (snow/forest/lowpoly/virtual/space EXCLUÍDOS).
//   - Biomas sem sobreposição. Tudo com física (não bugar).
//   - Streaming Fortnite: não travar, não pesar o load.
// ─────────────────────────────────────────────────────────────────

const BASE = 'assets/chibata-maps/';
const FORG = 'assets/forgotten/';

// ── BIOMAS ── posições numa grade ampla (sem sobreposição). Cada bioma
// ocupa um "setor" do mundo. O scale/y são re-ajustados por bbox no load,
// mas damos um hint inicial. radius = alcance pra streaming.
// NOTA: o spawn do player é (0, 200→0). O centro (0,0,0) fica LIVRE (praça de
// spawn) — nenhum bioma envolve o spawn (evita tela preta por estar dentro da
// geometria). Todos os biomas ficam a >=180m do centro, sem sobreposição.
const BIOMES = [
  { id: 'cemetery',   glb: BASE + 'cemetery.glb',           pos: [   0,  0,  220 ], yaw: 0,    tone: 'dark'   },
  { id: 'western',    glb: BASE + 'western_town.glb',       pos: [ 260,  0,   40 ], yaw: 0,    tone: 'warm'   },
  { id: 'valley',     glb: BASE + 'valley_village.glb',     pos: [-240,  0,   60 ], yaw: 0.4,  tone: 'green'  },
  { id: 'pirate',     glb: BASE + 'pirate_fort.glb',        pos: [  60,  0,  300 ], yaw: 0,    tone: 'sea'    },
  { id: 'dungeon',    glb: BASE + 'dungeon_warkarma.glb',   pos: [-260,  0, -240 ], yaw: 0,    tone: 'dark'   },
  { id: 'castle',     glb: BASE + 'dl_castle_interior.glb', pos: [ 240,  0, -260 ], yaw: 0,    tone: 'stone'  },
  { id: 'nightcity',  glb: BASE + 'night_city.glb',         pos: [ -60,  0, -320 ], yaw: 0,    tone: 'neon'   },
  { id: 'hell',       glb: BASE + 'hell_arena.glb',         pos: [ 340,  0,  280 ], yaw: 0,    tone: 'fire'   },
  // Bioma gótico montado com peças do Forgotten (sem sobreposição entre si)
  { id: 'gothic',     glb: FORG + 'gothic/gothic_cathedral.glb', pos: [-340, 0, 300 ], yaw: 0, tone: 'dark',
    extras: [
      { glb: FORG + 'gothic/gothic_alcove.glb',    off: [ 34, 0,  10 ], yaw: 1.2 },
      { glb: FORG + 'gothic/gothic_structure.glb', off: [-30, 0,  24 ], yaw: 0   },
      { glb: FORG + 'gothic/gothic_wall.glb',      off: [  0, 0, -34 ], yaw: 0   },
      { glb: FORG + 'gothic/gargoyle.glb',         off: [ 14, 0,  14 ], yaw: 0.6 },
    ] },
];

// Props pequenos pra espalhar por TODOS os biomas (dar vida). Leves (0-4MB).
const SCATTER_PROPS = [
  FORG + 'props/barrel_large.glb',
  FORG + 'props/crates_stacked.glb',
  FORG + 'props/pillar_decorated.glb',
  FORG + 'props/rubble_large.glb',
  FORG + 'props/rubble_half.glb',
  FORG + 'props/chair.glb',
  FORG + 'trees/dead_tree_brown.glb',
  FORG + 'trees/dead_tree_dark.glb',
  FORG + 'trees/gnarled_tree.glb',
];
const CHESTS = [
  FORG + 'chests/chest_wood_common_ready.glb',
  FORG + 'chests/chest_rare_dragon_ready.glb',
  FORG + 'chests/chest_legendary_serpent_ready.glb',
];

const STREAM_IN  = 260;   // carrega o bioma quando o player chega a <260m do centro
const STREAM_OUT = 420;   // descarrega quando passa de >420m (histerese evita liga/desliga)

// RNG seedado (mulberry32) — determinístico: todos os clientes veem o mesmo layout.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BiomeWorld {
  /**
   * @param {BABYLON.Scene} scene
   * @param {object} opts { shadowGen, seed }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.shadowGen = opts.shadowGen || null;
    this.seed = opts.seed || 1337;
    this._loaded = new Map();   // id -> { root, props[] }  (biomas carregados)
    this._loading = new Set();  // ids em carregamento (evita dupla carga)
    this._enabled = false;
    this._checkT = 0;
    this._havok = null;
    try { this._havok = scene.getPhysicsEngine?.()?.getPhysicsPlugin?.() ? scene : null; } catch (_) {}
  }

  enable() { this._enabled = true; }
  disable() {
    this._enabled = false;
    for (const id of [...this._loaded.keys()]) this._unloadBiome(id);
  }

  /** Chamado todo frame; só processa streaming a 2Hz (barato). */
  update(dt, playerPos) {
    if (!this._enabled || !playerPos) return;
    this._checkT -= dt;
    if (this._checkT > 0) return;
    this._checkT = 0.5;

    for (const b of BIOMES) {
      const dx = playerPos.x - b.pos[0];
      const dz = playerPos.z - b.pos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      const isLoaded = this._loaded.has(b.id);
      const isLoading = this._loading.has(b.id);
      if (dist < STREAM_IN && !isLoaded && !isLoading) {
        this._loadBiome(b);
      } else if (dist > STREAM_OUT && isLoaded) {
        this._unloadBiome(b.id);
      }
    }
  }

  async _loadBiome(b) {
    this._loading.add(b.id);
    try {
      const root = new BABYLON.TransformNode(`biome_${b.id}`, this.scene);
      root.position.set(b.pos[0], b.pos[1], b.pos[2]);
      root.rotation.y = b.yaw || 0;

      // 1) mapa principal do bioma
      await this._loadGlbInto(b.glb, root, [0, 0, 0], 0, b.id);

      // 2) peças extras (ex.: bioma gótico montado de pedaços) — sem sobreposição
      if (b.extras) {
        for (const ex of b.extras) {
          await this._loadGlbInto(ex.glb, root, ex.off, ex.yaw || 0, b.id);
        }
      }

      // 3) props/árvores/baús espalhados deterministicamente nesse bioma
      const props = await this._scatterProps(b, root);

      this._loaded.set(b.id, { root, props });
      console.log(`[BiomeWorld] bioma "${b.id}" carregado @ ${b.pos[0]},${b.pos[2]}`);
    } catch (e) {
      console.error(`[BiomeWorld] falha bioma ${b.id}:`, e?.message);
    } finally {
      this._loading.delete(b.id);
    }
  }

  /**
   * Carrega um GLB, RE-FIT POR BBOX (escala alvo + pé no chão), parenteia,
   * aplica colisão + sombra. O re-fit é o que evita a TELA PRETA: sem ele,
   * mapas vêm em escala bruta (gigantes) e cobrem a câmera.
   * @param targetSize tamanho-alvo do maior eixo XZ em metros (ex.: 150)
   */
  async _loadGlbInto(url, parent, offset, yaw, biomeId, targetSize = 150) {
    const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', url, this.scene);
    const meshes = res.meshes.filter(m => m && m.getTotalVertices && m.getTotalVertices() > 0);
    if (!meshes.length) { res.meshes.forEach(m => { try { m.dispose(); } catch (_) {} }); return; }

    // Node container do GLB (este recebe a escala/posição de re-fit)
    const holder = new BABYLON.TransformNode(`${biomeId}_glb`, this.scene);
    holder.parent = parent;
    holder.rotation.y = yaw || 0;

    // O root real do GLB (__root__) vira filho do holder
    const glbRoot = res.meshes.find(m => m.name === '__root__') || meshes[0];
    glbRoot.parent = holder;

    // ── RE-FIT POR BBOX (mede o tamanho real e normaliza) ──────────────
    // getHierarchyBoundingVectors precisa das matrizes mundiais atualizadas.
    // Força o recompute de TODA a hierarquia antes de medir (senão a bbox vem
    // com escala errada e o mapa fica gigante/minúsculo).
    try {
      holder.scaling.setAll(1); holder.position.set(0, 0, 0);
      glbRoot.getChildMeshes(false).forEach(m => { try { m.computeWorldMatrix(true); } catch (_) {} });
      glbRoot.computeWorldMatrix(true);
      holder.computeWorldMatrix(true);
    } catch (_) {}
    let scale = 1, footY = 0, cx = 0, cz = 0;
    try {
      const bb = glbRoot.getHierarchyBoundingVectors(true);
      const sx = bb.max.x - bb.min.x;
      const sy = bb.max.y - bb.min.y;
      const sz = bb.max.z - bb.min.z;
      const biggestXZ = Math.max(sx, sz) || 1;
      // escala pra o maior eixo XZ virar ~targetSize (clamp pra não explodir)
      scale = targetSize / biggestXZ;
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      scale = Math.max(0.0001, Math.min(scale, 5000));
      // centro XZ (pra centralizar o mapa no bioma) e pé (min.y → chão)
      cx = (bb.min.x + bb.max.x) / 2;
      cz = (bb.min.z + bb.max.z) / 2;
      footY = bb.min.y;
    } catch (e) { /* sem bbox: usa escala 1 */ }

    holder.scaling.setAll(scale);
    // Posiciona: offset do bioma + corrige centro/pé pela escala aplicada.
    holder.position.set(
      offset[0] - cx * scale,
      offset[1] - footY * scale,
      offset[2] - cz * scale
    );

    // Física + sombra + culling por mesh.
    // IMPORTANTE: o player usa PhysicsCharacterController + checkCollisions.
    // checkCollisions=true já dá colisão andável SEM custo de Havok body
    // (mapas grandes com MESH-shape Havok travam/explodem memória).
    for (const m of meshes) {
      try {
        m.checkCollisions = true;     // colisão andável (barata, robusta)
        m.receiveShadows = true;
        m.isPickable = true;
        m.alwaysSelectAsActiveMesh = false;
        const verts = m.getTotalVertices();
        if (this.shadowGen && verts > 0 && verts < 60000) {
          try { this.shadowGen.addShadowCaster(m, false); } catch (_) {}
        }
      } catch (_) {}
    }
    return holder;
  }

  /** Espalha props/árvores/baús de forma determinística (seed por bioma). */
  async _scatterProps(b, root) {
    const placed = [];
    // seed = base ^ hash do id do bioma → cada bioma tem layout próprio mas estável
    let h = this.seed;
    for (let i = 0; i < b.id.length; i++) h = (h * 31 + b.id.charCodeAt(i)) | 0;
    const rng = mulberry32(h);

    const N_PROPS = 14;   // props por bioma (leves; não pesa)
    const SPREAD = 90;    // raio de espalhamento dentro do bioma
    const taken = [];     // pra evitar sobreposição entre props

    const tryPlace = async (urlList, count, scaleHint) => {
      for (let i = 0; i < count; i++) {
        const url = urlList[(rng() * urlList.length) | 0];
        // posição radial, evita centro (onde fica a estrutura principal)
        const ang = rng() * Math.PI * 2;
        const r = 24 + rng() * SPREAD;
        const px = Math.cos(ang) * r;
        const pz = Math.sin(ang) * r;
        // anti-sobreposição simples
        let clash = false;
        for (const t of taken) { if (Math.hypot(t[0] - px, t[1] - pz) < 6) { clash = true; break; } }
        if (clash) continue;
        taken.push([px, pz]);
        try {
          const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', url, this.scene);
          const valid = res.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0);
          if (!valid.length) { res.meshes.forEach(m => { try { m.dispose(); } catch (_) {} }); continue; }
          const glbRoot = res.meshes.find(m => m.name === '__root__') || valid[0];
          // holder com re-fit por bbox (props/árvores vêm em escala maluca também)
          const holder = new BABYLON.TransformNode('prop', this.scene);
          holder.parent = root;
          holder.rotation.y = rng() * Math.PI * 2;
          glbRoot.parent = holder;
          let s = 1, fy = 0;
          try {
            glbRoot.getChildMeshes(false).forEach(m => { try { m.computeWorldMatrix(true); } catch (_) {} });
            glbRoot.computeWorldMatrix(true);
            holder.computeWorldMatrix(true);
            const bb = glbRoot.getHierarchyBoundingVectors(true);
            const big = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
            s = scaleHint / big;                       // scaleHint = altura-alvo em metros
            if (!Number.isFinite(s) || s <= 0) s = 1;
            s = Math.max(0.0001, Math.min(s, 1000));
            fy = bb.min.y;
          } catch (_) {}
          holder.scaling.setAll(s);
          holder.position.set(px, -fy * s, pz);        // pé no chão
          for (const m of valid) {
            m.checkCollisions = true;
            m.isPickable = true;
            m.receiveShadows = true;
            if (this.shadowGen && m.getTotalVertices() < 40000) {
              try { this.shadowGen.addShadowCaster(m, false); } catch (_) {}
            }
          }
          placed.push(holder);
        } catch (e) { /* prop falhou: segue o jogo */ }
      }
    };

    await tryPlace(SCATTER_PROPS, N_PROPS, 2.4);   // props/árvores ~2.4m de altura
    await tryPlace(CHESTS, 3, 1.1);                // baús ~1.1m
    return placed;
  }

  _unloadBiome(id) {
    const entry = this._loaded.get(id);
    if (!entry) return;
    try { entry.root.dispose(false, true); } catch (_) {}  // dispose recursivo (filhos + props)
    this._loaded.delete(id);
    console.log(`[BiomeWorld] bioma "${id}" descarregado (player saiu)`);
  }

  dispose() { this.disable(); }
}
