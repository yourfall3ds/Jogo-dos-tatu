// ─────────────────────────────────────────────────────────────────
//  WorldLoadScreen — tela de carregamento ao entrar no mundo de biomas.
//   • foto de fundo (placeholder até o Lucas colocar a arte)
//   • barra de progresso (0..100%) + texto de fase
//   • aparece full-screen por cima de tudo; some quando o mundo carrega
//
//  Pra trocar a foto: edite WORLD_LOAD_IMAGE abaixo (caminho de um
//  arquivo em assets/, ex 'assets/ui/world-load.jpg').
// ─────────────────────────────────────────────────────────────────

// PLACEHOLDER — troque pelo caminho da sua foto quando tiver.
const WORLD_LOAD_IMAGE = 'assets/ui/world-load.jpg';

export class WorldLoadScreen {
  constructor() { this._build(); }

  _build() {
    const ov = document.createElement('div');
    ov.id = 'world-load';
    ov.style.cssText = `
      position: fixed; inset: 0; z-index: 9000; display: none;
      flex-direction: column; align-items: center; justify-content: flex-end;
      background: #05070d center/cover no-repeat;
      color: #fff; font-family: 'Oswald','Segoe UI',sans-serif;`;
    ov.innerHTML = `
      <!-- camada da foto (com fallback de gradiente se a img faltar) -->
      <div id="wl-photo" style="position:absolute;inset:0;
        background:linear-gradient(160deg,#0a1426,#1a0a1e 60%,#04060c);
        background-size:cover;background-position:center;"></div>
      <!-- escurecedor pra leitura -->
      <div style="position:absolute;inset:0;
        background:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.85));"></div>

      <div style="position:relative;z-index:2;width:min(680px,86vw);
        text-align:center;margin-bottom:9vh;">
        <div id="wl-title" style="font-weight:700;font-size:34px;letter-spacing:5px;
          text-transform:uppercase;text-shadow:0 2px 14px #000;">Mundo Selvagem</div>
        <div id="wl-phase" style="margin:14px 0 10px;font-size:15px;color:#bcd;
          letter-spacing:1px;text-shadow:0 1px 4px #000;">preparando…</div>
        <div style="height:12px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);
          border-radius:7px;overflow:hidden;">
          <div id="wl-bar" style="height:100%;width:0%;
            background:linear-gradient(90deg,#5cc8ff,#9b6bff);
            box-shadow:0 0 12px #5cc8ff;transition:width .25s ease;"></div>
        </div>
        <div id="wl-pct" style="margin-top:8px;font-size:13px;color:#9ab;">0%</div>
      </div>`;
    document.body.appendChild(ov);
    this._ov = ov;
    this._photo = ov.querySelector('#wl-photo');
    this._bar = ov.querySelector('#wl-bar');
    this._pct = ov.querySelector('#wl-pct');
    this._phase = ov.querySelector('#wl-phase');

    // tenta carregar a foto; se existir, aplica como fundo (sem quebrar se faltar)
    const img = new Image();
    img.onload = () => { this._photo.style.backgroundImage = `url('${WORLD_LOAD_IMAGE}')`; };
    img.onerror = () => { /* mantém o gradiente de fallback */ };
    img.src = WORLD_LOAD_IMAGE;
  }

  show(title) {
    if (title) this._ov.querySelector('#wl-title').textContent = title;
    this._ov.style.display = 'flex';
    this.setProgress(0, 'preparando…');
  }

  /** progress: 0..1 ; phase: texto curto da fase atual */
  setProgress(progress, phase) {
    const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    this._bar.style.width = pct + '%';
    this._pct.textContent = pct + '%';
    if (phase) this._phase.textContent = phase;
  }

  hide() { this._ov.style.display = 'none'; }
}
