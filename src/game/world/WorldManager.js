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

      // ── ONLINE: avisa o SERVIDOR que entrou no mundo selvagem ──────
      //  O servidor é autoritativo: seta zone='wild' e teleporta o player pro
      //  spawn da wild (todos na sala veem). Aqui só pedimos; o servidor manda.
      const cs = window._cs;
      if (cs?.connected) {
        cs.sendEnterWild?.();
      }

      // esconde o mapa atual (não deleta — dá pra voltar depois)
      this._hideCurrentMap(true);
      this.loadScreen.setProgress(0.15, 'gerando o mundo selvagem…');

      // ── MUNDO RICO: liga o BiomeWorld do projeto (9 biomas com GLBs +
      //    streaming Fortnite + props/baús). O CHÃO é o do jogo (estável,
      //    testado) — NÃO criar chão/céu gigantes próprios (faziam o player
      //    voar e a tela ficar preta). ──
      const bw = window._biomeWorld;
      if (bw?.enable) {
        bw.enable();
        // Garante o chão pisável do jogo (com colisão) visível na praça central.
        try { window._ensureOpenWorldGround?.(this.scene); } catch (_) {}
        this.loadScreen.setProgress(0.6, 'carregando biomas…');
        // dá tempo do streaming carregar o(s) bioma(s) perto do spawn
        try { bw.update(0.6, new BABYLON.Vector3(0, 0, 0)); } catch (_) {}
        await new Promise(r => setTimeout(r, 800));
        this.loadScreen.setProgress(0.95, 'finalizando…');
      } else {
        // fallback: o builder básico (se o BiomeWorld não existir)
        this._builder = new BiomeWorldBuilder(this.scene, {
          onProgress: (p, phase) => this.loadScreen.setProgress(p, phase),
        });
        await this._builder.build();
      }

      // SKYDIVE no spawn (praça central 0,0): nasce CAINDO de 200m e POUSA no
      //  chão. Nunca atravessa / cai no vazio. spawn({sky:true}) usa o X/Z.
      this._inBiomeWorld = true;          // marca ANTES (respawn/colisão sabem)
      const p = window._gamePlayer;
      if (p?.spawn) {
        try { p.spawn({ sky: true, x: 0, z: 0 }); }
        catch (e) { console.error('[WorldManager] skydive spawn:', e); }
      }
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

  }

  /** Corpo estático Havok (se a física estiver pronta). */
  async _tryStaticBody(mesh, shape = 'box') {
    try {
      const { physicsReady, makeStaticBody } = await import('../physics/PhysicsWorld.js');
      if (physicsReady?.()) makeStaticBody?.(mesh, this.scene, shape);
    } catch (_) {}
  }

  /** Esconde/mostra o mapa da ARENA (cemetery etc.), sem deletar. */
  _hideCurrentMap(hidden) {
    try {
      // 1) O mapa carregado pelo ChibataMapLoader fica em _activeMeshes.
      //    É AQUI que o mapa da arena (cemetery) realmente vive.
      const ml = window._chibataMaps;
      if (ml?._activeMeshes?.length) {
        for (const m of ml._activeMeshes) {
          try { m.setEnabled(!hidden); } catch (_) {}
        }
      }
      // 2) Mundo procedural antigo do jogo (se ligado) — esconde também.
      try { ml?._setProceduralVisible?.(!hidden); } catch (_) {}
      // 3) O Level base (chão/luz do mapa de treino) — esconde o que der.
      const level = window._gameLevel;
      const root = level?.root || level?.mapRoot || level?.ground;
      if (root && typeof root.setEnabled === 'function') {
        try { root.setEnabled(!hidden); } catch (_) {}
      }
      // 4) Varredura de segurança: qualquer mesh do mapa de treino que sobrou.
      //    Marca os do mundo de biomas pra NÃO esconder por engano.
      this.scene.meshes.forEach(m => {
        if (m._biomeWorldMesh) return;              // não toca no mundo novo
        const n = m.name || '';
        if (m._isMapMesh || n.startsWith('map_') || n.startsWith('chibata') ||
            n.startsWith('cemetery') || n.startsWith('ground') || n.startsWith('floor_world')) {
          try { m.setEnabled(!hidden); } catch (_) {}
        }
      });
    } catch (e) { console.warn('[WorldManager] hideCurrentMap:', e?.message); }
  }

  dispose() {
    try { this._portal?.dispose(); } catch (_) {}
    try { this._builder?.dispose(); } catch (_) {}
  }
}
