// ─────────────────────────────────────────────────────────────────
//  ScreenFocusManager — DONO ÚNICO do "domínio de tela":
//   quem controla o cursor agora? o jogo (playing) ou a UI (menu/modal)?
//
//  ANTES: o estado de foco estava espalhado por 3 lugares (InputManager
//  pointerlockchange, main.js onDeactivated, main.js handler de ESC). No
//  multiplayer o ESC soltava o pointer lock mas ninguém mostrava menu nem
//  deixava o cursor num estado de UI consistente → o cursor ficava num
//  LIMBO (sumia / não clicava / re-travava sozinho no próximo clique).
//
//  AGORA: há UMA fonte de verdade. InputManager e main.js DELEGAM pra cá.
//  Estados:
//    'playing' — pointer lock ativo, cursor escondido, input do jogo ligado
//    'menu'    — lock liberado, cursor visível, tela pausada (no MP o
//                personagem segue vulnerável no servidor; só a TELA pausa)
//    'modal'   — uma janela/ferramenta aberta (inventário, mapa, build)
// ─────────────────────────────────────────────────────────────────
export class ScreenFocusManager {
  constructor(canvas) {
    this.canvas = canvas;
    this._state = 'menu';        // começa em menu (pré-jogo)
    this._modals = new Set();    // ids de modais abertos (empilháveis)
    this.onChange = null;        // (state) => void — setável por quem consome
  }

  get state() { return this._state; }

  _emit() {
    try { this.onChange?.(this._state); } catch (_) {}
  }

  /** Volta o controle pro jogo. Bloqueado se houver modal aberto. */
  enterPlaying() {
    if (this._modals.size > 0) return;      // modal aberto trava o playing
    this._state = 'playing';
    document.body.classList.remove('ui-cursor');
    document.body.classList.add('game-active');
    this._emit();
    // O pointer lock REAL é pedido pelo InputManager no próximo gesto do
    // jogador (requestPointerLock precisa de user-gesture); aqui só marcamos
    // o estado lógico e a classe de cursor.
  }

  /** UI assume: cursor visível, lock liberado, tela "pausada". */
  enterMenu() {
    this._state = 'menu';
    document.body.classList.add('ui-cursor');
    document.body.classList.remove('game-active');
    try { document.exitPointerLock?.(); } catch (_) {}
    this._emit();
  }

  /** Abre um modal (janela/ferramenta). Empilha — vários podem coexistir. */
  enterModal(id) {
    this._modals.add(id);
    this._state = 'modal';
    document.body.classList.add('ui-cursor');
    document.body.classList.remove('game-active');
    try { document.exitPointerLock?.(); } catch (_) {}
    this._emit();
  }

  /** Fecha um modal. Quando o último fecha, volta pro menu. */
  exitModal(id) {
    this._modals.delete(id);
    if (this._modals.size === 0) {
      this.enterMenu();
    } else {
      this._state = 'modal';
      this._emit();
    }
  }

  /** true se o jogo está com o controle (cursor escondido, input ativo). */
  isPlaying() { return this._state === 'playing'; }
}
