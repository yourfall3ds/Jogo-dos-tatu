// ─────────────────────────────────────────────────────────────────
//  DeathCam — câmera cinematográfica orbitando o matador 3s,
//  depois 2s de killcam replay (5s buffer ring).
//
//  Ativada quando state.players[me].dead === true.
//  Restaura câmera FPS/TPS quando respawn dispara.
// ─────────────────────────────────────────────────────────────────

export class DeathCam {
  constructor(scene, cs, auth, player) {
    this.scene = scene;
    this.cs = cs;
    this.auth = auth;
    this.player = player;
    this._active = false;
    this._cinematicCam = null;
    this._savedCamera = null;
    this._mode = 'orbit'; // 'orbit' | 'killcam'
    this._modeStartAt = 0;
    this._targetMesh = null;
    this._orbitAngle = 0;

    // Ring buffer pra killcam — guarda últimos 5s de snapshots do player local
    this.BUFFER_MS = 5000;
    this._buffer = []; // { t, x, y, z, ry }
    this._killcamT = 0;
    this._killcamSpeed = 1.0;
  }

  /** Push snapshot do player local — chamado a cada frame. */
  push(player) {
    if (!player?.mesh) return;
    const now = performance.now();
    this._buffer.push({
      t: now,
      x: player.mesh.position.x,
      y: player.mesh.position.y,
      z: player.mesh.position.z,
      ry: player.yaw || 0,
    });
    // Limpa entradas velhas
    const cutoff = now - this.BUFFER_MS;
    while (this._buffer.length > 0 && this._buffer[0].t < cutoff) this._buffer.shift();
  }

  /** Ativada quando state.dead = true. */
  enter(killerId) {
    if (this._active) return;
    this._active = true;
    this._modeStartAt = performance.now();
    this._mode = 'orbit';
    this._orbitAngle = 0;
    this._killcamT = 0;

    // Acha mesh do matador (RemotePlayer ou RemoteMob)
    if (killerId) {
      const rp = window._remotePlayers?.get(killerId);
      const rm = window._remoteMobs?.get(killerId);
      this._targetMesh = rp?.root || rm?.root || null;
    }
    if (!this._targetMesh) {
      // Sem matador conhecido, orbita o próprio corpo
      this._targetMesh = this.player?.mesh || null;
    }

    // Salva câmera FPS/TPS e cria câmera cinematográfica isolada
    this._savedCamera = this.scene.activeCamera;
    this._cinematicCam = new BABYLON.FreeCamera('deathCam',
      new BABYLON.Vector3(0, 4, -8), this.scene);
    this._cinematicCam.fov = 1.2;
    this.scene.activeCamera = this._cinematicCam;
    this._cinematicCam.detachControl?.();

    // Banner UI
    this._buildBanner();
  }

  _buildBanner() {
    if (this._banner) return;
    const el = document.createElement('div');
    el.id = 'deathcam-banner';
    el.style.cssText = `
      position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
      z-index: 97; pointer-events: none;
      background: rgba(0,0,0,0.78); border: 1px solid rgba(255,90,90,0.5);
      border-radius: 8px; padding: 8px 16px;
      color: #fff; font: 700 13px 'Segoe UI', monospace;
      letter-spacing: 2px; text-shadow: 0 1px 4px black;
      opacity: 0; transition: opacity 0.25s;
    `;
    el.innerHTML = `<span id="dcb-mode" style="color:#ff8a8a;">🎬 DEATHCAM</span>`;
    document.body.appendChild(el);
    this._banner = el;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  }

  _setBannerText(text, color = '#ff8a8a') {
    if (!this._banner) return;
    const m = this._banner.querySelector('#dcb-mode');
    if (m) { m.textContent = text; m.style.color = color; }
  }

