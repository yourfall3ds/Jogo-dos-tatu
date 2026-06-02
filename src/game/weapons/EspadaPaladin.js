// ─────────────────────────────────────────────────────────────────
//  EspadaPaladin — espada 1h (longsword) estilo The Duel
//
//  Marca isMelee: true para que WeaponSystem/Player roteiem LMB para
//  combatSystem.swordAttack() em vez de shoot(). Ammo/reload ignorados.
// ─────────────────────────────────────────────────────────────────
export class EspadaPaladin {
  constructor(scene) {
    this.id    = 'sword_paladin';
    this.label = 'Longsword Paladino';

    // ── Flags de roteamento ──
    this.isMelee   = true;
    this.swordTier = 'light';   // light = paladin, heavy = zweihander
    this.automatic = false;

    // Sem munição: mantemos compatibilidade com HUD (ele lê ammo/maxAmmo).
    this.damage   = 60;        // base; CombatSystem usa attackData por anim
    this.fireRate = 0.35;
    this.ammo     = 0;
    this.maxAmmo  = 0;
    this.fireSound = null;

    // ── Render FPS (viewmodel — diagonal estilo Skyrim) ──
    this.viewmodelScale    = 0.50;
    this.viewmodelPosition = new BABYLON.Vector3(0.30, -0.30, 0.55);
    this.viewmodelRotation = new BABYLON.Vector3(-0.25, Math.PI / 2 + 0.15, 0.4);
    this.viewmodelPositionAim = this.viewmodelPosition;
    this.viewmodelRotationAim = this.viewmodelRotation;
    this.muzzleOffset = new BABYLON.Vector3(0, 0, 0);

    // ── Render TPS (cola na mão direita) ──
    this.tpsScale    = 0.55;
    this.tpsRotation = new BABYLON.Vector3(-Math.PI / 2, Math.PI, 0);
    this.tpsPosition = new BABYLON.Vector3(0.05, 0, 0.18);

    // VFX dummy (não usados, mas WeaponSystem espera campos)
    this.tracerColor    = [0.85, 0.95, 1.00];
    this.tracerAlpha    = 0.0;
    this.tracerWidth    = 0.001;
    this.muzzleColor    = [0.0, 0.0, 0.0];
    this.hitColor       = [0.9, 0.95, 1.0];
    this.lightIntensity = 0;
    this.lightRadius    = 0;

    this._origMaxDim = null;
    this._origCenter = null;
  }

  applyToMesh(glbRoot, isTPS = false /*, aimAmount = 0 */) {
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
