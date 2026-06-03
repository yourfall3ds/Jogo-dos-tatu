// ─────────────────────────────────────────────────────────────────
//  MonsterVAT — Baked Vertex Animation Texture pipeline para monstros
//
//  PROBLEMA: animação de esqueleto é calculada na CPU por bicho. Numa
//  HORDA (dezenas/centenas de inimigos), isso vira o gargalo → FPS cai.
//
//  SOLUÇÃO (VAT): assa as animações do GLB (idle/walk/attack) numa TEXTURA
//  (matrizes dos ossos por frame) e a GPU aplica o skinning no vertex
//  shader. Combinado com INSTANCES, dá pra desenhar centenas de monstros
//  iguais quase de graça — cada instância com sua própria animação + offset
//  de tempo (não ficam todos em sincronia robótica).
//
//  Limitações conhecidas do VAT: sem blend entre animações e sem
//  interpolação entre frames (a suavidade depende do nº de frames).
//
//  Uso:
//    const vat = new MonsterVAT(scene);
//    await vat.bake('monsterPlant');               // assa 1x (cacheável)
//    vat.spawnHorde('monsterPlant', 100, { radius: 12 });
//    // troca a anim de uma instância: vat.setAnim(inst, key, idx)
// ─────────────────────────────────────────────────────────────────

import { ASSET_PATHS }   from '../../AssetLoader.js';
import { EnemyCatalog }  from '../data/EnemyCatalog.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

function _enc(p) { return p ? p.split('/').map(s => encodeURIComponent(s)).join('/') : p; }

// Resolve o caminho do GLB de um monstro (mesma lógica do MonsterDebug)
export function monsterGlbPath(key) {
  if (key === 'monsterPlant') return _enc(ASSET_PATHS.monsterPlant);
  const def = EnemyCatalog[key];
  if (!def) return null;
  const raw = AssetRegistry.path(def.category, def.asset);
  return raw ? _enc(raw) : null;
}

export class MonsterVAT {
  constructor(scene) {
    this.scene   = scene;
    this.bundles = new Map();   // key -> { mesh, manager, ranges, fps, fitScale, root, instances }
    this._obs    = null;        // observable que avança manager.time
  }

  /**
   * Carrega o GLB, escolhe a malha skinnada dominante, fatia cada
   * AnimationGroup em um range [from,to] e ASSA a VAT (bakeVertexDataSync).
   * Idempotente por key. Retorna o "bundle".
   */
  async bake(key, opts = {}) {
    if (this.bundles.has(key)) return this.bundles.get(key);

    const url = opts.url || monsterGlbPath(key);
    if (!url) throw new Error('[VAT] caminho não encontrado p/ ' + key);
    const folder = url.substring(0, url.lastIndexOf('/') + 1);
    const file   = url.substring(url.lastIndexOf('/') + 1);

    const res     = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene);
    const root    = res.meshes[0];
    const skinned = res.meshes
      .filter(m => m.skeleton && (m.getTotalVertices?.() || 0) > 0)
      .sort((a, b) => b.getTotalVertices() - a.getTotalVertices());
    const groups  = res.animationGroups || [];

    if (!skinned.length || !groups.length) {
      res.meshes.forEach(m => { try { m.dispose(); } catch (_) {} });
      groups.forEach(g => { try { g.dispose(); } catch (_) {} });
      throw new Error('[VAT] ' + key + ' é estático (sem skeleton+animação) — não dá pra assar');
    }

    const mesh = skinned[0];
    const fps  = opts.fps || 30;

    // Desparenta a malha do __root__ do GLTF (transform enorme do import) e
    //  zera o transform próprio → as instâncias ficam em ESPAÇO DE MUNDO
    //  limpo (senão herdavam a escala/rotação gigante e iam parar longe).
    mesh.setParent(null);
    mesh.position.set(0, 0, 0);
    mesh.rotationQuaternion = null;
    mesh.rotation.set(0, 0, 0);
    mesh.scaling.set(1, 1, 1);
    mesh.computeWorldMatrix(true);

    // Cada AnimationGroup vira um clipe [from,to] (em frames absolutos).
    //  Dedupe: GLBs costumam ter "Foo" e "Armature|Foo" idênticos.
    const seen = new Set();
    const ranges = groups
      .map(g => ({ name: g.name.replace(/^Armature\|/i, ''), from: Math.round(g.from), to: Math.round(g.to) }))
      .filter(r => r.to > r.from)
      .filter(r => { const k = `${r.name}|${r.from}|${r.to}`; if (seen.has(k)) return false; seen.add(k); return true; });

    // ── Assa as matrizes dos ossos por frame numa textura ──
    const baker   = new BABYLON.VertexAnimationBaker(this.scene, mesh);
    const useHalf = !!this.scene.getEngine().getCaps().textureHalfFloat;   // metade da memória
    const baked   = baker.bakeVertexDataSync(ranges, useHalf);
    const texture = baker.textureFromBakedVertexData(baked);

    const manager = new BABYLON.BakedVertexAnimationManager(this.scene);
    manager.texture = texture;
    manager.setAnimationParameters(ranges[0].from, ranges[0].to, 0, fps);
    mesh.bakedVertexAnimationManager = manager;

