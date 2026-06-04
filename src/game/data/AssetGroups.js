// ─────────────────────────────────────────────────────────────────
//  AssetGroups.js — sistema de grupos de assets gerados
//
//  Grupos built-in (editáveis, não deletáveis):
//    🏗️ Construção  — estático, colisão, sombra
//    🎨 Decorativos — quebráveis, física, peso
//    🌿 Natureza    — estático decorativo
//    🐉 Personagens — NPCs/criaturas (sem colisão)
//
//  Assets têm: id, name, groupId, glbUrl, imageUrl, createdAt
//  Grupos têm: id, name, icon, color, builtin, props{}
// ─────────────────────────────────────────────────────────────────
import { LocalDB } from './LocalDB.js';
import { AssetRegistry } from './AssetRegistry.js';
import { BUILD_PIECES } from '../build/BuildPieces.js';
import { GeneratedAssets } from './GeneratedAssets.js';

const STORE_GROUPS = 'asset_groups';
const STORE_ASSETS = 'asset_library';

export const BUILTIN_GROUPS = [
  {
    id: 'construcao',
    name: 'Construção',
    icon: '🏗️',
    color: '#4a8fff',
    builtin: true,
    props: {
      collidable:  true,
      breakable:   false,
      physics:     false,
      castShadows: true,
      desc: 'Estático · colisão · sombra',
    },
  },
  {
    id: 'geometria',
    name: 'Geometria',
    icon: '🔷',
    color: '#5fd0e0',
    builtin: true,
    props: {
      collidable:  true,
      breakable:   false,
      physics:     false,
      castShadows: true,
      desc: 'Primitivas · manipuláveis',
    },
  },
  {
    id: 'decorativo',
    name: 'Decorativos',
    icon: '🎨',
    color: '#ff9a4a',
    builtin: true,
    props: {
      collidable:  false,
      breakable:   true,
      physics:     true,
      castShadows: true,
      desc: 'Quebráveis · física · peso',
    },
  },
  {
    id: 'natureza',
    name: 'Natureza',
    icon: '🌿',
    color: '#4dcc77',
    builtin: true,
    props: {
      collidable:  true,
      breakable:   false,
      physics:     false,
      castShadows: true,
      desc: 'Estático · decorativo',
    },
  },
  {
    id: 'personagem',
    name: 'Personagens',
    icon: '🐉',
    color: '#cc4dcc',
    builtin: true,
    props: {
      collidable:  false, breakable: false, physics: false, castShadows: true,
      desc: 'NPCs e aliados',
    },
  },
  {
    id: 'inimigo',
    name: 'Inimigos',
    icon: '👹',
    color: '#e0473a',
    builtin: true,
    props: {
      collidable:  false, breakable: false, physics: false, castShadows: true,
      desc: 'Monstros e inimigos',
    },
  },
  {
    id: 'arma',
    name: 'Armas',
    icon: '⚔️',
    color: '#b0b8c8',
    builtin: true,
    props: {
      collidable:  false, breakable: false, physics: false, castShadows: true,
      desc: 'Armas equipáveis',
    },
  },
  {
    id: 'consumivel',
    name: 'Consumíveis',
    icon: '🧪',
    color: '#46d6c0',
    builtin: true,
    props: {
      collidable:  false, breakable: false, physics: true, collectable: true, castShadows: true,
      desc: 'Poções e itens usáveis',
    },
  },
  {
    id: 'loot',
    name: 'Tesouro',
    icon: '💰',
    color: '#ffcf3a',
    builtin: true,
    props: {
      collidable:  false, breakable: true, physics: true, collectable: true, castShadows: true,
      desc: 'Baús, moedas e chaves',
    },
  },
  {
    id: 'props',
    name: 'Props',
    icon: '📦',
    color: '#c08a5a',
    builtin: true,
    props: {
      collidable:  true, breakable: true, physics: true, castShadows: true,
      desc: 'Objetos do cenário (caixas, barris)',
    },
  },
];

export class AssetGroups {

  // ── Grupos ──────────────────────────────────────────────────────
  static async getGroups() {
    const custom = await LocalDB.get(STORE_GROUPS, []);
    // Mescla: built-ins primeiro, depois customizados
    const all = BUILTIN_GROUPS.map(b => {
      const override = custom.find(c => c.id === b.id);
      return override ? { ...b, ...override, builtin: true } : { ...b };
    });
    for (const g of custom) {
      if (!BUILTIN_GROUPS.find(b => b.id === g.id)) all.push(g);
    }
    return all;
  }

