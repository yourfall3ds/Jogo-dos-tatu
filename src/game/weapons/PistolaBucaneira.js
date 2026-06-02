/**
 * Pistola Bucaneira - Lógica Isolada
 *
 * _origMaxDim e _origCenter são injetados por WeaponSystem.setGLBWeapon
 * antes do primeiro applyToMesh, garantindo escala consistente em todas
 * as trocas de arma.
 */
export class PistolaBucaneira {
  constructor(scene) {
    this.id    = 'pistol';
    this.label = 'Pistola Bucaneira';
    this.damage   = 40;
    this.fireRate  = 0.28;
    this.ammo     = 12;
    this.maxAmmo  = 12;
    this.automatic = false;        // semi-auto: 1 tiro por clique
    this.fireSound = 'gun_pistol'; // som por tiro

    // ── Ajustes Visuais (FPS) — posição de QUADRIL (sem mirar) ─────
    this.viewmodelScale    = 0.50;
    this.viewmodelPosition = new BABYLON.Vector3(0.28, -0.22, 0.45);
    this.viewmodelRotation = new BABYLON.Vector3(0, Math.PI / 2, 0);

    // ── Posição de MIRA (ADS) — arma sobe pro centro da tela ───────
    // Quando o jogador segura o botão de mirar, a arma interpola suave
    // de viewmodelPosition → viewmodelPositionAim.
    this.viewmodelPositionAim = new BABYLON.Vector3(0.0, -0.12, 0.30);
    this.viewmodelRotationAim = new BABYLON.Vector3(0, Math.PI / 2, 0);

    this.muzzleOffset = new BABYLON.Vector3(0, 0.02, 0.40);

    // ── Ajustes do Personagem (TPS) ───────────────────────────────
    // Cano deitado na horizontal apontando pra frente da mão.
    // Ajuste fino ao vivo pelo Editor de Armas (F4) → salva no localStorage.
    this.tpsScale    = 0.50;
    this.tpsRotation = new BABYLON.Vector3(-Math.PI / 2, Math.PI, 0);
    this.tpsPosition = new BABYLON.Vector3(0.05, 0, 0.15);

    // ── Tiro (visual) ─────────────────────────────────────────────
    this.tracerColor    = [1.00, 0.90, 0.40];  // amarelo quente
    this.tracerAlpha    = 0.70;
    this.tracerWidth    = 0.015;               // fino

    this.muzzleColor    = [1.00, 0.80, 0.30];  // laranja
    this.hitColor       = [1.00, 0.55, 0.10];  // laranja brilhante

    this.lightIntensity = 2.0;
    this.lightRadius    = 7;

    // Bounds originais (injetados por WeaponSystem antes do primeiro applyToMesh)
    this._origMaxDim = null;
    this._origCenter = null;
  }

  /**
   * @param {number} aimAmount  0 = quadril | 1 = mirando (ADS). Interpolado.
   */
  applyToMesh(glbRoot, isTPS = false, aimAmount = 0) {
    glbRoot.rotationQuaternion = null;
    const maxDim = (this._origMaxDim > 0) ? this._origMaxDim : 1;
    const center = this._origCenter ?? BABYLON.Vector3.Zero();

    if (isTPS) {
      const s = this.tpsScale / maxDim;
      glbRoot.scaling.setAll(s);
      glbRoot.rotation.copyFrom(this.tpsRotation);
      glbRoot.position.copyFrom(this.tpsPosition);
    } else {
      const s = this.viewmodelScale / maxDim;
      glbRoot.scaling.setAll(s);

      // Interpola posição e rotação entre quadril (0) e mira (1)
      const t = Math.max(0, Math.min(1, aimAmount));
      const pHip = this.viewmodelPosition;
      const pAim = this.viewmodelPositionAim ?? pHip;
      const rHip = this.viewmodelRotation;
      const rAim = this.viewmodelRotationAim ?? rHip;

      glbRoot.rotation.set(
        rHip.x + (rAim.x - rHip.x) * t,
        rHip.y + (rAim.y - rHip.y) * t,
        rHip.z + (rAim.z - rHip.z) * t
      );
      const px = pHip.x + (pAim.x - pHip.x) * t;
      const py = pHip.y + (pAim.y - pHip.y) * t;
      const pz = pHip.z + (pAim.z - pHip.z) * t;
      glbRoot.position.set(
        px + center.x * s,
        py - center.y * s,
        pz + center.z * s
      );
    }
  }
}