    // Buffer por-instância: cada instância escolhe (from,to,offset,fps)
    mesh.registerInstancedBuffer('bakedVertexAnimationSettingsInstanced', 4);
    mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
      new BABYLON.Vector4(ranges[0].from, ranges[0].to, 0, fps);

    // Os AnimationGroups já foram assados → descarta (VAT assume o skinning)
    groups.forEach(g => { try { g.dispose(); } catch (_) {} });

    // Normalização de escala (altura alvo) — só da malha instanciada, já
    //  com transform identidade (world bbox == geometria crua que a instância usa)
    const fitScale = this._computeFitScale([mesh], opts.targetHeight || EnemyCatalog[key]?.targetHeight || 1.7);

    // Template é só a base das instâncias → não desenha sozinho
    mesh.setEnabled(true);
    mesh.isVisible = false;

    // Avança o tempo global do VAT uma única vez (todas as instâncias usam)
    if (!this._obs) {
      this._obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        for (const b of this.bundles.values()) b.manager.time += dt;
      });
    }

    const bundle = { key, mesh, manager, ranges, fps, fitScale, root, instances: [] };
    this.bundles.set(key, bundle);
    console.log(`[VAT] ✅ ${key} assado — ${ranges.length} clipe(s): ${ranges.map(r => r.name).join(', ')} · ${mesh.skeleton.bones.length} ossos`);
    return bundle;
  }

  /** Índice do clipe cujo nome casa com `name` (ex: 'idle','walk','attack') */
  animIndex(key, name) {
    const b = this.bundles.get(key);
    if (!b) return 0;
    const i = b.ranges.findIndex(r => new RegExp(name, 'i').test(r.name));
    return i < 0 ? 0 : i;
  }

  /** Cria UMA instância animada do monstro já assado */
  spawn(key, position, { rotationY = 0, scale = 1, animIndex = 0, stagger = true } = {}) {
    const b = this.bundles.get(key);
    if (!b) throw new Error('[VAT] ' + key + ' não foi assado (chame bake primeiro)');
    const r    = b.ranges[Math.min(animIndex, b.ranges.length - 1)];
    const inst = b.mesh.createInstance(`${key}_i${b.instances.length}`);
    inst.parent = null;                       // espaço de mundo (não herda nada)
    inst.position.copyFrom(position);
    inst.rotation.y = rotationY;
    inst.scaling.setAll(b.fitScale * scale);
    inst.isVisible  = true;
    // offset de tempo p/ não ficarem todos no mesmo frame (robótico)
    const off = stagger ? Math.random() * (r.to - r.from) : 0;
    inst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
      new BABYLON.Vector4(r.from, r.to, off, b.fps);
    inst._vatKey = key;
    b.instances.push(inst);
    return inst;
  }

  /** Troca a animação de uma instância (idle↔walk↔attack), mantendo o offset */
  setAnim(inst, key, animIndex) {
    const b = this.bundles.get(key);
    if (!b) return;
    const r   = b.ranges[Math.min(animIndex, b.ranges.length - 1)];
    const cur = inst.instancedBuffers.bakedVertexAnimationSettingsInstanced;
    inst.instancedBuffers.bakedVertexAnimationSettingsInstanced =
      new BABYLON.Vector4(r.from, r.to, cur?.w === b.fps ? cur.z : 0, b.fps);
  }

  /** Spawna uma horda em anel ao redor de um centro */
  async spawnHorde(key, count, { center = BABYLON.Vector3.Zero(), radius = 10, scale = 1, animName = null } = {}) {
    await this.bake(key);
    const ai  = animName ? this.animIndex(key, animName) : 0;
    const out = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const rr  = radius * (0.25 + Math.random() * 0.75);
      const pos = new BABYLON.Vector3(center.x + Math.cos(ang) * rr, center.y, center.z + Math.sin(ang) * rr);
      out.push(this.spawn(key, pos, { rotationY: Math.random() * Math.PI * 2, scale, animIndex: ai, stagger: true }));
    }
    console.log(`[VAT] 🧟 horda de ${count}× ${key} spawnada`);
    return out;
  }

  /** Remove todas as instâncias de uma key (mantém o template assado) */
  clearInstances(key) {
    const b = this.bundles.get(key);
    if (!b) return;
    b.instances.forEach(i => { try { i.dispose(); } catch (_) {} });
    b.instances = [];
  }

  _computeFitScale(meshes, targetH) {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    for (const m of meshes) {
      if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
      any = true;
    }
    if (!any) return 1;
    const h = Math.max(max.y - min.y, 1e-4);
    return targetH / h;
  }

  dispose() {
    if (this._obs) { this.scene.onBeforeRenderObservable.remove(this._obs); this._obs = null; }
    for (const b of this.bundles.values()) {
      b.instances.forEach(i => { try { i.dispose(); } catch (_) {} });
      try { b.manager.texture?.dispose(); } catch (_) {}
      try { b.manager.dispose?.(); }        catch (_) {}
      try { b.mesh.dispose(); }             catch (_) {}
      try { b.root?.dispose?.(); }          catch (_) {}
    }
    this.bundles.clear();
  }
}
