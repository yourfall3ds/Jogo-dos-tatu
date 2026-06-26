// ─────────────────────────────────────────────────────────────────
//  WorldObjects — mundo ÚNICO GLOBAL compartilhado (estilo Fortnite).
//
//  Persistência + sync em tempo real das construções via Supabase:
//   - tabela transfps.world_objects (RLS: qualquer autenticado constrói,
//     modifica e destrói qualquer objeto — mundo colaborativo total).
//   - Supabase Realtime → todos os players veem insert/update/delete AO VIVO.
//
//  Faz a ponte entre a LINHA do banco e o REGISTRO do BuildMode (mesmo
//  formato usado em _restorePlaced), pra reaproveitar o render existente.
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';
import { LocalDB } from './LocalDB.js';

const WORLD_ID = 'global';
const WORLD_CACHE_KEY = `world_objects_cache_${WORLD_ID}`;

async function _supa() {
  try { return await getSupabase(); } catch (_) { return null; }
}

async function _uid() {
  try {
    const supa = await _supa();
    if (!supa) return null;
    const { data } = await supa.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) { return null; }
}

function _cacheRead() {
  const list = LocalDB.getSync(WORLD_CACHE_KEY, null);
  return Array.isArray(list) ? list : null;
}

function _cacheWrite(records) {
  LocalDB.setSync(WORLD_CACHE_KEY, Array.isArray(records) ? records : []);
}

function _cacheUpsert(rec) {
  if (!rec?._worldId) return;
  const list = _cacheRead() || [];
  const next = list.filter(item => item?._worldId !== rec._worldId);
  next.push(rec);
  _cacheWrite(next);
}

function _cacheRemove(worldId) {
  if (!worldId) return;
  const list = _cacheRead() || [];
  _cacheWrite(list.filter(item => item?._worldId !== worldId));
}

// ── Mapeamento linha(DB) ↔ registro(BuildMode) ──────────────────────
/** Registro do BuildMode → colunas da linha world_objects. */
export function recordToRow(rec) {
  if (rec.kind === 'piece' && rec.pieceId) {
    const s = Array.isArray(rec.s) ? rec.s : [rec.sc ?? 1, rec.sc ?? 1, rec.sc ?? 1];
    return {
      world_id: WORLD_ID, kind: 'piece', asset_id: rec.pieceId, url: null,
      px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
      sx: s[0], sy: s[1], sz: s[2], props: { breakable: rec.breakable !== false },
    };
  }
  // Máquina de Criação (item especial) — sem url; só posição.
  if (rec.kind === 'machine' || rec.id === 'assetMachine') {
    return {
      world_id: WORLD_ID, kind: 'machine', asset_id: 'assetMachine', url: null,
      px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
      sx: 1, sy: 1, sz: 1, props: {},
    };
  }
  // Quadro/picture frame: imagem (imageUrl) na url + prompt nos props.
  if (rec.kind === 'frame') {
    const sc = rec.sc ?? 1;
    return {
      world_id: WORLD_ID, kind: 'frame', asset_id: null, url: rec.imageUrl || null,
      px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
      sx: sc, sy: sc, sz: sc, props: { prompt: rec.prompt || '' },
    };
  }
  const s = Array.isArray(rec.s) ? rec.s : [rec.sc ?? 1, rec.sc ?? 1, rec.sc ?? 1];
  return {
    world_id: WORLD_ID, kind: 'glb', asset_id: rec.id || null, url: rec.url || null,
    px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
    sx: s[0], sy: s[1], sz: s[2], props: { ...(rec.groupProps || {}), breakable: rec.breakable !== false },
  };
}

