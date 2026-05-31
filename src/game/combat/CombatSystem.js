export class CombatSystem {
  constructor(animController, stateMachine, comboSystem, impactSystem, playerMesh) {
    this.animController = animController;
    this.stateMachine = stateMachine;
    this.comboSystem = comboSystem;
    this.impactSystem = impactSystem;
    this.playerMesh = playerMesh;

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
      roundhouse:     { hits: [{ hitTime: 0.22, damage: 45, bone: 'RightFoot', kb: 3.5 }], comboWindow: 0.60 },
      side_kick:      { hits: [{ hitTime: 0.18, damage: 35, bone: 'RightFoot', kb: 2.8 }], comboWindow: 0.50 },
      leg_sweep:      { hits: [{ hitTime: 0.25, damage: 28, bone: 'RightFoot', kb: 1.5 }], comboWindow: 0.45 }, // derruba
      inside_crescent:{ hits: [{ hitTime: 0.20, damage: 38, bone: 'RightFoot', kb: 3.0 }], comboWindow: 0.55 },
      armada:         { hits: [{ hitTime: 0.22, damage: 42, bone: 'RightFoot', kb: 3.2 }], comboWindow: 0.60 },
      martelo:        { hits: [{ hitTime: 0.18, damage: 40, bone: 'RightFoot', kb: 3.8 }], comboWindow: 0.55 },
      pontera:        { hits: [{ hitTime: 0.20, damage: 35, bone: 'LeftFoot',  kb: 2.8 }], comboWindow: 0.50 },
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
      this.comboSystem.registerPunch();
      return;
    }
    if (!this.stateMachine.canAttack()) return;
    this._executeAttack('punch');
  }

  kickAttack() {
    if (this.stateMachine.isAttacking()) {
      this.comboSystem.registerKick();
      return;
    }
    if (!this.stateMachine.canAttack()) return;
    this._executeAttack('kick');
  }

  heavyAttack() {
    // Futuro: ataque carregado (hold RMB > 0.8s)
    console.log("Heavy attack — em desenvolvimento");
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
      attackAnim = type === 'kick'
        ? this.comboSystem.getNextKick()
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
    this._executeNextAttack(attackAnim, data, speed);
  }

  _executeNextAttack(attackAnim, data, speed = 3.4) {
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

    // Timing de cada hit (escala com a velocidade da animação)
    let lastHitTime = 0;
    data.hits.forEach(hitDef => {
      const t = (hitDef.hitTime / speed) * 1000;
      lastHitTime = Math.max(lastHitTime, t);
      setTimeout(() => {
        if (token === this._comboToken && this.stateMachine.isAttacking()) {
          this._applyHit(hitDef, attackAnim);
        }
      }, t);
    });

    // ── Janela de cancelamento (cancel window) ──────────────────────
    // Logo após o último hit conectar, se houver input no buffer já
    // parte pro próximo golpe SEM esperar a animação inteira terminar.
    // É isso que dá o ritmo seco/rápido de Dragon Ball.
    const cancelAt = lastHitTime + 70;   // 70ms de "active frames" após o hit
    this._cancelTimer = setTimeout(() => {
      if (token !== this._comboToken) return;
      if (!this.stateMachine.isAttacking()) return;
      const next = this.comboSystem.consumeBuffer();
      if (next) this._executeAttack(next);   // encadeia imediatamente
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

  _applyHit(hitDef, animName) {
    if (!this.playerMesh) return;
    
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
    const fwdFlat = moveDir.clone(); fwdFlat.y = 0; fwdFlat.normalize();
    const range   = animName.includes('kick') ? 2.4 : 1.9;
    const ARC_COS = 0.35;   // ~70° de meia-abertura
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
          enemy.takeDamage(hitDef.damage, moveDir, hitDef.kb || 1.0);
          const impactPos = activeHitbox.getAbsolutePosition().clone();
          if (this.impactSystem) {
            if (animName.includes('punch')) this.impactSystem.spawnPunchImpact(impactPos, true);
            else                            this.impactSystem.spawnKickImpact(impactPos, true);
          }
          console.log(`[Colisão Física - ${hitDef.bone}] POW! Dano: ${hitDef.damage}`);
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
          const power = (hitDef.kb || 1) * (animName.includes('kick') ? 11 : 7);
          const force = moveDir.scale(power);
          force.y += animName.includes('kick') ? 4 : 2.5;
          go.applyImpulse(force, activeHitbox.getAbsolutePosition());
          if (this.impactSystem) {
            const ip = activeHitbox.getAbsolutePosition().clone();
            if (animName.includes('punch')) this.impactSystem.spawnPunchImpact(ip, true);
            else                            this.impactSystem.spawnKickImpact(ip, true);
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
          if (animName.includes("punch")) {
            this.impactSystem.spawnPunchImpact(hit.pickedPoint, true);
          } else {
            this.impactSystem.spawnKickImpact(hit.pickedPoint, true);
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
