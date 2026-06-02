// ─────────────────────────────────────────────────────────────────
//  DropSystem — drops dos inimigos (moedas + materiais)
//
//  Ao morrer, o inimigo solta itens: cada drop é um item coletável que
//  • TEM FÍSICA + COLISOR (Havok): pula do inimigo, cai e assenta no chão
//  • BRILHA: feixe de luz vertical (loot beam) + halo pulsante → "isto é
//    um drop, pode pegar"
//  • É ATRAÍDO pelo player quando perto e vai pro INVENTÁRIO ao encostar
//  • usa o MODELO GERADO (árvore de assets) quando existe; senão um
//    placeholder colorido com etiqueta "⚙" (asset a gerar)
//
//  Sem física Havok → cai num modo flutuante simples (fallback).
// ─────────────────────────────────────────────────────────────────
import { getItemDef } from './ItemCatalog.js';
import { resolveItemGlb } from './AssetLink.js';
import { physicsReady } from '../physics/PhysicsWorld.js';

const PICKUP_R = 1.6;
const MAGNET_R = 4.2;
const LIFETIME = 30;

export class DropSystem {
  constructor(scene, player) {
    this.scene  = scene;
    this.player = player;
    this.drops  = [];
    this._uid   = 0;
    this._models = {};   // itemId → { root } template carregado (ou null)
  }

  // ── Rola e solta os drops de um inimigo morto ────────────────────
  spawnFromEnemy(position, def = {}) {
    const tier = def.tier || 'rookie';
    const mult = { rookie: 1, champion: 2, ultimate: 3, mega: 5, boss: 10 }[tier] || 1;

    const coins = 1 + Math.floor(Math.random() * 3 * mult);
    const coinDrops = Math.min(5, 1 + Math.floor(coins / 2));
    const per = Math.max(1, Math.round(coins / coinDrops));
    for (let i = 0; i < coinDrops; i++) this._spawn('coin', position, per);

    const r = Math.random();
    if (r < 0.12 + 0.04 * mult)      this._spawn('mat_shard', position, 1);
    else if (r < 0.40 + 0.05 * mult) this._spawn('mat_core', position, 1);
    else if (r < 0.85)               this._spawn('mat_scrap', position, 1 + (Math.random() < 0.3 ? 1 : 0));
  }

  // ── Cria um drop ─────────────────────────────────────────────────
  _spawn(itemId, position, qty = 1) {
    const def = getItemDef(itemId);
    if (!def) return;
    const scene = this.scene;
    const id = `drop_${itemId}_${this._uid++}`;
    const col = def.color || [1, 1, 1];
    const color = new BABYLON.Color3(col[0], col[1], col[2]);

    // Corpo = pequena esfera colisora (com física) que carrega o visual.
    const body = BABYLON.MeshBuilder.CreateSphere(id, { diameter: 0.34, segments: 8 }, scene);
    body.isVisible = false;
    body.position.set(
      position.x + (Math.random() - 0.5) * 0.4,
      (position.y || 0) + 0.9,
      position.z + (Math.random() - 0.5) * 0.4
    );

    // Visual (placeholder; troca pro modelo gerado se existir)
    const visual = this._makePlaceholder(id, itemId, color, scene);
    visual.parent = body;

    // Brilho: halo + feixe vertical (loot beam)
    const halo = BABYLON.MeshBuilder.CreateSphere(`${id}_h`, { diameter: 0.6, segments: 6 }, scene);
    const hmat = new BABYLON.StandardMaterial(`${id}_hm`, scene);
    hmat.emissiveColor = color; hmat.alpha = 0.18; hmat.disableLighting = true; hmat.backFaceCulling = false;
    halo.material = hmat; halo.parent = body; halo.isPickable = false;

    const beam = BABYLON.MeshBuilder.CreateCylinder(`${id}_beam`, { height: 3.0, diameterTop: 0.0, diameterBottom: 0.5, tessellation: 8 }, scene);
    const bmat = new BABYLON.StandardMaterial(`${id}_bm`, scene);
    bmat.emissiveColor = color; bmat.alpha = 0.13; bmat.disableLighting = true; bmat.backFaceCulling = false;
    beam.material = bmat; beam.parent = body; beam.position.y = 1.4; beam.isPickable = false;

    const label = this._makeLabel(def.icon || '❔', scene);
    label.parent = body; label.position.y = 0.5;

    const drop = {
      id, itemId, qty, body, visual, halo, beam, label,
      agg: null, life: LIFETIME, collected: false, pulse: Math.random() * 6,
      hmat, bmat,
    };

    // Física: pula do inimigo, cai e assenta (colisor de verdade)
    if (physicsReady()) {
      try {
        const agg = new BABYLON.PhysicsAggregate(body, BABYLON.PhysicsShapeType.SPHERE,
          { mass: 0.4, friction: 0.5, restitution: 0.35 }, scene);
        drop.agg = agg;
        const a = Math.random() * Math.PI * 2;
        agg.body.setLinearVelocity(new BABYLON.Vector3(Math.cos(a) * 2.2, 4.5 + Math.random() * 2, Math.sin(a) * 2.2));
        agg.body.setAngularVelocity(new BABYLON.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4));
      } catch (_) { drop.agg = null; }
    }
    drop.baseY = body.position.y;

