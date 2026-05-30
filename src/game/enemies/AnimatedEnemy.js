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
    this.root.position.y = this._groundY + this.HOVER_H + this._footOffset;
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

  takeDamage(amount, fromDir = null, kbMult = 1.0) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this._flashT = 0.16;
    this.onPlaySound?.('enemy_hit');

    if (fromDir) {
      const f = amount * 0.5 * kbMult;
      const n = fromDir.normalize();
      this._kbX = n.x * f; this._kbZ = n.z * f;
    }

    if (this.hp <= 0) {
      this.alive = false;
      this._state = State.DYING;
      this._deathT = this.DEATH_DUR;
      this._play(this.rDeath, false);
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
      if (!this.rDeath) {
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
      const drag = Math.pow(0.02, dt);
      this._kbX *= drag; this._kbZ *= drag;
    }

    const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const nx = dist > 0.01 ? dx / dist : 0, nz = dist > 0.01 ? dz / dist : 0;
    const rotOff = this.def.rotOffset ?? 0;
    let da = (Math.atan2(dx, dz) + rotOff) - this.root.rotation.y;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.root.rotation.y += da * Math.min(1, dt * 7);

    const baseY = this._groundY + this.HOVER_H + this._footOffset;
    if (this.behavior === 'flyer') {
      this._bobT = (this._bobT || 0) + dt;
      pos.y = baseY + Math.sin(this._bobT * 3) * 0.22;
    } else { pos.y = baseY; }

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
      default:
        if (dist > this.ATTACK_RANGE) {
          pos.x += nx * this.MOVE_SPEED * dt;
          pos.z += nz * this.MOVE_SPEED * dt;
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

    if (!this._hasAnims) this._proceduralTick(dt, dist);

    const flash = this._flashT > 0;
    for (const m of this._childMeshes) {
      const mat = m.material; if (!mat || !mat.emissiveColor) continue;
      if (flash) mat.emissiveColor = new BABYLON.Color3(0.9, 0.15, 0.15);
      else if (mat._baseEmissive) mat.emissiveColor = mat._baseEmissive;
      else mat.emissiveColor = BABYLON.Color3.Black();
    }

    if (this._shadow) {
      this._shadow.position.set(pos.x, this._groundY + 0.02, pos.z);
      const airH = Math.max(0, pos.y - baseY);
      this._shadow.scaling.setAll(Math.max(0.2, 1 - airH * 0.1));
    }
    this._updateBar(pos, cameraPos);
    return true;
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

  _cleanup() {
    for (const a of this.anims) { try { a.dispose(); } catch (_) {} }
    [this._hpBg, this._hpFg, this._hpLabel, this._shadow].forEach(m => { try { m?.dispose(); } catch (_) {} });
    try { this.root?.dispose(); } catch (_) {}
    this.root = null;
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
