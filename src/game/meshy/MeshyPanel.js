// ─────────────────────────────────────────────────────────────────
//  MeshyPanel — UI da "Máquina de Criação" (pipeline Meshy AI)
//
//  ASSET (prop):  imagem → 3D → retopologia → textura  → salva no catálogo
//  PERSONAGEM:    imagem T-pose → 3D → rig(humanoid/quadruped) → animações
//
//  Cada etapa mostra progresso. O resultado final entra no catálogo de
//  construção (BuildMode) e/ou vira inimigo/jogável.
//  Abre com a tecla J ou ao interagir (E) com a Máquina.
// ─────────────────────────────────────────────────────────────────
import { MeshyClient } from './MeshyClient.js';
import { LocalDB } from '../data/LocalDB.js';
import { AssetWishlist, wishlistAllItems } from './AssetWishlist.js';

export class MeshyPanel {
  constructor(scene, buildMode) {
    this.scene = scene;
    this.buildMode = buildMode;
    this.client = new MeshyClient();
    this._active = false;
    this._state = { imageUrl: null, modelTaskId: null, glbUrl: null, riggedTaskId: null };
    this._currentSession = null;  // sessão ativa da pipeline atual
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'meshy-panel';
    el.style.cssText = `
      position: fixed; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 560px; max-height: 88vh; overflow-y: auto;
      background: rgba(10,12,22,0.97); border: 2px solid #b6f; border-radius: 14px;
      color: #dce; font-family: 'Segoe UI', monospace; font-size: 13px;
      display: none; z-index: 9200; padding: 18px; box-shadow: 0 10px 50px rgba(0,0,0,.7);
    `;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #b6f;padding-bottom:10px;margin-bottom:12px">
        <b style="color:#c9f;font-size:16px;letter-spacing:1px">🤖 MÁQUINA DE CRIAÇÃO — Meshy AI</b>
        <button id="meshy-close" style="background:#2a1a3a;border:none;color:#a8c;cursor:pointer;font-size:20px;padding:0 8px;border-radius:6px">×</button>
      </div>

      <!-- API key -->
      <div id="meshy-keyrow" style="display:flex;gap:6px;margin-bottom:12px;align-items:center">
        <span style="color:#a9c">🔑 API Key:</span>
        <input id="meshy-key" type="password" placeholder="cole sua Meshy API key" style="flex:1;background:#0c0c1e;color:#cdf;border:1px solid #527;padding:5px 8px;border-radius:5px">
        <button id="meshy-key-save" class="my-btn">Salvar</button>
      </div>

      <!-- abas -->
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button id="meshy-tab-asset" class="my-tab my-tab-on">📦 Asset</button>
        <button id="meshy-tab-char"  class="my-tab">🐉 Personagem</button>
        <button id="meshy-tab-tree"  class="my-tab">🌳 Árvore</button>
        <button id="meshy-tab-lib" class="my-tab">📚 Biblioteca</button>
      </div>

      <!-- ÁRVORE DE ITENS DO JOGO -->
      <div id="meshy-tree" style="display:none">
        <div style="font-size:10px;color:#89a;margin-bottom:8px">
          Lista de tudo que o jogo precisa. Clique num item → preenche o prompt e vai pra aba Asset.
          <b style="color:#5fc">✅</b> = já gerado · <b style="color:#a78">⬜</b> = pendente
        </div>
        <div style="text-align:right;margin-bottom:6px"><span id="meshy-tree-prog" style="font-size:11px;color:#c9f"></span></div>
        <div id="meshy-tree-list"></div>
      </div>

      <!-- BIBLIOTECA POR MÁQUINA -->
      <div id="meshy-lib" style="display:none">
        <div style="font-size:10px;color:#89a;margin-bottom:8px;line-height:1.5">
          Sessões geradas nesta máquina. Cada etapa é baixável individualmente.
        </div>
        <div id="meshy-lib-list" style="display:flex;flex-direction:column;gap:10px"></div>
      </div>

      <!-- ASSET PIPELINE -->
      <div id="meshy-asset">
        <label style="color:#c9f;font-weight:bold">1. Descreva o item</label>
        <textarea id="meshy-prompt" rows="2" placeholder="ex: um baú de tesouro de madeira com detalhes em ouro" style="width:100%;background:#0c0c1e;color:#cdf;border:1px solid #527;border-radius:6px;padding:8px;margin:4px 0 8px;box-sizing:border-box"></textarea>
        <div style="font-size:10px;color:#89a;margin-bottom:8px">Sufixo auto: <i>", fundo cinza sólido, objeto único, centralizado"</i> (melhora o recorte)</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
          <button id="meshy-s1" class="my-step">1️⃣ Gerar Imagem</button>
          <button id="meshy-s2" class="my-step" disabled>2️⃣ Imagem → 3D</button>
          <button id="meshy-s3" class="my-step" disabled>3️⃣ Retopologia</button>
          <button id="meshy-s4" class="my-step" disabled>4️⃣ Texturizar</button>
        </div>
        <button id="meshy-auto" class="my-btn" style="width:100%;background:#243a6a;margin-bottom:8px">⚡ Pipeline Completo (1→4 automático)</button>
      </div>

      <!-- CHARACTER PIPELINE -->
      <div id="meshy-char" style="display:none">
        <label style="color:#c9f;font-weight:bold">Descreva o personagem</label>
        <textarea id="meshy-char-prompt" rows="2" placeholder="ex: um dragão laranja bípede estilo digimon" style="width:100%;background:#0c0c1e;color:#cdf;border:1px solid #527;border-radius:6px;padding:8px;margin:4px 0 8px;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:10px;margin-bottom:8px">
          <label><input type="radio" name="chartype" value="humanoid" checked> Humanoide (mais animações)</label>
          <label><input type="radio" name="chartype" value="quadruped"> Quadrúpede</label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
          <button id="meshy-c1" class="my-step">1️⃣ Imagem T-pose</button>
          <button id="meshy-c2" class="my-step" disabled>2️⃣ Imagem → 3D</button>
          <button id="meshy-c3" class="my-step" disabled>3️⃣ Rig</button>
          <button id="meshy-c4" class="my-step" disabled>4️⃣ Animações</button>
        </div>
      </div>

      <!-- preview imagem -->
      <div id="meshy-preview" style="display:none;text-align:center;margin:10px 0">
        <img id="meshy-img" style="max-width:240px;max-height:240px;border-radius:8px;border:1px solid #527">
      </div>

      <!-- progresso -->
      <div id="meshy-prog" style="display:none;margin-top:10px">
        <div style="background:#0c0c1e;border:1px solid #527;border-radius:6px;height:18px;overflow:hidden">
          <div id="meshy-prog-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#7a4cff,#c49cff);transition:width .3s"></div>
        </div>
        <div id="meshy-prog-txt" style="font-size:11px;color:#a9c;margin-top:4px;text-align:center">…</div>
      </div>

      <!-- nome p/ salvar -->
      <div id="meshy-saverow" style="display:none;margin-top:12px;gap:6px;align-items:center">
        <input id="meshy-name" placeholder="nome do asset" style="flex:1;background:#0c0c1e;color:#cdf;border:1px solid #527;padding:5px 8px;border-radius:5px">
        <button id="meshy-save" class="my-btn" style="background:#1a5a2a">💾 Salvar no Catálogo</button>
      </div>

      <div id="meshy-status" style="margin-top:10px;font-size:11px;color:#89a;min-height:16px"></div>

      <style>
        #meshy-panel .my-btn{background:#2a2a40;border:1px solid #527;color:#bcf;cursor:pointer;padding:5px 10px;border-radius:5px;font-size:11px;font-family:inherit}
        #meshy-panel .my-btn:hover{background:#3a3a55}
        #meshy-panel .my-tab{flex:1;background:#1a1a30;border:1px solid #335;color:#89a;cursor:pointer;padding:7px;border-radius:6px;font-family:inherit;font-size:12px}
        #meshy-panel .my-tab-on{background:#3a2a6a;color:#fff;border-color:#b6f}
        #meshy-panel .my-step{background:#1a2540;border:1px solid #46a;color:#bdf;cursor:pointer;padding:8px;border-radius:6px;font-size:11px;font-family:inherit}
        #meshy-panel .my-step:disabled{opacity:.4;cursor:not-allowed}
        #meshy-panel .my-step:hover:not(:disabled){background:#27407a}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._bind();
  }

