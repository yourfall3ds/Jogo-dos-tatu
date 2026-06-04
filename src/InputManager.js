// ─────────────────────────────────────────────────────────────────
//  InputManager — teclado + mouse + pointer lock
//
//  Pointer lock confina o cursor dentro da janela.
//  Quando o browser libera o lock (ESC, alt-tab, clique fora),
//  onDeactivated() é chamado para sincronizar o estado da UI.
// ─────────────────────────────────────────────────────────────────
export class InputManager {
  constructor(canvas) {
    this.canvas        = canvas;
    this.keys          = {};
    this._mouseX       = 0;
    this._mouseY       = 0;
    this._clicked      = false;
    this._rightClicked = false;
    this._wheelDelta   = 0;     // acumula scroll p/ trocar de arma
    this.gameActive    = false;
    this._lockConfirmed     = false;  // lock já confirmou pelo menos uma vez
    // Só vira true DEPOIS do primeiro pointer-lock confirmado pelo browser.
    // O ramo de PAUSA do pointerlockchange só pode disparar quando isto for true,
    // pra ignorar o pointerlockchange transitório (lock=null) do boot/transição.
    this._gameFullyStarted  = false;

    // Double-tap WASD para dash 360 + W+S simultâneo = dash pra cima
    this._lastWPressTime = 0;
    this._lastAPressTime = 0;
    this._lastSPressTime = 0;
    this._lastDPressTime = 0;
    this._wDoubleTap     = false;
    this._aDoubleTap     = false;
    this._sDoubleTap     = false;
    this._dDoubleTap     = false;
    this._upDoubleTap    = false; // dash pra cima (W+S double-tap simultaneo)
    this.DASH_WINDOW_MS  = 320;
    this.DASH_PAIR_MS    = 80;    // janela pra detectar W+S juntos

    // Callback chamado quando o jogo é desativado (pointer lock perdido, ESC, etc.)
    // Definido externamente: input.onDeactivated = () => { ... }
    this.onDeactivated = null;

    // ── Teclado ──────────────────────────────────────────────────────
    // Limpa teclas presas quando o usuário foca num campo de texto
    document.addEventListener('focusin', e => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') this.keys = {};
    });

