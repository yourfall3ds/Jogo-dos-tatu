// ─────────────────────────────────────────────────────────────────
//  AnimatedEnemy — inimigo genérico dirigido pelas ANIMAÇÕES REAIS
//
//  Lê os AnimationGroups reais da instância e mapeia, por palavra-chave,
//  para papéis: idle · move · attack[] · hit · death.
//  Cobre 4 famílias: Digimon Linkz, Digimon ReArise (chrNNN_xx),
//  Digimon New Century (stand/skill/hurt) e Quaternius (creature pack).
//
//  Auto-escala para targetHeight. Fallback procedural se sem animação.
// ─────────────────────────────────────────────────────────────────

import { physicsReady } from '../physics/PhysicsWorld.js';

let _euid = 0;

// NOTA: nada de \b — os nomes vêm prefixados pela instância
// (ex: "enemy_agumon_0_idle"), então usamos substring puro. A ORDEM de
// resolução (idle→move→hit→death→attack) evita colisões tipo "attack_move".
const ROLE_RX = {
  idle:   [/idle/i, /stand/i, /_bn0/i, /wait/i],
  move:   [/fast_fly/i, /move/i, /walk/i, /run/i, /swim/i, /flying/i, /_mv/i],
  attack: [/attack/i, /punch/i, /bite/i, /headbutt/i, /kick/i, /slash/i, /claw/i, /_ba0/i, /_bs0/i,
           /special/i, /skill/i, /shoot/i, /cast/i, /ink/i, /roar/i, /_bv0/i],
  hit:    [/damage/i, /hit/i, /react/i, /_bd0/i, /flinch/i, /hurt/i, /stagger/i],
  death:  [/death/i, /die/i, /down/i, /defeat/i, /dead/i],
};

const State = Object.freeze({
  IDLE: 'IDLE', CHASE: 'CHASE', WINDUP: 'WINDUP', STRIKE: 'STRIKE',
  RECOVER: 'RECOVER', HIT: 'HIT', DYING: 'DYING', DEAD: 'DEAD',
});

export class AnimatedEnemy {
  constructor(scene, shadowGen, inst, position, def) {
    this.scene = scene;
    this.shadowGen = shadowGen;
    this.def = def;
    this.id = def.id || def.name;

    const s = def.stats;
    this.maxHp = s.hp; this.hp = s.hp;
    this.DAMAGE = s.damage;
    this.MOVE_SPEED = s.moveSpeed;
    this.ATTACK_RANGE = s.attackRange;
    this.ATTACK_CD = s.attackCd;
    this.KB = s.kb;
    this.behavior = def.behavior || 'walker';
    // AGGRO: só persegue dentro do raio de detecção. Fora dele, fica parado
    //  (idle/patrulha). Uma vez agredido/aggro, persegue até uma distância
    //  maior (LEASH) antes de desistir e voltar a dormir.
    this.AGGRO_RANGE = s.aggroRange ?? 14;
    this.LEASH_RANGE = s.leashRange ?? (this.AGGRO_RANGE + 10);
    this._aggro = false;

    this.alive = true;
    this._state = State.IDLE;
    this._attackT = 1.0 + Math.random();
    this._stateT = 0;
    this._flashT = 0;
    this._deathT = 0;
    this.DEATH_DUR = 1.4;

    this._vx = 0; this._vz = 0;
    this._kbX = 0; this._kbZ = 0;
    this._groundY = position.y;
    this._spawnPos = position.clone();
    this.HOVER_H = this.behavior === 'flyer' ? 2.0 + Math.random() * 0.8 : 0;

    // ── Hitbox de golpe REAL (espacial, à frente — não centro-a-centro) ──
    // O golpe nasce à frente do inimigo (REACH) e tem um raio (RADIUS).
    // Acerta só se a esfera do golpe encostar no corpo do player.
    this.PLAYER_RADIUS = 0.55;
    this.HIT_REACH  = this.ATTACK_RANGE * 0.52;          // quão à frente o golpe vai
    this.HIT_RADIUS = Math.max(0.55, this.ATTACK_RANGE * 0.42); // raio da esfera do golpe
    // brutes batem o chão → golpe radial (AoE) no impacto, justo em Y

    this.onAttack = null; this.onPlaySound = null; this.onDeath = null;

    this.anims = (inst.animationGroups || []).slice();
    this.anims.forEach(a => a.stop());

    this._build(inst, position);
    this._resolveRoles();
    this._buildHealthBar();
    this._buildShadow();
    this._play(this.rIdle, true);
  }

