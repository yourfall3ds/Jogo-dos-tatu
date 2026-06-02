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

    // Nameplate (HTML overlay)
    this._nameEl = document.createElement('div');
    this._nameEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 80;
      background: rgba(0,0,0,0.65); color: rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0});
      padding: 2px 8px; border-radius: 4px;
      font: 700 11px 'Segoe UI', monospace;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9);
      transform: translate(-50%, -100%); white-space: nowrap;
      border: 1px solid rgba(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0}, 0.5);
      letter-spacing: 0.5px;
    `;
    this._nameEl.textContent = this.nickname;
    document.body.appendChild(this._nameEl);

    // Snapshot atual + alvo (pra interpolação)
    this._target = { x: 0, y: 0, z: 0, ry: 0 };
    this._current = { x: 0, y: 0, z: 0, ry: 0 };
    if (info.x != null) this.applySnapshot(info);
  }

  applySnapshot(snap) {
    this._target.x = snap.x || 0;
    this._target.y = snap.y || 0;
    this._target.z = snap.z || 0;
    this._target.ry = snap.ry || 0;
    if (snap.nickname) this.setNickname(snap.nickname);
  }

  setNickname(name) {
    if (name === this.nickname) return;
    this.nickname = name;
    this._nameEl.textContent = name;
  }

  update(dt, camera) {
    // Lerp suave (10Hz snap incoming → 60Hz render)
    const k = Math.min(1, dt * 12);
    this._current.x += (this._target.x - this._current.x) * k;
    this._current.y += (this._target.y - this._current.y) * k;
    this._current.z += (this._target.z - this._current.z) * k;
    let dy = this._target.ry - this._current.ry;
    while (dy > 180) dy -= 360;
    while (dy < -180) dy += 360;
    this._current.ry += dy * k;

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
