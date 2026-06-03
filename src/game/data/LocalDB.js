/**
 * LocalDB.js
 *
 * Cliente para o servidor de banco de dados local (JSON).
 * Gerencia a comunicação com o config-server.js.
 *
 * PROD vs DEV:
 *   - Dev (localhost/127.0.0.1): tenta config-server em :3099, cai pra localStorage se offline.
 *   - Prod  (app.overpixel.online): usa direto localStorage; NUNCA fetch em 127.0.0.1:3099
 *     (estoura ERR_CONNECTION_REFUSED e polui o console).
 */
export class LocalDB {
  static BASE_URL = 'http://127.0.0.1:3099';

  /** Detecta prod (mesmo critério usado em index.html no health-check). */
  static isProd() {
    try {
      const h = location.hostname;
      return !(h === 'localhost' || h === '127.0.0.1');
    } catch (_) {
      return true;   // sem `location` (worker?) → assume prod, evita fetch
    }
  }

  /** Lê do localStorage com fallback em memória. */
  static _readLocal(collection, defaultData) {
    try {
      const local = localStorage.getItem(`db_fallback_${collection}`);
      return local ? JSON.parse(local) : defaultData;
    } catch (_) {
      return defaultData;
    }
  }

  /** Grava no localStorage (silencia QuotaExceeded). */
  static _writeLocal(collection, data) {
    try {
      localStorage.setItem(`db_fallback_${collection}`, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Busca uma coleção do banco de dados local.
   * @param {string} collection - Nome do arquivo (ex: 'scene', 'player_save')
   * @param {Object} defaultData - Valor padrão se não existir
   */
  static async get(collection, defaultData = {}) {
    // Prod: localStorage puro, sem fetch.
    if (this.isProd()) {
      return this._readLocal(collection, defaultData);
    }

    try {
      const resp = await fetch(`${this.BASE_URL}/db/${collection}`);
      if (!resp.ok) throw new Error('Falha ao ler DB local');
      const data = await resp.json();
      return (data && Object.keys(data).length > 0) ? data : defaultData;
    } catch (e) {
      console.warn(`[LocalDB] Servidor offline? Usando localStorage para '${collection}'`, e.message);
      return this._readLocal(collection, defaultData);
    }
  }

  /**
   * Salva dados em uma coleção local.
   * @param {string} collection - Nome do arquivo
   * @param {Object} data - Objeto JSON para salvar
   */
  static async save(collection, data) {
    // Sempre salva no localStorage como backup imediato
    this._writeLocal(collection, data);

    // Prod: só localStorage; não tenta config-server.
    if (this.isProd()) return true;

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
