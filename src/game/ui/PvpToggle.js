// ─────────────────────────────────────────────────────────────────
//  PvpToggle — indicador de PVP no HUD do jogo (canto), NÃO no menu.
//
//  Estado vem do schema Colyseus (state.players[me].pvp_on).
//  Toggle envia 'pvp_toggle' pro servidor; ele broadcasta.
//  Atalho: tecla Y alterna (P é usada por outra coisa).
//  Sem switch clicável no menu de pausa — só a tecla + o indicador.
// ─────────────────────────────────────────────────────────────────

export class PvpToggle {
  constructor(colyseusClient, auth) {
    this.cs = colyseusClient;
    this.auth = auth;
    this._build();
    this._wasKey = false;
  }

  _build() {
    // Indicador discreto fixo no HUD (canto superior esquerdo, abaixo do
    //  badge "servidor"). Sempre visível durante a partida — mostra estado
    //  e a tecla. NÃO injeta nada no pause-overlay.
    const ind = document.createElement('div');
    ind.id = 'pvp-indicator';
    ind.style.cssText = `
      position: fixed; top: 92px; left: 14px; z-index: 60;
      display: flex; gap: 8px; align-items: center;
      background: rgba(8,16,22,0.82); border: 1px solid #1f6a5c;
      border-radius: 8px; padding: 6px 11px;
      font-family: 'Segoe UI', monospace; font-size: 11px;
      letter-spacing: 1px; font-weight: 700;
      box-shadow: 0 3px 14px rgba(0,0,0,0.45);
      backdrop-filter: blur(5px); pointer-events: none;
      transition: border-color .25s, box-shadow .25s;
    `;
    ind.innerHTML = `
      <span id="pvp-ind-label" style="color:#3effc8;">PVP</span>
      <span id="pvp-ind-status" style="color:#7be3c8;min-width:26px;">OFF</span>
      <span style="color:#5a7a72;font-weight:600;font-size:10px;">[Y]</span>
    `;
    document.body.appendChild(ind);
    this._ind       = ind;
    this._labelEl   = ind.querySelector('#pvp-ind-label');
    this._statusEl  = ind.querySelector('#pvp-ind-status');

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
    if (!this._ind) return;
    if (on) {
      this._ind.style.borderColor = '#cc4040';
      this._ind.style.boxShadow   = '0 0 16px rgba(255,70,70,0.5)';
      this._labelEl.style.color   = '#ff6a6a';
      this._statusEl.textContent  = 'ON';
      this._statusEl.style.color  = '#ff8080';
    } else {
      this._ind.style.borderColor = '#1f6a5c';
      this._ind.style.boxShadow   = '0 3px 14px rgba(0,0,0,0.45)';
      this._labelEl.style.color   = '#3effc8';
      this._statusEl.textContent  = 'OFF';
      this._statusEl.style.color  = '#7be3c8';
    }
  }

  _sendToggle(on) {
    if (!this.cs?.connected) return;
    this.cs.sendPvpToggle(on);
  }

  /** Chamado no loop pra processar a tecla de PVP (Y). */
  update(input) {
    const yNow = input?.isDown?.('KeyY') === true || input?.keys?.KeyY === true;
    if (yNow && !this._wasKey && this.cs?.connected) {
      const me = this.cs.state?.players?.get(this.auth.getUserId());
      if (me) this._sendToggle(!me.pvp_on);
    }
    this._wasKey = yNow;
  }

  isOn() {
    const me = this.cs.state?.players?.get(this.auth.getUserId());
    return !!me?.pvp_on;
  }
}
