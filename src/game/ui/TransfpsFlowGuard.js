// ─────────────────────────────────────────────────────────────────
//  TransfpsFlowGuard — preenche os gaps de feedback do fluxo MP.
//  Auditoria respondeu: tela preta, countdown silencioso, finish vazio,
//  disconnect sem aviso, JOGAR DE NOVO travado.
// ─────────────────────────────────────────────────────────────────

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Loading overlay (mapa carregando, match começando, reconectando) ──
export class LoadingOverlay {
  constructor() { this._build(); }
  _build() {
    const el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = `
      position:fixed; inset:0; z-index:9000; display:none;
      background:#02030a;
      background-image:radial-gradient(ellipse at 50% 35%,#0a1230 0%,#050816 55%,#02030a 100%);
      align-items:center; justify-content:center; flex-direction:column; gap:18px;
      color:#dfeaf2; font-family:'Fira Code','Share Tech Mono',monospace;
    `;
    // cara de game: spinner cyan + titulo HUD + barra neon angular (tokens GameUIKit)
    el.innerHTML = `
      <div id="lo-spinner" style="
        width:54px; height:54px; border:3px solid rgba(46,255,182,0.18);
        border-top-color:#2effb6; border-radius:50%;
        box-shadow:0 0 18px rgba(46,255,182,0.35);
        animation: lo-spin 0.8s linear infinite;"></div>
      <div id="lo-title" style="font-family:'Share Tech Mono','Fira Code',monospace;
                                font-size:22px; letter-spacing:6px; text-transform:uppercase; color:#2effb6;
                                text-shadow:0 0 12px rgba(46,255,182,0.7), 0 0 24px rgba(46,255,182,0.3);">CARREGANDO</div>
      <div id="lo-detail" style="font:500 12px 'Fira Code',monospace; letter-spacing:1px; color:#7e93a6; max-width:400px; text-align:center;"></div>
      <div id="lo-progress-wrap" style="width:320px; height:8px; background:rgba(46,255,182,0.06);
                                        border:1px solid rgba(46,255,182,0.28);
                                        box-shadow:inset 0 0 8px rgba(46,255,182,0.06); display:none;
                                        clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);">
        <div id="lo-progress" style="height:100%; width:0%;
             background:linear-gradient(90deg,#1bbf8a,#2effb6 60%,#9bffe2);
             box-shadow:0 0 12px rgba(46,255,182,0.55); transition:width 0.3s;"></div>
      </div>
    `;
    document.body.appendChild(el);
    if (!document.getElementById('lo-css')) {
      const s = document.createElement('style');
      s.id = 'lo-css';
      s.textContent = `@keyframes lo-spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(s);
    }
    this._el = el;
    this._title = el.querySelector('#lo-title');
    this._detail = el.querySelector('#lo-detail');
    this._progressWrap = el.querySelector('#lo-progress-wrap');
    this._progress = el.querySelector('#lo-progress');
  }
  show(title, detail, withProgress) {
    this._title.textContent = title || 'CARREGANDO';
    this._detail.textContent = detail || '';
    this._progressWrap.style.display = withProgress ? 'block' : 'none';
    this._progress.style.width = '0%';
    this._el.style.display = 'flex';
  }
  setProgress(pct, detail) {
    this._progress.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (detail) this._detail.textContent = detail;
  }
  setDetail(text) { this._detail.textContent = text || ''; }
  hide() { this._el.style.display = 'none'; }
}

// ── Match countdown screen (entre INICIAR e match RUNNING) ──
export class CountdownScreen {
  constructor(cs) {
    this.cs = cs; this._build();
    this._timer = null;
    cs.on('match_countdown', ({ ends_at }) => this.show(ends_at));
    cs.on('match_started', () => this.hide());
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'countdown-screen';
    el.style.cssText = `
      position:fixed; inset:0; z-index:470; display:none;
      background:rgba(2,3,10,0.92); backdrop-filter:blur(6px);
      align-items:center; justify-content:center; flex-direction:column; gap:16px;
      color:#dff5ff; font-family:'Segoe UI',monospace;
    `;
    el.innerHTML = `
      <div style="font:700 14px monospace; letter-spacing:5px; color:#9aa; opacity:0.8;">A PARTIDA COMEÇA EM</div>
      <div id="cs-num" style="font:900 130px monospace; color:#ffd54a; text-shadow:0 0 30px #ffd54a; line-height:1;">10</div>
      <div style="font:600 13px monospace; opacity:0.6; max-width:380px; text-align:center;">prepare-se · WASD para andar · clique para atacar</div>
    `;
    document.body.appendChild(el);
    this._el = el; this._num = el.querySelector('#cs-num');
  }
  show(endsAt) {
    this._el.style.display = 'flex';
    if (this._timer) clearInterval(this._timer);
    const tick = () => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      this._num.textContent = secs;
      if (secs <= 3) {
        try {
          const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'square'; o.frequency.value = secs === 0 ? 880 : 440;
          g.gain.value = 0; o.connect(g); g.connect(ctx.destination);
          const t0 = ctx.currentTime;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
          g.gain.linearRampToValueAtTime(0, t0 + 0.15);
          o.start(t0); o.stop(t0 + 0.2);
        } catch (_) {}
      }
      if (secs <= 0) { clearInterval(this._timer); this._timer = null; }
    };
    tick();
    this._timer = setInterval(tick, 250);
  }
  hide() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._el.style.display = 'none';
  }
}

// ── Disconnect / Reconnect overlay ──
export class DisconnectGuard {
  constructor(cs) {
    this.cs = cs; this._build();
    cs.on('close', ({ code }) => {
      // code 1000 = saída limpa (leave() do user); resto = trampelin
      if (code === 1000) return;
      this.show(code);
    });
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'disconnect-guard';
    el.style.cssText = `
      position:fixed; inset:0; z-index:490; display:none;
      background:rgba(20,5,5,0.85); backdrop-filter:blur(8px);
      align-items:center; justify-content:center; flex-direction:column; gap:18px;
      color:#fff; font-family:'Segoe UI',monospace;
    `;
    el.innerHTML = `
      <div style="font:900 32px monospace; color:#ff5a5a; text-shadow:0 0 12px #ff5a5a; letter-spacing:3px;">⚠ DESCONECTADO</div>
      <div id="dg-detail" style="opacity:0.7; max-width:400px; text-align:center;">Conexão com o servidor perdida.</div>
      <div style="display:flex; gap:10px;">
        <button id="dg-retry" style="background:#3aa8ff; color:#04101a; border:0; padding:10px 22px;
                font:800 12px monospace; letter-spacing:2px; cursor:pointer; border-radius:4px;">RECONECTAR</button>
        <button id="dg-leave" style="background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.3);
                padding:10px 22px; font:800 12px monospace; letter-spacing:2px; cursor:pointer; border-radius:4px;">VOLTAR AO MENU</button>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    el.querySelector('#dg-retry').onclick = () => {
      this.hide();
      window.location.reload();
    };
    el.querySelector('#dg-leave').onclick = () => {
      window.location.href = window.location.origin + window.location.pathname;
    };
  }
  show(code) {
    this._el.querySelector('#dg-detail').textContent =
      `Conexão perdida (código ${code}). Pode ser instabilidade de rede ou servidor reiniciando.`;
    this._el.style.display = 'flex';
  }
  hide() { this._el.style.display = 'none'; }
}

