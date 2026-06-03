// ─────────────────────────────────────────────────────────────────
//  CloudSave — persistência por-usuário no Supabase (schema transfps).
//
//  Tabelas (criadas na migration transfps_world_and_persistence):
//   - transfps.inventory  (user_id, bag, equip, hotbar)   → RLS dono
//   - transfps.settings   (user_id, data jsonb)           → RLS dono
//
//  Estratégia: nuvem é a fonte da verdade; localStorage continua como
//  CACHE OFFLINE (os call sites já gravam digifps_inv/digifps_stats).
//  Saves são DEBOUNCED (coalescem rajadas de ações). Se não há sessão
//  (deslogado / offline), tudo vira no-op gracioso e o jogo usa o cache.
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';

const SAVE_DEBOUNCE_MS = 1200;

/** ID do usuário logado, a partir da sessão local (sem chamada de rede). */
async function _uid() {
  try {
    const supa = await getSupabase();
    const { data } = await supa.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (_) {
    return null;
  }
}

// Cache do settings.data inteiro pra fazer patch sem clobber de outras chaves.
let _settingsCache = null;

// Timers de debounce por "kind".
const _timers = {};
const _pending = {};
function _scheduleUpsert(kind, fn) {
  _pending[kind] = fn;
  if (_timers[kind]) return;
  _timers[kind] = setTimeout(async () => {
    _timers[kind] = null;
    const job = _pending[kind];
    _pending[kind] = null;
    if (job) { try { await job(); } catch (e) { console.warn(`[CloudSave] upsert ${kind} falhou:`, e?.message || e); } }
  }, SAVE_DEBOUNCE_MS);
}

export const CloudSave = {
  /** Há sessão logada? (true → vale a pena sincronizar). */
  async isLoggedIn() { return !!(await _uid()); },

  // ── INVENTÁRIO ──────────────────────────────────────────────────
  /** Carrega {bag,equip,hotbar} da nuvem, ou null se não houver/erro. */
  async loadInventory() {
    const id = await _uid();
    if (!id) return null;
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps')
        .from('inventory').select('bag,equip,hotbar').eq('user_id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { bag: data.bag || [], equip: data.equip || {}, hotbar: data.hotbar || [] };
    } catch (e) {
      console.warn('[CloudSave] loadInventory falhou:', e?.message || e);
      return null;
    }
  },
  /** Salva {bag,equip,hotbar} (debounced upsert). */
  saveInventory(json) {
    if (!json) return;
    _scheduleUpsert('inventory', async () => {
      const id = await _uid();
      if (!id) return;
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('inventory').upsert({
        user_id: id,
        bag: json.bag || [],
        equip: json.equip || {},
        hotbar: json.hotbar || [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    });
  },

  // ── SETTINGS (stats + prefs + skin/classe durável) ──────────────
  /** Carrega o blob settings.data inteiro (e cacheia p/ patches). */
  async _loadSettingsData() {
    if (_settingsCache) return _settingsCache;
    const id = await _uid();
    if (!id) return (_settingsCache = {});
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps')
        .from('settings').select('data').eq('user_id', id).maybeSingle();
      if (error) throw error;
      _settingsCache = (data?.data && typeof data.data === 'object') ? data.data : {};
    } catch (e) {
      console.warn('[CloudSave] loadSettings falhou:', e?.message || e);
      _settingsCache = {};
    }
    return _settingsCache;
  },
  /** Faz merge de `patch` em settings.data e agenda upsert. */
  _patchSettings(patch) {
    _settingsCache = { ...(_settingsCache || {}), ...patch };
    const snapshot = _settingsCache;
    _scheduleUpsert('settings', async () => {
      const id = await _uid();
      if (!id) return;
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('settings').upsert({
        user_id: id, data: snapshot, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    });
  },

  /** Stats do RPG ficam em settings.data.stats. */
  async loadStats() {
    const data = await this._loadSettingsData();
    return data?.stats || null;
  },
  saveStats(json) {
    if (!json) return;
    this._patchSettings({ stats: json });
  },

  /** Acessor genérico de preferência (volume, sangue, skin/classe, etc). */
  async getSetting(key, def = null) {
    const data = await this._loadSettingsData();
    return (key in (data || {})) ? data[key] : def;
  },
  setSetting(key, value) {
    this._patchSettings({ [key]: value });
  },
};
