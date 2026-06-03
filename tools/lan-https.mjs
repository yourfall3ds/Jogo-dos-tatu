// ─────────────────────────────────────────────────────────────────
//  lan-https.mjs — servidor HTTPS estático pra rede local (LAN).
//
//  Por que HTTPS? O WebXR (modo VR do Quest) exige "contexto seguro":
//  só funciona em https:// ou localhost. Por http://<IP> o navegador
//  BLOQUEIA o navigator.xr → o imersivo nunca abre. Este server serve
//  o jogo por https com um certificado self-signed, então qualquer
//  dispositivo da rede (Quest, celular, outro PC) consegue entrar em VR.
//
//  Uso:
//    node tools/lan-https.mjs            (porta 8443)
//    node tools/lan-https.mjs 5500       (porta custom)
//
//  Na primeira vez gera certs/lan-key.pem + certs/lan-cert.pem (openssl).
//  Cada dispositivo precisa ACEITAR o aviso de certificado UMA vez
//  (Avançado → prosseguir). Depois disso o VR funciona.
// ─────────────────────────────────────────────────────────────────
import { createServer } from 'node:https';
import { readFileSync, existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');          // raiz do projeto
const CERT_DIR = join(ROOT, 'certs');
const KEY_FILE = join(CERT_DIR, 'lan-key.pem');
const CRT_FILE = join(CERT_DIR, 'lan-cert.pem');
const PORT = parseInt(process.argv[2], 10) || 8443;

// ── Descobre o IPv4 da LAN (ex.: 192.168.x.x) ────────────────────
function lanIPs() {
  const out = [];
  const ifs = networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}
const IPS = lanIPs();
const PRIMARY_IP = IPS[0] || '127.0.0.1';

// ── Gera o certificado self-signed (uma vez) cobrindo localhost + IPs ──
function ensureCert() {
  if (existsSync(KEY_FILE) && existsSync(CRT_FILE)) return;
  if (!existsSync(CERT_DIR)) mkdirSync(CERT_DIR, { recursive: true });
  const san = [
    'DNS:localhost',
    'IP:127.0.0.1',
    ...IPS.map(ip => `IP:${ip}`),
  ].join(',');
  console.log('[lan-https] gerando certificado self-signed (SAN: ' + san + ')…');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', KEY_FILE, '-out', CRT_FILE,
      '-days', '3650', '-subj', '/CN=transfps-lan',
      '-addext', `subjectAltName=${san}`,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log('[lan-https] certificado criado em certs/.');
  } catch (e) {
    console.error('[lan-https] FALHOU gerar cert com openssl:', e.message);
    console.error('  Instale o openssl ou rode pela bash do Git. Abortando.');
    process.exit(1);
  }
}
ensureCert();

// ── MIME types (esp. .js como module, .glb, .wasm) ───────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.map':  'application/json; charset=utf-8',
};

const options = {
  key: readFileSync(KEY_FILE),
  cert: readFileSync(CRT_FILE),
};

createServer(options, (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    // Bloqueia path traversal: resolve dentro de ROOT
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

    let target = filePath;
    if (!existsSync(target) || statSync(target).isDirectory()) {
      // Sem extensão e não existe → fallback pro index.html (SPA-friendly)
      if (!extname(urlPath)) target = join(ROOT, 'index.html');
      else { res.writeHead(404); res.end('not found'); return; }
    }

    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*',
      // Permite WebXR/câmera/mic na página (casa com o meta do index.html)
      'Permissions-Policy': 'xr-spatial-tracking=*, camera=*, microphone=*, fullscreen=*',
    });
    createReadStream(target).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('server error');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('\n  ✅ HTTPS LAN no ar (binda 0.0.0.0 — acessível na rede)\n');
  console.log('  Neste PC:        https://localhost:' + PORT);
  for (const ip of IPS) console.log('  Na rede (Quest): https://' + ip + ':' + PORT);
  console.log('\n  ⚠️  Cada dispositivo aceita o aviso de certificado 1x (Avançado → prosseguir).');
  console.log('      Depois disso o botão 🥽 ENTRAR EM VR funciona (contexto seguro).\n');
});
