// ─────────────────────────────────────────────────────────────────
//  SoundManager — gerencia sons do jogo
//
//  Sons são carregados de:
//    1. IndexedDB (uploads via admin.html — permanentes)
//    2. Disco em sounds/<caminho> (arquivos estáticos)
//
//  Se nenhum dos dois existir, o som é simplesmente ignorado
//  (nunca lança erro — o jogo continua silencioso até ter áudio).
//
//  Uso:
//    player.sounds = new SoundManager(scene);
//    player.sounds.playNow('player_jump');
// ─────────────────────────────────────────────────────────────────

const DB_NAME  = 'transfps-sounds';
const DB_VER   = 1;
const DB_STORE = 'sounds';

// ── Audio Engine v2 (Babylon 9) — singleton compartilhado ──────────
//  A API legacy (new BABYLON.Sound) NÃO carrega áudio no Babylon 9.10
//  (motor de áudio não é mais criado automaticamente). A v2
//  (CreateAudioEngineAsync + CreateSoundAsync) é a suportada.
//  resumeOnInteraction=true → destrava sozinho no 1º clique/tecla.
let _audioEnginePromise = null;
function getAudioEngine() {
  if (!_audioEnginePromise) {
    _audioEnginePromise = BABYLON.CreateAudioEngineAsync()
      .then(eng => {
        // tenta destravar (resolve quando houver interação do usuário)
        eng.unlockAsync?.().catch(() => {});
        return eng;
      })
      .catch(e => { console.warn('[SoundManager] AudioEngine v2 falhou:', e?.message); return null; });
  }
  return _audioEnginePromise;
}

