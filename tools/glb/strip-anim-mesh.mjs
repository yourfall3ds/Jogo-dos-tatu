// strip-anim-mesh.mjs — Remove a geometria/textura duplicada de um GLB de ANIMAÇÃO,
// mantendo APENAS os nós-osso (Armature/skeleton) + animationGroups.
//
// Motivo: cada GLB de anim do TransFPS carrega o personagem inteiro (mesh 26k verts +
// textura 2048px ≈ 7MB) só pra trazer a animação. O jogo re-vincula a anim ao modelo do
// player POR NOME DE OSSO (loadExternalAnimations), então o mesh é lixo — só os ossos
// e os animationGroups importam.
//
// Uso:
//   node strip-anim-mesh.mjs <input.glb> <output.glb>
//   node strip-anim-mesh.mjs --check <file.glb>   (só inspeciona, não escreve)

import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';

const io = new NodeIO();

async function inspect(path) {
  const doc = await io.read(path);
  const r = doc.getRoot();
  return {
    animations: r.listAnimations().map(a => ({ name: a.getName(), channels: a.listChannels().length })),
    nodes: r.listNodes().length,
    meshes: r.listMeshes().length,
    skins: r.listSkins().length,
    textures: r.listTextures().length,
    materials: r.listMaterials().length,
  };
}

async function strip(inPath, outPath) {
  const doc = await io.read(inPath);
  const root = doc.getRoot();

  // 1) Descartar a geometria de cada mesh (primitives = vértices/índices/atributos).
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.dispose();
  }
  // 2) Desvincular meshes (agora vazios) dos nós — não queremos o "char1".
  for (const node of root.listNodes()) {
    if (node.getMesh()) node.setMesh(null);
  }
  // 3) Remover skins (vínculo mesh↔ossos). Os NÓS-OSSO continuam vivos pois as
  //    animationGroups referenciam os nós diretamente (TRS channels), não a skin.
  for (const skin of root.listSkins()) skin.dispose();

  // 4) prune: limpa texturas/materiais/accessors órfãos. keepLeaves mantém nós-osso
  //    folha (pontas dos dedos etc.) que a anim pode referenciar mesmo sem filhos.
  await doc.transform(
    prune({ keepLeaves: true, keepAttributes: false }),
    dedup(),
  );

  await io.write(outPath, doc);
  return inspect(outPath);
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  console.log(JSON.stringify(await inspect(args[1]), null, 2));
} else {
  const [inPath, outPath] = args;
  if (!inPath || !outPath) {
    console.error('uso: node strip-anim-mesh.mjs <in.glb> <out.glb>');
    process.exit(1);
  }
  const before = await inspect(inPath);
  const after = await strip(inPath, outPath);
  console.log(JSON.stringify({ before, after }, null, 2));
}
