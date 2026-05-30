// ─────────────────────────────────────────────────────────────────
//  SceneEditor.js — Editor de cena estilo Unreal Engine
//
//  Câmera Fantasma:
//    • Segurar RMB  → rotaciona câmera (movimento do mouse)
//    • WASD / QE   → move câmera enquanto RMB pressionado
//    • Scroll       → aumenta / diminui velocidade de voo
//
//  Seleção:
//    • Clique esquerdo → seleciona objeto na cena (com destaque verde)
//
//  Painel Esquerdo:  hierarquia de objetos agrupada por categoria
//  Painel Direito:   inspector (posição / rotação / escala com inputs)
//
//  Persistência:
//    • localStorage — automático ao salvar
//    • Export JSON  — arquivo permanente para versionamento
// ─────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════
//  GhostCamera — câmera de voo livre (Unreal-style)
// ════════════════════════════════════════════════════════════════
class GhostCamera {
  constructor(scene) {
    this._scene  = scene;
    this._canvas = scene.getEngine().getRenderingCanvas();
    this._cam    = null;
    this._active = false;
    this._rmb    = false;
    this._speed  = 10;    // m/s
    this._keys   = {};
    this._savedCam = null;

    // handlers com bind (para removeEventListener funcionar)
    this._h = {
      ctx   : e => e.preventDefault(),
      pdown : e => this._pDown(e),
      pup   : e => this._pUp(e),
      pmove : e => this._pMove(e),
      kdown : e => this._kDown(e),
      kup   : e => this._kUp(e),
      wheel : e => this._wheel(e),
    };
  }

  // ── Ciclo de vida ───────────────────────────────────────────────
  activate() {
    if (this._active) return;
    this._active = true;

    // Cria a câmera somente na primeira ativação
    if (!this._cam) {
      const pos = this._scene.activeCamera?.globalPosition?.clone()
               ?? this._scene.activeCamera?.position?.clone()
               ?? new BABYLON.Vector3(0, 5, -10);
      const rot = this._scene.activeCamera?.rotation?.clone()
               ?? BABYLON.Vector3.Zero();
      const cam = new BABYLON.FreeCamera('_ghostCam', pos, this._scene);
      cam.inputs.clear();          // controle 100% manual
      cam.minZ = 0.1; cam.maxZ = 2000;
      cam.rotation.copyFrom(rot);
      this._cam = cam;
    } else {
      // Teleporta para onde a câmera ativa está
      const pos = this._scene.activeCamera?.globalPosition?.clone()
               ?? this._scene.activeCamera?.position?.clone();
      if (pos) this._cam.position.copyFrom(pos);
      const rot = this._scene.activeCamera?.rotation?.clone();
      if (rot) this._cam.rotation.copyFrom(rot);
    }

    this._savedCam = this._scene.activeCamera;
    this._scene.activeCamera = this._cam;

    const c = this._canvas, h = this._h;
    c.addEventListener('contextmenu', h.ctx);
    c.addEventListener('pointerdown', h.pdown);
    c.addEventListener('pointerup',   h.pup);
    c.addEventListener('pointermove', h.pmove);
    c.addEventListener('wheel', h.wheel, { passive: false });
    document.addEventListener('keydown', h.kdown);
    document.addEventListener('keyup',   h.kup);
  }

  deactivate() {
    if (!this._active) return;
    this._active = false;
    this._rmb    = false;
    this._keys   = {};
    this._canvas.style.cursor = '';

    if (this._savedCam) {
      this._scene.activeCamera = this._savedCam;
      this._savedCam = null;
    }

    const c = this._canvas, h = this._h;
    c.removeEventListener('contextmenu', h.ctx);
    c.removeEventListener('pointerdown', h.pdown);
    c.removeEventListener('pointerup',   h.pup);
    c.removeEventListener('pointermove', h.pmove);
    c.removeEventListener('wheel',       h.wheel);
    document.removeEventListener('keydown', h.kdown);
    document.removeEventListener('keyup',   h.kup);
  }

  // ── Ponteiro ────────────────────────────────────────────────────
  // Botão DIREITO (2) ou do MEIO (1) giram/movem a câmera de voo.
  // (esquerdo fica livre p/ o gizmo selecionar objetos)
  _pDown(e) {
    if (e.button !== 2 && e.button !== 1) return;
    this._rmb = true;
    try { this._canvas.setPointerCapture(e.pointerId); } catch(_) {}
    this._canvas.style.cursor = 'crosshair';
  }

  _pUp(e) {
    if (e.button !== 2 && e.button !== 1) return;
    this._rmb = false;
    this._keys = {};
    try { this._canvas.releasePointerCapture(e.pointerId); } catch(_) {}
    this._canvas.style.cursor = '';
  }

  _pMove(e) {
    if (!this._rmb || !this._cam) return;
    const sens = 0.0028;
    this._cam.rotation.y += e.movementX * sens;
    this._cam.rotation.x = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01,
        this._cam.rotation.x + e.movementY * sens
      )
    );
  }

  // ── Teclado ─────────────────────────────────────────────────────
  _kDown(e) {
    if (!this._rmb) return;
    const el = document.activeElement;
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return;
    this._keys[e.code] = true;
    if (['KeyW','KeyS','KeyA','KeyD','Space','KeyE','KeyQ'].includes(e.code))
      e.preventDefault();
  }

  _kUp(e) { delete this._keys[e.code]; }

  // ── Scroll = velocidade ─────────────────────────────────────────
  _wheel(e) {
    if (!this._rmb) return;
    e.preventDefault();
    const f = e.deltaY > 0 ? 0.82 : 1.22;
    this._speed = Math.max(0.5, Math.min(200, this._speed * f));
  }

  // ── Update (chamado a cada frame) ───────────────────────────────
  update(dt) {
    if (!this._active || !this._rmb || !this._cam) return;

    const spd = this._speed * dt;
    const fwd   = this._cam.getDirection(BABYLON.Vector3.Forward());
    const right = this._cam.getDirection(BABYLON.Vector3.Right());
    const k = this._keys;

    let fx = 0, fy = 0, fz = 0;
    if (k['KeyW']) { fx += fwd.x;   fy += fwd.y;   fz += fwd.z;   }
    if (k['KeyS']) { fx -= fwd.x;   fy -= fwd.y;   fz -= fwd.z;   }
    if (k['KeyD']) { fx += right.x; fy += right.y; fz += right.z; }
    if (k['KeyA']) { fx -= right.x; fy -= right.y; fz -= right.z; }
    if (k['KeyE']) { fy += 1; }
    if (k['KeyQ']) { fy -= 1; }

    const len = Math.sqrt(fx*fx + fy*fy + fz*fz);
    if (len > 0.001) {
      this._cam.position.x += (fx / len) * spd;
      this._cam.position.y += (fy / len) * spd;
      this._cam.position.z += (fz / len) * spd;
    }
  }

  get speed()    { return this._speed; }
  get isFlying() { return this._rmb; }
  get active()   { return this._active; }
}


import { LocalDB }    from '../data/LocalDB.js';
import { TemplateDB } from '../data/TemplateDB.js';

// ════════════════════════════════════════════════════════════════
//  GhostCamera — câmera de voo livre (Unreal-style)
// ════════════════════════════════════════════════════════════════
export class SceneEditor {
  static STORAGE_KEY = 'scene';

  constructor(scene) {
    this.scene       = scene;
    this._sel        = null;
    this._visible    = false;
    this._saved      = {};
    this._hlLayer    = null;
    this._hlMeshes   = [];   // lista dos meshes realmente adicionados ao HighlightLayer
    this._gm         = null;
    this._gizMode    = 'position';
    this._leftPanel  = null;
    this._rightPanel = null;
    this._toastTimer = null;
    this._categories = {};   // collapseado por categoria

    this._ghost        = new GhostCamera(scene);
    this._boneDebugOn  = false;
    this._boneSpheres  = [];
    this._boneNodes    = [];
    
    // Inicialização assíncrona
    this._init();

    this._buildLeftPanel();
    this._buildRightPanel();
    this._buildSpeedOverlay();
    this._setupGizmos();
    this._setupPointer();

    // Loop: atualiza câmera + inputs
    this._frameCtr = 0;
    scene.onBeforeRenderObservable.add(() => {
      if (!this._visible) return;
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
      this._ghost.update(dt);
      if (this._sel) {
        this._syncInputs();              // transform — todo frame
        this._syncInfoSection(this._sel);// world pos live — todo frame
        // Material e Física: só a cada ~60 frames (não mudam todo frame)
        if ((++this._frameCtr % 60) === 0) {
          this._syncPhysicsSection(this._sel);
          this._syncMaterialSection(this._sel);
        }
      }
      this._updateSpeedOverlay();
    });
  }

  async _init() {
    await TemplateDB.init();
    this._saved = await LocalDB.get(SceneEditor.STORAGE_KEY, {});
    console.log(`[SceneEditor] ${Object.keys(this._saved).length} objetos carregados do DB.`);
    this._refreshTemplateSelect();
  }

  _refreshTemplateSelect() {
    const sel = this._rightPanel?.querySelector('#sed-sel-template');
    if (!sel) return;
    const templates = TemplateDB.getAll();
    sel.innerHTML = '<option value="">— carregar template —</option>' +
      Object.entries(templates).map(([id, t]) => 
        `<option value="${id}">${t.label || id}</option>`
      ).join('');
  }

