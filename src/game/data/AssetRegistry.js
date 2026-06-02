// ─────────────────────────────────────────────────────────────────
//  AssetRegistry — fonte única de verdade para todos os assets GLB/GLTF
//
//  Organizado por categoria. Cada entrada tem o caminho relativo à raiz
//  do servidor. Use AssetRegistry.path(category, id) para resolver.
//
//  Dados verificados com tools/glb-inspect.js:
//    • Digimons + creature pack = TOTALMENTE rigados e animados
//    • Player + animações = biped mixamorig
// ─────────────────────────────────────────────────────────────────

const DIGI = 'assets/digimons/';
const CREAT = 'assets/itens 3d/Assets baixados novos/glTF-20260528T011429Z-3-001/glTF/';
const FANTASY = 'assets/itens 3d/Assets baixados novos/Fantasy Props MegaKit[Standard]/Exports/glTF/';
const NATURE = 'assets/itens 3d/Assets baixados novos/PACK AMBIENTE ASSETS/glTF/';

export const AssetRegistry = {
  // ── Personagem jogável (biped rig, animado) ─────────────────────
  player: {
    main:    'assets/characters/player.glb',
    unarmed: 'assets/itens 3d/Animations-meshy/Meshy_AI_Faça_um_rato_mistura_biped_Character_output.glb',
  },

  // ── Inimigos: Digimons (rigados + animados) ─────────────────────
  digimon: {
    agumon:       DIGI + 'digimon_linkz_-_agumon.glb',
    veemon:       DIGI + 'digimon_linkz_-_veemon.glb',
    dorumon:      DIGI + 'digimon_linkz_-_dorumon.glb',
    gatomon:      DIGI + 'digimon_linkz_-_gatomon.glb',
    blackGatomon: DIGI + 'digimon_linkz_-_black_gatomon.glb',
    growlmon:     DIGI + 'digimon_linkz_-_growlmon.glb',
    dracomon:     DIGI + 'dracomon_digimon_linkz_sleuth_with_animation.glb',
    filmon:       DIGI + 'filmon_-_digimon.glb',
    biyomon:      DIGI + 'mobile_-_digimon_linkz_-_biyomon.glb',
    gabumon:      DIGI + 'mobile_-_digimon_linkz_-_gabumon.glb',
    exveemon:     DIGI + 'xv-mon_exveemon_-_digimon_story_cyber_sleuth.glb',
    mervamon:     DIGI + 'mobile_-_digimon_new_century_-_mervamon.glb',
    ophanimonX:   DIGI + 'mobile_-_digimon_new_century_-_ophanimon_x.glb',
    rosemonX:     DIGI + 'mobile_-_digimon_new_century_-_rosemon_x.glb',
    raihimon:     DIGI + 'raihimon_-_digimon_new_century.glb',
    sakuyamon:    DIGI + 'sakuyamon_maid_mode_-_digimon_rearise.glb',
    azulongmon:   DIGI + 'azulongmon_qinglongmon_-_digimon_rearise.glb',
    baihumon:     DIGI + 'baihumon_-_digimon_rearise.glb',
    ebonwumon:    DIGI + 'ebonwumon_xuanwumon_-_digimon_rearise.glb',
    zhuqiaomon:   DIGI + 'zhuqiaomon_-_digimon_rearise.glb',
    colossalSquid:DIGI + 'hsw_boss_colossal_squid.glb',
    drogon:       DIGI + 'drogon__game_of_thrones_dragon.glb',
  },

  // ── Inimigos: creature pack (com formas Evolved) ────────────────
  creature: {
    alpaking:        CREAT + 'Alpaking.gltf',
    alpakingEvolved: CREAT + 'Alpaking_Evolved.gltf',
    armabee:         CREAT + 'Armabee.gltf',
    armabeeEvolved:  CREAT + 'Armabee_Evolved.gltf',
    demon:           CREAT + 'Demon.gltf',
    dragon:          CREAT + 'Dragon.gltf',
    dragonEvolved:   CREAT + 'Dragon_Evolved.gltf',
    ghost:           CREAT + 'Ghost.gltf',
    ghostSkull:      CREAT + 'Ghost_Skull.gltf',
    glub:            CREAT + 'Glub.gltf',
    glubEvolved:     CREAT + 'Glub_Evolved.gltf',
    goleling:        CREAT + 'Goleling.gltf',
    golelingEvolved: CREAT + 'Goleling_Evolved.gltf',
    hywirl:          CREAT + 'Hywirl.gltf',
    pigeon:          CREAT + 'Pigeon.gltf',
    squidle:         CREAT + 'Squidle.gltf',
    tribal:          CREAT + 'Tribal.gltf',
  },

  // ── Armas ───────────────────────────────────────────────────────
  weapon: {
    pistol:      'assets/itens 3d/Armas/Arma inicial.glb',
    meshyGun1:   'assets/itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020348_texture.glb',
    meshyGun2:   'assets/itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020413_texture.glb',
    swordBronze: FANTASY + 'Sword_Bronze.gltf',
    axeBronze:   FANTASY + 'Axe_Bronze.gltf',
  },

  // ── Itens (poções, baús — já existem como GLB) ──────────────────
  item: {
    potion1:    FANTASY + 'Potion_1.gltf',
    potion2:    FANTASY + 'Potion_2.gltf',
    potion4:    FANTASY + 'Potion_4.gltf',
    smallBottle:FANTASY + 'SmallBottle.gltf',
    bottle1:    FANTASY + 'Bottle_1.gltf',
    chestWood:  FANTASY + 'Chest_Wood.gltf',
    keyGold:    FANTASY + 'Key_Gold.gltf',
    keyMetal:   FANTASY + 'Key_Metal.gltf',
    coin:       FANTASY + 'Coin.gltf',
    coinPile:   FANTASY + 'Coin_Pile.gltf',
    crateWood:  FANTASY + 'Crate_Wooden.gltf',
    barrel:     FANTASY + 'Barrel.gltf',
    torch:      FANTASY + 'Torch_Metal.gltf',
    dummy:      FANTASY + 'Dummy.gltf',
  },

  // ── Natureza (foliage) ──────────────────────────────────────────
  nature: {
    birch1: NATURE + 'BirchTree_1.gltf',
    birch2: NATURE + 'BirchTree_2.gltf',
    birch3: NATURE + 'BirchTree_3.gltf',
    birch4: NATURE + 'BirchTree_4.gltf',
    birch5: NATURE + 'BirchTree_5.gltf',
    bush:        NATURE + 'Bush.gltf',
    bushLarge:   NATURE + 'Bush_Large.gltf',
    bushSmall:   NATURE + 'Bush_Small.gltf',
    bushFlowers: NATURE + 'Bush_Flowers.gltf',
  },

  // ── Decoração / props externos (Sketchfab + Meshy) ──────────────
  //  Antes só eram colocados hardcoded na cena (placeDecor/spawnPickups) e
  //  NÃO apareciam na biblioteca. Agora registrados → editáveis/spawnáveis.
  decor: {
    medkit:       'assets/itens 3d/ExternalAssets/Sketchfab/Items/medkit_pickup.glb',
    ammoBox:      'assets/itens 3d/ExternalAssets/Sketchfab/Items/ammo_box.glb',
    neonSign:     'assets/itens 3d/ExternalAssets/Sketchfab/Props/neon_bar_sign.glb',
    sciTube:      'assets/itens 3d/ExternalAssets/Sketchfab/Props/science_tube.glb',
    industrial:   'assets/itens 3d/ExternalAssets/Sketchfab/Props/low_poly_industrial_pack.glb',
    mushrooms:    'assets/itens 3d/ExternalAssets/Sketchfab/RiftfallTheme/Environment/stylized_mushrooms_low_poly.glb',
    crystals:     'assets/itens 3d/ExternalAssets/Sketchfab/RiftfallTheme/Environment/stylized_crystal_gems_pack.glb',
    pedestal:     'assets/itens 3d/ExternalAssets/Sketchfab/RiftfallTheme/Teleporters/stone_pedestal_teleporter_base.glb',
    crystalAltar: 'assets/itens 3d/ExternalAssets/Sketchfab/RiftfallTheme/Teleporters/crystal_altar.glb',
    obelisk:      'assets/itens 3d/assets/Meshy_AI_Azure_Runic_Obelisk_0521180533_texture.glb',
    gargoyle:     'assets/itens 3d/assets/Meshy_AI_Gargoyle_Fountain_0521180631_texture.glb',
    runicHare:    'assets/itens 3d/assets/Meshy_AI_The_Runic_Hare_0521180553_texture.glb',
    stoneBlock:   'assets/itens 3d/assets/Meshy_AI_Mystical_Stone_Block_0521180612_texture.glb',
  },

  path(category, id) { return this[category]?.[id] ?? null; },
  ids(category) {
    const cat = this[category];
    return cat ? Object.keys(cat).filter(k => typeof cat[k] === 'string') : [];
  },
  categories() { return ['player', 'digimon', 'creature', 'weapon', 'item', 'nature', 'decor']; },
};
