// ─────────────────────────────────────────────────────────────────
//  main.js — TransFPS
// ─────────────────────────────────────────────────────────────────
import './utils/quietConsole.js';  // PRIMEIRO: silencia ruído de boot/assets no console
import { InputManager }  from './InputManager.js';
import { Player }        from './Player.js';
import { Level }         from './Level.js';
import { HUD }           from './HUD.js';
import { AssetLoader }   from './AssetLoader.js';
import { SoundManager }  from './SoundManager.js';

// Novos Sistemas de Combate e Animação
import { AnimationLibrary }    from './game/animation/AnimationLibrary.js';
import { AnimationController } from './game/animation/AnimationController.js';
import { LayeredAnimator }     from './game/animation/LayeredAnimator.js';
import { CombatSystem }        from './game/combat/CombatSystem.js';
import { ComboSystem }         from './game/combat/ComboSystem.js';
import { ImpactEffectSystem }  from './game/combat/ImpactEffectSystem.js';
import { PlayerStateMachine }  from './game/player/PlayerStateMachine.js';
import { CharacterSwapper }    from './game/player/CharacterSwapper.js';
import { CharacterSelectUI }   from './game/ui/CharacterSelectUI.js';
import { MOVESETS }            from './game/animation/animationNames.js';
import { AnimatorMode }        from './game/animation/AnimatorMode.js';
import { MonsterDebugMode }    from './game/debug/MonsterDebugMode.js';
import { BUCANEIRA_CONFIG }     from './game/weapons/BucaneiraConfig.js';
import { WeaponEditor }         from './game/weapons/WeaponEditor.js';
import { SceneEditor }          from './game/scene/SceneEditor.js';
import { sweepHeavyColliders }   from './game/scene/ColliderOptimizer.js';
import { MoveListUI }           from './game/ui/MoveListUI.js';
import { EnemyManager }         from './game/enemies/EnemyManager.js';
import { CombatDirector }       from './game/enemies/CombatDirector.js';
import { NavMeshManager }       from './game/enemies/NavMeshManager.js';
import { DropSystem }           from './game/items/DropSystem.js';
import { HitStop }              from './game/combat/HitStop.js';
import { CatalogUI }            from './game/ui/CatalogUI.js';
import { BuildMode }            from './game/build/BuildMode.js';
import { MeshyPanel }           from './game/meshy/MeshyPanel.js';
import { AssetMachine }         from './game/items/AssetMachine.js';
import { PlayerStats }          from './game/stats/PlayerStats.js';
import { SkillSystem }          from './game/skills/SkillSystem.js';
import { Inventory }            from './game/items/Inventory.js';
import { RpgHUD }               from './game/ui/RpgHUD.js';
import { LocalDB }              from './game/data/LocalDB.js';
import { AssetGroupsUI }        from './game/ui/AssetGroupsUI.js';
import { initItemCatalog }      from './game/items/ItemCatalog.js';
import { ColliderDebug }        from './game/debug/ColliderDebug.js';
import { ThumbnailGen }         from './game/debug/ThumbnailGen.js';
import { initPhysics }          from './game/physics/PhysicsWorld.js';
import { DayNightCycle }        from './game/scene/DayNightCycle.js';
import { GraphicsEnhancer }     from './game/scene/GraphicsEnhancer.js';
import { GraphicsDebugPanel }   from './game/scene/GraphicsDebugPanel.js';
import { TestArena }            from './game/scene/TestArena.js';
import { ChibataMapLoader }    from './game/scene/ChibataMapLoader.js';
import { MapSelectUI }         from './game/ui/MapSelectUI.js';
import { BloodFX }             from './game/combat/BloodFX.js';
import { BulletTracer }        from './game/effects/BulletTracer.js';
import { WaterSystem }         from './game/scene/WaterSystem.js';
import { SkillMapExtras }      from './game/scene/SkillMapExtras.js';
import { SettingsUI }          from './game/ui/SettingsUI.js';
import { MusicSystem }         from './game/audio/MusicSystem.js';
import { MusicMuteButton }     from './game/ui/MusicMuteButton.js';
import { AuthSystem }          from './game/auth/AuthSystem.js';
import { DEBUG }               from './utils/debug.js';

// OAuth callback handler — roda ANTES do init normal.
// Se essa janela for o popup de login (tem ?code= [PKCE] ou #access_token=
// [implicit] no URL), troca por session, manda tokens pro opener via
// BroadcastChannel('transfps-auth') e mostra tela de confirmacao.
// Flag global pra init() abortar e nao bootar o jogo dentro do popup.
window.__transfpsIsOAuthPopup = false;
if (typeof window !== 'undefined') {
  const _qs = new URLSearchParams(window.location.search);
  const _isPopupCallback =
    _qs.has('code') ||
    _qs.get('auth') === 'callback' ||
    _qs.has('error') ||
    window.location.hash.includes('access_token=');
  if (_isPopupCallback) {
    // Flag IMEDIATA pra impedir o init() de rodar enquanto o exchange
    // assincrono acontece (handleOAuthCallback agora eh async).
    window.__transfpsIsOAuthPopup = true;
    // LIMPA a tela do index.html JA, antes do jogo carregar nada visual
    // (logo TransFPS, barras de loading, etc).
    try {
      const _clearScreen = () => {
        document.body.innerHTML = '';
        document.body.style.background = '#02030a';
        // Tela de espera enquanto handleOAuthCallback monta a confirmacao
        const wait = document.createElement('div');
        wait.id = '__oauth_wait';
        wait.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#dff5ff;font:600 14px Segoe UI,monospace;letter-spacing:2px;';
        wait.textContent = 'AUTORIZANDO…';
        document.body.appendChild(wait);
      };
      if (document.body) _clearScreen();
      else document.addEventListener('DOMContentLoaded', _clearScreen, { once: true });
    } catch (_) {}
    AuthSystem.handleOAuthCallback().catch((e) => {
      console.error('[Auth] callback async erro:', e);
    });
  }
}
import { LoginScreen }         from './game/ui/LoginScreen.js';
import { LobbyUI }             from './game/ui/LobbyUI.js';
import { ServerListUI }        from './game/ui/ServerListUI.js';
import { ColyseusClient }      from './game/multiplayer/ColyseusClient.js';
import { RemotePlayer }        from './game/multiplayer/RemotePlayer.js';
import { RemoteMob }           from './game/multiplayer/RemoteMob.js';
import { RemoteDrop }          from './game/multiplayer/RemoteDrop.js';
import { RemoteProp }          from './game/multiplayer/RemoteProp.js';
import { RemoteFx }            from './game/multiplayer/RemoteFx.js';
import { ChatHud, Scoreboard, PingDisplay, DeathTimer } from './game/ui/IngameHud.js';
import { attachTransfpsSocial } from './game/ui/TransfpsSocial.js';
import { BootLoadGuard } from './game/ui/BootLoadGuard.js';
import { attachTransfpsFlowGuard } from './game/ui/TransfpsFlowGuard.js';
import { BattleRoyaleMode } from './game/br/BattleRoyaleMode.js';
import { CharacterSelect3D } from './game/br/CharacterSelect3D.js';
import { LobbyHall } from './game/br/LobbyHall.js';
import { BloodTrail }          from './game/combat/BloodTrail.js';
import { DeathCam }            from './game/multiplayer/DeathCam.js';
import { PvpToggle }           from './game/ui/PvpToggle.js';
import { LocalAura }           from './game/combat/LocalAura.js';
import { getConfig }           from './game/auth/SupabaseClient.js';
import { CloudSave }           from './game/data/CloudSave.js';

const TRANSFPS_CS_URL = 'wss://app.overpixel.online/transfps-cs';

// ── UI helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

let gameScene, animatorMode, monsterDebugMode;
let _engineRef  = null;         // referência ao BABYLON.Engine para resize fora do init()
let _engineMode = false;        // true = jogo congelado, editor visível
let _activeTab  = 'scene';      // 'weapons' | 'scene'  — ESC abre no modo cena

// ── Engine Mode ────────────────────────────────────────────────────
window.enterEngineMode = function (tab) {
  if (_engineMode) {
    // já em engine mode: apenas troca de aba se solicitado
    if (tab) window.setEngineTab(tab);
    return;
  }
  _engineMode = true;
  document.body.classList.add('engine-mode');
  window._gameInput?.deactivate?.();
  $('pause-overlay')?.classList.remove('visible');
  _engineRef?.resize();
  window.setEngineTab(tab || _activeTab || 'weapons');
};

window.exitEngineMode = function () {
  if (!_engineMode) return;
  _engineMode = false;
  document.body.classList.remove('engine-mode');
  window._weaponEditor?.hide();
  window._sceneEditor?.hide();
  _engineRef?.resize();
  setFocusUI(false);
};

/** Alterna entre as abas do engine mode ('weapons' | 'scene') */
window.setEngineTab = function (tab) {
  _activeTab = tab;

  // Atualiza botões de aba
  const btnW = $('engine-tab-weapons');
  const btnS = $('engine-tab-scene');
  if (btnW) btnW.classList.toggle('engine-tab-active', tab === 'weapons');
  if (btnS) btnS.classList.toggle('engine-tab-active', tab === 'scene');

  if (tab === 'scene') {
    window._weaponEditor?.hide();
    window._sceneEditor?.show();
  } else {
    window._sceneEditor?.hide();
    window._weaponEditor?.show();
  }
};

function setFocusUI(active) {
  const btn = $('focus-btn');
  const ov  = $('pause-overlay');
  if (active) {
    btn.textContent = '⏸ Pausar';
    ov.classList.remove('visible');
  } else {
    btn.textContent = '▶ Focar';
    ov.classList.add('visible');
  }
}

let _loadReachedFull = false;   // sticky: uma vez 100%, JOGAR fica liberado

// ─────────────────────────────────────────────────────────────────
// Boot silencioso: BootLoadGuard NÃO é criado de cara.
// Tela de login aparece imediatamente. Loading acontece no fundo,
// mas sem barra visível, até o usuário clicar JOGAR ou ENTRAR EM SALA.
// Se nesse momento os essenciais ainda não terminaram, aí sim mostra
// o BootLoadGuard com a barra real. Caso contrário, vai direto.
// ─────────────────────────────────────────────────────────────────
let _bootGuard = null;                       // instanciado sob demanda
let _uiGateOpen = false;                     // só true quando user agir
let _lastSilentPct = 0;
let _lastSilentLabel = '';

// Promise pública: resolve quando TIER 1 (essenciais) terminar.
let _essentialReadyResolve;
window._essentialReady = new Promise(res => { _essentialReadyResolve = res; });

/**
 * Cria o BootLoadGuard sob demanda (idempotente).
 */
function _ensureBootGuard(reason = 'jogar') {
  if (_bootGuard) return _bootGuard;
  try {
    _bootGuard = new BootLoadGuard();
    window._bootGuard = _bootGuard;
    _bootGuard.update(_lastSilentPct, _lastSilentLabel || ('preparando ' + reason + '…'));
  } catch (e) {
    console.error('[BootGuard] criacao falhou:', e);
    throw e;
  }
  return _bootGuard;
}

/**
 * Abre o portão da UI de loading. Chamado por window.startGame e
 * por lobbyUI.onEnterGame ANTES de qualquer await em assets.
 * - Marca _uiGateOpen=true para liberar render de UI.
 * - NÃO cria o guard imediatamente: o guard só aparece se essenciais
 *   demorarem mais de 200ms a partir desse momento (ver _awaitEssentials).
 */
