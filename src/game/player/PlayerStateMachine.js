export class PlayerStateMachine {
  constructor() {
    this.state = "unarmed"; // idle, moving, armed, unarmed, attacking, shooting, stunned
    this.isArmedFlag = false;
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
    return (this.state === "unarmed" || this.state === "moving" || this.state === "idle") && this.state !== "dodging";
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
    this.setState("armed");
  }

  dropWeapon() {
    this.isArmedFlag = false;
    this.setState("unarmed");
  }
}
