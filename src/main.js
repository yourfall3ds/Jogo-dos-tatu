// ─────────────────────────────────────────────────────────────────
//  main.js — TransFPS
// ─────────────────────────────────────────────────────────────────
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
import { WaterSystem }         from './game/scene/WaterSystem.js';
import { SkillMapExtras }      from './game/scene/SkillMapExtras.js';
import { SettingsUI }          from './game/ui/SettingsUI.js';
import { MusicSystem }         from './game/audio/MusicSystem.js';
import { MusicMuteButton }     from './game/ui/MusicMuteButton.js';
import { AuthSystem }          from './game/auth/AuthSystem.js';
import { LoginScreen }         from './game/ui/LoginScreen.js';
import { LobbyUI }             from './game/ui/LobbyUI.js';
import { ColyseusClient }      from './game/multiplayer/ColyseusClient.js';
import { RemotePlayer }        from './game/multiplayer/RemotePlayer.js';
import { RemoteMob }           from './game/multiplayer/RemoteMob.js';
import { RemoteDrop }          from './game/multiplayer/RemoteDrop.js';
import { RemoteProp }          from './game/multiplayer/RemoteProp.js';
import { RemoteFx }            from './game/multiplayer/RemoteFx.js';
import { ChatHud, Scoreboard, PingDisplay, DeathTimer } from './game/ui/IngameHud.js';
import { attachTransfpsSocial } from './game/ui/TransfpsSocial.js';
import { BloodTrail }          from './game/combat/BloodTrail.js';
import { DeathCam }            from './game/multiplayer/DeathCam.js';
import { PvpToggle }           from './game/ui/PvpToggle.js';
import { LocalAura }           from './game/combat/LocalAura.js';
import { getConfig }           from './game/auth/SupabaseClient.js';

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

