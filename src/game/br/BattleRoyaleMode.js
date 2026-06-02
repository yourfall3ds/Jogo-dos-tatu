// ─────────────────────────────────────────────────────────────────
//  BattleRoyaleMode — orquestrador client-side do modo BR.
//
//  Conecta todas as peças:
//   - SkydiveController (queda física)
//   - LandingImpact (efeito de pouso)
//   - StormZone (renderiza zona)
//   - BattleRoyaleHUD (UI específica)
//   - TakeoffSequence (cinemática de decolagem)
//   - LoadingScreenSkin (background trocável)
//
//  Estados client (alinhado com server br_phase):
//   LOBBY → TAKEOFF (3s anim) → loading screen → SKYDIVE → ALIVE → FINISHED
// ─────────────────────────────────────────────────────────────────

import { SkydiveController } from './SkydiveController.js';
import { LandingImpact } from './LandingImpact.js';
import { StormZone } from './StormZone.js';
import { BattleRoyaleHUD } from './BattleRoyaleHUD.js';
import { TakeoffSequence } from './TakeoffSequence.js';
import { LoadingSkinGallery, applyToOverlay } from './LoadingScreenSkin.js';

export class BattleRoyaleMode {
  constructor({ scene, cs, auth, player, loadingOverlay }) {
    this.scene = scene;
    this.cs = cs;
    this.auth = auth;
    this.player = player;
    this.loadingOverlay = loadingOverlay;

    this.skydive = new SkydiveController(scene, player, cs);
    this.landing = new LandingImpact(scene, player);
    this.storm = new StormZone(scene, cs, auth);
    this.hud = new BattleRoyaleHUD(cs, auth);
    this.takeoff = new TakeoffSequence(scene);
    this.skinGallery = new LoadingSkinGallery();

    window._skydiveController = this.skydive;
    window._brMode = this;

    this._wireEvents();
  }

  _wireEvents() {
    // br_takeoff → cinemática local (eu também sou avatar)
    this.cs.on('br_takeoff', ({ skydive_at }) => {
      console.log('[BR] takeoff em', new Date(skydive_at));
      this._enterTakeoff(skydive_at);
    });

    // br_skydive_phase → server liberou skydive, ativo SkydiveController
    this.cs.on('br_skydive_phase', () => {
      console.log('[BR] entering skydive');
      this._enterSkydive();
    });

    // br_landed (qualquer player) — meu impact rola via landing callback do SkydiveController
    this.cs.on('br_landed', ({ player_id, x, y, z }) => {
      if (player_id !== this.auth.getUserId()) {
        // Outro player pousou — efeito visual remoto
        this.landing.trigger({
          position: new BABYLON.Vector3(x, y, z),
          impactSpeed: 50,
        });
      }
    });

    this.cs.on('br_running', () => {
      console.log('[BR] running phase');
    });

    this.cs.on('br_finished', ({ winner_id, winner_nick }) => {
      console.log('[BR] finished, winner:', winner_nick);
    });
  }

  _enterTakeoff(skydiveAt) {
    // Coleta avatares: meu player + RemotePlayers
    const avatars = [this.player];
    if (window._remotePlayers) {
      window._remotePlayers.forEach(rp => avatars.push(rp));
    }

    // Aplica skin no LoadingOverlay (Frente J de FlowGuard)
    try { applyToOverlay(document.getElementById('loading-overlay')); } catch (_) {}

    // Dispara takeoff
    this.takeoff.trigger(avatars, () => {
      // Mostra loading screen estilo BR
      this.loadingOverlay?.show('SAINDO DA ATMOSFERA', 'preparando posição de queda…', true);
      this.loadingOverlay?.setProgress(20, 'gerando zona segura…');
      setTimeout(() => this.loadingOverlay?.setProgress(60, 'sincronizando players…'), 400);
      setTimeout(() => this.loadingOverlay?.setProgress(90, 'liberando queda livre…'), 900);
    });

    // Tempo até skydive (server diz)
    const ms = Math.max(1500, skydiveAt - Date.now());
    setTimeout(() => this.loadingOverlay?.hide(), ms);
  }

  _enterSkydive() {
    // Pega posição inicial (alta) — server seta state.players[me].y = 200
    const me = this.cs.state?.players?.get(this.auth.getUserId());
    const startPos = new BABYLON.Vector3(
      me?.x || 0,
      Math.max(180, me?.y || 200),
      me?.z || 0
    );

    // Restaura mesh
    if (this.player.mesh) {
      if (this.player.mesh.setEnabled) this.player.mesh.setEnabled(true);
      else this.player.mesh.isVisible = true;
      this.player.mesh.scaling.set(1, 1, 1);
    }

    // Inicia skydive controller
    this.skydive.start(startPos, ({ position, impactSpeed }) => {
      // Callback de landing
      this.landing.trigger({ position, impactSpeed });
    });
  }

  /** Loop principal (a cada frame). */
  update(dt, input) {
    if (this.skydive.isActive()) {
      this.skydive.update(dt, input);
    }
    this.storm.update(dt);
    // HUD update em 5Hz
    this._hudT = (this._hudT || 0) - dt;
    if (this._hudT <= 0) {
      this.hud.update();
      this._hudT = 0.2;
    }
  }

  openSkinGallery() { this.skinGallery.open(); }
}
