// ─────────────────────────────────────────────────────────────────
//  Player — controller FPS com moveWithCollisions (sem Havok)
//  Camera via setTarget() — mais confiável que .rotation direto
// ─────────────────────────────────────────────────────────────────
import { WallJumpController } from './WallJumpController.js';
import { WeaponSystem }       from './WeaponSystem.js';
import { PlayerAnimator }     from './PlayerAnimator.js';
import { AnimConfigUI }       from './AnimConfigUI.js';

export class Player {
  constructor(scene, canvas, input, level = null) {
    this.scene  = scene;
    this.canvas = canvas;
    this.input  = input;
    this.level  = level;

    // ── Câmera ──────────────────────────────────────────────────────
    this.yaw   = 0;     // graus (horizontal)
    this.pitch = 0;     // graus (vertical)
    this.MOUSE_SENS = 0.15;

    // ── Dimensões ───────────────────────────────────────────────────
    this.HEIGHT = 1.8;
    this.RADIUS = 0.40;

    // ── Parâmetros de movimento ─────────────────────────────────────
    this.SPEED       = 11;
    this.AIR_CTRL    = 0.60;
    this.JUMP_FORCE  = 15.5;
    this.GRAVITY     = 38;
    this.MAX_FALL    = 58;
    this.WALL_SLIDE  = 3.5;
    this.GROUND_SNAP = -0.6;

    this._vx = 0;
    this._vz = 0;
    this.velY = 0;
    this.isGrounded   = false;
    this._wasGrounded = false;

    this._wasSpace = false;
    this._wasR     = false;
    this._wasV     = false;
    this._wasDigit1 = false;
    this._wasDigit2 = false;
    this._wasG      = false;

    // ── Novo Sistema de Estados ─────────────────────────────────────
    this.stateMachine = null; // Setado no main.js quando o sistema de combate carrega
    this.combatSystem = null;
    this.animLib      = null;
    this.animCtrl     = null;

    // ── Modo câmera ─────────────────────────────────────────────────
    this._tpsMode  = false;   // false = FPS, true = 3ª pessoa (tecla V)
    this.animator  = null;    // PlayerAnimator (setado quando GLB carrega)

    // Landing shake
    this._prevY     = 0;
    this._landShake = 0;
    this._landMag   = 0;

    // Damage shake + knockback
    this._dmgShakeT   = 0;
    this._dmgShakeMag = 0;
    this._kbVx        = 0;   // knockback velocity X
    this._kbVz        = 0;   // knockback velocity Z

    // ── Esquiva (Dodge) ─────────────────────────────────────────────
    this._dodgeT      = 0;
    this._wasShift    = false;

    // ── Dash (double-tap W) ─────────────────────────────────────────
    this._dashT       = 0;   // timer ativo do dash (>0 = dashing)
    this._dashCdT     = 0;   // cooldown entre dashes
    this.DASH_DUR     = 0.28;
    this.DASH_FORCE   = 42;  // bem mais forte que a corrida (SPEED=11)

    // ── Mira (ADS — Aim Down Sights) ────────────────────────────────
    this._aiming      = false;
    this.FOV_NORMAL   = 1.38;
    this.FOV_AIM      = 0.72;
    this._aimFovCur   = 1.38;

    // ── Vida ────────────────────────────────────────────────────────
    this.hp            = 100;
    this.maxHp         = 100;
    this._damageFlashT = 0;   // vignetted flash ao tomar dano
    this._dead         = false;
    this.onRespawn     = null; // callback: () => void — chamado após respawn

    this._createMesh();
    this._createCamera();

    this.wallJump    = new WallJumpController(this);
    this.weapon      = new WeaponSystem(this.camera, scene, level);
    this.animConfig  = new AnimConfigUI(this);   // painel de config — tecla K abre

    this._hitFlashT = 0;
    this._armShootT = 0;   // timer da animação de tiro em TPS
    this.weapon.onHit   = () => { this._hitFlashT = .14; };
    this.weapon.onFired = () => { this.animator?.onShoot(); this._armShootT = 0.28; };
    this.weapon.onWeaponSwitched = (w) => {
      if (this.stateMachine) {
        this.stateMachine.isArmedFlag = true;
        this.stateMachine.setState('armed');
      }
      this._updateWeaponVisibility();
    };

    this.spawn();
  }

  // ── Mesh do jogador ───────────────────────────────────────────────
  _createMesh() {
    this.mesh = BABYLON.MeshBuilder.CreateCapsule('playerCapsule', {
      radius: this.RADIUS, height: this.HEIGHT,
      capSubdivisions: 4, tessellation: 8,
    }, this.scene);

    const m = new BABYLON.StandardMaterial('playerMat', this.scene);
    m.alpha = 0;
    this.mesh.material   = m;
    this.mesh.isPickable = false;
    this.mesh.ellipsoid       = new BABYLON.Vector3(this.RADIUS, this.HEIGHT / 2, this.RADIUS);
    this.mesh.ellipsoidOffset = BABYLON.Vector3.Zero();
    this.mesh._playerRef = this; // Para que o CombatSystem acesse o animator
  }

  // ── Câmera FPS ────────────────────────────────────────────────────
  _createCamera() {
    this.camera = new BABYLON.FreeCamera('fpsCam', BABYLON.Vector3.Zero(), this.scene);
    this.camera.minZ = 0.05;
    this.camera.maxZ = 600;
    this.camera.fov  = 1.38;
    this.camera.inputs.clear();          // remove inputs padrão
    this.scene.activeCamera = this.camera;

    // Anti-aliasing FXAA → mata o "tremido/crawling" das bordas ao andar
    try {
      this._fxaa = new BABYLON.FxaaPostProcess('fpsFxaa', 1.0, this.camera);
    } catch (_) {}
  }

  spawn() {
    this.mesh.position.set(0, 2.5, 0);
    this._vx = 0; this._vz = 0; this.velY = 0;
    this._prevY = 2.5;
  }

  lockPointer() { this.canvas.requestPointerLock(); }

