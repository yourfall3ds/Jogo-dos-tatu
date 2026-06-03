// ─────────────────────────────────────────────────────────────────
//  BuildPieces — peças PROCEDURAIS de construção (parede, porta, janela,
//  chão/teto). Não são GLB: são geradas em código (paramétricas), então
//  têm tamanho exato, encaixam em grid e a COLISÃO é precisa.
//
//  Cada peça é um TransformNode RAIZ com a BASE em y=0 (assenta no chão
//  ao ser posicionada). Peças com vão (porta/janela) são feitas de VÁRIAS
//  caixas (montantes + verga + peitoril) em vez de furo CSG → a colisão
//  já tem o buraco (dá pra atravessar a porta) e nada de furo falso.
//
//  Uso:
//    import { BUILD_PIECES, buildPiece, makePieceBodies } from './BuildPieces.js';
//    const root = buildPiece('wall', scene);     // cria a malha
//    makePieceBodies(root, scene);                // colisor estático
// ─────────────────────────────────────────────────────────────────

import { physicsReady } from '../physics/PhysicsWorld.js';

// Dimensões base (grid-friendly). Largura 4, altura 3, espessura 0.25.
const W = 4, H = 3, T = 0.25;

let _matCache = null;
function pieceMaterial(scene) {
  if (_matCache && !_matCache.isDisposed?.()) return _matCache;
  const m = new BABYLON.PBRMetallicRoughnessMaterial('buildPieceMat', scene);
  m.baseColor = new BABYLON.Color3(0.62, 0.63, 0.66);   // concreto liso cinza
  m.metallic  = 0.0;
  m.roughness = 0.92;
  _matCache = m;
  return m;
}

// Cria uma caixa filha já posicionada (origem da peça = base no chão).
function _box(root, scene, mat, name, w, h, d, x, y, z) {
  const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.position.set(x, y, z);
  b.material = mat;
  b.isPickable = true;
  b.parent = root;
  return b;
}

// ── Builders de cada peça ─────────────────────────────────────────
function buildWall(root, scene, mat) {
  _box(root, scene, mat, root.name + '_p0', W, H, T, 0, H / 2, 0);
}

function buildWallDoor(root, scene, mat) {
  const doorW = 1.4, doorH = 2.2;
  const sideW = (W - doorW) / 2;
  const sideX = doorW / 2 + sideW / 2;
  _box(root, scene, mat, root.name + '_pL', sideW, H, T, -sideX, H / 2, 0);          // montante esq.
  _box(root, scene, mat, root.name + '_pR', sideW, H, T,  sideX, H / 2, 0);          // montante dir.
  _box(root, scene, mat, root.name + '_pT', doorW, H - doorH, T, 0, doorH + (H - doorH) / 2, 0); // verga
}

function buildWallWindow(root, scene, mat) {
  const winW = 1.8, winY0 = 1.0, winY1 = 2.0;        // vão da janela
  const sideW = (W - winW) / 2;
  const sideX = winW / 2 + sideW / 2;
  _box(root, scene, mat, root.name + '_pL', sideW, H, T, -sideX, H / 2, 0);           // lateral esq.
  _box(root, scene, mat, root.name + '_pR', sideW, H, T,  sideX, H / 2, 0);           // lateral dir.
  _box(root, scene, mat, root.name + '_pB', winW, winY0, T, 0, winY0 / 2, 0);         // peitoril
  _box(root, scene, mat, root.name + '_pH', winW, H - winY1, T, 0, winY1 + (H - winY1) / 2, 0); // verga
}

function buildFloor(root, scene, mat) {
  _box(root, scene, mat, root.name + '_p0', W, T, W, 0, T / 2, 0);   // laje (chão/teto) base em y=0
}

// ── Escada: N degraus (cada um vira um corpo BOX → CC sobe nativo) ──
function buildStairs(root, scene, mat) {
  const steps = 12, rise = H / steps, run = 0.30, width = 2;
  for (let i = 0; i < steps; i++) {
    const h = rise * (i + 1);                       // degrau "cheio" até o chão (sólido)
    const b = _box(root, scene, mat, `${root.name}_s${i}`, width, h, run, 0, h / 2, -i * run);
  }
}

// ── Rampa: laje inclinada (CC sobe lisinho) ──────────────────────
function buildRamp(root, scene, mat) {
  const len = 3.6, width = 2, thick = 0.3, rise = 1.8;
  const ang = Math.atan2(rise, len);
  const slab = _box(root, scene, mat, root.name + '_p0', width, thick, Math.hypot(len, rise), 0, 0, 0);
  slab.rotation.x = -ang;
  // posiciona pra base baixa tocar o chão na ponta
  slab.position.set(0, rise / 2, 0);
  slab._colShape = 'box';
}

