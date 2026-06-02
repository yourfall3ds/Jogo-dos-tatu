// ─────────────────────────────────────────────────────────────────
//  SettingsUI — painel de configurações (tecla O)
//
//  Foco atual: SANGUE (off / normal / extremo / desnecessário).
//  Estrutura extensível pra novas settings (volume, FOV, etc).
// ─────────────────────────────────────────────────────────────────

import { BLOOD_LEVELS } from '../combat/BloodFX.js';

const BLOOD_INFO = {
  off:            { label: '✕ Desligado',     desc: 'Sem sangue. Família.', color: '#777' },
  normal:         { label: '💧 Normal',        desc: 'Respingos discretos, poças pequenas.', color: '#cc4444' },
  extremo:        { label: '🩸 Extremo',       desc: 'Jato forte, decals grandes no chão.', color: '#ff3030' },
  desnecessario:  { label: '🌋 Desnecessário', desc: 'CASCATA absurda. Sangue jorrando 2s. Você foi avisado.', color: '#ff0000' },
};

export class SettingsUI {
  constructor(bloodFX, musicSystem = null) {
    this.bloodFX = bloodFX;
    this.music = musicSystem;
    this._visible = false;
    this._wasO = false;
    this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'settings-ui';
    el.style.cssText = `
      position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
      background: rgba(8,10,18,0.96); border-left: 2px solid #ff3030;
      color: #e0e0e0; font-family: 'Segoe UI', monospace; font-size: 12px;
      display: none; flex-direction: column; z-index: 9100;
      backdrop-filter: blur(8px); box-shadow: -4px 0 24px rgba(0,0,0,0.6);
    `;
    el.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #ff303033;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:15px;font-weight:bold;color:#ff5050;letter-spacing:1px;">⚙️ CONFIGURAÇÕES</span>
        <button id="set-close" style="background:none;border:none;color:#777;cursor:pointer;font-size:22px;">×</button>
      </div>

      <div style="padding:18px 18px 12px; border-bottom:1px solid #1a1a2a;">
        <div style="font-size:11px;color:#ff5050;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">🩸 SANGUE</div>
        <div id="blood-options"></div>
      </div>

      <div style="padding:18px 18px 12px; border-bottom:1px solid #1a1a2a;">
        <div style="font-size:11px;color:#ffd86a;font-weight:bold;letter-spacing:2px;margin-bottom:10px;">♪ MÚSICA</div>
        <div id="music-controls"></div>
      </div>

      <div style="padding:18px;border-bottom:1px solid #1a1a2a;">
        <div style="font-size:11px;color:#5fa;font-weight:bold;letter-spacing:2px;margin-bottom:8px;">⚔️ DASH</div>
        <div style="font-size:11px;color:#aaa;">
          • Janela double-tap W: <span style="color:#fff;">320ms</span><br>
          • Charges aéreos: <span style="color:#fff;">2</span> (recarrega no chão)<br>
          • Cooldown: <span style="color:#fff;">280ms</span>
        </div>
      </div>

      <div style="padding:18px;flex:1;">
        <div style="font-size:11px;color:#5cf;font-weight:bold;letter-spacing:2px;margin-bottom:8px;">⌨️ ATALHOS</div>
        <table style="font-size:11px;color:#aaa;width:100%;">
          <tr><td style="color:#ffcc44;font-weight:600;padding:3px 0;">O</td><td>Este painel</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">C</td><td>Catálogo de monstros</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">N</td><td>Mapas Chibata</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">G</td><td>Guardar/Sacar arma</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">Scroll</td><td>Trocar arma</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">LMB / Q</td><td>Espada: slash / ultimate</td></tr>
          <tr><td style="color:#ffcc44;padding:3px 0;">W W</td><td>Dash (no ar = aéreo)</td></tr>
        </table>
      </div>

      <div style="padding:10px 16px;border-top:1px solid #1a1a2a;color:#666;font-size:10px;">
        [O] fecha. Settings salvam no localStorage.
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    el.querySelector('#set-close').onclick = () => this.hide();
    this._renderBlood();
    this._renderMusic();
  }

