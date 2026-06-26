// ─────────────────────────────────────────────────────────────────
//  FortniteHUD — casca visual do HUD in-game (ARTE ORIGINAL).
//  Recria o LAYOUT/feel de um battle royale de construção, lendo os
//  dados que JÁ existem no jogo (não cria gameplay novo aqui):
//    • inf-esquerdo : vida (verde) + escudo (azul)
//    • topo-direito : eliminações / vivos / onda (wave)
//  Escudo/materiais aparecem zerados até as ondas de gameplay ligarem.
// ─────────────────────────────────────────────────────────────────
export class FortniteHUD {
  constructor() { this._build(); }

  _bar(gradient) {
    return `<div style="height:14px;background:rgba(0,0,0,.5);
      border:1px solid var(--fn-stroke);border-radius:3px;overflow:hidden;width:230px;">
      <div class="fn-fill" style="height:100%;width:100%;background:${gradient};
        box-shadow:0 0 8px rgba(0,0,0,.4);transition:width .15s ease;"></div></div>`;
  }

  _build() {
    // ── Inf-esquerdo: escudo (em cima) + vida (embaixo) ──
    const left = document.createElement('div');
    left.id = 'fn-vitals';
    left.style.cssText = `position:fixed;left:18px;bottom:22px;z-index:60;
      display:flex;flex-direction:column;gap:6px;pointer-events:none;
      font:600 13px 'Oswald','Segoe UI',sans-serif;`;
    left.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="color:var(--fn-shield);width:16px;text-align:center;font-size:15px;">🛡</span>
        ${this._bar('linear-gradient(180deg,#7fd0ff,var(--fn-shield))')}
        <span id="fn-shield-n" style="color:#cfe9ff;min-width:34px;text-shadow:0 1px 2px #000;">0</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="color:var(--fn-health);width:16px;text-align:center;font-size:15px;font-weight:700;">＋</span>
        ${this._bar('linear-gradient(180deg,#a6ff86,var(--fn-health))')}
        <span id="fn-health-n" style="color:#e6ffe0;min-width:34px;text-shadow:0 1px 2px #000;">100</span>
      </div>`;
    document.body.appendChild(left);
    const fills = left.querySelectorAll('.fn-fill');
    this._shieldFill = fills[0];
    this._healthFill = fills[1];
    this._shieldN = left.querySelector('#fn-shield-n');
    this._healthN = left.querySelector('#fn-health-n');

    // ── Topo-direito: kills / vivos / onda (empilhados) ──
    const tr = document.createElement('div');
    tr.id = 'fn-stats';
    tr.style.cssText = `position:fixed;right:18px;top:14px;z-index:60;
      display:flex;flex-direction:column;gap:4px;align-items:flex-end;
      pointer-events:none;font:700 17px 'Oswald','Segoe UI',sans-serif;
      color:#fff;text-shadow:0 1px 3px #000;`;
    tr.innerHTML = `
      <div><span style="color:#9ff;">☠</span> <span id="fn-kills">0</span></div>
      <div><span style="color:#9cf;">👥</span> <span id="fn-alive">1</span></div>
      <div><span style="color:#fbd34a;">🌊</span> <span id="fn-wave">1</span></div>`;
    document.body.appendChild(tr);
    this._killsN = tr.querySelector('#fn-kills');
    this._aliveN = tr.querySelector('#fn-alive');
    this._waveN  = tr.querySelector('#fn-wave');
  }

  /** Chamado no render loop. Lê dados reais; tolera ausência (boot). */
  update() {
    // Vitais (vida sempre existe; escudo só quando o sistema ligar)
    const p = window._gamePlayer;
    if (p && this._healthFill) {
      const hp  = Math.max(0, Math.round(p.hp ?? 0));
      const mhp = Math.max(1, Math.round(p.maxHp ?? 100));
      this._healthFill.style.width = (100 * hp / mhp) + '%';
      this._healthN.textContent = hp;
      const sh  = Math.max(0, Math.round(p.shield ?? 0));
      const msh = Math.max(1, Math.round(p.maxShield ?? 100));
      this._shieldFill.style.width = (100 * sh / msh) + '%';
      this._shieldN.textContent = sh;
    }

    // Kills / wave: do CombatDirector (modo horda)
    const cd = window._combatDirector;
    if (cd && this._waveN) {
      if (Number.isFinite(cd.wave))    this._waveN.textContent = cd.wave;
      if (Number.isFinite(cd._kills))  this._killsN.textContent = cd._kills;
    }

    // Vivos: jogadores não-mortos na sala (MP). Solo = 1.
    const cs = window._cs;
    if (cs?.state?.players && this._aliveN) {
      let alive = 0;
      cs.state.players.forEach((pl) => { if (!pl.dead) alive++; });
      this._aliveN.textContent = Math.max(1, alive);
    }
  }
}
