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
    const keyLabel = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', KeyQ: 'Q' };
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

    // Hotbar de consumíveis
    this._hotbarRow = document.createElement('div');
    this._hotbarRow.style.cssText = 'display:flex;gap:5px;margin-top:3px;';
    bar.appendChild(this._hotbarRow);

    document.body.appendChild(bar);
    this._bar = bar;

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
        <div style="flex:1;">
          <div style="color:#ffd24a;font-weight:bold;margin-bottom:6px;">🎒 Mochila</div>
          <div id="rpg-bag"></div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    this._panel = panel;
    panel.querySelector('#rpg-panel-close').onclick = () => this.togglePanel();
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

    const bag = this._panel.querySelector('#rpg-bag');
    bag.innerHTML = '';
    if (!this.inventory.bag.length) bag.innerHTML = '<span style="color:#678;">vazia</span>';
    for (const slot of this.inventory.bag) {
      const def = ItemCatalog[slot.id]; if (!def) continue;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 6px;margin:2px 0;background:#ffffff08;border-radius:5px;cursor:pointer;';
      row.innerHTML = `<span>${def.name} ${slot.qty > 1 ? `×${slot.qty}` : ''}</span>
        <span style="color:#7cf;font-size:11px;">${def.type === 'consumable' ? 'usar' : 'equipar'}</span>`;
      row.onclick = () => {
        if (def.type === 'consumable') this.inventory.use(slot.id);
        else this.inventory.equipItem(slot.id);
        this.player.maxHp = this.stats.maxHp();
        this._renderPanel(); this._save();
      };
      bag.appendChild(row);
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

    // hotbar [5..9] uso rápido
    for (let i = 0; i < 5; i++) {
      const code = 'Digit' + (5 + i);
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

  _renderHotbar() {
    // só re-renderiza se mudou
    const sig = this.inventory.hotbar.map(id => id ? id + this.inventory.count(id) : '_').join(',');
    if (sig === this._hbSig) return;
    this._hbSig = sig;
    this._hotbarRow.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const id = this.inventory.hotbar[i];
      const def = id ? ItemCatalog[id] : null;
      const el = document.createElement('div');
      el.style.cssText = `width:34px;height:34px;border-radius:6px;background:rgba(10,14,28,.7);
        border:1px solid #3a5a9f;display:flex;align-items:center;justify-content:center;position:relative;font-size:9px;color:#9cf;`;
      el.innerHTML = `<span style="position:absolute;top:0;left:2px;font-size:8px;color:#789;">${5 + i}</span>` +
        (def ? `<span style="text-align:center;line-height:1;">${def.name.split(' ')[0]}<br><b style="color:#cde;">×${this.inventory.count(id)}</b></span>` : '');
      this._hotbarRow.appendChild(el);
    }
  }
}