  /** Loop principal. */
  update(dt) {
    if (!this._active) return;
    const elapsed = performance.now() - this._modeStartAt;

    if (this._mode === 'orbit') {
      // 3s orbitando o matador
      if (!this._targetMesh) { this._switchToKillcam(); return; }
      const targetPos = this._targetMesh.getAbsolutePosition?.() || this._targetMesh.position;
      if (!targetPos) { this._switchToKillcam(); return; }
      this._orbitAngle += dt * 0.6;
      const radius = 5.5;
      const camX = targetPos.x + Math.cos(this._orbitAngle) * radius;
      const camZ = targetPos.z + Math.sin(this._orbitAngle) * radius;
      const camY = (targetPos.y || 0) + 3.0;
      this._cinematicCam.position.set(camX, camY, camZ);
      this._cinematicCam.setTarget(new BABYLON.Vector3(targetPos.x, (targetPos.y || 0) + 1.2, targetPos.z));
      this._setBannerText('🎬 ELIMINADO POR ' + this._killerName(), '#ff5a5a');

      if (elapsed > 3000) this._switchToKillcam();
    } else if (this._mode === 'killcam') {
      // 2s replayando últimos 2s do buffer
      const playbackDuration = 2000;
      const playbackElapsed = performance.now() - this._modeStartAt;
      if (playbackElapsed > playbackDuration) {
        this._setBannerText('🔄 PRONTO PRA RESPAWN', '#7efa9a');
        return; // mantém banner mas para de seguir
      }
      // Buffer tem ~5s; replay olha pelo segmento do final
      const totalBuf = this._buffer.length;
      if (totalBuf < 4) { this._setBannerText('🔄 PRONTO PRA RESPAWN', '#7efa9a'); return; }
      const replayProgress = playbackElapsed / playbackDuration;
      // Mostra apenas os últimos 2s do buffer
      const replayStartIdx = Math.max(0, totalBuf - Math.floor(totalBuf * 0.4));
      const idx = Math.min(totalBuf - 1, replayStartIdx + Math.floor((totalBuf - replayStartIdx) * replayProgress));
      const snap = this._buffer[idx];
      if (!snap) return;
      // Câmera 3p do ponto vista do morto (3m atrás)
      const yawRad = BABYLON.Tools.ToRadians(snap.ry || 0);
      const camX = snap.x - Math.sin(yawRad) * 3;
      const camZ = snap.z - Math.cos(yawRad) * 3;
      const camY = snap.y + 1.8;
      this._cinematicCam.position.set(camX, camY, camZ);
      this._cinematicCam.setTarget(new BABYLON.Vector3(snap.x, snap.y + 1.0, snap.z));
      this._setBannerText('⏪ KILLCAM REPLAY', '#ffcc44');
    }
  }

  _switchToKillcam() {
    this._mode = 'killcam';
    this._modeStartAt = performance.now();
  }

  _killerName() {
    const me = this.cs?.state?.players?.get(this.auth?.getUserId());
    if (!me) return 'algo';
    // Procura quem foi o último a matar (event 'died' do main.js já mostra no killfeed,
    // mas aqui usamos o target do orbit)
    return this._targetMesh?._remoteRef?.nickname
      || this._targetMesh?._mobRef?.kind
      || 'algo';
  }

  /** Sai quando respawn (state.dead vira false). */
  exit() {
    if (!this._active) return;
    this._active = false;
    if (this._cinematicCam) {
      try { this._cinematicCam.dispose(); } catch (_) {}
      this._cinematicCam = null;
    }
    if (this._savedCamera) {
      this.scene.activeCamera = this._savedCamera;
      // Re-attach control se aplicável
      try { this._savedCamera.attachControl?.(this.scene.getEngine().getRenderingCanvas(), true); } catch (_) {}
    }
    if (this._banner) {
      this._banner.style.opacity = '0';
      const b = this._banner;
      setTimeout(() => { try { b.parentNode?.removeChild(b); } catch (_) {} }, 400);
      this._banner = null;
    }
    this._targetMesh = null;
  }

  isActive() { return this._active; }
}
