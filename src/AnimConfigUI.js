// ─────────────────────────────────────────────────────────────────
//  AnimConfigUI — painel lateral: mapear + explorar + renomear
//  Tecla K abre/fecha | câmera showcase automática
// ─────────────────────────────────────────────────────────────────

const STORAGE_MAP   = 'transfps_anim_map';    // estado → animação
const STORAGE_NAMES = 'transfps_anim_names';  // animação original → apelido

// ── NAMES_START ──
// Apelidos padrão gravados em código (calibrados pelo usuário via Explorar)
const DEFAULT_ANIM_NAMES = {
  'Archery_Shot_1':                      'Tiro-arco',
  'Archery_Shot_3':                      'Pulo-com-corrida',
  'Climb_Stairs':                        'Mortal de lado',
  'Idle_5':                              'pulo parado',
  'Jump_Down_from_Wall':                 'Parado - Iddle',
  'Jump_Over_Obstacle_2':                'Rolamento',
  'Parkour_Vault_with_Roll':             'Correr',
  'Regular_Jump':                        'Mirando para traz',
  'Roll_Dodge_1':                        'Mirando e andando',
  'Run_and_Shoot':                       'Tiro arco 2',
  'Running':                             'correndo e recarregando',
  'Running_Reload':                      'subindo escada',
  'Walk_Backward_While_Shooting':        'andando',
  'Walk_Backward_with_Bow_Aimed':        'walljump',
  'Walk_Forward_with_Bow_Aimed':         'correndo mirando',
  'Walking':                             'indo para traz e mirando arco',
};
// ── NAMES_END ──



const STATE_LABELS = {
  idle:       { pt: 'Parado (idle)',           icon: '🧍' },
  walk:       { pt: 'Andando',                 icon: '🚶' },
  walk_aim:   { pt: 'Andando + mira',          icon: '🎯' },
  walk_back:  { pt: 'Andando para trás',       icon: '↩️' },
  run:        { pt: 'Correndo',                icon: '🏃' },
  run_shoot:  { pt: 'Correndo + atirando',     icon: '🏹' },
  run_reload: { pt: 'Correndo + recarregando', icon: '🔄' },
  jump:       { pt: 'Pulando',                 icon: '⬆️' },
  fall:       { pt: 'Caindo',                  icon: '⬇️' },
  wall_ready: { pt: 'Na parede (pronto)',       icon: '🧱' },
  wall_jump:  { pt: 'Wall jump',               icon: '↗️' },
  roll:       { pt: 'Roll / morte',            icon: '💀' },
  shoot:      { pt: 'Atirando parado',         icon: '🏹' },
  shoot_back: { pt: 'Atirando para trás',      icon: '🔙' },
  reload:     { pt: 'Recarregando',            icon: '🔃' },
};

const CAM_DIST  = 3.8;
const CAM_H     = 1.4;
const CAM_ANGLE = 0.35;
const AUTO_RPM  = 12;

export class AnimConfigUI {
  constructor(player) {
    this._player    = player;
    this._animator  = null;
    this._panel     = null;
    this._visible   = false;
    this._tab       = 'map';     // 'map' | 'explore'

    this._tempMap     = {};      // mapa em edição
    this._customNames = {};      // animação original → apelido (persiste no LS)
    this._animNames   = [];

    this._savedCamPos = null;
    this._savedCamTgt = null;
    this._savedTPS    = false;
    this._rotObs      = null;

    this._injectStyles();
    this._buildPanel();

    window.addEventListener('keydown', e => {
      if (e.code === 'KeyK' && !e.repeat) this.toggle();
    });
  }

  // ── Conecta ao animator ───────────────────────────────────────
  setAnimator(animator) {
    this._animator  = animator;
    this._animNames = Object.keys(animator._anims).sort();
    this._tempMap   = { ...animator._animMap };
    this._loadSaved();
    if (this._visible) this._renderTab();
  }

