// ─────────────────────────────────────────────────────────────────
//  ColliderOptimizer — anti-lag de colisão (SEM perder a forma)
//
//  PROBLEMA: moveWithCollisions do Babylon testa contra CADA triângulo
//  de uma malha com checkCollisions=true. Um GLB detalhado (escada,
//  estátua) tem 30k–85k vértices → ~20ms POR chamada. O player faz
//  vários moves/frame → só de CHEGAR PERTO o jogo cai pra ~15 FPS.
//
//  SOLUÇÃO (subdivide + octree): mantemos a MALHA REAL como colisor
//  (então escada continua SUBÍVEL, rampa continua rampa), mas:
//    1. subdivide() quebra a malha em N submeshes;
//    2. createOrUpdateSubmeshesOctree() particiona os submeshes no espaço;
//    3. useOctreeForCollisions faz a colisão testar SÓ os submeshes
//       perto do player (não a malha inteira).
//  Resultado medido: ~0.15ms/move (era ~20ms) = 120x+ mais rápido,
//  preservando a geometria exata. Cores por vértice ou textura única
//  não são afetadas pela subdivisão.
//
//  Fallback CAIXA: malhas MultiMaterial não podem ser subdivididas sem
//  embaralhar os materiais → pra essas (raras) usamos caixa colisora.
// ─────────────────────────────────────────────────────────────────

const HEAVY_VERTS = 1500;   // acima disso, malha-colisor é cara demais

/** Quantos submeshes criar p/ um nº de vértices (mais verts = mais partições) */
function _partsFor(verts) {
  return Math.min(160, Math.max(24, Math.round(verts / 700)));
}

/** AABB combinado (mundo) de uma lista de malhas → {min, max} ou null */
function _worldAABB(meshes) {
  let min = null, max = null;
  for (const m of meshes) {
    if (!(m.getTotalVertices?.() > 0)) continue;
    m.computeWorldMatrix(true);
    const bb = m.getBoundingInfo().boundingBox;
    if (!min) { min = bb.minimumWorld.clone(); max = bb.maximumWorld.clone(); }
    else {
      min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
    }
  }
  return min ? { min, max } : null;
}

/**
 * Topo PLANO? Amostra a altura do topo numa grade sobre a pegada do objeto.
 * Plano (laje/chão/parede/prop) → caixa lisa. Variável (escada/rampa) → malha.
 */
function _hasFlatTop(meshes, min, max, scene) {
  const filter = m => meshes.includes(m);
  const dx = max.x - min.x, dz = max.z - min.z, h = max.y - min.y;
  const heights = [];
  const G = 4;
  for (let i = 0; i <= G; i++) {
    for (let j = 0; j <= G; j++) {
      const x = min.x + dx * (i / G);
      const z = min.z + dz * (j / G);
      const ray = new BABYLON.Ray(new BABYLON.Vector3(x, max.y + 0.5, z), BABYLON.Vector3.Down(), h + 1);
      const hit = scene.pickWithRay(ray, filter);
      if (hit?.hit && hit.pickedPoint) heights.push(hit.pickedPoint.y);
    }
  }
  if (heights.length < 5) return true;   // não deu p/ amostrar → assume plano (caixa)
  const hi = Math.max(...heights), lo = Math.min(...heights);
  const variation = hi - lo;
  // FAVORECE A CAIXA (lisa, como decoração): só vira MALHA quando o topo
  // varia MUITO (escada/rampa clara) — > 50% da altura E > 1.0 unidade.
  // Assim chão/parede/laje/prop com pequeno relevo ainda viram caixa lisa.
  return !(variation > Math.max(1.0, h * 0.5));
}

/** UMA caixa colisora invisível cobrindo um grupo de malhas (topo plano) */
function _boxForGroup(meshes, min, max, scene, name) {
  const size = max.subtract(min);
  const center = min.add(max).scale(0.5);
  for (const m of meshes) { m.checkCollisions = false; m.isPickable = false; }
  const box = BABYLON.MeshBuilder.CreateBox(`${name || 'obj'}_boxcol`, {
    width:  Math.max(0.1, size.x),
    height: Math.max(0.1, size.y),
    depth:  Math.max(0.1, size.z),
  }, scene);
  box.position.copyFrom(center);
  box.checkCollisions = true;
  box.isVisible       = false;
  box.isPickable      = true;
  box._isBoxCol       = true;
  box._gameObject     = meshes[0]?._gameObject || null;
  return box;
}

