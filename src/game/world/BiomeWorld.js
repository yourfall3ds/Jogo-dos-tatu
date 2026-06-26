// ─────────────────────────────────────────────────────────────────
//  BiomeWorld — MUNDO ABERTO com BIOMAS (porte do biome_world do
//  FORGOTTEN-INSANITY pro Babylon.js).
//
//  Lógica (re-implementada em JS, determinística por SEED):
//   • bioma por VORONOI (centro mais próximo) com fronteira ondulada por noise
//   • altura suave: média do base_h dos biomas vizinhos (kernel 5) + noise leve
//   • terreno = grade subdividida com cor por bioma (vertex color)
//   • árvores/props colocados por bioma, ESCALA NORMALIZADA pela altura-alvo
//     (corrige o bug do Godot: GLB gigante/minúsculo) e COM COLISÃO (corrige o
//     bug de atravessar árvore).
//
//  "Mapa pré-gerado salvo": a geometria é determinística pela seed, então o
//  mesmo SEED dá o MESMO mundo pra todos — idêntico, sem mandar dados pesados.
// ─────────────────────────────────────────────────────────────────

// ── Config do mundo ──────────────────────────────────────────────
export const WORLD_HALF = 500;          // meia-largura → 1000×1000m
export const WORLD_SEED = 1337;          // seed FIXA (mundo igual pra todos)
const HEIGHT_AMP = 1.0;                  // multiplicador global do relevo

// ── BIOMAS: cor de chão, altura-base do platô, ondulação, vegetação,
//    pool de mobs e LEVEL da região. (mesmos do FORGOTTEN.) ─────────
export const BIOMES = {
  ruinas:    { ground: [0.34, 0.31, 0.26], baseH: 0.0,  rough: 0.6, vegDensity: 0.20, trees: ['dead_tree_dark'],                     mobs: ['skeleton_warrior', 'zombie', 'ghoul'],     level: 1 },
  floresta:  { ground: [0.17, 0.34, 0.13], baseH: 6.0,  rough: 1.2, vegDensity: 1.00, trees: ['gnarled_tree', 'dead_tree_brown'],   mobs: ['ghoul', 'spiderthing', 'orc_brute'],       level: 3 },
  deserto:   { ground: [0.72, 0.60, 0.36], baseH: -4.0, rough: 1.0, vegDensity: 0.10, trees: ['dead_tree_lp'],                       mobs: ['zombie_soldier', 'necromorph'],            level: 5 },
  ermo:      { ground: [0.30, 0.32, 0.37], baseH: 2.0,  rough: 0.8, vegDensity: 0.35, trees: ['dead_tree_dark', 'dead_tree_brown'],  mobs: ['zombie', 'ghoul2', 'necromorph'],          level: 4 },
  vulcanico: { ground: [0.28, 0.12, 0.08], baseH: 14.0, rough: 2.0, vegDensity: 0.07, trees: ['dead_tree_dark'],                     mobs: ['magma_hound', 'pig_demon', 'eyebeast'],    level: 7 },
};

// Centros FIXOS de bioma (Voronoi) — biomas em blocos grandes e coerentes.
const BIOME_SEEDS = [
  ['ruinas',    0, 0],
  ['floresta',  0, -340],
  ['deserto',   340, 0],
  ['ermo',      0, 340],
  ['vulcanico', -340, 0],
];

// Caminho dos GLBs (já trazidos pro projeto, em assets/forgotten/).
export const TREE_PATHS = {
  dead_tree_dark:  'assets/forgotten/trees/dead_tree_dark.glb',
  dead_tree_brown: 'assets/forgotten/trees/dead_tree_brown.glb',
  dead_tree_lp:    'assets/forgotten/trees/dead_tree_lp.glb',
  gnarled_tree:    'assets/forgotten/trees/gnarled_tree.glb',
};
// Altura-alvo (m) por árvore — NORMALIZA a escala (ignora a escala crua do GLB
//  que vinha aleatória = árvore minúscula/gigante). Corrige o bug do Godot.
export const TREE_TARGET_H = {
  dead_tree_dark: 11.0, dead_tree_brown: 10.0, dead_tree_lp: 9.0, gnarled_tree: 8.5,
};

// ── Noise: hash determinístico → value noise 2D suave (substitui o
//    FastNoiseLite simplex; mesmo SEED = mesmo mundo). ──────────────
function _hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;            // 0..1
}
function _smooth(t) { return t * t * (3 - 2 * t); }  // fade
/** value noise 2D em [-1,1], suave e determinístico. */
function noise2D(x, z, seed, freq) {
  const fx = x * freq, fz = z * freq;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = _smooth(fx - ix), tz = _smooth(fz - iz);
  const a = _hash2(ix, iz, seed),     b = _hash2(ix + 1, iz, seed);
  const c = _hash2(ix, iz + 1, seed), d = _hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return (top + (bot - top) * tz) * 2 - 1;     // -1..1
}

// ── Bioma num ponto (Voronoi + warp por noise) ───────────────────
export function biomeAt(x, z, seed = WORLD_SEED) {
  if (x * x + z * z < 90 * 90) return 'ruinas';   // centro garantido
  const wx = x + noise2D(x, z, seed, 0.0035) * 70;
  const wz = z + noise2D(x, z, seed + 91, 0.0042) * 70;
  let best = 'deserto', bestD = 1e20;
  for (const [name, sx, sz] of BIOME_SEEDS) {
    const dx = wx - sx, dz = wz - sz;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

// ── Altura num ponto (kernel 5 = transição suave entre platôs) ───
export function heightAt(x, z, seed = WORLD_SEED) {
  const R = 32;
  const offs = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]];
  let acc = 0, wsum = 0;
  for (const [ox, oz] of offs) {
    const b = BIOMES[biomeAt(x + ox, z + oz, seed)];
    const w = (ox === 0 && oz === 0) ? 1.0 : 0.55;
    acc += b.baseH * w; wsum += w;
  }
  const base = acc / wsum;
  const here = BIOMES[biomeAt(x, z, seed)];
  const gentle = noise2D(x, z, seed + 7, 0.004) * here.rough;
  return (base + gentle) * HEIGHT_AMP;
}

// ── Cor do chão num ponto (cor do bioma + leve variação) ─────────
export function groundColorAt(x, z, seed = WORLD_SEED) {
  const b = BIOMES[biomeAt(x, z, seed)];
  const v = noise2D(x * 2, z * 2, seed + 91, 0.0042) * 0.06;
  return [
    Math.min(1, Math.max(0, b.ground[0] + v)),
    Math.min(1, Math.max(0, b.ground[1] + v)),
    Math.min(1, Math.max(0, b.ground[2] + v)),
  ];
}
