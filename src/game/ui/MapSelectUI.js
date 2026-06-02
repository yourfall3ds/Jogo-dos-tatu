// ─────────────────────────────────────────────────────────────────
//  MapSelectUI — painel de seleção de mapa (Chibata maps + default)
//  Tecla N abre/fecha. Clique num mapa → ChibataMapLoader.load(id).
// ─────────────────────────────────────────────────────────────────
import { MapCatalog, BIOME_ICON } from '../scene/ChibataMapLoader.js';

export class MapSelectUI {
  constructor(mapLoader) {
    this.loader = mapLoader;
    this._visible = false;
    this._wasN = false;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'map-select-ui';
    el.style.cssText = `
      position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
      background: rgba(8,10,18,0.95); border-left: 2px solid #2a4a8f;
      color: #e0e0e0; font-family: 'Segoe UI', monospace; font-size: 12px;
      display: none; flex-direction: column; z-index: 9000;
      backdrop-filter: blur(8px); box-shadow: -4px 0 24px rgba(0,0,0,0.6);
    `;
    el.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #2a4a8f;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:15px;font-weight:bold;color:#5cf;letter-spacing:1px;">🗺️ MAPAS</span>
        <button id="map-close" style="background:none;border:none;color:#777;cursor:pointer;font-size:22px;">×</button>
      </div>
      <div id="map-current" style="padding:10px 14px;border-bottom:1px solid #1a2a4f;color:#789;font-size:11px;">
        atual: <b id="map-current-name" style="color:#cde;">Mundo Padrão</b>
      </div>
      <div id="map-list" style="flex:1;overflow-y:auto;padding:8px 10px;" class="map-scroll"></div>
      <div style="padding:8px 14px;border-top:1px solid #1a2a4f;color:#778;font-size:10px;">
        Clique num mapa para carregar. [N] fecha.
      </div>
      <style>
        .map-scroll::-webkit-scrollbar{width:5px;} .map-scroll::-webkit-scrollbar-thumb{background:#2a4a8f;border-radius:4px;}
        .map-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;margin:3px 0;border-radius:6px;cursor:pointer;border-left:3px solid transparent;transition:0.1s;background:#0d1124;}
        .map-row:hover{background:#15203f;border-left-color:#5cf;}
        .map-row.active{background:#1e3a6f;border-left-color:#ffcc00;}
        .map-icon{font-size:22px;margin-right:10px;}
        .map-meta{font-size:9px;color:#789;text-transform:uppercase;letter-spacing:1px;}
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;
    el.querySelector('#map-close').onclick = () => this.hide();
    this._renderList();
  }

  _renderList() {
    const list = this._el.querySelector('#map-list');
    list.innerHTML = '';
    for (const [id, def] of Object.entries(MapCatalog)) {
      const row = document.createElement('div');
      row.className = 'map-row';
      if (this.loader.currentId === def.id || (this.loader.currentId === null && id === 'default')) {
        row.classList.add('active');
      }
      const icon = BIOME_ICON[def.biome] || '🌐';
      row.innerHTML = `
        <div style="display:flex;align-items:center;">
          <span class="map-icon">${icon}</span>
          <div>
            <div style="color:#eee;font-size:13px;">${def.name}</div>
            <div class="map-meta">${def.biome} · ${def.size}</div>
          </div>
        </div>
        <span style="color:#5cf;font-size:18px;">▸</span>`;
      row.onclick = async () => {
        row.querySelector('span:last-child').textContent = '⏳';
        const ok = await this.loader.load(def.id);
        if (ok) {
          this._renderList();
          this._refreshCurrent();
        } else {
          row.querySelector('span:last-child').textContent = '❌';
        }
      };
      list.appendChild(row);
    }
  }

  _refreshCurrent() {
    const cur = this._el.querySelector('#map-current-name');
    if (!cur) return;
    const entry = Object.entries(MapCatalog).find(([, d]) => d.id === this.loader.currentId);
    cur.textContent = entry ? entry[1].name : 'Mundo Padrão';
  }

  show() { this._visible = true; this._el.style.display = 'flex'; this._refreshCurrent(); this._renderList(); }
  hide() { this._visible = false; this._el.style.display = 'none'; }
  toggle() { this._visible ? this.hide() : this.show(); }

  update(input) {
    const nDown = input?.keys?.KeyN === true;
    if (nDown && !this._wasN) this.toggle();
    this._wasN = nDown;
  }
}