  // ── Ground check ──────────────────────────────────────────────────
  //  Usa 5 raios (centro + 4 cantos do raio do capsule) para não "perder"
  //  o chão em frestas/juntas entre boxes — o que causava o flicker de
  //  "parece que está caindo" ao andar.
  _checkGrounded() {
    const len = this.HEIGHT / 2 + 0.28;
    const r   = this.RADIUS * 0.7;
    const c   = this.mesh.position;
    const offsets = [
      [0, 0], [r, 0], [-r, 0], [0, r], [0, -r],
    ];
    const filter = m => m !== this.mesh && m.checkCollisions === true && m.isPickable !== false;
    for (const [ox, oz] of offsets) {
      const origin = new BABYLON.Vector3(c.x + ox, c.y, c.z + oz);
      const hit = this.scene.pickWithRay(new BABYLON.Ray(origin, BABYLON.Vector3.Down(), len), filter);
      if (hit?.hit) return true;
    }
    return false;
  }

  // ── Movimento com auto step-up ────────────────────────────────────
  //  Antes de mover, sonda à frente: se há um obstáculo BAIXO (≤ STEP)
  //  com espaço livre acima, levanta o player até o topo do degrau e
  //  então move. Permite subir escadas/degraus suavemente sem o
  //  ellipsoid "engatar" em cada degrau (o que causava o spasm/derreter).
  _moveWithStepUp(disp) {
    const STEP     = 0.70;   // altura máxima de degrau que sobe sozinho (escadas blocadas)
    const horizLen = Math.hypot(disp.x, disp.z);

    if (this.isGrounded && horizLen > 1e-4 && this.velY <= 1) {
      const dir   = new BABYLON.Vector3(disp.x, 0, disp.z).scale(1 / horizLen);
      const pos   = this.mesh.position;
      const footY = pos.y - this.HEIGHT / 2;             // base do ellipsoid
      const reach = this.RADIUS + 0.30;                  // alcance da sondagem
      const filter = m => m !== this.mesh && m.checkCollisions === true && m.isPickable !== false;

      // 1) raio na altura do pé → detecta a face do degrau
      const lowHit = this.scene.pickWithRay(
        new BABYLON.Ray(new BABYLON.Vector3(pos.x, footY + 0.08, pos.z), dir, reach), filter);

      if (lowHit?.hit) {
        // 2) acha a altura do topo do degrau logo à frente (raio pra baixo)
        const ax = pos.x + dir.x * reach;
        const az = pos.z + dir.z * reach;
        const downHit = this.scene.pickWithRay(
          new BABYLON.Ray(new BABYLON.Vector3(ax, footY + STEP + 0.25, az), BABYLON.Vector3.Down(), STEP + 0.4), filter);

        if (downHit?.hit && downHit.pickedPoint) {
          const rise = downHit.pickedPoint.y - footY;
          // Degrau transponível (não uma parede alta — rise dentro do limite).
          // Sem o check 'highHit' antigo, que batia no PRÓXIMO degrau e
          // travava o player no meio da escada.
          if (rise > 0.05 && rise <= STEP) {
            // head-room: garante que cabe (sem teto baixo) no novo nível
            const headHit = this.scene.pickWithRay(
              new BABYLON.Ray(new BABYLON.Vector3(ax, downHit.pickedPoint.y + 0.05, az),
                              BABYLON.Vector3.Up(), this.HEIGHT * 0.85), filter);
            if (!headHit?.hit) {
              this.mesh.position.y = downHit.pickedPoint.y + this.HEIGHT / 2;
              if (this.velY < 0) this.velY = this.GROUND_SNAP;
            }
          }
        }
      }
    }

    this.mesh.moveWithCollisions(disp);
  }

  // ── Ground clamp ──────────────────────────────────────────────────
  //  Raycast pra baixo a partir de ACIMA dos pés. Se o player afundou
  //  num objeto (pés abaixo da superfície), sobe ele até a superfície.
  //  Só sobe (nunca puxa pra baixo) → não atrapalha queda/pulo natural.
  _groundClamp() {
    if (this.velY > 0.5) return;   // subindo (pulo) → não clampa
    const c = this.mesh.position;
    const r = this.RADIUS * 0.7;
    const offsets = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    const filter = m => m !== this.mesh && m.checkCollisions === true && m.isPickable !== false;

    const fromY = c.y + 0.5;                       // bem acima dos pés
    const len   = 0.5 + this.HEIGHT / 2 + 0.30;    // alcança até ~0.3 abaixo dos pés

    let bestY = -Infinity;
    for (const [ox, oz] of offsets) {
      const origin = new BABYLON.Vector3(c.x + ox, fromY, c.z + oz);
      const hit = this.scene.pickWithRay(new BABYLON.Ray(origin, BABYLON.Vector3.Down(), len), filter);
      if (hit?.hit && hit.pickedPoint && hit.pickedPoint.y > bestY) bestY = hit.pickedPoint.y;
    }
    if (bestY === -Infinity) return;               // nada embaixo → não mexe

    const targetY = bestY + this.HEIGHT / 2;
    if (targetY > c.y + 0.001) {                   // afundou → sobe até a superfície
      this.mesh.position.y = targetY;
      if (this.velY < 0) this.velY = this.GROUND_SNAP;
    }
  }

