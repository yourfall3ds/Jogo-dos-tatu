// ─────────────────────────────────────────────────────────────────
//  TransfpsSocial — Frentes A→J client UI (MVP Comercial)
//   A. XPBar + LevelUp flash + sound
//   B. MatchStateBanner (WAITING/COUNTDOWN/RUNNING/BOSS_WAVE/FINISHED)
//   C. BossBar global + RemoteBoss (mesh sync via state.boss)
//   D. QuestPanel (Q tecla)
//   E. LeaderboardScreen (F1)
//   F. FriendsPanel (F2)
//   G. SocialHud (TAB ordering: party > friends > others)
//   H. PartyHud + invite (F3)
//   J. Tutorial overlay (uma vez)
// ─────────────────────────────────────────────────────────────────

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _toast(text, color = '#7defc4') {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position:fixed; bottom:120px; left:50%; transform:translateX(-50%);
    z-index:200; background:rgba(0,0,0,0.85); color:${color};
    padding:10px 22px; border-radius:6px; border:1px solid ${color};
    font:700 14px 'Segoe UI',monospace; letter-spacing:1px;
    pointer-events:none; opacity:0; transition:opacity 0.2s;
    text-shadow:0 0 8px ${color};
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.style.opacity = '1');
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

// ── XP & LEVEL ─────────────────────────────────────────────────
export class XpHud {
  constructor(cs, auth) {
    this.cs = cs; this.auth = auth;
    this._build();
    cs.on('xp_gain', ({ amount, reason }) => this._onXpGain(amount, reason));
    cs.on('level_up', ({ level }) => this._onLevelUp(level));
    cs.on('profile_loaded', (p) => this._setProfile(p));
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'xp-hud';
    el.style.cssText = `
      position:fixed; top:12px; right:12px; z-index:90;
      width:240px; pointer-events:none;
      font:700 11px 'Segoe UI',monospace; color:#dff5ff;
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
        <span id="xp-lvl" style="color:#7defc4; text-shadow:0 0 6px #2effb6;">LV 1</span>
        <span id="xp-num" style="opacity:0.7;">0 / 100 XP</span>
      </div>
      <div style="height:6px; background:rgba(0,0,0,0.6); border:1px solid rgba(126,239,196,0.4); border-radius:3px;">
        <div id="xp-fill" style="height:100%; width:0%; background:linear-gradient(90deg,#2effb6,#3aa8ff); transition:width 0.4s;"></div>
      </div>
      <div id="xp-stats" style="margin-top:4px; opacity:0.6; font-size:10px;">
        <span id="xp-wins">0V</span> · <span id="xp-kd">0/0</span>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._lvl = el.querySelector('#xp-lvl');
    this._num = el.querySelector('#xp-num');
    this._fill = el.querySelector('#xp-fill');
    this._wins = el.querySelector('#xp-wins');
    this._kd = el.querySelector('#xp-kd');
  }
  _xpForLevel(lvl) { return Math.pow(lvl - 1, 2) * 100; }
  _setProfile(p) {
    if (!p) return;
    const lvl = p.level || 1;
    const xp = p.xp || 0;
    const cur = this._xpForLevel(lvl);
    const next = this._xpForLevel(lvl + 1);
    const pct = Math.max(0, Math.min(100, ((xp - cur) / (next - cur)) * 100));
    this._lvl.textContent = `LV ${lvl}`;
    this._num.textContent = `${xp - cur} / ${next - cur} XP`;
    this._fill.style.width = pct + '%';
    if (p.wins !== undefined) this._wins.textContent = p.wins + 'V';
    if (p.kills !== undefined && p.deaths !== undefined) this._kd.textContent = `${p.kills}/${p.deaths}`;
  }
  refreshFromState(player) {
    if (!player) return;
    this._setProfile({ xp: player.xp, level: player.level, wins: undefined, kills: player.kills, deaths: player.deaths });
  }
  _onXpGain(amount, reason) {
    const t = document.createElement('div');
    t.textContent = `+${amount} XP`;
    t.style.cssText = `
      position:fixed; top:36px; right:260px; z-index:91;
      color:#2effb6; font:800 14px 'Segoe UI',monospace;
      text-shadow:0 0 8px #2effb6; pointer-events:none;
      animation: xpfloat 1.2s ease-out forwards;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1200);
  }
  _onLevelUp(level) {
    _toast(`⚡ LEVEL UP! LV ${level}`, '#ffd54a');
    // flash full-screen
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed; inset:0; z-index:150;
      background:radial-gradient(circle,rgba(255,213,74,0.35) 0%,rgba(255,213,74,0) 70%);
      pointer-events:none; opacity:0;
      transition:opacity 0.18s;
    `;
    document.body.appendChild(flash);
    requestAnimationFrame(() => { flash.style.opacity = '1'; });
    setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 220); }, 320);
    // sound
    try {
      const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      [880, 1320, 1760].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.value = 0; o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.08;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
        g.gain.linearRampToValueAtTime(0, t0 + 0.35);
        o.start(t0); o.stop(t0 + 0.4);
      });
    } catch (_) {}
  }
}

// ── MATCH STATE BANNER ─────────────────────────────────────────
export class MatchBanner {
  constructor(cs) {
    this.cs = cs;
    this._build();
    cs.on('match_countdown', ({ secs }) => this._countdown(secs));
    cs.on('match_finished', (info) => this._finished(info));
    cs.on('lobby_reset', () => this._lobby());
    cs.on('wave_up', ({ wave }) => _toast(`WAVE ${wave}`, '#3aa8ff'));
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'match-banner';
    el.style.cssText = `
      position:fixed; top:60px; left:50%; transform:translateX(-50%);
      z-index:95; padding:8px 22px;
      background:rgba(0,0,0,0.75); border:1px solid rgba(126,239,196,0.5);
      border-radius:6px; color:#dff5ff;
      font:800 14px 'Segoe UI',monospace; letter-spacing:2px;
      opacity:0; transition:opacity 0.25s; pointer-events:none;
    `;
    el.textContent = 'AGUARDANDO';
    document.body.appendChild(el);
    this._el = el;
  }
  updateFromState(state) {
    if (!state) return;
    const ms = state.match_state;
    if (!ms || ms === 'WAITING') {
      this._el.textContent = 'LOBBY · aguardando host';
      this._el.style.opacity = '0.85';
      this._el.style.borderColor = 'rgba(126,239,196,0.5)';
    } else if (ms === 'COUNTDOWN') {
      const secs = Math.max(0, Math.ceil((state.match_timer - Date.now()) / 1000));
      this._el.textContent = `INICIANDO EM ${secs}s`;
      this._el.style.opacity = '1';
      this._el.style.borderColor = 'rgba(255,213,74,0.7)';
    } else if (ms === 'RUNNING') {
      const left = Math.max(0, Math.ceil((state.match_timer - Date.now()) / 1000));
      const m = Math.floor(left / 60), s = left % 60;
      this._el.textContent = `WAVE ${state.wave || 1} · ${m}:${String(s).padStart(2,'0')} · ${state.mobs_killed || 0} kills`;
      this._el.style.opacity = '1';
      this._el.style.borderColor = 'rgba(126,239,196,0.5)';
    } else if (ms === 'BOSS_WAVE') {
      this._el.textContent = '⚔ BOSS WAVE';
      this._el.style.opacity = '1';
      this._el.style.borderColor = 'rgba(255,90,90,0.7)';
    } else if (ms === 'FINISHED') {
      this._el.style.opacity = '0';
    }
  }
  _countdown(secs) { _toast(`Match em ${secs}s`, '#ffd54a'); }
  _finished({ result, mvp_id }) {
    const me = window._authUserId;
    const won = (result === 'VICTORY');
    const mvp = mvp_id === me;
    this._buildFinishScreen({ won, mvp });
  }
  _lobby() {
    document.getElementById('match-finish-screen')?.remove();
  }
  _buildFinishScreen({ won, mvp }) {
    document.getElementById('match-finish-screen')?.remove();
    const el = document.createElement('div');
    el.id = 'match-finish-screen';
    el.style.cssText = `
      position:fixed; inset:0; z-index:300;
      background:rgba(0,0,0,0.78); display:flex; align-items:center; justify-content:center;
      animation:fadein 0.4s;
    `;
    el.innerHTML = `
      <div style="background:linear-gradient(180deg,#0a1a2a,#040810);
                  border:2px solid ${won?'#2effb6':'#ff5a5a'}; border-radius:10px;
                  padding:42px 60px; text-align:center; color:#dff5ff;
                  font-family:'Segoe UI',monospace; box-shadow:0 0 40px ${won?'#2effb6':'#ff5a5a'};">
        <div style="font-size:42px; font-weight:900; letter-spacing:4px;
                    color:${won?'#2effb6':'#ff5a5a'}; text-shadow:0 0 14px currentColor;">
          ${won ? 'VITÓRIA' : 'DERROTA'}
        </div>
        ${mvp ? '<div style="margin-top:8px; color:#ffd54a; font-weight:800; letter-spacing:2px;">⭐ MVP</div>' : ''}
        <div style="margin-top:18px; opacity:0.8; font-size:12px;">
          ${won ? '+250 XP · +50 moedas' : '+50 XP'}
        </div>
        <div style="margin-top:24px; display:flex; gap:10px; justify-content:center;">
          <button id="finish-again" style="
            background:#2effb6; color:#04101a; border:0; padding:10px 22px;
            font:800 12px 'Segoe UI',monospace; letter-spacing:2px; cursor:pointer;
            border-radius:4px;">JOGAR DE NOVO</button>
          <button id="finish-leave" style="
            background:transparent; color:#dff5ff; border:1px solid rgba(255,255,255,0.3);
            padding:10px 22px; font:700 12px 'Segoe UI',monospace; letter-spacing:2px;
            cursor:pointer; border-radius:4px;">SAIR</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#finish-again').onclick = () => {
      el.remove();
      try { this.cs.sendReady?.(true); } catch (_) {}
    };
    el.querySelector('#finish-leave').onclick = () => {
      el.remove();
      try { this.cs.leave?.(); } catch (_) {}
      try { window.location.reload(); } catch (_) {}
    };
  }
}

