/**
 * Metralhadora - arma AUTOMÁTICA (segura o botão → metralha).
 *
 * Dano POR TIRO baixo, cadência altíssima (fireRate baixo). É o oposto do
 * Rifle (1 tiro, cadenciado, dano alto). Os números autoritativos vivem no
 * server (WeaponTable.WEAPONS.machinegun); aqui só o viewmodel + dmg-mirror.
 *
 * _origMaxDim e _origCenter são injetados por WeaponSystem.setGLBWeapon.
 */
export class Metralhadora {
  constructor(scene) {
    this.id    = 'machinegun';
    this.label = 'Metralhadora';
    this.damage   = 18;       // espelha WeaponTable.machinegun.dmg (server-auth)
    this.fireRate  = 0.09;    // automático rápido
    this.ammo     = 45;
    this.maxAmmo  = 45;
    this.automatic = true;    // SEGURA o botão → metralha (som em loop)
    this.fireSound = 'mg_loop';

    // ── Ajustes Visuais (FPS) ──────────────────────────────────────
    this.viewmodelScale    = 0.7400;
    this.viewmodelPosition = new BABYLON.Vector3(0.3500, -0.2000, 0.4400);
    this.viewmodelRotation = new BABYLON.Vector3(-0.0524, 0.1745, 0.0698);

    // ── Posição de MIRA (ADS) ──────────────────────────────────────
    this.viewmodelPositionAim = new BABYLON.Vector3(0.0, -0.10, 0.30);
    this.viewmodelRotationAim = new BABYLON.Vector3(-0.0524, 0.1745, 0.0698);

    // Muzzle calibrado pelo WeaponEditor
    this.muzzleOffset = new BABYLON.Vector3(0.0200, 0.6400, 0.8100);

    // ── Ajustes do Personagem (TPS) ───────────────────────────────
    this.tpsScale    = 0.4500;
    this.tpsRotation = new BABYLON.Vector3(1.5708, 3.1416, 0.0000);
    this.tpsPosition = new BABYLON.Vector3(0, 0, 0);

    // ── Tiro Plasma Verde (distingue do Rifle azul) ───────────────
    this.tracerColor    = [0.35, 1.00, 0.45];
    this.tracerAlpha    = 0.95;
    this.tracerWidth    = 0.045;

    this.muzzleColor    = [0.30, 1.00, 0.40];
    this.hitColor       = [0.55, 1.00, 0.60];

    this.lightIntensity = 4.0;
    this.lightRadius    = 12;

    // Bounds originais (injetados por WeaponSystem.setGLBWeapon)
    this._origMaxDim = null;
    this._origCenter = null;
  }

  applyToMesh(glbRoot, isTPS = false, aimAmount = 0) {
    // CRÍTICO: zera rotationQuaternion para que .rotation seja respeitada
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

      const t = Math.max(0, Math.min(1, aimAmount));
      const pHip = this.viewmodelPosition, pAim = this.viewmodelPositionAim ?? pHip;
      const rHip = this.viewmodelRotation, rAim = this.viewmodelRotationAim ?? rHip;
      glbRoot.rotation.set(
        rHip.x + (rAim.x - rHip.x) * t,
        rHip.y + (rAim.y - rHip.y) * t,
        rHip.z + (rAim.z - rHip.z) * t
      );
      glbRoot.position.set(
        (pHip.x + (pAim.x - pHip.x) * t) + center.x * s,
        (pHip.y + (pAim.y - pHip.y) * t) - center.y * s,
        (pHip.z + (pAim.z - pHip.z) * t) + center.z * s
      );
    }
  }
}
