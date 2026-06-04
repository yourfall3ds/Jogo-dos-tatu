// ─────────────────────────────────────────────────────────────────
//  config-server.js  — servidor local que persiste configurações
//  de animação diretamente nos arquivos JS do jogo e gerencia 
//  uma base de dados local em arquivos JSON.
//
//  Porta: 3099   (separado do servidor de assets na 5500)
//  Inicia com:  node tools/config-server.js
// ─────────────────────────────────────────────────────────────────
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT       = 3099;
const MESHY_HOST = 'api.meshy.ai';

// ── Lê o .env da raiz do projeto (parser simples, sem dependência) ──
//  Formato: CHAVE=valor por linha. Linhas em branco e # são ignoradas.
function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  const env = {};
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (let line of txt.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      // remove aspas opcionais
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[k] = v;
    }
  } catch (_) { /* sem .env → ok, usa header/process.env */ }
  return env;
}

const ENV       = loadEnv();
let   MESHY_KEY  = process.env.MESHY_KEY || ENV.MESHY_KEY || '';  // .env → header X-Meshy-Key sobrescreve
const ROOT       = path.join(__dirname, '..');
const ANIM_FILE  = path.join(ROOT, 'src', 'PlayerAnimator.js');
const CFG_FILE   = path.join(ROOT, 'src', 'AnimConfigUI.js');
const DB_DIR     = path.join(ROOT, 'tools', 'db');

// Garante que o diretório do DB existe
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────
function buildMapBlock(animMap) {
  const lines = Object.entries(animMap)
    .map(([k, v]) => `  ${k.padEnd(12)}: '${v}',`)
    .join('\n');
  return `const ANIM_MAP = {\n${lines}\n};`;
}

function buildNamesBlock(animNames) {
  const lines = Object.entries(animNames)
    .map(([k, v]) => `  '${k}':${' '.repeat(Math.max(1, 36 - k.length))}'${v.replace(/'/g, "\\'")}',`)
    .join('\n');
  return `const DEFAULT_ANIM_NAMES = {\n${lines}\n};`;
}

function replaceConstBlock(src, varName, newBlock) {
  const pattern = new RegExp(`(const\\s+${varName}\\s*=\\s*\\{)[^]*?(\\};)`, '');
  const startToken = `const ${varName} = {`;
  const altToken   = `const ${varName}={`;

  let startIdx = src.indexOf(startToken);
  if (startIdx === -1) startIdx = src.indexOf(altToken);
  if (startIdx === -1) return null;

  let depth = 0;
  let i = src.indexOf('{', startIdx);
  if (i === -1) return null;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  let endIdx = i;
  while (endIdx < src.length && src[endIdx] !== ';') endIdx++;
  endIdx++; 

  return src.slice(0, startIdx) + newBlock + src.slice(endIdx);
}