  // ── Abre / fecha ──────────────────────────────────────────────
  toggle() {
    this._visible = !this._visible;
    this._panel.style.display = this._visible ? 'flex' : 'none';
    if (this._visible) {
      if (this._animator) {
        this._tempMap = { ...this._animator._animMap };
        this._renderTab();
      }
      this._enterShowcase();
    } else {
      this._exitShowcase();
    }
  }

  hide() { if (this._visible) this.toggle(); }

  // ── localStorage ──────────────────────────────────────────────
  _loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_MAP);
      if (raw) {
        const saved = JSON.parse(raw);
        this._animator?.setAnimMap(saved);
        this._tempMap = { ...saved };
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(STORAGE_NAMES);
      if (raw) this._customNames = JSON.parse(raw);
    } catch (e) {}
  }

  _saveNames() {
    localStorage.setItem(STORAGE_NAMES, JSON.stringify(this._customNames));
  }

  // Retorna o nome de exibição de uma animação (apelido ou original)
  _displayName(original) {
    return this._customNames[original] || original;
  }

  // ─────────────────────────────────────────────────────────────
  //  SHOWCASE
  // ─────────────────────────────────────────────────────────────
  _enterShowcase() {
    const p = this._player;
    if (!p) return;
    window._gameInput?.deactivate?.();
    this._savedTPS = p._tpsMode ?? false;
    if (!p._tpsMode) {
      p._tpsMode = true;
      p.animator?.setVisible(true);
      if (p.weapon?._root)    p.weapon._root.setEnabled(false);
      if (p.weapon?._glbRoot) p.weapon._glbRoot.setEnabled(false);
    }
    p.animator?.setVisible(true);

    const cam = p.camera;
    if (!cam) return;
    this._savedCamPos = cam.position.clone();
    this._savedCamTgt = cam.target?.clone?.() ?? p.mesh.position.clone();
    this._moveCamToShowcase();

    const scene = p.scene;
    let lastT = performance.now();
    this._rotObs = scene.onBeforeRenderObservable.add(() => {
      if (!p.animator?.root) return;
      const now = performance.now();
      const dt  = (now - lastT) / 1000;
      lastT = now;
      p.animator.root.rotation.y =
        (p.animator.root.rotation.y + (AUTO_RPM * Math.PI / 180) * dt) % (Math.PI * 2);
    });
  }

  _moveCamToShowcase() {
    const p = this._player;
    if (!p?.camera) return;
    const pos = p.mesh.position;
    p.camera.position.set(
      pos.x + Math.sin(CAM_ANGLE) * CAM_DIST,
      pos.y + CAM_H,
      pos.z + Math.cos(CAM_ANGLE) * CAM_DIST
    );
    p.camera.setTarget(new BABYLON.Vector3(pos.x, pos.y + 0.9, pos.z));
  }

  _exitShowcase() {
    const p = this._player;
    if (!p) return;
    if (this._rotObs) {
      p.scene?.onBeforeRenderObservable?.remove(this._rotObs);
      this._rotObs = null;
    }
    if (this._animator) this._animator._curKey = '';
    if (!this._savedTPS && p._tpsMode) {
      p._tpsMode = false;
      p.animator?.setVisible(false);
      if (p.weapon?._root)    p.weapon._root.setEnabled(true);
      if (p.weapon?._glbRoot) p.weapon._glbRoot.setEnabled(true);
    }
    this._savedCamPos = null;
    this._savedCamTgt = null;

    // Re-ativa o loop do jogo sem forçar pointer lock imediatamente.
    // O usuário re-adquire o lock clicando na tela (comportamento padrão do browser).
    const inp = window._gameInput;
    if (inp) {
      inp.gameActive = true;
      document.body.classList.add('game-active');
      // Atualiza texto do botão de foco
      const btn = document.getElementById('focus-btn');
      if (btn) btn.textContent = '⏸ Pausar';
      const ov = document.getElementById('pause-overlay');
      if (ov) ov.classList.remove('visible');
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  DOM — estrutura fixa do painel
  // ─────────────────────────────────────────────────────────────
  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'anim-cfg-panel';
    panel.innerHTML = `
      <div class="acfg-header">
        <span>🐭 Animações do Player</span>
        <div class="acfg-header-hint">Tecla <kbd>K</kbd> abre/fecha</div>
        <button id="acfg-close">✕</button>
      </div>

      <div class="acfg-tabs">
        <button class="acfg-tab acfg-tab--on" data-tab="map">🗺️ Mapear</button>
        <button class="acfg-tab" data-tab="explore">🔍 Explorar</button>
      </div>

      <div class="acfg-info" id="acfg-info">
        Personagem girando ao vivo &nbsp;|&nbsp; <kbd>▶</kbd> pré-visualiza
      </div>

      <div id="acfg-body"></div>

      <div class="acfg-footer">
        <span id="acfg-status"></span>
        <div class="acfg-btns">
          <button id="acfg-reset">↺ Padrão</button>
          <button id="acfg-save">💾 Salvar</button>
        </div>
      </div>
    `;
    panel.style.display = 'none';
    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector('#acfg-close').onclick = () => this.hide();
    panel.querySelector('#acfg-save').onclick  = () => this._save();
    panel.querySelector('#acfg-reset').onclick = () => this._resetDefaults();

    panel.querySelectorAll('.acfg-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        panel.querySelectorAll('.acfg-tab').forEach(b => b.classList.remove('acfg-tab--on'));
        btn.classList.add('acfg-tab--on');
        this._renderTab();
        // Muda texto info
        const info = panel.querySelector('#acfg-info');
        if (this._tab === 'explore') {
          info.innerHTML = '✏️ <b>Clique no apelido</b> para renomear &nbsp;|&nbsp; <kbd>▶</kbd> pré-visualiza';
        } else {
          info.innerHTML = 'Personagem girando ao vivo &nbsp;|&nbsp; <kbd>▶</kbd> pré-visualiza';
        }
      });
    });
  }

  // ── Renderiza conteúdo conforme aba ─────────────────────────
  _renderTab() {
    const body = this._panel.querySelector('#acfg-body');
    body.innerHTML = '';
    if (this._tab === 'map')     this._buildMapTab(body);
    else                          this._buildExploreTab(body);
  }

  // ─────────────────────────────────────────────────────────────
  //  ABA MAPEAR
  // ─────────────────────────────────────────────────────────────
  _buildMapTab(container) {
    const curMap = this._animator?._animMap ?? {};

    for (const [key, info] of Object.entries(STATE_LABELS)) {
      const currentAnim = curMap[key] ?? '';

      const row = document.createElement('div');
      row.className = 'acfg-row';

      // Label
      const lbl = document.createElement('div');
      lbl.className = 'acfg-label';
      lbl.innerHTML = `
        <span class="acfg-icon">${info.icon}</span>
        <div class="acfg-ltext">
          <span class="acfg-pt">${info.pt}</span>
          <code class="acfg-key">${key}</code>
        </div>`;

      // Dropdown — mostra apelido (original entre parênteses se tiver apelido)
      const sel = document.createElement('select');
      sel.dataset.key = key;

      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— não mapeado —';
      if (!currentAnim) blank.selected = true;
      sel.appendChild(blank);

      for (const name of this._animNames) {
        const opt   = document.createElement('option');
        opt.value   = name;
        const alias = this._customNames[name];
        opt.textContent = alias ? `${alias}  (${name})` : name;
        if (name === currentAnim) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        this._tempMap[key] = sel.value;
        this._setStatus('⚠️ Não salvo', '#ffaa00');
      });

      // Botão ▶
      const prev = document.createElement('button');
      prev.className = 'acfg-prev';
      prev.innerHTML = '▶';
      prev.title = 'Pré-visualizar';
      prev.addEventListener('click', () => this._previewAnim(sel.value, prev));

      row.appendChild(lbl);
      row.appendChild(sel);
      row.appendChild(prev);
      container.appendChild(row);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  ABA EXPLORAR — lista todas as animações com rename
  // ─────────────────────────────────────────────────────────────
  _buildExploreTab(container) {
    const header = document.createElement('div');
    header.className = 'acfg-explore-header';
    header.innerHTML = `
      <span style="color:#888;font-size:11px">
        ${this._animNames.length} animações no modelo &nbsp;·&nbsp;
        Clique no apelido para editar
      </span>`;
    container.appendChild(header);

    for (const name of this._animNames) {
      const alias = this._customNames[name] ?? '';

      const row = document.createElement('div');
      row.className = 'acfg-explore-row';

      // Botão preview
      const prev = document.createElement('button');
      prev.className = 'acfg-prev';
      prev.innerHTML = '▶';
      prev.title = `Tocar: ${name}`;
      prev.addEventListener('click', () => this._previewAnim(name, prev));

      // Nome original (fixo)
      const orig = document.createElement('div');
      orig.className = 'acfg-orig-name';
      orig.textContent = name;
      orig.title = 'Nome original no GLB';

      // Apelido editável
      const aliasWrap = document.createElement('div');
      aliasWrap.className = 'acfg-alias-wrap';

      const aliasInput = document.createElement('input');
      aliasInput.type        = 'text';
      aliasInput.className   = 'acfg-alias-input';
      aliasInput.placeholder = 'Apelido…';
      aliasInput.value       = alias;
      aliasInput.title       = 'Clique para dar um apelido a esta animação';

      // Salva apelido ao confirmar (Enter ou blur)
      const saveAlias = () => {
        const val = aliasInput.value.trim();
        if (val) {
          this._customNames[name] = val;
          aliasInput.classList.add('acfg-alias--saved');
          setTimeout(() => aliasInput.classList.remove('acfg-alias--saved'), 800);
        } else {
          delete this._customNames[name];
        }
        this._saveNames();
      };
      aliasInput.addEventListener('blur',  saveAlias);
      aliasInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { saveAlias(); aliasInput.blur(); }
        e.stopPropagation();  // evita que K feche o painel
      });

      // Ícone de lápis (hint visual)
      const pencil = document.createElement('span');
      pencil.className = 'acfg-pencil';
      pencil.textContent = '✏️';
      pencil.title = 'Clique no campo ao lado para editar';

      aliasWrap.appendChild(aliasInput);
      aliasWrap.appendChild(pencil);

      row.appendChild(prev);
      row.appendChild(orig);
      row.appendChild(aliasWrap);
      container.appendChild(row);
    }
  }

  // ── Preview ao vivo ───────────────────────────────────────────
  _previewAnim(animName, btn) {
    if (!this._animator || !animName) return;
    const ag = this._animator._anims[animName];
    if (!ag) return;

    if (this._animator._cur) this._animator._cur.stop();
    ag.start(true, 1.0, ag.from, ag.to, false);
    this._animator._cur    = ag;
    this._animator._curKey = '__preview__';

    this._panel.querySelectorAll('.acfg-prev').forEach(b => b.classList.remove('acfg-prev--on'));
    btn?.classList.add('acfg-prev--on');
  }

  // ── Salva mapa — localStorage + grava nos arquivos JS ───────────
  async _save() {
    if (!this._animator) { this._setStatus('❌ Modelo não carregado'); return; }

    // Filtra keys vazias
    const clean = {};
    for (const [k, v] of Object.entries(this._tempMap)) if (v) clean[k] = v;

    // Aplica ao animator ao vivo
    this._animator.setAnimMap(clean);
    this._animator._curKey = '';

    // Persiste no localStorage (fallback rápido)
    localStorage.setItem(STORAGE_MAP,   JSON.stringify(clean));
    localStorage.setItem(STORAGE_NAMES, JSON.stringify(this._customNames));

    this._setStatus('💾 Gravando nos arquivos…', '#ffcc00');

    try {
      // Chama o config-server local (node tools/config-server.js)
      const res = await fetch('http://localhost:3099/save-anim-config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ animMap: clean, animNames: this._customNames }),
      });
      const data = await res.json();

      if (data.ok) {
        this._setStatus('✅ Salvo no código!', '#22cc55');
        this._showToast('✅ Gravado em PlayerAnimator.js!');
      } else {
        throw new Error(data.error ?? 'Erro desconhecido');
      }
    } catch (e) {
      // Config-server não está rodando — salvo só no localStorage
      console.warn('⚠️ config-server não disponível:', e.message);
      this._setStatus('⚠️ Salvo só no localStorage (inicie config-server)', '#ffaa00');
      this._showToast('⚠️ Salvo localmente — inicie config-server para gravar no código');
    }
  }

  _resetDefaults() {
    if (!this._animator) return;
    localStorage.removeItem(STORAGE_MAP);
    this._animator.resetAnimMap();
    this._animator._curKey = '';
    this._tempMap = { ...this._animator._animMap };
    this._renderTab();
    this._setStatus('↺ Padrão restaurado', '#ffaa00');
  }

  _setStatus(msg, color = '#aaa') {
    const el = this._panel.querySelector('#acfg-status');
    if (el) { el.textContent = msg; el.style.color = color; }
  }

  _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'acfg-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ─────────────────────────────────────────────────────────────
  //  ESTILOS
  // ─────────────────────────────────────────────────────────────
  _injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #anim-cfg-panel {
        position: fixed; top:0; right:0; bottom:0;
        width: 420px;
        background: rgba(11,11,18,0.97);
        border-left: 2px solid #ffcc00;
        color: #eee;
        font-family: 'Segoe UI', Arial, sans-serif;
        flex-direction: column;
        z-index: 10000;
        box-shadow: -8px 0 40px rgba(0,0,0,.7);
        overflow: hidden;
      }

      /* Cabeçalho */
      .acfg-header {
        display: flex; align-items: center; gap: 8px;
        background: linear-gradient(90deg,#ffcc00,#ffaa00);
        color: #111; font-weight: bold; font-size: 14px;
        padding: 10px 12px; flex-shrink: 0;
      }
      .acfg-header-hint { font-size:11px; font-weight:normal; color:#555; margin-right:auto; }
      .acfg-header kbd  { background:rgba(0,0,0,.15); border-radius:3px; padding:0 4px; font-family:monospace; }
      .acfg-header button {
        background:none; border:none; font-size:17px; cursor:pointer;
        color:#333; font-weight:bold; padding:0 2px; line-height:1; flex-shrink:0;
      }
      .acfg-header button:hover { color:#000; }

      /* Abas */
      .acfg-tabs {
        display: flex; background: #0a0a14; border-bottom: 1px solid #222;
        flex-shrink: 0;
      }
      .acfg-tab {
        flex: 1; padding: 8px 0; border: none; cursor: pointer;
        background: transparent; color: #666; font-size: 13px; font-weight: bold;
        border-bottom: 3px solid transparent; transition: all .15s;
      }
      .acfg-tab:hover { color: #ccc; background: rgba(255,255,255,.03); }
      .acfg-tab--on   { color: #ffcc00 !important; border-bottom-color: #ffcc00; background: rgba(255,204,0,.06); }

      /* Info bar */
      .acfg-info {
        font-size: 11px; color: #555; background: #0d0d16;
        padding: 4px 12px; border-bottom: 1px solid #1a1a28; flex-shrink:0;
      }
      .acfg-info kbd {
        background:#1e1e2a; border:1px solid #444; border-radius:3px;
        padding:0 4px; font-size:10px; color:#ffcc00; font-family:monospace;
      }

      /* Body scrollável */
      #acfg-body {
        overflow-y: auto; flex: 1; padding: 5px 8px; background: #0d0d16;
      }
      #acfg-body::-webkit-scrollbar { width:5px; }
      #acfg-body::-webkit-scrollbar-track { background:#111; }
      #acfg-body::-webkit-scrollbar-thumb { background:#333; border-radius:3px; }

      /* ── Aba MAPEAR ── */
      .acfg-row {
        display:flex; align-items:center; gap:6px;
        padding:5px 6px; margin:3px 0; border-radius:7px;
        background:rgba(255,255,255,.03); transition:background .15s;
      }
      .acfg-row:hover { background:rgba(255,204,0,.07); }
      .acfg-label { display:flex; align-items:center; gap:6px; flex:0 0 155px; min-width:0; }
      .acfg-icon  { font-size:15px; flex-shrink:0; }
      .acfg-ltext { display:flex; flex-direction:column; min-width:0; }
      .acfg-pt    { font-size:11.5px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      code.acfg-key {
        font-size:9.5px; color:#ffcc00; background:#1e1e2e;
        border-radius:3px; padding:1px 4px; width:fit-content; font-family:monospace;
      }
      .acfg-row select {
        flex:1; background:#171722; color:#ddd; border:1px solid #3a3a55;
        border-radius:5px; padding:4px 6px; font-size:11px; cursor:pointer;
        min-width:0; font-family:monospace;
      }
      .acfg-row select:focus { outline:1px solid #ffcc00; border-color:#ffcc00; }
      .acfg-row select option { background:#1a1a28; color:#eee; }

      /* ── Aba EXPLORAR ── */
      .acfg-explore-header { padding:6px 4px 4px; flex-shrink:0; }
      .acfg-explore-row {
        display:flex; align-items:center; gap:8px;
        padding:5px 4px; margin:3px 0; border-radius:7px;
        background:rgba(255,255,255,.03); transition:background .15s;
      }
      .acfg-explore-row:hover { background:rgba(255,204,0,.06); }
      .acfg-orig-name {
        flex:1; font-size:11px; color:#99a; font-family:monospace;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        min-width:0;
      }
      .acfg-alias-wrap {
        display:flex; align-items:center; gap:4px; flex:0 0 140px;
      }
      .acfg-alias-input {
        flex:1; background:#1a1a28; color:#ffdd88; border:1px solid #3a3a55;
        border-radius:5px; padding:4px 7px; font-size:11px; min-width:0;
        font-family:'Segoe UI', sans-serif;
        transition: border-color .2s, background .2s;
      }
      .acfg-alias-input:focus { outline:none; border-color:#ffcc00; background:#22222e; }
      .acfg-alias-input::placeholder { color:#444; }
      .acfg-alias--saved { background:#1a3a1a !important; border-color:#44cc44 !important; }
      .acfg-pencil { font-size:12px; cursor:default; opacity:.5; flex-shrink:0; }

      /* Botão ▶ (compartilhado) */
      .acfg-prev {
        background:#1e1e2e; border:1px solid #3a3a55; border-radius:5px;
        color:#888; font-size:13px; width:30px; height:28px;
        cursor:pointer; flex-shrink:0; display:flex;
        align-items:center; justify-content:center; transition:all .15s;
      }
      .acfg-prev:hover { background:#2a2a3e; color:#ffcc00; border-color:#ffcc00; }
      .acfg-prev--on   { background:#ffcc00 !important; color:#111 !important; border-color:#ffcc00 !important; }

      /* Rodapé */
      .acfg-footer {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding:9px 12px; background:#080810; border-top:1px solid #222; flex-shrink:0;
      }
      #acfg-status { font-size:11px; color:#aaa; }
      .acfg-btns   { display:flex; gap:7px; }
      .acfg-btns button {
        padding:6px 15px; border-radius:6px; border:none;
        font-size:12px; font-weight:bold; cursor:pointer; transition:background .15s;
      }
      #acfg-reset { background:#222232; color:#888; }
      #acfg-reset:hover { background:#2e2e45; color:#fff; }
      #acfg-save  { background:#ffcc00; color:#111; }
      #acfg-save:hover { background:#ffd740; }

      /* Toast */
      .acfg-toast {
        position:fixed; bottom:28px; left:calc(50% - 210px);
        transform:translateX(-50%);
        background:#22cc55; color:#fff; font-weight:bold;
        padding:9px 22px; border-radius:22px; font-size:13px;
        z-index:10001; pointer-events:none;
        animation:acfg-fadein .25s ease;
        box-shadow:0 4px 16px rgba(0,0,0,.5);
      }
      @keyframes acfg-fadein {
        from { opacity:0; transform:translateX(-50%) translateY(10px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }
}