  _renderMusic() {
    const c = this._el.querySelector('#music-controls');
    if (!c) return;
    if (!this.music) {
      c.innerHTML = '<div style="color:#888;font-size:11px;">Sistema de música indisponível.</div>';
      return;
    }
    const vol = Math.round(this.music.getVolume() * 100);
    const muted = this.music.isMuted();
    const started = this.music.isStarted();
    const trackName = this.music.currentTrackName() || '—';

    c.innerHTML = `
      <div style="font-size:11px;color:#aaa;margin-bottom:8px;">
        Status: <span style="color:${started ? '#7efa9a' : '#888'};font-weight:600;">${started ? (muted ? 'mudo' : 'tocando') : 'aguardando JOGAR'}</span>
        ${started ? `<br><span style="color:#666;font-size:10px;">♪ ${trackName}</span>` : ''}
      </div>
      <label style="display:block;color:#ccc;font-size:10px;margin-bottom:4px;">VOLUME <span id="music-vol-val">${vol}%</span></label>
      <input id="music-vol" type="range" min="0" max="100" value="${vol}"
             style="width:100%;accent-color:#ffd86a;cursor:pointer;" />
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button id="music-mute-toggle" style="flex:1;background:${muted ? '#5a1a1a' : '#1a3a1f'};border:1px solid ${muted ? '#a33' : '#3a8'};color:#fff;padding:6px;border-radius:5px;cursor:pointer;font-size:11px;">
          ${muted ? '🔇 desmutar' : '🔊 mutar'}
        </button>
        <button id="music-skip" style="flex:1;background:#1a2a4f;border:1px solid #2a4a8f;color:#cde;padding:6px;border-radius:5px;cursor:pointer;font-size:11px;">⏭ próxima</button>
      </div>
    `;

    const slider = c.querySelector('#music-vol');
    const valSpan = c.querySelector('#music-vol-val');
    slider.oninput = () => {
      const v = parseInt(slider.value) / 100;
      this.music.setVolume(v);
      valSpan.textContent = slider.value + '%';
    };
    c.querySelector('#music-mute-toggle').onclick = () => {
      this.music.setMuted(!this.music.isMuted());
      this._renderMusic();
    };
    c.querySelector('#music-skip').onclick = () => {
      this.music.next();
      setTimeout(() => this._renderMusic(), 200);
    };
  }

  _renderBlood() {
    const c = this._el.querySelector('#blood-options');
    c.innerHTML = '';
    const cur = this.bloodFX.getLevel();
    for (const lvl of BLOOD_LEVELS) {
      const info = BLOOD_INFO[lvl];
      const row = document.createElement('div');
      const active = (lvl === cur);
      row.style.cssText = `
        background: ${active ? 'rgba(255,48,48,0.18)' : '#15161d'};
        border-left: 3px solid ${active ? info.color : 'transparent'};
        padding: 10px 12px; margin: 4px 0; border-radius: 6px;
        cursor: pointer; transition: 0.15s;
      `;
      row.innerHTML = `
        <div style="color:${info.color};font-size:13px;font-weight:600;">${info.label}</div>
        <div style="color:#888;font-size:10px;margin-top:3px;">${info.desc}</div>
      `;
      row.onclick = () => {
        this.bloodFX.setLevel(lvl);
        this._renderBlood();
        this._flash(`Sangue: ${info.label}`, info.color);
      };
      row.onmouseenter = () => { if (!active) row.style.background = '#1f2030'; };
      row.onmouseleave = () => { if (!active) row.style.background = '#15161d'; };
      c.appendChild(row);
    }
  }

  _flash(msg, color) {
    let f = document.getElementById('set-flash');
    if (!f) {
      f = document.createElement('div');
      f.id = 'set-flash';
      f.style.cssText = `
        position: fixed; top: 80px; right: 400px; z-index: 9200;
        background: rgba(0,0,0,0.88); padding: 8px 16px; border-radius: 6px;
        font-family: 'Segoe UI', monospace; font-size: 12px; font-weight: 600;
        border: 1px solid; pointer-events: none; opacity: 0;
        transition: opacity 0.2s;
      `;
      document.body.appendChild(f);
    }
    f.textContent = msg;
    f.style.color = color;
    f.style.borderColor = color;
    f.style.opacity = '1';
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => f.style.opacity = '0', 1500);
  }

  show() { this._visible = true; this._el.style.display = 'flex'; }
  hide() { this._visible = false; this._el.style.display = 'none'; }
  toggle() { this._visible ? this.hide() : this.show(); }

  update(input) {
    const oNow = input?.keys?.KeyO === true;
    if (oNow && !this._wasO) this.toggle();
    this._wasO = oNow;
  }
}
