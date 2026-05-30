// ─────────────────────────────────────────────────────────────────
//  Enemy.js — MonsterPlant com hop-movement
// ─────────────────────────────────────────────────────────────────

let _uid = 0;

export const HopState = Object.freeze({
  WAIT:         'WAIT',
  CROUCH:       'CROUCH',       // hop normal windup
  AIR:          'AIR',          // hop normal em voo
  LAND:         'LAND',         // aterrissagem hop normal
  BITE_WINDUP:  'BITE_WINDUP',  // 1ª habilidade: preparar mordida
  BITE_STRIKE:  'BITE_STRIKE',  // avanço da mordida
  BITE_RECOVER: 'BITE_RECOVER', // recuperação pós-mordida
  QUICK_BITE:   'QUICK_BITE',   // ataque rápido parado
  SLAM_WINDUP:  'SLAM_WINDUP',  // 2ª habilidade: preparar slam
  SLAM_AIR:     'SLAM_AIR',     // grande salto do slam
  SLAM_LAND:    'SLAM_LAND',    // impacto + efeitos
  DYING:        'DYING',
  DEAD:         'DEAD',
});

export class MonsterPlant {
  constructor(scene, shadowGen, glbMeshes, position) {
    this.scene     = scene;
    this.shadowGen = shadowGen;

    // ── Stats ─────────────────────────────────────────────────────
    this.hp    = 100;
    this.maxHp = 100;
    this.alive = true;

    // ── Ataque básico (morder em contato) ────────────────────────
    this.ATTACK_RANGE  = 2.8;
    this.ATTACK_DAMAGE = 20;
    this.ATTACK_CD     = 2.0;
    this._attackT      = 1.5;

    // ── Hitbox de contato (cabeçada/mordida) ─────────────────────
    // A cabeça da planta precisa TOCAR fisicamente o corpo do player.
    // HEAD_HEIGHT  = altura da boca em world units
    // HEAD_REACH   = quanto a boca avança à frente do pivot
    // HEAD_HIT_RADIUS = raio da esfera da cabeça
    // BODY_HIT_RADIUS = raio aproximado do corpo do player
    this.HEAD_HEIGHT     = 3.2;   // boca fica aprox. 3.2m acima do pivot
    this.HEAD_REACH      = 2.2;   // avança 2.2m à frente
    this.HEAD_HIT_RADIUS = 1.0;   // esfera da cabeça
    this.BODY_HIT_RADIUS = 0.85;  // cápsula do player

    this._hitDealtThisSwing = false; // evita múltiplos danos por swing

    // ── 1ª habilidade: Mordida (bite) ─────────────────────────────
    // Rápida: encolhe, avança e morde em range curto
    this.BITE_RANGE    = 3.5;
    this.BITE_DAMAGE   = 18;
    this.BITE_CD       = 3.5;
    this._biteT        = 2.5;   // cooldown inicial

    // ── 2ª habilidade: Salto-impacto (slam) ──────────────────────
    // Salta alto, esmaga o chão, cria anel de choque + fumaça
    this.SLAM_RANGE_MIN = 4.0;
    this.SLAM_RANGE_MAX = 20.0;
    this.SLAM_DAMAGE    = 32;
    this.SLAM_RADIUS    = 3.8;   // raio de dano na aterrissagem
    this.SLAM_CD        = 8.0;
    this._slamT         = 6.0;   // cooldown inicial
    this._slamTargetPos = null;  // posição alvo do slam

    // ── Hop ───────────────────────────────────────────────────────
    this.HOP_DIST     = 5.5;
    this.HOP_HEIGHT   = 1.8;
    this.HOP_CD       = 1.9;
    this.HOP_CD_AGGRO = 0.55;
    this.HOP_GRAVITY  = 30;

    this._hopState = HopState.WAIT;
    // ▶ DESYNC: cada planta começa em fase aleatória do cooldown
    this._hopT     = 0.3 + Math.random() * this.HOP_CD;
    this._aggroT   = 0;

    this._vx = 0; this._vy = 0; this._vz = 0;
    this._groundY  = position.y;
    this._spawnPos = position.clone();   // guardado para reset no respawn

    // ── Knockback ────────────────────────────────────────────────
    this._kbX = 0; this._kbZ = 0; this._kbY = 0;

    // ── Visual ────────────────────────────────────────────────────
    this.BASE_SCALE = 0.010;
    this._flashT    = 0;
    this._deathT    = 0;
    this.DEATH_DUR  = 1.6;

    this.onAttack     = null;
    this.onPlaySound  = null;   // (id: string) => void — chamado pelo Level.js

    this._buildMesh(glbMeshes, position);
    this._buildHealthBar();
    this._buildBlobShadow();
  }

