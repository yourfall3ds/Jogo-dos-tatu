/**
 * Rifle Pesado - 1 TIRO, CADENCIADO, DANO ALTO.
 *
 * É o oposto da Metralhadora (auto, dano/tiro baixo). Um único disparo por
 * clique com cadência alta (cdMs alto no server) e dano por tiro elevado.
 * Os números autoritativos vivem no server (WeaponTable.WEAPONS.rifle);
 * damage aqui espelha o server para os números flutuantes do cliente.
 *
 * Usa a mesma convenção de rotação da PistolaBucaneira (Math.PI/2 no Y)
 * para qualquer GLB exportado com o mesmo eixo de orientação.
 *
 * _origMaxDim e _origCenter são injetados por WeaponSystem.setGLBWeapon.
 */
export class RiflePesado {
  constructor(scene) {
    this.id    = 'rifle';
    this.label = 'Rifle Pesado';
    this.damage   = 60;       // espelha WeaponTable.rifle.dmg (server-auth)
    this.fireRate  = 0.60;    // 1 tiro cadenciado (cdMs alto no server)
    this.ammo     = 8;
    this.maxAmmo  = 8;
    this.automatic = false;   // semi-auto: 1 tiro por clique
    this.fireSound = 'gun_rifle';

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

    // ── Tiro Plasma Azul ──────────────────────────────────────────
    this.tracerColor    = [0.20, 0.55, 1.00];  // núcleo azul elétrico
    this.tracerAlpha    = 0.95;
    this.tracerWidth    = 0.06;                 // 4× mais largo que pistola

    // Cor do flash de boca e do impacto
    this.muzzleColor    = [0.15, 0.45, 1.00];  // azul frio
    this.hitColor       = [0.40, 0.75, 1.00];  // azul brilhante no hit

    // Point lights dinâmicas
    this.lightIntensity = 5.0;    // intensidade da PointLight
    this.lightRadius    = 14;     // alcance da luz

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