  _bind() {
    const $ = id => this._el.querySelector('#' + id);
    $('meshy-close').onclick = () => this.hide();

    // key
    const keyInput = $('meshy-key');
    if (this.client.getKey()) keyInput.value = this.client.getKey();
    $('meshy-key-save').onclick = () => { this.client.setKey(keyInput.value.trim()); this._status('🔑 key salva'); };

    // abas
    $('meshy-tab-asset').onclick = () => this._tab('asset');
    $('meshy-tab-char').onclick  = () => this._tab('char');
    $('meshy-tab-tree').onclick  = () => { this._tab('tree'); this._renderTree(); };
    $('meshy-tab-lib').onclick   = () => { this._tab('lib'); this._renderLib(); };

    // asset steps
    $('meshy-s1').onclick = () => this._step1();
    $('meshy-s2').onclick = () => this._step2();
    $('meshy-s3').onclick = () => this._step3();
    $('meshy-s4').onclick = () => this._step4();
    $('meshy-auto').onclick = () => this._autoPipeline();
    $('meshy-save').onclick = () => this._saveToCatalog();

    // character steps
    $('meshy-c1').onclick = () => this._charStep1();
    $('meshy-c2').onclick = () => this._charStep2();
    $('meshy-c3').onclick = () => this._charStep3();
    $('meshy-c4').onclick = () => this._charStep4();
  }

