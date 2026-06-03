// ─────────────────────────────────────────────────────────────────
//  gen-assets-manifest.mjs — indexa TODOS os assets NATIVOS do jogo.
//
//  "Nativo" = arquivo que já vem no repo/VPS (pasta assets/), EXCETO o que
//  é gerado em jogo (assets/generated/ — esses vivem no Supabase).
//
//  Saída: assets/assets-manifest.json (commitado → a VPS já serve estático).
//  O cliente carrega esse manifest pra ter a lista completa dos nativos
//  sem precisar listar diretório (browser não lista pasta).
//
//  Uso:  node tools/gen-assets-manifest.mjs
// ─────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT    = path.join(ASSETS, 'assets-manifest.json');

// Pastas que NÃO entram (gerados em runtime / lixo de import).
const EXCLUDE_DIRS = new Set(['generated']);          // assets/generated/* = Supabase
const AUX_EXT = new Set(['.bin', '.meta']);           // buffers do glTF + meta do Unity → só contam

const TYPE_BY_EXT = {
  '.glb': 'model', '.gltf': 'model', '.fbx': 'model-fbx', '.blend': 'source',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.hdr': 'image',
  '.wav': 'audio', '.mp3': 'audio', '.ogg': 'audio',
  '.txt': 'text', '.md': 'text', '.ini': 'text', '.json': 'data',
};

// ── Mapa dos assets REGISTRADOS (curados pro gameplay) ───────────────
const { AssetRegistry } = await import(
  url.pathToFileURL(path.join(ROOT, 'src/game/data/AssetRegistry.js')).href
);
const registered = {};   // 'assets/...path' → { category, id }
for (const cat of AssetRegistry.categories()) {
  for (const id of AssetRegistry.ids(cat)) {
    const p = AssetRegistry.path(cat, id);
    if (p) registered[p.replace(/\\/g, '/')] = { category: cat, id };
  }
}

// ── Varre assets/ recursivamente ─────────────────────────────────────
const all = [];
const counts = { byType: {}, byFolder: {}, total: 0, aux: 0 };

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel  = path.relative(ROOT, full).replace(/\\/g, '/');   // 'assets/...'
    const segs = rel.split('/');
    if (fs.statSync(full).isDirectory()) {
      if (segs.length === 2 && EXCLUDE_DIRS.has(segs[1])) continue;  // pula assets/generated
      walk(full);
      continue;
    }
    const ext    = path.extname(name).toLowerCase();
    const folder = segs[1] || '(root)';                  // 1ª subpasta de assets/
    counts.total++;
    if (AUX_EXT.has(ext)) { counts.aux++; continue; }    // .bin/.meta só contam
    const type = TYPE_BY_EXT[ext] || 'other';
    counts.byType[type]   = (counts.byType[type]   || 0) + 1;
    counts.byFolder[folder] = (counts.byFolder[folder] || 0) + 1;
    const entry = { path: rel, type, folder, ext: ext.slice(1) };
    const reg = registered[rel];
    if (reg) { entry.registered = true; entry.category = reg.category; entry.regId = reg.id; }
    all.push(entry);
  }
}
walk(ASSETS);

all.sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  generated_at: new Date().toISOString(),
  source: 'native (VPS/repo · pasta assets/)',
  excluded: ['assets/generated/* (gerados em jogo → Supabase)', '.bin/.meta (auxiliares)'],
  counts: {
    listed: all.length,
    total_files_scanned: counts.total,
    aux_skipped: counts.aux,
    registered_models: all.filter(a => a.registered).length,
    by_type: counts.byType,
    by_folder: counts.byFolder,
  },
  assets: all,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`✅ manifest gerado: ${path.relative(ROOT, OUT)}`);
console.log(`   ${all.length} assets listados (${counts.total} arquivos varridos, ${counts.aux} aux ignorados)`);
console.log(`   ${manifest.counts.registered_models} modelos registrados no AssetRegistry`);
console.log('   por tipo:', JSON.stringify(counts.byType));