// ── Match snapshot (kills/deaths/xp ganho durante a partida) ──
export class MatchTracker {
  constructor(cs, auth) {
    this.cs = cs; this.auth = auth;
    this.reset();
    cs.on('match_started', () => this.reset());
    cs.on('xp_gain', ({ player_id, gain, victory }) => {
      if (player_id === auth.getUserId()) {
        this.xpGained += gain;
        if (victory) this.victoryXp = gain;
      }
    });
    cs.on('level_up', ({ player_id, level, prev }) => {
      if (player_id === auth.getUserId()) {
        this.levelsGained += (level - prev);
      }
    });
    cs.on('hit_confirmed', () => {
      // Acerto local — tracked pelo state.kills do server
    });
  }
  reset() {
    this.startedAt = Date.now();
    this.xpGained = 0;
    this.victoryXp = 0;
    this.levelsGained = 0;
    this._snapshotStart = this._snapshot();
  }
  _snapshot() {
    const me = this.cs?.state?.players?.get(this.auth.getUserId());
    return { kills: me?.kills || 0, deaths: me?.deaths || 0, level: me?.level || 1 };
  }
  getSummary() {
    const now = this._snapshot();
    const start = this._snapshotStart || { kills: 0, deaths: 0, level: 1 };
    const playtime = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
    return {
      kills: now.kills - start.kills,
      deaths: now.deaths - start.deaths,
      xp: this.xpGained,
      levels: this.levelsGained,
      playtime,
      currentLevel: now.level,
    };
  }
}