// ── BOSS BAR + RemoteBoss mesh ─────────────────────────────────
export class BossHud {
  constructor(scene, cs) {
    this.scene = scene; this.cs = cs;
    this._bossMesh = null;
    this._build();
    cs.on('boss_appeared', ({ name }) => {
      _toast(`⚔ ${name?.toUpperCase()} SURGIU`, '#ff5a5a');
      this._el.style.opacity = '1';
    });
    cs.on('boss_killed', ({ name }) => {
      _toast(`💀 ${name?.toUpperCase()} DERROTADO`, '#ffd54a');
      this._el.style.opacity = '0';
      this._disposeBossMesh();
    });
    cs.on('boss_phase', ({ phase }) => _toast(`BOSS FASE ${phase}!`, '#ff5a5a'));
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'boss-bar';
    el.style.cssText = `
      position:fixed; top:14px; left:50%; transform:translateX(-50%);
      z-index:90; width:520px; max-width:60vw;
      opacity:0; transition:opacity 0.4s; pointer-events:none;
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;
                  color:#ff8a8a; font:800 13px 'Segoe UI',monospace; letter-spacing:2px;
                  text-shadow:0 0 6px #ff5a5a;">
        <span id="boss-name">BOSS</span>
        <span id="boss-num">0 / 0</span>
      </div>
      <div style="height:12px; background:rgba(0,0,0,0.7); border:1px solid #ff5a5a;
                  border-radius:2px; overflow:hidden;">
        <div id="boss-fill" style="height:100%; width:100%;
             background:linear-gradient(90deg,#ff5a5a,#ffd54a); transition:width 0.2s;"></div>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._name = el.querySelector('#boss-name');
    this._num = el.querySelector('#boss-num');
    this._fill = el.querySelector('#boss-fill');
  }
  updateFromState(boss) {
    if (!boss || !boss.id || boss.hp <= 0) {
      this._el.style.opacity = '0';
      this._disposeBossMesh();
      return;
    }
    this._el.style.opacity = '1';
    this._name.textContent = (boss.name || 'BOSS').toUpperCase() + (boss.enraged ? ' · ENFURECIDO' : '');
    this._num.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    this._fill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
    this._syncBossMesh(boss);
  }
  _syncBossMesh(boss) {
    if (!this.scene || typeof BABYLON === 'undefined') return;
    if (!this._bossMesh) {
      const m = BABYLON.MeshBuilder.CreateBox('boss_' + boss.id, { size: 3.0 }, this.scene);
      const mat = new BABYLON.StandardMaterial('bossMat_' + boss.id, this.scene);
      mat.diffuseColor = new BABYLON.Color3(0.95, 0.2, 0.25);
      mat.emissiveColor = new BABYLON.Color3(0.45, 0.05, 0.08);
      m.material = mat;
      m.scaling.y = 2.5;
      this._bossMesh = m;
      // pista que é boss (pra raycast acertar)
      m._bossId = boss.id;
      window._bossMesh = m;
    }
    this._bossMesh.position.set(boss.x || 0, (boss.y || 0) + 2.0, boss.z || 0);
    this._bossMesh.rotation.y = (boss.ry || 0) * Math.PI / 180;
    if (boss.enraged && this._bossMesh.material) {
      this._bossMesh.material.emissiveColor = new BABYLON.Color3(0.9, 0.1, 0.1);
    }
  }
  _disposeBossMesh() {
    if (this._bossMesh) {
      try { this._bossMesh.dispose(); } catch (_) {}
      this._bossMesh = null;
      window._bossMesh = null;
    }
  }
}

// ── QUEST PANEL (Q tecla) ──────────────────────────────────────
export class QuestPanel {
  constructor(cs, supa) {
    this.cs = cs; this.supa = supa;
    this._open = false;
    this._build();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'q' || e.key === 'Q') {
        if (document.activeElement?.tagName === 'INPUT') return;
        this.toggle();
      } else if (e.key === 'Escape' && this._open) this.close();
    });
    cs.on('quest_claimed', () => this.refresh());
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'quest-panel';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:160; width:480px;
      background:linear-gradient(180deg,#0a1a2a,#040810);
      border:1px solid rgba(126,239,196,0.5); border-radius:8px;
      padding:22px; color:#dff5ff; font:600 12px 'Segoe UI',monospace;
      display:none; box-shadow:0 0 30px rgba(0,0,0,0.7);
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
        <span style="font:800 16px 'Segoe UI',monospace; letter-spacing:3px; color:#2effb6;">⚡ MISSÕES DIÁRIAS</span>
        <span id="qp-close" style="cursor:pointer; opacity:0.6;">✕</span>
      </div>
      <div id="qp-list" style="display:flex; flex-direction:column; gap:10px;"></div>
      <div style="margin-top:14px; opacity:0.5; font-size:10px;">Reset diário 00:00 UTC</div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._list = el.querySelector('#qp-list');
    el.querySelector('#qp-close').onclick = () => this.close();
  }
  toggle() { this._open ? this.close() : this.open(); }
  open() { this._open = true; this._el.style.display = 'block'; this.refresh(); }
  close() { this._open = false; this._el.style.display = 'none'; }
  async refresh() {
    if (!this.supa) return;
    try {
      // ensure pra criar quests do dia se não existir
      await this.supa.rpc('transfps_ensure_daily_quests').catch(() => null);
      const { data, error } = await this.supa
        .from('transfps_daily_quests_view')
        .select('*')
        .order('quest_key');
      if (error) {
        // fallback: tabela direta com filtro de today
        const today = new Date().toISOString().slice(0, 10);
        const { data: rows } = await this.supa
          .schema('transfps').from('daily_quests')
          .select('*').eq('day', today);
        this._render(rows || []);
        return;
      }
      this._render(data || []);
    } catch (e) {
      this._list.innerHTML = '<div style="opacity:0.6;">Erro ao carregar missões</div>';
    }
  }
  _render(rows) {
    if (!rows.length) {
      this._list.innerHTML = '<div style="opacity:0.6;">Sem missões hoje.</div>';
      return;
    }
    const LABELS = {
      kill_mob: { txt: 'Matar 25 mobs', icon: '⚔' },
      kill_player: { txt: 'Eliminar 5 jogadores', icon: '🎯' },
      collect_drop: { txt: 'Coletar 10 drops', icon: '💎' },
    };
    this._list.innerHTML = rows.map(r => {
      const meta = LABELS[r.quest_key] || { txt: r.quest_key, icon: '⭐' };
      const pct = Math.min(100, ((r.progress || 0) / (r.target || 1)) * 100);
      const done = (r.progress || 0) >= (r.target || 1);
      const claimed = r.claimed_at;
      return `
        <div style="background:rgba(0,0,0,0.4); padding:10px; border-radius:4px;
                    border:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span><span style="color:#ffd54a;">${meta.icon}</span> ${_esc(meta.txt)}</span>
            <span style="opacity:0.7;">${r.progress || 0} / ${r.target}</span>
          </div>
          <div style="height:5px; background:rgba(0,0,0,0.6); border-radius:2px;">
            <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#2effb6,#3aa8ff); border-radius:2px;"></div>
          </div>
          <div style="margin-top:8px; text-align:right;">
            ${claimed
              ? '<span style="opacity:0.5;">✓ resgatado</span>'
              : done
                ? `<button data-claim="${_esc(r.quest_key)}" style="background:#2effb6; color:#04101a; border:0; padding:5px 14px; font:800 11px monospace; cursor:pointer; border-radius:3px;">RESGATAR +${r.reward_xp || 100} XP</button>`
                : '<span style="opacity:0.5;">em andamento</span>'}
          </div>
        </div>
      `;
    }).join('');
    this._list.querySelectorAll('[data-claim]').forEach(b => {
      b.onclick = () => {
        const k = b.getAttribute('data-claim');
        try { this.cs.sendMessage?.('claim_quest', { quest_key: k }); } catch (_) {}
        b.disabled = true; b.textContent = '…';
      };
    });
  }
}

// ── LEADERBOARD (F1) ───────────────────────────────────────────
export class LeaderboardScreen {
  constructor(supa) {
    this.supa = supa; this._open = false;
    this._build();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'Escape' && this._open) this.close();
    });
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'leaderboard';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:160; width:560px; max-height:80vh;
      background:linear-gradient(180deg,#0a1a2a,#040810);
      border:1px solid rgba(255,213,74,0.5); border-radius:8px;
      padding:22px; color:#dff5ff; font:600 12px 'Segoe UI',monospace;
      display:none; box-shadow:0 0 30px rgba(0,0,0,0.7);
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
        <span style="font:800 16px 'Segoe UI',monospace; letter-spacing:3px; color:#ffd54a;">🏆 LEADERBOARD TOP 100</span>
        <span id="lb-close" style="cursor:pointer; opacity:0.6;">✕</span>
      </div>
      <div id="lb-list" style="max-height:62vh; overflow-y:auto;"></div>
    `;
    document.body.appendChild(el);
    this._el = el; this._list = el.querySelector('#lb-list');
    el.querySelector('#lb-close').onclick = () => this.close();
  }
  toggle() { this._open ? this.close() : this.open(); }
  async open() {
    this._open = true; this._el.style.display = 'block';
    this._list.innerHTML = '<div style="opacity:0.6;">Carregando…</div>';
    if (!this.supa) { this._list.innerHTML = '<div style="opacity:0.6;">Indisponível</div>'; return; }
    const { data, error } = await this.supa.from('transfps_leaderboard').select('*');
    if (error || !data) { this._list.innerHTML = '<div style="opacity:0.6;">Erro</div>'; return; }
    this._list.innerHTML = data.map((r, i) => `
      <div style="display:grid; grid-template-columns:40px 1fr 60px 60px 60px;
                  gap:10px; padding:6px 8px; align-items:center;
                  border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="color:${i<3?'#ffd54a':'#888'}; font-weight:900;">#${i+1}</span>
        <span>${_esc(r.nickname || 'Sem nome')}</span>
        <span style="text-align:right;">LV ${r.level}</span>
        <span style="text-align:right; opacity:0.7;">${r.xp} XP</span>
        <span style="text-align:right; opacity:0.7;">${r.wins||0}V</span>
      </div>
    `).join('');
  }
  close() { this._open = false; this._el.style.display = 'none'; }
}

