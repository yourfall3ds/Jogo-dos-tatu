// ─────────────────────────────────────────────────────────────────
//  BuildMode — modo construção estilo The Sims / V Rising / Minecraft
//
//  FLUXO:
//    B            → abre catálogo (cursor livre, sidebar)
//    Clica item   → entra em modo PLACING (pointer lock + overlay HUD)
//
//  CONTROLES NO PLACING:
//    T (padrão)      — ghost segue crosshair (modo mover)
//    Hold R + mouseX — rotaciona (câmera congela)
//    Hold Q + mouseY — escala proporcional (câmera congela; cima=+, baixo=-)
//    ↑ / ↓           — altura (ajuste fino)
//    ← / →           — strafe esquerda/direita relativo à câmera
//    LMB             — coloca o objeto
//    Tab             — volta ao catálogo
//    ESC             — cancela / fecha
//    Del             — desfaz último
//    G               — cicla grid (livre / 0.5 / 1 / 2)
//
//  IMPORTANTE: preUpdate(input) deve ser chamado ANTES de player.update()
//  no game loop para que R/Q consumam o delta do mouse antes da câmera.
//
//  A "Máquina de Criação" é item especial — ao colocar spawna AssetMachine
//  com animação de deploy completa.
// ─────────────────────────────────────────────────────────────────
import { LocalDB }       from '../data/LocalDB.js';
import { WorldObjects }  from '../data/WorldObjects.js';
import { AssetRegistry } from '../data/AssetRegistry.js';
import { AssetGroups }   from '../data/AssetGroups.js';
import { optimizeCollider } from '../scene/ColliderOptimizer.js';

const MACHINE_P1 = 'assets/itens 3d/Maquina de assets/Meshy_AI_Phase_1_Compact_Disc_0530011922_image-to-3d-texture.glb';

const ARROW_SPD  = 0.07;  // velocidade das setas (unidades/frame)
const ROT_SENS   = 0.008; // sensibilidade mouse → rotação (rad/px)
const SCALE_SENS = 0.004; // sensibilidade mouse → escala (fração/px)

export class BuildMode {
  constructor(scene, player, level) {
    this.scene  = scene;
    this.player = player;
    this.level  = level;

    // ── Estado ─────────────────────────────────────────────────────
    this._state = 'inactive';   // 'inactive' | 'catalog' | 'placing'

    // ── Ghost ──────────────────────────────────────────────────────
    this._ghost       = null;
    this._ghostMeshes = null;
    this._ghostSrc    = null;
    this._rotY        = 0;
    this._scaleM      = 1.0;
    this._grid        = 1.0;

    // Offsets acumulados pelas setas (ajuste fino)
    this._offX = 0;
    this._offY = 0;
    this._offZ = 0;

    // Mouse delta pré-consumido pelo preUpdate (R/Q mode)
    this._preDX = 0;
    this._preDY = 0;

    // ── Objetos colocados ──────────────────────────────────────────
    this._placed = [];

    // ── Teclas (borda e held) ──────────────────────────────────────
    this._keys = {};
    this._prev = {};

    const _isTyping = () => {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA';
    };
    window.addEventListener('keydown', e => {
      if (_isTyping()) return;
      this._keys[e.code] = true;
    });
    window.addEventListener('keyup', e => {
      if (_isTyping()) return;
      this._keys[e.code] = false;
    });
    // Limpa teclas presas quando usuário foca num campo de texto
    document.addEventListener('focusin', e => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') this._keys = {};
    });

    // ── Roda do mouse → GIRA o ghost (listener PRÓPRIO) ──────────────
    //  Independente do gameActive/pointer-lock do InputManager (o listener
    //  de wheel dele só acumula com pointer-lock ativo → quebrava quando o
    //  foco saía). Aqui acumulamos sempre que estiver em placing.
    this._wheelAccum = 0;
    window.addEventListener('wheel', e => {
      if (this._state === 'placing') {
        e.preventDefault?.();
        this._wheelAccum += Math.sign(e.deltaY);
      }
    }, { passive: false });

