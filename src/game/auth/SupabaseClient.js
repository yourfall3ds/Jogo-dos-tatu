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

function _isProd() {
  const h = (typeof location !== 'undefined') ? location.hostname : '';
  return h !== 'localhost' && h !== '127.0.0.1' && h !== '';
}

const HARDCODED_CONFIG = {
  SUPABASE_URL: 'https://myylkpoisqijfnptlnyk.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eWxrcG9pc3FpamZucHRsbnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MzQxNTIsImV4cCI6MjA3MjAxMDE1Mn0.me7aXILmeIHvjbkYWUVczOZt7gxrz8Rddv515Xa9ZTU',
  TRANSFPS_MP_WS_URL: 'wss://app.overpixel.online/transfps-mp',
};

async function _loadConfig() {
  if (_config) return _config;
  // Em prod: usa hardcoded direto (config-server local nao existe).
  // Em dev: tenta buscar do config-server local (porta 3099).
  if (_isProd()) {
    _config = HARDCODED_CONFIG;
    return _config;
  }
  try {
    const r = await fetch('http://127.0.0.1:3099/transfps-env', { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const j = await r.json();
      if (j.SUPABASE_URL && j.SUPABASE_ANON_KEY) {
        _config = j;
        return _config;
      }
    }
  } catch (e) {
    console.warn('[SupabaseClient] config-server local indisponivel, usando hardcoded:', e.message);
  }
  _config = HARDCODED_CONFIG;
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
        detectSessionInUrl: false, // popup faz manualmente via BroadcastChannel
        flowType: 'implicit', // PKCE quebrava entre opener<->popup. Implicit retorna
                              // access_token direto no hash, sem code_verifier roundtrip.
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