// ── FRIENDS (F2) ───────────────────────────────────────────────
export class FriendsPanel {
  constructor(supa, cs) {
    this.supa = supa; this.cs = cs; this._open = false;
    this._build();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'Escape' && this._open) this.close();
    });
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'friends-panel';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:160; width:480px;
      background:linear-gradient(180deg,#0a1a2a,#040810);
      border:1px solid rgba(58,168,255,0.5); border-radius:8px;
      padding:22px; color:#dff5ff; font:600 12px 'Segoe UI',monospace;
      display:none; box-shadow:0 0 30px rgba(0,0,0,0.7);
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:14px;">
        <span style="font:800 16px 'Segoe UI',monospace; letter-spacing:3px; color:#3aa8ff;">👥 AMIGOS</span>
        <span id="fp-close" style="cursor:pointer; opacity:0.6;">✕</span>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:12px;">
        <input id="fp-input" placeholder="nick ou id do amigo"
               style="flex:1; padding:7px 10px; background:rgba(0,0,0,0.6);
                      border:1px solid rgba(58,168,255,0.4); color:#fff;
                      border-radius:4px; font:inherit;">
        <button id="fp-send" style="background:#3aa8ff; color:#04101a; border:0;
                                    padding:7px 14px; font:800 11px monospace;
                                    cursor:pointer; border-radius:4px;">ENVIAR</button>
      </div>
      <div id="fp-list"></div>
    `;
    document.body.appendChild(el);
    this._el = el; this._list = el.querySelector('#fp-list');
    el.querySelector('#fp-close').onclick = () => this.close();
    el.querySelector('#fp-send').onclick = () => this._send();
    el.querySelector('#fp-input').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') this._send();
    });
  }
  toggle() { this._open ? this.close() : this.open(); }
  async open() {
    this._open = true; this._el.style.display = 'block'; this.refresh();
  }
  close() { this._open = false; this._el.style.display = 'none'; }
  async _send() {
    const v = this._el.querySelector('#fp-input').value.trim();
    if (!v) return;
    try { await this.supa.rpc('transfps_send_friend_request', { p_to: v }); }
    catch (_) {}
    this._el.querySelector('#fp-input').value = '';
    this.refresh();
  }
  async refresh() {
    if (!this.supa) return;
    this._list.innerHTML = '<div style="opacity:0.6;">Carregando…</div>';
    const { data } = await this.supa.rpc('transfps_list_friends').catch(() => ({ data: [] }));
    const rows = data || [];
    // Atualiza set global pro Scoreboard
    window._friendIds = new Set(rows.filter(r => r.status === 'accepted').map(r => r.user_id));
    if (!rows.length) { this._list.innerHTML = '<div style="opacity:0.5;">Nenhum amigo ainda.</div>'; return; }
    this._list.innerHTML = rows.map(r => {
      const isReq = r.status === 'pending' && r.is_incoming;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:7px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">
          <span><span style="color:${r.online?'#2effb6':'#666'};">●</span> ${_esc(r.nickname)}</span>
          <span>
            ${isReq
              ? `<button data-accept="${_esc(r.user_id)}" style="background:#2effb6; color:#04101a; border:0; padding:4px 10px; font:800 10px monospace; cursor:pointer; border-radius:3px; margin-right:4px;">ACEITAR</button>
                 <button data-decline="${_esc(r.user_id)}" style="background:transparent; color:#ff5a5a; border:1px solid #ff5a5a; padding:4px 10px; font:800 10px monospace; cursor:pointer; border-radius:3px;">RECUSAR</button>`
              : r.status === 'pending'
                ? '<span style="opacity:0.5;">aguardando</span>'
                : `<button data-invite="${_esc(r.user_id)}" style="background:transparent; color:#3aa8ff; border:1px solid #3aa8ff; padding:4px 10px; font:800 10px monospace; cursor:pointer; border-radius:3px;">CONVIDAR</button>`}
          </span>
        </div>
      `;
    }).join('');
    this._list.querySelectorAll('[data-accept]').forEach(b => {
      b.onclick = async () => { await this.supa.rpc('transfps_accept_friend', { p_from: b.getAttribute('data-accept') }); this.refresh(); };
    });
    this._list.querySelectorAll('[data-decline]').forEach(b => {
      b.onclick = async () => { await this.supa.rpc('transfps_decline_friend', { p_from: b.getAttribute('data-decline') }); this.refresh(); };
    });
    this._list.querySelectorAll('[data-invite]').forEach(b => {
      b.onclick = () => {
        try { this.cs.sendMessage?.('party_invite', { target_id: b.getAttribute('data-invite') }); } catch (_) {}
        _toast('Convite enviado', '#3aa8ff');
      };
    });
  }
}

