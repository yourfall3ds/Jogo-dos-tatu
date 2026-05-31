// ─────────────────────────────────────────────────────────────────
//  RpgHUD — barra de MP, barra de XP/nível, ícones de skill (cooldown)
//  e hotbar de consumíveis. Também abre o painel de Stats/Inventário [I].
// ─────────────────────────────────────────────────────────────────
import { SKILL_DEFS } from '../skills/SkillSystem.js';
import { STAT_KEYS, STAT_LABELS } from '../stats/PlayerStats.js';
import { ItemCatalog } from '../items/ItemCatalog.js';

export class RpgHUD {
  constructor(player, stats, skills, inventory) {
    this.player = player;
    this.stats = stats;
    this.skills = skills;
    this.inventory = inventory;
    this._wasI = false;
    this._panelOpen = false;
    this._build();
  }

  _build() {
    // ── Barra inferior: MP + XP + skills + hotbar ──────────────────
    const bar = document.createElement('div');
    bar.id = 'rpg-hud';
    bar.style.cssText = `
      position: fixed; bottom: 56px; left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      pointer-events: none; font-family: 'Segoe UI', monospace; z-index: 60;
    `;

    // XP + nível
    this._xpWrap = document.createElement('div');
    this._xpWrap.style.cssText = 'display:flex;align-items:center;gap:8px;color:#cde;font-size:11px;text-shadow:0 0 4px #000;';
    this._xpWrap.innerHTML = `
      <span id="rpg-level" style="font-weight:bold;color:#ffd24a;">Nv 1</span>
      <div style="width:200px;height:7px;background:rgba(0,0,0,.55);border:1px solid #ffffff30;border-radius:4px;overflow:hidden;">
        <div id="rpg-xp" style="height:100%;width:0%;background:linear-gradient(90deg,#7a5cff,#b89cff);"></div>
      </div>`;
    bar.appendChild(this._xpWrap);

    // MP
    const mpWrap = document.createElement('div');
    mpWrap.style.cssText = 'display:flex;align-items:center;gap:8px;color:#9cf;font-size:11px;text-shadow:0 0 4px #000;';
    mpWrap.innerHTML = `
      <span style="font-weight:bold;">MP</span>
      <div style="width:200px;height:9px;background:rgba(0,0,0,.55);border:1px solid #ffffff30;border-radius:4px;overflow:hidden;">
        <div id="rpg-mp" style="height:100%;width:100%;background:linear-gradient(90deg,#1e6cff,#5cc8ff);"></div>
      </div>
      <span id="rpg-mp-text" style="min-width:54px;">100/100</span>`;
    bar.appendChild(mpWrap);

    // Skills (ícones com cooldown)
    this._skillRow = document.createElement('div');
    this._skillRow.style.cssText = 'display:flex;gap:6px;margin-top:2px;';
    bar.appendChild(this._skillRow);
    this._skillEls = {};
    const keyLabel = { KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyF: 'F', KeyQ: 'Q' };
    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:relative;width:46px;height:46px;border-radius:8px;
        background:rgba(10,14,28,.8);border:1.5px solid #3a5a9f;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        color:#cde;font-size:18px;`;
      el.innerHTML = `
        <span>${def.icon}</span>
        <span style="position:absolute;top:1px;left:3px;font-size:9px;color:#ffd24a;font-weight:bold;">${keyLabel[def.key] || ''}</span>
        <span style="position:absolute;bottom:1px;right:3px;font-size:8px;color:#9cf;">${def.mpCost}</span>
        <div class="cd-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.7);border-radius:6px;display:none;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:bold;"></div>`;
      this._skillRow.appendChild(el);
      this._skillEls[id] = el;
    }

