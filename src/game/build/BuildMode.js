// ─────────────────────────────────────────────────────────────────
//  BuildMode — modo construção estilo The Sims / V Rising
//
//  • Catálogo de assets (gerados pelo Meshy ou já existentes)
//  • Ghost (preview translúcido) que segue o cursor/raycast no chão
//  • Rotação com [ ] · grid snap opcional · confirma com clique
//  • Tecla B abre/fecha. Salva tudo no LocalDB (coleção 'placed').
//
//  A "Máquina de Criação" (GLB que o usuário vai colocar no mapa) é o
//  ponto de interação: chegar perto + E abre o painel do Meshy.
// ─────────────────────────────────────────────────────────────────
import { LocalDB } from '../data/LocalDB.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

export class BuildMode {
  constructor(scene, player, level) {
    this.scene = scene;
    this.player = player;
    this.level = level;
    this._active = false;
    this._wasB = false;
    this._ghost = null;        // mesh translúcido de preview
    this._ghostSrc = null;     // template selecionado { kind, id, glbUrl }
    this._rotY = 0;
    this._grid = 1.0;          // snap (0 = livre)
    this._placed = [];         // objetos colocados nesta sessão
    this._catalog = [];        // itens do catálogo de construção
    this._build();
    this._load();
  }

  // ── Catálogo: junta props existentes + assets gerados (DB) ────────
  async _load() {
    // props do AssetRegistry (categoria item/nature) servem de catálogo base
    const base = [];
    for (const cat of ['item', 'nature']) {
      for (const id of AssetRegistry.ids(cat)) {
        base.push({ kind: 'registry', cat, id, name: id, path: AssetRegistry.path(cat, id) });
      }
    }
    // assets gerados pelo Meshy salvos no DB
    let generated = [];
    try { generated = await LocalDB.get('generated_assets', []); } catch (_) {}
    this._catalog = [...generated.map(g => ({ kind: 'generated', id: g.id, name: g.name, glbUrl: g.glbUrl })), ...base];
    this._renderCatalog();
  }

