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

  // ── Sombras do sol (frustum ortográfico MANUAL cobrindo a cena) ──
  //  Mundo ~100x100. Frustum manual grande garante que TODOS os objetos
  //  entrem no shadow map (autoUpdateExtends às vezes não enquadrava).
  sun.position = new BABYLON.Vector3(40, 100, 40);
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -80; sun.orthoRight = 80;
  sun.orthoTop = 80;   sun.orthoBottom = -80;
  sun.shadowMinZ = -150; sun.shadowMaxZ = 250;

  const shadowGen = new BABYLON.ShadowGenerator(2048, sun);
  shadowGen.usePercentageCloserFiltering = true;   // bordas suaves (PCF)
  shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
  shadowGen.normalBias = 0.02;
  shadowGen.bias = 0.001;
  shadowGen.darkness = 0.4;
  window._shadowGen = shadowGen;

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
    combatDirector.update(dt, input, input.gameActive && !catalogUI._visible && !buildMode._active);
    navMesh.update(dt);
    dropSystem.update(dt, player.mesh?.position);
    dayNight.update(dt);
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