  // ── Cria mesh clonada ───────────────────────────────────────────
  _buildMesh(glbMeshes, position) {
    const uid     = _uid++;
    const glbRoot = glbMeshes[0];

    this.root = glbRoot.clone(`plant_${uid}`, null, false);
    if (!this.root) { console.warn('[MonsterPlant] clone falhou'); return; }

    this.root.position = position.clone();
    this.root.scaling.setAll(this.BASE_SCALE);
    // GLBs importados têm rotationQuaternion setado — isso BLOQUEIA rotation.euler.
    // Zeramos o quaternion para que root.rotation.y funcione normalmente.
    this.root.rotationQuaternion = null;
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.root.setEnabled(true);
    this.shadowGen?.addShadowCaster(this.root, true);

    this._childMeshes = this.root.getChildMeshes(false);
    // console.log(`[MonsterPlant] Meshes:`, this._childMeshes.map(m => m.name));
    
    // Tenta identificar mandíbulas para animação
    this._upperJaw = this._childMeshes.find(m => m.name.toLowerCase().includes('upper') || m.name.toLowerCase().includes('top'));
    this._lowerJaw = this._childMeshes.find(m => m.name.toLowerCase().includes('lower') || m.name.toLowerCase().includes('bottom') || m.name.toLowerCase().includes('jaw'));

    for (const m of this._childMeshes) {
      if (m.material) m.material = m.material.clone(`${m.material.name}_p${uid}`);
      m._enemyRef  = this;
      m.isPickable = true;
      // m.showBoundingBox = true; // Descomente para ver a hitbox real do Babylon
    }
    if (!this._childMeshes.length) {
      this.root._enemyRef  = this;
      this.root.isPickable = true;
      // this.root.showBoundingBox = true;
      this._childMeshes    = [this.root];
    }
  }

  // ── HP bar + nome (planos 3D, billboard manual) ─────────────────
  _buildHealthBar() {
    if (!this.root) return;

    const BAR_W    = 2.4;   // largura da barra em world units
    const BAR_H    = 0.28;  // altura
    const LABEL_H  = 0.45;  // altura do label de nome
    this._hpW      = BAR_W;
    this._HP_OFF_Y = 6.2;   // metros acima do pivot — planta mede ~5.2u, barra fica 1u acima

    const mkPlane = (name, w, h, color) => {
      const p   = BABYLON.MeshBuilder.CreatePlane(name, { width: w, height: h }, this.scene);
      p.isPickable = false;
      const mat = new BABYLON.StandardMaterial(name + 'M', this.scene);
      mat.diffuseColor    = color;
      mat.emissiveColor   = color;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      p.material = mat;
      return p;
    };

    // Fundo cinza escuro
    this._hpBg = mkPlane(
      `hpBg_${this.root.name}`, BAR_W, BAR_H,
      new BABYLON.Color3(0.12, 0.12, 0.12)
    );

    // Preenchimento verde
    this._hpFg = mkPlane(
      `hpFg_${this.root.name}`, BAR_W, BAR_H - 0.06,
      new BABYLON.Color3(0.1, 0.9, 0.2)
    );
    this._hpMat = this._hpFg.material;

    // ── Label com nome via DynamicTexture ─────────────────────────
    const texW = 512, texH = 64;
    const tex  = new BABYLON.DynamicTexture(
      `plantNameTex_${this.root.name}`,
      { width: texW, height: texH },
      this.scene, false
    );
    tex.hasAlpha = true;

    const ctx = tex.getContext();
    ctx.clearRect(0, 0, texW, texH);

    // Fundo semitransparente arredondado
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(4, 4, texW - 8, texH - 8, 12);
    ctx.fill();

    // Texto
    ctx.font        = 'bold 28px Arial';
    ctx.fillStyle   = '#33ff88';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌱 Planta Monstro', texW / 2, texH / 2);
    tex.update();

    const labelPlane = BABYLON.MeshBuilder.CreatePlane(
      `plantLabel_${this.root.name}`,
      { width: BAR_W * 1.3, height: LABEL_H },
      this.scene
    );
    labelPlane.isPickable = false;
    const lMat = new BABYLON.StandardMaterial(`plantLabelM_${this.root.name}`, this.scene);
    lMat.diffuseTexture    = tex;
    lMat.emissiveTexture   = tex;
    lMat.disableLighting   = true;
    lMat.backFaceCulling   = false;
    labelPlane.material    = lMat;
    lMat.diffuseTexture.uScale = -1; // flip U to correct mirroring on back-face-rendered plane

    this._hpLabel = labelPlane;
  }

  // ── Sombra blob no chão ──────────────────────────────────────────
  _buildBlobShadow() {
    const s = BABYLON.MeshBuilder.CreateDisc(
      `shadow_${this.root?.name}`,
      { radius: 0.5, tessellation: 12 }, this.scene
    );
    s.rotation.x = Math.PI / 2;
    s.isPickable = false;
    const mat = new BABYLON.StandardMaterial('', this.scene);
    mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
    mat.alpha = 0.35;
    s.material = mat;
    this._shadow = s;
  }

