// ─────────────────────────────────────────────────────────────────
//  BuildMode — modo construção estilo The Sims / V Rising / Minecraft
//
//  FLUXO:
//    B           → abre catálogo (cursor livre, sidebar)
//    Clica item  → entra em modo PLACING (pointer lock + overlay HUD)
//    No placing:
//      Mouse  — mira (ghost segue crosshair via raycast)
//      [ ]    — rotaciona Y ±15°
//      R / F  — sobe / desce ghost
//      = / -  — aumenta / diminui escala
//      LMB    — coloca o objeto
//      Tab    — volta ao catálogo (sem fechar o modo)
//      ESC    — cancela ghost / fecha catálogo
//    Del  — desfaz último objeto colocado
//    G    — cicla grid (0 / 0.5 / 1 / 2)
//
//  A "Máquina de Criação" é um item especial que ao ser colocado
//  spawna a AssetMachine com animação de deploy completa.
//
//  Salva tudo no LocalDB (coleção 'placed').
// ─────────────────────────────────────────────────────────────────
import { LocalDB }       from '../data/LocalDB.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

// Caminhos da Máquina de Criação (Phase 1 = forma compacta para o ghost)
const MACHINE_P1 = 'assets/itens 3d/Maquina de assets/Meshy_AI_Phase_1_Compact_Disc_0530011922_image-to-3d-texture.glb';

export class BuildMode {
  constructor(scene, player, level) {
    this.scene  = scene;
    this.player = player;
    this.level  = level;

    // ── Estado ─────────────────────────────────────────────────────
    // 'inactive' | 'catalog' | 'placing'
    this._state = 'inactive';

    // ── Ghost ──────────────────────────────────────────────────────
    this._ghost      = null;       // mesh root do ghost
    this._ghostMeshes = null;      // todos os meshes do ghost
    this._ghostSrc   = null;       // item selecionado { kind, id, name, path|glbUrl, special? }
    this._rotY       = 0;          // rotação acumulada
    this._heightOff  = 0;          // offset de altura manual
    this._scaleM     = 1.0;        // multiplicador de escala
    this._grid       = 1.0;        // snap de grid (0 = livre)

    // ── Objetos colocados ──────────────────────────────────────────
    this._placed = [];

    // ── Anti-repeat de teclas ──────────────────────────────────────
    this._keys = {};               // teclas monitoradas por borda
    window.addEventListener('keydown', e => { this._keys[e.code] = true;  });
    window.addEventListener('keyup',   e => { this._keys[e.code] = false; });
    this._prev = {};

    // ── Catálogo de itens ──────────────────────────────────────────
    this._catalog = [];

    this._buildUI();
    this._buildHUD();
    this._loadCatalog();
  }

