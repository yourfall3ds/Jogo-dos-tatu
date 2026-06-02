// ─────────────────────────────────────────────────────────────────
//  EnemyManager — carrega AssetContainers (com cache) e instancia
//  inimigos animados do EnemyCatalog na cena de jogo.
//
//  LoadAssetContainerAsync + instantiateModelsToScene → cada inimigo
//  tem esqueleto E AnimationGroups próprios (vários do mesmo tipo OK).
// ─────────────────────────────────────────────────────────────────
import { AssetRegistry } from '../data/AssetRegistry.js';
import { EnemyCatalog, getEnemyDef } from '../data/EnemyCatalog.js';
import { AnimatedEnemy } from './AnimatedEnemy.js';

function enc(p) { return p.split('/').map(s => encodeURIComponent(s)).join('/'); }

export class EnemyManager {
  constructor(scene, shadowGen, level, player) {
    this.scene = scene;
    this.shadowGen = shadowGen;
    this.level = level;
    this.player = player;
    this._containers = {};
    this._loading = {};
    this._uid = 0;
  }

  async _loadContainer(id) {
    if (this._containers[id]) return this._containers[id];
    if (this._loading[id]) return this._loading[id];

    const def = getEnemyDef(id);
    if (!def) { console.warn(`[EnemyManager] inimigo "${id}" não existe`); return null; }
    const rawPath = AssetRegistry.path(def.category, def.asset);
    if (!rawPath) { console.warn(`[EnemyManager] sem caminho p/ ${id}`); return null; }

    const lastSlash = rawPath.lastIndexOf('/');
    const folder = enc(rawPath.substring(0, lastSlash + 1));
    const file = enc(rawPath.substring(lastSlash + 1));

    this._loading[id] = BABYLON.SceneLoader.LoadAssetContainerAsync(folder, file, this.scene)
      .then(container => {
        this._containers[id] = container;
        const ag = container.animationGroups?.length ?? 0;
        console.log(`[EnemyManager] ✅ container "${id}" (${container.meshes.length} meshes, ${ag} anims)`);
        return container;
      })
      .catch(e => {
        console.warn(`[EnemyManager] falha "${id}":`, e.message);
        delete this._loading[id];   // permite retry (não cacheia falha transiente)
        return null;
      });

    return this._loading[id];
  }

  async spawn(id, position) {
    // ⚠️ MpGuard: dentro de sala MP, mobs vêm SÓ do servidor (state.mobs).
    if (window._mpGuard?.isInMpRoom?.()) {
      console.log(`[EnemyManager] spawn local BLOQUEADO (sala MP): ${id}`);
      return null;
    }
    const def = getEnemyDef(id);
    if (!def) return null;
    const container = await this._loadContainer(id);
    if (!container) return null;

    const uid = this._uid++;
    const inst = container.instantiateModelsToScene(
      (n) => `enemy_${id}_${uid}_${n}`, false, { doNotInstantiate: true }
    );

    const pos = position || this._randomSpawnNearPlayer();
    const enemy = new AnimatedEnemy(this.scene, this.shadowGen, inst, pos, { ...def, id });

    enemy.onAttack = (dmg, type, fromPos, kb = 0) => this.player?.takeDamage?.(dmg, type, fromPos, kb);
    enemy.onPlaySound = (sid) => this.player?.sounds?.playNow?.(sid);
    enemy.onPlaySpatial = (sid, node) => this.player?.sounds?.playSpatial?.(sid, node);
    enemy.onDeath = (e) => this.player?.onEnemyKilled?.(e);

    this.level.enemies.push(enemy);
    return enemy;
  }

  async spawnWave(ids, count = 1) {
    const out = [];
    for (const id of ids)
      for (let i = 0; i < count; i++)
        out.push(await this.spawn(id, this._randomSpawnNearPlayer(8 + Math.random() * 12)));
    return out.filter(Boolean);
  }

  _randomSpawnNearPlayer(radius = 12) {
    const p = this.player?.mesh?.position ?? BABYLON.Vector3.Zero();
    const a = Math.random() * Math.PI * 2;
    return new BABYLON.Vector3(p.x + Math.cos(a) * radius, 0.5, p.z + Math.sin(a) * radius);
  }

  clearAll() {
    for (const e of this.level.enemies) { try { e._cleanup?.(); } catch (_) {} }
    this.level.enemies.length = 0;
  }

  catalogIds() { return Object.keys(EnemyCatalog); }
}
