export const MOVESETS = {
  basico: {
    idle:  'assets/animations/basico/idle.glb',
    walk:  'assets/animations/basico/walk.glb',
    run:   'assets/animations/basico/run.glb',
    jump:  'assets/animations/basico/jump.glb',
  },

  armado: {
    idle:      'assets/animations/basico/idle.glb',
    walk:      'assets/animations/basico/walk.glb',
    run:       'assets/animations/basico/run.glb',
    reload:    'assets/animations/armado/reload.glb',

    // ── Postura armada / mira / tiro (TPS) ──────────────────────────
    // NOTA: idle_aim.glb é o "Gun_Hold_Left_Turn" (animação de VIRAR) — faz o
    // personagem girar parado. Usamos a idle básica (parada de verdade) p/ o
    // estado inativo armado. A arma fica na mão pelo socket de qualquer forma.
    aim_idle:      'assets/animations/basico/idle.glb',          // parado de verdade
    aim_hold:      'assets/animations/armado/idle_aim.glb',      // postura de mira (vira) — opcional
    aim_walk:      'assets/animations/armado/walk_aim.glb',       // andando mirando
    aim_run:       'assets/animations/armado/run_aim.glb',        // correndo armado
    aim_walk_back: 'assets/animations/armado/walk_back_gun.glb',  // recuando com arma
    aim_shoot:     'assets/animations/armado/walk_shoot.glb',     // disparando
    aim_reload:    'assets/animations/armado/reload_stand.glb',   // recarga parado
    aim_run_reload:'assets/animations/armado/reload_run.glb',     // recarga correndo
    aim_charge:    'assets/animations/armado/charge.glb',         // carregando arma
  },

  luta_sem_arma: {
    punch_01:  'assets/animations/luta_sem_arma/punch_01.glb',
    punch_02:  'assets/animations/luta_sem_arma/punch_02.glb',
    punch_03:  'assets/animations/luta_sem_arma/punch_03.glb',
    punch_04:  'assets/animations/luta_sem_arma/punch_04.glb',
    kick_01:   'assets/animations/luta_sem_arma/kick_01.glb',
    kick_02:   'assets/animations/luta_sem_arma/kick_02.glb',
    dodge:     'assets/animations/luta_sem_arma/dodge.glb',
    knockdown: 'assets/animations/luta_sem_arma/knockdown.glb',
  },

  // ── Chutes extras (GLB Meshy AI, biped rig — 100% compatíveis) ────
  // Arquivos reais em assets/animations/Chutes-glb/
  chutes: {
    double_kick:     'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Double_kick_forward_withSkin.glb',
    flying_fist:     'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Flying_Fist_Kick_withSkin.glb',
    high_kick:       'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_High_Kick_withSkin.glb',
    lunge_spin:      'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Lunge_Spin_Kick_withSkin.glb',
    rising_flying:   'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Rising_Flying_Kick_withSkin.glb',
    roundhouse:      'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Roundhouse_Kick_withSkin.glb',
    spartan_kick:    'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Spartan_Kick_withSkin.glb',
    step_high:       'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Step_in_High_Kick_withSkin.glb',
    step_turn:       'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Step_Step_Turn_Kick_withSkin.glb',
    sweeping_kick:   'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Sweeping_Kick_withSkin.glb',
    sweep_kick:      'assets/animations/Chutes-glb/Meshy_AI_Faça_um_rato_mistura_biped_Animation_Sweep_Kick_withSkin.glb',
  },

  // ── Animações novas (features) — pasta assets/animations/extras/ ──
  extras: {
    run_fast:     'assets/animations/extras/run_fast.glb',       // correr rápido (sprint)
    idle_02:      'assets/animations/extras/idle_02.glb',        // idle alternativo
    hit_face:     'assets/animations/extras/hit_face.glb',       // reação a soco no rosto
    hit_face_2:   'assets/animations/extras/hit_face_2.glb',     // reação a soco no rosto 2
    hit_back_run: 'assets/animations/extras/hit_back_run.glb',   // pancada nas costas correndo
    vault_rifle:  'assets/animations/extras/vault_rifle.glb',    // pulo armado (rifle)
    jump_punch:   'assets/animations/extras/jump_punch.glb',     // soco saltitante
    kungfu_punch: 'assets/animations/extras/kungfu_punch.glb',   // skill modo luta
    catch_breath: 'assets/animations/extras/catch_breath.glb',   // recuperar fôlego
    pickup:       'assets/animations/extras/pickup.glb',         // pegar do chão
    falling:      'assets/animations/extras/falling.glb',        // caindo (do mapa / de alto)
    dead:         'assets/animations/extras/dead.glb',           // morto (morte no mapa)
    walk_back:        'assets/animations/extras/walk_back.glb',        // andar de costas (desarmado)
    walk_back_pistol: 'assets/animations/extras/walk_back_pistol.glb', // de costas com pistola
    walk_back_heavy:  'assets/animations/extras/walk_back_heavy.glb',  // de costas com arma pesada
    // Novo combo de socos (6 golpes)
    combo_punch_0: 'assets/animations/extras/combo_punch_0.glb',
    combo_punch_1: 'assets/animations/extras/combo_punch_1.glb',
    combo_punch_2: 'assets/animations/extras/combo_punch_2.glb',
    combo_punch_3: 'assets/animations/extras/combo_punch_3.glb',
    combo_punch_4: 'assets/animations/extras/combo_punch_4.glb',
    combo_punch_5: 'assets/animations/extras/combo_punch_5.glb',
  },

  com_espada: {
    idle:      'assets/animations/com_espada/idle.glb',
    attack_01: 'assets/animations/com_espada/attack_01.glb',
    combo_2:   'assets/animations/com_espada/attack_combo_2.glb',
    combo_3:   'assets/animations/com_espada/attack_combo_3.glb',
    charged:   'assets/animations/com_espada/attack_charged.glb',
    ultimate:  'assets/animations/com_espada/ultimate.glb',
  },

  parkour: {
    vault:       'assets/animations/parkour/vault_01.glb',
    vault_02:    'assets/animations/parkour/vault_02.glb',
    vault_roll:  'assets/animations/parkour/vault_roll.glb',
  }
};

