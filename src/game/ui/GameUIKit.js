// ─────────────────────────────────────────────────────────────────
//  GameUIKit — DESIGN SYSTEM CENTRAL cyberpunk do TransFPS
//  Estilo: Cyberpunk HUD (Valorant / Apex / Cyberpunk 2077)
//  neon, dark, paineis angulares (clip-path chanfrado), glow cyan,
//  scanlines sutis, fontes sci-fi (Share Tech Mono / Fira Code).
//
//  Paleta: CYBER-CYAN (#2effb6) + fundos escuros (#0a0f1e / #050a18)
//  + acento vermelho de marca (#ff3b4e) so para perigo/CTA critico.
//  PROIBIDO pink/rosa/roxo.
//
//  API:
//    injectGameUI()            -> injeta fontes + tokens + classes 1x
//    panel(html, opts)         -> <div class="gui-panel">
//    button(label, onClick, o) -> <button class="gui-btn">
//    card(html, opts)          -> <div class="gui-card">
//
//  Performance: CSS puro (clip-path / gradient / box-shadow), zero
//  framework, zero imagem pesada. Acessivel: contraste, cursor, focus.
// ─────────────────────────────────────────────────────────────────

const STYLE_ID = 'transfps-game-ui-kit';

/**
 * Injeta UMA vez no <head>: @import das fontes + <style> com tokens
 * CSS (variaveis) e classes de componentes reutilizaveis.
 * Idempotente — chamar quantas vezes quiser.
 */
export function injectGameUI() {
  if (typeof document === 'undefined') return false;
  if (document.getElementById(STYLE_ID)) return false; // ja injetado

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  // <head> de preferencia; cai no <html> se o head ainda nao existe
  (document.head || document.documentElement).appendChild(style);
  return true;
}

// ── Helpers JS — retornam elementos DOM ja com as classes ──────────

/**
 * panel(html, opts) -> painel angular com glow + scanline.
 * opts: { className, id, glow:'cyan'|'danger', tag='div', ...attrs }
 */
export function panel(html = '', opts = {}) {
  injectGameUI();
  const { className = '', id, glow, tag = 'div', dataset, ...rest } = opts;
  const el = document.createElement(tag);
  el.className = ['gui-panel', glow === 'danger' ? 'gui-glow-danger' : '', className]
    .filter(Boolean).join(' ');
  if (id) el.id = id;
  if (typeof html === 'string') el.innerHTML = html;
  else if (html instanceof Node) el.appendChild(html);
  _applyAttrs(el, rest, dataset);
  return el;
}

/**
 * button(label, onClick, opts) -> botao de jogo angular com glow.
 * opts: { primary:true (o JOGAR grandao pulsante), variant:'danger',
 *         disabled, className, id, type='button', ...attrs }
 */
export function button(label = '', onClick, opts = {}) {
  injectGameUI();
  const {
    primary = false, variant, disabled = false, className = '',
    id, type = 'button', dataset, ...rest
  } = opts;
  const el = document.createElement('button');
  el.type = type;
  el.className = [
    'gui-btn',
    primary ? 'gui-btn-primary' : '',
    variant === 'danger' ? 'gui-btn-danger' : '',
    className,
  ].filter(Boolean).join(' ');
  if (id) el.id = id;
  if (typeof label === 'string') el.innerHTML = label;
  else if (label instanceof Node) el.appendChild(label);
  if (disabled) el.disabled = true;
  if (typeof onClick === 'function') el.addEventListener('click', onClick);
  _applyAttrs(el, rest, dataset);
  return el;
}

/**
 * card(html, opts) -> card de lista com hover glow.
 * opts: { onClick, active, className, id, glow:'danger', ...attrs }
 */
export function card(html = '', opts = {}) {
  injectGameUI();
  const { onClick, active = false, className = '', id, glow, dataset, ...rest } = opts;
  const el = document.createElement('div');
  el.className = [
    'gui-card',
    active ? 'is-active' : '',
    glow === 'danger' ? 'gui-glow-danger' : '',
    className,
  ].filter(Boolean).join(' ');
  if (id) el.id = id;
  if (typeof html === 'string') el.innerHTML = html;
  else if (html instanceof Node) el.appendChild(html);
  if (typeof onClick === 'function') {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.style.cursor = 'pointer';
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
    });
  }
  _applyAttrs(el, rest, dataset);
  return el;
}