/** Linha world_objects → registro do BuildMode (com _worldId anexado). */
export function rowToRecord(row) {
  if (row.kind === 'piece') {
    return {
      kind: 'piece', pieceId: row.asset_id, name: 'w_' + row.id,
      p: [row.px, row.py, row.pz], ry: row.ry || 0,
      sc: row.sx ?? 1, s: [row.sx ?? 1, row.sy ?? 1, row.sz ?? 1],
      breakable: row.props?.breakable !== false,
      _worldId: row.id,
    };
  }
  if (row.kind === 'frame') {
    return {
      kind: 'frame', id: 'w_' + row.id, name: 'w_' + row.id,
      imageUrl: row.url, prompt: row.props?.prompt || '',
      p: [row.px, row.py, row.pz], ry: row.ry || 0, sc: row.sx ?? 1,
      _worldId: row.id,
    };
  }
  if (row.kind === 'machine') {
    return {
      kind: 'machine', id: 'assetMachine',
      p: [row.px, row.py, row.pz], ry: row.ry || 0,
      _worldId: row.id,
    };
  }
  return {
    id: row.asset_id, name: 'w_' + row.id, url: row.url,
    p: [row.px, row.py, row.pz], ry: row.ry || 0, sc: row.sx ?? 1, s: [row.sx ?? 1, row.sy ?? 1, row.sz ?? 1],
    groupProps: row.props || {}, breakable: row.props?.breakable !== false, _worldId: row.id,
  };
}

