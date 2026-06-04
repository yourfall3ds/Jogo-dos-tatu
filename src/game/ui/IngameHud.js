// ─────────────────────────────────────────────────────────────────
//  IngameHud — 4 elementos in-game multiplayer:
//   • ChatHud (T abre, Enter envia)
//   • Scoreboard (TAB segura)
//   • PingDisplay (canto)
//   • DeathTimer (overlay quando morto)
// ─────────────────────────────────────────────────────────────────

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class ChatHud {
  constructor(cs, auth) {
    this.cs = cs;
    this.auth = auth;
    this._open = false;
    this._lines = [];
    this._wasT = false;
    this._build();
    this.cs.on('chat', (m) => this._append(m));
    document.addEventListener('keydown', (e) => this._onKey(e));
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'chat-hud';
    el.style.cssText = `
      position: fixed; bottom: 80px; left: 16px; z-index: 95;
      width: 360px; max-width: 40vw;
      pointer-events: none; font: 600 12px 'Segoe UI', monospace;
    `;
    el.innerHTML = `
      <div id="chat-lines" style="display:flex; flex-direction:column; gap:3px; max-height:200px; overflow:hidden;"></div>
      <div id="chat-input-wrap" style="display:none; margin-top:6px; pointer-events:auto;">
        <input id="chat-input" maxlength="500" placeholder="mensagem… (Enter envia / Esc fecha)"
               style="width:100%; padding:8px 12px; background:rgba(0,0,0,0.75);
                      border:1px solid rgba(120,180,255,0.45); color:#fff;
                      border-radius:6px; font:inherit;" />
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._input = el.querySelector('#chat-input');
    this._linesEl = el.querySelector('#chat-lines');
    this._inputWrap = el.querySelector('#chat-input-wrap');

    this._input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this._send(); }
      else if (e.key === 'Escape') { this._close(); }
    });
  }

  _onKey(e) {
    if (e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyT' && !this._open && !e.repeat && this.cs?.connected) {
      e.preventDefault();
      this._openChat();
    }
  }

  _openChat() {
    this._open = true;
    this._inputWrap.style.display = 'block';
    this._input.focus();
    window._gameInput?.deactivate?.();
  }

  _close() {
    this._open = false;
    this._inputWrap.style.display = 'none';
    this._input.value = '';
    window._gameInput?.activate?.();
  }

  _send() {
    const msg = this._input.value.trim();
    if (msg && this.cs?.connected) this.cs.sendChat(msg);
    this._close();
  }

  /** Log de SISTEMA/DEBUG no chat (erros do server, timings, travadas). Não
   *  vem da rede — é local, pra a gente VER o que está acontecendo in-game. */
  system(text, color = '#ffd24a') {
    try {
      if (!this._linesEl) return;
      const line = document.createElement('div');
      line.style.cssText = `
        background: rgba(18,10,4,0.85); padding: 3px 9px; border-radius: 4px;
        color: ${color}; text-shadow: 0 1px 2px black; opacity: 1;
        border-left: 3px solid ${color};
        transition: opacity 4s linear 8s; font: 600 11px 'Segoe UI', monospace;
      `;
      line.textContent = '🛠 ' + String(text);
      this._linesEl.appendChild(line);
      setTimeout(() => { line.style.opacity = '0'; }, 50);
      setTimeout(() => { try { this._linesEl.removeChild(line); } catch (_) {} }, 12100);
      while (this._linesEl.children.length > 8) {
        this._linesEl.removeChild(this._linesEl.firstChild);
      }
    } catch (_) {}
  }

  _append(m) {
    const isMe = m.from === this.auth.getUserId();
    const line = document.createElement('div');
    line.style.cssText = `
      background: rgba(0,0,0,0.72); padding: 3px 9px; border-radius: 4px;
      color: ${isMe ? '#7efa9a' : '#cdd'}; text-shadow: 0 1px 2px black;
      opacity: 1; transition: opacity 4s linear 3s;
    `;
    line.innerHTML = `<b style="color:${isMe ? '#7efa9a' : '#5cf'};">${_esc(m.nick || 'player')}:</b> ${_esc(m.msg)}`;
    this._linesEl.appendChild(line);
    // Fade out e remove
    setTimeout(() => { line.style.opacity = '0'; }, 50);
    setTimeout(() => { try { this._linesEl.removeChild(line); } catch (_) {} }, 7100);
    // Limita histórico
    while (this._linesEl.children.length > 6) {
      this._linesEl.removeChild(this._linesEl.firstChild);
    }
  }
}

export class Scoreboard {
  constructor(cs, auth) {
    this.cs = cs;
    this.auth = auth;
    this._visible = false;
    this._build();
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'scoreboard';
    el.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
      z-index: 92; display: none;
      width: 600px; max-width: 92vw;
      background: rgba(10,15,30,0.92); color: #fff;
      border: 1px solid rgba(120,180,255,0.45); border-radius: 12px;
      backdrop-filter: blur(8px); padding: 14px 18px;
      font: 600 13px 'Segoe UI', monospace;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      pointer-events: none;
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
        <span style="font-size:1.15em; color:#5cf; letter-spacing:2px;">🏆 SCOREBOARD</span>
        <span id="sb-room" style="font-size:0.85em; color:#789;">—</span>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:0.92em;">
        <thead>
          <tr style="border-bottom:1px solid rgba(120,180,255,0.30); color:#789; font-size:0.8em; letter-spacing:1px;">
            <th style="text-align:left; padding:4px 8px;">PLAYER</th>
            <th style="text-align:right; padding:4px 8px;">LV</th>
            <th style="text-align:right; padding:4px 8px;">K</th>
            <th style="text-align:right; padding:4px 8px;">D</th>
            <th style="text-align:right; padding:4px 8px;">PING</th>
          </tr>
        </thead>
        <tbody id="sb-tbody"></tbody>
      </table>
    `;
    document.body.appendChild(el);
    this._el = el;
  }

  _onKey(e, isDown) {
    if (e.code !== 'Tab') return;
    if (e.target?.tagName === 'INPUT') return;
    e.preventDefault();
    if (isDown && !this._visible) this.show();
    else if (!isDown && this._visible) this.hide();
  }

  show() {
    if (!this.cs?.connected || !this.cs.state) return;
    this._visible = true;
    this._el.style.display = 'block';
    this._render();
    // Refresh while open
    this._refreshT = setInterval(() => this._render(), 700);
  }
  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    if (this._refreshT) { clearInterval(this._refreshT); this._refreshT = null; }
  }

  _render() {
    if (!this.cs?.state) return;
    const tbody = this._el.querySelector('#sb-tbody');
    const roomLabel = this._el.querySelector('#sb-room');
    const room = this.cs.room;
    const meta = room?.metadata || {};
    roomLabel.textContent = `${meta.name || 'Arena'} · ${meta.map || ''}`;

    // Usa cs.playerId (a CHAVE real do server), NÃO auth.getUserId() — eles
    // podem divergir (anon/race no boot) e a Scoreboard mostrava "não está na
    // sala" mesmo conectado. cs.playerId é o que o server conhece.
    const myId = this.cs.playerId || this.auth.getUserId();
    const me = this.cs.state.players.get(myId);
    const myParty = me?.party_id || null;
    const friends = window._friendIds || new Set();
    const rows = [];
    this.cs.state.players.forEach((p, id) => {
      let bucket = 3; // 0=me, 1=party, 2=friends, 3=others
      if (id === myId) bucket = 0;
      else if (myParty && p.party_id === myParty) bucket = 1;
      else if (friends.has(id)) bucket = 2;
      rows.push({ id, p, bucket });
    });
    // Ordena: bucket asc, depois kills desc, depois level desc
    rows.sort((a, b) =>
      (a.bucket - b.bucket)
      || ((b.p.kills || 0) - (a.p.kills || 0))
      || ((b.p.level || 1) - (a.p.level || 1))
    );

    tbody.innerHTML = '';
    rows.forEach(({ id, p, bucket }, idx) => {
      const isMe = id === myId;
      const row = document.createElement('tr');
      row.style.cssText = `
        border-bottom: 1px solid rgba(255,255,255,0.04);
        ${isMe ? 'background: rgba(126,250,154,0.08);' : bucket === 1 ? 'background: rgba(154,126,255,0.07);' : bucket === 2 ? 'background: rgba(58,168,255,0.05);' : ''}
        color: ${isMe ? '#7efa9a' : '#cdd'};
      `;
      const pingColor = p.ping < 80 ? '#7efa9a' : p.ping < 200 ? '#ffcc44' : '#ff7a8a';
      const dead = p.dead ? ' <span style="color:#ff5050;">💀</span>' : '';
      const host = p.is_host ? ' <span style="color:#ffcc00; font-size:0.85em;">👑</span>' : '';
      const pvp = p.pvp_on ? ' <span style="color:#ff5050; font-size:0.85em;">⚔</span>' : '';
      const partyIcon = bucket === 1 ? ' <span style="color:#9a7eff; font-size:0.85em;">★</span>' : '';
      const friendIcon = bucket === 2 ? ' <span style="color:#3aa8ff; font-size:0.85em;">♦</span>' : '';
      row.innerHTML = `
        <td style="padding:6px 8px;">${idx + 1}. ${_esc(p.nickname || 'player')}${host}${pvp}${partyIcon}${friendIcon}${dead}${isMe ? ' <span style="color:#7efa9a; font-size:0.85em;">(você)</span>' : ''}</td>
        <td style="text-align:right; padding:6px 8px; color:#5cf;">${p.level || 1}</td>
        <td style="text-align:right; padding:6px 8px; color:#fff; font-weight:700;">${p.kills || 0}</td>
        <td style="text-align:right; padding:6px 8px; color:#999;">${p.deaths || 0}</td>
        <td style="text-align:right; padding:6px 8px; color:${pingColor}; font-family:monospace;">${p.ping || '?'} ms</td>
      `;
      tbody.appendChild(row);
    });
  }
}