    window.addEventListener('keydown', e => {
      // Não intercepta quando o usuário está digitando num input/textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Ignora auto-repeat do SO (keydown dispara ~30x/s enquanto segura).
      // Sem isso, segurar W gerava "double-tap" falso o tempo todo.
      if (e.repeat) { this.keys[e.code] = true; return; }

      const wasDown = this.keys[e.code];
      this.keys[e.code] = true;
      // Só engole as teclas de scroll/foco do browser DURANTE o jogo (gameActive).
      // Fora do gameplay (menus, login, lobby) deixa o comportamento nativo —
      // Tab navega campos, Space rola a página. Space/setas rolam a viewport e
      // Tab tira o foco do canvas; dentro do jogo isso atrapalha o controle.
      if (this.gameActive &&
          ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))
        e.preventDefault();

      // Double-tap WASD → dash 360. Só conta como NOVO toque se a tecla estava
      // solta antes (wasDown=false) E gameActive. Segurar não dispara.
      // W+S simultâneo (mesmo double-tap, dentro de 80ms) → dash pra cima.
      if (this.gameActive && !wasDown) {
        const now = performance.now();
        const win = this.DASH_WINDOW_MS;
        const pair = this.DASH_PAIR_MS;
        if (e.code === 'KeyW') {
          if (now - this._lastWPressTime < win) {
            this._wDoubleTap = true;
            this._lastWPressTime = 0;
            // Dash pra cima: 2 vezes W e 2 vezes S quase ao mesmo tempo.
            // Verifica se S também acabou de double-tappear (≤ 80ms).
            if (this._sDoubleTap && now - (this._sDoubleTapAt || 0) < pair) {
              this._upDoubleTap = true;
              this._wDoubleTap = false; this._sDoubleTap = false;
            }
            this._wDoubleTapAt = now;
          } else {
            this._lastWPressTime = now;
          }
        } else if (e.code === 'KeyS') {
          if (now - this._lastSPressTime < win) {
            this._sDoubleTap = true;
            this._lastSPressTime = 0;
            if (this._wDoubleTap && now - (this._wDoubleTapAt || 0) < pair) {
              this._upDoubleTap = true;
              this._wDoubleTap = false; this._sDoubleTap = false;
            }
            this._sDoubleTapAt = now;
          } else {
            this._lastSPressTime = now;
          }
        } else if (e.code === 'KeyA') {
          if (now - this._lastAPressTime < win) {
            this._aDoubleTap = true;
            this._lastAPressTime = 0;
          } else {
            this._lastAPressTime = now;
          }
        } else if (e.code === 'KeyD') {
          if (now - this._lastDPressTime < win) {
            this._dDoubleTap = true;
            this._lastDPressTime = 0;
          } else {
            this._lastDPressTime = now;
          }
        }
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // ── Mouse movement ───────────────────────────────────────────────
    document.addEventListener('mousemove', e => {
      if (!this.gameActive) return;
      // SÓ acumula movimento quando o pointer lock está ATIVO (raw input).
      //  Sem o lock, e.movementX/Y vêm do cursor LIVRE andando pela tela — se
      //  acumulássemos isso, a câmera giraria com o mouse solto E o cursor
      //  vazaria pra fora da janela clicando em coisas do Windows. Ignorando
      //  aqui, o mouse solto não mexe a mira; o próximo clique re-trava o lock.
      if (document.pointerLockElement !== this.canvas) return;
      this._mouseX += e.movementX;
      this._mouseY += e.movementY;
    });

    // ── Click: atirar + re-adquirir lock se perdido ──────────────────
    document.addEventListener('mousedown', e => {
      // Modo construção: o LMB CONFIRMA a colocação da peça (BuildMode lê via
      // consumeClick no preUpdate). Esse registro NÃO pode depender de
      // gameActive — se o pointer-lock cair (gameActive=false) o player ainda
      // precisa conseguir POSICIONAR o asset que tem na mão. Sem isso, entrar
      // em modo construção pela hotbar "funciona" mas nunca conclui o placement.
      const _placing = window._buildMode?._state === 'placing';
      if (!this.gameActive && !_placing) return;
      if (e.target?.id === 'focus-btn') return;
      // Re-adquire lock se perdido. mousedown = gesto FRESCO e confiável →
      // fromGesture=true ignora o cooldown e pede o lock direto. É exatamente
      // aqui que um _pendingLock armado (ESC/respawn) é consumido.
      if (!document.pointerLockElement) this._requestLock(true);
      // Conta os cliques (não só um boolean) → mashing rápido não perde
      // cliques no mesmo frame; o combo encadeia todos.
      if (e.button === 0) { this._clicked = true;      this._clicks      = (this._clicks      || 0) + 1; this._leftHeld  = true; }
      if (e.button === 2) { this._rightClicked = true; this._rightClicks = (this._rightClicks || 0) + 1; this._rightHeld = true; }
    });

    // Solta o botão → para de segurar (full-auto / loop de metralhadora)
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this._leftHeld  = false;
      if (e.button === 2) this._rightHeld = false;
    });
    // Se perder o foco/lock, zera o "segurando" (senão a metralhadora trava ligada)
    window.addEventListener('blur', () => { this._leftHeld = false; this._rightHeld = false; });

    // Impede menu de contexto do browser no canvas durante o jogo
    canvas.addEventListener('contextmenu', e => {
      if (this.gameActive) e.preventDefault();
    });

    // ── AudioContext: resume no gesto + ao voltar pra aba ────────────
    // O WebAudio cru compartilhado (window._audioCtx) usado pelos SFX
    // procedurais (BattleBus, DropPod, LobbyHall, etc.) é criado lazy e nasce
    // 'suspended' se o 1º som cair fora de um gesto, e o browser também o
    // suspende ao trocar de aba. Sem isto o SFX fica mudo/cortado após alt-tab.
    this._installAudioResume();

    // ── Scroll do mouse → troca de arma ──────────────────────────────
    window.addEventListener('wheel', e => {
      if (!this.gameActive) return;
      this._wheelDelta += Math.sign(e.deltaY);
    }, { passive: true });

