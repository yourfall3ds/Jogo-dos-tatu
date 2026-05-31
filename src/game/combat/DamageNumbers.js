// ─────────────────────────────────────────────────────────────────
//  DamageNumbers — números de dano flutuantes (floating combat text)
//
//  Ao acertar, spawna o número do dano no ponto do impacto. Ele sobe,
//  dá um pop e some. Billboard (sempre encara a câmera) em world-space,
//  então não precisa sincronizar com o DOM.
// ─────────────────────────────────────────────────────────────────
export class DamageNumbers {
  constructor(scene) {
    this.scene = scene;
  }

  /**
   * @param {BABYLON.Vector3} worldPos  posição do impacto
   * @param {number} amount             dano
   * @param {Object} opts  { color, crit }
   */
  spawn(worldPos, amount, { color = '#ffe24a', crit = false } = {}) {
    if (!worldPos || !this.scene) return;
    const txt = String(Math.round(amount));

    // ── Textura com o número (contorno preto + cor) ──────────────────
    const W = 256, H = 128;
    const tex = new BABYLON.DynamicTexture('dmgTex', { width: W, height: H }, this.scene, false);
    tex.hasAlpha = true;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, W, H);
    const fs = crit ? 96 : 74;
    ctx.font = `900 ${fs}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10; ctx.strokeStyle = '#000';
    ctx.strokeText(txt, W / 2, H / 2);
    ctx.fillStyle = crit ? '#ff5a3c' : color;
    ctx.fillText(txt, W / 2, H / 2);
    tex.update();

    const mat = new BABYLON.StandardMaterial('dmgMat', this.scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = BABYLON.Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;

    const plane = BABYLON.MeshBuilder.CreatePlane('dmgNum', { width: 1.3, height: 0.65 }, this.scene);
    plane.material = mat;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    plane.renderingGroupId = 1;        // por cima do mundo
    plane.position.copyFrom(worldPos);
    plane.position.x += (Math.random() - 0.5) * 0.5;
    plane.position.y += 1.0 + Math.random() * 0.3;
    plane.position.z += (Math.random() - 0.5) * 0.3;

    // ── Animação: sobe + pop + fade ──────────────────────────────────
    let t = 0;
    const dur  = crit ? 1.0 : 0.8;
    const base = crit ? 1.35 : 1.0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      t += dt;
      const k = Math.min(1, t / dur);
      plane.position.y += dt * 1.7;                       // sobe
      const pop = base * (1 + 0.25 * Math.sin(Math.min(k, 0.3) / 0.3 * Math.PI));
      plane.scaling.setAll(pop);
      mat.alpha = 1 - Math.max(0, (k - 0.45) / 0.55);     // fade na 2ª metade
      if (t >= dur) {
        this.scene.onBeforeRenderObservable.remove(obs);
        plane.dispose();
        mat.dispose();
        tex.dispose();
      }
    });
  }
}
