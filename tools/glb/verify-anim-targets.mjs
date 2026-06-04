// verify-anim-targets.mjs — Valida que um GLB de anim stripado continua viável para
// AnimationLibrary.loadExternalAnimations (que re-vincula POR NOME DE NÓ).
//
// Lê o JSON chunk do GLB e confere:
//   - quais nodes têm name (os ossos)
//   - quais nodes são alvo de animation.channels (o que a anim de fato move)
//   - todo alvo de channel tem name? (se não, o re-bind por nome falha → 0/total)
//
// Uso: node verify-anim-targets.mjs <file.glb>

import { readFileSync } from 'node:fs';

function readGLBJson(path) {
  const buf = readFileSync(path);
  // header: magic(4) version(4) length(4); depois chunks: len(4) type(4) data
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é GLB');
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) return JSON.parse(data.toString('utf8')); // 'JSON'
    off += 8 + len;
  }
  throw new Error('sem JSON chunk');
}

const path = process.argv[2];
const g = readGLBJson(path);
const nodes = g.nodes || [];
const anims = g.animations || [];

const named = nodes.map((n, i) => ({ i, name: n.name })).filter(n => n.name);
const targetIdx = new Set();
for (const a of anims) for (const ch of (a.channels || [])) {
  if (ch.target && typeof ch.target.node === 'number') targetIdx.add(ch.target.node);
}
const targets = [...targetIdx].map(i => ({ i, name: nodes[i]?.name ?? null }));
const targetsWithoutName = targets.filter(t => !t.name);

console.log(JSON.stringify({
  file: path,
  totalNodes: nodes.length,
  namedNodes: named.length,
  animations: anims.map(a => ({ name: a.name, channels: (a.channels || []).length })),
  distinctTargetNodes: targets.length,
  targetsWithoutName: targetsWithoutName.length,
  sampleBoneNames: named.slice(0, 8).map(n => n.name),
  VIABLE: targetsWithoutName.length === 0 && named.length > 0,
}, null, 2));
