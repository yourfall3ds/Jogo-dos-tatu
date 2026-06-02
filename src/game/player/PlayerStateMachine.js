export class PlayerStateMachine {
  constructor() {
    this.state = "unarmed"; // idle, moving, armed, sword, unarmed, attacking, shooting, stunned
    this.isArmedFlag = false;
    this.isSwordFlag = false; // subtipo de armed: melee em vez de tiro
  }

  setState(newState) {
    // console.log(`[PlayerState] Mudou de ${this.state} para ${newState}`);
    this.state = newState;
  }

  getState() {
    return this.state;
  }

  // Helpers de condição
  canMove() {
    return this.state !== "knockdown" && this.state !== "stunned";
  }

  canAttack() {
    // Inclui 'sword' (espada saca = pode atacar com slash) e 'armed' (pra
    // permitir melee como fallback se o WeaponSystem habilitar isMelee).
    return (
      this.state === "unarmed" ||
      this.state === "moving"  ||
      this.state === "idle"    ||
      this.state === "sword"
    ) && this.state !== "dodging";
  }

  canShoot() {
    return this.state === "armed";
  }

  isAttacking() {
    return this.state === "attacking";
  }

  isDodging() {
    return this.state === "dodging";
  }

  isDead() {
    return this.state === "knockdown";
  }

  equipWeapon() {
    this.isArmedFlag = true;
    this.isSwordFlag = false;
    this.setState("armed");
  }

  equipSword() {
    this.isArmedFlag = true;
    this.isSwordFlag = true;
    this.setState("sword");
  }

  dropWeapon() {
    this.isArmedFlag = false;
    this.isSwordFlag = false;
    this.setState("unarmed");
  }
}
