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
import { AssetHosting } from './AssetHosting.js';
import { WasabiHosting } from './WasabiHosting.js';

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
    // O GLB precisa ser acessível por OUTROS. Hospeda no WASABI (server-side,
    // prefixo público); se falhar, cai pro Supabase Storage. Idempotente: se já
    // for URL Wasabi/Storage, mantém. Assim o asset gerado SEMPRE fica global.
    let glbUrl = asset.glbUrl || '';
    if (glbUrl && !WasabiHosting.isWasabiUrl(glbUrl) && !AssetHosting.isPublicUrl(glbUrl)) {
      const w = await WasabiHosting.saveFromUrl(glbUrl, `${asset.id}.glb`, 'model/gltf-binary');
      if (w) glbUrl = w;
      else {
        const fb = await AssetHosting.uploadFromUrl(glbUrl, `${asset.id}.glb`);
        if (fb) glbUrl = fb;
      }
    }
    // Sem URL compartilhável (upload falhou / sem login) → não adianta registrar.
    if (!glbUrl || /^(blob:|data:)/.test(glbUrl)) {
      console.warn('[GeneratedAssets] add: GLB sem URL pública (upload falhou?) — não registrado global:', asset.id);
      return null;
    }
    // Imagem/thumbnail: hospeda no Wasabi também (se vier do Meshy). blob/data
    // local não dá pra subir server-side → descarta.
    let imageUrl = asset.imageUrl || '';
    if (imageUrl && !WasabiHosting.isWasabiUrl(imageUrl) && !/^(blob:|data:)/.test(imageUrl)) {
      const wImg = await WasabiHosting.saveFromUrl(imageUrl, `${asset.id}.png`, 'image/png');
      if (wImg) imageUrl = wImg;
    }
    if (/^(blob:|data:)/.test(imageUrl)) imageUrl = '';
    try {
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('generated_assets').upsert({
        id:        asset.id,
        owner_id:  uid,
        name:      asset.name || null,
        glb_url:   glbUrl || null,
        image_url: imageUrl || null,
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
