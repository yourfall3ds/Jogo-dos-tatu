// ─────────────────────────────────────────────────────────────────
//  WasabiHosting — hospeda assets GERADOS (imagem + GLB) no Wasabi.
//
//  O upload é SERVER-SIDE: a Edge Function meshy-wasabi-save busca os bytes
//  da URL do Meshy e sobe no bucket Wasabi (sem CORS no browser). Os arquivos
//  vão pro prefixo público `game-assets/` → a URL devolvida é pública e
//  carrega direto em qualquer player do mundo compartilhado.
//
//  Sem sessão/offline → no-op gracioso (retorna null; quem chama mantém a URL
//  original/local).
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';

const FN = 'meshy-wasabi-save';

export const WasabiHosting = {
  /** Já é uma URL hospedada no Wasabi? */
  isWasabiUrl(url) {
    return typeof url === 'string' && /wasabisys\.com\//.test(url);
  },

  /**
   * Sobe um arquivo (lido de uma URL do Meshy) pro Wasabi via Edge Function.
   * @param {string} srcUrl   URL de origem (modelo/imagem do Meshy).
   * @param {string} key      caminho/arquivo (ex.: 'abc.glb'); vai pro prefixo game-assets/.
   * @param {string} contentType  ex.: 'model/gltf-binary' | 'image/png'
   * @returns {Promise<string|null>} URL pública do Wasabi ou null (falha/sem login).
   */
  async saveFromUrl(srcUrl, key, contentType) {
    if (!srcUrl || !key) return null;
    if (this.isWasabiUrl(srcUrl)) return srcUrl;           // já hospedado
    // blob:/data: são locais → a função server-side não consegue buscar.
    if (/^(blob:|data:)/.test(srcUrl)) return null;
    try {
      const supa = await getSupabase();
      const { data: sess } = await supa.auth.getSession();
      if (!sess?.session) return null;                     // sem login → não sobe
      const { data, error } = await supa.functions.invoke(FN, {
        body: { url: srcUrl, key, contentType: contentType || null },
      });
      if (error) {
        let detail = error.message;
        try { detail = (await error.context?.text?.()) || detail; } catch (_) {}
        console.warn('[WasabiHosting] upload falhou:', detail);
        return null;
      }
      if (data?.error) { console.warn('[WasabiHosting] upload falhou:', data.error); return null; }
      return data?.publicUrl || null;
    } catch (e) {
      console.warn('[WasabiHosting] upload erro:', e?.message || e);
      return null;
    }
  },
};
