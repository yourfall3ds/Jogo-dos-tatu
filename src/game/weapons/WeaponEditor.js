import { LocalDB } from '../data/LocalDB.js';

/**
 * WeaponEditor  —  Editor visual de armas em runtime.
 *
 * ─ Abre com F4 ou botão "🔧 Ajustar Armas" no menu de pausa.
 * ─ Botão "🎬 ENTRAR NA CENA" oculta todo o jogo e mostra só a arma.
 * ─ Esfera verde = ponto exato de onde a bala sai.
 * ─ "🎯 Testar Tiro" dispara um traçador visível para confirmar.
 * ─ "⬇️ Salvar arquivo .js" gera o arquivo COMPLETO e abre o diálogo
 *    de salvar do sistema operacional (Chrome/Edge) ou faz download.
 *    Basta substituir o arquivo em src/game/weapons/ e está salvo pra sempre.
 *
 * Fluxo de carregamento correto:
 *   new WeaponEditor(ws, scene)           ← cria ANTES dos GLBs
 *     └─ _loadAllSavedConfigs()           ← aplica LocalDB nas classes
 *   [GLBs carregam → setGLBWeapon → applyToMesh usa os valores salvos ✓]
 */
export class WeaponEditor {
  constructor(weaponSystem, scene) {
    this._ws    = weaponSystem;
    this._scene = scene;
    this._active     = false;
    this._cleanMode  = false;
    this._toastTimer = null;

    // objetos temporários da cena limpa
    this._editorCam    = null;
    this._editorFloor  = null;
    this._editorTarget = null;
    this._muzzleSphere = null;
    this._testTracer   = null;

    this._init();
    this._buildPanel();
    this._buildKeyShortcut();
  }

  async _init() {
    await this._loadAllSavedConfigs();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Persistência — LocalDB
  // ═══════════════════════════════════════════════════════════════════

  async _loadAllSavedConfigs() {
    const dbWeapons = await LocalDB.get('weapons', {});
    if (Object.keys(dbWeapons).length === 0) return;

    for (const w of this._ws.weapons) {
      const cfg = dbWeapons[w.id];
      if (cfg) {
        try { 
          this._applyCfg(w, cfg); 
          console.log(`[WeaponEditor] ✅ ${w.id} carregado do LocalDB`); 
        } catch (e) { 
          console.warn('[WeaponEditor] config corrompida:', e); 
        }
      }
    }
  }

  _applyCfg(w, c) {
    const V = (...a) => new BABYLON.Vector3(...a);
    if (c.viewmodelScale != null) w.viewmodelScale    = c.viewmodelScale;
    if (c.pos)    w.viewmodelPosition = V(...c.pos);
    if (c.rot)    w.viewmodelRotation = V(...c.rot);
    if (c.muzzle) w.muzzleOffset      = V(...c.muzzle);
    if (c.tpsScale != null) w.tpsScale = c.tpsScale;
    if (c.tpsRot) w.tpsRotation = V(...c.tpsRot);
    if (c.tpsPos) w.tpsPosition = V(...c.tpsPos);
    if (c.tracerColor) w.tracerColor = c.tracerColor;
    if (c.tracerAlpha != null) w.tracerAlpha = c.tracerAlpha;
  }

  _buildCfg(w) {
    const a3 = v => [v.x, v.y, v.z];
    return {
      label: w.label,
      damage: w.damage,
      fireRate: w.fireRate,
      maxAmmo: w.maxAmmo,
      viewmodelScale: w.viewmodelScale,
      pos: a3(w.viewmodelPosition), rot: a3(w.viewmodelRotation),
      muzzle: a3(w.muzzleOffset),
      tpsScale: w.tpsScale, tpsRot: a3(w.tpsRotation), tpsPos: a3(w.tpsPosition),
      tracerColor: w.tracerColor ?? [1,1,0.6],
      tracerAlpha: w.tracerAlpha ?? 0.6,
    };
  }

  async _save() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;
    
    const dbWeapons = await LocalDB.get('weapons', {});
    dbWeapons[w.id] = this._buildCfg(w);
    
    const ok = await LocalDB.save('weapons', dbWeapons);
    if (ok) this._toast(`💾 Salvo no LocalDB.`, '#023040');
    else    this._toast(`❌ Erro ao salvar no LocalDB.`, '#400202');
  }

  async _reset() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;
    
