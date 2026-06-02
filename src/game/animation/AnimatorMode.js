// ─────────────────────────────────────────────────────────────────
//  X-GLB-3D — Visualizador/Editor de GLB integrado ao TransFPS
//
//  Reescrita do antigo AnimatorMode com layout/feel do app standalone
//  X-GLB-3D-v2: 3 colunas (Library+Animations | Viewport | Inspector
//  +Transform+Hitbox+Stats), topbar, bottom dock, cheatsheet, cinema
//  mode. Sem backend Python — features de save/diagnose desativadas.
//
//  Mantém o mesmo nome de classe (AnimatorMode) e a API pública
//  (enter/exit/render + window.openAnimator/closeAnimator) — main.js
//  e index.html não precisam mudar.
// ─────────────────────────────────────────────────────────────────
import { ASSET_PATHS } from '../../AssetLoader.js';
import { MOVESETS } from './animationNames.js';
import { AnimationLibrary } from './AnimationLibrary.js';
import { EnemyCatalog } from '../data/EnemyCatalog.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

function _encPath(p) { return p ? p.split('/').map(s => encodeURIComponent(s)).join('/') : p; }

const STYLE = `
  /* X-GLB-3D — Design Cyberpunk */
  #xglb-shell {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; flex-direction: column;
    background: #05070D;
    color: #E8ECF5;
    font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 13px;
    --bg: #05070D; --bg-2: #0A0D17; --bg-3: #0E1320;
    --panel: rgba(14, 19, 32, 0.78); --panel-2: rgba(20, 26, 42, 0.86);
    --border: rgba(255, 255, 255, 0.06);
    --border-2: rgba(0, 242, 255, 0.18);
    --border-3: rgba(0, 242, 255, 0.35);
    --text: #E8ECF5; --text-2: rgba(232, 236, 245, 0.62); --text-3: rgba(232, 236, 245, 0.38);
    --cyan: #00F2FF; --cyan-soft: rgba(0, 242, 255, 0.12);
    --purple: #A855F7; --green: #00FF94; --yellow: #FFC857; --red: #FF5A6A;
    --glow-cyan: 0 0 18px rgba(0, 242, 255, 0.30);
    --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.55);
  }
  #xglb-shell::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(1200px 600px at 50% -20%, rgba(0,242,255,0.05), transparent 60%),
      radial-gradient(900px 500px at 110% 110%, rgba(168,85,247,0.06), transparent 60%);
  }

  /* Topbar */
  #xglb-topbar {
    flex: 0 0 56px; display: flex; align-items: center; gap: 12px;
    padding: 0 18px; background: linear-gradient(180deg, rgba(10,13,23,0.95), rgba(10,13,23,0.80));
    border-bottom: 1px solid var(--border-2); position: relative; z-index: 2;
  }
  #xglb-topbar .logo {
    font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 18px; letter-spacing: 3px;
    color: var(--cyan); text-shadow: var(--glow-cyan); user-select: none;
  }
  #xglb-topbar .sep { width: 1px; height: 26px; background: var(--border-2); }
  #xglb-topbar .label { font-size: 9.5px; font-weight: 800; letter-spacing: 1.8px; color: var(--text-2); text-transform: uppercase; }
  #xglb-topbar button {
    background: var(--panel); border: 1px solid var(--border-2); color: var(--text);
    padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer;
    transition: 0.15s; display: inline-flex; align-items: center; gap: 6px;
  }
  #xglb-topbar button:hover { border-color: var(--border-3); background: var(--cyan-soft); color: var(--cyan); }
  #xglb-topbar button.active { background: var(--cyan-soft); color: var(--cyan); border-color: var(--border-3); }
  #xglb-topbar .spacer { flex: 1; }
  #xglb-topbar .close {
    background: transparent; border: 1px solid rgba(255,90,106,0.30); color: var(--red);
  }
  #xglb-topbar .close:hover { background: rgba(255,90,106,0.10); color: var(--red); }

  /* Body row */
  #xglb-body { flex: 1; display: flex; gap: 10px; padding: 10px; min-height: 0; position: relative; z-index: 1; }
  .xglb-col {
    background: var(--panel); border: 1px solid var(--border-2); border-radius: 14px;
    display: flex; flex-direction: column; min-height: 0; backdrop-filter: blur(10px);
  }
  #xglb-left  { flex: 0 0 320px; }
  #xglb-stage { flex: 1; padding: 0; overflow: hidden; position: relative; }
  #xglb-right { flex: 0 0 360px; }

  #xglb-canvas { width: 100%; height: 100%; display: block; outline: none; }

  /* Bottom dock (sobre o viewport) */
  #xglb-dock {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 10px; align-items: center;
    background: rgba(10,13,23,0.82); border: 1px solid var(--border-2); border-radius: 12px;
    padding: 8px 14px; backdrop-filter: blur(8px);
  }
  #xglb-dock .btn-primary {
    background: linear-gradient(135deg, var(--cyan), #0ABDC6); color: #001317;
    border: none; padding: 8px 18px; border-radius: 8px;
    font-weight: 800; letter-spacing: 1px; cursor: pointer; font-size: 12px;
    box-shadow: var(--glow-cyan);
  }
  #xglb-dock .btn-primary:hover { filter: brightness(1.1); }
  #xglb-dock .hint { font-size: 10px; color: var(--text-3); font-family: 'JetBrains Mono', monospace; }

  /* Section / panel-card */
  .xglb-section {
    border-bottom: 1px solid var(--border); display: flex; flex-direction: column;
    flex: 0 0 auto;
  }
  .xglb-section.flex { flex: 1 1 auto; min-height: 0; }
  .xglb-section-header {
    padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;
    background: rgba(0,0,0,0.18); cursor: pointer; user-select: none;
  }
  .xglb-section-header h3 {
    font-family: 'Orbitron', sans-serif; font-size: 10.5px; font-weight: 800; letter-spacing: 2px;
    color: var(--cyan); margin: 0; text-transform: uppercase;
  }
  .xglb-section-header .count { font-size: 10px; color: var(--text-3); font-weight: 600; }
  .xglb-section-header .toggle { font-size: 12px; color: var(--text-3); transition: 0.15s; }
  .xglb-section.collapsed .xglb-section-body { display: none; }
  .xglb-section.collapsed .toggle { transform: rotate(-90deg); }
  .xglb-section-body { padding: 10px 12px; overflow-y: auto; }
  .xglb-section.flex .xglb-section-body { flex: 1; min-height: 0; }

  /* Library grid */
  .xglb-lib-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .xglb-lib-btn {
    background: var(--bg-3); border: 1px solid var(--border); color: var(--text);
    padding: 8px 10px; border-radius: 8px; font-size: 11px; cursor: pointer;
    transition: 0.12s; text-align: left; display: flex; align-items: center; gap: 6px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .xglb-lib-btn:hover { border-color: var(--border-3); background: var(--cyan-soft); color: var(--cyan); }
  .xglb-lib-btn.active { background: var(--cyan-soft); border-color: var(--border-3); color: var(--cyan); }
  .xglb-lib-tier { font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .xglb-tier-player    { background: rgba(0,242,255,0.20); color: var(--cyan); }
  .xglb-tier-rookie    { background: rgba(0,255,148,0.20); color: var(--green); }
  .xglb-tier-champion  { background: rgba(85,153,255,0.20); color: #5599ff; }
  .xglb-tier-ultimate  { background: rgba(168,85,247,0.20); color: var(--purple); }
  .xglb-tier-mega      { background: rgba(255,153,68,0.20); color: var(--yellow); }
  .xglb-tier-boss      { background: rgba(255,90,106,0.20); color: var(--red); }
  .xglb-tier-chibata   { background: rgba(212,77,46,0.25); color: #ff7a52; }

  .xglb-lib-search {
    width: 100%; padding: 6px 8px; background: var(--bg-3); border: 1px solid var(--border);
    color: var(--text); border-radius: 6px; font-size: 11px; margin-bottom: 8px;
  }
  .xglb-lib-search:focus { outline: none; border-color: var(--border-3); }

  /* Animation list */
  .xglb-cat-header {
    background: rgba(0,0,0,0.25); padding: 8px 10px; margin-bottom: 2px;
    border-radius: 6px; font-size: 11px; font-weight: 700; color: var(--cyan);
    display: flex; justify-content: space-between; align-items: center; cursor: pointer;
    border: 1px solid var(--border); margin-top: 6px;
  }
  .xglb-cat-header:hover { background: var(--cyan-soft); }
  .xglb-cat-header .cat-count { color: var(--text-3); font-size: 10px; font-weight: 600; }
  .xglb-cat-body { padding: 4px 0 8px 8px; display: flex; flex-direction: column; gap: 1px; }
  .xglb-anim-btn {
    background: transparent; border: none; color: var(--text-2); padding: 5px 10px 5px 14px;
    cursor: pointer; text-align: left; font-size: 11.5px; border-left: 2px solid transparent;
    transition: 0.1s; border-radius: 0 4px 4px 0;
  }
  .xglb-anim-btn:hover { color: var(--cyan); border-left-color: var(--border-3); background: var(--cyan-soft); }
  .xglb-anim-btn.playing { color: var(--cyan); border-left-color: var(--cyan); background: var(--cyan-soft); font-weight: 600; }

  /* Inspector key/value rows */
  .xglb-kv { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 11px; }
  .xglb-kv .k { color: var(--text-3); }
  .xglb-kv .v { color: var(--text); font-family: 'JetBrains Mono', monospace; }

  /* Slider rows */
  .xglb-slider { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .xglb-slider label { font-size: 10px; color: var(--text-2); width: 28px; }
  .xglb-slider input[type=range] { flex: 1; }
  .xglb-slider input[type=number] {
    width: 56px; background: var(--bg-3); border: 1px solid var(--border);
    color: var(--text); padding: 3px 6px; border-radius: 4px; font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Animation controls (sticky bar) */
  .xglb-anim-controls {
    display: flex; gap: 6px; padding: 8px 10px; background: var(--bg-3);
    border-radius: 6px; margin-bottom: 8px;
  }
  .xglb-anim-controls button {
    background: var(--bg-2); border: 1px solid var(--border); color: var(--text);
    padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer;
  }
  .xglb-anim-controls button:hover { border-color: var(--border-3); color: var(--cyan); }
  .xglb-anim-controls button.active { background: var(--cyan-soft); color: var(--cyan); border-color: var(--border-3); }
  .xglb-anim-controls input[type=range] { flex: 1; }

  /* Cheatsheet */
  #xglb-cheatsheet {
    position: absolute; top: 70px; right: 380px; z-index: 5;
    background: var(--panel-2); border: 1px solid var(--border-2); border-radius: 12px;
    padding: 14px 18px; box-shadow: var(--shadow-lg); min-width: 280px;
    backdrop-filter: blur(12px);
  }
  #xglb-cheatsheet h4 {
    font-family: 'Orbitron'; font-size: 11px; letter-spacing: 2px; color: var(--cyan);
    margin: 0 0 10px; text-transform: uppercase;
  }
  #xglb-cheatsheet table { width: 100%; font-size: 11px; }
  #xglb-cheatsheet td { padding: 3px 0; }
  #xglb-cheatsheet td:first-child {
    color: var(--yellow); font-family: 'JetBrains Mono', monospace;
    font-weight: 700; min-width: 80px;
  }
  #xglb-cheatsheet td:last-child { color: var(--text-2); }

  /* Toast */
  #xglb-toast {
    position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
    background: var(--panel-2); border: 1px solid var(--border-3); color: var(--cyan);
    padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
    box-shadow: var(--glow-cyan); opacity: 0; transition: opacity 0.2s;
    pointer-events: none; z-index: 6;
  }
  #xglb-toast.show { opacity: 1; }

  /* Scrollbar */
  #xglb-shell *::-webkit-scrollbar { width: 6px; height: 6px; }
  #xglb-shell *::-webkit-scrollbar-track { background: transparent; }
  #xglb-shell *::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 4px; }
  #xglb-shell *::-webkit-scrollbar-thumb:hover { background: var(--border-3); }
`;

