// ─────────────────────────────────────────────────────────────────
//  WorldManager — orquestra o fluxo do mundo de biomas (Onda 1):
//   1. cria o PORTAL no mapa atual
//   2. ao entrar: mostra a TELA DE LOAD
//   3. constrói o MUNDO DE BIOMAS (gerador determinístico)
//   4. TELEPORTA o player pro spawn seguro (clareira no centro)
//   5. esconde a load screen → você está no mundo, andando
//
//  Ondas futuras plugam aqui: mobs por região (XP), baús, NPCs.
// ─────────────────────────────────────────────────────────────────
import { WorldPortal } from './WorldPortal.js';
import { WorldLoadScreen } from './WorldLoadScreen.js';
import { BiomeWorldBuilder } from './BiomeWorldBuilder.js';

export class WorldManager {
  constructor(scene) {
    this.scene = scene;
    this.loadScreen = new WorldLoadScreen();
    this._portal = null;
    this._builder = null;
    this._inBiomeWorld = false;
    this._busy = false;
  }

  /** Cria o portal no mapa atual, na posição dada. */
  spawnPortal(pos) {
    if (this._portal) { try { this._portal.dispose(); } catch (_) {} }
    this._portal = new WorldPortal(this.scene, pos, () => this.enterBiomeWorld());
    return this._portal;
  }

  /** Fluxo completo: load → gera mundo → teleporta pro spawn. */
  async enterBiomeWorld() {
    if (this._busy || this._inBiomeWorld) return;
    this._busy = true;
    try {
      this.loadScreen.show('Mundo Selvagem');
      // pequena espera pro overlay pintar antes do trabalho pesado
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // esconde o mapa atual (não deleta — dá pra voltar depois)
      this._hideCurrentMap(true);

      // constrói o mundo (progresso vai pra barra)
      this._builder = new BiomeWorldBuilder(this.scene, {
        onProgress: (p, phase) => this.loadScreen.setProgress(p, phase),
      });
      await this._builder.build();

      // teleporta o player pro spawn seguro (clareira central)
      const sp = this._builder.spawnPoint || new BABYLON.Vector3(0, 2, 0);
      this._teleportPlayer(sp);

      this._inBiomeWorld = true;
      await new Promise(r => setTimeout(r, 400)); // respiro visual
      this.loadScreen.hide();

      // RE-ENGATA o foco do jogo: a load screen soltou o pointer lock; sem
      //  isto o cursor fica como "cruz" (crosshair) e a câmera não responde
      //  até apertar ESC+Retomar. Volta pro estado 'playing' e re-pede o lock.
      try {
        window._screenFocus?.enterPlaying();
        window._gameInput?.activate?.(true);
        document.body.classList.add('in-game');
      } catch (_) {}
    } catch (e) {
      console.error('[WorldManager] enterBiomeWorld falhou:', e);
      this.loadScreen.setProgress(1, 'erro ao carregar o mundo');
      await new Promise(r => setTimeout(r, 1200));
      this.loadScreen.hide();
      this._hideCurrentMap(false);   // restaura o mapa se deu errado
    } finally {
      this._busy = false;
    }
  }

  _teleportPlayer(pos) {
    const p = window._gamePlayer;
    if (!p?.mesh) return;
    p.mesh.position.copyFrom(pos);
    p._vx = 0; p._vz = 0; p.velY = 0;
    p._isFalling = false; p._prevY = pos.y;
    if (p._cc) {
      try {
        p._cc.setPosition(pos.clone());
        p._cc.setVelocity(BABYLON.Vector3.Zero());
      } catch (_) {}
    }
  }

  /** Esconde/mostra o mapa atual (meshes do Level), sem deletar. */
  _hideCurrentMap(hidden) {
    try {
      const level = window._gameLevel;
      const root = level?.root || level?.mapRoot;
      if (root && typeof root.setEnabled === 'function') {
        root.setEnabled(!hidden);
        return;
      }
      // fallback: esconde meshes marcadas como mapa
      this.scene.meshes.forEach(m => {
        if (m._isMapMesh || m.name?.startsWith('map_') || m.name?.startsWith('chibata')) {
          m.setEnabled(!hidden);
        }
      });
    } catch (e) { console.warn('[WorldManager] hideCurrentMap:', e?.message); }
  }

  dispose() {
    try { this._portal?.dispose(); } catch (_) {}
    try { this._builder?.dispose(); } catch (_) {}
  }
}
