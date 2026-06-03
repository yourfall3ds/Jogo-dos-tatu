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

export const DEBUG = {
  log:   (...args) => { if (!isProd()) console.log(...args); },
  info:  (...args) => { if (!isProd()) console.info(...args); },
  debug: (...args) => { if (!isProd()) console.debug(...args); },
  // warn e error SEMPRE passam (uteis em prod pra diagnostico)
  warn:  (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  // Versao silenciosa de warn — use pra warn ruidoso de boot que nao agrega em prod
  warnDev: (...args) => { if (!isProd()) console.warn(...args); },
  isProd,
};

export default DEBUG;
