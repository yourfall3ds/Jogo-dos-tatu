// quietConsole.js
// Interceptor global de console.log/info/debug pra silenciar ruído de boot/assets.
// Importe ANTES de qualquer outro módulo no entry point.
//
// Controle:
//   localStorage.setItem('TRANSFPS_QUIET','1') → silencia (default em localhost)
//   localStorage.setItem('TRANSFPS_QUIET','0') → tudo verbose
//   window.transfpsQuiet(true/false) também funciona em runtime
//
// O que é silenciado: prefixos de boot/assets/animação/mapa.
// O que NÃO é silenciado: warn, error, e tudo que envolve [Auth], [Lobby], [CS],
// [Colyseus], [ArenaRoom], [MpGuard], [Net], conexão, sala, login, etc.

const QUIET_PATTERNS = [
  /^\[AnimLib\]/,
  /^\[ChibataMap\]/,
  /^\[NavMesh\]/,
  /^\[SkillMap\]/,
  /^\[SceneEditor\]/,
  /^\[Physics\]/,
  /^\[GFX\]/,
  /^\[PlayerAnimator\]/,
  /^\[LobbyHall\]/,
  /^\[Boot\]/,
  /^\[Asset/,
  /^\[Music/,
  /^✅ loaded:/,
  /^=== /,
  /^\d+ - \[/,
  /^🐭 /,
  /^=============================/,
];

const isProdHost = () => {
  try {
    const h = location.hostname || '';
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')) return false;
    return true;
  } catch (_) { return false; }
};

const readQuietPref = () => {
  try {
    if (typeof window !== 'undefined' && window._QUIET_LOGS === true) return true;
    if (typeof window !== 'undefined' && window._QUIET_LOGS === false) return false;
    const v = localStorage.getItem('TRANSFPS_QUIET');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (_) {}
  // Default: em localhost, silencia (Lucas pediu). Em prod já é silencioso por outro caminho.
  return !isProdHost();
};

const isQuietLine = (args) => {
  if (!args || !args.length) return false;
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (!first) return false;
  for (const p of QUIET_PATTERNS) if (p.test(first)) return true;
  return false;
};

const origLog = console.log.bind(console);
const origInfo = console.info.bind(console);
const origDebug = console.debug.bind(console);

console.log = function (...args) {
  if (readQuietPref() && isQuietLine(args)) return;
  origLog(...args);
};
console.info = function (...args) {
  if (readQuietPref() && isQuietLine(args)) return;
  origInfo(...args);
};
console.debug = function (...args) {
  if (readQuietPref() && isQuietLine(args)) return;
  origDebug(...args);
};

// console.warn e console.error NÃO são interceptados.

try {
  if (typeof window !== 'undefined') {
    window.transfpsQuiet = (on) => {
      window._QUIET_LOGS = !!on;
      try { localStorage.setItem('TRANSFPS_QUIET', on ? '1' : '0'); } catch (_) {}
      origLog('[QuietConsole] quiet =', !!on, '— reload pra efeito completo');
    };
    window.transfpsVerbose = () => window.transfpsQuiet(false);
    origLog('[QuietConsole] ativo. window.transfpsQuiet(false) pra ver tudo.');
  }
} catch (_) {}