  static async saveGroup(group) {
    const saved = await LocalDB.get(STORE_GROUPS, []);
    const idx   = saved.findIndex(g => g.id === group.id);
    if (idx >= 0) saved[idx] = group; else saved.push(group);
    await LocalDB.save(STORE_GROUPS, saved);
  }

  static async deleteGroup(id) {
    if (BUILTIN_GROUPS.find(b => b.id === id)) return false; // não deleta built-ins
    const saved = await LocalDB.get(STORE_GROUPS, []);
    await LocalDB.save(STORE_GROUPS, saved.filter(g => g.id !== id));
    // Orphan assets — move para sem grupo
    const assets = await LocalDB.get(STORE_ASSETS, []);
    for (const a of assets) { if (a.groupId === id) a.groupId = null; }
    await LocalDB.save(STORE_ASSETS, assets);
    return true;
  }

  static async createGroup({ name, icon = '📦', color = '#888', props = {} }) {
    const id    = 'grp_' + Date.now().toString(36);
    const group = { id, name, icon, color, builtin: false, props: {
      collidable:  false,
      breakable:   false,
      physics:     false,
      castShadows: true,
      desc: '',
      ...props,
    }};
    await this.saveGroup(group);
    return group;
  }

  // ── Assets do jogo (built-in, do AssetRegistry) ─────────────────
  //  Não-geráveis: digimons, criaturas, armas, itens, natureza.
  //  Mapeados pra grupos por categoria. Carregam custom-overrides de
  //  grupo salvos pelo usuário (builtin_overrides).
  static async getBuiltinAssets() {
    const overrides = await LocalDB.get('builtin_group_overrides', {});
    const catToGroup = {
      nature:   'natureza',
      weapon:   'arma',
      creature: 'inimigo',
      digimon:  'inimigo',
      decor:    'decorativo',
    };
    // Itens são variados → mapeia pelo nome
    const itemGroup = (id) => {
      if (/potion|bottle/i.test(id))         return 'consumivel';
      if (/chest|key|coin/i.test(id))        return 'loot';
      if (/crate|barrel|torch|dummy/i.test(id)) return 'props';
      return 'props';
    };
    // Decoração: alguns viram consumível/munição, resto decorativo
    const decorGroup = (id) => {
      if (/medkit/i.test(id))  return 'consumivel';
      if (/ammoBox/i.test(id)) return 'props';
      return 'decorativo';
    };

    const out = [];
    for (const cat of ['item', 'nature', 'weapon', 'creature', 'digimon', 'decor']) {
      for (const id of AssetRegistry.ids(cat)) {
        const aid = `builtin_${cat}_${id}`;
        const dflt = cat === 'item'  ? itemGroup(id)
                   : cat === 'decor' ? decorGroup(id)
                   : (catToGroup[cat] || null);
        out.push({
          id:       aid,
          name:     id,
          glbUrl:   AssetRegistry.path(cat, id),
          groupId:  overrides[aid] ?? dflt,
          category: cat,
          builtin:  true,
          imageUrl: null,
        });
      }
    }

    // ── Peças PROCEDURAIS (parede/porta/janela/chão/escada/geometria) ──
    //  Não são GLB — geradas em código. Grupo vem do próprio def (p.groupId).
    for (const p of BUILD_PIECES) {
      out.push({
        id:       p.id,
        name:     p.name,
        pieceId:  p.pieceId,            // marca como peça procedural
        kind:     'piece',
        drag:     p.drag || null,       // 'wall' | 'floor' → modo arrastar
        groupId:  overrides[p.id] ?? p.groupId ?? 'construcao',
        category: 'piece',
        builtin:  true,
        imageUrl: p.thumb || null,      // miniatura desenhada
      });
    }
    return out;
  }

