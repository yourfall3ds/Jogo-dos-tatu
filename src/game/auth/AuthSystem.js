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
      console.log(`[Auth] profile carregado: lv${data.level} ${data.xp}xp k${data.total_kills}/d${data.total_deaths} ${data.coins}🪙`);
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
   *  Quando o callback chega, ele lê a sessão do hash, manda pro opener
   *  via postMessage e fecha sozinho. Aqui no opener, escuto a mensagem e
   *  injeto a sessão no Supabase via setSession.
   */
  async signInWithGoogle() {
    if (!this._supabase) await this.init();

    // Redirect na MESMA URL atual — quando voltar, vamos detectar o hash
    // de sessão e fechar a janela. Fica na allowlist do Supabase porque é
    // o mesmo domain do jogo.
    const redirectTo = window.location.origin + window.location.pathname + '#auth-callback';

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

    // Listener pra mensagem do popup com tokens
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (timer) clearInterval(timer);
      };
      const onMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'transfps-auth-callback') return;
        const { access_token, refresh_token } = event.data;
        if (!access_token) return reject(new Error('sem token'));
        try {
          await this._supabase.auth.setSession({ access_token, refresh_token });
          cleanup();
          resolve();
        } catch (e) { cleanup(); reject(e); }
      };
      window.addEventListener('message', onMessage);
      // Watchdog: se popup fechar sem mandar mensagem, rejeita após 60s
      let secs = 0;
      const timer = setInterval(() => {
        secs += 1;
        if (popup.closed) {
          cleanup();
          reject(new Error('popup fechou sem completar login'));
        }
        if (secs > 120) { cleanup(); reject(new Error('timeout login')); }
      }, 1000);
    });
  }

  /** Callback handler — roda no popup quando volta do Google. Detecta hash
   *  com tokens, manda pra janela pai via postMessage e fecha. */
  static handleOAuthCallback() {
    try {
      const hash = window.location.hash || '';
      if (!hash.includes('access_token=')) return false;
      const params = new URLSearchParams(hash.replace(/^#/, '').replace(/^auth-callback&/, ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token) return false;
      // Manda pra janela pai
      if (window.opener) {
        try {
          window.opener.postMessage(
            { type: 'transfps-auth-callback', access_token, refresh_token },
            window.location.origin
          );
        } catch (_) {}
        // Fecha o popup
        setTimeout(() => window.close(), 100);
        return true;
      }
      // Sem opener (foi redirect direto): deixa Supabase processar normal
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
