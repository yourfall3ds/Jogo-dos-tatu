export class ComboSystem {
  constructor() {
    // ── Chains separadas por botão ────────────────────────────────────
    // LMB = socos | RMB = chutes
    // Ordem reajustada (feedback): punch_02 abre melhor, punch_03 vem como 2º.
    // punch_04 (cotovelada) é o finalizador pesado.
    this.punchChain = ["punch_02", "punch_03", "punch_01", "punch_04"];
    // Combo de chute "bala": mistura os chutes carregados pra ficar variado.
    this.kickChain  = ["kick_01", "high_kick", "kick_02", "flying_fist", "double_kick"];

    // Índices independentes — avançam somente no tipo correto
    this.punchIdx = 0;
    this.kickIdx  = 0;

    // Buffer de próximo input durante animação em curso
    // null | 'punch' | 'kick'
    this.bufferType = null;

    // Histórico recente para detectar cross-combos (ex: punch→kick→punch)
    this._history = [];
  }

  // ── Registra input durante animação (não executa de imediato) ────
  registerPunch() { this.bufferType = 'punch'; }
  registerKick()  { this.bufferType = 'kick';  }

  consumeBuffer() {
    const t = this.bufferType;
    this.bufferType = null;
    return t; // 'punch' | 'kick' | null
  }

  // ── Retorna próxima animação de soco ─────────────────────────────
  getNextPunch() {
    if (this.punchIdx >= this.punchChain.length) this.punchIdx = 0;
    const anim = this.punchChain[this.punchIdx++];
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
    this.bufferType = null;
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