  _tab(which) {
    const $ = id => this._el.querySelector('#' + id);
    $('meshy-asset').style.display = which === 'asset' ? 'block' : 'none';
    $('meshy-char').style.display  = which === 'char'  ? 'block' : 'none';
    $('meshy-tree').style.display  = which === 'tree'  ? 'block' : 'none';
    $('meshy-lib').style.display   = which === 'lib'   ? 'block' : 'none';
    $('meshy-tab-asset').classList.toggle('my-tab-on', which === 'asset');
    $('meshy-tab-char').classList.toggle('my-tab-on',  which === 'char');
    $('meshy-tab-tree').classList.toggle('my-tab-on',  which === 'tree');
    $('meshy-tab-lib').classList.toggle('my-tab-on',   which === 'lib');
  }

  // ── Árvore de itens do jogo ──────────────────────────────────────
  async _loadDone() {
    if (this._done) return this._done;
    try { this._done = await LocalDB.get('wishlist_done', {}); } catch (_) { this._done = {}; }
    return this._done;
  }

  async _renderTree() {
    const list = this._el.querySelector('#meshy-tree-list');
    if (!list) return;
    const done = await this._loadDone();
    const all = wishlistAllItems();
    const doneCount = all.filter(it => done[it.id]).length;
    this._el.querySelector('#meshy-tree-prog').textContent = `${doneCount}/${all.length} gerados`;

    list.innerHTML = '';
    for (const [cat, group] of Object.entries(AssetWishlist)) {
      const header = document.createElement('div');
      header.style.cssText = 'color:#c9f;font-weight:bold;margin:10px 0 4px;border-bottom:1px solid #ffffff15;padding-bottom:3px;font-size:12px';
      const gDone = group.items.filter(it => done[it.id]).length;
      header.textContent = `${group.label}  (${gDone}/${group.items.length})`;
      list.appendChild(header);

      for (const it of group.items) {
        const row = document.createElement('div');
        const isDone = !!done[it.id];
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 6px;margin:2px 0;border-radius:5px;cursor:pointer;background:#ffffff08';
        row.innerHTML = `
          <span style="flex:1">${isDone ? '✅' : '⬜'} ${it.name}</span>
          <span style="font-size:9px;color:#789">${isDone ? 'feito' : 'gerar →'}</span>`;
        row.onmouseenter = () => row.style.background = '#ffffff18';
        row.onmouseleave = () => row.style.background = '#ffffff08';
        row.onclick = () => this._pickFromTree(it);
        list.appendChild(row);
      }
    }
  }

