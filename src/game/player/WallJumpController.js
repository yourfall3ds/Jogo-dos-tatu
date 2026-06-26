// ─────────────────────────────────────────────────────────────────
//  WallJumpController — wall jump parkour
//
//  Regras:
//  • Encostar em qualquer parede → READY → pode pular
//  • Após pular: a parede pulada fica BLOQUEADA até o jogador
//    fisicamente sair dela (ray não detecta mais a mesh)
//  • Só depois de sair E encostar de novo → READY novamente
//  • Outra parede diferente → disponível imediatamente (sem restrição)
//  • No chão → tudo resetado
// ─────────────────────────────────────────────────────────────────

export const WJPhase = Object.freeze({
  NONE:  'NONE',
  READY: 'READY',
});

export class WallJumpController {
  constructor(player) {
    this.player = player;

    // ── Parâmetros ────────────────────────────────────────────────
    this.WALL_DIST   = 0.68;   // raio de detecção de parede
    this.H_FORCE     = 11;     // impulso horizontal
    this.V_FORCE     = 15;     // impulso vertical
    this.SLIDE_SPEED = 3.5;    // queda máxima ao deslizar
    this.LEAVE_GRACE = 0.06;   // anti-blip: tempo sem parede p/ confirmar saída

    // ── Estado ────────────────────────────────────────────────────
    this.phase       = WJPhase.NONE;
    this._wallNormal = null;
    this._prevMesh   = null;   // parede do frame anterior
    this._lastMesh   = null;   // parede de que pulou — bloqueada até sair
    this._leaveTimer = 0;
  }

  // ── Update a cada frame ───────────────────────────────────────────
  update(dt, playerPos, isGrounded) {
    if (isGrounded) {
      this._resetAll();   // no chão: libera tudo
      return;
    }

    const rawWall = this._detectWall(playerPos);

    // Filtra a parede que foi pulada — só aceita outras paredes
    // _lastMesh só é limpo quando o ray parar de detectar ela (jogador saiu)
    const wall = (rawWall && rawWall.mesh !== this._lastMesh) ? rawWall : null;

    if (!wall) {
      // Sem contato válido — hysteresis antes de resetar
      this._leaveTimer += dt;
      if (this._leaveTimer >= this.LEAVE_GRACE) {
        this.phase       = WJPhase.NONE;
        this._wallNormal = null;
        this._prevMesh   = null;

        // Só libera _lastMesh quando o jogador NÃO está mais encostado nela
        // (rawWall é null, ou é uma parede diferente da pulada)
        if (!rawWall || rawWall.mesh !== this._lastMesh) {
          this._lastMesh = null;
        }
      }
      return;
    }

    // Contato válido com parede diferente da pulada
    this._leaveTimer = 0;
    this._wallNormal = wall.normal;

    if (wall.mesh !== this._prevMesh) {
      // Novo contato → pulo disponível
      this.phase = WJPhase.READY;
    }

    this._prevMesh = wall.mesh;
  }

  // ── Executa wall jump — retorna velocidade ou null ────────────────
  tryWallJump() {
    if (this.phase !== WJPhase.READY) return null;
    if (!this._wallNormal) return null;

    const vel = new BABYLON.Vector3(
      this._wallNormal.x * this.H_FORCE,
      this.V_FORCE,
      this._wallNormal.z * this.H_FORCE,
    );

    // Bloqueia a parede atual — só desbloqueia quando o jogador sair dela
    this._lastMesh = this._prevMesh;
    this._resetContact();

    return vel;
  }

  // ── Consultas ─────────────────────────────────────────────────────
  isOnWall()     { return this.phase === WJPhase.READY; }
  canJump()      { return this.phase === WJPhase.READY; }
  getPhase()     { return this.phase; }
  getIndicator() { return this.phase === WJPhase.READY ? '🧱 ESPAÇO → Wall Jump! 🚀' : ''; }

  // ── Internos ──────────────────────────────────────────────────────

  // Reseta contato atual (usado após pulo e ao sair da parede)
  // NÃO limpa _lastMesh — persiste até o jogador sair fisicamente
  _resetContact() {
    this.phase       = WJPhase.NONE;
    this._wallNormal = null;
    this._prevMesh   = null;
    this._leaveTimer = 0;
  }

  // Reset total — usado ao pousar no chão
  _resetAll() {
    this._resetContact();
    this._lastMesh = null;   // no chão tudo é liberado
  }

  // ── Raycast em 4 direções (cintura + ombro) ───────────────────────
  _detectWall(playerPos) {
    const scene = this.player.scene;

    const dirs = [
      new BABYLON.Vector3( 1, 0,  0),
      new BABYLON.Vector3(-1, 0,  0),
      new BABYLON.Vector3( 0, 0,  1),
      new BABYLON.Vector3( 0, 0, -1),
    ];

    const waist    = playerPos.clone(); waist.y    += 0.3;
    const shoulder = playerPos.clone(); shoulder.y += 0.9;

    let best = null, bestDist = Infinity;

    for (const dir of dirs) {
      const hW = scene.pickWithRay(new BABYLON.Ray(waist,    dir, this.WALL_DIST), this._filter.bind(this));
      const hS = scene.pickWithRay(new BABYLON.Ray(shoulder, dir, this.WALL_DIST), this._filter.bind(this));

      if (hW?.hit && hS?.hit && hW.pickedMesh) {
        if (hW.distance < bestDist) {
          bestDist = hW.distance;
          best = { mesh: hW.pickedMesh, normal: dir.negate() };
        }
      }
    }

    return best;
  }

  _filter(m) {
    return m !== this.player.mesh
      && m.isEnabled()                    // ignora meshes-template desativados
      && m.isPickable !== false
      && m.isVisible  !== false           // ignora meshes escondidos
      && (m.visibility ?? 1) > 0.05      // ignora meshes transparentes
      && !m.name.startsWith('boundary')
      && m.name !== 'skyBox'
      && !m.name.startsWith('gun')
      && !m.name.startsWith('arm')
      && !m.name.startsWith('muzzle')
      && !m.name.startsWith('hit')
      && !m.name.startsWith('tracer')
      && !m.name.startsWith('spark')
      && !m.name.startsWith('expl')
      && !m.name.startsWith('bhole');
  }
}
