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
    // MECÂNICA LIVRE: atacar (soco/chute/espada) em QUALQUER estado —
    // inclusive VOANDO (jumping/falling) e durante o DASH ('dodging').
    // Só bloqueia quando o player REALMENTE não pode agir: atordoado,
    // derrubado ou morto. 'attacking' não precisa ser listado aqui porque
    // cada ataque já intercepta via isAttacking() antes de chamar canAttack().
    return (
      this.state !== "stunned"   &&
      this.state !== "knockdown" &&
      this.state !== "dead"
    );
  }

  canShoot() {
    // Atirar VOANDO/no DASH liberado. WeaponSystem.shoot() não usa este gate
    // (só checa ammo/firerate/reload), mas mantemos coerente: só bloqueia
    // nos estados em que o player não pode agir.
    return (
      this.state !== "stunned"   &&
      this.state !== "knockdown" &&
      this.state !== "dead"
    );
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
