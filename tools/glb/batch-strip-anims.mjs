// batch-strip-anims.mjs — Processa em lote TODOS os GLBs de animação realmente
// referenciados por animationNames.js, removendo a geometria/textura duplicada.
//
// Segurança:
//   - Só toca nos arquivos extraídos do manifesto (animationNames.js). NUNCA a pasta
//     "ANALISAR E COLOCAR NA PASTA CERTA" nem os *_Character_output.glb (modelos reais).
//   - Faz backup de cada original em assets/animations/.orig-backup/<mesmo caminho> ANTES.
//   - Valida cada saída (re-bind por nome viável + animação presente). Se a validação
//     falhar, RESTAURA o original do backup e marca como FALHA (não deixa quebrado).
//
// Uso (a partir de tools/glb):
//   node batch-strip-anims.mjs            # processa
//   node batch-strip-anims.mjs --dry      # só lista o que faria

import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import { readFileSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');                 // D:/GAMES/Jogo-dos-tatu
const ANIM_ROOT = join(ROOT, 'assets/animations');
const BACKUP_ROOT = join(ANIM_ROOT, '.orig-backup');
const MANIFEST = join(ROOT, 'src/game/animation/animationNames.js');
const DRY = process.argv.includes('--dry');

const io = new NodeIO();

// 1) Extrair toda string 'assets/animations/....glb' do manifesto.
const manifestSrc = readFileSync(MANIFEST, 'utf8');
const re = /assets\/animations\/[^'"]+?\.glb/g;
const paths = [...new Set(manifestSrc.match(re) || [])];

console.log(`Manifesto: ${paths.length} arquivos de anim únicos referenciados.\n`);

// 2) Inspeção via JSON chunk (sem carregar o doc inteiro) p/ validar viabilidade.
function readGLBJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é GLB');
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  throw new Error('sem JSON chunk');
}
function viability(path) {
  const g = readGLBJson(path);
  const nodes = g.nodes || [];
  const anims = g.animations || [];
  const named = nodes.filter(n => n.name).length;
  const targetIdx = new Set();
  for (const a of anims) for (const ch of (a.channels || [])) {
    if (ch.target && typeof ch.target.node === 'number') targetIdx.add(ch.target.node);
  }
  const targetsNoName = [...targetIdx].filter(i => !nodes[i]?.name).length;
  return { animations: anims.length, namedNodes: named, targetsNoName,
           viable: anims.length > 0 && named > 0 && targetsNoName === 0 };
}

async function strip(inPath, outPath) {
  const doc = await io.read(inPath);
  const root = doc.getRoot();
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.dispose();
  for (const node of root.listNodes()) if (node.getMesh()) node.setMesh(null);
  for (const skin of root.listSkins()) skin.dispose();
  await doc.transform(prune({ keepLeaves: true, keepAttributes: false }), dedup());
  await io.write(outPath, doc);
}

let okCount = 0, failCount = 0, skipCount = 0, bytesBefore = 0, bytesAfter = 0;
const failures = [];

for (const rel of paths) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) { console.log(`  SKIP (não existe): ${rel}`); skipCount++; continue; }

  // viabilidade do ORIGINAL — se já estiver sem mesh (re-rodada), pular.
  let vOrig;
  try { vOrig = viability(abs); }
  catch (e) { console.log(`  SKIP (parse falhou): ${rel} — ${e.message}`); skipCount++; continue; }
  if (!vOrig.viable) { console.log(`  SKIP (não-viável p/ rebind): ${rel}`); skipCount++; continue; }

  const sizeBefore = statSync(abs).size;
  if (sizeBefore < 200 * 1024) { console.log(`  SKIP (já leve, ${(sizeBefore/1024)|0}KB): ${rel}`); skipCount++; continue; }

  if (DRY) { console.log(`  WOULD STRIP: ${rel} (${(sizeBefore/1024)|0}KB, ${vOrig.animations} anim)`); continue; }

  // backup
  const bkp = join(BACKUP_ROOT, rel.replace(/^assets\/animations\//, ''));
  mkdirSync(dirname(bkp), { recursive: true });
  if (!existsSync(bkp)) copyFileSync(abs, bkp);

  try {
    await strip(abs, abs);  // sobrescreve in-place
    const vNew = viability(abs);
    const sizeAfter = statSync(abs).size;
    if (!vNew.viable || vNew.animations !== vOrig.animations) {
      copyFileSync(bkp, abs);   // RESTAURA
      failures.push({ rel, reason: `validação falhou (anim ${vOrig.animations}→${vNew.animations}, viable=${vNew.viable})` });
      failCount++;
      console.log(`  FALHA→restaurado: ${rel}`);
    } else {
      bytesBefore += sizeBefore; bytesAfter += sizeAfter; okCount++;
      console.log(`  OK: ${rel}  ${(sizeBefore/1024)|0}KB → ${(sizeAfter/1024)|0}KB`);
    }
  } catch (e) {
    if (existsSync(bkp)) copyFileSync(bkp, abs);
    failures.push({ rel, reason: e.message }); failCount++;
    console.log(`  ERRO→restaurado: ${rel} — ${e.message}`);
  }
}

console.log('\n══════════ RESUMO ══════════');
console.log(`OK: ${okCount}  |  FALHA: ${failCount}  |  SKIP: ${skipCount}`);
if (!DRY) console.log(`Tamanho: ${(bytesBefore/1048576).toFixed(1)}MB → ${(bytesAfter/1048576).toFixed(1)}MB  (${bytesBefore? (bytesBefore/Math.max(1,bytesAfter)).toFixed(0):0}x menor)`);
if (failures.length) { console.log('\nFalhas:'); for (const f of failures) console.log(`  - ${f.rel}: ${f.reason}`); }
