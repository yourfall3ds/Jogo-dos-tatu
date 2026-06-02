// ─────────────────────────────────────────────────────────────────
//  AssetEditorUI — editor de asset em cena isolada
//
//  Abre um viewport 3D próprio (engine/scene dedicados) com câmera
//  orbital. Mostra: info (meshes/vértices/bounds), collider + hitbox,
//  animações (play/stop) e botão de tirar a miniatura (foto do frame).
//
//  Abrir: window._assetEditor.open(asset)   (asset = { name, glbUrl })
// ─────────────────────────────────────────────────────────────────
import { LocalDB } from '../data/LocalDB.js';

export class AssetEditorUI {
  constructor() {
    this._engine = null;
    this._scene  = null;
    this._anims  = [];
    this._asset  = null;
    this._showCollider = false;
    this._colliderHelpers = [];
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'ae-overlay';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9700;display:none;
      background:rgba(0,0,0,.88);backdrop-filter:blur(4px);
      font-family:'Segoe UI',monospace;color:#cde;
    `;
    el.innerHTML = `
      <div style="position:absolute;inset:24px;display:flex;border:2px solid #446;
                  border-radius:14px;overflow:hidden;background:#0a0a14">
        <!-- Viewport -->
        <div style="flex:1;position:relative;background:#05060d">
          <canvas id="ae-canvas" style="width:100%;height:100%;display:block;outline:none"></canvas>
          <div style="position:absolute;top:10px;left:12px;font-size:11px;color:#668;pointer-events:none">
            🖱️ Arraste = girar · Scroll = zoom
          </div>
          <div style="position:absolute;top:8px;right:10px;display:flex;gap:6px">
            <button id="ae-center" class="ae-vbtn" title="Centralizar e enquadrar (F)">🎯 Centralizar</button>
            <button id="ae-zin"  class="ae-vbtn" title="Zoom +">＋</button>
            <button id="ae-zout" class="ae-vbtn" title="Zoom −">－</button>
          </div>
          <div id="ae-loading" style="position:absolute;inset:0;display:flex;align-items:center;
               justify-content:center;color:#9cf;font-size:14px">Carregando…</div>
        </div>
        <!-- Painel -->
        <div style="width:300px;min-width:300px;border-left:1px solid #223;
                    display:flex;flex-direction:column;background:#0b0c18">
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:12px 16px;border-bottom:1px solid #223;background:#080812">
            <span id="ae-title" style="font-weight:700;color:#9cf;font-size:14px">Editor</span>
            <button id="ae-close" style="background:#2a1a3a;border:1px solid #557;color:#a8c;
                    cursor:pointer;font-size:18px;padding:0 9px;border-radius:6px">✕</button>
          </div>
          <div style="flex:1;overflow-y:auto;padding:14px 16px" id="ae-body">
            <!-- INFO -->
            <div class="ae-sec">📊 Informações</div>
            <div id="ae-info" style="font-size:11px;color:#9ab;line-height:1.8"></div>

            <!-- VISUALIZAÇÃO -->
            <div class="ae-sec" style="margin-top:14px">🟡 Collider / Hitbox</div>
            <label style="display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;margin:6px 0">
              <input type="checkbox" id="ae-chk-collider"> Mostrar collider (amarelo) + hitbox (vermelho)
            </label>

            <!-- GAMEPLAY (padrão global do asset) -->
            <div class="ae-sec" style="margin-top:14px">🎮 Gameplay (padrão deste asset)</div>
            <div style="font-size:10px;color:#668;margin-bottom:4px">Vale pra todas as cópias no mapa.</div>
            <label class="ae-gl"><input type="checkbox" id="ae-g-collide"> 🧱 Tem Colisão (sólido)</label>
            <label class="ae-gl"><input type="checkbox" id="ae-g-phys"> ⚖️ Tem Física (cai/empilha)</label>
            <label class="ae-gl"><input type="checkbox" id="ae-g-break"> 💥 É Quebrável</label>
            <label class="ae-gl"><input type="checkbox" id="ae-g-collect"> 🎒 É Coletável (vai pro inventário)</label>
            <div id="ae-g-status" style="font-size:10px;color:#5fc;min-height:13px;margin-top:3px"></div>

            <!-- ESCALA PADRÃO (aplica a todas as cópias no mapa) -->
            <div class="ae-sec" style="margin-top:14px">📐 Tamanho (todas as cópias)</div>
            <div style="font-size:10px;color:#668;margin-bottom:6px">Multiplicador. 1 = original · &lt;1 menor · &gt;1 maior. Live: arraste e veja.</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <input id="ae-scale-range" type="range" min="0.05" max="10" step="0.01" value="1" style="flex:1">
              <input id="ae-scale-num" type="number" min="0.01" max="50" step="0.05" value="1" style="width:62px;background:#0c1020;border:1px solid #345;color:#fff;border-radius:5px;padding:3px;text-align:center;font-size:11px">
              <span style="color:#9af;font-size:12px">×</span>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:6px">
              <button class="ae-scale-preset" data-s="0.25" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">¼×</button>
              <button class="ae-scale-preset" data-s="0.5" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">½×</button>
              <button class="ae-scale-preset" data-s="1" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">1×</button>
              <button class="ae-scale-preset" data-s="2" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">2×</button>
              <button class="ae-scale-preset" data-s="4" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">4×</button>
              <button class="ae-scale-preset" data-s="8" style="flex:1;background:#222a44;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px;cursor:pointer;font-size:10px">8×</button>
            </div>
            <button id="ae-scale-apply" class="ae-btn" style="width:100%;background:#1a3a5a;border-color:#3a8;color:#9fe;font-weight:600">
              ✅ Aplicar tamanho a todas as cópias
            </button>
            <div id="ae-scale-status" style="font-size:10px;color:#5fc;min-height:13px;margin-top:3px"></div>

            <!-- ANIMAÇÕES -->
            <div class="ae-sec" style="margin-top:14px">🎬 Animações</div>
            <div id="ae-anims" style="display:flex;flex-direction:column;gap:4px;font-size:11px"></div>

            <!-- MINIATURA -->
            <div class="ae-sec" style="margin-top:14px">📸 Miniatura</div>
            <div style="font-size:10px;color:#668;margin-bottom:6px">Enquadre o asset e tire a foto.</div>
            <button id="ae-snap" class="ae-btn" style="width:100%;background:#1c3a22;border-color:#4a9a5a;color:#9fe">
              📸 Salvar Miniatura deste ângulo
            </button>
            <div id="ae-snap-status" style="font-size:10px;color:#5fc;margin-top:6px;min-height:14px"></div>

            <!-- AÇÕES -->
            <div class="ae-sec" style="margin-top:14px">⚙️ Ações</div>
            <button id="ae-spawn" class="ae-btn" style="width:100%;margin-bottom:6px;background:#1a2a4a;border-color:#46a;color:#bdf">
              ▶ Colocar no Mapa
            </button>
            <button id="ae-delete" class="ae-btn" style="width:100%;background:#3a1414;border-color:#a44;color:#f99;display:none">
              🗑️ Excluir Asset
            </button>
          </div>
        </div>
      </div>
      <style>
        #ae-overlay .ae-sec{color:#ffd24a;font-weight:700;font-size:12px;border-bottom:1px solid #223;padding-bottom:4px}
        #ae-overlay .ae-btn{border:1px solid #446;background:#1a1a2e;color:#bcd;cursor:pointer;
          padding:7px 10px;border-radius:6px;font-family:inherit;font-size:11px}
        #ae-overlay .ae-btn:hover{background:#24243e}
        #ae-overlay .ae-vbtn{border:1px solid #557;background:rgba(20,22,40,.85);color:#cde;
          cursor:pointer;padding:5px 9px;border-radius:6px;font-family:inherit;font-size:12px}
        #ae-overlay .ae-vbtn:hover{background:rgba(40,44,70,.95)}
        #ae-overlay .ae-gl{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;margin:4px 0}
        #ae-overlay .ae-anim-btn{display:flex;justify-content:space-between;align-items:center;
          background:#11182a;border:1px solid #335;border-radius:6px;padding:6px 9px;cursor:pointer;color:#bcd}
        #ae-overlay .ae-anim-btn:hover{background:#1a2540;border-color:#46a}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#ae-close').onclick = () => this.close();
    el.querySelector('#ae-chk-collider').onchange = (e) => this._toggleCollider(e.target.checked);
    el.querySelector('#ae-snap').onclick = () => this._saveThumbnail();
    el.querySelector('#ae-spawn').onclick = () => this._spawn();
    el.querySelector('#ae-delete').onclick = () => this._delete();
    el.querySelector('#ae-center').onclick = () => this._frameCamera();
    el.querySelector('#ae-zin').onclick  = () => { if (this._cam) this._cam.radius *= 0.8; };
    el.querySelector('#ae-zout').onclick = () => { if (this._cam) this._cam.radius *= 1.25; };
    // tecla F = centralizar
    el.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') this._frameCamera(); });

    // Gameplay: salva ao marcar
    ['ae-g-collide', 'ae-g-phys', 'ae-g-break', 'ae-g-collect'].forEach(id =>
      el.querySelector('#' + id).addEventListener('change', () => this._saveProps()));

    // Escala: slider <-> número sincronizados. Arrastar aplica AO VIVO nas
    //  cópias do mapa (sem salvar a cada frame); o botão consolida/salva.
    const sRange = el.querySelector('#ae-scale-range');
    const sNum   = el.querySelector('#ae-scale-num');
    sRange.addEventListener('input', () => { sNum.value = sRange.value; this._previewScale(parseFloat(sRange.value)); });
    sNum.addEventListener('input',   () => { sRange.value = sNum.value; this._previewScale(parseFloat(sNum.value)); });
    el.querySelector('#ae-scale-apply').onclick = () => this._applyScale();
    // presets: clicar já preenche E aplica
    el.querySelectorAll('.ae-scale-preset').forEach(btn => {
      btn.onclick = () => { sNum.value = btn.dataset.s; sRange.value = btn.dataset.s; this._applyScale(); };
    });
  }

  async _loadProps() {
    const { AssetGroups } = await import('../data/AssetGroups.js');
    const p = await AssetGroups.getAssetProps(this._asset).catch(() => ({}));
    this._el.querySelector('#ae-g-collide').checked = !!p.collidable;
    this._el.querySelector('#ae-g-phys').checked    = !!p.physics;
    this._el.querySelector('#ae-g-break').checked   = !!p.breakable;
    this._el.querySelector('#ae-g-collect').checked = !!p.collectable;
    // escala padrão atual (default 1)
    const ds = (await AssetGroups.getDefaultScale(this._asset.id).catch(() => null)) ?? 1.0;
    const n = (window._buildMode?._placed || []).filter(x => x.record?.id === this._asset.id).length;
    this._el.querySelector('#ae-scale-range').value = ds;
    this._el.querySelector('#ae-scale-num').value   = ds;
    const st = this._el.querySelector('#ae-scale-status');
    if (st) st.textContent = n ? `${n} cópia(s) no mapa` : '';
  }

  // Preview AO VIVO: só muda a escala VISUAL das cópias (sem recriar colisor
  //  nem salvar) — barato pra rodar a cada movimento do slider.
  _previewScale(s) {
    if (!this._asset || !(s > 0)) return;
    const id = this._asset.id;
    // cópias colocadas (BuildMode)
    for (const e of (window._buildMode?._placed || [])) {
      if (e.record?.id === id && e.root) e.root.scaling.setAll(s);
    }
    // cópias fixas da cena (Level) — usam baseScale * mult
    for (const o of (window._gameLevel?._mapObstacles || [])) {
      if (o.assetId === id && o.clone) o.clone.scaling.setAll((o.baseScale || 1) * s);
    }
    const st = this._el.querySelector('#ae-scale-status');
    if (st) st.textContent = `prévia: ${s.toFixed(2)}× (solte e clique Aplicar p/ salvar)`;
  }

  async _applyScale() {
    if (!this._asset) return;
    const { AssetGroups } = await import('../data/AssetGroups.js');
    const s = parseFloat(this._el.querySelector('#ae-scale-num').value) || 1.0;
    const n = (await window._buildMode?.applyScaleToAll?.(this._asset.id, s)) ?? 0;
    await AssetGroups.setDefaultScale(this._asset.id, s);   // garante padrão mesmo sem cópias
    const st = this._el.querySelector('#ae-scale-status');
    if (st) { st.textContent = `✅ escala ${s} · ${n} cópia(s) atualizada(s)`; setTimeout(() => { if (st) st.textContent = ''; }, 2500); }
  }

  async _saveProps() {
    if (!this._asset) return;
    const { AssetGroups } = await import('../data/AssetGroups.js');
    const props = {
      collidable:  this._el.querySelector('#ae-g-collide').checked,
      physics:     this._el.querySelector('#ae-g-phys').checked,
      breakable:   this._el.querySelector('#ae-g-break').checked,
      collectable: this._el.querySelector('#ae-g-collect').checked,
      castShadows: true,
    };
    await AssetGroups.setAssetProps(this._asset.id, props);
    const s = this._el.querySelector('#ae-g-status');
    if (s) { s.textContent = '✅ padrão salvo'; setTimeout(() => { if (s) s.textContent = ''; }, 1500); }
  }

  async _spawn() {
    const a = this._asset; if (!a) return;
    const { AssetGroups } = await import('../data/AssetGroups.js');
    const props = await AssetGroups.getAssetProps(a).catch(() => ({}));
    this.close();
    setTimeout(() => window._buildMode?.spawnAsset?.({
      kind: 'generated', id: a.id, name: a.name, glbUrl: a.glbUrl,
      groupId: a.groupId, groupProps: props,
    }), 150);
  }

  async _delete() {
    const a = this._asset; if (!a || a.builtin) return;
    if (!confirm(`Excluir "${a.name}" da biblioteca?`)) return;
    const { AssetGroups } = await import('../data/AssetGroups.js');
    await AssetGroups.deleteAsset(a.id);
    this.close();
    window._assetGroupsUI?._refresh?.();
  }

  // ── Abrir ─────────────────────────────────────────────────────────
  async open(asset) {
    this._asset = asset;
    this._el.style.display = 'block';
    window._gameInput?.deactivate?.();
    this._el.querySelector('#ae-title').textContent = asset.name || 'Asset';
    this._el.querySelector('#ae-loading').style.display = 'flex';
    this._el.querySelector('#ae-snap-status').textContent = '';
    this._loadProps();   // carrega quebrável/física/coletável do asset
    // Só assets gerados podem ser excluídos (built-in do jogo não)
    this._el.querySelector('#ae-delete').style.display = asset.builtin ? 'none' : 'block';

    const canvas = this._el.querySelector('#ae-canvas');
    this._engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene  = new BABYLON.Scene(this._engine);
    scene.clearColor = new BABYLON.Color4(0.04, 0.05, 0.10, 1);
    this._scene = scene;

    // Câmera orbital
    const cam = new BABYLON.ArcRotateCamera('aeCam', Math.PI / 4, Math.PI / 3, 6,
      BABYLON.Vector3.Zero(), scene);
    cam.attachControl(canvas, false);    // false = previne scroll da página → zoom funciona
    cam.wheelDeltaPercentage = 0.06;     // zoom mais responsivo
    cam.pinchDeltaPercentage = 0.06;
    cam.panningSensibility = 0;          // sem pan acidental
    this._cam = cam;

    const l1 = new BABYLON.HemisphericLight('aeL1', new BABYLON.Vector3(0.3, 1, 0.4), scene);
    l1.intensity = 1.0;
    const l2 = new BABYLON.DirectionalLight('aeL2', new BABYLON.Vector3(-0.5, -1, -0.5), scene);
    l2.intensity = 0.5;

    this._engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', this._onResize = () => this._engine?.resize());

    // Carrega o GLB
    try {
      const ld  = await this._resolve(asset.glbUrl);
      const res = await BABYLON.SceneLoader.ImportMeshAsync('', ld.folder, ld.file, scene, null, ld.ext);
      this._root   = res.meshes[0];
      this._meshes = res.meshes;
      this._anims  = res.animationGroups || [];
      this._frameCamera();
      this._populateInfo();
      this._populateAnims();
    } catch (e) {
      this._el.querySelector('#ae-info').innerHTML = `<span style="color:#f88">Erro ao carregar: ${e.message}</span>`;
    }
    this._el.querySelector('#ae-loading').style.display = 'none';
  }

  close() {
    this._el.style.display = 'none';
    this._anims.forEach(a => { try { a.stop(); } catch (_) {} });
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    try { this._engine?.stopRenderLoop(); } catch (_) {}
    try { this._scene?.dispose(); } catch (_) {}
    try { this._engine?.dispose(); } catch (_) {}
    this._engine = this._scene = this._root = null;
    this._colliderHelpers = [];
    window._gameInput?.activate?.();
  }

  // ── Helpers ───────────────────────────────────────────────────────
  async _resolve(url) {
    if (/^https?:/.test(url)) {
      try {
        const r = await fetch(`http://127.0.0.1:3099/proxy-image?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(60000) });
        if (r.ok) return { folder: '', file: URL.createObjectURL(await r.blob()), ext: '.glb' };
      } catch (_) {}
    }
    if (url.startsWith('blob:')) return { folder: '', file: url, ext: '.glb' };
    const enc = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const i = url.lastIndexOf('/');
    return { folder: enc(url.substring(0, i + 1)), file: encodeURIComponent(url.substring(i + 1)), ext: undefined };
  }

  _bounds() {
    this._root.computeWorldMatrix(true);
    return this._root.getHierarchyBoundingVectors(true);
  }

  _frameCamera() {
    const bb     = this._bounds();
    const center = bb.min.add(bb.max).scale(0.5);
    const half   = bb.max.subtract(bb.min).scale(0.5);
    // raio "real" do objeto (maior meia-extensão), sem piso fixo
    const r   = Math.max(half.x, half.y, half.z, 0.03);
    const fov = this._cam.fov || 0.8;
    // distância pra encher a tela com margem confortável (independe da escala)
    const dist = (r / Math.tan(fov / 2)) * 2.2;

    this._cam.setTarget(center);
    this._cam.alpha  = Math.PI / 4;
    this._cam.beta   = Math.PI / 2.6;
    this._cam.radius = dist;
    this._cam.lowerRadiusLimit  = dist * 0.1;     // deixa chegar bem perto
    this._cam.upperRadiusLimit  = dist * 12;      // e afastar bastante
    this._cam.wheelDeltaPercentage = 0.06;
    this._cam.minZ = Math.max(0.001, r * 0.02);   // evita clipping em objetos pequenos
    this._cam.maxZ = dist * 100;
  }

  _populateInfo() {
    const bb = this._bounds();
    const size = bb.max.subtract(bb.min);
    let verts = 0, meshCount = 0;
    for (const m of this._meshes) { const v = m.getTotalVertices?.() || 0; if (v > 0) { verts += v; meshCount++; } }
    this._el.querySelector('#ae-info').innerHTML = `
      <div>📐 Tamanho: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}</div>
      <div>🔺 Vértices: ${verts.toLocaleString('pt-BR')}</div>
      <div>🧩 Malhas: ${meshCount}</div>
      <div>🎬 Animações: ${this._anims.length}</div>
    `;
  }

  _populateAnims() {
    const box = this._el.querySelector('#ae-anims');
    box.innerHTML = '';
    if (!this._anims.length) { box.innerHTML = '<span style="color:#557">Sem animações</span>'; return; }
    this._anims.forEach(a => { try { a.stop(); } catch (_) {} });
    for (const a of this._anims) {
      const row = document.createElement('div');
      row.className = 'ae-anim-btn';
      row.innerHTML = `<span>${a.name}</span><span style="color:#5fc">▶</span>`;
      row.onclick = () => {
        this._anims.forEach(x => { try { x.stop(); } catch (_) {} });
        try { a.start(true); } catch (_) {}
      };
      box.appendChild(row);
    }
  }

  // ── Collider + hitbox ─────────────────────────────────────────────
  _toggleCollider(on) {
    this._showCollider = on;
    this._colliderHelpers.forEach(h => { try { h.dispose(); } catch (_) {} });
    this._colliderHelpers = [];
    if (!on || !this._root) return;

    const bb = this._bounds();
    const size = bb.max.subtract(bb.min);
    const center = bb.min.add(bb.max).scale(0.5);
    const w = Math.max(0.05, size.x), h = Math.max(0.05, size.y), d = Math.max(0.05, size.z);

    // Hitbox (box vermelho)
    const box = BABYLON.MeshBuilder.CreateBox('_aeHit', { width: w, height: h, depth: d }, this._scene);
    box.position.copyFrom(center);
    const bm = new BABYLON.StandardMaterial('_aeHitM', this._scene);
    bm.emissiveColor = new BABYLON.Color3(1, 0.25, 0.25); bm.wireframe = true; bm.disableLighting = true;
    box.material = bm; box.isPickable = false;
    this._colliderHelpers.push(box);

    // Collider (ellipsoid amarelo = forma real da física)
    const ell = BABYLON.MeshBuilder.CreateSphere('_aeEll', { segments: 10, diameter: 1 }, this._scene);
    ell.scaling.set(w, h, d);
    ell.position.copyFrom(center);
    const em = new BABYLON.StandardMaterial('_aeEllM', this._scene);
    em.emissiveColor = new BABYLON.Color3(1, 0.85, 0); em.wireframe = true; em.disableLighting = true;
    ell.material = em; ell.isPickable = false;
    this._colliderHelpers.push(ell);
  }

  // ── Miniatura (foto do frame atual) ───────────────────────────────
  async _saveThumbnail() {
    if (!this._engine || !this._asset) return;
    const status = this._el.querySelector('#ae-snap-status');
    status.textContent = '📸 capturando…';
    try {
      const src = this._el.querySelector('#ae-canvas');
      this._scene.render();

      // Reduz pra 160×160 (recorta o quadrado central) — thumbnail leve
      const SZ = 160;
      const tmp = document.createElement('canvas');
      tmp.width = SZ; tmp.height = SZ;
      const ctx = tmp.getContext('2d');
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, SZ, SZ);
      const sw = src.width, sh = src.height, s = Math.min(sw, sh);
      ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, SZ, SZ);
      const dataURL = tmp.toDataURL('image/png');

      const thumbs = await LocalDB.get('asset_thumbnails', {});
      thumbs[this._asset.id] = dataURL;
      await LocalDB.save('asset_thumbnails', thumbs);

      status.textContent = '✅ Miniatura salva!';
      // atualiza a biblioteca se estiver aberta
      window._assetGroupsUI?._reloadThumbs?.();
    } catch (e) {
      status.textContent = '❌ ' + e.message;
    }
  }
}