window._openLoadGate = function _openLoadGate(reason = 'jogar') {
  if (_uiGateOpen) return;
  _uiGateOpen = true;
};

/**
 * Espera essenciais com janela de tolerância: se em até 200ms já estiver
 * pronto, entra direto SEM mostrar barra. Caso contrário, instancia o
 * BootLoadGuard só nesse momento e aguarda terminar.
 */
async function _awaitEssentials(reason = 'jogar') {
  let resolved = false;
  window._essentialReady.then(() => { resolved = true; });
  await new Promise(r => setTimeout(r, 200));
  if (resolved) return;
  _ensureBootGuard(reason);
  await window._essentialReady;
}
window._awaitEssentials = _awaitEssentials;

function setLoadingUI(pct, label = '') {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (pct >= 100) _loadReachedFull = true;

  // SEMPRE empurra pro dock da start-screen (barra + label + % + botão JOGAR).
  // Esse dock é o ÚNICO feedback enquanto a start-screen está visível, e
  // continua atualizando 40→100% durante TIER2 mesmo após o botão habilitar.
  try { window._ssBootProgress?.(p, label); }
  catch (e) { console.error('[setLoadingUI] _ssBootProgress:', e); }

  // Antes do user clicar JOGAR/ENTRAR EM SALA, NÃO toca no BootLoadGuard
  // (overlay full-screen) — só guarda pra mostrar caso ele seja criado depois.
  if (!_uiGateOpen) {
    _lastSilentPct = Math.max(_lastSilentPct, p);
    if (label) _lastSilentLabel = label;
    return;
  }

  // Portão aberto (user clicou JOGAR antes de TIER1 terminar): atualiza o
  // BootLoadGuard overlay também. Quando bater 100%, fecha o guard.
  try { _bootGuard?.update(p, label); }
  catch (e) { console.error('[BootGuard] update:', e); throw e; }
  if (pct >= 100) {
    try { _bootGuard?.done(); }
    catch (e) { console.error('[BootGuard] done:', e); throw e; }
  }
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  // Se a janela é o popup OAuth, NÃO inicializa o jogo (vai fechar)
  if (window.__transfpsIsOAuthPopup) {
    DEBUG.log('[Auth] popup OAuth — skipping game init');
    return;
  }
  const canvas = $('renderCanvas');

  // ── Engine: WebGPU (principal) com WebGL2 de fallback ───────────
  //  WebGPU = shaders rápidos + compute (partículas/água/terreno na GPU),
  //  melhor pra PBR/reflexões/SSR. WebGL2 = tanque confiável de compat.
  //
  //  ⚙️ FALLBACK_WEBGL: enquanto FALSE, roda WebGPU PURO (modo teste solo) —
  //     se o WebGPU falhar, mostra aviso claro em vez de cair disfarçado.
  //     Quando o WebGPU estiver aprovado, mude pra TRUE (cai pro WebGL2 só
  //     em navegador sem suporte). Força WebGL2 a qualquer hora com ?webgl
  const FALLBACK_WEBGL = false;   // ← teste solo de WebGPU. depois: true

  let engine = null;
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const webgpuOK = !forceWebGL && BABYLON.WebGPUEngine && await BABYLON.WebGPUEngine.IsSupportedAsync;

  if (webgpuOK) {
    const gpu = new BABYLON.WebGPUEngine(canvas, {
      stencil: true, antialias: true, adaptToDeviceRatio: true,
    });
    await gpu.initAsync();          // sem try/catch no modo solo: erro aparece
    engine = gpu;
    window._engineKind = 'WebGPU';
    window._webgpu = true;
    // ── Logger de RAIZ de erros WebGPU ──────────────────────────────
    //  O WebGPU floda "...invalid due to a previous error" (cascata). O que
    //  importa é o PRIMEIRO erro (a raiz). Aqui filtramos a cascata e
    //  imprimimos só a raiz, 1x por mensagem → fica fácil diagnosticar.
    try {
      const dev = gpu._device;
      if (dev?.addEventListener) {
        const _seenRoots = new Set();
        dev.addEventListener('uncapturederror', (e) => {
          const m = e.error?.message || String(e.error || '');
          if (/due to a previous error|Invalid CommandBuffer|Invalid RenderPipeline|too many warnings/i.test(m)) return;
          const key = m.slice(0, 120);
          if (_seenRoots.has(key)) return;
          _seenRoots.add(key);
          console.error('%c[WebGPU RAIZ]', 'color:#f55;font-weight:bold', m.slice(0, 500));
        });
      }
    } catch (_) {}
    console.log('%c[Engine] 🚀 WebGPU ativo' + (FALLBACK_WEBGL ? '' : ' (SOLO — fallback OFF)'), 'color:#4f8;font-weight:bold');
  } else if (FALLBACK_WEBGL || forceWebGL) {
    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true,
    });
    window._engineKind = 'WebGL2';
    window._webgpu = false;
    console.log('%c[Engine] 🛡️ WebGL2 ativo (fallback)', 'color:#fc4;font-weight:bold');
  } else {
    // Modo solo + sem WebGPU → avisa claramente (não disfarça com WebGL)
    const msg = 'WebGPU não é suportado neste navegador.\n\n(Modo teste solo: fallback WebGL desligado.)\nAbra com ?webgl pra rodar em WebGL2.';
    document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0a0e1a;color:#fdd;font:600 18px system-ui;text-align:center;white-space:pre-line;padding:40px">' + msg + '</div>';
    throw new Error('[Engine] WebGPU indisponível e fallback desligado (teste solo).');
  }

  // Selo visível: mostra o engine ativo no canto (WebGPU 🚀 ou WebGL2 🛡️)
  try {
    const badge = document.createElement('div');
    const gpu = window._engineKind === 'WebGPU';
    badge.id = 'engine-badge';
    badge.textContent = gpu ? '🚀 WebGPU' : '🛡️ WebGL2';
    badge.title = gpu ? 'Motor de nave: WebGPU ativo' : 'Tanque confiável: WebGL2 (fallback)';
    badge.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:120;'
      + 'font:700 12px system-ui;padding:4px 12px;border-radius:20px;letter-spacing:.5px;'
      + (gpu ? 'background:rgba(20,60,40,.92);color:#7fffba;border:1px solid #2f8'
             : 'background:rgba(60,50,20,.92);color:#ffd34d;border:1px solid #a83');
    document.body.appendChild(badge);
  } catch (_) {}
  _engineRef = engine;  // expõe para enterEngineMode/exitEngineMode

  const scene = new BABYLON.Scene(engine);
  gameScene = scene;
  scene.clearColor      = new BABYLON.Color4(.58, .70, .92, 1);
  scene.collisionsEnabled = true;

  // ── Física real (Havok) — habilita ANTES de criar mundo/player ──────
  //  Stage 1 da migração: motor ligado. Mundo/objetos/player passam a
  //  usar corpos rígidos nos próximos estágios.
  await initPhysics(scene, -28);

  animatorMode     = new AnimatorMode(engine, canvas);
  monsterDebugMode = new MonsterDebugMode(engine, canvas);
  window._monsterDebug = monsterDebugMode;

  // ── Iluminação ──────────────────────────────────────────────────
  const sun = new BABYLON.DirectionalLight('sun',
    new BABYLON.Vector3(-0.6, -1, -0.5).normalize(), scene);
  sun.intensity = 1.8;
  sun.position  = new BABYLON.Vector3(60, 120, 60);

  const ambient = new BABYLON.HemisphericLight('sky',
    new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity   = 0.55;
  ambient.groundColor = new BABYLON.Color3(.20, .28, .18);

  // ── Sombras do sol — CascadedShadowGenerator (CSM) ──────────────
  //  CSM divide o frustum da CÂMERA em cascatas: sombra densa e nítida
  //  perto do player + cobertura ampla ao longe, sem frustum manual.
  //  É o setup do exemplo oficial (lambda + soft shadow PCSS), que dá
  //  aquela sombra "irada" — penumbra macia que endurece no contato.
  sun.position = new BABYLON.Vector3(40, 100, 40);
  sun.autoUpdateExtends = false;        // CSM cuida do frustum sozinho
  sun.shadowMinZ = 1; sun.shadowMaxZ = 250;

  const shadowGen = new BABYLON.CascadedShadowGenerator(2048, sun);
  shadowGen.numCascades = 4;
  shadowGen.lambda = 0.78;              // equilíbrio perto/longe
  shadowGen.stabilizeCascades = true;   // mata o "swimming" da borda
  shadowGen.cascadeBlendPercentage = 0.05;
  shadowGen.shadowMaxZ = 115;           // alcance das cascatas (u) — valor F8
  shadowGen.depthClamp = true;
  shadowGen.autoCalcDepthBounds = true; // ajusta profundidade à cena
  // PCSS: penumbra realista (nítida no contato, suave ao longe)
  shadowGen.filter = BABYLON.ShadowGenerator.FILTER_PCSS;
  shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
  shadowGen.contactHardeningLightSizeUVRatio = 0.15;   // penumbra — valor F8
  shadowGen.transparencyShadow = true;
  shadowGen.enableSoftTransparentShadow = true;
  shadowGen.bias = 0.002;
  shadowGen.normalBias = 0.1;
  shadowGen.setDarkness(0.3);
  window._shadowGen = shadowGen;

  // CSM segue a câmera automaticamente → frustum manual não é mais
  //  necessário (vira no-op pra não brigar com as cascatas).
  window._updateShadowFrustum = () => {};

  // Helper de teste (rode window.testShadow() no console do jogo): cria um
  //  pilar vermelho 5m à frente — confirma a sombra projetada no chão.
  window.testShadow = () => {
    const p = window._gamePlayer, s = scene;
    const yaw = BABYLON.Tools.ToRadians(p.yaw || 0);
    const pos = p.mesh.position.add(new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).scale(5));
    const pillar = BABYLON.MeshBuilder.CreateBox('shadowTest', { width: 1, height: 6, depth: 1 }, s);
    pillar.position.set(pos.x, 3, pos.z);
    const m = new BABYLON.StandardMaterial('stm', s); m.diffuseColor = new BABYLON.Color3(1, 0, 0); pillar.material = m;
    window._shadowGen.addShadowCaster(pillar);
    return 'pilar vermelho 5m à frente — veja a sombra no chão';
  };

  // DIAGNÓSTICO 1: liga/desliga TODO o pós-processamento. Se a sombra
  //  aparecer com pós-proc OFF, o culpado é o pipeline/SSAO/imageProcessing.
  window.togglePosProc = () => {
    const cam = window._gamePlayer.camera, mgr = scene.postProcessRenderPipelineManager;
    window._ppOff = !window._ppOff;
    try { mgr[window._ppOff ? 'detachCamerasFromRenderPipeline' : 'attachCamerasToRenderPipeline']('mainPipeline', cam); } catch (_) {}
    try { mgr[window._ppOff ? 'detachCamerasFromRenderPipeline' : 'attachCamerasToRenderPipeline']('ssao', cam); } catch (_) {}
    scene.imageProcessingConfiguration.isEnabled = !window._ppOff;
    return window._ppOff ? 'POS-PROC OFF — a sombra apareceu agora?' : 'pos-proc ON de novo';
  };

  // DIAGNÓSTICO 2: sombra MÁXIMA (preta) + pilar + sol de lado. Pra não ter
  //  dúvida se é a sombra que está fraca ou ausente.
  window.sombraForte = () => {
    window._shadowGen.setDarkness(0);     // preto total
    const sun = scene.getLightByName('sun');
    sun.direction = new BABYLON.Vector3(-1, -0.8, 0).normalize();
    window._dayNight?.pause(true);
    window.testShadow();
    return 'darkness 0 (preto) + pilar. Olhe o chão ao lado do pilar vermelho.';
  };

  // ── Névoa (leve — só pra dar profundidade no horizonte) ──────────
  scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0018;
  scene.fogColor   = new BABYLON.Color3(.58, .70, .92);

  // ── Ciclo dia/noite (sol, lua, fases, céu HD) ────────────────────
  const dayNight = new DayNightCycle(scene, sun, ambient, shadowGen);
  window._dayNight = dayNight;

  // ── Sistemas base ────────────────────────────────────────────────
  const input  = new InputManager(canvas);
  const level  = new Level(scene, shadowGen, { clean: true });   // mapa limpo c/ sombra
  const player = new Player(scene, canvas, input, level);
  level.player     = player;   // inimigos precisam de referência ao jogador
  player.onRespawn = () => level.resetEnemies();  // reseta posição dos inimigos ao respawnar
  const hud    = new HUD(player);

  // ── Acabamento gráfico (bloom, tonemapping, SSAO, glow, FXAA) ─────
  const gfx = new GraphicsEnhancer(scene, player.camera, engine);
  window._gfx = gfx;
  dayNight.gfx = gfx;   // o ciclo ajusta exposure/bloom conforme a hora

  // Painel de calibração gráfica ao vivo (tecla F8)
  const gfxPanel = new GraphicsDebugPanel(gfx, dayNight, shadowGen, scene);
  window._gfxPanel = gfxPanel;

  // Arena de teste limpa (sombras) — window.arena() ou tecla F10 (F9 = engine mode)
  const testArena = new TestArena(scene, player, shadowGen);
  window._testArena = testArena;
  window.arena = () => { testArena.toggle(); return testArena.active ? 'na arena' : 'voltou'; };
  window._wasF10 = false;

  // ── Weapon Editor (criado ANTES dos GLBs para configs salvas serem aplicadas) ─
  const weaponEditor = new WeaponEditor(player.weapon, scene);
  window._weaponEditor = weaponEditor;

  // ── Scene Editor (editor de cena completo com gizmos) ───────────
  const sceneEditor = new SceneEditor(scene);
  window._sceneEditor = sceneEditor;

  // ── Move List UI (tecla M) ───────────────────────────────────────
  const moveListUI = new MoveListUI(player);
  window._moveListUI = moveListUI;

  // ── Enemy Manager + Catálogo de inimigos (tecla C) ────────────────
  const enemyManager = new EnemyManager(scene, shadowGen, level, player);
  window._enemyManager = enemyManager;
  const catalogUI = new CatalogUI(enemyManager);
  window._catalogUI = catalogUI;

  // ── Chibata Maps: seletor de mapa (tecla N) ───────────────────────
  const chibataMaps = new ChibataMapLoader(scene, level);
  const mapSelectUI = new MapSelectUI(chibataMaps);
  window._chibataMaps = chibataMaps;
  window._mapSelectUI = mapSelectUI;

  // ── Blood FX + Water + Skill Map Extras + Settings (tecla O) ──────
  const bloodFX = new BloodFX(scene);
  window._bloodFX = bloodFX;

  const bulletTracer = new BulletTracer(scene);
  window._bulletTracer = bulletTracer;

  const waterSystem = new WaterSystem(scene, level);
  window._waterSystem = waterSystem;
  waterSystem.build();

  const skillExtras = new SkillMapExtras(scene, level);
  skillExtras.build();
  window._skillExtras = skillExtras;

  // ── Music + Mute button (música começa APENAS no JOGAR) ──
  const musicSystem = new MusicSystem();
  window._musicSystem = musicSystem;
  const musicMuteBtn = new MusicMuteButton(musicSystem);
  window._musicMuteBtn = musicMuteBtn;

  const settingsUI = new SettingsUI(bloodFX, musicSystem);
  window._settingsUI = settingsUI;

  // ── AUTH + LOGIN + LOBBY + MULTIPLAYER ─────────────────────────
  const auth = new AuthSystem();
  try { await auth.init(); }
  catch (e) { console.error('[Auth] init FALHOU - jogo nao pode rodar:', e); throw e; }
  window._auth = auth;

  // ── ColyseusClient (state-authoritative MP) ───────────────────────
  const cs = new ColyseusClient();
  cs.connect(TRANSFPS_CS_URL);
  window._cs = cs;
  cs.setPlayerId(auth.getUserId());

  const _remotePlayers = new Map();  // playerId → RemotePlayer
  const _remoteMobs = new Map();     // mobId → RemoteMob
  const _remoteDrops = new Map();    // dropId → RemoteDrop
  const _remoteProps = new Map();    // propId → RemoteProp
  const _remoteFx = new Map();       // fxId → RemoteFx
  window._remotePlayers = _remotePlayers;
  window._remoteMobs = _remoteMobs;
  window._remoteDrops = _remoteDrops;
  window._remoteProps = _remoteProps;
  window._remoteFx = _remoteFx;

  // LocalAura (player local quando pvp_on)
  let _localAura = null;

  // ── State listeners ──
  cs.on('player_add', ({ id, state }) => {
    if (id === auth.getUserId()) return; // sou eu mesmo
    if (_remotePlayers.has(id)) return;
    const rp = new RemotePlayer(scene, state);
    _remotePlayers.set(id, rp);
  });
  cs.on('player_remove', ({ id }) => {
    const rp = _remotePlayers.get(id);
    if (rp) { rp.dispose(); _remotePlayers.delete(id); }
  });
  // Quando desconecta da sala (close): limpa TODOS os RemotePlayers com fade
  // (evita stub "fantasma" se varios sairem juntos / server cair / etc).
  cs.on('close', () => {
    _remotePlayers.forEach((rp) => { try { rp.dispose(); } catch (e) { console.error('[CS close] dispose RemotePlayer falhou:', e); } });
    _remotePlayers.clear();
    _remoteMobs.forEach((m) => { try { m.dispose(); } catch (e) { console.error('[CS close] dispose RemoteMob falhou:', e); } });
    _remoteMobs.clear();
    _remoteDrops.forEach((d) => { try { d.dispose(); } catch (e) { console.error('[CS close] dispose RemoteDrop falhou:', e); } });
    _remoteDrops.clear();
    _remoteProps.forEach((p) => { try { p.dispose(); } catch (e) { console.error('[CS close] dispose RemoteProp falhou:', e); } });
    _remoteProps.clear();
    _remoteFx.forEach((f) => { try { f.dispose(); } catch (e) { console.error('[CS close] dispose RemoteFx falhou:', e); } });
    _remoteFx.clear();
  });
  cs.on('player_change', ({ id, field, value, state }) => {
    // Player local mudou pvp_on → ativa LocalAura
    if (id === auth.getUserId() && field === 'pvp_on') {
      if (!_localAura) _localAura = new LocalAura(scene, player);
      _localAura.setActive(!!value);
    }
    // RemotePlayer aplica mudança visual
    const rp = _remotePlayers.get(id);
    if (rp) rp.onSchemaChange?.(field);
  });

  cs.on('mob_add', ({ id, state }) => {
    if (_remoteMobs.has(id)) return;
    const mob = new RemoteMob(scene, state);
    _remoteMobs.set(id, mob);
  });
  cs.on('mob_remove', ({ id }) => {
    const m = _remoteMobs.get(id);
    if (m) { m.dispose(); _remoteMobs.delete(id); }
  });
  cs.on('mob_change', ({ id, field }) => {
    const m = _remoteMobs.get(id);
    if (m) m.onSchemaChange?.(field);
  });

  // ── DROPS server-authoritative ──
  cs.on('drop_add', ({ id, state }) => {
    if (_remoteDrops.has(id)) return;
    const drop = new RemoteDrop(scene, state);
    _remoteDrops.set(id, drop);
  });
  cs.on('drop_remove', ({ id }) => {
    const d = _remoteDrops.get(id);
    if (d) { d.dispose(); _remoteDrops.delete(id); }
  });

  // ── PROPS destrutíveis ──
  cs.on('prop_add', ({ id, state }) => {
    if (_remoteProps.has(id)) return;
    _remoteProps.set(id, new RemoteProp(scene, state));
  });
  cs.on('prop_remove', ({ id }) => {
    const p = _remoteProps.get(id);
    if (p) { p.dispose(); _remoteProps.delete(id); }
  });
  cs.on('prop_change', ({ id, field }) => {
    const p = _remoteProps.get(id);
    if (p) p.onSchemaChange?.(field);
  });
  cs.on('prop_hit', (m) => {
    // VFX local de hit no prop
    const p = _remoteProps.get(m.prop_id);
    if (p?.root) {
      window._dmgNumbers?.spawn(p.root.position, m.dmg, { color: '#ffaa44' });
    }
  });
  cs.on('prop_broken', (m) => {
    const p = _remoteProps.get(m.prop_id);
    if (!p) return;
    // FX adicional já vai vir do server (fx_add)
  });

  // ── FX visuais compartilhados ──
  cs.on('fx_add', ({ id, state }) => {
    if (_remoteFx.has(id)) return;
    const fx = new RemoteFx(scene, state);
    _remoteFx.set(id, fx);
  });
  cs.on('fx_remove', ({ id }) => {
    const fx = _remoteFx.get(id);
    if (fx) { fx.dispose(); _remoteFx.delete(id); }
  });

  // ── PICKUP confirmado pelo servidor (aplica efeito local) ──
  cs.on('pickup', (m) => {
    const isMine = m.player_id === auth.getUserId();
    // VFX onde estava o drop (já foi removido pelo drop_remove)
    if (isMine) {
      // Som de pickup
      player.sounds?.playNow?.('pickup_item', 0.8);
      // Atualiza inventário local conforme o tipo (servidor já validou)
      switch (m.kind) {
        case 'hp_potion':
          // HP já foi aplicado server-side; feedback visual local
          window._dmgNumbers?.spawn(player.mesh.position, '+' + m.value, { color: '#22dd44' });
          break;
        case 'mp_potion':
          if (player.mp != null) player.mp = Math.min(player.maxMp || 100, player.mp + m.value);
          window._dmgNumbers?.spawn(player.mesh.position, '+MP' + m.value, { color: '#5599ff' });
          break;
        case 'coin':
          // Acumula localmente (futuro: server-side em PlayerState.coins)
          player._coins = (player._coins || 0) + m.value;
          window._dmgNumbers?.spawn(player.mesh.position, '+' + m.value + '🪙', { color: '#ffcc22' });
          break;
        case 'gem':
          player._gems = (player._gems || 0) + m.value;
          window._dmgNumbers?.spawn(player.mesh.position, '+💎' + m.value, { color: '#5cf' });
          break;
      }
    }
  });

  // ── HIT CONFIRMADO pelo servidor (dmg autoritativo) ──
  cs.on('hit_confirmed', (m) => {
    const myId = auth.getUserId();
    let targetPos = null;
    let targetMesh = null;
    if (m.mob) {
      const rm = _remoteMobs.get(m.to);
      if (rm) { targetPos = rm.root?.getAbsolutePosition?.(); targetMesh = rm.placeholder; }
    } else if (m.to === myId) {
      targetPos = player.mesh?.position;
      targetMesh = player.mesh;
    } else {
      const rp = _remotePlayers.get(m.to);
      if (rp) { targetPos = rp.root?.getAbsolutePosition?.(); targetMesh = rp.body; }
    }
    if (targetPos) {
      const crit = m.dmg >= 80;
      const color = m.from === myId ? (crit ? '#ff5050' : '#ffffff') : '#ffaa44';
      window._dmgNumbers?.spawn(targetPos, m.dmg, { crit, color });
    }
    if (targetPos && window._bloodFX) {
      const isSword = String(m.weapon || '').startsWith('sword');
      window._bloodFX.spawn(
        targetPos.add(new BABYLON.Vector3(0, 0.8, 0)),
        BABYLON.Vector3.Forward(),
        { multiplier: isSword ? 1.8 : 1.0, sourceNode: targetMesh, isHeavy: isSword || m.dmg >= 80 }
      );
    }
    // Som whiz surround na posicao do alvo
    if (targetPos) {
      const tPos = targetPos;
      try {
        const sm = window._soundManager;
        if (sm?._getSpatialSound) {
          sm._getSpatialSound("bullet_whiz", 60).then(snd => {
            if (!snd) return;
            try {
              if (snd.spatial?.position?.set) snd.spatial.position.set(tPos.x, tPos.y, tPos.z);
              snd.volume = 0.7;
              snd.play();
            } catch (_) {}
          }).catch(() => {});
        }
      } catch (e) { console.error("[BulletWhiz]", e); }
    }
  });

  // ── BulletTracer: linha amarela + impact spark no hit_confirmed ──
  cs.on("hit_confirmed", (m) => {
    try {
      const me = window._player?.mesh?.position;
      const target = m?.target_id ? cs.state?.players?.get?.(m.target_id) : null;
      if (me && target && Number.isFinite(target.x)) {
        const tPos = new BABYLON.Vector3(target.x, target.y + 1.5, target.z);
        bulletTracer.spawn(me, tPos);
        bulletTracer.spawnImpact(tPos);
      }
    } catch (e) { console.error("[BulletTracer]", e); }
  });

  // ── Mob attack hit no player local ──
  cs.on('mob_attack', (m) => {
    if (m.target_id === auth.getUserId() && !player._dead) {
      player.takeDamage?.(m.dmg, 'bite', null, 1);
    }
  });

  // ── Died (kill feed) ──
  cs.on('died', (d) => {
    const myId = auth.getUserId();
    const killerNick = d.killer === myId ? 'VOCÊ'
      : (_remotePlayers.get(d.killer)?.nickname || cs.state?.players?.get(d.killer)?.nickname || 'alguém');
    const victimNick = d.player_id === myId ? 'VOCÊ'
      : (_remotePlayers.get(d.player_id)?.nickname || cs.state?.players?.get(d.player_id)?.nickname || 'player');
    _showKillFeed(`${killerNick} ☠ ${victimNick}`);
  });

  cs.on('respawn', () => { /* state update vem via player.dead → false */ });

  // ── SKILL CAST: server validou e broadcastou. Renderiza VFX. ──
  cs.on('skill_cast', (m) => {
    const isMe = m.caster_id === auth.getUserId();
    // Posição do caster: meu próprio player ou um RemotePlayer
    const casterPos = isMe
      ? player.mesh?.position
      : _remotePlayers.get(m.caster_id)?.root?.position;
    if (!casterPos) return;
    // VFX local (todos renderizam)
    _showSkillVFX(scene, m.skill_id, casterPos, { dirX: m.dir_x, dirZ: m.dir_z });
    // Som
    const skillSounds = {
      kamehameha: 'kamehameha', aura_ssj: 'aura_ssj',
      dash_explosivo: 'swing_3', rajada_socos: 'punch_supercrit',
      slam_descendente: 'ground_hit', ultimate: 'kick_crit',
      defesa_perfeita: 'swing_1',
    };
    const sid = skillSounds[m.skill_id];
    if (sid) player.sounds?.playNow?.(sid, 0.85);
  });

  // ── XP/LEVEL UP (server-authoritative) ──
  cs.on('xp_gain', (m) => {
    if (m.player_id === auth.getUserId() && player.mesh) {
      window._dmgNumbers?.spawn(player.mesh.position, `+${m.gain} XP`, { color: '#5cf' });
    }
  });
  cs.on('level_up', (m) => {
    if (m.player_id === auth.getUserId()) {
      _showKillFeed(`🆙 LEVEL ${m.level}!`);
      // Restaura HP total visualmente (server já curou)
      player.hp = player.maxHp;
    } else {
      const rp = _remotePlayers.get(m.player_id);
      _showKillFeed(`${rp?.nickname || 'player'} → LV ${m.level}`);
    }
  });

  // ── VFX simples de skill (procedural, sem GLB) ──
  function _showSkillVFX(scene, skillId, pos, { dirX, dirZ } = {}) {
    const ps = new BABYLON.ParticleSystem(`skillvfx_${skillId}_${Date.now()}`, 200, scene);
    if (!_showSkillVFX._tex) {
      const tex = new BABYLON.DynamicTexture('skillVfxTex', { width: 32, height: 32 }, scene, false);
      const ctx = tex.getContext();
      const grd = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.5, 'rgba(160,220,255,0.7)');
      grd.addColorStop(1, 'rgba(40,80,140,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 32, 32);
      tex.update(); tex.hasAlpha = true;
      _showSkillVFX._tex = tex;
    }
    ps.particleTexture = _showSkillVFX._tex;
    const palette = {
      kamehameha:       { c1: [0.3,0.7,1.0], c2: [0.6,0.95,1.0], gravity: [0,2,0], size: [0.4,1.0], count: 350 },
      aura_ssj:         { c1: [1.0,0.85,0.2], c2: [1.0,0.55,0.05], gravity: [0,3,0], size: [0.3,0.8], count: 250 },
      dash_explosivo:   { c1: [0.95,0.45,0.05], c2: [1.0,0.85,0.2], gravity: [0,0,0], size: [0.2,0.6], count: 180 },
      rajada_socos:     { c1: [1.0,1.0,1.0], c2: [0.85,0.85,0.85], gravity: [0,0.5,0], size: [0.15,0.5], count: 220 },
      slam_descendente: { c1: [0.6,0.4,0.2], c2: [0.45,0.30,0.15], gravity: [0,-2,0], size: [0.4,0.9], count: 250 },
      ultimate:         { c1: [1.0,0.20,0.05], c2: [1.0,0.65,0.10], gravity: [0,1.5,0], size: [0.5,1.2], count: 400 },
      defesa_perfeita:  { c1: [0.4,0.85,1.0], c2: [0.85,0.95,1.0], gravity: [0,0.5,0], size: [0.2,0.5], count: 120 },
    };
    const p = palette[skillId] || palette.dash_explosivo;
    ps.emitter = pos.clone();
    ps.minEmitBox = new BABYLON.Vector3(-0.6, 0.0, -0.6);
    ps.maxEmitBox = new BABYLON.Vector3( 0.6, 1.8,  0.6);
    ps.color1 = new BABYLON.Color4(p.c1[0], p.c1[1], p.c1[2], 1);
    ps.color2 = new BABYLON.Color4(p.c2[0], p.c2[1], p.c2[2], 1);
    ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    ps.minSize = p.size[0]; ps.maxSize = p.size[1];
    ps.minLifeTime = 0.4; ps.maxLifeTime = 1.0;
    ps.gravity = new BABYLON.Vector3(...p.gravity);
    if (dirX != null && dirZ != null) {
      const nx = dirX, nz = dirZ;
      ps.direction1 = new BABYLON.Vector3(nx * 4 - 1, 0.5, nz * 4 - 1);
      ps.direction2 = new BABYLON.Vector3(nx * 8 + 1, 2.5, nz * 8 + 1);
    } else {
      ps.direction1 = new BABYLON.Vector3(-3, 1, -3);
      ps.direction2 = new BABYLON.Vector3(3, 4, 3);
    }
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.manualEmitCount = p.count;
    ps.start();
    setTimeout(() => { try { ps.stop(); } catch (e) { console.error('[skillVFX] stop:', e); } }, 80);
    setTimeout(() => { try { ps.dispose(); } catch (e) { console.error('[skillVFX] dispose:', e); } }, 1500);
  }

  // PvP toggle UI
  const pvpToggle = new PvpToggle(cs, auth);
  window._pvpToggle = pvpToggle;

  // ── HUD multiplayer (chat T / scoreboard TAB / ping / death timer) ──
  const chatHud = new ChatHud(cs, auth);
  const scoreboard = new Scoreboard(cs, auth);
  const pingDisplay = new PingDisplay(cs);
  const deathTimer = new DeathTimer(cs, auth);
  const bloodTrail = new BloodTrail(cs, player);
  const deathCam = new DeathCam(scene, cs, auth, player);
  window._chatHud = chatHud;
  window._scoreboard = scoreboard;
  window._pingDisplay = pingDisplay;
  window._deathTimer = deathTimer;
  window._bloodTrail = bloodTrail;
  window._deathCam = deathCam;

  // ── Frentes A-J: Social/Progression/Match/Boss/Quests/Friends/Party/Tutorial ──
  window._authUserId = auth.getUserId();
  const social = attachTransfpsSocial({
    cs,
    scene,
    auth,
    supa: window._supabase || window.supabase || null,
  });
  window._social = social;
  // FlowGuard: loading overlay, countdown screen, disconnect, finish rico
  // lobbyUI é declarado mais abaixo — passamos via getter pra evitar TDZ.
  const flowGuard = attachTransfpsFlowGuard({ cs, auth, getLobbyUI: () => window._lobbyUI });
  window._flowGuard = flowGuard;

  // ── BATTLE ROYALE MODE: ativo quando state.mode === 'BATTLE_ROYALE' ──
  const brMode = new BattleRoyaleMode({
    scene, cs, auth, player,
    loadingOverlay: flowGuard.loading,
  });
  window._brMode = brMode;
  // CharacterSelect3D global (auto-abre em sala BR)
  const charSelect3D = new CharacterSelect3D({
    scene, cs, auth,
    swapper: null, // setado tarde pelo CharacterSwapper init
  });
  window._charSelect3D = charSelect3D;
  // LobbyHall global (saguão 3D)
  const lobbyHall = new LobbyHall(scene, window._chibataMaps || null);
  window._lobbyHall = lobbyHall;
  // Auto-entra no saguão quando entra em sala mas match ainda não começou
  cs.on('player_add', () => {
    if (cs.state?.mode === "OPEN_WORLD") return;
    if (cs.state?.mode === 'BATTLE_ROYALE' && cs.state.br_phase === 'LOBBY' && !lobbyHall.isActive()) {
      lobbyHall.enter('spaceStation').catch(e => console.error('[LobbyHall] BR enter:', e));
    }
  });
  cs.on('lobby_reset', () => {
    try { lobbyHall.exit(); }
    catch (e) { console.error('[LobbyHall] exit on lobby_reset:', e); throw e; }
  });
  cs.on('br_takeoff', () => {
    try { lobbyHall.exit(); }
    catch (e) { console.error('[LobbyHall] exit on br_takeoff:', e); throw e; }
  });
  // Tutorial check ao receber profile
  cs.on('profile_loaded', (p) => {
    try { social.tutorial.maybeStart(p); }
    catch (e) { console.error('[Tutorial] start:', e); throw e; }
  });
  // Update loop em 5Hz pra HUDs que leem state
  let _socialT = 0;
  let _socialErrLogged = false;
  function _socialTick(dt) {
    _socialT -= dt;
    if (_socialT <= 0) {
      try { social.update(auth.getUserId()); }
      catch (e) {
        if (!_socialErrLogged) {
          console.error('[Social] update:', e);
          _socialErrLogged = true;
        }
      }
      _socialT = 0.2;
    }
  }
  window._socialTick = _socialTick;

  // DeathCam ativado quando server reporta player.dead=true
  let _lastDeadState = false;
  let _lastKillerId = null;
  cs.on('died', (m) => {
    if (m.player_id === auth.getUserId()) _lastKillerId = m.killer;
  });

  // Ping tick (2Hz)
  let _pingT = 0;
  function _pingTick(dt) {
    _pingT -= dt;
    if (_pingT <= 0 && cs.connected) {
      cs.sendPing();
      _pingT = 0.5;
    }
  }
  window._pingTick = _pingTick;

  // Hook respawn local → notifica servidor
  const _origRespawn = player.onRespawn;
  player.onRespawn = () => {
    if (_origRespawn) _origRespawn();
    if (cs.connected) cs.sendRespawn();
  };

  // ── Kill feed (canto superior direito) ──
  function _showKillFeed(text) {
    let f = document.getElementById('kill-feed');
    if (!f) {
      f = document.createElement('div');
      f.id = 'kill-feed';
      f.style.cssText = `
        position: fixed; top: 90px; right: 16px; z-index: 90;
        display: flex; flex-direction: column; gap: 5px;
        font: 700 12px 'Segoe UI', monospace;
        pointer-events: none;`;
      document.body.appendChild(f);
    }
    const item = document.createElement('div');
    item.style.cssText = `
      background: rgba(20,5,5,0.85); color: #ff7a8a;
      border: 1px solid #ff5050; border-radius: 6px;
      padding: 5px 12px; opacity: 1;
      transition: opacity 0.5s; text-shadow: 0 1px 2px black;`;
    item.textContent = text;
    f.appendChild(item);
    setTimeout(() => { item.style.opacity = '0'; }, 3000);
    setTimeout(() => { if (item.parentNode === f) f.removeChild(item); }, 3700);
  }

  const loginScreen = new LoginScreen(auth);
  window._loginScreen = loginScreen;
  // LobbyUI fica disponivel pra compat (TransfpsFlowGuard), mas NAO eh mais
  // exibida no fluxo principal — agora vai direto pra ServerListUI.
  const lobbyUI = new LobbyUI(auth, cs);
  window._lobbyUI = lobbyUI;
  const serverListUI = new ServerListUI(auth, cs);
  window._serverListUI = serverListUI;

  // Flow novo: Login → ServerList → drop direto no mundo.
  // O onContinue (single-player) foi removido — agora o botao principal
  // do LoginScreen abre direto a ServerListUI (via _onOpenLobby).
  loginScreen.onContinue(() => {
    // Fallback legacy: se algo ainda chamar onContinue, redireciona pra ServerList.
    serverListUI.show();
  });
  loginScreen.onOpenLobby(() => {
    serverListUI.show();
  });

  // onEnterGame agora dispara quando a ServerListUI confirma join na sala.
  // Mesma logica de carregar mapa + ativar input que a LobbyUI tinha.
  const _onEnterGameImpl = async (room) => {
    // ── Abre portão + espera essenciais com tolerância de 200ms ──
    // Se TIER 1 já estiver pronto (ou ficar em <200ms): entra direto, sem barra.
    // Caso contrário: BootLoadGuard aparece para esse delay extra.
    try { window._openLoadGate?.('entrar na sala'); }
    catch (e) { console.error('[Boot] openLoadGate falhou:', e); throw e; }
    try { await _awaitEssentials('entrar na sala'); }
    catch (e) { console.error('[Boot] essenciais falharam:', e); throw e; }

    // Carrega o mapa da sala (vem do state) — server-authoritative
    const mapId = cs.state?.map_id;
    if (!mapId) throw new Error('[Lobby] entrou em sala sem map_id no state');
    const loading = window._loadingOverlay;
    let mapLoaded = false;
    try {
      const isOpenWorld = cs.state?.mode === "OPEN_WORLD";
      if (isOpenWorld) {
        loading?.show('ENTRANDO', 'preparando area de spawn', true);
        loading?.setProgress(30, 'criando plano');
        _ensureOpenWorldGround(scene);
        loading?.setProgress(70, 'preparando shaders');
        await new Promise(r => scene.executeWhenReady(r));
        loading?.setProgress(100, 'pronto');
        await new Promise(r => setTimeout(r, 100));
      } else {
        loading?.show('CARREGANDO MAPA', `${mapId} · preparando assets…`, true);
        loading?.setProgress(10, 'baixando GLBs…');
        await chibataMaps.load(mapId);
        loading?.setProgress(80, 'compilando shaders…');
        // Espera REAL pelos shaders/materials da scene ficarem prontos
        // (substitui o setTimeout cosmetico que so dormia 200ms).
        await new Promise(r => scene.executeWhenReady(r));
        loading?.setProgress(100, 'pronto!');
        await new Promise(r => setTimeout(r, 150));
      }
      mapLoaded = true;
    } catch (e) {
      console.error('[Map] falhou - abortando entrada:', e);
      loading?.setDetail('erro ao carregar mapa: ' + e.message);
      await new Promise(r => setTimeout(r, 1500));
    } finally {
      loading?.hide();
    }
    if (!mapLoaded) {
      // Aborta entrada: volta pra ServerListUI
      try { window._serverListUI?.show?.(); }
      catch (e) { console.error('[ServerList] show apos map fail:', e); throw e; }
      return;
    }
    $('start-screen').style.display = 'none';
    document.body.classList.add('in-game');
    // Pointer Lock requer user-gesture. Em vez de chamar requestPointerLock automaticamente
    // (que falha com NotAllowedError porque o gesture do click ENTRAR ja expirou apos os
    // awaits do load), mostramos overlay "CLIQUE PARA JOGAR" — o click do overlay eh
    // gesture FRESCO valido pro requestPointerLock.
    _showClickToPlayOverlay(() => {
      try { window._gameInput?.activate(); } catch (e) { console.error('[Input] activate:', e); }
      try { setFocusUI(true); } catch (e) { console.error('[UI] setFocusUI:', e); }
      try { window._musicSystem?.start(); } catch (e) { console.error('[Music] start:', e); }
    });
  };

  // ── Overlay "CLIQUE PARA JOGAR" — captura gesture fresco pro Pointer Lock ──
  function _showClickToPlayOverlay(onClick) {
    let el = document.getElementById('click-to-play-overlay');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'click-to-play-overlay';
    el.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      background:radial-gradient(ellipse at center, rgba(10,15,30,0.85), rgba(0,0,0,0.95));
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; color:#fff; font-family:'Segoe UI',monospace;
      animation: ctpfadein 0.3s ease-out;
    `;
    el.innerHTML = `
      <style>
        @keyframes ctpfadein { from { opacity:0; } to { opacity:1; } }
        @keyframes ctppulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
      </style>
      <div style="text-align:center; animation: ctppulse 1.8s ease-in-out infinite;">
        <div style="font-size:5em; margin-bottom:10px;">🪂</div>
        <div style="font-size:2.4em; font-weight:900; letter-spacing:3px;
                    background:linear-gradient(180deg,#fff5cc,#ffcc00,#ff9a2c);
                    -webkit-background-clip:text;background-clip:text;color:transparent;
                    filter:drop-shadow(0 0 18px rgba(255,180,40,.6));">
          CLIQUE PARA CAIR
        </div>
        <div style="margin-top:14px; font-size:0.9em; color:#9ab; letter-spacing:2px;">
          mouse vai ser travado na tela do jogo
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('pointerdown', () => {
      el.remove();
      try { onClick && onClick(); } catch (e) { console.error('[ClickToPlay]', e); }
    }, { once: true });
  }

  // OPEN_WORLD CLEAN: plano vazio 200x200 com material liso + colisao
  function _ensureOpenWorldGround(scene) {
    let g = scene.getMeshByName("openworld_ground");
    if (g) return g;
    g = BABYLON.MeshBuilder.CreateGround("openworld_ground", { width: 200, height: 200, subdivisions: 4 }, scene);
    g.position.y = 0;
    g.checkCollisions = true;
    g.receiveShadows = true;
    const mat = new BABYLON.StandardMaterial("openworld_ground_mat", scene);
    mat.diffuseColor = new BABYLON.Color3(0.18, 0.20, 0.25);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    mat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.10);
    g.material = mat;
    console.log("[OpenWorld] plano vazio criado");
    return g;
  }
  // Plugamos AMBAS as UIs no mesmo handler — a ServerListUI eh o caminho
  // novo principal, a LobbyUI mantida pra compat com codigo legacy.
  lobbyUI.onEnterGame(_onEnterGameImpl);
  serverListUI.onEnterGame(_onEnterGameImpl);

  // ── Diretor de combate: povoa a fase com inimigos (tecla H) ───────
  const combatDirector = new CombatDirector(enemyManager, player, scene, level);
  window._combatDirector = combatDirector;

  // ── Troca de personagem (player) reusando as animações ────────────
  const charSwapper = new CharacterSwapper(player, scene, shadowGen);
  window._charSwapper = charSwapper;
  // Injeta swapper no CharSelect3D (foi criado antes)
  if (charSelect3D) charSelect3D.swapper = charSwapper;
  //  API de debug/experimento: troca o player por qualquer GLB e mostra a
  //  taxa de compatibilidade de rig (quantas anims casaram).
  window.setPlayerModel = async (url) => {
    const r = await charSwapper.swap(url);
    if (r.warning) console.warn('[setPlayerModel]', r.warning);
    return r;
  };
  // Seletor de personagem (tecla P)
  const charSelectUI = new CharacterSelectUI(charSwapper);
  window._charSelectUI = charSelectUI;

  // ── NavMesh (Recast): IA dos inimigos contorna paredes/objetos ────
  //  Inicializa depois dos colisores serem otimizados (chão/construção
  //  prontos). markDirty() do BuildMode regenera quando o mundo muda.
  const navMesh = new NavMeshManager(scene);
  window._navMesh = navMesh;
  setTimeout(() => navMesh.init(), 4000);

  // ── Hit-stop: freeze-frame de impacto nos golpes fortes ───────────
  const hitStop = new HitStop(scene, engine, player.camera);
  window._hitStop = hitStop;

  // ── Drops: inimigos soltam moedas/materiais ao morrer ─────────────
  const dropSystem = new DropSystem(scene, player);
  window._dropSystem = dropSystem;

  // ── Modo Construção (tecla B) + Máquina de Criação Meshy AI ───────
  const buildMode = new BuildMode(scene, player, level);
  window._buildMode = buildMode;
  // Limpar terreno colocado (objetos/quadros/máquinas/colisores órfãos) por código
  window.clearTerrain = () => buildMode.clearAllTerrain();
  const meshyPanel = new MeshyPanel(scene, buildMode);
  window._meshyPanel = meshyPanel;

  const assetGroupsUI = new AssetGroupsUI(buildMode);
  window._assetGroupsUI = assetGroupsUI;
  const { AssetEditorUI } = await import('./game/ui/AssetEditorUI.js');
  window._assetEditor = new AssetEditorUI();

  // Máquinas gerenciadas globalmente — restauradas do DB em _loadAssetsBackground
  window._assetMachines = [];

  // ── VAT (Baked Vertex Animation) — horda de monstros na GPU ───────
  //  Assa as animações do GLB numa textura e instancia centenas de
  //  monstros quase de graça. Teste no console:
  //    await vatHorde('monsterPlant', 100)        // assa + spawna 100
  //    vatClearHorde('monsterPlant')              // limpa as instâncias
  const { MonsterVAT } = await import('./game/animation/MonsterVAT.js');
  window._monsterVAT = new MonsterVAT(scene);
  window.vatHorde = async (key = 'monsterPlant', count = 100, opts = {}) => {
    const c = opts.center
      ? new BABYLON.Vector3(opts.center[0], opts.center[1], opts.center[2])
      : (window._gamePlayer?.mesh?.position?.clone?.() || BABYLON.Vector3.Zero());
    return window._monsterVAT.spawnHorde(key, count, { center: c, radius: opts.radius ?? 12, scale: opts.scale ?? 1, animName: opts.animName ?? null });
  };
  window.vatClearHorde = (key = 'monsterPlant') => window._monsterVAT.clearInstances(key);

  // ── Anti-lag de colisão ───────────────────────────────────────────
  //  GLBs pesados (escada, estátuas) com colisão de malha-cheia fazem o
  //  moveWithCollisions custar ~20-130ms/chamada → joga trava perto deles.
  //  Convertemos pra caixa colisora. Como os assets carregam async (Scene
  //  Editor / BuildMode / DB), varremos algumas vezes após o load.
  window._sweepColliders = () => sweepHeavyColliders(scene);
  for (const ms of [1500, 3500, 6500, 10000]) setTimeout(window._sweepColliders, ms);

  // ── Sistemas RPG: Stats + Skills + Inventário ────────────────────
  const stats = new PlayerStats();
  {
    // Nuvem primeiro (Supabase transfps.settings.data.stats); cai p/ cache local.
    let _statsData = await CloudSave.loadStats();
    if (!_statsData) {
      const _statsRaw = localStorage.getItem('digifps_stats');
      if (_statsRaw) { try { _statsData = JSON.parse(_statsRaw); } catch (e) { console.error('[Stats] cache local corrompido:', e); } }
    }
    if (_statsData) { try { stats.load(_statsData); } catch (e) { console.error('[Stats] load falhou:', e); } }
  }
  player.stats = stats;
  player.maxHp = stats.maxHp();
  player.hp = player.maxHp;

  const skills = new SkillSystem(player, scene, stats);
  player.skills = skills;

  await initItemCatalog();   // popula o catálogo (consumíveis, equips, armas)
  const inventory = new Inventory(player, stats);
  {
    // Nuvem primeiro (Supabase transfps.inventory); cai p/ cache local.
    let _invData = await CloudSave.loadInventory();
    if (!_invData) {
      const _invRaw = localStorage.getItem('digifps_inv');
      if (_invRaw) { try { _invData = JSON.parse(_invRaw); } catch (e) { console.error('[Inventory] cache local corrompido:', e); } }
    }
    if (_invData) { try { inventory.load(_invData); } catch (e) { console.error('[Inventory] load falhou:', e); } }
  }
  inventory.ensureStarterItems();   // começa com as armas no inventário
  player.inventory = inventory;
  // Kit inicial de poções
  if (!inventory.bag.length) { inventory.add('hpSmall', 3); inventory.add('mpPotion', 2); }

  // XP ao matar inimigo (hook chamado pelo EnemyManager.onDeath)
  const XP_TABLE = { rookie: 20, champion: 45, ultimate: 90, mega: 180, boss: 400 };
  player.onEnemyKilled = (enemy) => {
    const tier = enemy?.def?.tier;
    const xp = XP_TABLE[tier];
    if (xp == null) throw new Error('[XP] tier desconhecido: ' + tier);
    stats.addXp(xp);
    // chance de drop de poção, escalada pela Sorte
    if (Math.random() < 0.35 * stats.lootMult()) inventory.add('hpSmall', 1);
    // Avisa o diretor → escala a onda (mais inimigos / tiers mais fortes)
    combatDirector.notifyKill();
    // Solta drops (moedas + materiais) na posição do inimigo
    const dpos = enemy?.root?.getAbsolutePosition?.() || enemy?.root?.position;
    if (dpos) dropSystem.spawnFromEnemy(dpos, enemy?.def);
  };

  const rpgHUD = new RpgHUD(player, stats, skills, inventory);
  window._rpgHUD = rpgHUD;
  window._gameStats = stats;
  window._gameInventory = inventory;

  // ── Sistema de sons (silencioso enquanto não há arquivos de áudio) ─
  player.sounds = new SoundManager(scene);

  // ── Asset loader (GLBs) ──────────────────────────────────────────
  const loader = new AssetLoader(scene, shadowGen);
  player.assetLoader = loader;

  // ── Pointer lock solto → abre PAUSE OVERLAY (não engine mode) ──
  // ESC libera o pointer lock automaticamente. Aqui pegamos isso pra mostrar
  // o overlay de pausa com botoes (Voltar ao Jogo / Voltar ao Menu).
  input.onDeactivated = () => {
    if (window._gamePlayer?._dead) return;   // morto → tela de morte
    if (_engineMode) return;                 // ja em engine mode
    if ($('start-screen').style.display !== 'none') return;
    // ferramenta/menu aberto (Biblioteca, modo colocar) → não pausa por cima
    if (window._assetGroupsUI?._visible) return;
    if (window._buildMode && window._buildMode._state !== 'inactive') return;
    _showGamePause();
  };

  // ── F9: abre ENGINE MODE (antes era ESC, agora atalho separado) ──
  window.addEventListener('keydown', e => {
    if (e.code === 'F9' && !e.repeat && $('start-screen').style.display === 'none') {
      e.preventDefault();
      if (!_engineMode) window.enterEngineMode('scene');
      else window.exitEngineMode();
    }
    // F6 → Animator · F7 → Debug de Monstros (acesso direto, sem depender do pause)
    if (e.code === 'F6' && !e.repeat && $('start-screen').style.display === 'none') {
      e.preventDefault();
      animatorMode?.active ? window.closeAnimator() : window.openAnimator();
    }
    if (e.code === 'F7' && !e.repeat && $('start-screen').style.display === 'none') {
      e.preventDefault();
      monsterDebugMode?.active ? window.closeMonsterDebug() : window.openMonsterDebug('monsterPlant');
    }
    // ESC: pause / engine mode handling
    if (e.code === 'Escape' && !e.repeat) {
      if ($('start-screen').style.display !== 'none') return; // jogo nao iniciado
      // ferramentas de debug abertas → ESC FECHA elas
      if (animatorMode?.active)     { window.closeAnimator?.();     return; }
      if (monsterDebugMode?.active) { window.closeMonsterDebug?.(); return; }
      if (_engineMode) {
        // ESC em engine mode = volta pro jogo
        e.preventDefault();
        window.exitEngineMode();
        window._gameInput?.activate();
        setFocusUI(true);
        return;
      }
      const ov = $('pause-overlay');
      if (ov?.classList.contains('visible')) {
        e.preventDefault();
        _resumeFromPause();
      }
      // Se nao tem pause aberto, deixa o browser liberar pointer lock
      // → input.onDeactivated dispara → _showGamePause()
    }
  });

  // Helpers de pause real (overlay com botões)
  function _showGamePause() {
    const ov = $('pause-overlay');
    if (!ov) return;
    ov.classList.add('visible');
    // NÃO injeta mais a 2ª caixa de pause (duplicava por cima do overlay
    //  original do index.html, que já tem todas as opções). Em vez disso,
    //  o "Voltar ao Menu" foi enxertado no overlay original (window._leaveToMenu).
  }
  function _resumeFromPause() {
    const ov = $('pause-overlay');
    if (!ov) return;
    ov.classList.remove('visible');
    window._gameInput?.activate();
    setFocusUI(true);
  }
  function _injectPauseMenuButtons() {
    const ov = $('pause-overlay');
    if (!ov) return;
    if (ov.querySelector('#pause-resume-btn')) return; // ja injetado
    // Cria container minimal SE o overlay nao tem botoes propios
    const wrap = document.createElement('div');
    wrap.id = 'pause-menu-wrap';
    wrap.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      display:flex; flex-direction:column; gap:14px; align-items:center;
      font-family:'Segoe UI',monospace; color:#fff; z-index:10;
      background:rgba(10,16,30,0.92); padding:30px 50px; border-radius:14px;
      border:1px solid rgba(126,239,196,0.3); box-shadow:0 0 40px rgba(0,0,0,0.6);
      min-width:280px;
    `;
    wrap.innerHTML = `
      <div style="font:900 26px 'Segoe UI',monospace; letter-spacing:6px; color:#2effb6;
                  text-shadow:0 0 12px #2effb6; margin-bottom:6px;">⏸ PAUSADO</div>
      <button id="pause-resume-btn" style="
        background:#2effb6; color:#04101a; border:0; padding:14px 36px;
        font:900 14px monospace; letter-spacing:3px; cursor:pointer; border-radius:6px;
        min-width:240px;">▶ VOLTAR AO JOGO</button>
      <button id="pause-leave-btn" style="
        background:transparent; color:#ff7a8a; border:1px solid #ff5a5a;
        padding:11px 28px; font:800 12px monospace; letter-spacing:2px; cursor:pointer;
        border-radius:6px; min-width:240px;">✕ VOLTAR AO MENU</button>
      <div style="opacity:0.5; font:600 10px monospace; margin-top:6px;">ESC para retomar · F9 para Engine Mode</div>
    `;
    ov.appendChild(wrap);
    wrap.querySelector('#pause-resume-btn').onclick = () => _resumeFromPause();
    wrap.querySelector('#pause-leave-btn').onclick = () => _confirmLeaveToMenu();
  }
  window._leaveToMenu = _confirmLeaveToMenu;   // botão "Voltar ao Menu" do pause original
  function _confirmLeaveToMenu() {
    // Modal de confirmação inline (sem confirm() nativo)
    if (document.getElementById('confirm-leave-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'confirm-leave-modal';
    modal.style.cssText = `
      position:fixed; inset:0; z-index:1000;
      background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;
      font-family:'Segoe UI',monospace; color:#fff;
    `;
    const inMatch = !!(window._cs?.room && window._cs?.state?.match_state === 'RUNNING');
    modal.innerHTML = `
      <div style="background:linear-gradient(180deg,#1a0a0a,#0a0408);
                  border:2px solid #ff5a5a; border-radius:12px; padding:28px 40px;
                  text-align:center; min-width:340px; box-shadow:0 0 40px #ff5a5a;">
        <div style="font:900 22px monospace; letter-spacing:3px; color:#ff5a5a;
                    text-shadow:0 0 10px #ff5a5a; margin-bottom:10px;">⚠ ABANDONAR ?</div>
        <div style="font:600 13px monospace; opacity:0.85; margin-bottom:20px; max-width:300px;">
          ${inMatch
            ? 'Você está em uma partida ativa. Sair vai te marcar como derrotado.'
            : 'Você vai sair da sala e voltar ao menu principal.'}
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="cl-yes" style="background:#ff5a5a; color:#fff; border:0;
                  padding:11px 24px; font:800 12px monospace; letter-spacing:2px;
                  cursor:pointer; border-radius:5px;">SIM, SAIR</button>
          <button id="cl-no" style="background:transparent; color:#fff;
                  border:1px solid rgba(255,255,255,0.3); padding:11px 24px;
                  font:800 12px monospace; letter-spacing:2px; cursor:pointer;
                  border-radius:5px;">CANCELAR</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#cl-no').onclick = () => modal.remove();
    modal.querySelector('#cl-yes').onclick = async () => {
      modal.remove();

      // ── [Nav] Sair da partida → cleanup TOTAL + route por auth ──
      const auth = window._auth;
      if (!auth) {
        console.error('[Nav] _confirmLeaveToMenu: window._auth ausente — abortando rota');
        return;
      }
      console.log('[Nav] saindo da partida → menu');

      // 1) Desativa input do jogo (libera pointer lock, gameActive=false)
      try { window._gameInput?.deactivate?.(); }
      catch (e) { console.error('[Nav] falha ao desativar input:', e); return; }

      // 2) Para musica de partida
      try { window._musicSystem?.stop?.(); }
      catch (e) { console.error('[Nav] falha ao parar musica:', e); return; }

      // 3) Sai da sala e do lobby colyseus (cs.on('close') ja limpa Remote*)
      try { await window._cs?.leave?.(); }
      catch (e) { console.error('[MP] falha ao sair da sala:', e); return; }
      try { await window._cs?.leaveLobby?.(); }
      catch (e) { console.error('[MP] falha ao sair do lobby:', e); return; }

      // 4) Esconde TUDO que pertence ao jogo rodando
      $('pause-overlay')?.classList.remove('visible');
      const startScreen = $('start-screen'); if (startScreen) startScreen.style.display = 'none';
      document.getElementById('kill-feed')?.remove();
      document.getElementById('match-finish-rich')?.remove();
      try { window._chatHud?.hide?.(); } catch (_) {}
      try { window._scoreboard?.hide?.(); } catch (_) {}
      try { window._rpgHUD?.hide?.(); } catch (_) {}
      try { window._pingDisplay?.hide?.(); } catch (_) {}
      try { window._catalogUI?.hide?.(); } catch (_) {}
      try { window._mapSelectUI?.hide?.(); } catch (_) {}
      // Remove flag de "jogo ativo" sem reabrir pause-overlay
      document.body.classList.remove('game-active');
      document.body.classList.remove('in-game');

      // 5) Routing por estado de auth
      const logged = auth.isAuthenticated?.() && !auth.isGuest?.();
      if (logged) {
        console.log('[Nav] entrou no ServerListUI (logado)');
        try { window._serverListUI?.show?.(); }
        catch (e) { console.error('[ServerList] falha ao mostrar:', e); return; }
      } else {
        console.log('[Nav] entrou no LoginScreen (nao-logado)');
        try { window._loginScreen?.show?.(); }
        catch (e) { console.error('[Auth] falha ao mostrar LoginScreen:', e); return; }
      }
    };
  }

  // ── Game loop ────────────────────────────────────────────────────
  engine.runRenderLoop(() => {
    if (monsterDebugMode && monsterDebugMode.active) {
      monsterDebugMode.render();
      return;
    }

    if (animatorMode && animatorMode.active) {
      animatorMode.render();
      return;
    }

    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);

    // Engine mode: cena renderiza mas lógica congela (editor ativo)
    if (_engineMode) {
      hud.update();
      scene.render();
      return;
    }

    // BuildMode pré-consome mouse delta se R/Q segurado (antes do player olhar)
    buildMode.preUpdate(input);

    // Hit-stop: congela a lógica/animações/física por alguns frames no impacto.
    const frozen = hitStop.update(dt);

    // Só atualiza lógica quando o jogo está ativo (pointer lock = focado)
    if (frozen) {
      // congelado → não atualiza lógica (a cena fica na pose do impacto)
    } else if (input.gameActive) {
      player.update(dt);
      level.update(dt);
      stats.update(dt);
      // Skills NÃO disparam enquanto posiciona asset (Q/R são p/ escala/rotação)
      if (buildMode._state !== 'placing') skills.update(dt, input);
    } else if (player._dead) {
      // MORTO com cursor livre → continua a queda/animação + câmera seguindo.
      player.update(dt);
      level.update(dt);
    } else if (catalogUI._visible) {
      // Catálogo aberto: cursor livre, mas inimigos/cena continuam vivos para teste
      level.update(dt);
    }
    // Todas as AssetMachines no mapa — animação e interação
    if (window._assetMachines) window._assetMachines.forEach(m => m.update(dt));
    moveListUI.update(dt);
    catalogUI.update();
    mapSelectUI.update(input);
    bloodFX.update(dt);
    waterSystem.update(dt, player);
    settingsUI.update(input);
    musicMuteBtn.update(input);
    // ── MP Colyseus: envia input + atualiza players/mobs/drops/props remotos ──
    if (cs.connected) {
      cs.sendInput(player);
      _pingTick(dt);
      _socialTick(dt);
      try { brMode.update(dt, window._gameInput); }
      catch (e) {
        if (!window.__brErrLogged) {
          console.error('[BR] update:', e);
          window.__brErrLogged = true;
        }
      }
      for (const rp of _remotePlayers.values()) rp.update(dt, player.camera);
      for (const m of _remoteMobs.values()) m.update(dt, player.camera);
      // Drops: anima + auto-pickup quando player chega perto
      const playerPos = player.mesh?.position;
      for (const d of _remoteDrops.values()) {
        d.update(dt);
        if (!d._requested && playerPos && d.distanceTo(playerPos) < 1.6) {
          d._requested = true; // evita spam de requests
          cs.sendPickup(d.id);
        }
      }
    }
    // HUD multiplayer: atualiza sempre (try/catch isolado pra um erro nao travar renderloop)
    try { pingDisplay.update(); } catch (e) { console.error('[HUD] pingDisplay:', e); }
    try { deathTimer.update(); } catch (e) { console.error('[HUD] deathTimer:', e); }
    // Blood trail (auto sangue ao chão quando ferido)
    try { bloodTrail.update(dt); } catch (e) { console.error('[HUD] bloodTrail:', e); }
    // Death cam ring buffer + ativação/desativação
    try { deathCam.push(player); } catch (e) { console.error('[HUD] deathCam:', e); }
    if (cs.connected && cs.state && cs.state.players && typeof cs.state.players.get === 'function') {
      const me = cs.state.players.get(auth.getUserId());
      const isDead = !!me?.dead;
      if (isDead && !_lastDeadState) {
        deathCam.enter(_lastKillerId);
      } else if (!isDead && _lastDeadState) {
        deathCam.exit();
        _lastKillerId = null;
      }
      _lastDeadState = isDead;
    }
    deathCam.update(dt);
    if (_localAura) _localAura.update(dt);
    pvpToggle.update(input);
    combatDirector.update(dt, input, input.gameActive && !catalogUI._visible && !buildMode._active);
    navMesh.update(dt);
    dropSystem.update(dt, player.mesh?.position);
    dayNight.update(dt);
    window._updateShadowFrustum?.();   // frustum da sombra segue o player
    gfxPanel.update();
    // F10 → entra/sai da arena de teste de sombras (F9 = engine mode do Lucas)
    const f10 = input.isDown('F10');
    if (f10 && !window._wasF10) testArena.toggle();
    window._wasF10 = f10;
    charSelectUI.update();
    buildMode.update();
    rpgHUD.update(dt);
    hud.update();
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());

  // Expõe globals
  window._gameInput  = input;
  window._gamePlayer = player;
  window._gameLoader = loader;
  window._gameLevel  = level;

  // Debug de colliders (tecla L)
  const colliderDebug = new ColliderDebug(scene);
  window._colliderDebug = colliderDebug;

  // Gerador de miniaturas dos assets
  window._thumbnailGen = new ThumbnailGen(scene);

  // ── Tecla J: fallback para abrir a Máquina de Criação de qualquer lugar ──
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyJ' && $('start-screen').style.display === 'none' && !e.repeat) {
      meshyPanel.toggle();
    }
    // L → liga/desliga visualização dos colliders
    if (e.code === 'KeyL' && !e.repeat && $('start-screen').style.display === 'none') {
      colliderDebug.toggle();
    }
  });

  // Nota: clique LMB no build mode é tratado via buildMode.preUpdate()
  // (que consome o click antes do player para não atirar)

  // ── Carrega assets em background (após o jogo já estar jogável) ──
  _loadAssetsBackground(loader, player, level, shadowGen, scene);

  // ── Login screen aparece após boot ──
  //  Esconde a start-screen padrão e mostra LoginScreen.
  //  Se já logado e tem ?room=UUID na URL, vai direto pra sala.
  setTimeout(async () => {
    const ss = $('start-screen');
    if (ss) ss.style.display = 'none';
    // Se já logado e tem invite link, auto-entra na sala
    if (window._auth.isAuthenticated() && !window._auth.isGuest()) {
      const joined = await window._lobbyUI.checkInviteLink();
      if (joined) return; // checkInviteLink mostra o lobby
    }
    window._loginScreen.show();
  }, 100);
}

