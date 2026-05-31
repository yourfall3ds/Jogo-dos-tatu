// ─────────────────────────────────────────────────────────────────
//  PhysicsWorld — motor de física real (Havok) para o jogo
//
//  Substitui a colisão "manual" (moveWithCollisions + gravidade na mão)
//  por corpos rígidos de verdade: objetos rolam, tombam, assentam nos
//  pés. O player vira um PhysicsCharacterController (cápsula).
//
//  Havok = WASM, carregado do CDN do Babylon. Inicializado UMA vez antes
//  do mundo/player serem criados.
// ─────────────────────────────────────────────────────────────────

const HAVOK_CDN = 'https://cdn.babylonjs.com/havok/HavokPhysics_umd.js';

let _havok  = null;   // instância do módulo WASM
let _plugin = null;   // BABYLON.HavokPlugin
let _ready  = false;

/** Carrega o loader UMD do Havok (injeta o <script> uma vez). */
function _loadHavokLoader() {
  if (typeof HavokPhysics !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = HAVOK_CDN;
    s.async = true;
    s.onload  = () => res();
    s.onerror = () => rej(new Error('Falha ao baixar o Havok (' + HAVOK_CDN + ')'));
    document.head.appendChild(s);
  });
}

/**
 * Inicializa o Havok e liga a física na cena.
 * @param {BABYLON.Scene} scene
 * @param {number} gravityY  gravidade (negativa). ~-28 dá um "peso" gostoso.
 * @returns {Promise<BABYLON.HavokPlugin|null>} plugin (ou null se falhar)
 */
export async function initPhysics(scene, gravityY = -28) {
  try {
    await _loadHavokLoader();
    _havok  = await HavokPhysics();
    _plugin = new BABYLON.HavokPlugin(true, _havok);
    scene.enablePhysics(new BABYLON.Vector3(0, gravityY, 0), _plugin);
    scene._havokPlugin = _plugin;
    _ready = true;
    console.log('[Physics] ⚙️ Havok ativo (gravidade', gravityY + ')');
    return _plugin;
  } catch (e) {
    console.error('[Physics] Havok falhou ao iniciar:', e.message);
    _ready = false;
    return null;
  }
}

/** True se a física Havok está ativa. */
export function physicsReady() { return _ready; }

/** Plugin Havok (ou null). */
export function getPhysicsPlugin() { return _plugin; }

// ─────────────────────────────────────────────────────────────────
//  FORMA AUTOMÁTICA — escolhe o shape pela geometria do objeto
// ─────────────────────────────────────────────────────────────────
/**
 * Decide a forma de colisão de uma malha:
 *  • SPHERE   — dimensões parecidas em X/Y/Z (bola/oval) → rola
 *  • BOX      — quadradão que preenche bem a caixa → empilha estável
 *  • CONVEX_HULL — qualquer outra coisa (irregular/com pés) → tomba/assenta
 */
function _pickShapeType(mesh) {
  try {
    const bb = mesh.getBoundingInfo().boundingBox;
    const ext = bb.extendSize; // meia-dimensão em local
    const dims = [ext.x, ext.y, ext.z].map(v => Math.abs(v) * 2).sort((a, b) => a - b);
    const ratio = dims[2] / Math.max(1e-4, dims[0]);   // maior / menor
    // CHATO/FINO (placa, folha) → convex hull fica degenerado e explode no
    // Havok. Usa CAIXA (estável). menor < 12% do maior = praticamente 2D.
    if (dims[0] < dims[2] * 0.12) return BABYLON.PhysicsShapeType.BOX;
    // Muito redondo (dimensões ~iguais) → SPHERE → rola liso.
    if (ratio < 1.18) return BABYLON.PhysicsShapeType.SPHERE;
    // Resto → convex hull (forma real: tomba, assenta nos pés).
    return BABYLON.PhysicsShapeType.CONVEX_HULL;
  } catch (_) {
    return BABYLON.PhysicsShapeType.BOX;   // fallback seguro
  }
}

/**
 * Cria um CORPO DINÂMICO (cai, rola, tomba, assenta) para um GLB.
 * Caso comum (1 malha dominante): põe o corpo direto na malha (convex hull /
 * sphere) — preserva a forma real. Multi-malha: cai pra CAIXA no bounding box.
 * @returns {{ aggregate, body, mesh }|null}
 */
export function makeDynamicBody(glbRoot, scene, { mass = 1, friction = 0.6, restitution = 0.2 } = {}) {
  if (!_ready || !glbRoot) return null;
  const meshes = [glbRoot, ...(glbRoot.getChildMeshes?.(false) || [])]
    .filter(m => (m.getTotalVertices?.() || 0) > 0);
  if (!meshes.length) return null;

  meshes.sort((a, b) => b.getTotalVertices() - a.getTotalVertices());
  const dominant   = meshes[0];
  const totalVerts = meshes.reduce((s, m) => s + m.getTotalVertices(), 0);
  const single     = meshes.length === 1 || (dominant.getTotalVertices() / totalVerts) > 0.8;

  try {
    if (single) {
      // Malha única vira o objeto: desparenta (preserva transform de mundo),
      // garante quaternion, e ganha corpo com a forma real.
      dominant.setParent(null);
      if (!dominant.rotationQuaternion) {
        dominant.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(dominant.rotation);
      }
      const shapeType = _pickShapeType(dominant);
      const agg = new BABYLON.PhysicsAggregate(dominant, shapeType, { mass, friction, restitution }, scene);
      return { aggregate: agg, body: agg.body, mesh: dominant, shapeType };
    }

    // Multi-malha → CAIXA no bounding box do conjunto (corpo), visual segue.
    let min = null, max = null;
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      if (!min) { min = bb.minimumWorld.clone(); max = bb.maximumWorld.clone(); }
      else { min = BABYLON.Vector3.Minimize(min, bb.minimumWorld); max = BABYLON.Vector3.Maximize(max, bb.maximumWorld); }
    }
    const size = max.subtract(min), center = min.add(max).scale(0.5);
    const proxy = BABYLON.MeshBuilder.CreateBox(`${glbRoot.name}_dynbox`,
      { width: Math.max(0.1, size.x), height: Math.max(0.1, size.y), depth: Math.max(0.1, size.z) }, scene);
    proxy.position.copyFrom(center);
    proxy.rotationQuaternion = BABYLON.Quaternion.Identity();
    proxy.isVisible = false;
    glbRoot.setParent(proxy);   // o visual passa a seguir o corpo
    const agg = new BABYLON.PhysicsAggregate(proxy, BABYLON.PhysicsShapeType.BOX, { mass, friction, restitution }, scene);
    return { aggregate: agg, body: agg.body, mesh: proxy, shapeType: BABYLON.PhysicsShapeType.BOX };
  } catch (e) {
    console.warn('[Physics] corpo dinâmico falhou:', glbRoot.name, e.message);
    return null;
  }
}
