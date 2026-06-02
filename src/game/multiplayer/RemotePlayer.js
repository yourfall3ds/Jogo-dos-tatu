// ─────────────────────────────────────────────────────────────────
//  RemotePlayer — representação visual de outro player da sala.
//
//  Recebe um Schema state do Colyseus (PlayerState) e renderiza:
//   - Capsule colorida (cor estável por player id)
//   - Nameplate HTML com avatar + barra HP
//   - Aura vermelha (ParticleSystem) quando pvp_on
//   - Pisca vermelho quando HP < 30% (animação CSS)
//
//  Posição vem do schema (state.x/y/z/ry); interpolação client-side.
// ─────────────────────────────────────────────────────────────────

const COLORS = [
  [1.0, 0.45, 0.30], [0.30, 0.85, 1.0], [0.95, 0.75, 0.25],
  [0.70, 0.45, 0.95], [0.45, 0.90, 0.50], [1.0, 0.55, 0.75],
  [0.30, 0.55, 1.0], [0.95, 0.35, 0.35],
];

function _colorFor(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class RemotePlayer {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.playerId = state.id;
    this.nickname = state.nickname || 'Player';

    const [r, g, b] = _colorFor(this.playerId);
    const rgb255 = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;
    this._rgb = { r, g, b, rgb255 };

    this.root = new BABYLON.TransformNode(`remote_${this.playerId}`, scene);
    this.body = BABYLON.MeshBuilder.CreateCapsule(`remote_body_${this.playerId}`,
      { radius: 0.35, height: 1.8, tessellation: 12 }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.9;
    const mat = new BABYLON.StandardMaterial(`remote_mat_${this.playerId}`, scene);
    mat.diffuseColor = new BABYLON.Color3(r, g, b);
    mat.emissiveColor = new BABYLON.Color3(r * 0.35, g * 0.35, b * 0.35);
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    this.body.material = mat;
    this._bodyMat = mat;

    this.eye = BABYLON.MeshBuilder.CreateBox(`remote_eye_${this.playerId}`,
      { width: 0.10, height: 0.10, depth: 0.30 }, scene);
    this.eye.parent = this.root;
    this.eye.position.set(0, 1.5, 0.30);
    const em = new BABYLON.StandardMaterial(`remote_eyem_${this.playerId}`, scene);
    em.diffuseColor = new BABYLON.Color3(1, 1, 1);
    em.emissiveColor = new BABYLON.Color3(1, 0.9, 0.4);
    this.eye.material = em;

    this.body._isRemotePlayer = true;
    this.body._remoteRef = this;

    // ── Aura vermelha (PVP) ──
    this.aura = null;
    this._auraOn = false;
    this._buildAura();

    // ── Nameplate ──
    this._nameEl = document.createElement('div');
    this._nameEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 80;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      transform: translate(-50%, -100%);
    `;
    this._nameEl.innerHTML = `
      <div class="rp-namebox" style="display:flex;align-items:center;gap:5px;
                  background:rgba(0,0,0,0.72);padding:2px 7px 2px 3px;
                  border:1px solid ${rgb255};border-radius:10px;
                  font:700 11px 'Segoe UI',monospace;color:${rgb255};
                  text-shadow:0 1px 2px rgba(0,0,0,0.9);letter-spacing:0.5px;
                  transition: border-color 0.2s, box-shadow 0.2s;">
        <img class="rp-avatar" src="" style="width:16px;height:16px;border-radius:50%;display:none;border:1px solid ${rgb255};"/>
        <span class="rp-name">${_esc(this.nickname)}</span>
        <span class="rp-pvp" style="display:none;color:#ff4040;font-weight:900;letter-spacing:0;">⚔</span>
      </div>
      <div style="width:60px;height:5px;background:rgba(0,0,0,0.65);border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,0.7);">
        <div class="rp-hp" style="height:100%;width:100%;background:linear-gradient(90deg,#22dd44,#66ff88);transition:width 0.15s;"></div>
      </div>
    `;
    document.body.appendChild(this._nameEl);
    this._nameBox = this._nameEl.querySelector('.rp-namebox');
    this._avatarEl = this._nameEl.querySelector('.rp-avatar');
    this._nameTextEl = this._nameEl.querySelector('.rp-name');
    this._hpEl = this._nameEl.querySelector('.rp-hp');
    this._pvpEl = this._nameEl.querySelector('.rp-pvp');

    if (state.avatar_url) this._setAvatar(state.avatar_url);

    // Interpolação buffer (anti-borrachudo)
    this._snapshots = [];
    this.RENDER_LAG_MS = 100;
    this._current = { x: state.x || 0, y: state.y || 0, z: state.z || 0, ry: state.ry || 0 };
    this.root.position.set(this._current.x, this._current.y, this._current.z);

    // Bind listeners do schema
    this._bindStateListeners();
    this._applyHp(state.hp ?? 100, state.maxHp ?? 100);
    this._applyPvp(state.pvp_on === true);
    this._applyDead(state.dead === true);
  }

  _bindStateListeners() {
    // listeners agora são attachados pelo ColyseusClient via getStateCallbacks
    // (player_change events). Aqui só inicializa o estado atual.
    this._pushSnapshot();
  }

  /** Chamado pelo ColyseusClient quando um campo do schema muda. */
  onSchemaChange(field) {
    const s = this.state;
    switch (field) {
      case 'pos':
      case 'ry':
        this._pushSnapshot();
        break;
      case 'hp':
        this._applyHp(s.hp, s.maxHp || 100);
        break;
      case 'pvp_on':
        this._applyPvp(s.pvp_on === true);
        break;
      case 'dead':
        this._applyDead(s.dead === true);
        break;
      case 'weapon':
        // (opcional: trocar viewmodel — placeholder por enquanto)
        break;
    }
  }

  _pushSnapshot() {
    this._snapshots.push({
      t: performance.now(),
      x: this.state.x || 0, y: this.state.y || 0, z: this.state.z || 0,
      ry: this.state.ry || 0,
    });
    while (this._snapshots.length > 8) this._snapshots.shift();
  }

  _setNickname(name) {
    if (!name) return;
    this.nickname = name;
    if (this._nameTextEl) this._nameTextEl.textContent = name;
  }

  _setAvatar(url) {
    if (!this._avatarEl || !url) return;
    this._avatarEl.src = url;
    this._avatarEl.style.display = 'block';
  }

  _applyHp(hp, maxHp) {
    this.hp = hp; this.maxHp = maxHp;
    if (!this._hpEl) return;
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    this._hpEl.style.width = pct + '%';
    if (pct < 30) this._hpEl.style.background = 'linear-gradient(90deg,#dd2222,#ff5555)';
    else if (pct < 60) this._hpEl.style.background = 'linear-gradient(90deg,#dd8822,#ffaa33)';
    else this._hpEl.style.background = 'linear-gradient(90deg,#22dd44,#66ff88)';

    // Piscar vermelho quando morrendo (HP < 30%)
    if (pct < 30 && hp > 0) {
      this._nameBox?.classList.add('rp-dying');
      this._nameBox.style.animation = 'rpDying 0.6s ease-in-out infinite';
    } else {
      this._nameBox?.classList.remove('rp-dying');
      this._nameBox.style.animation = '';
    }
  }

  _applyPvp(on) {
    if (this._auraOn === on) return;
    this._auraOn = on;
    if (this._pvpEl) this._pvpEl.style.display = on ? 'inline' : 'none';
    if (this._nameBox) {
      if (on) {
        this._nameBox.style.borderColor = '#ff4040';
        this._nameBox.style.boxShadow = '0 0 8px rgba(255,64,64,0.6)';
      } else {
        this._nameBox.style.borderColor = this._rgb.rgb255;
        this._nameBox.style.boxShadow = '';
      }
    }
    if (this.aura) {
      if (on) this.aura.start(); else this.aura.stop();
    }
    // Emissive da cápsula fica vermelho quando PVP on
    if (this._bodyMat) {
      if (on) this._bodyMat.emissiveColor = new BABYLON.Color3(0.50, 0.05, 0.05);
      else this._bodyMat.emissiveColor = new BABYLON.Color3(this._rgb.r * 0.35, this._rgb.g * 0.35, this._rgb.b * 0.35);
    }
  }

  _applyDead(dead) {
    if (dead) {
      try { this.body.rotation.x = -Math.PI / 2; this.body.position.y = 0.4; } catch (_) {}
    } else {
      try { this.body.rotation.x = 0; this.body.position.y = 0.9; } catch (_) {}
    }
  }

  _buildAura() {
    // ParticleSystem 3D em volta da cápsula — esfumaçada vermelha
    const ps = new BABYLON.ParticleSystem(`aura_${this.playerId}`, 80, this.scene);
    if (!RemotePlayer._auraTex) {
      const tex = new BABYLON.DynamicTexture('auraTex', { width: 32, height: 32 }, this.scene, false);
      const ctx = tex.getContext();
      const grd = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,80,40,0.95)');
      grd.addColorStop(0.5, 'rgba(220,30,20,0.55)');
      grd.addColorStop(1, 'rgba(80,0,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 32, 32);
      tex.update(); tex.hasAlpha = true;
      RemotePlayer._auraTex = tex;
    }
    ps.particleTexture = RemotePlayer._auraTex;
    ps.emitter = this.root;
    ps.minEmitBox = new BABYLON.Vector3(-0.45, 0.0, -0.45);
    ps.maxEmitBox = new BABYLON.Vector3( 0.45, 1.7,  0.45);
    ps.color1 = new BABYLON.Color4(1.0, 0.30, 0.10, 0.85);
    ps.color2 = new BABYLON.Color4(0.75, 0.05, 0.05, 0.95);
    ps.colorDead = new BABYLON.Color4(0.2, 0.0, 0.0, 0);
    ps.minSize = 0.18; ps.maxSize = 0.40;
    ps.minLifeTime = 0.45; ps.maxLifeTime = 0.85;
    ps.emitRate = 60;
    ps.gravity = new BABYLON.Vector3(0, 1.6, 0); // sobe (efervescente)
    ps.direction1 = new BABYLON.Vector3(-0.4, 0.6, -0.4);
    ps.direction2 = new BABYLON.Vector3( 0.4, 1.2,  0.4);
    ps.minAngularSpeed = -Math.PI; ps.maxAngularSpeed = Math.PI;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this.aura = ps;
  }

  update(dt, camera) {
    // Buffer interpolation (anti-borrachudo)
    const renderT = performance.now() - this.RENDER_LAG_MS;
    let target = null;
    if (this._snapshots.length >= 2) {
      let a = null, b = null;
      for (let i = this._snapshots.length - 1; i >= 0; i--) {
        if (this._snapshots[i].t <= renderT) {
          a = this._snapshots[i]; b = this._snapshots[i + 1] || a; break;
        }
      }
      if (a && b && b.t > a.t) {
        const f = Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
        let dy = b.ry - a.ry;
        while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        target = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, ry: a.ry + dy * f };
      } else { target = this._snapshots[this._snapshots.length - 1]; }
    } else if (this._snapshots.length === 1) {
      target = this._snapshots[0];
    }
    if (target) {
      const k = Math.min(1, dt * 18);
      this._current.x += (target.x - this._current.x) * k;
      this._current.y += (target.y - this._current.y) * k;
      this._current.z += (target.z - this._current.z) * k;
      let dy = target.ry - this._current.ry;
      while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
      this._current.ry += dy * k;
    }
    this.root.position.set(this._current.x, this._current.y, this._current.z);
    this.root.rotation.y = BABYLON.Tools.ToRadians(this._current.ry);

    // Nameplate em screen-space
    if (camera) {
      const wpos = new BABYLON.Vector3(this._current.x, this._current.y + 2.2, this._current.z);
      const eng = this.scene.getEngine();
      const sc = BABYLON.Vector3.Project(wpos, BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(),
        camera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
      if (sc.z > 0 && sc.z < 1) {
        this._nameEl.style.display = 'flex';
        this._nameEl.style.left = sc.x + 'px';
        this._nameEl.style.top = sc.y + 'px';
      } else this._nameEl.style.display = 'none';
    }
  }

  dispose() {
    try { this.body.dispose(); } catch (_) {}
    try { this.eye.dispose(); } catch (_) {}
    try { this.aura?.dispose(); } catch (_) {}
    try { this.root.dispose(); } catch (_) {}
    if (this._nameEl?.parentElement) this._nameEl.parentElement.removeChild(this._nameEl);
  }
}

// Animação CSS de piscar vermelho (injeta uma vez global)
if (typeof document !== 'undefined' && !document.getElementById('rp-style')) {
  const s = document.createElement('style');
  s.id = 'rp-style';
  s.textContent = `
    @keyframes rpDying {
      0%,100% { box-shadow: 0 0 4px rgba(255,40,40,0.4); border-color: #ff5050; }
      50%     { box-shadow: 0 0 18px rgba(255,40,40,1); border-color: #ff8080; }
    }
  `;
  document.head.appendChild(s);
}
