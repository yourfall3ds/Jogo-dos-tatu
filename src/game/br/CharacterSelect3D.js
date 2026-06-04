// ─────────────────────────────────────────────────────────────────
//  CharacterSelect3D — seletor de personagem com viewport 3D.
//
//  Para o modo BR e geral:
//   - Lista esquerda: classes/personagens (scroll vertical)
//   - Viewport 3D direito: avatar selecionado em rotação automática
//   - Mouse drag = pan/rotate, scroll = zoom
//   - Clique numa classe = troca model no viewport + emite event
//   - "CONFIRMAR" botão = persiste seleção + sendMessage br_class_select
//
//  Reusa CharacterSwapper que o projeto já tem.
// ─────────────────────────────────────────────────────────────────

import { CloudSave } from '../data/CloudSave.js';
// FONTE ÚNICA das skins — a MESMA que o RemotePlayer usa pra renderizar o que
// os outros escolheram. Garante que o model que você vê de si = o que os outros
// veem de você. Adicionar skin = 1 linha em CharacterClasses.js (sem reload).
import { CHARACTER_CLASSES } from '../data/CharacterClasses.js';

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const CLASSES = CHARACTER_CLASSES;

export class CharacterSelect3D {
  constructor({ scene, cs, swapper, auth }) {
    this.scene = scene;
    this.cs = cs;
    this.swapper = swapper;
    this.auth = auth;
    this._open = false;
    this._selectedId = parseInt(localStorage.getItem('transfps_class_id') || '0');
    this._onConfirm = null;
    // Skin durável na nuvem (sincroniza entre dispositivos); cai pro local.
    this._hydrateCloudClass();
    // Sub-scene pra viewport
    this._previewCanvas = null;
    this._previewEngine = null;
    this._previewScene = null;
    this._previewMesh = null;
    this._previewCamera = null;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'charsel3d';
    el.style.cssText = `
      position:fixed; inset:0; z-index:175; display:none;
      background:radial-gradient(ellipse at 50% 35%, #0a1230 0%, #050816 55%, #02030a 100%);
      color:#dff5ff; font-family:'Segoe UI',monospace;
    `;
    el.innerHTML = `
      <header style="display:flex; justify-content:space-between; align-items:center;
                     padding:14px 24px; border-bottom:1px solid rgba(126,239,196,0.25);">
        <span style="font:900 16px monospace; letter-spacing:4px; color:#2effb6;">⚡ ESCOLHER PERSONAGEM</span>
        <span id="cs3d-close" style="cursor:pointer; opacity:0.6;">✕ FECHAR (Esc)</span>
      </header>
      <div style="display:flex; height:calc(100% - 56px);">
        <!-- Lista esquerda -->
        <aside style="flex:0 0 280px; background:rgba(0,0,0,0.45); padding:14px;
                      overflow-y:auto; border-right:1px solid rgba(126,239,196,0.15);">
          <div id="cs3d-list"></div>
        </aside>
        <!-- Viewport direita -->
        <main style="flex:1; position:relative; display:flex; flex-direction:column;">
          <canvas id="cs3d-canvas" style="flex:1; width:100%; cursor:grab; outline:none;"></canvas>
          <div style="padding:14px 24px; background:rgba(0,0,0,0.6); border-top:1px solid rgba(126,239,196,0.2);">
            <div id="cs3d-name" style="font:900 18px monospace; color:#2effb6; letter-spacing:2px;">—</div>
            <div id="cs3d-desc" style="font:600 12px monospace; opacity:0.7; margin-top:4px;">—</div>
            <div style="margin-top:12px; display:flex; gap:10px; justify-content:flex-end;">
              <button id="cs3d-confirm" style="
                background:#2effb6; color:#04101a; border:0;
                padding:11px 28px; font:800 13px monospace; letter-spacing:3px;
                cursor:pointer; border-radius:5px;">CONFIRMAR</button>
            </div>
          </div>
        </main>
      </div>
      <div style="position:absolute; bottom:78px; right:24px; opacity:0.5;
                  font:600 10px monospace; pointer-events:none;">
        drag = rotacionar · scroll = zoom · drag direito = pan
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._listEl = el.querySelector('#cs3d-list');
    this._previewCanvas = el.querySelector('#cs3d-canvas');
    this._nameEl = el.querySelector('#cs3d-name');
    this._descEl = el.querySelector('#cs3d-desc');

    el.querySelector('#cs3d-close').onclick = () => this.close();
    el.querySelector('#cs3d-confirm').onclick = () => this._confirm();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._open) this.close();
    });

    this._renderList();
  }

  _renderList() {
    this._listEl.innerHTML = CLASSES.map(c => {
      const sel = c.id === this._selectedId;
      return `
        <div data-id="${c.id}" style="
          background:${sel ? 'rgba(46,255,182,0.18)' : 'rgba(0,0,0,0.4)'};
          border:1px solid ${sel ? '#2effb6' : 'rgba(255,255,255,0.08)'};
          border-radius:6px; padding:14px; margin-bottom:8px;
          cursor:pointer; transition:.15s;
          box-shadow:${sel ? '0 0 12px rgba(46,255,182,0.4)' : 'none'};
        ">
          <div style="font:900 16px monospace; letter-spacing:1px; color:${sel ? '#2effb6' : '#dff5ff'};">
            ${c.icon} ${_esc(c.name)}
          </div>
          <div style="font:600 11px monospace; opacity:0.6; margin-top:4px;">${_esc(c.desc)}</div>
        </div>
      `;
    }).join('');
    this._listEl.querySelectorAll('[data-id]').forEach(row => {
      row.onclick = () => {
        const id = parseInt(row.getAttribute('data-id'));
        this._select(id);
      };
      row.onmouseenter = () => { if (!row.style.boxShadow) row.style.background = 'rgba(255,255,255,0.04)'; };
      row.onmouseleave = () => { this._renderList(); };
    });
  }

  async _select(id) {
    const cls = CLASSES.find(c => c.id === id);
    if (!cls) return;
    this._selectedId = id;
    this._renderList();
    this._nameEl.textContent = cls.name;
    this._descEl.textContent = cls.desc;
    // Carrega modelo no preview viewport
    await this._loadPreview(cls.url);
  }

  async _ensurePreviewScene() {
    if (this._previewScene) return;
    try {
      this._previewEngine = new BABYLON.Engine(this._previewCanvas, true, { preserveDrawingBuffer: true, stencil: true });
      this._previewScene = new BABYLON.Scene(this._previewEngine);
      this._previewScene.clearColor = new BABYLON.Color4(0.04, 0.07, 0.12, 1);
      // ArcRotate camera com pan/zoom
      this._previewCamera = new BABYLON.ArcRotateCamera('cs3dCam',
        -Math.PI / 2, Math.PI / 2.2, 4,
        new BABYLON.Vector3(0, 1, 0), this._previewScene);
      this._previewCamera.attachControl(this._previewCanvas, true);
      this._previewCamera.lowerRadiusLimit = 1.5;
      this._previewCamera.upperRadiusLimit = 12;
      this._previewCamera.wheelDeltaPercentage = 0.01;
      this._previewCamera.panningSensibility = 800;
      // Luzes
      const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this._previewScene);
      hemi.intensity = 0.7;
      const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, -1), this._previewScene);
      dir.intensity = 1.2;
      // Chão grid
      const ground = BABYLON.MeshBuilder.CreateGround('previewGround', { width: 8, height: 8 }, this._previewScene);
      const gmat = new BABYLON.StandardMaterial('groundMat', this._previewScene);
      gmat.diffuseColor = new BABYLON.Color3(0.1, 0.15, 0.25);
      gmat.specularColor = new BABYLON.Color3(0, 0, 0);
      ground.material = gmat;
      // Spotlight no avatar
      const spot = new BABYLON.SpotLight('previewSpot',
        new BABYLON.Vector3(0, 5, 0), new BABYLON.Vector3(0, -1, 0),
        Math.PI / 4, 2, this._previewScene);
      spot.diffuse = new BABYLON.Color3(0.6, 1, 0.85);
      spot.intensity = 1.5;
      // Render loop
      this._previewEngine.runRenderLoop(() => {
        if (this._previewScene && !this._previewScene.isDisposed) {
          // Auto-rotate
          if (this._previewMesh && !this._userInteracting) {
            this._previewMesh.rotation.y += 0.005;
          }
          this._previewScene.render();
        }
      });
      // Track interaction (pause autorotate)
      this._previewCanvas.addEventListener('pointerdown', () => { this._userInteracting = true; });
      this._previewCanvas.addEventListener('pointerup', () => {
        clearTimeout(this._interactT);
        this._interactT = setTimeout(() => { this._userInteracting = false; }, 2000);
      });
      // Resize observer
      const ro = new ResizeObserver(() => { try { this._previewEngine?.resize(); } catch (_) {} });
      ro.observe(this._previewCanvas);
    } catch (e) {
      console.warn('[CharacterSelect3D] init scene failed', e);
    }
  }

  async _loadPreview(url) {
    await this._ensurePreviewScene();
    if (!this._previewScene) return;
    // Dispose anterior
    if (this._previewMesh) {
      try { this._previewMesh.dispose(false, true); } catch (_) {}
      this._previewMesh = null;
    }
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', url, this._previewScene);
      const meshes = result.meshes || [];
      if (meshes.length === 0) return;
      // Acha root sem parent
      let root = meshes.find(m => !m.parent && m.getChildren?.().length > 0) || meshes[0];
      // Normaliza: centraliza e ajusta scale
      const bb = root.getHierarchyBoundingVectors();
      const size = bb.max.subtract(bb.min);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / Math.max(0.1, maxDim);
      root.scaling.set(scale, scale, scale);
      // Centra no chão
      root.position.set(0, -bb.min.y * scale, 0);
      this._previewMesh = root;
      // Acaricia anim idle se houver
      const animGroup = result.animationGroups?.[0];
      if (animGroup) { try { animGroup.play(true); } catch (_) {} }
    } catch (e) {
      console.warn('[CharacterSelect3D] load failed', url, e);
    }
  }

  async _hydrateCloudClass() {
    try {
      const id = await CloudSave.getSetting('class_id', null);
      if (id != null && Number.isFinite(+id)) {
        this._selectedId = +id;
        localStorage.setItem('transfps_class_id', String(this._selectedId));
      }
    } catch (_) {}
  }

  _confirm() {
    const cls = CLASSES.find(c => c.id === this._selectedId);
    if (!cls) return;
    localStorage.setItem('transfps_class_id', String(this._selectedId));
    CloudSave.setSetting('class_id', this._selectedId);   // skin durável na nuvem
    // Notifica servidor
    try { this.cs?.sendMessage?.('br_class_select', { class_id: this._selectedId }); } catch (_) {}
    // Troca o model no player de fato
    if (this.swapper && cls.url) {
      try { this.swapper.swap(cls.url); } catch (_) {}
    }
    this._onConfirm?.(cls);
    this.close();
  }

  onConfirm(cb) { this._onConfirm = cb; }

  open() {
    if (this._open) return;
    this._open = true;
    this._el.style.display = 'block';
    // Carrega selecionado atual no viewport (lazy)
    setTimeout(() => this._select(this._selectedId), 100);
  }

  close() {
    this._open = false;
    this._el.style.display = 'none';
    // Dispose engine Babylon paralela pra nao drenar GPU enquanto cena
    // principal roda. Vai ser recriada no proximo open() via _ensurePreviewScene.
    if (this._previewMesh) {
      try { this._previewMesh.dispose(false, true); }
      catch (e) { console.error('[CharacterSelect3D] previewMesh.dispose:', e); }
      this._previewMesh = null;
    }
    if (this._previewScene) {
      try { this._previewScene.dispose(); }
      catch (e) { console.error('[CharacterSelect3D] previewScene.dispose:', e); }
      this._previewScene = null;
    }
    if (this._previewEngine) {
      try { this._previewEngine.stopRenderLoop(); }
      catch (e) { console.error('[CharacterSelect3D] previewEngine.stopRenderLoop:', e); }
      try { this._previewEngine.dispose(); }
      catch (e) { console.error('[CharacterSelect3D] previewEngine.dispose:', e); }
      this._previewEngine = null;
    }
    this._previewCamera = null;
  }

  toggle() { this._open ? this.close() : this.open(); }
}
