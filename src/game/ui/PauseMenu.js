// ─────────────────────────────────────────────────────────────────
//  PauseMenu — menu de pausa FULLSCREEN estilo Far Cry / Avengers.
//
//  Top bar com as abas; abaixo, cada aba libera o seu painel.
//  Abas: Inventário · Habilidades · Mundo · Personagem · Config · PvP
//  Ações (direita): ▶ Retomar (ESC) · 🚪 Sair
//
//  API PRESERVADA (usada pelo main.js + ScreenFocusManager):
//    show() · hide() · isOpen · justOpened · adoptTool(elOrId)
//  Mostrado no ESC via window._screenFocus.enterMenu() (cursor sempre ok).
//  Os botões soltos da tela (Terreno/Interativos/Servidor/mudo/Horda) são
//  ADOTADOS pra dentro, numa faixa de ferramentas no rodapé do menu.
// ─────────────────────────────────────────────────────────────────
import { SKILL_DEFS } from '../skills/SkillSystem.js';
import { ItemCatalog } from '../items/ItemCatalog.js';

const TABS = [
  { id: 'inv',    label: 'Inventário',  icon: '🎒' },
  { id: 'skills', label: 'Habilidades', icon: '⚡' },
  { id: 'world',  label: 'Mundo',       icon: '🌍' },
  { id: 'char',   label: 'Personagem',  icon: '🐭' },
  { id: 'edit',   label: 'Editores',    icon: '🧰' },
  { id: 'cfg',    label: 'Config',      icon: '⚙️' },
  { id: 'pvp',    label: 'PvP',         icon: '⚔' },
];

export class PauseMenu {
  constructor() {
    this._open = false;
    this._active = 'inv';
    this._injectStyle();
    this._build();
  }