  // Clicar num item da árvore: preenche o prompt e vai pra aba Asset
  _pickFromTree(item) {
    this._tab('asset');
    const promptBox = this._el.querySelector('#meshy-prompt');
    if (promptBox) promptBox.value = item.prompt;
    this._pendingWishId = item.id;   // marca p/ dar baixa quando salvar
    this._status(`📝 prompt de "${item.name}" carregado — clique em Gerar ou Pipeline Completo`);
  }

  async _markDone(wishId, generatedAssetId) {
    const done = await this._loadDone();
    done[wishId] = { at: Date.now(), assetId: generatedAssetId };
    this._done = done;
    try { await LocalDB.save('wishlist_done', done); } catch (_) {}
  }

  _status(msg) { const s = this._el.querySelector('#meshy-status'); if (s) s.textContent = msg; }
  _prog(pct, txt) {
    const wrap = this._el.querySelector('#meshy-prog');
    wrap.style.display = 'block';
    this._el.querySelector('#meshy-prog-bar').style.width = (pct || 0) + '%';
    this._el.querySelector('#meshy-prog-txt').textContent = txt || (pct + '%');
  }
  _enable(id, on = true) { const b = this._el.querySelector('#' + id); if (b) b.disabled = !on; }

  _checkKey() {
    if (!this.client.hasKey()) { this._status('⚠️ configure a API key primeiro'); return false; }
    return true;
  }

  // ── Notifica a AssetMachine ativa (se existir) ───────────────────
  _machine(method, ...args) {
    window._activeAssetMachine?.[method]?.(...args);
  }

  // ── ASSET pipeline ───────────────────────────────────────────────
  async _step1() {
    if (!this._checkKey()) return;
    const prompt = this._el.querySelector('#meshy-prompt').value.trim();
    if (!prompt) { this._status('digite uma descrição'); return; }
    const sess = this._ensureSession(prompt);
    this._status('🎨 gerando imagem…');
    this._machine('startGenerating');
    try {
      const r = await this.client.textToImage(prompt, { onProgress: (p, s) => this._prog(p, '🎨 imagem ' + s + ' ' + p + '%') });
      this._state.imageUrl = r.imageUrl;
      sess.image = r.imageUrl;
      await this._saveCurrentSession();
      const pv = this._el.querySelector('#meshy-preview'); pv.style.display = 'block';
      this._el.querySelector('#meshy-img').src = r.imageUrl;
      this._machine('showImage', r.imageUrl);
      this._enable('meshy-s2'); this._status('✅ imagem pronta — etapa 2 liberada');
    } catch (e) { this._machine('stopGenerating'); this._status('❌ ' + e.message); }
  }
  async _step2() {
    this._machine('startProcessing');   // 🔵 azul + imagem de referência visível
    this._status('🧊 convertendo p/ 3D…');
    try {
      const r = await this.client.imageTo3D(this._state.imageUrl, { onProgress: (p, s) => this._prog(p, '🧊 3D ' + s + ' ' + p + '%') });
      this._state.modelTaskId = r.taskId; this._state.glbUrl = r.glbUrl;
      const sess = this._ensureSession('');
      sess.glb3d = r.glbUrl;
      await this._saveCurrentSession();
      // Baixa o GLB e exibe no holograma 3D
      if (r.glbUrl) {
        this._status('📥 carregando preview 3D…');
        try {
          const blobUrl = await this.client.downloadToBlobURL(r.glbUrl);
          this._machine('show3D', blobUrl);
        } catch (_) {
          this._machine('show3D', r.glbUrl);   // fallback URL direta
        }
      } else {
        this._machine('doneProcessing');
      }
      this._enable('meshy-s3'); this._status('✅ modelo 3D pronto — etapa 3 liberada');
    } catch (e) { this._status('❌ ' + e.message); }
  }
  async _step3() {
    this._machine('startProcessing');   // 🔵 azul
    this._status('🔧 retopologia…');
    try {
      const r = await this.client.remesh(this._state.modelTaskId, { onProgress: (p, s) => this._prog(p, '🔧 remesh ' + s + ' ' + p + '%') });
      this._state.modelTaskId = r.taskId; this._state.glbUrl = r.glbUrl || this._state.glbUrl;
      const sess = this._ensureSession('');
      sess.glbRemesh = r.glbUrl || this._state.glbUrl;
      await this._saveCurrentSession();
      this._machine('doneProcessing');  // 🟢 verde
      this._enable('meshy-s4'); this._status('✅ otimizado — etapa 4 liberada');
    } catch (e) { this._status('❌ ' + e.message); }
  }
  async _step4() {
    const prompt = this._el.querySelector('#meshy-prompt').value.trim();
    this._machine('startProcessing');   // 🔵 azul
    this._status('🖌️ texturizando…');
    try {
      const r = await this.client.textureModel(this._state.modelTaskId, prompt, { onProgress: (p, s) => this._prog(p, '🖌️ textura ' + s + ' ' + p + '%') });
      this._state.glbUrl = r.glbUrl || this._state.glbUrl;
      const sess = this._ensureSession('');
      sess.glbTextured = r.glbUrl || this._state.glbUrl;
      await this._saveCurrentSession();
      this._machine('stopGenerating');  // feixe some, imagem fica
      this._showSave(prompt);
      this._status('✅ ASSET PRONTO! dê um nome e salve no catálogo');
    } catch (e) { this._status('❌ ' + e.message); }
  }