export class PingDisplay {
  constructor(cs) {
    this.cs = cs;
    const el = document.createElement('div');
    el.id = 'ping-display';
    el.style.cssText = `
      position: fixed; top: 14px; right: 16px; z-index: 90;
      background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12);
      color: #aaa; padding: 4px 10px; border-radius: 12px;
      font: 700 11px 'Segoe UI', monospace; display: none;
    `;
    el.innerHTML = `<span id="ping-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#7efa9a;margin-right:6px;box-shadow:0 0 4px #7efa9a;"></span><span id="ping-val">0 ms</span>`;
    document.body.appendChild(el);
    this._el = el;
    this._dot = el.querySelector('#ping-dot');
    this._val = el.querySelector('#ping-val');
  }

  update() {
    if (!this.cs?.connected) { this._el.style.display = 'none'; return; }
    this._el.style.display = 'block';
    const ms = this.cs.getPing?.() || 0;
    this._val.textContent = ms + ' ms';
    let color;
    if (ms < 80)       color = '#7efa9a';
    else if (ms < 200) color = '#ffcc44';
    else               color = '#ff7a8a';
    this._dot.style.background = color;
    this._dot.style.boxShadow = `0 0 4px ${color}`;
    this._val.style.color = color;
  }
}

export class DeathTimer {
  constructor(cs, auth) {
    this.cs = cs;
    this.auth = auth;
    const el = document.createElement('div');
    el.id = 'death-timer-overlay';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 95;
      display: none; flex-direction: column;
      align-items: center; justify-content: center;
      background: radial-gradient(ellipse at center, rgba(80,0,0,0.55) 0%, rgba(0,0,0,0.85) 70%);
      pointer-events: none; color: #fff; text-align: center;
    `;
    el.innerHTML = `
      <div style="font: 900 3.5em 'Segoe UI', monospace; color:#ff5050;
                  text-shadow: 0 0 24px #ff2020; letter-spacing: 6px;">VOCÊ MORREU</div>
      <div id="dt-killer" style="margin-top:14px; color:#cdd; font-size:1em;">—</div>
      <div style="margin-top:30px; font: 700 1.3em 'Segoe UI', monospace; color:#ffcc66;">
        renascendo em <span id="dt-secs" style="color:#fff; font-size:1.8em;">3</span>s
      </div>
      <div style="margin-top:24px; color:#789; font-size:0.85em;">aguardando servidor…</div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._secsEl = el.querySelector('#dt-secs');
    this._killerEl = el.querySelector('#dt-killer');
    this._visible = false;
    this._lastDeadAt = 0;

    // Mostra info do killer quando recebe 'died'
    this.cs.on('died', (m) => {
      if (m.player_id === this.auth.getUserId()) {
        const killer = this.cs.state?.players?.get(m.killer);
        const killerNick = killer?.nickname || 'algo';
        this._killerEl.textContent = `morto por ${killerNick}`;
      }
    });
  }