// ── Restaura máquinas de criação salvas no DB ─────────────────────
// AssetMachine é feature de DEV (pipeline Meshy precisa do config-server
// rodando em 127.0.0.1:3099 pra proxy-image e GLB). Em PROD não tem
// servidor local → nenhuma máquina deve spawnar.
async function _restoreMachines(scene) {
  if (LocalDB.isProd()) {
    console.info('[machines] prod detectado — AssetMachine desabilitada (feature dev-only)');
    return;
  }
  const meshyPanel = window._meshyPanel;
  const player     = window._gamePlayer;
  const input      = window._gameInput;
  let machines = await LocalDB.get('machines_placed', []);
  if (!machines.length) {
    machines = [{ id: 'mac_default', position: [8, 0, 8] }];
    await LocalDB.save('machines_placed', machines);
  }
  for (const m of machines) {
    new AssetMachine(
      scene, meshyPanel, player, input,
      new BABYLON.Vector3(m.position[0], m.position[1], m.position[2]),
      m.id,
    );
  }
}

// ── Carregamento progressivo de assets ───────────────────────────
async function _loadAssetsBackground(loader, player, level, shadowGen, scene) {
  const queue = [
    // Armas de fogo principais
    { key: 'pistol', done: ms => {
        player.weapon.setGLBWeapon(ms, 'pistol');
        player.attachCurrentWeaponToAnimator();
      }, label: 'Pistola…' },
    { key: 'rifle',  done: ms => {
        player.weapon.setGLBWeapon(ms, 'rifle');
        player.attachCurrentWeaponToAnimator();
      }, label: 'Rifle…' },
    // ── Espadas (Forgotten Insanity PBR) ──
    { key: 'sword_paladin', done: ms => {
        player.weapon.setGLBWeapon(ms, 'sword_paladin');
      }, label: 'Longsword Paladino…' },
    { key: 'sword_zweihander', done: ms => {
        player.weapon.setGLBWeapon(ms, 'sword_zweihander');
      }, label: 'Zweihander…' },
    // ── Chibata (procedural — sem GLB externo) ──
    { key: '_procedural_chibata', done: async () => {
        const { Chibata } = await import('./game/weapons/Chibata.js');
        const result = Chibata.buildMesh(scene);
        player.weapon.setGLBWeapon(result.meshes, 'chibata');
      }, label: 'Chibata 🐭…' },
    
    // ── Props/decoração automáticos DESATIVADOS ──────────────────────
    //  Antes nasciam espalhados (pequenos) no boot. Removidos da cena pra
    //  começar LIMPO. Continuam na Biblioteca de Assets (categoria decor)
    //  pra colocar manualmente quando quiser. Reativar = descomentar.
    // { key: 'crate',        done: ms => level.replaceObstacles('crate', ms),       label: 'Caixotes…' },
    // { key: 'ammoBox',      done: ms => level.replaceObstacles('ammoBox', ms),     label: 'Caixas de munição…' },
    // { key: 'medkit',       done: ms => level.spawnPickups('medkit', ms),          label: 'Medkits…' },
    // { key: 'neonSign',     done: ms => level.placeDecor('neonSign', ms),          label: 'Placas neon…' },
    // { key: 'mushrooms',    done: ms => level.placeDecor('mushrooms', ms),         label: 'Cogumelos…' },
    // { key: 'crystals',     done: ms => level.placeDecor('crystals', ms),          label: 'Cristais…' },
    // { key: 'industrial',   done: ms => level.placeDecor('industrial', ms),        label: 'Pack industrial…' },
    // { key: 'sciTube',      done: ms => level.placeDecor('sciTube', ms),           label: 'Tubos científicos…' },
    // { key: 'crystalAltar', done: ms => level.placeDecor('crystalAltar', ms),      label: 'Altar de cristal…' },
    // { key: 'obelisk',      done: ms => level.placeDecor('obelisk', ms),           label: 'Obeliscos rúnicos…' },
    // { key: 'gargoyle',     done: ms => level.placeDecor('gargoyle', ms),          label: 'Fontes gargoyle…' },
    // { key: 'runicHare',    done: ms => level.placeDecor('runicHare', ms),         label: 'Lebres rúnicas…' },

    // Novo Sistema de Animação (Extração Dinâmica)
    { key: 'playerUnarmed', done: async (ms) => {
        const p = player;
        
        // 1. Inicializa Sistemas de Combate e Animação
        p.animLib      = new AnimationLibrary(scene);
        p.animCtrl     = new AnimationController(p.animLib);
        p.layered      = new LayeredAnimator(p.animLib, scene);   // upper/lower split
        p.stateMachine = new PlayerStateMachine();
        // Conecta WeaponSystem ao stateMachine para sincronizar 'sword' vs 'armed'
        if (p.weapon) p.weapon._stateMachine = p.stateMachine;
        p.comboSystem  = new ComboSystem();
        p.impactSystem = new ImpactEffectSystem(scene);
        p.combatSystem = new CombatSystem(p.animCtrl, p.stateMachine, p.comboSystem, p.impactSystem, p.mesh);
        const { DamageNumbers } = await import('./game/combat/DamageNumbers.js');
        window._dmgNumbers = new DamageNumbers(scene);
        
        // Jogador começa com arma na mão
        p.stateMachine.equipWeapon();

        const root = ms[0]; // Personagem sem animação
        
        // 2. Extrai todas as animações de todas as categorias do novo MOVESETS
        const allAnims = [];
        Object.entries(MOVESETS).forEach(([category, anims]) => {
          Object.entries(anims).forEach(([name, path]) => {
            if (typeof path === 'string') {
              allAnims.push({ name, path });
            }
          });
        });
        
        // Carrega todas as animações em paralelo (antes: sequential ~10s → agora: ~1-2s)
        await Promise.all(
          allAnims.map(a =>
            p.animLib.loadExternalAnimations(a.path, a.name, root)
              .catch(e => console.error(`[anim] Falha ao absorver [${a.name}] (${a.path}):`, e))
          )
        );
        

        // ── Pós-processamento (sem Blender) ────────────────────────
        //  aim_charge: tem root motion (corre pra frente) → travar XZ
        //  aim_hold:   gira (3.7s) → trim p/ o 1º trecho parado
        p.animLib.configureAll({
          aim_charge: { stripRootXZ: true },
          aim_hold:   { stripRootXZ: true, trimStart: 0, trimEnd: 0.22 },
          // outras locomoções armadas também ficam in-place
          aim_run:    { stripRootXZ: true },
          aim_walk:   { stripRootXZ: true },
          aim_walk_back: { stripRootXZ: true },
          aim_shoot:  { stripRootXZ: true },
        });

        p.animLib.list();

        // Aplica o novo mesh ao player
        p.setMouseCharacter(ms, [], shadowGen);
      }, label: 'Combo Violento…' },

    // { key: 'stoneBlock',   done: ms => level.placeDecor('stoneBlock', ms),        label: 'Pedras místicas…' },  (desativado: começa limpo)
    // Criaturas decorativas
    { key: 'monsterPlant', done: ms => level.spawnEnemyPlants(ms),                 label: 'Plantas monstro…' },
    // 'cockatrice' removido — asset externo (Sketchfab) que não faz parte do jogo.
    // O personagem agora é carregado via 'playerUnarmed' acima para suportar o novo sistema de combate.
  ];

  // ── Boot tiered: essenciais bloqueiam UI, resto roda em background ──
  // TIER 1 (bloqueante): playerUnarmed (sistema de combate/anim) + pistol (arma default).
  // Sem isso o player nem aparece — então UI fica trancada.
  // TIER 2 (background paralelo): resto das armas, props, decoração.
  // UI desbloqueia em ~35% e o usuário pode jogar enquanto carrega.
  const ESSENTIAL_KEYS = new Set(['playerUnarmed', 'pistol']);
  const essentials = queue.filter(it => ESSENTIAL_KEYS.has(it.key));
  const background = queue.filter(it => !ESSENTIAL_KEYS.has(it.key));

  // Loader helper
  const loadOne = async (item, onProgress) => {
    if (item.key.startsWith('_procedural_')) {
      try { await item.done(); }
      catch (e) {
        console.error('[proc]', item.key, e);
        if (ESSENTIAL_KEYS.has(item.key)) throw e;
      }
      return;
    }
    const meshes = await loader.load(item.key);
    if (meshes) {
      try { await item.done(meshes); }
      catch (e) {
        console.error('[done]', item.key, e);
        if (ESSENTIAL_KEYS.has(item.key)) throw e;
      }
    }
    onProgress?.();
  };

  // TIER 1: sequencial (deps internas)
  let essentialDone = 0;
  for (const item of essentials) {
    setLoadingUI(Math.round((essentialDone / essentials.length) * 35), item.label);
    await loadOne(item);
    essentialDone++;
  }
  setLoadingUI(40, 'pronto pra jogar — carregando extras…');

  // ── TIER 1 concluído: libera startGame/lobby para entrar SEM esperar ──
  try { _essentialReadyResolve?.(); }
  catch (e) { console.error('[Boot] essentialReadyResolve:', e); throw e; }
  // Se o usuário já abriu o portão (clicou JOGAR antes de TIER1 terminar),
  // o BootLoadGuard existe — fecha ele agora. Caso contrário, fica null.
  try { _bootGuard?.done(); }
  catch (e) { console.error('[BootGuard] done apos TIER1:', e); throw e; }

  // TIER 2: paralelo em background. Atualiza barra mas não bloqueia.
  let bgDone = 0;
  const bgTotal = background.length;
  // Promise.all não-awaited — roda em segundo plano
  Promise.all(background.map(item =>
    loadOne(item, () => {
      bgDone++;
      const pct = 40 + Math.round((bgDone / bgTotal) * 60);
      setLoadingUI(pct, item.label);
    }).catch(e => console.error('[bg]', item.key, e))
  )).then(async () => {
    await _restoreMachines(scene);
    setLoadingUI(100);
    // Aplica transforms salvos do SceneEditor sobre os GLBs recém carregados
    window._sceneEditor?.applyAllSaved();

    // Sombras: garante que TODA superfície (chão, paredes, plataformas) receba
    //  a sombra do sol — corrige luzes FX consumindo slots e maxLights baixo.
    // gfx mora no escopo do initGame; aqui (background) usa-se window._gfx.
    try { window._gfx?.fixSceneShadows(); } catch (_) {}
    setTimeout(() => { try { window._gfx?.fixSceneShadows(); } catch (_) {} }, 400);

    // Realismo extra: IBL (reflexões/ambiente HDR) + SSR (reflexo em tempo real)
    try { window._gfx?.enableRealism(); } catch (e) { console.warn('[GFX] realism:', e); }

    // POR ÚLTIMO: garante a arma na mão. Roda DEPOIS do applyAllSaved (que
    //  podia jogar o viewmodel no chão ao casar nome genérico __root__).
    try { player._updateWeaponVisibility?.(); } catch (_) {}
    setTimeout(() => { try { player._updateWeaponVisibility?.(); } catch (_) {} }, 300);
  });
}

