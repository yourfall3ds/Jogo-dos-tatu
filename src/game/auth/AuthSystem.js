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
    let { data, error } = await this._supabase
      .from('transfps_profiles')
      .select('id, nickname, avatar_url, total_kills, total_deaths, xp, level, coins, last_match_at, created_at')
      .eq('id', this.user.id)
      .maybeSingle();
    if (error) {
      console.error('[Auth] profile load FALHOU:', error);
      throw error;
    }
    // Se profile nao existir (user antigo, signup pre-trigger), chama RPC
    // idempotente transfps_ensure_profile() que cria com defaults e retorna.
    // NAO eh fallback - eh funcao designada de "garantir profile existe".
    if (!data) {
      console.warn('[Auth] profile nao existe, chamando transfps_ensure_profile');
      const { data: ensured, error: ensureErr } = await this._supabase
        .rpc('transfps_ensure_profile');
      if (ensureErr) {
        console.error('[Auth] transfps_ensure_profile FALHOU:', ensureErr);
        throw ensureErr;
      }
      if (!ensured) {
        throw new Error('[Auth] transfps_ensure_profile retornou null');
      }
      data = ensured;
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
    //
    // FIX RACE/DEADLOCK: opener + popup compartilham origin/localStorage.
    // Popup com detectSessionInUrl=true do supabase-js consome o ?code= e
    // dispara storage sync no opener -> onAuthStateChange('SIGNED_IN')
    // ANTES da gente chamar exchangeCodeForSession. Se chamarmos exchange
    // depois, o code ja foi consumido OU o NavigatorLock trava disputando
    // com o popup (Promise nunca resolve/rejeita). Estrategia:
    //   1) Registra onAuthStateChange LOCAL: se SIGNED_IN chega, resolve.
    //   2) getSession() agora: se ja existe session, resolve direto.
    //   3) BroadcastChannel: se chegar code, tenta exchange MAS guarda
    //      pra race (se settled, sai). No catch, confere getSession().
    //   4) Timeout 120s tambem confere getSession() antes de rejeitar.
    console.log('[Auth] signInWithGoogle: popup aberto, aguardando handshake…');
    return new Promise((resolve, reject) => {
      const bc = new BroadcastChannel('transfps-auth');
      let settled = false;
      let timeoutId = null;
      let unsubAuth = null;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        try { bc.close(); }
        catch (e) { console.error('[Auth] bc.close:', e); }
        try { unsubAuth?.data?.subscription?.unsubscribe(); } catch (_) {}
        try { unsubAuth?.subscription?.unsubscribe(); } catch (_) {}
        if (timeoutId) clearTimeout(timeoutId);
        // Limpa polling se ativo (set no fallback)
        try {
          if (window.__transfpsAuthPollId) {
            clearInterval(window.__transfpsAuthPollId);
            window.__transfpsAuthPollId = null;
          }
        } catch (_) {}
      };

      // (1) Fonte primaria: onAuthStateChange dispara em TODO setSession
      // bem-sucedido. Aceita QUALQUER event que traga session valida
      // (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION).
      // Storage sync entre janelas pode disparar como INITIAL_SESSION.
      try {
        unsubAuth = this._supabase.auth.onAuthStateChange((event, session) => {
          if (settled) return;
          console.log('[Auth] signInWithGoogle: onAuthStateChange:', event, !!session?.user);
          // Aceita QUALQUER evento que traga session com user
          if (session?.user) {
            console.log('[Auth] signInWithGoogle: Promise RESOLVIDA via onAuthStateChange (' + event + ')');
            cleanup();
            resolve();
          }
        });
      } catch (e) { console.error('[Auth] onAuthStateChange subscribe:', e); }

      // (2) Session pode ja estar la (race muito rapida ou retry de click)
      this._supabase.auth.getSession().then(({ data: { session } }) => {
        if (settled) return;
        if (session?.user) {
          console.log('[Auth] signInWithGoogle: Promise RESOLVIDA via getSession (sessao ja existia)');
          cleanup();
          resolve();
        }
      }).catch((e) => { console.error('[Auth] getSession check:', e); });

      // (3) FALLBACK FORTE: polling de getSession a cada 500ms ate 15s.
      // Cobre o caso do storage event nao disparar onAuthStateChange por
      // bug do supabase-js ou COOP. Se popup ja gravou session no
      // localStorage compartilhado, getSession() le e a gente resolve.
      let pollTries = 0;
      const pollId = setInterval(async () => {
        pollTries++;
        if (settled) { clearInterval(pollId); return; }
        if (pollTries > 30) { clearInterval(pollId); return; } // 15s max
        try {
          const { data: { session } } = await this._supabase.auth.getSession();
          if (settled) { clearInterval(pollId); return; }
          if (session?.user) {
            console.log('[Auth] signInWithGoogle: Promise RESOLVIDA via polling getSession (try ' + pollTries + ')');
            clearInterval(pollId);
            cleanup();
            resolve();
          }
        } catch (e) { /* segue tentando */ }
      }, 500);
      // Limpa interval no cleanup
      const origCleanup = cleanup;
      // Nao consigo reatribuir const — guardo o pollId no scope pra cleanup achar.
      window.__transfpsAuthPollId = pollId;

      const handlePayload = async (payload) => {
        if (settled) return;
        if (!payload) return;
        console.log('[Auth] signInWithGoogle: BC mensagem recebida:', payload.type);
        if (payload.type === 'transfps-auth-err') {
          cleanup();
          return reject(new Error(payload.error || 'oauth erro'));
        }
        // NOVO: popup manda apenas o ?code= cru (PKCE) ou os tokens (implicit).
        // O EXCHANGE acontece AQUI no opener pra que o code_verifier seja
        // achado no localStorage do supabase-js (gravado pela mesma instancia).
        if (payload.type === 'transfps-auth-code') {
          try {
            console.log('[Auth] signInWithGoogle: tentando exchangeCodeForSession…');
            const { data, error } = await this._supabase.auth.exchangeCodeForSession(payload.callback_url);
            if (settled) return; // onAuthStateChange ganhou a corrida
            if (data?.session) {
              console.log('[Auth] signInWithGoogle: Promise resolvida via exchange OK');
              cleanup();
              return resolve();
            }
            // Exchange retornou sem session — pode ser que o code ja foi
            // consumido pelo popup e a session ja esta gravada. Confere.
            const { data: { session } } = await this._supabase.auth.getSession();
            if (settled) return;
            if (session?.user) {
              console.log('[Auth] signInWithGoogle: exchange falhou mas session existe — resolve()');
              cleanup();
              return resolve();
            }
            cleanup();
            return reject(new Error(error?.message || 'exchange falhou sem session'));
          } catch (e) {
            if (settled) return;
            // Throw do exchange: pode ja ter session via storage sync
            try {
              const { data: { session } } = await this._supabase.auth.getSession();
              if (settled) return;
              if (session?.user) {
                console.log('[Auth] signInWithGoogle: exchange throw mas session existe — resolve()');
                cleanup();
                return resolve();
              }
            } catch (_) {}
            cleanup();
            return reject(e);
          }
        }
        if (payload.type === 'transfps-auth-ok') {
          const { access_token, refresh_token } = payload;
          if (!access_token) { cleanup(); return reject(new Error('sem token')); }
          try {
            console.log('[Auth] signInWithGoogle: setSession iniciando');
            await this._supabase.auth.setSession({ access_token, refresh_token });
            if (settled) return;
            console.log('[Auth] signInWithGoogle: Promise resolvida via setSession');
            cleanup();
            resolve();
          } catch (e) {
            if (settled) return;
            cleanup();
            reject(e);
          }
        }
      };

      bc.onmessage = (ev) => handlePayload(ev.data);

      // Timeout absoluto (sem polling de popup.closed → evita COOP warning).
      // Antes de rejeitar, confere getSession() — se houver session, o
      // onAuthStateChange pode nao ter disparado por algum motivo do storage.
      timeoutId = setTimeout(() => {
        if (settled) return;
        console.warn('[Auth] signInWithGoogle: timeout 120s, conferindo session…');
        this._supabase.auth.getSession().then(({ data: { session } }) => {
          if (settled) return;
          if (session?.user) {
            console.log('[Auth] signInWithGoogle: timeout mas session existe — resolve()');
            cleanup();
            resolve();
          } else {
            cleanup();
            reject(new Error('timeout login'));
          }
        }).catch((e) => {
          if (settled) return;
          cleanup();
          reject(e);
        });
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
        AuthSystem._showPopupConfirmScreen({ ok: false, error: errParam });
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
        AuthSystem._showPopupConfirmScreen({ ok: true });
        return true;
      }

      // Implicit (fallback p/ providers que retornam hash com tokens)
      if (hashAccess) {
        signal({
          type: 'transfps-auth-ok',
          access_token: hashAccess,
          refresh_token: hp.get('refresh_token'),
        });
        AuthSystem._showPopupConfirmScreen({ ok: true });
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Auth] callback handler erro:', e);
      throw e;
    }
  }

  /** Tela de confirmacao dentro do popup OAuth.
   *  Mostra "Login OK" / "Erro" e botao "Fechar esta janela".
   *  Opener ja foi notificado via BroadcastChannel ANTES dessa funcao
   *  rodar — entao o jogo ja esta autenticando em paralelo.
   *  Tambem fecha sozinho em 4s se user ignorar. */
  static _showPopupConfirmScreen({ ok, error }) {
    try {
      // Limpa hash/search da URL pra nao expor token na barra
      try { history.replaceState(null, '', window.location.pathname); } catch (_) {}
      document.title = ok ? 'Login OK - TransFPS' : 'Erro no Login - TransFPS';
      document.body.innerHTML = '';
      document.body.style.cssText = `
        margin:0; min-height:100vh;
        background:radial-gradient(ellipse at 50% 35%, ${ok ? '#0d2e1a' : '#2e0d0d'} 0%, #050810 60%, #02030a 100%);
        display:flex; align-items:center; justify-content:center;
        font-family:'Segoe UI',Arial,sans-serif; color:#dff5ff;
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = `
        background:rgba(10,16,30,0.9); padding:40px 50px;
        border:1px solid ${ok ? 'rgba(46,255,182,0.45)' : 'rgba(255,90,90,0.5)'};
        border-radius:16px; box-shadow:0 0 40px ${ok ? 'rgba(46,255,182,0.25)' : 'rgba(255,90,90,0.3)'};
        text-align:center; max-width:380px;
      `;
      const ICON = ok ? '✓' : '⚠';
      const COLOR = ok ? '#2effb6' : '#ff5a5a';
      wrap.innerHTML = `
        <div style="font-size:64px; color:${COLOR}; text-shadow:0 0 16px ${COLOR}; margin-bottom:10px;">${ICON}</div>
        <div style="font-size:22px; font-weight:800; letter-spacing:2px; color:${COLOR}; margin-bottom:8px;">
          ${ok ? 'LOGIN AUTORIZADO' : 'ERRO NO LOGIN'}
        </div>
        <div style="font-size:13px; opacity:0.75; margin-bottom:24px; line-height:1.4;">
          ${ok
            ? 'O jogo já está autenticando.<br>Pode fechar esta janela.'
            : 'Detalhe: ' + (error || 'desconhecido')}
        </div>
        <button id="pcs-close" style="
          background:${ok ? '#2effb6' : '#ff5a5a'}; color:#04101a; border:0;
          padding:13px 28px; font:900 13px 'Segoe UI',monospace; letter-spacing:2px;
          cursor:pointer; border-radius:6px; box-shadow:0 4px 18px rgba(0,0,0,0.4);
        ">FECHAR ESTA JANELA</button>
        <div style="margin-top:14px; font-size:10px; opacity:0.45;">fecha automaticamente em <span id="pcs-secs">4</span>s</div>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('#pcs-close').onclick = () => { try { window.close(); } catch (_) {} };
      // Auto-close 4s com countdown
      let secs = 4;
      const secsEl = wrap.querySelector('#pcs-secs');
      const t = setInterval(() => {
        secs--;
        if (secsEl) secsEl.textContent = secs;
        if (secs <= 0) { clearInterval(t); try { window.close(); } catch (_) {} }
      }, 1000);
    } catch (e) {
      console.error('[Auth] popup confirm screen falhou:', e);
      try { window.close(); } catch (_) {}
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
  /**
   * Retorna o nickname melhor disponivel SEM throw:
   *   1) profile.nickname (canonico, persistido em transfps.profiles)
   *   2) user.user_metadata.full_name / .name / .preferred_username (Google OAuth)
   *   3) email split (sem dominio)
   *   4) 'Player' como ultimo recurso
   * O throw original quebrava o fluxo qdo profile demorava p carregar (race do trigger
   * transfps.handle_new_user vs primeiro getSession()).
   */
  getNickname() {
    if (this.profile?.nickname) return this.profile.nickname;
    const meta = this.user?.user_metadata || {};
    if (meta.full_name) return String(meta.full_name).trim().slice(0, 24);
    if (meta.name) return String(meta.name).trim().slice(0, 24);
    if (meta.preferred_username) return String(meta.preferred_username).trim().slice(0, 24);
    const email = this.user?.email;
    if (email) return String(email).split('@')[0].slice(0, 24);
    return 'Player';
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
