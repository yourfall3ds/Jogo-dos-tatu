// ─────────────────────────────────────────────────────────────────
//  AssetMachine — Item de mapa interativo (Máquina de Criação)
//
//  Comportamento:
//    1. Spawn: Fase 1 (disco compacto) cai de cima girando
//    2. Pouso: squish + partículas de pouso
//    3. Transformação: efeito de energia → Fase 1 desaparece,
//       Fase 2 (pernas estendidas) surge com burst de partículas
//    4. Idle: pulso de glow suave + bob leve
//    5. Interação: player chega perto → prompt [E] → abre MeshyPanel
//
//  Uso em main.js:
//    const machine = new AssetMachine(scene, meshyPanel, player, input);
//    // no game loop:
//    machine.update(dt);
// ─────────────────────────────────────────────────────────────────

function enc(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

const FOLDER   = 'assets/itens 3d/Maquina de assets/';
const FILE_P1  = 'Meshy_AI_Phase_1_Compact_Disc_0530011922_image-to-3d-texture.glb';
const FILE_P2  = 'Meshy_AI_Phase_2_Legs_Extendin_0530011930_image-to-3d-texture.glb';

const INTERACT_DIST = 3.5;   // distância para mostrar prompt [E]
const FALL_START_Y  = 8;     // altura inicial de lançamento acima do chão
const GRAVITY       = 24;    // aceleração de queda (unidades/s²)
const MACHINE_SCALE = 0.9;

export class AssetMachine {
  /**
   * @param {BABYLON.Scene}  scene
   * @param {MeshyPanel}     meshyPanel
   * @param {Player}         player
   * @param {InputManager}   input
   * @param {BABYLON.Vector3} [position]  — onde a máquina pousa
   */
  constructor(scene, meshyPanel, player, input,
              position = new BABYLON.Vector3(8, 0, 8)) {
    this.scene      = scene;
    this.meshyPanel = meshyPanel;
    this.player     = player;
    this.input      = input;
    this.position   = position.clone();

    // ── Estado da animação de deploy ───────────────────────────────
    this._phase = 'loading';   // loading → falling → landing → transforming → ready
    this._t     = 0;           // timer dentro da fase atual
    this._fallVelY = 0;
    this._landBounce = 0;

    // ── Meshes ─────────────────────────────────────────────────────
    this._p1Root = null;   // Fase 1: disco compacto
    this._p2Root = null;   // Fase 2: pernas estendidas

    // ── FX ─────────────────────────────────────────────────────────
    this._glow      = null;
    this._idleTimer = 0;

    // ── Interação ──────────────────────────────────────────────────
    this._wasE     = false;
    this._promptEl = null;

    this._buildPrompt();
    this._buildGlow();
    this._load();
  }

  // ── DOM: prompt de interação ────────────────────────────────────
  _buildPrompt() {
    const el = document.createElement('div');
    el.id = 'asset-machine-prompt';
    el.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:28%',
      'transform:translateX(-50%)',
      'background:rgba(8,6,22,0.90)',
      'border:1px solid #9966ee',
      'color:#dce',
      'font-family:Segoe UI,monospace',
      'font-size:14px',
      'padding:9px 22px',
      'border-radius:9px',
      'pointer-events:none',
      'display:none',
      'z-index:8500',
      'text-align:center',
      'letter-spacing:1px',
      'box-shadow:0 0 18px rgba(140,80,255,0.45)',
    ].join(';');
    el.innerHTML =
      `<b style="color:#c9f;font-size:15px">[E]</b>&nbsp;&nbsp;Abrir Máquina de Criação`;
    document.body.appendChild(el);
    this._promptEl = el;
  }

  // ── Glow layer partilhado entre Fase 1 e 2 ──────────────────────
  _buildGlow() {
    this._glow = new BABYLON.GlowLayer('assetMachineGlow', this.scene);
    this._glow.intensity = 0;
  }

  // ── Carrega os dois GLBs em paralelo ─────────────────────────────
  async _load() {
    const folder = enc(FOLDER);
    try {
      const [r1, r2] = await Promise.all([
        BABYLON.SceneLoader.ImportMeshAsync('', folder, encodeURIComponent(FILE_P1), this.scene),
        BABYLON.SceneLoader.ImportMeshAsync('', folder, encodeURIComponent(FILE_P2), this.scene),
      ]);

      // ── Fase 1 ────────────────────────────────────────────────────
      this._p1Root = r1.meshes[0];
      this._p1Root.name = '__assetMachine_p1';
      this._p1Root.position.set(
        this.position.x,
        this.position.y + FALL_START_Y,
        this.position.z,
      );
      this._p1Root.scaling.setAll(MACHINE_SCALE);
      r1.meshes.forEach(m => {
        if (m.getTotalVertices() > 0) this._glow.addIncludedOnlyMesh(m);
      });

      // ── Fase 2 (escondida) ────────────────────────────────────────
      this._p2Root = r2.meshes[0];
      this._p2Root.name = '__assetMachine_p2';
      this._p2Root.position.copyFrom(this.position);
      this._p2Root.scaling.setAll(0);           // invisível até a transformação
      this._setEnabled(r2.meshes, false);
      r2.meshes.forEach(m => {
        if (m.getTotalVertices() > 0) this._glow.addIncludedOnlyMesh(m);
      });

      // ── Inicia a sequência de deploy ──────────────────────────────
      this._phase    = 'falling';
      this._t        = 0;
      this._fallVelY = 0;
      console.log('[AssetMachine] ✅ GLBs carregados — iniciando deploy');

    } catch (err) {
      console.error('[AssetMachine] Erro ao carregar modelos:', err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  _setEnabled(meshes, val) {
    meshes.forEach(m => m.setEnabled(val));
  }

  /** Aplica alpha recursivamente nos materiais dos filhos */
  _setAlpha(root, alpha) {
    root.getChildMeshes(false).forEach(m => {
      if (!m.material) return;
      // Cria instância independente para não afetar outros usos do material
      if (!m.__machineMatClone) {
        m.material        = m.material.clone(m.material.name + '_mc');
        m.__machineMatClone = true;
      }
      m.material.alpha = alpha;
    });
  }

  /** Partículas de pouso (anel de faíscas/poeira ao bater no chão) */
  _fxLanding() {
    const pos = this.position;
    const ps  = new BABYLON.ParticleSystem('mac_land', 50, this.scene);
    ps.createCylinderEmitter(0.9, 0.05, 0.1, 0);
    ps.emitter     = new BABYLON.Vector3(pos.x, pos.y + 0.1, pos.z);
    ps.minEmitPower = 1.5;  ps.maxEmitPower = 5;
    ps.minLifeTime  = 0.25; ps.maxLifeTime  = 0.55;
    ps.minSize      = 0.04; ps.maxSize      = 0.18;
    ps.emitRate     = 0;
    ps.manualEmitCount = 50;
    ps.color1    = new BABYLON.Color4(0.85, 0.85, 1.0, 0.9);
    ps.color2    = new BABYLON.Color4(0.6,  0.5,  1.0, 0.6);
    ps.colorDead = new BABYLON.Color4(0.4,  0.3,  0.8, 0);
    ps.direction1 = new BABYLON.Vector3(-2, 0.3, -2);
    ps.direction2 = new BABYLON.Vector3( 2, 1.0,  2);
    ps.gravity    = new BABYLON.Vector3(0, -4, 0);
    ps.start();
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1400);
  }

  /** Partículas de transformação (burst de energia roxo/ciano) */
  _fxTransform() {
    const pos = this.position;

    // Burst central esférico
    const ps1 = new BABYLON.ParticleSystem('mac_tfx1', 140, this.scene);
    ps1.createSphereEmitter(0.4);
    ps1.emitter     = new BABYLON.Vector3(pos.x, pos.y + 0.6, pos.z);
    ps1.minEmitPower = 2;   ps1.maxEmitPower = 9;
    ps1.minLifeTime  = 0.4; ps1.maxLifeTime  = 1.0;
    ps1.minSize      = 0.06; ps1.maxSize     = 0.22;
    ps1.emitRate     = 0;
    ps1.manualEmitCount = 140;
    ps1.color1    = new BABYLON.Color4(0.6, 0.3, 1.0, 1.0);
    ps1.color2    = new BABYLON.Color4(0.2, 0.8, 1.0, 0.9);
    ps1.colorDead = new BABYLON.Color4(0.4, 0.2, 0.7, 0);
    ps1.direction1 = new BABYLON.Vector3(-1, 1, -1);
    ps1.direction2 = new BABYLON.Vector3( 1, 4,  1);
    ps1.gravity    = new BABYLON.Vector3(0, -6, 0);
    ps1.start();
    setTimeout(() => { try { ps1.dispose(); } catch (_) {} }, 2000);

    // Anel de chão
    const ps2 = new BABYLON.ParticleSystem('mac_tfx2', 70, this.scene);
    ps2.createCylinderEmitter(1.4, 0.05, 0.1, 0);
    ps2.emitter     = new BABYLON.Vector3(pos.x, pos.y + 0.05, pos.z);
    ps2.minEmitPower = 2;   ps2.maxEmitPower = 6;
    ps2.minLifeTime  = 0.3; ps2.maxLifeTime  = 0.7;
    ps2.minSize      = 0.05; ps2.maxSize     = 0.16;
    ps2.emitRate     = 0;
    ps2.manualEmitCount = 70;
    ps2.color1    = new BABYLON.Color4(0.8, 0.5, 1.0, 0.8);
    ps2.color2    = new BABYLON.Color4(0.3, 0.7, 1.0, 0.6);
    ps2.colorDead = new BABYLON.Color4(0.5, 0.2, 0.8, 0);
    ps2.direction1 = new BABYLON.Vector3(-3, 0.2, -3);
    ps2.direction2 = new BABYLON.Vector3( 3, 1.0,  3);
    ps2.gravity    = new BABYLON.Vector3(0, 2, 0);
    ps2.start();
    setTimeout(() => { try { ps2.dispose(); } catch (_) {} }, 1600);
  }

  // ── Update principal — chamado pelo game loop em main.js ──────────
  update(dt) {
    if (!this._p1Root && this._phase !== 'loading') return;

    this._t += dt;

    switch (this._phase) {
      case 'falling':      this._updateFalling(dt);      break;
      case 'landing':      this._updateLanding(dt);      break;
      case 'transforming': this._updateTransforming(dt); break;
      case 'ready':        this._updateReady(dt);        break;
    }
  }

  // ── Fase: FALLING ─────────────────────────────────────────────────
  _updateFalling(dt) {
    if (!this._p1Root) return;

    // Gravidade manual
    this._fallVelY -= GRAVITY * dt;
    this._p1Root.position.y += this._fallVelY * dt;

    // Rotação no ar (parece lançado)
    this._p1Root.rotation.y += dt * 4.0;
    this._p1Root.rotation.x += dt * 2.2;

    // Glow fraco girando
    this._glow.intensity = 0.12;

    // Tocou o chão?
    if (this._p1Root.position.y <= this.position.y + 0.02) {
      this._p1Root.position.y = this.position.y;
      this._p1Root.rotation.x = 0;   // endireita
      this._phase = 'landing';
      this._t     = 0;
      this._fxLanding();
    }
  }

  // ── Fase: LANDING (squish + estabilização) ────────────────────────
  _updateLanding(dt) {
    if (!this._p1Root) return;

    const t = this._t;

    // Squish de mola: comprime em Y, expande em XZ ao bater
    const bounce = Math.exp(-t * 7) * Math.cos(t * 16) * 0.35;
    this._p1Root.scaling.set(
      MACHINE_SCALE * (1 + bounce),
      MACHINE_SCALE * (1 - bounce),
      MACHINE_SCALE * (1 + bounce),
    );

    // Giro desacelerando
    this._p1Root.rotation.y += dt * Math.max(0, 2.5 - t * 3.5);

    // Glow pulsando ao impacto
    this._glow.intensity = 0.2 + Math.exp(-t * 4) * 0.4;

    if (t >= 1.6) {
      // Estabilizou — prepara transformação
      this._p1Root.scaling.setAll(MACHINE_SCALE);
      this._phase = 'transforming';
      this._t     = 0;
      this._fxTransform();
      // Ativa Fase 2 (ainda invisível via scale=0)
      if (this._p2Root) {
        this._setEnabled(this._p2Root.getChildMeshes(false).concat([this._p2Root]), true);
      }
    }
  }

  // ── Fase: TRANSFORMING ────────────────────────────────────────────
  _updateTransforming(dt) {
    if (!this._p1Root || !this._p2Root) return;

    const DUR  = 0.85;
    const t    = Math.min(this._t / DUR, 1);
    const ease = 1 - Math.pow(1 - t, 3);   // cubic ease-out

    // Fase 1: encolhe + gira rápido + fade
    const s1 = MACHINE_SCALE * (1 - ease);
    this._p1Root.scaling.setAll(Math.max(0.001, s1));
    this._p1Root.rotation.y += dt * (8 * (1 - t) + 1);
    this._setAlpha(this._p1Root, 1 - ease);

    // Fase 2: cresce + sobe levemente + fade in
    const s2 = MACHINE_SCALE * ease;
    this._p2Root.scaling.setAll(Math.max(0.001, s2));
    this._p2Root.position.y = this.position.y + (1 - ease) * 0.6;
    this._setAlpha(this._p2Root, ease);

    // Glow explosivo
    this._glow.intensity = 0.8 * Math.sin(t * Math.PI) + 0.15;

    if (this._t >= DUR) {
      // ── Finaliza deploy ──────────────────────────────────────────
      this._p1Root.setEnabled(false);       // Fase 1 some para sempre

      this._p2Root.scaling.setAll(MACHINE_SCALE);
      this._p2Root.position.copyFrom(this.position);
      this._setAlpha(this._p2Root, 1);

      this._glow.intensity = 0.45;
      this._phase    = 'ready';
      this._t        = 0;
      this._idleTimer = 0;
      console.log('[AssetMachine] 🤖 Máquina pronta — pressione E para usar');
    }
  }

  // ── Fase: READY (idle + interação) ───────────────────────────────
  _updateReady(dt) {
    this._idleTimer += dt;

    // Bob suave (flutua levemente)
    if (this._p2Root) {
      this._p2Root.position.y = this.position.y + Math.sin(this._idleTimer * 1.3) * 0.04;
      this._p2Root.rotation.y += dt * 0.35;
    }

    // Glow pulsando
    this._glow.intensity = 0.35 + Math.sin(this._idleTimer * 2.1) * 0.12;

    // ── Interação ────────────────────────────────────────────────────
    if (!this.player || !this.player.mesh) return;

    const dist = BABYLON.Vector3.Distance(
      this.player.mesh.position,
      this.position,
    );
    const inRange = dist < INTERACT_DIST;

    // Mostra prompt apenas quando em range e o painel está fechado
    if (this._promptEl) {
      this._promptEl.style.display =
        inRange && !this.meshyPanel._active ? 'block' : 'none';
    }

    if (inRange) {
      const eNow = this.input.isDown('KeyE');
      if (eNow && !this._wasE) {
        this.meshyPanel.toggle();
      }
      this._wasE = eNow;
    } else {
      this._wasE = false;
    }
  }

  // ── Limpeza ────────────────────────────────────────────────────────
  dispose() {
    this._promptEl?.remove();
    try { this._glow?.dispose(); }     catch (_) {}
    try { this._p1Root?.dispose(); }   catch (_) {}
    try { this._p2Root?.dispose(); }   catch (_) {}
  }
}
