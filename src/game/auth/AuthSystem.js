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
      console.error('[Auth] profile load FALHOU:', error);
      throw error;
    }
    if (data) {
      this.profile = data;
      // Expõe pro HUD/jogo — sem defaults: se vier null, eh schema quebrado.
      if (typeof window !== 'undefined' && window._gamePlayer) {
        const p = window._gamePlayer;
        p._profileXp = data.xp;
        p._profileLevel = data.level;
        p._profileKills = data.total_kills;
        p._profileDeaths = data.total_deaths;
        p._profileCoins = data.coins;
        // Hidrata PlayerStats local se existir
        if (p.stats?.fromProfile) p.stats.fromProfile(data);
      }
      DEBUG.log(`[Auth] profile carregado: lv${data.level} ${data.xp}xp k${data.total_kills}/d${data.total_deaths} ${data.coins}🪙`);
    } else {
      // Sem fallback: profile null = trigger transfps.handle_new_user falhou.
      // Erro logado imediato (sem retry silencioso que mascara o problema).
      console.error('[Auth] profile null — trigger transfps.handle_new_user nao rodou pro user', this.user.id);
      throw new Error('[Auth] profile nao encontrado — trigger transfps.handle_new_user falhou');
    }
  }

  /** Retorna stats persistidos pro HUD mostrar. */
  getProfileStats() {
    if (!this.profile) throw new Error('[Auth] getProfileStats chamado sem profile carregado');
    return {
      xp: this.profile.xp,
      level: this.profile.level,
      kills: this.profile.total_kills,
      deaths: this.profile.total_deaths,
      coins: this.profile.coins,
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
      throw new Error('[Auth] popup bloqueado — habilite popups pra login no Google');
    }
    if (!('BroadcastChannel' in window)) {
      throw new Error('[Auth] browser sem BroadcastChannel — login Google indisponivel');
    }

    // Listener via BroadcastChannel (COOP-safe). NAO usa postMessage nem
    // popup.closed polling (ambos disparam warning/bloqueio por COOP do
    // accounts.google.com). Timeout absoluto de 120s.
    return new Promise((resolve, reject) => {
      const bc = new BroadcastChannel('transfps-auth');
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        settled = true;
        try { bc.close(); }
        catch (e) { console.error('[Auth] bc.close:', e); }
        if (timeoutId) clearTimeout(timeoutId);
      };

      const handlePayload = async (payload) => {
        if (settled) return;
        if (!payload) return;
        if (payload.type === 'transfps-auth-err') {
          cleanup();
          return reject(new Error(payload.error || 'oauth erro'));
        }
        // NOVO: popup manda apenas o ?code= cru (PKCE) ou os tokens (implicit).
        // O EXCHANGE acontece AQUI no opener pra que o code_verifier seja
        // achado no localStorage do supabase-js (gravado pela mesma instancia).
        if (payload.type === 'transfps-auth-code') {
          try {
            const { data, error } = await this._supabase.auth.exchangeCodeForSession(payload.callback_url);
            if (error || !data?.session) {
              cleanup();
              return reject(new Error(error?.message || 'exchange falhou'));
            }
            cleanup();
            return resolve();
          } catch (e) { cleanup(); return reject(e); }
        }
        if (payload.type === 'transfps-auth-ok') {
          const { access_token, refresh_token } = payload;
          if (!access_token) { cleanup(); return reject(new Error('sem token')); }
          try {
            await this._supabase.auth.setSession({ access_token, refresh_token });
            cleanup();
            resolve();
          } catch (e) { cleanup(); reject(e); }
        }
      };

      bc.onmessage = (ev) => handlePayload(ev.data);

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
      const search = window.location.search;
      const hash = window.location.hash;
      const qs = new URLSearchParams(search);
      const hp = new URLSearchParams(hash.replace(/^#/, '').replace(/^auth-callback&?/, ''));

      const code = qs.get('code');                       // PKCE flow
      const hashAccess = hp.get('access_token');          // implicit flow
      const errParam = qs.get('error') || hp.get('error');

      if (!code && !hashAccess && !errParam) return false;

      const signal = (payload) => {
        if (!('BroadcastChannel' in window)) {
          throw new Error('[Auth] popup sem BroadcastChannel — impossivel sinalizar opener');
        }
        const bc = new BroadcastChannel('transfps-auth');
        bc.postMessage(payload);
        setTimeout(() => {
          try { bc.close(); }
          catch (e) { console.error('[Auth signal] bc.close:', e); }
        }, 200);
      };

      if (errParam) {
        signal({ type: 'transfps-auth-err', error: errParam });
        setTimeout(() => window.close(), 150);
        return true;
      }

      // PKCE: o code_verifier foi gravado no localStorage do opener (origem)
      // pela instancia supabase-js que rodou signInWithOAuth. Embora o
      // popup compartilhe origin com o opener (mesmo localStorage),
      // a chave PKCE eh deletada/migrada de forma instavel entre janelas
      // (especialmente quando o popup carrega o app inteiro).
      // Solucao: NAO fazer exchange aqui. Mandar a URL inteira de callback
      // para o opener via BroadcastChannel, e o opener (que tem certeza do
      // verifier porque foi ele que iniciou) faz o exchange.
      if (code) {
        signal({
          type: 'transfps-auth-code',
          callback_url: window.location.href,
        });
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
      console.error('[Auth] callback handler erro:', e);
      throw e;
    }
  }

  async signOut() {
    if (!this._supabase) return;
    await this._supabase.auth.signOut();
    this.user = null;
    this.profile = null;
    this._notify('SIGNED_OUT');
  }

  async updateNickname(nickname) {
    if (!this._supabase) throw new Error('[Auth] updateNickname sem supabase inicializado');
    if (!this.user) throw new Error('[Auth] updateNickname sem user logado');
    const { error } = await this._supabase.rpc('transfps_set_nickname', {
      p_nickname: nickname,
    });
    if (error) {
      console.error('[Auth] updateNickname RPC:', error);
      throw error;
    }
    await this._loadProfile();
  }

  isAuthenticated() { return !!this.user; }
  isReady() { return !!this.profile; }
  /** Guest mode removido — sempre false. Mantido pra compat com chamadas antigas. */
  isGuest() { return false; }
  getNickname() {
    if (!this.profile?.nickname) throw new Error('[Auth] getNickname sem profile carregado');
    return this.profile.nickname;
  }
  /** Retorna user id ou null se nao logado. Chamadas que precisam de id
   *  garantido devem validar antes (isAuthenticated()). */
  getUserId() { return this.user?.id ?? null; }
  getSupabase() { return this._supabase; }

  onAuthChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _notify(event) {
    for (const cb of this._listeners) {
      try { cb(event, this); }
      catch (e) { console.error('[Auth] listener:', e); }
    }
  }
}