// ── Telhado: duas águas (prisma triangular simples) ───────────────
function buildRoof(root, scene, mat) {
  const span = W, len = W, thick = 0.2, rise = 1.4;
  const ang = Math.atan2(rise, span / 2);
  const sl = Math.hypot(span / 2, rise);
  for (const sgn of [-1, 1]) {
    const s = _box(root, scene, mat, `${root.name}_r${sgn > 0 ? 'R' : 'L'}`, sl, thick, len, sgn * span / 4, rise / 2, 0);
    s.rotation.z = sgn * ang;
    s._colShape = 'box';
  }
}

// ── Geometria básica (primitivas manipuláveis) ───────────────────
function _prim(root, scene, mat, name, mesh, y, shape) {
  mesh.name = name; mesh.material = mat; mesh.isPickable = true; mesh.parent = root;
  mesh.position.y = y; mesh._colShape = shape;
  return mesh;
}
function buildCube(root, scene, mat)     { _prim(root, scene, mat, root.name + '_p0', BABYLON.MeshBuilder.CreateBox(root.name + '_p0', { size: 1.5 }, scene), 0.75, 'box'); }
function buildBoxRect(root, scene, mat)  { _prim(root, scene, mat, root.name + '_p0', BABYLON.MeshBuilder.CreateBox(root.name + '_p0', { width: 2, height: 1, depth: 1 }, scene), 0.5, 'box'); }
function buildCylinder(root, scene, mat) { _prim(root, scene, mat, root.name + '_p0', BABYLON.MeshBuilder.CreateCylinder(root.name + '_p0', { diameter: 1.2, height: 2 }, scene), 1.0, 'cylinder'); }
function buildSphere(root, scene, mat)   { _prim(root, scene, mat, root.name + '_p0', BABYLON.MeshBuilder.CreateSphere(root.name + '_p0', { diameter: 1.5 }, scene), 0.75, 'sphere'); }
function buildTorus(root, scene, mat)    { _prim(root, scene, mat, root.name + '_p0', BABYLON.MeshBuilder.CreateTorus(root.name + '_p0', { diameter: 1.6, thickness: 0.45, tessellation: 24 }, scene), 0.45, 'hull'); }

const _BUILDERS = {
  wall:        buildWall,
  wall_door:   buildWallDoor,
  wall_window: buildWallWindow,
  floor:       buildFloor,
  stairs:      buildStairs,
  ramp:        buildRamp,
  roof:        buildRoof,
  geo_cube:    buildCube,
  geo_box:     buildBoxRect,
  geo_cylinder: buildCylinder,
  geo_sphere:  buildSphere,
  geo_torus:   buildTorus,
};

/** Constrói a malha da peça (TransformNode raiz com base em y=0). */
export function buildPiece(pieceId, scene, name) {
  const fn = _BUILDERS[pieceId];
  if (!fn) { console.warn('[BuildPieces] peça desconhecida:', pieceId); return null; }
  const root = new BABYLON.TransformNode(name || ('piece_' + pieceId + '_' + Math.random().toString(36).slice(2, 6)), scene);
  root._pieceId = pieceId;
  fn(root, scene, pieceMaterial(scene));
  return root;
}

/**
 * Colisor estático da peça: um corpo Havok BOX por caixa filha (exato e
 * barato; mantém o vão da porta/janela atravessável). Sem física → cai no
 * checkCollisions por malha. Idempotente.
 */
export function makePieceBodies(root, scene) {
  if (!root || root._pieceBodies) return;
  const children = root.getChildMeshes ? root.getChildMeshes(false) : [];
  const bodies = [];
  const ST = BABYLON.PhysicsShapeType;
  const shapeFor = (c) => ({ sphere: ST.SPHERE, cylinder: ST.CYLINDER, hull: ST.CONVEX_HULL }[c._colShape] || ST.BOX);
  for (const c of children) {
    if (!(c.getTotalVertices?.() > 0)) continue;
    c.computeWorldMatrix(true);
    if (physicsReady()) {
      try {
        const agg = new BABYLON.PhysicsAggregate(c, shapeFor(c), { mass: 0, friction: 0.6 }, scene);
        c.checkCollisions = false;     // Havok cuida
        bodies.push(agg);
      } catch (e) { c.checkCollisions = true; }
    } else {
      c.checkCollisions = true;        // fallback legado
    }
  }
  root._pieceBodies = bodies;
  root._colliderOptimized = true;      // marca p/ não reprocessar
}

/** Remove os corpos físicos da peça (ao deletar/limpar). */
export function disposePieceBodies(root) {
  if (!root?._pieceBodies) return;
  for (const a of root._pieceBodies) { try { a.dispose(); } catch (_) {} }
  root._pieceBodies = null;
}

// ── Miniaturas (desenhadas em canvas → data URL) ──────────────────
function _thumb(draw) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 100;
    const x = c.getContext('2d');
    x.fillStyle = '#0e1218'; x.fillRect(0, 0, 100, 100);
    draw(x);
    return c.toDataURL();
  } catch (_) { return null; }
}
const _GREY = '#9a9da3', _GREY_D = '#6c6f75', _BG = '#0e1218';
function _wallRect(x) { x.fillStyle = _GREY; x.fillRect(22, 16, 56, 68);
  x.strokeStyle = _GREY_D; x.lineWidth = 2;
  for (let y = 28; y < 84; y += 14) { x.beginPath(); x.moveTo(22, y); x.lineTo(78, y); x.stroke(); } }