// ── Servidor ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Meshy-Key');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Rota Legada: Salvar Animações ────────────────────────────────
  if (req.method === 'POST' && req.url === '/save-anim-config') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { animMap, animNames } = JSON.parse(body);
        let animSrc = fs.readFileSync(ANIM_FILE, 'utf8');
        animSrc = replaceConstBlock(animSrc, 'ANIM_MAP', buildMapBlock(animMap));
        fs.writeFileSync(ANIM_FILE, animSrc, 'utf8');

        let cfgSrc  = fs.readFileSync(CFG_FILE, 'utf8');
        cfgSrc = replaceConstBlock(cfgSrc, 'DEFAULT_ANIM_NAMES', buildNamesBlock(animNames));
        fs.writeFileSync(CFG_FILE, cfgSrc, 'utf8');

        console.log(`✅ [${new Date().toLocaleTimeString()}] Config anim salva`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Miniaturas de itens NATIVOS → arquivo COMMITADO no repo ───────
  //  POST /save-thumb  body: { id, dataURL }  → grava assets/ui/thumbs/<id>.png
  //  Itens nativos do jogo (armas etc.) têm a miniatura versionada: quem gera
  //  (dev) faz push e TODOS recebem em produção. (Assets da máquina vão pro
  //  Wasabi, fluxo separado.) Roda só em DEV (config-server local).
  if (req.method === 'POST' && req.url === '/save-thumb') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { id, dataURL } = JSON.parse(body);
        if (!id || !dataURL) { res.writeHead(400); res.end('faltou id/dataURL'); return; }
        const safe = String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
        const b64  = String(dataURL).replace(/^data:image\/\w+;base64,/, '');
        const dir  = path.join(ROOT, 'assets', 'ui', 'thumbs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, `${safe}.png`);
        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
        console.log(`🖼️  [${new Date().toLocaleTimeString()}] Miniatura salva: assets/ui/thumbs/${safe}.png`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: `assets/ui/thumbs/${safe}.png` }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ── Banco de Dados Local (JSON) ───────────────────────────────────
  // GET /db/nome_da_colecao
  if (req.method === 'GET' && req.url.startsWith('/db/')) {
    const col  = req.url.substring(4);
    const file = path.join(DB_DIR, `${col}.json`);
    if (!fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
      return;
    }
    try {
      const data = fs.readFileSync(file, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500); res.end(e.message);
    }
    return;
  }

  // POST /db/nome_da_colecao
  if (req.method === 'POST' && req.url.startsWith('/db/')) {
    const col  = req.url.substring(4);
    const file = path.join(DB_DIR, `${col}.json`);
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // Valida se é JSON válido antes de salvar
        JSON.parse(body);
        fs.writeFileSync(file, body, 'utf8');
        console.log(`💾 [${new Date().toLocaleTimeString()}] Coleção '${col}' atualizada`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end('Invalid JSON');
      }
    });
    return;
  }

  // ── Proxy Meshy AI ────────────────────────────────────────────────
  //  Repassa /meshy/<path> → https://api.meshy.ai/<path> com a API key.
  //  Resolve CORS (browser não chama api.meshy.ai direto) e mantém a key
  //  fora do front. A key chega no header X-Meshy-Key e fica em memória.
  if (req.url.startsWith('/meshy/')) {
    // Só sobrescreve a chave do .env se o header trouxer algo NÃO-VAZIO e
    // diferente do placeholder. (Antes, header vazio apagava a chave boa.)
    const keyFromHeader = (req.headers['x-meshy-key'] || '').trim();
    if (keyFromHeader && keyFromHeader !== 'cole_sua_chave_aqui') MESHY_KEY = keyFromHeader;
    const keyOk = MESHY_KEY && MESHY_KEY !== 'cole_sua_chave_aqui';
    if (!keyOk) { res.writeHead(401); res.end('Meshy API key ausente — edite o .env'); return; }

    const upstreamPath = req.url.replace(/^\/meshy/, '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const opts = {
        host: MESHY_HOST, path: upstreamPath, method: req.method,
        headers: {
          'Authorization': `Bearer ${MESHY_KEY}`,
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      };
      const up = https.request(opts, upRes => {
        res.writeHead(upRes.statusCode, { 'Content-Type': upRes.headers['content-type'] || 'application/json' });
        upRes.pipe(res);
      });
      up.on('error', e => { res.writeHead(502); res.end('proxy err: ' + e.message); });
      if (body) up.write(body);
      up.end();
    });
    return;
  }

  // ── Cache local de assets gerados ─────────────────────────────────
  //  POST /cache-asset  body: { url, name }
  //  Baixa a URL (Meshy CDN etc.) e grava em assets/generated/<name>.
  //  Devolve { path: 'assets/generated/<name>' } — caminho local que
  //  NUNCA expira. (Quando online, trocar este destino por Wasabi/S3.)
  if (req.method === 'POST' && req.url === '/cache-asset') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch (_) { res.writeHead(400); res.end('JSON inválido'); return; }
      const { url, name } = parsed;
      if (!url || !name) { res.writeHead(400); res.end('faltou url/name'); return; }

      const safe    = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const dir      = path.join(ROOT, 'assets', 'generated');
      const filePath = path.join(dir, safe);
      const relPath  = `assets/generated/${safe}`;

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Já cacheado? devolve direto (idempotente)
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: relPath, cached: true }));
        return;
      }

      let parsedUrl;
      try { parsedUrl = new URL(url); } catch (e) { res.writeHead(400); res.end('URL inválida'); return; }
      const opts = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || 443,
        path:     parsedUrl.pathname + parsedUrl.search,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0 (TransFPS-Cache)' },
      };
      const up = https.request(opts, upRes => {
        if (upRes.statusCode !== 200) {
          res.writeHead(502); res.end('download falhou: ' + upRes.statusCode);
          upRes.resume(); return;
        }
        const ws = fs.createWriteStream(filePath);
        upRes.pipe(ws);
        ws.on('finish', () => {
          ws.close(() => {
            console.log(`💾 [${new Date().toLocaleTimeString()}] asset cacheado → ${relPath}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ path: relPath }));
          });
        });
        ws.on('error', e => { try { fs.unlinkSync(filePath); } catch (_) {} res.writeHead(500); res.end('write err: ' + e.message); });
      });
      up.on('error', e => { res.writeHead(502); res.end('req err: ' + e.message); });
      up.end();
    });
    return;
  }

  // ── Proxy de imagem (resolve CORS da CDN assets.meshy.ai) ──────────
  //  GET /proxy-image?url=<encoded-url>
  //  O servidor baixa a imagem server-side e devolve com CORS livre.
  if (req.method === 'GET' && req.url.startsWith('/proxy-image')) {
    const qs       = req.url.indexOf('?');
    const params   = new URLSearchParams(qs >= 0 ? req.url.slice(qs + 1) : '');
    const imageUrl = params.get('url');
    if (!imageUrl) { res.writeHead(400); res.end('Missing url param'); return; }
    try {
      const parsed = new URL(imageUrl);
      const opts = {
        hostname: parsed.hostname,
        port:     parsed.port || 443,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0 (TransFPS-Proxy)' },
      };
      const up = https.request(opts, upRes => {
        const ct = upRes.headers['content-type'] || 'image/png';
        res.writeHead(upRes.statusCode, {
          'Content-Type':                ct,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control':               'public, max-age=7200',
        });
        upRes.pipe(res);
      });
      up.on('error', e => { res.writeHead(502); res.end('proxy err: ' + e.message); });
      up.end();
    } catch (e) {
      res.writeHead(400); res.end('URL inválida: ' + e.message);
    }
    return;
  }

  // ── Config TransFPS (URL + anon key + MP_WS_URL + Google CID) ─────
  //  Lê do .env. NUNCA expõe service_role nem MESHY_KEY aqui — apenas
  //  os valores seguros pro front (anon key, URL, MP_WS_URL).
  if (req.method === 'GET' && req.url === '/transfps-env') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      SUPABASE_URL:        ENV.SUPABASE_URL        || '',
      SUPABASE_ANON_KEY:   ENV.SUPABASE_ANON_KEY   || '',
      GOOGLE_CLIENT_ID:    ENV.GOOGLE_CLIENT_ID    || '',
      TRANSFPS_MP_WS_URL:  ENV.TRANSFPS_MP_WS_URL  || '',
      SKETCHFAB_KEY:       ENV.SKETCHFAB_KEY       || '',  // pro download in-game
    }));
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, port: PORT, meshyKey: !!(MESHY_KEY && MESHY_KEY !== 'cole_sua_chave_aqui') }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`⚙️  LocalDB Server rodando em http://localhost:${PORT}`);
  console.log(`   GET /db/:colecao   → lê arquivo JSON`);
  console.log(`   POST /db/:colecao  → salva arquivo JSON`);
  console.log(`   /meshy/*           → proxy p/ api.meshy.ai`);
  if (MESHY_KEY && MESHY_KEY !== 'cole_sua_chave_aqui') {
    console.log(`   🔑 Meshy key carregada do .env (••••${MESHY_KEY.slice(-4)})`);
  } else {
    console.log(`   ⚠️  Meshy key NÃO configurada — edite o .env (MESHY_KEY=...)`);
  }
});
