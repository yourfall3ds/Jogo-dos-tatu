// quietConsole.js — DESATIVADO (Lucas pediu: liberar TODOS os logs, nada oculto).
//
// Antes este módulo silenciava prefixos de boot/assets. Isso escondia justamente
// os logs de desenvolvimento necessários pra diagnosticar a demora do boot.
// Agora NÃO filtra nada. Em vez disso, instala um RASTREADOR DE BOOT com
// timestamps (ms desde o load) e marcadores de fase, pra deixar óbvio onde o
// tempo está sendo gasto.
//
// API pública (window):
//   transfpsMark('nome')         → marca um ponto no tempo (ms desde load)
//   transfpsPhase('fase')        → marca início de fase + delta da anterior
//   transfpsBootReport()         → imprime tabela de todas as marcas
//   transfpsQuiet(...)           → NO-OP (mantido p/ compatibilidade)

const _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
const _now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - _t0;
const _ms = () => `+${_now().toFixed(0)}ms`;

const _marks = [];
let _lastPhaseT = 0;

function _mark(name) {
  const t = _now();
  _marks.push({ name, t });
  // log direto (origLog não existe mais — usamos console.log real)
  try { console.log(`%c[BOOT ${_ms()}] ${name}`, 'color:#2effb6'); } catch (_) {}
  return t;
}

function _phase(name) {
  const t = _now();
  const delta = t - _lastPhaseT;
  _lastPhaseT = t;
  _marks.push({ name: 'PHASE:' + name, t });
  try {
    console.log(`%c[BOOT ${_ms()}] ▶ FASE: ${name} (Δ ${delta.toFixed(0)}ms da anterior)`,
      'color:#ffd166;font-weight:bold');
  } catch (_) {}
  return t;
}

function _report() {
  try {
    console.log('%c════ BOOT TIMELINE ════', 'color:#2effb6;font-weight:bold');
    let prev = 0;
    for (const m of _marks) {
      const delta = m.t - prev; prev = m.t;
      console.log(`  +${m.t.toFixed(0).padStart(6)}ms  (Δ${delta.toFixed(0).padStart(5)}ms)  ${m.name}`);
    }
    console.log('%c═══════════════════════', 'color:#2effb6;font-weight:bold');
  } catch (_) {}
}

try {
  if (typeof window !== 'undefined') {
    window.transfpsMark = _mark;
    window.transfpsPhase = _phase;
    window.transfpsBootReport = _report;
    // Compat: era usado pra (des)silenciar. Agora é no-op — nada é silenciado.
    window.transfpsQuiet = () => { console.log('[logs] filtro DESATIVADO — tudo visível'); };
    window.transfpsVerbose = () => {};
    console.log('%c[logs] TODOS os logs liberados. Rastreador de boot ativo (window.transfpsBootReport()).',
      'color:#2effb6');
  }
} catch (_) {}
