// ─────────────────────────────────────────────────────────────────
//  ChibataMapLoader — carrega/troca mapas grandes (GLB completos)
//
//  Convive com o Level procedural: quando um mapa é carregado, o
//  terreno procedural fica escondido. Voltar para "Default" mostra
//  novamente. NÃO toca em colisores existentes — o mapa novo já
//  vira physics aggregate via PhysicsWorld (se Havok estiver ativo).
// ─────────────────────────────────────────────────────────────────
import { AssetRegistry } from '../data/AssetRegistry.js';

export const MapCatalog = {
  default:         { name: 'Mundo Padrão (procedural)', id: null,                 size: 'auto', biome: 'forest'    },
  calcata:         { name: 'Calcata',                   id: 'calcata',            size: 'XL',   biome: 'medieval'  },
  cemetery:        { name: 'Cemitério',                 id: 'cemetery',           size: 'L',    biome: 'horror'    },
  castleInterior:  { name: 'Castelo (Interior)',        id: 'castleInterior',     size: 'M',    biome: 'medieval'  },
  dungeonWarkarma: { name: 'Warkarma Dungeon',          id: 'dungeonWarkarma',    size: 'M',    biome: 'dungeon'   },
  forest:          { name: 'Floresta',                  id: 'forest',             size: 'M',    biome: 'forest'    },
  hellArena:       { name: 'Arena do Inferno',          id: 'hellArena',          size: 'M',    biome: 'hell'      },
  lowpolyCity:     { name: 'Cidade Low-Poly',           id: 'lowpolyCity',        size: 'XL',   biome: 'city'      },
  nightCity:       { name: 'Cidade Noturna',            id: 'nightCity',          size: 'M',    biome: 'city'      },
  pirateFort:      { name: 'Forte Pirata',              id: 'pirateFort',         size: 'M',    biome: 'pirate'    },
  snowScene:       { name: 'Cena Nevada',               id: 'snowScene',          size: 'L',    biome: 'snow'      },
  spaceStation:    { name: 'Estação Espacial',          id: 'spaceStation',       size: 'M',    biome: 'scifi'     },
  valleyVillage:   { name: 'Vale da Vila',              id: 'valleyVillage',      size: 'M',    biome: 'medieval'  },
  virtualCity:     { name: 'Cidade Virtual',            id: 'virtualCity',        size: 'M',    biome: 'scifi'     },
  westernTown:     { name: 'Cidade Faroeste',           id: 'westernTown',        size: 'L',    biome: 'western'   },
  collisionWorld:  { name: 'Mundo de Colisão (debug)',  id: 'collisionWorld',     size: 'S',    biome: 'debug'     },
};

export const BIOME_ICON = {
  forest: '🌲', medieval: '🏰', horror: '👻', dungeon: '🗝️', hell: '🔥',
  city: '🏙️', pirate: '🏴‍☠️', snow: '❄️', scifi: '🛰️', western: '🤠', debug: '🛠️',
};

// Função utilitária de encode (mesmo padrão do EnemyManager) para paths com espaço
function enc(p) { return p.split('/').map(encodeURIComponent).join('/'); }

export class ChibataMapLoader {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.currentId = null;        // null = mundo padrão
    this._loaded = {};            // cache de containers
    this._activeMeshes = [];      // meshes do mapa atual instanciados
    this._proceduralRoots = null; // snapshot dos roots procedurais (escondidos quando ativa mapa)
  }

  /** Mostra/esconde o mundo procedural do Level (chão, bumps, obstáculos). */
  _setProceduralVisible(visible) {
    if (!this.level?.scene) return;
    // Snapshot lazy: na primeira troca, salva os roots iniciais
    if (!this._proceduralRoots) {
      this._proceduralRoots = this.level.scene.meshes
        .filter(m => /^ground|^bump_|^obstacle_|^crate_|^ammoBox_|^medkit_/.test(m.name))
        .slice();
    }
    for (const m of this._proceduralRoots) {
      if (m && !m.isDisposed?.()) m.setEnabled(visible);
    }
  }

  async _loadContainer(mapId) {
    if (this._loaded[mapId]) return this._loaded[mapId];
    const rawPath = AssetRegistry.path('chibataMap', mapId);
    if (!rawPath) { console.warn(`[ChibataMap] caminho não encontrado: ${mapId}`); return null; }
    const lastSlash = rawPath.lastIndexOf('/');
    const folder = enc(rawPath.substring(0, lastSlash + 1));
    const file = enc(rawPath.substring(lastSlash + 1));
    try {
      const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(folder, file, this.scene);
      this._loaded[mapId] = container;
      console.log(`[ChibataMap] ✅ carregado "${mapId}" (${container.meshes.length} meshes)`);
      return container;
    } catch (e) {
      console.warn(`[ChibataMap] falha "${mapId}":`, e.message);
      return null;
    }
  }

  /** Descarrega o mapa atual (volta procedural). */
  unload() {
    for (const m of this._activeMeshes) {
      try { m.dispose(); } catch (_) {}
    }
    this._activeMeshes = [];
    this.currentId = null;
    this._setProceduralVisible(true);
    console.log('[ChibataMap] mundo padrão restaurado');
  }

  /** Carrega um mapa pelo id. Passe null para voltar ao procedural. */
  async load(mapId) {
    if (!mapId || mapId === 'default') { this.unload(); return true; }
    if (this.currentId === mapId) return true;

    const container = await this._loadContainer(mapId);
    if (!container) return false;

    // Limpa mapa anterior (descarta meshes instanciados)
    for (const m of this._activeMeshes) {
      try { m.dispose(); } catch (_) {}
    }
    this._activeMeshes = [];

    // Esconde mundo procedural
    this._setProceduralVisible(false);

    // Instancia os meshes do mapa (não 'instantiateModelsToScene' — queremos uma cópia única)
    container.addAllToScene();
    for (const m of container.meshes) {
      m.checkCollisions = true;
      m.receiveShadows = true;
      this._activeMeshes.push(m);
    }
    this.currentId = mapId;
    console.log(`[ChibataMap] ativo: ${mapId}`);
    return true;
  }

  list() { return Object.entries(MapCatalog); }
}
