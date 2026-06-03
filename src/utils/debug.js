// src/utils/debug.js
// ─────────────────────────────────────────────────────────────────────────────
// Helper de logging que respeita window._isProd.
// Em PROD: silencia log/info (mantem warn/error pra triagem rapida).
// Em DEV:  passa direto pro console.
//
// Uso:
//   import { DEBUG } from './utils/debug.js';
//   DEBUG.log('[Boot] carregou tudo');
//   DEBUG.warn('coisa esquisita'); // ainda imprime em prod
//   DEBUG.error('quebrou');        // sempre imprime
// ─────────────────────────────────────────────────────────────────────────────

const isProd = () => {
  try {
    if (typeof window !== 'undefined' && window._isProd === true) return true;
    if (typeof window !== 'undefined' && window._isProd === false) return false;
  } catch (_) {}
  // Fallback: trata localhost/127.0.0.1 como DEV; resto = PROD
  try {
    if (typeof location !== 'undefined') {
      const h = location.hostname || '';
      if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return false;
      return true;
    }
  } catch (_) {}
  return false;
};

const noop = () => {};

// Modo silencioso: oculta logs ruidosos de assets/anims/mapas pra deixar o console focado em
// erros + eventos de rede/conexão. Ativa por:
//   localStorage.setItem('TRANSFPS_QUIET','1'); location.reload();
//   ou: window._QUIET_LOGS = true; (efetivo no proximo log)
// Desativa: localStorage.removeItem('TRANSFPS_QUIET') + reload, ou window._QUIET_LOGS = false.
const QUIET_BY_DEFAULT = true; // localhost: liga por padrão (Lucas pediu)
const isQuiet = () => {
  try {
    if (typeof window !== 'undefined' && window._QUIET_LOGS === true) return true;
    if (typeof window !== 'undefined' && window._QUIET_LOGS === false) return false;
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('TRANSFPS_QUIET');
      if (v === '0') return false;
      if (v === '1') return true;
    }
  } catch (_) {}
  return QUIET_BY_DEFAULT && !isProd();
};

// Prefixos que viram ruído de boot e NÃO contam para debugar conexão/lobby/auth.
const QUIET_PATTERNS = [
  /^\[AnimLib\]/,
  /^\[ChibataMap\]/,
  /^\[NavMesh\]/,
  /^\[SkillMap\]/,
  /^\[SceneEditor\]/,
  /^\[Physics\]/,
  /^\[GFX\]/,
  /^\[Boot\]/,
  /^\[PlayerAnimator\]/,
  /^\[LobbyHall\]/,
  /^✅ loaded:/,
  /^=== /,
  /^\d+ - \[/,        // listagem numerada de animações
  /^🐭 /,
  /^=============================/,
];
const isQuietLine = (args) => {
  if (!args || !args.length) return false;
  const first = typeof args[0] === 'string' ? args[0] : '';
  for (const p of QUIET_PATTERNS) if (p.test(first)) return true;
  return false;
};

export const DEBUG = {
  log:   (...args) => {
    if (isProd()) return;
    if (isQuiet() && isQuietLine(args)) return;
    console.log(...args);
  },
  info:  (...args) => {
    if (isProd()) return;
    if (isQuiet() && isQuietLine(args)) return;
    console.info(...args);
  },
  debug: (...args) => {
    if (isProd()) return;
    if (isQuiet() && isQuietLine(args)) return;
    console.debug(...args);
  },
  // warn e error SEMPRE passam (uteis em prod pra diagnostico)
  warn:  (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  // Versao silenciosa de warn — use pra warn ruidoso de boot que nao agrega em prod
  warnDev: (...args) => { if (!isProd()) console.warn(...args); },
  isProd,
  isQuiet,
};

// Expõe helpers globais pro Lucas debugar via DevTools:
//   transfpsQuiet(false)  → liga logs verbose
//   transfpsQuiet(true)   → silencia
try {
  if (typeof window !== 'undefined') {
    window.transfpsQuiet = (on) => {
      window._QUIET_LOGS = !!on;
      try { localStorage.setItem('TRANSFPS_QUIET', on ? '1' : '0'); } catch (_) {}
      console.log('[DEBUG] quiet mode =', !!on, '— reload pra efeito completo');
    };
  }
} catch (_) {}

export default DEBUG;
