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
const CHIBATA_MOB = 'assets/chibata-mobs/';
const CHIBATA_MAP = 'assets/chibata-maps/';

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

  // ── Inimigos: Chibata mob pack (dark fantasy/horror) ────────────
  //  Pasta organizada: raiz + beasts/ + demons/ + flyers/ + undead/ + skeletons/
  chibataMob: {
    // ── Raiz (criaturas clássicas, walker/brute) ──
    bat:          CHIBATA_MOB + 'bat.glb',
    demon:        CHIBATA_MOB + 'demon.glb',
    dragon:       CHIBATA_MOB + 'dragon.glb',
    dragonBig:    CHIBATA_MOB + 'dragon_big.glb',
    ghost:        CHIBATA_MOB + 'ghost.glb',
    ghoul:        CHIBATA_MOB + 'ghoul.glb',
    goblin:       CHIBATA_MOB + 'goblin.glb',
    mawGooey:     CHIBATA_MOB + 'maw_gooey.glb',
    necromancer:  CHIBATA_MOB + 'necromancer.glb',
    orc:          CHIBATA_MOB + 'orc.glb',
    skeleton:     CHIBATA_MOB + 'skeleton.glb',
    slime:        CHIBATA_MOB + 'slime.glb',
    yeti:         CHIBATA_MOB + 'yeti.glb',
    zombie:       CHIBATA_MOB + 'zombie.glb',

    // ── Beasts ──
    drugdorGolem:        CHIBATA_MOB + 'beasts/drugdor-golem.glb',
    herculesBeetle:      CHIBATA_MOB + 'beasts/hercules-beetle.glb',
    lowPolyOrc:          CHIBATA_MOB + 'beasts/low-poly-orc.glb',
    monsterWolf:         CHIBATA_MOB + 'beasts/monster-wolf-old-blood.glb',
    mushroomBoss:        CHIBATA_MOB + 'beasts/mushroom-boss.glb',
    nightmareCreature1:  CHIBATA_MOB + 'beasts/nightmare-creature-1.glb',
    nightmareCreature2:  CHIBATA_MOB + 'beasts/nightmare-creature-2.glb',
    nightmareCreature3:  CHIBATA_MOB + 'beasts/nightmare-creature-3.glb',
    nightmareCreature4:  CHIBATA_MOB + 'beasts/nightmare-creature-4.glb',
    theraphosaBlondi:    CHIBATA_MOB + 'beasts/theraphosa-blondi.glb',
    whulvkWerewolf:      CHIBATA_MOB + 'beasts/whulvk-werewolf-lycan-blockbench.glb',

    // ── Demons ──
    csoAlienPhobos:    CHIBATA_MOB + 'demons/cso-alien-phobos.glb',
    cyberMancubus:     CHIBATA_MOB + 'demons/cyber-mancubus-doom-2016.glb',
    demonicMinion:     CHIBATA_MOB + 'demons/demonic-minion.glb',
    helldemonReborn:   CHIBATA_MOB + 'demons/helldemon-reborn.glb',
    impDoom:           CHIBATA_MOB + 'demons/imp-doom-2016.glb',
    mancubusDoom:      CHIBATA_MOB + 'demons/mancubus-doom-2016.glb',
    stormKingBoss:     CHIBATA_MOB + 'demons/storm-king-boss.glb',

    // ── Flyers ──
    drogonDragon:       CHIBATA_MOB + 'flyers/drogon-dragon.glb',
    frostPredator:      CHIBATA_MOB + 'flyers/four-legged-frost-predator.glb',
    nightmareFlyer:     CHIBATA_MOB + 'flyers/nightmare.glb',
    prowlerDragon:      CHIBATA_MOB + 'flyers/prowler-dragon-variant-rig.glb',
    robowyvern:         CHIBATA_MOB + 'flyers/robowyvern.glb',
    wyvern:             CHIBATA_MOB + 'flyers/wyvern.glb',

    // ── Undead ──
    humanityMir4:       CHIBATA_MOB + 'undead/humanity-reconstructed-mir4.glb',
    ripperZombie:       CHIBATA_MOB + 'undead/ripper-zombie.glb',
    skelly:             CHIBATA_MOB + 'undead/skelly.glb',
    theLich:            CHIBATA_MOB + 'undead/the-lich-blockbench.glb',
    zombieMelee:        CHIBATA_MOB + 'undead/zombie-melee.glb',
    zombieWarrior:      CHIBATA_MOB + 'undead/zombie-warrior.glb',

    // ── Skeletons (Quaternius) ──
    skeletonMage:       CHIBATA_MOB + 'skeletons/Skeleton_Mage.glb',
    skeletonMinion:     CHIBATA_MOB + 'skeletons/Skeleton_Minion.glb',
    skeletonRogue:      CHIBATA_MOB + 'skeletons/Skeleton_Rogue.glb',
    skeletonWarrior:    CHIBATA_MOB + 'skeletons/Skeleton_Warrior.glb',
  },

  // ── Mapas (Chibata) ──────────────────────────────────────────────
  //  Cenários completos com chão, prédios, textura. Carregados pelo Level.
  chibataMap: {
    calcata:           CHIBATA_MAP + 'calcata.glb',
    cemetery:          CHIBATA_MAP + 'cemetery.glb',
    collisionWorld:    CHIBATA_MAP + 'collision_world.glb',
    castleInterior:    CHIBATA_MAP + 'dl_castle_interior.glb',
    dungeonWarkarma:   CHIBATA_MAP + 'dungeon_warkarma.glb',
    forest:            CHIBATA_MAP + 'forest.glb',
    hellArena:         CHIBATA_MAP + 'hell_arena.glb',
    lowpolyCity:       CHIBATA_MAP + 'lowpoly_city.glb',
    nightCity:         CHIBATA_MAP + 'night_city.glb',
    pirateFort:        CHIBATA_MAP + 'pirate_fort.glb',
    snowScene:         CHIBATA_MAP + 'snow_scene.glb',
    spaceStation:      CHIBATA_MAP + 'space_station.glb',
    valleyVillage:     CHIBATA_MAP + 'valley_village.glb',
    virtualCity:       CHIBATA_MAP + 'virtual_city.glb',
    westernTown:       CHIBATA_MAP + 'western_town.glb',
  },

  // ── Armas ───────────────────────────────────────────────────────
  weapon: {
    pistol:      'assets/itens 3d/Armas/Arma inicial.glb',
    meshyGun1:   'assets/itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020348_texture.glb',
    meshyGun2:   'assets/itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020413_texture.glb',
    swordBronze: FANTASY + 'Sword_Bronze.gltf',
    axeBronze:   FANTASY + 'Axe_Bronze.gltf',
    // ── Espadas PBR (Forgotten Insanity) ──
    sword_paladin:    'assets/weapons/longsword_paladin.glb',
    sword_zweihander: 'assets/weapons/zweihander.glb',
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
  categories() { return ['player', 'digimon', 'creature', 'chibataMob', 'chibataMap', 'weapon', 'item', 'nature', 'decor']; },
};
