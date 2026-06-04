// ─────────────────────────────────────────────────────────────────
//  MusicSystem — playlist de música do Chibata
//
//  • 10 tracks gameplay + intro
//  • Início SOMENTE quando o jogador clica JOGAR (compliance autoplay)
//  • Shuffle + crossfade entre tracks
//  • Volume e mute persistidos em localStorage
//  • Botão flutuante de mute SEMPRE visível
//
//  Não usa nada de Babylon.js — HTML Audio puro pra reprodução simples
//  e baixa latência. WebAudio só pra rampa de volume.
// ─────────────────────────────────────────────────────────────────

const TRACKS = [
  'assets/music/chibata-intro.mp3',
  'assets/music/chibata-gameplay-1.mp3',
  'assets/music/chibata-gameplay-2.mp3',
  'assets/music/chibata-gameplay-3.mp3',
  'assets/music/chibata-gameplay-4.mp3',
  'assets/music/chibata-gameplay-5.mp3',
  'assets/music/chibata-gameplay-6.mp3',
  'assets/music/chibata-gameplay-7.mp3',
  'assets/music/chibata-gameplay-8.mp3',
  'assets/music/chibata-gameplay-9.mp3',
  'assets/music/chibata-gameplay-10.mp3',
];

const STORAGE_VOLUME = 'transfps_music_volume';
const STORAGE_MUTED  = 'transfps_music_muted';

export class MusicSystem {
  constructor() {
    this._audio = null;
    this._currentIdx = -1;
    this._playlist = this._shuffle([...TRACKS]);
    this._started = false;
    // MÚSICA DESLIGADA POR PADRÃO (só SFX). O sistema continua existindo — o
    // jogador pode religar nas Configurações. Como jogadores antigos já tinham
    // a chave salva como '0' (música ligada), rodamos UMA migração que força o
    // mute uma vez. Depois disso, a escolha do jogador é respeitada.
    try {
      if (localStorage.getItem('transfps_music_default_off_v1') !== '1') {
        localStorage.setItem(STORAGE_MUTED, '1');
        localStorage.setItem('transfps_music_default_off_v1', '1');
      }
    } catch (_) {}
    this._muted = this._loadBool(STORAGE_MUTED, true);
    this._volume = this._loadVolume();   // 0..1
    this._fadeT = null;
  }

  _loadBool(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return def;
  }

  _loadVolume() {
    try {
      const v = parseFloat(localStorage.getItem(STORAGE_VOLUME));
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    } catch (_) {}
    return 0.45;
  }

  _shuffle(arr) {
    // Mantém intro como primeira track, embaralha o resto
    const intro = arr.shift();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return [intro, ...arr];
  }

  /** Chamado quando o jogador clica JOGAR. */
  start() {
    if (this._started) return;
    // Mudo por padrão → nem começa a baixar/tocar mp3 (economiza banda/CPU).
    // Quando religar nas Configurações, setMuted(false) inicia a playlist.
    if (this._muted) return;
    this._started = true;
    this._playNext();
  }

  _playNext() {
    this._currentIdx = (this._currentIdx + 1) % this._playlist.length;
    const url = this._playlist[this._currentIdx];

    if (this._audio) {
      this._audio.pause();
      this._audio.removeAttribute('src');
      this._audio.load();
      this._audio = null;
    }

    const a = new Audio(url);
    a.volume = this._muted ? 0 : this._volume;
    a.preload = 'auto';
    a.onended = () => this._playNext();
    a.onerror = (e) => {
      console.warn('[MusicSystem] falha em', url, e?.message);
      // pula pra próxima após 1s pra evitar loop infinito
      setTimeout(() => this._playNext(), 1000);
    };
    a.play().catch(err => {
      console.warn('[MusicSystem] play bloqueado:', err.message);
    });
    this._audio = a;
    console.log(`[Music] ♪ ${url.split('/').pop()}`);
  }

  /** Skip pra próxima música. */
  next() {
    if (this._started) this._playNext();
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(STORAGE_VOLUME, String(this._volume)); } catch (_) {}
    if (this._audio && !this._muted) this._audio.volume = this._volume;
  }

  getVolume() { return this._volume; }

  setMuted(m) {
    this._muted = !!m;
    try { localStorage.setItem(STORAGE_MUTED, m ? '1' : '0'); } catch (_) {}
    if (this._audio) this._audio.volume = m ? 0 : this._volume;
    // Religou a música mas a playlist nunca começou (start() pulou por estar
    // mudo) → inicia agora.
    if (!m && !this._started) {
      this._started = true;
      this._playNext();
    }
  }

  isMuted() { return this._muted; }
  isStarted() { return this._started; }

  currentTrackName() {
    if (this._currentIdx < 0) return null;
    const url = this._playlist[this._currentIdx];
    return url.split('/').pop().replace('.mp3', '');
  }
}
