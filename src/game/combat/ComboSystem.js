export class ComboSystem {
  constructor() {
    // ── Chains separadas por botão ────────────────────────────────────
    // LMB = socos | RMB = chutes
    // Ordem reajustada (feedback): punch_02 abre melhor, punch_03 vem como 2º.
    // punch_04 (cotovelada) é o finalizador pesado.
    // Combo PRINCIPAL de soco (os bons) → e no FINAL do movelist solta um
    // FINALIZADOR flashy (combo_punch). Sem o combo_punch_4 (você não curtiu).
    this.punchChain     = ["punch_02", "punch_03", "punch_01", "punch_04"];
    this.punchFinishers = ["combo_punch_1", "combo_punch_2", "combo_punch_3", "combo_punch_5"];
    this.finisherIdx    = 0;
    // Combo de chute "bala": os mais foda carregados, encadeados.
    this.kickChain  = ["kick_01", "roundhouse", "high_kick", "spartan_kick", "kick_02"];

    // Índices independentes — avançam somente no tipo correto
    this.punchIdx = 0;
    this.kickIdx  = 0;

    // FILA de inputs durante a animação. Antes era um slot único, então
    // clicar RÁPIDO (mashing) colapsava vários cliques em UM só → combo
    // parava no 1º/2º golpe. Com fila, cada clique entra e o combo encadeia
    // até o fim. Capada no tamanho do combo pra não "guardar" cliques demais.
    this._queue = [];
    this.QUEUE_MAX = 4;

    // Histórico recente para detectar cross-combos (ex: punch→kick→punch)
    this._history = [];
  }

  // ── Registra input durante animação (entra na fila) ──────────────
  registerPunch() { if (this._queue.length < this.QUEUE_MAX) this._queue.push('punch'); }
  registerKick()  { if (this._queue.length < this.QUEUE_MAX) this._queue.push('kick');  }

  consumeBuffer() {
    return this._queue.shift() || null; // 'punch' | 'kick' | null
  }

  // ── Retorna próxima animação de soco ─────────────────────────────
  getNextPunch() {
    let anim;
    if (this.punchIdx < this.punchChain.length) {
      // socos normais do movelist
      anim = this.punchChain[this.punchIdx++];
    } else {
      // completou o movelist → FINALIZADOR flashy, depois reseta o combo
      anim = this.punchFinishers[this.finisherIdx++ % this.punchFinishers.length];
      this.punchIdx = 0;
    }
    this._history.push('punch');
    if (this._history.length > 6) this._history.shift();
    return anim;
  }

  // ── Retorna próxima animação de chute ────────────────────────────
  getNextKick() {
    if (this.kickIdx >= this.kickChain.length) this.kickIdx = 0;
    const anim = this.kickChain[this.kickIdx++];
    this._history.push('kick');
    if (this._history.length > 6) this._history.shift();
    return anim;
  }

  // Reseta tudo ao fim do combo ou ao tomar dano
  reset() {
    this.punchIdx  = 0;
    this.kickIdx   = 0;
    this._queue    = [];
    this._history  = [];
  }

  // ── Helpers de consulta ──────────────────────────────────────────
  /** Combo alternado detectado (punch→kick ou kick→punch nos últimos 2) */
  isCrossCombo() {
    if (this._history.length < 2) return false;
    const last = this._history.slice(-2);
    return last[0] !== last[1];
  }

  getComboCount() {
    return this._history.length;
  }
}
