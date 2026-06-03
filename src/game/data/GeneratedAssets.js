// ─────────────────────────────────────────────────────────────────
//  GeneratedAssets — catálogo GLOBAL de assets gerados (Meshy) no Supabase.
//
//  Tabela: transfps.generated_assets
//    id text PK · owner_id uuid · name · glb_url · image_url · group_id · created_at
//  RLS:
//    SELECT → true        (TODO MUNDO vê TODOS os gerados → biblioteca global)
//    INS/UPD/DEL → owner_id = auth.uid()  (só o dono mexe no que criou)
//
//  O GLB binário vive no Storage público (transfps-assets); aqui guardamos
//  só o REGISTRO (url + metadados) pra qualquer player carregar/colocar.
//  Sem sessão/offline → tudo vira no-op gracioso (cai no cache local do
//  AssetGroups/LocalDB).
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';

async function _uid() {
  try {
    const supa = await getSupabase();
    const { data } = await supa.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) { return null; }
}

function _rowToAsset(r) {
  return {
    id:        r.id,
    name:      r.name,
    glbUrl:    r.glb_url,
    imageUrl:  r.image_url,
    groupId:   r.group_id,
    owner_id:  r.owner_id,
    createdAt: r.created_at,
    _global:   true,
  };
}

export const GeneratedAssets = {
  /** Há sessão? (true → vale sincronizar com o catálogo global). */
  async available() { return !!(await _uid()); },

  /** Lista TODOS os assets gerados (de todos os players). */
  async loadAll() {
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps')
        .from('generated_assets')
        .select('id,owner_id,name,glb_url,image_url,group_id,created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(_rowToAsset);
    } catch (e) {
      console.warn('[GeneratedAssets] loadAll falhou:', e?.message || e);
      return [];
    }
  },

  /** Insere/atualiza um asset gerado (vira visível pra todos). */
  async add(asset) {
    const uid = await _uid();
    if (!uid || !asset?.id) return null;
    // só sincroniza se o GLB for acessível por OUTROS (Storage público / url
    //  absoluta). blob:/data: são locais → não adianta pôr no catálogo global.
    const url = asset.glbUrl || '';
    if (/^(blob:|data:)/.test(url)) return null;
    try {
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('generated_assets').upsert({
        id:        asset.id,
        owner_id:  uid,
        name:      asset.name || null,
        glb_url:   asset.glbUrl || null,
        image_url: asset.imageUrl || null,
        group_id:  asset.groupId || null,
      }, { onConflict: 'id' });
      if (error) throw error;
      return asset.id;
    } catch (e) {
      console.warn('[GeneratedAssets] add falhou:', e?.message || e);
      return null;
    }
  },

  /** Remove um asset gerado do catálogo global (RLS garante: só o dono). */
  async remove(assetId) {
    const uid = await _uid();
    if (!uid || !assetId) return;
    try {
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('generated_assets').delete().eq('id', assetId);
      if (error) throw error;
    } catch (e) {
      console.warn('[GeneratedAssets] remove falhou:', e?.message || e);
    }
  },
};
