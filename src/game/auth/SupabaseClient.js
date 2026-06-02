// ─────────────────────────────────────────────────────────────────
//  SupabaseClient — cliente único do Supabase pro TransFPS
//
//  Schema 'transfps' (isolado do Chibata). Lê config do .env via
//  config-server (porta 3099, mesma rota usada pelo MESHY).
//
//  Carrega @supabase/supabase-js via CDN ESM (sem bundler).
// ─────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

let _client = null;
let _initPromise = null;
let _config = null;

async function _loadConfig() {
  if (_config) return _config;
  // Tenta buscar do config-server local (porta 3099)
  try {
    const r = await fetch('http://127.0.0.1:3099/transfps-env', { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const j = await r.json();
      if (j.SUPABASE_URL && j.SUPABASE_ANON_KEY) {
        _config = j;
        return _config;
      }
    }
  } catch (_) { /* fallback abaixo */ }
  // Fallback: usa URL/KEY hardcoded (mesmas do .env, schema transfps)
  _config = {
    SUPABASE_URL: 'https://myylkpoisqijfnptlnyk.supabase.co',
    SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU',
    TRANSFPS_MP_WS_URL: 'wss://app.overpixel.online/transfps-mp',
  };
  return _config;
}

export async function getSupabase() {
  if (_client) return _client;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cfg = await _loadConfig();
    _client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: window.localStorage,
        storageKey: 'transfps-auth',
      },
    });
    return _client;
  })();
  return _initPromise;
}

export async function getConfig() {
  return _loadConfig();
}