  _build(inst, position) {
    const uid = _euid++;
    this.root = inst.rootNodes[0];
    if (!this.root) { console.warn('[AnimatedEnemy] sem rootNode:', this.id); return; }
    this.skeleton = inst.skeletons?.[0] || null;

    this.root.rotationQuaternion = null;
    this.root.scaling.setAll(1);
    this.root.position.set(0, 0, 0);
    this.root.computeWorldMatrix(true);
    const bb = this.root.getHierarchyBoundingVectors(true);
    const h = (bb.max.y - bb.min.y) || 1;
    this.BASE_SCALE = (this.def.targetHeight || 1.6) / h;
    this._footOffset = -bb.min.y * this.BASE_SCALE;

    this.root.scaling.setAll(this.BASE_SCALE);
    this.root.position.copyFrom(position);
    // Nasce na altura do spawn (position.y) e CAI pela gravidade até o chão.
    this.root.position.y = position.y + this._footOffset;
    this._vy = 0;
    this.root.rotation.y = Math.atan2(-position.x, -position.z);

    this._childMeshes = this.root.getChildMeshes(false).filter(m => m.getTotalVertices?.() > 0);
    if (!this._childMeshes.length) this._childMeshes = this.root.getChildMeshes(false);

    for (const m of this._childMeshes) {
      if (m.material) {
        m.material = m.material.clone(`${m.material.name}_e${uid}`) || m.material;
        if (this.def.tint) {
          if (m.material.albedoColor) m.material.albedoColor = new BABYLON.Color3(...this.def.tint);
          else if (m.material.diffuseColor) m.material.diffuseColor = new BABYLON.Color3(...this.def.tint);
        }
        if (m.material.emissiveColor) m.material._baseEmissive = m.material.emissiveColor.clone();
      }
      m._enemyRef = this;
      m.isPickable = true;
      this.shadowGen?.addShadowCaster(m);
    }
  }

  _resolveRoles() {
    const pick = (rxList) => this.anims.find(a => rxList.some(rx => rx.test(a.name)));
    this.rIdle = pick(ROLE_RX.idle) || this.anims[0] || null;
    this.rMove = pick(ROLE_RX.move) || this.rIdle;
    this.rHit  = pick(ROLE_RX.hit) || null;
    this.rDeath = pick(ROLE_RX.death) || null;
    this.rAttacks = this.anims.filter(a => ROLE_RX.attack.some(rx => rx.test(a.name)));
    if (!this.rAttacks.length && this.anims.length > 1) {
      this.rAttacks = [this.anims.find(a => a !== this.rIdle) || this.anims[0]];
    }
    this._hasAnims = this.anims.length > 0;
  }

  _play(group, loop = true, speed = 1.0) {
    if (!group) return;
    if (this._cur === group && this._curLoop === loop) return;
    for (const a of this.anims) if (a !== group) a.stop();
    const spd = speed * (this.def.animSpeed || 1.0);
    group.start(loop, spd, group.from, group.to, false);
    this._cur = group; this._curLoop = loop;
  }

