// ─────────────────────────────────────────────────────────────────
//  TransFPS — Launcher Electron de DEV
//
//  Resolve os problemas do navegador pra jogar/testar localmente:
//   • POINTER LOCK REAL: o mouse fica 100% travado no jogo, não escapa da
//     tela nem clica em coisas do Windows (era o maior problema no Chrome).
//   • ESC PAUSA: o ESC não some com o lock de forma traiçoeira — o jogo
//     decide o pause; o Electron só repassa o ESC pro jogo.
//   • SEM ATALHOS QUE ATRAPALHAM: Ctrl+W (fechar — o vilão do agachar+correr),
//     Ctrl+Q/N/T/P/F/G, zoom e Alt+setas são BLOQUEADOS. Ctrl+W NÃO fecha.
//   • LOGS NO TERMINAL: todo console.log/erro do jogo é cuspido no terminal
//     onde você rodou `npm start` — fácil de ler e copiar.
//   • DEV (habilitados): F5 / Ctrl+R = reload · Ctrl+Shift+R = hard reload ·
//     F12 / Ctrl+Shift+I = DevTools · F11 = fullscreen.
//
//  Uso:
//    cd tools/electron-dev && npm install && npm start         (prod)
//    npm run local                                             (localhost:5500)
//    TRANSFPS_URL=<url> npm start                              (url custom)
// ─────────────────────────────────────────────────────────────────

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const GAME_URL = process.env.TRANSFPS_URL || 'https://app.overpixel.online/transfps/';

// Silencia os "Electron Security Warning" (enableBlinkFeatures/CSP) — são só
//  avisos de dev, não erros, e poluíam o terminal de logs do jogo.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// ── GPU: só o que é seguro e comprovadamente ajuda ──────────────────────
//  REMOVIDAS as flags agressivas (disable-frame-rate-limit tirava o vsync e
//  sobrecarregava a GPU; enable-unsafe-webgpu forçava caminho instável) que
//  podiam fazer o jogo LAGAR só de abrir. Mantido o essencial e seguro:
app.commandLine.appendSwitch('ignore-gpu-blocklist');  // usa a GPU mesmo se a lista barra
app.disableDomainBlockingFor3DAPIs();                  // 3D não trava por "domínio"

let win = null;

// Cores ANSI pra deixar os logs do jogo legíveis no terminal.
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m',
  cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', gray: '\x1b[90m',
};
const LEVEL_COLOR = { log: C.gray, info: C.cyan, warning: C.yellow, error: C.red };

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 576,
    backgroundColor: '#05070d',
    title: 'TransFPS',
    show: false,                      // só mostra quando pronto (sem flash branco)
    autoHideMenuBar: true,            // sem barra de menu (File/Edit/etc)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,    // NÃO desacelera quando perde foco
      // ── otimizações de jogo ──
      enableBlinkFeatures: 'PointerLock', // pointer lock direto, sem fricção
      v8CacheOptions: 'code',         // cacheia o JS compilado → boot mais rápido
      spellcheck: false,              // jogo não precisa de corretor
    },
  });

  // Sobe maximizado e só aparece quando o conteúdo está pronto (sem tela branca).
  win.maximize();
  win.once('ready-to-show', () => win.show());

  // Sem menu nativo → Alt não abre menu, e atalhos de menu não existem.
  win.setMenu(null);

  // ── LOGS DO JOGO → TERMINAL ────────────────────────────────────────
  //  Captura console.log/info/warn/error da página e imprime no terminal,
  //  com cor por nível e a origem (arquivo:linha). É o "cospe logs" pedido.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // level: 0=log 1=warning 2=error 3=info (varia por versão; mapeamos)
    const lvlName = level === 2 ? 'error' : level === 1 ? 'warning' : 'log';
    const color = LEVEL_COLOR[lvlName] || C.gray;
    const src = sourceId ? `${C.dim}${shortSrc(sourceId)}:${line}${C.reset}` : '';
    process.stdout.write(`${color}[${lvlName}]${C.reset} ${message} ${src}\n`);
  });

  // Erros não tratados da página também vão pro terminal.
  win.webContents.on('render-process-gone', (_e, details) => {
    process.stderr.write(`${C.red}[render-gone] ${details.reason} (exit ${details.exitCode})${C.reset}\n`);
  });
  win.webContents.on('unresponsive', () => {
    process.stderr.write(`${C.yellow}[unresponsive] a página travou${C.reset}\n`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    process.stderr.write(`${C.red}[load-fail] ${code} ${desc} → ${url}${C.reset}\n`);
  });

  // ── POINTER LOCK / FULLSCREEN sem prompt de permissão ──────────────
  //  No Chrome o pointer lock pede gesto e pode soltar; aqui liberamos
  //  direto (é um app de jogo). O canvas pede lock e o Electron concede.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    // pointerLock, fullscreen, etc → sempre permitido no app dev.
    cb(true);
  });
  // Alguns builds usam o check handler:
  win.webContents.session.setPermissionCheckHandler(() => true);

  console.log(`${C.green}▶ TransFPS DEV${C.reset} carregando: ${C.cyan}${GAME_URL}${C.reset}`);
  console.log(`${C.dim}  F5/Ctrl+R = reload · F12/Ctrl+Shift+I = DevTools · F11 = fullscreen · Ctrl+W BLOQUEADO${C.reset}`);
  win.loadURL(GAME_URL);

  win.on('closed', () => { win = null; });
}