    // ── Init ───────────────────────────────────────────────────────
    this._catalog = [];
    this._buildUI();
    this._buildHUD();
    this._loadCatalog();
    this._restoreFrames();   // restaura quadros salvos do F5 anterior
    // MUNDO COMPARTILHADO: se logado, carrega do Supabase + sync ao vivo;
    // senão cai pro restore local (LocalDB 'placed').
    this._sharedWorld = false;
    this._worldEntries = new Map();   // worldId(uuid) → entry colocado
    this._initSharedWorld();
  }

  /**
   * Inicializa o MUNDO ÚNICO GLOBAL (colaborativo, estilo Fortnite):
   * carrega todos os objetos do Supabase e assina o Realtime pra ver
   * construções/remoções dos outros players ao vivo. Sem login, cai no
   * restore local (offline).
   */
  async _initSharedWorld() {
    let ok = false;
    try { ok = await WorldObjects.available(); } catch (_) { ok = false; }
    if (!ok) { this._restorePlaced(); return; }   // offline/deslogado → local
    this._sharedWorld = true;

    try {
      const recs = await WorldObjects.loadAll();
      for (const rec of recs) {
        const entry = await this._renderRecordToScene(rec);
        if (entry && rec._worldId) this._worldEntries.set(rec._worldId, entry);
      }
      console.log(`[BuildMode] 🌍 mundo compartilhado: ${recs.length} objeto(s)`);
    } catch (e) { console.warn('[BuildMode] load mundo falhou:', e?.message || e); }

    // Realtime: insert/delete/update dos OUTROS players (e echo dos meus).
    this._unsubWorld = await WorldObjects.subscribe({
      onInsert: async (rec) => {
        if (!rec._worldId || this._worldEntries.has(rec._worldId)) return; // dedupe (inclui os meus)
        const entry = await this._renderRecordToScene(rec);
        if (entry) this._worldEntries.set(rec._worldId, entry);
      },
      onDelete: (worldId) => this._removeWorldEntry(worldId),
      onUpdate: (rec, row) => { if (row?.broken) this._removeWorldEntry(rec._worldId); },
    });
  }

  /** Remove (visual + colisor) um objeto do mundo pelo worldId. */
  _removeWorldEntry(worldId) {
    const entry = worldId && this._worldEntries.get(worldId);
    if (!entry) return;
    try { this._disposeColliderArtifacts(entry.root); } catch (_) {}
    try { entry.root?.dispose(); } catch (_) {}
    const i = this._placed.indexOf(entry);
    if (i >= 0) this._placed.splice(i, 1);
    this._worldEntries.delete(worldId);
    window._navMesh?.markDirty?.();
  }

  /** Persiste um objeto recém-colocado no mundo compartilhado (Supabase). */
  async _persistPlaced(entry) {
    if (!this._sharedWorld || !entry?.record || entry.record.kind === 'frame') return;
    try {
      const worldId = await WorldObjects.place(entry.record);
      if (worldId) { entry.worldId = worldId; this._worldEntries.set(worldId, entry); }
    } catch (e) { console.warn('[BuildMode] persist mundo falhou:', e?.message || e); }
  }

  /**
   * Renderiza UM registro (GLB ou peça) na cena e empurra pra _placed.
   * Reusado por _restorePlaced (local) e pelo mundo compartilhado (Supabase).
   * Não salva — quem chama decide persistência.
   */
  async _renderRecordToScene(rec) {
    if (rec.kind === 'piece' && rec.pieceId) {
      const entry = await this._placePieceAt(
        new BABYLON.Vector3(rec.p[0], rec.p[1], rec.p[2]),
        rec.ry || 0, rec.sc ?? 1, { pieceId: rec.pieceId }, false, rec.s || null,
      );
      if (entry) entry.worldId = rec._worldId || null;
      return entry;
    }
    const url = rec.url;
    if (!url) return null;   // assetMachine (sem url) restaurado à parte
    const ld = await this._resolveLoadable(url);
    if (!ld) return null;
    const res  = await BABYLON.SceneLoader.ImportMeshAsync('', ld.folder, ld.file, this.scene, null, ld.extHint);
    const root = res.meshes[0];
    root.name = rec.name || ('placed_' + rec.id);
    root.rotationQuaternion = null;
    root.position.set(rec.p[0], rec.p[1], rec.p[2]);
    root.rotation.y = rec.ry || 0;
    root.scaling.setAll(rec.sc ?? 1);
    const gProps = rec.groupProps || {};
    this._applyCollisionProps(root, res.meshes, gProps);
    if (gProps.castShadows !== false) this.level?.shadowGen?.addShadowCaster?.(root, true);
    const entry = { record: rec, root, worldId: rec._worldId || null };
    this._placed.push(entry);
    return entry;
  }

  /**
   * Restaura objetos colocados no mapa (bucket 'placed') após F5.
   * Recria cada GLB na posição/rotação/escala salvas e re-aplica as
   * propriedades de grupo (colisão/sombra). Sem isso, tudo que era
   * colocado pelo [B] sumia ao recarregar.
   */
  async _restorePlaced() {
    let records = [];
    try { records = await LocalDB.get('placed', []); } catch (_) {}
    if (!Array.isArray(records) || !records.length) return;

    let n = 0;
    for (const rec of records) {
      try {
        const entry = await this._renderRecordToScene(rec);
        if (entry) n++;
      } catch (e) {
        console.warn('[BuildMode] objeto colocado falhou ao restaurar:', rec.id || rec.pieceId, e.message);
      }
    }
    if (n) console.log(`[BuildMode] 🧱 ${n} objeto(s) colocado(s) restaurado(s)`);
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

      <div style="font-size:10px;color:#6a9;line-height:1.7;margin-bottom:8px">
        Clique num item → mira em 1ª pessoa para posicionar.<br>
        <b>Roda do mouse</b> 🖱 &nbsp;girar (15°)<br>
        <b>Hold Q</b> + mouse ↑ ↓ &nbsp;escala<br>
        <b>Setas</b> ajuste fino (↑↓ altura, ←→ strafe)<br>
        <b>LMB</b> colocar &nbsp;&nbsp;<b>Tab</b> catálogo &nbsp;&nbsp;<b>Del</b> desfazer
      </div>

      <div style="display:flex;gap:5px;margin-bottom:8px">
        <button id="build-library" class="bm-btn" style="background:#1a1a40;border-color:#66f;color:#aaf;flex:1">📚 Biblioteca</button>
        <button id="build-undo" class="bm-btn" style="background:#3a1a1a;flex:1">↩ Desfazer (Del)</button>
      </div>
      <div style="display:flex;gap:5px;margin-bottom:8px">
        <button id="build-clear" class="bm-btn" style="background:#3a1010;border-color:#c44;color:#fbb;flex:1">🧹 Limpar Terreno</button>
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

    el.querySelector('#build-close').onclick   = () => this.hide();
    el.querySelector('#build-library').onclick = () => window._assetGroupsUI?.open?.();
    el.querySelector('#build-grid').onclick  = () => this._cycleGrid();
    el.querySelector('#build-undo').onclick  = () => this._undo();
    el.querySelector('#build-clear').onclick = () => {
      if (confirm('Limpar TODO o terreno colocado (objetos, quadros, máquinas e colisores órfãos)?\nO mapa-base é preservado. Não dá pra desfazer.'))
        this.clearAllTerrain();
    };
  }

  // ══════════════════════════════════════════════════════════════════
  //  UI: HUD overlay (aparece no modo placing)
  // ══════════════════════════════════════════════════════════════════
  _buildHUD() {
    const el = document.createElement('div');
    el.id = 'build-hud';
    el.style.cssText = [
      'position:fixed','bottom:22px','left:50%','transform:translateX(-50%)',
      'background:rgba(6,9,16,0.90)','border:1px solid #3a8',
      'color:#cde','font-family:Segoe UI,monospace','font-size:12px',
      'padding:8px 20px','border-radius:10px','pointer-events:none',
      'display:none','z-index:9200','white-space:nowrap',
      'box-shadow:0 0 16px rgba(60,200,120,0.25)',
    ].join(';');
    el.innerHTML = `
      <span id="bh-item" style="color:#5fc;font-weight:bold"></span>
      <span id="bh-mode" style="color:#fa6;margin:0 8px"></span>
      &nbsp;|&nbsp;
      <b style="color:#aef">🖱 mira</b> superfície&nbsp;
      <b style="color:#aef">Hold R</b>/🖱Roda girar&nbsp;
      <b style="color:#aef">Hold Q</b>+🖱 escala&nbsp;
      <b style="color:#aef">Setas</b> orientar&nbsp;
      <b style="color:#aef">LMB</b> colocar&nbsp;
      <b style="color:#fa6">Tab/ESC</b> sair
    `;
    document.body.appendChild(el);
    this._hud = el;

    // Crosshair especial do modo construção
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

    // Item especial: Máquina de Criação (sempre no topo)
    base.push({
      kind: 'special', id: 'assetMachine',
      name: '🤖 Máquina de Criação',
      path: MACHINE_P1,
      special: 'assetMachine',
    });

    // Props do AssetRegistry
    for (const cat of ['item', 'nature']) {
      for (const id of AssetRegistry.ids(cat)) {
        base.push({ kind: 'registry', cat, id, name: id, path: AssetRegistry.path(cat, id) });
      }
    }

    // Assets gerados pelo Meshy
    let generated = [];
    try { generated = await LocalDB.get('generated_assets', []); } catch (_) {}
    this._catalog = [
      ...generated.map(g => ({ kind: 'generated', id: g.id, name: '✨ ' + g.name, glbUrl: g.glbUrl })),
      ...base,
    ];
    this._renderCatalog();
  }

  _renderCatalog() {
    const c = this._el?.querySelector('#build-catalog');
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

  _cycleGrid() {
    const steps = [0, 0.5, 1.0, 2.0];
    const i = steps.indexOf(this._grid);
    this._grid = steps[(i + 1) % steps.length];
    const btn = this._el?.querySelector('#build-grid');
    if (btn) btn.textContent = 'Grid: ' + (this._grid || 'livre');
  }

  // ══════════════════════════════════════════════════════════════════
  //  Ghost
  // ══════════════════════════════════════════════════════════════════
  /**
   * Resolve uma URL de GLB para algo carregável pelo Babylon.
   * URLs externas (Meshy CDN com ?Expires=…) sofrem CORS e não têm extensão
   * detectável → baixa via proxy local e devolve um blob: + extHint '.glb'.
   * Retorna { folder, file, extHint }.
   */
  async _resolveLoadable(url) {
    if (!url) return null;
    // Externa (http/https) que não seja asset local → proxy → blob
    if (/^https?:/.test(url)) {
      try {
        const proxy = `http://127.0.0.1:3099/proxy-image?url=${encodeURIComponent(url)}`;
        const resp  = await fetch(proxy, { signal: AbortSignal.timeout(60000) });
        if (resp.ok) {
          const blobUrl = URL.createObjectURL(await resp.blob());
          return { folder: '', file: blobUrl, extHint: '.glb' };
        }
      } catch (e) { console.warn('[BuildMode] proxy GLB falhou:', e.message); }
    }
    if (url.startsWith('blob:')) return { folder: '', file: url, extHint: '.glb' };
    // Asset local (assets/…) — codifica caminho
    const enc       = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const lastSlash = url.lastIndexOf('/');
    return {
      folder:  enc(url.substring(0, lastSlash + 1)),
      file:    encodeURIComponent(url.substring(lastSlash + 1)),
      extHint: undefined,
    };
  }

  async _selectItem(item) {
    this._ghostSrc = item;
    this._rotY     = 0;
    // Usa a ESCALA PADRÃO do asset (se definida na biblioteca) → o ghost já
    //  nasce no tamanho certo, sem precisar ajustar toda vez.
    let defScale = 1.0;
    try { const ds = await AssetGroups.getDefaultScale(item.id); if (ds != null) defScale = ds; } catch (_) {}
    this._scaleM   = defScale;
    this._offX = this._offY = this._offZ = 0;
    this._dragTool = null;
    this._dragA    = null;
    this._disposeGhost();

    // ── Peça PROCEDURAL (parede/porta/janela/chão) → ghost gerado ──────
    if (item.kind === 'piece' || item.pieceId) {
      this._dragTool   = item.drag || null;   // 'wall' | 'floor' → arrastar A→B
      this._dragA      = null;
      this._floorRemove = false;
      const { buildPiece } = await import('./BuildPieces.js');
      const root = buildPiece(item.pieceId, this.scene, '_ghost_' + item.id);
      if (!root) return;
      const meshes = [root, ...root.getChildMeshes(false)];
      const gm = new BABYLON.StandardMaterial('_ghostMat_' + item.id, this.scene);
      gm.diffuseColor = new BABYLON.Color3(0.3, 1.0, 0.5);
      gm.emissiveColor = new BABYLON.Color3(0.1, 0.45, 0.2);
      gm.alpha = 0.5; gm.disableLighting = true;
      root.getChildMeshes(false).forEach(m => { m.material = gm; m.isPickable = false; });
      this._ghost       = root;
      this._ghostMat    = gm;
      this._ghostMeshes = meshes;
      this._enterPlacing();
      return;
    }

    const url = item.glbUrl || item.path;
    const ld  = await this._resolveLoadable(url);
    if (!ld) { console.warn('[BuildMode] URL inválida para ghost:', url); return; }
    // Cacheia o blob resolvido p/ o _placeAt reusar (evita baixar 2x)
    item._resolvedFolder = ld.folder;   // ← faltava a pasta! sem ela, carregava do root
    item._resolvedFile   = ld.file;
    item._resolvedExt    = ld.extHint;

    try {
      const res  = await BABYLON.SceneLoader.ImportMeshAsync('', ld.folder, ld.file, this.scene, null, ld.extHint);
      const root = res.meshes[0];
      root.name  = '_ghost_' + item.id;
      // GLBs vêm com rotationQuaternion (flip glTF→Babylon). Enquanto ele
      // existe, o Babylon IGNORA root.rotation.y → a rotação não funcionava.
      // Anulamos pra rotação por euler (roda/R) ter efeito visual.
      root.rotationQuaternion = null;

      const gm = new BABYLON.StandardMaterial('_ghostMat_' + item.id, this.scene);
      gm.diffuseColor    = new BABYLON.Color3(0.3, 1.0, 0.5);
      gm.emissiveColor   = new BABYLON.Color3(0.1, 0.45, 0.2);
      gm.alpha           = 0.50;
      gm.disableLighting = true;
      res.meshes.forEach(m => { m.material = gm; m.isPickable = false; });

      this._ghost       = root;
      this._ghostMeshes = res.meshes;
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
    this._el.style.display  = 'flex';
    this._hud.style.display = 'none';
    this._ch.style.display  = 'none';
    this._disposeGhost();
    window._gameInput?.deactivate?.();
  }

  _enterPlacing() {
    this._state = 'placing';
    // MULTIPLAYER: marca o item "na mão" pra sincronizar com os outros players.
    // (consumido por ColyseusClient.sendInput → state.held_item)
    try {
      const src = this._ghostSrc || {};
      const tag = src.pieceId ? ('piece:' + src.pieceId)
                              : ('asset:' + (src.assetId || src.id || src.name || 'obj'));
      if (window._gamePlayer) window._gamePlayer._heldItem = tag;
    } catch (_) {}
    this._el.style.display  = 'none';
    this._hud.style.display = 'block';
    this._ch.style.display  = 'block';
    this._setHUDItem(this._ghostSrc?.name ?? '');
    this._setHUDMode('T');

    // Quando o browser liberar o pointer lock (ESC),
    // voltamos ao catálogo em vez de abrir o engine mode
    const inp = window._gameInput;
    if (inp) {
      this._savedOnDeactivated = inp.onDeactivated;
      inp.onDeactivated = () => this._leavePlacing();
    }
    inp?.activate?.();
  }

  _leavePlacing() {
    this._disposeGhost();
    this._state = 'inactive';
    // MULTIPLAYER: largou o construível → volta a mão pra arma (held_item segue weapon).
    try { if (window._gamePlayer) window._gamePlayer._heldItem = null; } catch (_) {}
    if (this._el)  this._el.style.display  = 'none';
    this._hud.style.display = 'none';
    this._ch.style.display  = 'none';
    this._preDX = this._preDY = 0;
    this._ghostSrc = null;

    const inp = window._gameInput;
    if (inp && this._savedOnDeactivated !== undefined) {
      inp.onDeactivated      = this._savedOnDeactivated;
      this._savedOnDeactivated = undefined;
    }
    // Não força lock/unlock: por Tab o jogo segue (pointer-lock mantido),
    //  por ESC o browser já liberou o mouse.
  }

  /** Asset do inventário → "na mão" (modo de colocar). Chamado por useHotbar. */
  async startPlacingInventoryAsset(data) {
    if (!data) return;
    await this._selectItem({
      kind:          data.pieceId ? 'piece' : 'generated',
      id:            data.assetId || ('inv_' + Date.now().toString(36)),
      name:          data.name || 'asset',
      glbUrl:        data.glbUrl,
      path:          data.path,
      pieceId:       data.pieceId,          // peça procedural (parede/etc.)
      drag:          data.drag,             // modo arrastar (parede/chão)
      groupProps:    data.groupProps || {},
      _fromInventory: true,                 // gasta do estoque ao colocar
      assetId:        data.assetId,
    });
  }

  show()   { window._assetGroupsUI?.open?.(); }     // B / externo → Biblioteca
  hide()   { if (this._state === 'placing') this._leavePlacing(); }
  toggle() { this.show(); }

  // ── Helpers de HUD ────────────────────────────────────────────────
  _setHUDItem(name) {
    const el = this._hud?.querySelector('#bh-item');
    if (el) el.textContent = name;
  }
  _setHUDMode(mode) {
    const el = this._hud?.querySelector('#bh-mode');
    if (!el) return;
    const labels = { T: '[ MOVER ]', R: '[ GIRAR 🔄 ]', Q: '[ ESCALA ↕ ]',
      WALL: '[ PAREDE: clica A→B · 45° ]', FLOOR: '[ CHÃO: clica canto→canto · X=apagar ]',
      FLOORDEL: '[ CHÃO 🗑 apagar: clica canto→canto · X=preencher ]' };
    el.textContent = labels[mode] ?? '';
  }

  // ══════════════════════════════════════════════════════════════════
  //  preUpdate — DEVE ser chamado ANTES de player.update() no main.js
  //
  //  • Quando R ou Q estão segurados: consome mouse delta para que a
  //    câmera do player NÃO gire.
  //  • Quando placing: consome o click para que a arma NÃO atire.
  // ══════════════════════════════════════════════════════════════════
  preUpdate(input) {
    this._preDX       = 0;
    this._preDY       = 0;
    this._pendingClick = false;

    if (this._state !== 'placing') return;

    // ── Consome click (impede que a arma atire) ──────────────────────
    if (input.consumeClick()) {
      this._pendingClick = true;
    }

    // ── R / Q: consome mouse delta (câmera congela) ──────────────────
    const rHeld = !!this._keys['KeyR'];
    const qHeld = !!this._keys['KeyQ'];
    if (rHeld || qHeld) {
      const { dx, dy } = input.consumeMouseDelta();
      this._preDX = dx;
      this._preDY = dy;
    }

    // ── Roda do mouse: drena o acúmulo do InputManager só pra a ARMA
    //  não trocar enquanto constrói. A rotação em si vem do listener
    //  próprio do BuildMode (_wheelAccum), que funciona mesmo sem
    //  pointer-lock. (input.consumeWheel zera o _wheelDelta do player.)
    input.consumeWheel?.();
  }

  /** Getter de compat — código antigo que checa buildMode._active ainda funciona */
  get _active() { return this._state !== 'inactive'; }

  // ══════════════════════════════════════════════════════════════════
  //  update — chamado todo frame (após player.update)
  // ══════════════════════════════════════════════════════════════════
  update() {
    // ── B → abre a Biblioteca de Assets (ou sai do placing) ────────────
    if (this._edge('KeyB')) {
      if (this._state === 'placing') this._leavePlacing();
      else window._assetGroupsUI?.open?.();
    }
    if (this._state !== 'placing') return;

    // ── Del / G — durante o placing ────────────────────────────────────
    if (this._edge('Delete')) this._undo();
    if (this._edge('KeyG'))   this._cycleGrid();

    // ══════════════════════════════════════════════════════════════════
    //  PLACING
    // ══════════════════════════════════════════════════════════════════
    if (!this._ghost) return;

    // ── Navegação ─────────────────────────────────────────────────────
    if (this._edge('Tab'))    { this._leavePlacing(); return; }
    if (this._edge('Escape')) {
      if (this._dragTool && this._dragA) { this._dragA = null; return; }   // cancela só o ponto A
      this._leavePlacing(); return;
    }

    // ── Ferramentas de ARRASTAR (parede A→B / chão em blocos) ──────────
    if (this._dragTool) { this._updateDrag(); return; }

    const rHeld = !!this._keys['KeyR'];
    const qHeld = !!this._keys['KeyQ'];

    // ── HUD: atualiza modo ──────────────────────────────────────────
    const mode = rHeld ? 'R' : qHeld ? 'Q' : 'T';
    this._setHUDMode(mode);

    // ── Hold R → rotaciona com mouse X ────────────────────────────────
    if (rHeld && this._preDX !== 0) {
      this._rotY += this._preDX * ROT_SENS;
    }

    // ── Roda do mouse → gira em passos de 15° (método principal) ───────
    if (this._wheelAccum) {
      this._rotY += this._wheelAccum * (Math.PI / 12);   // 15° por "clique" da roda
      this._wheelAccum = 0;
    }

    // ── Hold Q → escala com mouse Y (cima = maior) ─────────────────────
    if (qHeld && this._preDY !== 0) {
      this._scaleM = Math.max(0.05, Math.min(8.0, this._scaleM - this._preDY * SCALE_SENS));
    }

    // ── Setas: ajuste fino de posição ──────────────────────────────────
    //  ↑ ↓  → altura (Y)
    //  ← →  → strafe relativo à câmera (X/Z)
    const yawRad = BABYLON.Tools.ToRadians(this.player?.yaw ?? 0);
    const rgtX   =  Math.cos(yawRad);
    const rgtZ   = -Math.sin(yawRad);

    if (this._held('ArrowUp'))    this._offY += ARROW_SPD;
    if (this._held('ArrowDown'))  this._offY -= ARROW_SPD;
    if (this._held('ArrowRight')) { this._offX += rgtX * ARROW_SPD; this._offZ += rgtZ * ARROW_SPD; }
    if (this._held('ArrowLeft'))  { this._offX -= rgtX * ARROW_SPD; this._offZ -= rgtZ * ARROW_SPD; }

    // ── T mode: ghost segue crosshair (apenas quando NÃO está em R/Q) ──
    if (!rHeld && !qHeld) {
      const gp = this._groundPoint();
      if (gp) {
        let x = gp.x + this._offX, z = gp.z + this._offZ;
        if (this._grid > 0) {
          x = Math.round(x / this._grid) * this._grid;
          z = Math.round(z / this._grid) * this._grid;
        }
        this._ghost.position.set(x, gp.y + this._offY, z);
      }
    }
    // Em R ou Q mode: ghost fica parado, só rotação/escala muda

    // Aplica rotação e escala no ghost
    this._ghost.rotation.y = this._rotY;
    this._ghost.scaling.setAll(this._scaleM);

    // ── LMB (click pré-consumido no preUpdate) ─────────────────────
    if (this._pendingClick) {
      this._pendingClick = false;
      const src = this._ghostSrc;
      this._placeAt(this._ghost.position.clone(), this._rotY, this._scaleM);
      this._offX = this._offY = this._offZ = 0;   // reset offsets
      // veio do inventário → gasta 1 do estoque; acabou → sai do placing
      if (src?._fromInventory) {
        const left = window._gameInventory?.consumeBuildable?.(src.assetId);
        if (left === false || left === 0) this._leavePlacing();
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Ferramentas de ARRASTAR (parede A→B em 45° · chão/teto em blocos)
  // ══════════════════════════════════════════════════════════════════
  _consumePlaceClick() { if (this._pendingClick) { this._pendingClick = false; return true; } return false; }
  _snapVec(v, step) { return new BABYLON.Vector3(Math.round(v.x / step) * step, v.y, Math.round(v.z / step) * step); }
  _buildableStock(assetId) { return window._gameInventory?.getBuildables?.().find(s => s.data?.assetId === assetId)?.qty || 0; }

  _updateDrag() {
    const PW  = 4;                         // largura da peça (parede / azulejo)
    const raw = this._groundPoint();
    if (!raw) return;

    if (this._dragTool === 'floor' && this._edge('KeyX')) this._floorRemove = !this._floorRemove;
    this._setHUDMode(this._dragTool === 'wall' ? 'WALL' : (this._floorRemove ? 'FLOORDEL' : 'FLOOR'));

    if (this._dragTool === 'wall') {
      const gp = this._snapVec(raw, 1);
      if (!this._dragA) {
        this._previewWall(gp, gp);
        if (this._consumePlaceClick()) this._dragA = gp.clone();
      } else {
        const B = this._wallEndSnap(this._dragA, gp);
        this._previewWall(this._dragA, B);
        if (this._consumePlaceClick()) { this._commitWall(this._dragA, B); this._dragA = B.clone(); }  // encadeia
      }
    } else {                               // floor
      const cell = this._snapVec(raw, PW);
      if (!this._dragA) {
        this._previewFloor(cell, cell);
        if (this._consumePlaceClick()) this._dragA = cell.clone();
      } else {
        this._previewFloor(this._dragA, cell);
        if (this._consumePlaceClick()) { this._commitFloor(this._dragA, cell); this._dragA = null; }
      }
    }
  }

  // Ponta B da parede: ângulo travado em 45° + comprimento em passos de 1u
  _wallEndSnap(A, gp) {
    const PW = 4;
    let len = Math.hypot(gp.x - A.x, gp.z - A.z);
    if (len < 0.5) return A.clone();
    let ang = Math.round(Math.atan2(gp.z - A.z, gp.x - A.x) / (Math.PI / 4)) * (Math.PI / 4);
    len = Math.max(1, Math.round(len));
    const src = this._ghostSrc;
    if (src?._fromInventory) {              // clampa ao estoque
      const maxLen = this._buildableStock(src.assetId) * PW;
      if (maxLen > 0) len = Math.min(len, maxLen);
    }
    return new BABYLON.Vector3(A.x + Math.cos(ang) * len, A.y, A.z + Math.sin(ang) * len);
  }

  _previewWall(A, B) {
    if (!this._ghost) return;
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const ang = Math.atan2(B.z - A.z, B.x - A.x);
    this._ghost.position.set((A.x + B.x) / 2, A.y, (A.z + B.z) / 2);
    this._ghost.rotation.y = (len < 0.3) ? 0 : -ang;
    this._ghost.scaling.set(len < 0.3 ? 1 : len / 4, 1, 1);
  }

  _commitWall(A, B) {
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    if (len < 0.5) return;
    const ang = Math.atan2(B.z - A.z, B.x - A.x);
    const mid = new BABYLON.Vector3((A.x + B.x) / 2, A.y, (A.z + B.z) / 2);
    this._placePieceAt(mid, -ang, 1, { pieceId: 'wall' }, true, [len / 4, 1, 1]);
    const src = this._ghostSrc;
    if (src?._fromInventory) {
      const units = Math.max(1, Math.round(len / 4));
      const left  = window._gameInventory?.consumeBuildable?.(src.assetId, units);
      if (left === false || left === 0) this._leavePlacing();
    }
  }

  // Retângulo de células (canto-a-canto) → preview de laje cobrindo a área
  _floorRect(A, B) {
    const PW = 4;
    const ax = Math.round(A.x / PW), az = Math.round(A.z / PW);
    const bx = Math.round(B.x / PW), bz = Math.round(B.z / PW);
    return { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), PW };
  }

  _previewFloor(A, B) {
    if (!this._ghost) return;
    const r = this._floorRect(A, B);
    const cols = r.x1 - r.x0 + 1, rows = r.z1 - r.z0 + 1;
    this._ghost.position.set((r.x0 + r.x1) / 2 * r.PW, A.y, (r.z0 + r.z1) / 2 * r.PW);
    this._ghost.rotation.y = 0;
    this._ghost.scaling.set(cols, 1, rows);
    if (this._ghostMat) this._ghostMat.emissiveColor = this._floorRemove
      ? new BABYLON.Color3(0.5, 0.1, 0.12) : new BABYLON.Color3(0.1, 0.45, 0.2);
  }

  _floorAt(pos, tol = 1.8) {
    return this._placed.some(e => e.record?.pieceId === 'floor' && e.root?.position &&
      Math.abs(e.root.position.x - pos.x) < tol && Math.abs(e.root.position.z - pos.z) < tol &&
      Math.abs(e.root.position.y - pos.y) < 2);
  }

  _commitFloor(A, B) {
    const r = this._floorRect(A, B);
    const src = this._ghostSrc, fromInv = !!src?._fromInventory;
    for (let ix = r.x0; ix <= r.x1; ix++) {
      for (let iz = r.z0; iz <= r.z1; iz++) {
        const pos = new BABYLON.Vector3(ix * r.PW, A.y, iz * r.PW);
        if (this._floorRemove) {
          this._removeFloorAt(pos);
        } else {
          if (this._floorAt(pos)) continue;                  // já tem laje aqui
          if (fromInv && this._buildableStock(src.assetId) <= 0) { this._leavePlacing(); return; }
          this._placePieceAt(pos, 0, 1, { pieceId: 'floor' }, true);
          if (fromInv) window._gameInventory?.consumeBuildable?.(src.assetId, 1);
        }
      }
    }
  }

  _removeFloorAt(pos, tol = 1.8) {
    for (let i = this._placed.length - 1; i >= 0; i--) {
      const e = this._placed[i];
      if (e.record?.pieceId !== 'floor' || !e.root?.position) continue;
      const p = e.root.position;
      if (Math.abs(p.x - pos.x) < tol && Math.abs(p.z - pos.z) < tol && Math.abs(p.y - pos.y) < 2) {
        this._disposeColliderArtifacts(e.root);
        try { e.root.dispose(); } catch (_) {}
        if (e.worldId) { this._worldEntries?.delete(e.worldId); WorldObjects.remove(e.worldId); }
        this._placed.splice(i, 1);
      }
    }
    this._save();
  }

  /** @deprecated — mantido para compat; use preUpdate + update no lugar */
  onClick() {
    if (this._state !== 'placing' || !this._ghost) return false;
    this._placeAt(this._ghost.position.clone(), this._rotY, this._scaleM);
    this._offX = this._offY = this._offZ = 0;
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  //  Colocar objeto no mundo
  // ══════════════════════════════════════════════════════════════════
  async _placeAt(pos, rotY, scale) {
    const item = this._ghostSrc;
    if (!item) return;

    // ── Quadro / Picture Frame ─────────────────────────────────────
    if (item.kind === 'frame') {
      await this._buildFrameAt(pos, rotY, scale, item.imageUrl, item.prompt);
      return;
    }

    // ── Peça PROCEDURAL de construção ──────────────────────────────
    if (item.kind === 'piece' || item.pieceId) {
      await this._placePieceAt(pos, rotY, scale, item);
      return;
    }

    // Item especial: Máquina de Criação
    if (item.special === 'assetMachine') {
      const { AssetMachine } = await import('../items/AssetMachine.js');
      const machineId = 'mac_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
      new AssetMachine(
        this.scene,
        window._meshyPanel,
        window._gamePlayer,
        window._gameInput,
        pos,
        machineId,
      );
      this._placed.push({ record: { id: 'assetMachine', p: [pos.x, pos.y, pos.z] }, root: null });
      this._save();
      return;
    }

    // Item GLB normal
    const url    = item.glbUrl || item.path;
    const gProps = item.groupProps || {};

    // Reusa o blob já resolvido pelo ghost (_selectItem), senão resolve agora
    let folder, file, extHint;
    if (item._resolvedFile) {
      folder = item._resolvedFolder || ''; file = item._resolvedFile; extHint = item._resolvedExt;
    } else {
      const ld = await this._resolveLoadable(url);
      if (!ld) { console.warn('[BuildMode] URL inválida ao colocar:', url); return; }
      ({ folder, file, extHint } = ld);
    }

    try {
      const res  = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene, null, extHint);
      const root = res.meshes[0];
      const uid  = `placed_${item.id}_${this._placed.length}`;
      root.name  = uid;
      root.rotationQuaternion = null;   // senão .rotation.y é ignorado
      root.position.copyFrom(pos);
      root.rotation.y = rotY;
      root.scaling.setAll(scale);

      // ── Colisão conforme as propriedades do objeto ──────────────────
      this._applyCollisionProps(root, res.meshes, gProps);
      if (gProps.castShadows !== false) {
        this.level?.shadowGen?.addShadowCaster?.(root, true);
      }
      // (colisão + gameplay já aplicados em _applyCollisionProps acima)

      const record = {
        id: item.id, name: uid, url,
        p: [pos.x, pos.y, pos.z], ry: rotY, sc: scale,
        groupProps: gProps,
      };
      const entry = { record, root };
      this._placed.push(entry);
      this._save();
      this._persistPlaced(entry);   // mundo compartilhado (no-op se offline)
    } catch (e) {
      console.warn('[BuildMode] falha ao colocar:', e.message);
    }
  }

  /**
   * Aplica uma ESCALA a TODOS os objetos colocados de um mesmo tipo (assetId).
   * Atualiza o mesh, o colisor/física e o record salvo. Salva a escala como
   * padrão do asset (novos spawns já nascem com ela). Retorna quantos mudaram.
   */
  async applyScaleToAll(assetId, scale) {
    scale = Math.max(0.05, Math.min(20, scale));
    let n = 0;
    for (const entry of this._placed) {
      const rec = entry.record;
      if (!rec || rec.id !== assetId || !entry.root) continue;
      entry.root.scaling.setAll(scale);
      rec.sc = scale;
      // Reaplica colisão/física no novo tamanho (recria o corpo se preciso)
      try {
        const meshes = [entry.root, ...entry.root.getChildMeshes(false)];
        this._applyCollisionProps(entry.root, meshes, rec.groupProps || {});
      } catch (_) {}
      n++;
    }
    // Também aplica nas caixas/barris FIXOS do mapa (sistema do Level) que
    //  compartilham o mesmo assetId → unifica os dois sistemas.
    let mFixed = 0;
    try { mFixed = this.level?.applyObstacleScale?.(assetId, scale) || 0; } catch (_) {}
    n += mFixed;

    // persiste a escala padrão + os records atualizados
    try { await AssetGroups.setDefaultScale(assetId, scale); } catch (_) {}
    this._save();
    // mundo mudou → regenera navmesh
    window._navMesh?.markDirty?.();
    console.log(`[BuildMode] escala ${scale} aplicada a ${n} "${assetId}" (${mFixed} fixos)`);
    return n;
  }

  /**
   * Tem colisor? Física SEMPRE tem (o corpo é o colisor). Sem física, é
   * sólido por padrão; só atravessa com `collide:false` explícito
   * (portais/efeitos/spells). Ignora o legado `collidable` (que conflitava).
   */
  _hasCollider(gProps = {}) {
    if (gProps.physics) return true;
    return gProps.collide ?? true;
  }

  /**
   * Aplica a colisão conforme as propriedades:
   *  • SEM colisor          → atravessa (portal/efeito/spell): nada colide
   *  • colisor + SEM física → estático sólido (plataforma; pode "flutuar")
   *  • colisor + física     → corpo dinâmico Havok cuida (malhas só visuais)
   */
  _applyCollisionProps(root, meshes, gProps = {}) {
    const collide = this._hasCollider(gProps);
    if (!collide) {
      // Atravessável: sem colisão nem picking (mas o tiro pode passar reto).
      meshes.forEach(m => { m.checkCollisions = false; m.isPickable = false; });
      this._applyPlacedGameplay(root, gProps);   // (física p/ efeito? normalmente não)
      return;
    }
    if (gProps.physics) {
      meshes.forEach(m => { m.isPickable = false; });   // corpo Havok cuida da colisão
    } else {
      meshes.forEach(m => { m.checkCollisions = true; m.isPickable = true; });
      optimizeCollider(root, this.scene);               // estático sólido (anti-lag)
    }
    this._applyPlacedGameplay(root, gProps);
  }

  /**
   * Aplica física/quebrável/coletável a um objeto colocado, criando um
   * GameObject (via Level). Só quando o grupo pede física/quebra/coleta —
   * objetos só-colisão (Construção) não viram GameObject.
   */
  _applyPlacedGameplay(root, gProps = {}) {
    if (!window._gameLevel) return null;
    // Sem colisor → atravessável (efeito/portal): sem gameplay físico.
    if (!this._hasCollider(gProps)) return null;
    const wants = gProps.physics || gProps.breakable || gProps.collectable;
    if (!wants) return null;

    const config = {
      isBreakable:   !!gProps.breakable,
      hasPhysics:    !!gProps.physics,
      isCollectable: !!gProps.collectable,
      hp:            gProps.hp     ?? 3,
      bounce:        gProps.bounce ?? 0.22,
    };

    const bb = root.getHierarchyBoundingVectors?.(true);
    if (config.hasPhysics && bb) {
      // Caixa invisível como corpo físico; o GLB é só o visual
      const size   = bb.max.subtract(bb.min);
      const center = bb.min.add(bb.max).scale(0.5);
      const w = Math.max(0.3, size.x), h = Math.max(0.3, size.y), d = Math.max(0.3, size.z);
      const body = BABYLON.MeshBuilder.CreateBox(`${root.name}_col`, { width:w, height:h, depth:d }, this.scene);
      body.position.copyFrom(center);
      body.isVisible       = false;
      body.isPickable      = true;
      body.checkCollisions = true;
      // Ellipsoid = meio-tamanho real → não afunda no chão (o fundo do
      // objeto encosta no chão em vez do ellipsoid fixo 0.62).
      body.ellipsoid = new BABYLON.Vector3(w / 2, h / 2, d / 2);
      return window._gameLevel.addInteractiveObject({ mesh: body, glb: root, customEllipsoid: true, ...config });
    }
    return window._gameLevel.addInteractiveObject({ mesh: root, ...config });
  }

  /**
   * Coloca uma PEÇA procedural (parede/porta/janela/chão) no mundo, com
   * colisor estático (Havok BOX por caixa → vão da porta atravessável),
   * sombra e persistência. @param save false durante restauração.
   */
  async _placePieceAt(pos, rotY, scale, item, save = true, scl3 = null) {
    const { buildPiece, makePieceBodies } = await import('./BuildPieces.js');
    const uid  = `placed_${item.pieceId}_${this._placed.length}_${Date.now().toString(36)}`;
    const root = buildPiece(item.pieceId, this.scene, uid);
    if (!root) return null;
    root.position.copyFrom(pos);
    root.rotation.y = rotY;
    if (scl3) root.scaling.set(scl3[0], scl3[1], scl3[2]);     // parede esticada (A→B)
    else      root.scaling.setAll(scale);
    root.computeWorldMatrix(true);
    root.getChildMeshes(false).forEach(m => m.computeWorldMatrix(true));

    makePieceBodies(root, this.scene);                         // colisor estático
    // sombra: adiciona as MALHAS filhas (não a raiz TransformNode — o CSM
    //  chama getBoundingInfo no caster e TransformNode não tem → crashava)
    const sg = this.level?.shadowGen;
    if (sg) root.getChildMeshes(false).forEach(m => { try { sg.addShadowCaster(m); } catch (_) {} });

    const record = { kind: 'piece', pieceId: item.pieceId, name: uid,
                     p: [pos.x, pos.y, pos.z], ry: rotY, sc: scale };
    if (scl3) record.s = scl3;
    const entry = { record, root };
    this._placed.push(entry);
    if (save) { this._save(); this._persistPlaced(entry); }   // user action → persiste no mundo
    return entry;
  }

  async _save() {
    // No mundo compartilhado a verdade é o Supabase (world_objects); não grava
    // o bucket local 'placed' pra não duplicar no reload. Navmesh segue marcada.
    if (this._sharedWorld) { window._navMesh?.markDirty?.(); return; }
    // Quadros têm seu próprio bucket (placed_frames); filtra aqui
    try { await LocalDB.save('placed', this._placed.filter(p => p.record?.kind !== 'frame').map(p => p.record)); } catch (_) {}
    // Mundo mudou (coloquei/movi/removi algo) → regera a navmesh (debounce).
    window._navMesh?.markDirty?.();
  }

  /**
   * Remove os colisores/corpos físicos gerados por um objeto colocado:
   *  • corpo Havok estático (root._staticBody)
   *  • GameObject (corpo dinâmico/quebrável/coletável)
   *  • caixas colisoras invisíveis nomeadas (_scol / _boxcol / _col)
   * Sem isso, o VISUAL some mas o colisor INVISÍVEL fica → "algo me bloqueia".
   */
  _disposeColliderArtifacts(root) {
    if (!root) return;
    try { root._staticBody?.dispose?.(); } catch (_) {}
    root._staticBody = null;
    // corpos físicos de peça procedural (parede/porta/etc.)
    if (root._pieceBodies) { for (const a of root._pieceBodies) { try { a.dispose(); } catch (_) {} } root._pieceBodies = null; }
    try { root._gameObject?.dispose?.(); } catch (_) {}
    root._gameObject = null;
    const nm = root.name || '';
    for (const sfx of ['_scol', '_boxcol', '_col']) {
      const m = this.scene.getMeshByName(nm + sfx);
      if (m) { try { m.physicsBody?.dispose?.(); } catch (_) {} try { m.dispose(); } catch (_) {} }
    }
  }

  /**
   * Varre a cena por colisores/ghosts ÓRFÃOS de placement (proxy invisível
   * cujo dono sumiu, ghosts esquecidos). NÃO toca no mapa-base (clean_*,
   * ground, etc.) — só em coisas de placement. Devolve quantos removeu.
   */
  _sweepOrphanColliders() {
    let n = 0;
    const isPlacementName = nm =>
      /^(placed_|mac_|__assetMachine|_ghost|_gf_|_gfm|_gfbm)/.test(nm);
    for (const m of this.scene.meshes.slice()) {
      const nm = m.name || '';
      // proxy de colisão de placement OU mesh de placement com corpo Havok
      const isProxy = (m._isBoxCol || /_(scol|boxcol|col)$/.test(nm)) && isPlacementName(nm.replace(/_(scol|boxcol|col)$/, ''));
      const isStrayPlacement = isPlacementName(nm) && (m.physicsBody || m._staticBody || m.checkCollisions);
      if (isProxy || isStrayPlacement || nm.startsWith('_ghost')) {
        try { m.physicsBody?.dispose?.(); } catch (_) {}
        try { m._staticBody?.dispose?.(); } catch (_) {}
        try { m.dispose(); } catch (_) {}
        n++;
      }
    }
    return n;
  }

  /**
   * LIMPA TODO O TERRENO colocado pelo jogador: objetos do [B], quadros,
   * máquinas de criação e corpos/colisores órfãos. Zera a persistência
   * (LocalDB) pra não voltarem no F5. Mantém o mapa-base intacto.
   * @returns {Promise<object>} contagem do que foi removido
   */
  async clearAllTerrain() {
    const counts = { placed: 0, machines: 0, bodies: 0 };

    // 1) Objetos colocados (inclui quadros) + seus colisores
    for (const entry of this._placed) {
      try { this._disposeColliderArtifacts(entry.root); } catch (_) {}
      try { entry.root?.dispose(false, true); } catch (_) {}
      counts.placed++;
    }
    this._placed = [];

    // 2) Máquinas de criação (grupo inteiro: chassi, raio, holograma…)
    //  NÃO chamamos mac._unpersist() aqui: ele é async e faz read-modify-write
    //  concorrente que sobrescreveria o save([]) abaixo (corrida). O save([])
    //  no passo 4 já zera tudo de uma vez.
    for (const mac of (window._assetMachines || []).slice()) {
      try { mac.dispose(); } catch (_) {}
      counts.machines++;
    }

    // 3) Colisores/ghosts órfãos deixados por edições/saves antigos
    counts.bodies = this._sweepOrphanColliders();

    // 4) Zera a persistência (senão volta tudo no F5)
    try { await LocalDB.save('placed', []); }          catch (_) {}
    try { await LocalDB.save('placed_frames', []); }   catch (_) {}
    try { await LocalDB.save('machines_placed', []); } catch (_) {}

    window._navMesh?.markDirty?.();
    console.log(`[BuildMode] 🧹 terreno limpo — ${counts.placed} objeto(s), ${counts.machines} máquina(s), ${counts.bodies} corpo(s)/colisor(es) órfão(s)`);
    this._renderCatalog?.();
    return counts;
  }

  _undo() {
    const last = this._placed.pop();
    if (!last) return;
    this._disposeColliderArtifacts(last.root);   // corpos da peça/colisor
    try { last.root?.dispose(); } catch (_) {}
    // Mundo compartilhado: remove do Supabase (todos deixam de ver).
    if (last.worldId) { this._worldEntries?.delete(last.worldId); WorldObjects.remove(last.worldId); }
    // Quadros têm persitência separada
    if (last.record?.kind === 'frame') {
      LocalDB.get('placed_frames', []).then(frames => {
        LocalDB.save('placed_frames', frames.filter(f => f.id !== last.record.id));
      }).catch(() => {});
    }
    this._save();
  }

  // ── Adiciona item ao catálogo (chamado pelo MeshyPanel ao salvar) ─
  addToCatalog(item) {
    this._catalog.unshift(item);
    this._renderCatalog();
  }

  /**
   * Spawna um asset da biblioteca (chamado pelo AssetGroupsUI).
   * _selectItem já carrega o ghost e entra em modo placing (1ª pessoa,
   * mira para posicionar) — igual aos objetos do catálogo [B].
   */
  async spawnAsset(item) {
    await this._selectItem({
      kind:       item.kind || 'generated',
      id:         item.id,
      name:       item.name,
      glbUrl:     item.glbUrl,
      pieceId:    item.pieceId,
      drag:       item.drag,
      groupProps: item.groupProps || {},
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  Quadros / Picture Frames
  // ══════════════════════════════════════════════════════════════════

  /**
   * Chamado pelo MeshyPanel: entra no modo de posicionar um quadro.
   * Cria um ghost translúcido (sem textura) para o preview de posição.
   */
  startFramePlacing(imageUrl, prompt) {
    this._ghostSrc = {
      kind: 'frame',
      id:   'frame_' + Date.now(),
      name: '🖼️ ' + (prompt ? prompt.slice(0, 28) : 'Quadro'),
      imageUrl, prompt,
    };
    this._rotY   = 0;
    this._scaleM = 1.0;
    this._offX = this._offY = this._offZ = 0;
    this._disposeGhost();

    // Ghost (sem textura — só forma)
    const root = new BABYLON.TransformNode('_ghostFrame', this.scene);
    const all  = [root];

    const gm = new BABYLON.StandardMaterial('_gfm', this.scene);
    gm.emissiveColor   = new BABYLON.Color3(0.25, 0.9, 0.45);
    gm.alpha           = 0.50;
    gm.disableLighting = true;
    gm.backFaceCulling = false;

    const bm = new BABYLON.StandardMaterial('_gfbm', this.scene);
    bm.emissiveColor   = new BABYLON.Color3(0.85, 0.65, 0.1);
    bm.alpha           = 0.75;
    bm.disableLighting = true;
    bm.backFaceCulling = false;

    const face = BABYLON.MeshBuilder.CreatePlane('_gf_face', { width: 1.7, height: 1.7 }, this.scene);
    face.parent = root; face.material = gm; face.isPickable = false;
    all.push(face);

    const B = 0.17, HALF = 1.7 / 2 + B / 2;
    [
      { w: 1.7 + B * 2, h: B, x: 0, y:  HALF },
      { w: 1.7 + B * 2, h: B, x: 0, y: -HALF },
      { w: B, h: 1.7 + B * 2, x: -HALF, y: 0 },
      { w: B, h: 1.7 + B * 2, x:  HALF, y: 0 },
    ].forEach(e => {
      const m = BABYLON.MeshBuilder.CreatePlane('_gf_edge', { width: e.w, height: e.h }, this.scene);
      m.parent = root; m.position.set(e.x, e.y, 0); m.material = bm; m.isPickable = false;
      all.push(m);
    });

    this._ghost       = root;
    this._ghostMeshes = all;

    // Entra direto em placing (não abre o catálogo)
    this._state = 'placing';
    this._el.style.display  = 'none';
    this._hud.style.display = 'block';
    this._ch.style.display  = 'block';
    this._setHUDItem(this._ghostSrc.name);
    this._setHUDMode('T');

    const inp = window._gameInput;
    if (inp) {
      this._savedOnDeactivated = inp.onDeactivated;
      inp.onDeactivated = () => this._leavePlacing();
    }
    inp?.activate?.();
  }

  /**
   * Constrói o quadro definitivo (com textura) e o registra no mundo/DB.
   * @param {boolean} save  false durante restauração (não regrava o banco)
   */
  async _buildFrameAt(pos, rotY, scale, imageUrl, prompt, save = true) {
    const uid = 'placed_frame_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const root = new BABYLON.TransformNode(uid, this.scene);
    root.position.copyFrom(pos);
    root.rotation.y = rotY;
    root.scaling.setAll(scale);

    // ── Fundo escuro ─────────────────────────────────────────────────
    const backMat = new BABYLON.StandardMaterial(uid + '_bk', this.scene);
    backMat.emissiveColor   = new BABYLON.Color3(0.04, 0.04, 0.06);
    backMat.disableLighting = true;
    backMat.backFaceCulling = false;
    const back = BABYLON.MeshBuilder.CreatePlane(uid + '_bk', { width: 1.95, height: 1.95 }, this.scene);
    back.parent = root; back.material = backMat; back.isPickable = false;

    // ── Imagem: local carrega direto; só CDN http via proxy ───────────
    let texUrl = imageUrl;
    if (/^https?:/.test(imageUrl)) try {
      const r = await fetch(`http://127.0.0.1:3099/proxy-image?url=${encodeURIComponent(imageUrl)}`,
        { signal: AbortSignal.timeout(6000) });
      if (r.ok) texUrl = URL.createObjectURL(await r.blob());
    } catch (_) {}

    const tex = new BABYLON.Texture(texUrl, this.scene, false, true);
    tex.uScale = -1;
    const imgMat = new BABYLON.StandardMaterial(uid + '_img', this.scene);
    imgMat.diffuseTexture  = tex;
    imgMat.emissiveTexture = tex;
    imgMat.emissiveColor   = new BABYLON.Color3(0.88, 0.88, 0.88);
    imgMat.disableLighting = true;
    imgMat.backFaceCulling = false;
    const imgPlane = BABYLON.MeshBuilder.CreatePlane(uid + '_img', { width: 1.72, height: 1.72 }, this.scene);
    imgPlane.parent = root; imgPlane.position.z = 0.02;
    imgPlane.material = imgMat; imgPlane.isPickable = false;

    // ── Moldura dourada ───────────────────────────────────────────────
    const goldMat = new BABYLON.StandardMaterial(uid + '_gold', this.scene);
    goldMat.diffuseColor  = new BABYLON.Color3(0.78, 0.62, 0.14);
    goldMat.emissiveColor = new BABYLON.Color3(0.22, 0.16, 0.02);
    goldMat.specularColor = new BABYLON.Color3(1.0, 0.88, 0.35);
    goldMat.specularPower = 56;

    const B = 0.155, D = 0.07, HALF = 1.72 / 2 + B / 2;
    [
      { w: 1.72 + B * 2, h: B, d: D, x:    0, y:  HALF },
      { w: 1.72 + B * 2, h: B, d: D, x:    0, y: -HALF },
      { w: B, h: 1.72 + B * 2, d: D, x: -HALF, y: 0 },
      { w: B, h: 1.72 + B * 2, d: D, x:  HALF, y: 0 },
    ].forEach(e => {
      const m = BABYLON.MeshBuilder.CreateBox(uid + '_edge', { width: e.w, height: e.h, depth: e.d }, this.scene);
      m.parent = root; m.position.set(e.x, e.y, e.z ?? 0.01);
      m.material = goldMat; m.isPickable = false;
    });

    // ── Persiste ──────────────────────────────────────────────────────
    const record = { kind: 'frame', id: uid, imageUrl, prompt: prompt || '', p: [pos.x, pos.y, pos.z], ry: rotY, sc: scale };
    this._placed.push({ record, root });

    if (save) {
      let frames = [];
      try { frames = await LocalDB.get('placed_frames', []); } catch (_) {}
      frames.push(record);
      await LocalDB.save('placed_frames', frames);
    }
  }

  /** Restaura todos os quadros salvos (chamado no construtor) */
  async _restoreFrames() {
    try {
      const frames = await LocalDB.get('placed_frames', []);
      for (const f of frames) {
        await this._buildFrameAt(
          new BABYLON.Vector3(f.p[0], f.p[1], f.p[2]),
          f.ry ?? 0, f.sc ?? 1.0,
          f.imageUrl, f.prompt,
          false,   // não re-salva
        ).catch(e => console.warn('[BuildMode] quadro falhou ao restaurar:', e.message));
      }
      if (frames.length) console.log(`[BuildMode] 🖼️ ${frames.length} quadro(s) restaurado(s)`);
    } catch (e) {
      console.warn('[BuildMode] _restoreFrames erro:', e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  Helpers internos
  // ══════════════════════════════════════════════════════════════════
  _groundPoint() {
    const eng = this.scene.getEngine();
    const ray = this.scene.createPickingRay(
      eng.getRenderWidth()  / 2,
      eng.getRenderHeight() / 2,
      BABYLON.Matrix.Identity(),
      this.scene.activeCamera,
    );
    const hit = this.scene.pickWithRay(
      ray,
      m => m.checkCollisions === true && m.isPickable !== false && !m.name.startsWith('_ghost'),
    );
    return (hit?.hit && hit.pickedPoint) ? hit.pickedPoint : null;
  }

  _edge(code) {
    const now  = !!this._keys[code];
    const prev = !!this._prev[code];
    this._prev[code] = now;
    return now && !prev;
  }

  _held(code) { return !!this._keys[code]; }
}
