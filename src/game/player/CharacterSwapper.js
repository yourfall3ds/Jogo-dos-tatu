// ─────────────────────────────────────────────────────────────────
//  CharacterSwapper — troca o modelo (GLB) do player em runtime
//
//  Reaproveita TODAS as animações: ao trocar, recarrega cada anim do
//  MOVESETS e re-vincula aos ossos do NOVO modelo (por nome de osso).
//
//  • Modelo com MESMO rig (biped Meshy) → todas as anims funcionam.
//  • Rig diferente (Digimon rip) → poucas/zero anims casam (T-pose).
//    O swapper RETORNA a taxa de match → dá pra avisar o jogador.
//
//  Uso:
//    const sw = new CharacterSwapper(player, scene, shadowGen);
//    const res = await sw.swap('assets/.../meu_digimon.glb');
//    // res = { ok, matchRate, animsOk, animsTotal, warning }
// ─────────────────────────────────────────────────────────────────
import { MOVESETS } from '../animation/animationNames.js';
import { AnimationLibrary } from '../animation/AnimationLibrary.js';
import { AnimationController } from '../animation/AnimationController.js';
import { LayeredAnimator } from '../animation/LayeredAnimator.js';

export class CharacterSwapper {
  constructor(player, scene, shadowGen) {
    this.player = player;
    this.scene = scene;
    this.shadowGen = shadowGen;
    this._busy = false;
  }

  // Lista plana de todas as animações do MOVESETS
  _allAnims() {
    const out = [];
    for (const anims of Object.values(MOVESETS)) {
      for (const [name, path] of Object.entries(anims)) {
        if (typeof path === 'string') out.push({ name, path });
      }
    }
    return out;
  }

  /**
   * Troca o player pro GLB em `url`.
   * @returns {Promise<{ok, matchRate, animsOk, animsTotal, warning}>}
   */
  async swap(url) {
    if (this._busy) return { ok: false, warning: 'troca em andamento' };
    this._busy = true;
    const p = this.player;
    try {
      // Encoda espaços/acentos pro loader
      const enc = url.split('/').map(s => encodeURIComponent(s)).join('/');
      const lastSlash = enc.lastIndexOf('/');
      const folder = enc.substring(0, lastSlash + 1);
      const file = enc.substring(lastSlash + 1);

      const res = await BABYLON.SceneLoader.ImportMeshAsync(null, folder, file, this.scene);
      const meshes = res.meshes;
      if (!meshes?.length) { this._busy = false; return { ok: false, warning: 'GLB sem meshes' }; }

      // Anima groups que vieram embutidos (rig próprio) — paramos e guardamos
      //  pra fallback (se nenhuma anim externa casar, usa as baked).
      const bakedAg = (res.animationGroups || []).slice();
      bakedAg.forEach(a => a.stop());

      const root = meshes[0];

      // ── Nova AnimationLibrary vinculada ao NOVO modelo ──────────────
      const newLib = new AnimationLibrary(this.scene);
      const allAnims = this._allAnims();
      let animsOk = 0;
      await Promise.all(allAnims.map(a =>
        newLib.loadExternalAnimations(a.path, a.name, root)
          .then(() => { if (newLib.animations.has(a.name)) animsOk++; })
          .catch(() => {})
      ));
      const matchRate = allAnims.length ? animsOk / allAnims.length : 0;

      // Pós-processamento (mesmo do boot) — só se as anims casaram
      if (animsOk > 0) {
        newLib.configureAll?.({
          aim_charge: { stripRootXZ: true },
          aim_hold:   { stripRootXZ: true, trimStart: 0, trimEnd: 0.22 },
          aim_run: { stripRootXZ: true }, aim_walk: { stripRootXZ: true },
          aim_walk_back: { stripRootXZ: true }, aim_shoot: { stripRootXZ: true },
        });
      }

      // ── Troca os sistemas de animação do player ─────────────────────
      const oldLib = p.animLib;
      p.animLib  = newLib;
      p.animCtrl = new AnimationController(newLib);
      p.layered  = new LayeredAnimator(newLib, this.scene);
      // o CombatSystem referencia o animController — atualiza
      if (p.combatSystem) p.combatSystem.animController = p.animCtrl;

      // Troca o mesh visual (reusa setMouseCharacter — limpa o antigo, reanexa armas)
      p.setMouseCharacter(meshes, animsOk === 0 ? bakedAg : [], this.shadowGen);

      // Descarta a lib antiga
      try { oldLib?.animations?.forEach(ag => ag.dispose()); } catch (_) {}

      // Estado inicial limpo
      p.stateMachine?.setState?.('unarmed');
      p.animCtrl.play('idle', { loop: true });

      this._busy = false;
      const warning = matchRate === 0
        ? 'Rig incompatível: nenhuma animação casou (modelo fica em T-pose). Use um GLB com rig biped Meshy.'
        : matchRate < 0.5
        ? `Rig parcial: só ${animsOk}/${allAnims.length} animações casaram.`
        : null;
      console.log(`[Swap] "${url}" → ${animsOk}/${allAnims.length} anims (${Math.round(matchRate*100)}%)`);
      return { ok: true, matchRate, animsOk, animsTotal: allAnims.length, warning };
    } catch (e) {
      this._busy = false;
      return { ok: false, warning: 'Falha ao carregar: ' + e.message };
    }
  }
}