function shortSrc(s) {
  try {
    // tira a URL longa, deixa só o nome do arquivo
    const u = String(s).split('?')[0];
    return u.substring(u.lastIndexOf('/') + 1) || u;
  } catch (_) { return s; }
}

// ── ATALHOS — via before-input-event (LOCAL da janela, confiável) ───────
//  ANTES era globalShortcut (registra no SISTEMA todo): falhava silencioso
//  se outro app/o Trae já tivesse Ctrl+R/F12 → F12 e reload não respondiam.
//  Agora interceptamos as teclas DENTRO da janela: funciona sempre que o
//  jogo tem foco, sem conflitar com nada de fora.
//
//  ATIVOS (dev):
//    F5 / Ctrl+R          → recarrega o jogo
//    F12 / Ctrl+Shift+I   → abre/fecha o DevTools
//    Ctrl+Shift+R         → recarrega ignorando cache (hard reload)
//    F11                  → fullscreen
//  BLOQUEADOS (não atrapalham o jogo):
//    Ctrl+W/Q/N/T/P/F/G, zoom, Alt+setas
function installShortcuts() {
  if (!win) return;
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl  = input.control || input.meta;
    const shift = input.shift;
    const key   = (input.key || '').toLowerCase();

    // ── DEV: reload / devtools / fullscreen ──
    if (key === 'f5' || (ctrl && key === 'r' && !shift)) {
      event.preventDefault(); win.webContents.reload(); return;
    }
    if (ctrl && shift && key === 'r') {
      event.preventDefault(); win.webContents.reloadIgnoringCache(); return;
    }
    if (key === 'f12' || (ctrl && shift && key === 'i')) {
      event.preventDefault(); win.webContents.toggleDevTools(); return;
    }
    if (key === 'f11') {
      event.preventDefault(); win.setFullScreen(!win.isFullScreen()); return;
    }

    // ── BLOQUEADOS: atalhos de browser que atrapalham o jogo ──
    if (ctrl && ['w', 'q', 'n', 't', 'p', 'f', 'g', '+', '-', '=', '0'].includes(key)) {
      event.preventDefault(); return;
    }
    if (input.alt && (key === 'arrowleft' || key === 'arrowright')) {
      event.preventDefault(); return;
    }
    // resto (WASD, ESC, números, etc.) → passa direto pro jogo.
  });
}

app.whenReady().then(() => {
  createWindow();
  installShortcuts();          // before-input-event é por-janela e persiste

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); installShortcuts(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
