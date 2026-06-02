// ─────────────────────────────────────────────────────────────────
//  RemotePlayer — representação visual de outros players na sala
//
//  Mesh capsule colorida + nameplate flutuante (HTML overlay).
//  Snapshot vem do MultiplayerClient → interpolação suave por dt.
// ─────────────────────────────────────────────────────────────────

const COLORS = [
  [1.0, 0.45, 0.30], [0.30, 0.85, 1.0], [0.95, 0.75, 0.25],
  [0.70, 0.45, 0.95], [0.45, 0.90, 0.50], [1.0, 0.55, 0.75],
  [0.30, 0.55, 1.0], [0.95, 0.35, 0.35],
];

function _colorFor(playerId) {
  let h = 0; for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export class RemotePlayer {
  constructor(scene, info) {
    this.scene = scene;
    this.playerId = info.player_id;
    this.nickname = info.nickname || 'Player';
    this.hp = 100;

    const [r, g, b] = _colorFor(this.playerId);

    // Capsule body
    this.root = new BABYLON.TransformNode(`remote_${this.playerId}`, scene);
    this.body = BABYLON.MeshBuilder.CreateCapsule(`remote_body_${this.playerId}`, {
      radius: 0.35, height: 1.8, tessellation: 12,
    }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.9;
    const mat = new BABYLON.StandardMaterial(`remote_mat_${this.playerId}`, scene);
    mat.diffuseColor = new BABYLON.Color3(r, g, b);
    mat.emissiveColor = new BABYLON.Color3(r * 0.35, g * 0.35, b * 0.35);
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    this.body.material = mat;

    // Eye/forward indicator
    this.eye = BABYLON.MeshBuilder.CreateBox(`remote_eye_${this.playerId}`, {
      width: 0.10, height: 0.10, depth: 0.30,
    }, scene);
    this.eye.parent = this.root;
    this.eye.position.set(0, 1.5, 0.30);
    const eyeMat = new BABYLON.StandardMaterial(`remote_eyemat_${this.playerId}`, scene);
    eyeMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
    eyeMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.4);
    this.eye.material = eyeMat;

    // Marca pra hit detection MP funcionar
    this.body._isRemotePlayer = true;
    this.body._remoteRef = this;

    // Nameplate (HTML overlay) com avatar + nickname + HP bar
    const colorRgb = `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
    this._nameEl = document.createElement('div');
    this._nameEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 80;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      transform: translate(-50%, -100%);
    `;
    this._nameEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:5px;
                  background:rgba(0,0,0,0.72); padding:2px 7px 2px 3px;
                  border:1px solid ${colorRgb}; border-radius:10px;
                  font:700 11px 'Segoe UI',monospace; color:${colorRgb};
                  text-shadow:0 1px 2px rgba(0,0,0,0.9); letter-spacing:0.5px;">
        <img class="rp-avatar" src="" style="width:16px;height:16px;border-radius:50%;display:none;border:1px solid ${colorRgb};" />
        <span class="rp-name">${this._esc(this.nickname)}</span>
      </div>
      <div style="width:60px;height:4px;background:rgba(0,0,0,0.6);border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,0.7);">
        <div class="rp-hp" style="height:100%;width:100%;background:linear-gradient(90deg,#22dd44,#66ff88);transition:width 0.15s;"></div>
      </div>
    `;
    document.body.appendChild(this._nameEl);
    this._avatarEl = this._nameEl.querySelector('.rp-avatar');
    this._nameTextEl = this._nameEl.querySelector('.rp-name');
    this._hpEl = this._nameEl.querySelector('.rp-hp');
    if (info.avatar_url) this.setAvatar(info.avatar_url);

    // ── Buffer de snapshots (técnica Source/Quake) ──
    //  Render-lag de 100ms: sempre interpola entre snapshot[t-100ms] e [t].
    //  Bem mais suave que lerp simples sob latência variável.
    this._snapshots = [];          // [{ t, x, y, z, ry }, ...] máx 8
    this.RENDER_LAG_MS = 100;
    this._current = { x: 0, y: 0, z: 0, ry: 0 };
    if (info.x != null) {
      this._current.x = info.x; this._current.y = info.y; this._current.z = info.z;
      this._current.ry = info.ry || 0;
      this.applySnapshot(info);
    }
  }

  applySnapshot(snap) {
    if (snap.nickname) this.setNickname(snap.nickname);
    if (snap.avatar_url && !this._avatarSet) {
      this.setAvatar(snap.avatar_url);
      this._avatarSet = true;
    }
    if (snap.x == null) return;
    // Empurra na buffer; descarta antigos
    this._snapshots.push({
      t: performance.now(),
      x: snap.x, y: snap.y, z: snap.z, ry: snap.ry || 0,
    });
    while (this._snapshots.length > 8) this._snapshots.shift();
  }

  _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  setNickname(name) {
    if (name === this.nickname) return;
    this.nickname = name;
    if (this._nameTextEl) this._nameTextEl.textContent = name;
  }

  setAvatar(url) {
    if (!this._avatarEl || !url) return;
    this._avatarEl.src = url;
    this._avatarEl.style.display = 'block';
  }

  setHp(hp, maxHp = 100) {
    this.hp = hp;
    if (this._hpEl) {
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      this._hpEl.style.width = pct + '%';
      if (pct < 30) this._hpEl.style.background = 'linear-gradient(90deg,#dd2222,#ff5555)';
      else if (pct < 60) this._hpEl.style.background = 'linear-gradient(90deg,#dd8822,#ffaa33)';
      else this._hpEl.style.background = 'linear-gradient(90deg,#22dd44,#66ff88)';
    }
  }

  update(dt, camera) {
    // ── Render-lag interpolation ──
    //  Busca os 2 snapshots que cercam (now - RENDER_LAG_MS).
    //  Interpola entre eles por tempo. Se faltar buffer, mantém último.
    const renderT = performance.now() - this.RENDER_LAG_MS;
    let target = null;
    if (this._snapshots.length >= 2) {
      // Acha par [a, b] onde a.t <= renderT <= b.t
      let a = null, b = null;
      for (let i = this._snapshots.length - 1; i >= 0; i--) {
        if (this._snapshots[i].t <= renderT) {
          a = this._snapshots[i];
          b = this._snapshots[i + 1] || a;
          break;
        }
      }
      if (a && b && b.t > a.t) {
        const f = Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
        let dy = b.ry - a.ry;
        while (dy > 180) dy -= 360;
        while (dy < -180) dy += 360;
        target = {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
          ry: a.ry + dy * f,
        };
      } else if (this._snapshots.length) {
        target = this._snapshots[this._snapshots.length - 1];
      }
    } else if (this._snapshots.length === 1) {
      target = this._snapshots[0];
    }

    if (target) {
      // Pequeno smoothing pra suavizar saltos quando o buffer afina
      const k = Math.min(1, dt * 18);
      this._current.x += (target.x - this._current.x) * k;
      this._current.y += (target.y - this._current.y) * k;
      this._current.z += (target.z - this._current.z) * k;
      let dy = target.ry - this._current.ry;
      while (dy > 180) dy -= 360;
      while (dy < -180) dy += 360;
      this._current.ry += dy * k;
    }

    this.root.position.set(this._current.x, this._current.y, this._current.z);
    this.root.rotation.y = BABYLON.Tools.ToRadians(this._current.ry);

    // Posiciona nameplate em screen-space
    if (camera) {
      const wpos = new BABYLON.Vector3(
        this._current.x, this._current.y + 2.1, this._current.z
      );
      const engine = this.scene.getEngine();
      const screen = BABYLON.Vector3.Project(
        wpos,
        BABYLON.Matrix.Identity(),
        this.scene.getTransformMatrix(),
        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      );
      // z < 0 = atrás da câmera
      if (screen.z > 0 && screen.z < 1) {
        this._nameEl.style.display = 'block';
        this._nameEl.style.left = screen.x + 'px';
        this._nameEl.style.top  = screen.y + 'px';
      } else {
        this._nameEl.style.display = 'none';
      }
    }
  }

  dispose() {
    try { this.body.dispose(); } catch (_) {}
    try { this.eye.dispose(); } catch (_) {}
    try { this.root.dispose(); } catch (_) {}
    if (this._nameEl?.parentElement) this._nameEl.parentElement.removeChild(this._nameEl);
  }
}