  // ── Toma dano ─────────────────────────────────────────────────────
  takeDamage(amount, fromDir = null, kbMult = 1.0) {
    if (!this.alive) return;

    this.hp       = Math.max(0, this.hp - amount);
    this._flashT  = 0.20;
    this.onPlaySound?.('plant_damage');

    // ── Hitstun (Interrompe e atrasa ataques) ───────────────────
    this._attackT = Math.max(this._attackT, 1.0); // Adiciona 1 seg de delay pro ataque base
    this._biteT   = Math.max(this._biteT, 1.5);
    this._slamT   = Math.max(this._slamT, 2.0);

    // Cancela cast de habilidades se estiver apanhando
    if (this._hopState === HopState.CROUCH || 
        this._hopState === HopState.BITE_WINDUP || 
        this._hopState === HopState.SLAM_WINDUP) {
        this._hopState = HopState.WAIT;
        this._hopT = 0.5; // Fica tonto meio segundo antes de pular de novo
    }

    if (fromDir) {
      // Força de repulsão baseada no dano
      // Soco = 15 de dano, Chute = 50.
      const f       = amount * 0.60 * kbMult; // Dobrei a força base para sentir mais o impacto e adicionei o mult
      const n       = fromDir.normalize();
      
      // Removido o sinal negativo para empurrar NA DIREÇÃO do soco
      this._kbX     = n.x * f;
      this._kbZ     = n.z * f;
      this._kbY     = amount * 0.15 * kbMult; // Joga um pouquinho pra cima no ar
    }

    this._aggroT = 4.0;
    if (this._hopState === HopState.WAIT) {
      this._hopT = Math.min(this._hopT, 0.25);
    }

    if (this.hp <= 0) {
      this.alive     = false;
      this._deathT   = this.DEATH_DUR;
      this._hopState = HopState.DYING;
      this.onPlaySound?.('plant_death');
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  update(dt, playerPos, cameraPos) {
    if (!this.root || this._hopState === HopState.DEAD) return false;

    const pos = this.root.position;

    if (this._flashT  > 0) this._flashT  -= dt;
    if (this._aggroT  > 0) this._aggroT  -= dt;
    if (this._attackT > 0) this._attackT -= dt;
    if (this._biteT   > 0) this._biteT   -= dt;
    if (this._slamT   > 0) this._slamT   -= dt;

    // ── Morte ─────────────────────────────────────────────────────
    if (this._hopState === HopState.DYING) {
      this._deathT -= dt;
      const t   = 1 - (this._deathT / this.DEATH_DUR);
      this.root.rotation.z = t * Math.PI * 0.6;
      const vis = Math.max(0, this._deathT / this.DEATH_DUR);
      for (const m of this._childMeshes) m.visibility = vis;
      this._showHPBar(false);
      if (this._deathT <= 0) {
        this._hopState = HopState.DEAD;
        this._cleanup();
        return false;
      }
      return true;
    }

    // ── Knockback ────────────────────────────────────────────────
    if (Math.abs(this._kbX) + Math.abs(this._kbZ) > 0.05) {
      pos.x   += this._kbX * dt;
      pos.z   += this._kbZ * dt;
      pos.y   += this._kbY * dt;
      this._kbY -= this.HOP_GRAVITY * dt * 0.6;
      if (pos.y <= this._groundY) { pos.y = this._groundY; this._kbY = 0; }
      const drag = Math.pow(0.02, dt);
      this._kbX *= drag;
      this._kbZ *= drag;
    }

    // ── Direção e Rotação ─────────────────────────────────────────
    const dx    = playerPos.x - pos.x;
    const dz    = playerPos.z - pos.z;
    const distH = Math.sqrt(dx * dx + dz * dz);

    // Ajuste de offset do modelo: se a boca do modelo está desalinhada, compensamos aqui.
    // Pela imagem anterior, +PI/2 as deixou de costas, então o correto é -PI/2.
    const MODEL_ROT_OFFSET = -Math.PI / 2;

    let targetYaw = this.root.rotation.y;
    let isMoving  = false;

    // Se estiver em estados de movimento ativo, olha para a direção da velocidade
    if (this._hopState === HopState.AIR || 
        this._hopState === HopState.SLAM_AIR || 
        this._hopState === HopState.BITE_STRIKE) {
      const speedH = Math.sqrt(this._vx * this._vx + this._vz * this._vz);
      if (speedH > 0.1) {
        targetYaw = Math.atan2(this._vx, this._vz) + MODEL_ROT_OFFSET;
        isMoving = true;
      }
    }

    // Se não estiver em movimento de estado, ou velocidade for baixa, olha para o jogador
    if (!isMoving && this._hopState !== HopState.DYING && this._hopState !== HopState.DEAD) {
      targetYaw = Math.atan2(dx, dz) + MODEL_ROT_OFFSET;
    }

    // Suavizar rotação (interpolação circular)
    let da = targetYaw - this.root.rotation.y;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;

    // Rotação um pouco mais rápida se estiver no ar para alinhar logo no início do pulo
    const rotSpeed = isMoving ? 12 : 8;
    this.root.rotation.y += da * Math.min(1, dt * rotSpeed);

    // ── Máquina de estados ────────────────────────────────────────
    switch (this._hopState) {

      // ── Espera: escolhe próxima ação ──────────────────────────
      case HopState.WAIT: {
        this._targetScale(dt, 1.0, 1.0);
        this._hopT -= dt;

        if (this._hopT <= 0) {
          // SE ESTIVER MUITO PERTO: OBRIGATÓRIO MORDER (Não pula!)
          if (distH <= this.ATTACK_RANGE + 0.5) {
            if (this._attackT <= 0) {
              this._hopState          = HopState.QUICK_BITE;
              this._hopT              = 0.50;   // duração total do swing
              this._attackT           = this.ATTACK_CD;
              this._hitDealtThisSwing = false;  // reset: ainda não acertou
              this.onPlaySound?.('plant_attack');
            } else {
              // Se o ataque está em cooldown mas o player está colado, espera um pouco mais em vez de pular
              this._hopT = 0.2;
            }

          // SE ESTIVER NO RANGE DO BOTE LONGO
          } else if (distH <= this.BITE_RANGE && this._biteT <= 0) {
            this._hopState = HopState.BITE_WINDUP;
            this._hopT     = 0.25;

          // PRIORIDADE 2 — Slam (range médio/longo)
          } else if (distH >= this.SLAM_RANGE_MIN && distH <= this.SLAM_RANGE_MAX && this._slamT <= 0) {
            this._hopState    = HopState.SLAM_WINDUP;
            this._hopT        = 0.55;
            this._slamTargetPos = playerPos.clone();

          // SÓ PULA SE ESTIVER LONGE
          } else if (distH > this.ATTACK_RANGE + 2.0) {
            this._hopState = HopState.CROUCH;
            this._hopT     = 0.35;
          } else {
            this._hopT = 0.25;
          }
        }
        break;
      }

      // ── Hop normal ────────────────────────────────────────────
      case HopState.CROUCH: {
        this._targetScale(dt, 0.60, 1.40);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          this._launchHop(playerPos, distH);
          this._hopState = HopState.AIR;
        }
        break;
      }

      case HopState.AIR: {
        this._vy -= this.HOP_GRAVITY * dt;
        pos.x    += this._vx * dt;
        pos.y    += this._vy * dt;
        pos.z    += this._vz * dt;
        this._targetScale(dt, 1.30, 0.78);
        if (pos.y <= this._groundY && this._vy < 0) {
          pos.y          = this._groundY;
          this._vx = this._vy = this._vz = 0;
          this._hopState = HopState.LAND;
          this._hopT     = 0.18;
          if (distH <= this.ATTACK_RANGE && this._attackT <= 0) {
            this._attackT = this.ATTACK_CD;
            this.onAttack?.(this.ATTACK_DAMAGE, 'melee', pos.clone());
          }
        }
        break;
      }

      case HopState.LAND: {
        this._targetScale(dt, 0.58, 1.48);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          this._hopT     = this._aggroT > 0 ? this.HOP_CD_AGGRO : this.HOP_CD;
          this._hopState = HopState.WAIT;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────
      // 1ª Habilidade: MORDIDA (Bite)
      // Encolhe rapidamente e avança para morder o jogador
      // ────────────────────────────────────────────────────────────
      case HopState.BITE_WINDUP: {
        // Encolhe muito (preparando bote violento)
        this._targetScale(dt, 0.25, 2.10);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          this._hopState = HopState.BITE_STRIKE;
          this._hopT     = 0.10; // Bote RELÂMPAGO
          // Avança MUITO em direção ao jogador
          if (distH > 0.1) {
            const speed = 4.5 / 0.10; // Avança 4.5 unidades em 0.1s
            this._vx = (dx / distH) * speed;
            this._vz = (dz / distH) * speed;
          }
        }
        break;
      }

      case HopState.BITE_STRIKE: {
        // Estica o corpo ao limite extremo (parece um dardo)
        this._targetScale(dt, 2.80, 0.50);
        pos.x    += this._vx * dt;
        pos.z    += this._vz * dt;
        this._hopT -= dt;

        // ── Hitbox ativa durante todo o bote ────────────────────
        // Usa direção da VELOCIDADE (não do player) para a cabeça
        // pois a planta está em voo e não pode corrigir a rota
        if (!this._hitDealtThisSwing) {
          const speedH = Math.sqrt(this._vx * this._vx + this._vz * this._vz);
          const fdx    = speedH > 0.1 ? this._vx / speedH : dx / Math.max(distH, 0.01);
          const fdz    = speedH > 0.1 ? this._vz / speedH : dz / Math.max(distH, 0.01);
          const dist1  = 1; // normalizado — usamos fdx/fdz direto
          if (this._checkHeadHit(pos, playerPos, fdx * dist1, fdz * dist1, dist1)) {
            this._hitDealtThisSwing = true;
            this._biteT = this.BITE_CD;
            this.onAttack?.(this.BITE_DAMAGE, 'bite', pos.clone(), 45);
            this._spawnHitSplat(this._getHeadPos(pos, fdx, fdz, 1));
            this.onPlaySound?.('plant_attack');
          }
        }

        if (this._hopT <= 0) {
          this._vx = this._vz = 0;
          // Se não acertou: cooldown reduzido (punição por errar = planta fica mais vulnerável)
          this._biteT    = this._hitDealtThisSwing ? this.BITE_CD : this.BITE_CD * 0.45;
          this._hitDealtThisSwing = false;
          this._hopState = HopState.BITE_RECOVER;
          this._hopT     = 0.40;
        }
        break;
      }

      case HopState.BITE_RECOVER: {
        this._targetScale(dt, 1.0, 1.0);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          this._hopT     = this._aggroT > 0 ? this.HOP_CD_AGGRO : this.HOP_CD;
          this._hopState = HopState.WAIT;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────
      // QUICK_BITE: Ataque parado quando o player está colado
      // ────────────────────────────────────────────────────────────
      case HopState.QUICK_BITE: {
        this._hopT -= dt;
        const p = 1 - (this._hopT / 0.50);
        if (p < 0.25)     this._targetScale(dt, 0.75, 1.25); // prepara (encolhe)
        else if (p < 0.65)this._targetScale(dt, 1.50, 0.80); // BOTE (estica)
        else              this._targetScale(dt, 1.0, 1.0);   // retorna

        // ── Janela de hitbox: fase do bote (25%–65% do swing) ────
        if (p >= 0.25 && p < 0.65 && !this._hitDealtThisSwing) {
          if (this._checkHeadHit(pos, playerPos, dx, dz, distH)) {
            this._hitDealtThisSwing = true;
            this.onAttack?.(this.ATTACK_DAMAGE, 'melee', pos.clone(), 15);
            this._spawnHitSplat(this._getHeadPos(pos, dx, dz, distH));
            this.onPlaySound?.('plant_attack');
          }
        }

        if (this._hopT <= 0) {
          this._hitDealtThisSwing = false;
          this._hopState = HopState.WAIT;
          this._hopT     = 0.12;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────
      // 2ª Habilidade: SALTO-IMPACTO (Slam)
      // Cresce, salta alto, esmaga o chão com anel de choque
      // ────────────────────────────────────────────────────────────
      case HopState.SLAM_WINDUP: {
        // Cresce lentamente, acena de lançamento
        this._targetScale(dt, 1.40, 1.20);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          // Lança salto massivo em direção ao alvo armazenado
          this._launchSlamHop();
          this._hopState = HopState.SLAM_AIR;
        }
        break;
      }

      case HopState.SLAM_AIR: {
        this._vy -= this.HOP_GRAVITY * dt;
        pos.x    += this._vx * dt;
        pos.y    += this._vy * dt;
        pos.z    += this._vz * dt;
        this._targetScale(dt, 1.25, 0.85);
        if (pos.y <= this._groundY && this._vy < 0) {
          pos.y          = this._groundY;
          this._vx = this._vy = this._vz = 0;
          this._hopState = HopState.SLAM_LAND;
          this._hopT     = 0.50;
          // Aplica dano em área e cria efeitos visuais
          this._triggerSlamImpact(playerPos);
        }
        break;
      }

      case HopState.SLAM_LAND: {
        // Achatamento dramático pós-impacto
        this._targetScale(dt, 0.35, 1.70);
        this._hopT -= dt;
        if (this._hopT <= 0) {
          this._slamT    = this.SLAM_CD;
          this._hopT     = this._aggroT > 0 ? this.HOP_CD_AGGRO : this.HOP_CD;
          this._hopState = HopState.WAIT;
        }
        break;
      }
    }

    // ── Flash de dano ─────────────────────────────────────────────
    const flash = this._flashT > 0;
    for (const m of this._childMeshes) {
      if (m.material) {
        m.material.emissiveColor = flash
          ? new BABYLON.Color3(1.0, 0.0, 0.0)
          : new BABYLON.Color3(0.0, 0.0, 0.0);
      }
    }

    // ── Sombra blob ────────────────────────────────────────────────
    if (this._shadow) {
      this._shadow.position.set(pos.x, this._groundY + 0.01, pos.z);
      const airH  = Math.max(0, pos.y - this._groundY);
      this._shadow.scaling.setAll(Math.max(0.15, 1.0 - airH * 0.12));
    }

    // ── HP bar + label ─────────────────────────────────────────────
    this._updateHPBar(pos, cameraPos);

    // ── Animação da Boca (Jaw) ────────────────────────────────────
    this._animateMouth(dt);

    return true;
  }

  // ════════════════════════════════════════════════════════════════
  //  Hitbox de cabeça — colisão real entre a boca e o corpo do player
  // ════════════════════════════════════════════════════════════════

  /**
   * Retorna a posição world da "cabeça" (boca) da planta.
   * @param {Vector3} pos  - posição atual do root da planta
   * @param {number}  dx   - playerPos.x - pos.x  (ou direção normalizada)
   * @param {number}  dz   - playerPos.z - pos.z
   * @param {number}  distH - magnitude de (dx, dz)
   */
  _getHeadPos(pos, dx, dz, distH) {
    const len = Math.max(distH, 0.01);
    return new BABYLON.Vector3(
      pos.x + (dx / len) * this.HEAD_REACH,
      pos.y  + this.HEAD_HEIGHT,
      pos.z  + (dz / len) * this.HEAD_REACH
    );
  }

  /**
   * Verifica se a esfera da cabeça sobrepõe o corpo (cápsula) do player.
   * Retorna true se houver contato.
   */
  _checkHeadHit(pos, playerPos, dx, dz, distH) {
    const head        = this._getHeadPos(pos, dx, dz, distH);
    // Centro do torso do player (Y = player.y + 1.0)
    const playerTorso = new BABYLON.Vector3(playerPos.x, playerPos.y + 1.0, playerPos.z);
    const d           = BABYLON.Vector3.Distance(head, playerTorso);
    return d <= (this.HEAD_HIT_RADIUS + this.BODY_HIT_RADIUS);
  }

  /**
   * Efeito visual de impacto no ponto de contato da cabeçada.
   * Pequenas partículas verdes + flash rápido.
   */
  _spawnHitSplat(headPos) {
    const COUNT = 10;
    const scene = this.scene;
    const items = [];

    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const spd   = 1.5 + Math.random() * 3.0;
      const m     = BABYLON.MeshBuilder.CreateSphere(
        `hs_${Date.now()}_${i}`,
        { diameter: 0.08 + Math.random() * 0.12, segments: 2 },
        scene
      );
      m.position.copyFrom(headPos);
      m.isPickable = false;
      const mat = new BABYLON.StandardMaterial(`hsm_${Date.now()}_${i}`, scene);
      mat.emissiveColor   = new BABYLON.Color3(0.15, 0.85, 0.35);
      mat.disableLighting = true;
      mat.alpha           = 0.9;
      m.material = mat;
      items.push({
        m, mat,
        vx: Math.cos(angle) * spd * (0.6 + Math.random() * 0.4),
        vy: 1.5 + Math.random() * 2.5,
        vz: Math.sin(angle) * spd * (0.6 + Math.random() * 0.4),
        life: 0.25 + Math.random() * 0.20,
      });
    }

    let t = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt2 = scene.getEngine().getDeltaTime() / 1000;
      t += dt2;
      let alive = 0;
      for (const p of items) {
        if (t >= p.life) continue;
        alive++;
        p.m.position.x += p.vx * dt2;
        p.m.position.y += p.vy * dt2;
        p.m.position.z += p.vz * dt2;
        p.vy -= 18 * dt2;
        p.mat.alpha = 0.9 * (1 - t / p.life);
      }
      if (alive === 0) {
        scene.onBeforeRenderObservable.remove(obs);
        for (const p of items) { p.mat.dispose(); p.m.dispose(); }
      }
    });
  }

