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
  // Planta carnívora (asset 'monster_plant.glb') — o Blossomon de verdade
  blossomon: {
    name: 'Blossomon', category: 'digimon', asset: 'monsterPlant',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.6,
    stats: { hp: 45, damage: 8, moveSpeed: 4.5, attackRange: 2.4, attackCd: 1.8, kb: 6 },
    evolvesTo: null,
  },
  // Filmon — digimon humanoide (asset 'filmon_-_digimon.glb'), seu nome real
  filmon: {
    name: 'Filmon', category: 'digimon', asset: 'filmon',
    tier: 'rookie', behavior: 'walker', targetHeight: 1.5,
    stats: { hp: 50, damage: 9, moveSpeed: 5.0, attackRange: 2.4, attackCd: 1.6, kb: 6 },
    evolvesTo: null,
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

  // ════════ CHIBATA — dark fantasy / horror pack ════════
  //  48 mobs vindos do Chibata Ultimate. Tier 'chibata' agrupado.
  //  category: 'chibataMob' → resolvido pelo AssetRegistry.chibataMob

  // ── Raiz: criaturas clássicas ──
  cb_bat:           { name: 'Bat',           category: 'chibataMob', asset: 'bat',           tier: 'chibata', behavior: 'flyer',  targetHeight: 0.8, stats: { hp: 40,  damage: 8,  moveSpeed: 7.0, attackRange: 1.8, attackCd: 1.2, kb: 3 } },
  cb_demon:         { name: 'Demon',         category: 'chibataMob', asset: 'demon',         tier: 'chibata', behavior: 'walker', targetHeight: 2.2, stats: { hp: 220, damage: 30, moveSpeed: 5.5, attackRange: 2.8, attackCd: 1.4, kb: 12 } },
  cb_dragon:        { name: 'Dragon',        category: 'chibataMob', asset: 'dragon',        tier: 'chibata', behavior: 'flyer',  targetHeight: 3.2, stats: { hp: 350, damage: 38, moveSpeed: 6.0, attackRange: 3.4, attackCd: 1.5, kb: 14 } },
  cb_dragonBig:     { name: 'Great Dragon',  category: 'chibataMob', asset: 'dragonBig',     tier: 'chibata', behavior: 'flyer',  targetHeight: 5.0, stats: { hp: 900, damage: 60, moveSpeed: 5.5, attackRange: 4.5, attackCd: 1.6, kb: 22 }, isBoss: true },
  cb_ghost:         { name: 'Phantom',       category: 'chibataMob', asset: 'ghost',         tier: 'chibata', behavior: 'flyer',  targetHeight: 1.8, stats: { hp: 80,  damage: 16, moveSpeed: 5.5, attackRange: 2.4, attackCd: 1.4, kb: 5 } },
  cb_ghoul:         { name: 'Ghoul',         category: 'chibataMob', asset: 'ghoul',         tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 95,  damage: 18, moveSpeed: 5.0, attackRange: 2.4, attackCd: 1.2, kb: 6 } },
  cb_goblin:        { name: 'Goblin',        category: 'chibataMob', asset: 'goblin',        tier: 'chibata', behavior: 'walker', targetHeight: 1.2, stats: { hp: 50,  damage: 10, moveSpeed: 6.5, attackRange: 2.0, attackCd: 1.0, kb: 4 } },
  cb_mawGooey:      { name: 'Gooey Maw',     category: 'chibataMob', asset: 'mawGooey',      tier: 'chibata', behavior: 'walker', targetHeight: 1.4, stats: { hp: 90,  damage: 14, moveSpeed: 3.5, attackRange: 2.0, attackCd: 1.4, kb: 5 } },
  cb_necromancer:   { name: 'Necromancer',   category: 'chibataMob', asset: 'necromancer',   tier: 'chibata', behavior: 'walker', targetHeight: 1.9, stats: { hp: 160, damage: 26, moveSpeed: 4.5, attackRange: 3.0, attackCd: 1.6, kb: 8 } },
  cb_orc:           { name: 'Orc',           category: 'chibataMob', asset: 'orc',           tier: 'chibata', behavior: 'brute',  targetHeight: 2.0, stats: { hp: 180, damage: 24, moveSpeed: 4.5, attackRange: 2.8, attackCd: 1.6, kb: 12 } },
  cb_skeleton:      { name: 'Skeleton',      category: 'chibataMob', asset: 'skeleton',      tier: 'chibata', behavior: 'walker', targetHeight: 1.7, stats: { hp: 70,  damage: 14, moveSpeed: 5.0, attackRange: 2.4, attackCd: 1.3, kb: 5 } },
  cb_slime:         { name: 'Slime',         category: 'chibataMob', asset: 'slime',         tier: 'chibata', behavior: 'hopper', targetHeight: 0.9, stats: { hp: 35,  damage: 6,  moveSpeed: 3.5, attackRange: 1.8, attackCd: 1.5, kb: 3 } },
  cb_yeti:          { name: 'Yeti',          category: 'chibataMob', asset: 'yeti',          tier: 'chibata', behavior: 'brute',  targetHeight: 2.6, stats: { hp: 300, damage: 32, moveSpeed: 4.0, attackRange: 3.0, attackCd: 1.8, kb: 16 } },
  cb_zombie:        { name: 'Zombie',        category: 'chibataMob', asset: 'zombie',        tier: 'chibata', behavior: 'walker', targetHeight: 1.7, stats: { hp: 65,  damage: 12, moveSpeed: 3.5, attackRange: 2.2, attackCd: 1.4, kb: 5 } },

  // ── Beasts ──
  cb_drugdorGolem:        { name: 'Drugdor Golem',     category: 'chibataMob', asset: 'drugdorGolem',        tier: 'chibata', behavior: 'brute',  targetHeight: 3.0, stats: { hp: 380, damage: 36, moveSpeed: 3.0, attackRange: 3.2, attackCd: 2.0, kb: 18 } },
  cb_herculesBeetle:      { name: 'Hercules Beetle',   category: 'chibataMob', asset: 'herculesBeetle',      tier: 'chibata', behavior: 'walker', targetHeight: 1.2, stats: { hp: 120, damage: 16, moveSpeed: 4.5, attackRange: 2.0, attackCd: 1.3, kb: 7 } },
  cb_lowPolyOrc:          { name: 'Lowpoly Orc',       category: 'chibataMob', asset: 'lowPolyOrc',          tier: 'chibata', behavior: 'walker', targetHeight: 1.9, stats: { hp: 130, damage: 20, moveSpeed: 5.0, attackRange: 2.6, attackCd: 1.4, kb: 9 } },
  cb_monsterWolf:         { name: 'Old Blood Wolf',    category: 'chibataMob', asset: 'monsterWolf',         tier: 'chibata', behavior: 'walker', targetHeight: 1.4, stats: { hp: 110, damage: 22, moveSpeed: 8.0, attackRange: 2.4, attackCd: 1.1, kb: 7 } },
  cb_mushroomBoss:        { name: 'Mushroom Lord',     category: 'chibataMob', asset: 'mushroomBoss',        tier: 'chibata', behavior: 'brute',  targetHeight: 3.2, stats: { hp: 520, damage: 40, moveSpeed: 3.5, attackRange: 3.4, attackCd: 1.8, kb: 20 }, isBoss: true },
  cb_nightmareCreature1:  { name: 'Nightmare I',       category: 'chibataMob', asset: 'nightmareCreature1',  tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 140, damage: 22, moveSpeed: 5.5, attackRange: 2.6, attackCd: 1.3, kb: 8 } },
  cb_nightmareCreature2:  { name: 'Nightmare II',      category: 'chibataMob', asset: 'nightmareCreature2',  tier: 'chibata', behavior: 'walker', targetHeight: 1.9, stats: { hp: 150, damage: 24, moveSpeed: 5.5, attackRange: 2.6, attackCd: 1.3, kb: 9 } },
  cb_nightmareCreature3:  { name: 'Nightmare III',     category: 'chibataMob', asset: 'nightmareCreature3',  tier: 'chibata', behavior: 'walker', targetHeight: 2.0, stats: { hp: 160, damage: 26, moveSpeed: 5.5, attackRange: 2.8, attackCd: 1.3, kb: 10 } },
  cb_nightmareCreature4:  { name: 'Nightmare IV',      category: 'chibataMob', asset: 'nightmareCreature4',  tier: 'chibata', behavior: 'brute',  targetHeight: 2.4, stats: { hp: 220, damage: 30, moveSpeed: 4.5, attackRange: 3.0, attackCd: 1.5, kb: 14 } },
  cb_theraphosaBlondi:    { name: 'Goliath Spider',    category: 'chibataMob', asset: 'theraphosaBlondi',    tier: 'chibata', behavior: 'walker', targetHeight: 1.6, stats: { hp: 130, damage: 24, moveSpeed: 6.0, attackRange: 2.2, attackCd: 1.0, kb: 6 } },
  cb_whulvkWerewolf:      { name: 'Whulvk Werewolf',   category: 'chibataMob', asset: 'whulvkWerewolf',      tier: 'chibata', behavior: 'brute',  targetHeight: 2.3, stats: { hp: 260, damage: 34, moveSpeed: 7.0, attackRange: 2.8, attackCd: 1.2, kb: 14 } },

  // ── Demons ──
  cb_csoAlienPhobos:    { name: 'Phobos Alien',     category: 'chibataMob', asset: 'csoAlienPhobos',    tier: 'chibata', behavior: 'walker', targetHeight: 2.0, stats: { hp: 170, damage: 26, moveSpeed: 5.5, attackRange: 2.6, attackCd: 1.3, kb: 9 } },
  cb_cyberMancubus:     { name: 'Cyber Mancubus',   category: 'chibataMob', asset: 'cyberMancubus',     tier: 'chibata', behavior: 'brute',  targetHeight: 2.6, stats: { hp: 340, damage: 36, moveSpeed: 3.5, attackRange: 3.2, attackCd: 1.7, kb: 16 } },
  cb_demonicMinion:     { name: 'Demonic Minion',   category: 'chibataMob', asset: 'demonicMinion',     tier: 'chibata', behavior: 'walker', targetHeight: 1.5, stats: { hp: 80,  damage: 16, moveSpeed: 6.5, attackRange: 2.2, attackCd: 1.1, kb: 5 } },
  cb_helldemonReborn:   { name: 'Hellborn Reborn',  category: 'chibataMob', asset: 'helldemonReborn',   tier: 'chibata', behavior: 'brute',  targetHeight: 2.4, stats: { hp: 290, damage: 34, moveSpeed: 4.5, attackRange: 2.8, attackCd: 1.4, kb: 14 } },
  cb_impDoom:           { name: 'Doom Imp',         category: 'chibataMob', asset: 'impDoom',           tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 110, damage: 22, moveSpeed: 7.0, attackRange: 2.4, attackCd: 1.0, kb: 6 } },
  cb_mancubusDoom:      { name: 'Doom Mancubus',    category: 'chibataMob', asset: 'mancubusDoom',      tier: 'chibata', behavior: 'brute',  targetHeight: 2.6, stats: { hp: 320, damage: 34, moveSpeed: 3.5, attackRange: 3.2, attackCd: 1.7, kb: 16 } },
  cb_stormKingBoss:     { name: 'Storm King',       category: 'chibataMob', asset: 'stormKingBoss',     tier: 'chibata', behavior: 'brute',  targetHeight: 3.8, stats: { hp: 700, damage: 50, moveSpeed: 4.0, attackRange: 3.8, attackCd: 1.6, kb: 22 }, isBoss: true },

  // ── Flyers ──
  cb_drogonDragon:      { name: 'Drogon (Beast)',   category: 'chibataMob', asset: 'drogonDragon',      tier: 'chibata', behavior: 'flyer',  targetHeight: 5.0, stats: { hp: 850, damage: 58, moveSpeed: 6.0, attackRange: 4.5, attackCd: 1.4, kb: 22 }, isBoss: true },
  cb_frostPredator:     { name: 'Frost Predator',   category: 'chibataMob', asset: 'frostPredator',     tier: 'chibata', behavior: 'walker', targetHeight: 1.6, stats: { hp: 150, damage: 24, moveSpeed: 7.0, attackRange: 2.4, attackCd: 1.1, kb: 7 } },
  cb_nightmareFlyer:    { name: 'Nightmare Steed',  category: 'chibataMob', asset: 'nightmareFlyer',    tier: 'chibata', behavior: 'flyer',  targetHeight: 2.4, stats: { hp: 240, damage: 30, moveSpeed: 7.0, attackRange: 2.8, attackCd: 1.3, kb: 10 } },
  cb_prowlerDragon:     { name: 'Prowler Dragon',   category: 'chibataMob', asset: 'prowlerDragon',     tier: 'chibata', behavior: 'flyer',  targetHeight: 3.2, stats: { hp: 380, damage: 38, moveSpeed: 6.5, attackRange: 3.4, attackCd: 1.4, kb: 14 } },
  cb_robowyvern:        { name: 'Robo Wyvern',      category: 'chibataMob', asset: 'robowyvern',        tier: 'chibata', behavior: 'flyer',  targetHeight: 3.0, stats: { hp: 360, damage: 40, moveSpeed: 6.5, attackRange: 3.4, attackCd: 1.5, kb: 12 } },
  cb_wyvern:            { name: 'Wyvern',           category: 'chibataMob', asset: 'wyvern',            tier: 'chibata', behavior: 'flyer',  targetHeight: 3.0, stats: { hp: 320, damage: 36, moveSpeed: 6.5, attackRange: 3.2, attackCd: 1.4, kb: 12 } },

  // ── Undead ──
  cb_humanityMir4:    { name: 'Humanity Lost',    category: 'chibataMob', asset: 'humanityMir4',    tier: 'chibata', behavior: 'walker', targetHeight: 2.0, stats: { hp: 200, damage: 28, moveSpeed: 5.0, attackRange: 2.8, attackCd: 1.4, kb: 10 } },
  cb_ripperZombie:    { name: 'Ripper Zombie',    category: 'chibataMob', asset: 'ripperZombie',    tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 100, damage: 22, moveSpeed: 6.5, attackRange: 2.4, attackCd: 1.0, kb: 5 } },
  cb_skelly:          { name: 'Skelly',           category: 'chibataMob', asset: 'skelly',          tier: 'chibata', behavior: 'walker', targetHeight: 1.7, stats: { hp: 65,  damage: 14, moveSpeed: 5.0, attackRange: 2.2, attackCd: 1.3, kb: 5 } },
  cb_theLich:         { name: 'The Lich',         category: 'chibataMob', asset: 'theLich',         tier: 'chibata', behavior: 'brute',  targetHeight: 2.6, stats: { hp: 600, damage: 44, moveSpeed: 4.5, attackRange: 3.6, attackCd: 1.6, kb: 18 }, isBoss: true },
  cb_zombieMelee:     { name: 'Zombie Brawler',   category: 'chibataMob', asset: 'zombieMelee',     tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 90,  damage: 18, moveSpeed: 4.0, attackRange: 2.2, attackCd: 1.3, kb: 6 } },
  cb_zombieWarrior:   { name: 'Zombie Warrior',   category: 'chibataMob', asset: 'zombieWarrior',   tier: 'chibata', behavior: 'walker', targetHeight: 1.9, stats: { hp: 130, damage: 22, moveSpeed: 4.5, attackRange: 2.6, attackCd: 1.4, kb: 8 } },

  // ── Skeletons (Quaternius pack) ──
  cb_skeletonMage:    { name: 'Skeleton Mage',     category: 'chibataMob', asset: 'skeletonMage',    tier: 'chibata', behavior: 'walker', targetHeight: 1.8, stats: { hp: 90,  damage: 22, moveSpeed: 4.5, attackRange: 3.0, attackCd: 1.5, kb: 6 } },
  cb_skeletonMinion:  { name: 'Skeleton Minion',   category: 'chibataMob', asset: 'skeletonMinion',  tier: 'chibata', behavior: 'walker', targetHeight: 1.5, stats: { hp: 45,  damage: 10, moveSpeed: 5.5, attackRange: 2.0, attackCd: 1.1, kb: 4 } },
  cb_skeletonRogue:   { name: 'Skeleton Rogue',    category: 'chibataMob', asset: 'skeletonRogue',   tier: 'chibata', behavior: 'walker', targetHeight: 1.7, stats: { hp: 70,  damage: 18, moveSpeed: 7.0, attackRange: 2.2, attackCd: 0.9, kb: 5 } },
  cb_skeletonWarrior: { name: 'Skeleton Warrior',  category: 'chibataMob', asset: 'skeletonWarrior', tier: 'chibata', behavior: 'brute',  targetHeight: 1.9, stats: { hp: 140, damage: 24, moveSpeed: 4.5, attackRange: 2.6, attackCd: 1.4, kb: 9 } },
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