  _onTemplateChange(tplId) {
    if (!tplId) return;
    const tpl = TemplateDB.get(tplId);
    if (!tpl) return;

    const q = id => this._rightPanel?.querySelector(`#${id}`);
    if (q('sed-chk-breakable')) q('sed-chk-breakable').checked = tpl.isBreakable ?? false;
    if (q('sed-chk-physics'))   q('sed-chk-physics').checked   = tpl.hasPhysics ?? false;
    if (q('sed-chk-collect'))   q('sed-chk-collect').checked   = tpl.isCollectable ?? false;
    if (q('sed-num-hp'))        q('sed-num-hp').value          = tpl.hp ?? 3;
    if (q('sed-num-bounce'))    q('sed-num-bounce').value      = tpl.bounce ?? 0.22;

    this._toast(`📝 Template '${tplId}' carregado!`, '#2a4a2a');
  }

  // ════════════════════════════════════════════════════════════════
  //  Persistência
  // ════════════════════════════════════════════════════════════════
  _loadStorage() {
    // Agora delegamos para o _init assíncrono
  }

  _writeStorage() {
    LocalDB.save(SceneEditor.STORAGE_KEY, this._saved);
  }

  applyAllSaved() {
    let n = 0;
    for (const [name, t] of Object.entries(this._saved)) {
      const m = this.scene.getMeshByName(name)
             ?? this.scene.getNodeByName(name);
      if (!m) continue;
      if (t.p) m.position.set(t.p[0], t.p[1], t.p[2]);
      if (t.r) m.rotation.set(t.r[0], t.r[1], t.r[2]);
      if (t.s) m.scaling.set(t.s[0], t.s[1], t.s[2]);
      n++;
    }
    if (n) console.log(`[SceneEditor] ✅ ${n} objeto(s) restaurados.`);
  }

  // ════════════════════════════════════════════════════════════════
  //  Gizmos Babylon.js
  // ════════════════════════════════════════════════════════════════
  _setupGizmos() {
    const gm = new BABYLON.GizmoManager(this.scene);
    gm.usePointerToAttachGizmos = false;
    gm.positionGizmoEnabled = true;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled    = false;
    this._gm = gm;
    this._registerGizmoListeners(gm);
  }

  _registerGizmoListeners(gm) {
    const cb = () => this._onGizmoEnd();
    const pg = gm.gizmos.positionGizmo;
    ['xGizmo','yGizmo','zGizmo','xPlaneGizmo','yPlaneGizmo','zPlaneGizmo'].forEach(g => {
      pg?.[g]?.dragBehavior?.onDragEndObservable?.add(cb);
    });
  }