  async _autoPipeline() {
    await this._step1();
    if (!this._state.imageUrl) return;
    await this._step2();
    if (!this._state.modelTaskId) return;
    await this._step3();
    await this._step4();
  }

  _showSave(defaultName) {
    const row = this._el.querySelector('#meshy-saverow');
    row.style.display = 'flex';
    this._el.querySelector('#meshy-name').value = (defaultName || 'asset').slice(0, 24);
  }

  async _saveToCatalog() {
    if (!this._state.glbUrl) { this._status('nada pra salvar'); return; }
    const name = this._el.querySelector('#meshy-name').value.trim() || 'asset';
    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
    let list = [];
    try { list = await LocalDB.get('generated_assets', []); } catch (_) {}
    list.push({ id, name, glbUrl: this._state.glbUrl });
    await LocalDB.save('generated_assets', list);
    this.buildMode?._load?.();   // recarrega catálogo do BuildMode

    // Se veio da árvore de itens, dá baixa (marca como gerado)
    if (this._pendingWishId) {
      await this._markDone(this._pendingWishId, id);
      this._status(`✅ "${name}" salvo e marcado na árvore! Aparece em Construção [B]`);
      this._pendingWishId = null;
    } else {
      this._status('💾 salvo! aparece no menu de Construção [B]');
    }
  }

  // ── CHARACTER pipeline ───────────────────────────────────────────
  _charType() { return this._el.querySelector('input[name=chartype]:checked')?.value || 'humanoid'; }

