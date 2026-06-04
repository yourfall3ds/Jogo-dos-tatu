// ─────────────────────────────────────────────────────────────────
//  avatarAnimProfiles — perfil de animação POR AVATAR
//
//  POR QUE EXISTE: cada avatar (orc, mago, cleric, lizard...) vem com rig
//  PRÓPRIO e nomes de osso DIFERENTES. As anims Meshy externas (idle.glb,
//  walk.glb...) só casam por nome de osso com o rato Meshy. Nos outros
//  avatares o re-bind dá 0/72 → T-pose.
//
//  SOLUÇÃO: cada avatar usa as animationGroups EMBUTIDAS no próprio GLB.
//  Este mapa diz, por URL do avatar, quais nomes internos correspondem a
//  cada AÇÃO do jogo (idle/walk/run/attack/...). O CharacterSwapper usa
//  isso pra registrar as anims baked na AnimationLibrary com os nomes-padrão
//  que o AnimationController espera ('idle', 'walk', 'run', 'punch_01'...).
//
//  Os hints são a mesma fonte de verdade do preview (CharacterSelectScreen).
// ─────────────────────────────────────────────────────────────────

// Por avatar: { acao_padrao: [hint1, hint2...] }. A resolução tenta nome
// exato → substring → cai pro idle. Hints vêm da inspeção de cada GLB.
export const AVATAR_ANIM_PROFILES = {
  'assets/characters/player.glb': {
    idle:     ['Idle_5', 'Idle'],
    walk:     ['Walking', 'Walk'],
    run:      ['Run', 'Running', 'Walking'],
    punch_01: ['Archery_Shot_1', 'Archery_Shot', 'Shot'],
    punch_02: ['Archery_Shot_3', 'Run_and_Shoot'],
  },
  'assets/characters/dark_warrior_aaa_ready.glb': {
    // anims REAIS embutidas: Standing Idle Looking Ver. 1 / Boss-Walking /
    // Boss-Run / Attack 360 Low / Attack Horizontal / Punch / Dying
    idle:     ['Standing Idle Looking Ver. 1', 'Standing Idle Looking', 'Idle'],
    walk:     ['Boss-Walking', 'Walking', 'Walk'],
    run:      ['Boss-Run', 'Boss-Walking', 'Run'],
    punch_01: ['Attack Horizontal', 'Punch', 'Attack'],
    punch_02: ['Attack 360 Low', '360', 'Punch'],
    attack_01:['Attack Horizontal', 'Attack'],
    dead:     ['Dying'],
  },
  'assets/characters/orc_warrior_ready.glb': {
    idle:     ['Armature|Orc_Ideal', 'Orc_Ideal', 'Idle'],
    walk:     ['Armature|Orc_Walk', 'Orc_Walk', 'Walk'],
    run:      ['Armature|Orc_Walk', 'Orc_Walk', 'Run'],
    punch_01: ['Armature|Orc_Punch', 'Orc_Punch', 'Punch'],
    punch_02: ['Armature|Jumping_Jack', 'Jumping_Jack', 'Orc_Punch'],
    attack_01:['Armature|Orc_Punch', 'Orc_Punch', 'Punch'],
  },
  'assets/characters/cleric_priestess48_ready.glb': {
    idle:     ['Idle.001', 'Idle'],
    walk:     ['Walk.002', 'Walk'],
    run:      ['Walk.002', 'Run', 'Walk'],
    punch_01: ['Fire'],
    punch_02: ['Standing Purify', 'Purify'],
    attack_01:['Fire'],
  },
  'assets/characters/mage_oldwizard_ready.glb': {
    idle:     ['idle'],
    walk:     ['walk'],
    run:      ['run', 'walk'],
    punch_01: ['attack'],
    punch_02: ['attack'],
    attack_01:['attack'],
  },
  'assets/characters/lizard_monster_ready.glb': {
    // lizard NÃO tem idle/death — Walking vira pose neutra.
    idle:     ['Walking', 'Walk'],
    walk:     ['Walking', 'Walk', 'Running'],
    run:      ['Running', 'Walking'],
    punch_01: ['Right_Hand_Sword_Slash', 'Slash'],
    punch_02: ['Punch_Combo_5', 'Combo', 'Punch'],
    attack_01:['Right_Hand_Sword_Slash', 'Slash'],
  },
};

/** Resolve o AnimationGroup baked que corresponde a uma ação, via hints. */
export function pickBakedAnim(groups, hints) {
  if (!groups || !groups.length || !hints) return null;
  const lower = (s) => String(s || '').toLowerCase();
  // 1) nome exato (case-insensitive)
  for (const h of hints) {
    const g = groups.find(x => x.name && lower(x.name) === lower(h));
    if (g) return g;
  }
  // 2) substring
  for (const h of hints) {
    const hl = lower(h);
    const g = groups.find(x => x.name && lower(x.name).includes(hl));
    if (g) return g;
  }
  return null;
}

/** Tem perfil pra esse avatar? */
export function getAvatarProfile(url) {
  if (!url) return null;
  // normaliza: tira querystring e decodifica
  let key = url;
  try { key = decodeURIComponent(url.split('?')[0]); } catch (_) {}
  return AVATAR_ANIM_PROFILES[key] || AVATAR_ANIM_PROFILES[url] || null;
}
