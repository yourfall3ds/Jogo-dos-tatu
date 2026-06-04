// ─────────────────────────────────────────────────────────────────
//  TerrainEditorUI — HUD do editor de terreno (pincel) + input.
//
//  Botão flutuante "🏔 Terreno" liga/desliga o modo. No modo edição:
//   • solta o pointer-lock (cursor visível) → editar com o mouse, sem atirar;
//   • painel com PINCEL: modo (Levantar/Abaixar/Suavizar/Achatar/Pintar),
//     TAMANHO (raio), FORÇA/OPACIDADE e COR (no Pintar);
//   • segurar o botão esquerdo no terreno aplica o pincel; soltar finaliza.
//
//  update(dt) é chamado pelo loop: enquanto o botão está pressionado e o modo
//  está ativo, aplica o pincel no ponto sob o cursor.
// ─────────────────────────────────────────────────────────────────
export class TerrainEditorUI {
  constructor(terrain, scene) {
    this.terrain = terrain;
    this.scene = scene;
    this._down = false;
    this._build();
    this._wirePointer();
  }

  _build() {
    // Botão toggle (sempre visível)
    const btn = document.createElement('button');
    btn.id = 'terrain-toggle';
    btn.textContent = '🏔 Terreno';
    btn.style.cssText = `
      position: fixed; top: 96px; left: 12px; z-index: 90;
      background: rgba(20,28,20,0.82); color: #bfe; border: 1px solid #4a7;
      border-radius: 8px; padding: 6px 10px; font: 700 12px 'Segoe UI', monospace;
      cursor: pointer;`;
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);
    this._btn = btn;

    // Painel do pincel (escondido até ligar)
    const el = document.createElement('div');
    el.id = 'terrain-panel';
    el.style.cssText = `
      position: fixed; top: 130px; left: 12px; z-index: 90; display: none;
      width: 220px; background: rgba(12,18,14,0.92); border: 1px solid #3a6;
      border-radius: 10px; padding: 12px; color: #cfe; font: 600 12px 'Segoe UI', monospace;`;
    const MODES = [
      ['raise', '⛰ Levantar'], ['lower', '🕳 Abaixar'], ['smooth', '〰 Suavizar'],
      ['flatten', '▭ Achatar'], ['paint', '🎨 Pintar'],
    ];
    el.innerHTML = `
      <div style="font-weight:800;color:#7fd;margin-bottom:8px;">🏔 EDITOR DE TERRENO</div>
      <div id="tr-modes" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;"></div>
      <label style="display:block;margin:6px 0 2px;">Tamanho <span id="tr-size-v">8</span>m</label>
      <input id="tr-size" type="range" min="1" max="40" step="1" value="8" style="width:100%;">
      <label style="display:block;margin:6px 0 2px;">Força / Opacidade <span id="tr-str-v">60</span>%</label>
      <input id="tr-str" type="range" min="5" max="100" step="5" value="60" style="width:100%;">
      <label style="display:block;margin:8px 0 2px;">Cor (Pintar)</label>
      <input id="tr-color" type="color" value="#735324" style="width:100%;height:26px;border:none;background:none;">
      <div style="margin-top:10px;color:#8a8;font:500 10px monospace;line-height:1.4;">
        Segure o botão ESQUERDO no terreno pra esculpir/pintar.
      </div>`;
    document.body.appendChild(el);
    this._panel = el;

    // Botões de modo
    const modesEl = el.querySelector('#tr-modes');
    this._modeBtns = {};
    for (const [id, label] of MODES) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `flex:1 0 45%;background:rgba(30,50,35,0.7);color:#cfe;border:1px solid #2a5;
        border-radius:6px;padding:5px 4px;font:600 11px monospace;cursor:pointer;`;
      b.onclick = () => this._setMode(id);
      modesEl.appendChild(b);
      this._modeBtns[id] = b;
    }
    this._setMode(this.terrain.brush.mode);

    // Sliders + cor
    const sizeEl = el.querySelector('#tr-size'), sizeV = el.querySelector('#tr-size-v');
    sizeEl.oninput = () => { this.terrain.brush.radius = +sizeEl.value; sizeV.textContent = sizeEl.value; };
    const strEl = el.querySelector('#tr-str'), strV = el.querySelector('#tr-str-v');
    strEl.oninput = () => { this.terrain.brush.strength = (+strEl.value) / 100; strV.textContent = strEl.value; };
    const colEl = el.querySelector('#tr-color');
    colEl.oninput = () => {
      const h = colEl.value;
      this.terrain.brush.color = [
        parseInt(h.slice(1, 3), 16) / 255,
        parseInt(h.slice(3, 5), 16) / 255,
        parseInt(h.slice(5, 7), 16) / 255,
      ];
    };
  }

  _setMode(id) {
    this.terrain.brush.mode = id;
    for (const [m, b] of Object.entries(this._modeBtns)) {
      b.style.background = (m === id) ? 'rgba(60,140,80,0.95)' : 'rgba(30,50,35,0.7)';
      b.style.borderColor = (m === id) ? '#6fd' : '#2a5';
    }
  }

  toggle() { this.setActive(!this.terrain.active); }

  setActive(on) {
    this.terrain.setActive(on);
    this._panel.style.display = on ? 'block' : 'none';
    this._btn.style.background = on ? 'rgba(40,110,55,0.95)' : 'rgba(20,28,20,0.82)';
    if (on) {
      // Solta o pointer-lock → cursor visível pra editar (e não atira ao clicar).
      try { document.exitPointerLock?.(); } catch (_) {}
      try { window._gameInput?.deactivate?.(); } catch (_) {}
      window._dbg?.('Editor de terreno LIGADO — segure o botão esquerdo pra esculpir/pintar', '#7fd');
    } else {
      this._down = false;
      try { window._gameInput?.activate?.(); } catch (_) {}
    }
  }

  _wirePointer() {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.terrain.active || e.button !== 0) return;
      this._down = true;
      this.terrain._flattenY = null;   // recaptura alvo do flatten nesta pincelada
    });
    window.addEventListener('pointerup', () => {
      if (this._down) { this._down = false; try { this.terrain.endStroke(); } catch (_) {} }
    });
  }

  /** Chamado pelo loop. Aplica o pincel enquanto o botão está segurado. */
  update(dt) {
    if (this.terrain.active && this._down) {
      try { this.terrain.apply(dt); } catch (_) {}
    }
  }

  dispose() {
    try { this._btn?.remove(); } catch (_) {}
    try { this._panel?.remove(); } catch (_) {}
  }
}