// ════════════════════════════════════════════════════════════════
//  Funções globais (chamadas pelo HTML)
// ════════════════════════════════════════════════════════════════
window.startGame = async function () {
  // Abre o portão e espera essenciais com tolerância de 200ms.
  // Se TIER 1 terminar dentro de 200ms → entra DIRETO, zero barra.
  // Se demorar mais → BootLoadGuard aparece nesse momento e fecha sozinho.
  try { window._openLoadGate?.('jogar'); }
  catch (e) { console.error('[startGame] openLoadGate falhou:', e); throw e; }
  try { await _awaitEssentials('jogar'); }
  catch (e) { console.error('[startGame] boot falhou:', e); throw e; }

  $('start-screen').style.display = 'none';
  document.body.classList.add('in-game');
  // Sai do engine mode caso esteja ativo
  if (_engineMode) window.exitEngineMode();
  window._gameInput?.activate();
  setFocusUI(true);
  // ── INICIA A MÚSICA agora (clique do usuário libera autoplay) ──
  window._musicSystem?.start();
};

window.toggleFocus = function () {
  // Se estamos no engine mode, "Voltar ao Jogo" = sair do engine mode
  if (_engineMode) {
    window.exitEngineMode();
    window._gameInput?.activate();
    return;
  }
  // GUARDA: se o jogo NAO foi iniciado (start-screen visivel, login screen
  // visivel ou lobby visivel), o botao Pausar e no-op. Nao ativa pointer lock.
  const ss        = $('start-screen');
  const loginVis  = !!(window._loginScreen?._visible);
  const lobbyVis  = !!(window._lobbyUI?._visible);
  const inGame    = document.body.classList.contains('in-game');
  if (!inGame || (ss && ss.style.display !== 'none') || loginVis || lobbyVis) {
    return;
  }
  const inp = window._gameInput;
  if (!inp) return;
  inp.toggle();
  setFocusUI(inp.gameActive);
};

