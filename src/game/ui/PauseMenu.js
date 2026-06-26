// ─────────────────────────────────────────────────────────────────
//  PauseMenu — menu de pausa estilo battle-royale (arte original).
//  Abre no ESC via ScreenFocusManager.enterMenu() → o cursor SEMPRE
//  funciona (sem o limbo antigo). Botões grandes: Retomar, Config, Sair.
//  Também ADOTA os botões que hoje ficam soltos/sobrepostos no canto da
//  tela (Terreno, Interativos, Servidor, mudo, Horda) — eles saem da
//  tela de jogo e vêm pra cá, organizados numa fileira de ferramentas.
// ─────────────────────────────────────────────────────────────────
export class PauseMenu {
  constructor() {
    this._open = false;
    this._build();
  }

  _build() {
    const ov = document.createElement('div');
    ov.id = 'fn-pause';
    ov.className = 'fn-pause-overlay';
    ov.style.cssText = `
      position: fixed; inset: 0; z-index: 200; display: none;
      background: rgba(4, 8, 16, 0.72); backdrop-filter: blur(4px);
      align-items: center; justify-content: center;`;
    ov.innerHTML = `
      <div class="fn-panel fn-pause-panel" style="
        width: min(460px, 92vw); padding: 28px;">
        <div style="font: 700 28px/1 'Oswald','Segoe UI',sans-serif;
          letter-spacing: 3px; text-transform: uppercase; color: #fff;
          text-align: center; margin-bottom: 22px;">Pausado</div>
        <div id="fn-pause-actions" style="display:flex;flex-direction:column;gap:10px;"></div>
        <div id="fn-pause-tools" style="display:flex;flex-wrap:wrap;gap:8px;
          margin-top: 20px; padding-top: 16px;
          border-top: 1px solid var(--fn-stroke);"></div>
      </div>`;
    document.body.appendChild(ov);
    this._ov = ov;
    this._actions = ov.querySelector('#fn-pause-actions');
    this._tools = ov.querySelector('#fn-pause-tools');

    // Botões de ação padrão.
    this.addAction('Retomar', () => {
      this.hide();
      window._screenFocus?.enterPlaying();
      window._gameInput?.activate?.(true);
      // se há overlay de pause legado aberto, fecha junto
      try { document.getElementById('pause-overlay')?.classList.remove('visible'); } catch (_) {}
    });
    this.addAction('Configurações', () => {
      window._settingsUI?.show?.() || window._settingsUI?.open?.();
    });
    this.addAction('Sair pro lobby', () => {
      try { location.reload(); } catch (_) {}
    });

    // Fechar clicando no fundo escuro (fora do painel).
    ov.addEventListener('mousedown', (e) => {
      if (e.target === ov) {
        this.hide();
        window._screenFocus?.enterPlaying();
        window._gameInput?.activate?.(true);
      }
    });
  }

  /** Cria um botão de ação grande no menu. Retorna o elemento. */
  addAction(label, onClick) {
    const b = document.createElement('button');
    b.className = 'fn-btn';
    b.textContent = label;
    b.style.width = '100%';
    b.addEventListener('click', onClick);
    this._actions.appendChild(b);
    return b;
  }

  /** Move um botão já existente (Terreno/Interativos/…) pra dentro do menu.
   *  Aceita um elemento DOM ou um id (string). Idempotente. */
  adoptTool(elOrId) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return null;
    // tira o posicionamento fixo que ele tinha solto na tela
    el.style.position = 'static';
    el.style.left = el.style.right = el.style.top = el.style.bottom = 'auto';
    el.style.transform = 'none';
    this._tools.appendChild(el);
    return el;
  }

  show() {
    if (this._open) return;             // idempotente (dois caminhos podem chamar)
    this._ov.style.display = 'flex';
    this._open = true;
    this._openedAt = performance.now();
  }

  hide() {
    this._ov.style.display = 'none';
    this._open = false;
  }

  get isOpen() { return this._open; }

  /** true se acabou de abrir (< 200ms). Evita o ESC fechar o que acabou de
   *  abrir quando os DOIS caminhos (keydown + pointerlockchange) disparam no
   *  mesmo press — era a causa do "tem que apertar ESC 2x". */
  get justOpened() {
    return this._open && (performance.now() - (this._openedAt || 0) < 200);
  }
}
