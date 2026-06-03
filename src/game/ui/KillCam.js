// ─────────────────────────────────────────────────────────────────
//  KillCam — camera do assassino (replay ~3s).
//
//  Ao morrer, troca a camera ativa por uma ArcRotateCamera travada no
//  matador (killerRoot) e mostra overlay "ELIMINADO POR <nick>".
//  Apos durationMs restaura a camera anterior e chama onDone.
//
//  Camera isolada — nao mexe na camera FPS/TPS do player; so guarda a
//  ref e restaura no stop(). Robusta a erros: qualquer falha cai no
//  stop() pra nunca deixar o jogador preso numa camera fantasma.
// ─────────────────────────────────────────────────────────────────

export class KillCam {
  constructor(scene, cs) {
    this.scene = scene;
    this.cs = cs;
    this._cam = null;
    this._active = false;
    this._prevCam = null;
  }

  start(killerNick, killerRoot, durationMs, onDone) {
    durationMs = durationMs || 3000;
    try {
      this._active = true;
      this._prevCam = this.scene.activeCamera;
      this._cam = new BABYLON.ArcRotateCamera("killcam", Math.PI, Math.PI / 3, 6, BABYLON.Vector3.Zero(), this.scene);
      if (killerRoot) this._cam.lockedTarget = killerRoot;
      this.scene.activeCamera = this._cam;
      this._showOverlay(killerNick);
      this._timer = setTimeout(() => this.stop(onDone), durationMs);
    } catch (e) { console.error("[KillCam]", e); this.stop(onDone); }
  }

  _showOverlay(nick) {
    let el = document.getElementById("killcam-overlay");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "killcam-overlay";
    el.style.cssText = "position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:9100;color:#fff;font-family:Segoe UI,monospace;text-align:center;pointer-events:none;";
    el.innerHTML = "<div style=\"font-size:0.9em;color:#f55;letter-spacing:3px;\">ELIMINADO POR</div><div style=\"font-size:2em;font-weight:900;text-shadow:0 2px 8px #000;\">" + (nick || "???") + "</div>";
    document.body.appendChild(el);
  }

  stop(onDone) {
    if (!this._active) return;
    this._active = false;
    try { clearTimeout(this._timer); } catch (_) {}
    try { document.getElementById("killcam-overlay")?.remove(); } catch (_) {}
    try { if (this._prevCam) this.scene.activeCamera = this._prevCam; } catch (_) {}
    try { this._cam?.dispose(); } catch (_) {}
    this._cam = null;
    if (onDone) { try { onDone(); } catch (_) {} }
  }
}