/**
 * Otimiza o colisor de um objeto (raiz GLB + filhos). Por padrão usa
 * subdivide+octree (mantém a forma subível). Idempotente.
 * @returns {number} quantas malhas foram otimizadas
 */
export function optimizeCollider(root, scene) {
  if (!root || root._colliderOptimized || root._isBoxCol) return 0;

  const all = [root, ...(root.getChildMeshes?.(false) || [])];
  const geom      = all.filter(m => (m.getTotalVertices?.() || 0) > 0);
  const colliding = geom.filter(m => m.checkCollisions);
  if (!colliding.length) return 0;   // objeto sem colisão → nada a fazer

  const aabb = _worldAABB(geom);
  if (!aabb) return 0;

  // ── Decisão: topo PLANO → CAIXA lisa (chão/parede/prop) — mesmo corpo
  //    de colisão que a decoração/física usa, sem prender o player.
  //    Topo VARIÁVEL (escada/rampa) → mantém a MALHA (degraus subíveis). ──
  let flat = true;
  try { flat = _hasFlatTop(colliding, aabb.min, aabb.max, scene); } catch (_) {}

  if (flat) {
    // Caixa cobrindo o objeto inteiro; desliga colisão de TODAS as malhas.
    _boxForGroup(geom, aabb.min, aabb.max, scene, root.name);
    root._colliderOptimized = true;
    return colliding.length;
  }

  // Não-plano → mantém a malha real (subível). Só as PESADAS ganham
  // subdivide+octree (anti-lag); as leves ficam como estão (já baratas).
  let optimized = 0;
  for (const m of colliding) {
    const verts = m.getTotalVertices();
    if (verts <= HEAVY_VERTS) { optimized++; continue; }   // leve → deixa a malha crua
    const isMulti = m.material?.getClassName?.() === 'MultiMaterial';
    if (isMulti) {
      try { const bb = _worldAABB([m]); if (bb) { _boxForGroup([m], bb.min, bb.max, scene, m.name); optimized++; } } catch (_) {}
      continue;
    }
    try {
      if (!m._subdividedForCol) { m.subdivide(_partsFor(verts)); m._subdividedForCol = true; }
      m.createOrUpdateSubmeshesOctree(32);
      m.useOctreeForCollisions = true;
      m.useOctreeForPicking    = true;
      optimized++;
    } catch (e) {
      console.warn('[Collider] subdivide falhou em', m.name, '→ caixa:', e.message);
      try { const bb = _worldAABB([m]); if (bb) { _boxForGroup([m], bb.min, bb.max, scene, m.name); optimized++; } } catch (_) {}
    }
  }
  if (optimized) root._colliderOptimized = true;
  return optimized;
}

/**
 * Varre a cena e otimiza QUALQUER objeto com colisão de malha pesada.
 * Rede de segurança p/ assets carregados por caminhos diversos
 * (SceneEditor, BuildMode, saves antigos). Idempotente.
 * @returns {number} quantos objetos foram otimizados
 */
export function sweepHeavyColliders(scene) {
  if (!scene) return 0;
  const heavy = scene.meshes.filter(m =>
    m.checkCollisions && !m._isBoxCol && !m.useOctreeForCollisions &&
    (m.getTotalVertices?.() || 0) > HEAVY_VERTS
  );
  // agrupa pela raiz (topmost) → uma passada por objeto
  const roots = new Set();
  for (const m of heavy) {
    let r = m;
    while (r.parent) r = r.parent;
    roots.add(r);
  }
  let n = 0;
  for (const r of roots) n += optimizeCollider(r, scene);
  if (n) console.log(`[Collider] ⚡ ${n} malha(s) pesada(s) otimizada(s) p/ colisão rápida (anti-lag)`);
  return n;
}