  _buildHealthBar() {
    if (!this.root) return;
    const th = this.def.targetHeight || 1.6;
    const BAR_W = 1.8 * (th / 1.6);
    this._hpW = BAR_W;
    this._hpOffY = th + 0.6;
    const tag = `${this.id}_${_euid}`;
    const mk = (n, w, h, c) => {
      const p = BABYLON.MeshBuilder.CreatePlane(n, { width: w, height: h }, this.scene);
      p.isPickable = false;
      const m = new BABYLON.StandardMaterial(n + 'M', this.scene);
      m.diffuseColor = c; m.emissiveColor = c; m.disableLighting = true; m.backFaceCulling = false;
      p.material = m; return p;
    };
    this._hpBg = mk(`ehpBg_${tag}`, BAR_W, 0.22, new BABYLON.Color3(0.1, 0.1, 0.1));
    this._hpFg = mk(`ehpFg_${tag}`, BAR_W, 0.17, new BABYLON.Color3(0.9, 0.2, 0.2));
    this._hpMat = this._hpFg.material;

    const texW = 256, texH = 48;
    const tex = new BABYLON.DynamicTexture(`elbl_${tag}`, { width: texW, height: texH }, this.scene, false);
    tex.hasAlpha = true;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, texW, texH);
    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = this.def.isBoss ? '#ff5555' : '#ffdd55';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((this.def.isBoss ? '★ ' : '') + this.def.name, texW / 2, texH / 2);
    tex.update();
    const lbl = BABYLON.MeshBuilder.CreatePlane(`elblP_${tag}`, { width: BAR_W * 1.4, height: 0.4 }, this.scene);
    lbl.isPickable = false;
    const lm = new BABYLON.StandardMaterial(`elblM_${tag}`, this.scene);
    lm.diffuseTexture = tex; lm.emissiveTexture = tex; lm.useAlphaFromDiffuseTexture = true;
    lm.disableLighting = true; lm.backFaceCulling = false;
    lbl.material = lm;
    this._hpLabel = lbl;
  }

  _buildShadow() {
    const r = 0.5 * ((this.def.targetHeight || 1.6) / 1.6);
    const s = BABYLON.MeshBuilder.CreateDisc(`esh_${this.id}_${_euid}`, { radius: r, tessellation: 12 }, this.scene);
    s.rotation.x = Math.PI / 2; s.isPickable = false;
    const m = new BABYLON.StandardMaterial(`eshM_${this.id}_${_euid}`, this.scene);
    m.emissiveColor = BABYLON.Color3.Black(); m.alpha = 0.3; m.disableLighting = true;
    s.material = m;
    this._shadow = s;
  }

  takeDamage(amount, fromDir = null, kbMult = 1.0, launch = false) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this._flashT = 0.16;
    this._aggro = true;            // levou dano → acorda e persegue
    this.onPlaySound?.('enemy_hit');

    const crit = kbMult >= 4.5;   // alinhado ao CRIT_KB do CombatSystem
    if (fromDir) {
      // CRIT = golpe forte (kbMult alto). Manda o inimigo VOAR LONGE:
      // empurrão maior + drag bem mais leve (desliza por muito mais tempo).
      const f = amount * 0.5 * kbMult * (crit ? 1.4 : 1.0);
      const n = fromDir.normalize();
      this._kbX = n.x * f; this._kbZ = n.z * f;
      // Crit desliza ~2.3x mais longe (drag base bem mais leve).
      this._kbDrag = crit ? 0.10 : 0.02;
    }

    // Som ESPACIAL do cara voando longe — APENAS no chute lançador (launch),
    // não em soco nem crit normal. Segue o inimigo e abaixa com a distância.
    if (launch) this.onPlaySpatial?.('flyby', this.root);

    if (this.hp <= 0) {
      this.alive = false;
      this._state = State.DYING;
      this._deathT = this.DEATH_DUR;
      // RAGDOLL: corpo voa/tomba com física na direção da pancada.
      // Se a física não estiver pronta, cai no fade+rotação antigo.
      const ragdolled = this._startRagdoll(fromDir, kbMult);
      if (!ragdolled) this._play(this.rDeath, false);
      this.onPlaySound?.('enemy_death');
      this.onDeath?.(this);
    } else if (this._state !== State.STRIKE) {
      this._state = State.HIT; this._stateT = 0.28;
      this._play(this.rHit, false);
      this._attackT = Math.max(this._attackT, 0.5);
    }
  }

  update(dt, playerPos, cameraPos) {
    if (!this.root || this._state === State.DEAD) return false;
    if (!this._rolesConfirmed) {
      this._rolesConfirmed = true;
      this._resolveRoles();
      if (this._state === State.IDLE) this._play(this.rIdle, true);
    }
    const pos = this.root.position;
    if (this._flashT > 0) this._flashT -= dt;
    if (this._attackT > 0) this._attackT -= dt;

    if (this._state === State.DYING) {
      this._deathT -= dt;
      if (this._ragBody) {
        // física dirige o corpo (voa/tomba/rola) — não força rotação nem posição
      } else if (!this.rDeath) {
        const t = 1 - this._deathT / this.DEATH_DUR;
        this.root.rotation.z = t * Math.PI * 0.5;
      }
      const vis = Math.max(0, this._deathT / this.DEATH_DUR);
      if (this._deathT < 0.6) for (const m of this._childMeshes) m.visibility = vis / 0.6;
      this._showBar(false);
      if (this._deathT <= 0) { this._state = State.DEAD; this._cleanup(); return false; }
      return true;
    }

    if (Math.abs(this._kbX) + Math.abs(this._kbZ) > 0.05) {
      pos.x += this._kbX * dt; pos.z += this._kbZ * dt;
      const drag = Math.pow(this._kbDrag ?? 0.02, dt);
      this._kbX *= drag; this._kbZ *= drag;
    }

    const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const nx = dist > 0.01 ? dx / dist : 0, nz = dist > 0.01 ? dz / dist : 0;
    const rotOff = this.def.rotOffset ?? 0;
    // Encara o MOVIMENTO (waypoint) ao perseguir; encara o PLAYER ao atacar/parado.
    const faceX = (this._state === State.IDLE && this._faceX != null) ? this._faceX : dx;
    const faceZ = (this._state === State.IDLE && this._faceZ != null) ? this._faceZ : dz;
    let da = (Math.atan2(faceX, faceZ) + rotOff) - this.root.rotation.y;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.root.rotation.y += da * Math.min(1, dt * 7);

    // ── GRAVIDADE: o inimigo CAI até bater numa superfície ─────────────
    //  Não há chão plano — o mundo é de plataformas/blocos. Então em vez de
    //  fixar altura, aplicamos gravidade: raycast pra baixo acha a superfície
    //  sob o inimigo; se ele está acima dela, despenca; ao tocar, assenta.
    //  (Voadores ignoram — flutuam.)
    if (this.behavior === 'flyer') {
      const surfaceY = this._sampleGroundY(pos);
      const base = (surfaceY != null ? surfaceY : this._groundY) + this.HOVER_H + this._footOffset;
      this._bobT = (this._bobT || 0) + dt;
      pos.y = base + Math.sin(this._bobT * 3) * 0.22;
    } else {
      // reamostra a superfície sob ele (throttled — raycast é caro)
      this._groundSampleT = (this._groundSampleT || 0) - dt;
      if (this._groundSampleT <= 0) {
        this._groundSampleT = 0.12;
        this._surfaceY = this._sampleGroundY(pos);   // pode ser null (sobre o vazio)
      }
      const footY = this._footOffset;
      const restY = (this._surfaceY != null ? this._surfaceY : -Infinity) + footY;
      // velocidade vertical (gravidade)
      this._vy = (this._vy || 0) - 30 * dt;
      let ny = pos.y + this._vy * dt;
      if (ny <= restY) { ny = restY; this._vy = 0; }   // assentou na superfície
      pos.y = ny;
      // mantém _groundY coerente (usado por sombra/raycast de parede)
      this._groundY = pos.y - footY;
      // caiu pra fora do mundo → morre
      if (pos.y < -40 && this.alive) { this.hp = 0; this.takeDamage?.(0); this._state = State.DYING; this._deathT = 0.1; }
    }

    switch (this._state) {
      case State.HIT:
        this._stateT -= dt;
        if (this._stateT <= 0) this._state = State.IDLE;
        break;
      case State.WINDUP:
        this._stateT -= dt;
        if (this._stateT <= 0) {
          this._state = State.STRIKE; this._stateT = 0.25;
          this._hitDone = false;
          this._vx = nx * 4; this._vz = nz * 4;
        }
        break;
      case State.STRIKE:
        this._stateT -= dt;
        pos.x += this._vx * dt; pos.z += this._vz * dt;
        this._vx *= 0.85; this._vz *= 0.85;
        // Hitbox REAL: esfera do golpe à frente vs cápsula do player
        if (!this._hitDone && this._meleeHitsPlayer(pos, playerPos, nx, nz)) {
          this._hitDone = true;
          this.onAttack?.(this.DAMAGE, this.behavior === 'brute' ? 'slam' : 'melee', pos.clone(), this.KB);
        }
        if (this._stateT <= 0) { this._state = State.RECOVER; this._stateT = 0.3; }
        break;
      case State.RECOVER:
        this._stateT -= dt;
        if (this._stateT <= 0) { this._state = State.IDLE; this._attackT = this.ATTACK_CD; }
        break;
      default: {
        // ── AGGRO: só persegue se o player está no raio de detecção ─────
        //  Entra em aggro ao chegar perto (AGGRO_RANGE); só desiste se o
        //  player se afastar além do LEASH. Sem aggro → fica parado (idle).
        if (!this._aggro) {
          if (dist <= this.AGGRO_RANGE) this._aggro = true;
        } else if (dist > this.LEASH_RANGE) {
          this._aggro = false; this._wp = null;
        }

        if (!this._aggro) {
          // ── PATRULHA (wander): vagueia devagar perto do spawn ──────────
          //  Em vez de ficar congelado, escolhe um destino aleatório no raio
          //  de patrulha e caminha até lá, pausando às vezes. Dá vida à cena.
          this._wanderTick(dt);
          break;
        }

        if (dist > this.ATTACK_RANGE) {
          // Direção do MOVIMENTO: por padrão direto ao player (nx,nz). Se há
          // NavMesh, segue o próximo waypoint do caminho → contorna paredes/
          // objetos em vez de atravessar. Reusa o waypoint por ~0.3s (barato).
          let mx = nx, mz = nz;
          const nav = window._navMesh;
          if (nav?.ready) {
            this._navT = (this._navT || 0) - dt;
            if (this._navT <= 0 || !this._wp) {
              this._wp = nav.nextStep(pos, playerPos);
              this._navT = 0.3;
            }
            if (this._wp) {
              const wdx = this._wp.x - pos.x, wdz = this._wp.z - pos.z;
              const wd = Math.sqrt(wdx * wdx + wdz * wdz);
              if (wd > 0.05) { mx = wdx / wd; mz = wdz / wd; }
            }
          }
          // COLISÃO: não atravessa parede. O raycast é CARO (testa a cena
          //  toda), então só checa a cada ~0.15s — e guarda o resultado. A
          //  navmesh já faz o contorno; isto é a rede de segurança.
          const step = this.MOVE_SPEED * dt;
          this._blockT = (this._blockT || 0) - dt;
          if (this._blockT <= 0) {
            this._blocked = this._blockedAhead(pos, mx, mz, step);
            this._blockT = 0.15;
            if (this._blocked) { this._wp = null; this._navT = 0; }  // recalcula caminho
          }
          if (!this._blocked) {
            pos.x += mx * step;
            pos.z += mz * step;
          }
          this._faceX = mx; this._faceZ = mz;
          this._play(this.rMove, true);
        } else if (this._attackT <= 0) {
          // Windup mais longo = telegraph: dá tempo do player reagir/desviar
          this._state = State.WINDUP; this._stateT = 0.45;
          this._play(this._pickAttack(), false);
          this.onPlaySound?.('enemy_attack');
        } else {
          this._play(this.rIdle, true);
        }
        break;
      }
    }

    if (!this._hasAnims) this._proceduralTick(dt, dist);

    const flash = this._flashT > 0;
    for (const m of this._childMeshes) {
      const mat = m.material; if (!mat || !mat.emissiveColor) continue;
      if (flash) mat.emissiveColor = new BABYLON.Color3(0.9, 0.15, 0.15);
      else if (mat._baseEmissive) mat.emissiveColor = mat._baseEmissive;
      else mat.emissiveColor = BABYLON.Color3.Black();
    }

    if (this._shadow) {
      const groundLevel = this._groundY + this._footOffset;
      this._shadow.position.set(pos.x, groundLevel - this._footOffset + 0.02, pos.z);
      const airH = Math.max(0, pos.y - groundLevel);
      this._shadow.scaling.setAll(Math.max(0.2, 1 - airH * 0.1));
    }
    this._updateBar(pos, cameraPos);
    return true;
  }

  // Há muro/obstáculo logo à frente na direção (dx,dz)? Raycast curto na
  //  altura do tronco. Bate só em sólidos do cenário (não player/inimigos/
  //  drops/efeitos). Evita atravessar parede mesmo se a navmesh falhar.
  _blockedAhead(pos, dx, dz, step) {
    const len = Math.max(0.7, step + this.PLAYER_RADIUS + 0.4);
    const dir = new BABYLON.Vector3(dx, 0, dz);
    if (dir.lengthSquared() < 1e-4) return false;
    dir.normalize();
    // Testa SÓ contra a lista de obstáculos da navmesh (dezenas), não a cena
    //  inteira (centenas) → barato. ray.intersectsMesh por obstáculo.
    const obstacles = window._navMesh?.obstacles;
    if (obstacles && obstacles.length) {
      // Filtra por proximidade: só testa obstáculos a < ~4u (raio do bounding).
      const near = [];
      for (const m of obstacles) {
        if (!m || m.isDisposed?.() || m === this.root) continue;
        const c = m.getBoundingInfo?.().boundingSphere?.centerWorld;
        if (!c) { near.push(m); continue; }
        const ddx = c.x - pos.x, ddz = c.z - pos.z;
        if (ddx * ddx + ddz * ddz < 25) near.push(m);   // < 5u
      }
      if (!near.length) return false;
      for (const hy of [0.9, 0.35]) {
        const origin = new BABYLON.Vector3(pos.x, this._groundY + hy, pos.z);
        const ray = new BABYLON.Ray(origin, dir, len);
        for (const m of near) {
          const pick = ray.intersectsMesh(m);
          if (pick?.hit && pick.distance < len) return true;
        }
      }
      return false;
    }
    // Fallback: pick na cena com filtro (raro — navmesh não pronta)
    for (const hy of [0.9, 0.35]) {
      const origin = new BABYLON.Vector3(pos.x, this._groundY + hy, pos.z);
      const ray = new BABYLON.Ray(origin, dir, len);
      const hit = this.scene.pickWithRay(ray, (m) => this._isSolidBlocker(m));
      if (hit?.hit && hit.distance < len) return true;
    }
    return false;
  }

  // Um mesh é "muro/objeto sólido" que bloqueia? Sobe na hierarquia: os
  //  child meshes dos GLB não têm a flag de colisor (só o root/_gameObject),
  //  então checamos o próprio mesh E seus ancestrais.
  _isSolidBlocker(m) {
    if (!m || !m.isEnabled?.() || (m.getTotalVertices?.() || 0) === 0) return false;
    if (!m.isPickable) return false;
    // ignora a si mesmo e outros inimigos (sobe na hierarquia)
    let node = m;
    while (node) {
      if (node === this.root || node._enemyRef) return false;
      node = node.parent;
    }
    const n = (m.name || '') + ' ' + (m.parent?.name || '') + ' ' + (m.parent?.parent?.name || '');
    // efeitos / UI / drops / player / chão → não bloqueiam
    if (/drop_|hit|tracer|muzzle|spark|trail|lbl|dmg|gun|weapon|hitbox|shadow|imgPlane|_glow|_beam|_hp|billboard|player|capsule|cilindro/i.test(n)) return false;
    if (/ground|chao|floor|piso|terrain|bump/i.test(m.name || '')) return false;
    if (m.billboardMode) return false;
    // Qualquer outra geometria com volume À FRENTE é obstáculo: se está no
    //  caminho, o inimigo desvia. (Mais robusto que depender de flags que os
    //  child meshes de GLB não têm.)
    return true;
  }

  // Patrulha/wander quando sem aggro. Máquina de 2 estados:
  //  'pause' = parado um tempo (idle, olhando à toa) · 'walk' = anda até um
  //  destino aleatório perto do spawn. Alterna entre os dois → bichos "vivos".
  _wanderTick(dt) {
    const pos = this.root.position;
    const home = this._spawnPos || pos;
    this._wanderState = this._wanderState || 'pause';
    this._wanderT = (this._wanderT || 0) - dt;

    // ── PAUSA ───────────────────────────────────────────────────────
    if (this._wanderState === 'pause') {
      this._faceX = null; this._faceZ = null;
      this._play(this.rIdle, true);
      if (this._wanderT <= 0) {
        // acabou a pausa → escolhe um destino e começa a andar
        const R = 6;
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * R;
        this._wanderTarget = new BABYLON.Vector3(home.x + Math.cos(a) * r, pos.y, home.z + Math.sin(a) * r);
        this._wanderState = 'walk';
        this._wanderT = 4 + Math.random() * 3;   // tempo máximo de caminhada
      }
      return;
    }

    // ── CAMINHADA ────────────────────────────────────────────────────
    const tgt = this._wanderTarget;
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4 || this._wanderT <= 0) {
      // chegou (ou desistiu) → PAUSA
      this._wanderState = 'pause';
      this._wanderT = 1.4 + Math.random() * 2.6;   // pausa 1.4–4s
      this._faceX = null; this._faceZ = null;
      this._play(this.rIdle, true);
      return;
    }
    const mx = dx / d, mz = dz / d;
    const step = this.MOVE_SPEED * 0.4 * dt;   // patrulha = devagar
    if (!this._blockedAhead(pos, mx, mz, step)) {
      pos.x += mx * step; pos.z += mz * step;
    } else {
      // bateu em algo → pausa e replaneja
      this._wanderState = 'pause'; this._wanderT = 0.8 + Math.random();
    }
    this._faceX = mx; this._faceZ = mz;
    this._play(this.rMove, true);
  }

  // Acha a SUPERFÍCIE logo abaixo dos pés do inimigo. Testa SÓ contra as
  //  superfícies "pisáveis" da NavMesh (chão/plataformas/construção reais) —
  //  ignora decoração, player, efeitos. Retorna o Y do topo da superfície
  //  mais alta abaixo dos pés, ou null (só vento → despenca pela gravidade).
  _sampleGroundY(pos) {
    const walkables = window._navMesh?.walkables;
    const feetY = pos.y - this._footOffset;
    const origin = new BABYLON.Vector3(pos.x, feetY + 0.6, pos.z);
    const dir = new BABYLON.Vector3(0, -1, 0);

    if (walkables && walkables.length) {
      const ray = new BABYLON.Ray(origin, dir, 220);
      let bestY = null;
      for (const m of walkables) {
        if (!m || m.isDisposed?.()) continue;
        const pick = ray.intersectsMesh(m);
        if (pick?.hit) {
          const y = pick.pickedPoint.y;
          if (y <= feetY + 0.55 && (bestY == null || y > bestY)) bestY = y;
        }
      }
      return bestY;
    }

    // Fallback (navmesh não pronta): pick na cena com filtro forte
    const ray = new BABYLON.Ray(origin, dir, 220);
    const hits = this.scene.multiPickWithRay(ray, (m) => {
      if (!m.isEnabled?.() || !m.isPickable || (m.getTotalVertices?.() || 0) === 0) return false;
      let n = m; while (n) { if (n === this.root || n._enemyRef) return false; n = n.parent; }
      const nm = (m.name || '') + ' ' + (m.parent?.name || '');
      if (/hit|enemy_|tracer|muzzle|drop_|spark|lbl|trail|shadow|player|capsule|char1|medkit|sketchfab|cube_material|node0|plant\.|barsign|mushroom|crystal|sciencetube/i.test(nm)) return false;
      if (m.billboardMode) return false;
      return true;
    });
    let bestY = null;
    for (const h of hits || []) {
      const y = h.pickedPoint.y;
      if (y <= feetY + 0.55 && (bestY == null || y > bestY)) bestY = y;
    }
    return bestY;
  }

  _pickAttack() {
    if (!this.rAttacks?.length) return this.rIdle;
    return this.rAttacks[(Math.random() * this.rAttacks.length) | 0];
  }

  // ── Hitbox de golpe: esfera à frente vs cápsula vertical do player ──
  //  O golpe nasce à FRENTE do inimigo (não no centro), na altura do
  //  meio do corpo. Só acerta se a esfera encostar na cápsula do player
  //  → permite pular/sair de lado para escapar, igual ao seu hitbox.
  _meleeHitsPlayer(pos, playerPos, nx, nz) {
    const hx = pos.x + nx * this.HIT_REACH;
    const hz = pos.z + nz * this.HIT_REACH;
    const hy = pos.y + (this.def.targetHeight || 1.6) * 0.45;
    // Cápsula do player: eixo vertical, meia-altura ~0.9 em torno do centro
    const cy = Math.max(playerPos.y - 0.9, Math.min(playerPos.y + 0.9, hy));
    const ddx = hx - playerPos.x;
    const ddy = hy - cy;
    const ddz = hz - playerPos.z;
    const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    return d <= (this.HIT_RADIUS + this.PLAYER_RADIUS);
  }

  _proceduralTick(dt, dist) {
    const s = this.root.scaling, B = this.BASE_SCALE, k = Math.min(1, dt * 10);
    const moving = dist > this.ATTACK_RANGE;
    const sy = moving ? B * (1 + Math.sin((this._bobT = (this._bobT || 0) + dt) * 12) * 0.05) : B;
    s.y = BABYLON.Scalar.Lerp(s.y, sy, k);
  }

  _updateBar(pos, cameraPos) {
    if (!this._hpBg) return;
    const barY = pos.y + this._hpOffY;
    const bp = new BABYLON.Vector3(pos.x, barY, pos.z);
    const toCam = cameraPos ? cameraPos.subtract(bp) : BABYLON.Vector3.Forward();
    const angle = Math.atan2(toCam.x, toCam.z);
    const rx = Math.cos(angle), rz = -Math.sin(angle);
    this._hpBg.position.copyFrom(bp); this._hpBg.rotation.y = angle; this._hpBg.isVisible = true;
    const pct = Math.max(0.001, this.hp / this.maxHp);
    this._hpFg.position.set(bp.x + rx * (this._hpW / 2) * (pct - 1), bp.y, bp.z + rz * (this._hpW / 2) * (pct - 1));
    this._hpFg.rotation.y = angle; this._hpFg.scaling.x = pct; this._hpFg.isVisible = true;
    const r = pct > 0.5 ? 2 * (1 - pct) : 1, g = pct < 0.5 ? 2 * pct : 1;
    this._hpMat.diffuseColor = new BABYLON.Color3(r, g * 0.85, 0);
    this._hpMat.emissiveColor = new BABYLON.Color3(r * 0.3, g * 0.25, 0);
    if (this._hpLabel) { this._hpLabel.position.set(pos.x, barY + 0.35, pos.z); this._hpLabel.rotation.y = angle; this._hpLabel.isVisible = true; }
  }

  _showBar(v) { [this._hpBg, this._hpFg, this._hpLabel].forEach(m => { if (m) m.isVisible = v; }); }

  // ── RAGDOLL-lite: dá um corpo físico ao inimigo morto e o arremessa ──
  //  Não é ragdoll por osso (caro/frágil com rigs variados): envolve o corpo
  //  numa CAIXA dinâmica Havok e aplica velocidade na direção da pancada. O
  //  visual (pose congelada) tomba/voa/rola e assenta no chão — vende a morte.
  _startRagdoll(fromDir, kbMult = 1) {
    if (!physicsReady() || !this.root || this._ragBody) return false;
    try {
      // Congela a pose (sem anim de morte) → tomba rígido como boneco
      for (const a of this.anims) { try { a.stop(); } catch (_) {} }

      // AABB só dos meshes do CORPO (ignora barra de HP/sombra, que inflam).
      this.root.computeWorldMatrix(true);
      let min = null, max = null;
      for (const m of this._childMeshes) {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        if (!min) { min = b.minimumWorld.clone(); max = b.maximumWorld.clone(); }
        else { min = BABYLON.Vector3.Minimize(min, b.minimumWorld); max = BABYLON.Vector3.Maximize(max, b.maximumWorld); }
      }
      if (!min) { const v = this.root.getHierarchyBoundingVectors(true); min = v.min; max = v.max; }
      const size = max.subtract(min);
      const center = min.add(max).scale(0.5);

      const box = BABYLON.MeshBuilder.CreateBox(`${this.id}_rag`, {
        width:  Math.max(0.3, size.x),
        height: Math.max(0.3, size.y),
        depth:  Math.max(0.3, size.z),
      }, this.scene);
      box.position.copyFrom(center);
      box.rotationQuaternion = BABYLON.Quaternion.Identity();
      box.isVisible = false; box.isPickable = false;
      this.root.setParent(box);   // o visual passa a seguir o corpo físico

      const agg = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX,
        { mass: 6, friction: 0.5, restitution: 0.25 }, this.scene);

      // Voa na direção do golpe + pra cima, girando
      const dir = fromDir ? fromDir.clone() : new BABYLON.Vector3(0, 0, 1);
      dir.y = 0;
      if (dir.lengthSquared() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      const speed = Math.max(8, 6 + kbMult * 1.8);
      const vel = dir.scale(speed);
      vel.y = Math.max(6, 5 + kbMult * 0.6);
      agg.body.setLinearVelocity(vel);
      agg.body.setAngularVelocity(new BABYLON.Vector3(
        (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9));

      this._ragBody = agg.body; this._ragAgg = agg; this._ragMesh = box;
      this._deathT = 2.4; this.DEATH_DUR = 2.4;   // mais tempo p/ voar e assentar
      this._showBar(false);
      if (this._shadow) this._shadow.isVisible = false;
      return true;
    } catch (e) {
      return false;
    }
  }

  _cleanup() {
    for (const a of this.anims) { try { a.dispose(); } catch (_) {} }
    [this._hpBg, this._hpFg, this._hpLabel, this._shadow].forEach(m => { try { m?.dispose(); } catch (_) {} });
    try { this._ragAgg?.dispose?.(); } catch (_) {}
    try { this.root?.dispose(); } catch (_) {}
    try { this._ragMesh?.dispose(); } catch (_) {}
    this.root = null; this._ragBody = null; this._ragAgg = null; this._ragMesh = null;
  }

  reset() {
    if (!this.root) return;
    this.root.position.copyFrom(this._spawnPos);
    this.root.position.y = this._groundY + this.HOVER_H + this._footOffset;
    this.root.rotationQuaternion = null;
    this.root.rotation.z = 0;
    this.root.scaling.setAll(this.BASE_SCALE);
    this.hp = this.maxHp; this.alive = true;
    this._state = State.IDLE; this._attackT = 1.0;
    this._flashT = 0; this._deathT = 0; this._kbX = this._kbZ = 0;
    for (const m of this._childMeshes) { m.visibility = 1; }
    this._showBar(true);
    this._play(this.rIdle, true);
  }

  isAlive() { return this.alive; }
}
