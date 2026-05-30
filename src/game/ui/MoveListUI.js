import { MOVE_LIST } from '../animation/animationNames.js';

// ─────────────────────────────────────────────────────────────────
//  MoveListUI — painel flutuante com todos os moves disponíveis
//  Tecla M abre/fecha. Mostra combo count e input ativo.
// ─────────────────────────────────────────────────────────────────
export class MoveListUI {
  constructor(player) {
    this.player  = player;
    this._visible = false;
    this._wasM    = false;

    this._build();
  }

  _build() {
    // Container principal
    const el = document.createElement('div');
    el.id = 'move-list-panel';
    el.style.cssText = `
      position: fixed; top: 50%; right: 20px; transform: translateY(-50%);
      width: 320px; max-height: 80vh; overflow-y: auto;
      background: rgba(10,10,20,0.92); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px; padding: 14px; font-family: monospace;
      color: #e0e0e0; font-size: 12px; display: none;
      backdrop-filter: blur(8px); box-shadow: 0 4px 32px rgba(0,0,0,0.6);
      z-index: 500;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#ff9900;margin-bottom:10px;text-align:center;letter-spacing:1px;';
    title.textContent = '⚔️  MOVE LIST  [M]';
    el.appendChild(title);

    // Combo counter (atualizado dinamicamente)
    this._comboEl = document.createElement('div');
    this._comboEl.id = 'move-combo-counter';
    this._comboEl.style.cssText = 'text-align:center;font-size:18px;font-weight:bold;color:#44ff99;margin-bottom:8px;min-height:24px;';
    el.appendChild(this._comboEl);

    const categories = {
      movimento: { label: '🏃 Movimento',    color: '#66ccff' },
      soco:      { label: '👊 Socos (LMB)',   color: '#ffaa44' },
      chute:     { label: '🦵 Chutes (RMB)',  color: '#ff6666' },
      cross:     { label: '🔀 Cross Combo',   color: '#ff44ff' },
      espada:    { label: '⚔️  Espada',        color: '#ffee44' },
      arma:      { label: '🔫 Arma de Fogo',  color: '#88ff88' },
      parkour:   { label: '🧗 Parkour',       color: '#44ffff' },
    };

    const byCategory = {};
    for (const move of MOVE_LIST) {
      if (!byCategory[move.category]) byCategory[move.category] = [];
      byCategory[move.category].push(move);
    }

    for (const [cat, info] of Object.entries(categories)) {
      const moves = byCategory[cat];
      if (!moves?.length) continue;

      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:10px;';

      const header = document.createElement('div');
      header.style.cssText = `color:${info.color};font-weight:bold;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:3px;`;
      header.textContent = info.label;
      section.appendChild(header);

      for (const move of moves) {
        const row = document.createElement('div');
        row.dataset.anim = move.anim || '';
        row.style.cssText = `
          display:flex;justify-content:space-between;align-items:center;
          padding:3px 4px;border-radius:4px;margin:1px 0;
          opacity:${move.pendente ? '0.45' : '1'};
          transition:background 0.15s;
        `;

        const inputSpan = document.createElement('span');
        inputSpan.style.cssText = `
          background:rgba(255,255,255,0.1);padding:1px 6px;
          border-radius:3px;font-size:10px;color:#fff;white-space:nowrap;
          border:1px solid rgba(255,255,255,0.2);
        `;
        inputSpan.textContent = move.input;

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;margin-left:8px;color:#ccc;';
        nameSpan.textContent = move.pendente ? `${move.name} ⏳` : move.name;

        row.appendChild(inputSpan);
        row.appendChild(nameSpan);
        section.appendChild(row);
      }

      el.appendChild(section);
    }

    // Nota sobre FBX
    const note = document.createElement('div');
    note.style.cssText = 'color:#888;font-size:10px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;';
    note.textContent = '⏳ = Converta os .fbx da pasta Chutes/ para .glb para ativar.';
    el.appendChild(note);

    document.body.appendChild(el);
    this._el = el;
  }

  show() {
    this._visible = true;
    this._el.style.display = 'block';
  }

  hide() {
    this._visible = false;
    this._el.style.display = 'none';
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  // Destaca a animação ativa no combo
  highlightAnim(animName) {
    const rows = this._el.querySelectorAll('[data-anim]');
    rows.forEach(row => {
      row.style.background = row.dataset.anim === animName
        ? 'rgba(255,153,0,0.25)'
        : '';
    });
  }

  update(dt) {
    // Toggle com M
    const mNow = window._gameInput?.isDown('KeyM');
    if (mNow && !this._wasM) this.toggle();
    this._wasM = mNow;

    // Combo counter
    if (this._comboEl && this.player.comboSystem) {
      const count = this.player.comboSystem.getComboCount?.() ?? 0;
      if (count > 0) {
        const isCross = this.player.comboSystem.isCrossCombo?.();
        this._comboEl.textContent = isCross
          ? `🔀 CROSS COMBO ×${count}`
          : `💥 COMBO ×${count}`;
        this._comboEl.style.color = isCross ? '#ff44ff' : '#44ff99';
      } else {
        this._comboEl.textContent = '';
      }
    }
  }
}