  _injectStyle() {
    if (document.getElementById('fc-pause-style')) return;
    const s = document.createElement('style');
    s.id = 'fc-pause-style';
    s.textContent = `
      #fn-pause { position:fixed; inset:0; z-index:200; display:none; flex-direction:column;
        background:radial-gradient(ellipse at 50% 0%, rgba(12,22,38,0.97), rgba(4,8,16,0.98));
        font-family:'Segoe UI',system-ui,sans-serif; color:#dfeefc; }
      #fn-pause.fc-on { display:flex; }
      #fc-topbar { display:flex; align-items:center; justify-content:space-between;
        padding:0 26px; height:66px; background:linear-gradient(180deg,rgba(8,16,28,0.96),rgba(8,16,28,0.5));
        border-bottom:1px solid rgba(90,180,255,0.18); box-shadow:0 6px 24px rgba(0,0,0,0.45); flex-shrink:0; }
      #fc-tabs { display:flex; gap:2px; height:100%; }
      .fc-tab { position:relative; background:none; border:none; color:#7c93a8;
        font:700 14px 'Segoe UI',monospace; letter-spacing:1.5px; text-transform:uppercase;
        padding:0 18px; height:100%; cursor:pointer; display:flex; align-items:center; gap:8px; transition:color .15s; }
      .fc-tab:hover { color:#cfe6ff; }
      .fc-tab.active { color:#fff; }
      .fc-tab.active::after { content:''; position:absolute; left:14px; right:14px; bottom:0; height:3px;
        background:linear-gradient(90deg,#3fd0ff,#ffb13f); border-radius:3px 3px 0 0; box-shadow:0 0 12px rgba(63,208,255,0.6); }
      .fc-tab .fc-ic { font-size:16px; }
      #fc-actions { display:flex; gap:10px; }
      .fc-act { background:rgba(255,255,255,0.04); border:1px solid rgba(120,170,210,0.3); color:#cfe6ff;
        font:700 12px 'Segoe UI',monospace; letter-spacing:1px; text-transform:uppercase; padding:9px 16px;
        border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all .15s; }
      .fc-act:hover { background:rgba(63,208,255,0.12); border-color:rgba(63,208,255,0.55); color:#fff; }
      .fc-act.resume { background:linear-gradient(135deg,#18d49a,#0fae8e); border-color:transparent; color:#04201a; }
      .fc-act.resume:hover { filter:brightness(1.1); }
      .fc-act.quit:hover { background:rgba(255,80,80,0.14); border-color:rgba(255,90,90,0.6); color:#ffd0d0; }
      .fc-act kbd { background:rgba(0,0,0,0.25); border-radius:4px; padding:1px 6px; font-size:10px; opacity:.8; }
      #fc-content { flex:1; overflow:auto; padding:26px 34px; }
      #fc-content::-webkit-scrollbar { width:10px; }
      #fc-content::-webkit-scrollbar-thumb { background:rgba(90,150,200,0.3); border-radius:6px; }
      .fc-h { font:800 22px 'Segoe UI',monospace; letter-spacing:2px; text-transform:uppercase; color:#fff; margin:0 0 4px; }
      .fc-sub { color:#6f8499; font-size:13px; margin:0 0 22px; }
      .fc-grid { display:grid; gap:14px; }
      .fc-cards { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
      .fc-card { background:linear-gradient(160deg,rgba(16,28,44,0.9),rgba(10,18,30,0.95));
        border:1px solid rgba(90,150,210,0.22); border-radius:12px; padding:14px;
        display:flex; flex-direction:column; gap:6px; transition:border-color .15s, transform .1s; }
      .fc-card:hover { border-color:rgba(63,208,255,0.5); transform:translateY(-2px); }
      .fc-card .ic { font-size:30px; line-height:1; }
      .fc-card img.ic { width:46px; height:46px; object-fit:contain; }
      .fc-card .nm { font:700 14px 'Segoe UI',monospace; color:#eaf4ff; }
      .fc-card .dt { font-size:12px; color:#8aa0b4; line-height:1.35; }
      .fc-card .qty { align-self:flex-start; background:rgba(63,208,255,0.16); color:#9fe4ff;
        font:700 11px monospace; padding:2px 9px; border-radius:20px; }
      .fc-key { display:inline-block; background:rgba(255,177,63,0.18); color:#ffce8a;
        font:800 12px monospace; padding:2px 8px; border-radius:6px; min-width:22px; text-align:center; }
      .fc-empty { color:#5a7088; font-size:14px; padding:30px; text-align:center; }
      .fc-hotbar { display:flex; gap:8px; flex-wrap:wrap; margin:4px 0 6px; }
      .fc-slot { position:relative; width:84px; height:84px; border-radius:12px; cursor:pointer;
        background:linear-gradient(160deg,rgba(16,28,44,0.9),rgba(10,18,30,0.95));
        border:2px solid rgba(90,150,210,0.25); display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:2px; transition:all .12s; }
      .fc-slot:hover { border-color:rgba(63,208,255,0.6); transform:translateY(-2px); }
      .fc-slot.filled { border-color:rgba(63,208,255,0.45); }
      .fc-slot .slot-num { position:absolute; top:3px; left:6px; font:800 12px monospace; color:#ffd24a; text-shadow:0 0 3px #000; }
      .fc-slot .slot-ic { font-size:30px; line-height:1; }
      .fc-slot img.slot-ic { width:42px; height:42px; object-fit:contain; }
      .fc-slot .slot-nm { font:600 9px monospace; color:#9fc4e6; max-width:78px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; }
      .fc-slot .slot-empty { font:600 11px monospace; color:#3a526a; }
      .fc-bagitem { cursor:pointer; }
      .fc-bagitem.equipped { border-color:rgba(63,208,255,0.55); box-shadow:0 0 12px rgba(63,208,255,0.2); }
      .fc-card span.ic { font-size:30px; }
      .fc-card img.ic, .fc-card span.ic { width:46px; height:46px; }
      .fc-btn { background:linear-gradient(135deg,rgba(30,50,80,0.9),rgba(18,32,52,0.95));
        border:1px solid rgba(90,160,220,0.35); color:#dfeefc; font:700 14px 'Segoe UI',monospace;
        letter-spacing:1px; padding:16px 20px; border-radius:12px; cursor:pointer; text-align:left;
        display:flex; align-items:center; gap:14px; transition:all .15s; width:100%; }
      .fc-btn:hover { border-color:rgba(63,208,255,0.6); background:rgba(63,208,255,0.1); transform:translateX(3px); }
      .fc-btn .bic { font-size:26px; }
      .fc-btn small { display:block; color:#7c93a8; font-weight:500; font-size:11px; margin-top:2px; letter-spacing:0; text-transform:none; }
      .fc-toggle { font:800 16px 'Segoe UI',monospace; letter-spacing:2px; padding:20px 30px; border-radius:14px;
        cursor:pointer; border:2px solid; transition:all .2s; min-width:280px; }
      .fc-toggle.off { border-color:#1f6a5c; background:rgba(8,20,16,0.7); color:#3effc8; }
      .fc-toggle.on  { border-color:#cc4040; background:rgba(40,10,10,0.5); color:#ff8a8a; box-shadow:0 0 22px rgba(255,70,70,0.35); }
      #fn-pause-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center;
        padding:12px 26px; border-top:1px solid rgba(90,180,255,0.14);
        background:rgba(6,12,22,0.7); flex-shrink:0; }
      #fn-pause-tools:empty { display:none; }
      #fn-pause-tools::before { content:'⚙ FERRAMENTAS'; color:#5e7a90;
        font:700 11px monospace; letter-spacing:2px; margin-right:6px; }
      /* cursor sempre visível dentro do menu */
      #fn-pause, #fn-pause * { cursor:auto !important; }
      #fn-pause button { cursor:pointer !important; }
    `;
    document.head.appendChild(s);
  }

