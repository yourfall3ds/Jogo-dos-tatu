// ─────────────────────────────────────────────────────────────────
//  EspadaZweihander — 2h greatsword (estilo GunZ heavy)
// ─────────────────────────────────────────────────────────────────
export class EspadaZweihander {
  constructor(scene) {
    this.id    = 'sword_zweihander';
    this.label = 'Zweihander';

    this.isMelee   = true;
    this.swordTier = 'heavy';
    this.automatic = false;

    this.damage   = 95;
    this.fireRate = 0.55;
    this.ammo     = 0;
    this.maxAmmo  = 0;
    this.fireSound = null;

    // FPS: levantado a duas mãos
    this.viewmodelScale    = 0.60;
    this.viewmodelPosition = new BABYLON.Vector3(0.20, -0.35, 0.65);
    this.viewmodelRotation = new BABYLON.Vector3(-0.35, Math.PI / 2 + 0.05, 0.30);
    this.viewmodelPositionAim = this.viewmodelPosition;
    this.viewmodelRotationAim = this.viewmodelRotation;
    this.muzzleOffset = new BABYLON.Vector3(0, 0, 0);

    // TPS
    this.tpsScale    = 0.75;
    this.tpsRotation = new BABYLON.Vector3(-Math.PI / 2, Math.PI, 0);
    this.tpsPosition = new BABYLON.Vector3(0.08, 0, 0.22);

    this.tracerColor    = [1.0, 0.85, 0.55];
    this.tracerAlpha    = 0.0;
    this.tracerWidth    = 0.001;
    this.muzzleColor    = [0.0, 0.0, 0.0];
    this.hitColor       = [1.0, 0.7, 0.3];
    this.lightIntensity = 0;
    this.lightRadius    = 0;

    this._origMaxDim = null;
    this._origCenter = null;
  }

  applyToMesh(glbRoot, isTPS = false) {
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
      glbRoot.rotation.copyFrom(this.viewmodelRotation);
      glbRoot.position.set(
        this.viewmodelPosition.x + center.x * s,
        this.viewmodelPosition.y - center.y * s,
        this.viewmodelPosition.z + center.z * s
      );
    }
  }
}