function _diag(x){ x.fillStyle=_GREY; x.beginPath(); x.moveTo(20,58); x.lineTo(50,40); x.lineTo(80,58); x.lineTo(50,76); x.closePath(); x.fill(); x.strokeStyle=_GREY_D; x.lineWidth=2; x.stroke(); }
const _THUMBS = {
  wall:        _thumb(x => { _wallRect(x); }),
  wall_door:   _thumb(x => { _wallRect(x); x.fillStyle = _BG; x.fillRect(40, 44, 20, 40); }),
  wall_window: _thumb(x => { _wallRect(x); x.fillStyle = _BG; x.fillRect(38, 38, 24, 24); }),
  floor:       _thumb(_diag),
  stairs:      _thumb(x => { x.fillStyle=_GREY; for(let i=0;i<5;i++){ x.fillRect(20+i*11, 70-i*11, 60-i*11, 11); } x.strokeStyle=_GREY_D; x.strokeRect(20,15,60,70); }),
  ramp:        _thumb(x => { x.fillStyle=_GREY; x.beginPath(); x.moveTo(18,78); x.lineTo(82,78); x.lineTo(82,30); x.closePath(); x.fill(); }),
  roof:        _thumb(x => { x.fillStyle=_GREY; x.beginPath(); x.moveTo(50,22); x.lineTo(84,58); x.lineTo(16,58); x.closePath(); x.fill(); }),
  geo_cube:    _thumb(x => { x.fillStyle=_GREY; x.fillRect(30,34,40,40); x.fillStyle=_GREY_D; x.beginPath(); x.moveTo(30,34); x.lineTo(42,24); x.lineTo(82,24); x.lineTo(70,34); x.fill(); }),
  geo_box:     _thumb(x => { x.fillStyle=_GREY; x.fillRect(24,42,52,28); }),
  geo_cylinder:_thumb(x => { x.fillStyle=_GREY; x.fillRect(36,28,28,44); x.fillStyle=_GREY_D; x.beginPath(); x.ellipse(50,28,14,5,0,0,7); x.fill(); }),
  geo_sphere:  _thumb(x => { x.fillStyle=_GREY; x.beginPath(); x.arc(50,50,24,0,7); x.fill(); }),
  geo_torus:   _thumb(x => { x.fillStyle=_GREY; x.beginPath(); x.arc(50,50,24,0,7); x.fillStyle=_BG; x.arc(50,50,10,0,7); x.fill('evenodd'); }),
};

// Catálogo das peças (vira "asset" da Biblioteca). groupId: construcao | geometria.
export const BUILD_PIECES = [
  { id: 'piece_wall',        pieceId: 'wall',        name: 'Parede',            thumb: _THUMBS.wall,        groupId: 'construcao', drag: 'wall' },
  { id: 'piece_wall_door',   pieceId: 'wall_door',   name: 'Parede c/ Porta',   thumb: _THUMBS.wall_door,   groupId: 'construcao' },
  { id: 'piece_wall_window', pieceId: 'wall_window', name: 'Parede c/ Janela',  thumb: _THUMBS.wall_window, groupId: 'construcao' },
  { id: 'piece_floor',       pieceId: 'floor',       name: 'Chão / Teto',       thumb: _THUMBS.floor,       groupId: 'construcao', drag: 'floor' },
  { id: 'piece_stairs',      pieceId: 'stairs',      name: 'Escada',            thumb: _THUMBS.stairs,      groupId: 'construcao' },
  { id: 'piece_ramp',        pieceId: 'ramp',        name: 'Rampa',             thumb: _THUMBS.ramp,        groupId: 'construcao' },
  { id: 'piece_roof',        pieceId: 'roof',        name: 'Telhado',           thumb: _THUMBS.roof,        groupId: 'construcao' },
  { id: 'piece_geo_cube',    pieceId: 'geo_cube',    name: 'Cubo',              thumb: _THUMBS.geo_cube,    groupId: 'geometria' },
  { id: 'piece_geo_box',     pieceId: 'geo_box',     name: 'Retângulo',         thumb: _THUMBS.geo_box,     groupId: 'geometria' },
  { id: 'piece_geo_cylinder',pieceId: 'geo_cylinder',name: 'Cilindro',          thumb: _THUMBS.geo_cylinder,groupId: 'geometria' },
  { id: 'piece_geo_sphere',  pieceId: 'geo_sphere',  name: 'Esfera',            thumb: _THUMBS.geo_sphere,  groupId: 'geometria' },
  { id: 'piece_geo_torus',   pieceId: 'geo_torus',   name: 'Torus',             thumb: _THUMBS.geo_torus,   groupId: 'geometria' },
];
