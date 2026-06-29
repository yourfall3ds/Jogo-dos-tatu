export class CombatSystem {
  constructor(animController, stateMachine, comboSystem, impactSystem, playerMesh) {
    this.animController = animController;
    this.stateMachine = stateMachine;
    this.comboSystem = comboSystem;
    this.impactSystem = impactSystem;
    this.playerMesh = playerMesh;

    // Limiar de CRÍTICO (knockback). Só golpes REALMENTE pesados (voadeiras,
    // finalizadores) são crit → som especial + explosão + freeze forte + voar
    // longe. O combo normal fica com o som consistente de impacto.
    this.CRIT_KB = 4.5;

    // Hit timings para estilo hack-and-slash dinâmico
    // Suporta múltiplos hits por animação (ex: dois socos rápidos)
    this.attackData = {
      // ── SOCOS (LMB) ─────────────────────────────────────────────────
      punch_01: { hits: [{ hitTime: 0.10, damage: 15, bone: 'RightHand', kb: 1.0 }], comboWindow: 0.30 }, // Jab
      punch_02: { hits: [{ hitTime: 0.12, damage: 18, bone: 'LeftHand',  kb: 1.2 }], comboWindow: 0.35 }, // Hook
      punch_03: { hits: [
        { hitTime: 0.10, damage: 10, bone: 'RightHand', kb: 0.8 },
        { hitTime: 0.22, damage: 14, bone: 'LeftHand',  kb: 1.5 }
      ], comboWindow: 0.45 }, // Uppercut duplo
      punch_04: { hits: [{ hitTime: 0.12, damage: 25, bone: 'RightHand', kb: 1.8 }], comboWindow: 0.45 }, // Cotovelada

      // ── NOVO COMBO DE SOCOS (Meshy biped) ───────────────────────────
      combo_punch_1: { hits: [{ hitTime: 0.10, damage: 15, bone: 'RightHand', kb: 1.0 }], comboWindow: 0.32 },
      combo_punch_2: { hits: [{ hitTime: 0.12, damage: 17, bone: 'LeftHand',  kb: 1.2 }], comboWindow: 0.35 },
      combo_punch_3: { hits: [{ hitTime: 0.11, damage: 19, bone: 'RightHand', kb: 1.4 }], comboWindow: 0.38 },
      combo_punch_4: { hits: [{ hitTime: 0.13, damage: 21, bone: 'LeftHand',  kb: 1.6 }], comboWindow: 0.40 },
      combo_punch_5: { hits: [{ hitTime: 0.15, damage: 30, bone: 'RightHand', kb: 2.8 }], comboWindow: 0.48 }, // finalizador
      // Soco saltitante / kung fu / aéreo
      jump_punch:    { hits: [{ hitTime: 0.16, damage: 28, bone: 'RightHand', kb: 3.0 }], comboWindow: 0.50 },
      kungfu_punch:  { hits: [{ hitTime: 0.18, damage: 45, bone: 'RightHand', kb: 4.0 }], comboWindow: 0.55 },

      // ── CHUTES (RMB) — GLBs existentes ──────────────────────────────
      kick_01: { hits: [{ hitTime: 0.20, damage: 30, bone: 'RightFoot', kb: 2.5 }], comboWindow: 0.50 }, // Chute levanta
      kick_02: { hits: [{ hitTime: 0.25, damage: 50, bone: 'RightFoot', kb: 4.0 }], comboWindow: 0.70 }, // Roundhouse finalizador

      // ── CHUTES EXTRAS (Meshy biped — já carregados) → combo "bala" ──
      high_kick:     { hits: [{ hitTime: 0.22, damage: 38, bone: 'RightFoot', kb: 3.2 }], comboWindow: 0.55 },
      flying_fist:   { hits: [{ hitTime: 0.20, damage: 40, bone: 'RightFoot', kb: 3.5 }], comboWindow: 0.55 },
      double_kick:   { hits: [
        { hitTime: 0.16, damage: 20, bone: 'RightFoot', kb: 1.5 },
        { hitTime: 0.34, damage: 30, bone: 'LeftFoot',  kb: 3.5 }
      ], comboWindow: 0.60 },
      // ── Chutes AÉREOS (pulando) — "bala" ────────────────────────────
      rising_flying: { hits: [{ hitTime: 0.18, damage: 45, bone: 'RightFoot', kb: 4.5 }], comboWindow: 0.55 },
      lunge_spin:    { hits: [{ hitTime: 0.22, damage: 48, bone: 'RightFoot', kb: 5.0 }], comboWindow: 0.55 },
      spartan_kick:  { hits: [{ hitTime: 0.20, damage: 42, bone: 'RightFoot', kb: 6.0 }], comboWindow: 0.55 },

      // ── CHUTES EXTRAS (pasta Chutes/ — ativados quando convertidos de FBX → GLB) ──
      roundhouse:     { hits: [{ hitTime: 0.22, damage: 45, bone: 'RightFoot', kb: 5.0 }], comboWindow: 0.60 }, // 2º chute = crit launcher (manda longe)
      side_kick:      { hits: [{ hitTime: 0.18, damage: 35, bone: 'RightFoot', kb: 2.8 }], comboWindow: 0.50 },
      leg_sweep:      { hits: [{ hitTime: 0.25, damage: 28, bone: 'RightFoot', kb: 1.5 }], comboWindow: 0.45 }, // derruba
      inside_crescent:{ hits: [{ hitTime: 0.20, damage: 38, bone: 'RightFoot', kb: 3.0 }], comboWindow: 0.55 },
      armada:         { hits: [{ hitTime: 0.22, damage: 42, bone: 'RightFoot', kb: 3.2 }], comboWindow: 0.60 },
      martelo:        { hits: [{ hitTime: 0.18, damage: 40, bone: 'RightFoot', kb: 3.8 }], comboWindow: 0.55 },
      pontera:        { hits: [{ hitTime: 0.20, damage: 35, bone: 'LeftFoot',  kb: 2.8 }], comboWindow: 0.50 },

      // ── ESPADA (LMB com sword equipada — feel The Duel / GunZ) ──────
      //  melee: 'sword' → _applyHit usa cone amplo na frente (range 3.0,
      //  arc ~120°) em vez de osso. Damage alto, kb pesado, hitstop maior.

      // ── Chain principal ──
      sword_attack_01:    { hits: [{ hitTime: 0.10, damage: 40, melee: 'sword', kb: 2.5 }], comboWindow: 0.35 },
      sword_left_slash:   { hits: [{ hitTime: 0.12, damage: 45, melee: 'sword', kb: 2.8 }], comboWindow: 0.38 },
      sword_thrust:       { hits: [{ hitTime: 0.14, damage: 55, melee: 'sword', kb: 3.5 }], comboWindow: 0.40 },
      sword_triple_combo: { hits: [
        { hitTime: 0.08, damage: 22, melee: 'sword', kb: 1.0 },
        { hitTime: 0.22, damage: 28, melee: 'sword', kb: 1.5 },
        { hitTime: 0.40, damage: 40, melee: 'sword', kb: 3.0 }
      ], comboWindow: 0.55 }, // finalizador da chain

      // ── Finalizadores (rotacionam após chain) ──
      sword_charged_slash: { hits: [{ hitTime: 0.32, damage: 120, melee: 'sword', kb: 6.5 }], comboWindow: 0.60 },
      sword_judgment:      { hits: [
        { hitTime: 0.30, damage: 60, melee: 'sword', kb: 3.0 },
        { hitTime: 0.55, damage: 90, melee: 'sword', kb: 5.5 }
      ], comboWindow: 0.65 },
      sword_blade_spin:    { hits: [
        { hitTime: 0.20, damage: 35, melee: 'sword', kb: 2.0 },
        { hitTime: 0.40, damage: 35, melee: 'sword', kb: 2.0 },
        { hitTime: 0.60, damage: 60, melee: 'sword', kb: 5.0 }
      ], comboWindow: 0.65 },

      // ── Compatibilidade (chain antigo + RMB charged) ──
      sword_combo_2:    { hits: [{ hitTime: 0.12, damage: 50, melee: 'sword', kb: 3.0 }], comboWindow: 0.40 },
      sword_combo_3:    { hits: [
        { hitTime: 0.10, damage: 30, melee: 'sword', kb: 1.5 },
        { hitTime: 0.28, damage: 45, melee: 'sword', kb: 3.5 }
      ], comboWindow: 0.50 },
      sword_charged:    { hits: [{ hitTime: 0.30, damage: 110, melee: 'sword', kb: 6.0 }], comboWindow: 0.55 },
      sword_heavy_swing:{ hits: [{ hitTime: 0.30, damage: 90, melee: 'sword', kb: 5.0 }], comboWindow: 0.55 },

      // ── Ultimate (Q) ──
      sword_ultimate:  { hits: [
        { hitTime: 0.25, damage: 60, melee: 'sword', kb: 4.0 },
        { hitTime: 0.50, damage: 80, melee: 'sword', kb: 5.0 },
        { hitTime: 0.75, damage: 120, melee: 'sword', kb: 7.0 }
      ], comboWindow: 0.70 },
    };

    // Ataques AÉREOS (pulando): soco voador vs chute voador
    this._airPunchChain = ['rising_flying'];   // jump+soco → voadeira
    this._airKickChain  = ['double_kick'];     // jump+chute → chute voador duplo
    this._airPunchIdx = 0;
    this._airKickIdx  = 0;

    const scene = this.playerMesh.getScene();
    
    // Lista de hitboxes por osso
    this.limbHitboxes = {};
    
    // Função auxiliar para criar uma hitbox invisível arredondada (simulando punho/pé)
    this._createLimbHitbox = (boneName) => {
      const sphere = BABYLON.MeshBuilder.CreateSphere(`hitbox_${boneName}`, { diameter: 0.4, segments: 8 }, scene);
      sphere.isVisible = false; // Pode ser ativada com F2 pelo Player.js
      return sphere;
    };

    // Cria as hitboxes, mas elas só serão anexadas aos ossos quando o player atacar (pois o modelo 3D pode carregar depois)
    this.limbHitboxes['RightHand'] = this._createLimbHitbox('RightHand');
    this.limbHitboxes['LeftHand']  = this._createLimbHitbox('LeftHand');
    this.limbHitboxes['RightFoot'] = this._createLimbHitbox('RightFoot');
    this.limbHitboxes['LeftFoot']  = this._createLimbHitbox('LeftFoot');
    
    // Parent padrão inicial para não ficarem presas na origem do mundo
    Object.values(this.limbHitboxes).forEach(box => {
      box.parent = this.playerMesh;
      box.position = new BABYLON.Vector3(0, 1.2, 1.5);
    });
    
    // Referência antiga vazia pra não quebrar o F2 do Player.js
    this.meleeHitbox = this.limbHitboxes['RightHand']; 
  }

  lightAttack() {
    if (this.stateMachine.isAttacking()) {
      // Já passou o frame ativo → encadeia AGORA (clique = golpe imediato).
      if (this._canCancel) { this._canCancel = false; this._executeAttack('punch'); }
      else this.comboSystem.registerPunch();   // ainda no impacto → enfileira
      return;
    }
    if (!this.stateMachine.canAttack()) return;
    this._executeAttack('punch');
  }

  kickAttack() {
    if (this.stateMachine.isAttacking()) {
      if (this._canCancel) { this._canCancel = false; this._executeAttack('kick'); }
      else this.comboSystem.registerKick();
      return;
    }
    if (!this.stateMachine.canAttack()) return;
    this._executeAttack('kick');
  }

  // ── ATAQUE PESADO ───────────────────────────────────────────────
  //  Golpe pesado real: mais dano + mais knockback (sempre crit, manda
  //  longe) + cooldown maior. Reusa toda a infra de _executeNextAttack →
  //  _applyHit (hitbox, som de impacto, sangue, hit-stop). Escolhe uma
  //  animação GARANTIDAMENTE carregada (kick_01 sempre existe; usa uma
  //  finisher mais pesada se estiver disponível).
  heavyAttack() {
    // Gate de cooldown — heavy é mais lento que o combo normal.
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this._heavyCdUntil && now < this._heavyCdUntil) return;
    if (this.stateMachine.isAttacking()) return;       // não interrompe combo em curso
    if (!this.stateMachine.canAttack()) return;

    // Escolhe a melhor anim de chute pesado que ESTIVER carregada.
    // kick_01 é o fallback seguro (sempre presente nos GLBs base).
    const has = (n) => { try { return !!this.animController?.library?.has?.(n); } catch (_) { return false; } };
    const heavyAnim = ['spartan_kick', 'kick_02', 'roundhouse', 'kungfu_punch', 'kick_01']
      .find(has) || 'kick_01';

    // Perfil PESADO (independente do attackData da anim base): muito dano,
    // knockback acima do CRIT_KB (garante crit nível 2 → voar longe).
    const heavyData = {
      hits: [{ hitTime: 0.22, damage: 70, bone: 'RightFoot', kb: 6.5 }],
      comboWindow: 0.65,
    };

    this.stateMachine.setState("attacking");
    this.comboSystem.reset();
    this._lastAttackType = 'kick';
    // Velocidade mais lenta (golpe encorpado) e isKick=true (som/impacto de chute).
    this._executeNextAttack(heavyAnim, heavyData, 2.2, true);

    // Cooldown maior que o combo normal (anti-spam do golpe pesado).
    this._heavyCdUntil = now + 850;
  }

  // ── ESPADA ──────────────────────────────────────────────────────
  //  swordAttack: LMB com espada equipada. Encadeia slash 1→2→3→charged.
  //  Mesma lógica de cancel/queue do soco — mas roteia para sword chain.
  swordAttack() {
    if (this.stateMachine.isAttacking()) {
      if (this._canCancel) { this._canCancel = false; this._executeAttack('sword'); }
      else this.comboSystem.registerSword();
      return;
    }
    if (!this.stateMachine.canAttack()) return;
    this._executeAttack('sword');
  }

  swordUltimate() {
    if (!this.stateMachine.canAttack() && !this.stateMachine.isAttacking()) return;
    this.stateMachine.setState("attacking");
    this.comboSystem.reset();
    const data = this.attackData['sword_ultimate'];
    if (!data) { this.stateMachine.setState("sword"); return; }
    this._lastAttackType = 'sword';
    this._executeNextAttack('sword_ultimate', data, 2.6, false);
  }

  _executeAttack(type) {
    this.stateMachine.setState("attacking");

    // ── Ataque AÉREO (pulando) → "bala" ─────────────────────────────
    //  Soco no ar → SOCO voador poderoso. Chute no ar → chute voador.
    const _pl = this.playerMesh?._playerRef;
    const airborne = _pl && !_pl.isGrounded;
    let attackAnim;
    if (airborne) {
      if (type === 'punch') {
        this._airPunchIdx = (this._airPunchIdx || 0) % this._airPunchChain.length;
        attackAnim = this._airPunchChain[this._airPunchIdx++];
      } else {
        this._airKickIdx = (this._airKickIdx || 0) % this._airKickChain.length;
        attackAnim = this._airKickChain[this._airKickIdx++];
      }
    } else {
      attackAnim = type === 'kick'  ? this.comboSystem.getNextKick()
                : type === 'sword' ? this.comboSystem.getNextSword()
                                   : this.comboSystem.getNextPunch();
    }

    const data = this.attackData[attackAnim];
    if (!data) {
      // animação não carregada ainda — reseta sem travar
      this.comboSystem.reset();
      this.stateMachine.setState("unarmed");
      return;
    }

    // ── Velocidade estilo Dragon Ball — socos rápidos e secos ──────
    // Cross-combo (alternar punch/kick) acelera ainda mais.
    const crossBonus = this.comboSystem.isCrossCombo() ? 0.6 : 0;
    const speed = 3.4 + crossBonus;

    this._lastAttackType = type;
    // Espada usa velocidade mais "GunZ" (rápida e seca, sem o bonus de cross)
    const swordSpeed = type === 'sword' ? 2.6 : speed;
    this._executeNextAttack(attackAnim, data, swordSpeed, type === 'kick');
  }

  _executeNextAttack(attackAnim, data, speed = 3.4, isKick = false) {
    // Invalida qualquer timer de cancelamento do golpe anterior
    this._comboToken = (this._comboToken || 0) + 1;
    const token = this._comboToken;
    clearTimeout(this._cancelTimer);

    // Expõe o golpe atual p/ o Player decidir run-while-attack (tronco golpeia,
    // pernas correm via LayeredAnimator).
    this._currentAttackAnim  = attackAnim;
    this._currentAttackSpeed = speed;

    // Sem onComplete aqui: o onAnimationGroupEndObservable do Babylon era
    // não-confiável (ora nunca disparava → travava em 'attacking', ora
    // disparava na hora → anim nem aparecia). O fim agora é por TIMER com
    // a duração REAL da animação (mais abaixo) → toca completo e termina.
    this.animController.play(attackAnim, { loop: false, speed });

    // Swing/whoosh: o golpe corta o ar. Se conectar, o _applyHit toca o som
    // de IMPACTO por cima. (Só socos/chutes — finalizadores entram também.)
    this._hitLanded = false;
    this._lastHitWasCrit = false;   // resetado por golpe (item 28: crit alarga cancel window)
    this._playSwingSound(attackAnim);

    // CHIBATA: dispara a animação procedural do lash (chicoteio)
    const pl_ = this.playerMesh?._playerRef;
    const cw_ = pl_?.weapon?.getCurrentWeapon?.();
    if (cw_?.id === 'chibata' && cw_.triggerLash) {
      const fpsRoot = pl_.weapon._weaponMeshes?.chibata;
      const tpsRoot = pl_.weapon._tpsMeshes?.chibata;
      if (pl_._tpsMode && tpsRoot) cw_.triggerLash(tpsRoot);
      else if (fpsRoot) cw_.triggerLash(fpsRoot);
    }

    // Timing de cada hit (escala com a velocidade da animação)
    let lastHitTime = 0;
    data.hits.forEach(hitDef => {
      const t = (hitDef.hitTime / speed) * 1000;
      lastHitTime = Math.max(lastHitTime, t);
      setTimeout(() => {
        if (token === this._comboToken && this.stateMachine.isAttacking()) {
          this._applyHit(hitDef, attackAnim, isKick);
        }
      }, t);
    });

    // (rastro do punho removido — VFX profissional/ghost virá depois)

    // ── Janela de cancelamento (cancel window) ──────────────────────
    // Assim que o hit conecta abre-se a janela: um clique no buffer JÁ parte
    // pro próximo golpe (ritmo seco/preciso de Dragon Ball). Em vez de um
    // único timer que lê o buffer, marcamos _canCancel=true e consumimos na
    // hora — assim cada clique vira um golpe imediato (sem engasgo).
    this._canCancel = false;
    // Janela de cancelamento: abre logo após o impacto. Se o golpe CRITOU,
    // mantemos a janela ABERTA por mais tempo (item 28) — dá mais folga pra
    // encadear o próximo golpe depois de um crit (combo flow mais generoso).
    const cancelAt = lastHitTime + 40;
    this._cancelTimer = setTimeout(() => {
      if (token !== this._comboToken) return;
      if (!this.stateMachine.isAttacking()) return;
      this._canCancel = true;
      const next = this.comboSystem.consumeBuffer();
      if (next) { this._executeAttack(next); return; }
      // Crit → estende a janela: re-checa o buffer um pouco mais tarde antes
      // de o golpe terminar, em vez de fechar o cancel imediatamente.
      if (this._lastHitWasCrit) {
        clearTimeout(this._critWindowTimer);
        this._critWindowTimer = setTimeout(() => {
          if (token !== this._comboToken || !this.stateMachine.isAttacking()) return;
          this._canCancel = true;
          const n2 = this.comboSystem.consumeBuffer();
          if (n2) this._executeAttack(n2);
        }, 160);   // ~160ms extra de janela após crit
      }
    }, cancelAt);

    // ── SAFETY: garante que o ataque termina ────────────────────────
    // O onComplete do AnimationGroup às vezes não dispara → o personagem
    // ficava TRAVADO em "attacking" pra sempre. Este timeout força o fim.
    const safeSpeed = Math.max(speed, 0.001);   // evita /0 → animDur = Infinity (safety nunca dispara)
    const animDur = (this.animController.getDuration?.(attackAnim) ?? 0.7) / safeSpeed;
    clearTimeout(this._finishSafety);
    this._finishSafety = setTimeout(() => {
      if (token === this._comboToken && this.stateMachine.isAttacking()) {
        this._onAttackFinish();
      }
    }, Math.max(250, animDur * 1000 + 120));
  }

  // Som de SWING (golpe cortando o ar) — toca ao iniciar o golpe. Rotaciona
  // ataque 1/2/3 pra não ficar repetitivo no combo.
  // CHIBATA: não toca swing (o som de chibatada é tocado no impacto e já
  // dá o feedback. Tocar 'ataque 1.wav' antes faria som de soco/espada).
  _playSwingSound(animName) {
    const snd = this.playerMesh?._playerRef?.sounds;
    if (!snd) return;
    const pl = this.playerMesh?._playerRef;
    const curW = pl?.weapon?.getCurrentWeapon?.();
    // MP: avisa o server pra parceiros OUVIREM o golpe (espacial), mesmo se
    // errar. FEITO ANTES do early-return da Chibata: o swing local da Chibata
    // é silenciado, mas o parceiro AINDA precisa receber o remote_fire pra
    // ouvir o whoosh espacial do golpe na posição do atacante.
    try {
      const wId = pl?.weapon?.getCurrentWeapon?.()?.id || 'melee';
      // animName = clipe REAL deste golpe (punch_03/sword_combo_2/…) → o avatar
      // remoto toca EXATAMENTE o mesmo golpe (paridade com o player local).
      window._cs?.sendFire?.(wId, true, null, animName);
    } catch (_) {}
    if (curW?.id === 'chibata' && curW.isMelee) {
      // Chibata: silencia o swing LOCAL (só toca chibatada no impacto).
      return;
    }
    this._swingIdx = ((this._swingIdx || 0) % 3) + 1;
    snd.playNow('swing_' + this._swingIdx, 0.5);
  }

  // Som de IMPACTO (acertou alguém). Combo normal → som CONSISTENTE; só o
  // CRÍTICO (golpe pesado) troca pro som especial. Chamado só ao CONECTAR.
  // critLevel: 0 normal · 1 crítico · 2 super crítico
  _playImpactSound(isKick, critLevel = 0, surface = 'flesh') {
    const snd = this.playerMesh?._playerRef?.sounds;
    if (!snd) return;

    // CHIBATA → som CHIBATADA SEMPRE no impacto, ignora tier de crit
    const pl = this.playerMesh?._playerRef;
    const curW = pl?.weapon?.getCurrentWeapon?.();
    if (curW?.id === 'chibata' && curW.isMelee) {
      snd.playNow('chibatada', 1.0);
      return;
    }

    // ── Som por SUPERFÍCIE / tipo de alvo (item 22) ──────────────────
    //  Alvos não-carne (props de metal/madeira, quebráveis, cenário) tocam
    //  um impacto seco diferente de bater em carne. SoundManager ignora ids
    //  ausentes → se o arquivo não existir, fica em silêncio sem quebrar.
    if (surface && surface !== 'flesh') {
      const map = { metal: 'wall_hit', wood: 'ground_hit', stone: 'wall_hit' };
      const sid = map[surface] || 'wall_hit';
      snd.playNow(sid, 0.85);
      return;
    }

    let id;
    if (isKick) {
      // chute: normal = chute medio · crit = Golpe Critico forte (manda longe)
      id = critLevel >= 1 ? 'kick_crit' : 'kick_med';
    } else {
      // soco: normal = soco quando acerta · crit = soco critico · super = Super critico
      id = critLevel >= 2 ? 'punch_supercrit'
         : critLevel === 1 ? 'punch_crit'
         : 'punch_hit';
    }
    snd.playNow(id, 0.95);
  }

  _applyHit(hitDef, animName, isKick = false) {
    if (!this.playerMesh) return;

    // ── Nível de crítico ────────────────────────────────────────────
    //  Chute: determinístico pela força (golpes pesados / 2º chute = crit que
    //   manda longe). Soco: golpes pesados sempre critam; os leves têm CHANCE
    //   de virar crítico (raro) ou super crítico (mais raro). 0/1/2.
    const baseKb = hitDef.kb || 1;
    let critLevel = 0;
    if (baseKb >= 6)             critLevel = 2;
    else if (baseKb >= this.CRIT_KB) critLevel = 1;
    else if (!isKick) {
      const r = Math.random();
      if (r < 0.06)      critLevel = 2;   // super crítico (raro)
      else if (r < 0.20) critLevel = 1;   // crítico
    }
    const isCrit = critLevel >= 1;
    // Crit afeta MECÂNICA (item 28): marca pra _executeNextAttack ALARGAR a
    // janela de cancelamento do combo (mais tempo pra encadear depois de um
    // crit) e pra estender o hitstun no inimigo (logo abaixo, via takeDamage).
    if (isCrit) this._lastHitWasCrit = true;

    // Força efetiva: num crit garante o "voar longe" mesmo num golpe leve.
    let kbEff = critLevel === 2 ? Math.max(baseKb, 5.5)
              : critLevel === 1 ? Math.max(baseKb, 4.5)
              : baseKb;

    // ── Escala de COMBO (item 16) ────────────────────────────────────
    //  Quanto mais longo o combo, mais forte o golpe: o dano cresce ~6% por
    //  hit encadeado (teto +60%), e o knockback/feel acompanha de leve. O
    //  contador vem do histórico do ComboSystem. comboTier (0..1) também
    //  escala o hitstop/VFX mais abaixo (impacto "sobe" durante o combo).
    const comboCount = (() => { try { return this.comboSystem.getComboCount?.() || 0; } catch (_) { return 0; } })();
    const comboMult  = 1 + Math.min(0.60, comboCount * 0.06);
    const comboTier  = Math.min(1, comboCount / 8);   // 0 no início → 1 num combo longo
    kbEff *= (1 + comboTier * 0.25);

    // ── ESPADA mais PESADA (item 17) ─────────────────────────────────
    //  A espada tem alcance maior (3.2u) e deve "pesar" mais: knockback
    //  reforçado e hitstop maior (ver mais abaixo) que socos/chutes.
    const isSwordHit = hitDef.melee === 'sword';
    if (isSwordHit) kbEff *= 1.35;

    // Dano efetivo escalado pelo combo (arredondado p/ número limpo).
    const dmgEff = Math.max(1, Math.round(hitDef.damage * comboMult));

    // Garante um osso válido: vários hitDefs não definem .bone, o que
    // quebrava getSocketNode (toLowerCase de undefined). Default p/ RightHand,
    // igual ao fallback da hitbox abaixo.
    const boneName = hitDef.bone || 'RightHand';
    const activeHitbox = this.limbHitboxes[boneName] || this.limbHitboxes['RightHand'];
    
    // Anexa as hitboxes aos ossos reais do Animator copiando a Posição Absoluta
    // Mantemos as caixas parentadas à cena (null) ou ao playerMesh para não herdar distorções/escalas de ossos,
    // mas forçamos elas a ficarem exatamente onde o osso está no espaço 3D real.
    let socket = null;
    if (this.playerMesh._playerRef && this.playerMesh._playerRef.animator) {
      socket = this.playerMesh._playerRef.animator.getSocketNode(boneName);
    }

    if (socket) {
      activeHitbox.parent = null; // Tira de dentro do player para não herdar offsets
      activeHitbox.position.copyFrom(socket.getAbsolutePosition());
    } else {
      // Fallback de segurança: Se não tiver osso, põe na frente do peito
      activeHitbox.parent = this.playerMesh;
      activeHitbox.position = new BABYLON.Vector3(0, 1.2, 1.5);
    }
    
    activeHitbox.computeWorldMatrix(true);

    const currentPos = this.playerMesh.position;

    // Direção do golpe = pra ONDE O PLAYER OLHA. No TPS a mira inclui PITCH
    // (mirar pra cima/baixo), então derivamos do forward REAL da câmera —
    // igual ao gun e à SkillSystem (camera.getDirection(Forward), que já
    // embute yaw+pitch). O capsule tem rotação travada, por isso usamos a
    // câmera e NÃO mesh.getDirection. Fallback p/ yaw puro se a câmera não
    // existir (ex.: contextos sem player local).
    const _pl = this.playerMesh._playerRef;
    let moveDir;
    const _camFwd = _pl?.camera?.getDirection?.(BABYLON.Vector3.Forward());
    if (_camFwd && _camFwd.lengthSquared() > 1e-6) {
      moveDir = _camFwd.normalize();   // inclui pitch → paralaxe de mira no TPS
    } else {
      const yawRad = BABYLON.Tools.ToRadians(_pl?.yaw ?? 0);
      moveDir = new BABYLON.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
    }

    const scene = this.playerMesh.getScene();
    let hitSomething = false;
    const hitEnemies  = new Set();
    const hitPhysics  = new Set();

    // ── Alcance frontal (detecção robusta) ───────────────────────────
    //  A hitbox precisa no osso é frágil (timing/posição). Chute errava
    //  porque o pé fica baixo e o hit dispara antes de estender. Aqui
    //  adicionamos "está NA FRENTE e dentro do ALCANCE" → soco/chute
    //  acertam de forma confiável (padrão de jogo de ação).
    //  Espada (melee:'sword'): alcance 3.2u + arco ~120° (mais largo).
    const isSword = hitDef.melee === 'sword';
    const fwdFlat = moveDir.clone(); fwdFlat.y = 0; fwdFlat.normalize();
    const range   = isSword ? 3.2 : (isKick ? 2.4 : 2.15);
    const ARC_COS = isSword ? -0.10 : 0.35;   // sword ~107° meia-abertura, soco/chute ~70°
    const _inFront = (targetPos) => {
      const to = targetPos.subtract(currentPos); to.y = 0;
      const d = to.length();
      if (d > range) return false;
      return BABYLON.Vector3.Dot(to.normalize(), fwdFlat) > ARC_COS;
    };

    scene.meshes.forEach(m => {
      if (!m.isEnabled()) return;

      // ── REMOTE PROP (server-authoritative — barril/caixa) ──────────
      if (m._isRemoteProp && m._propRef && !m._propRef.broken && !hitEnemies.has(m._propRef)) {
        if (activeHitbox.intersectsMesh(m, false) || _inFront(m.getAbsolutePosition())) {
          hitSomething = true;
          hitEnemies.add(m._propRef);
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, this._surfaceOf(m, m._propRef)); this._hitLanded = true; }
          window._cs?.sendHitProp?.(m._propRef.id, animName);
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            this.impactSystem.spawnPunchImpact(ip, true);
          }
          window._hitStop?.hit(0.04);
        }
        return;
      }

      // ── REMOTE MOB (server-authoritative) ───────────────────────────
      //  Hit em mob remoto → manda mob_id + dmg pro Colyseus.
      //  Servidor valida e broadcasta hp update.
      if (m._isRemoteMob && m._mobRef && !hitEnemies.has(m._mobRef)) {
        if (activeHitbox.intersectsMesh(m, false) || _inFront(m.getAbsolutePosition())) {
          hitSomething = true;
          hitEnemies.add(m._mobRef);
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, 'flesh'); this._hitLanded = true; }
          this._notifyPlayerMeleeHit(critLevel, false);
          window._cs?.sendHitMob?.(m._mobRef.id, dmgEff, animName);
          window._dmgNumbers?.spawn(m.getAbsolutePosition(), dmgEff, { crit: isCrit });
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            if (isKick) this.impactSystem.spawnKickImpact(ip, true);
            else        this.impactSystem.spawnPunchImpact(ip, true);
          }
          if (window._bloodFX) {
            const bp = m.getAbsolutePosition().add(new BABYLON.Vector3(0, 0.8, 0));
            window._bloodFX.spawn(bp, moveDir, {
              multiplier: hitDef.melee === 'sword' ? 1.8 : 1.0,
              sourceNode: m,
              isHeavy: hitDef.melee === 'sword',
            });
          }
          if (critLevel >= 1) window._hitStop?.hit(0.10, { zoom: 0.08, flash: 0.25 });
          else window._hitStop?.hit(0.035);
        }
        return;
      }

      // ── REMOTE PLAYER (PvP) ─────────────────────────────────────────
      //  Se for capsule de outro player → manda hit pelo MP relay.
      //  Cliente local NÃO aplica dano direto: relay propaga pro alvo
      //  que sente takeDamage no próprio cliente (server-authority light).
      if (m._isRemotePlayer && m._remoteRef && !hitEnemies.has(m._remoteRef)) {
        if (activeHitbox.intersectsMesh(m, false) || _inFront(m.getAbsolutePosition())) {
          hitSomething = true;
          hitEnemies.add(m._remoteRef);
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, 'flesh'); this._hitLanded = true; }
          this._notifyPlayerMeleeHit(critLevel, false);
          // Envia hit via MP — o cliente-alvo recebe e aplica dano local.
          // launch = CHUTE ou CRIT → server arremessa o alvo (knockback forte
          // + pra cima). Sem isso chute/crit só empurravam de leve.
          const _launch = !!isKick || (critLevel || 0) >= 1;
          window._cs?.sendHitPlayer?.(m._remoteRef.playerId, dmgEff, animName, _launch);
          // Damage number visual no cliente que atacou (feedback imediato)
          window._dmgNumbers?.spawn(m.getAbsolutePosition(), dmgEff, { crit: isCrit });
          // HITMARKER imediato no crosshair do atacante (escala por dano — item 24).
          window._hitMarker?.hit({ dmg: dmgEff, crit: isCrit });
          // KNOCKBACK + flinch PREDITIVO no player remoto (lado do atacante):
          //  empurrão visual na direção do golpe usando o kbEff já calculado
          //  (mesmo do PvE). É cosmético — o snapshot do server reconverge a
          //  posição no próximo tick, sem desync. Dá o IMPACTO que faltava.
          try { m._remoteRef.playHit?.(moveDir, kbEff, critLevel); } catch (_) {}
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            if (isKick) this.impactSystem.spawnKickImpact(ip, true);
            else        this.impactSystem.spawnPunchImpact(ip, true);
          }
          // Sangue
          if (window._bloodFX) {
            const enemyPos = m.getAbsolutePosition();
            const impactPos = activeHitbox.getAbsolutePosition();
            const bloodPos = new BABYLON.Vector3(
              (impactPos.x + enemyPos.x) / 2,
              (impactPos.y + enemyPos.y) / 2 + 0.3,
              (impactPos.z + enemyPos.z) / 2,
            );
            window._bloodFX.spawn(bloodPos, moveDir, {
              multiplier: hitDef.melee === 'sword' ? 2.0 : (critLevel >= 2 ? 1.6 : 1.0),
              sourceNode: m,
              isHeavy: hitDef.melee === 'sword' || critLevel >= 2,
            });
          }
          // Hit-stop leve
          if (critLevel >= 1) window._hitStop?.hit(0.10, { zoom: 0.08, flash: 0.25 });
          else window._hitStop?.hit(0.035);
        }
        return;
      }

      // ── Inimigos ────────────────────────────────────────────────────
      if (m._enemyRef && m._enemyRef.hp > 0 && !hitEnemies.has(m._enemyRef)) {
        // hitbox precisa OU alcance frontal (mais tolerante)
        if (activeHitbox.intersectsMesh(m, false) || _inFront(m.getAbsolutePosition())) {
          hitSomething = true;
          const enemy = m._enemyRef;
          hitEnemies.add(enemy);
          // "launch" = só o CHUTE forte que lança longe (não soco, não crit normal).
          //  É o que dispara o som espacial do cara voando.
          const launch = isKick && critLevel >= 1;
          const _hpBefore = enemy.hp;
          enemy.takeDamage(dmgEff, moveDir, kbEff, launch, getLocalCombatTarget(this.playerMesh));
          const _killed = _hpBefore > 0 && enemy.hp <= 0;
          // Overkill: golpe LETAL onde o dano supera a vida restante com folga.
          const _overkill = _killed && dmgEff >= _hpBefore * 1.5;
          // ── Player hooks (itens 15 & 25) ───────────────────────────
          //  Melee local conectou → trava ação do player brevemente (hitstun)
          //  e, se foi golpe letal, dispara o slow-mo de morte. Chamados
          //  GUARDADOS (?.): o Player de outro agente pode ainda não tê-los.
          this._notifyPlayerMeleeHit(critLevel, _killed);
          // Som de IMPACTO (só uma vez por golpe, mesmo acertando vários)
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, 'flesh'); this._hitLanded = true; }
          const impactPos = activeHitbox.getAbsolutePosition().clone();
          if (this.impactSystem) {
            if (isKick) this.impactSystem.spawnKickImpact(impactPos, true);
            else        this.impactSystem.spawnPunchImpact(impactPos, true);
          }
          // SANGUE: espada/crítico = jato pesado; soco normal = leve
          if (window._bloodFX) {
            const enemyPos = m.getAbsolutePosition();
            const bloodPos = new BABYLON.Vector3(
              (impactPos.x + enemyPos.x) / 2,
              (impactPos.y + enemyPos.y) / 2 + 0.3,
              (impactPos.z + enemyPos.z) / 2,
            );
            const isSword = hitDef.melee === 'sword';
            window._bloodFX.spawn(bloodPos, moveDir, {
              multiplier: isSword ? 2.0 : (critLevel >= 2 ? 1.6 : critLevel === 1 ? 1.2 : 1.0),
              sourceNode: m,
              isHeavy: isSword || critLevel >= 2,
            });
          }
          // Número de dano flutuante (crit = vermelho · overkill = marca letal)
          window._dmgNumbers?.spawn(m.getAbsolutePosition(), dmgEff, { crit: isCrit, overkill: _overkill });
          // HITMARKER no crosshair (confirmação + tier por dano/kill — item 24)
          window._hitMarker?.hit({ dmg: dmgEff, crit: isCrit, kill: _killed });
          // ── Hit-stop ESCALADO por crit + COMBO + ESPADA (itens 16/17/28) ──
          //  comboTier (0..1) e a espada empurram o freeze pra cima → o impacto
          //  "ganha peso" conforme o combo cresce e com a arma pesada.
          const _swordBoost = isSwordHit ? 1.0 : 0;
          if (critLevel >= 2) {
            // super crit + espada → freeze pesadão (~0.22s)
            window._hitStop?.hit(0.14 + comboTier * 0.05 + _swordBoost * 0.08, { zoom: 0.14, flash: 0.45 });
          } else if (critLevel === 1) {
            // sword crit ~0.20s (item 17): base 0.10 + boost 0.10 da espada
            window._hitStop?.hit(0.10 + comboTier * 0.04 + _swordBoost * 0.10, { zoom: 0.09 + comboTier * 0.02, flash: 0.30 });
          } else {
            window._hitStop?.hit(0.035 + comboTier * 0.03 + _swordBoost * 0.03, comboTier > 0.5 ? { zoom: 0.03, flash: 0.12 } : {});
          }
        }
        return;
      }

      // ── Objeto QUEBRÁVEL do mundo (sandbox: rachar→quebrar→dropar) ──
      const brk = m._breakable;
      if (brk && !brk.broken && !hitPhysics.has(brk)) {
        if (activeHitbox.intersectsMesh(m, false) || _inFront(m.getAbsolutePosition())) {
          hitSomething = true;
          hitPhysics.add(brk);   // não conta 2x no mesmo objeto/golpe
          brk.hit();
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, this._surfaceOf(m, brk)); this._hitLanded = true; }
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            if (isKick) this.impactSystem.spawnKickImpact(ip, true);
            else        this.impactSystem.spawnPunchImpact(ip, true);
          }
          window._hitStop?.hit(0.04);
        }
        return;
      }

      // ── Objetos FÍSICOS (soco/chute empurram e quebram) ──────────────
      const go = m._gameObject;
      if (go && go.hasPhysics && !go._broken && !go._collected && !hitPhysics.has(go)) {
        const goPos = (go._usesHavok && go._havok?.mesh) ? go._havok.mesh.getAbsolutePosition() : m.getAbsolutePosition();
        if (activeHitbox.intersectsMesh(m, false) || _inFront(goPos)) {
          hitSomething = true;
          hitPhysics.add(go);
          // Impulso forte na direção do golpe + leve "pra cima" (sensação de pancada).
          // Chute = mais forte que soco.
          const power = kbEff * (isKick ? 11 : 7);
          const force = moveDir.scale(power);
          force.y += isKick ? 4 : 2.5;
          go.applyImpulse(force, activeHitbox.getAbsolutePosition());
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel, this._surfaceOf(m, go)); this._hitLanded = true; }
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            if (isKick) this.impactSystem.spawnKickImpact(ip, true);
            else        this.impactSystem.spawnPunchImpact(ip, true);
          }
        }
      }
    });

    // Se não bateu em nenhum inimigo, checa o cenário
    if (!hitSomething) {
      const rayOrigin = currentPos.clone();
      rayOrigin.y += 1.0; 
      const ray = new BABYLON.Ray(rayOrigin, moveDir, 2.5);
      
      const hit = scene.pickWithRay(ray, m => {
        return m.isEnabled() && 
               m.isPickable && 
               m !== this.playerMesh && 
               m.parent !== this.playerMesh &&
               !m.name.startsWith('hit') && 
               !m.name.startsWith('tracer') && 
               !m.name.startsWith('muzzle') &&
               !m.name.startsWith('gun') &&
               !m.name.startsWith('spark');
      });

      if (hit?.hit && hit.pickedPoint) {
        if (this.impactSystem) {
          if (isKick) {
            this.impactSystem.spawnKickImpact(hit.pickedPoint, true);
          } else {
            this.impactSystem.spawnPunchImpact(hit.pickedPoint, true);
          }
        }

        // ── WALL KICK com espada (estilo The Duel) ──
        //  Espada acertando parede estática → empurrão curto pra CIMA +
        //  leve recuo. NÃO afasta longe (preserva proximidade pra dash).
        //  Recarrega o ar-dash também (skill de "subir parede picando").
        if (hitDef.melee === 'sword') {
          const m = hit.pickedMesh;
          const isWall = m && (
            m._isWall ||
            /^(wall|alley|spdAlley|wj_zig|dash_arch|sus_|ramp_|bump_)/.test(m.name || '')
          );
          if (isWall) {
            const pl = this.playerMesh?._playerRef;
            if (pl) {
              // KB curto: empurra player levemente PRA TRÁS + impulso vertical
              const backDir = moveDir.clone().scale(-1);
              const verticalKick = pl.isGrounded ? 7 : 10;
              pl.velY = Math.max(pl.velY, verticalKick);
              pl._vx += backDir.x * 4;     // recuo leve (preserva dash de volta)
              pl._vz += backDir.z * 4;
              // Recarrega 1 air-dash (skill cap pra "escalar" com espada)
              if (pl._airDashesLeft != null && pl._airDashesLeft < pl.AIR_DASH_MAX) {
                pl._airDashesLeft = Math.min(pl.AIR_DASH_MAX, pl._airDashesLeft + 1);
              }
              // som de impacto metálico/parede (reusa swing como base)
              pl.sounds?.playNow?.('swing_3', 0.5);
              window._hitStop?.hit(0.06, { zoom: 0.05 });
            }
          }
        }
      }
    }
  }

  // ── Hooks no Player local (itens 15 & 25) ────────────────────────
  //  Chamado quando um melee LOCAL conecta. Trava a ação do player por um
  //  curto hitstun (feel de "peso"); num golpe LETAL dispara o slow-mo de
  //  morte + um micro hitstop/zoom extra. Tudo GUARDADO: se o Player (outro
  //  agente) ainda não expôs esses métodos, nada acontece (sem quebrar).
  //
  //  WIRING: o player local é alcançado por this.playerMesh._playerRef
  //  (mesmo ref usado em _applyHit p/ câmera/sons). Se um dia esse ref não
  //  existir, o no-op silencioso mantém o combate funcionando.
  _notifyPlayerMeleeHit(critLevel = 0, killed = false) {
    const pl = this.playerMesh?._playerRef;
    if (!pl) return;
    try {
      // Hitstun do player: 150ms normal, ~280ms em crit (lock breve de ação).
      const ms = critLevel >= 2 ? 280 : critLevel === 1 ? 220 : 150;
      pl.applyHitstun?.(ms);
    } catch (_) {}
    if (killed) {
      try { pl.triggerDeathSlowmo?.(); } catch (_) {}
      // Beat extra de impacto no abate (independente do slow-mo do player).
      try { window._hitStop?.hit(0.12, { zoom: 0.10, flash: 0.30 }); } catch (_) {}
    }
  }

  // ── Classifica a superfície de um mesh para o som de impacto (item 22) ──
  //  flesh (inimigo/player) · metal · wood · stone. Usa flags do gameobject
  //  e heurística por nome (barril/caixa/madeira/metal). Default: stone.
  _surfaceOf(mesh, ref) {
    try {
      const tag = (ref?.material || ref?.surface || ref?.type || mesh?.name || '').toString().toLowerCase();
      if (/wood|madeira|crate|caixa|barrel|barril|plank|box/.test(tag)) return 'wood';
      if (/metal|steel|iron|aço|aco|ferro|tin|drum|tank/.test(tag))     return 'metal';
      if (/stone|rock|pedra|concrete|concreto|brick|tijolo/.test(tag))  return 'stone';
      return 'metal';   // props genéricos soam metálicos por padrão
    } catch (_) { return 'metal'; }
  }

  _onAttackFinish() {
    this._currentAttackAnim = null;
    const nextType = this.comboSystem.consumeBuffer();
    if (nextType) {
      this._executeAttack(nextType);
    } else {
      this.comboSystem.reset();
      this.stateMachine.setState("unarmed");
      this.animController.play("idle", { loop: true });
    }
  }

  resetCombo() {
    this.comboSystem.reset();
    this.stateMachine.setState("unarmed");
  }
}

function getLocalCombatTarget(playerMesh) {
  const player = playerMesh?._playerRef || window._gamePlayer || null;
  const position = player?.animator?.root?.absolutePosition
    ?? player?.mesh?.position
    ?? playerMesh?.absolutePosition
    ?? playerMesh?.position
    ?? null;
  if (!position) return null;
  return {
    id: 'local-player',
    kind: 'local',
    position,
    actor: player,
    canBeHit: true,
    receiveDamage: (dmg, attackType, fromPos, kbForce = 0) => {
      player?.takeDamage?.(dmg, attackType, fromPos, kbForce);
    },
  };
}
