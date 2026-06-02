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

  heavyAttack() {
    // Futuro: ataque carregado (hold RMB > 0.8s)
    console.log("Heavy attack — em desenvolvimento");
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
    this._playSwingSound(attackAnim);

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
    const cancelAt = lastHitTime + 40;   // abre logo após o impacto
    this._cancelTimer = setTimeout(() => {
      if (token !== this._comboToken) return;
      if (!this.stateMachine.isAttacking()) return;
      this._canCancel = true;
      const next = this.comboSystem.consumeBuffer();
      if (next) this._executeAttack(next);   // já tem clique na fila → encadeia
    }, cancelAt);

    // ── SAFETY: garante que o ataque termina ────────────────────────
    // O onComplete do AnimationGroup às vezes não dispara → o personagem
    // ficava TRAVADO em "attacking" pra sempre. Este timeout força o fim.
    const animDur = (this.animController.getDuration?.(attackAnim) ?? 0.7) / speed;
    clearTimeout(this._finishSafety);
    this._finishSafety = setTimeout(() => {
      if (token === this._comboToken && this.stateMachine.isAttacking()) {
        this._onAttackFinish();
      }
    }, Math.max(250, animDur * 1000 + 120));
  }

  // Som de SWING (golpe cortando o ar) — toca ao iniciar o golpe. Rotaciona
  // ataque 1/2/3 pra não ficar repetitivo no combo.
  _playSwingSound(animName) {
    const snd = this.playerMesh?._playerRef?.sounds;
    if (!snd) return;
    this._swingIdx = ((this._swingIdx || 0) % 3) + 1;
    snd.playNow('swing_' + this._swingIdx, 0.5);
  }

  // Som de IMPACTO (acertou alguém). Combo normal → som CONSISTENTE; só o
  // CRÍTICO (golpe pesado) troca pro som especial. Chamado só ao CONECTAR.
  // critLevel: 0 normal · 1 crítico · 2 super crítico
  _playImpactSound(isKick, critLevel = 0) {
    const snd = this.playerMesh?._playerRef?.sounds;
    if (!snd) return;
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

    // Força efetiva: num crit garante o "voar longe" mesmo num golpe leve.
    const kbEff = critLevel === 2 ? Math.max(baseKb, 5.5)
                : critLevel === 1 ? Math.max(baseKb, 4.5)
                : baseKb;

    const activeHitbox = this.limbHitboxes[hitDef.bone] || this.limbHitboxes['RightHand'];
    
    // Anexa as hitboxes aos ossos reais do Animator copiando a Posição Absoluta
    // Mantemos as caixas parentadas à cena (null) ou ao playerMesh para não herdar distorções/escalas de ossos,
    // mas forçamos elas a ficarem exatamente onde o osso está no espaço 3D real.
    let socket = null;
    if (this.playerMesh._playerRef && this.playerMesh._playerRef.animator) {
      socket = this.playerMesh._playerRef.animator.getSocketNode(hitDef.bone);
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

    // Direção do golpe = pra ONDE O PLAYER OLHA (yaw). O capsule tem rotação
    // travada em 0, então getDirection(Forward) dava sempre +Z mundo (errado).
    // Usamos o yaw real → soco/chute vão na direção da câmera.
    const _pl = this.playerMesh._playerRef;
    const yawRad = BABYLON.Tools.ToRadians(_pl?.yaw ?? 0);
    const moveDir = new BABYLON.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));

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
          enemy.takeDamage(hitDef.damage, moveDir, kbEff, launch);
          // Som de IMPACTO (só uma vez por golpe, mesmo acertando vários)
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel); this._hitLanded = true; }
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
          // Número de dano flutuante (crit = vermelho)
          window._dmgNumbers?.spawn(m.getAbsolutePosition(), hitDef.damage, { crit: isCrit });
          // Hit-stop escalado: micro no normal · forte no crit · mais no super.
          if (critLevel >= 2)      window._hitStop?.hit(0.14, { zoom: 0.13, flash: 0.42 });
          else if (critLevel === 1) window._hitStop?.hit(0.10, { zoom: 0.09, flash: 0.30 });
          else                      window._hitStop?.hit(0.035);
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
          if (!this._hitLanded) { this._playImpactSound(isKick, critLevel); this._hitLanded = true; }
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
