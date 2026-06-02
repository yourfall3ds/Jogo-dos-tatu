// ─────────────────────────────────────────────────────────────────
//  PvpToggle — botão no HEADER do pause overlay (ESC).
//
//  Estado vem do schema Colyseus (state.players[me].pvp_on).
//  Toggle envia 'pvp_toggle' pro servidor; ele broadcasta.
//  Atalho: tecla P no jogo também alterna.
// ─────────────────────────────────────────────────────────────────

export class PvpToggle {
  constructor(colyseusClient, auth) {
    this.cs = colyseusClient;
    this.auth = auth;
    this._build();
    this._wasP = false;
  }

  _build() {
    // Injeta no topo do pause-overlay (ESC overlay já existe no index.html)
    const overlay = document.getElementById('pause-overlay');
    if (!overlay) {
      console.warn('[PvpToggle] pause-overlay não encontrado');
      return;
    }
    // Header sticky no topo
    const header = document.createElement('div');
    header.id = 'pvp-header';
    header.style.cssText = `
      position: absolute; top: 18px; left: 50%;
      transform: translateX(-50%); z-index: 210;
      display: flex; gap: 10px; align-items: center;
      background: rgba(20,5,5,0.78); border: 1px solid #913030;
      border-radius: 10px; padding: 8px 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      backdrop-filter: blur(6px);
    `;
    header.innerHTML = `
      <span style="color:#ff8a8a;font-size:11px;letter-spacing:1.5px;font-weight:700;">PVP</span>
      <label class="pvp-switch" style="position:relative;display:inline-block;width:46px;height:24px;cursor:pointer;">
        <input id="pvp-checkbox" type="checkbox" style="opacity:0;width:0;height:0;"/>
        <span class="pvp-slider" style="
          position:absolute;inset:0;background:#3a2020;border-radius:24px;
          transition:0.25s;border:1px solid #5a3030;">
          <span style="position:absolute;top:2px;left:2px;width:18px;height:18px;
                       background:#888;border-radius:50%;transition:0.25s;
                       box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
        </span>
      </label>
      <span id="pvp-status" style="color:#888;font-size:11px;font-weight:600;min-width:32px;">OFF</span>
    `;
    overlay.appendChild(header);
    this._header = header;
    this._checkbox = header.querySelector('#pvp-checkbox');
    this._slider = header.querySelector('.pvp-slider');
    this._sliderBall = this._slider.querySelector('span');
    this._statusEl = header.querySelector('#pvp-status');

    this._checkbox.addEventListener('change', () => {
      this._sendToggle(this._checkbox.checked);
    });

    // Re-render quando state muda
    this.cs.on('player_change', (e) => {
      if (e?.id === this.auth.getUserId() && e?.field === 'pvp_on') {
        this._refreshUi(e.value);
      }
    });
    this.cs.on('player_add', (e) => {
      if (e?.id === this.auth.getUserId()) {
        this._refreshUi(!!e.state.pvp_on);
      }
    });
  }

  _refreshUi(on) {
    if (!this._checkbox) return;
    this._checkbox.checked = !!on;
    if (on) {
      this._slider.style.background = '#7a1818';
      this._slider.style.borderColor = '#cc4040';
      this._sliderBall.style.left = '24px';
      this._sliderBall.style.background = '#ff5050';
      this._sliderBall.style.boxShadow = '0 0 8px rgba(255,80,80,0.8)';
      this._statusEl.textContent = 'ON';
      this._statusEl.style.color = '#ff8080';
    } else {
      this._slider.style.background = '#3a2020';
      this._slider.style.borderColor = '#5a3030';
      this._sliderBall.style.left = '2px';
      this._sliderBall.style.background = '#888';
      this._sliderBall.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
      this._statusEl.textContent = 'OFF';
      this._statusEl.style.color = '#888';
    }
  }

  _sendToggle(on) {
    if (!this.cs?.connected) return;
    this.cs.sendPvpToggle(on);
  }

  /** Chamado no loop pra processar tecla P. */
  update(input) {
    const pNow = input?.keys?.KeyP === true;
    if (pNow && !this._wasP && this.cs?.connected) {
      const me = this.cs.state?.players?.get(this.auth.getUserId());
      if (me) this._sendToggle(!me.pvp_on);
    }
    this._wasP = pNow;
  }

  isOn() {
    const me = this.cs.state?.players?.get(this.auth.getUserId());
    return !!me?.pvp_on;
  }
}
