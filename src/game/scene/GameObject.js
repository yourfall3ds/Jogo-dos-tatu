/**
 * GameObject.js
 * 
 * Classe unificada para gerenciar objetos interativos no cenário.
 * Suporta: física (moveWithCollisions), destrutibilidade, coletáveis e persistência.
 */
export class GameObject {
  /**
   * @param {BABYLON.Mesh}           mesh      - Corpo de colisão (pode ser invisível)
   * @param {BABYLON.Scene}          scene
   * @param {Object}                 options   - Configurações do objeto
   */
  constructor(mesh, scene, options = {}) {
    this.mesh = mesh;
    this.scene = scene;
    this._glb = options.glb || null;
    this._glbRotY0 = this._glb?.rotation?.y ?? 0;

    // ── Propriedades de Comportamento ──────────────────────────────
    this.isBreakable   = options.isBreakable ?? false;
    this.hasPhysics    = options.hasPhysics ?? false;
    this.isCollectable = options.isCollectable ?? false;
    this.persistenceKey = options.persistenceKey || null;

    // ── Parâmetros de Física ──────────────────────────────────────
    this.vel    = BABYLON.Vector3.Zero();
    this.angVel = BABYLON.Vector3.Zero();

    this.GRAVITY  = options.gravity ?? 26;
    this.BOUNCE   = options.bounce ?? 0.22;    // Coeficiente de ressalto
    this.ANG_DAMP = 0.86;                      // Amortecimento angular
    this.MAX_FALL = 32;
    this.MAX_SPD  = 18;
    this.MAX_ANG  = 11;

    // ── Estado ────────────────────────────────────────────────────
    this._sleeping = false;
    this._sleepT   = 0;
    this.SLEEP_THR = 0.07;
    this.SLEEP_DUR = 0.65;

    this._broken    = false;
    this._collected = false;
    this.hp         = options.hp ?? (this.isBreakable ? 3 : 0);
    this.itemId     = options.itemId || null; // ID do item no Inventory se coletável

    // ── Registro para Sistemas Externos ───────────────────────────
    mesh._gameObject = this;
    if (this._glb) this._glb._gameObject = this;

    mesh.checkCollisions = true;
    // Ajusta elipsoide se não definido
    if (!options.customEllipsoid) {
      mesh.ellipsoid = new BABYLON.Vector3(.56, .62, .56);
    }

    // Nota: Persistência de estado (broken/collected) removida a pedido do usuário.
    // A persistência agora é focada na CONFIGURAÇÃO do objeto no SceneEditor.
  }

  // ── Ações ──────────────────────────────────────────────────────
  
  /** Acorda o objeto se estiver dormindo */
  _wake() { this._sleeping = false; this._sleepT = 0; }

  /** Aplica impulso físico (mesmo que DynamicObject) */
  applyImpulse(force, hitPoint = null) {
    if (this._broken || this._collected || !this.hasPhysics) return;
    this._wake();

    this.vel.addInPlace(force);
    if (this.vel.length() > this.MAX_SPD) this.vel.normalize().scaleInPlace(this.MAX_SPD);

    const center = this.mesh.getAbsolutePosition();
    const offset = hitPoint
      ? hitPoint.subtract(center)
      : new BABYLON.Vector3((Math.random()-.5)*.5, .25, (Math.random()-.5)*.5);
    const torque = BABYLON.Vector3.Cross(offset.normalize(), force);
    this.angVel.addInPlace(torque.scale(3.8));
    if (this.angVel.length() > this.MAX_ANG) this.angVel.normalize().scaleInPlace(this.MAX_ANG);

    // Se for quebrável, toma dano
    if (this.isBreakable && this.hp > 0) {
      this.hp--;
      if (this.hp <= 0) this.break();
    }
  }

  /** Quebra o objeto */
  break(silent = false) {
    if (this._broken || this._collected) return;
    this._broken = true;
    this._breakT = 0;
    this._breakDur = 0.38;
    this._origScale  = this.mesh.scaling.clone();
    this._glbOrigScl = this._glb ? this._glb.scaling.clone() : null;

    if (!silent) {
      this._spawnDebris();
    } else {
      // Se for carregamento silencioso (persistência), apenas esconde
      this.mesh.setEnabled(false);
      if (this._glb) this._glb.setEnabled(false);
    }
  }

  /** Coleta o objeto */
  collect(silent = false) {
    if (this._collected || this._broken) return;
    this._collected = true;
    this.mesh.setEnabled(false);
    if (this._glb) this._glb.setEnabled(false);

    if (!silent) {
      // Adiciona ao inventário se houver um itemId
      if (this.itemId && window._gameInventory) {
        window._gameInventory.add(this.itemId, 1);
      }
    }
  }