  update() {
    if (!this.cs?.connected || !this.cs.state) {
      if (this._visible) this._hide();
      return;
    }
    // state.players pode ser undefined antes do primeiro schema sync
    const players = this.cs.state.players;
    if (!players || typeof players.get !== 'function') {
      if (this._visible) this._hide();
      return;
    }
    const me = players.get(this.auth.getUserId());
    if (!me?.dead) {
      if (this._visible) this._hide();
      return;
    }
    if (!this._visible) {
      this._el.style.display = 'flex';
      this._visible = true;
    }
    // Conta tempo restante até respawn_at
    const serverDelta = window._cs?.serverTimeDelta || 0;
    const remainingMs = Math.max(0, (me.respawn_at || 0) - (Date.now() + serverDelta));
    // Clamp visual a 5s (server SEMPRE seta 5000ms; valores maiores eh drift)
    const secs = Math.min(5, Math.ceil(remainingMs / 1000));
    this._secsEl.textContent = String(secs);
    if (remainingMs <= 0 && !this._respawnRequested) {
      this._respawnRequested = true;
      // Auto-pede respawn
      this.cs.sendRespawn();
      setTimeout(() => { this._respawnRequested = false; }, 1500);
    }
  }

  _hide() {
    this._el.style.display = 'none';
    this._visible = false;
    this._respawnRequested = false;
  }
}