function _applyAttrs(el, attrs, dataset) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    el.setAttribute(k, v);
  }
  for (const [k, v] of Object.entries(dataset || {})) {
    el.dataset[k] = v;
  }
}

// Tokens exportados pra JS (mesmo valores das CSS vars) — pratico pra
// canvas/three.js ou estilos inline pontuais.
export const TOKENS = Object.freeze({
  cyan: '#2effb6',
  cyanDim: '#1bbf8a',
  bg: '#050a18',
  bg2: '#0a0f1e',
  panel: 'rgba(10,16,30,0.92)',
  glow: 'rgba(46,255,182,0.55)',
  danger: '#ff3b4e',
  text: '#dfeaf2',
  textDim: '#7e93a6',
  font: {
    heading: "'Share Tech Mono', 'Fira Code', monospace",
    body: "'Fira Code', 'Share Tech Mono', monospace",
  },
});

// ── CSS (tokens + componentes) ─────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Fira+Code:wght@400;500;600;700&display=swap');

:root {
  /* cores */
  --cy-cyan: #2effb6;
  --cy-cyan-dim: #1bbf8a;
  --cy-cyan-soft: rgba(46,255,182,0.14);
  --cy-bg: #050a18;
  --cy-bg-2: #0a0f1e;
  --cy-panel: rgba(10,16,30,0.92);
  --cy-panel-2: rgba(8,13,26,0.96);
  --cy-glow: rgba(46,255,182,0.55);
  --cy-glow-soft: rgba(46,255,182,0.22);
  --cy-danger: #ff3b4e;
  --cy-danger-glow: rgba(255,59,78,0.5);
  --cy-text: #dfeaf2;
  --cy-text-dim: #7e93a6;
  --cy-line: rgba(46,255,182,0.28);

  /* fontes sci-fi (fontes de JOGO, nao web) */
  --cy-font-head: 'Share Tech Mono', 'Fira Code', monospace;
  --cy-font-body: 'Fira Code', 'Share Tech Mono', monospace;

  /* espacamento */
  --cy-sp-1: 4px;
  --cy-sp-2: 8px;
  --cy-sp-3: 12px;
  --cy-sp-4: 16px;
  --cy-sp-5: 24px;
  --cy-sp-6: 32px;

  /* geometria angular (chanfro do clip-path) */
  --cy-chamfer: 14px;
  --cy-radius: 4px;

  /* z-index scale */
  --cy-z-base: 1000;
  --cy-z-panel: 5000;
  --cy-z-overlay: 8000;
  --cy-z-modal: 9000;
  --cy-z-toast: 9500;
  --cy-z-cursor: 9999;

  /* transicoes */
  --cy-t-fast: 120ms cubic-bezier(.2,.7,.2,1);
  --cy-t: 180ms cubic-bezier(.2,.7,.2,1);
}

/* ── PAINEL angular com borda glow + scanline sutil ─────────────── */
.gui-panel {
  position: relative;
  background:
    linear-gradient(180deg, rgba(46,255,182,0.05), transparent 120px),
    var(--cy-panel);
  color: var(--cy-text);
  font-family: var(--cy-font-body);
  border: 1px solid var(--cy-line);
  padding: var(--cy-sp-4);
  /* chanfro nos cantos opostos = cara de HUD */
  clip-path: polygon(
    var(--cy-chamfer) 0, 100% 0,
    100% calc(100% - var(--cy-chamfer)),
    calc(100% - var(--cy-chamfer)) 100%,
    0 100%, 0 var(--cy-chamfer)
  );
  box-shadow:
    0 0 0 1px rgba(46,255,182,0.10),
    0 0 22px rgba(0,0,0,0.55),
    inset 0 0 24px rgba(46,255,182,0.05);
  backdrop-filter: blur(6px);
}
/* scanline sutil por cima do painel */
.gui-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(46,255,182,0.05) 0px,
    rgba(46,255,182,0.05) 1px,
    transparent 2px,
    transparent 4px
  );
  opacity: 0.35;
  mix-blend-mode: screen;
}
/* fina borda glow superior (acento de HUD) */
.gui-panel::after {
  content: '';
  position: absolute;
  left: var(--cy-chamfer); right: 0; top: 0; height: 2px;
  background: linear-gradient(90deg, var(--cy-cyan), transparent 70%);
  box-shadow: 0 0 10px var(--cy-glow);
  pointer-events: none;
}
.gui-panel.gui-glow-danger { border-color: rgba(255,59,78,0.4); }
.gui-panel.gui-glow-danger::after {
  background: linear-gradient(90deg, var(--cy-danger), transparent 70%);
  box-shadow: 0 0 10px var(--cy-danger-glow);
}