  _build() {
    const ov = document.createElement('div');
    ov.id = 'fn-pause';
    ov.innerHTML = `
      <div id="fc-topbar">
        <div id="fc-tabs">
          ${TABS.map(t => `<button class="fc-tab${t.id === this._active ? ' active' : ''}" data-tab="${t.id}">
            <span class="fc-ic">${t.icon}</span>${t.label}</button>`).join('')}
        </div>
        <div id="fc-actions">
          <button class="fc-act resume" id="fc-resume">▶ Retomar <kbd>ESC</kbd></button>
          <button class="fc-act quit" id="fc-quit">🚪 Sair</button>
        </div>
      </div>
      <div id="fc-content"></div>
      <div id="fn-pause-tools"></div>
    `;
    document.body.appendChild(ov);
    this._ov = ov;
    this._content = ov.querySelector('#fc-content');
    this._tools = ov.querySelector('#fn-pause-tools');

    ov.querySelectorAll('.fc-tab').forEach(btn => {
      btn.onclick = () => { this._active = btn.dataset.tab; this._render(); };
    });
    ov.querySelector('#fc-resume').onclick = () => this._resume();
    ov.querySelector('#fc-quit').onclick   = () => { try { window._leaveToMenu?.() || location.reload(); } catch (_) { location.reload(); } };

    this._render();
  }

  _resume() {
    this.hide();
    try { window._screenFocus?.enterPlaying?.(); } catch (_) {}
    try { window._gameInput?.activate?.(true); } catch (_) {}
    try { document.getElementById('pause-overlay')?.classList.remove('visible'); } catch (_) {}
  }