// ── attach ──
export function attachTransfpsFlowGuard({ cs, auth, getLobbyUI, lobbyUI }) {
  const loading = new LoadingOverlay();
  const countdown = new CountdownScreen(cs);
  const disconnect = new DisconnectGuard(cs);
  const tracker = new MatchTracker(cs, auth);

  window._loadingOverlay = loading;
  window._matchTracker = tracker;

  // Resolve lobbyUI lazy (pode ser passado direto ou via getter)
  const resolveLobby = () => (getLobbyUI ? getLobbyUI() : lobbyUI);

  // Quando match_finished, dispara overlay rico
  cs.on('match_finished', (info) => {
    const summary = tracker.getSummary();
    const me = window._authUserId;
    const won = info?.result === 'VICTORY';
    const mvp = info?.mvp_id === me;
    _showRichFinishScreen({ won, mvp, summary, lobbyUI: resolveLobby(), cs });
  });

  // lobby_reset → fecha finish + mostra lobby
  cs.on('lobby_reset', () => {
    document.getElementById('match-finish-rich')?.remove();
  });

  return { loading, countdown, disconnect, tracker };
}

function _showRichFinishScreen({ won, mvp, summary, lobbyUI, cs }) {
  document.getElementById('match-finish-rich')?.remove();
  document.getElementById('match-finish-screen')?.remove();
  const el = document.createElement('div');
  el.id = 'match-finish-rich';
  el.style.cssText = `
    position:fixed; inset:0; z-index:300;
    background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;
    animation:fadein 0.4s;
  `;
  const color = won ? '#2effb6' : '#ff5a5a';
  el.innerHTML = `
    <div style="background:linear-gradient(180deg,#0a1a2a,#040810);
                border:2px solid ${color}; border-radius:10px;
                padding:36px 56px; text-align:center; color:#dff5ff;
                font-family:'Segoe UI',monospace; box-shadow:0 0 50px ${color};
                min-width:420px;">
      <div style="font-size:42px; font-weight:900; letter-spacing:4px; color:${color};
                  text-shadow:0 0 14px currentColor;">
        ${won ? 'VITÓRIA' : 'DERROTA'}
      </div>
      ${mvp ? '<div style="margin-top:6px; color:#ffd54a; font-weight:800; letter-spacing:3px;">⭐ MVP DA PARTIDA</div>' : ''}
      <div style="margin-top:22px; display:grid; grid-template-columns:repeat(2,1fr); gap:10px 28px; text-align:left; font-size:13px;">
        <div><span style="opacity:0.5;">KILLS</span> <span style="color:#ffd54a; font-weight:800; float:right;">${summary.kills}</span></div>
        <div><span style="opacity:0.5;">MORTES</span> <span style="color:#ff7a8a; font-weight:800; float:right;">${summary.deaths}</span></div>
        <div><span style="opacity:0.5;">XP GANHO</span> <span style="color:#2effb6; font-weight:800; float:right;">+${summary.xp}</span></div>
        <div><span style="opacity:0.5;">TEMPO</span> <span style="font-weight:800; float:right;">${Math.floor(summary.playtime/60)}:${String(summary.playtime%60).padStart(2,'0')}</span></div>
        ${summary.levels > 0 ? `<div style="grid-column:1/3;"><span style="opacity:0.5;">LEVEL UP</span> <span style="color:#ffd54a; font-weight:800; float:right;">+${summary.levels} (LV ${summary.currentLevel})</span></div>` : ''}
      </div>
      <div style="margin-top:24px; display:flex; gap:10px; justify-content:center;">
        <button id="mfr-again" style="
          background:${color}; color:#04101a; border:0; padding:11px 22px;
          font:800 12px monospace; letter-spacing:2px; cursor:pointer;
          border-radius:4px;">JOGAR DE NOVO</button>
        <button id="mfr-lobby" style="
          background:transparent; color:#dff5ff; border:1px solid rgba(255,255,255,0.3);
          padding:11px 22px; font:700 12px monospace; letter-spacing:2px;
          cursor:pointer; border-radius:4px;">VOLTAR AO LOBBY</button>
      </div>
      <div style="margin-top:14px; opacity:0.5; font-size:10px;">o lobby reabre em 30 segundos…</div>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#mfr-again').onclick = () => {
    el.remove();
    try { cs.sendReady?.(true); } catch (_) {}
    // Reabre lobby pra ver outros players
    try { lobbyUI?.show?.(); } catch (_) {}
  };
  el.querySelector('#mfr-lobby').onclick = () => {
    el.remove();
    // Sai da sala mas mantém lobby aberto
    try { cs.leave?.(); } catch (_) {}
    try { lobbyUI?.show?.(); } catch (_) {}
  };
  // Auto-fade quando lobby_reset chega
}
