// LocalDB — adapter Supabase com cache local (transfps_storage).
// API: LocalDB.get(collection, defaultData), LocalDB.set(collection, data), LocalDB.del(collection)
// Strategy: read tenta Supabase, cai pro localStorage; write escreve em ambos.

import { getSupabase } from "../auth/SupabaseClient.js";

const LS_PREFIX = "transfps_localdb_";

export class LocalDB {
  static _userId() {
    try { return window._auth?.getUserId?.() || null; } catch (_) { return null; }
  }

  static async _supa() {
    try { return await getSupabase(); } catch (_) { return null; }
  }

  static async get(collection, defaultData = {}) {
    const key = LS_PREFIX + collection;
    const uid = LocalDB._userId();
    const supa = uid ? await LocalDB._supa() : null;
    if (supa && uid) {
      try {
        const { data, error } = await supa
          .from("transfps_storage")
          .select("payload")
          .eq("user_id", uid)
          .eq("collection", collection)
          .maybeSingle();
        if (!error && data?.payload) {
          try { localStorage.setItem(key, JSON.stringify(data.payload)); } catch (_) {}
          return data.payload;
        }
      } catch (e) { console.warn("[LocalDB] supa get falhou", collection, e?.message); }
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return defaultData;
  }

  static async set(collection, data) {
    const key = LS_PREFIX + collection;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
    const uid = LocalDB._userId();
    if (!uid) return;
    const supa = await LocalDB._supa();
    if (!supa) return;
    try {
      await supa.from("transfps_storage").upsert({
        user_id: uid,
        collection,
        payload: data,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,collection" });
    } catch (e) { console.warn("[LocalDB] supa set falhou", collection, e?.message); }
  }

  static async del(collection) {
    const key = LS_PREFIX + collection;
    try { localStorage.removeItem(key); } catch (_) {}
    const uid = LocalDB._userId();
    if (!uid) return;
    const supa = await LocalDB._supa();
    if (!supa) return;
    try {
      await supa.from("transfps_storage").delete().eq("user_id", uid).eq("collection", collection);
    } catch (e) { console.warn("[LocalDB] supa del falhou", collection, e?.message); }
  }

  // ── Aliases retrocompat: codigo legacy chama LocalDB.save()/.load() ──
  // (BuildMode, AssetGroups, ItemCatalog, etc) — preserva API original.
  static async save(collection, data) { return LocalDB.set(collection, data); }
  static async load(collection, defaultData = {}) { return LocalDB.get(collection, defaultData); }
  static async remove(collection) { return LocalDB.del(collection); }
}