    this.drops.push(drop);
    this._tryUpgradeModel(drop, def);   // async: troca pro modelo gerado
  }

  // Placeholder: moeda = disco dourado · material = cristal/octaedro
  _makePlaceholder(id, itemId, color, scene) {
    const mat = new BABYLON.StandardMaterial(`${id}_m`, scene);
    mat.emissiveColor = color; mat.diffuseColor = color.scale(0.4);
    let mesh;
    if (itemId === 'coin') {
      mesh = BABYLON.MeshBuilder.CreateCylinder(`${id}_v`, { diameter: 0.34, height: 0.06, tessellation: 14 }, scene);
    } else {
      mesh = BABYLON.MeshBuilder.CreatePolyhedron(`${id}_v`, { type: 1, size: 0.2 }, scene);
    }
    mesh.material = mat; mesh.isPickable = false;
    mesh._isPlaceholder = true;
    return mesh;
  }

  // Carrega o modelo GERADO (se existir) e troca o placeholder por ele.
  async _tryUpgradeModel(drop, def) {
    try {
      const glbUrl = await resolveItemGlb(def);
      if (!glbUrl || drop.collected || !drop.body || drop.body.isDisposed()) return;
      let tmpl = this._models[drop.itemId];
      if (tmpl === undefined) {
        tmpl = await this._loadTemplate(glbUrl);
        this._models[drop.itemId] = tmpl || null;
      }
      if (!tmpl || drop.collected || !drop.body || drop.body.isDisposed()) return;
      // Substitui o placeholder pelo clone do modelo
      const clone = tmpl.clone(`${drop.id}_mdl`);
      clone.setEnabled(true);
      clone.parent = drop.body;
      clone.scaling.setAll(0.5 / (tmpl._fitDim || 1));
      clone.isPickable = false;
      try { drop.visual.dispose(); } catch (_) {}
      drop.visual = clone;
      if (drop.label) drop.label.setEnabled(false);   // tem modelo → tira a etiqueta ⚙
    } catch (_) {}
  }

  async _loadTemplate(glbUrl) {
    try {
      let folder = '', file = glbUrl, ext;
      if (/^https?:/.test(glbUrl)) {
        const resp = await fetch(`http://127.0.0.1:3099/proxy-image?url=${encodeURIComponent(glbUrl)}`);
        if (resp.ok) { file = URL.createObjectURL(await resp.blob()); ext = '.glb'; }
      }
      const res = await BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene, null, ext);
      const root = res.meshes.find(m => !m.parent) || res.meshes[0];
      if (!root) return null;
      root.setEnabled(false);
      const bb = root.getHierarchyBoundingVectors(true);
      root._fitDim = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
      return root;
    } catch (_) { return null; }
  }

  _makeLabel(text, scene) {
    const dt = new BABYLON.DynamicTexture(`lbl_${this._uid}`, { width: 128, height: 128 }, scene, false);
    dt.hasAlpha = true;
    const ctx = dt.getContext();
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = 'bold 84px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 60);
    ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#ffd34d';
    ctx.fillText('⚙', 100, 100);
    dt.update();
    const plane = BABYLON.MeshBuilder.CreatePlane(`lblp_${this._uid}`, { size: 0.5 }, scene);
    const m = new BABYLON.StandardMaterial(`lblm_${this._uid}`, scene);
    m.diffuseTexture = dt; m.opacityTexture = dt; m.emissiveColor = new BABYLON.Color3(1, 1, 1);
    m.disableLighting = true; m.backFaceCulling = false;
    plane.material = m; plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; plane.isPickable = false;
    return plane;
  }

  // ── Tick: brilho, atração, coleta ────────────────────────────────
  update(dt, playerPos) {
    if (!playerPos) return;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!d.body || d.body.isDisposed()) { this.drops.splice(i, 1); continue; }
      d.life -= dt;
      d.pulse += dt * 4;

      // Sem física → flutua/balança manualmente (fallback)
      if (!d.agg) d.body.position.y = (d.baseY || 0.6) + Math.sin(d.pulse) * 0.12;

      // Brilho pulsante
      const p = 0.14 + Math.sin(d.pulse) * 0.06;
      if (d.hmat) d.hmat.alpha = p;
      if (d.bmat) d.bmat.alpha = p * 0.8;
      d.visual.rotation.y += dt * 2.2;

      const bpos = d.body.position;
      const to = playerPos.subtract(bpos);
      const dist = to.length();

      if (!d.collected && dist < PICKUP_R) { this._collect(d); }
      else if (!d.collected && dist < MAGNET_R) {
        // atração: puxa o corpo pro player (com física = velocidade homing)
        const dir = to.normalize();
        const speed = 6 + (1 - dist / MAGNET_R) * 8;
        if (d.agg) d.agg.body.setLinearVelocity(dir.scale(speed));
        else bpos.addInPlace(dir.scale(dt * 10));
      }

      // Pop de coleta / expira
      if (d.collected) {
        d._pop = (d._pop || 0) + dt * 6;
        d.body.scaling.setAll(1 + d._pop * 0.5);
        if (d.hmat) d.hmat.alpha = Math.max(0, p - d._pop * 0.12);
        if (d._pop >= 1) { this._dispose(d); this.drops.splice(i, 1); }
      } else if (d.life <= 0) {
        this._dispose(d); this.drops.splice(i, 1);
      } else if (d.life < 4) {
        d.visual.isVisible = Math.floor(d.life * 6) % 2 === 0;
      }
    }
  }

  _collect(d) {
    d.collected = true;
    if (d.agg) { try { d.agg.dispose(); } catch (_) {} d.agg = null; }   // tira a física no pickup
    const inv = this.player?.inventory;
    if (inv) inv.add(d.itemId, d.qty);
    this.player?.sounds?.playNow?.('pickup_item', d.itemId === 'coin' ? 0.4 : 0.6);
  }

  _dispose(d) {
    try { d.agg?.dispose?.(); } catch (_) {}
    try { d.label?.material?.diffuseTexture?.dispose(); } catch (_) {}
    try { d.body?.dispose(false, true); } catch (_) {}
  }

  clearAll() {
    for (const d of this.drops) this._dispose(d);
    this.drops.length = 0;
  }
}
