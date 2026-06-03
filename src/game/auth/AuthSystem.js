// ─────────────────────────────────────────────────────────────────
//  AuthSystem — gerencia sessão Supabase + Google OAuth + profile
//
//  Fluxo:
//    1. signInWithGoogle() → redirect pro consent screen
//    2. Google redireciona de volta pra esta página com ?code=...
//    3. detectSessionInUrl:true do supabase-js troca code por session
//    4. onAuthStateChange dispara → carrega profile do schema transfps
//
//  Profile auto-criado por trigger no Supabase (transfps.handle_new_user).
// ─────────────────────────────────────────────────────────────────

import { getSupabase } from './SupabaseClient.js';
import { DEBUG } from '../../utils/debug.js';

export class AuthSystem {
  constructor() {
    this.user = null;
    this.profile = null;
    this._listeners = new Set();
    this._supabase = null;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      this._supabase = await getSupabase();

      // Detecta sessão atual
      const { data: { session } } = await this._supabase.auth.getSession();
      if (session?.user) {
        this.user = session.user;
        await this._loadProfile();
      }

      // Escuta mudanças
      this._supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          this.user = session.user;
          await this._loadProfile();
        } else {
          this.user = null;
          this.profile = null;
        }
        this._notify(event);
      });
    })();
    return this._initPromise;
  }

  async _loadProfile() {
    if (!this.user) return;
    const { data, error } = await this._supabase
      .from('transfps_profiles')
      .select('id, nickname, avatar_url, total_kills, total_deaths, xp, level, coins, last_match_at, created_at')
      .eq('id', this.user.id)
      .maybeSingle();
    if (error) {
      console.warn('[Auth] erro ao carregar profile:', error.message);
      return;
    }
    if (data) {
      this.profile = data;
      // Expõe pro HUD/jogo
      if (typeof window !== 'undefined' && window._gamePlayer) {
        const p = window._gamePlayer;
        p._profileXp = data.xp || 0;
        p._profileLevel = data.level || 1;
        p._profileKills = data.total_kills || 0;
        p._profileDeaths = data.total_deaths || 0;
        p._profileCoins = data.coins || 0;
        // Hidrata PlayerStats local se existir
        if (p.stats?.fromProfile) p.stats.fromProfile(data);
      }
      DEBUG.log(`[Auth] profile carregado: lv${data.level} ${data.xp}xp k${data.total_kills}/d${data.total_deaths} ${data.coins}🪙`);
    } else {
      setTimeout(() => this._loadProfile(), 1500);
    }
  }

  /** Retorna stats persistidos pro HUD mostrar. */
  getProfileStats() {
    return {
      xp: this.profile?.xp || 0,
      level: this.profile?.level || 1,
      kills: this.profile?.total_kills || 0,
      deaths: this.profile?.total_deaths || 0,
      coins: this.profile?.coins || 0,
    };
  }

  /** Inicia OAuth Google em POPUP (janela nova) — não perde o jogo.
   *  Quando o callback chega, ele troca code por session (PKCE), manda os
   *  tokens pro opener via BroadcastChannel (COOP-safe) e fecha sozinho.
   *  Aqui no opener, escuto o channel e injeto a sessão via setSession.
   *
   *  IMPORTANTE: NAO usa window.opener.postMessage (bloqueado por COOP do
   *  Google) nem setInterval(popup.closed) (gera warning COOP em browsers
   *  recentes). Comunicacao via BroadcastChannel('transfps-auth') +
   *  timeout absoluto de 120s.
   */
  async signInWithGoogle() {
    if (!this._supabase) await this.init();

    // Redirect na MESMA URL atual — o popup vai detectar ?code= (PKCE) e
    // trocar por session via exchangeCodeForSession. Fica na allowlist do
    // Supabase porque eh o mesmo domain do jogo.
    const redirectTo = window.location.origin + window.location.pathname + '?auth=callback';

    // Pega a URL OAuth do Google (skipBrowserRedirect=true → não faz redirect aqui)
    const { data, error } = await this._supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      console.error('[Auth] OAuth erro:', error.message);
      throw error;
    }
    if (!data?.url) throw new Error('OAuth URL ausente');

    // Abre popup centrado
    const w = 520, h = 640;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    const popup = window.open(
      data.url, 'transfps_google_login',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
    if (!popup) {
      // Popup blocked: fallback pro redirect normal
      console.warn('[Auth] popup bloqueado, usando redirect');
      window.location.href = data.url;
      return;
    }

    // Listener via BroadcastChannel (COOP-safe). NAO usa postMessage nem
    // popup.closed polling (ambos disparam warning/bloqueio por COOP do
    // accounts.google.com). Timeout absoluto de 120s.
    return new Promise((resolve, reject) => {
      const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('transfps-auth') : null;
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        settled = true;
        if (bc) { try { bc.close(); } catch (_) {} }
        if (timeoutId) clearTimeout(timeoutId);
      };

      const handlePayload = async (payload) => {
        if (settled) return;
        if (!payload || (payload.type !== 'transfps-auth-ok' && payload.type !== 'transfps-auth-err')) return;
        if (payload.type === 'transfps-auth-err') {
          cleanup();
          return reject(new Error(payload.error || 'oauth erro'));
        }
        const { access_token, refresh_token } = payload;
        if (!access_token) { cleanup(); return reject(new Error('sem token')); }
        try {
          await this._supabase.auth.setSession({ access_token, refresh_token });
          cleanup();
          resolve();
        } catch (e) { cleanup(); reject(e); }
      };

      if (bc) {
        bc.onmessage = (ev) => handlePayload(ev.data);
      } else {
        cleanup();
        return reject(new Error('BroadcastChannel indisponivel'));
      }

      // Timeout absoluto (sem polling de popup.closed → evita COOP warning)
      timeoutId = setTimeout(() => {
        if (!settled) { cleanup(); reject(new Error('timeout login')); }
      }, 120000);
    });
  }

  /** Callback handler — roda no popup quando volta do Google. Detecta
   *  ?code= (PKCE, default do supabase-js v2) ou #access_token= (implicit),
   *  faz exchange se precisar, e sinaliza opener via BroadcastChannel
   *  ('transfps-auth'). postMessage NAO funciona com COOP do Google. */
  static async handleOAuthCallback() {
    try {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const qs = new URLSearchParams(search);
      const hp = new URLSearchParams(hash.replace(/^#/, '').replace(/^auth-callback&?/, ''));

      const code = qs.get('code');                       // PKCE flow
      const hashAccess = hp.get('access_token');          // implicit flow
      const errParam = qs.get('error') || hp.get('error');

      if (!code && !hashAccess && !errParam) return false;

      const signal = (payload) => {
        if (!('BroadcastChannel' in window)) return;
        try {
          const bc = new BroadcastChannel('transfps-auth');
          bc.postMessage(payload);
          setTimeout(() => { try { bc.close(); } catch (_) {} }, 200);
        } catch (_) {}
      };

      if (errParam) {
        signal({ type: 'transfps-auth-err', error: errParam });
        setTimeout(() => window.close(), 150);
        return true;
      }

      // PKCE: troca code por session AQUI no popup. O code_verifier foi
      // gravado no localStorage do origin pelo supabase-js quando
      // signInWithOAuth rodou no opener — como popup e opener compartilham
      // origin, o verifier esta acessivel via mesma instancia/storage.
      if (code) {
        const { getSupabase } = await import('./SupabaseClient.js');
        const supabase = await getSupabase();
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error || !data?.session) {
          signal({ type: 'transfps-auth-err', error: error?.message || 'exchange falhou' });
        } else {
          signal({
            type: 'transfps-auth-ok',
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
        setTimeout(() => window.close(), 150);
        return true;
      }

      // Implicit (fallback p/ providers que retornam hash com tokens)
      if (hashAccess) {
        signal({
          type: 'transfps-auth-ok',
          access_token: hashAccess,
          refresh_token: hp.get('refresh_token'),
        });
        setTimeout(() => window.close(), 150);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Auth] callback handler erro:', e);
      return false;
    }
  }

  async signInAnonymously(nickname = 'Player') {
    // Modo guest local — sem Supabase. Útil pra single player offline.
    this.user = { id: 'guest', email: null, isGuest: true };
    this.profile = { id: 'guest', nickname, isGuest: true };
    this._notify('GUEST');
  }

  async signOut() {
    if (!this._supabase) return;
    await this._supabase.auth.signOut();
    this.user = null;
    this.profile = null;
    this._notify('SIGNED_OUT');
  }

  async updateNickname(nickname) {
    if (!this._supabase || !this.user || this.user.isGuest) {
      if (this.profile) this.profile.nickname = nickname;
      return;
    }
    const { error } = await this._supabase.rpc('transfps_set_nickname', {
      p_nickname: nickname,
    });
    if (error) { console.warn('[Auth] update nickname:', error.message); return; }
    await this._loadProfile();
  }

  isAuthenticated() { return !!this.user; }
  isGuest() { return this.user?.isGuest === true; }
  getNickname() { return this.profile?.nickname || 'Player'; }
  getUserId() { return this.user?.id || null; }
  getSupabase() { return this._supabase; }

  onAuthChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _notify(event) { for (const cb of this._listeners) try { cb(event, this); } catch (_) {} }
}