  // ══════════════════════════════════════════════════════════════════
  //  UI: Sidebar de catálogo
  // ══════════════════════════════════════════════════════════════════
  _buildUI() {
    const el = document.createElement('div');
    el.id = 'build-panel';
    el.style.cssText = [
      'position:fixed','right:0','top:0','width:290px','height:100vh',
      'background:rgba(6,9,16,0.97)','border-left:2px solid #3a8',
      'color:#cde','font-family:Segoe UI,monospace','font-size:12px',
      'display:none','flex-direction:column','z-index:9100',
      'padding:12px','box-sizing:border-box','overflow-y:auto',
    ].join(';');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  border-bottom:1px solid #3a8;padding-bottom:8px;margin-bottom:8px">
        <b style="color:#5fc;font-size:14px;letter-spacing:1px">🔨 CONSTRUÇÃO</b>
        <div style="display:flex;gap:5px">
          <button id="build-grid" class="bm-btn">Grid: 1.0</button>
          <button id="build-close" class="bm-btn" style="background:#3a1a1a">✕</button>
        </div>
      </div>

      <div style="font-size:10px;color:#6a9;line-height:1.5;margin-bottom:8px">
        Clique num item → mira em 1ª pessoa para posicionar.<br>
        <b>[ ]</b> girar &nbsp;<b>R/F</b> altura &nbsp;<b>= /-</b> escala &nbsp;
        <b>LMB</b> colocar &nbsp;<b>Tab</b> catálogo &nbsp;<b>Del</b> desfazer
      </div>

      <div style="display:flex;gap:5px;margin-bottom:8px">
        <button id="build-undo" class="bm-btn" style="background:#3a1a1a;flex:1">↩ Desfazer (Del)</button>
      </div>

      <div style="color:#5fc;font-weight:bold;margin:4px 0 6px">📦 Catálogo</div>
      <div id="build-catalog" style="display:grid;grid-template-columns:1fr 1fr;gap:5px"></div>

      <style>
        .bm-btn{background:#163a32;border:1px solid #2a6;color:#cee;cursor:pointer;
                padding:5px 8px;border-radius:5px;font-size:11px;font-family:inherit}
        .bm-btn:hover{background:#1e5046}
        .bm-item{background:#11201c;border:1px solid #244;border-radius:6px;
                 padding:8px 4px;cursor:pointer;text-align:center;
                 font-size:10px;color:#bdd;transition:.1s}
        .bm-item:hover{border-color:#5fc;background:#1a3028;color:#fff}
        .bm-item.sel{border-color:#5fc;background:#1e4038}
        .bm-item.special{border-color:#b6f;background:#1a0e2e;color:#dce}
        .bm-item.special:hover{background:#2a1a40;border-color:#d9f}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#build-close').onclick = () => this.hide();
    el.querySelector('#build-grid').onclick  = () => this._cycleGrid();
    el.querySelector('#build-undo').onclick  = () => this._undo();
  }

  // ══════════════════════════════════════════════════════════════════
  //  UI: Overlay HUD de posicionamento (aparece quando ghost ativo)
  // ══════════════════════════════════════════════════════════════════
  _buildHUD() {
    const el = document.createElement('div');
    el.id = 'build-hud';
    el.style.cssText = [
      'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
      'background:rgba(6,9,16,0.90)','border:1px solid #3a8',
      'color:#cde','font-family:Segoe UI,monospace','font-size:12px',
      'padding:8px 20px','border-radius:10px','pointer-events:none',
      'display:none','z-index:9200','white-space:nowrap',
      'box-shadow:0 0 18px rgba(60,200,120,0.25)',
    ].join(';');
    el.innerHTML = `
      <span id="bh-item" style="color:#5fc;font-weight:bold"></span>
      &nbsp;|&nbsp;
      <b style="color:#aef">LMB</b> colocar &nbsp;
      <b style="color:#aef">[ ]</b> girar &nbsp;
      <b style="color:#aef">R/F</b> altura &nbsp;
      <b style="color:#aef">=/−</b> escala &nbsp;
      <b style="color:#aef">Tab</b> catálogo &nbsp;
      <b style="color:#fa6">Del</b> desfazer
    `;
    document.body.appendChild(el);
    this._hud = el;

    // Crosshair extra para sinalizar modo construção
    const ch = document.createElement('div');
    ch.id = 'build-crosshair';
    ch.style.cssText = [
      'position:fixed','left:50%','top:50%',
      'transform:translate(-50%,-50%)',
      'width:14px','height:14px',
      'border:2px solid #5fc','border-radius:50%',
      'pointer-events:none','display:none','z-index:9201',
      'box-shadow:0 0 6px #3a8',
    ].join(';');
    document.body.appendChild(ch);
    this._ch = ch;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Catálogo
  // ══════════════════════════════════════════════════════════════════
  async _loadCatalog() {
    const base = [];

    // ── Item especial: Máquina de Criação (sempre no topo) ──────────
    base.push({
      kind: 'special', id: 'assetMachine',
      name: '🤖 Máquina de Criação',
      path: MACHINE_P1,
      special: 'assetMachine',
    });

    // ── Props do AssetRegistry (item + nature) ──────────────────────
    for (const cat of ['item', 'nature']) {
      for (const id of AssetRegistry.ids(cat)) {
        base.push({ kind: 'registry', cat, id, name: id, path: AssetRegistry.path(cat, id) });
      }
    }

    // ── Assets gerados pelo Meshy ───────────────────────────────────
    let generated = [];
    try { generated = await LocalDB.get('generated_assets', []); } catch (_) {}
    this._catalog = [
      ...generated.map(g => ({ kind: 'generated', id: g.id, name: '✨ ' + g.name, glbUrl: g.glbUrl })),
      ...base,
    ];
    this._renderCatalog();
  }

  _renderCatalog() {
    const c = this._el.querySelector('#build-catalog');
    if (!c) return;
    c.innerHTML = '';
    if (!this._catalog.length) {
      c.innerHTML = '<div style="color:#566;grid-column:1/3">vazio — gere assets na Máquina</div>';
      return;
    }
    for (const item of this._catalog) {
      const d = document.createElement('div');
      d.className = 'bm-item' + (item.kind === 'special' ? ' special' : '');
      d.textContent = item.name;
      d.title = item.name;
      d.onclick = () => {
        c.querySelectorAll('.bm-item').forEach(x => x.classList.remove('sel'));
        d.classList.add('sel');
        this._selectItem(item);
      };
      c.appendChild(d);
    }
  }

  // ── Cicla tamanhos de grid ─────────────────────────────────────────
  _cycleGrid() {
    const steps = [0, 0.5, 1.0, 2.0];
    const i = steps.indexOf(this._grid);
    this._grid = steps[(i + 1) % steps.length];
    const btn = this._el.querySelector('#build-grid');
    if (btn) btn.textContent = 'Grid: ' + (this._grid || 'livre');
  }

  // ══════════════════════════════════════════════════════════════════
  //  Ghost — criar / destruir
  // ══════════════════════════════════════════════════════════════════
  async _selectItem(item) {
    this._ghostSrc  = item;
    this._heightOff = 0;
    this._scaleM    = 1.0;
    this._rotY      = 0;
    this._disposeGhost();

    const url      = item.glbUrl || item.path;
    const isBlob   = url.startsWith('blob:');
    const enc      = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const lastSlash = url.lastIndexOf('/');
    const folder   = isBlob ? '' : enc(url.substring(0, lastSlash + 1));
    const file     = isBlob ? url : encodeURIComponent(url.substring(lastSlash + 1));

    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
      const root = res.meshes[0];
      root.name  = '_ghost_' + item.id;

      // Material translúcido verde para o ghost
      const gm = new BABYLON.StandardMaterial('_ghostMat', this.scene);
      gm.diffuseColor  = new BABYLON.Color3(0.3, 1.0, 0.5);
      gm.emissiveColor = new BABYLON.Color3(0.1, 0.45, 0.2);
      gm.alpha         = 0.50;
      gm.disableLighting = true;
      gm.wireframe     = false;
      res.meshes.forEach(m => { m.material = gm; m.isPickable = false; });

      this._ghost      = root;
      this._ghostMeshes = res.meshes;

      // Entra em modo PLACING
      this._enterPlacing();
    } catch (e) {
      console.warn('[BuildMode] ghost falhou:', e.message);
    }
  }

  _disposeGhost() {
    if (this._ghostMeshes) {
      this._ghostMeshes.forEach(m => { try { m.dispose(); } catch (_) {} });
    }
    this._ghost = null;
    this._ghostMeshes = null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Transições de estado
  // ══════════════════════════════════════════════════════════════════
  _enterCatalog() {
    this._state = 'catalog';
    this._el.style.display = 'flex';
    this._hud.style.display = 'none';
    this._ch.style.display  = 'none';
    this._disposeGhost();
    window._gameInput?.deactivate?.();   // cursor livre para clicar no catálogo
  }

  _enterPlacing() {
    this._state = 'placing';
    this._el.style.display  = 'none';    // esconde sidebar
    this._hud.style.display = 'block';
    this._ch.style.display  = 'block';
    const name = this._hud.querySelector('#bh-item');
    if (name) name.textContent = this._ghostSrc?.name ?? '';

    // Salva o onDeactivated original e substitui:
    // ESC libera pointer lock → em vez de entrar no engine mode, volta ao catálogo
    const inp = window._gameInput;
    if (inp) {
      this._savedOnDeactivated = inp.onDeactivated;
      inp.onDeactivated = () => this._leavePlacing();
    }
    inp?.activate?.();   // re-lock pointer para mirar em 1ª pessoa
  }

  _leavePlacing() {
    this._disposeGhost();
    this._state = 'catalog';
    this._el.style.display  = 'flex';
    this._hud.style.display = 'none';
    this._ch.style.display  = 'none';

    // Restaura onDeactivated original antes de liberar o pointer lock
    const inp = window._gameInput;
    if (inp && this._savedOnDeactivated !== undefined) {
      inp.onDeactivated = this._savedOnDeactivated;
      this._savedOnDeactivated = undefined;
    }
    inp?.deactivate?.();
  }

  show() {
    if (this._state === 'inactive') this._enterCatalog();
  }
  hide() {
    this._disposeGhost();
    this._state = 'inactive';
    this._el.style.display  = 'none';
    this._hud.style.display = 'none';
    this._ch.style.display  = 'none';
    this._ghostSrc = null;
    window._gameInput?.activate?.();
  }
  toggle() {
    if (this._state === 'inactive') this.show();
    else                            this.hide();
  }

  // ══════════════════════════════════════════════════════════════════
  //  Helpers de posicionamento
  // ══════════════════════════════════════════════════════════════════

  /** Raycast do centro da tela para qualquer superfície sólida */
  _groundPoint() {
    const eng = this.scene.getEngine();
    const ray = this.scene.createPickingRay(
      eng.getRenderWidth() / 2,
      eng.getRenderHeight() / 2,
      BABYLON.Matrix.Identity(),
      this.scene.activeCamera,
    );
    const hit = this.scene.pickWithRay(
      ray,
      m => m.checkCollisions === true && m.isPickable !== false && !m.name.startsWith('_ghost'),
    );
    return hit?.hit ? hit.pickedPoint : null;
  }

  _edge(code) {
    const now  = !!this._keys[code];
    const prev = !!this._prev[code];
    this._prev[code] = now;
    return now && !prev;
  }
  _held(code) { return !!this._keys[code]; }

  // ══════════════════════════════════════════════════════════════════
  //  Update — chamado todo frame
  // ══════════════════════════════════════════════════════════════════
  update() {
    // ── Toggle B ────────────────────────────────────────────────────
    if (this._edge('KeyB')) {
      this.toggle();
    }

    if (this._state === 'inactive') return;

    // ── Del: desfazer ────────────────────────────────────────────────
    if (this._edge('Delete')) this._undo();

    // ── G: cicla grid ─────────────────────────────────────────────────
    if (this._edge('KeyG')) this._cycleGrid();

    if (this._state === 'catalog') {
      // Nada extra no catálogo — interação via mouse no DOM
      return;
    }

    // ─────────────────────────────────────────────────────────────────
    //  Estado: PLACING
    // ─────────────────────────────────────────────────────────────────
    if (!this._ghost) return;

    // ── Tab: volta ao catálogo ─────────────────────────────────────
    if (this._edge('Tab')) { this._leavePlacing(); return; }

    // ── ESC: cancela ghost ─────────────────────────────────────────
    if (this._edge('Escape')) { this._leavePlacing(); return; }

    // ── Rotação [ / ] — suave ao segurar, snap de 15° no toque ───────
    const SNAP = Math.PI / 12;  // 15°
    const rR = this._edge('BracketRight');
    const rL = this._edge('BracketLeft');
    if (this._held('BracketRight')) this._rotY += 0.03;
    if (this._held('BracketLeft'))  this._rotY -= 0.03;
    if (rR) this._rotY = Math.round(this._rotY / SNAP) * SNAP;
    if (rL) this._rotY = Math.round(this._rotY / SNAP) * SNAP;

    // ── Altura R (sobe) / F (desce) ───────────────────────────────
    const HEIGHT_SPD = 0.06;
    if (this._held('KeyR')) this._heightOff += HEIGHT_SPD;
    if (this._held('KeyF')) this._heightOff  = Math.max(-0.5, this._heightOff - HEIGHT_SPD);

    // ── Escala = (cresce) / - (diminui) ──────────────────────────
    const SCALE_SPD = 0.01;
    if (this._held('Equal'))  this._scaleM = Math.min(5.0, this._scaleM + SCALE_SPD);
    if (this._held('Minus'))  this._scaleM = Math.max(0.1, this._scaleM - SCALE_SPD);

    // ── Move ghost para o ponto sob o crosshair ────────────────────
    const gp = this._groundPoint();
    if (gp) {
      let x = gp.x, z = gp.z;
      if (this._grid > 0) {
        x = Math.round(x / this._grid) * this._grid;
        z = Math.round(z / this._grid) * this._grid;
      }
      this._ghost.position.set(x, gp.y + this._heightOff, z);
      this._ghost.rotation.y = this._rotY;
      this._ghost.scaling.setAll(this._scaleM);
    }

    // ── LMB coloca o objeto ────────────────────────────────────────
    // (clique é rotado pelo main.js → onClick())
  }

  // ── Chamado por clique no canvas (main.js) ─────────────────────────
  onClick() {
    if (this._state !== 'placing' || !this._ghost) return false;
    const pos   = this._ghost.position.clone();
    const rotY  = this._rotY;
    const scale = this._scaleM;
    this._placeAt(pos, rotY, scale);
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Colocar objeto no mundo
  // ══════════════════════════════════════════════════════════════════
  async _placeAt(pos, rotY, scale) {
    const item = this._ghostSrc;
    if (!item) return;

    // ── Item especial: Máquina de Criação ───────────────────────────
    if (item.special === 'assetMachine') {
      const { AssetMachine } = await import('../items/AssetMachine.js');
      new AssetMachine(
        this.scene,
        window._meshyPanel,
        window._gamePlayer,
        window._gameInput,
        pos,
      );
      this._placed.push({ record: { id: 'assetMachine', p: [pos.x, pos.y, pos.z] }, root: null });
      this._save();
      return;
    }

    // ── Item normal: GLB ─────────────────────────────────────────────
    const url      = item.glbUrl || item.path;
    const enc      = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const isBlob   = url.startsWith('blob:');
    const lastSlash = url.lastIndexOf('/');
    const folder   = isBlob ? '' : enc(url.substring(0, lastSlash + 1));
    const file     = isBlob ? url : encodeURIComponent(url.substring(lastSlash + 1));

    try {
      const res  = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
      const root = res.meshes[0];
      const uid  = `placed_${item.id}_${this._placed.length}_${Math.floor(pos.x)}_${Math.floor(pos.z)}`;
      root.name  = uid;
      root.position.copyFrom(pos);
      root.rotation.y = rotY;
      root.scaling.setAll(scale);
      res.meshes.forEach(m => { if (m !== root) m.isPickable = false; });
      this.level?.shadowGen?.addShadowCaster?.(root, true);
      const record = { id: item.id, name: uid, url, p: [pos.x, pos.y, pos.z], ry: rotY, sc: scale };
      this._placed.push({ record, root });
      this._save();
    } catch (e) {
      console.warn('[BuildMode] falha ao colocar:', e.message);
    }
  }

  async _save() {
    try { await LocalDB.save('placed', this._placed.map(p => p.record)); } catch (_) {}
  }

  _undo() {
    const last = this._placed.pop();
    if (!last) return;
    try { last.root?.dispose(); } catch (_) {}
    this._save();
  }

  // ── Adiciona item ao catálogo (chamado pelo MeshyPanel ao salvar) ───
  addToCatalog(item) {
    this._catalog.unshift(item);
    this._renderCatalog();
  }
}