export class SoundManager {
  constructor(scene) {
    this.scene  = scene;
    this._cache = {};   // id → BABYLON.Sound
    this._db    = null;

    // Caminhos padrão por ID (fallback de disco)
    this._paths = {
      // Jogador
      player_jump     : 'sounds/player/jump.ogg',
      player_land     : 'sounds/player/land.ogg',
      player_walljump : 'sounds/player/walljump.ogg',
      player_damage   : 'sounds/player/damage.ogg',
      // hurt — som ao RECEBER dano (reusa impacto "soco quando acerta"; sem .ogg dedicado em disco)
      hurt            : 'assets/Sound FX/socos/soco quando acerta.wav',
      player_death    : 'sounds/player/death.ogg',
      // Arma
      weapon_fire     : 'sounds/weapons/fire.ogg',
      weapon_reload   : 'sounds/weapons/reload.ogg',
      weapon_empty    : 'sounds/weapons/empty.ogg',
      gun_pistol      : 'assets/Sound FX/correndo e atirando/Pistola.mp3',
      gun_cannon      : 'assets/Sound FX/correndo e atirando/Canhão Bucaneira.mp3',
      mg_loop         : 'assets/Sound FX/correndo e atirando/Machinegun loop.mp3',
      gun_reload      : 'assets/Sound FX/correndo e atirando/Recarregando arma.mp3',
      // Passos em LOOP (por superfície) — concreto e terra/areia
      run_concrete    : 'assets/Sound FX/correndo e atirando/Correndo concreto.mp3',
      run_sand        : 'assets/Sound FX/correndo e atirando/correndo chão de areia.mp3',
      // Dash → usa o som de wall jump (impulso rápido)
      dash            : 'assets/Sound FX/voos e rushs/walljumps.wav',
      // Planta Monstro
      plant_hop       : 'sounds/enemies/monsterPlant/hop.ogg',
      plant_damage    : 'sounds/enemies/monsterPlant/damage.ogg',
      plant_death     : 'sounds/enemies/monsterPlant/death.ogg',
      plant_attack    : 'sounds/enemies/monsterPlant/attack.ogg',

      // ── Combate corpo a corpo (Sound FX) ──────────────────────────
      punch_light     : 'assets/Sound FX/socos/soco.wav',
      punch_med       : 'assets/Sound FX/socos/soco medio.wav',
      punch_strong    : 'assets/Sound FX/socos/soco fortisimo.wav',
      punch_hit       : 'assets/Sound FX/socos/soco quando acerta.wav',
      punch_crit      : 'assets/Sound FX/socos/soco critico.wav',
      punch_supercrit : 'assets/Sound FX/socos/soco Super critico que manda longe.wav',
      kick_light      : 'assets/Sound FX/chutes/chute.wav',
      kick_med        : 'assets/Sound FX/chutes/chute medio.wav',
      kick_strong     : 'assets/Sound FX/chutes/chute forte.wav',
      kick_crit       : 'assets/Sound FX/chutes/Golpe Critico forte.wav',
      kick_spin       : 'assets/Sound FX/chutes/spin.wav',
      wall_hit        : 'assets/Sound FX/explosoes/wallhit.wav',
      ground_hit      : 'assets/Sound FX/voos e rushs/groundhit.wav',
      // Swing / whoosh (golpe cortando o ar — quando NÃO acerta)
      swing_1         : 'assets/Sound FX/ataque/ataque 1.wav',
      swing_2         : 'assets/Sound FX/ataque/ataque 2.wav',
      swing_3         : 'assets/Sound FX/ataque/ataque 3.wav',
      // Movimento
      jump            : 'assets/Sound FX/voos e rushs/jump.wav',
      walljump        : 'assets/Sound FX/voos e rushs/walljumps.wav',
      deathfall       : 'assets/Sound FX/voos e rushs/Caindo morto forte.wav',
      // wind — som de vento/voo em LOOP durante a queda do céu (skydive, estilo Fortnite).
      //  Vento contínuo real (6.6s mono, OpenGameArt CC0 — domínio público, sem atribuição),
      //  loopável sem emenda; substitui o antigo "air recover" (whoosh seco/curto).
      wind            : 'assets/Sound FX/voos e rushs/wind_fall.ogg',
      // land — baque ao tocar o chão (impacto do groundhit; sobrevive à queda).
      land            : 'assets/Sound FX/voos e rushs/groundhit.wav',
      // Inimigo voando longe após golpe forte (ESPACIAL — abaixa com a distância)
      flyby           : 'assets/Sound FX/voos e rushs/Barulho do cara voando longe quando recebe um golpe forte.wav',
      bullet_whiz     : "assets/Sound FX/voos e rushs/Barulho do cara voando longe quando recebe um golpe forte.wav",
      // Coleta de drop (moeda/material)
      pickup_item     : 'assets/Sound FX/senzu/mordendo uma fruta.wav',
      // CHIBATADA — som de impacto da arma Chibata (whip)
      chibatada       : 'assets/Sound FX/CHIBATADA.mp3',
      // ── Tela de seleção de personagem ──
      //  spray_bnookker fala o nome do personagem (.m4a). ui_select = whoosh
      //  genérico (reusa swing) tocado ao escolher os demais personagens.
      spray_bnookker  : 'assets/Sound FX/spraybnookker.m4a',
      ui_select       : 'assets/Sound FX/ataque/ataque 2.wav',
      // Dash (sintetizado em runtime se faltar — fallback no WaterSystem é diferente)
      dash            : 'assets/Sound FX/voos e rushs/jump.wav',
    };

    this._openDB();

    // Inicia a engine de áudio e pré-carrega os sons de combate (sem delay
    // no 1º soco/chute). Os de movimento carregam sob demanda.
    getAudioEngine().then((eng) => {
      // Listener (ouvinte) segue a câmera → áudio espacial fica relativo ao
      // ponto de vista do jogador (falloff por distância funciona certo).
      try {
        const cam = this.scene?.activeCamera;
        if (eng && cam && eng.listener?.attach) eng.listener.attach(cam);
      } catch (_) {}
      this.preload([
        'punch_hit', 'punch_crit', 'punch_supercrit',
        'kick_med', 'kick_crit',
        'swing_1', 'swing_2', 'swing_3',
        'gun_pistol',
        'chibatada', // som de impacto da Chibata — precarrega pra nao engolir o 1o golpe
      ]);
      this._getSpatialSound('flyby', 45);   // pré-carrega o som de voar
      this._getSpatialSound("bullet_whiz", 60);
      this._getLoopSound('mg_loop');        // pré-carrega o loop da metralhadora
    });
  }

  /** Pré-carrega uma lista de IDs (cria os StaticSounds no cache). */
  async preload(ids) {
    for (const id of ids) { try { await this._getSound(id); } catch (_) {} }
  }

  // ── Toca um som por ID ──────────────────────────────────────────
  //  Não-bloqueante: dispara o play assim que o som estiver carregado.
  //  StaticSound v2 é polifônico: cada play() toca uma instância nova, então
  //  socos rápidos sobrepõem sem se cortar.
  async playNow(id, volume = 1.0) {
    try {
      const snd = await this._getSound(id);
      if (!snd) return;
      try { snd.volume = volume; } catch (_) {}
      snd.play();
    } catch (e) { /* silencioso — jogo segue sem o som */ }
  }

