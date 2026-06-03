// ─────────────────────────────────────────────────────────────────
//  AssetHosting — sobe GLBs gerados pro Supabase Storage (bucket público
//  'transfps-assets') pra que TODOS os players consigam carregar o asset
//  no mundo compartilhado (URL pública, sem depender do PC de quem gerou).
//
//  Sem isso, um asset do Meshy fica como caminho LOCAL (assets/generated/…)
//  que só existe na máquina de quem gerou → não carrega pros outros.
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';

const BUCKET = 'transfps-assets';

export const AssetHosting = {
  /** É uma URL pública do Supabase Storage? (já hospedada). */
  isPublicUrl(url) {
    return typeof url === 'string' && url.includes('/storage/v1/object/public/');
  },

  /**
   * Sobe um GLB (lido de uma URL local/remota) pro Storage público.
   * Precisa de sessão logada (RLS). Retorna a URL pública ou null (fallback
   * pro caminho local em quem não está logado / offline).
   */
  async uploadFromUrl(srcUrl, filename) {
    if (!srcUrl || !filename) return null;
    if (this.isPublicUrl(srcUrl)) return srcUrl;   // já hospedado
    try {
      const supa = await getSupabase();
      const { data: s } = await supa.auth.getSession();
      if (!s?.session) return null;                // sem login → não sobe
      const resp = await fetch(srcUrl);
      if (!resp.ok) throw new Error('fetch GLB ' + resp.status);
      const blob = await resp.blob();
      const path = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const up = await supa.storage.from(BUCKET).upload(path, blob, {
        contentType: 'model/gltf-binary', upsert: true,
      });
      if (up.error) throw up.error;
      const { data } = supa.storage.from(BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (e) {
      console.warn('[AssetHosting] upload falhou:', e?.message || e);
      return null;
    }
  },
};