    // ── Pointer lock change ─────────────────────────────────────────
    // O browser libera o pointer lock quando o usuário pressiona ESC,
    // alt-tab, clica fora da janela, etc.
    // Nesse caso precisamos sincronizar nosso estado gameActive.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        // Lock CONFIRMADO pelo browser → travou de verdade.
        this._lockConfirmed = true;
        // Primeira confirmação → libera o jogo pra valer e habilita a pausa
        // por perda de lock daqui pra frente (ESC real). Garante gameActive.
        this._gameFullyStarted = true;
        this.gameActive = true;
        document.body.classList.add('game-active');
      } else if (!document.pointerLockElement && this.gameActive && this._gameFullyStarted) {
        // Lock foi liberado pelo browser → pausa o jogo.
        // SÓ pausa se o lock já foi confirmado uma vez (_gameFullyStarted).
        // Assim o pointerlockchange transitório (lock=null) do BOOT/transição
        // — quando a engine ainda está esquentando — NÃO pausa na entrada.
        this._lockConfirmed = false;
        this._internalDeactivate();
      }
      // Se !pointerLockElement && !_gameFullyStarted: boot/transição.
      // Ignora — não pausa. O lock confirma assim que a engine assenta, ou
      // o próximo mousedown (handler acima) re-tenta o _requestLock().
    });

    // ── Pointer lock error ──────────────────────────────────────────
    // Se o browser rejeitar o lock (gesto considerado não-confiável, engine
    // ainda focando, alt-tab no meio do gesto), ANTES isso era silenciosamente
    // descartado MAS gameActive já estava true → mouse do SO ficava livre e
    // saía pra fora da tela. Agora: loga e marca pra re-tentar no próximo clique.
    document.addEventListener('pointerlockerror', () => {
      // Inofensivo: o próximo mousedown real (handler acima) re-adquire o lock.
      // Marca _pendingLock pra deixar explícito que falta o gesto do jogador.
      this._lockConfirmed = false;
      this._pendingLock = true;
      console.debug('[Input] pointerlockerror — re-lock adiado pro proximo clique.');
    });
  }

  // ── Bootstrap de áudio: resume centralizado ─────────────────────
  // (a) No 1º gesto (pointerdown/keydown) garante que o window._audioCtx
  //     compartilhado exista e esteja 'running' — assim qualquer consumidor
  //     procedural que toque depois nasce destravado.
  // (b) No visibilitychange (voltar pra aba) dá resume() no ctx e destrava o
  //     audioEngine do Babylon, que o browser tinha suspendido no alt-tab.
  _installAudioResume() {
    const resumeShared = () => {
      try {
        const ctx = window._audioCtx ||
          (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch (_) {}
      // Babylon AudioEngine v2 (se já criado) — destrava no gesto.
      try {
        const ae = BABYLON?.Engine?.audioEngine || window._babylonAudioEngine;
        ae?.unlock?.();
        ae?.unlockAsync?.().catch?.(() => {});
      } catch (_) {}
    };

    // (a) 1º gesto do usuário — uma vez é suficiente pra sair de 'suspended'.
    const onGesture = () => resumeShared();
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown',     onGesture, { passive: true });

    // (b) Voltar pra aba — o browser suspende o ctx ao ocultar; retoma aqui.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resumeShared();
    });
  }

  // ── Solicita pointer lock no canvas ──────────────────────────────
  // DEVE ser chamado DENTRO de um gesture síncrono (pointerdown/click/mousedown),
  // nunca depois de await — senão o browser rejeita o lock como não-confiável.
  //
  // @param {boolean} fromGesture  true quando chamado DIRETO de um handler de
  //   mousedown/pointerdown real (gesto fresco). Quando false (resume via ESC,
  //   respawn da lógica de jogo) aplica o GUARD de cooldown: o Chrome impõe
  //   ~1.25s de bloqueio de re-lock após o unlock, e re-tentar dentro dessa
  //   janela (ou sem gesto) dispara SecurityError. Nesse caso NÃO chamamos
  //   requestPointerLock — só armamos _pendingLock, que o próximo mousedown
  //   real consome. Sem loop de re-tentativa, sem ruído de erro.
  _requestLock(fromGesture = false) {
    // GUARD de cooldown / non-gesture: evita o SecurityError na origem.
    if (!fromGesture) {
      const sinceUnlock = performance.now() - (this._lastUnlockAt || 0);
      if (sinceUnlock < 1300) {
        // Dentro do cooldown do browser pós-unlock → não tenta agora.
        // O próximo clique real do jogador (mousedown handler) re-adquire.
        this._pendingLock = true;
        console.debug('[Input] re-lock adiado (cooldown pós-unlock); aguardando clique.');
        return;
      }
    }
    this._pendingLock = false;
    try {
      this.canvas.focus();              // garante foco no elemento (precisa tabindex no canvas)
      // unadjustedMovement: true → RAW INPUT do mouse, 100% capturado pela
      //  janela. Sem isso o cursor podia "vazar" pra fora da tela e clicar em
      //  coisas do Windows enquanto se mirava. Com raw input o mouse fica
      //  TRAVADO de verdade no jogo. Fallback pro lock padrão se não suportado.
      let ret;
      try {
        ret = this.canvas.requestPointerLock({ unadjustedMovement: true });
      } catch (_) {
        ret = this.canvas.requestPointerLock();   // navegador sem a opção
      }
      if (ret && typeof ret.then === 'function') {
        ret.then(() => { this._lockConfirmed = true; this._pendingLock = false; })
           .catch(err => {
             // Se falhou POR CAUSA do unadjustedMovement (alguns SOs recusam),
             //  tenta o lock padrão antes de desistir.
             if (err?.name === 'NotSupportedError') {
               try {
                 const r2 = this.canvas.requestPointerLock();
                 if (r2?.then) r2.then(() => { this._lockConfirmed = true; this._pendingLock = false; }).catch(() => { this._pendingLock = true; });
                 return;
               } catch (_) {}
             }
             // NotAllowedError/SecurityError: gesto não-confiável ou cooldown.
             // NÃO entra em loop — só re-tenta no próximo mousedown real.
             this._lockConfirmed = false;
             this._pendingLock = true;
             console.debug('[Input] requestPointerLock adiado:', err?.name || err);
           });
      }
    } catch (e) {
      this._lockConfirmed = false;
      this._pendingLock = true;
      console.debug('[Input] requestPointerLock adiado:', e?.name || e);
    }
  }

  // ── Deactivation interna (usada pelo pointerlockchange) ──────────
  _internalDeactivate() {
    this.gameActive = false;
    this._lastUnlockAt = performance.now();   // marca unlock → arma cooldown de re-lock
    document.body.classList.remove('game-active');
    this._mouseX = 0; this._mouseY = 0; this._clicked = false;
    this.onDeactivated?.();   // notifica main.js para atualizar a UI
  }

  /**
   * Liga — gameActive=true, esconde cursor, pede pointer lock.
   * @param {boolean} fromGesture  Passe true SÓ quando activate() for chamado
   *   direto de um handler de gesto real (pointerdown do overlay click-to-play).
   *   Para resume via ESC ou respawn da lógica de jogo, deixe false: aí o GUARD
   *   de cooldown adia o lock e o próximo mousedown real o consome — sem
   *   SecurityError. (No 1º boot _lastUnlockAt=0, então o guard passa de boa.)
   */
  activate(fromGesture = false) {
    this.gameActive = true;
    document.body.classList.add('game-active');
    this._requestLock(fromGesture);
  }

  /** Pausa manualmente — mostra cursor, libera pointer lock */
  deactivate() {
    this.gameActive = false;
    this._lastUnlockAt = performance.now();   // marca unlock → arma cooldown de re-lock
    document.body.classList.remove('game-active');
    try { document.exitPointerLock?.(); } catch (_) {}
    this._mouseX = 0; this._mouseY = 0; this._clicked = false;
    // Não chama onDeactivated aqui pois quem chamou deactivate() já sabe
  }

  toggle() {
    if (this.gameActive) this.deactivate();
    else                 this.activate();
  }

  isDown(code) { return !!this.keys[code]; }

  /** True enquanto o botão esquerdo está SEGURADO (full-auto / metralhadora). */
  isFireDown()  { return !!this._leftHeld; }
  isAimDown()   { return !!this._rightHeld; }

  consumeMouseDelta() {
    const dx = this._mouseX, dy = this._mouseY;
    this._mouseX = 0; this._mouseY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this._clicked;
    this._clicked = false; this._clicks = 0;
    return c;
  }

  consumeRightClick() {
    const c = this._rightClicked;
    this._rightClicked = false; this._rightClicks = 0;
    return c;
  }

  /** Quantos cliques esquerdos desde o último consumo (p/ combo mashing). */
  consumeClickCount() {
    const n = this._clicks || 0;
    this._clicks = 0; this._clicked = false;
    return n;
  }

  /** Quantos cliques direitos desde o último consumo. */
  consumeRightClickCount() {
    const n = this._rightClicks || 0;
    this._rightClicks = 0; this._rightClicked = false;
    return n;
  }

  consumeDoubleTapW() {
    const c = this._wDoubleTap;
    this._wDoubleTap = false;
    return c;
  }
  consumeDoubleTapS() { const c = this._sDoubleTap; this._sDoubleTap = false; return c; }
  consumeDoubleTapA() { const c = this._aDoubleTap; this._aDoubleTap = false; return c; }
  consumeDoubleTapD() { const c = this._dDoubleTap; this._dDoubleTap = false; return c; }
  consumeDoubleTapUp() {
    const c = this._upDoubleTap;
    this._upDoubleTap = false;
    if (c) {
      // Limpa W/S de double-tap pra não disparar dash extra horizontal
      this._wDoubleTap = false;
      this._sDoubleTap = false;
    }
    return c;
  }
  /** Retorna direção do dash double-tap consumido: 'forward'|'back'|'left'|'right'|'up'|null */
  consumeDashDir() {
    if (this.consumeDoubleTapUp()) return 'up';
    if (this._wDoubleTap) { this._wDoubleTap = false; return 'forward'; }
    if (this._sDoubleTap) { this._sDoubleTap = false; return 'back'; }
    if (this._aDoubleTap) { this._aDoubleTap = false; return 'left'; }
    if (this._dDoubleTap) { this._dDoubleTap = false; return 'right'; }
    return null;
  }

  /** Retorna o acumulado de scroll desde a última chamada (-n / +n) e zera */
  consumeWheel() {
    const w = this._wheelDelta;
    this._wheelDelta = 0;
    return w;
  }
}