  async _charStep1() {
    if (!this._checkKey()) return;
    const base = this._el.querySelector('#meshy-char-prompt').value.trim();
    if (!base) { this._status('descreva o personagem'); return; }
    const prompt = this.client.characterImagePrompt(base, this._charType());
    this._status('🎨 gerando imagem T-pose…');
    try {
      const r = await this.client.textToImage(prompt, { enhanceSuffix: '', onProgress: (p, s) => this._prog(p, '🎨 ' + s + ' ' + p + '%') });
      this._state.imageUrl = r.imageUrl;
      const pv = this._el.querySelector('#meshy-preview'); pv.style.display = 'block';
      this._el.querySelector('#meshy-img').src = r.imageUrl;
      this._enable('meshy-c2'); this._status('✅ imagem pronta');
    } catch (e) { this._status('❌ ' + e.message); }
  }
  async _charStep2() {
    this._status('🧊 convertendo p/ 3D…');
    try {
      const r = await this.client.imageTo3D(this._state.imageUrl, { onProgress: (p, s) => this._prog(p, '🧊 ' + s + ' ' + p + '%') });
      this._state.modelTaskId = r.taskId; this._state.glbUrl = r.glbUrl;
      this._enable('meshy-c3'); this._status('✅ modelo pronto');
    } catch (e) { this._status('❌ ' + e.message); }
  }
  async _charStep3() {
    this._status('🦴 rigando (' + this._charType() + ')…');
    try {
      const r = await this.client.rig(this._state.modelTaskId, this._charType(), { onProgress: (p, s) => this._prog(p, '🦴 rig ' + s + ' ' + p + '%') });
      this._state.riggedTaskId = r.taskId; this._state.glbUrl = r.glbUrl || this._state.glbUrl;
      this._enable('meshy-c4'); this._status('✅ riggado — pode baixar animações');
    } catch (e) { this._status('❌ ' + e.message); }
  }
  async _charStep4() {
    this._status('🎬 baixando animações…');
    try {
      const anims = await this.client.listAnimations();
      const quad = this._charType() === 'quadruped';
      // humanoide pega várias; quadrúpede normalmente só andar
      const wanted = quad ? ['walk', 'run'] : ['idle', 'walk', 'run', 'attack', 'death'];
      const picked = anims.filter(a => wanted.some(w => (a.name || '').toLowerCase().includes(w))).slice(0, quad ? 2 : 6);
      const out = [];
      for (let i = 0; i < picked.length; i++) {
        this._prog(Math.round((i / picked.length) * 100), '🎬 ' + picked[i].name);
        const r = await this.client.animate(this._state.riggedTaskId, picked[i].id);
        out.push({ name: picked[i].name, glbUrl: r.glbUrl });
      }
      // salva o personagem riggado + anims no DB
      let chars = [];
      try { chars = await LocalDB.get('generated_chars', []); } catch (_) {}
      const id = 'char_' + Date.now().toString(36);
      chars.push({ id, type: this._charType(), baseGlb: this._state.glbUrl, anims: out });
      await LocalDB.save('generated_chars', chars);
      this._status(`✅ personagem + ${out.length} animações salvos!`);
    } catch (e) { this._status('❌ ' + e.message); }
  }

  // ── Biblioteca: sessão atual ─────────────────────────────────────
  _ensureSession(prompt) {
    if (!this._currentSession) {
      this._currentSession = {
        id: 'sess_' + Date.now().toString(36),
        prompt: prompt || '',
        createdAt: Date.now(),
        image: null,
        glb3d: null,
        glbRemesh: null,
        glbTextured: null,
      };
    }
    return this._currentSession;
  }

  async _saveCurrentSession() {
    const machine = window._activeAssetMachine;
    if (!machine || !this._currentSession) return;
    await machine.saveSession(this._currentSession);
  }