function setLoadingUI(pct, label = '') {
  const wrap = $('loading-bar-wrap');
  const bar  = $('loading-bar');
  const lbl  = $('loading-label');

  // ── Tela de entrada: barra grande + botão JOGAR refletindo o loading ──
  const sFill = $('ss-load-fill'), sLbl = $('ss-load-label'), sPct = $('ss-load-pct');
  const play  = $('ss-play'), pbFill = $('ss-play-fill'), pbText = $('ss-play-text');
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (pct >= 100) _loadReachedFull = true;

  // ── Start screen (só relevante até ficar pronto) ──────────────────
  // O loading tem VÁRIAS fases (assets → animações → máquinas) e o pct não
  // é monotônico. Uma vez 100%, o botão JOGAR fica liberado pra sempre.
  if (!_loadReachedFull) {
    if (sFill) sFill.style.width = p + '%';
    if (sPct)  sPct.textContent  = p + '%';
    if (sLbl && label) sLbl.textContent = '📦 ' + label;
    if (pbFill) pbFill.style.width = p + '%';
    if (pbText) pbText.textContent = '⏳ Carregando ' + p + '%';
  } else if (pct >= 100 || !play?.classList.contains('ready')) {
    // primeira vez que cruza 100% → libera e limpa o botão
    if (sFill) sFill.style.width = '100%';
    if (sPct)  sPct.textContent  = '100%';
    if (sLbl)  sLbl.textContent  = '✅ Tudo pronto!';
    if (play)  { play.disabled = false; play.classList.remove('loading'); play.classList.add('ready'); }
    if (pbFill) pbFill.style.width = '0%';
    if (pbText) pbText.textContent = '▶ JOGAR';
  }

  // ── Barra inferior (loading in-game das fases seguintes) ──────────
  if (pct >= 100) {
    wrap.classList.remove('visible');
    lbl.classList.remove('visible');
  } else {
    wrap.classList.add('visible');
    lbl.classList.add('visible');
    bar.style.width  = pct + '%';
    lbl.textContent  = label;
  }
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  const canvas = $('renderCanvas');

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true,
  });
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

  // ── Sombras do sol (Blur ESM — comprovado no exemplo oficial) ────
  //  Frustum ortográfico APERTADO (40u) → resolução alta de sombra perto do
  //  player. Sem isso, os ~80 casters espalhados pelo mapa explodiam o
  //  auto-frustum e a sombra sumia (virava pixels invisíveis no shadow map).
  //  O frustum SEGUE o player (atualizado no loop) pra cobrir onde ele está.
  sun.position = new BABYLON.Vector3(40, 100, 40);
  sun.autoUpdateExtends = false;
  sun.shadowMinZ = 1; sun.shadowMaxZ = 200;
  sun.orthoLeft = -40; sun.orthoRight = 40;
  sun.orthoTop = 40;   sun.orthoBottom = -40;
  // Frustum SEGUE o player: a luz se reposiciona acima dele mantendo a
  //  direção do sol → sombra sempre nítida onde o jogador está.
  window._updateShadowFrustum = () => {
    const pp = window._gamePlayer?.mesh?.position; if (!pp) return;
    const dir = sun.direction;   // direção do sol (muda com a hora)
    sun.position.set(pp.x - dir.x * 60, pp.y - dir.y * 60, pp.z - dir.z * 60);
  };

  const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.useKernelBlur = true;
  shadowGen.blurKernel = 32;
  shadowGen.setDarkness(0.3);   // mais escura (0=preto, 1=sem sombra)
  window._shadowGen = shadowGen;

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
  const level  = new Level(scene, shadowGen);
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

  // Arena de teste limpa (sombras) — window.arena() ou tecla F9
  const testArena = new TestArena(scene, player, shadowGen);
  window._testArena = testArena;
  window.arena = () => { testArena.toggle(); return testArena.active ? 'na arena' : 'voltou'; };
  window._wasF9 = false;

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
  try { await auth.init(); } catch (e) { console.warn('[Auth] init falhou:', e.message); }
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
    console.log(`[CS] +remote ${state.nickname}`);
  });
  cs.on('player_remove', ({ id }) => {
    const rp = _remotePlayers.get(id);
    if (rp) { rp.dispose(); _remotePlayers.delete(id); }
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
    setTimeout(() => { try { ps.stop(); } catch (_) {} }, 80);
    setTimeout(() => { try { ps.dispose(); } catch (_) {} }, 1500);
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
  // Tutorial check ao receber profile
  cs.on('profile_loaded', (p) => {
    try { social.tutorial.maybeStart(p); } catch (_) {}
  });
  // Update loop em 5Hz pra HUDs que leem state
  let _socialT = 0;
  function _socialTick(dt) {
    _socialT -= dt;
    if (_socialT <= 0) {
      try { social.update(auth.getUserId()); } catch (_) {}
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
    setTimeout(() => { try { f.removeChild(item); } catch (_) {} }, 3700);
  }

  const loginScreen = new LoginScreen(auth);
  window._loginScreen = loginScreen;
  const lobbyUI = new LobbyUI(auth, cs);
  window._lobbyUI = lobbyUI;

  loginScreen.onContinue(() => {
    $('start-screen').style.display = 'flex';
  });
  loginScreen.onOpenLobby(() => {
    lobbyUI.show();
  });
  lobbyUI.onEnterGame(async (room) => {
    // Carrega o mapa da sala (vem do state)
    const mapId = cs.state?.map_id || 'default';
    if (mapId && mapId !== 'default') {
      try { await chibataMaps.load(mapId); } catch (_) {}
    }
    $('start-screen').style.display = 'none';
    window._gameInput?.activate();
    setFocusUI(true);
    window._musicSystem?.start();
  });

  // ── Diretor de combate: povoa a fase com inimigos (tecla H) ───────
  const combatDirector = new CombatDirector(enemyManager, player, scene, level);
  window._combatDirector = combatDirector;

  // ── Troca de personagem (player) reusando as animações ────────────
  const charSwapper = new CharacterSwapper(player, scene, shadowGen);
  window._charSwapper = charSwapper;
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
  const meshyPanel = new MeshyPanel(scene, buildMode);
  window._meshyPanel = meshyPanel;

  const assetGroupsUI = new AssetGroupsUI(buildMode);
  window._assetGroupsUI = assetGroupsUI;
  const { AssetEditorUI } = await import('./game/ui/AssetEditorUI.js');
  window._assetEditor = new AssetEditorUI();

  // Máquinas gerenciadas globalmente — restauradas do DB em _loadAssetsBackground
  window._assetMachines = [];

  // ── Anti-lag de colisão ───────────────────────────────────────────
  //  GLBs pesados (escada, estátuas) com colisão de malha-cheia fazem o
  //  moveWithCollisions custar ~20-130ms/chamada → joga trava perto deles.
  //  Convertemos pra caixa colisora. Como os assets carregam async (Scene
  //  Editor / BuildMode / DB), varremos algumas vezes após o load.
  window._sweepColliders = () => sweepHeavyColliders(scene);
  for (const ms of [1500, 3500, 6500, 10000]) setTimeout(window._sweepColliders, ms);

  // ── Sistemas RPG: Stats + Skills + Inventário ────────────────────
  const stats = new PlayerStats();
  try { stats.load(JSON.parse(localStorage.getItem('digifps_stats') || 'null')); } catch (_) {}
  player.stats = stats;
  player.maxHp = stats.maxHp();
  player.hp = player.maxHp;

  const skills = new SkillSystem(player, scene, stats);
  player.skills = skills;

  await initItemCatalog();   // popula o catálogo (consumíveis, equips, armas)
  const inventory = new Inventory(player, stats);
  try { inventory.load(JSON.parse(localStorage.getItem('digifps_inv') || 'null')); } catch (_) {}
  inventory.ensureStarterItems();   // começa com as armas no inventário
  player.inventory = inventory;
  // Kit inicial de poções
  if (!inventory.bag.length) { inventory.add('hpSmall', 3); inventory.add('mpPotion', 2); }

  // XP ao matar inimigo (hook chamado pelo EnemyManager.onDeath)
  player.onEnemyKilled = (enemy) => {
    const xp = { rookie: 20, champion: 45, ultimate: 90, mega: 180, boss: 400 }[enemy?.def?.tier] ?? 25;
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

  // ── Pointer lock solto → abre ENGINE MODE diretamente na aba Cena ──
  input.onDeactivated = () => {
    if (window._gamePlayer?._dead) return;   // morto → tela de morte, não abre editor
    if (!_engineMode) window.enterEngineMode('scene');
  };

  // ── ESC: se em jogo → abre engine mode; se em engine mode → retorna ao jogo ──
  window.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return;
    if ($('start-screen').style.display !== 'none') return; // jogo não iniciado
    if (animatorMode?.active) return;                        // animador ativo
    // ESC nunca mais mostra o overlay de pausa — vai pro engine mode
  });
  // (o próprio browser vai liberar o pointer lock ao pressionar ESC,
  //  o que dispara onDeactivated → enterEngineMode automaticamente)

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
      skills.update(dt, input);
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
    // HUD multiplayer: atualiza sempre
    pingDisplay.update();
    deathTimer.update();
    // Blood trail (auto sangue ao chão quando ferido)
    bloodTrail.update(dt);
    // Death cam ring buffer + ativação/desativação
    deathCam.push(player);
    if (cs.connected && cs.state) {
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
    // F9 → entra/sai da arena de teste de sombras
    const f9 = input.isDown('F9');
    if (f9 && !window._wasF9) testArena.toggle();
    window._wasF9 = f9;
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
async function _restoreMachines(scene) {
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
  console.log(`[AssetMachine] ✅ ${machines.length} máquina(s) restaurada(s)`);
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
              .catch(e => console.warn(`⚠️ Falha ao absorver animação [${a.name}]:`, e.message))
          )
        );
        
        console.log("🔥 [Sistema Anim] Extração concluída!");

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

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    setLoadingUI(Math.round((i / queue.length) * 100), item.label);
    if (item.key.startsWith('_procedural_')) {
      // Construção procedural — sem download, chama done() direto
      try { await item.done(); } catch (e) { console.warn('[proc]', item.key, e.message); }
      continue;
    }
    const meshes = await loader.load(item.key);
    if (meshes) await item.done(meshes);
  }
  // Restaura máquinas salvas
  await _restoreMachines(scene);

  setLoadingUI(100);

  // Aplica transforms salvos do SceneEditor sobre os GLBs recém carregados
  window._sceneEditor?.applyAllSaved();

  // Sombras: garante que TODA superfície (chão, paredes, plataformas) receba
  //  a sombra do sol — corrige luzes FX consumindo slots e maxLights baixo.
  try { gfx.fixSceneShadows(); } catch (_) {}
  setTimeout(() => { try { gfx.fixSceneShadows(); } catch (_) {} }, 400);

  // POR ÚLTIMO: garante a arma na mão. Roda DEPOIS do applyAllSaved (que
  //  podia jogar o viewmodel no chão ao casar nome genérico __root__).
  try { player._updateWeaponVisibility?.(); } catch (_) {}
  setTimeout(() => { try { player._updateWeaponVisibility?.(); } catch (_) {} }, 300);
}

// ════════════════════════════════════════════════════════════════
//  Funções globais (chamadas pelo HTML)
// ════════════════════════════════════════════════════════════════
window.startGame = function () {
  $('start-screen').style.display = 'none';
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