  // ── Assets ──────────────────────────────────────────────────────
  //  GLOBAIS: mescla o catálogo do Supabase (todos os players) com o cache
  //  local. Em empate de id, o LOCAL vence (preserva rename/move do dono);
  //  os gerados pelos OUTROS entram como read-only. Offline → só local.
  static async getAssets(groupId = undefined) {
    const local = await LocalDB.get(STORE_ASSETS, []);
    let merged = local;
    let _hasSession = false, _globalN = 0, _err = null;
    try {
      _hasSession = await GeneratedAssets.available();
      if (_hasSession) {
        const global = await GeneratedAssets.loadAll();
        _globalN = global.length;
        const byId = new Map(local.map(a => [a.id, a]));
        for (const g of global) if (!byId.has(g.id)) byId.set(g.id, g);
        merged = Array.from(byId.values());
      }
    } catch (e) { _err = e?.message || String(e); /* offline → segue com local */ }
    // DIAGNÓSTICO (só no load completo): mostra no chat por que a biblioteca
    // pode estar vazia (sem sessão? global 0? erro 406 do schema transfps?).
    if (groupId === undefined) {
      try {
        window._dbg?.(
          `biblioteca: ${local.length} local + ${_globalN} global · sessão: ${_hasSession ? 'sim' : 'NÃO'}` +
          (_err ? ` · erro: ${_err}` : ''),
          (merged.length === 0 || _err) ? '#ff5050' : '#9fe'
        );
      } catch (_) {}
    }
    if (groupId === undefined) return merged;
    if (groupId === null)      return merged.filter(a => !a.groupId);
    return merged.filter(a => a.groupId === groupId);
  }

  static async saveAsset(asset) {
    const all = await LocalDB.get(STORE_ASSETS, []);
    const idx = all.findIndex(a => a.id === asset.id);
    if (idx >= 0) all[idx] = asset; else all.unshift(asset);
    await LocalDB.save(STORE_ASSETS, all);
    try { await GeneratedAssets.add(asset); } catch (_) {}   // catálogo GLOBAL (todos veem)
    return asset;
  }

  static async moveAsset(assetId, newGroupId) {
    // Built-in: grava override de grupo (não está no STORE_ASSETS)
    if (String(assetId).startsWith('builtin_')) {
      const ov = await LocalDB.get('builtin_group_overrides', {});
      ov[assetId] = newGroupId;
      await LocalDB.save('builtin_group_overrides', ov);
      return true;
    }
    const all   = await LocalDB.get(STORE_ASSETS, []);
    const asset = all.find(a => a.id === assetId);
    if (!asset) return false;
    asset.groupId = newGroupId;
    await LocalDB.save(STORE_ASSETS, all);
    return true;
  }

  // ── Propriedades de gameplay por asset (override do grupo) ───────
  static async getAssetProps(asset) {
    const ov = await LocalDB.get('asset_props_overrides', {});
    if (ov[asset.id]) return ov[asset.id];
    const groups = await this.getGroups();
    const g = groups.find(x => x.id === asset.groupId);
    return { ...(g?.props || {}) };
  }

  static async setAssetProps(assetId, props) {
    const ov = await LocalDB.get('asset_props_overrides', {});
    ov[assetId] = props;
    await LocalDB.save('asset_props_overrides', ov);
  }

  // ── Escala PADRÃO por asset (todos do mesmo tipo usam) ───────────
  //  Guardada em 'asset_default_scale' { [assetId]: number }. Usada pelo
  //  ghost ao colocar e pelo "Aplicar a todos" pra padronizar o mapa.
  static async getDefaultScale(assetId) {
    const map = await LocalDB.get('asset_default_scale', {});
    return map[assetId] ?? null;
  }
  static async setDefaultScale(assetId, scale) {
    const map = await LocalDB.get('asset_default_scale', {});
    map[assetId] = scale;
    await LocalDB.save('asset_default_scale', map);
  }
  static async allDefaultScales() {
    return await LocalDB.get('asset_default_scale', {});
  }

  static async deleteAsset(assetId) {
    let all = await LocalDB.get(STORE_ASSETS, []);
    all     = all.filter(a => a.id !== assetId);
    await LocalDB.save(STORE_ASSETS, all);
    try { await GeneratedAssets.remove(assetId); } catch (_) {}   // some do catálogo GLOBAL (só dono)
  }

  static async renameAsset(assetId, newName) {
    const all   = await LocalDB.get(STORE_ASSETS, []);
    const asset = all.find(a => a.id === assetId);
    if (!asset) return;
    asset.name = newName;
    await LocalDB.save(STORE_ASSETS, all);
  }

  // ── Migração assets antigos → nova biblioteca ───────────────────
  static async migrateOld() {
    const old = await LocalDB.get('generated_assets', []);
    if (!old.length) return 0;
    const existing    = await LocalDB.get(STORE_ASSETS, []);
    const existingIds = new Set(existing.map(a => a.id));
    let n = 0;
    for (const a of old) {
      if (!existingIds.has(a.id)) {
        existing.push({
          ...a,
          groupId:     a.groupId || null,
          imageUrl:    a.imageUrl || null,
          createdAt:   a.createdAt || Date.now(),
          _migrated:   true,
        });
        n++;
      }
    }
    if (n > 0) await LocalDB.save(STORE_ASSETS, existing);
    return n;
  }
}