// ── PARTY HUD (canto inferior esquerdo) ───────────────────────
export class PartyHud {
  constructor(cs, auth) {
    this.cs = cs; this.auth = auth;
    this._build();
    cs.on('party_invite', ({ from_id, from_nick }) => this._invite(from_id, from_nick));
    cs.on('party_joined', () => _toast('Você entrou na party', '#9a7eff'));
    cs.on('party_left', () => _toast('Saiu da party', '#888'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F3') { e.preventDefault(); this._toggleLeave(); }
    });
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'party-hud';
    el.style.cssText = `
      position:fixed; bottom:200px; left:16px; z-index:90;
      pointer-events:none; opacity:0; transition:opacity 0.3s;
      font:700 11px 'Segoe UI',monospace; color:#dff5ff;
    `;
    el.innerHTML = `
      <div style="background:rgba(0,0,0,0.7); border:1px solid #9a7eff;
                  border-radius:5px; padding:6px 10px;">
        <div style="color:#9a7eff; letter-spacing:2px; margin-bottom:4px;">★ PARTY</div>
        <div id="party-list"></div>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el; this._list = el.querySelector('#party-list');
  }
  updateFromState(state, myId) {
    if (!state?.players) return;
    const me = state.players.get(myId);
    const partyId = me?.party_id;
    // Marca/desmarca party em todos os RemotePlayers
    if (window._remotePlayers) {
      window._remotePlayers.forEach((rp, id) => {
        if (!partyId) { rp.setInMyParty?.(false); return; }
        const p = state.players.get(id);
        rp.setInMyParty?.(!!p && p.party_id === partyId);
      });
    }
    if (!partyId) { this._el.style.opacity = '0'; return; }
    const members = [];
    state.players.forEach(p => { if (p.party_id === partyId) members.push(p); });
    if (members.length < 2) { this._el.style.opacity = '0'; return; }
    this._el.style.opacity = '1';
    this._list.innerHTML = members.map(p => `
      <div style="display:flex; justify-content:space-between; gap:14px;">
        <span>${_esc(p.nickname || '...')}</span>
        <span style="color:#2effb6;">${Math.ceil(p.hp||0)}/${p.maxHp||100}</span>
      </div>
    `).join('');
  }
  _invite(fromId, fromNick) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; top:200px; right:16px; z-index:200;
      background:rgba(0,0,0,0.9); border:2px solid #9a7eff;
      border-radius:6px; padding:14px 18px; color:#dff5ff;
      font:700 12px 'Segoe UI',monospace; box-shadow:0 0 14px #9a7eff;
    `;
    el.innerHTML = `
      <div style="margin-bottom:8px; color:#9a7eff;">★ CONVITE DE PARTY</div>
      <div style="margin-bottom:10px;">${_esc(fromNick || fromId)} te convidou</div>
      <div style="display:flex; gap:6px;">
        <button id="pi-ok" style="background:#9a7eff; color:#04101a; border:0; padding:6px 14px; font:800 11px monospace; cursor:pointer; border-radius:3px;">ACEITAR</button>
        <button id="pi-no" style="background:transparent; color:#fff; border:1px solid #555; padding:6px 14px; font:800 11px monospace; cursor:pointer; border-radius:3px;">RECUSAR</button>
      </div>
    `;
    document.body.appendChild(el);
    const dismiss = () => el.remove();
    el.querySelector('#pi-ok').onclick = () => { try { this.cs.sendMessage?.('party_accept', { from_id: fromId }); } catch (_) {} dismiss(); };
    el.querySelector('#pi-no').onclick = dismiss;
    setTimeout(dismiss, 15000);
  }
  _toggleLeave() {
    try { this.cs.sendMessage?.('party_leave', {}); } catch (_) {}
  }
}