/* ── BOTAO de jogo: angular, glow, hover sobe ───────────────────── */
.gui-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cy-sp-2);
  font-family: var(--cy-font-head);
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--cy-cyan);
  background: linear-gradient(180deg, rgba(46,255,182,0.10), rgba(46,255,182,0.03));
  border: 1px solid var(--cy-line);
  padding: 10px 22px;
  cursor: pointer;
  user-select: none;
  /* chanfro nos cantos diagonais */
  clip-path: polygon(
    10px 0, 100% 0, 100% calc(100% - 10px),
    calc(100% - 10px) 100%, 0 100%, 0 10px
  );
  box-shadow: 0 0 0 1px rgba(46,255,182,0.08), inset 0 0 12px rgba(46,255,182,0.05);
  text-shadow: 0 0 8px var(--cy-glow-soft);
  transition: color var(--cy-t), background var(--cy-t),
              box-shadow var(--cy-t), transform var(--cy-t-fast);
}
.gui-btn:hover:not(:disabled) {
  color: var(--cy-bg);
  background: linear-gradient(180deg, var(--cy-cyan), var(--cy-cyan-dim));
  box-shadow: 0 0 16px var(--cy-glow), 0 0 32px var(--cy-glow-soft),
              inset 0 0 8px rgba(255,255,255,0.25);
  text-shadow: none;
  transform: translateY(-1px);
}
.gui-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
.gui-btn:focus-visible {
  outline: 2px solid var(--cy-cyan);
  outline-offset: 3px;
}
.gui-btn:disabled {
  color: var(--cy-text-dim);
  background: rgba(126,147,166,0.06);
  border-color: rgba(126,147,166,0.18);
  box-shadow: none;
  text-shadow: none;
  cursor: not-allowed;
  opacity: 0.55;
}

