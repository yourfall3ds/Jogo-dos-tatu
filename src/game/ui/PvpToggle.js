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

    // Re-render quando state muda. SOU EU = cs.playerId (id estável usado no
    // join). Em visitante auth.getUserId() é null → o próprio indicador nunca
    // atualizava → só dava pra ver no adversário. Mesmo motivo dos outros bugs.
    const myId = () => this.cs.playerId || this.auth.getUserId();
    this.cs.on('player_change', (e) => {
      if (e?.id === myId() && e?.field === 'pvp_on') this._refreshUi(e.value);
    });
    this.cs.on('player_add', (e) => {
      if (e?.id === myId()) this._refreshUi(!!e.state.pvp_on);
    });

    // ── Botão no MENU de PAUSE (ESC) ────────────────────────────────
    //  O pedido foi "adiciona um botão no pause que já liga o PvP". Injetado
    //  uma vez no #pause-overlay; clicar alterna o mesmo toggle do Y/HUD.
    this._installPauseButton();
  }

  /** Adiciona um botão de toggle PvP no overlay de pause. Tenta agora; se o
   *  overlay ainda não existe (boot), re-tenta a cada open do menu. */
  _installPauseButton() {
    const tryInject = () => {
      const ov = document.getElementById('pause-overlay');
      if (!ov || ov.querySelector('#pause-pvp-btn')) return !!ov;
      const btn = document.createElement('button');
      btn.id = 'pause-pvp-btn';
      btn.className = 'pbtn';   // usa o mesmo estilo dos outros botoes do pause
      btn.innerHTML = `<span class="pico">⚔</span><span class="ptxt">ATIVAR PVP</span><span class="pkey">Y</span>`;
      btn.onclick = () => {
        if (!this.cs?.connected) return;
        const myId = this.cs.playerId || this.auth.getUserId();
        const me = myId ? this.cs.state?.players?.get(myId) : null;
        if (me) this._sendToggle(!me.pvp_on);
      };
      // coluna central do menu (botoes "Voltar/Sair"); fallback no overlay
      const main = ov.querySelector('#pause-main') || ov.querySelector('.pause-panel') || ov;
      main.appendChild(btn);
      this._pauseBtn = btn;
      this._refreshUi(this.isOn());
      return true;
    };
    if (tryInject()) return;
    // Overlay ainda não montado → tenta no MutationObserver (1 vez).
    const obs = new MutationObserver(() => {
      if (tryInject()) { try { obs.disconnect(); } catch (_) {} }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // safety: força tentativa de novo em 2s
    setTimeout(() => { tryInject(); try { obs.disconnect(); } catch (_) {} }, 2500);
  }

  _refreshUi(on) {
    if (this._ind) {
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
    if (this._pauseBtn) {
      const txt = this._pauseBtn.querySelector('.ptxt');
      if (on) {
        if (txt) txt.textContent = 'PVP ATIVADO';
        this._pauseBtn.style.borderColor = 'rgba(255,90,90,0.55)';
        this._pauseBtn.style.color = '#ff8a8a';
        this._pauseBtn.style.background = 'rgba(60,10,10,0.45)';
        this._pauseBtn.style.boxShadow = '0 0 14px rgba(255,70,70,0.35)';
      } else {
        if (txt) txt.textContent = 'ATIVAR PVP';
        this._pauseBtn.style.borderColor = '';
        this._pauseBtn.style.color = '';
        this._pauseBtn.style.background = '';
        this._pauseBtn.style.boxShadow = '';
      }
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
      // SOU EU: usa cs.playerId (id estável usado no join). Em sessão ANÔNIMA
      // auth.getUserId() = null → players.get(null) = undefined → me era sempre
      // falsy → tecla Y nunca disparava o toggle. Mesmo motivo da duplicação.
      const myId = this.cs.playerId || this.auth.getUserId();
      const me = myId ? this.cs.state?.players?.get(myId) : null;
      if (me) this._sendToggle(!me.pvp_on);
    }
    this._wasKey = yNow;
  }

  isOn() {
    const myId = this.cs.playerId || this.auth.getUserId();
    const me = myId ? this.cs.state?.players?.get(myId) : null;
    return !!me?.pvp_on;
  }
}