  // ── Som em LOOP (metralhadora segurada, motor, etc) ──────────────
  //  Liga uma vez e fica tocando até stopLoop(). Idempotente: chamar
  //  startLoop várias vezes não empilha.
  async startLoop(id, volume = 0.9) {
    try {
      const snd = await this._getLoopSound(id);
      if (!snd) return;
      if (snd._loopOn) return;          // já tocando
      snd._loopOn = true;
      try { snd.volume = volume; } catch (_) {}
      snd.play();
    } catch (_) {}
  }

  stopLoop(id) {
    const snd = this._loops?.[id];
    if (snd && snd._loopOn) {
      snd._loopOn = false;
      try { snd.stop(); } catch (_) {}
    }
  }

  /** Ajusta a velocidade (pitch/rate) de um loop ativo — ex: passos mais
   *  rápidos no sprint. v2 expõe playbackRate nas instâncias do StaticSound. */
  setLoopRate(id, rate = 1.0) {
    const snd = this._loops?.[id];
    if (!snd || !snd._loopOn) return;
    try {
      if (snd.playbackRate !== undefined) snd.playbackRate = rate;
      else if (snd._instances) snd._instances.forEach(i => { try { i.playbackRate = rate; } catch (_) {} });
    } catch (_) {}
  }

  /** Toca um som UMA vez com velocidade ajustada (ex: reload casando com a anim). */
  async playRate(id, volume = 1.0, rate = 1.0) {
    try {
      const snd = await this._getSound(id);
      if (!snd) return;
      try { snd.volume = volume; if (snd.playbackRate !== undefined) snd.playbackRate = rate; } catch (_) {}
      snd.play();
    } catch (_) {}
  }

  /** Toca o som e ajusta a velocidade pra durar EXATAMENTE `targetDur` segundos.
   *  Ex: reload de 1.5s — se o áudio tem 2s, toca a 1.33x; se tem 1s, a 0.67x. */
  async playReloadTimed(id, targetDur = 1.5, volume = 0.8) {
    try {
      const snd = await this._getSound(id);
      if (!snd) return;
      const dur = snd.buffer?.duration || snd._buffer?.duration || snd.duration || 0;
      const rate = (dur > 0.05 && targetDur > 0.05)
        ? Math.max(0.5, Math.min(2.5, dur / targetDur))   // clamp p/ não ficar grotesco
        : 1.0;
      try { snd.volume = volume; if (snd.playbackRate !== undefined) snd.playbackRate = rate; } catch (_) {}
      snd.play();
    } catch (_) {}
  }

  async _getLoopSound(id) {
    this._loops = this._loops || {};
    if (this._loops[id]) return this._loops[id];
    this._loadingLoop = this._loadingLoop || {};
    if (this._loadingLoop[id]) return this._loadingLoop[id];

    this._loadingLoop[id] = (async () => {
      const eng = await getAudioEngine();
      if (!eng) return null;
      let src = null;
      const blob = await this._dbGet(id);
      if (blob) src = URL.createObjectURL(blob);
      else {
        const path = this._paths[id];
        if (!path) return null;
        src = /^(blob:|data:)/.test(path) ? path : encodeURI(path);
      }
      try {
        const snd = await BABYLON.CreateSoundAsync(`loop_${id}`, src, { autoplay: false, loop: true });
        this._loops[id] = snd;
        return snd;
      } catch (e) {
        return null;
      } finally {
        if (this._loadingLoop) delete this._loadingLoop[id];
      }
    })();

    return this._loadingLoop[id];
  }

  // ── Pega (ou cria e cacheia) o StaticSound v2 de um ID ───────────
  async _getSound(id) {
    if (this._cache[id]) return this._cache[id];
    if (this._loadingSnd?.[id]) return this._loadingSnd[id];
    this._loadingSnd = this._loadingSnd || {};

    this._loadingSnd[id] = (async () => {
      const eng = await getAudioEngine();
      if (!eng) return null;

      // Fonte: upload do admin (IndexedDB) tem prioridade; senão arquivo em disco.
      let src = null;
      const blob = await this._dbGet(id);
      if (blob) src = URL.createObjectURL(blob);
      else {
        const path = this._paths[id];
        if (!path) return null;
        // Paths com espaços/acentos precisam de URL-encode ou o fetch falha.
        src = /^(blob:|data:)/.test(path) ? path : encodeURI(path);
      }

      try {
        const snd = await BABYLON.CreateSoundAsync(`snd_${id}`, src, { autoplay: false, loop: false });
        this._cache[id] = snd;
        return snd;
      } catch (e) {
        return null;   // arquivo faltando / formato inválido → silencioso
      } finally {
        if (this._loadingSnd) delete this._loadingSnd[id];
      }
    })();

    return this._loadingSnd[id];
  }