/* botao perigo (vermelho de marca) */
.gui-btn-danger {
  color: var(--cy-danger);
  border-color: rgba(255,59,78,0.4);
  background: linear-gradient(180deg, rgba(255,59,78,0.12), rgba(255,59,78,0.03));
}
.gui-btn-danger:hover:not(:disabled) {
  color: #fff;
  background: linear-gradient(180deg, var(--cy-danger), #b3202f);
  box-shadow: 0 0 16px var(--cy-danger-glow), 0 0 32px rgba(255,59,78,0.25);
}

/* ── BOTAO PRIMARIO: o JOGAR grandao, pulsante ──────────────────── */
.gui-btn-primary {
  font-size: 20px;
  letter-spacing: 4px;
  padding: 16px 56px;
  color: var(--cy-bg);
  background: linear-gradient(180deg, var(--cy-cyan), var(--cy-cyan-dim));
  border: none;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  box-shadow: 0 0 18px var(--cy-glow), 0 0 44px var(--cy-glow-soft),
              inset 0 0 14px rgba(255,255,255,0.30);
  animation: gui-pulse 1.8s ease-in-out infinite;
  clip-path: polygon(
    16px 0, 100% 0, 100% calc(100% - 16px),
    calc(100% - 16px) 100%, 0 100%, 0 16px
  );
}
.gui-btn-primary:hover:not(:disabled) {
  color: var(--cy-bg);
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 0 28px var(--cy-glow), 0 0 64px var(--cy-glow),
              inset 0 0 18px rgba(255,255,255,0.45);
  animation-play-state: paused;
}
.gui-btn-primary:disabled { animation: none; }
@keyframes gui-pulse {
  0%, 100% { box-shadow: 0 0 18px var(--cy-glow-soft), 0 0 40px rgba(46,255,182,0.10),
                         inset 0 0 14px rgba(255,255,255,0.25); }
  50%      { box-shadow: 0 0 26px var(--cy-glow), 0 0 60px var(--cy-glow-soft),
                         inset 0 0 18px rgba(255,255,255,0.40); }
}

/* ── CARD de lista com hover glow ───────────────────────────────── */
.gui-card {
  position: relative;
  background: linear-gradient(180deg, rgba(46,255,182,0.04), transparent), var(--cy-bg-2);
  color: var(--cy-text);
  font-family: var(--cy-font-body);
  border: 1px solid rgba(46,255,182,0.16);
  border-left: 3px solid transparent;
  padding: var(--cy-sp-3) var(--cy-sp-4);
  margin: 6px 0;
  clip-path: polygon(
    8px 0, 100% 0, 100% calc(100% - 8px),
    calc(100% - 8px) 100%, 0 100%, 0 8px
  );
  transition: background var(--cy-t), border-color var(--cy-t),
              box-shadow var(--cy-t), transform var(--cy-t-fast);
}
.gui-card:hover {
  background: linear-gradient(180deg, rgba(46,255,182,0.10), transparent), var(--cy-bg-2);
  border-left-color: var(--cy-cyan);
  box-shadow: 0 0 18px rgba(46,255,182,0.18), inset 0 0 14px rgba(46,255,182,0.05);
  transform: translateX(3px);
}
.gui-card:focus-visible { outline: 2px solid var(--cy-cyan); outline-offset: 2px; }
.gui-card.is-active {
  border-left-color: var(--cy-cyan);
  background: linear-gradient(180deg, var(--cy-cyan-soft), transparent), var(--cy-bg-2);
  box-shadow: 0 0 20px rgba(46,255,182,0.22);
}
.gui-card.gui-glow-danger { border-left-color: var(--cy-danger); }
.gui-card.gui-glow-danger:hover {
  border-left-color: var(--cy-danger);
  box-shadow: 0 0 18px var(--cy-danger-glow);
}

/* ── HEADER HUD (titulo com text-shadow neon + letterspacing) ───── */
.gui-header {
  font-family: var(--cy-font-head);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--cy-cyan);
  text-shadow: 0 0 8px var(--cy-glow), 0 0 18px var(--cy-glow-soft);
  margin: 0;
  padding-bottom: var(--cy-sp-2);
  border-bottom: 1px solid var(--cy-line);
  display: flex; align-items: center; gap: var(--cy-sp-2);
}

/* ── TITLE display grande ───────────────────────────────────────── */
.gui-title {
  font-family: var(--cy-font-head);
  font-size: 44px;
  font-weight: 400;
  letter-spacing: 6px;
  text-transform: uppercase;
  line-height: 1.05;
  color: var(--cy-text);
  text-shadow: 0 0 12px var(--cy-glow), 0 0 28px var(--cy-glow-soft),
               0 2px 0 rgba(0,0,0,0.4);
  margin: 0;
}
.gui-title > .accent { color: var(--cy-cyan); }

/* ── utilitarios texto ──────────────────────────────────────────── */
.gui-dim   { color: var(--cy-text-dim); font-size: 11px; letter-spacing: 1px; }
.gui-mono  { font-family: var(--cy-font-body); font-variant-numeric: tabular-nums; }
.gui-danger-text { color: var(--cy-danger); text-shadow: 0 0 8px var(--cy-danger-glow); }

/* ── scrollbar cyber ────────────────────────────────────────────── */
.gui-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.gui-scroll::-webkit-scrollbar-track { background: rgba(46,255,182,0.04); }
.gui-scroll::-webkit-scrollbar-thumb {
  background: var(--cy-cyan-dim); border-radius: 3px;
  box-shadow: 0 0 6px var(--cy-glow-soft);
}

/* ── scanline global sutil (opcional) ───────────────────────────── */
/* adicione a classe .gui-scanlines no <body> ou num overlay fixo    */
.gui-scanlines::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: var(--cy-z-overlay);
  background: repeating-linear-gradient(
    0deg,
    rgba(0,0,0,0.10) 0px,
    rgba(0,0,0,0.10) 1px,
    transparent 2px,
    transparent 3px
  );
  opacity: 0.30;
  mix-blend-mode: multiply;
}

/* respeita usuarios que pedem menos movimento */
@media (prefers-reduced-motion: reduce) {
  .gui-btn-primary { animation: none; }
  .gui-btn, .gui-card { transition: none; }
}
`;

export default { injectGameUI, panel, button, card, TOKENS };
