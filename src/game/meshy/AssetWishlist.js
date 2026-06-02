// ─────────────────────────────────────────────────────────────────
//  AssetWishlist — ÁRVORE de itens que o jogo precisa gerar
//
//  É um "tech-tree de assets": tudo que o DigimonFPS precisa, organizado
//  por categoria, cada item com um PROMPT pronto (em inglês — o Meshy
//  rende melhor) e um label em PT. Clicar num item pré-preenche a Máquina
//  de Criação. O status (gerado/pendente) fica no LocalDB ('wishlist_done').
//
//  Edite à vontade: adicione/remova itens conforme o jogo cresce.
// ─────────────────────────────────────────────────────────────────

export const AssetWishlist = {
  consumiveis: {
    label: '🧪 Consumíveis',
    items: [
      { id: 'pot_hp_small',  name: 'Poção de Vida P',   prompt: 'small red health potion, glass bottle with cork, glowing red liquid, fantasy game item' },
      { id: 'pot_hp_big',    name: 'Poção de Vida G',   prompt: 'large red health potion, ornate glass flask, bubbling crimson liquid, fantasy game item' },
      { id: 'pot_mp',        name: 'Poção de Mana',     prompt: 'blue mana potion, crystal vial, swirling blue magic liquid, fantasy game item' },
      { id: 'elixir_str',    name: 'Elixir de Força',   prompt: 'orange strength elixir, muscular emblem on bottle, fantasy buff potion' },
      { id: 'food_meat',     name: 'Comida (Carne)',    prompt: 'cooked turkey leg roasted meat, stylized fantasy food item' },
    ],
  },

  armas: {
    label: '⚔️ Armas',
    items: [
      { id: 'w_sword',   name: 'Espada',      prompt: 'fantasy steel longsword, ornate hilt, game-ready weapon, side view' },
      { id: 'w_axe',     name: 'Machado',     prompt: 'heavy battle axe, double blade, wooden handle, fantasy weapon' },
      { id: 'w_spear',   name: 'Lança',       prompt: 'long spear with steel tip, fantasy polearm weapon' },
      { id: 'w_bow',     name: 'Arco',        prompt: 'wooden recurve bow with string, fantasy ranged weapon' },
      { id: 'w_pistol',  name: 'Pistola',     prompt: 'sci-fi energy pistol, sleek futuristic handgun, glowing core' },
      { id: 'w_rifle',   name: 'Rifle',       prompt: 'futuristic plasma rifle, sci-fi assault weapon, glowing blue energy' },
      { id: 'w_hammer',  name: 'Martelo',     prompt: 'giant war hammer, massive metal head, fantasy two-handed weapon' },
    ],
  },

  interativos: {
    label: '🔧 Interativos (dungeon)',
    items: [
      { id: 'i_chest',    name: 'Baú',          prompt: 'wooden treasure chest with gold trim and lock, closed, fantasy game prop' },
      { id: 'i_door',     name: 'Porta',        prompt: 'heavy wooden dungeon door with iron bands, fantasy game prop' },
      { id: 'i_lever',    name: 'Alavanca',     prompt: 'stone wall lever switch, metal handle, dungeon mechanism' },
      { id: 'i_portal',   name: 'Portal',       prompt: 'glowing magic portal ring, swirling energy, stone frame, fantasy teleporter' },
      { id: 'i_campfire', name: 'Fogueira (save)', prompt: 'cozy campfire with logs and glowing embers, save point bonfire, fantasy' },
      { id: 'i_barrel',   name: 'Barril',       prompt: 'wooden barrel with metal rings, breakable fantasy prop' },
      { id: 'i_crate',    name: 'Caixote',      prompt: 'wooden crate box, breakable game prop' },
      { id: 'i_anvil',    name: 'Bancada/Forja', prompt: 'blacksmith anvil on wooden stump, crafting station, fantasy' },
    ],
  },

  dungeon_floresta: {
    label: '🌲 Dungeon 1 — Floresta',
    items: [
      { id: 'f_tree',     name: 'Árvore',       prompt: 'stylized fantasy tree, lush green leaves, twisted trunk, low poly' },
      { id: 'f_mushroom', name: 'Cogumelo',     prompt: 'giant glowing fantasy mushroom, bioluminescent cap, forest prop' },
      { id: 'f_rock',     name: 'Pedra',        prompt: 'mossy boulder rock, natural stone, forest prop, low poly' },
      { id: 'f_flower',   name: 'Flores',       prompt: 'cluster of colorful fantasy flowers, glowing petals, forest ground prop' },
      { id: 'f_stump',    name: 'Toco',         prompt: 'tree stump with roots, cut log, forest prop' },
    ],
  },

  dungeon_ruinas: {
    label: '🏛️ Dungeon 2 — Ruínas',
    items: [
      { id: 'r_pillar',   name: 'Pilar Quebrado', prompt: 'broken ancient stone pillar, cracked ruined column, fantasy ruins prop' },
      { id: 'r_statue',   name: 'Estátua',      prompt: 'ancient stone guardian statue, weathered, moss covered, fantasy ruins' },
      { id: 'r_brazier',  name: 'Braseiro',     prompt: 'stone brazier with fire bowl, ancient torch stand, dungeon lighting' },
      { id: 'r_rubble',   name: 'Entulho',      prompt: 'pile of broken stone rubble and bricks, ruins debris prop' },
      { id: 'r_arch',     name: 'Arco de Pedra', prompt: 'ancient stone archway, ruined gate, fantasy ruins structure' },
    ],
  },

  dungeon_cidade: {
    label: '🏙️ Dungeon 3 — Cidade',
    items: [
      { id: 'c_lamp',     name: 'Poste de Luz', prompt: 'modern street lamp post, metal pole with light, urban prop' },
      { id: 'c_bin',      name: 'Lixeira',      prompt: 'metal trash dumpster, dirty urban garbage bin, city prop' },
      { id: 'c_bench',    name: 'Banco',        prompt: 'public park bench, wood and metal, urban prop' },
      { id: 'c_hydrant',  name: 'Hidrante',     prompt: 'red fire hydrant, urban street prop' },
      { id: 'c_car',      name: 'Carro',        prompt: 'abandoned rusty car wreck, urban decay prop' },
    ],
  },

  dungeon_scifi: {
    label: '🛸 Dungeon 4 — SciFi',
    items: [
      { id: 's_terminal', name: 'Terminal',     prompt: 'sci-fi holographic computer terminal, glowing screen, futuristic console' },
      { id: 's_pod',      name: 'Cápsula',      prompt: 'sci-fi cryo pod capsule, glass chamber, glowing futuristic prop' },
      { id: 's_crate',    name: 'Container',    prompt: 'futuristic metal supply container, sci-fi crate with glowing panel' },
      { id: 's_barrier',  name: 'Barreira',     prompt: 'glowing energy barrier pylon, sci-fi force field generator' },
      { id: 's_core',     name: 'Núcleo',       prompt: 'glowing reactor core, sci-fi energy sphere on pedestal, futuristic' },
    ],
  },

  materiais: {
    label: '💎 Moeda & Materiais (drops)',
    items: [
      { id: 'sp_coin',   name: 'Moeda',      prompt: 'golden coin with emblem, shiny currency, game pickup, floating' },
      { id: 'mat_scrap', name: 'Sucata',     prompt: 'pile of scrap metal gears bolts and screws, salvage crafting material, game pickup' },
      { id: 'mat_core',  name: 'DigiNúcleo', prompt: 'glowing blue digital core orb, cyber energy sphere with circuit patterns, sci-fi crafting material' },
      { id: 'sp_shard',  name: 'Cristal',    prompt: 'glowing magic crystal shard, floating purple gem, collectible crafting material' },
    ],
  },

  especiais: {
    label: '⭐ Especiais',
    items: [
      { id: 'sp_machine', name: 'Máquina de Criação', prompt: 'futuristic fabrication machine with holographic display and glowing core, 3D printer altar, sci-fi crafting station' },
      { id: 'sp_egg',     name: 'DigiEgg',      prompt: 'digital monster egg, glowing patterned shell, fantasy creature egg on stand' },
      { id: 'sp_shard',   name: 'Cristal',      prompt: 'glowing magic crystal shard, floating gem, collectible fantasy item' },
      { id: 'sp_coin',    name: 'Moeda',        prompt: 'golden coin with emblem, shiny currency, game pickup' },
      { id: 'sp_chest_boss', name: 'Baú de Boss', prompt: 'large ornate golden boss reward chest, jeweled, glowing, fantasy' },
    ],
  },
};

// ── Helpers de status (persistido no LocalDB 'wishlist_done') ──────
export function wishlistCategories() { return Object.keys(AssetWishlist); }
export function wishlistAllItems() {
  const out = [];
  for (const [cat, group] of Object.entries(AssetWishlist)) {
    for (const it of group.items) out.push({ ...it, cat, catLabel: group.label });
  }
  return out;
}