  // ── Update principal ──────────────────────────────────────────────
  update(dt) {
    // Só roda após o jogador ter clicado em JOGAR
    if (!this.input.gameActive) return;

    // ── 1. Mouse look — funciona com ou sem pointer lock ─────────────
    const { dx, dy } = this.input.consumeMouseDelta();
    this.yaw   += dx * this.MOUSE_SENS;
    this.pitch  = Math.max(-88, Math.min(88, this.pitch + dy * this.MOUSE_SENS));

    // ── 2. Grounded ──────────────────────────────────────────────────
    this._wasGrounded = this.isGrounded;
    this.isGrounded   = this._checkGrounded();

    // Coyote time: "grounded visual" só vira false após ~0.12s no ar.
    // Evita o flicker de animação de jump/queda ao passar por frestas
    // do chão enquanto anda.
    if (this.isGrounded) {
      this._coyoteT = 0.12;
    } else if (this._coyoteT > 0) {
      this._coyoteT -= dt;
    }
    this.groundedVisual = this.isGrounded || (this._coyoteT > 0 && this.velY <= 0.5);

    if (!this._wasGrounded && this.isGrounded && this.velY < -5) {
      this._landMag   = Math.min(Math.abs(this.velY), 25);
      this._landShake = 1.0;
    }

    // ── 3. Gravidade manual ──────────────────────────────────────────
    if (this.isGrounded) {
      if (this.velY < this.GROUND_SNAP) this.velY = this.GROUND_SNAP;
    } else {
      this.velY -= this.GRAVITY * dt;
      this.velY  = Math.max(this.velY, -this.MAX_FALL);
    }

    if (this.wallJump.isOnWall() && this.velY < -this.WALL_SLIDE) {
      this.velY = BABYLON.Scalar.Lerp(this.velY, -this.WALL_SLIDE, 0.30);
    }

    // ── 4. Wall jump update ──────────────────────────────────────────
    this.wallJump.update(dt, this.mesh.position, this.isGrounded);

    // ── 5. Movimento horizontal ──────────────────────────────────────
    const canMove = this.stateMachine ? this.stateMachine.canMove() : !this._dead;
    const yawRad = BABYLON.Tools.ToRadians(this.yaw);
    const fwd    = new BABYLON.Vector3( Math.sin(yawRad), 0,  Math.cos(yawRad));
    const right  = new BABYLON.Vector3( Math.cos(yawRad), 0, -Math.sin(yawRad));

    let moveDir = BABYLON.Vector3.Zero();
    if (canMove) {
      if (this.input.isDown('KeyW')) moveDir.addInPlace(fwd);
      if (this.input.isDown('KeyS')) moveDir.subtractInPlace(fwd);
      if (this.input.isDown('KeyA')) moveDir.subtractInPlace(right);
      if (this.input.isDown('KeyD')) moveDir.addInPlace(right);
    }
    const moving = moveDir.length() > 0.01;
    if (moving) moveDir.normalize();

    // ── 5.1 Esquiva (Dodge) ──────────────────────────────────────────
    const shiftNow = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const dodgePress = shiftNow && !this._wasShift && canMove && this.isGrounded && moving && this._dodgeT <= 0;
    this._wasShift = shiftNow;

    if (dodgePress && this.stateMachine) {
      this._dodgeT = 0.55; // Janela de invulnerabilidade/boost
      this.stateMachine.setState('dodging');
      this.animCtrl?.play('dodge', { 
        loop: false, 
        speed: 1.4,
        onComplete: () => {
          if (this.stateMachine?.state === 'dodging') {
            this.stateMachine.setState(this.stateMachine.isArmedFlag ? 'armed' : 'unarmed');
          }
        }
      });
    }

    // ── 5.2 Dash (double-tap W) ─────────────────────────────────────
    if (this.input.consumeDoubleTapW() && canMove && this._dashT <= 0 && this._dodgeT <= 0 && this._dashCdT <= 0) {
      this._dashT = this.DASH_DUR;
      this._dashCdT = 0.45;   // cooldown curto: evita spam mesmo com toques válidos
      // Dash vai pra FRENTE (direção da câmera) — ou direção do movimento se houver
      const dashDir = moveDir.length() > 0.01 ? moveDir : fwd;
      this._vx = dashDir.x * this.DASH_FORCE;
      this._vz = dashDir.z * this.DASH_FORCE;
      if (this.isGrounded) this.velY = 4;   // pequeno hop
      this._dashFovT = 0.18;                 // FOV punch (sensação de velocidade)
      this._spawnDashFX(dashDir);            // efeito visual de rastro
      this.sounds?.playNow?.('dash');
    }
    if (this._dashT   > 0) this._dashT   -= dt;
    if (this._dashCdT > 0) this._dashCdT -= dt;
    if (this._dashFovT > 0) {
      this._dashFovT -= dt;
      const t = 1 - Math.max(0, this._dashFovT / 0.18);
      this._aimFovCur = this.camera.fov = BABYLON.Scalar.Lerp(
        this._aiming ? this.FOV_AIM : this.FOV_NORMAL,
        this._aiming ? this.FOV_AIM + 0.10 : this.FOV_NORMAL + 0.12,
        Math.sin(t * Math.PI)
      );
    }

    let spd = this.SPEED;
    if (this._dodgeT > 0) {
      this._dodgeT -= dt;
      spd *= 1.8;
    } else {
      spd *= (this.isGrounded ? 1 : this.AIR_CTRL);
    }

    if (this._dashT > 0) {
      // ── DASH ATIVO ─────────────────────────────────────────────────
      // Mantém o impulso forte (sem Lerp pra velocidade normal), só com
      // leve decaimento. É isso que faz o dash IR MAIS LONGE que correr.
      this._vx *= 0.92;
      this._vz *= 0.92;
    } else {
      const smooth = this.isGrounded ? 0.30 : 0.10;
      this._vx = BABYLON.Scalar.Lerp(this._vx, moveDir.x * spd, smooth);
      this._vz = BABYLON.Scalar.Lerp(this._vz, moveDir.z * spd, smooth);
    }

    // ── 6. Pulo / Wall jump ──────────────────────────────────────────
    const spaceNow  = this.input.isDown('Space');
    const jumpPress = spaceNow && !this._wasSpace && canMove;
    this._wasSpace  = spaceNow;

    if (jumpPress) {
      if (this.isGrounded) {
        this.velY = this.JUMP_FORCE;
      } else {
        const wjVel = this.wallJump.tryWallJump();
        if (wjVel) {
          this._vx  = wjVel.x;
          this._vz  = wjVel.z;
          this.velY = wjVel.y;
          this.weapon.applyWallJumpTilt(wjVel.x >= 0 ? 14 : -14);
          this.animator?.onWallJump();
        }
      }
    }

    // ── 7. Knockback de ataque inimigo ──────────────────────────────
    if (Math.abs(this._kbVx) + Math.abs(this._kbVz) > 0.05) {
      const kbDrag = Math.exp(-dt * 7);
      this._kbVx *= kbDrag;
      this._kbVz *= kbDrag;
    } else {
      this._kbVx = 0; this._kbVz = 0;
    }

    // ── 8. Aplicar deslocamento (com auto step-up p/ escadas/degraus) ─
    const disp = new BABYLON.Vector3(
      (this._vx + this._kbVx) * dt,
      this.velY * dt,
      (this._vz + this._kbVz) * dt
    );
    this._moveWithStepUp(disp);

    // ── Ground clamp: tira o player de DENTRO de objetos ─────────────
    //  A colisão por malha (ellipsoid) afunda em GLBs irregulares. Aqui
    //  raycast acha a superfície e SÓ sobe o player até ela (nunca puxa
    //  pra baixo) — corrige o "afundar" sem atrapalhar pulo/queda.
    this._groundClamp();

    // ── Rotação do CAPSULE: SEMPRE 0 ─────────────────────────────────
    //  O capsule (this.mesh) é só colisão. O modelo visível (animator.root)
    //  é filho dele — se o capsule girasse, a rotação se SOMARIA à do root
    //  (que já controla o facing), bagunçando tudo ao andar. Travamos em 0
    //  pra que SÓ o animator.root controle a direção que o personagem encara.
    if (this.animator) {
      this.mesh.rotationQuaternion = null;
      this.mesh.rotation.y = 0;
    }

    // Detecta teto
    const actualDY = this.mesh.position.y - this._prevY;
    if (this.velY > 0 && actualDY < this.velY * dt * 0.1) this.velY = 0;
    this._prevY = this.mesh.position.y;

    // ── 9. Reload + Tiro ─────────────────────────────────────────────
    // No modo construção, R é "girar" (BuildMode) — não recarrega a arma.
    const _building = window._buildMode?._state === 'placing';
    const rNow = this.input.isDown('KeyR') && !_building;
    if (rNow && !this._wasR) this.weapon.startReload();
    this._wasR = rNow;

    // ── LMB — soco ou tiro ──────────────────────────────────────────
    if (this.input.consumeClick()) {
      const isArmed = this.stateMachine ? this.stateMachine.isArmedFlag : true;
      if (!isArmed && this.combatSystem) {
        this.combatSystem.lightAttack();
      } else {
        this.weapon.shoot();
      }
    }

    // ── RMB — chute (desarmado) ou mira (armado) ─────────────────
    if (this.input.consumeRightClick()) {
      const isArmed = this.stateMachine ? this.stateMachine.isArmedFlag : true;
      if (!isArmed && this.combatSystem) {
        this.combatSystem.kickAttack();
      } else {
        this._toggleAim();
      }
    }

    // ── Aim FOV suave ────────────────────────────────────────────
    // Zoom de mira só faz sentido em FPS; em TPS a câmera se aproxima
    // (tratado em _updateCamera). _dashFovT pode estar undefined → guarda.
    if (!(this._dashFovT > 0)) {
      const wantAim = this._aiming && !this._tpsMode;
      const targetFov = wantAim ? this.FOV_AIM : this.FOV_NORMAL;
      this._aimFovCur = BABYLON.Scalar.Lerp(this._aimFovCur ?? this.FOV_NORMAL, targetFov, Math.min(1, dt * 10));
      this.camera.fov = this._aimFovCur;
    }

    // ── Indicador de mira no HUD ─────────────────────────────────
    const aimEl = document.getElementById('aim-indicator');
    if (aimEl) aimEl.style.opacity = this._aiming ? '1' : '0';

    // ── 10. Troca de Arma (scroll do mouse) ──────────────────────────
    //  1-9 agora é o inventário; trocar de arma vai pro scroll.
    const wheel = this.input.consumeWheel?.() || 0;
    if (wheel !== 0 && this.weapon?.weapons?.length > 1) {
      const n   = this.weapon.weapons.length;
      const cur = this.weapon.currentWeaponIndex || 0;
      const next = ((cur + wheel) % n + n) % n;   // cicla com wrap
      this.weapon.switchWeapon(next);
      this._updateWeaponVisibility();
    }

    const gNow = this.input.isDown('KeyG');
    if (gNow && !this._wasG) {
      if (this.stateMachine) {
        if (this.stateMachine.state === 'armed') {
          this.stateMachine.dropWeapon();
          console.log("🧤 Modo Luta Ativado!");
        } else {
          this.stateMachine.equipWeapon();
          console.log("🔫 Modo Arma Ativado!");
        }
        this._updateWeaponVisibility();
      }
    }
    this._wasG = gNow;

    // ── 11. Toggle câmera (V) + animator ───────────────────────────
    const vNow = this.input.isDown('KeyV');
    if (vNow && !this._wasV) {
      this._tpsMode = !this._tpsMode;
      this.animator?.setVisible(this._tpsMode);
      this._updateWeaponVisibility();
    }
    this._wasV = vNow;

    // ── DEBUG HITBOX (F2) ──────────────────────────────────────────
    const f2Now = this.input.isDown('F2');
    if (f2Now && !this._wasF2) {
      this._debugHitbox = !this._debugHitbox;
      
      // Hitboxes dos Inimigos
      this.scene.meshes.forEach(m => {
        if (m._enemyRef) {
          m.showBoundingBox = this._debugHitbox;
        }
      });
      console.log(`[DEBUG] Visão de Hitbox / Colliders: ${this._debugHitbox ? "LIGADA" : "DESLIGADA"}`);
    }
    this._wasF2 = f2Now;

    // Atualiza continuamente a posição das esferas nas mãos/pés se o debug estiver ligado
    if (this._debugHitbox && this.combatSystem && this.combatSystem.limbHitboxes) {
      Object.entries(this.combatSystem.limbHitboxes).forEach(([boneName, box]) => {
        box.isVisible = true;
        box.showBoundingBox = true;
        
        if (!box.material) {
          const mat = new BABYLON.StandardMaterial("debugLimbMat", this.scene);
          mat.emissiveColor = new BABYLON.Color3(1, 0, 0); 
          mat.alpha = 0.5;
          mat.wireframe = true;
          mat.disableLighting = true;
          box.material = mat;
        }

        if (this.animator) {
          const socket = this.animator.getSocketNode(boneName);
          if (socket) {
            box.parent = null;
            box.position.copyFrom(socket.getAbsolutePosition());
          }
        }
      });
    } else if (!this._debugHitbox && this.combatSystem && this.combatSystem.limbHitboxes) {
       Object.values(this.combatSystem.limbHitboxes).forEach(box => {
          box.isVisible = false;
          box.showBoundingBox = false;
       });
    }

    if (this.animator) {
      const speed      = Math.hypot(this._vx, this._vz);
      const animMoving = speed > 0.8;
      const movingBack = this.input.isDown('KeyS') && !this.input.isDown('KeyW');

      // Ângulo do vetor de movimento no mundo (para o personagem girar e encarar)
      const moveDirAngle = (moveDir.length() > 0.01)
        ? Math.atan2(moveDir.x, moveDir.z)
        : null;

      // Prioridade para o novo sistema dinâmico se carregado
      if (this.animLib && this.animCtrl && this.animLib.has('idle')) {
        // Tick do crossfade por peso (suaviza transições — tira o "robótico")
        this.animCtrl.update(dt);

        // Rotação manual do mesh root (já que o novo controlador não faz isso sozinho)
        const yawRad = BABYLON.Tools.ToRadians(this.yaw);
        // ── REGRA DE FACING ──────────────────────────────────────────
        //  Encara a CÂMERA (de costas p/ câmera em TPS, olhando p/ frente)
        //  quando: armado/mirando OU em movimento. Só fica "livre" quando
        //  PARADO e DESARMADO (aí pode girar à toa sem bugar nada).
        //  Como o alvo é sempre yawRad, o personagem nunca vira de lado ao
        //  andar — vai sempre pra frente, costas pra câmera.
        const isArmedNow = this.stateMachine && this.stateMachine.state === 'armed';
        const targetYaw = yawRad;

        if (this.animator.root) {
          // Garante euler (rotationQuaternion bloquearia rotation.y)
          if (this.animator.root.rotationQuaternion) this.animator.root.rotationQuaternion = null;
          const curYaw = this.animator.root.rotation.y;
          // SEM offset: +π e -π davam o MESMO ângulo (de frente). A única
          // opção de virar 180° é remover o offset → personagem de COSTAS
          // pra câmera (olhando pra frente), correto em TPS.
          let da = targetYaw - curYaw;
          while (da >  Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          // Armado gira mais rápido (responsivo à mira); desarmado mais suave
          const rotSpeed = isArmedNow ? 20 : 14;
          this.animator.root.rotation.y += da * Math.min(1, dt * rotSpeed);
        }

        const isAttacking = this.stateMachine && this.stateMachine.isAttacking();
        if (this._armShootT > 0) this._armShootT -= dt;

        if (!isAttacking) {
          const isArmed = this.stateMachine && this.stateMachine.state === 'armed';
          const groundedAnim = this.groundedVisual ?? this.isGrounded;

          if (groundedAnim && isArmed && this.layered) {
            // ── ARMADO: animação em CAMADAS ──────────────────────────
            //  Pernas (lower) = locomoção real (idle/walk/run)
            //  Tronco (upper) = postura de tiro/recarga/mira
            //  → personagem anda/corre com as pernas E aponta com o tronco
            this.layered.setEnabled(true);
            this.animCtrl.stopAll();   // libera o controlador de corpo inteiro

            // Pernas: escolhe pela velocidade. Como o corpo está travado
            // encarando a câmera, o movimento é strafe — recuar usa walk_back.
            let lowerKey, lowerSpd = 1.0;
            if (movingBack && speed > 0.8 && this.animLib.has('aim_walk_back')) {
              lowerKey = 'aim_walk_back'; lowerSpd = Math.max(0.6, speed / 4);
            } else if (speed > 6.5) { lowerKey = 'run';  lowerSpd = speed / 11; }
            else if (speed > 0.8)   { lowerKey = 'walk'; lowerSpd = Math.max(0.6, speed / 4); }
            else                    { lowerKey = 'idle'; }

            // Tronco: mira / tiro / recarga. O giro do "aim_hold" está nas
            // PERNAS — como aqui só usamos os ossos de cima, o giro some sozinho.
            let upperKey, upperLoop = true;
            if (this.weapon.reloading)    { upperKey = 'aim_reload'; }
            else if (this._armShootT > 0) { upperKey = 'aim_shoot'; }
            else                          { upperKey = 'aim_hold'; }  // pose de prontidão (segurando arma)

            // Fallbacks se alguma anim não existir
            if (!this.animLib.has(upperKey)) upperKey = this.animLib.has('aim_hold') ? 'aim_hold' : 'aim_shoot';
            if (!this.animLib.has(lowerKey)) lowerKey = 'idle';

            this.layered.playLayer('lower', lowerKey, { loop: true, speed: lowerSpd, fade: 0.16 });
            this.layered.playLayer('upper', upperKey, { loop: upperLoop, speed: 1.0, fade: 0.14 });
            this.layered.update(dt);

          } else {
            // ── DESARMADO ou NO AR: corpo inteiro normal ─────────────
            if (this.layered) this.layered.setEnabled(false);
            if (groundedAnim) {
              this.animCtrl.updateLocomotion(speed / 11);
            } else {
              this.animCtrl.play("jump", { loop: true });
            }
          }
        }
      } else {
        // Fallback para o animator antigo
        this.animator.update(dt, {
          grounded     : this.isGrounded,
          moving       : animMoving,
          movingBack,
          speed,
          velY         : this.velY,
          onWall       : this.wallJump.isOnWall(),
          reloading    : this.weapon.reloading,
          dead         : this._dead,
          yawRad       : BABYLON.Tools.ToRadians(this.yaw),
          moveDirAngle,
          tpsMode      : this._tpsMode,
        });
      }

      // ── Strip root motion HORIZONTAL ────────────────────────────────
      //  As animações (principalmente soco/chute do GLB) têm root motion
      //  que desloca o nó raiz — fazia o personagem "andar pra trás" ao
      //  golpear. Zeramos X/Z todo frame → ele bate PARADO, no capsule.
      if (this.animator?.root) {
        this.animator.root.position.x = 0;
        this.animator.root.position.z = 0;
      }
    }

    // ── 10. Câmera + arma ────────────────────────────────────────────
    this._updateCamera();

    // Em TPS: passa ponto de origem do ray para a arma (nível dos olhos, sem parallaxe)
    if (this._tpsMode) {
      const eyePos = this.mesh.position.clone();
      eyePos.y += this.HEIGHT / 2 - 0.10;
      this.weapon._tpsRayOrigin = eyePos;
    } else {
      this.weapon._tpsRayOrigin = null;
    }

    // Mira ADS só vale em FPS armado; em TPS a arma fica na mão (sem ADS de viewmodel)
    this.weapon.setAiming(this._aiming && !this._tpsMode);
    this.weapon.update(dt, moving, Math.hypot(this._vx, this._vz));

    // ── Aim procedural em TPS armado ─────────────────────────────────
    //  A pose da animação aponta a arma pro lado e não acompanha o pitch.
    //  Corrigimos orientando a arma (e o antebraço) pra direção exata da
    //  mira da câmera, a cada frame, DEPOIS da animação rodar.
    this._applyTPSAim(dt);

    // ── 11. Morte por queda ───────────────────────────────────────────
    // Chão fica em y≈0 → kill plane 10m abaixo. Sem paredes de borda, o
    // jogador cai do mapa e MORRE (animação de morte + respawn).
    if (this.mesh.position.y < -10 && !this._dead) {
      this._triggerDeath({ fall: true });
    }
    this._hitFlashT    = Math.max(0, this._hitFlashT - dt);
    this._damageFlashT = Math.max(0, this._damageFlashT - dt);
  }

  // ── Seta o modelo 3D do personagem com animator ───────────────────
  setMouseCharacter(meshes, animGroups, shadowGen) {
    // Se já houver um animator ou root antigo, limpamos para evitar duplicidade (Dois Ratos)
    if (this.animator) {
      if (this.animator.root) {
        this.animator.root.getDescendants().forEach(d => d.dispose());
        this.animator.root.dispose();
      }
      this.animator = null;
    }

    this.animator = new PlayerAnimator();
    this.animator.setup(meshes, animGroups, this.mesh, this.HEIGHT, shadowGen);

    // Anexa as armas já carregadas ao novo esqueleto
    this.attachCurrentWeaponToAnimator();

    // Conecta o painel de config ao animator (carrega mapa salvo do localStorage)
    this.animConfig.setAnimator(this.animator);

    // Aplica o modo de câmera atual
    this.animator.setVisible(this._tpsMode);
    this._updateWeaponVisibility();
  }

  /**
   * Pega o mesh de 3ª pessoa da arma atual e anexa ao osso da mão do personagem.
   */
  attachCurrentWeaponToAnimator() {
    if (!this.animator) return;
    
    this.weapon.weapons.forEach(w => {
      const tpsMesh = this.weapon.getTPSWeaponMesh(w.id);
      if (tpsMesh) {
        // Tenta 'RightHand' ou 'Hand_R' dependendo do modelo
        this.animator.attachWeapon(tpsMesh, 'RightHand'); 
      }
    });
    this._updateWeaponVisibility();
  }

  _updateWeaponVisibility() {
    const curW = this.weapon.weapons[this.weapon.currentWeaponIndex];
    const isUnarmed = this.stateMachine && this.stateMachine.state === 'unarmed';
    
    // Esconde todas primeiro (FPS e TPS)
    this.weapon.weapons.forEach(w => {
      const fpsM = this.weapon._weaponMeshes[w.id];
      const tpsM = this.weapon._tpsMeshes[w.id];
      if (fpsM) fpsM.setEnabled(false);
      if (tpsM) {
        tpsM.setEnabled(false);
        tpsM.getChildMeshes().forEach(m => m.setEnabled(false));
      }
    });

    // Se estiver desarmado, não mostra nada
    if (isUnarmed) {
      if (this.weapon._root) this.weapon._root.setEnabled(false);
      return;
    }

    // Mostra apenas a correta baseado na câmera
    if (this._tpsMode) {
      const tpsM = this.weapon._tpsMeshes[curW.id];
      if (tpsM) {
        // Re-anexa ao osso da mão TODA vez (robusto contra recriação do animator)
        if (this.animator) {
          this.animator.attachWeapon(tpsM, 'RightHand');
          curW.applyToMesh?.(tpsM, true);   // restaura offset/rotação/escala TPS
        }
        tpsM.setEnabled(true);
        tpsM.getChildMeshes().forEach(m => { m.setEnabled(true); m.isVisible = true; m.isPickable = false; });
      }
      if (this.weapon._root) this.weapon._root.setEnabled(false);
      if (this.weapon._glbRoot) this.weapon._glbRoot.setEnabled(false);
    } else {
      // FPS: o nó-pai (weaponRoot, preso à câmera) foi desabilitado ao
      // entrar em TPS — precisa SEMPRE ser reabilitado, senão a arma some.
      if (this.weapon._root) this.weapon._root.setEnabled(true);

      const fpsM = this.weapon._weaponMeshes[curW.id];
      if (fpsM) {
        fpsM.setEnabled(true);
        fpsM.getChildMeshes().forEach(m => { m.setEnabled(true); m.isVisible = true; });
      }
      // Garante que o GLB root da arma atual também esteja ativo
      if (this.weapon._glbRoot) this.weapon._glbRoot.setEnabled(true);
    }
  }

  // ── Toma dano de inimigo ──────────────────────────────────────────
  // attackType: 'melee' | 'bite' | 'slam'
  // fromPos: BABYLON.Vector3 — posição do atacante (para knockback)
  // kbForce: Força do knockback enviada pelo inimigo
  takeDamage(amount, attackType = 'melee', fromPos = null, kbForce = 0) {
    if (this._dead) return;
    // Invincibility frames: não toma dano se acabou de tomar
    if (this._damageFlashT > 0.25) return;

    // ── Stats: esquiva (anula dano) + defesa (reduz dano) ────────────
    if (this.stats) {
      if (Math.random() < this.stats.dodgeChance()) {
        this._damageFlashT = 0.30;   // breve i-frame mesmo esquivando
        return;
      }
      amount *= this.stats.defenseFactor();
    }

    this.hp = Math.max(0, this.hp - amount);
    this._damageFlashT = 0.55;

    // ── Camera shake por tipo de ataque ───────────────────────────
    if (attackType === 'slam') {
      this._dmgShakeT   = 0.60;
      this._dmgShakeMag = 0.40;
    } else if (attackType === 'bite') {
      this._dmgShakeT   = 0.45;
      this._dmgShakeMag = 0.35; // Tremor bem forte para mordidas violentas
    } else {
      this._dmgShakeT   = 0.25;
      this._dmgShakeMag = 0.15;
    }

    // ── Knockback horizontal ──────────────────────────────────────
    if (fromPos && kbForce > 0) {
      const dx   = this.mesh.position.x - fromPos.x;
      const dz   = this.mesh.position.z - fromPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      
      // Usa o kbForce enviado ou fallback baseado no tipo
      const force = kbForce > 0 ? kbForce : (attackType === 'slam' ? 14 : attackType === 'bite' ? 8 : 5);
      
      this._kbVx = (dx / dist) * force;
      this._kbVz = (dz / dist) * force;
      
      if (attackType === 'slam' || kbForce > 20) {
        this.velY = attackType === 'slam' ? 7 : 4; // arremessa um pouco para cima se for forte
      }
    }

    if (this.hp <= 0 && !this._dead) {
      this._triggerDeath();
    }
  }

  /**
   * Sequência de morte reutilizável (dano letal OU queda no vazio).
   * @param {Object} opts
   *   opts.fall = true → morte por queda: congela a queda imediatamente
   *               (reposiciona no spawn) pra animação de morte ser visível.
   */
  _triggerDeath(opts = {}) {
    if (this._dead) return;
    this._dead = true;
    this.hp    = 0;
    this._kbVx = 0; this._kbVz = 0;
    this.velY  = 0;

    // Queda no vazio: para de cair na hora e segura no ponto de spawn
    // pra não despencar pro infinito durante os 2.5s de animação.
    if (opts.fall) {
      this.mesh.position.set(0, 2.5, 0);
    }

    if (this.stateMachine) {
      this.stateMachine.setState('knockdown');
      this.animCtrl?.play('knockdown', { loop: false, speed: 1.0 });
    }

    setTimeout(() => {
      this.hp    = this.maxHp;
      this._dead = false;
      this._kbVx = 0; this._kbVz = 0;
      this.velY  = 0;

      if (this.stateMachine) {
        this.stateMachine.setState(this.stateMachine.isArmedFlag ? 'armed' : 'unarmed');
      }

      this.spawn();
      this.onRespawn?.();   // avisa Level para resetar inimigos
    }, 2500);
  }

  // ── Camera via setTarget (mais confiável que .rotation) ───────────
  _updateCamera() {
    const yR = BABYLON.Tools.ToRadians(this.yaw);
    const pR = BABYLON.Tools.ToRadians(this.pitch);

    // ── Shake compartilhado (landing + damage) ───────────────────────
    let shakeX = 0, shakeY = 0, shakeZ = 0;

    if (this._landShake > 0) {
      this._landShake = Math.max(0, this._landShake - 0.04);
      shakeY -= Math.sin(this._landShake * Math.PI) * this._landMag * 0.010;
    }

    if (this._dmgShakeT > 0) {
      this._dmgShakeT -= 0.016;
      const mag   = this._dmgShakeMag * (this._dmgShakeT / 0.55);
      const theta = this._dmgShakeT * 42;
      shakeX += Math.sin(theta * 1.3) * mag;
      shakeY += Math.cos(theta * 0.9) * mag * 0.5;
      shakeZ += Math.sin(theta * 1.1) * mag * 0.4;
    }

    if (this._tpsMode) {
      // ── Câmera TPS — over-the-shoulder, pitch-aware ──────────────
      //
      //  Pivot: ponto de referência no ombro/peito do personagem.
      //  Câmera fica atrás + levemente à direita + acima do pivot.
      //  setTarget aponta para UM PONTO DISTANTE na direção de visada
      //  → camera.getDirection(Forward) fica correto para o raycast
      //    da arma mesmo em 3ª pessoa.
      //
      // Mira em TPS (over-the-shoulder fechado, tipo Gears of War):
      // interpola suave entre câmera normal e câmera de mira.
      this._tpsAim = (this._tpsAim ?? 0) + ((this._aiming ? 1 : 0) - (this._tpsAim ?? 0)) * 0.18;
      const a = this._tpsAim;
      const BEHIND   = 3.4 - 1.7 * a;   // mira → câmera mais perto (3.4 → 1.7)
      const SHOULDER = 0.52 + 0.18 * a; // mira → ombro mais marcado
      const UP       = 0.80 - 0.25 * a; // mira → desce um pouco (alinha com cabeça)

      const pivot = this.mesh.position.clone();
      pivot.y += this.HEIGHT * 0.28 + shakeY;

      // Posição desejada da câmera
      const sinY = Math.sin(yR);
      const cosY = Math.cos(yR);
      const sinP = Math.sin(pR);

      const desiredX = pivot.x - sinY * BEHIND + cosY * SHOULDER + shakeX;
      const desiredY = pivot.y + UP - sinP * 0.55;
      const desiredZ = pivot.z - cosY * BEHIND - sinY * SHOULDER + shakeZ;

      // Colisão câmera×parede: ray do pivot até a posição desejada
      const toCamVec  = new BABYLON.Vector3(desiredX - pivot.x, desiredY - pivot.y, desiredZ - pivot.z);
      const toCamDist = toCamVec.length();
      const toCamDir  = toCamVec.scale(1 / toCamDist);
      const wallRay   = new BABYLON.Ray(pivot, toCamDir, toCamDist + 0.15);
      const wallHit   = this.scene.pickWithRay(wallRay, m =>
        m.checkCollisions === true && m.isPickable !== false
      );

      if (wallHit?.hit && wallHit.distance < toCamDist) {
        // Aproxima câmera da parede com pequena margem de segurança
        const safe = Math.max(0.35, wallHit.distance - 0.25);
        this.camera.position.copyFrom(pivot.add(toCamDir.scale(safe)));
      } else {
        this.camera.position.set(desiredX, desiredY, desiredZ);
      }

      // Alvo da câmera: ponto distante na direção de visada (yaw + pitch)
      // Isso garante que camera.getDirection(Forward) == direção de mira real
      const AIM = 180;
      this.camera.setTarget(new BABYLON.Vector3(
        pivot.x + sinY * Math.cos(pR) * AIM,
        pivot.y - sinP * AIM,
        pivot.z + cosY * Math.cos(pR) * AIM
      ));

    } else {
      // ── Câmera FPS (padrão) ─────────────────────────────────────
      const eye = this.mesh.position.clone();
      eye.y += this.HEIGHT / 2 - 0.10 + shakeY;
      eye.x += shakeX;
      eye.z += shakeZ;

      this.camera.position.copyFrom(eye);
      this.camera.setTarget(eye.add(new BABYLON.Vector3(
        Math.sin(yR) * Math.cos(pR),
        -Math.sin(pR),
        Math.cos(yR) * Math.cos(pR)
      )));
    }
  }

  // ── Efeito visual de dash: anel/rastro de velocidade ──────────────
  _spawnDashFX(dir) {
    const scene = this.scene;
    const startPos = this.mesh.position.clone();
    // 6 "linhas de velocidade" que ficam pra trás e somem
    const n = 6;
    const items = [];
    for (let i = 0; i < n; i++) {
      const m = BABYLON.MeshBuilder.CreatePlane(`dashfx_${Date.now()}_${i}`, { width: 0.08, height: 1.2 }, scene);
      const ang = (i / n) * Math.PI * 2;
      m.position.set(
        startPos.x + Math.cos(ang) * 0.4,
        startPos.y + (Math.random() - 0.3),
        startPos.z + Math.sin(ang) * 0.4
      );
      m.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      const mat = new BABYLON.StandardMaterial('', scene);
      mat.emissiveColor = new BABYLON.Color3(0.6, 0.85, 1.0);
      mat.disableLighting = true; mat.backFaceCulling = false; mat.alpha = 0.7;
      m.material = mat; m.isPickable = false;
      items.push({ m, mat });
    }
    const back = dir.clone().normalize().scale(-6);
    let t = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt2 = scene.getEngine().getDeltaTime() / 1000;
      t += dt2;
      for (const it of items) {
        it.m.position.x += back.x * dt2;
        it.m.position.z += back.z * dt2;
        it.mat.alpha = Math.max(0, 0.7 * (1 - t / 0.35));
      }
      if (t >= 0.35) { scene.onBeforeRenderObservable.remove(obs); for (const it of items) { it.mat.dispose(); it.m.dispose(); } }
    });
  }

  _toggleAim() {
    this._aiming = !this._aiming;
    // Sensibilidade reduzida ao mirar
    this.MOUSE_SENS = this._aiming ? 0.07 : 0.15;
    console.log(`[Aim] ${this._aiming ? 'ON' : 'OFF'}`);
  }

  // ── Ajuste SUTIL da arma em TPS pra acompanhar a mira ──────────────
  //  Filosofia: o CORPO já encara o yaw da câmera (gira o personagem todo).
  //  A arma NÃO deve forçar a direção inteira (isso contorce o braço e
  //  rompe a física). Ela só aplica um pequeno ajuste de PITCH (cima/baixo)
  //  por cima da pose da animação, com CLAMP. Se a mira passar do limite,
  //  a arma para no limite — quem resolve o resto é a câmera/corpo.
  _applyTPSAim(dt) {
    if (!this._tpsMode) return;
    const armed = this.stateMachine && this.stateMachine.state === 'armed';
    if (!armed || !this.animator) return;
    const w = this.weapon;
    const cur = w.getCurrentWeapon && w.getCurrentWeapon();
    const tpsM = cur && w._tpsMeshes[cur.id];
    if (!tpsM || !tpsM.isEnabled()) return;

    // Pitch da câmera em rad (−p/ baixo, +p/ cima). pitch>0 = olhando p/ baixo.
    const pitchRad = BABYLON.Tools.ToRadians(this.pitch);
    // Limite confortável do braço: ±35°. Além disso, a arma não força.
    const LIMIT = BABYLON.Tools.ToRadians(35);
    const targetPitch = Math.max(-LIMIT, Math.min(LIMIT, pitchRad));

    // Rotação adicional SÓ no eixo de pitch da arma (eixo local Z, já que o
    // cano é -X). Aplicada como offset suave por cima da pose da animação,
    // que já vem do AnimationGroup mascarado (upper).
    this._aimPitch = (this._aimPitch ?? 0);
    this._aimPitch += (targetPitch - this._aimPitch) * Math.min(1, dt * 12);

    // A arma TPS NÃO é animada por AnimationGroup — sua rotação base é fixa
    // (cur.tpsRotation, aplicada por applyToMesh). Partimos SEMPRE dessa base
    // e adicionamos o pitch, senão acumula infinitamente.
    const base = cur.tpsRotation || BABYLON.Vector3.Zero();
    const baseQ = BABYLON.Quaternion.FromEulerAngles(base.x, base.y, base.z);
    const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, this._aimPitch);
    tpsM.rotationQuaternion = baseQ.multiply(pitchQ);
  }

  getDebugInfo() {
    return {
      grounded     : this.isGrounded,
      vel          : { x: this._vx, y: this.velY, z: this._vz },
      speed        : Math.hypot(this._vx, this._vz).toFixed(1),
      pos          : this.mesh.position,
      wjPhase      : this.wallJump.getPhase(),
      wjIndicator  : this.wallJump.getIndicator(),
      hitFlash     : this._hitFlashT > 0,
      locked       : this.input.gameActive,
      hp           : this.hp,
      maxHp        : this.maxHp,
      damageFlash  : this._damageFlashT > 0,
      dead         : this._dead,
      tpsMode      : this._tpsMode,
      aiming       : this._aiming,
    };
  }
}