  _render() {
    if (!this._content) return;
    this._ov.querySelectorAll('.fc-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this._active));
    const fn = ({
      inv:    () => this._renderInv(),    skills: () => this._renderSkills(),
      world:  () => this._renderWorld(),  char:   () => this._renderChar(),
      edit:   () => this._renderEditors(),
      cfg:    () => this._renderCfg(),    pvp:    () => this._renderPvp(),
    })[this._active] || (() => '');
    this._content.innerHTML = fn();
    this._wireContent();
  }

  // ── Abas ───────────────────────────────────────────────────────
  _itemIcon(id, cls) {
    const def = ItemCatalog[id] || {};
    return def.thumb
      ? `<img class="${cls}" src="${def.thumb}" onerror="this.outerHTML='<span class=\\'${cls}\\'>${def.icon || '📦'}</span>'">`
      : `<span class="${cls}">${def.icon || '📦'}</span>`;
  }

  _renderInv() {
    const inv = (window._gamePlayer || window._player)?.inventory;
    const hot = inv?.hotbar || new Array(9).fill(null);
    const bag = inv?.bag || [];
    // ── Hotbar 1–9 (slots equipados) ──────────────────────────────
    const slots = Array.from({ length: 9 }, (_, i) => {
      const id = hot[i];
      const def = id ? (ItemCatalog[id] || {}) : null;
      const inner = id
        ? `${this._itemIcon(id, 'slot-ic')}<span class="slot-nm">${def?.name || id}</span>`
        : `<span class="slot-empty">vazio</span>`;
      return `<div class="fc-slot${id ? ' filled' : ''}" data-slot="${i}" title="${id ? 'Clique pra DESEQUIPAR' : 'slot vazio'}">
        <span class="slot-num">${i + 1}</span>${inner}</div>`;
    }).join('');
    // ── Mochila (clique = equipar na 1ª vaga livre) ───────────────
    const cards = bag.filter(s => s && s.qty > 0).map(s => {
      const def = ItemCatalog[s.id] || {};
      const inSlot = hot.includes(s.id);
      return `<div class="fc-card fc-bagitem${inSlot ? ' equipped' : ''}" data-item="${s.id}" title="Clique pra EQUIPAR num slot">
        ${this._itemIcon(s.id, 'ic')}<div class="nm">${def.name || s.id}</div>
        <div class="dt">${def.type || 'item'}${inSlot ? ' · equipado' : ''}</div><span class="qty">×${s.qty}</span></div>`;
    }).join('');
    return `<h2 class="fc-h">🎒 Inventário</h2>
      <p class="fc-sub">Clique num item da mochila pra <b style="color:#9fe4ff">EQUIPAR</b> num slot · clique num slot cheio pra <b style="color:#ffb0b0">DESEQUIPAR</b>. As teclas 1–9 usam o slot em jogo.</p>
      <div class="fc-hotbar">${slots}</div>
      <h3 class="fc-h" style="font-size:16px;margin:24px 0 10px;">🎒 Mochila</h3>
      ${cards ? `<div class="fc-grid fc-cards">${cards}</div>` : `<div class="fc-empty">Mochila vazia — derrote inimigos e colete drops.</div>`}`;
  }

  _renderSkills() {
    const cards = Object.values(SKILL_DEFS).map(sk => {
      const key = (sk.key || '').replace('Key', '');
      return `<div class="fc-card">
        <div style="display:flex;align-items:center;gap:10px;"><div class="ic">${sk.icon}</div><span class="fc-key">${key}</span></div>
        <div class="nm">${sk.name}</div><div class="dt">${sk.desc || ''}</div>
        <div class="dt" style="color:#6fa8d8;">MP ${sk.mpCost ?? '—'} · CD ${sk.cooldown ?? '—'}s${sk.baseDamage ? ` · DANO ${sk.baseDamage}` : ''}</div></div>`;
    }).join('');
    return `<h2 class="fc-h">⚡ Habilidades</h2>
      <p class="fc-sub">Teclas perto do WASD (Z·X·C·F·Q) ativam cada skill em jogo.</p>
      <div class="fc-grid fc-cards">${cards}</div>`;
  }

  _renderWorld() {
    const items = [
      { id: 'build',  ic: '🧱', nm: 'Construir',            sub: 'Coloca/quebra peças (tecla B em jogo).' },
      { id: 'assets', ic: '📦', nm: 'Biblioteca de Assets',  sub: 'Todos os objetos do jogo pra colocar.' },
    ];
    return `<h2 class="fc-h">🌍 Mundo</h2>
      <p class="fc-sub">Construção do mundo compartilhado. Terreno/Texturas/Interativos ficam na barra de ferramentas (rodapé).</p>
      <div class="fc-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));">
        ${items.map(i => `<button class="fc-btn" data-world="${i.id}"><span class="bic">${i.ic}</span><span>${i.nm}<small>${i.sub}</small></span></button>`).join('')}
      </div>`;
  }

  _renderChar() {
    return `<h2 class="fc-h">🐭 Personagem</h2>
      <p class="fc-sub">Troque seu avatar e veja as animações.</p>
      <div style="max-width:440px;"><button class="fc-btn" data-open="char"><span class="bic">🎭</span>
        <span>Abrir Seleção de Personagem<small>Escolher modelo (rato, lucasmods, etc.)</small></span></button></div>`;
  }

  _renderEditors() {
    const items = [
      { id: 'scene',  ic: '🎬', nm: 'Editor de Cena',     key: 'F9', sub: 'Mover/excluir/salvar objetos da cena.' },
      { id: 'anim',   ic: '🎞', nm: 'Animador',           key: 'F6', sub: 'Editar/mapear animações do personagem.' },
      { id: 'weapon', ic: '🔫', nm: 'Editor de Arma',      key: 'F4', sub: 'Ajustar posição/escala/rotação das armas.' },
      { id: 'mobs',   ic: '🐛', nm: 'Debug de Monstros',   key: 'F7', sub: 'Tunar hitbox/dano/alcance dos inimigos.' },
      { id: 'chibata',ic: '🗺', nm: 'Mapas Chibata',       key: 'N',  sub: 'Trocar/ver os mapas do pacote Chibata.' },
    ];
    return `<h2 class="fc-h">🧰 Editores</h2>
      <p class="fc-sub">Todas as janelas de edição (os atalhos continuam valendo em jogo).</p>
      <div class="fc-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr));">
        ${items.map(i => `<button class="fc-btn" data-edit="${i.id}">
          <span class="bic">${i.ic}</span><span>${i.nm} <span class="fc-key">${i.key}</span><small>${i.sub}</small></span></button>`).join('')}
      </div>`;
  }

  _renderCfg() {
    return `<h2 class="fc-h">⚙️ Configurações</h2>
      <p class="fc-sub">Gráficos, som e opções.</p>
      <div style="max-width:440px;"><button class="fc-btn" data-open="cfg"><span class="bic">🛠</span>
        <span>Abrir Configurações<small>Qualidade, volume, sangue, etc.</small></span></button></div>`;
  }

  _renderPvp() {
    const on = !!(window._pvpToggle?.isOn?.());
    return `<h2 class="fc-h">⚔ PvP</h2>
      <p class="fc-sub">Com o PvP LIGADO, você e outros players podem se dar dano.</p>
      <button id="fc-pvp-btn" class="fc-toggle ${on ? 'on' : 'off'}">${on ? '⚔ PVP ATIVADO — clique p/ desligar' : '⚔ ATIVAR PVP'}</button>
      <p class="fc-sub" style="margin-top:14px;">Atalho em jogo: tecla <span class="fc-key">Y</span></p>`;
  }

  _wireContent() {
    const openTool = (fn) => { this._resume(); setTimeout(() => { try { fn(); } catch (e) { console.warn('[PauseMenu]', e?.message); } }, 40); };

    // ── Inventário: equipar/desequipar slots da hotbar ─────────────
    const inv = (window._gamePlayer || window._player)?.inventory;
    this._content.querySelectorAll('[data-slot]').forEach(el => {
      el.onclick = () => {
        if (!inv) return;
        const i = +el.dataset.slot;
        if (inv.hotbar[i]) { inv.hotbar[i] = null; try { inv._notify?.(); } catch (_) {} this._render(); }  // desequipa
      };
    });
    this._content.querySelectorAll('[data-item]').forEach(el => {
      el.onclick = () => {
        if (!inv) return;
        const id = el.dataset.item;
        const cur = inv.hotbar.indexOf(id);
        if (cur >= 0) { inv.hotbar[cur] = null; }                 // já equipado → tira
        else { let f = inv.hotbar.indexOf(null); if (f < 0) f = 8; inv.hotbar[f] = id; }  // 1ª vaga livre (ou último)
        try { inv._notify?.(); } catch (_) {}
        this._render();
      };
    });
    this._content.querySelectorAll('[data-world]').forEach(btn => {
      btn.onclick = () => {
        const w = btn.dataset.world;
        if (w === 'build')  openTool(() => { window._buildMode?.toggle?.() ?? window._buildMode?.enter?.(); });
        else if (w === 'assets') openTool(() => window._assetGroupsUI?.open?.());
      };
    });
    this._content.querySelectorAll('[data-open]').forEach(btn => {
      btn.onclick = () => {
        const o = btn.dataset.open;
        if (o === 'char') openTool(() => (window._charSelectUI?.show?.() ?? window._charSelectScreen?.open?.()));
        else if (o === 'cfg') openTool(() => window._settingsUI?.show?.());
      };
    });
    this._content.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const e = btn.dataset.edit;
        if (e === 'scene')        openTool(() => window.enterEngineMode?.('scene'));
        else if (e === 'anim')    openTool(() => window.openAnimator?.());
        else if (e === 'weapon')  openTool(() => window._weaponEditor?.show?.());
        else if (e === 'mobs')    openTool(() => window.openMonsterDebug?.('monsterPlant'));
        else if (e === 'chibata') openTool(() => (window._chibataMaps?.show?.() ?? window._chibataMaps?.toggle?.() ?? window._chibataMaps?.open?.()));
      };
    });
    const pvpBtn = this._content.querySelector('#fc-pvp-btn');
    if (pvpBtn) pvpBtn.onclick = () => {
      try {
        const cs = window._cs, auth = window._auth;
        const myId = cs?.playerId || auth?.getUserId?.();
        const me = myId ? cs?.state?.players?.get(myId) : null;
        if (me && cs?.sendPvpToggle) cs.sendPvpToggle(!me.pvp_on);
      } catch (_) {}
      setTimeout(() => this._render(), 140);
    };
  }

  /** Move um botão solto (Terreno/Interativos/…) pra dentro da barra de ferramentas. */
  adoptTool(elOrId) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el || !this._tools) return null;
    el.style.position = 'static';
    el.style.left = el.style.right = el.style.top = el.style.bottom = 'auto';
    el.style.transform = 'none';
    this._tools.appendChild(el);
    return el;
  }

  show() {
    if (this._open) return;
    this._render();                 // refresca dados (inventário, pvp) ao abrir
    this._ov.classList.add('fc-on');
    this._open = true;
    this._openedAt = performance.now();
  }
  hide() { this._ov.classList.remove('fc-on'); this._open = false; }
  get isOpen() { return this._open; }
  get justOpened() { return this._open && (performance.now() - (this._openedAt || 0) < 200); }
}
