// ─────────────────────────────────────────────────────────────────
//  BiomeWorldBuilder — monta o mundo de biomas no Babylon.js.
//   • terreno: grade subdividida (altura+cor por vértice do gerador)
//   • árvores/props: ESCALA NORMALIZADA pela altura-alvo + COLISÃO
//     (corrige os 2 bugs do Godot: tamanho errado e atravessar)
//   • spawn seguro: clareira plana no centro (ruínas), sem árvores
//
//  Carrega os GLBs uma vez, instancia por célula, e devolve um root.
// ─────────────────────────────────────────────────────────────────
import {
  WORLD_HALF, WORLD_SEED, BIOMES, TREE_PATHS, TREE_TARGET_H,
  biomeAt, heightAt, groundColorAt,
} from './BiomeWorld.js';

const SAFE_ZONE_R = 60;        // raio da clareira de spawn (sem árvores, plano)
const TERRAIN_SUBDIV = 200;    // subdivisões da grade (200×200 quads → suave)

export class BiomeWorldBuilder {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.seed = opts.seed ?? WORLD_SEED;
    this.onProgress = opts.onProgress || (() => {});
    this.root = new BABYLON.TransformNode('biomeWorld', scene);
    this._treeTemplates = {};   // nome -> mesh template (clonável)
    this._colliders = [];
  }

  /** Constrói tudo. Reporta progresso 0..1 via onProgress. */
  async build() {
    this.onProgress(0.05, 'gerando terreno…');
    this._buildTerrain();
    this.onProgress(0.45, 'carregando vegetação…');
    await this._loadTreeTemplates();
    this.onProgress(0.65, 'plantando o mundo…');
    this._scatterTrees();
    this.onProgress(0.95, 'finalizando…');
    this._buildSafeZone();
    this.onProgress(1.0, 'pronto!');
    return this.root;
  }

  // ── Terreno: grade com altura + cor por bioma ──────────────────
  _buildTerrain() {
    const N = TERRAIN_SUBDIV;
    const size = WORLD_HALF * 2;
    const step = size / N;
    const positions = [], colors = [], indices = [], normals = [];

    for (let iz = 0; iz <= N; iz++) {
      for (let ix = 0; ix <= N; ix++) {
        const x = -WORLD_HALF + ix * step;
        const z = -WORLD_HALF + iz * step;
        const y = heightAt(x, z, this.seed);
        positions.push(x, y, z);
        const c = groundColorAt(x, z, this.seed);
        colors.push(c[0], c[1], c[2], 1);
      }
    }
    const row = N + 1;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const a = iz * row + ix, b = a + 1, c = a + row, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);

    const mesh = new BABYLON.Mesh('biomeTerrain', this.scene);
    const vd = new BABYLON.VertexData();
    vd.positions = positions; vd.indices = indices;
    vd.colors = colors; vd.normals = normals;
    vd.applyToMesh(mesh, true);
    mesh.parent = this.root;

    const mat = new BABYLON.StandardMaterial('biomeTerrainMat', this.scene);
    mat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    mat.useVertexColor = true;           // cor do bioma vem do vertex color
    mesh.material = mat;
    mesh.useVertexColors = true;

    // Colisão do chão: checkCollisions + (se houver Havok) corpo estático.
    mesh.checkCollisions = true;
    mesh.isPickable = true;
    this._terrain = mesh;
    this._tryStaticBody(mesh);
  }

  // ── Carrega 1 template por tipo de árvore, normalizando a ESCALA ─
  async _loadTreeTemplates() {
    const names = Object.keys(TREE_PATHS);
    for (const name of names) {
      try {
        const res = await BABYLON.SceneLoader.ImportMeshAsync('', '', TREE_PATHS[name], this.scene);
        const root = res.meshes.find(m => !m.parent) || res.meshes[0];
        if (!root) continue;
        // mede a altura CRUA do GLB e calcula a escala pra bater a altura-alvo
        root.computeWorldMatrix(true);
        const { min, max } = root.getHierarchyBoundingVectors(true);
        const rawH = Math.max(0.001, max.y - min.y);
        const targetH = TREE_TARGET_H[name] || 9;
        root._fitScale = targetH / rawH;     // ESCALA NORMALIZADA (corrige gigante/mini)
        root.setEnabled(false);              // template escondido (só clonamos)
        this._treeTemplates[name] = root;
      } catch (e) {
        console.warn('[BiomeWorld] falha ao carregar árvore', name, e?.message);
      }
    }
  }

  // ── Espalha árvores por célula, por densidade do bioma, COM COLISÃO ─
  _scatterTrees() {
    const seed = this.seed;
    const GRID = 18;                         // espaçamento base entre tentativas (m)
    let placed = 0;
    for (let x = -WORLD_HALF + GRID; x < WORLD_HALF; x += GRID) {
      for (let z = -WORLD_HALF + GRID; z < WORLD_HALF; z += GRID) {
        // clareira de spawn: sem árvores
        if (x * x + z * z < SAFE_ZONE_R * SAFE_ZONE_R) continue;
        const biome = biomeAt(x, z, seed);
        const b = BIOMES[biome];
        // hash determinístico decide se planta aqui (densidade do bioma)
        const r = _cellRand(x, z, seed);
        if (r > b.vegDensity) continue;
        const treeName = b.trees[Math.floor(_cellRand(x + 13, z + 7, seed) * b.trees.length)];
        const tpl = this._treeTemplates[treeName];
        if (!tpl) continue;
        // jitter de posição e escala (variedade), preso no chão
        const jx = x + (_cellRand(x + 1, z, seed) - 0.5) * GRID * 0.7;
        const jz = z + (_cellRand(x, z + 1, seed) - 0.5) * GRID * 0.7;
        const y = heightAt(jx, jz, seed);
        const sc = tpl._fitScale * (0.8 + _cellRand(x + 5, z + 5, seed) * 0.8);
        this._plantTree(tpl, treeName, jx, y, jz, sc, placed++);
      }
    }
    this._treeCount = placed;
  }

  _plantTree(tpl, name, x, y, z, scale, idx) {
    const inst = tpl.clone(`tree_${name}_${idx}`, this.root);
    if (!inst) return;
    inst.setEnabled(true);
    inst.position.set(x, y, z);
    inst.scaling.setAll(scale);
    inst.rotation.y = _cellRand(x + 2, z + 2, this.seed) * Math.PI * 2;
    inst.getChildMeshes(true).forEach(m => { m.isPickable = false; });

    // COLISÃO: cilindro invisível no tronco (corrige "atravessar árvore").
    //  Mais barato que colisão por-mesh e suficiente pra barrar o player.
    const col = BABYLON.MeshBuilder.CreateCylinder(
      `treeCol_${idx}`, { height: TREE_TARGET_H[name] || 9, diameter: 1.6 }, this.scene);
    col.position.set(x, y + (TREE_TARGET_H[name] || 9) / 2 * scale, z);
    col.scaling.set(scale, scale, scale);
    col.isVisible = false;
    col.checkCollisions = true;
    col.parent = this.root;
    this._tryStaticBody(col);
    this._colliders.push(col);
  }

  // ── Clareira de spawn: achata o centro e marca como zona segura ──
  _buildSafeZone() {
    // já é plano-ish no centro (ruínas baseH=0); aqui só garantimos um disco
    // de chão visível e sem obstáculos. (mobs/NPCs entram nas próximas ondas.)
    this.spawnPoint = new BABYLON.Vector3(0, heightAt(0, 0, this.seed) + 1.0, 0);
  }

  // ── Corpo estático Havok (se a física estiver pronta) ───────────
  async _tryStaticBody(mesh, shape = 'box') {
    try {
      const { physicsReady, makeStaticBody } = await import('../physics/PhysicsWorld.js');
      if (physicsReady?.()) makeStaticBody?.(mesh, this.scene, shape);
    } catch (_) { /* sem Havok → checkCollisions já segura */ }
  }

  dispose() {
    try { this.root.dispose(); } catch (_) {}
  }
}

// hash determinístico 0..1 por célula (mesmo do gerador, p/ consistência)
function _cellRand(x, z, seed) {
  let h = (Math.floor(x) * 374761393 + Math.floor(z) * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
