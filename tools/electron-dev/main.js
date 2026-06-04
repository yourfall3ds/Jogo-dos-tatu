// ─────────────────────────────────────────────────────────────────
//  TransFPS — Launcher Electron de DEV
//
//  Resolve os problemas do navegador pra jogar/testar localmente:
//   • POINTER LOCK REAL: o mouse fica 100% travado no jogo, não escapa da
//     tela nem clica em coisas do Windows (era o maior problema no Chrome).
//   • ESC PAUSA: o ESC não some com o lock de forma traiçoeira — o jogo
//     decide o pause; o Electron só repassa o ESC pro jogo.
//   • SEM ATALHOS DE BROWSER: Ctrl+W (fechar), Ctrl+R (reload acidental),
//     Ctrl+Q, F5, etc são BLOQUEADOS durante o jogo. Ctrl+W não fecha mais.
//   • LOGS NO TERMINAL: todo console.log/erro do jogo é cuspido no terminal
//     onde você rodou `npm start` — fácil de ler e copiar.
//   • DevTools: F12 abre/fecha (dev). Recarregar de propósito: Ctrl+Shift+R.
//
//  Uso:
//    cd tools/electron-dev && npm install && npm start         (prod)
//    npm run local                                             (localhost:5500)
//    TRANSFPS_URL=<url> npm start                              (url custom)
// ─────────────────────────────────────────────────────────────────

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

const GAME_URL = process.env.TRANSFPS_URL || 'https://app.overpixel.online/transfps/';

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
    backgroundColor: '#05070d',
    title: 'TransFPS — DEV',
    autoHideMenuBar: true,            // sem barra de menu (File/Edit/etc)
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // pointer lock e fullscreen sem pedir permissão (é um app de jogo dev)
      backgroundThrottling: false,    // NÃO desacelera quando perde foco (dev)
    },
  });

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
  console.log(`${C.dim}  F12 = DevTools · Ctrl+Shift+R = reload de propósito · Ctrl+W BLOQUEADO durante o jogo${C.reset}`);
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

// ── BLOQUEIO DE ATALHOS DO BROWSER ──────────────────────────────────
//  Registrados como globalShortcut: enquanto a janela do jogo tem foco,
//  estes atalhos NÃO chegam ao Chromium → Ctrl+W não fecha, F5 não
//  recarrega à toa, etc. O jogo recebe as teclas normais (WASD, ESC...).
function registerBlocks() {
  const swallow = () => { /* engole: não faz nada → atalho do browser morto */ };
  const blocked = [
    'CommandOrControl+W',   // fechar aba/janela (o vilão do Ctrl+W ao agachar+andar)
    'CommandOrControl+R',   // reload acidental
    'CommandOrControl+Shift+W',
    'CommandOrControl+Q',   // quit
    'CommandOrControl+N',   // nova janela
    'CommandOrControl+T',   // nova aba
    'CommandOrControl+P',   // print
    'CommandOrControl+F',   // find
    'CommandOrControl+G',
    'CommandOrControl+Plus', 'CommandOrControl+-', 'CommandOrControl+0', // zoom
    'F5',                   // reload
    'F7',                   // (caret browsing) — F7 do jogo é tratado pela página, não aqui
    'Alt+Left', 'Alt+Right', // voltar/avançar histórico
    'Alt+F4 ',              // (deixar o usuário fechar pela barra; espaço evita registro real)
  ];
  for (const acc of blocked) {
    try { globalShortcut.register(acc.trim(), swallow); } catch (_) {}
  }

  // Atalhos DEV que CONTINUAM funcionando (úteis):
  try { globalShortcut.register('F12', () => win?.webContents.toggleDevTools()); } catch (_) {}
  try { globalShortcut.register('CommandOrControl+Shift+R', () => win?.reload()); } catch (_) {}
  try { globalShortcut.register('F11', () => win?.setFullScreen(!win.isFullScreen())); } catch (_) {}
}

app.whenReady().then(() => {
  createWindow();
  registerBlocks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Re-bloqueia ao focar (alguns atalhos podem ser liberados ao perder foco).
app.on('browser-window-focus', registerBlocks);
app.on('browser-window-blur', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });

app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
