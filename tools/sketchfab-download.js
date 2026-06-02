#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  sketchfab-download.js — baixa GLBs de Sketchfab via API
//
//  Uso:
//    node tools/sketchfab-download.js <query> [--limit N] [--out PATH]
//    node tools/sketchfab-download.js --uid <model_uid> [--out PATH]
//
//  Exemplos:
//    node tools/sketchfab-download.js "medieval sword" --limit 5
//    node tools/sketchfab-download.js "whip" --limit 3 --out assets/weapons
//    node tools/sketchfab-download.js --uid 7fd31125f1494634b95aaef86c9abe62
//
//  Filtra por: downloadable=true + animated (opcional) + CC licenses.
//  Lê SKETCHFAB_KEY do .env. Cria CREDITS.md por GLB CC-BY.
// ─────────────────────────────────────────────────────────────────
const fs = require('fs');
const https = require('https');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  const env = {};
  try {
    for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('='); if (eq === -1) continue;
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch (_) {}
  return env;
}

const ENV = loadEnv();
const KEY = process.env.SKETCHFAB_KEY || ENV.SKETCHFAB_KEY;
if (!KEY) { console.error('SKETCHFAB_KEY ausente. Configure no .env.'); process.exit(1); }

// ── HTTPS helpers ───────────────────────────────────────────────
function httpsJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { Authorization: `Token ${KEY}`, ...headers } };
    https.get(url, opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${txt.slice(0, 200)}`));
          resolve(JSON.parse(txt));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function httpsDownload(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    let totalSize = 0;
    const req = https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(outPath);
        return httpsDownload(res.headers.location, outPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.on('data', c => totalSize += c.length);
      res.pipe(file);
      file.on('finish', () => { file.close(() => resolve(totalSize)); });
    });
    req.on('error', err => { fs.unlinkSync(outPath); reject(err); });
  });
}

// ── API calls ────────────────────────────────────────────────────
async function search(query, limit) {
  const params = new URLSearchParams({
    q: query,
    type: 'models',
    downloadable: 'true',
    count: String(limit),
    sort_by: '-likeCount',
  });
  const url = `https://api.sketchfab.com/v3/search?${params}`;
  const j = await httpsJSON(url);
  return j.results || [];
}

async function modelInfo(uid) {
  return httpsJSON(`https://api.sketchfab.com/v3/models/${uid}`);
}

async function downloadLinks(uid) {
  // Endpoint que requer token; retorna link temporário pro GLB
  return httpsJSON(`https://api.sketchfab.com/v3/models/${uid}/download`);
}

// ── Sanitize filename ────────────────────────────────────────────
function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80).toLowerCase();
}

// ── Credits log (CC-BY exige atribuição) ─────────────────────────
function appendCredits(outDir, model, file) {
  const credPath = path.join(outDir, 'CREDITS.md');
  const lic = model.license?.label || 'Unknown';
  const url = model.viewerUrl || `https://sketchfab.com/models/${model.uid}`;
  const author = model.user?.displayName || model.user?.username || 'Unknown';
  const line = `\n- **${file}** — "${model.name}" by [${author}](${model.user?.profileUrl || '#'}) | License: ${lic} | [Source](${url})\n`;
  let head = '';
  if (!fs.existsSync(credPath)) {
    head = '# Asset Credits\n\nAssets downloaded from Sketchfab. License terms apply — keep this file in distribution.\n';
  }
  fs.appendFileSync(credPath, head + line);
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Uso: node tools/sketchfab-download.js <query|--uid UID> [--limit N] [--out PATH]');
    process.exit(1);
  }

  let query = null, uid = null, limit = 5, outDir = path.join(__dirname, '..', 'assets', 'sketchfab');
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit') { limit = parseInt(args[++i]); }
    else if (a === '--out') { outDir = path.resolve(args[++i]); }
    else if (a === '--uid') { uid = args[++i]; }
    else if (!a.startsWith('--')) { query = (query || '') + ' ' + a; }
  }
  if (query) query = query.trim();

  fs.mkdirSync(outDir, { recursive: true });

  let models = [];
  if (uid) {
    console.log(`→ buscando UID ${uid}…`);
    models = [await modelInfo(uid)];
  } else {
    console.log(`→ pesquisando "${query}" (limit ${limit})…`);
    models = await search(query, limit);
    console.log(`  ${models.length} resultado(s)`);
  }

  let ok = 0, fail = 0;
  for (const m of models) {
    const lic = m.license?.label || '';
    const isFree = m.isDownloadable && /CC/.test(lic);
    if (!isFree) { console.log(`  [skip] ${m.name} (${lic || 'sem licença CC'})`); continue; }
    const filename = sanitize(m.name) + '.glb';
    const outPath = path.join(outDir, filename);
    if (fs.existsSync(outPath)) { console.log(`  [skip] já existe: ${filename}`); continue; }
    try {
      console.log(`  → ${m.name} (${lic})…`);
      const links = await downloadLinks(m.uid);
      const glbUrl = links.glb?.url || links.gltf?.url;
      if (!glbUrl) { console.log(`    [skip] sem GLB disponível`); continue; }
      const bytes = await httpsDownload(glbUrl, outPath);
      console.log(`    ✓ ${(bytes / 1024 / 1024).toFixed(1)} MB → ${path.relative(process.cwd(), outPath)}`);
      appendCredits(outDir, m, filename);
      ok++;
    } catch (e) {
      console.log(`    ✗ ${e.message}`);
      fail++;
    }
  }
  console.log(`\n── ${ok} baixado(s), ${fail} falha(s) ──`);
  if (ok > 0) console.log(`Credits em: ${path.join(outDir, 'CREDITS.md')}`);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
