/**
 * LocalDB.js
 * 
 * Cliente para o servidor de banco de dados local (JSON).
 * Gerencia a comunicação com o config-server.js.
 */
export class LocalDB {
  static BASE_URL = 'http://127.0.0.1:3099';

  /**
   * Busca uma coleção do banco de dados local.
   * @param {string} collection - Nome do arquivo (ex: 'scene', 'player_save')
   * @param {Object} defaultData - Valor padrão se não existir
   */
  static async get(collection, defaultData = {}) {
    try {
      const resp = await fetch(`${this.BASE_URL}/db/${collection}`);
      if (!resp.ok) throw new Error('Falha ao ler DB local');
      const data = await resp.json();
      return (data && Object.keys(data).length > 0) ? data : defaultData;
    } catch (e) {
      console.warn(`[LocalDB] Servidor offline? Usando localStorage para '${collection}'`, e.message);
      try {
        const local = localStorage.getItem(`db_fallback_${collection}`);
        return local ? JSON.parse(local) : defaultData;
      } catch (_) {
        return defaultData;
      }
    }
  }

  /**
   * Salva dados em uma coleção local.
   * @param {string} collection - Nome do arquivo
   * @param {Object} data - Objeto JSON para salvar
   */
  static async save(collection, data) {
    // Sempre salva no localStorage como backup imediato
    localStorage.setItem(`db_fallback_${collection}`, JSON.stringify(data));

    try {
      const resp = await fetch(`${this.BASE_URL}/db/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return resp.ok;
    } catch (e) {
      console.error(`[LocalDB] Falha ao salvar no servidor:`, e.message);
      return false;
    }
  }
}