  _animateMouth(dt) {
    if (!this._upperJaw && !this._lowerJaw) return;

    let targetAngle = 0;
    
    // Define o ângulo de abertura da boca baseado no estado
    if (this._hopState === HopState.BITE_WINDUP || this._hopState === HopState.QUICK_BITE) {
      targetAngle = 0.8; // Abre bem grande
    } else if (this._hopState === HopState.BITE_STRIKE) {
      targetAngle = -0.2; // Fecha forte (mordida)
    } else if (this._hopState === HopState.SLAM_WINDUP) {
      targetAngle = 0.5; // Abre um pouco no pulo grande
    }

    const k = Math.min(1, dt * 15);
    if (this._upperJaw) {
      this._upperJaw.rotationQuaternion = null;
      this._upperJaw.rotation.x = BABYLON.Scalar.Lerp(this._upperJaw.rotation.x, -targetAngle, k);
    }
    if (this._lowerJaw) {
      this._lowerJaw.rotationQuaternion = null;
      this._lowerJaw.rotation.x = BABYLON.Scalar.Lerp(this._lowerJaw.rotation.x, targetAngle, k);
    }
  }

  // ── Lança o salto-impacto (grande salto do slam) ─────────────────
  _launchSlamHop() {
    const pos    = this.root.position;
    const target = this._slamTargetPos ?? pos;
    const dx     = target.x - pos.x;
    const dz     = target.z - pos.z;
    const distH  = Math.sqrt(dx * dx + dz * dz) || 0.01;
    const nx     = dx / distH;
    const nz     = dz / distH;

    const SLAM_HEIGHT = 3.8;  // muito mais alto que hop normal
    const hopDist     = Math.min(distH * 0.95, 14);
    const vy0         = Math.sqrt(2 * this.HOP_GRAVITY * SLAM_HEIGHT);
    const tAir        = 2 * vy0 / this.HOP_GRAVITY;

    this._vx = nx * hopDist / tAir;
    this._vy = vy0;
    this._vz = nz * hopDist / tAir;

    this.onPlaySound?.('plant_hop');
  }