    const dbWeapons = await LocalDB.get('weapons', {});
    delete dbWeapons[w.id];
    
    await LocalDB.save('weapons', dbWeapons);
    this._toast('↩ Config removida do LocalDB.\nRecarregue para voltar ao padrão.', '#300');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Cena limpa
  // ═══════════════════════════════════════════════════════════════════

  static LAYER_EDITOR = 0x10000000;  // bit 28 — não colide com padrão (bits 0-27)

  _enterCleanMode() {
    if (this._cleanMode) return;
    this._cleanMode = true;

    const sc = this._scene;
    // Usa a câmera da arma (que é a câmera FPS real do jogador)
    const cam = this._ws.camera;

    // ── Salva estado ─────────────────────────────────────────────────
    this._savedCamLayer = cam.layerMask;
    this._savedFogMode  = sc.fogMode;
    this._savedClearClr = sc.clearColor.clone();
    this._savedActiveCamera = sc.activeCamera;

    // ── Muda câmera: só vê LAYER_EDITOR (arma + objetos do editor)  ──
    cam.layerMask = WeaponEditor.LAYER_EDITOR;
    sc.activeCamera = cam;

    // ── Torna a arma visível na câmera do editor ─────────────────────
    this._setWeaponLayer(WeaponEditor.LAYER_EDITOR);

    // ── Fundo escuro + sem névoa ─────────────────────────────────────
    sc.fogMode    = BABYLON.Scene.FOGMODE_NONE;
    sc.clearColor = new BABYLON.Color4(0.04, 0.04, 0.09, 1);

    // ── Objetos de referência do editor ─────────────────────────────
    this._buildEditorObjects(cam);

    this._panel.querySelector('#wed_scene_btn').textContent = '⬅️ Sair da Cena';
    this._toast('🎬 Cena limpa. Esfera verde = boca da arma.', '#082040');
  }

  _exitCleanMode() {
    if (!this._cleanMode) return;
    this._cleanMode = false;

    const sc   = this._scene;
    const cam  = this._ws.camera;

    // Restaura câmera e cena
    cam.layerMask   = this._savedCamLayer;
    sc.activeCamera = this._savedActiveCamera;
    sc.fogMode      = this._savedFogMode;
    sc.clearColor.copyFrom(this._savedClearClr);

    // Restaura layerMask da arma para o padrão (visível por todas as câmeras)
    this._setWeaponLayer(0x0FFFFFFF);

    // Remove objetos do editor
    this._muzzleSphere?.dispose();  this._muzzleSphere  = null;
    this._editorFloor?.dispose();   this._editorFloor   = null;
    this._editorTarget?.dispose();  this._editorTarget  = null;
    this._testTracer?.dispose();    this._testTracer    = null;

    this._panel.querySelector('#wed_scene_btn').textContent = '🎬 Entrar na Cena';
  }

  _buildEditorObjects(cam) {
    const sc = this._scene;

    const camPos  = cam.globalPosition ?? cam.position;
    const forward = cam.getDirection(BABYLON.Vector3.Forward());
    const floorY  = camPos.y - 1.75;

    // ── Grid de chão ──────────────────────────────────────────────────
    const floor = BABYLON.MeshBuilder.CreateGround('_edFloor',
      { width: 40, height: 40, subdivisions: 24 }, sc);
    const floorMat = new BABYLON.StandardMaterial('_edFloorMat', sc);
    floorMat.wireframe    = true;
    floorMat.emissiveColor = new BABYLON.Color3(0.12, 0.22, 0.42);
    floor.material  = floorMat;
    floor.position.set(Math.round(camPos.x), floorY, Math.round(camPos.z));
    floor.layerMask  = WeaponEditor.LAYER_EDITOR;
    floor.isPickable = false;
    this._editorFloor = floor;

    // ── Alvo vermelho (4m à frente) ───────────────────────────────────
    const tgtPos = camPos.add(forward.scale(4));
    const target = BABYLON.MeshBuilder.CreateBox('_edTarget',
      { width: 0.5, height: 1.0, depth: 0.08 }, sc);
    const tgtMat = new BABYLON.StandardMaterial('_edTargetMat', sc);
    tgtMat.emissiveColor = new BABYLON.Color3(0.85, 0.18, 0.1);
    tgtMat.disableLighting = true;
    target.material  = tgtMat;
    target.position.copyFrom(tgtPos);
    target.position.y = floorY + 0.5;
    target.layerMask  = WeaponEditor.LAYER_EDITOR;
    target.isPickable = false;
    this._editorTarget = target;

    // ── Esfera verde = ponto exato de saída da bala (muzzle) ──────────
    const smat = new BABYLON.StandardMaterial('_edMuzMat', sc);
    smat.emissiveColor   = new BABYLON.Color3(0.1, 1, 0.3);
    smat.disableLighting = true;
    const sphere = BABYLON.MeshBuilder.CreateSphere('_edMuz',
      { diameter: 0.05, segments: 5 }, sc);
    sphere.material  = smat;
    sphere.isPickable = false;
    sphere.layerMask  = WeaponEditor.LAYER_EDITOR;
    sphere.parent     = this._ws._muzzlePoint;
    this._muzzleSphere = sphere;
  }