  // ── Debris ─────────────────────────────────────────────────────
  _spawnDebris() {
    const pos = this.mesh.getAbsolutePosition();
    const mat = this._glb?.getChildMeshes(false)?.[0]?.material ?? this.mesh.material;

    for (let i = 0; i < 5; i++) {
      const s = 0.07 + Math.random() * 0.16;
      const d = BABYLON.MeshBuilder.CreateBox(`_deb_${Date.now()}_${i}`, { size: s }, this.scene);
      d.position.set(
        pos.x + (Math.random()-.5) * .9,
        pos.y + .1 + Math.random() * .4,
        pos.z + (Math.random()-.5) * .9
      );
      if (mat) d.material = mat;
      d.isPickable = false;

      // Cria um mini-GameObject para o debris (sem persistência)
      const deb = new GameObject(d, this.scene, { hasPhysics: true, bounce: 0.15, hp: 0 });
      deb._isDebris = true;
      deb._debrisLife = 2.2 + Math.random() * 1.2;
      deb.vel.set((Math.random()-.5)*10, 2+Math.random()*6, (Math.random()-.5)*10);
      deb.angVel.set((Math.random()-.5)*9, (Math.random()-.5)*9, (Math.random()-.5)*9);

      this.scene._levelDebris = this.scene._levelDebris || [];
      this.scene._levelDebris.push(deb);
    }
  }

  // ── Update ─────────────────────────────────────────────────────
  update(dt) {
    if (this._collected) return;

    // ── Animação de quebra ────────────────────────────────────────
    if (this._broken) {
      this._breakT += dt;
      const p = Math.min(1, this._breakT / this._breakDur);
      const sp = 1 - p;
      if (this._origScale)  this.mesh.scaling.copyFrom(this._origScale.scale(sp));
      if (this._glb && this._glbOrigScl) this._glb.scaling.copyFrom(this._glbOrigScl.scale(sp));
      if (p >= 1) {
        this.mesh.setEnabled(false);
        if (this._glb) this._glb.setEnabled(false);
      }
      return;
    }

    // ── Lógica de Coleta (Proximidade) ────────────────────────────
    if (this.isCollectable && window._gamePlayer) {
      const dist = BABYLON.Vector3.Distance(this.mesh.getAbsolutePosition(), window._gamePlayer.mesh.position);
      if (dist < 1.8) {
        this.collect();
        return;
      }
    }

    // ── Física ────────────────────────────────────────────────────
    if (!this.hasPhysics || this._sleeping) return;

    this.vel.y = Math.max(this.vel.y - this.GRAVITY * dt, -this.MAX_FALL);

    const prevY = this.mesh.position.y;
    this.mesh.moveWithCollisions(this.vel.scale(dt));
    const movedY = this.mesh.position.y - prevY;

    const onGround = this.vel.y < -0.01 && Math.abs(movedY) < Math.abs(this.vel.y * dt) * 0.20;

    if (onGround) {
      this.vel.y *= -this.BOUNCE;
      if (Math.abs(this.vel.y) < 0.45) this.vel.y = 0;
      this.vel.x *= 0.72; this.vel.z *= 0.72;
      this.angVel.scaleInPlace(0.60);
    } else {
      const drag = Math.exp(-dt * 1.0);
      this.vel.x *= drag; this.vel.z *= drag;
    }

    this.mesh.rotation.x += this.angVel.x * dt;
    this.mesh.rotation.y += this.angVel.y * dt;
    this.mesh.rotation.z += this.angVel.z * dt;
    this.angVel.scaleInPlace(Math.pow(this.ANG_DAMP, dt * 60));

    // Sincroniza GLB
    if (this._glb) {
      this._glb.position.copyFrom(this.mesh.position);
      this._glb.rotation.x = this.mesh.rotation.x;
      this._glb.rotation.y = this._glbRotY0 + this.mesh.rotation.y;
      this._glb.rotation.z = this.mesh.rotation.z;
    }

    // Sleep
    const totalSpeed = this.vel.length() + this.angVel.length() * 0.25;
    if (onGround && totalSpeed < this.SLEEP_THR) {
      this._sleepT += dt;
      if (this._sleepT >= this.SLEEP_DUR) {
        this.vel.setAll(0); this.angVel.setAll(0);
        this._sleeping = true;
      }
    } else {
      this._sleepT = 0;
    }

    // Ciclo de vida do debris
    if (this._isDebris) {
      this._debrisLife -= dt;
      if (this._debrisLife < 1.0) this.mesh.visibility = this._debrisLife;
      if (this._debrisLife <= 0)  this.mesh.setEnabled(false);
    }
  }
}