  // ── Dispara o impacto do slam na aterrissagem ─────────────────────
  _triggerSlamImpact(playerPos) {
    const pos    = this.root.position;
    const dx     = playerPos.x - pos.x;
    const dz     = playerPos.z - pos.z;
    const distH  = Math.sqrt(dx * dx + dz * dz);

    // Dano em área se o jogador está dentro do raio
    if (distH <= this.SLAM_RADIUS) {
      // Knockback explosivo (35) para o esmagamento
      this.onAttack?.(this.SLAM_DAMAGE, 'slam', pos.clone(), 35);
    }
    this.onPlaySound?.('plant_attack');

    // ── Anel de choque visual ────────────────────────────────────
    const ring = BABYLON.MeshBuilder.CreateTorus(
      `slam_ring_${Date.now()}`,
      { diameter: 0.4, thickness: 0.15, tessellation: 28 },
      this.scene
    );
    ring.position.set(pos.x, this._groundY + 0.05, pos.z);
    ring.rotation.x = Math.PI / 2;
    ring.isPickable = false;

    const rMat = new BABYLON.StandardMaterial(`slamRM_${Date.now()}`, this.scene);
    rMat.emissiveColor   = new BABYLON.Color3(1.0, 0.75, 0.1);
    rMat.disableLighting = true;
    rMat.backFaceCulling = false;
    ring.material = rMat;

    // Disco de fumaça/chão
    const dust = BABYLON.MeshBuilder.CreateDisc(
      `slam_dust_${Date.now()}`,
      { radius: 0.3, tessellation: 20 }, this.scene
    );
    dust.rotation.x = Math.PI / 2;
    dust.position.set(pos.x, this._groundY + 0.02, pos.z);
    dust.isPickable = false;
    const dMat = new BABYLON.StandardMaterial(`slamDM_${Date.now()}`, this.scene);
    dMat.emissiveColor   = new BABYLON.Color3(0.55, 0.40, 0.20);
    dMat.alpha           = 0.65;
    dMat.disableLighting = true;
    dMat.backFaceCulling = false;
    dust.material = dMat;

    // Anima o anel e o disco: expande e desaparece em 0.55s
    const EXPAND_T = 0.55;
    const TARGET_R = this.SLAM_RADIUS * 2;
    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt2 = this.scene.getEngine().getDeltaTime() / 1000;
      t += dt2;
      const pct = Math.min(t / EXPAND_T, 1);
      const s   = pct * TARGET_R;
      ring.scaling.setAll(s);
      ring.material.alpha = 1 - pct;
      dust.scaling.setAll(s * 0.85);
      dust.material.alpha = 0.65 * (1 - pct);
      if (pct >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        ring.dispose();
        dust.dispose();
      }
    });

    // Partículas de poeira + marca escura no chão
    this._spawnDustParticles(pos);
    this._spawnGroundMark(pos);
  }

  // ── Partículas de poeira no impacto ──────────────────────────────
  _spawnDustParticles(pos) {
    const COUNT = 16;
    const scene = this.scene;
    const gY    = this._groundY;
    const items = [];

    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const spd   = 2.0 + Math.random() * 4.0;
      const m     = BABYLON.MeshBuilder.CreateSphere(
        `dp_${Date.now()}_${i}`,
        { diameter: 0.10 + Math.random() * 0.26, segments: 3 },
        scene
      );
      m.position.set(pos.x, gY + 0.10, pos.z);
      m.isPickable = false;

      const mat = new BABYLON.StandardMaterial(`dpm_${Date.now()}_${i}`, scene);
      mat.emissiveColor   = new BABYLON.Color3(
        0.50 + Math.random() * 0.20,
        0.35 + Math.random() * 0.12,
        0.12 + Math.random() * 0.10
      );
      mat.disableLighting = true;
      mat.alpha           = 0.85;
      m.material = mat;

      items.push({
        m, mat,
        vx:   Math.cos(angle) * spd,
        vy:   2.2 + Math.random() * 3.5,
        vz:   Math.sin(angle) * spd,
        life: 0.45 + Math.random() * 0.40,
      });
    }

    let t = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt2 = scene.getEngine().getDeltaTime() / 1000;
      t += dt2;
      let alive = 0;
      for (const p of items) {
        if (t >= p.life) continue;
        alive++;
        p.m.position.x += p.vx * dt2;
        p.m.position.y += p.vy * dt2;
        p.m.position.z += p.vz * dt2;
        p.vy -= 20 * dt2;
        if (p.m.position.y < gY) p.m.position.y = gY;
        p.mat.alpha = 0.85 * (1 - t / p.life);
      }
      if (alive === 0) {
        scene.onBeforeRenderObservable.remove(obs);
        for (const p of items) p.m.dispose();
      }
    });
  }

  // ── Marca escura de impacto no chão (desaparece aos poucos) ──────
  _spawnGroundMark(pos) {
    const mark = BABYLON.MeshBuilder.CreateDisc(
      `slam_mark_${Date.now()}`,
      { radius: this.SLAM_RADIUS * 0.55, tessellation: 28 },
      this.scene
    );
    mark.rotation.x  = Math.PI / 2;
    mark.position.set(pos.x, this._groundY + 0.015, pos.z);
    mark.isPickable  = false;

    const mat = new BABYLON.StandardMaterial(`slam_markM_${Date.now()}`, this.scene);
    mat.emissiveColor   = new BABYLON.Color3(0.10, 0.05, 0.01);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alpha           = 0.70;
    mark.material       = mat;

    const FADE = 4.5;
    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      if (t >= FADE) {
        this.scene.onBeforeRenderObservable.remove(obs);
        mark.dispose();
        return;
      }
      mat.alpha = 0.70 * (1 - t / FADE);
    });
  }

  // ── Lança o pulo ─────────────────────────────────────────────────
  _launchHop(targetPos, distH) {
    const pos  = this.root.position;
    const dist = distH > 0.01 ? distH : 0.01;
    const nx   = (targetPos.x - pos.x) / dist;
    const nz   = (targetPos.z - pos.z) / dist;

    const hopDist = Math.min(dist * 0.90, this.HOP_DIST);
    const vy0     = Math.sqrt(2 * this.HOP_GRAVITY * this.HOP_HEIGHT);
    const tAir    = 2 * vy0 / this.HOP_GRAVITY;

    this._vx = nx * hopDist / tAir;
    this._vy = vy0;
    this._vz = nz * hopDist / tAir;

    if (this._aggroT > 0) { this._vx *= 1.35; this._vz *= 1.35; }

    this.onPlaySound?.('plant_hop');
  }

  // ── Squash & stretch ─────────────────────────────────────────────
  _targetScale(dt, sy, sxz) {
    const s = this.root.scaling;
    const k = Math.min(1, dt * 12);
    s.y = BABYLON.Scalar.Lerp(s.y, this.BASE_SCALE * sy,  k);
    s.x = BABYLON.Scalar.Lerp(s.x, this.BASE_SCALE * sxz, k);
    s.z = BABYLON.Scalar.Lerp(s.z, this.BASE_SCALE * sxz, k);
  }

  // ── Billboard manual + HP bar + label ────────────────────────────
  _updateHPBar(pos, cameraPos) {
    if (!this._hpBg) return;

    const barY   = pos.y + this._HP_OFF_Y;
    const barPos = new BABYLON.Vector3(pos.x, barY, pos.z);

    // Ângulo horizontal para a câmera
    const toCamera = cameraPos
      ? cameraPos.subtract(barPos)
      : BABYLON.Vector3.Forward();
    const angle  = Math.atan2(toCamera.x, toCamera.z);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);

    // ── Background da barra ───────────────────────────────────────
    this._hpBg.position.copyFrom(barPos);
    this._hpBg.rotation.y  = angle;
    this._hpBg.isVisible   = true;

    // ── Preenchimento (alinhado à esquerda) ───────────────────────
    const pct  = Math.max(0.001, this.hp / this.maxHp);
    const shiftX = rightX * (this._hpW / 2) * (pct - 1);
    const shiftZ = rightZ * (this._hpW / 2) * (pct - 1);

    this._hpFg.position.set(
      barPos.x + shiftX,
      barPos.y,
      barPos.z + shiftZ
    );
    this._hpFg.rotation.y = angle;
    this._hpFg.scaling.x  = pct;
    this._hpFg.isVisible   = true;

    // Cor: verde → amarelo → vermelho
    const r = pct > 0.5 ? 2 * (1 - pct) : 1.0;
    const g = pct < 0.5 ? 2 * pct       : 1.0;
    this._hpMat.diffuseColor  = new BABYLON.Color3(r, g * 0.85, 0);
    this._hpMat.emissiveColor = new BABYLON.Color3(r * 0.3, g * 0.25, 0);

    // ── Label de nome ─────────────────────────────────────────────
    if (this._hpLabel) {
      this._hpLabel.position.set(pos.x, barY + 0.38, pos.z);
      this._hpLabel.rotation.y = angle;
      this._hpLabel.isVisible  = true;
    }
  }

  // ── Mostra/esconde toda a HUD da planta ───────────────────────────
  _showHPBar(visible) {
    if (this._hpBg)    this._hpBg.isVisible    = visible;
    if (this._hpFg)    this._hpFg.isVisible    = visible;
    if (this._hpLabel) this._hpLabel.isVisible = visible;
  }

  // ── Limpeza ──────────────────────────────────────────────────────
  _cleanup() {
    if (this._hpBg)    { this._hpBg.dispose();    this._hpBg    = null; }
    if (this._hpFg)    { this._hpFg.dispose();    this._hpFg    = null; }
    if (this._hpLabel) { this._hpLabel.dispose(); this._hpLabel = null; }
    if (this._shadow)  { this._shadow.dispose();  this._shadow  = null; }
    if (this.root)     { this.root.dispose();      this.root     = null; }
  }

  // ── Reseta para posição/estado inicial (chamado no respawn do jogador) ──
  reset() {
    if (!this.root) return;

    // Posição e rotação originais
    this.root.position.copyFrom(this._spawnPos);
    this.root.rotationQuaternion = null;
    this.root.rotation.y  = Math.random() * Math.PI * 2;
    this.root.scaling.setAll(this.BASE_SCALE);
    this.root.setEnabled(true);

    // Stats
    this.hp        = this.maxHp;
    this.alive     = true;
    this._hopState = HopState.WAIT;
    this._hopT     = 0.5 + Math.random() * this.HOP_CD;
    this._aggroT   = 0;
    this._attackT  = 1.0;
    this._biteT    = 2.5;
    this._slamT    = 6.0;

    // Velocidades
    this._vx = 0; this._vy = 0; this._vz = 0;
    this._kbX = 0; this._kbZ = 0; this._kbY = 0;

    // Flash / death
    this._flashT  = 0;
    this._deathT  = 0;

    // Hitbox
    this._hitDealtThisSwing = false;

    // Restaura visibilidade dos child meshes
    for (const m of (this._childMeshes ?? [])) {
      m.visibility = 1;
      if (m.material) m.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
    }

    // HP bar visível
    this._showHPBar(true);
    if (this._hpBg) this._hpBg.isVisible = false; // esconde até atualizar
  }

  isAlive() { return this.alive || (this.root !== null); }
}