  _setWeaponLayer(layer) {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;
    const mesh = this._ws._weaponMeshes[w.id];
    if (!mesh) return;
    mesh.layerMask = layer;
    mesh.getChildMeshes().forEach(m => { m.layerMask = layer; });
  }

  _testFire() {
    if (!this._cleanMode) { this._toast('Entre na cena limpa primeiro (🎬)', '#402'); return; }

    this._testTracer?.dispose();

    const muzzlePos = this._ws._muzzlePoint.getAbsolutePosition();
    const cam = this._ws.camera;
    const forward   = cam.getDirection(BABYLON.Vector3.Forward());
    const endPos    = muzzlePos.add(forward.scale(8));

    const dist = BABYLON.Vector3.Distance(muzzlePos, endPos);
    const mid  = BABYLON.Vector3.Lerp(muzzlePos, endPos, 0.5);

    const mat = new BABYLON.StandardMaterial('_edTracerMat', this._scene);
    mat.emissiveColor = new BABYLON.Color3(
      ...(this._ws.getCurrentWeapon()?.tracerColor ?? [1, 1, 0.6])
    );
    mat.disableLighting = true;
    mat.alpha = 0.85;

    const tracer = BABYLON.MeshBuilder.CreateBox('_edTracer',
      { width: 0.02, height: 0.02, depth: dist }, this._scene);
    tracer.material    = mat;
    tracer.position.copyFrom(mid);
    tracer.lookAt(endPos);
    tracer.layerMask   = WeaponEditor.LAYER_EDITOR;
    tracer.isPickable  = false;
    this._testTracer = tracer;

    if (this._muzzleSphere) {
      this._muzzleSphere.scaling.setAll(2.5);
      setTimeout(() => { if (this._muzzleSphere) this._muzzleSphere.scaling.setAll(1); }, 80);
    }

    clearTimeout(this._tracerTimer);
    this._tracerTimer = setTimeout(() => {
      tracer.dispose();
      if (this._testTracer === tracer) this._testTracer = null;
    }, 800);
  }

  _copyCode() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;
    const f = v => (+v).toFixed(4);
    const tc = w.tracerColor ?? [1,1,0.6];
    const code =
`// ── ${w.label ?? w.id} ── cole no constructor:
this.viewmodelScale    = ${f(w.viewmodelScale)};
this.viewmodelPosition = new BABYLON.Vector3(${f(w.viewmodelPosition.x)}, ${f(w.viewmodelPosition.y)}, ${f(w.viewmodelPosition.z)});
this.viewmodelRotation = new BABYLON.Vector3(${f(w.viewmodelRotation.x)}, ${f(w.viewmodelRotation.y)}, ${f(w.viewmodelRotation.z)});
this.muzzleOffset      = new BABYLON.Vector3(${f(w.muzzleOffset.x)}, ${f(w.muzzleOffset.y)}, ${f(w.muzzleOffset.z)});
this.tpsScale          = ${f(w.tpsScale)};
this.tpsRotation       = new BABYLON.Vector3(${f(w.tpsRotation.x)}, ${f(w.tpsRotation.y)}, ${f(w.tpsRotation.z)});
this.tracerColor       = [${tc.map(f).join(', ')}];
this.tracerAlpha       = ${f(w.tracerAlpha ?? 0.6)};`;