// ── TUTORIAL (1x) ──────────────────────────────────────────────
export class Tutorial {
  constructor(supa, auth) {
    this.supa = supa; this.auth = auth;
  }
  async maybeStart(profile) {
    if (!profile || profile.tutorial_completed) return;
    if (localStorage.getItem('transfps_tutorial_done')) return;
    this._show();
  }
  _show() {
    const steps = [
      { t: 'BEM-VINDO AO TRANSFPS', d: 'WASD = andar · Espaço = pular · Shift = correr', dur: 7000 },
      { t: 'COMBATE', d: 'Clique = atacar · E = trocar arma · 1-7 = skills', dur: 7000 },
      { t: 'PROGRESSÃO', d: 'Matar mobs/jogadores ganha XP · Q = missões diárias', dur: 7000 },
      { t: 'SOCIAL', d: 'TAB = scoreboard · F1 = leaderboard · F2 = amigos · T = chat', dur: 8000 },
      { t: 'OBJETIVO', d: 'Sobreviver até o BOSS surgir e derrotá-lo!', dur: 8000 },
    ];
    let i = 0;
    const el = document.createElement('div');
    el.id = 'tutorial-overlay';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:250; background:rgba(0,0,0,0.85);
      border:2px solid #2effb6; border-radius:8px;
      padding:30px 50px; text-align:center; color:#dff5ff;
      font:700 14px 'Segoe UI',monospace;
      box-shadow:0 0 30px #2effb6;
    `;
    document.body.appendChild(el);
    const render = () => {
      const s = steps[i];
      el.innerHTML = `
        <div style="color:#2effb6; font:900 18px monospace; letter-spacing:3px; margin-bottom:14px;">
          ${s.t}
        </div>
        <div style="margin-bottom:18px;">${s.d}</div>
        <div style="display:flex; gap:6px; justify-content:center; margin-bottom:6px;">
          ${steps.map((_, j) => `<span style="width:8px; height:8px; border-radius:50%; background:${j<=i?'#2effb6':'#444'};"></span>`).join('')}
        </div>
        <div style="opacity:0.5; font-size:10px; margin-top:8px;">Pressione qualquer tecla pra continuar · ESC pra pular</div>
      `;
    };
    render();
    const onKey = (e) => {
      if (e.key === 'Escape') { i = steps.length - 1; }
      i++;
      if (i >= steps.length) {
        document.removeEventListener('keydown', onKey);
        el.remove();
        localStorage.setItem('transfps_tutorial_done', '1');
        try { this.supa?.rpc('transfps_set_tutorial_completed').catch(()=>null); } catch (_) {}
        return;
      }
      render();
    };
    setTimeout(() => document.addEventListener('keydown', onKey), 400);
    // auto-advance se ninguém apertar
    const auto = setInterval(() => {
      i++;
      if (i >= steps.length) {
        clearInterval(auto);
        document.removeEventListener('keydown', onKey);
        el.remove();
        localStorage.setItem('transfps_tutorial_done', '1');
        try { this.supa?.rpc('transfps_set_tutorial_completed').catch(()=>null); } catch (_) {}
        return;
      }
      render();
    }, 8000);
  }
}

// ── ROOT: instancia tudo ──────────────────────────────────────
export function attachTransfpsSocial({ cs, scene, auth, supa }) {
  if (!window._friendIds) window._friendIds = new Set();
  const xp = new XpHud(cs, auth);
  const banner = new MatchBanner(cs);
  const boss = new BossHud(scene, cs);
  const quests = new QuestPanel(cs, supa);
  const leaderboard = new LeaderboardScreen(supa);
  const friends = new FriendsPanel(supa, cs);
  // Refresh background pra alimentar Scoreboard com friend-ids
  if (supa) {
    setTimeout(() => { try { friends.refresh(); } catch (_) {} }, 2000);
    setInterval(() => { try { friends.refresh(); } catch (_) {} }, 60000);
  }
  const party = new PartyHud(cs, auth);
  const tutorial = new Tutorial(supa, auth);

  // CSS animations once
  if (!document.getElementById('transfps-social-css')) {
    const s = document.createElement('style');
    s.id = 'transfps-social-css';
    s.textContent = `
      @keyframes xpfloat { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-30px); } }
      @keyframes fadein { from { opacity:0; } to { opacity:1; } }
    `;
    document.head.appendChild(s);
  }

  // Update loop hookable
  const update = (myId) => {
    const st = cs.state;
    if (!st) return;
    banner.updateFromState(st);
    boss.updateFromState(st.boss);
    party.updateFromState(st, myId);
    const me = st.players?.get(myId);
    if (me) xp.refreshFromState(me);
  };

  return { xp, banner, boss, quests, leaderboard, friends, party, tutorial, update };
}