export const WorldObjects = {
  /** Cliente Supabase disponível? Leitura do mundo pode funcionar mesmo sem login. */
  async available() { return !!(await _supa()); },
  async canEdit() { return !!(await _supa()); },

  /** Carrega TODOS os objetos não-quebrados do mundo global. */
  async loadAll() {
    try {
      const supa = await _supa();
      if (!supa) return null;
      const { data, error } = await supa.schema('transfps')
        .from('world_objects').select('*').eq('world_id', WORLD_ID).eq('broken', false);
      if (error) throw error;
      const records = (data || []).map(rowToRecord);
      _cacheWrite(records);
      return records;
    } catch (e) {
      console.warn('[WorldObjects] loadAll falhou:', e?.message || e);
      const cached = _cacheRead();
      return Array.isArray(cached) ? cached : null;
    }
  },

  /** Semeia o layout inicial do mundo somente se ele estiver vazio. */
  async seedDefaults(records = []) {
    const ownerId = await _uid();
    if (!Array.isArray(records) || !records.length) return false;
    try {
      const supa = await _supa();
      if (!supa) return false;
      const { count, error: countError } = await supa.schema('transfps')
        .from('world_objects')
        .select('id', { count: 'exact', head: true })
        .eq('world_id', WORLD_ID)
        .eq('broken', false);
      if (countError) throw countError;
      if ((count || 0) > 0) return false;
      const rows = records.map((rec) => {
        const row = recordToRow(rec);
        if (ownerId) row.owner_id = ownerId;
        return row;
      });
      const { error } = await supa.schema('transfps').from('world_objects').insert(rows);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[WorldObjects] seedDefaults falhou:', e?.message || e);
      return false;
    }
  },

  /** Insere um objeto colocado. Retorna o uuid (id no mundo) ou null. */
  async place(rec) {
    const id = await _uid();
    try {
      const supa = await getSupabase();
      const row = { ...recordToRow(rec) };
      if (id) row.owner_id = id;
      const { data, error } = await supa.schema('transfps')
        .from('world_objects').insert(row).select('id').single();
      if (error) throw error;
      if (data?.id) _cacheUpsert({ ...rec, _worldId: data.id });
      return data?.id || null;
    } catch (e) {
      console.warn('[WorldObjects] place falhou:', e?.message || e);
      return null;
    }
  },

  /** Remove um objeto do mundo (qualquer player pode). */
  async remove(worldId) {
    if (!worldId) return false;
    try {
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps')
        .from('world_objects').delete().eq('id', worldId);
      if (error) throw error;
      _cacheRemove(worldId);
      return true;
    } catch (e) {
      console.warn('[WorldObjects] remove falhou:', e?.message || e);
      return false;
    }
  },

  /** Atualiza transform do objeto no mundo compartilhado. */
  async updateTransform(worldId, rec) {
    if (!worldId || !rec) return false;
    try {
      const supa = await _supa();
      if (!supa) return false;
      const row = recordToRow(rec);
      const payload = {
        px: row.px,
        py: row.py,
        pz: row.pz,
        ry: row.ry,
        sx: row.sx,
        sy: row.sy,
        sz: row.sz,
        props: row.props,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supa.schema('transfps')
        .from('world_objects')
        .update(payload)
        .eq('id', worldId);
      if (error) throw error;
      _cacheUpsert({ ...rec, _worldId: worldId });
      return true;
    } catch (e) {
      console.warn('[WorldObjects] updateTransform falhou:', e?.message || e);
      return false;
    }
  },

  /**
   * Marca um objeto como quebrado (destruição compartilhada — F3).
   * ATÔMICO: o UPDATE só casa se `broken=false` (ainda inteiro). Quando dois
   * players batem no mesmo objeto, só UM consegue virar false→true e recebe
   * linhas no retorno — esse é o único que ganha o drop (sem duplicação).
   * Retorna true SOMENTE para o cliente que efetivamente destruiu.
   */
  async markBroken(worldId) {
    if (!worldId) return false;
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps')
        .from('world_objects')
        .update({ broken: true, updated_at: new Date().toISOString() })
        .eq('id', worldId).eq('broken', false)
        .select('id');
      if (error) throw error;
      const ok = Array.isArray(data) && data.length > 0;
      if (ok) _cacheRemove(worldId);
      return ok;
    } catch (e) {
      console.warn('[WorldObjects] markBroken falhou:', e?.message || e);
      return false;
    }
  },

  /**
   * Assina mudanças ao vivo. Callbacks recebem o REGISTRO já mapeado
   * (onInsert/onUpdate) ou o worldId (onDelete).
   * Retorna a função de unsubscribe.
   */
  async subscribe({ onInsert, onUpdate, onDelete } = {}) {
    try {
      const supa = await _supa();
      if (!supa) return () => {};
      // CRÍTICO: o Realtime avalia a RLS com o JWT do usuário no SOCKET. Sem
      // setAuth, o canal assina como anon → a RLS de world_objects não deixa
      // passar nada → os outros players só viam as construções no F5 (loadAll
      // via REST). Com o token setado, os eventos INSERT/UPDATE/DELETE chegam.
      try {
        const { data } = await supa.auth.getSession();
        const tok = data?.session?.access_token;
        if (tok) supa.realtime.setAuth(tok);
      } catch (_) {}
      const ch = supa.channel('transfps_world_objects')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'transfps', table: 'world_objects' },
          (p) => {
            try {
              const rec = rowToRecord(p.new);
              _cacheUpsert(rec);
              onInsert?.(rec);
            } catch (_) {}
          })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'transfps', table: 'world_objects' },
          (p) => {
            try {
              const rec = rowToRecord(p.new);
              if (p.new?.broken) _cacheRemove(rec._worldId);
              else _cacheUpsert(rec);
              onUpdate?.(rec, p.new);
            } catch (_) {}
          })
        .on('postgres_changes',
          { event: 'DELETE', schema: 'transfps', table: 'world_objects' },
          (p) => {
            try {
              _cacheRemove(p.old?.id);
              onDelete?.(p.old?.id);
            } catch (_) {}
          })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED')      console.log('[WorldObjects] 🌍 realtime ATIVO (construções ao vivo)');
          else if (status === 'CHANNEL_ERROR') console.warn('[WorldObjects] realtime CHANNEL_ERROR:', err?.message || err || '(sem msg)');
          else if (status === 'TIMED_OUT')  console.warn('[WorldObjects] realtime TIMED_OUT');
        });
      return () => { try { supa.removeChannel(ch); } catch (_) {} };
    } catch (e) {
      console.warn('[WorldObjects] subscribe falhou:', e?.message || e);
      return () => {};
    }
  },
};