  // ── UI ───────────────────────────────────────────────────────────
  _build() {
    const el = document.createElement('div');
    el.id = 'build-panel';
    el.style.cssText = `
      position: fixed; right: 0; top: 0; width: 300px; height: 100vh;
      background: rgba(8,10,18,0.95); border-left: 2px solid #3a8;
      color: #cde; font-family: 'Segoe UI', monospace; font-size: 12px;
      display: none; flex-direction: column; z-index: 9000; padding: 12px; box-sizing: border-box;
      overflow-y: auto;
    `;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3a8;padding-bottom:8px;margin-bottom:8px">
        <b style="color:#5fc;font-size:14px;letter-spacing:1px">🔨 CONSTRUÇÃO</b>
        <button id="build-close" style="background:#1a2a2a;border:none;color:#7aa;cursor:pointer;padding:3px 8px;border-radius:4px">✕ [B]</button>
      </div>
      <div style="font-size:10px;color:#789;margin-bottom:8px">
        Clique num item → ele vira fantasma no cursor. Clique no chão p/ colocar.
        <b>[ ]</b> gira · <b>G</b> grid · <b>Del</b> remove último · <b>Esc</b> cancela
      </div>
      <div style="display:flex;gap:5px;margin-bottom:8px">
        <button id="build-grid" class="bm-btn">Grid: 1.0</button>
        <button id="build-undo" class="bm-btn" style="background:#3a1a1a">↩ Desfazer</button>
      </div>
      <div style="color:#5fc;font-weight:bold;margin:6px 0 4px">📦 Catálogo</div>
      <div id="build-catalog" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;flex:1"></div>
      <style>
        .bm-btn{background:#163a32;border:1px solid #2a6;color:#cee;cursor:pointer;padding:5px 8px;border-radius:5px;font-size:11px;font-family:inherit}
        .bm-btn:hover{background:#1e5046}
        .bm-item{background:#11201c;border:1px solid #244;border-radius:6px;padding:8px 4px;cursor:pointer;text-align:center;font-size:10px;color:#bdd;transition:.1s}
        .bm-item:hover{border-color:#5fc;background:#1a3028;color:#fff}
        .bm-item.sel{border-color:#5fc;background:#1e4038}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;
    el.querySelector('#build-close').onclick = () => this.hide();
    el.querySelector('#build-grid').onclick = () => this._cycleGrid();
    el.querySelector('#build-undo').onclick = () => this._undo();
  }

  _renderCatalog() {
    const c = this._el.querySelector('#build-catalog');
    if (!c) return;
    c.innerHTML = '';
    if (!this._catalog.length) { c.innerHTML = '<div style="color:#566;grid-column:1/3">vazio — gere assets na Máquina</div>'; return; }
    for (const item of this._catalog) {
      const d = document.createElement('div');
      d.className = 'bm-item';
      d.textContent = (item.kind === 'generated' ? '✨ ' : '') + item.name;
      d.onclick = () => { this._selectTemplate(item); c.querySelectorAll('.bm-item').forEach(x => x.classList.remove('sel')); d.classList.add('sel'); };
      c.appendChild(d);
    }
  }

  _cycleGrid() {
    const steps = [0, 0.5, 1.0, 2.0];
    const i = steps.indexOf(this._grid);
    this._grid = steps[(i + 1) % steps.length];
    this._el.querySelector('#build-grid').textContent = 'Grid: ' + (this._grid || 'livre');
  }

  // ── Seleciona template e cria o ghost ────────────────────────────
  async _selectTemplate(item) {
    this._ghostSrc = item;
    this._disposeGhost();
    const url = item.glbUrl || item.path;
    if (!url) return;
    const enc = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const isBlob = url.startsWith('blob:');
    const lastSlash = url.lastIndexOf('/');
    const folder = isBlob ? '' : enc(url.substring(0, lastSlash + 1));
    const file = isBlob ? url : enc(url.substring(lastSlash + 1));
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
      const root = res.meshes[0];
      root.name = '_ghost_' + item.id;
      // material translúcido verde no ghost
      const gm = new BABYLON.StandardMaterial('ghostMat', this.scene);
      gm.diffuseColor = new BABYLON.Color3(0.3, 1, 0.5);
      gm.emissiveColor = new BABYLON.Color3(0.1, 0.5, 0.2);
      gm.alpha = 0.5; gm.disableLighting = true;
      res.meshes.forEach(m => { m.material = gm; m.isPickable = false; });
      this._ghost = root;
      this._ghostMeshes = res.meshes;
    } catch (e) { console.warn('[BuildMode] falha ao carregar ghost:', e.message); }
  }

  _disposeGhost() {
    if (this._ghostMeshes) { this._ghostMeshes.forEach(m => { try { m.dispose(); } catch (_) {} }); }
    this._ghost = null; this._ghostMeshes = null;
  }

  // ── Raycast do centro da tela pro chão ───────────────────────────
  _groundPoint() {
    const cam = this.scene.activeCamera;
    const ray = this.scene.createPickingRay(this.scene.getEngine().getRenderWidth()/2, this.scene.getEngine().getRenderHeight()/2, BABYLON.Matrix.Identity(), cam);
    const hit = this.scene.pickWithRay(ray, m => m.checkCollisions === true && m.isPickable !== false && !m.name.startsWith('_ghost'));
    return hit?.hit ? hit.pickedPoint : null;
  }

  // ── Coloca o objeto de verdade ───────────────────────────────────
  async _place(pos) {
    if (!this._ghostSrc) return;
    const item = this._ghostSrc;
    const url = item.glbUrl || item.path;
    const enc = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const isBlob = url.startsWith('blob:');
    const lastSlash = url.lastIndexOf('/');
    const folder = isBlob ? '' : enc(url.substring(0, lastSlash + 1));
    const file = isBlob ? url : enc(url.substring(lastSlash + 1));
    const res = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
    const root = res.meshes[0];
    const uid = `placed_${item.id}_${(this._placed.length)}_${Math.floor(pos.x)}_${Math.floor(pos.z)}`;
    root.name = uid;
    root.position.copyFrom(pos);
    root.rotation.y = this._rotY;
    res.meshes.forEach(m => { if (m !== root) m.isPickable = false; });
    this.level?.shadowGen?.addShadowCaster?.(root, true);
    const record = { id: item.id, name: uid, url, p: [pos.x, pos.y, pos.z], ry: this._rotY };
    this._placed.push({ record, root });
    this._save();
  }

  async _save() {
    try { await LocalDB.save('placed', this._placed.map(p => p.record)); } catch (_) {}
  }

  _undo() {
    const last = this._placed.pop();
    if (last) { try { last.root.dispose(); } catch (_) {} this._save(); }
  }

  show() {
    this._active = true;
    this._el.style.display = 'flex';
    window._gameInput?.deactivate?.();
  }
  hide() {
    this._active = false;
    this._el.style.display = 'none';
    this._disposeGhost();
    this._ghostSrc = null;
    window._gameInput?.activate?.();
  }
  toggle() { this._active ? this.hide() : this.show(); }

  // ── Update por frame ─────────────────────────────────────────────
  update() {
    // toggle com B
    const b = window._gameInput?.isDown('KeyB');
    if (b && !this._wasB) this.toggle();
    this._wasB = b;
    if (!this._active) return;

    // move o ghost pro chão sob o cursor
    if (this._ghost) {
      const gp = this._groundPoint();
      if (gp) {
        let x = gp.x, z = gp.z;
        if (this._grid > 0) { x = Math.round(x / this._grid) * this._grid; z = Math.round(z / this._grid) * this._grid; }
        this._ghost.position.set(x, gp.y, z);
        this._ghost.rotation.y = this._rotY;
      }
      // rotação [ ]
      if (window._gameInput?.isDown('BracketRight')) this._rotY += 0.04;
      if (window._gameInput?.isDown('BracketLeft'))  this._rotY -= 0.04;
    }

    // grid toggle (G) e undo (Delete)
    const g = window._gameInput?.isDown('KeyG');
    if (g && !this._wasG) this._cycleGrid();
    this._wasG = g;
    const del = window._gameInput?.isDown('Delete');
    if (del && !this._wasDel) this._undo();
    this._wasDel = del;
  }

  // chamado por clique (main.js roteia)
  onClick() {
    if (!this._active || !this._ghost) return false;
    const gp = this._ghost.position.clone();
    this._place(gp);
    return true;
  }
}
