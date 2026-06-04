// ─────────────────────────────────────────────────────────────────
//  Player — controller FPS com moveWithCollisions (sem Havok)
//  Camera via setTarget() — mais confiável que .rotation direto
// ─────────────────────────────────────────────────────────────────
import { WallJumpController } from './WallJumpController.js';
import { WeaponSystem }       from './WeaponSystem.js';
import { PlayerAnimator }     from './PlayerAnimator.js';
import { AnimConfigUI }       from './AnimConfigUI.js';
import { physicsReady }       from './game/physics/PhysicsWorld.js';

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
    this.AIR_CTRL    = 0.75;
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
    //  DEFAULT = 3ª pessoa (mostra o boneco). Tecla V alterna FPS<->TPS.
    //  O boneco só aparece quando o GLB carrega: enquanto `animator == null`
    //  não existe corpo (a capsule tem alpha=0) e, ao montar, PlayerAnimator
    //  inicia com setVisible(false) e só vira visível via setMouseCharacter.
    this._tpsMode  = true;    // true = 3ª pessoa, false = FPS (tecla V)
    this.animator  = null;    // PlayerAnimator (setado quando GLB carrega)

    // Landing shake
    this._prevY     = 0;
    this._landShake = 0;
    this._landMag   = 0;

    // Recoil de câmera (kick vertical visual ao atirar) — SÓ pitch, decai a 0.
    // Offset em GRAUS aplicado no _updateCamera; NUNCA altera this.pitch (base).
    this._recoilOffset = 0;

    // Damage shake + knockback
    this._dmgShakeT   = 0;
    this._dmgShakeMag = 0;
    this._kbVx        = 0;   // knockback velocity X
    this._kbVz        = 0;   // knockback velocity Z
    this._pvpStunT    = 0;   // A7+B2: stun de knockback PvP (segundos) — trava input

    // ── Esquiva (Dodge) ─────────────────────────────────────────────
    this._dodgeT      = 0;
    this._wasShift    = false;

    // ── Sprint + Estamina ───────────────────────────────────────────
    this.maxStamina    = 100;
    this.stamina       = 100;
    this.STAMINA_DRAIN = 32;    // por segundo correndo (segurando Shift)
    this.STAMINA_REGEN = 20;    // por segundo recuperando
    this.SPRINT_MULT   = 1.75;  // quão mais rápido o sprint é
    this._sprinting    = false;
    this._exhausted    = false; // sem fôlego (estamina zerou) → não sprinta até recuperar
    this._breathT      = 0;     // timer da animação de recuperar o fôlego
    // Momentum aereo: ao pular sprintando, preserva o embalo no ar (Fortnite/Apex feel)
    this._sprintMomentumLeft = 0;

    // ── Slide (agachar correndo) — momentum estilo Apex ─────────────
    //  Ctrl/C sprintando + grounded = desliza preservando o embalo.
    //  Friction decai a velocidade; controle direcional reduzido.
    this.SLIDE_DUR      = 0.7;   // duração máxima do slide (s)
    this.SLIDE_BOOST    = 1.3;   // multiplica a velocidade de sprint no início
    this.SLIDE_FRICTION = 1.8;   // decaimento por segundo da velocidade do slide
    this._slideT        = 0;     // timer ativo (>0 = deslizando)
    this._slideDirX     = 0;     // direção travada do slide
    this._slideDirZ     = 0;
    this._slideCamDrop  = 0;     // queda da câmera durante o slide (suaviza)
    this._wasCrouch     = false; // edge-detect do botão de agachar

    // ── Dash (double-tap W) ─────────────────────────────────────────
    //  Permite ENCADEAR dashes no ar pra "plainar" estilo The Duel.
    //  airCharges recarrega ao tocar chão. Cooldown curto = fluidez.
    this._dashT       = 0;   // timer ativo do dash (>0 = dashing)
    this._dashCdT     = 0;   // cooldown entre dashes
    this.DASH_DUR     = 0.26;
    this.DASH_FORCE   = 52;  // um toque mais forte
    this.DASH_AIR_LIFT = 3.4;   // empurrão pra cima no dash aéreo (sustenta planagem)
    this.AIR_DASH_MAX = 5;     // 5 dashes aéreos HORIZONTAIS consecutivos sem tocar chão/objeto
    this._airDashesLeft = 5;
    // Dash PRA CIMA (W+S juntos): contador PRÓPRIO, máximo 2 usos no ar.
    this.DASH_UP_MAX  = 2;
    this._dashUpLeft  = 2;
    // Volume do som: dash up = DOBRO do dash horizontal.
    this.DASH_VOL_NORMAL = 0.7;
    this.DASH_VOL_UP     = 1.4;

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
    this._initCharacterController();

    this.wallJump    = new WallJumpController(this);
    this.weapon      = new WeaponSystem(this.camera, scene, level);
    this.animConfig  = new AnimConfigUI(this);   // painel de config — tecla K abre

    this._hitFlashT = 0;
    this._armShootT = 0;   // timer da animação de tiro em TPS
    this.weapon.onHit   = () => { this._hitFlashT = .14; };
    this.weapon.onFired = () => {
      this.animator?.onShoot(); this._armShootT = 0.28;
      // Som POR TIRO (semi-auto). Automático usa loop (tratado no input).
      const w = this.weapon.getCurrentWeapon?.();
      if (w && !w.automatic) this.sounds?.playNow?.(w.fireSound || 'gun_pistol', 0.7);
      // MP: avisa o server pra parceiros OUVIREM o disparo (espacial) E VEREM o
      // tracer. Manda a DIREÇÃO de mira (forward da câmera) pra reconstruir o
      // traçado da bala no client do parceiro.
      try {
        const fwd = this.camera?.getDirection?.(BABYLON.Axis.Z);
        const dir = fwd ? { dx: +fwd.x.toFixed(3), dy: +fwd.y.toFixed(3), dz: +fwd.z.toFixed(3) } : null;
        window._cs?.sendFire?.(w?.id || 'unarmed', false, dir);
      } catch (_) {}
    };
    // Reload: toca o som AJUSTANDO a velocidade pra casar com a duração da
    //  recarga (reloadDur). Se o áudio for mais longo, acelera; mais curto,
    //  desacelera — fica sincronizado com a animação.
    this.weapon.onReload = (reloadDur) => {
      this.sounds?.playReloadTimed?.('gun_reload', reloadDur, 0.8);
    };
    this.weapon.onWeaponSwitched = (w) => {
      // Equipa conforme o TIPO da arma (igual o G faz): melee → 'sword'
      // (canAttack true), arma de fogo → 'armed' (canShoot true). NUNCA
      // forçar 'armed' fixo aqui — isso clobberava o estado de espada e
      // exigia holster/unholster (G 2x) pra poder bater/atirar.
      if (this.stateMachine) {
        if (w?.isMelee) this.stateMachine.equipSword();
        else            this.stateMachine.equipWeapon();
      }
      this._updateWeaponVisibility();
    };

    this.spawn({ sky: false });   // init: placeholder no chão (main.js posiciona de verdade)
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
    // ── Precisão do depth-buffer (anti-flicker ao girar a câmera) ──────
    //  O far-plane grande (mapão) com near minúsculo (0.05) dava razão
    //  far/near = 50000:1 → estouro de precisão do depth-buffer e PISCA
    //  preto ao girar. Correção: razão muito menor (1500/0.3 = 5000:1) +
    //  reverse-depth-buffer (Z invertido espalha a precisão pelo far) +
    //  logarithmicDepthBuffer como reforço quando suportado. Mantém o
    //  far-plane pro mapão; a névoa segue escondendo o pop-in.
    // FIX flicker SEM reverse-Z: subir minZ (0.05→0.3) + baixar maxZ (2500→1500)
    // já corta a razão far/near de 50000:1 pra 5000:1 — depth precision suficiente
    // pra matar o flash preto ao rotacionar, e o mapão continua visível com a
    // névoa escondendo o pop-in. NÃO ligar useReverseDepthBuffer: no WebGPU ele
    // estoura o limite de 16 varyings do PostProcess de Glow/highlights
    // (fragment input 17 > 16) → quebra o pipeline e a tela toda.
    this.camera.minZ = 0.3;    // era 0.05 — sobe o near p/ encolher a razão far/near
    this.camera.maxZ = 1500;   // era 2500 — far seguro p/ ver o mapão sem estourar o depth
    this.camera.fov  = 1.38;
    this.camera.inputs.clear();          // remove inputs padrão
    this.scene.activeCamera = this.camera;

    // Anti-aliasing FXAA → mata o "tremido/crawling" das bordas ao andar.
    //  NO WEBGPU: pulamos este FXAA standalone. O DefaultRenderingPipeline do
    //  GraphicsEnhancer já tem fxaaEnabled; ter os DOIS na mesma câmera cria
    //  cadeias de post-process com formato conflitante → "Invalid RenderPipeline
    //  ...fpsFxaa..." floodando o console no WebGPU. No WebGL2 mantém.
    if (!window._webgpu) {
      try {
        this._fxaa = new BABYLON.FxaaPostProcess('fpsFxaa', 1.0, this.camera);
      } catch (_) {}
    }
  }

  // ── Character Controller (Havok) ──────────────────────────────────
  //  Substitui o moveWithCollisions manual. Sobe escada/rampa/degrau
  //  NATIVAMENTE (sem encravar), colide com o mundo e os objetos Havok.
  //  Se a física não estiver pronta, cai no sistema antigo (this._cc null).
  _initCharacterController() {
    if (!physicsReady()) { this._cc = null; return; }
    try {
      this._charGravity     = new BABYLON.Vector3(0, -this.GRAVITY, 0);
      this._charGravityWeak = new BABYLON.Vector3(0, -1.5, 0);  // grude no chão sem escorregar
      this._ccDown          = new BABYLON.Vector3(0, -1, 0);
      this._cc = new BABYLON.PhysicsCharacterController(
        new BABYLON.Vector3(0, 2.5, 0),
        { capsuleHeight: this.HEIGHT, capsuleRadius: this.RADIUS },
        this.scene
      );
      // ⭐ maxStepHeight vem 0 por padrão → o CC NÃO sobe degrau nenhum (trava
      //   em escada). Setar isso é o que faz subir degraus/escadas nativamente.
      this._cc.maxStepHeight = 0.6;       // ~altura de um degrau (era STEP=0.70)
      this._cc.maxSlopeCosine = 0.45;     // sobe rampas íngremes (~63°) — rampa da escada
      // Atrito alto → não escorrega na rampa do convex hull da escada.
      if ('staticFriction'  in this._cc) this._cc.staticFriction  = 0.95;
      if ('dynamicFriction' in this._cc) this._cc.dynamicFriction = 0.9;
      // O corpo do CC é o colisor agora → o capsule visual não colide.
      this.mesh.checkCollisions = false;
      // Estado SUPPORTED do Havok (2). Cache do enum c/ fallback numérico.
      this._SUPPORTED = BABYLON.CharacterSupportedState?.SUPPORTED ?? 2;
      // Estado SLIDING do Havok (1): encostou numa parede/objeto íngreme.
      // Usado pra resetar os dashes ao tocar QUALQUER objeto no ar.
      this._SLIDING = BABYLON.CharacterSupportedState?.SLIDING ?? 1;
    } catch (e) {
      console.error('[Player] character controller falhou:', e.message);
      this._cc = null;
    }
  }

  // REGRA #4: renasce CAINDO DO CÉU (skydive), igual à entrada no mundo
  //  (ref. main.js ~1271-1287). Antes teleportava pro chão (0,2.5,0); agora
  //  vai pro alto (0,200,0) com velocidade pra baixo e _isFalling=true, então
  //  o update() roda a física de queda + vento + anim de queda até aterrissar.
  //  @param {object} [opts]
  //  @param {boolean} [opts.sky=true] — false = placeholder no chão (init do
  //    construtor, antes do main.js posicionar de verdade).
  //  @param {number} [opts.x] @param {number} [opts.z] — X/Z do ponto de queda
  //    (MP usa a pos do server pra cair perto do ponto que o server mandou).
  spawn(opts = {}) {
    const sky = opts.sky !== false;
    const x = Number.isFinite(opts.x) ? opts.x : 0;
    const z = Number.isFinite(opts.z) ? opts.z : 0;
    if (!sky) {
      // Placeholder no chão (init). Sem skydive.
      this.mesh.position.set(x, 2.5, z);
      this._vx = 0; this._vz = 0; this.velY = 0;
      this._prevY = 2.5; this._isFalling = false;
      if (this._cc) {
        try {
          this._cc.setPosition(new BABYLON.Vector3(x, 2.5, z));
          this._cc.setVelocity(BABYLON.Vector3.Zero());
        } catch (_) {}
      }
      return;
    }
    const SKY = 200;
    this.mesh.position.set(x, SKY, z);
    this._vx = 0; this._vz = 0; this.velY = -15;
    this._prevY = SKY;
    this._isFalling = true;
    if (this._cc) {
      try {
        this._cc.setPosition(new BABYLON.Vector3(x, SKY, z));
        this._cc.setVelocity(new BABYLON.Vector3(0, -15, 0));
      } catch (_) {}
    }
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

  // ── Side collision check (parede/objeto no ar) ────────────────────
  //  4 raycasts horizontais a partir da capsule (N/S/L/O). Se algum
  //  bater num objeto físico a curta distância, o player está encostado
  //  numa parede/objeto — usado pra resetar os dashes MESMO NO AR.
  _checkSideCollision() {
    // Atalho barato: o Havok já reporta SLIDING quando o CC encosta numa
    // superfície íngreme/parede. Se disponível, confia nele.
    if (this._cc && this._support && this._support.supportedState === this._SLIDING) {
      return true;
    }
    const c    = this.mesh.position;
    const dist = (this.RADIUS + 0.15) + 0.3;
    const dirs = [
      new BABYLON.Vector3( 1, 0,  0),
      new BABYLON.Vector3(-1, 0,  0),
      new BABYLON.Vector3( 0, 0,  1),
      new BABYLON.Vector3( 0, 0, -1),
    ];
    const filter = m => m !== this.mesh && m.checkCollisions === true && m.isPickable !== false;
    const origin = new BABYLON.Vector3(c.x, c.y, c.z);
    for (const d of dirs) {
      const hit = this.scene.pickWithRay(new BABYLON.Ray(origin, d, dist), filter);
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

  // ── Empurrar objetos dinâmicos ────────────────────────────────────
  //  O character controller não empurra corpos por padrão. Aqui achamos
  //  os GameObjects dinâmicos perto do player e damos um empurrão na
  //  direção do movimento (proporcional à velocidade do player).
  _pushTouchedBodies() {
    const lvl = this.level || window._gameLevel;
    if (!lvl?.dynamics?.length) return;
    const speed = Math.hypot(this._vx, this._vz);
    if (speed < 1.5) return;                        // parado → não empurra
    const px = this.mesh.position.x, pz = this.mesh.position.z, py = this.mesh.position.y;
    const reach = this.RADIUS + 0.7;
    const dir = new BABYLON.Vector3(this._vx, 0, this._vz).normalize();
    for (const d of lvl.dynamics) {
      if (!d._usesHavok || d._broken || d._collected || !d._havok?.body) continue;
      const m = d._havok.mesh;
      const dx = m.position.x - px, dz = m.position.z - pz, dy = m.position.y - py;
      if (Math.abs(dy) > this.HEIGHT) continue;     // muito acima/abaixo
      const distH = Math.hypot(dx, dz);
      if (distH > reach + 0.6) continue;
      // só empurra se está À FRENTE do movimento (não puxa o que ficou atrás)
      if (dx * dir.x + dz * dir.z < 0) continue;
      // impulso na direção do movimento, na altura do PEITO (empurra, não rola por baixo)
      const mass = d._havok.body.getMassProperties?.()?.mass || 2;
      const push = dir.scale(Math.min(speed, 12) * 0.5 * Math.max(1, mass));
      const pt = m.getAbsolutePosition().add(new BABYLON.Vector3(0, 0.2, 0));
      try { d._havok.body.applyImpulse(push, pt); } catch (_) {}
    }
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

  // ── Queda do céu ANTES do click (sem input) ───────────────────────
  //  Roda a fisica de queda independente de gameActive: aplica gravidade,
  //  empurra a velocidade pra baixo no character controller e move o mesh.
  //  Assim o player NUNCA fica parado de pe no ar enquanto o overlay
  //  'CLIQUE PARA CAIR' esta na tela — ele JA aparece caindo.
  _skydiveFall(dt) {
    // Vento em LOOP + anim de queda (forcadas pra entrar na hora).
    if (!this._windOn) {
      this._windOn = true;
      try { this.sounds?.startLoop?.('wind', 0.6); } catch (_) {}
    }
    try {
      if (this.animCtrl && this.animLib?.has?.('falling')) {
        this.animCtrl.play('falling', { loop: true, speed: 1.0, fade: 0.18 });
      } else {
        this.animator?.play?.('falling');
      }
    } catch (_) {}

    // Suporte atual (detecta o chao pra encerrar a queda).
    if (this._cc) {
      try {
        this._support   = this._cc.checkSupport(dt, this._ccDown);
        this.isGrounded = this._support.supportedState === this._SUPPORTED;
      } catch (_) { this.isGrounded = false; }
    } else {
      this.isGrounded = this._checkGrounded();
    }

    // Gravidade manual: acelera a velocidade vertical ate a terminal.
    this.velY -= this.GRAVITY * dt;
    this.velY  = Math.max(this.velY, -this.MAX_FALL);

    // Aplica a queda no mundo.
    if (this._cc) {
      try {
        this._cc.setVelocity(new BABYLON.Vector3(0, this.velY, 0));
        this._cc.integrate(dt, this._support, this._charGravity);
        this.mesh.position.copyFrom(this._cc.getPosition());
      } catch (_) {
        this.mesh.position.y += this.velY * dt;
      }
    } else {
      this.mesh.position.y += this.velY * dt;
    }
    this._prevY = this.mesh.position.y;

    // Aterrissou → encerra o skydive: para vento + baque.
    if (this.isGrounded) {
      this._isFalling = false;
      this._windOn    = false;
      if (this.velY < 0) this.velY = 0;
      try { this.sounds?.stopLoop?.('wind'); } catch (_) {}
      try { this.sounds?.playNow?.('land', 0.9); } catch (_) {}
    }
  }

  // ── Update principal ──────────────────────────────────────────────
  update(dt) {
    // ── SKYDIVE antes do click: CAI mesmo SEM input ──────────────────
    //  O spawn (main.js) teleporta o player la pro alto e seta _isFalling
    //  ANTES de soltar o overlay 'CLIQUE PARA CAIR'. Enquanto esse overlay
    //  esta na tela, gameActive=false e o early-return abaixo congelaria o
    //  player de pe no ar. Pra ele JA aparecer caindo, rodamos a fisica de
    //  queda aqui — independente do input — ate aterrissar.
    if (this._isFalling && !this.input.gameActive && !this._dead) {
      this._skydiveFall(dt);
      return;
    }
    // Só roda após JOGAR. Exceção: MORTO → continua atualizando (queda/anim/
    // câmera) mesmo sem pointer-lock, pra você ver a queda enquanto o cursor
    // fica livre pra clicar Renascer.
    if (!this.input.gameActive && !this._dead) { this._stopMgLoop(); this._stopFootsteps(); return; }

    // ── 1. Mouse look — funciona com ou sem pointer lock ─────────────
    const { dx, dy } = this.input.consumeMouseDelta();
    this.yaw   += dx * this.MOUSE_SENS;
    this.pitch  = Math.max(-88, Math.min(88, this.pitch + dy * this.MOUSE_SENS));

    // ── 2. Grounded ──────────────────────────────────────────────────
    this._wasGrounded = this.isGrounded;
    if (this._cc) {
      // checkSupport faz o ground-cast do Havok (também detecta degraus/rampas)
      this._support   = this._cc.checkSupport(dt, this._ccDown);
      this.isGrounded = this._support.supportedState === this._SUPPORTED;
    } else {
      this.isGrounded = this._checkGrounded();
    }

    // ── QUEDA DO CÉU (skydive OPEN_WORLD) ────────────────────────────
    //  Nasce a ~80m (setado no main.js: player._isFalling = true). Enquanto
    //  cai: vento em LOOP + anim 'falling' (forçada aqui pra entrar na hora,
    //  sem esperar o _fallT acumular). Ao tocar o chão: para o vento + baque.
    if (this._isFalling) {
      if (!this._windOn) {
        this._windOn = true;
        try { this.sounds?.startLoop?.('wind', 0.6); } catch (_) {}
      }
      try {
        if (this.animCtrl && this.animLib?.has?.('falling')) {
          this.animCtrl.play('falling', { loop: true, speed: 1.0, fade: 0.18 });
        } else {
          this.animator?.play?.('falling');
        }
      } catch (_) {}
      if (this.isGrounded) {
        this._isFalling = false;
        this._windOn    = false;
        try { this.sounds?.stopLoop?.('wind'); } catch (_) {}
        try { this.sounds?.playNow?.('land', 0.9); } catch (_) {}
      }
    }

    // Coyote time: "grounded visual" só vira false após ~0.12s no ar.
    // Evita o flicker de animação de jump/queda ao passar por frestas
    // do chão enquanto anda.
    if (this.isGrounded) {
      this._coyoteT = 0.12;
    } else if (this._coyoteT > 0) {
      this._coyoteT -= dt;
    }

    // Timer de QUEDA: conta há quanto tempo está caindo. A anim 'falling' só
    // entra numa queda LONGA (não no pulo normal, que cai rápido e aterrissa).
    if (!this.isGrounded && this.velY < -2) this._fallT = (this._fallT || 0) + dt;
    else this._fallT = 0;
    this.groundedVisual = this.isGrounded || (this._coyoteT > 0 && this.velY <= 0.5);

    if (!this._wasGrounded && this.isGrounded && this.velY < -5) {
      this._landMag   = Math.min(Math.abs(this.velY), 25);
      this._landShake = 1.0;
      // Som de aterrissagem (mais forte = queda maior)
      this.sounds?.playNow?.('ground_hit', Math.min(1, 0.4 + this._landMag / 40));
    }

    // ── 3. Gravidade manual ──────────────────────────────────────────
    //  No CC, o suporte numa rampa irregular (convex hull de escada) OSCILA
    //  entre supported/unsupported. Usamos o coyote (tolerância) pra decidir
    //  a gravidade: assim frames "soltos" momentâneos não te escorregam.
    const ccGrounded = this._cc ? (this.isGrounded || this._coyoteT > 0) : this.isGrounded;
    if (ccGrounded) {
      // NÃO empurra pra baixo quando está no chão (senão escorrega na rampa).
      if (this._cc) { if (this.velY < 0) this.velY = 0; }
      else if (this.velY < this.GROUND_SNAP) this.velY = this.GROUND_SNAP;
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
    // A7+B2: durante o stun de knockback PvP o input de locomoção é travado
    // (o _kbVx/_kbVz ainda empurra o corpo). Stun curto (150-250ms).
    const canMove = (this._pvpStunT > 0) ? false
      : (this.stateMachine ? this.stateMachine.canMove() : !this._dead);
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

    // ── 5.2 Dash 360 — double-tap WASD em qualquer direção ──────────
    //  W = pra frente · S = pra trás · A = esquerda · D = direita
    //  W+S double-tap simultâneo (≤80ms) = dash PRA CIMA (evasão vertical)
    //  Chão: dash livre (cd curto). Ar: consome airCharge.
    const dashDir = this.input.consumeDashDir?.();
    if (dashDir && canMove && this._dashT <= 0 && this._dodgeT <= 0 && this._dashCdT <= 0) {
      const isUp = (dashDir === 'up');
      // Cada tipo de dash tem seu PRÓPRIO contador no ar:
      //  • dash PRA CIMA → _dashUpLeft (máx 2)
      //  • dash HORIZONTAL → _airDashesLeft (máx 5)
      const canDash = this.isGrounded ||
        (isUp ? this._dashUpLeft > 0 : this._airDashesLeft > 0);
      if (canDash) {
        this._dashT = this.DASH_DUR;
        this._dashCdT = 0.14;
        // Calcula vetor de dash baseado na direção
        let dx = 0, dz = 0, dy = 0;
        const right = new BABYLON.Vector3(fwd.z, 0, -fwd.x); // perpendicular horizontal
        if (isUp) {
          // Dash vertical: empurrão grande pra cima, sem componente horizontal
          dy = 1;
          this._vx *= 0.4; this._vz *= 0.4;  // freia horizontal
        } else if (dashDir === 'forward') {
          dx = fwd.x; dz = fwd.z;
        } else if (dashDir === 'back') {
          dx = -fwd.x; dz = -fwd.z;
        } else if (dashDir === 'right') {
          dx = right.x; dz = right.z;
        } else if (dashDir === 'left') {
          dx = -right.x; dz = -right.z;
        }
        if (!isUp) {
          // ACUMULA embalo: em vez de SET direto (que zerava a velocidade
          // anterior), faz Lerp pro vetor de dash. Preserva ~20% do embalo
          // atual na direção do dash → física realista (não reseta o impulso).
          this._vx = BABYLON.Scalar.Lerp(this._vx, dx * this.DASH_FORCE, 0.8);
          this._vz = BABYLON.Scalar.Lerp(this._vz, dz * this.DASH_FORCE, 0.8);
          if (this.isGrounded) {
            this.velY = 4;
          } else {
            this.velY = Math.max(this.velY, 0) + this.DASH_AIR_LIFT;
            this._airDashesLeft = Math.max(0, this._airDashesLeft - 1);
          }
        } else {
          // Dash UP: empurrão vertical forte; consome o contador próprio.
          this.velY = Math.max(this.velY, 0) + 18;
          if (!this.isGrounded) {
            this._dashUpLeft = Math.max(0, this._dashUpLeft - 1);
          }
        }
        this._dashFovT = 0.18;
        // FX baseada na direção (Vector3 só pra função existente não quebrar)
        const fxDir = new BABYLON.Vector3(dx, dy * 0.5, dz);
        if (fxDir.lengthSquared() < 0.001) fxDir.set(0, 1, 0);
        this._spawnDashFX(fxDir);
        // Som: dash PRA CIMA toca 2x mais alto que o dash normal.
        this.sounds?.playNow?.('dash', isUp ? this.DASH_VOL_UP : this.DASH_VOL_NORMAL);
      }
    }
    // ── Reset dos dashes: ao tocar o CHÃO **ou** encostar em QUALQUER
    //    objeto físico (parede/etc) MESMO NO AR.
    if (this.isGrounded || this._checkSideCollision()) {
      if (this._airDashesLeft < this.AIR_DASH_MAX) this._airDashesLeft = this.AIR_DASH_MAX;
      if (this._dashUpLeft   < this.DASH_UP_MAX)   this._dashUpLeft   = this.DASH_UP_MAX;
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

    // ── 5.25 Sprint (segurar Shift) + Estamina ───────────────────────
    const shiftHeld = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    // Recupera fôlego: só volta a sprintar quando a estamina passa de 30.
    if (this._exhausted && this.stamina > 30) this._exhausted = false;
    this._sprinting = shiftHeld && moving && this.isGrounded && !this._exhausted &&
                      this._dodgeT <= 0 && this.stamina > 0;
    if (this._sprinting) {
      this.stamina = Math.max(0, this.stamina - this.STAMINA_DRAIN * dt);
      if (this.stamina <= 0) {
        this._exhausted = true;
        this._breathT = 1.4;   // toca recuperar o fôlego
        if (this.animCtrl && this.animLib?.has('catch_breath')) {
          this.animCtrl.play('catch_breath', { loop: false, speed: 1.0, fade: 0.10 });
        }
      }
    } else if (!this._sprinting) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.STAMINA_REGEN * dt);
    }
    if (this._breathT > 0) this._breathT -= dt;

    // ── Momentum aereo do sprint ─────────────────────────────────────
    //  Ao deixar o chao sprintando, armazena 100% de embalo. Decai no ar.
    //  Soltar Shift no ar NAO mata a velocidade — preserva o impulso lateral
    //  estilo Fortnite/Apex/The Duel. Tocar chao zera.
    if (this.isGrounded) {
      this._sprintMomentumLeft = 0;
    } else {
      this._sprintMomentumLeft = Math.max(0, this._sprintMomentumLeft - dt * 0.15);
    }
    // Takeoff: acabou de sair do chao sprintando → salva embalo cheio.
    if (!this.isGrounded && this._wasGrounded && this._sprinting) {
      this._sprintMomentumLeft = 1.0;
    }

    // ── 5.27 SLIDE (agachar correndo) — momentum estilo Apex ─────────
    //  Ctrl/C: se sprintando + grounded → inicia slide preservando embalo.
    //  Durante o slide a velocidade decai por friction; controle reduzido.
    //  Integra com _sprintMomentumLeft: pular durante o slide carrega o
    //  embalo pro ar (takeoff acima já lê _sprinting, e mantemos vel alta).
    const crouchNow = canMove && (this.input.isDown('ControlLeft') ||
                                  this.input.isDown('ControlRight') ||
                                  this.input.isDown('KeyC'));
    const crouchPress = crouchNow && !this._wasCrouch;
    this._wasCrouch = crouchNow;

    // Início: aperta agachar enquanto sprinta no chão e não está deslizando.
    if (crouchPress && this._sprinting && this.isGrounded && this._slideT <= 0 &&
        this._dashT <= 0 && this._dodgeT <= 0) {
      this._slideT = this.SLIDE_DUR;
      // Direção travada: usa o movimento atual; se parado, a frente da visão.
      if (moving) { this._slideDirX = moveDir.x; this._slideDirZ = moveDir.z; }
      else        { this._slideDirX = fwd.x;     this._slideDirZ = fwd.z;     }
      // Velocidade inicial = sprint * boost (preserva e amplifica o embalo).
      const slideSpeed = this.SPEED * this.SPRINT_MULT * this.SLIDE_BOOST;
      this._vx = this._slideDirX * slideSpeed;
      this._vz = this._slideDirZ * slideSpeed;
      this.sounds?.playNow?.('dash');   // reusa o som do dash p/ o slide
    }

    // Termina cedo se soltar o agachar, sair do chão ou começar um dash.
    const sliding = this._slideT > 0;
    if (sliding && (!crouchNow || !this.isGrounded || this._dashT > 0)) {
      this._slideT = 0;
    }

    let spd = this.SPEED;
    if (this._dodgeT > 0) {
      this._dodgeT -= dt;
      spd *= 1.8;
    } else {
      if (this._sprinting) spd *= this.SPRINT_MULT;
      else if (!this.isGrounded && this._sprintMomentumLeft > 0) {
        // Soltou Shift no ar mas ainda tem embalo do sprint → preserva.
        spd *= (1 + this._sprintMomentumLeft * (this.SPRINT_MULT - 1));
      }
      else if (this._exhausted) spd *= 0.78;   // cansado → mais lento
      spd *= (this.isGrounded ? 1 : this.AIR_CTRL);
    }

    if (this._dashT > 0) {
      // ── DASH ATIVO ─────────────────────────────────────────────────
      // Mantém o impulso forte (sem Lerp pra velocidade normal), só com
      // leve decaimento. É isso que faz o dash IR MAIS LONGE que correr.
      this._vx *= 0.92;
      this._vz *= 0.92;
    } else if (this._slideT > 0) {
      // ── SLIDE ATIVO ────────────────────────────────────────────────
      //  Velocidade na direção travada decaindo por friction (momentum).
      //  Controle direcional REDUZIDO: o input só inclina levemente a rota
      //  do slide sem matar o embalo (steer suave, estilo Apex).
      this._slideT -= dt;
      const decay = Math.exp(-this.SLIDE_FRICTION * dt);   // friction decay
      this._vx *= decay;
      this._vz *= decay;
      if (moving) {
        // steer fraco: empurra um pouco a velocidade na direção do input
        const slideSpeed = Math.hypot(this._vx, this._vz);
        this._vx = BABYLON.Scalar.Lerp(this._vx, moveDir.x * slideSpeed, 0.06);
        this._vz = BABYLON.Scalar.Lerp(this._vz, moveDir.z * slideSpeed, 0.06);
      }
    } else {
      // ── Movimento normal com INÉRCIA realista ────────────────────────
      //  Base: chão mais responsivo, ar com mais inércia (smooth menor).
      //  TROCA DE DIREÇÃO: se o input aponta contra a velocidade atual
      //  (dot < 0), o jogador NÃO vira instantâneo — aplica ATRITO gradual
      //  (smooth reduzido) pra frear o embalo antigo antes de acelerar pro
      //  novo sentido. Física realista: perde embalo SÓ ao trocar de direção.
      const targetVx = moveDir.x * spd;
      const targetVz = moveDir.z * spd;
      let smooth = this.isGrounded ? 0.28 : 0.08;
      const curSpeed = Math.hypot(this._vx, this._vz);
      if (moving && curSpeed > 0.5) {
        // Alinhamento entre velocidade atual e o input desejado (-1..1).
        const dot = (this._vx * moveDir.x + this._vz * moveDir.z) / curSpeed;
        if (dot < 0) {
          // Input oposto/lateral ao embalo → atrito: reduz o smooth conforme
          // o quanto está "contra a corrente" (até 50% no chão, ~35% no ar).
          const oppose = Math.min(1, -dot);          // 0..1
          const grip = this.isGrounded ? 0.5 : 0.35; // ar = mais inércia
          smooth *= (1 - oppose * grip);
        }
      }
      this._vx = BABYLON.Scalar.Lerp(this._vx, targetVx, smooth);
      this._vz = BABYLON.Scalar.Lerp(this._vz, targetVz, smooth);
    }

    // ── Camera drop do slide: abaixa suave durante, sobe ao terminar ──
    const slideCamTarget = this._slideT > 0 ? this.HEIGHT * 0.38 : 0;
    this._slideCamDrop = BABYLON.Scalar.Lerp(this._slideCamDrop, slideCamTarget, Math.min(1, dt * 12));

    // ── 5.3 Chute PLANTA o movimento ─────────────────────────────────
    //  Não dá pra correr E chutar com a perna (ficava bugado). Quando
    //  chuta no chão, freia forte o horizontal → "para e chuta", limpo.
    if (this.isGrounded &&
        this.stateMachine?.isAttacking() &&
        this.combatSystem?._currentAttackAnim?.includes('kick')) {
      this._vx *= 0.55;
      this._vz *= 0.55;
    }

    // ── 5.4 Recuperar fôlego PLANTA o movimento ──────────────────────
    //  Antes a anim de catch_breath tocava ENQUANTO o player deslizava
    //  (exausto mas andando) → bugava. Agora freia forte pra ele PARAR e
    //  recuperar o fôlego de verdade.
    if (this._breathT > 0 && this.isGrounded) {
      this._vx *= 0.30;
      this._vz *= 0.30;
    }

    // ── 6. Pulo / Wall jump / DASH PRA CIMA (double-tap Space) ───────
    const spaceNow  = this.input.isDown('Space');
    const jumpPress = spaceNow && !this._wasSpace && canMove;
    this._wasSpace  = spaceNow;

    if (jumpPress) {
      // Detecta DOUBLE-TAP do espaço: 2 toques < 280ms = dash pra cima 2x.
      const nowMs = performance.now();
      const isDoubleSpace = (this._lastSpaceTapMs != null) && (nowMs - this._lastSpaceTapMs < 280);
      this._lastSpaceTapMs = nowMs;

      if (isDoubleSpace && this._airDashesLeft > 0) {
        // DASH PRA CIMA: impulso vertical 2x o pulo normal. Encadeável no ar
        // (consome 1 dash aéreo). Reseta o duplo-toque pra não disparar 2x.
        this.velY = this.JUMP_FORCE * 2;
        this._airDashesLeft--;
        this._lastSpaceTapMs = null;
        this.sounds?.playNow?.('jump', 0.85);
        try { this.weapon?.applyWallJumpTilt?.(0); } catch (_) {}
        this.animator?.onWallJump?.();
      } else if (this.isGrounded) {
        this.velY = this.JUMP_FORCE;
        this.sounds?.playNow?.('jump', 0.7);
      } else {
        const wjVel = this.wallJump.tryWallJump();
        if (wjVel) {
          // Wall jump: Lerp (não SET) pra não zerar o embalo. Preserva ~30%
          // da velocidade horizontal anterior, somando o empurrão da parede.
          this._vx  = BABYLON.Scalar.Lerp(this._vx, wjVel.x, 0.7);
          this._vz  = BABYLON.Scalar.Lerp(this._vz, wjVel.z, 0.7);
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

    // ── 7.5 TRAVA DE MORTE ───────────────────────────────────────────
    //  REGRA DO DONO #1: ao morrer, o cadáver NÃO pode mais ser movido.
    //  canMove já zera o input, mas a cauda do Lerp de _vx/_vz e o
    //  knockback residual ainda arrastavam o corpo. Aqui ZERAMOS de vez
    //  toda velocidade horizontal + knockback enquanto _dead.
    //  Exceção: morte por queda ('fall') CONTINUA caindo (anim de queda),
    //  então só matamos o horizontal; o vertical (velY) segue a gravidade.
    if (this._dead) {
      this._vx = 0; this._vz = 0;
      this._kbVx = 0; this._kbVz = 0;
      if (this._deathType !== 'fall') {
        // Morte na fase: trava 100% — sem deslizar, só assenta no chão.
        if (this.velY > 0) this.velY = 0;
      }
    }

    // ── 8. Aplicar deslocamento ──────────────────────────────────────
    if (this._cc) {
      // CHARACTER CONTROLLER (Havok): sobe escada/degrau nativamente, colide
      // com mundo e objetos, sem encravar nem afundar. Alimentamos a
      // velocidade desejada (já com dash/dodge/pulo/knockback/gravidade).
      this._cc.setVelocity(new BABYLON.Vector3(
        this._vx + this._kbVx, this.velY, this._vz + this._kbVz
      ));
      // No chão parado/andando, passa gravidade FRACA pro integrate → não
      // escorrega na rampa íngreme. No ar/pulando, gravidade cheia.
      const grav = (this.isGrounded && this.velY <= 0.1) ? this._charGravityWeak : this._charGravity;
      this._cc.integrate(dt, this._support, grav);
      this.mesh.position.copyFrom(this._cc.getPosition());
      // Empurra objetos dinâmicos que o player encostou
      this._pushTouchedBodies();
    } else {
      // Fallback (física desligada): sistema antigo com step-up + ground clamp
      const disp = new BABYLON.Vector3(
        (this._vx + this._kbVx) * dt,
        this.velY * dt,
        (this._vz + this._kbVz) * dt
      );
      this._moveWithStepUp(disp);
      this._groundClamp();
    }

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
    //  Usa a CONTAGEM de cliques: mashing rápido (vários no mesmo frame)
    //  alimenta TODOS no combo, nada se perde.
    const lmbN = this.input.consumeClickCount();
    const isArmed = this.stateMachine ? this.stateMachine.isArmedFlag : true;
    const curW = this.weapon.getCurrentWeapon?.();
    const isMelee = !!curW?.isMelee;
    if (this._dead) {
      this._stopMgLoop();
    } else if (isArmed && !isMelee && curW?.automatic) {
      // FULL-AUTO: SEGURA o botão → metralha (o fireRate controla a cadência).
      if (this.input.isFireDown()) this.weapon.shoot();
      this._updateMgLoop(curW);
    } else {
      this._stopMgLoop();
      if (lmbN > 0) {
        // Diagnóstico (1x por clique) — ajuda a entender por que LMB não atacou
        if (window._debugSword) console.log('[LMB]', { lmbN, isArmed, isMelee, weapon: curW?.id, state: this.stateMachine?.state, hasCombat: !!this.combatSystem });
        if (isArmed && isMelee && this.combatSystem) {
          // ESPADA: cada clique = swordAttack (encadeia chain do ComboSystem)
          for (let i = 0; i < lmbN; i++) this.combatSystem.swordAttack();
        } else if (!isArmed && this.combatSystem) {
          for (let i = 0; i < lmbN; i++) this.combatSystem.lightAttack();
        } else {
          this.weapon.shoot();   // semi-auto: 1 tiro por clique
        }
      }
    }

    // ── RMB — chute (desarmado) / mira (arma fogo) / slash forte (espada) ─
    const rmbN = this.input.consumeRightClickCount();
    if (rmbN > 0) {
      const isArmed_r = this.stateMachine ? this.stateMachine.isArmedFlag : true;
      if (!isArmed_r && this.combatSystem) {
        for (let i = 0; i < rmbN; i++) this.combatSystem.kickAttack();
      } else if (isArmed_r && isMelee && this.combatSystem) {
        // Espada + RMB = ataque pesado (charged direto, sem encadear)
        const data = this.combatSystem.attackData?.['sword_charged'];
        if (data && !this.stateMachine.isAttacking()) {
          this.stateMachine.setState('attacking');
          this.combatSystem._lastAttackType = 'sword';
          this.combatSystem._executeNextAttack('sword_charged', data, 2.4, false);
        }
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

    // ── Q — Ultimate de espada (se equipada). Se NÃO equipada, deixa
    //  o SkillSystem processar Q normalmente (ultimate de skill).
    const qNow = this.input.isDown('KeyQ');
    if (qNow && !this._wasQ && isArmed && isMelee && this.combatSystem) {
      this.combatSystem.swordUltimate();
    }
    this._wasQ = qNow;

    const gNow = this.input.isDown('KeyG');
    if (gNow && !this._wasG) {
      if (this.stateMachine) {
        // G alterna entre Luta livre e Arma equipada (qualquer tipo).
        if (this.stateMachine.isArmedFlag) {
          this.stateMachine.dropWeapon();
          console.log("🧤 Modo Luta Ativado!");
        } else {
          // Equipa de volta na arma corrente — se é melee, vira 'sword'.
          if (curW?.isMelee) {
            this.stateMachine.equipSword();
            console.log("⚔️ Modo Espada Ativado!");
          } else {
            this.stateMachine.equipWeapon();
            console.log("🔫 Modo Arma Ativado!");
          }
        }
        this._updateWeaponVisibility();
      }
    }
    this._wasG = gNow;

    // ── 11. Toggle câmera (V) + animator ───────────────────────────
    const vNow = this.input.isDown('KeyV');
    if (vNow && !this._wasV) {
      this._tpsMode = !this._tpsMode;
      this._tpsCamDist = null; // zera lerp de distância p/ não dar snap ao voltar pra TPS
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

      // Update do chicote (Chibata) — anima o lash quando equipada
      if (this.weapon) {
        const cw = this.weapon.getCurrentWeapon?.();
        if (cw?.id === 'chibata' && cw.updateLash) {
          const fpsRoot = this.weapon._weaponMeshes?.chibata;
          const tpsRoot = this.weapon._tpsMeshes?.chibata;
          if (this._tpsMode && tpsRoot) cw.updateLash(dt, tpsRoot);
          else if (fpsRoot) cw.updateLash(dt, fpsRoot);
        }
      }

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

        if (this._dead || this._hitStunT > 0 || this._breathT > 0) {
          // Morte/queda/reação de dano/fôlego tocando → locomoção não sobrescreve.
          if (this.layered) this.layered.setEnabled(false);
        } else if (!isAttacking) {
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
            const _wid = this.weapon.getCurrentWeapon?.()?.id;
            const _backArmed = ((_wid === 'rifle' || _wid === 'machinegun') && this.animLib.has('walk_back_heavy')) ? 'walk_back_heavy'
                             : this.animLib.has('walk_back_pistol') ? 'walk_back_pistol'
                             : this.animLib.has('aim_walk_back') ? 'aim_walk_back' : null;
            if (movingBack && speed > 0.8 && _backArmed) {
              lowerKey = _backArmed; lowerSpd = Math.max(0.6, speed / 4);
            } else if (this._sprinting && this.animLib.has('run_fast')) {
              lowerKey = 'run_fast'; lowerSpd = speed / 15;   // SPRINT armado
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
              if (movingBack && speed > 0.8 && this.animLib.has('walk_back')) {
                // andando de costas (S) → anim de costas
                this.animCtrl.play('walk_back', { loop: true, speed: Math.max(0.7, speed / 5), fade: 0.16 });
              } else {
                this.animCtrl.updateLocomotion(speed / 11);
              }
            } else if (this._fallT > 0.65 && this.animLib.has('falling')) {
              // QUEDA LONGA (caindo há >0.65s) → anim de queda. Pulo normal
              // aterrissa antes disso, então fica em 'jump'.
              this.animCtrl.play('falling', { loop: true, speed: 1.0, fade: 0.18 });
            } else {
              this.animCtrl.play("jump", { loop: true });
            }
          }
        } else {
          // ── ATACANDO + correndo → RUN-WHILE-PUNCH (anti-slide) ───────
          //  Pernas correm (lower) e os braços socam (upper). Só pra SOCO:
          //  o chute usa as pernas, então fica corpo-inteiro.
          const atkAnim = this.combatSystem?._currentAttackAnim;
          const grnd    = this.groundedVisual ?? this.isGrounded;
          if (atkAnim && atkAnim.includes('punch') && animMoving && grnd &&
              this.layered && this.animLib.has(atkAnim)) {
            this.layered.setEnabled(true);
            this.animCtrl.stopAll();
            let lk = speed > 6.5 ? 'run' : 'walk';
            let ls = speed > 6.5 ? speed / 11 : Math.max(0.6, speed / 4);
            if (!this.animLib.has(lk)) lk = 'idle';
            const aSpd = this.combatSystem?._currentAttackSpeed ?? 3.0;
            this.layered.playLayer('lower', lk,      { loop: true,  speed: ls,   fade: 0.12 });
            this.layered.playLayer('upper', atkAnim, { loop: false, speed: aSpd, fade: 0.06 });
            this.layered.update(dt);
          } else if (this.layered) {
            // chute ou parado → corpo inteiro (CombatSystem já tocou)
            this.layered.setEnabled(false);
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
    // Recoil de câmera: lê/decai o kick da arma (graus) ANTES de montar a
    // câmera. Vira offset de pitch dentro do setTarget (sobe a mira) e volta
    // suave pro centro. NÃO mexe em this.pitch nem no yaw.
    this._recoilOffset = this.weapon?.consumeRecoilPitch
      ? this.weapon.consumeRecoilPitch(dt)
      : 0;
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

    // ── Passos em LOOP (correndo no chão) ────────────────────────────
    this._updateFootsteps(moving);

    // ── Aim procedural em TPS armado ─────────────────────────────────
    //  A pose da animação aponta a arma pro lado e não acompanha o pitch.
    //  Corrigimos orientando a arma (e o antebraço) pra direção exata da
    //  mira da câmera, a cada frame, DEPOIS da animação rodar.
    this._applyTPSAim(dt);

    // ── 11. Morte por QUEDA ────────────────────────────────────────────
    // Cai uns ~50m (chão em y≈0 → kill plane em -50) antes de morrer — dá
    // tempo de ver a queda. A anim de "caindo" já toca durante o trajeto.
    if (this.mesh.position.y < -50 && !this._dead) {
      this._startDeath('fall');
    }
    this._hitFlashT    = Math.max(0, this._hitFlashT - dt);
    this._damageFlashT = Math.max(0, this._damageFlashT - dt);
    this._hitStunT     = Math.max(0, (this._hitStunT || 0) - dt);
    this._pvpStunT     = Math.max(0, (this._pvpStunT || 0) - dt);
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
      // ROBUSTEZ: re-prende à câmera e REAPLICA pos/rot/escala toda vez. Se
      // por timing de boot ou troca a arma ficou solta/deitada no mundo,
      // isto a conserta (era o bug "arma no chão").
      const fpsM = this.weapon._weaponMeshes[curW.id];
      if (this.weapon._root) {
        if (this.weapon._root.parent !== this.camera) this.weapon._root.parent = this.camera;
        this.weapon._root.setEnabled(true);
      }
      if (fpsM) {
        if (fpsM.parent !== this.weapon._root) fpsM.parent = this.weapon._root;
        fpsM.rotationQuaternion = null;          // senão .rotation é ignorada
        curW.applyToMesh?.(fpsM, false, this._aiming ? 1 : 0);   // recoloca na frente da câmera
        fpsM.setEnabled(true);
        fpsM.getChildMeshes().forEach(m => { m.setEnabled(true); m.isVisible = true; });
      }
      this.weapon._glbRoot = fpsM || this.weapon._glbRoot;
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

    // ── Som de impacto/dor ao LEVAR dano (mob/queda/melee local) ──────
    // PvP via rede já toca 'hurt' no handler hit_confirmed; aqui garante
    // feedback sonoro também em dano de inimigo e knockback local.
    try { this.sounds?.playNow?.('hurt', 0.9); } catch (_) {}

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

    // ── Reação de dano (hitstun curto) ───────────────────────────────
    //  Frente → "hit_face". Levando por trás CORRENDO → "hit_back_run"
    //  (é empurrado pra frente como se tivesse levado nas costas).
    if (this.hp > 0 && this.animCtrl && this.animLib) {
      let reactAnim = this.animLib.has('hit_face') ? 'hit_face'
                    : (this.animLib.has('hit_face_2') ? 'hit_face_2' : null);
      if (fromPos) {
        const dx = this.mesh.position.x - fromPos.x;
        const dz = this.mesh.position.z - fromPos.z;
        const yawRad = BABYLON.Tools.ToRadians(this.yaw);
        const fwd = new BABYLON.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
        const fromDir = new BABYLON.Vector3(dx, 0, dz).normalize();   // atacante→player
        const fromBehind = BABYLON.Vector3.Dot(fromDir, fwd) > 0.35;
        const running = Math.hypot(this._vx, this._vz) > 6;
        if (fromBehind && running && this.animLib.has('hit_back_run')) reactAnim = 'hit_back_run';
      }
      if (reactAnim) {
        this._hitStunT = 0.30;
        this.animCtrl.play(reactAnim, { loop: false, speed: 1.3, fade: 0.06 });
      }
    }

    if (this.hp <= 0 && !this._dead) {
      this._startDeath('enemy');
    }
  }

  /**
   * A7+B2: KNOCKBACK PvP REPLICADO (server-auth).
   *
   * O servidor calcula o VETOR de empurrão (player_knockback) e manda pra cá.
   * Aqui SÓ aplicamos o empurrão na física local (soma em _kbVx/_kbVz, igual
   * o wall-kick) + um stun curto que trava o input de locomoção. NÃO mexemos
   * no HP — quem manda na vida é o server via applyServerHp. Assim o alvo
   * SENTE o golpe de outro player (antes era só cosmético no atacante).
   *
   * @param {number} dirX   componente X da direção do empurrão (já normalizada-ish)
   * @param {number} dirZ   componente Z da direção do empurrão
   * @param {number} force  magnitude do empurrão (server: 6-16+)
   * @param {number} stunMs duração do stun em ms (150-250)
   * @param {boolean} crit  golpe pesado → arremessa um pouco pra cima
   */
  applyKnockback(dirX, dirZ, force = 7, stunMs = 150, crit = false) {
    if (this._dead) return;
    let dx = +dirX || 0, dz = +dirZ || 0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    dx /= len; dz /= len;
    const f = Math.max(0, +force || 0);
    // Soma na velocidade de knockback (decai sozinha no update via kbDrag).
    this._kbVx += dx * f;
    this._kbVz += dz * f;
    // Golpe pesado arremessa levemente pra cima se estiver no chão.
    if (crit && this.isGrounded) this.velY = Math.max(this.velY, 4);
    // Stun curto trava locomoção (canMove). Clamp 80-400ms por segurança.
    const stunS = Math.min(0.4, Math.max(0.08, (+stunMs || 150) / 1000));
    this._pvpStunT = Math.max(this._pvpStunT, stunS);
    // Feedback visual de reação (reusa hitstun de animação).
    this._damageFlashT = Math.max(this._damageFlashT, 0.45);
    if (this.animCtrl && this.animLib) {
      const react = this.animLib.has('hit_face') ? 'hit_face'
                  : (this.animLib.has('hit_face_2') ? 'hit_face_2' : null);
      if (react) {
        this._hitStunT = Math.max(this._hitStunT, 0.30);
        try { this.animCtrl.play(react, { loop: false, speed: 1.3, fade: 0.06 }); } catch (_) {}
      }
    }
  }

  /**
   * MULTIPLAYER: o SERVIDOR é autoritativo no HP (calcula o dano via
   * WeaponTable). Aqui só REFLETIMOS o valor recebido na barra local
   * (this.hp/this.maxHp são o que o HUD lê) — sem recalcular dano — e damos
   * o feedback visual quando cai + tratamos morte/renascimento que o servidor
   * decidiu. Assim a vida desce na hora do soco/tiro e dá pra saber quanto
   * falta pra morrer, em vez de "morrer do nada".
   */
  applyServerHp(newHp, newMax) {
    if (Number.isFinite(newMax) && newMax > 0) this.maxHp = newMax;
    if (!Number.isFinite(newHp)) return;
    const clamped = Math.max(0, Math.min(this.maxHp, newHp));
    const took = clamped < this.hp;            // levou dano neste delta?
    this.hp = clamped;
    if (took && !this._dead) {
      // feedback de pancada SEM re-descontar vida (flash + tremor + reação)
      this._damageFlashT = 0.45;
      this._dmgShakeT = 0.22; this._dmgShakeMag = 0.16;
      if (this.hp > 0 && this.animCtrl && this.animLib) {
        const react = this.animLib.has('hit_face') ? 'hit_face'
                    : (this.animLib.has('hit_face_2') ? 'hit_face_2' : null);
        if (react) { this._hitStunT = 0.22; this.animCtrl.play(react, { loop: false, speed: 1.3, fade: 0.06 }); }
      }
    }
    if (this.hp <= 0 && !this._dead)      this._startDeath('enemy');  // servidor me matou
    else if (this.hp > 0 && this._dead)   this.respawn();             // servidor me reviveu
  }

  /**
   * MULTIPLAYER: knockback de PvP autoritativo. O servidor manda o vetor
   * (direção atacante→eu já normalizado * força) no hit_confirmed. Aqui só
   * injetamos nas velocidades de knockback que o move() já consome (drag +
   * gravidade tratados no update). Sem isto o golpe "não tem impacto".
   */
  applyServerKnockback(kbx, kby, kbz) {
    if (this._dead) return;
    if (Number.isFinite(kbx)) this._kbVx = kbx;
    if (Number.isFinite(kbz)) this._kbVz = kbz;
    if (Number.isFinite(kby) && kby > 0) {
      // pop vertical só se estiver no chão (não somar em pleno pulo)
      if (this.isGrounded || this.velY <= 0.1) this.velY = Math.max(this.velY, kby);
    }
  }

  /**
   * Inicia a morte. SEM auto-respawn — o jogador renasce clicando em Renascer.
   * @param {'fall'|'enemy'} type
   *   'fall'  → caiu do mapa: CONTINUA caindo (anim de queda), tela de morte.
   *   'enemy' → morreu na fase: para no lugar, anim de morto.
   */
  _startDeath(type = 'enemy') {
    if (this._dead) return;
    this._dead = true;
    this._deathType = type;
    this.hp = 0;
    this._kbVx = 0; this._kbVz = 0;

    if (this.stateMachine) this.stateMachine.setState('knockdown');   // bloqueia controle

    if (type === 'fall') {
      // NÃO congela — deixa despencar mostrando a anim de queda.
      this._vx = 0; this._vz = 0;
      this.sounds?.playNow?.('deathfall', 0.9);
      if (this.animCtrl && this.animLib?.has('falling')) {
        this.animCtrl.play('falling', { loop: true, speed: 1.0, fade: 0.08 });
      }
    } else {
      // Morte na fase → para no lugar e toca a anim de morto.
      this._vx = 0; this._vz = 0; this.velY = 0;
      const dieAnim = this.animLib?.has('dead') ? 'dead' : 'knockdown';
      this.animCtrl?.play(dieAnim, { loop: false, speed: 1.0, fade: 0.10 });
    }

    // Mensagem da tela de morte conforme o tipo
    const msg = document.getElementById('death-msg');
    if (msg) msg.textContent = type === 'fall'
      ? 'Você caiu do mapa! 🔄 Renascer pra voltar ao topo.'
      : 'Você foi derrotado! 🔄 Renascer pra continuar.';

    // Libera o cursor (pra clicar Renascer). O loop continua atualizando a
    // morte mesmo sem pointer-lock (ver main.js / update).
    try { document.exitPointerLock?.(); } catch (_) {}

    // A tela de morte aparece pelo HUD (info.dead). Expõe o respawn global.
    window.respawnPlayer = () => this.respawn();

    // REGRA DO DONO #2/#3: CADÁVER estilo Fortnite. O corpo cai/fica ~1.4s,
    // depois SOME em ~0.6s (fade cyan + partículas + encolhe) = ~2s total.
    // Nome/vida (nameplate + HUD) somem JUNTO no mesmo instante do vanish.
    if (this._vanishTimer) { try { clearTimeout(this._vanishTimer); } catch (_) {} }
    this._vanishTimer = setTimeout(() => {
      this._vanishTimer = null;
      if (this._dead) this._playDeathVanish();
    }, 1400);
  }

  /**
   * REGRA DO DONO #2: efeito de "desmonte" do cadáver do player LOCAL,
   * adaptado do RemotePlayer.dispose() (fade cyan + ParticleSystem vanish +
   * encolhe em ~0.6s). Opera sobre o avatar visível (animator.root), que é o
   * que aparece em TPS / pros outros players. Em ~0.6s o corpo encolhe pra
   * ~15%, esmaece e some. NÃO mexe no _dead nem reposiciona — o vanish é
   * INDEPENDENTE do respawn (regra #5).
   */
  _playDeathVanish() {
    if (this._vanishPlaying) return;
    this._vanishPlaying = true;
    const root = this.animator?.root;
    if (!root || root.isDisposed?.()) { return; }

    // Coleta materiais do avatar pra esmaecer (fade alpha + emissive cyan).
    const mats = [];
    try {
      root.getChildMeshes?.().forEach(mesh => {
        const mat = mesh.material;
        if (mat && !mats.includes(mat)) {
          try {
            mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
          } catch (_) {}
          mats.push(mat);
        }
      });
    } catch (_) {}

    // Partículas de "vanish" cyan (mesmo visual do RemotePlayer.dispose).
    try {
      if (typeof BABYLON !== 'undefined' && root.position) {
        const ps = new BABYLON.ParticleSystem('playerVanish', 80, this.scene);
        const tex = new BABYLON.DynamicTexture('pVanishTex', 16, this.scene, false);
        const ctx = tex.getContext();
        const g = ctx.createRadialGradient(8, 8, 2, 8, 8, 8);
        g.addColorStop(0, 'rgba(180,255,220,1)');
        g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16); tex.update();
        ps.particleTexture = tex;
        const emitter = new BABYLON.TransformNode('pVanishEmit', this.scene);
        emitter.position.copyFrom(root.position);
        emitter.position.y += 1.0;
        ps.emitter = emitter;
        ps.minEmitBox = new BABYLON.Vector3(-0.4, 0, -0.4);
        ps.maxEmitBox = new BABYLON.Vector3(0.4, 0.5, 0.4);
        ps.color1 = new BABYLON.Color4(0.6, 1.0, 0.85, 1);
        ps.color2 = new BABYLON.Color4(0.3, 0.8, 1.0, 0.9);
        ps.colorDead = new BABYLON.Color4(0.3, 0.6, 1.0, 0);
        ps.minSize = 0.15; ps.maxSize = 0.4;
        ps.minLifeTime = 0.4; ps.maxLifeTime = 0.9;
        ps.emitRate = 0; ps.manualEmitCount = 60;
        ps.gravity = new BABYLON.Vector3(0, 2, 0);
        ps.direction1 = new BABYLON.Vector3(-1.5, 1, -1.5);
        ps.direction2 = new BABYLON.Vector3(1.5, 4, 1.5);
        ps.minEmitPower = 1; ps.maxEmitPower = 3;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        ps.start();
        setTimeout(() => {
          try { ps.stop(); } catch (_) {}
          setTimeout(() => { try { ps.dispose(); emitter.dispose(); } catch (_) {} }, 1200);
        }, 200);
      }
    } catch (_) {}

    // REGRA #3: nome/vida do player LOCAL somem JUNTO com o cadáver. O HUD
    // (#death-screen) é overlay fullscreen de respawn — fica. O que tira a
    // "vida flutuando no lugar da morte" é esconder o avatar; sinalizamos
    // que o corpo já sumiu pra qualquer nameplate/HP worldspace local.
    this._corpseVanished = true;

    // Anima escala→~15%, alpha→0 ao longo de ~0.6s, sobe levemente. Ao fim,
    // esconde o avatar (não dispose — o respawn reusa o mesmo root).
    const FADE_MS = 600;
    const startT = performance.now();
    const startScale = (root.scaling?.x) || 1;
    const tick = () => {
      // Se respawnou no meio do vanish, aborta e restaura (regra #5).
      if (!this._dead) { this._restoreAvatarAfterVanish(root, mats, startScale); return; }
      if (root.isDisposed?.()) { this._vanishPlaying = false; return; }
      const t = performance.now() - startT;
      const k = Math.min(1, t / FADE_MS);
      const s = startScale * (1 - k * 0.85);   // encolhe pra ~15%
      try {
        if (root.scaling) root.scaling.set(s, s, s);
        if (root.position) root.position.y += 0.012;   // sobe enquanto some
        for (const mat of mats) {
          mat.alpha = 1 - k;
          if (mat.emissiveColor) {
            mat.emissiveColor = new BABYLON.Color3(0.3 + 0.7 * (1 - k), 1.0, 0.7 + 0.3 * k);
          }
        }
      } catch (_) {}
      if (k < 1) requestAnimationFrame(tick);
      else {
        // Some de vez: esconde o avatar (o respawn restaura via _restoreAvatarAfterVanish).
        try { root.setEnabled?.(false); } catch (_) {}
        this._vanishPlaying = false;
      }
    };
    this._vanishMats = mats;
    this._vanishRoot = root;
    this._vanishStartScale = startScale;
    requestAnimationFrame(tick);
  }

  /** Restaura o avatar visível ao estado normal (escala/alpha/emissive/enabled). */
  _restoreAvatarAfterVanish(root, mats, startScale) {
    this._vanishPlaying = false;
    this._corpseVanished = false;
    try {
      if (root && !root.isDisposed?.()) {
        if (root.scaling) root.scaling.set(startScale, startScale, startScale);
        root.setEnabled?.(true);
      }
      for (const mat of (mats || [])) {
        mat.alpha = 1;
        if (mat.emissiveColor) mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
      }
    } catch (_) {}
  }

  /** Renasce CAINDO DO CÉU (skydive), igual à entrada no mundo (regra #4). */
  respawn() {
    this._dead = false;
    this._deathType = null;
    this.hp = this.maxHp;
    this._kbVx = 0; this._kbVz = 0;
    this._vx = 0; this._vz = 0; this.velY = 0;
    this._exhausted = false; this.stamina = this.maxStamina;

    // REGRA #5: garante que o cadáver antigo JÁ sumiu antes de renascer — o
    // vanish é independente do respawn e NUNCA deve teleportar o corpo morto
    // pro novo spawn. Cancela timer pendente e restaura o avatar visível.
    if (this._vanishTimer) { try { clearTimeout(this._vanishTimer); } catch (_) {} this._vanishTimer = null; }
    this._restoreAvatarAfterVanish(
      this._vanishRoot || this.animator?.root,
      this._vanishMats,
      this._vanishStartScale || 1
    );
    this._vanishRoot = null; this._vanishMats = null;
    this._corpseVanished = false; this._vanishPlaying = false;

    if (this.stateMachine) {
      this.stateMachine.setState(this.stateMachine.isArmedFlag ? 'armed' : 'unarmed');
    }
    this.spawn();         // skydive: (0,200,0) caindo
    this.onRespawn?.();   // reseta inimigos
    // Re-trava o cursor e volta o jogo ao normal (reativa input — regra #4).
    try { this.input.activate?.(); } catch (_) {}
  }

  // ── Camera via setTarget (mais confiável que .rotation) ───────────
  _updateCamera() {
    // VR ativo: WebXRDefaultExperience controla câmera; pula update manual
    if (this._vrControlsCamera) return;
    const yR = BABYLON.Tools.ToRadians(this.yaw);
    // Pitch efetivo = pitch base − recoilOffset (sobe a mira no kick).
    // SÓ pra montar a câmera/raycast: this.pitch base permanece intacto, então
    // ao decair o offset a mira volta exatamente pro centro. Clamp ±89 garante
    // que kick + pitch nunca cruzem o zênite (nunca "olhar pra trás").
    const pitchEff = Math.max(-89, Math.min(89, this.pitch - (this._recoilOffset || 0)));
    const pR = BABYLON.Tools.ToRadians(pitchEff);

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
      // Predicate aceita QUALQUER colisor: paredes pickáveis (checkCollisions)
      // E proxies de colisão de props GLB (que vêm isPickable=false, mas têm
      // checkCollisions=true). Sem isso a câmera atravessa a geometria visível
      // de props cujo colisor é proxy. Ignora só o próprio mesh do player.
      const wallHit   = this.scene.pickWithRay(wallRay, m =>
        m.checkCollisions === true && m !== this.mesh
      );

      // Distância-alvo da câmera ao longo do ray pivot→câmera.
      // Sem hit: distância cheia. Com hit: encosta na parede com margem,
      // MAS o piso de segurança NUNCA pode ultrapassar a distância real do
      // hit — senão a câmera atravessa a parede (clip). Por isso
      // min(toCamDist, max(0.20, dist-0.25)) e clamp final pelo hit real.
      let targetDist;
      if (wallHit?.hit && wallHit.distance < toCamDist) {
        const margin = wallHit.distance - 0.25;
        targetDist = Math.min(toCamDist, Math.max(0.20, margin));
        targetDist = Math.min(targetDist, wallHit.distance); // nunca passa da parede
      } else {
        targetDist = toCamDist;
      }

      // Anti-snap: encolher (aproximar da parede) é IMEDIATO p/ evitar clip;
      // crescer (reabrir ao sair da parede) é interpolado p/ a câmera não
      // "pular" de volta. Lerp só na direção de afastamento.
      const prevDist = this._tpsCamDist ?? targetDist;
      const nextDist = (targetDist < prevDist)
        ? targetDist
        : prevDist + (targetDist - prevDist) * 0.20;
      this._tpsCamDist = nextDist;

      this.camera.position.copyFrom(pivot.add(toCamDir.scale(nextDist)));

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
      // _slideCamDrop abaixa a câmera durante o slide (sensação de agachar).
      eye.y += this.HEIGHT / 2 - 0.10 + shakeY - (this._slideCamDrop || 0);
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

  // ── Loop de metralhadora: liga enquanto está metralhando de verdade ──
  //  (segurando + tem munição + não recarregando). Solta/acaba a bala/
  //  recarrega → para. O fireRate da arma controla a cadência dos tiros;
  //  o loop é só o som contínuo por cima.
  _updateMgLoop(w) {
    const id = w.fireSound || 'mg_loop';
    const firing = this.input.isFireDown() && this.weapon.ammo > 0 && !this.weapon.reloading;
    if (firing && !this._mgLoopOn) {
      this._mgLoopOn = true; this._mgLoopId = id;
      this.sounds?.startLoop?.(id, 0.8);
    } else if (!firing && this._mgLoopOn) {
      this._stopMgLoop();
    }
  }

  _stopMgLoop() {
    if (this._mgLoopOn) {
      this._mgLoopOn = false;
      this.sounds?.stopLoop?.(this._mgLoopId || 'mg_loop');
    }
  }

  // ── Passos em LOOP enquanto corre no chão ──────────────────────────
  //  Liga o loop de passos (concreto por padrão; troca por superfície depois)
  //  quando movendo + no chão + sem atacar. A velocidade do áudio acompanha
  //  o sprint (corre mais rápido = passos mais rápidos).
  _updateFootsteps(moving) {
    const onGround = this.isGrounded;
    const attacking = this.stateMachine?.isAttacking?.();
    const run = moving && onGround && !attacking && !this._dead && this._dashT <= 0;
    const surfaceId = this._footstepSurface || 'run_concrete';

    if (run) {
      if (!this._footOn) {
        this._footOn = true; this._footId = surfaceId;
        this.sounds?.startLoop?.(surfaceId, 0.5);
      }
      // velocidade do áudio ~ velocidade real (sprint acelera os passos).
      //  Valores reduzidos pra casar o LOOP do som com a cadência visual do
      //  passo (antes 1.35/1.0 corria rápido demais e descolava da pisada).
      const rate = this._sprinting ? 1.1 : 0.85;
      this.sounds?.setLoopRate?.(this._footId, rate);
    } else if (this._footOn) {
      this._stopFootsteps();
    }
  }

  _stopFootsteps() {
    if (this._footOn) { this._footOn = false; this.sounds?.stopLoop?.(this._footId || 'run_concrete'); }
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
