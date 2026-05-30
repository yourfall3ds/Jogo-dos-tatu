#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  glb-inspect.js — Inspetor de GLB/GLTF para terminal (sem browser)
//
//  Parseia o binário GLB (ou JSON do GLTF) e reporta:
//    • Animações (nome + duração estimada em segundos)
//    • Nós / ossos (nomes do esqueleto)
//    • Meshes (nomes)
//    • Bounding box (dimensões) e escala sugerida para ~1.8u de altura
//
//  USO:
//    node tools/glb-inspect.js "<arquivo.glb>"            → relatório legível
//    node tools/glb-inspect.js "<pasta>"                  → varre a pasta
//    node tools/glb-inspect.js "<pasta>" --json           → JSON puro
//    node tools/glb-inspect.js "<pasta>" --manifest <out> → salva manifesto JSON
//    node tools/glb-inspect.js "<arquivo>" --bones        → lista todos os ossos
// ─────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

// ── Lê o JSON de um GLB binário ───────────────────────────────────
function parseGLB(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) return null;
  const length = buffer.readUInt32LE(8);
  let offset = 12;
  while (offset < length) {
    const chunkLen  = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const data      = buffer.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === CHUNK_JSON) return JSON.parse(data.toString('utf8'));
    offset += 8 + chunkLen;
  }
  return null;
}

// ── Carrega o glTF JSON de .glb ou .gltf ──────────────────────────
function loadGltf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.glb') {
    return parseGLB(fs.readFileSync(filePath));
  } else if (ext === '.gltf') {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

// ── Duração de uma animação = maior tempo de keyframe entre samplers ─
function animDuration(gltf, anim) {
  let maxT = 0;
  for (const s of anim.samplers || []) {
    const acc = gltf.accessors?.[s.input];
    if (acc && Array.isArray(acc.max) && acc.max.length) {
      maxT = Math.max(maxT, acc.max[0]);
    }
  }
  return maxT;
}

// ── Bounding box agregado a partir dos accessors de POSITION ──────
function boundingBox(gltf) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const idx = prim.attributes?.POSITION;
      if (idx == null) continue;
      const acc = gltf.accessors?.[idx];
      if (!acc || !acc.min || !acc.max) continue;
      found = true;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], acc.min[i]);
        max[i] = Math.max(max[i], acc.max[i]);
      }
    }
  }
  if (!found) return null;
  return {
    min, max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

// ── Conta vértices totais ─────────────────────────────────────────
function vertexCount(gltf) {
  let total = 0;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const idx = prim.attributes?.POSITION;
      const acc = gltf.accessors?.[idx];
      if (acc) total += acc.count || 0;
    }
  }
  return total;
}

// ── Extrai o resumo de um glTF ────────────────────────────────────
function inspect(filePath) {
  const gltf = loadGltf(filePath);
  if (!gltf) return { error: 'formato não suportado ou inválido' };

  const animations = (gltf.animations || []).map((a, i) => ({
    name: a.name || `anim_${i}`,
    duration: +animDuration(gltf, a).toFixed(2),
    channels: (a.channels || []).length,
  }));

  // Nós com nome = candidatos a ossos/sockets
  const nodes = (gltf.nodes || [])
    .map(n => n.name)
    .filter(Boolean);

  // Nós que são ossos de skin
  const skinJoints = new Set();
  for (const skin of gltf.skins || []) {
    for (const j of skin.joints || []) {
      const nm = gltf.nodes?.[j]?.name;
      if (nm) skinJoints.add(nm);
    }
  }

  const meshes = (gltf.meshes || []).map(m => m.name).filter(Boolean);
  const bb = boundingBox(gltf);
  const verts = vertexCount(gltf);

  // Escala sugerida para altura humanoide (~1.8u)
  let suggestedScale = null;
  if (bb) {
    const h = bb.size[1] || Math.max(...bb.size);
    if (h > 0) suggestedScale = +(1.8 / h).toFixed(4);
  }

  return {
    file: path.basename(filePath),
    animations,
    animationCount: animations.length,
    nodeCount: nodes.length,
    boneCount: skinJoints.size,
    bones: [...skinJoints],
    nodes,
    meshes,
    vertexCount: verts,
    boundingBox: bb,
    suggestedScale,
    hasSkin: (gltf.skins || []).length > 0,
  };
}

// ── Formata relatório legível ─────────────────────────────────────
function printReport(r, opts = {}) {
  if (r.error) { console.log(`  ❌ ${r.file || ''}: ${r.error}`); return; }
  console.log(`\n📦 ${r.file}`);
  console.log(`   meshes: ${r.meshes.length} | vértices: ${r.vertexCount} | ossos: ${r.boneCount} | skin: ${r.hasSkin ? 'sim' : 'não'}`);
  if (r.boundingBox) {
    const s = r.boundingBox.size.map(v => v.toFixed(2)).join(' × ');
    console.log(`   dimensões (LxAxP): ${s}  →  escala p/ 1.8u: ${r.suggestedScale}`);
  }
  if (r.animations.length) {
    console.log(`   🎬 animações (${r.animations.length}):`);
    for (const a of r.animations) {
      console.log(`      • ${a.name}  (${a.duration}s, ${a.channels} canais)`);
    }
  } else {
    console.log(`   🎬 animações: nenhuma (modelo estático)`);
  }
  if (opts.bones && r.bones.length) {
    console.log(`   🦴 ossos:`);
    console.log('      ' + r.bones.join(', '));
  }
}

// ── Varre diretório recursivamente atrás de GLB/GLTF ─────────────
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.glb' || ext === '.gltf') out.push(full);
    }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('uso: node tools/glb-inspect.js <arquivo|pasta> [--json] [--bones] [--manifest saida.json]');
    process.exit(1);
  }
  const target = args[0];
  const asJson = args.includes('--json');
  const showBones = args.includes('--bones');
  const manifestIdx = args.indexOf('--manifest');
  const manifestOut = manifestIdx >= 0 ? args[manifestIdx + 1] : null;

  if (!fs.existsSync(target)) { console.error('não existe:', target); process.exit(1); }

  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? walk(target) : [target];
  files.sort();

  const results = files.map(f => {
    try { return { path: f, ...inspect(f) }; }
    catch (e) { return { path: f, file: path.basename(f), error: e.message }; }
  });

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\n══════ ${files.length} asset(s) em "${target}" ══════`);
    for (const r of results) printReport(r, { bones: showBones });
    // Resumo final
    const withAnim = results.filter(r => r.animationCount > 0).length;
    console.log(`\n── resumo: ${results.length} arquivos | ${withAnim} com animação ──`);
  }

  if (manifestOut) {
    fs.writeFileSync(manifestOut, JSON.stringify(results, null, 2));
    console.log(`\n💾 manifesto salvo em: ${manifestOut}`);
  }
}

main();