  // ── Som ESPACIAL 3D que segue um nó (ex: inimigo voando) ─────────
  //  Atrela o som ao nó (segue ele) e o engine atenua pela distância até
  //  a câmera (listener) → quanto mais longe, mais baixo. Sensação de voar.
  async playSpatial(id, node, volume = 1.0, maxDistance = 45) {
    try {
      if (!node) return;
      const snd = await this._getSpatialSound(id, maxDistance);
      if (!snd) return;
      try { snd.spatial.attach(node); } catch (_) {}
      try { snd.volume = volume; } catch (_) {}
      snd.play();
    } catch (e) { /* silencioso */ }
  }

  async _getSpatialSound(id, maxDistance = 45) {
    this._spatial = this._spatial || {};
    if (this._spatial[id]) return this._spatial[id];
    this._loadingSp = this._loadingSp || {};
    if (this._loadingSp[id]) return this._loadingSp[id];

    this._loadingSp[id] = (async () => {
      const eng = await getAudioEngine();
      if (!eng) return null;
      let src = null;
      const blob = await this._dbGet(id);
      if (blob) src = URL.createObjectURL(blob);
      else {
        const path = this._paths[id];
        if (!path) return null;
        src = /^(blob:|data:)/.test(path) ? path : encodeURI(path);
      }
      try {
        const snd = await BABYLON.CreateSoundAsync(`sp_${id}`, src, {
          spatialEnabled: true,
          spatialMaxDistance: maxDistance,
          spatialDistanceModel: 'linear',
          spatialRolloffFactor: 1,
          autoplay: false, loop: false,
        });
        this._spatial[id] = snd;
        return snd;
      } catch (e) {
        return null;
      } finally {
        if (this._loadingSp) delete this._loadingSp[id];
      }
    })();

    return this._loadingSp[id];
  }

  // ── API usada pelo admin.html ───────────────────────────────────

  /** Salva um ArrayBuffer no IndexedDB para o ID de som especificado */
  async dbSave(id, buffer) {
    const blob = new Blob([buffer]);
    await this._dbPut(id, blob);
    // Invalida cache para forçar recarga na próxima vez
    if (this._cache[id]) {
      try { this._cache[id].dispose(); } catch (e) {}
      delete this._cache[id];
    }
  }

  /** Remove um som do IndexedDB e do cache */
  async dbDelete(id) {
    await this._dbRemove(id);
    if (this._cache[id]) {
      try { this._cache[id].dispose(); } catch (e) {}
      delete this._cache[id];
    }
  }

  // ── IndexedDB (interno) ─────────────────────────────────────────
  _openDB() {
    try {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = e => {
        this._db = e.target.result;
      };
      req.onerror = () => {
        console.warn('SoundManager: IndexedDB não disponível');
      };
    } catch (e) {
      console.warn('SoundManager: IndexedDB erro', e);
    }
  }

  _dbGet(id) {
    return new Promise(res => {
      if (!this._db) return res(null);
      try {
        const tx  = this._db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror   = () => res(null);
      } catch (e) { res(null); }
    });
  }

  _dbPut(id, blob) {
    return new Promise(res => {
      if (!this._db) return res(false);
      try {
        const tx  = this._db.transaction(DB_STORE, 'readwrite');
        const req = tx.objectStore(DB_STORE).put(blob, id);
        req.onsuccess = () => res(true);
        req.onerror   = () => res(false);
      } catch (e) { res(false); }
    });
  }

  _dbRemove(id) {
    return new Promise(res => {
      if (!this._db) return res(false);
      try {
        const tx  = this._db.transaction(DB_STORE, 'readwrite');
        const req = tx.objectStore(DB_STORE).delete(id);
        req.onsuccess = () => res(true);
        req.onerror   = () => res(false);
      } catch (e) { res(false); }
    });
  }
}