    const out = this._panel.querySelector('#wed_code');
    if (out) {
      out.textContent = code; out.style.display = 'block';
    }
    navigator.clipboard?.writeText(code)
      .then(()  => this._toast('📋 Copiado!', '#002040'))
      .catch(()  => this._toast('📋 Selecione o texto acima e copie (Ctrl+C)', '#202000'));
  }

  _downloadWeaponFile() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;

    const classMap = {
      pistol: ['PistolaBucaneira', 'PistolaBucaneira.js'],
      rifle:  ['RiflePesado',      'RiflePesado.js'],
    };
    const [cls, filename] = classMap[w.id] ?? [`Weapon_${w.id}`, `${w.id}.js`];
    const code = this._generateWeaponClass(w, cls);

    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }],
      }).then(async handle => {
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
        this._toast(`✅ ${filename} salvo! Substitua o arquivo em src/game/weapons/ e recarregue.`, '#0a3a1a');
      }).catch(e => {
        if (e.name !== 'AbortError') this._fallbackDownload(code, filename);
      });
    } else {
      this._fallbackDownload(code, filename);
    }
  }

  _fallbackDownload(code, filename) {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    this._toast(`⬇️ Baixado: ${filename}\nSubstitua em src/game/weapons/ e recarregue.`, '#0a2040');
  }

  _generateWeaponClass(w, cls) {
    const f  = n => (+n).toFixed(4);
    const tc = w.tracerColor ?? [1, 1, 0.6];
    const now = new Date().toLocaleString('pt-BR');

    return `/**
 * ${w.label ?? w.id}
 * Gerado pelo WeaponEditor em ${now}
 */
export class ${cls} {
  constructor(scene) {
    this.id       = '${w.id}';
    this.label    = '${w.label ?? w.id}';
    this.damage   = ${w.damage};
    this.fireRate  = ${w.fireRate};
    this.ammo     = ${w.maxAmmo};
    this.maxAmmo  = ${w.maxAmmo};

    this.viewmodelScale    = ${f(w.viewmodelScale)};
    this.viewmodelPosition = new BABYLON.Vector3(${f(w.viewmodelPosition.x)}, ${f(w.viewmodelPosition.y)}, ${f(w.viewmodelPosition.z)});
    this.viewmodelRotation = new BABYLON.Vector3(${f(w.viewmodelRotation.x)}, ${f(w.viewmodelRotation.y)}, ${f(w.viewmodelRotation.z)});
    this.muzzleOffset      = new BABYLON.Vector3(${f(w.muzzleOffset.x)}, ${f(w.muzzleOffset.y)}, ${f(w.muzzleOffset.z)});

    this.tpsScale    = ${f(w.tpsScale)};
    this.tpsRotation = new BABYLON.Vector3(${f(w.tpsRotation.x)}, ${f(w.tpsRotation.y)}, ${f(w.tpsRotation.z)});
    this.tpsPosition = new BABYLON.Vector3(${f(w.tpsPosition.x)}, ${f(w.tpsPosition.y)}, ${f(w.tpsPosition.z)});

    this.tracerColor = [${tc.map(f).join(', ')}];
    this.tracerAlpha = ${f(w.tracerAlpha ?? 0.6)};

    this._origMaxDim = null;
    this._origCenter = null;
  }

  applyToMesh(glbRoot, isTPS = false) {
    glbRoot.rotationQuaternion = null;
    const maxDim = (this._origMaxDim > 0) ? this._origMaxDim : 1;
    const center = this._origCenter ?? BABYLON.Vector3.Zero();
    if (isTPS) {
      const s = this.tpsScale / maxDim;
      glbRoot.scaling.setAll(s);
      glbRoot.rotation.copyFrom(this.tpsRotation);
      glbRoot.position.copyFrom(this.tpsPosition);
    } else {
      const s = this.viewmodelScale / maxDim;
      glbRoot.scaling.setAll(s);
      glbRoot.rotation.copyFrom(this.viewmodelRotation);
      glbRoot.position.set(
        this.viewmodelPosition.x + center.x * s,
        this.viewmodelPosition.y - center.y * s,
        this.viewmodelPosition.z + center.z * s
      );
    }
  }
}
`;
  }

  _S(id, lbl, min, max, step = 0.01) {
    return `
    <div class="wr"><span>${lbl}</span>
      <input type="number" id="${id}_n" step="${step}"
        style="width:60px;background:#0c0c1e;color:#8df;border:1px solid #28f;padding:2px 4px;border-radius:3px">
    </div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}"
      style="width:100%;height:5px;accent-color:#28f;margin:2px 0 9px">`;
  }

  _buildPanel() {
    const d = document.createElement('div');
    d.id = 'wed-panel';
    d.style.cssText = [
      'position:fixed','top:0','right:0','width:300px','height:100dvh',
      'background:rgba(5,5,15,0.97)','color:#ccd',
      'font-family:ui-monospace,monospace','font-size:12px',
      'overflow-y:auto','z-index:9500','display:none',
      'padding:10px 12px','box-sizing:border-box',
      'border-left:2px solid #28f',
    ].join(';');

    d.innerHTML = `
<style>
  #wed-panel .wr{display:flex;justify-content:space-between;align-items:center;margin-top:5px}
  #wed-panel h4{color:#28f;margin:6px 0 4px;font-size:11px;letter-spacing:.8px;text-transform:uppercase}
  #wed-panel hr{border:none;border-top:1px solid #182040;margin:8px 0}
  #wed-panel button{cursor:pointer;font-family:inherit;font-size:11px;border:none;
    padding:5px 7px;border-radius:4px;transition:opacity .12s}
  #wed-panel button:hover{opacity:.78}
</style>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
  <b style="color:#28f;font-size:13px;letter-spacing:1px">🔧 WEAPON EDITOR</b>
  <button id="wed_close" style="background:#1a1a3a;color:#88a;padding:3px 9px;font-size:10px">✕ painel</button>
</div>

<button id="wed_scene_btn"
  style="width:100%;background:linear-gradient(90deg,#004,#006);color:#8cf;
         font-size:12px;padding:8px;margin-bottom:8px;border:1px solid #28f;letter-spacing:.5px">
  🎬 Entrar na Cena
</button>

<div class="wr" style="margin-bottom:8px">
  <b style="color:#fa0">Arma</b>
  <select id="wed_weapon"
    style="background:#0c0c1e;color:#8df;border:1px solid #28f;padding:3px 5px;
           border-radius:3px;width:175px"></select>
</div>

<h4>📷 Câmera de Visualização</h4>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
  <button class="wed_cam" data-cam="fps"     style="background:#10203a;color:#8cf">👁️ FPS</button>
  <button class="wed_cam" data-cam="fps_aim" style="background:#10203a;color:#8cf">🎯 FPS Mira</button>
  <button class="wed_cam" data-cam="tps"     style="background:#10203a;color:#8cf">🧍 TPS</button>
  <button class="wed_cam" data-cam="tps_aim" style="background:#10203a;color:#8cf">🎯 TPS Mira</button>
</div>
<div id="wed_cam_hint" style="font-size:9px;color:#789;margin-bottom:8px;text-align:center">
  TPS: arraste com botão direito p/ girar a câmera
</div>

<hr>
<h4>📐 Viewmodel (FPS)</h4>
${this._S('wed_scale','Escala',    0.01,3)}
${this._S('wed_px',  'Pos X',    -2,2)}
${this._S('wed_py',  'Pos Y',    -2,2)}
${this._S('wed_pz',  'Pos Z',    -2,2)}
${this._S('wed_rx',  'Rot X (°)',-180,180,1)}
${this._S('wed_ry',  'Rot Y (°)',-180,180,1)}
${this._S('wed_rz',  'Rot Z (°)',-180,180,1)}

<hr>
<h4>💥 Muzzle (boca da arma)</h4>
${this._S('wed_mx','Muzzle X',-1,1)}
${this._S('wed_my','Muzzle Y',-1,1)}
${this._S('wed_mz','Muzzle Z',-2,2)}

<button id="wed_testfire"
  style="width:100%;background:#240;color:#afa;margin-bottom:8px;padding:6px;
         border:1px solid #4a4;font-size:11px">
  🎯 Testar Tiro
</button>

<hr>
<h4>🌈 Traçador (cor da bala)</h4>
${this._S('wed_tr','Vermelho', 0,1)}
${this._S('wed_tg','Verde',    0,1)}
${this._S('wed_tb','Azul',     0,1)}
${this._S('wed_ta','Opacidade',0,1)}
<div id="wed_tprev" style="height:9px;border-radius:3px;margin:0 0 8px;border:1px solid #222"></div>

<hr>
<h4>👤 TPS (3ª pessoa)</h4>
${this._S('wed_tscale','Escala TPS',  0.01,3)}
${this._S('wed_trx',   'TPS Rot X (°)',-180,180,1)}
${this._S('wed_try',   'TPS Rot Y (°)',-180,180,1)}
${this._S('wed_trz',   'TPS Rot Z (°)',-180,180,1)}
${this._S('wed_tpx',   'TPS Pos X',   -1,1,0.005)}
${this._S('wed_tpy',   'TPS Pos Y',   -1,1,0.005)}
${this._S('wed_tpz',   'TPS Pos Z',   -1,1,0.005)}

<hr>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:5px">
  <button id="wed_save"     style="background:#024;color:#aef">💾 Salvar sessão</button>
  <button id="wed_reset"    style="background:#300;color:#faa">↩ Reset</button>
</div>
<button id="wed_download"
  style="width:100%;background:linear-gradient(90deg,#030,#050);color:#4f8;
         font-size:12px;padding:8px;border:1px solid #4a4;letter-spacing:.3px;margin-bottom:5px">
  ⬇️ Salvar arquivo .js
</button>
<button id="wed_copy" style="width:100%;background:#1a1a30;color:#88f;padding:5px;font-size:11px">
  📋 Copiar código
</button>

<pre id="wed_code"
  style="display:none;padding:8px;background:#06060f;border:1px solid #28f;
         border-radius:4px;font-size:10px;white-space:pre-wrap;color:#9cf;
         overflow-x:auto;margin-top:6px;max-height:220px;overflow-y:auto"></pre>

<div id="wed_toast"
  style="display:none;margin-top:7px;padding:7px 10px;border-radius:4px;
         font-size:11px;line-height:1.5;color:#fff;word-break:break-word"></div>
`;

    document.body.appendChild(d);
    this._panel = d;
    this._bindEvents();
  }

  _bindEvents() {
    const $ = id => this._panel.querySelector('#' + id);

    $('wed_close').addEventListener('click',    () => this.hide());
    $('wed_scene_btn').addEventListener('click', () => {
      this._cleanMode ? this._exitCleanMode() : this._enterCleanMode();
    });
    $('wed_testfire').addEventListener('click',  () => this._testFire());
    $('wed_save').addEventListener('click',      () => this._save());
    $('wed_reset').addEventListener('click',     () => this._reset());
    $('wed_download').addEventListener('click',  () => this._downloadWeaponFile());
    $('wed_copy').addEventListener('click',      () => this._copyCode());

    $('wed_weapon').addEventListener('change', e => {
      this._ws.switchWeapon(parseInt(e.target.value));
      if (this._cleanMode) this._setWeaponLayer(WeaponEditor.LAYER_EDITOR);
      setTimeout(() => this._refresh(), 80);
    });

    // ── Botões de câmera (4 modos) ──────────────────────────────────
    this._panel.querySelectorAll('.wed_cam').forEach(btn => {
      btn.addEventListener('click', () => this._setPreviewCamera(btn.dataset.cam));
    });

    const ids = [
      'wed_scale','wed_px','wed_py','wed_pz','wed_rx','wed_ry','wed_rz',
      'wed_mx','wed_my','wed_mz','wed_tr','wed_tg','wed_tb','wed_ta',
      'wed_tscale','wed_trx','wed_try','wed_trz','wed_tpx','wed_tpy','wed_tpz',
    ];
    for (const id of ids) {
      const r = $(id), n = $(id + '_n');
      if (!r || !n) continue;
      r.addEventListener('input',  () => { n.value = (+r.value).toFixed(2); this._applyLive(); });
      n.addEventListener('change', () => { r.value = n.value;               this._applyLive(); });
    }
  }

  _get(id)    { return parseFloat(this._panel.querySelector('#' + id)?.value ?? 0); }
  _set(id, v) {
    const r = this._panel.querySelector('#' + id);
    const n = this._panel.querySelector(`#${id}_n`);
    if (r) r.value = v;
    if (n) n.value = (+v).toFixed(2);
  }

  _refresh() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;

    const sel = this._panel.querySelector('#wed_weapon');
    sel.innerHTML = this._ws.weapons.map((wp, i) =>
      `<option value="${i}"${i === this._ws.currentWeaponIndex ? ' selected' : ''}>${wp.label ?? wp.id}</option>`
    ).join('');

    const R = BABYLON.Tools.ToDegrees;
    this._set('wed_scale', w.viewmodelScale);
    this._set('wed_px', w.viewmodelPosition.x); this._set('wed_py', w.viewmodelPosition.y); this._set('wed_pz', w.viewmodelPosition.z);
    this._set('wed_rx', R(w.viewmodelRotation.x)); this._set('wed_ry', R(w.viewmodelRotation.y)); this._set('wed_rz', R(w.viewmodelRotation.z));
    this._set('wed_mx', w.muzzleOffset.x); this._set('wed_my', w.muzzleOffset.y); this._set('wed_mz', w.muzzleOffset.z);

    const [tr,tg,tb] = w.tracerColor ?? [1,1,0.6];
    const ta = w.tracerAlpha ?? 0.6;
    this._set('wed_tr', tr); this._set('wed_tg', tg); this._set('wed_tb', tb); this._set('wed_ta', ta);
    this._updateTracerPreview();

    this._set('wed_tscale', w.tpsScale);
    this._set('wed_trx', R(w.tpsRotation.x)); this._set('wed_try', R(w.tpsRotation.y)); this._set('wed_trz', R(w.tpsRotation.z));
    this._set('wed_tpx', w.tpsPosition.x); this._set('wed_tpy', w.tpsPosition.y); this._set('wed_tpz', w.tpsPosition.z);
  }

  _applyLive() {
    const w = this._ws.getCurrentWeapon();
    if (!w) return;
    const D = BABYLON.Tools.ToRadians;

    w.viewmodelScale    = this._get('wed_scale');
    w.viewmodelPosition = new BABYLON.Vector3(this._get('wed_px'), this._get('wed_py'), this._get('wed_pz'));
    w.viewmodelRotation = new BABYLON.Vector3(D(this._get('wed_rx')), D(this._get('wed_ry')), D(this._get('wed_rz')));
    w.muzzleOffset      = new BABYLON.Vector3(this._get('wed_mx'), this._get('wed_my'), this._get('wed_mz'));
    w.tpsScale          = this._get('wed_tscale');
    w.tpsRotation       = new BABYLON.Vector3(D(this._get('wed_trx')), D(this._get('wed_try')), D(this._get('wed_trz')));
    w.tpsPosition       = new BABYLON.Vector3(this._get('wed_tpx'), this._get('wed_tpy'), this._get('wed_tpz'));
    w.tracerColor       = [this._get('wed_tr'), this._get('wed_tg'), this._get('wed_tb')];
    w.tracerAlpha       = this._get('wed_ta');
    this._updateTracerPreview();

    const mesh = this._ws._weaponMeshes[w.id];
    if (mesh) {
      w.applyToMesh(mesh, false);
      if (this._ws._muzzlePoint) {
        this._ws._muzzlePoint.parent = mesh;
        this._ws._muzzlePoint.position.copyFrom(w.muzzleOffset);
      }
    }
    const tpsMesh = this._ws._tpsMeshes[w.id];
    if (tpsMesh) w.applyToMesh(tpsMesh, true);
  }

  _updateTracerPreview() {
    const r = Math.round(this._get('wed_tr') * 255);
    const g = Math.round(this._get('wed_tg') * 255);
    const b = Math.round(this._get('wed_tb') * 255);
    const a = this._get('wed_ta');
    const el = this._panel.querySelector('#wed_tprev');
    if (el) el.style.background = `rgba(${r},${g},${b},${a})`;
  }

  _toast(msg, bg = '#111') {
    const t = this._panel.querySelector('#wed_toast');
    if (!t) return;
    t.textContent = msg; t.style.background = bg; t.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 4000);
  }

  _buildKeyShortcut() {
    window.addEventListener('keydown', e => {
      if (e.code !== 'F4') return;
      e.preventDefault();
      if (window.enterEngineMode) {
        if (this._active) window.exitEngineMode?.();
        else              window.enterEngineMode?.();
      } else {
        this.toggle();
      }
    });
  }

  show() {
    if (!this._panel) return;
    this._active = true;
    this._panel.style.display = 'block';
    this._refresh();
    this._enterTPSPreview();
  }

  hide() {
    if (!this._panel) return;
    if (this._cleanMode) this._exitCleanMode();
    this._active = false;
    this._panel.style.display = 'none';
    this._exitTPSPreview();
  }

  toggle() { this._active ? this.hide() : this.show(); }
  get active() { return this._active; }

  // ── Preview: entra com arma equipada e começa no modo TPS ─────────
  _enterTPSPreview() {
    const p = window._gamePlayer;
    if (!p) return;
    this._prevState = {
      tps: p._tpsMode,
      armed: p.stateMachine ? p.stateMachine.state : null,
      gameActive: window._gameInput ? window._gameInput.gameActive : false,
      aiming: p._aiming,
    };
    if (window._gameInput) window._gameInput.gameActive = false;
    if (p.stateMachine) { p.stateMachine.isArmedFlag = true; p.stateMachine.setState('armed'); }
    this._camMode = this._camMode || 'tps';
    this._setPreviewCamera(this._camMode);
  }

  /**
   * Troca o modo de câmera do preview: 'fps' | 'fps_aim' | 'tps' | 'tps_aim'.
   * FPS usa a câmera real do player (vê o viewmodel). TPS usa câmera orbital.
   */
  _setPreviewCamera(mode) {
    const p = window._gamePlayer;
    if (!p) return;
    this._camMode = mode;
    const scene = this._scene;
    const isTPS = mode === 'tps' || mode === 'tps_aim';
    const isAim = mode === 'fps_aim' || mode === 'tps_aim';

    p._tpsMode = isTPS;
    p._aiming  = isAim;
    if (p.animator) p.animator.setVisible(isTPS);
    p._updateWeaponVisibility();

    // Destaca o botão ativo
    this._panel.querySelectorAll('.wed_cam').forEach(b => {
      b.style.background = b.dataset.cam === mode ? '#1e4e8f' : '#10203a';
      b.style.color      = b.dataset.cam === mode ? '#fff'    : '#8cf';
    });
    const hint = this._panel.querySelector('#wed_cam_hint');
    if (hint) hint.textContent = isTPS
      ? 'TPS: arraste com botão direito p/ girar a câmera • scroll = zoom'
      : 'FPS: ajuste Pos/Rot do viewmodel. ' + (isAim ? '(estado MIRA)' : '(estado quadril)');

    // Remove observador anterior
    if (this._wedObs) { scene.onBeforeRenderObservable.remove(this._wedObs); this._wedObs = null; }

    if (isTPS) {
      // Câmera orbital focada na arma
      if (this._wedCam) this._wedCam.detachControl();
      if (!this._wedCam) {
        this._wedCam = new BABYLON.ArcRotateCamera('wedCam', -1.2, 1.25, 4, BABYLON.Vector3.Zero(), scene);
        this._wedCam.wheelPrecision = 40;
        this._wedCam.lowerRadiusLimit = 1.0;
        this._wedCam.upperRadiusLimit = 12;
        this._wedCam.minZ = 0.05;
      }
      if (!this._prevCam) this._prevCam = scene.activeCamera;
      scene.activeCamera = this._wedCam;
      this._wedCam.attachControl(scene.getEngine().getRenderingCanvas(), true);
      this._wedObs = scene.onBeforeRenderObservable.add(() => {
        const cur = this._ws.getCurrentWeapon();
        const tpsM = cur && this._ws._tpsMeshes[cur.id];
        if (tpsM) { tpsM.computeWorldMatrix(true); this._wedCam.setTarget(tpsM.getAbsolutePosition()); }
      });
    } else {
      // FPS: usa a câmera real do player (mostra o viewmodel da arma)
      if (this._wedCam) this._wedCam.detachControl();
      if (!this._prevCam) this._prevCam = scene.activeCamera;
      scene.activeCamera = p.camera;
      // aplica o estado de mira ao viewmodel a cada frame
      this._wedObs = scene.onBeforeRenderObservable.add(() => {
        p.weapon.setAiming(isAim);
        p.weapon.update(scene.getEngine().getDeltaTime() / 1000, false, 0);
      });
    }
  }

  _exitTPSPreview() {
    const scene = this._scene;
    if (this._wedObs) { scene.onBeforeRenderObservable.remove(this._wedObs); this._wedObs = null; }
    if (this._wedCam) this._wedCam.detachControl();
    const p = window._gamePlayer;
    if (this._prevCam) { scene.activeCamera = this._prevCam; this._prevCam = null; }
    else if (p) scene.activeCamera = p.camera;
    if (p && this._prevState) {
      p._tpsMode = this._prevState.tps;
      p._aiming  = this._prevState.aiming;
      if (p.animator) p.animator.setVisible(this._prevState.tps);
      if (p.stateMachine && this._prevState.armed) p.stateMachine.setState(this._prevState.armed);
      p._updateWeaponVisibility();
      if (window._gameInput) window._gameInput.gameActive = this._prevState.gameActive;
    }
  }
}
