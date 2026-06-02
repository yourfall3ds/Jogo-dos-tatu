// ─────────────────────────────────────────────────────────────────
//  CatalogUI — painel in-game para spawnar/testar inimigos do catálogo
//  Tecla C abre/fecha. Ferramenta de criação de conteúdo do jogo.
// ─────────────────────────────────────────────────────────────────
import { EnemyCatalog } from '../data/EnemyCatalog.js';

const TIER_INFO = {
  rookie:   { label: '🟢 Rookie',   color: '#66dd66' },
  champion: { label: '🔵 Champion', color: '#5599ff' },
  ultimate: { label: '🟣 Ultimate', color: '#bb66ff' },
  mega:     { label: '🟠 Mega',     color: '#ff9944' },
  boss:     { label: '🔴 Boss',     color: '#ff5555' },
  chibata:  { label: '💀 Chibata',  color: '#d44d2e' },
};

export class CatalogUI {
  constructor(enemyManager) {
    this.mgr = enemyManager;
    this._visible = false;
    this._wasC = false;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'catalog-ui';
    el.style.cssText = `
      position: fixed; top: 0; left: 0; width: 340px; height: 100vh;
      background: rgba(8,10,18,0.95); border-right: 2px solid #2a4a8f;
      color: #e0e0e0; font-family: 'Segoe UI', monospace; font-size: 12px;
      display: none; flex-direction: column; z-index: 9000;
      backdrop-filter: blur(8px); box-shadow: 4px 0 24px rgba(0,0,0,0.6);
    `;
    el.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #2a4a8f;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:15px;font-weight:bold;color:#5cf;letter-spacing:1px;">🐉 CATÁLOGO DE INIMIGOS</span>
        <button id="cat-close" style="background:none;border:none;color:#777;cursor:pointer;font-size:22px;">×</button>
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid #1a2a4f;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="cat-act" id="cat-wave-rookie">Wave Rookie</button>
        <button class="cat-act" id="cat-wave-champ">Wave Champion</button>
        <button class="cat-act" id="cat-wave-chibata" style="background:#5a1f12;border-color:#d44d2e;">Wave Chibata</button>
        <button class="cat-act" id="cat-clear" style="background:#5a1a1a;border-color:#a33;">Limpar Todos</button>
      </div>
      <div id="cat-list" style="flex:1;overflow-y:auto;padding:8px 10px;" class="cat-scroll"></div>
      <div style="padding:8px 14px;border-top:1px solid #1a2a4f;color:#778;font-size:10px;">
        Clique num inimigo para spawnar perto de você. [C] fecha.
      </div>
      <style>
        .cat-scroll::-webkit-scrollbar{width:5px;} .cat-scroll::-webkit-scrollbar-thumb{background:#2a4a8f;border-radius:4px;}
        .cat-act{background:#143a6a;border:1px solid #2a5aaf;color:#cde;padding:5px 9px;border-radius:5px;cursor:pointer;font-size:11px;font-family:inherit;}
        .cat-act:hover{background:#1e4e8f;}
        .cat-row{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:2px 0;border-radius:5px;cursor:pointer;border-left:3px solid transparent;transition:0.1s;}
        .cat-row:hover{background:#ffffff10;border-left-color:#5cf;}
        .cat-tier-h{font-weight:bold;margin:10px 0 4px;padding-bottom:3px;border-bottom:1px solid #ffffff15;font-size:12px;}
        .cat-stats{font-size:9px;color:#889;}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#cat-close').onclick = () => this.hide();
    el.querySelector('#cat-clear').onclick = () => this.mgr.clearAll();
    el.querySelector('#cat-wave-rookie').onclick = () => this._spawnTier('rookie');
    el.querySelector('#cat-wave-champ').onclick  = () => this._spawnTier('champion');
    el.querySelector('#cat-wave-chibata').onclick = () => this._spawnTier('chibata');

    this._renderList();
  }

  _renderList() {
    const list = this._el.querySelector('#cat-list');
    list.innerHTML = '';
    const byTier = {};
    for (const [id, def] of Object.entries(EnemyCatalog)) {
      (byTier[def.tier] = byTier[def.tier] || []).push([id, def]);
    }
    for (const tier of ['rookie', 'champion', 'ultimate', 'mega', 'boss', 'chibata']) {
      const rows = byTier[tier];
      if (!rows?.length) continue;
      const info = TIER_INFO[tier];
      const h = document.createElement('div');
      h.className = 'cat-tier-h'; h.style.color = info.color;
      h.textContent = `${info.label} (${rows.length})`;
      list.appendChild(h);
      for (const [id, def] of rows) {
        const row = document.createElement('div');
        row.className = 'cat-row';
        const s = def.stats;
        row.innerHTML = `
          <div>
            <div style="color:#eee;">${def.isBoss ? '★ ' : ''}${def.name}</div>
            <div class="cat-stats">HP ${s.hp} · DMG ${s.damage} · ${def.behavior}</div>
          </div>
          <span style="color:${info.color};font-size:16px;">＋</span>`;
        row.onclick = () => this.mgr.spawn(id);
        list.appendChild(row);
      }
    }
  }

  async _spawnTier(tier) {
    const ids = Object.entries(EnemyCatalog).filter(([, d]) => d.tier === tier).map(([id]) => id);
    await this.mgr.spawnWave(ids.slice(0, 4), 1);
  }

  /** Detecta se estamos em sala MP. Spawn local fica BLOQUEADO. */
  _isMpLocked() { return !!window._mpGuard?.isInMpRoom?.(); }

  show() {
    if (this._isMpLocked()) {
      // Em sala MP: catálogo de spawn local é proibido
      this._showMpBlockToast();
      return;
    }
    this._visible = true;
    this._el.style.display = 'flex';
    window._gameInput?.deactivate?.();
    document.body.classList.remove('game-active');
  }

  _showMpBlockToast() {
    let t = document.getElementById('cat-mp-block');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cat-mp-block';
      t.style.cssText = `
        position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(20,5,5,0.92); color: #ff8888;
        border: 1px solid #aa3030; border-radius: 10px;
        padding: 14px 22px; font: 700 13px 'Segoe UI', monospace;
        z-index: 9500; box-shadow: 0 6px 24px rgba(0,0,0,0.6);
        pointer-events: none; opacity: 0; transition: opacity 0.2s;
        text-align: center;`;
      document.body.appendChild(t);
    }
    t.innerHTML = `🌐 <b>SALA MULTIPLAYER</b><br><span style="color:#cdd; font-weight:500;">spawn local de inimigos bloqueado</span><br><span style="color:#789; font-size:11px;">mobs vêm do servidor</span>`;
    t.style.opacity = '1';
    clearTimeout(this._mpToastT);
    this._mpToastT = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }
  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    window._gameInput?.activate?.();
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  update() {
    // Movido de C → K (C agora é a skill Slam)
    const k = window._gameInput?.isDown('KeyK');
    if (k && !this._wasC) this.toggle();
    this._wasC = k;
  }
}
