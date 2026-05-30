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
      player_death    : 'sounds/player/death.ogg',
      // Arma
      weapon_fire     : 'sounds/weapons/fire.ogg',
      weapon_reload   : 'sounds/weapons/reload.ogg',
      weapon_empty    : 'sounds/weapons/empty.ogg',
      // Planta Monstro
      plant_hop       : 'sounds/enemies/monsterPlant/hop.ogg',
      plant_damage    : 'sounds/enemies/monsterPlant/damage.ogg',
      plant_death     : 'sounds/enemies/monsterPlant/death.ogg',
      plant_attack    : 'sounds/enemies/monsterPlant/attack.ogg',
    };

    this._openDB();
  }

  // ── Toca um som por ID ──────────────────────────────────────────
  // Não-bloqueante: retorna imediatamente e toca async
  async playNow(id, volume = 1.0) {
    // Se já há um BABYLON.Sound em cache, toca direto
    const cached = this._cache[id];
    if (cached) {
      try {
        if (cached.isReady()) {
          cached.stop();
          cached.play();
        }
      } catch (e) { /* silencioso */ }
      return;
    }

    // Tenta IndexedDB primeiro (upload do admin)
    const blob = await this._dbGet(id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      this._loadAndPlay(id, url, volume);
      return;
    }

    // Fallback: arquivo em disco
    const path = this._paths[id];
    if (path) this._loadAndPlay(id, path, volume);
  }

  // ── Carrega um BABYLON.Sound e toca na primeira oportunidade ───
  _loadAndPlay(id, src, volume) {
    try {
      const snd = new BABYLON.Sound(
        `sound_${id}`, src, this.scene,
        () => {
          // Callback "pronto": toca assim que carregado
          snd.setVolume(volume);
          snd.play();
        },
        { autoplay: false, loop: false, spatialSound: false }
      );
      this._cache[id] = snd;
    } catch (e) {
      // Som não encontrado ou formato inválido → silencioso
    }
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
