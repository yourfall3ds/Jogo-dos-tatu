// ─────────────────────────────────────────────────────────────────
//  AssetMachine — Item de mapa interativo (Máquina de Criação)
//
//  Deploy: Fase 1 cai girando → squish → burst de partículas →
//          Fase 2 surge com pernas estendidas → idle com glow.
//
//  Geração: ao iniciar pipeline Meshy:
//    startGenerating()  → hologram sobe (feixe de luz + partículas)
//    showImage(url)     → imagem do asset flutua no holograma (visível à distância)
//    stopGenerating()   → holograma some
//
//  Interação: pressione E perto da máquina → abre MeshyPanel
// ─────────────────────────────────────────────────────────────────
import { LocalDB } from '../data/LocalDB.js';

function enc(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

const FOLDER   = 'assets/itens 3d/Maquina de assets/';
const FILE_P1  = 'Meshy_AI_Phase_1_Compact_Disc_0530011922_image-to-3d-texture.glb';
const FILE_P2  = 'Meshy_AI_Phase_2_Legs_Extendin_0530011930_image-to-3d-texture.glb';

const INTERACT_DIST = 3.5;
const FALL_START_Y  = 8;
const GRAVITY       = 24;
const MACHINE_SCALE = 0.9;

export class AssetMachine {
  constructor(scene, meshyPanel, player, input,
              position = new BABYLON.Vector3(8, 0, 8), id = null) {
    this.scene      = scene;
    this.meshyPanel = meshyPanel;
    this.player     = player;
    this.input      = input;
    this.position   = position.clone();

    this.id = id || ('mac_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5));
    // Register in global manager
    if (!window._assetMachines) window._assetMachines = [];
    window._assetMachines.push(this);
    // Save to DB (async, don't await)
    this._persistPlacement();

    this._phase     = 'loading';
    this._t         = 0;
    this._fallVelY  = 0;
    this._idleTimer = 0;

    this._p1Root = null;
    this._p2Root = null;
    this._glow   = null;

    // Hologram state
    this._generating  = false;
    this._holoFadeIn  = 0;    // 0→1 ao ativar
    this._beam        = null;
    this._disc        = null;
    this._disc2       = null;
    this._holoPs      = null;
    this._imgPlane    = null;
    this._imgBg       = null;

    // Preview 3D rotativo dentro do holograma
    this._preview3DRoot   = null;
    this._preview3DMeshes = null;

    this._wasE     = false;
    this._promptEl = null;

    this._buildPrompt();
    this._buildGlow();
    this._buildHologram();
    this._load();
  }

  // ── Prompt DOM ────────────────────────────────────────────────────
  _buildPrompt() {
    const el = document.createElement('div');
    el.id = 'asset-machine-prompt';
    el.style.cssText = [
      'position:fixed','left:50%','bottom:28%',
      'transform:translateX(-50%)',
      'background:rgba(8,6,22,0.90)',
      'border:1px solid #9966ee',
      'color:#dce','font-family:Segoe UI,monospace','font-size:14px',
      'padding:9px 22px','border-radius:9px',
      'pointer-events:none','display:none','z-index:8500',
      'text-align:center','letter-spacing:1px',
      'box-shadow:0 0 18px rgba(140,80,255,0.45)',
    ].join(';');
    el.innerHTML = `<b style="color:#c9f;font-size:15px">[E]</b>&nbsp;&nbsp;Abrir Máquina de Criação`;
    document.body.appendChild(el);
    this._promptEl = el;
  }

  // ── Glow layer ────────────────────────────────────────────────────
  _buildGlow() {
    this._glow = new BABYLON.GlowLayer('assetMachineGlow_' + Math.random(), this.scene);
    this._glow.intensity = 0;
  }

  // ── Holograma (oculto até startGenerating) ────────────────────────
  _buildHologram() {
    const p = this.position;

    // Feixe vertical de luz
    this._beam = BABYLON.MeshBuilder.CreateCylinder('mac_beam', {
      height: 5.0, diameterTop: 0.22, diameterBottom: 0.22, tessellation: 10,
    }, this.scene);
    this._beam.position.set(p.x, p.y + 2.6, p.z);
    this._beam.isPickable = false;
    const bm = new BABYLON.StandardMaterial('mac_beamMat', this.scene);
    bm.emissiveColor   = new BABYLON.Color3(0.25, 0.65, 1.0);
    bm.disableLighting = true;
    bm.alpha           = 0;
    bm.backFaceCulling = false;
    this._beam.material = bm;
    this._glow.addIncludedOnlyMesh(this._beam);

    // Disco superior (rotaciona)
    this._disc = BABYLON.MeshBuilder.CreateDisc('mac_disc', { radius: 1.1, tessellation: 40 }, this.scene);
    this._disc.position.set(p.x, p.y + 5.1, p.z);
    this._disc.rotation.x = Math.PI / 2;
    this._disc.isPickable  = false;
    const dm = new BABYLON.StandardMaterial('mac_discMat', this.scene);
    dm.emissiveColor   = new BABYLON.Color3(0.25, 0.65, 1.0);
    dm.disableLighting = true;
    dm.alpha           = 0;
    dm.backFaceCulling = false;
    this._disc.material = dm;
    this._glow.addIncludedOnlyMesh(this._disc);

    // Hexágono interno (counter-rotaciona)
    this._disc2 = BABYLON.MeshBuilder.CreateDisc('mac_disc2', { radius: 0.55, tessellation: 6 }, this.scene);
    this._disc2.position.set(p.x, p.y + 5.2, p.z);
    this._disc2.rotation.x = Math.PI / 2;
    this._disc2.isPickable  = false;
    const dm2 = new BABYLON.StandardMaterial('mac_disc2Mat', this.scene);
    dm2.emissiveColor   = new BABYLON.Color3(0.55, 0.25, 1.0);
    dm2.disableLighting = true;
    dm2.alpha           = 0;
    dm2.backFaceCulling = false;
    this._disc2.material = dm2;
    this._glow.addIncludedOnlyMesh(this._disc2);

    // Sem PointLight — cada luz extra estoura o limite de uniform blocks
    // do WebGL2 quando há múltiplas máquinas no mapa. O GlowLayer cobre.

    // Partículas subindo pelo feixe
    this._holoPs = new BABYLON.ParticleSystem('mac_holoPs', 120, this.scene);
    this._holoPs.emitter = new BABYLON.Vector3(p.x, p.y + 0.4, p.z);
    this._holoPs.createCylinderEmitter(0.12, 0.4, 0.1, 0);
    this._holoPs.minEmitPower = 0.4;  this._holoPs.maxEmitPower = 1.8;
    this._holoPs.minLifeTime  = 1.6;  this._holoPs.maxLifeTime  = 3.2;
    this._holoPs.emitRate     = 40;
    this._holoPs.minSize      = 0.03; this._holoPs.maxSize      = 0.09;
    this._holoPs.color1    = new BABYLON.Color4(0.25, 0.7, 1.0, 1.0);
    this._holoPs.color2    = new BABYLON.Color4(0.6,  0.3, 1.0, 0.8);
    this._holoPs.colorDead = new BABYLON.Color4(0,    0,   0,   0);
    this._holoPs.direction1 = new BABYLON.Vector3(-0.04, 1.6, -0.04);
    this._holoPs.direction2 = new BABYLON.Vector3( 0.04, 3.5,  0.04);
    this._holoPs.gravity    = new BABYLON.Vector3(0, -0.05, 0);
    // não inicia ainda

    // Plano da imagem (billboard — sempre de frente pro player)
    this._imgBg = BABYLON.MeshBuilder.CreatePlane('mac_imgBg', { width: 2.0, height: 2.0 }, this.scene);
    this._imgBg.position.set(p.x, p.y + 3.1, p.z);
    this._imgBg.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    this._imgBg.isPickable    = false;
    const bgm = new BABYLON.StandardMaterial('mac_imgBgMat', this.scene);
    bgm.emissiveColor   = new BABYLON.Color3(0.03, 0.03, 0.12);
    bgm.disableLighting = true;
    bgm.alpha           = 0;
    bgm.backFaceCulling = false;
    this._imgBg.material = bgm;

    this._imgPlane = BABYLON.MeshBuilder.CreatePlane('mac_imgPlane', { width: 1.85, height: 1.85 }, this.scene);
    this._imgPlane.position.set(p.x, p.y + 3.1, p.z);
    this._imgPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    this._imgPlane.isPickable    = false;
    this._imgPlane.setEnabled(false);   // oculto até showImage() ser chamado
    // material definido em showImage()
  }

  // ══════════════════════════════════════════════════════════════════
  //  API pública — chamada pelo MeshyPanel
  // ══════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  //  API pública — chamada pelo MeshyPanel
  //
  //  Fluxo de cores:
  //    startGenerating()  → 🔵 azul, sem imagem       (step 1: gerando)
  //    showImage(url)     → 🟢 verde + imagem         (step 1 concluído)
  //    startProcessing()  → 🔵 azul + imagem mantida  (steps 2/3/4)
  //    stopGenerating()   → feixe some, imagem fica   (tudo pronto)
  // ══════════════════════════════════════════════════════════════════

  startGenerating() {
    this._generating = true;
    this._holoFadeIn = 0;
    this._imgPlane.setEnabled(false);
    this._imgBg.material.alpha = 0;
    this._holoColor('blue');
    this._holoPs.start();
  }

  showImage(imageUrl) {
    if (!imageUrl) return;
    this._holoColor('green');

    // Mostra o fundo imediatamente — textura carrega async
    this._imgBg.material.alpha = 0.82;
    this._imgPlane.setEnabled(true);

    const mat = new BABYLON.StandardMaterial('mac_img_' + Date.now(), this.scene);
    const tex = new BABYLON.Texture(imageUrl, this.scene, false, false);
    tex.hasAlpha = false;
    mat.diffuseTexture  = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor   = new BABYLON.Color3(0.9, 0.9, 0.9);
    mat.backFaceCulling = false;
    mat.disableLighting = true;
    if (this._imgPlane.material) this._imgPlane.material.dispose();
    this._imgPlane.material = mat;
    this._glow.addIncludedOnlyMesh(this._imgPlane);
  }

  /** Volta para azul (step 2/3/4 iniciou) mas mantém a imagem visível */
  startProcessing() {
    this._holoColor('blue');
    // _imgPlane permanece visível mostrando a imagem de referência
  }

  /** Fica verde novamente quando step 2/3/4 concluiu */
  doneProcessing() {
    this._holoColor('green');
  }

  stopGenerating() {
    this._generating = false;
    this._holoPs.stop();
    // feixe e discos somem via fade; imagem/3D permanece
  }

  /** Carrega e exibe o modelo 3D girando dentro do holograma */
  async show3D(glbUrl) {
    if (!glbUrl) return;
    this._holoColor('green');
    this._disposePreview3D();

    // Esconde imagem 2D — o 3D vai substituir
    this._imgPlane.setEnabled(false);
    this._imgBg.material.alpha = 0;

    const isBlob    = glbUrl.startsWith('blob:');
    const lastSlash = glbUrl.lastIndexOf('/');
    const folder    = isBlob ? '' : glbUrl.substring(0, lastSlash + 1);
    const file      = isBlob ? glbUrl : encodeURIComponent(glbUrl.substring(lastSlash + 1));

    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
      const root   = result.meshes[0];
      root.name    = '__assetMachinePreview3D';
      result.meshes.forEach(m => { m.isPickable = false; });

      // Auto-scale: cabe em ~1.5 unidades
      root.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true);
      const size   = bounds.max.subtract(bounds.min);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = maxDim > 0.01 ? 1.5 / maxDim : 1.0;
      root.scaling.setAll(scale);

      // Centraliza verticalmente no feixe (~2.8u acima da máquina)
      root.computeWorldMatrix(true);
      const b2  = root.getHierarchyBoundingVectors(true);
      const midY = (b2.max.y + b2.min.y) / 2;
      root.position.set(
        this.position.x,
        this.position.y + 2.8 - midY + this.position.y,
        this.position.z,
      );
      // simplificação segura: só posiciona em Y fixo
      root.position.set(this.position.x, this.position.y + 2.5, this.position.z);

      this._preview3DRoot   = root;
      this._preview3DMeshes = result.meshes;
      console.log('[AssetMachine] 🎲 Preview 3D carregado (scale:', scale.toFixed(3), ')');
    } catch (e) {
      console.warn('[AssetMachine] Preview 3D falhou:', e.message);
      // Se falhar, restaura a imagem 2D
      this._imgPlane.setEnabled(true);
      this._imgBg.material.alpha = 0.82;
    }
  }

  _disposePreview3D() {
    if (this._preview3DMeshes) {
      this._preview3DMeshes.forEach(m => { try { m.dispose(); } catch (_) {} });
      this._preview3DMeshes = null;
      this._preview3DRoot   = null;
    }
  }

  _holoColor(c) {
    const blue  = [new BABYLON.Color3(0.25, 0.65, 1.0), new BABYLON.Color3(0.55, 0.25, 1.0),
                   new BABYLON.Color4(0.25, 0.7, 1.0, 1.0), new BABYLON.Color4(0.6, 0.3, 1.0, 0.8)];
    const green = [new BABYLON.Color3(0.2, 1.0, 0.4),  new BABYLON.Color3(0.4, 1.0, 0.2),
                   new BABYLON.Color4(0.2, 1.0, 0.4, 1.0), new BABYLON.Color4(0.4, 1.0, 0.2, 0.8)];
    const [main, inner, pc1, pc2] = c === 'green' ? green : blue;
    this._beam.material.emissiveColor  = main;
    this._disc.material.emissiveColor  = main;
    this._disc2.material.emissiveColor = inner;
    this._holoPs.color1 = pc1;
    this._holoPs.color2 = pc2;
  }

  // ── Carrega os dois GLBs ──────────────────────────────────────────
  async _load() {
    const folder = enc(FOLDER);
    try {
      const [r1, r2] = await Promise.all([
        BABYLON.SceneLoader.ImportMeshAsync('', folder, encodeURIComponent(FILE_P1), this.scene),
        BABYLON.SceneLoader.ImportMeshAsync('', folder, encodeURIComponent(FILE_P2), this.scene),
      ]);

      this._p1Root = r1.meshes[0];
      this._p1Root.name = '__assetMachine_p1';
      this._p1Root.position.set(this.position.x, this.position.y + FALL_START_Y, this.position.z);
      this._p1Root.scaling.setAll(MACHINE_SCALE);
      r1.meshes.forEach(m => { if (m.getTotalVertices() > 0) this._glow.addIncludedOnlyMesh(m); });

      this._p2Root = r2.meshes[0];
      this._p2Root.name = '__assetMachine_p2';
      this._p2Root.position.copyFrom(this.position);
      this._p2Root.scaling.setAll(0);
      this._setEnabled(r2.meshes, false);
      r2.meshes.forEach(m => { if (m.getTotalVertices() > 0) this._glow.addIncludedOnlyMesh(m); });

      this._phase    = 'falling';
      this._t        = 0;
      this._fallVelY = 0;
    } catch (err) {
      console.error('[AssetMachine] Erro ao carregar:', err);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  _setEnabled(meshes, val) { meshes.forEach(m => m.setEnabled(val)); }

  _setAlpha(root, alpha) {
    root.getChildMeshes(false).forEach(m => {
      if (!m.material) return;
      if (!m.__machineMatClone) {
        m.material = m.material.clone(m.material.name + '_mc');
        m.__machineMatClone = true;
      }
      m.material.alpha = alpha;
    });
  }

  _fxLanding() {
    const pos = this.position;
    const ps  = new BABYLON.ParticleSystem('mac_land', 50, this.scene);
    ps.createCylinderEmitter(0.9, 0.05, 0.1, 0);
    ps.emitter = new BABYLON.Vector3(pos.x, pos.y + 0.1, pos.z);
    ps.minEmitPower = 1.5; ps.maxEmitPower = 5;
    ps.minLifeTime  = 0.25; ps.maxLifeTime = 0.55;
    ps.minSize = 0.04; ps.maxSize = 0.18;
    ps.emitRate = 0; ps.manualEmitCount = 50;
    ps.color1    = new BABYLON.Color4(0.85, 0.85, 1.0, 0.9);
    ps.color2    = new BABYLON.Color4(0.6,  0.5,  1.0, 0.6);
    ps.colorDead = new BABYLON.Color4(0.4,  0.3,  0.8, 0);
    ps.direction1 = new BABYLON.Vector3(-2, 0.3, -2);
    ps.direction2 = new BABYLON.Vector3( 2, 1.0,  2);
    ps.gravity    = new BABYLON.Vector3(0, -4, 0);
    ps.start();
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1400);
  }

  _fxTransform() {
    const pos = this.position;
    const ps1 = new BABYLON.ParticleSystem('mac_tfx1', 140, this.scene);
    ps1.createSphereEmitter(0.4);
    ps1.emitter = new BABYLON.Vector3(pos.x, pos.y + 0.6, pos.z);
    ps1.minEmitPower = 2; ps1.maxEmitPower = 9;
    ps1.minLifeTime  = 0.4; ps1.maxLifeTime = 1.0;
    ps1.minSize = 0.06; ps1.maxSize = 0.22;
    ps1.emitRate = 0; ps1.manualEmitCount = 140;
    ps1.color1    = new BABYLON.Color4(0.6, 0.3, 1.0, 1.0);
    ps1.color2    = new BABYLON.Color4(0.2, 0.8, 1.0, 0.9);
    ps1.colorDead = new BABYLON.Color4(0.4, 0.2, 0.7, 0);
    ps1.direction1 = new BABYLON.Vector3(-1, 1, -1);
    ps1.direction2 = new BABYLON.Vector3( 1, 4,  1);
    ps1.gravity    = new BABYLON.Vector3(0, -6, 0);
    ps1.start();
    setTimeout(() => { try { ps1.dispose(); } catch (_) {} }, 2000);

    const ps2 = new BABYLON.ParticleSystem('mac_tfx2', 70, this.scene);
    ps2.createCylinderEmitter(1.4, 0.05, 0.1, 0);
    ps2.emitter = new BABYLON.Vector3(pos.x, pos.y + 0.05, pos.z);
    ps2.minEmitPower = 2; ps2.maxEmitPower = 6;
    ps2.minLifeTime  = 0.3; ps2.maxLifeTime = 0.7;
    ps2.minSize = 0.05; ps2.maxSize = 0.16;
    ps2.emitRate = 0; ps2.manualEmitCount = 70;
    ps2.color1    = new BABYLON.Color4(0.8, 0.5, 1.0, 0.8);
    ps2.color2    = new BABYLON.Color4(0.3, 0.7, 1.0, 0.6);
    ps2.colorDead = new BABYLON.Color4(0.5, 0.2, 0.8, 0);
    ps2.direction1 = new BABYLON.Vector3(-3, 0.2, -3);
    ps2.direction2 = new BABYLON.Vector3( 3, 1.0,  3);
    ps2.gravity    = new BABYLON.Vector3(0, 2, 0);
    ps2.start();
    setTimeout(() => { try { ps2.dispose(); } catch (_) {} }, 1600);
  }

  // ══════════════════════════════════════════════════════════════════
  //  Update
  // ══════════════════════════════════════════════════════════════════
  update(dt) {
    if (!this._p1Root && this._phase !== 'loading') return;
    this._t += dt;

    switch (this._phase) {
      case 'falling':      this._updateFalling(dt);      break;
      case 'landing':      this._updateLanding(dt);      break;
      case 'transforming': this._updateTransforming(dt); break;
      case 'ready':        this._updateReady(dt);        break;
    }

    // Hologram sempre atualiza (mesmo durante deploy, se ativado)
    this._updateHologram(dt);
  }

  _updateFalling(dt) {
    if (!this._p1Root) return;
    this._fallVelY -= GRAVITY * dt;
    this._p1Root.position.y += this._fallVelY * dt;
    this._p1Root.rotation.y += dt * 4.0;
    this._p1Root.rotation.x += dt * 2.2;
    this._glow.intensity = 0.12;

    if (this._p1Root.position.y <= this.position.y + 0.02) {
      this._p1Root.position.y = this.position.y;
      this._p1Root.rotation.x = 0;
      this._phase = 'landing';
      this._t     = 0;
      this._fxLanding();
    }
  }

  _updateLanding(dt) {
    if (!this._p1Root) return;
    const t = this._t;
    const bounce = Math.exp(-t * 7) * Math.cos(t * 16) * 0.35;
    this._p1Root.scaling.set(
      MACHINE_SCALE * (1 + bounce),
      MACHINE_SCALE * (1 - bounce),
      MACHINE_SCALE * (1 + bounce),
    );
    this._p1Root.rotation.y += dt * Math.max(0, 2.5 - t * 3.5);
    this._glow.intensity = 0.2 + Math.exp(-t * 4) * 0.4;

    if (t >= 1.6) {
      this._p1Root.scaling.setAll(MACHINE_SCALE);
      this._phase = 'transforming';
      this._t     = 0;
      this._fxTransform();
      if (this._p2Root) {
        this._setEnabled(this._p2Root.getChildMeshes(false).concat([this._p2Root]), true);
      }
    }
  }

  _updateTransforming(dt) {
    if (!this._p1Root || !this._p2Root) return;
    const DUR  = 0.85;
    const t    = Math.min(this._t / DUR, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    const s1 = MACHINE_SCALE * (1 - ease);
    this._p1Root.scaling.setAll(Math.max(0.001, s1));
    this._p1Root.rotation.y += dt * (8 * (1 - t) + 1);
    this._setAlpha(this._p1Root, 1 - ease);

    const s2 = MACHINE_SCALE * ease;
    this._p2Root.scaling.setAll(Math.max(0.001, s2));
    this._p2Root.position.y = this.position.y + (1 - ease) * 0.6;
    this._setAlpha(this._p2Root, ease);

    this._glow.intensity = 0.8 * Math.sin(t * Math.PI) + 0.15;

    if (this._t >= DUR) {
      this._p1Root.setEnabled(false);
      this._p2Root.scaling.setAll(MACHINE_SCALE);
      this._p2Root.position.copyFrom(this.position);
      this._setAlpha(this._p2Root, 1);
      this._glow.intensity = 0.45;
      this._phase     = 'ready';
      this._t         = 0;
      this._idleTimer = 0;
    }
  }

  _updateReady(dt) {
    this._idleTimer += dt;

    if (this._p2Root) {
      this._p2Root.position.y = this.position.y + Math.sin(this._idleTimer * 1.3) * 0.04;
      this._p2Root.rotation.y += dt * 0.35;
    }
    this._glow.intensity = 0.35 + Math.sin(this._idleTimer * 2.1) * 0.12;

    if (!this.player?.mesh) return;
    const dist    = BABYLON.Vector3.Distance(this.player.mesh.position, this.position);
    const inRange = dist < INTERACT_DIST;

    if (this._promptEl) {
      this._promptEl.style.display =
        inRange && !this.meshyPanel._active ? 'block' : 'none';
    }

    if (inRange) {
      const eNow = this.input.isDown('KeyE');
      if (eNow && !this._wasE) {
        // Marca esta máquina como ativa para que o MeshyPanel possa
        // chamar startGenerating / showImage nela
        window._activeAssetMachine = this;
        this.meshyPanel.toggle();
      }
      this._wasE = eNow;
    } else {
      this._wasE = false;
    }
  }

  // ── Hologram update (animação dos discos, luz, fade) ──────────────
  _updateHologram(dt) {
    // Fade in quando _generating liga
    const targetAlpha = this._generating ? 1 : 0;
    this._holoFadeIn += (targetAlpha - this._holoFadeIn) * Math.min(1, dt * 4);
    const a = this._holoFadeIn;

    if (a < 0.01 && !this._generating) {
      // totalmente oculto
      this._beam.material.alpha  = 0;
      this._disc.material.alpha  = 0;
      this._disc2.material.alpha = 0;
      this._holoLight.intensity  = 0;
      return;
    }

    // Anima feixe, discos
    const pulse = 0.5 + Math.sin(this._idleTimer * 6) * 0.18;

    this._beam.material.alpha  = a * 0.28;
    this._disc.material.alpha  = a * (0.42 + pulse * 0.12);
    this._disc2.material.alpha = a * (0.55 + pulse * 0.08);

    this._disc.rotation.y  += dt * 1.3;
    this._disc2.rotation.y -= dt * 2.2;

    // Bob da imagem 2D
    if (this._imgPlane.isEnabled()) {
      const bob = Math.sin(this._idleTimer * 1.8) * 0.12;
      this._imgPlane.position.y = this.position.y + 3.1 + bob;
      this._imgBg.position.y    = this._imgPlane.position.y;
    }

    // Rotação + bob do preview 3D
    if (this._preview3DRoot) {
      this._preview3DRoot.rotation.y += dt * 0.75;
      this._preview3DRoot.position.y  = this.position.y + 2.5 + Math.sin(this._idleTimer * 1.4) * 0.1;
    }
  }

  // ── Persistência ──────────────────────────────────────────────────

  /** Salva posição+ID no banco de máquinas colocadas */
  async _persistPlacement() {
    try {
      let list = await LocalDB.get('machines_placed', []);
      const idx = list.findIndex(m => m.id === this.id);
      const entry = { id: this.id, position: [this.position.x, this.position.y, this.position.z] };
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      await LocalDB.save('machines_placed', list);
    } catch(e) { console.warn('[AssetMachine] Falha ao persistir:', e.message); }
  }

  /** Remove esta máquina da lista persistida */
  async _unpersist() {
    try {
      let list = await LocalDB.get('machines_placed', []);
      list = list.filter(m => m.id !== this.id);
      await LocalDB.save('machines_placed', list);
    } catch(_) {}
  }

  get libraryKey() { return 'machine_lib_' + this.id; }

  async getSessions() {
    return LocalDB.get(this.libraryKey, []);
  }

  async saveSession(session) {
    const sessions = await this.getSessions();
    const i = sessions.findIndex(s => s.id === session.id);
    if (i >= 0) sessions[i] = session; else sessions.unshift(session);
    // Keep max 50 sessions
    await LocalDB.save(this.libraryKey, sessions.slice(0, 50));
  }

  // ── Dispose ───────────────────────────────────────────────────────
  dispose() {
    if (window._assetMachines) {
      const i = window._assetMachines.indexOf(this);
      if (i >= 0) window._assetMachines.splice(i, 1);
    }
    this._promptEl?.remove();
    try { this._glow?.dispose(); }      catch (_) {}
    try { this._p1Root?.dispose(); }    catch (_) {}
    try { this._p2Root?.dispose(); }    catch (_) {}
    try { this._beam?.dispose(); }      catch (_) {}
    try { this._disc?.dispose(); }      catch (_) {}
    try { this._disc2?.dispose(); }     catch (_) {}
    try { this._holoPs?.dispose(); }    catch (_) {}
    try { this._imgPlane?.dispose(); }  catch (_) {}
    try { this._imgBg?.dispose(); }     catch (_) {}
    this._disposePreview3D();
  }
}
