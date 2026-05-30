// ─────────────────────────────────────────────────────────────────
//  EnemyCatalog — definição data-driven de TODOS os inimigos
//
//  Todos os meshes de inimigo são rigados e animados (glb-inspect):
//  AnimatedEnemy lê os AnimationGroups reais e mapeia para papéis.
//
//  behavior: 'hopper' | 'walker' | 'flyer' | 'brute'
//  targetHeight = altura desejada (auto-escala resolve os rips)
//  tier = rookie | champion | ultimate | mega | boss
// ─────────────────────────────────────────────────────────────────

export const EnemyCatalog = {
  // ════════ ROOKIE (Dungeon 1) ════════
  filmon: {
    name: 'Filmon', category: 'digimon', asset: 'filmon',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.4,
    stats: { hp: 45, damage: 8, moveSpeed: 4.5, attackRange: 2.4, attackCd: 1.8, kb: 6 },
    evolvesTo: 'biyomon',
  },
  pigeon: {
    name: 'Pigeon Virus', category: 'creature', asset: 'pigeon',
    tier: 'rookie', behavior: 'flyer', targetHeight: 1.3,
    stats: { hp: 35, damage: 7, moveSpeed: 6.0, attackRange: 2.0, attackCd: 1.5, kb: 4 },
    evolvesTo: null,
  },
  glub: {
    name: 'Glub', category: 'creature', asset: 'glub',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.2,
    stats: { hp: 40, damage: 9, moveSpeed: 4.0, attackRange: 2.2, attackCd: 1.6, kb: 5 },
    evolvesTo: 'glubEvolved',
  },
  agumon: {
    name: 'Agumon', category: 'digimon', asset: 'agumon',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.6,
    stats: { hp: 60, damage: 12, moveSpeed: 5.0, attackRange: 2.6, attackCd: 1.4, kb: 7 },
    evolvesTo: 'growlmon',
  },
  veemon: {
    name: 'Veemon', category: 'digimon', asset: 'veemon',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.5,
    stats: { hp: 55, damage: 11, moveSpeed: 6.5, attackRange: 2.4, attackCd: 1.1, kb: 6 },
    evolvesTo: 'exveemon',
  },
  dorumon: {
    name: 'Dorumon', category: 'digimon', asset: 'dorumon',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.5,
    stats: { hp: 58, damage: 12, moveSpeed: 5.5, attackRange: 2.5, attackCd: 1.3, kb: 6 },
    evolvesTo: null,
  },

  // ════════ CHAMPION (Dungeon 2) ════════
  gatomon: {
    name: 'Gatomon', category: 'digimon', asset: 'gatomon',
    tier: 'champion', behavior: 'walker', targetHeight: 1.5,
    stats: { hp: 110, damage: 18, moveSpeed: 7.5, attackRange: 2.5, attackCd: 0.9, kb: 7 },
    isBoss: true, evolvesTo: null,
  },
  blackGatomon: {
    name: 'BlackGatomon', category: 'digimon', asset: 'blackGatomon',
    tier: 'champion', behavior: 'walker', targetHeight: 1.5,
    stats: { hp: 95, damage: 20, moveSpeed: 8.0, attackRange: 2.5, attackCd: 0.85, kb: 8 },
    tint: [0.5, 0.3, 0.7], evolvesTo: null,
  },
  growlmon: {
    name: 'Growlmon', category: 'digimon', asset: 'growlmon',
    tier: 'champion', behavior: 'brute', targetHeight: 2.4,
    stats: { hp: 160, damage: 26, moveSpeed: 4.0, attackRange: 3.2, attackCd: 2.0, kb: 14 },
    evolvesTo: null,
  },
  ghost: {
    name: 'Bakemon', category: 'creature', asset: 'ghost',
    tier: 'champion', behavior: 'flyer', targetHeight: 1.8,
    stats: { hp: 80, damage: 16, moveSpeed: 5.5, attackRange: 2.4, attackCd: 1.4, kb: 5 },
    evolvesTo: 'ghostSkull',
  },
  goleling: {
    name: 'Goleling', category: 'creature', asset: 'goleling',
    tier: 'champion', behavior: 'brute', targetHeight: 1.6,
    stats: { hp: 140, damage: 22, moveSpeed: 3.2, attackRange: 2.8, attackCd: 2.2, kb: 12 },
    evolvesTo: 'golelingEvolved',
  },
  armabee: {
    name: 'Armabee', category: 'creature', asset: 'armabee',
    tier: 'champion', behavior: 'flyer', targetHeight: 1.4,
    stats: { hp: 70, damage: 15, moveSpeed: 7.0, attackRange: 2.0, attackCd: 1.2, kb: 4 },
    evolvesTo: 'armabeeEvolved',
  },
  tribal: {
    name: 'Tribalmon', category: 'creature', asset: 'tribal',
    tier: 'champion', behavior: 'walker', targetHeight: 1.7,
    stats: { hp: 100, damage: 19, moveSpeed: 5.0, attackRange: 3.0, attackCd: 1.6, kb: 8 },
    evolvesTo: null,
  },

  // ════════ ULTIMATE (Dungeon 3) ════════
  exveemon: {
    name: 'ExVeemon', category: 'digimon', asset: 'exveemon',
    tier: 'ultimate', behavior: 'brute', targetHeight: 2.6,
    stats: { hp: 240, damage: 32, moveSpeed: 5.0, attackRange: 3.4, attackCd: 1.6, kb: 16 },
    isBoss: true, evolvesTo: null,
  },
  dragon: {
    name: 'Airdramon', category: 'creature', asset: 'dragon',
    tier: 'ultimate', behavior: 'flyer', targetHeight: 2.2,
    stats: { hp: 180, damage: 28, moveSpeed: 7.0, attackRange: 2.8, attackCd: 1.4, kb: 10 },
    evolvesTo: 'dragonEvolved',
  },
  alpaking: {
    name: 'Alpaking', category: 'creature', asset: 'alpaking',
    tier: 'ultimate', behavior: 'brute', targetHeight: 2.0,
    stats: { hp: 280, damage: 30, moveSpeed: 3.0, attackRange: 3.0, attackCd: 2.4, kb: 18 },
    evolvesTo: 'alpakingEvolved',
  },
  demon: {
    name: 'Devimon', category: 'creature', asset: 'demon',
    tier: 'ultimate', behavior: 'walker', targetHeight: 2.4,
    stats: { hp: 220, damage: 34, moveSpeed: 5.5, attackRange: 3.0, attackCd: 1.5, kb: 12 },
    tint: [0.7, 0.4, 0.9], evolvesTo: null,
  },
  ghostSkull: {
    name: 'SkullBakemon', category: 'creature', asset: 'ghostSkull',
    tier: 'ultimate', behavior: 'flyer', targetHeight: 2.0,
    stats: { hp: 160, damage: 30, moveSpeed: 6.0, attackRange: 2.6, attackCd: 1.3, kb: 8 },
    evolvesTo: null,
  },
  hywirl: {
    name: 'Hywirl', category: 'creature', asset: 'hywirl',
    tier: 'ultimate', behavior: 'flyer', targetHeight: 1.6,
    stats: { hp: 150, damage: 26, moveSpeed: 8.0, attackRange: 2.2, attackCd: 1.0, kb: 6 },
    evolvesTo: null,
  },

  // ════════ MEGA / BOSS (Dungeon 4) ════════
  mervamon: {
    name: 'Mervamon', category: 'digimon', asset: 'mervamon',
    tier: 'mega', behavior: 'walker', targetHeight: 3.0,
    stats: { hp: 420, damage: 40, moveSpeed: 5.5, attackRange: 3.6, attackCd: 1.3, kb: 16 },
    isBoss: true, evolvesTo: null,
  },
  rosemonX: {
    name: 'Rosemon X', category: 'digimon', asset: 'rosemonX',
    tier: 'mega', behavior: 'walker', targetHeight: 2.8,
    stats: { hp: 380, damage: 42, moveSpeed: 6.0, attackRange: 3.2, attackCd: 1.2, kb: 14 },
    tint: [1.0, 0.4, 0.6], isBoss: true, evolvesTo: null,
  },
  ophanimonX: {
    name: 'Ophanimon X', category: 'digimon', asset: 'ophanimonX',
    tier: 'mega', behavior: 'flyer', targetHeight: 3.0,
    stats: { hp: 460, damage: 44, moveSpeed: 6.0, attackRange: 3.0, attackCd: 1.3, kb: 12 },
    isBoss: true, evolvesTo: null,
  },
  raihimon: {
    name: 'Raihimon', category: 'digimon', asset: 'raihimon',
    tier: 'mega', behavior: 'brute', targetHeight: 3.2,
    stats: { hp: 500, damage: 46, moveSpeed: 4.5, attackRange: 3.8, attackCd: 1.8, kb: 20 },
    isBoss: true, evolvesTo: null,
  },
  azulongmon: {
    name: 'Azulongmon', category: 'digimon', asset: 'azulongmon',
    tier: 'boss', behavior: 'flyer', targetHeight: 4.5,
    stats: { hp: 800, damage: 55, moveSpeed: 5.0, attackRange: 4.5, attackCd: 1.6, kb: 22 },
    tint: [0.3, 0.6, 1.0], isBoss: true, evolvesTo: null,
  },
  baihumon: {
    name: 'Baihumon', category: 'digimon', asset: 'baihumon',
    tier: 'boss', behavior: 'brute', targetHeight: 4.0,
    stats: { hp: 850, damage: 58, moveSpeed: 4.5, attackRange: 4.0, attackCd: 1.7, kb: 24 },
    tint: [1.0, 0.9, 0.5], isBoss: true, evolvesTo: null,
  },
  zhuqiaomon: {
    name: 'Zhuqiaomon', category: 'digimon', asset: 'zhuqiaomon',
    tier: 'boss', behavior: 'flyer', targetHeight: 4.2,
    stats: { hp: 820, damage: 56, moveSpeed: 5.5, attackRange: 4.2, attackCd: 1.5, kb: 22 },
    tint: [1.0, 0.4, 0.3], isBoss: true, evolvesTo: null,
  },
  ebonwumon: {
    name: 'Ebonwumon', category: 'digimon', asset: 'ebonwumon',
    tier: 'boss', behavior: 'brute', targetHeight: 4.0,
    stats: { hp: 830, damage: 54, moveSpeed: 4.0, attackRange: 4.0, attackCd: 1.8, kb: 24 },
    tint: [0.4, 0.8, 0.5], isBoss: true, evolvesTo: null,
  },
  colossalSquid: {
    name: 'Colossal Squid', category: 'digimon', asset: 'colossalSquid',
    tier: 'boss', behavior: 'brute', targetHeight: 4.0,
    stats: { hp: 700, damage: 50, moveSpeed: 3.0, attackRange: 4.0, attackCd: 2.0, kb: 20 },
    tint: [0.5, 0.3, 0.6], isBoss: true, evolvesTo: null,
  },
  drogon: {
    name: 'Drogon', category: 'digimon', asset: 'drogon',
    tier: 'boss', behavior: 'flyer', targetHeight: 5.0,
    stats: { hp: 900, damage: 60, moveSpeed: 6.0, attackRange: 4.5, attackCd: 1.4, kb: 24 },
    tint: [0.8, 0.2, 0.2], isBoss: true, evolvesTo: null,
  },
};

export function getEnemyDef(id) { return EnemyCatalog[id] || null; }
export function enemiesByTier(tier) {
  return Object.entries(EnemyCatalog).filter(([, d]) => d.tier === tier).map(([id]) => id);
}
export function allEnemyIds() { return Object.keys(EnemyCatalog); }

export const DUNGEON_ENEMIES = {
  1: enemiesByTier('rookie'),
  2: enemiesByTier('champion'),
  3: enemiesByTier('ultimate'),
  4: [...enemiesByTier('mega'), ...enemiesByTier('boss')],
};
