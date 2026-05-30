// ─────────────────────────────────────────────────────────────────
//  ItemCatalog — definição data-driven de consumíveis e equipamentos
//
//  type: 'consumable' | 'equipment'
//  consumable.effect(ctx) onde ctx = { player, stats }
//  equipment.slot + equipment.statBonus
//  asset = id no AssetRegistry.item (modelo 3D do pickup)
// ─────────────────────────────────────────────────────────────────

import { LocalDB } from '../data/LocalDB.js';

// ─────────────────────────────────────────────────────────────────
//  ItemCatalog — definição data-driven de consumíveis e equipamentos
// ─────────────────────────────────────────────────────────────────

export let ItemCatalog = {};

/**
 * Inicializa o catálogo carregando do LocalDB.
 * Se o DB estiver vazio, usa os valores padrão e salva no DB.
 */
export async function initItemCatalog() {
  const dbData = await LocalDB.get('items', {});
  
  if (Object.keys(dbData).length > 0) {
    ItemCatalog = dbData;
    // Injeta os efeitos (functions não podem ser salvas em JSON)
    _injectEffects();
  } else {
    // Fallback: valores iniciais se o arquivo não existir
    ItemCatalog = _getDefaults();
    await LocalDB.save('items', ItemCatalog);
  }
}

function _injectEffects() {
  const effects = {
    hpSmall:    ({ player }) => { player.hp = Math.min(player.maxHp, player.hp + 30); },
    hpLarge:    ({ player }) => { player.hp = Math.min(player.maxHp, player.hp + 80); },
    hpFull:     ({ player }) => { player.hp = player.maxHp; },
    mpPotion:   ({ stats })  => { if (stats) stats.mp = Math.min(stats.maxMp, stats.mp + 40); },
    elixirStr:  ({ stats })  => { stats?.addBuff('strength', { mult: 1.5, duration: 30 }); },
    elixirSpeed:({ stats })  => {
      stats?.addBuff('attackSpeed', { mult: 1.4, duration: 20 });
      stats?.addBuff('moveSpeed', { mult: 1.4, duration: 20 });
    },
  };

  for (const [id, effect] of Object.entries(effects)) {
    if (ItemCatalog[id]) ItemCatalog[id].effect = effect;
  }
}

function _getDefaults() {
  return {
    hpSmall: {
      name: 'Poção Pequena', type: 'consumable', asset: 'potion1', rarity: 'common',
      color: [1, 0.3, 0.3], stack: 9,
      desc: 'Restaura 30 de HP.',
    },
    hpLarge: {
      name: 'Poção Grande', type: 'consumable', asset: 'potion2', rarity: 'uncommon',
      color: [1, 0.15, 0.4], stack: 9,
      desc: 'Restaura 80 de HP.',
    },
    hpFull: {
      name: 'Poção Máxima', type: 'consumable', asset: 'potion4', rarity: 'rare',
      color: [1, 0.5, 0.6], stack: 5,
      desc: 'Restaura todo o HP.',
    },
    mpPotion: {
      name: 'Poção de Mana', type: 'consumable', asset: 'bottle1', rarity: 'common',
      color: [0.3, 0.4, 1], stack: 9,
      desc: 'Restaura 40 de MP.',
    },
    elixirStr: {
      name: 'Elixir de Força', type: 'consumable', asset: 'smallBottle', rarity: 'uncommon',
      color: [1, 0.6, 0.1], stack: 5,
      desc: '+50% de Força por 30s.',
    },
    elixirSpeed: {
      name: 'Elixir de Velocidade', type: 'consumable', asset: 'smallBottle', rarity: 'uncommon',
      color: [0.2, 1, 0.6], stack: 5,
      desc: '+40% Vel. de Ataque e Movimento por 20s.',
    },
    ironGloves: {
      name: 'Luvas de Ferro', type: 'equipment', slot: 'gloves', rarity: 'uncommon',
      asset: 'keyMetal', statBonus: { strength: 4, attackSpeed: 2 },
      desc: '+4 Força, +2 Vel. Ataque.',
    },
    swiftBoots: {
      name: 'Botas Velozes', type: 'equipment', slot: 'boots', rarity: 'uncommon',
      asset: 'keyMetal', statBonus: { moveSpeed: 5, dodge: 3 },
      desc: '+5 Vel. Movimento, +3 Esquiva.',
    },
    guardianPlate: {
      name: 'Peitoral Guardião', type: 'equipment', slot: 'chest', rarity: 'rare',
      asset: 'keyGold', statBonus: { defense: 8, vitality: 6 },
      desc: '+8 Defesa, +6 Vitalidade.',
    },
    critAmulet: {
      name: 'Amuleto Feroz', type: 'equipment', slot: 'amulet', rarity: 'rare',
      asset: 'coin', statBonus: { crit: 8, luck: 3 },
      desc: '+8 Crítico, +3 Sorte.',
    },
  };
}

export const RARITY_COLORS = {
  common:   '#cccccc',
  uncommon: '#5cdd5c',
  rare:     '#4499ff',
  epic:     '#bb55ff',
  legendary:'#ffaa22',
};

export function getItemDef(id) { return ItemCatalog[id] || null; }
export function allItemIds() { return Object.keys(ItemCatalog); }
export function itemsByType(type) {
  return Object.entries(ItemCatalog).filter(([, d]) => d.type === type).map(([id]) => id);
}