  _setGizmoMode(mode) {
    this._gizMode = mode;
    const gm = this._gm;
    gm.positionGizmoEnabled = false;
    gm.rotationGizmoEnabled = false;
    gm.scaleGizmoEnabled    = false;
    if (mode === 'position') gm.positionGizmoEnabled = true;
    if (mode === 'rotation') gm.rotationGizmoEnabled = true;
    if (mode === 'scale')    gm.scaleGizmoEnabled    = true;
    if (this._sel) gm.attachToMesh(this._sel);

    const cb = () => this._onGizmoEnd();
    if (mode === 'rotation') {
      const rg = gm.gizmos.rotationGizmo;
      ['xGizmo','yGizmo','zGizmo'].forEach(g =>
        rg?.[g]?.dragBehavior?.onDragEndObservable?.add(cb)
      );
    }
    if (mode === 'scale') {
      const sg = gm.gizmos.scaleGizmo;
      ['xGizmo','yGizmo','zGizmo','uniformScaleGizmo'].forEach(g =>
        sg?.[g]?.dragBehavior?.onDragEndObservable?.add(cb)
      );
    }

    // Atualiza botões de modo
    ['position','rotation','scale'].forEach(m => {
      this._rightPanel?.querySelector(`#sed-mode-${m}`)
        ?.classList.toggle('active', m === mode);
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  Click para selecionar
  // ════════════════════════════════════════════════════════════════
  _setupPointer() {
    this.scene.onPointerObservable.add(info => {
      if (!this._visible) return;
      if (info.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
      if (info.event.button !== 0) return;
      // Ignora cliques nos painéis HTML
      const t = info.event.target;
      if (this._leftPanel?.contains(t) || this._rightPanel?.contains(t)) return;

      const px = this.scene.pointerX;
      const py = this.scene.pointerY;

      // Objetos não clicáveis na cena — só selecionáveis pela hierarquia
      const skip = n => n === 'skyBox'
        || n === 'ground'                    // chão → usar hierarquia
        || n.startsWith('bump_')             // elevações de terreno
        || n.startsWith('_ed') || n.startsWith('_ghost')
        || n.startsWith('boundary_') || n.includes('_col_');

      // 1ª tentativa: somente pickable
      let pick = this.scene.pick(px, py,
        m => m.isPickable && m.isEnabled() && !skip(m.name)
      );

      // 2ª tentativa: inclui filhos de GLBs (isPickable=false)
      if (!pick?.hit) {
        pick = this.scene.pick(px, py,
          m => m.isEnabled() && !skip(m.name)
        );
        if (pick?.hit) {
          // Sobe na hierarquia até a raiz do GLB
          let node = pick.pickedMesh;
          while (node.parent && !skip(node.parent.name || '')) {
            node = node.parent;
          }
          pick = { hit: true, pickedMesh: node };
        }
      }

      this._selectMesh(pick?.hit ? pick.pickedMesh : null);
    });
  }

  // ── Remove TODOS os highlights ativos (limpa acúmulo) ────────────
  _clearHighlight() {
    if (!this._hlLayer) return;
    for (const m of this._hlMeshes) {
      try { this._hlLayer.removeMesh(m); } catch(_) {}
    }
    this._hlMeshes = [];
  }

  // ── Retorna lista de Meshes reais para destacar (desce em GLBs) ──
  _collectMeshes(node) {
    const list = [];
    // Se for Mesh real (tem material/vértices), inclui ele mesmo
    if (node?.getTotalVertices) list.push(node);
    // Sempre inclui filhos Mesh (GLB roots são TransformNodes sem verts)
    if (node?.getChildMeshes) {
      for (const c of node.getChildMeshes(false)) {
        if (c.getTotalVertices) list.push(c);
      }
    }
    return list;
  }

  _selectMesh(mesh) {
    // Limpa highlight anterior — garante que nunca acumula
    this._clearHighlight();

    this._sel = mesh;
    this._gm.attachToMesh(mesh ?? null);

    if (mesh) {
      // Cria layer só na primeira vez
      if (!this._hlLayer) {
        this._hlLayer = new BABYLON.HighlightLayer('sed_hl', this.scene);
        this._hlLayer.innerGlow     = false;
        this._hlLayer.outerGlow     = true;
        this._hlLayer.blurHorizontalSize = 0.5;
        this._hlLayer.blurVerticalSize   = 0.5;
      }

      // Adiciona todos os Meshes reais do objeto selecionado
      for (const m of this._collectMeshes(mesh)) {
        try {
          this._hlLayer.addMesh(m, BABYLON.Color3.Green());
          this._hlMeshes.push(m);
        } catch(_) {}
      }

      this._syncAllSections(mesh);
    } else {
      this._clearInputs();
      this._clearPhysicsSection?.();
      this._clearMaterialSection?.();
      this._clearInfoSection?.();
    }

    const n = this._rightPanel?.querySelector('#sed-sel-name');
    if (n) n.textContent = mesh ? mesh.name : '— clique na cena —';

    this._refreshHierarchy();
  }

  _selectByName(name) {
    // Tenta getMeshByName primeiro, depois getNodeByName (TransformNodes)
    const m = this.scene.getMeshByName(name)
           ?? this.scene.getNodeByName(name)
           // Busca por nome em meshes
           ?? this.scene.meshes.find(x => x.name === name);

    // Caso especial: player
    if (name === '__player__' && window._gamePlayer?.mesh) {
      this._selectMesh(window._gamePlayer.mesh);
      return;
    }
    if (m) this._selectMesh(m);
  }

  // ════════════════════════════════════════════════════════════════
  //  Transform
  // ════════════════════════════════════════════════════════════════
  _onGizmoEnd() {
    if (!this._sel) return;
    this._saveTransform(this._sel);
    this._syncAllSections(this._sel);
  }

  _saveTransform(mesh) {
    const p = mesh.position, r = mesh.rotation, s = mesh.scaling;
    const config = {
      p: [p.x, p.y, p.z],
      r: [r.x, r.y, r.z],
      s: [s.x, s.y, s.z],
    };

    // Salva o template ID se selecionado
    const tplId = this._rightPanel?.querySelector('#sed-sel-template')?.value;
    if (tplId) config.template = tplId;

    // Adiciona flags de gameplay se existirem no GameObject vinculado
    const go = mesh._gameObject;
    if (go) {
      config.breakable = go.isBreakable;
      config.physics   = go.hasPhysics;
      config.collect   = go.isCollectable;
      config.bounce    = go.BOUNCE;
      config.hp        = go.hp;
      config.itemId    = go.itemId;
    } else {
      // Se não tem GameObject ainda, tenta pegar dos inputs do editor
      const q = id => this._rightPanel?.querySelector(`#${id}`);
      config.breakable = q('sed-chk-breakable')?.checked ?? false;
      config.physics   = q('sed-chk-physics')?.checked   ?? false;
      config.collect   = q('sed-chk-collect')?.checked   ?? false;
      config.bounce    = parseFloat(q('sed-num-bounce')?.value) || 0.22;
      config.hp        = parseInt(q('sed-num-hp')?.value)       || 3;
      config.itemId    = q('sed-txt-itemid')?.value             || '';
    }

    this._saved[mesh.name] = config;
    this._writeStorage();
    this._refreshHierarchy();
  }

  _applyInputs() {
    if (!this._sel) return;
    const g = id => {
      const el = this._rightPanel?.querySelector(`#${id}`);
      return el ? (parseFloat(el.value) || 0) : 0;
    };
    const D = Math.PI / 180;
    this._sel.position.set(g('sed-px'), g('sed-py'), g('sed-pz'));
    this._sel.rotation.set(g('sed-rx') * D, g('sed-ry') * D, g('sed-rz') * D);
    this._sel.scaling.set(g('sed-sx'), g('sed-sy'), g('sed-sz'));
    this._saveTransform(this._sel);
  }

  _syncInputs() {
    if (!this._sel) return;
    const m   = this._sel;
    const RAD = 180 / Math.PI;
    const set = (id, v) => {
      const el = this._rightPanel?.querySelector(`#${id}`);
      if (el && document.activeElement !== el) el.value = v.toFixed(4);
    };
    set('sed-px', m.position.x); set('sed-py', m.position.y); set('sed-pz', m.position.z);
    set('sed-rx', m.rotation.x * RAD);
    set('sed-ry', m.rotation.y * RAD);
    set('sed-rz', m.rotation.z * RAD);
    set('sed-sx', m.scaling.x); set('sed-sy', m.scaling.y); set('sed-sz', m.scaling.z);
  }

  _clearInputs() {
    ['px','py','pz','rx','ry','rz','sx','sy','sz'].forEach(id => {
      const el = this._rightPanel?.querySelector(`#sed-${id}`);
      if (el) el.value = '';
    });
  }

  _nudge(inputId, delta) {
    const el = this._rightPanel?.querySelector(`#${inputId}`);
    if (!el) return;
    el.value = ((parseFloat(el.value) || 0) + delta).toFixed(4);
    this._applyInputs();
  }

  _uniformScale() {
    if (!this._sel) return;
    const v = (this._sel.scaling.x + this._sel.scaling.y + this._sel.scaling.z) / 3;
    const el = this._rightPanel?.querySelector('#sed-su');
    if (el) el.value = v.toFixed(4);
  }

  _applyUniformScale() {
    if (!this._sel) return;
    const v = parseFloat(this._rightPanel?.querySelector('#sed-su')?.value) || 1;
    this._sel.scaling.setAll(v);
    this._saveTransform(this._sel);
    this._syncAllSections(this._sel);
  }

  // ════════════════════════════════════════════════════════════════
  //  Câmera
  // ════════════════════════════════════════════════════════════════
  _focusCamera() {
    if (!this._sel) return;
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const tgt = this._sel.getAbsolutePosition?.() ?? this._sel.position;
    const dir = cam.position.subtract(tgt);
    const d   = Math.min(Math.max(dir.length(), 3), 10);
    cam.position = tgt.add(dir.normalize().scale(d));
    if (cam.setTarget) cam.setTarget(tgt);
  }

  // ════════════════════════════════════════════════════════════════
  //  Hierarquia de objetos (painel esquerdo)
  // ════════════════════════════════════════════════════════════════
  _getGroups() {
    const groups = {
      '🧑 Personagens': [],
      '🌍 Terreno':     [],   // ground + bumps — só via hierarquia
      '🧱 Estrutura':   [],
      '🎯 Combate':     [],
      '📦 Dinâmicos':   [],
      '✨ Decoração':   [],
      '❤️ Pickups':     [],
      '🧀 Objetivos':   [],
      '🔩 Outros':      [],
    };

    // Player como entrada especial
    if (window._gamePlayer?.mesh) {
      groups['🧑 Personagens'].push({
        _fake: true, name: '__player__',
        _label: '👤 Player (Personagem)',
        _mod: false,
      });
    }

    const skip = n => n === 'skyBox'
      || n.startsWith('_ed') || n.startsWith('_ghost') || n.startsWith('sed_')
      || n.startsWith('boundary_') || n.includes('_col_') || n.startsWith('wed_');

    const meshes = this.scene.meshes.filter(m =>
      m.isEnabled() && !skip(m.name)
    ).sort((a,b) => a.name.localeCompare(b.name));

    for (const m of meshes) {
      const n = m.name.toLowerCase();
      let cat = '🔩 Outros';
      if (n === 'ground' || n.startsWith('bump_'))
        cat = '🌍 Terreno';
      else if (n === 'skybox'
        || n.includes('alley') || n.includes('tower') || n.includes('plat')
        || n.includes('sniper') || n.includes('ramp')
      ) cat = '🧱 Estrutura';
      else if (n.includes('cover') || n.includes('combat')) cat = '🎯 Combate';
      else if (n.includes('barrel') || n.includes('crate') || n.includes('glb')) cat = '📦 Dinâmicos';
      else if (n.includes('decor') || n.includes('neon') || n.includes('crystal')
             || n.includes('mushroom') || n.includes('industrial') || n.includes('sci')
             || n.includes('obelisk') || n.includes('gargoyle') || n.includes('hare')
             || n.includes('stone') || n.includes('cockatrice') || n.includes('altar')
             || n.includes('plant') || n.includes('pedestal')
      ) cat = '✨ Decoração';
      else if (n.includes('medkit') || n.includes('ammobox') || n.includes('pickup'))
        cat = '❤️ Pickups';
      else if (n.includes('cheese')) cat = '🧀 Objetivos';
      else if (n.includes('player') || n.includes('mouse_char')) cat = '🧑 Personagens';
      groups[cat].push(m);
    }
    return groups;
  }

  _refreshHierarchy() {
    const container = this._leftPanel?.querySelector('#sed-hierarchy');
    if (!container) return;

    const term   = (this._leftPanel?.querySelector('#sed-hier-search')?.value || '').toLowerCase();
    const groups = this._getGroups();
    let html = '';

    for (const [cat, items] of Object.entries(groups)) {
      if (items.length === 0) continue;

      const filtered = term
        ? items.filter(m => (m._label || m.name).toLowerCase().includes(term))
        : items;
      if (filtered.length === 0) continue;

      const catKey    = cat;
      const collapsed = this._categories[catKey] ?? false;
      const arrow     = collapsed ? '▶' : '▼';

      html += `<div class="sed-cat-header" onclick="window._sceneEditor._toggleCat('${catKey.replace(/'/g,"\\'")}')">
        <span>${arrow}</span> <span>${cat}</span>
        <span class="sed-cat-count">${filtered.length}</span>
      </div>`;

      if (!collapsed) {
        html += `<div class="sed-cat-body">`;
        for (const item of filtered) {
          const isMesh = !item._fake;
          const name   = item.name;
          const label  = item._label || name;
          const sel    = isMesh ? (item === this._sel) : (name === '__player__' && this._sel === window._gamePlayer?.mesh);
          const mod    = isMesh ? (this._saved[name] ? ' <span style="color:#fb4;font-size:9px">●</span>' : '') : '';
          const icon   = this._icon(name);
          const safe   = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
          html += `<div class="sed-hier-item${sel ? ' sed-sel' : ''}"
                        onclick="window._sceneEditor._selectByName('${safe}')">
            ${icon} <span class="sed-item-name">${label}</span>${mod}
          </div>`;
        }
        html += `</div>`;
      }
    }

    if (!html) html = `<div style="color:#445;text-align:center;padding:16px;font-size:10px">
      ${term ? `Nenhum resultado para "${term}"` : 'Sem objetos na cena'}</div>`;

    container.innerHTML = html;
  }

  _toggleCat(cat) {
    this._categories[cat] = !this._categories[cat];
    this._refreshHierarchy();
  }

  _icon(name) {
    const n = name.toLowerCase();
    if (n.includes('__player__') || n.includes('player')) return '👤';
    if (n.includes('cover') || n.includes('wall') || n.includes('alley')) return '🧱';
    if (n.includes('barrel'))  return '🛢️';
    if (n.includes('crate') || n.includes('ammo')) return '📦';
    if (n.includes('plat') || n.includes('sniper')) return '⬜';
    if (n.includes('ground') || n.includes('bump')) return '🌿';
    if (n.includes('cheese'))  return '🧀';
    if (n.includes('ramp'))    return '📐';
    if (n.includes('tower'))   return '🏗️';
    if (n.includes('decor') || n.includes('crystal') || n.includes('neon')) return '✨';
    if (n.includes('medkit'))  return '❤️';
    if (n.includes('obelisk') || n.includes('gargoyle')) return '🗿';
    if (n.includes('plant'))   return '🌿';
    return '◻';
  }

  // ════════════════════════════════════════════════════════════════
  //  Painel Esquerdo — Hierarquia
  // ════════════════════════════════════════════════════════════════
  _buildLeftPanel() {
    const d = document.createElement('div');
    d.id = 'sed-left';
    d.style.cssText = [
      'position:fixed','top:0','left:0',
      'width:280px','height:100dvh',
      'background:rgba(4,5,12,0.97)','color:#bbc',
      'font-family:ui-monospace,monospace','font-size:11px',
      'overflow:hidden','z-index:9500',
      'display:none','flex-direction:column',
      'box-sizing:border-box',
      'border-right:1.5px solid #1e3a1e',
    ].join(';');

    d.innerHTML = `
<style>
  #sed-left * { box-sizing:border-box; }
  #sed-left input[type=text] {
    background:#080818; border:1px solid #1e2e1e; color:#9be;
    padding:3px 7px; border-radius:3px; font-family:inherit; font-size:10px; width:100%;
  }
  .sed-cat-header {
    display:flex; align-items:center; gap:5px;
    padding:5px 8px; cursor:pointer; background:#06081a;
    border-bottom:1px solid #12201a; color:#3c9; font-size:10px;
    font-weight:700; letter-spacing:.5px; user-select:none;
    position:sticky; top:0; z-index:2;
  }
  .sed-cat-header:hover { background:#0a0e22; }
  .sed-cat-count { margin-left:auto; color:#334; font-size:9px; font-weight:400; }
  .sed-cat-body { }
  .sed-hier-item {
    display:flex; align-items:center; gap:5px;
    padding:3px 14px; cursor:pointer; color:#8a9;
    border-left:2px solid transparent;
    transition:background .08s;
    font-size:10px; overflow:hidden;
  }
  .sed-hier-item:hover { background:#0a0e1a; color:#bcd; border-left-color:#2a5; }
  .sed-hier-item.sed-sel { background:#091e10 !important; border-left-color:#3c9 !important; color:#aef !important; }
  .sed-item-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>

<div style="padding:7px 10px;background:#050715;border-bottom:1.5px solid #1e3a1e;flex-shrink:0">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <b style="color:#3c9;font-size:11px;letter-spacing:.5px">🌍 HIERARQUIA</b>
    <button onclick="window._sceneEditor._refreshHierarchy()"
      style="background:#0a1a10;color:#3a7;border:1px solid #1e3a1e;padding:2px 7px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px">↺</button>
  </div>
  <input id="sed-hier-search" type="text" placeholder="🔍 Buscar objeto...">
</div>

<div id="sed-hierarchy" style="flex:1;overflow-y:auto;min-height:0">
  <div style="color:#334;text-align:center;padding:20px;font-size:10px">Carregando…</div>
</div>

<div style="padding:6px 8px;border-top:1px solid #1e3a1e;background:#050715;flex-shrink:0;font-size:9px;color:#334;text-align:center;line-height:1.5">
  🖱️ <b style="color:#3c9">Clique esquerdo</b> seleciona<br>
  🖱️ <b style="color:#3c9">Botão direito</b> + arrastar = câmera<br>
  <b style="color:#3c9">WASD</b> move • <b style="color:#3c9">Scroll</b> velocidade
</div>`;

    document.body.appendChild(d);
    this._leftPanel = d;

    d.querySelector('#sed-hier-search')?.addEventListener('input',
      () => this._refreshHierarchy()
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  Painel Direito — Inspector
  // ════════════════════════════════════════════════════════════════
  _buildRightPanel() {
    const d = document.createElement('div');
    d.id = 'sed-right';
    d.style.cssText = [
      'position:fixed','top:0','right:0',
      'width:300px','height:100dvh',
      'background:#050510','color:#ccd',
      'font-family:ui-monospace,monospace','font-size:11px',
      'overflow:hidden','z-index:9500',
      'display:none','flex-direction:column',
      'box-sizing:border-box',
      'border-left:1.5px solid #1a2236',
    ].join(';');

    d.innerHTML = `
<style>
  #sed-right * { box-sizing:border-box; }
  #sed-right button {
    cursor:pointer; font-family:inherit; font-size:10px; border:none;
    padding:3px 6px; border-radius:3px; transition:filter .1s; color:#cde;
  }
  #sed-right button:hover { filter:brightness(1.35); }
  #sed-right input[type=number] {
    background:#0b0b1d; color:#8df; border:1px solid #1e3054;
    padding:2px 3px; border-radius:3px; font-family:inherit; font-size:10px;
  }
  #sed-right input[type=number]:focus { outline:1px solid #4af; border-color:#4af; }
  #sed-right input[type=checkbox] { accent-color:#2af; width:13px; height:13px; cursor:pointer; }
  #sed-right select {
    background:#0b0b1d; color:#8df; border:1px solid #1e3054;
    padding:2px 4px; border-radius:3px; font-family:inherit; font-size:10px; cursor:pointer;
  }

  /* Seção colapsável */
  .ins-section { border-bottom:1px solid #111828; }
  .ins-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:6px 10px; cursor:pointer; user-select:none;
    background:#070820; color:#7af; font-size:10px; font-weight:700; letter-spacing:.6px;
    transition:background .1s;
  }
  .ins-hdr:hover { background:#0a0e28; }
  .ins-hdr .ins-arr { color:#334; font-size:9px; }
  .ins-body { padding:6px 10px 8px; }

  /* Linhas de propriedade */
  .ins-row { display:flex; align-items:center; gap:3px; margin:2px 0; }
  .ins-lbl { width:10px; color:#6af; font-weight:700; font-size:10px; text-align:center; flex-shrink:0; }
  .ins-key { color:#678; font-size:9px; width:68px; flex-shrink:0; white-space:nowrap; }
  .ins-val { color:#9ce; font-size:10px; flex:1; }

  /* Nudge buttons */
  .nb {
    background:#111228; color:#9bd; padding:1px 4px; border-radius:2px;
    font-size:9px; cursor:pointer; border:1px solid #1a2540; font-family:inherit; flex-shrink:0;
  }
  .nb:hover { background:#1c1e44; }

  /* Gizmo mode tabs */
  .giz-btn { background:#0f1024; color:#678; padding:5px 0; flex:1; text-align:center; font-size:10px; border-radius:3px; border:1px solid #1a2236; }
  .giz-btn.active { background:#173a80 !important; color:#adf !important; border-color:#2af !important; }

  /* Tag de status */
  .ins-badge {
    font-size:8px; padding:1px 5px; border-radius:8px; font-weight:700; letter-spacing:.5px;
  }
  .badge-ok  { background:#0a2a10; color:#4d8; border:1px solid #1a5a20; }
  .badge-off { background:#1a1a2a; color:#445; border:1px solid #222; }
  .badge-new { background:#0a1a3a; color:#4af; border:1px solid #1a3a6a; }
  .badge-wip { background:#2a1a08; color:#a84; border:1px solid #5a3a10; }

  /* Separador interno */
  .ins-sep { border:none; border-top:1px solid #111828; margin:5px 0; }
</style>

<!-- ── Header fixo ───────────────────────────────────── -->
<div style="background:#040410;padding:7px 10px 6px;border-bottom:1.5px solid #1a2236;flex-shrink:0">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <b style="color:#3af;font-size:11px;letter-spacing:.5px">🔍 INSPECTOR</b>
    <span id="sed-obj-badge" class="ins-badge badge-off">sem seleção</span>
  </div>
  <!-- Gizmo tabs -->
  <div style="display:flex;gap:3px">
    <button id="sed-mode-position" class="giz-btn active">↔ Mover</button>
    <button id="sed-mode-rotation" class="giz-btn">↻ Girar</button>
    <button id="sed-mode-scale"    class="giz-btn">⟲ Escala</button>
  </div>
</div>

<!-- ── Objeto selecionado ─────────────────────────────── -->
<div style="padding:5px 10px;background:#060818;border-bottom:1px solid #111828;flex-shrink:0">
  <div style="display:flex;align-items:center;gap:5px">
    <span id="sed-obj-icon" style="font-size:13px">◻</span>
    <span id="sed-sel-name" style="color:#4cf;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      — clique na cena —
    </span>
    <button class="nb" onclick="window._sceneEditor._focusCamera()" title="Focar câmera">🎯</button>
  </div>
</div>

<!-- ── Corpo scrollável ───────────────────────────────── -->
<div style="flex:1;overflow-y:auto;min-height:0">

  <!-- 📐 TRANSFORM -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-transform')">
      <span>📐 TRANSFORM</span><span class="ins-arr">▼</span>
    </div>
    <div id="ins-transform" class="ins-body">
      <div style="color:#345;font-size:9px;margin-bottom:4px;letter-spacing:.5px">POSIÇÃO</div>
      <div class="ins-row"><span class="ins-lbl">X</span><input type="number" id="sed-px" step="0.1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-px',-0.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-px',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-px',-1)">−1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-px',1)">+1</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Y</span><input type="number" id="sed-py" step="0.1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-py',-0.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-py',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-py',-1)">−1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-py',1)">+1</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Z</span><input type="number" id="sed-pz" step="0.1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-pz',-0.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-pz',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-pz',-1)">−1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-pz',1)">+1</button>
      </div>
      <hr class="ins-sep">
      <div style="color:#345;font-size:9px;margin-bottom:4px;letter-spacing:.5px">ROTAÇÃO (°)</div>
      <div class="ins-row"><span class="ins-lbl">X</span><input type="number" id="sed-rx" step="1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rx',-5)">−5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rx',5)">+5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rx',-90)">−90°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rx',90)">+90°</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Y</span><input type="number" id="sed-ry" step="1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-ry',-5)">−5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-ry',5)">+5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-ry',-90)">−90°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-ry',90)">+90°</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Z</span><input type="number" id="sed-rz" step="1" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rz',-5)">−5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rz',5)">+5°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rz',-90)">−90°</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-rz',90)">+90°</button>
      </div>
      <hr class="ins-sep">
      <div style="color:#345;font-size:9px;margin-bottom:4px;letter-spacing:.5px">ESCALA</div>
      <div class="ins-row"><span class="ins-lbl">X</span><input type="number" id="sed-sx" step="0.01" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sx',-.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sx',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sx',-.5)">−.5</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sx',.5)">+.5</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Y</span><input type="number" id="sed-sy" step="0.01" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sy',-.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sy',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sy',-.5)">−.5</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sy',.5)">+.5</button>
      </div>
      <div class="ins-row"><span class="ins-lbl">Z</span><input type="number" id="sed-sz" step="0.01" style="width:70px">
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sz',-.1)">−.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sz',.1)">+.1</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sz',-.5)">−.5</button>
        <button class="nb" onclick="window._sceneEditor._nudge('sed-sz',.5)">+.5</button>
      </div>
      <div class="ins-row" style="margin-top:5px">
        <span style="color:#345;font-size:9px;white-space:nowrap">Uniforme:</span>
        <input type="number" id="sed-su" step="0.01" placeholder="1" style="width:58px">
        <button class="nb" onclick="window._sceneEditor._uniformScale()">← copiar</button>
        <button class="nb" onclick="window._sceneEditor._applyUniformScale()" style="color:#aef;border-color:#2a6">✓ aplicar</button>
      </div>
    </div>
  </div>

  <!-- ⚡ FÍSICA & COLISÃO -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-physics')">
      <span>⚡ FÍSICA &amp; COLISÃO</span><span class="ins-arr">▼</span>
    </div>
    <div id="ins-physics" class="ins-body">
      <!-- Flags Babylon imediatas -->
      <div class="ins-row" style="margin-bottom:5px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-col">
          <span style="font-size:10px;color:#9ce">checkCollisions</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-vis">
          <span style="font-size:10px;color:#9ce">isVisible</span>
        </label>
      </div>
      <div class="ins-row" style="margin-bottom:6px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-pick">
          <span style="font-size:10px;color:#9ce">isPickable</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-shadow">
          <span style="font-size:10px;color:#9ce">receiveShadows</span>
        </label>
      </div>
      <hr class="ins-sep">
      <!-- Futuro: RigidBody -->
      <div style="margin-bottom:3px;display:flex;align-items:center;gap:5px">
        <span style="color:#567;font-size:9px;letter-spacing:.5px">RIGIDBODY</span>
        <span class="ins-badge badge-wip">em breve</span>
      </div>
      <div class="ins-row" style="opacity:.5">
        <span class="ins-key">Tipo</span>
        <select id="sed-rb-type" disabled>
          <option>Static</option>
          <option>Dynamic</option>
          <option>Kinematic</option>
        </select>
      </div>
      <div class="ins-row" style="opacity:.5">
        <span class="ins-key">Massa (kg)</span>
        <input type="number" id="sed-rb-mass" step="0.1" value="1" disabled style="width:60px">
      </div>
      <div class="ins-row" style="opacity:.5">
        <span class="ins-key">Bounce</span>
        <input type="number" id="sed-rb-bounce" step="0.05" min="0" max="1" value="0" disabled style="width:60px">
        <span style="color:#345;font-size:9px;margin-left:2px">0–1</span>
      </div>
      <div class="ins-row" style="opacity:.5">
        <span class="ins-key">Fricção</span>
        <input type="number" id="sed-rb-friction" step="0.05" min="0" max="1" value="0.5" disabled style="width:60px">
      </div>
      <div class="ins-row" style="opacity:.5">
        <span class="ins-key">Gravidade</span>
        <input type="number" id="sed-rb-gravity" step="0.1" value="1" disabled style="width:60px">
        <span style="color:#345;font-size:9px;margin-left:2px">fator</span>
      </div>
    </div>
  </div>

  <!-- 🎨 MATERIAL -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-material')">
      <span>🎨 MATERIAL</span><span class="ins-arr">▼</span>
    </div>
    ...
  </div>

  <!-- 🎮 GAMEPLAY (Novo!) -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-gameplay')">
      <span>🎮 GAMEPLAY</span><span class="ins-arr">▼</span>
    </div>
    <div id="ins-gameplay" class="ins-body">
      <div class="ins-row">
        <span class="ins-key">Template</span>
        <select id="sed-sel-template" style="flex:1" onchange="window._sceneEditor._onTemplateChange(this.value)">
          <option value="">— carregar template —</option>
        </select>
      </div>
      <hr class="ins-sep">
      <div class="ins-row">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-breakable">
          <span style="font-size:10px;color:#f88">É Quebrável?</span>
        </label>
      </div>
      <div class="ins-row">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-physics">
          <span style="font-size:10px;color:#8f8">Tem Física?</span>
        </label>
      </div>
      <div class="ins-row">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex:1">
          <input type="checkbox" id="sed-chk-collect">
          <span style="font-size:10px;color:#88f">É Coletável?</span>
        </label>
      </div>
      <hr class="ins-sep">
      <div class="ins-row">
        <span class="ins-key">Vida (HP)</span>
        <input type="number" id="sed-num-hp" step="1" value="3" style="width:60px">
      </div>
      <div class="ins-row">
        <span class="ins-key">Bounce</span>
        <input type="number" id="sed-num-bounce" step="0.05" min="0" max="1" value="0.22" style="width:60px">
        <span style="color:#345;font-size:9px;margin-left:2px">0–1</span>
      </div>
      <div class="ins-row">
        <span class="ins-key">Item ID</span>
        <input type="text" id="sed-txt-itemid" placeholder="ex: hpSmall" 
               style="background:#0b0b1d; color:#8df; border:1px solid #1e3054; padding:2px 4px; border-radius:3px; font-family:inherit; font-size:10px; flex:1">
      </div>
      <button class="nb" style="width:100%; margin-top:8px; background:#1a3a1a; color:#8f8; border-color:#2a4"
              onclick="window._sceneEditor._applyGameplay()">✓ Aplicar Config de Jogo</button>
    </div>
  </div>

  <!-- ℹ️ INFO DO OBJETO -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-info')">
      <span>ℹ️ INFORMAÇÕES</span><span class="ins-arr">▼</span>
    </div>
    <div id="ins-info" class="ins-body">
      <div class="ins-row"><span class="ins-key">Tipo</span><span id="inf-type" class="ins-val">—</span></div>
      <div class="ins-row"><span class="ins-key">ID</span><span id="inf-id" class="ins-val" style="font-size:9px">—</span></div>
      <div class="ins-row"><span class="ins-key">Vértices</span><span id="inf-verts" class="ins-val">—</span></div>
      <div class="ins-row"><span class="ins-key">Faces</span><span id="inf-faces" class="ins-val">—</span></div>
      <div class="ins-row"><span class="ins-key">Filhos</span><span id="inf-children" class="ins-val">—</span></div>
      <hr class="ins-sep">
      <div style="color:#345;font-size:9px;margin-bottom:3px;letter-spacing:.5px">POSIÇÃO ABSOLUTA</div>
      <div class="ins-row">
        <span class="ins-key">X</span><span id="inf-wx" class="ins-val">—</span>
        <span class="ins-key" style="margin-left:6px">Y</span><span id="inf-wy" class="ins-val">—</span>
        <span class="ins-key" style="margin-left:6px">Z</span><span id="inf-wz" class="ins-val">—</span>
      </div>
    </div>
  </div>

  <!-- 🦴 ESQUELETO -->
  <div class="ins-section">
    <div class="ins-hdr" onclick="window._sceneEditor._toggleSection('ins-skeleton')">
      <span>🦴 ESQUELETO</span><span class="ins-arr">▶</span>
    </div>
    <div id="ins-skeleton" class="ins-body" style="display:none">
      <div style="display:flex;gap:4px;margin-bottom:6px">
        <button id="sed-bone-toggle" class="nb" style="flex:1;font-size:10px;padding:3px 0"
          onclick="window._sceneEditor._toggleBoneDebug()">
          👁 Ver Ossos na Cena
        </button>
      </div>
      <div style="display:flex;gap:5px;font-size:9px;color:#456;margin-bottom:5px;flex-wrap:wrap">
        <span style="color:#0fa">● mão/pulso</span>
        <span style="color:#fa5">● pé/tornozelo</span>
        <span style="color:#ff0">● cabeça</span>
        <span style="color:#f3a">● coluna/quadril</span>
        <span style="color:#4af">● outros</span>
      </div>
      <input id="sed-bone-search" type="text" placeholder="🔍 filtrar osso..."
        style="width:100%;box-sizing:border-box;background:#0a0f18;border:1px solid #1e2a3a;color:#8df;font-size:10px;padding:3px 5px;border-radius:3px;margin-bottom:5px"
        oninput="window._sceneEditor._filterBones(this.value)">
      <div id="sed-bone-list" style="max-height:220px;overflow-y:auto;font-size:10px;line-height:1.5">
        <span style="color:#456">— clique em "Ver Ossos" para carregar —</span>
      </div>
    </div>
  </div>

  <!-- Espaçador -->
  <div style="height:8px"></div>
</div>

<!-- ── Footer fixo ────────────────────────────────────── -->
<div style="padding:6px 8px;border-top:1.5px solid #1a2236;background:#040410;flex-shrink:0">
  <div style="display:flex;gap:3px;margin-bottom:3px">
    <button id="sed-save-btn"   style="background:#122412;color:#5e5;flex:1;font-weight:700;font-size:11px">💾 Salvar Cena</button>
    <button id="sed-export-btn" style="background:#101828;color:#5af;flex:1;font-size:11px">📥 JSON</button>
  </div>
  <div style="display:flex;gap:3px;margin-bottom:3px">
    <button id="sed-reset-obj-btn" style="background:#221508;color:#f90;flex:1">↺ Reset Obj</button>
    <button id="sed-reset-all-btn" style="background:#1e0808;color:#f44;flex:1">⚠️ Reset All</button>
  </div>
  <div style="display:flex;gap:3px">
    <button id="sed-scale1-btn"   style="background:#0a1a0a;color:#8f8;flex:1;font-size:10px" title="Define escala 1,1,1 no objeto selecionado">📐 Escala → 1</button>
    <button id="sed-scale1all-btn" style="background:#0a0a1a;color:#88f;flex:1;font-size:10px" title="Define escala 1,1,1 em TODOS os objetos salvos com escala menor que 0.5">📐 Fixar Todos (< 0.5)</button>
  </div>
</div>`;

    document.body.appendChild(d);
    this._rightPanel = d;
    this._wireRightPanel();
  }

  _wireRightPanel() {
    const p = this._rightPanel;

    // Gizmo tabs
    ['position','rotation','scale'].forEach(m =>
      p.querySelector(`#sed-mode-${m}`)?.addEventListener('click', () => this._setGizmoMode(m))
    );

    // Transform inputs
    ['px','py','pz','rx','ry','rz','sx','sy','sz'].forEach(id => {
      const el = p.querySelector(`#sed-${id}`);
      if (!el) return;
      el.addEventListener('change', () => this._applyInputs());
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { this._applyInputs(); el.blur(); } });
    });

    // Física — flags imediatas
    p.querySelector('#sed-chk-col')?.addEventListener('change', e => {
      if (this._sel) { this._sel.checkCollisions = e.target.checked; this._saveTransform(this._sel); }
    });
    p.querySelector('#sed-chk-vis')?.addEventListener('change', e => {
      if (this._sel) this._sel.isVisible = e.target.checked;
    });
    p.querySelector('#sed-chk-pick')?.addEventListener('change', e => {
      if (this._sel) this._sel.isPickable = e.target.checked;
    });
    p.querySelector('#sed-chk-shadow')?.addEventListener('change', e => {
      if (this._sel) this._sel.receiveShadows = e.target.checked;
    });

    // Material — cor difusa
    p.querySelector('#sed-mat-diffuse')?.addEventListener('input', e => {
      const mat = this._sel?.material;
      if (!mat?.diffuseColor) return;
      const hex = e.target.value;
      mat.diffuseColor.set(...this._hexToRgb(hex));
      p.querySelector('#sed-mat-diffuse-hex').textContent = hex;
    });

    // Material — cor emissiva
    p.querySelector('#sed-mat-emissive')?.addEventListener('input', e => {
      const mat = this._sel?.material;
      if (!mat?.emissiveColor) return;
      const hex = e.target.value;
      mat.emissiveColor.set(...this._hexToRgb(hex));
      p.querySelector('#sed-mat-emissive-hex').textContent = hex;
    });

    // Material — opacidade
    p.querySelector('#sed-mat-alpha')?.addEventListener('input', e => {
      const mat = this._sel?.material;
      if (!mat) return;
      mat.alpha = parseFloat(e.target.value);
      p.querySelector('#sed-mat-alpha-val').textContent = mat.alpha.toFixed(2);
    });

    // Material — wireframe
    p.querySelector('#sed-mat-wire')?.addEventListener('change', e => {
      const mat = this._sel?.material;
      if (mat) mat.wireframe = e.target.checked;
    });
    p.querySelector('#sed-mat-nolight')?.addEventListener('change', e => {
      const mat = this._sel?.material;
      if (mat) mat.disableLighting = e.target.checked;
    });

    // Footer
    p.querySelector('#sed-save-btn')?.addEventListener('click', () => this._saveAll());
    p.querySelector('#sed-export-btn')?.addEventListener('click', () => this._exportJSON());
    p.querySelector('#sed-reset-obj-btn')?.addEventListener('click', () => this._resetSelected());
    p.querySelector('#sed-reset-all-btn')?.addEventListener('click', () => this._resetAll());
    p.querySelector('#sed-scale1-btn')?.addEventListener('click', () => this._scaleSelectedToOne());
    p.querySelector('#sed-scale1all-btn')?.addEventListener('click', () => this._fixAllTinyScales());
  }

  // ── Toggle seções colapsáveis ─────────────────────────────────
  _toggleSection(id) {
    const body   = document.getElementById(id);
    if (!body) return;
    const header = body.previousElementSibling;
    const arrow  = header?.querySelector('.ins-arr');
    const hidden = body.style.display === 'none';
    body.style.display  = hidden ? '' : 'none';
    if (arrow) arrow.textContent = hidden ? '▼' : '▶';
  }

  _applyGameplay() {
    if (!this._sel) return;
    const q = id => this._rightPanel?.querySelector(`#${id}`);

    const config = {
      isBreakable:   q('sed-chk-breakable')?.checked ?? false,
      hasPhysics:    q('sed-chk-physics')?.checked   ?? false,
      isCollectable: q('sed-chk-collect')?.checked   ?? false,
      hp:            parseInt(q('sed-num-hp')?.value) || 3,
      bounce:        parseFloat(q('sed-num-bounce')?.value) || 0.22,
      itemId:        q('sed-txt-itemid')?.value || '',
    };

    // ── Resolve o NÓ RAIZ do objeto ───────────────────────────────────
    // Se selecionou um submesh de um GLB, sobe até o __root__ pra mover o
    // objeto inteiro (não só um pedaço).
    let target = this._sel;
    while (target.parent && (target.parent.name === '__root__' || /__root__|_glb_|_decor_/.test(target.parent.name))) {
      target = target.parent;
    }

    let go = target._gameObject || this._sel._gameObject;

    if (go) {
      go.isBreakable   = config.isBreakable;
      go.hasPhysics    = config.hasPhysics;
      go.isCollectable = config.isCollectable;
      go.hp            = config.hp;
      go.BOUNCE        = config.bounce;
      go.itemId        = config.itemId;
      // reacorda pra física voltar a rodar
      go._sleeping = false; go._sleepT = 0;
    } else if (window._gameLevel) {
      // ── Cria corpo de colisão (caixa) p/ GLBs sem colisão própria ───
      // GLBs de decoração têm checkCollisions=false nos filhos → não caem.
      // Criamos uma caixa invisível como corpo físico e o GLB como visual.
      const isGLB = target.getClassName?.() === 'Mesh' && target.getChildMeshes?.().length > 0
                 || /__root__/.test(target.name);
      const bb = target.getHierarchyBoundingVectors?.(true);
      let body = target;
      if (config.hasPhysics && bb) {
        const size = bb.max.subtract(bb.min);
        const center = bb.min.add(bb.max).scale(0.5);
        body = BABYLON.MeshBuilder.CreateBox(`${target.name}_col`, {
          width: Math.max(0.3, size.x), height: Math.max(0.3, size.y), depth: Math.max(0.3, size.z),
        }, this.scene);
        body.position.copyFrom(center);
        body.isVisible = false;
        body.isPickable = true;
        body.checkCollisions = true;
        go = window._gameLevel.addInteractiveObject({ mesh: body, glb: target, ...config });
      } else {
        go = window._gameLevel.addInteractiveObject({ mesh: target, ...config });
      }
    }

    // ── Persiste as flags de gameplay no DB (junto do transform) ──────
    this._saved[target.name] = this._saved[target.name] || {};
    Object.assign(this._saved[target.name], {
      breakable: config.isBreakable, physics: config.hasPhysics,
      collect: config.isCollectable, hp: config.hp, bounce: config.bounce, itemId: config.itemId,
    });
    this._saveTransform(target);   // já chama _scheduleSave() → grava no LocalDB
    this._toast('✅ Gameplay salvo! (física/quebrável aplicados)', '#0a2a0a');
  }

  _syncGameplaySection(mesh) {
    const q = id => this._rightPanel?.querySelector(`#${id}`);
    const go = mesh._gameObject;
    const saved = this._saved[mesh.name] || {};

    // Prioriza o que está no GameObject real, senão o que está salvo
    const brk = go ? go.isBreakable   : (saved.breakable ?? false);
    const phy = go ? go.hasPhysics    : (saved.physics   ?? false);
    const col = go ? go.isCollectable : (saved.collect   ?? false);
    const hp  = go ? go.hp            : (saved.hp        ?? 3);
    const bnc = go ? go.BOUNCE        : (saved.bounce    ?? 0.22);
    const itm = go ? go.itemId        : (saved.itemId    ?? '');

    if (q('sed-chk-breakable')) q('sed-chk-breakable').checked = brk;
    if (q('sed-chk-physics'))   q('sed-chk-physics').checked   = phy;
    if (q('sed-chk-collect'))   q('sed-chk-collect').checked   = col;
    if (q('sed-num-hp'))        q('sed-num-hp').value          = hp;
    if (q('sed-num-bounce'))    q('sed-num-bounce').value      = bnc;
    if (q('sed-txt-itemid'))    q('sed-txt-itemid').value      = itm;
  }

  _clearGameplaySection() {
    const q = id => this._rightPanel?.querySelector(`#${id}`);
    if (q('sed-chk-breakable')) q('sed-chk-breakable').checked = false;
    if (q('sed-chk-physics'))   q('sed-chk-physics').checked   = false;
    if (q('sed-chk-collect'))   q('sed-chk-collect').checked   = false;
    if (q('sed-num-hp'))        q('sed-num-hp').value          = 3;
    if (q('sed-num-bounce'))    q('sed-num-bounce').value      = 0.22;
    if (q('sed-txt-itemid'))    q('sed-txt-itemid').value      = '';
  }

  // ── Sincronização completa do inspector ───────────────────────
  _syncAllSections(mesh) {
    if (!mesh) {
      // Limpa badge e ícone
      const badge = this._rightPanel?.querySelector('#sed-obj-badge');
      const icon  = this._rightPanel?.querySelector('#sed-obj-icon');
      if (badge) { badge.textContent = 'sem seleção'; badge.className = 'ins-badge badge-off'; }
      if (icon)  icon.textContent = '◻';
      this._clearInputs();
      this._clearPhysicsSection();
      this._clearMaterialSection();
      this._clearGameplaySection();
      this._clearInfoSection();
      return;
    }

    // Badge
    const badge = this._rightPanel?.querySelector('#sed-obj-badge');
    if (badge) { badge.textContent = '✔ selecionado'; badge.className = 'ins-badge badge-ok'; }
    const icon = this._rightPanel?.querySelector('#sed-obj-icon');
    if (icon) icon.textContent = this._icon(mesh.name);

    this._syncInputs();
    this._syncPhysicsSection(mesh);
    this._syncMaterialSection(mesh);
    this._syncGameplaySection(mesh);
    this._syncInfoSection(mesh);
  }

  // ── Física ───────────────────────────────────────────────────
  _syncPhysicsSection(mesh) {
    const p = this._rightPanel;
    const q = id => p?.querySelector(`#${id}`);
    if (!p) return;
    const setChk = (id, v) => { const el = q(id); if (el) el.checked = !!v; };
    setChk('sed-chk-col',    mesh.checkCollisions);
    setChk('sed-chk-vis',    mesh.isVisible !== false);
    setChk('sed-chk-pick',   mesh.isPickable !== false);
    setChk('sed-chk-shadow', mesh.receiveShadows);
  }

  _clearPhysicsSection() {
    ['sed-chk-col','sed-chk-vis','sed-chk-pick','sed-chk-shadow'].forEach(id => {
      const el = this._rightPanel?.querySelector(`#${id}`);
      if (el) el.checked = false;
    });
  }

  // ── Material ─────────────────────────────────────────────────
  _syncMaterialSection(mesh) {
    const p   = this._rightPanel;
    if (!p || !mesh) return;
    const mat = mesh.material;
    // helpers tolerantes a null — campo ausente no painel não derruba o jogo
    const setTxt = (id, v) => { const el = p.querySelector(`#${id}`); if (el) el.textContent = v; };
    const setVal = (id, v) => { const el = p.querySelector(`#${id}`); if (el) el.value = v; };
    const setChk = (id, v) => { const el = p.querySelector(`#${id}`); if (el) el.checked = !!v; };

    setTxt('sed-mat-name', mat?.name ?? '—');
    setTxt('sed-mat-type', mat ? (mat.getClassName?.() ?? 'Material') : '—');

    if (mat?.diffuseColor) {
      const hex = this._rgbToHex(mat.diffuseColor);
      setVal('sed-mat-diffuse', hex);
      setTxt('sed-mat-diffuse-hex', hex);
    } else {
      setVal('sed-mat-diffuse', '#888888');
      setTxt('sed-mat-diffuse-hex', '—');
    }

    if (mat?.emissiveColor) {
      const hex = this._rgbToHex(mat.emissiveColor);
      setVal('sed-mat-emissive', hex);
      setTxt('sed-mat-emissive-hex', hex);
    } else {
      setVal('sed-mat-emissive', '#000000');
      setTxt('sed-mat-emissive-hex', '—');
    }

    const alpha = mat?.alpha ?? 1;
    setVal('sed-mat-alpha', alpha);
    setTxt('sed-mat-alpha-val', alpha.toFixed(2));

    setChk('sed-mat-wire',    mat?.wireframe);
    setChk('sed-mat-nolight', mat?.disableLighting);
  }

  _clearMaterialSection() {
    const p = this._rightPanel;
    if (!p) return;
    ['sed-mat-name','sed-mat-type','sed-mat-diffuse-hex','sed-mat-emissive-hex']
      .forEach(id => { const el = p.querySelector(`#${id}`); if (el) el.textContent = '—'; });
    const av = p.querySelector('#sed-mat-alpha-val');
    if (av) av.textContent = '—';
  }

  // ── Info ─────────────────────────────────────────────────────
  _syncInfoSection(mesh) {
    const p = this._rightPanel;
    if (!p) return;
    const q = id => p.querySelector(`#${id}`);
    const set = (id, v) => { const el = q(id); if (el) el.textContent = v; };

    set('inf-type',     mesh.getClassName?.() ?? typeof mesh);
    set('inf-id',       mesh.uniqueId ?? mesh.id ?? '—');
    set('inf-children', mesh.getChildMeshes?.().length ?? mesh.getChildren?.().length ?? '—');

    const vd = mesh.getVerticesData?.('position');
    set('inf-verts', vd ? Math.floor(vd.length / 3) : '—');
    const id2 = mesh.getTotalIndices?.();
    set('inf-faces', id2 ? Math.floor(id2 / 3) : '—');

    const wp = mesh.getAbsolutePosition?.() ?? mesh.position;
    if (wp) {
      set('inf-wx', wp.x.toFixed(2));
      set('inf-wy', wp.y.toFixed(2));
      set('inf-wz', wp.z.toFixed(2));
    }
  }

  _clearInfoSection() {
    ['inf-type','inf-id','inf-verts','inf-faces','inf-children','inf-wx','inf-wy','inf-wz']
      .forEach(id => {
        const el = this._rightPanel?.querySelector(`#${id}`);
        if (el) el.textContent = '—';
      });
  }

  // ── Helpers de cor ────────────────────────────────────────────
  _rgbToHex(c) {
    const h = v => Math.round(Math.min(255, v * 255)).toString(16).padStart(2,'0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16)/255;
    const g = parseInt(hex.slice(3,5),16)/255;
    const b = parseInt(hex.slice(5,7),16)/255;
    return [r, g, b];
  }

  // ════════════════════════════════════════════════════════════════
  //  Speed Overlay (HUD de velocidade sobre a cena)
  // ════════════════════════════════════════════════════════════════
  _buildSpeedOverlay() {
    const d = document.createElement('div');
    d.id = 'ghost-speed-hud';
    d.style.cssText = [
      'position:fixed','bottom:18px',
      'left:50%','transform:translateX(-50%)',
      'background:rgba(0,0,0,.75)','color:#aef',
      'padding:4px 14px','border-radius:16px',
      'font-family:ui-monospace,monospace','font-size:11px',
      'z-index:9600','pointer-events:none',
      'display:none','border:1px solid #2a6',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(d);
  }

  _updateSpeedOverlay() {
    const el = document.getElementById('ghost-speed-hud');
    if (!el) return;
    // Sempre visível enquanto o editor de cena está aberto
    if (!this._visible) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    if (this._ghost.isFlying) {
      el.textContent = `🚀 ${this._ghost.speed.toFixed(1)} m/s  •  WASD mover  •  Q/E subir/descer  •  Scroll velocidade`;
    } else {
      el.textContent = `🖱️ Segure BOTÃO DIREITO (ou do meio) p/ girar a câmera + WASD p/ mover  •  Q/E sobe/desce`;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Ações do rodapé
  // ════════════════════════════════════════════════════════════════

  /** Define escala 1,1,1 no objeto selecionado e salva */
  _scaleSelectedToOne() {
    if (!this._sel) { this._toast('Selecione um objeto primeiro.', '#2a1a00'); return; }
    this._sel.scaling.setAll(1);
    this._saveTransform(this._sel);
    this._syncAllSections(this._sel);
    this._toast(`📐 "${this._sel.name}" → escala 1`, '#0a1a0a');
  }

  /** Corrige todos os objetos da cena com escala média < 0.5, colocando em 1,1,1 */
  _fixAllTinyScales() {
    let fixed = 0;
    for (const mesh of this.scene.meshes) {
      if (!mesh.isEnabled()) continue;
      const avg = (Math.abs(mesh.scaling.x) + Math.abs(mesh.scaling.y) + Math.abs(mesh.scaling.z)) / 3;
      if (avg > 0.001 && avg < 0.5) {
        mesh.scaling.setAll(1);
        this._saveTransform(mesh);
        fixed++;
      }
    }
    this._writeStorage();
    this._refreshHierarchy();
    this._toast(`📐 ${fixed} objeto(s) corrigidos para escala 1.`, '#0a1a2a');
  }

  _saveAll() {
    this._writeStorage();
    const btn = this._rightPanel?.querySelector('#sed-save-btn');
    if (btn) {
      btn.textContent = '✅ Salvo!';
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => btn.textContent = '💾 Salvar', 1600);
    }
    this._toast(`💾 ${Object.keys(this._saved).length} objeto(s) salvos.`, '#0a2a0a');
  }

  _exportJSON() {
    const blob = new Blob([JSON.stringify(this._saved, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url, download: `sceneConfig_${Date.now()}.json`,
    }).click();
    URL.revokeObjectURL(url);
    this._toast('📥 JSON exportado!', '#0a1a2a');
  }

  _resetSelected() {
    if (!this._sel) { this._toast('Selecione um objeto primeiro.', '#2a1a00'); return; }
    const name = this._sel.name;
    if (!this._saved[name]) { this._toast('Nenhuma modificação salva.', '#2a1a00'); return; }
    delete this._saved[name];
    this._writeStorage();
    this._refreshHierarchy();
    this._toast(`↺ "${name}" removido.`, '#2a1a00');
  }

  _resetAll() {
    if (!confirm('⚠️ Apagar TODAS as modificações?\nOs objetos voltam ao original após F5.')) return;
    localStorage.removeItem(SceneEditor.STORAGE_KEY);
    this._saved = {};
    this._refreshHierarchy();
    this._toast('🔄 Resetado. Recarregue para ver.', '#3a0a00');
  }

  _toast(msg, bg = '#0a1a0a') {
    let t = document.getElementById('sed-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sed-toast';
      t.style.cssText = 'position:fixed;bottom:50px;left:310px;background:#0a1a0a;color:#9f9;'
        + 'padding:7px 12px;border-radius:6px;font-size:11px;z-index:9999;'
        + 'font-family:ui-monospace,monospace;border:1px solid #2a6;'
        + 'max-width:260px;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(t);
    }
    t.style.background = bg;
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }

  // ════════════════════════════════════════════════════════════════
  //  Bone Debug Visualizer
  // ════════════════════════════════════════════════════════════════

  /** Coleta todos os TransformNodes filhos dos __root__ da cena */
  _getBones() {
    const bones = [];
    const seen  = new Set();
    this.scene.transformNodes.forEach(n => {
      if (!n.name.includes('__root__')) return;
      n.getDescendants(false).forEach(d => {
        if (d.getClassName() === 'TransformNode' && !seen.has(d.uniqueId)) {
          seen.add(d.uniqueId);
          bones.push(d);
        }
      });
    });
    return bones;
  }

  _toggleBoneDebug() {
    const btn = document.getElementById('sed-bone-toggle');
    if (this._boneDebugOn) {
      this._clearBoneDebug();
      this._boneDebugOn = false;
      if (btn) { btn.style.background = ''; btn.style.color = ''; btn.textContent = '👁 Ver Ossos na Cena'; }
      return;
    }

    this._boneDebugOn = true;
    if (btn) { btn.style.background = '#173a80'; btn.style.color = '#adf'; btn.textContent = '🚫 Esconder Ossos'; }

    this._boneSpheres = [];
    const bones = this._getBones();

    bones.forEach(bone => {
      const n = bone.name.toLowerCase();

      // Cor por tipo de osso
      let hex;
      if      (n.includes('hand') || n.includes('wrist') || n.includes('finger')) hex = '#00ffaa';
      else if (n.includes('foot') || n.includes('toe')   || n.includes('ankle'))  hex = '#ffaa44';
      else if (n.includes('head') || n.includes('neck'))                           hex = '#ffff00';
      else if (n.includes('spine') || n.includes('hip')  || n.includes('pelv') || n.includes('root')) hex = '#ff33aa';
      else                                                                          hex = '#44aaff';

      const sphere = BABYLON.MeshBuilder.CreateSphere(`_bv_${bone.uniqueId}`, { diameter: 0.06 }, this.scene);
      const mat    = new BABYLON.StandardMaterial(`_bvm_${bone.uniqueId}`, this.scene);
      mat.emissiveColor    = BABYLON.Color3.FromHexString(hex);
      mat.disableLighting  = true;
      sphere.material      = mat;
      sphere.parent        = bone;
      sphere.position.setAll(0);
      sphere.isPickable    = false;
      sphere.renderingGroupId = 1; // renderiza sobre outros objetos

      this._boneSpheres.push(sphere);
    });

    this._boneNodes = bones;
    this._renderBoneList(bones, '');
    document.getElementById('sed-bone-search').value = '';
  }

  _clearBoneDebug() {
    this._boneSpheres.forEach(s => { s.material?.dispose(); s.dispose(); });
    this._boneSpheres = [];
    const list = document.getElementById('sed-bone-list');
    if (list) list.innerHTML = '<span style="color:#456">— clique em "Ver Ossos" para carregar —</span>';
  }

  _filterBones(query) {
    if (!this._boneDebugOn || !this._boneNodes.length) return;
    this._renderBoneList(this._boneNodes, query.trim().toLowerCase());
  }

  _renderBoneList(bones, filter) {
    const list = document.getElementById('sed-bone-list');
    if (!list) return;

    const shown = filter ? bones.filter(b => b.name.toLowerCase().includes(filter)) : bones;
    if (!shown.length) { list.innerHTML = '<span style="color:#456">sem resultados</span>'; return; }

    list.innerHTML = shown.map(b => {
      const n = b.name.toLowerCase();
      let dot = '#4af';
      if      (n.includes('hand') || n.includes('wrist') || n.includes('finger')) dot = '#0fa';
      else if (n.includes('foot') || n.includes('toe')   || n.includes('ankle'))  dot = '#fa5';
      else if (n.includes('head') || n.includes('neck'))                           dot = '#ff0';
      else if (n.includes('spine')|| n.includes('hip')   || n.includes('pelv') || n.includes('root')) dot = '#f3a';

      // Escapa aspas simples no nome para não quebrar o onclick
      const safeName = b.name.replace(/'/g, "\\'");

      return `<div style="display:flex;align-items:center;gap:4px;padding:2px 3px;border-radius:2px;cursor:pointer"
        onclick="window._sceneEditor._flyToBone('${safeName}')"
        onmouseenter="this.style.background='#111e30'" onmouseleave="this.style.background=''">
        <span style="color:${dot};font-size:8px;flex-shrink:0">●</span>
        <span style="color:#9ce;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${b.name}">${b.name}</span>
        <span title="Copiar" style="cursor:pointer;color:#456;font-size:10px"
          onclick="event.stopPropagation();navigator.clipboard?.writeText('${safeName}');window._sceneEditor._toast('📋 ${safeName}')">📋</span>
      </div>`;
    }).join('');
  }

  _flyToBone(boneName) {
    const bone = this.scene.getTransformNodeByName(boneName);
    if (!bone || !this._ghost._cam) return;
    const pos  = bone.getAbsolutePosition();
    this._ghost._cam.position.set(pos.x, pos.y + 0.25, pos.z - 0.8);
    this._ghost._cam.setTarget(pos.clone());
    this._toast(`🦴 ${boneName}`);
  }

  // ════════════════════════════════════════════════════════════════
  //  Show / Hide
  // ════════════════════════════════════════════════════════════════
  show() {
    this._visible = true;

    // Mostra os dois painéis
    this._leftPanel.style.display  = 'flex';
    this._rightPanel.style.display = 'flex';

    // Ajusta canvas: entre os dois painéis
    document.body.classList.add('engine-scene');
    this.scene.getEngine().resize();

    // Ativa câmera fantasma
    this._ghost.activate();

    // Gizmo mode
    this._setGizmoMode(this._gizMode);

    // Popula hierarquia (com pequeno delay para os meshes estarem prontos)
    setTimeout(() => this._refreshHierarchy(), 50);
  }

  hide() {
    this._visible = false;

    this._leftPanel.style.display  = 'none';
    this._rightPanel.style.display = 'none';

    document.body.classList.remove('engine-scene');
    this.scene.getEngine().resize();

    this._ghost.deactivate();

    // Remove esferas de debug de ossos ao sair do editor
    if (this._boneDebugOn) {
      this._clearBoneDebug();
      this._boneDebugOn = false;
      const btn = document.getElementById('sed-bone-toggle');
      if (btn) { btn.style.background = ''; btn.style.color = ''; btn.textContent = '👁 Ver Ossos na Cena'; }
    }

    this._gm?.attachToMesh(null);
    this._clearHighlight();   // limpa todos os highlights acumulados
    this._sel = null;

    const n = this._rightPanel?.querySelector('#sed-sel-name');
    if (n) n.textContent = '— clique na cena —';

    const spd = document.getElementById('ghost-speed-hud');
    if (spd) spd.style.display = 'none';
  }
}