    // Hotbar 1-9 (consumíveis + imagens guardadas)
    this._hotbarRow = document.createElement('div');
    this._hotbarRow.style.cssText = 'display:flex;gap:5px;margin-top:3px;';
    bar.appendChild(this._hotbarRow);
    this._hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = `
        position:relative;width:42px;height:42px;border-radius:7px;
        background:rgba(8,10,20,.78);border:1.5px solid #2f3f5f;
        display:flex;align-items:center;justify-content:center;
        color:#9ab;font-size:18px;overflow:hidden;`;
      slot.innerHTML = `<span style="position:absolute;top:1px;left:3px;font-size:9px;color:#ffd24a;font-weight:bold;z-index:2;text-shadow:0 0 3px #000;">${i + 1}</span>`;
      this._hotbarRow.appendChild(slot);
      this._hotbarEls.push(slot);
    }

    document.body.appendChild(bar);
    this._bar = bar;

    // Re-renderiza hotbar quando o inventário muda
    this.inventory.onChange(() => this._renderHotbar());
    this._renderHotbar();

    // ── Painel de Stats/Inventário [I] ─────────────────────────────
    const panel = document.createElement('div');
    panel.id = 'rpg-panel';
    panel.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 620px; max-height: 82vh; overflow-y: auto;
      background: rgba(10,12,22,.96); border: 2px solid #3a5a9f; border-radius: 12px;
      color: #dce; font-family: 'Segoe UI', monospace; font-size: 13px;
      display: none; z-index: 9100; padding: 18px; box-shadow: 0 8px 40px rgba(0,0,0,.7);
    `;
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #3a5a9f;padding-bottom:10px;margin-bottom:12px;">
        <span style="font-size:17px;font-weight:bold;color:#7cf;">📊 STATUS & INVENTÁRIO</span>
        <button id="rpg-panel-close" style="background:none;border:none;color:#789;cursor:pointer;font-size:22px;">×</button>
      </div>
      <div style="display:flex;gap:18px;">
        <div style="flex:1;">
          <div id="rpg-stat-head" style="color:#ffd24a;font-weight:bold;margin-bottom:6px;"></div>
          <div id="rpg-stat-list"></div>
        </div>
        <div style="flex:1.2;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="color:#ffd24a;font-weight:bold;">⚡ Barra Rápida (1-9)</span>
          </div>
          <div id="rpg-inv-hotbar" style="
            display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-bottom:12px;
          "></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:#ffd24a;font-weight:bold;">🎒 Mochila</span>
            <span id="rpg-bag-count" style="color:#567;font-size:11px;"></span>
          </div>
          <div id="rpg-bag" style="
            display:grid;grid-template-columns:repeat(5,1fr);gap:6px;
            max-height:300px;overflow-y:auto;padding:2px;
          "></div>
          <div id="rpg-bag-detail" style="
            margin-top:10px;min-height:30px;font-size:12px;color:#9ab;
          "></div>
        </div>
      </div>
      <style>
        #rpg-bag::-webkit-scrollbar{width:6px}
        #rpg-bag::-webkit-scrollbar-thumb{background:#345;border-radius:3px}
        .rpg-cell{
          aspect-ratio:1;background:rgba(10,16,30,.7);border:1.5px solid #2a3f5f;
          border-radius:7px;position:relative;cursor:pointer;overflow:hidden;
          display:flex;align-items:center;justify-content:center;
          font-size:22px;transition:border-color .12s,transform .1s;
        }
        .rpg-cell:hover{border-color:#5cf;transform:translateY(-2px)}
        .rpg-cell.empty{cursor:default;background:rgba(10,16,30,.35);border-style:dashed;border-color:#1f2f45}
        .rpg-cell.empty:hover{transform:none;border-color:#1f2f45}
        .rpg-cell.image{border-color:#7a4aff}
        .rpg-cell .qty{position:absolute;bottom:1px;right:3px;font-size:10px;color:#fff;
          font-weight:bold;text-shadow:0 0 3px #000;background:rgba(0,0,0,.5);
          padding:0 3px;border-radius:4px}
        .rpg-cell img{width:100%;height:100%;object-fit:cover}
      </style>`;
    document.body.appendChild(panel);
    this._panel = panel;
    panel.querySelector('#rpg-panel-close').onclick = () => this.togglePanel();
  }

  // ── Renderiza os 9 slots da hotbar (consumíveis + imagens) ────────
  _renderHotbar() {
    if (!this._hotbarEls) return;
    // só re-renderiza se algo mudou (chamado todo frame)
    const sig = this.inventory.hotbar.map(id => id ? id + this.inventory.count(id) : '_').join(',');
    if (sig === this._hbSig) return;
    this._hbSig = sig;
    for (let i = 0; i < 9; i++) {
      const slot = this._hotbarEls[i];
      const numLabel = `<span style="position:absolute;top:1px;left:3px;font-size:9px;color:#ffd24a;font-weight:bold;z-index:2;text-shadow:0 0 3px #000;">${i + 1}</span>`;
      const id    = this.inventory.hotbar[i];
      const entry = id ? this.inventory.getEntry?.(id) : null;

      if (entry?.kind === 'image') {
        slot.style.borderColor = '#7a4aff';
        slot.innerHTML = numLabel +
          `<img src="${entry.data.imageUrl}" title="${entry.data.name}"
                style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`;
      } else if (id) {
        const def = ItemCatalog[id];
        const qty = this.inventory.count(id);
        slot.style.borderColor = '#3a5a9f';
        slot.innerHTML = numLabel +
          `<span>${def?.icon || '📦'}</span>` +
          (qty > 1 ? `<span style="position:absolute;bottom:1px;right:3px;font-size:9px;color:#cde;">×${qty}</span>` : '');
      } else {
        slot.style.borderColor = '#2f3f5f';
        slot.innerHTML = numLabel;
      }
    }
  }

  togglePanel() {
    this._panelOpen = !this._panelOpen;
    this._panel.style.display = this._panelOpen ? 'block' : 'none';
    if (this._panelOpen) {
      window._gameInput?.deactivate?.();
      document.body.classList.remove('game-active');
      this._renderPanel();
    } else {
      window._gameInput?.activate?.();
    }
  }

  _renderPanel() {
    const head = this._panel.querySelector('#rpg-stat-head');
    head.textContent = `Nível ${this.stats.level} · Pontos: ${this.stats.attributePoints}`;
    const list = this._panel.querySelector('#rpg-stat-list');
    list.innerHTML = '';
    for (const key of STAT_KEYS) {
      const lbl = STAT_LABELS[key];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;';
      const total = this.stats.get(key);
      const base = this.stats.base[key] || 0;
      const bonus = total - base;
      row.innerHTML = `
        <span title="${lbl.desc}">${lbl.icon} ${lbl.name}</span>
        <span>
          <b style="color:#cde;">${total.toFixed(total % 1 ? 1 : 0)}</b>
          ${bonus ? `<span style="color:#5cdd5c;font-size:11px;"> (+${bonus.toFixed(0)})</span>` : ''}
          <button data-stat="${key}" class="rpg-up" style="margin-left:6px;background:#2a5;border:none;color:#fff;border-radius:4px;cursor:pointer;width:20px;height:20px;${this.stats.attributePoints > 0 ? '' : 'opacity:.3;pointer-events:none;'}">+</button>
        </span>`;
      list.appendChild(row);
    }
    list.querySelectorAll('.rpg-up').forEach(b => {
      b.onclick = () => {
        if (this.stats.spendPoint(b.dataset.stat)) {
          this.player.maxHp = this.stats.maxHp();
          this._renderPanel();
          this._save();
        }
      };
    });

    this._renderBagGrid();
  }

  // ── Fileira 1-9 dentro do painel (estilo Terraria) ────────────────
  _renderInvHotbar() {
    const row = this._panel.querySelector('#rpg-inv-hotbar');
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const id    = this.inventory.hotbar[i];
      const entry = id ? this.inventory.getEntry?.(id) : null;
      const cell  = document.createElement('div');
      cell.className = 'rpg-cell' + (entry?.kind === 'image' ? ' image' : (id ? '' : ' empty'));
      cell.style.fontSize = '18px';
      const num = `<span style="position:absolute;top:0;left:3px;font-size:9px;color:#ffd24a;font-weight:bold;z-index:2;text-shadow:0 0 3px #000">${i+1}</span>`;
      if (entry?.kind === 'image') {
        cell.innerHTML = num + `<img src="${entry.data.imageUrl}" onerror="this.parentElement.textContent='🖼️'">`;
        cell.title = entry.data.name;
      } else if (id) {
        const def = ItemCatalog[id];
        const qty = this.inventory.count(id);
        cell.innerHTML = num + `<span>${def?.icon || '📦'}</span>` + (qty > 1 ? `<span class="qty">${qty}</span>` : '');
        cell.title = def?.name || id;
      } else {
        cell.innerHTML = num;
      }
      // Clicar num slot da barra: remove o item de volta pra mochila
      cell.onclick = () => {
        if (this.inventory.hotbar[i]) {
          this.inventory.hotbar[i] = null;
          this.inventory._notify();
          this._renderPanel(); this._save();
        }
      };
      row.appendChild(cell);
    }
  }

  // ── Inventário em GRID ────────────────────────────────────────────
  _renderBagGrid() {
    this._renderInvHotbar();
    const bag    = this._panel.querySelector('#rpg-bag');
    const count  = this._panel.querySelector('#rpg-bag-count');
    const detail = this._panel.querySelector('#rpg-bag-detail');
    if (!bag) return;
    bag.innerHTML = '';
    if (detail) detail.innerHTML = '';

    const items   = this.inventory.bag;
    const MIN     = 20;                                    // mínimo de células
    const total   = Math.max(MIN, Math.ceil(items.length / 5) * 5 + 5);
    if (count) count.textContent = `${items.length} ite${items.length === 1 ? 'm' : 'ns'}`;

    for (let i = 0; i < total; i++) {
      const slot = items[i];
      const cell = document.createElement('div');

      if (!slot) { cell.className = 'rpg-cell empty'; bag.appendChild(cell); continue; }

      if (slot.kind === 'image') {
        cell.className = 'rpg-cell image';
        cell.title = '🖼️ ' + slot.data.name;
        cell.innerHTML = `<img src="${slot.data.imageUrl}" onerror="this.parentElement.textContent='🖼️'">`;
        cell.onclick = () => this._showItemDetail(slot, cell);
      } else {
        const def = ItemCatalog[slot.id];
        if (!def) { cell.className = 'rpg-cell empty'; bag.appendChild(cell); continue; }
        cell.className = 'rpg-cell';
        cell.title = def.name;
        const qty = this.inventory.count(slot.id);
        cell.innerHTML = `<span>${def.icon || '📦'}</span>` +
          (qty > 1 ? `<span class="qty">${qty}</span>` : '');
        cell.onclick = () => this._showItemDetail(slot, cell);
      }
      bag.appendChild(cell);
    }
  }

  // ── Detalhe + ações do item selecionado ───────────────────────────
  _showItemDetail(slot, cell) {
    const detail = this._panel.querySelector('#rpg-bag-detail');
    if (!detail) return;
    // highlight
    this._panel.querySelectorAll('.rpg-cell').forEach(c => c.style.boxShadow = '');
    cell.style.boxShadow = '0 0 0 2px #5cf inset';

    const btn = (label, color, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `background:${color};border:none;color:#fff;cursor:pointer;
        padding:5px 12px;border-radius:6px;font-family:inherit;font-size:11px;margin-right:6px;`;
      b.onclick = fn;
      return b;
    };

    // Põe o item numa vaga livre da barra 1-9
    const toHotbar = () => {
      if (this.inventory.hotbar.includes(slot.id)) return;
      const free = this.inventory.hotbar.indexOf(null);
      if (free >= 0) { this.inventory.hotbar[free] = slot.id; this.inventory._notify(); this._renderPanel(); this._save(); }
    };

    detail.innerHTML = '';
    if (slot.kind === 'image') {
      const name = document.createElement('div');
      name.innerHTML = `🖼️ <b style="color:#c9b0ff">${slot.data.name}</b>`;
      name.style.marginBottom = '6px';
      detail.appendChild(name);
      detail.appendChild(btn('📌 Pôr na barra (1-9)', '#243a6a', toHotbar));
      detail.appendChild(btn('🖼️ Criar Quadro', '#1c3a22', () => {
        this.togglePanel();
        setTimeout(() => window._buildMode?.startFramePlacing?.(slot.data.imageUrl, slot.data.name), 150);
      }));
      detail.appendChild(btn('🗑️ Excluir', '#3a1a1a', () => {
        this.inventory.bag = this.inventory.bag.filter(s => s !== slot);
        const hi = this.inventory.hotbar.indexOf(slot.id);
        if (hi >= 0) this.inventory.hotbar[hi] = null;
        this.inventory._notify();
        this._renderPanel(); this._save();
      }));
    } else {
      const def = ItemCatalog[slot.id];
      if (!def) return;
      const name = document.createElement('div');
      const eq = this.inventory.equippedWeapon === slot.id ? ' <span style="color:#5fc;font-size:10px">(equipada)</span>' : '';
      name.innerHTML = `${def.icon || '📦'} <b style="color:#cde">${def.name}</b> ${this.inventory.count(slot.id) > 1 ? `×${this.inventory.count(slot.id)}` : ''}${eq}`;
      name.style.marginBottom = '6px';
      if (def.desc) name.innerHTML += `<div style="color:#678;font-size:10px;margin-top:2px">${def.desc}</div>`;
      detail.appendChild(name);

      const action = def.type === 'consumable' ? '✓ Usar'
                   : def.type === 'weapon'     ? '🔫 Equipar Arma'
                   : '⚔️ Equipar';
      detail.appendChild(btn(action, '#1a3a5a', () => {
        if (def.type === 'consumable') this.inventory.use(slot.id);
        else this.inventory.equipItem(slot.id);
        this.player.maxHp = this.stats.maxHp();
        this._renderPanel(); this._save();
      }));
      detail.appendChild(btn('📌 Pôr na barra (1-9)', '#243a6a', toHotbar));
    }
  }

  _save() {
    try {
      localStorage.setItem('digifps_stats', JSON.stringify(this.stats.toJSON()));
      localStorage.setItem('digifps_inv', JSON.stringify(this.inventory.toJSON()));
    } catch (_) {}
  }

  update(dt) {
    // toggle painel [I]
    const iNow = window._gameInput?.isDown('KeyI');
    if (iNow && !this._wasI) this.togglePanel();
    this._wasI = iNow;

    // hotbar [1..9] uso rápido
    for (let i = 0; i < 9; i++) {
      const code = 'Digit' + (i + 1);
      const down = window._gameInput?.isDown(code);
      if (down && !this[`_wasHot${i}`]) this.inventory.useHotbar(i);
      this[`_wasHot${i}`] = down;
    }

    // ── MP bar ──────────────────────────────────────────────────────
    const mpEl = document.getElementById('rpg-mp');
    const mpText = document.getElementById('rpg-mp-text');
    if (mpEl) mpEl.style.width = (this.stats.mp / this.stats.maxMp * 100) + '%';
    if (mpText) mpText.textContent = `${Math.round(this.stats.mp)}/${this.stats.maxMp}`;

    // ── XP / nível ──────────────────────────────────────────────────
    const lvl = document.getElementById('rpg-level');
    const xp = document.getElementById('rpg-xp');
    if (lvl) lvl.textContent = 'Nv ' + this.stats.level;
    if (xp) xp.style.width = (this.stats.xp / this.stats.xpToNext * 100) + '%';

    // ── Skills cooldown ─────────────────────────────────────────────
    const cdInfo = this.skills.getCooldownInfo();
    for (const [id, info] of Object.entries(cdInfo)) {
      const el = this._skillEls[id]; if (!el) continue;
      const ov = el.querySelector('.cd-overlay');
      if (info.cd > 0) { ov.style.display = 'flex'; ov.textContent = info.cd.toFixed(1); }
      else { ov.style.display = 'none'; }
      el.style.borderColor = info.ready ? '#4af' : '#3a5a9f';
      el.style.opacity = (this.stats.mp < info.mpCost && info.cd <= 0) ? '0.5' : '1';
    }

    // ── Hotbar ──────────────────────────────────────────────────────
    this._renderHotbar();
  }
}