window.openAnimator = async function() {
    if (!animatorMode) return;
    window._gameInput?.deactivate();
    setFocusUI(false);
    $('pause-overlay').classList.remove('visible');
    await animatorMode.enter();
};

window.closeAnimator = function() {
    if (!animatorMode) return;
    animatorMode.exit();
    setFocusUI(false);
    $('pause-overlay').classList.add('visible');
};

window.openMonsterDebug = async function(monsterKey = 'monsterPlant') {
    if (!monsterDebugMode) return;
    window._gameInput?.deactivate();
    setFocusUI(false);
    $('pause-overlay').classList.remove('visible');
    await monsterDebugMode.enter(monsterKey);
    // O render loop principal já checa monsterDebugMode.active
};

window.closeMonsterDebug = function() {
    if (!monsterDebugMode) return;
    monsterDebugMode.exit();
    setFocusUI(false);
    $('pause-overlay').classList.add('visible');
    _engineRef?.resize();
};

// Event listener para o botão do animador
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('animator-mode-btn');
    if (btn) btn.onclick = () => window.openAnimator();
});

// ── Start ────────────────────────────────────────────────────────
init().catch(err => {
  console.error('Erro ao iniciar TransFPS:', err);
  $('start-screen').innerHTML =
    `<h1 style="color:#f55">Erro 🐭</h1>
     <pre style="color:#fff;max-width:600px;white-space:pre-wrap;font-size:12px">${err.message}\n${err.stack}</pre>`;
});
