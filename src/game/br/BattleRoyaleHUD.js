// ─────────────────────────────────────────────────────────────────
//  BattleRoyaleHUD — elementos UI específicos do modo BR.
//
//  Elementos de PADRÃO DE GÊNERO (não copyright):
//   - Alive count top-center ("47 VIVOS")
//   - Storm timer top-center sob alive ("⛈ FECHA EM 1:23")
//   - Altitude indicator durante skydive
//   - Kill feed direita (player A eliminated player B)
//   - Place indicator on death ("#27 / 60")
//   - Skydive HUD: barra de velocidade + altímetro
//
//  Tudo CSS/DOM, não 3D.
// ─────────────────────────────────────────────────────────────────

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class BattleRoyaleHUD {
  constructor(cs, auth) {
    this.cs = cs; this.auth = auth;
    this._build();
    this._wire();
  }

  _build() {
    // Container principal
    const el = document.createElement('div');
    el.id = 'br-hud';
    el.style.cssText = `
      position:fixed; inset:0; pointer-events:none; z-index:88;
      color:#dff5ff; font-family:'Segoe UI',monospace;
      display:none;
    `;
    el.innerHTML = `
      <!-- TOP CENTER: Alive + Storm -->
      <div id="br-top" style="
        position:absolute; top:14px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.78); border:1px solid rgba(126,239,196,0.4);
        border-radius:6px; padding:8px 18px; text-align:center; min-width:180px;
      ">
        <div id="br-alive" style="font:900 16px monospace; color:#2effb6;
             text-shadow:0 0 8px #2effb6; letter-spacing:2px;">— VIVOS</div>
        <div id="br-storm" style="font:700 11px monospace; opacity:0.85; margin-top:3px;">—</div>
      </div>

      <!-- KILL FEED (right side, top) -->
      <div id="br-killfeed" style="
        position:absolute; top:80px; right:14px; width:280px;
        display:flex; flex-direction:column; gap:4px;
      "></div>

      <!-- SKYDIVE HUD (center, hidden during ground) -->
      <div id="br-skydive" style="
        position:absolute; bottom:120px; left:50%; transform:translateX(-50%);
        display:none; text-align:center;
      ">
        <div style="display:flex; gap:24px; justify-content:center; align-items:flex-end;">
          <div>
            <div style="font:700 10px monospace; opacity:0.6; letter-spacing:2px;">ALTITUDE</div>
            <div id="br-altitude" style="font:900 28px monospace; color:#3aa8ff;
                 text-shadow:0 0 8px #3aa8ff;">— m</div>
          </div>
          <div>
            <div style="font:700 10px monospace; opacity:0.6; letter-spacing:2px;">VELOCIDADE</div>
            <div id="br-speed" style="font:900 28px monospace; color:#ffd54a;
                 text-shadow:0 0 8px #ffd54a;">— m/s</div>
          </div>
        </div>
        <div style="margin-top:10px; font:700 11px monospace; opacity:0.6;">
          W = picada · S = freia · A/D = vira
        </div>
      </div>

      <!-- PLACEMENT on death -->
      <div id="br-place" style="
        position:absolute; top:38%; left:50%; transform:translateX(-50%);
        display:none; text-align:center;
      ">
        <div style="font:900 60px monospace; color:#ffd54a;
             text-shadow:0 0 16px #ffd54a;">#—</div>
        <div style="font:700 13px monospace; opacity:0.7; letter-spacing:3px;">colocação</div>
      </div>

      <!-- BR PHASE BANNER (top: "TAKEOFF", "SKYDIVE", "RUNNING") -->
      <div id="br-phase" style="
        position:absolute; top:70px; left:50%; transform:translateX(-50%);
        font:900 14px monospace; letter-spacing:4px; opacity:0;
        transition:opacity 0.4s;
      "></div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._alive = el.querySelector('#br-alive');
    this._storm = el.querySelector('#br-storm');
    this._killfeed = el.querySelector('#br-killfeed');
    this._skydive = el.querySelector('#br-skydive');
    this._altitude = el.querySelector('#br-altitude');
    this._speed = el.querySelector('#br-speed');
    this._place = el.querySelector('#br-place');
    this._phase = el.querySelector('#br-phase');
  }

  _wire() {
    // Mostra hud quando entra em modo BR
    this.cs.on('br_takeoff', () => {
      this._showPhase('🚀 DECOLAGEM');
      this._el.style.display = 'block';
    });
    this.cs.on('br_skydive_phase', () => {
      this._showPhase('🪂 QUEDA LIVRE');
      this._skydive.style.display = 'block';
    });
    this.cs.on('br_running', () => {
      this._showPhase('⚔ COMBATE');
      this._skydive.style.display = 'none';
    });
    this.cs.on('br_landed', ({ player_id }) => {
      if (player_id === this.auth.getUserId()) {
        this._skydive.style.display = 'none';
      }
    });
    this.cs.on('br_zone_warning', ({ wave, starts_at }) => {
      this._addKillfeed(`⚠ ZONA FECHA em ${Math.max(1, Math.ceil((starts_at - Date.now()) / 1000))}s`, '#ffd54a');
    });
    this.cs.on('br_zone_shrinking', ({ wave, radius_target }) => {
      this._addKillfeed(`⛈ WAVE ${wave} · raio → ${radius_target}m`, '#ff5a5a');
    });
    this.cs.on('br_player_died', ({ player_id, killer, place, cause }) => {
      this._addPlayerDied(player_id, killer, place, cause);
      if (player_id === this.auth.getUserId()) {
        this._showPlace(place);
      }
    });
    this.cs.on('br_finished', ({ winner_id, winner_nick }) => {
      this._showPhase(`🏆 ${(winner_nick || 'Player').toUpperCase()} VENCEU`);
      this._el.style.display = 'block';
      this._skydive.style.display = 'none';
    });
  }

  /** Update loop (chamado externamente em 5Hz). */
  update() {
    const st = this.cs?.state;
    if (!st) return;
    if (st.mode !== 'BATTLE_ROYALE') {
      this._el.style.display = 'none';
      return;
    }
    this._el.style.display = 'block';

    // Alive count
    this._alive.textContent = `${st.br_alive_count || 0} VIVOS`;

    // Storm timer
    const z = st.zone;
    if (z) {
      const now = Date.now();
      if (z.phase === 'IDLE' || z.phase === 'WARNING') {
        const secs = Math.max(0, Math.ceil((z.shrink_starts_at - now) / 1000));
        this._storm.textContent = `⛈ fecha em ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
        this._storm.style.color = secs < 15 ? '#ff5a5a' : '#ffd54a';
      } else if (z.phase === 'SHRINKING') {
        const remSecs = Math.max(0, Math.ceil((z.shrink_ends_at - now) / 1000));
        this._storm.textContent = `⛈ ZONA FECHANDO · ${remSecs}s · raio ${Math.round(z.radius_current)}m`;
        this._storm.style.color = '#ff5a5a';
      } else {
        this._storm.textContent = `raio ${Math.round(z.radius_current || 0)}m`;
        this._storm.style.color = '#dff5ff';
      }
    }

    // Skydive HUD se em skydive
    const me = st.players?.get(this.auth.getUserId());
    if (me && me.br_state === 'SKYDIVE') {
      this._skydive.style.display = 'block';
      this._altitude.textContent = `${Math.round(me.altitude || 0)} m`;
      // Aproxima velocidade pela pitch (real client value tá no skydiveController)
      const sc = window._skydiveController;
      const v = sc?.getVelocity?.()?.length?.() || 30;
      this._speed.textContent = `${Math.round(v)} m/s`;
    }
  }

  _showPhase(text) {
    this._phase.textContent = text;
    this._phase.style.color = '#2effb6';
    this._phase.style.textShadow = '0 0 12px #2effb6';
    this._phase.style.opacity = '1';
    clearTimeout(this._phaseT);
    this._phaseT = setTimeout(() => { this._phase.style.opacity = '0'; }, 3000);
  }

  _addKillfeed(text, color = '#dff5ff') {
    const row = document.createElement('div');
    row.style.cssText = `
      background:rgba(0,0,0,0.7); border-left:3px solid ${color};
      padding:5px 8px; font:700 11px monospace; color:${color};
      opacity:0; transition:opacity 0.2s;
    `;
    row.textContent = text;
    this._killfeed.appendChild(row);
    requestAnimationFrame(() => row.style.opacity = '1');
    setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 250); }, 5000);
    // Limita a 6 linhas
    while (this._killfeed.children.length > 6) this._killfeed.firstChild.remove();
  }

  _addPlayerDied(pid, killerId, place, cause) {
    const st = this.cs?.state;
    const p = st?.players?.get(pid);
    const k = killerId ? st?.players?.get(killerId) : null;
    const pName = p?.nickname || '?';
    const kName = k?.nickname || (cause === 'STORM' ? 'STORM' : '?');
    const text = killerId
      ? `💀 ${kName} → ${pName} (#${place})`
      : `⛈ ${pName} morreu na storm (#${place})`;
    this._addKillfeed(text, killerId ? '#ff8a8a' : '#ffd54a');
  }

  _showPlace(place) {
    this._place.style.display = 'block';
    this._place.querySelector('div').textContent = `#${place}`;
    setTimeout(() => { this._place.style.display = 'none'; }, 6000);
  }

  show() { this._el.style.display = 'block'; }
  hide() { this._el.style.display = 'none'; }
}
