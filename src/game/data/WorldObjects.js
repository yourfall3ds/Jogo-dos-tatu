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

const WORLD_ID = 'global';

async function _uid() {
  try {
    const supa = await getSupabase();
    const { data } = await supa.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) { return null; }
}

// ── Mapeamento linha(DB) ↔ registro(BuildMode) ──────────────────────
/** Registro do BuildMode → colunas da linha world_objects. */
export function recordToRow(rec) {
  if (rec.kind === 'piece' && rec.pieceId) {
    const s = Array.isArray(rec.s) ? rec.s : [rec.sc ?? 1, rec.sc ?? 1, rec.sc ?? 1];
    return {
      world_id: WORLD_ID, kind: 'piece', asset_id: rec.pieceId, url: null,
      px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
      sx: s[0], sy: s[1], sz: s[2], props: {},
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
  const sc = rec.sc ?? 1;
  return {
    world_id: WORLD_ID, kind: 'glb', asset_id: rec.id || null, url: rec.url || null,
    px: rec.p[0], py: rec.p[1], pz: rec.p[2], ry: rec.ry || 0,
    sx: sc, sy: sc, sz: sc, props: rec.groupProps || {},
  };
}

/** Linha world_objects → registro do BuildMode (com _worldId anexado). */
export function rowToRecord(row) {
  if (row.kind === 'piece') {
    return {
      kind: 'piece', pieceId: row.asset_id, name: 'w_' + row.id,
      p: [row.px, row.py, row.pz], ry: row.ry || 0,
      sc: row.sx ?? 1, s: [row.sx ?? 1, row.sy ?? 1, row.sz ?? 1],
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
  return {
    id: row.asset_id, name: 'w_' + row.id, url: row.url,
    p: [row.px, row.py, row.pz], ry: row.ry || 0, sc: row.sx ?? 1,
    groupProps: row.props || {}, _worldId: row.id,
  };
}

export const WorldObjects = {
  /** Há sessão logada? (sem login, mundo compartilhado fica indisponível). */
  async available() { return !!(await _uid()); },

  /** Carrega TODOS os objetos não-quebrados do mundo global. */
  async loadAll() {
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps')
        .from('world_objects').select('*').eq('world_id', WORLD_ID).eq('broken', false);
      if (error) throw error;
      return (data || []).map(rowToRecord);
    } catch (e) {
      console.warn('[WorldObjects] loadAll falhou:', e?.message || e);
      return [];
    }
  },

  /** Insere um objeto colocado. Retorna o uuid (id no mundo) ou null. */
  async place(rec) {
    const id = await _uid();
    if (!id) return null;
    try {
      const supa = await getSupabase();
      const row = { ...recordToRow(rec), owner_id: id };
      const { data, error } = await supa.schema('transfps')
        .from('world_objects').insert(row).select('id').single();
      if (error) throw error;
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
      return true;
    } catch (e) {
      console.warn('[WorldObjects] remove falhou:', e?.message || e);
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
      return Array.isArray(data) && data.length > 0;
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
      const supa = await getSupabase();
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
          (p) => { try { onInsert?.(rowToRecord(p.new)); } catch (_) {} })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'transfps', table: 'world_objects' },
          (p) => { try { onUpdate?.(rowToRecord(p.new), p.new); } catch (_) {} })
        .on('postgres_changes',
          { event: 'DELETE', schema: 'transfps', table: 'world_objects' },
          (p) => { try { onDelete?.(p.old?.id); } catch (_) {} })
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