const TIER_INFO = {
  player:   { label: 'PLAYER',   cls: 'xglb-tier-player' },
  rookie:   { label: 'ROOKIE',   cls: 'xglb-tier-rookie' },
  champion: { label: 'CHAMP',    cls: 'xglb-tier-champion' },
  ultimate: { label: 'ULT',      cls: 'xglb-tier-ultimate' },
  mega:     { label: 'MEGA',     cls: 'xglb-tier-mega' },
  boss:     { label: 'BOSS',     cls: 'xglb-tier-boss' },
  chibata:  { label: 'CHIBATA',  cls: 'xglb-tier-chibata' },
};

export class AnimatorMode {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;
    this.parentCanvas = canvas; // canvas original do jogo
    this.ownCanvas = null;
    this.scene = null;
    this.active = false;
    this.camera = null;
    this.currentModel = null;
    this.currentModelLabel = null;
    this.currentModelMeta = null;  // { meshes, bones, animations, height }
    this.animLib = null;
    this._currentCategoryAnims = {};
    this._currentAnim = null;
    this._loopAnim = true;
    this._speed = 1.0;
    this._uiContainer = null;
    this._bonesVisible = false;
    this._gridVisible = true;
    this._bgLight = false;
    this._cheatVisible = false;
  }

  async enter() {
    this.active = true;
    this._buildShell();
    this._setupScene();
    await this._loadDefault();
  }

  _buildShell() {
    // Injeta style único
    if (!document.getElementById('xglb-style')) {
      const s = document.createElement('style');
      s.id = 'xglb-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }

    const shell = document.createElement('div');
    shell.id = 'xglb-shell';
    shell.innerHTML = `
      <header id="xglb-topbar">
        <span class="logo">X-GLB-3D</span>
        <span class="sep"></span>
        <span class="label">View</span>
        <button data-act="reframe" title="F — Recentralizar câmera">⛶ Reframe</button>
        <button data-act="turn-l" title="Girar modelo -90°">↺ -90°</button>
        <button data-act="turn-r" title="Girar modelo +90°">↻ +90°</button>
        <span class="sep"></span>
        <span class="label">Scene</span>
        <button data-act="bg" title="Background light/dark">🌗 BG</button>
        <button data-act="grid" class="active" title="Toggle grid">⊞ Grid</button>
        <button data-act="bones" title="Toggle bones overlay">🦴 Bones</button>
        <span class="sep"></span>
        <button data-act="cheatsheet" title="? — Atalhos">? Help</button>
        <span class="spacer"></span>
        <span id="xglb-current" style="color: var(--text-2); font-size: 12px; font-family: 'JetBrains Mono', monospace;"></span>
        <span class="spacer"></span>
        <button class="close" data-act="close" title="Esc — Fechar">✕ Sair</button>
      </header>

      <div id="xglb-body">
        <aside id="xglb-left" class="xglb-col">
          <section class="xglb-section" data-section="library">
            <header class="xglb-section-header">
              <h3>📚 Library</h3>
              <span class="toggle">▾</span>
            </header>
            <div class="xglb-section-body" style="max-height: 280px;">
              <input class="xglb-lib-search" id="xglb-search" placeholder="🔎 buscar..." />
              <div id="xglb-lib-list" class="xglb-lib-grid"></div>
            </div>
          </section>

          <section class="xglb-section flex" data-section="animations">
            <header class="xglb-section-header">
              <h3>🎬 Animations</h3>
              <span class="count" id="xglb-anim-count">0</span>
            </header>
            <div class="xglb-section-body">
              <div class="xglb-anim-controls">
                <button data-act="anim-play" title="Space — Play/Pause">▶</button>
                <button data-act="anim-stop" title="Stop">■</button>
                <button data-act="anim-loop" class="active" title="Loop">↻</button>
                <input type="range" min="0.25" max="2.5" step="0.05" value="1" data-act="anim-speed" title="Speed" />
                <span id="xglb-speed-val" style="font-size:10px; color:var(--text-3); min-width:32px; text-align:right;">1.0x</span>
              </div>
              <div id="xglb-anim-list"></div>
            </div>
          </section>
        </aside>

        <main id="xglb-stage" class="xglb-col">
          <canvas id="xglb-canvas" tabindex="0"></canvas>
          <div id="xglb-dock">
            <span class="hint">[WASD] mover · [Mouse] orbitar · [Space] play/pause · [F] reframe · [?] atalhos</span>
          </div>
          <div id="xglb-toast"></div>
        </main>

        <aside id="xglb-right" class="xglb-col" style="overflow-y: auto;">
          <section class="xglb-section" data-section="inspector">
            <header class="xglb-section-header">
              <h3>🔍 Inspector</h3>
              <span class="toggle">▾</span>
            </header>
            <div class="xglb-section-body" id="xglb-inspector"></div>
          </section>

          <section class="xglb-section" data-section="transform">
            <header class="xglb-section-header">
              <h3>⚙ Transform</h3>
              <span class="toggle">▾</span>
            </header>
            <div class="xglb-section-body" id="xglb-transform"></div>
          </section>

          <section class="xglb-section" data-section="hitbox">
            <header class="xglb-section-header">
              <h3>🎯 Hitbox</h3>
              <span class="toggle">▾</span>
            </header>
            <div class="xglb-section-body" id="xglb-hitbox"></div>
          </section>

          <section class="xglb-section" data-section="stats">
            <header class="xglb-section-header">
              <h3>📊 Stats</h3>
              <span class="toggle">▾</span>
            </header>
            <div class="xglb-section-body" id="xglb-stats"></div>
          </section>
        </aside>
      </div>
    `;

    document.body.appendChild(shell);
    this._uiContainer = shell;

    // Em vez de criar um canvas próprio (engine já bind'd no original),
    // ESCONDEMOS nosso #xglb-canvas e mostramos o canvas do jogo POSICIONADO
    // dentro do #xglb-stage. Quando exit(), restauramos posição original.
    this.ownCanvas = shell.querySelector('#xglb-canvas');
    this.ownCanvas.style.display = 'none';

    const stage = shell.querySelector('#xglb-stage');
    this._savedCanvasParent = this.parentCanvas.parentElement;
    this._savedCanvasStyle = this.parentCanvas.getAttribute('style') || '';
    stage.insertBefore(this.parentCanvas, stage.firstChild);
    this.parentCanvas.style.cssText = `
      position: absolute; inset: 0; width: 100% !important; height: 100% !important;
      display: block; z-index: 0; border-radius: 14px;
    `;
    this.canvas = this.parentCanvas;
    setTimeout(() => this.engine.resize(), 16);

    // Wire eventos
    shell.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', (e) => this._onAction(el.getAttribute('data-act'), e));
      el.addEventListener('change', (e) => this._onAction(el.getAttribute('data-act'), e));
      el.addEventListener('input',  (e) => this._onAction(el.getAttribute('data-act'), e));
    });
    shell.querySelectorAll('.xglb-section-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
    shell.querySelector('#xglb-search').addEventListener('input', (e) => this._filterLibrary(e.target.value));

    // Atalhos teclado
    this._keyHandler = (e) => this._onKey(e);
    window.addEventListener('keydown', this._keyHandler);

    this._buildLibrary();
    this._buildInspector(null);
    this._buildTransform();
    this._buildHitbox();
    this._buildStats(null);
  }

  _setupScene() {
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.06, 1);

    this.camera = new BABYLON.ArcRotateCamera("xglb-cam",
      -Math.PI / 2, Math.PI / 2.4, 3.2,
      BABYLON.Vector3.Up().scale(0.9), this.scene);
    this.camera.wheelPrecision = 80;
    this.camera.lowerRadiusLimit = 0.5;
    this.camera.upperRadiusLimit = 25;
    this.camera.attachControl(this.canvas, true);

    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.0;
    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), this.scene);
    dir.intensity = 0.9;

    // Grid
    this.grid = BABYLON.MeshBuilder.CreateGround("xglb-grid", { width: 20, height: 20, subdivisions: 20 }, this.scene);
    const gridMat = new BABYLON.StandardMaterial("xglb-gridmat", this.scene);
    gridMat.diffuseColor = new BABYLON.Color3(0.06, 0.10, 0.15);
    gridMat.specularColor = BABYLON.Color3.Black();
    gridMat.wireframe = true;
    gridMat.emissiveColor = new BABYLON.Color3(0.0, 0.20, 0.25);
    this.grid.material = gridMat;
    this.grid.isPickable = false;

    this.animLib = new AnimationLibrary(this.scene);
  }

  _buildLibrary() {
    const list = this._uiContainer.querySelector('#xglb-lib-list');
    list.innerHTML = '';

    const entries = [];
    const playerPath = ASSET_PATHS.playerUnarmed;
    if (playerPath) entries.push({ label: 'Player', tier: 'player', path: playerPath, isPlayer: true });

    for (const [id, def] of Object.entries(EnemyCatalog)) {
      const raw = AssetRegistry.path(def.category, def.asset);
      if (!raw) continue;
      entries.push({
        label: def.name,
        tier: def.tier || 'rookie',
        path: _encPath(raw),
        isPlayer: false,
      });
    }
    this._libEntries = entries;
    this._renderLibrary(entries);
  }

  _renderLibrary(entries) {
    const list = this._uiContainer.querySelector('#xglb-lib-list');
    list.innerHTML = '';
    entries.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'xglb-lib-btn';
      const tier = TIER_INFO[item.tier] || TIER_INFO.rookie;
      btn.innerHTML = `<span class="xglb-lib-tier ${tier.cls}">${tier.label}</span> ${item.label}`;
      btn.title = item.label;
      btn.onclick = () => this.loadModel(item.path, item.label, item.isPlayer);
      list.appendChild(btn);
    });
    this._uiContainer.querySelector('#xglb-anim-count').textContent = `(${entries.length})`;
  }

  _filterLibrary(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return this._renderLibrary(this._libEntries);
    this._renderLibrary(this._libEntries.filter(e => e.label.toLowerCase().includes(q)));
  }

  async _loadDefault() {
    if (ASSET_PATHS.playerUnarmed) {
      await this.loadModel(ASSET_PATHS.playerUnarmed, 'Player', true);
    }
  }

  async loadModel(url, name, isPlayer) {
    if (this.currentModel) {
      try { this.currentModel.dispose(false, true); } catch (_) {}
      this.currentModel = null;
    }
    // Reset animLib pra nova carga
    if (this.animLib) {
      this.animLib.animations.forEach(ag => ag.dispose());
      this.animLib.animations.clear();
    }

    this.currentModelLabel = name;
    this._currentCategoryAnims = {};
    this._currentAnim = null;

    const animList = this._uiContainer.querySelector('#xglb-anim-list');
    animList.innerHTML = '<div style="color:var(--text-3); padding: 20px; text-align:center; font-size:11px;">⏳ Carregando…</div>';
    this._uiContainer.querySelector('#xglb-current').textContent = `▸ ${name}`;

    try {
      const lastSlash = url.lastIndexOf('/');
      const folder = url.substring(0, lastSlash + 1);
      const file = url.substring(lastSlash + 1);
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", folder, file, this.scene);
      this.currentModel = result.meshes[0];
      this.currentModel.position.y = 0;

      // Auto-frame
      const bb = this.currentModel.getHierarchyBoundingVectors(true);
      const size = bb.max.subtract(bb.min);
      const h = size.y || 1;
      const r = Math.max(2.5, h * 2.2);
      this.camera.radius = r;
      this.camera.setTarget(new BABYLON.Vector3(0, h * 0.5, 0));

      // Carrega animações
      if (isPlayer) {
        // Player: MOVESETS categorizado
        for (const [catName, anims] of Object.entries(MOVESETS)) {
          if (!this._currentCategoryAnims[catName]) this._currentCategoryAnims[catName] = {};
          for (const [animName, animPath] of Object.entries(anims)) {
            if (typeof animPath !== 'string') continue;
            try {
              await this.animLib.loadExternalAnimations(animPath, animName, this.currentModel);
            } catch (e) {
              console.warn(`[X-GLB-3D] falha "${animName}":`, e.message);
              continue;
            }
            if (!this._currentCategoryAnims[catName]) this._currentCategoryAnims[catName] = {};
            const ag = this.animLib.get(animName);
            if (ag) this._currentCategoryAnims[catName][animName] = ag;
          }
        }
      } else {
        // Mob/Player não-biped: lê anims que vieram no próprio GLB
        this._currentCategoryAnims['Internal'] = {};
        this.scene.animationGroups.forEach(ag => {
          if (!this.animLib.animations.has(ag.name)) {
            this.animLib.animations.set(ag.name, ag);
            ag.stop();
          }
          this._currentCategoryAnims['Internal'][ag.name] = ag;
        });
      }

      this._renderAnimList();
      this._buildInspector({
        name,
        meshes: this._countMeshes(),
        bones: this._countBones(),
        animations: this._countAnims(),
        height: h.toFixed(2),
        size: `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`,
      });
      this._buildStats({ vertices: this._countVerts() });
      this._buildHitbox();

      // Toca idle por padrão se existir
      const idle = this.animLib.get('idle') || this.animLib.get('Idle');
      if (idle) this._playAnim('idle', idle);

      this._toast(`✓ ${name} carregado`);
      console.log(`[X-GLB-3D] ✅ ${name} (anims: ${this._countAnims()})`);
    } catch (err) {
      console.error("[X-GLB-3D] erro:", err);
      animList.innerHTML = `<div style="color:var(--red); padding: 20px; font-size:11px;">❌ ${err.message}</div>`;
      this._toast(`❌ ${err.message}`, true);
    }
  }

  _renderAnimList() {
    const list = this._uiContainer.querySelector('#xglb-anim-list');
    list.innerHTML = '';
    let totalAnims = 0;
    for (const [cat, anims] of Object.entries(this._currentCategoryAnims)) {
      const keys = Object.keys(anims);
      if (!keys.length) continue;
      totalAnims += keys.length;

      const header = document.createElement('div');
      header.className = 'xglb-cat-header';
      header.innerHTML = `<span>📁 ${cat.replace(/_/g, ' ').toUpperCase()}</span><span class="cat-count">${keys.length}</span>`;

      const body = document.createElement('div');
      body.className = 'xglb-cat-body';

      header.onclick = () => {
        body.style.display = body.style.display === 'none' ? 'flex' : 'none';
      };

      for (const animName of keys) {
        const btn = document.createElement('button');
        btn.className = 'xglb-anim-btn';
        btn.textContent = animName;
        btn.dataset.anim = animName;
        btn.onclick = () => this._playAnim(animName, anims[animName]);
        body.appendChild(btn);
      }
      list.appendChild(header);
      list.appendChild(body);
    }
    this._uiContainer.querySelector('#xglb-anim-count').textContent = totalAnims;
  }

  _playAnim(name, ag) {
    if (!ag) return;
    // Para tudo
    this.animLib.animations.forEach(g => g.stop());
    // Resaltar botão ativo
    this._uiContainer.querySelectorAll('.xglb-anim-btn').forEach(b => {
      b.classList.toggle('playing', b.dataset.anim === name);
    });
    ag.speedRatio = this._speed;
    ag.play(this._loopAnim);
    this._currentAnim = { name, ag };
  }

  _stopAnim() {
    if (!this._currentAnim) return;
    this._currentAnim.ag.stop();
    this._uiContainer.querySelectorAll('.xglb-anim-btn').forEach(b => b.classList.remove('playing'));
    this._currentAnim = null;
  }

  _onAction(act, e) {
    switch (act) {
      case 'reframe': this._reframe(); break;
      case 'turn-l': if (this.currentModel) this.currentModel.rotation.y -= Math.PI / 2; break;
      case 'turn-r': if (this.currentModel) this.currentModel.rotation.y += Math.PI / 2; break;
      case 'bg': this._toggleBg(); break;
      case 'grid': this._toggleGrid(e?.currentTarget); break;
      case 'bones': this._toggleBones(e?.currentTarget); break;
      case 'cheatsheet': this._toggleCheatsheet(); break;
      case 'close': window.closeAnimator(); break;
      case 'anim-play':
        if (this._currentAnim) {
          if (this._currentAnim.ag.isPlaying) this._currentAnim.ag.pause();
          else this._currentAnim.ag.play(this._loopAnim);
        }
        break;
      case 'anim-stop': this._stopAnim(); break;
      case 'anim-loop':
        this._loopAnim = !this._loopAnim;
        e.currentTarget.classList.toggle('active', this._loopAnim);
        break;
      case 'anim-speed':
        this._speed = parseFloat(e.currentTarget.value);
        this._uiContainer.querySelector('#xglb-speed-val').textContent = this._speed.toFixed(2) + 'x';
        if (this._currentAnim) this._currentAnim.ag.speedRatio = this._speed;
        break;
      case 'tx': case 'ty': case 'tz':
      case 'rx': case 'ry': case 'rz':
      case 'sc':
        this._applyTransformInput();
        break;
      case 'reset-transform':
        if (this.currentModel) {
          this.currentModel.position.setAll(0);
          this.currentModel.rotation.setAll(0);
          this.currentModel.scaling.setAll(1);
          this._buildTransform();
        }
        break;
      case 'hitbox-show':
        this._toggleHitboxDebug(e.currentTarget.checked);
        break;
    }
  }

  _reframe() {
    if (!this.currentModel) return;
    const bb = this.currentModel.getHierarchyBoundingVectors(true);
    const size = bb.max.subtract(bb.min);
    const h = size.y || 1;
    this.camera.radius = Math.max(2.5, h * 2.2);
    this.camera.setTarget(new BABYLON.Vector3(0, h * 0.5, 0));
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta  = Math.PI / 2.4;
  }

  _toggleBg() {
    this._bgLight = !this._bgLight;
    if (this._bgLight) this.scene.clearColor = new BABYLON.Color4(0.85, 0.88, 0.92, 1);
    else this.scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.06, 1);
  }

  _toggleGrid(btn) {
    this._gridVisible = !this._gridVisible;
    this.grid.isVisible = this._gridVisible;
    btn?.classList.toggle('active', this._gridVisible);
  }

  _toggleBones(btn) {
    this._bonesVisible = !this._bonesVisible;
    btn?.classList.toggle('active', this._bonesVisible);
    const skel = this.scene.skeletons[0];
    if (skel) skel.bones.forEach(b => { if (b._linkedTransformNode) b._linkedTransformNode.isVisible = this._bonesVisible; });
  }

  _toggleCheatsheet() {
    let el = this._uiContainer.querySelector('#xglb-cheatsheet');
    if (el) { el.remove(); this._cheatVisible = false; return; }
    el = document.createElement('div');
    el.id = 'xglb-cheatsheet';
    el.innerHTML = `
      <h4>⌨ Atalhos</h4>
      <table>
        <tr><td>F</td><td>Recentralizar câmera</td></tr>
        <tr><td>Space</td><td>Play / Pause</td></tr>
        <tr><td>S</td><td>Stop animação</td></tr>
        <tr><td>L</td><td>Toggle loop</td></tr>
        <tr><td>G</td><td>Toggle grid</td></tr>
        <tr><td>B</td><td>Toggle bones</td></tr>
        <tr><td>?</td><td>Esta tela</td></tr>
        <tr><td>Esc</td><td>Sair</td></tr>
      </table>
    `;
    this._uiContainer.querySelector('#xglb-body').appendChild(el);
    this._cheatVisible = true;
  }

  _toast(msg, isError = false) {
    const t = this._uiContainer.querySelector('#xglb-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.borderColor = isError ? 'rgba(255,90,106,0.5)' : 'var(--border-3)';
    t.style.color = isError ? 'var(--red)' : 'var(--cyan)';
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  _onKey(e) {
    if (!this.active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { window.closeAnimator(); return; }
    if (k === 'f') { this._reframe(); e.preventDefault(); }
    if (k === ' ') {
      if (this._currentAnim) {
        if (this._currentAnim.ag.isPlaying) this._currentAnim.ag.pause();
        else this._currentAnim.ag.play(this._loopAnim);
      }
      e.preventDefault();
    }
    if (k === 's') { this._stopAnim(); e.preventDefault(); }
    if (k === 'l') {
      this._loopAnim = !this._loopAnim;
      this._uiContainer.querySelector('[data-act=anim-loop]')?.classList.toggle('active', this._loopAnim);
    }
    if (k === 'g') this._toggleGrid(this._uiContainer.querySelector('[data-act=grid]'));
    if (k === 'b') this._toggleBones(this._uiContainer.querySelector('[data-act=bones]'));
    if (k === '?') this._toggleCheatsheet();
  }

  // ── Inspector / Transform / Hitbox / Stats ──
  _buildInspector(meta) {
    const c = this._uiContainer?.querySelector('#xglb-inspector');
    if (!c) return;
    if (!meta) { c.innerHTML = '<div style="color:var(--text-3); font-size:11px;">Nenhum modelo carregado.</div>'; return; }
    c.innerHTML = `
      <div class="xglb-kv"><span class="k">Nome</span><span class="v">${meta.name}</span></div>
      <div class="xglb-kv"><span class="k">Meshes</span><span class="v">${meta.meshes}</span></div>
      <div class="xglb-kv"><span class="k">Ossos</span><span class="v">${meta.bones}</span></div>
      <div class="xglb-kv"><span class="k">Anims</span><span class="v">${meta.animations}</span></div>
      <div class="xglb-kv"><span class="k">Altura</span><span class="v">${meta.height} u</span></div>
      <div class="xglb-kv"><span class="k">Bbox</span><span class="v">${meta.size}</span></div>
    `;
  }

  _buildTransform() {
    const c = this._uiContainer?.querySelector('#xglb-transform');
    if (!c) return;
    const m = this.currentModel;
    const r = m?.rotation || { x: 0, y: 0, z: 0 };
    const s = m?.scaling.x || 1;
    c.innerHTML = `
      <div class="xglb-slider"><label>RX</label><input type="range" min="-3.14" max="3.14" step="0.05" value="${r.x}" data-act="rx" /><input type="number" step="0.1" value="${r.x.toFixed(2)}" data-act="rx" /></div>
      <div class="xglb-slider"><label>RY</label><input type="range" min="-3.14" max="3.14" step="0.05" value="${r.y}" data-act="ry" /><input type="number" step="0.1" value="${r.y.toFixed(2)}" data-act="ry" /></div>
      <div class="xglb-slider"><label>RZ</label><input type="range" min="-3.14" max="3.14" step="0.05" value="${r.z}" data-act="rz" /><input type="number" step="0.1" value="${r.z.toFixed(2)}" data-act="rz" /></div>
      <div class="xglb-slider"><label>Sc</label><input type="range" min="0.1" max="5" step="0.05" value="${s}" data-act="sc" /><input type="number" step="0.1" value="${s.toFixed(2)}" data-act="sc" /></div>
      <button data-act="reset-transform" style="margin-top:8px; width:100%; background:var(--bg-3); border:1px solid var(--border); color:var(--text); padding:5px; border-radius:5px; cursor:pointer; font-size:11px;">↺ Reset</button>
    `;
    c.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('input', () => this._applyTransformInput());
      el.addEventListener('change', () => this._applyTransformInput());
    });
  }

  _applyTransformInput() {
    if (!this.currentModel) return;
    const c = this._uiContainer.querySelector('#xglb-transform');
    const rx = parseFloat(c.querySelector('input[data-act=rx][type=range]').value);
    const ry = parseFloat(c.querySelector('input[data-act=ry][type=range]').value);
    const rz = parseFloat(c.querySelector('input[data-act=rz][type=range]').value);
    const sc = parseFloat(c.querySelector('input[data-act=sc][type=range]').value);
    this.currentModel.rotationQuaternion = null;
    this.currentModel.rotation.set(rx, ry, rz);
    this.currentModel.scaling.setAll(sc);
    // Sync number inputs
    c.querySelectorAll('input[type=number]').forEach(n => {
      const a = n.getAttribute('data-act');
      if (a === 'rx') n.value = rx.toFixed(2);
      if (a === 'ry') n.value = ry.toFixed(2);
      if (a === 'rz') n.value = rz.toFixed(2);
      if (a === 'sc') n.value = sc.toFixed(2);
    });
  }

  _buildHitbox() {
    const c = this._uiContainer?.querySelector('#xglb-hitbox');
    if (!c) return;
    c.innerHTML = `
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-2); cursor:pointer;">
        <input type="checkbox" data-act="hitbox-show" /> Mostrar bounding box
      </label>
      <div style="margin-top:8px; font-size:10px; color:var(--text-3);">
        Bounding box agregada do modelo carregado. Pra hitboxes de combate, use o jogo real (LMB / RMB).
      </div>
    `;
    c.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('change', (e) => this._onAction(el.getAttribute('data-act'), e));
    });
  }

  _toggleHitboxDebug(show) {
    if (!this.currentModel) return;
    if (this._bboxMesh) { this._bboxMesh.dispose(); this._bboxMesh = null; }
    if (!show) return;
    const bb = this.currentModel.getHierarchyBoundingVectors(true);
    const size = bb.max.subtract(bb.min);
    this._bboxMesh = BABYLON.MeshBuilder.CreateBox('xglb-bbox', { width: size.x, height: size.y, depth: size.z }, this.scene);
    const center = bb.min.add(bb.max).scale(0.5);
    this._bboxMesh.position.copyFrom(center);
    const mat = new BABYLON.StandardMaterial('xglb-bboxmat', this.scene);
    mat.wireframe = true;
    mat.emissiveColor = new BABYLON.Color3(0, 0.95, 1);
    mat.disableLighting = true;
    this._bboxMesh.material = mat;
    this._bboxMesh.isPickable = false;
  }

  _buildStats(stats) {
    const c = this._uiContainer?.querySelector('#xglb-stats');
    if (!c) return;
    if (!stats) { c.innerHTML = '<div style="color:var(--text-3); font-size:11px;">Carregue um modelo.</div>'; return; }
    c.innerHTML = `
      <div class="xglb-kv"><span class="k">Vértices</span><span class="v">${stats.vertices}</span></div>
      <div class="xglb-kv"><span class="k">FPS</span><span class="v" id="xglb-fps">—</span></div>
      <div class="xglb-kv"><span class="k">Draws</span><span class="v" id="xglb-draws">—</span></div>
    `;
  }

  _countMeshes() {
    if (!this.currentModel) return 0;
    return this.currentModel.getChildMeshes(false).length + 1;
  }
  _countBones() {
    const skel = this.scene?.skeletons?.[0];
    return skel ? skel.bones.length : 0;
  }
  _countAnims() {
    let n = 0;
    for (const v of Object.values(this._currentCategoryAnims)) n += Object.keys(v).length;
    return n;
  }
  _countVerts() {
    if (!this.currentModel) return 0;
    let total = 0;
    this.currentModel.getChildMeshes(false).forEach(m => { total += m.getTotalVertices?.() || 0; });
    return total;
  }

  exit() {
    this.active = false;
    if (this._currentAnim) this._currentAnim.ag.stop();
    // Devolve canvas do jogo pro pai original ANTES de descartar shell
    if (this.parentCanvas && this._savedCanvasParent) {
      try { this._savedCanvasParent.appendChild(this.parentCanvas); } catch (_) {}
      this.parentCanvas.setAttribute('style', this._savedCanvasStyle);
    }
    if (this._uiContainer) {
      try { document.body.removeChild(this._uiContainer); } catch (_) {}
      this._uiContainer = null;
    }
    if (this.scene) {
      try { this.scene.dispose(); } catch (_) {}
      this.scene = null;
    }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    this.canvas = this.parentCanvas;
    setTimeout(() => this.engine.resize(), 16);
  }

  render() {
    if (!this.active || !this.scene) return;
    this.scene.render();
    // Atualiza stats live
    const fpsEl = this._uiContainer?.querySelector('#xglb-fps');
    if (fpsEl) fpsEl.textContent = this.engine.getFps().toFixed(0);
    const drawsEl = this._uiContainer?.querySelector('#xglb-draws');
    if (drawsEl) drawsEl.textContent = this.scene.getActiveMeshes().length;
  }
}
