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
import { getSupabase, getConfig } from '../auth/SupabaseClient.js';

const FN = 'meshy-wasabi-save';
const SIGN_FN = 'wasabi-sign';

export const WasabiHosting = {
  /**
   * Já é uma URL hospedada no Wasabi? (endpoint estável wasabi-sign OU URL
   * crua do bucket). Usado pra idempotência (não re-upar o que já está lá).
   */
  isWasabiUrl(url) {
    return typeof url === 'string' && (/\/functions\/v1\/wasabi-sign\?/.test(url) || /wasabisys\.com\//.test(url));
  },

  /** Monta a URL ESTÁVEL de leitura (endpoint que assina + redireciona). */
  async _signEndpoint(key) {
    try {
      const cfg = await getConfig();
      const base = (cfg?.SUPABASE_URL || '').replace(/\/$/, '');
      if (!base) return null;
      return `${base}/functions/v1/${SIGN_FN}?key=${encodeURIComponent(key)}`;
    } catch (_) { return null; }
  },

  /**
   * Sobe um arquivo (lido de uma URL do Meshy) pro Wasabi via Edge Function
   * server-side e devolve a URL ESTÁVEL de leitura (wasabi-sign endpoint), que
   * assina e redireciona pro bucket na hora do load (bucket privado → sem
   * precisar tornar público).
   * @param {string} srcUrl   URL de origem (modelo/imagem do Meshy).
   * @param {string} key      arquivo (ex.: 'abc.glb'); vai pro prefixo game-assets/.
   * @param {string} contentType  ex.: 'model/gltf-binary' | 'image/png'
   * @returns {Promise<string|null>} URL estável de leitura ou null (falha/sem login).
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
      // Guarda a URL ESTÁVEL (endpoint que assina+redireciona), não a URL crua.
      const stable = data?.key ? await this._signEndpoint(data.key) : null;
      return stable || data?.publicUrl || null;
    } catch (e) {
      console.warn('[WasabiHosting] upload erro:', e?.message || e);
      return null;
    }
  },
};
