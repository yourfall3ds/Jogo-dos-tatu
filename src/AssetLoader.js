// ─────────────────────────────────────────────────────────────────
//  AssetLoader — carrega todos os GLBs do projeto
//
//  Caminhos relativos ao servidor (http://localhost:5500/)
//  Espaços em nomes de pasta são tratados via encodeURIComponent.
// ─────────────────────────────────────────────────────────────────

// Codifica apenas o nome do arquivo (não a barra)
function enc(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

const BASE = 'assets/itens 3d/';
export const ASSET_PATHS = {
  // ── Armas (Nova Estrutura) ──────────────────────────────────────
  pistol:        'assets/itens 3d/Armas/Arma inicial.glb',
  rifle:         'assets/itens 3d/ExternalAssets/Sketchfab/Weapons/sci_fi_plasma_rifle.glb',
  weaponMain:    'assets/itens 3d/Armas/Arma inicial.glb',
  weaponAlt:     'assets/itens 3d/ExternalAssets/Sketchfab/Weapons/sci_fi_plasma_rifle.glb',
  weaponOld:     'assets/itens 3d/Armas/Arma inicial.glb',

  // ── Personagem (Nova Estrutura) ─────────────────────────────────
  player:        'assets/characters/player.glb',
  mouse:         'assets/characters/player.glb',
  playerUnarmed: 'assets/itens 3d/Animations-meshy/Meshy_AI_Faça_um_rato_mistura_biped_Character_output.glb',

  // ── Animações Hierárquicas (Serão carregadas via Moveset) ────────
  // Os arquivos individuais agora moram em assets/animations/...
  // Nota: como não temos Blender, usamos o mesmo arquivo mas extraímos
  // os grupos de animação logicamente.
  locomotion: 'assets/characters/player.glb',
  unarmed_attacks: 'assets/characters/player.glb',

  // ── Props de cenário ─────────────────────────────────────────────
  crate:        BASE + 'ExternalAssets/Sketchfab/Items/stylized_crate.glb',
  ammoBox:      BASE + 'ExternalAssets/Sketchfab/Items/ammo_box.glb',
  medkit:       BASE + 'ExternalAssets/Sketchfab/Items/medkit_pickup.glb',
  chest:        BASE + 'ExternalAssets/Sketchfab/Items/game_loot_chest.glb',
  neonSign:     BASE + 'ExternalAssets/Sketchfab/Props/neon_bar_sign.glb',
  sciTube:      BASE + 'ExternalAssets/Sketchfab/Props/science_tube.glb',
  mushroom:     BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Environment/stylized_mushroom.glb',
  mushrooms:    BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Environment/stylized_mushrooms_low_poly.glb',
  crystals:     BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Environment/stylized_crystal_gems_pack.glb',
  pedestal:     BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Teleporters/stone_pedestal_teleporter_base.glb',
  crystalAltar: BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Teleporters/crystal_altar.glb',
  industrial:   BASE + 'ExternalAssets/Sketchfab/Props/low_poly_industrial_pack.glb',

  // ── Criaturas (decorativas/NPC) ───────────────────────────────────
  cockatrice:   BASE + 'ExternalAssets/Sketchfab/Creatures/cockatrice_monster.glb',
  monsterPlant: BASE + 'ExternalAssets/Sketchfab/RiftfallTheme/Creatures/monster_plant.glb',

  // ── Props Meshy AI ────────────────────────────────────────────────
  obelisk:      BASE + 'assets/Meshy_AI_Azure_Runic_Obelisk_0521180533_texture.glb',
  gargoyle:     BASE + 'assets/Meshy_AI_Gargoyle_Fountain_0521180631_texture.glb',
  runicHare:    BASE + 'assets/Meshy_AI_The_Runic_Hare_0521180553_texture.glb',
  stoneBlock:   BASE + 'assets/Meshy_AI_Mystical_Stone_Block_0521180612_texture.glb',
  ancientChest: BASE + 'assets/Meshy_AI_Ancient_Scroll_Chest_0521180520_texture.glb',
  throne:       BASE + 'assets/Meshy_AI_Leo_Throne_0521180527_texture.glb',
};

export class AssetLoader {
  constructor(scene, shadowGen) {
    this.scene      = scene;
    this.shadowGen  = shadowGen;
    this.meshes     = {};   // key → meshes[]
    this.animGroups = {};   // key → AnimationGroup[]
    this._loading   = {};   // promises em voo
  }

  // Carrega um asset pelo key; retorna array de meshes (ou null se falhar)
  async load(key) {
    if (this.meshes[key]) return this.meshes[key];
    if (this._loading[key]) return this._loading[key];

    const rawPath = ASSET_PATHS[key];
    if (!rawPath) { console.warn(`AssetLoader: key "${key}" não existe`); return null; }

    // Separa folder e filename, codificando espaços
    const lastSlash = rawPath.lastIndexOf('/');
    const folder    = enc(rawPath.substring(0, lastSlash + 1));
    const file      = enc(rawPath.substring(lastSlash + 1));

    this._loading[key] = BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene)
      .then(result => {
        const ms = result.meshes;
        // Sombras em todos os meshes
        for (const m of ms) {
          if (!m.name.startsWith('__root__')) {
            this.shadowGen?.addShadowCaster(m, true);
            m.receiveShadows = true;
          }
        }
        this.meshes[key]     = ms;
        this.animGroups[key] = result.animationGroups ?? [];
        console.log(`✅ loaded: ${key} (${ms.length} meshes, ${this.animGroups[key].length} anims)`);
        return ms;
      })
      .catch(err => {
        console.warn(`⚠️ falhou: ${key} —`, err?.message ?? err);
        this.meshes[key] = null;
        return null;
      });

    return this._loading[key];
  }

  getRawPath(key) {
    return ASSET_PATHS[key];
  }

  // Carrega vários em paralelo
  async loadMany(keys) {
    return Promise.all(keys.map(k => this.load(k)));
  }

  /**
   * Cria uma instância (clone leve) de um asset já carregado.
   * Retorna o nó raiz do clone, ou null se o asset não estiver disponível.
   */
  instance(key, name, pos, rot = 0, scale = 1) {
    const ms = this.meshes[key];
    if (!ms?.length) return null;

    // O primeiro mesh costuma ser o __root__ (TransformNode)
    const root = ms[0];
    const clone = root.clone(name, null, false);
    if (!clone) return null;

    clone.position = pos.clone();
    clone.rotation.y = rot;
    clone.scaling.setAll(scale);
    clone.setEnabled(true);

    return clone;
  }
}