// ── Move List completa (para UI e debug) ────────────────────────────
export const MOVE_LIST = [
  // ── Movimento ─────────────────────────────────────────────────────
  { input: 'WASD',          name: 'Mover',                 category: 'movimento' },
  { input: 'Espaço',        name: 'Pular',                 category: 'movimento' },
  { input: 'W W (duplo)',   name: 'Dash para frente',      category: 'movimento' },
  { input: 'Shift',         name: 'Esquiva',               category: 'movimento' },
  { input: 'V',             name: 'Toggle FPS/TPS',        category: 'movimento' },
  { input: 'WJ (parede)',   name: 'Wall Jump',             category: 'movimento' },

  // ── Combate desarmado (LMB chain) ────────────────────────────────
  { input: 'LMB',           name: 'Jab',                   category: 'soco',    anim: 'punch_01' },
  { input: 'LMB LMB',       name: 'Hook',                  category: 'soco',    anim: 'punch_02' },
  { input: 'LMB x3',        name: 'Uppercut Duplo',        category: 'soco',    anim: 'punch_03' },
  { input: 'LMB x4',        name: 'Cotovelada',            category: 'soco',    anim: 'punch_04' },

  // ── Chutes (RMB chain) ───────────────────────────────────────────
  { input: 'RMB',           name: 'Chute Alto',            category: 'chute',   anim: 'kick_01' },
  { input: 'RMB RMB',       name: 'Roundhouse Finisher',   category: 'chute',   anim: 'kick_02' },
  // Extras (quando FBX convertidos)
  { input: 'RMB',           name: 'Roundhouse',            category: 'chute',   anim: 'roundhouse',      pendente: true },
  { input: 'RMB',           name: 'Side Kick',             category: 'chute',   anim: 'side_kick',       pendente: true },
  { input: 'RMB',           name: 'Leg Sweep',             category: 'chute',   anim: 'leg_sweep',       pendente: true },
  { input: 'RMB',           name: 'Inside Crescent',       category: 'chute',   anim: 'inside_crescent', pendente: true },
  { input: 'RMB',           name: 'Armada',                category: 'chute',   anim: 'armada',          pendente: true },
  { input: 'RMB',           name: 'Martelo',               category: 'chute',   anim: 'martelo',         pendente: true },
  { input: 'RMB',           name: 'Pontera',               category: 'chute',   anim: 'pontera',         pendente: true },

  // ── Cross-combo (alternando LMB + RMB) ──────────────────────────
  { input: 'LMB → RMB',     name: 'Jab → Chute',           category: 'cross' },
  { input: 'RMB → LMB',     name: 'Chute → Soco',          category: 'cross' },

  // ── Espada ───────────────────────────────────────────────────────
  { input: 'LMB',           name: 'Slash Básico',          category: 'espada',  anim: 'attack_01' },
  { input: 'LMB x2',        name: 'Combo x2',              category: 'espada',  anim: 'combo_2' },
  { input: 'LMB x3',        name: 'Combo x3',              category: 'espada',  anim: 'combo_3' },
  { input: 'Hold LMB',      name: 'Slash Carregado',       category: 'espada',  anim: 'charged' },
  { input: 'Q',             name: 'Ultimate',              category: 'espada',  anim: 'ultimate' },

  // ── Armado (arma de fogo) ────────────────────────────────────────
  { input: 'LMB',           name: 'Atirar',                category: 'arma' },
  { input: 'RMB',           name: 'Mirar (ADS)',           category: 'arma' },
  { input: 'R',             name: 'Recarregar',            category: 'arma' },
  { input: '1 / 2',         name: 'Trocar Arma',           category: 'arma' },
  { input: 'G',             name: 'Guardar/Sacar Arma',    category: 'arma' },

  // ── Parkour ──────────────────────────────────────────────────────
  { input: 'Espaço (parede)', name: 'Wall Jump',           category: 'parkour', anim: 'vault_roll' },
];