  // ── Biblioteca: renderiza tab ────────────────────────────────────
  async _renderLib() {
    const list = this._el.querySelector('#meshy-lib-list');
    if (!list) return;
    const machine = window._activeAssetMachine;
    if (!machine) { list.innerHTML = '<div style="color:#566">Nenhuma máquina ativa.</div>'; return; }
    list.innerHTML = '<div style="color:#89a;font-size:11px">Carregando…</div>';
    const sessions = await machine.getSessions();
    if (!sessions.length) { list.innerHTML = '<div style="color:#566">Nenhuma sessão ainda. Gere algo!</div>'; return; }
    list.innerHTML = '';
    for (const s of sessions) {
      const card = document.createElement('div');
      card.style.cssText = 'background:#0e0e1e;border:1px solid #335;border-radius:8px;padding:10px';
      const date = new Date(s.createdAt).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
      card.innerHTML = `
          <div style="display:flex;gap:8px;align-items:flex-start">
              ${s.image ? `<img src="${s.image}" style="width:72px;height:72px;object-fit:cover;border-radius:5px;border:1px solid #446;flex-shrink:0" onerror="this.style.display='none'">` : '<div style="width:72px;height:72px;background:#111;border-radius:5px;border:1px solid #333;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#445;font-size:20px">🖼</div>'}
              <div style="flex:1;min-width:0">
                  <div style="font-size:11px;color:#c9f;font-weight:bold;margin-bottom:3px;word-break:break-word">${s.prompt.slice(0,60)}${s.prompt.length > 60 ? '…' : ''}</div>
                  <div style="font-size:10px;color:#556;margin-bottom:6px">${date}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                      ${s.image      ? `<button class="lib-dl" data-url="${s.image}" data-name="imagem.png" style="background:#1a2a1a;border:1px solid #2a6;color:#cee;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px">📷 Imagem</button>` : ''}
                      ${s.glb3d     ? `<button class="lib-dl" data-url="${s.glb3d}" data-name="modelo_3d.glb" style="background:#1a1a2a;border:1px solid #46a;color:#bdf;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px">📦 3D</button>` : ''}
                      ${s.glbRemesh ? `<button class="lib-dl" data-url="${s.glbRemesh}" data-name="retopo.glb" style="background:#1a1a2a;border:1px solid #46a;color:#bdf;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px">🔧 Retopo</button>` : ''}
                      ${s.glbTextured ? `<button class="lib-dl" data-url="${s.glbTextured}" data-name="finalizado.glb" style="background:#2a1a2a;border:1px solid #b6f;color:#dce;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px">✨ Final</button>` : ''}
                      ${s.glb3d || s.glbTextured ? `<button class="lib-view" data-url="${s.glbTextured || s.glb3d}" style="background:#2a2a1a;border:1px solid #a84;color:#fc8;cursor:pointer;padding:3px 7px;border-radius:4px;font-size:10px">👁 Ver 3D</button>` : ''}
                  </div>
              </div>
          </div>`;
      list.appendChild(card);
    }
    // bind download buttons
    list.querySelectorAll('.lib-dl').forEach(btn => {
      btn.onclick = () => this._downloadFile(btn.dataset.url, btn.dataset.name);
    });
    list.querySelectorAll('.lib-view').forEach(btn => {
      btn.onclick = () => window._activeAssetMachine?.show3D?.(btn.dataset.url);
    });
  }

  async _downloadFile(url, filename) {
    if (!url) return;
    this._status('⬇️ preparando download…');
    try {
      let blobUrl;
      if (url.startsWith('blob:')) {
        blobUrl = url;
      } else {
        const blob = await this.client.downloadToBlobURL(url).then(bu => fetch(bu)).then(r => r.blob()).catch(() => fetch(url).then(r => r.blob()));
        blobUrl = URL.createObjectURL(blob);
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch(_){} }, 15000);
      this._status('✅ download iniciado: ' + filename);
    } catch(e) {
      this._status('❌ download falhou: ' + e.message);
      // fallback: open in new tab
      window.open(url, '_blank');
    }
  }

  show() {
    this._active = true;
    this._el.style.display = 'block';
    this._currentSession = null; // nova sessão para cada abertura
    window._gameInput?.deactivate?.();
    // Checa se a chave já está no .env (servidor). Se sim, esconde o campo.
    this.client.checkServerKey().then(serverHas => {
      const keyrow = this._el.querySelector('#meshy-keyrow');
      if (serverHas) {
        if (keyrow) keyrow.style.display = 'none';
        this._status('🔑 chave carregada do .env — pronto pra gerar!');
      } else if (!this.client.hasKey()) {
        if (keyrow) keyrow.style.display = 'flex';
        this._status('⚠️ configure a chave: edite o .env (MESHY_KEY=...) e reinicie o servidor, OU cole aqui');
      }
    });
  }
  hide() { this._active = false; this._el.style.display = 'none'; window._gameInput?.activate?.(); }
  toggle() { this._active ? this.hide() : this.show(); }
}
