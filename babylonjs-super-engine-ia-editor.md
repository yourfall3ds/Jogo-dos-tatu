# 🚀 BABYLON.JS — SUPER ENGINE: IA, EDITOR COMPLETO & ANIMAÇÕES CONECTADAS
### Arquitetura profissional para FPS / MMO / Hack & Slash

> Guia para transformar seu projeto Babylon.js em uma engine completa com IA comportamental,
> sistema de animação inteligente, editor visual rico e todos os recursos avançados da plataforma.

---

## ÍNDICE

1. [Arquitetura Geral da Super Engine](#1-arquitetura-geral-da-super-engine)
2. [Animation State Machine com IA](#2-animation-state-machine-com-ia)
3. [Behavioral AI — Inimigos que Parecem Vivos](#3-behavioral-ai--inimigos-que-parecem-vivos)
4. [Editor de Cena Completo — Todos Recursos Babylon](#4-editor-de-cena-completo--todos-recursos-babylon)
5. [Sistema de Gizmos e Transform Tools](#5-sistema-de-gizmos-e-transform-tools)
6. [Inspector e Property Panel Dinâmico](#6-inspector-e-property-panel-dinâmico)
7. [Sistema de Serialização e Salvar Cena](#7-sistema-de-serialização-e-salvar-cena)
8. [Asset Browser e Drag & Drop](#8-asset-browser-e-drag--drop)
9. [Sistema de Prefabs e Templates](#9-sistema-de-prefabs-e-templates)
10. [Behavior Trees para IA de Inimigos](#10-behavior-trees-para-ia-de-inimigos)
11. [Pathfinding com Navigation Mesh](#11-pathfinding-com-navigation-mesh)
12. [Procedural World & IA Generativa](#12-procedural-world--ia-generativa)
13. [Sistema de Eventos e Triggers](#13-sistema-de-eventos-e-triggers)
14. [Animações Conectadas — Blend Tree Completa](#14-animações-conectadas--blend-tree-completa)
15. [IK Procedural e Animação Física](#15-ik-procedural-e-animação-física)
16. [Sistema de Clima e Ambiente Dinâmico](#16-sistema-de-clima-e-ambiente-dinâmico)
17. [Sistema de Dano, Status e RPG](#17-sistema-de-dano-status-e-rpg)
18. [Console de Debug e Ferramentas Dev](#18-console-de-debug-e-ferramentas-dev)
19. [Undo/Redo no Editor](#19-undoredo-no-editor)
20. [Exportar e Importar Cena (JSON completo)](#20-exportar-e-importar-cena-json-completo)
21. [Integrar LLM/IA Real no Engine](#21-integrar-llmia-real-no-engine)
22. [Checklist de Features de Engine AAA](#22-checklist-de-features-de-engine-aaa)

---

## 1. Arquitetura Geral da Super Engine

### Estrutura de módulos

```
src/
├── engine/
│   ├── EngineCore.ts          ← Bootstrap: WebGPU, Scene, render loop
│   ├── SceneManager.ts        ← Carregar/descarregar zonas sem reload
│   ├── EventBus.ts            ← Comunicação entre sistemas (sem acoplamento)
│   ├── GameLoop.ts            ← Update fixo (física) + variável (render)
│   └── AssetManager.ts        ← Cache, streaming, pool de assets
│
├── editor/
│   ├── EditorMode.ts          ← Modo editor vs modo jogo (toggle)
│   ├── GizmoController.ts     ← Gizmos de translate/rotate/scale
│   ├── PropertyPanel.ts       ← Painel de propriedades dinâmico
│   ├── SceneHierarchy.ts      ← Árvore de objetos
│   ├── AssetBrowser.ts        ← Browser de arquivos do jogo
│   ├── UndoRedoStack.ts       ← Histórico de ações
│   └── Serializer.ts          ← Salvar/carregar cena em JSON
│
├── ai/
│   ├── BehaviorTree.ts        ← BT nodes: Selector, Sequence, Leaf
│   ├── AnimationBrain.ts      ← Decide qual animação tocar via IA
│   ├── NavigationSystem.ts    ← NavMesh + Recast.js
│   ├── PerceptionSystem.ts    ← Campo de visão, audição
│   └── LLMBridge.ts           ← Integração com OpenAI/Claude API
│
├── animation/
│   ├── BlendTree.ts           ← Blend de múltiplas animações por parâmetros
│   ├── StateMachine.ts        ← FSM de estados de animação
│   ├── IKController.ts        ← IK procedural de membros
│   └── AnimationEvents.ts     ← Callbacks em frames específicos
│
├── world/
│   ├── ChunkStreamer.ts        ← Streaming de chunks do mundo
│   ├── WeatherSystem.ts        ← Clima dinâmico
│   ├── DayNightCycle.ts        ← Ciclo dia/noite
│   └── ProceduralGen.ts        ← Geração procedural de conteúdo
│
└── gameplay/
    ├── CombatSystem.ts         ← Dano, hitboxes, skills
    ├── StatusEffects.ts        ← Buffs, debuffs, DoT
    ├── InventorySystem.ts      ← Itens, equipamento
    └── QuestSystem.ts          ← Quests, objetivos, gatilhos
```

### EventBus — a espinha dorsal

```typescript
// EventBus desacopla completamente os sistemas
// Qualquer sistema pode emitir ou ouvir sem referência direta

type EventMap = {
  "player:damaged":    { amount: number; source: string; position: BABYLON.Vector3 };
  "player:died":       { position: BABYLON.Vector3 };
  "enemy:spotted":     { enemyId: string; distance: number };
  "animation:frame":   { mesh: string; frame: number; animName: string };
  "editor:selected":   { mesh: BABYLON.AbstractMesh | null };
  "editor:modified":   { action: EditorAction };
  "world:chunkLoaded": { chunkKey: string };
  "weather:changed":   { from: WeatherType; to: WeatherType };
};

class EventBus {
  private static handlers = new Map<string, Set<Function>>();

  static on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)!.delete(handler); // retorna unsubscribe
  }

  static emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.handlers.get(event)?.forEach(h => h(data));
  }
}

// Uso em qualquer sistema:
EventBus.emit("player:damaged", { amount: 25, source: "orc", position: hitPos });

// IA ouve dano para reagir
EventBus.on("player:damaged", ({ amount, position }) => {
  if (amount > 50) cameraShake(0.5); // sacudir câmera em dano pesado
  spawnBloodParticles(position);
  playImpactSound(position);
});
```

### GameLoop com passo fixo de física

```typescript
class GameLoop {
  private accumulator = 0;
  private readonly FIXED_STEP = 1 / 60; // física a 60hz fixo

  start(scene: BABYLON.Scene, engine: BABYLON.Engine) {
    scene.registerBeforeRender(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      this.accumulator += dt;

      // Física: passo fixo (determinístico, não depende do FPS)
      while (this.accumulator >= this.FIXED_STEP) {
        this.fixedUpdate(this.FIXED_STEP);
        this.accumulator -= this.FIXED_STEP;
      }

      // Render: passo variável com interpolação
      const alpha = this.accumulator / this.FIXED_STEP;
      this.renderUpdate(dt, alpha);
    });
  }

  private fixedUpdate(dt: number) {
    PhysicsSystem.update(dt);
    AISystem.update(dt);
    NetworkSystem.update(dt);
  }

  private renderUpdate(dt: number, alpha: number) {
    AnimationSystem.update(dt);
    ParticleSystem.update(dt);
    AudioSystem.update(dt);
    UISystem.update(dt);
  }
}
```

---

## 2. Animation State Machine com IA

### Blend Tree Completa (como Unity/Unreal)

```typescript
// Parâmetros que controlam as animações (a IA pode escrever nesses parâmetros)
interface AnimParams {
  speed:       number;   // 0=parado, 1=andando, 2=correndo
  direction:   number;   // ângulo em radianos (movimento lateral)
  isGrounded:  boolean;
  isCrouching: boolean;
  isFalling:   boolean;
  verticalVel: number;
  attackType:  number;   // 0=nenhum, 1=leve, 2=pesado, 3=especial
  health:      number;   // 0-100 — afeta postura (machucado = corcovado)
  isTired:     boolean;  // stamina baixa = animações mais lentas
}

class BlendTree {
  private params: AnimParams = {
    speed: 0, direction: 0, isGrounded: true,
    isCrouching: false, isFalling: false,
    verticalVel: 0, attackType: 0, health: 100, isTired: false,
  };

  private groups: Map<string, BABYLON.AnimationGroup>;

  // Blend 2D — mistura animações em um plano 2D (ex: movimento direcional)
  // eixo X = strafe (-1 esquerda, 0 frente, 1 direita)
  // eixo Y = speed (0 idle, 1 walk, 2 run)
  computeLocomotionBlend() {
    const spd = this.params.speed;
    const dir = this.params.direction;

    // Quadrante de blend
    const idleW  = Math.max(0, 1 - spd);
    const walkW  = spd <= 1 ? spd : Math.max(0, 2 - spd);
    const runW   = Math.max(0, spd - 1);

    // Blend strafe
    const strafeRight = Math.max(0, dir);
    const strafeLeft  = Math.max(0, -dir);
    const forward     = 1 - Math.abs(dir);

    this.groups.get("Idle")!.setWeightForAllAnimatables(idleW);
    this.groups.get("WalkFwd")!.setWeightForAllAnimatables(walkW * forward);
    this.groups.get("WalkRight")!.setWeightForAllAnimatables(walkW * strafeRight);
    this.groups.get("WalkLeft")!.setWeightForAllAnimatables(walkW * strafeLeft);
    this.groups.get("Run")!.setWeightForAllAnimatables(runW * forward);
    this.groups.get("RunRight")!.setWeightForAllAnimatables(runW * strafeRight);
    this.groups.get("RunLeft")!.setWeightForAllAnimatables(runW * strafeLeft);
  }

  // A IA pode setar esses parâmetros diretamente
  setParam<K extends keyof AnimParams>(key: K, value: AnimParams[K]) {
    this.params[key] = value;
  }
}
```

### Finite State Machine de Animação

```typescript
type AnimStateID =
  | "Locomotion" | "Attack1" | "Attack2" | "Attack3"
  | "Hit" | "Death" | "Jump" | "Fall" | "Land"
  | "Crouch" | "Roll" | "Interact" | "Emote";

interface AnimTransition {
  from:      AnimStateID | "*";    // "*" = qualquer estado
  to:        AnimStateID;
  condition: (params: AnimParams) => boolean;
  duration:  number;               // duração do blend em segundos
  canInterrupt: boolean;
}

class AnimationStateMachine {
  private current: AnimStateID = "Locomotion";
  private blendProgress = 1.0;
  private previous: AnimStateID | null = null;

  private transitions: AnimTransition[] = [
    // Atacar pode interromper tudo exceto morte
    { from: "*",          to: "Attack1",    condition: p => p.attackType === 1, duration: 0.1, canInterrupt: false },
    { from: "*",          to: "Attack2",    condition: p => p.attackType === 2, duration: 0.1, canInterrupt: false },
    { from: "Attack1",    to: "Attack2",    condition: p => p.attackType === 2, duration: 0.05, canInterrupt: true },
    { from: "Attack2",    to: "Attack3",    condition: p => p.attackType === 3, duration: 0.05, canInterrupt: true },
    // Pulo/queda
    { from: "Locomotion", to: "Jump",       condition: p => !p.isGrounded && p.verticalVel > 1, duration: 0.1, canInterrupt: false },
    { from: "Jump",       to: "Fall",       condition: p => p.verticalVel < 0, duration: 0.3, canInterrupt: false },
    { from: "Fall",       to: "Land",       condition: p => p.isGrounded, duration: 0.05, canInterrupt: false },
    { from: "Land",       to: "Locomotion", condition: p => true, duration: 0.2, canInterrupt: false },
    // Tomar dano
    { from: "*",          to: "Hit",        condition: p => false, duration: 0.05, canInterrupt: false }, // triggered by event
    // Morte
    { from: "*",          to: "Death",      condition: p => p.health <= 0, duration: 0.1, canInterrupt: false },
    // Agachar
    { from: "Locomotion", to: "Crouch",     condition: p => p.isCrouching, duration: 0.3, canInterrupt: true },
    { from: "Crouch",     to: "Locomotion", condition: p => !p.isCrouching, duration: 0.3, canInterrupt: true },
    // Rolagem
    { from: "Crouch",     to: "Roll",       condition: p => p.speed > 0.5 && p.isCrouching, duration: 0.1, canInterrupt: false },
  ];

  update(params: AnimParams, dt: number) {
    // Verificar transições válidas
    for (const t of this.transitions) {
      if (t.from !== "*" && t.from !== this.current) continue;
      if (t.to === this.current) continue;
      if (!t.condition(params)) continue;

      // Iniciar transição
      this.startTransition(t.to, t.duration);
      break;
    }

    // Avançar blend
    if (this.blendProgress < 1) {
      this.blendProgress = Math.min(this.blendProgress + dt / this.currentTransitionDuration, 1);
      this.applyBlend(this.blendProgress);
    }
  }
}
```

### Animation Events — callbacks em frames específicos

```typescript
// Disparar eventos em frames específicos da animação (passos, impacto, efeito)
class AnimationEventSystem {
  private events: Map<string, AnimEvent[]> = new Map();

  // Registrar eventos em animações
  register(animName: string, events: AnimEvent[]) {
    this.events.set(animName, events);
  }

  setup(animGroups: BABYLON.AnimationGroup[]) {
    // Exemplo: ataque pesado
    this.register("Attack2", [
      { frame: 20, callback: () => this.onSwingStart() },   // começa o traço da arma
      { frame: 35, callback: () => this.onImpactFrame() },  // frame de impacto = verificar hit
      { frame: 55, callback: () => this.onSwingEnd() },     // fim do traço
    ]);

    this.register("Walk", [
      { frame: 10, callback: () => this.onFootstep("left") },
      { frame: 30, callback: () => this.onFootstep("right") },
    ]);

    // Vincular observers
    animGroups.forEach(ag => {
      const evts = this.events.get(ag.name) ?? [];
      evts.forEach(evt => {
        ag.onAnimationGroupLoopObservable.add(() => {});
        // Usar targetedAnimations para frame callbacks
        ag.targetedAnimations[0]?.animation.addEvent(
          new BABYLON.AnimationEvent(evt.frame, evt.callback, true)
        );
      });
    });
  }

  private onFootstep(foot: "left" | "right") {
    const surface = detectSurface();
    AudioManager.playFootstep(surface, foot);
    // partículas de pó/lama dependendo da superfície
    if (surface === "mud") spawnMudSplash(foot);
  }

  private onImpactFrame() {
    EventBus.emit("animation:frame", { mesh: "hero", frame: 35, animName: "Attack2" });
    CombatSystem.checkMeleeHit(); // só verifica hit no frame de impacto real
  }
}
```

---

## 3. Behavioral AI — Inimigos que Parecem Vivos

### Perception System (visão + audição)

```typescript
class PerceptionSystem {
  // Campo de visão em cone
  canSeeTarget(
    self: BABYLON.Mesh,
    target: BABYLON.Mesh,
    fovDeg = 120,
    maxDist = 30
  ): boolean {
    const toTarget = target.position.subtract(self.position);
    const dist = toTarget.length();
    if (dist > maxDist) return false;

    toTarget.normalize();
    const forward = self.getDirection(BABYLON.Vector3.Forward());
    const dot = BABYLON.Vector3.Dot(forward, toTarget);
    if (dot < Math.cos(BABYLON.Tools.ToRadians(fovDeg / 2))) return false;

    // Raycast para verificar obstáculos (visão bloqueada por paredes)
    const ray = new BABYLON.Ray(self.position.add(new BABYLON.Vector3(0, 1.7, 0)), toTarget, dist);
    const hit = scene.pickWithRay(ray, m => m !== self && m !== target && m.isPickable);
    return !hit?.hit; // só vê se o ray não bateu em nada no meio
  }

  // Audição — ouve passos, tiros, sons de ambiente
  canHearEvent(
    self: BABYLON.Mesh,
    soundOrigin: BABYLON.Vector3,
    soundRadius: number
  ): boolean {
    const dist = BABYLON.Vector3.Distance(self.position, soundOrigin);
    return dist <= soundRadius;
  }

  // Memória — inimigo lembra da última posição conhecida do jogador
  updateMemory(self: EnemyAI, player: BABYLON.Mesh) {
    if (this.canSeeTarget(self.mesh, player)) {
      self.memory.lastKnownPlayerPos = player.position.clone();
      self.memory.lastSeenTime = Date.now();
      self.memory.isPlayerVisible = true;
    } else {
      self.memory.isPlayerVisible = false;
      // Esquece depois de X segundos
      if (Date.now() - self.memory.lastSeenTime > 10000) {
        self.memory.lastKnownPlayerPos = null;
      }
    }
  }
}
```

### Emotion System — inimigos com estados emocionais

```typescript
// Emoções afetam animações, voz, comportamento e até atributos
enum EnemyEmotion {
  CALM     = "calm",
  ALERT    = "alert",
  ANGRY    = "angry",
  SCARED   = "scared",
  WOUNDED  = "wounded",
}

class EmotionSystem {
  private emotion: EnemyEmotion = EnemyEmotion.CALM;
  private angerLevel = 0;
  private fearLevel  = 0;

  update(enemy: EnemyAI, dt: number) {
    const hp  = enemy.stats.health / enemy.stats.maxHealth;
    const allyCount = countNearbyAllies(enemy, 10);
    const playerNear = enemy.memory.isPlayerVisible;

    // Fica com medo com HP baixo e sem aliados
    if (hp < 0.3 && allyCount < 2) {
      this.fearLevel = Math.min(this.fearLevel + dt * 0.5, 1);
    }

    // Fica furioso quando HP médio e com aliados
    if (hp < 0.6 && allyCount >= 2) {
      this.angerLevel = Math.min(this.angerLevel + dt * 0.3, 1);
    }

    // Determinar emoção dominante
    const prev = this.emotion;
    if (this.fearLevel > 0.7)          this.emotion = EnemyEmotion.SCARED;
    else if (this.angerLevel > 0.7)    this.emotion = EnemyEmotion.ANGRY;
    else if (hp < 0.4)                 this.emotion = EnemyEmotion.WOUNDED;
    else if (playerNear)               this.emotion = EnemyEmotion.ALERT;
    else                               this.emotion = EnemyEmotion.CALM;

    // Mudança de emoção dispara animação/voz
    if (prev !== this.emotion) {
      this.onEmotionChanged(enemy, prev, this.emotion);
    }

    // Emoção afeta parâmetros de animação
    enemy.animBlendTree.setParam("speed", this.emotion === EnemyEmotion.SCARED ? 1.5 : 1.0);
    enemy.animBlendTree.setParam("health", hp * 100);
  }

  private onEmotionChanged(enemy: EnemyAI, from: EnemyEmotion, to: EnemyEmotion) {
    const voiceLines: Record<EnemyEmotion, string[]> = {
      calm:    [],
      alert:   ["/sfx/orc_alert1.ogg", "/sfx/orc_alert2.ogg"],
      angry:   ["/sfx/orc_rage1.ogg"],
      scared:  ["/sfx/orc_fear1.ogg"],
      wounded: ["/sfx/orc_hurt1.ogg"],
    };
    const lines = voiceLines[to];
    if (lines.length) {
      const sfx = new BABYLON.Sound("voice", lines[Math.floor(Math.random() * lines.length)], scene, null, {
        spatialSound: true, maxDistance: 20,
      });
      sfx.attachToMesh(enemy.mesh);
      sfx.play();
    }
  }
}
```

---

## 4. Editor de Cena Completo — Todos Recursos Babylon

### Modo Editor vs Modo Jogo

```typescript
class EditorMode {
  private isEditorActive = false;
  private editorCamera: BABYLON.ArcRotateCamera;
  private gameCamera: BABYLON.Camera;

  toggle() {
    this.isEditorActive = !this.isEditorActive;

    if (this.isEditorActive) {
      // Pausar jogo
      scene.physicsEnabled = false;
      scene.animationsEnabled = false;
      GameLoop.pause();

      // Ativar câmera do editor (free orbit)
      this.editorCamera.setEnabled(true);
      this.gameCamera.setEnabled(false);
      scene.activeCamera = this.editorCamera;

      // Mostrar gizmos
      GizmoController.show();
      EditorUI.show();

      // Cursor
      canvas.exitPointerLock();
    } else {
      // Retomar jogo
      scene.physicsEnabled = true;
      scene.animationsEnabled = true;
      GameLoop.resume();

      this.editorCamera.setEnabled(false);
      this.gameCamera.setEnabled(true);
      scene.activeCamera = this.gameCamera;

      GizmoController.hide();
      EditorUI.hide();
    }
  }
}
```

### EditorCamera — navegação profissional

```typescript
class EditorCamera {
  private cam: BABYLON.ArcRotateCamera;
  private panSpeed = 0.01;
  private orbitSpeed = 0.005;
  private zoomSpeed = 0.1;

  setupControls() {
    // Pan (botão do meio / Alt+LMB)
    scene.onPointerObservable.add(info => {
      if (info.type !== BABYLON.PointerEventTypes.POINTERMOVE) return;
      const evt = info.event as PointerEvent;

      // Pan: Middle button drag
      if (evt.buttons === 4) {
        const right = this.cam.getDirection(BABYLON.Axis.X);
        const up    = this.cam.getDirection(BABYLON.Axis.Y);
        this.cam.target.addInPlace(right.scale(-evt.movementX * this.panSpeed));
        this.cam.target.addInPlace(up.scale(evt.movementY * this.panSpeed));
      }

      // Orbit: Alt + Left button
      if (evt.buttons === 1 && evt.altKey) {
        this.cam.alpha -= evt.movementX * this.orbitSpeed;
        this.cam.beta  -= evt.movementY * this.orbitSpeed;
      }
    });

    // Zoom com scroll
    canvas.addEventListener("wheel", e => {
      this.cam.radius = Math.max(1, this.cam.radius + e.deltaY * this.zoomSpeed);
    });

    // Focus no objeto selecionado (F key)
    window.addEventListener("keydown", e => {
      if (e.code === "KeyF" && this.isEditorActive) {
        this.focusOnSelected();
      }
    });
  }

  focusOnSelected() {
    const sel = SelectionManager.selected;
    if (!sel) return;
    const bbox = sel.getBoundingInfo().boundingBox;
    const center = bbox.centerWorld;
    const size   = bbox.extendSizeWorld.length();

    BABYLON.Animation.CreateAndStartAnimation(
      "camFocus", this.cam, "target",
      60, 20, this.cam.target.clone(), center,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
      new BABYLON.CubicEase()
    );
    BABYLON.Animation.CreateAndStartAnimation(
      "camRadius", this.cam, "radius",
      60, 20, this.cam.radius, size * 2,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
      new BABYLON.CubicEase()
    );
  }
}
```

---

## 5. Sistema de Gizmos e Transform Tools

### GizmoManager completo

```typescript
class GizmoController {
  private manager: BABYLON.GizmoManager;
  private mode: "translate" | "rotate" | "scale" | "boundingBox" = "translate";

  init(scene: BABYLON.Scene) {
    this.manager = new BABYLON.GizmoManager(scene);

    // Permitir seleção por click
    this.manager.usePointerToAttachGizmos = true;
    this.manager.enableAutoPicking = true;

    // Configurar aparência
    this.setMode("translate");

    // Atalhos de teclado (W/E/R como no Unity)
    window.addEventListener("keydown", e => {
      if (!EditorMode.isActive) return;
      if (e.code === "KeyW") this.setMode("translate");
      if (e.code === "KeyE") this.setMode("rotate");
      if (e.code === "KeyR") this.setMode("scale");
      if (e.code === "KeyT") this.toggleLocalGlobal();
      if (e.code === "KeyF") EditorCamera.focusOnSelected();

      // Grid snap
      if (e.code === "KeyG") this.toggleGridSnap();
    });
  }

  setMode(mode: "translate" | "rotate" | "scale" | "boundingBox") {
    this.mode = mode;
    this.manager.positionGizmoEnabled  = mode === "translate";
    this.manager.rotationGizmoEnabled  = mode === "rotate";
    this.manager.scaleGizmoEnabled     = mode === "scale";
    this.manager.boundingBoxGizmoEnabled = mode === "boundingBox";

    // Configurar snap
    if (this.manager.gizmos.positionGizmo) {
      this.manager.gizmos.positionGizmo.snapDistance = this.snapEnabled ? 0.5 : 0;
    }
    if (this.manager.gizmos.rotationGizmo) {
      this.manager.gizmos.rotationGizmo.snapDistance = this.snapEnabled ? 15 : 0; // graus
    }
  }

  attachTo(mesh: BABYLON.AbstractMesh | null) {
    this.manager.attachToMesh(mesh);
    // Observar mudanças para undo/redo
    if (mesh && this.manager.gizmos.positionGizmo) {
      this.manager.gizmos.positionGizmo.onSnapObservable.add(() => {
        UndoRedoStack.recordTransform(mesh);
      });
    }
  }

  private snapEnabled = false;
  toggleGridSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.setMode(this.mode);
  }

  toggleLocalGlobal() {
    const isLocal = this.manager.gizmos.positionGizmo?.updateGizmoPositionToMatchAttachedMesh;
    // Alternar entre espaço local e global
    [
      this.manager.gizmos.positionGizmo,
      this.manager.gizmos.rotationGizmo,
    ].forEach(g => {
      if (g) g.updateGizmoPositionToMatchAttachedMesh = !isLocal;
    });
  }
}
```

---

## 6. Inspector e Property Panel Dinâmico

### Panel que se adapta ao tipo de objeto selecionado

```typescript
// O painel gera campos automaticamente com base no tipo de componente
class PropertyPanel {
  render(mesh: BABYLON.AbstractMesh) {
    // Sections
    this.renderTransformSection(mesh);
    this.renderMeshSection(mesh);
    this.renderMaterialSection(mesh);
    this.renderPhysicsSection(mesh);
    this.renderLightSection(mesh);       // se for uma luz
    this.renderAnimationSection(mesh);   // se tiver skeleton
    this.renderCustomSection(mesh);      // metadata do seu jogo
  }

  renderMaterialSection(mesh: BABYLON.AbstractMesh) {
    const mat = mesh.material as BABYLON.PBRMaterial;
    if (!mat) return;

    this.addSection("Material", [
      this.colorPicker("Albedo",    mat.albedoColor,    c => mat.albedoColor = c),
      this.slider("Metallic",  0, 1, mat.metallic,   v => mat.metallic = v),
      this.slider("Roughness", 0, 1, mat.roughness,  v => mat.roughness = v),
      this.colorPicker("Emissive",  mat.emissiveColor,  c => mat.emissiveColor = c),
      this.slider("Opacity",   0, 1, mat.alpha,       v => mat.alpha = v),
      this.toggle("Wireframe",     mat.wireframe,       v => mat.wireframe = v),
      this.textureSlot("Albedo Map",  mat.albedoTexture,    t => mat.albedoTexture = t),
      this.textureSlot("Normal Map",  mat.bumpTexture,      t => mat.bumpTexture = t),
    ]);
  }

  renderLightSection(mesh: BABYLON.AbstractMesh) {
    // Verificar se há luz vinculada
    const light = scene.lights.find(l => (l as any)._mesh === mesh);
    if (!light) return;

    if (light instanceof BABYLON.PointLight) {
      this.addSection("Point Light", [
        this.colorPicker("Color",     light.diffuse,    c => light.diffuse = c),
        this.slider("Intensity", 0, 50, light.intensity, v => light.intensity = v),
        this.slider("Radius",    0, 50, light.radius,    v => light.radius = v),
      ]);
    }
    if (light instanceof BABYLON.DirectionalLight) {
      this.addSection("Directional Light", [
        this.colorPicker("Color",     light.diffuse,    c => light.diffuse = c),
        this.slider("Intensity", 0, 10, light.intensity, v => light.intensity = v),
        this.vec3("Direction",   light.direction,      v => light.direction = v),
      ]);
    }
  }

  renderAnimationSection(mesh: BABYLON.AbstractMesh) {
    if (!mesh.skeleton) return;

    this.addSection("Animations", [
      // Lista todas as AnimationGroups do mesh
      ...scene.animationGroups
        .filter(ag => ag.targetedAnimations.some(t => (t.target as any)?._mesh === mesh || t.target === mesh))
        .map(ag => ({
          type: "button",
          label: ag.name,
          onClick: () => {
            scene.animationGroups.forEach(g => g.stop());
            ag.start(true);
          }
        }))
    ]);
  }
}
```

---

## 7. Sistema de Serialização e Salvar Cena

### Serializar TUDO em JSON

```typescript
interface SceneData {
  version: string;
  objects: ObjectData[];
  lights:  LightData[];
  cameras: CameraData[];
  terrain: TerrainData | null;
  weather: WeatherData;
  sky:     SkyData;
  navmesh: string | null; // base64 encoded
}

class SceneSerializer {
  save(): SceneData {
    return {
      version: "2.0.0",
      objects: this.serializeMeshes(),
      lights:  this.serializeLights(),
      cameras: this.serializeCameras(),
      terrain: this.serializeTerrain(),
      weather: WeatherSystem.getState(),
      sky:     SkySystem.getState(),
      navmesh: NavigationSystem.export(),
    };
  }

  private serializeMeshes(): ObjectData[] {
    return scene.meshes
      .filter(m => m.metadata?.editorObject) // só objetos do editor
      .map(m => ({
        id:       m.uniqueId.toString(),
        name:     m.name,
        file:     m.metadata.sourceFile,
        position: m.position.asArray(),
        rotation: m.rotationQuaternion
          ? m.rotationQuaternion.asArray()
          : new BABYLON.Quaternion.RotationYawPitchRoll(
              m.rotation.y, m.rotation.x, m.rotation.z
            ).asArray(),
        scale:    m.scaling.asArray(),
        isStatic: m.metadata.isStatic ?? false,
        physics:  m.metadata.physics ?? null,
        tags:     m.metadata.tags ?? [],
        material: this.serializeMaterial(m.material),
        children: m.getChildMeshes(true).map(c => c.uniqueId.toString()),
      }));
  }

  private serializeMaterial(mat: BABYLON.Material | null): MaterialData | null {
    if (!mat) return null;
    if (mat instanceof BABYLON.PBRMaterial) {
      return {
        type: "PBR",
        albedo:    mat.albedoColor.asArray(),
        emissive:  mat.emissiveColor.asArray(),
        metallic:  mat.metallic,
        roughness: mat.roughness,
        alpha:     mat.alpha,
        textures: {
          albedo:   (mat.albedoTexture as BABYLON.Texture)?.url ?? null,
          normal:   (mat.bumpTexture as BABYLON.Texture)?.url ?? null,
          metallic: (mat.metallicTexture as BABYLON.Texture)?.url ?? null,
        }
      };
    }
    return null;
  }

  async load(data: SceneData) {
    // Limpar cena atual
    scene.meshes.filter(m => m.metadata?.editorObject).forEach(m => m.dispose());

    // Carregar objetos em paralelo
    await Promise.all(data.objects.map(obj => this.loadObject(obj)));

    // Restaurar luzes, clima, etc.
    data.lights.forEach(l => this.restoreLight(l));
    if (data.navmesh) NavigationSystem.import(data.navmesh);
  }

  // Auto-save a cada 30s
  startAutoSave(intervalMs = 30000) {
    setInterval(() => {
      const data = this.save();
      localStorage.setItem("autosave", JSON.stringify(data));
      console.log("[Editor] Auto-saved", new Date().toLocaleTimeString());
    }, intervalMs);
  }
}
```

---

## 8. Asset Browser e Drag & Drop

```typescript
class AssetBrowser {
  private assetRegistry: Map<string, AssetMeta> = new Map();

  // Registrar todos os assets do jogo
  async scanAssets(basePath: string) {
    // Fetch do manifesto de assets (arquivo JSON gerado no build)
    const manifest = await fetch(`${basePath}/assets-manifest.json`).then(r => r.json());
    manifest.models.forEach((a: AssetMeta) => this.assetRegistry.set(a.id, a));
    manifest.textures.forEach((a: AssetMeta) => this.assetRegistry.set(a.id, a));
    manifest.sounds.forEach((a: AssetMeta) => this.assetRegistry.set(a.id, a));
  }

  // Drag and drop do browser para a cena
  setupDragDrop(editorCanvas: HTMLCanvasElement) {
    editorCanvas.addEventListener("dragover", e => e.preventDefault());
    editorCanvas.addEventListener("drop", async e => {
      e.preventDefault();
      const assetId = e.dataTransfer?.getData("assetId");
      if (!assetId) return;

      // Calcular posição no mundo onde foi dropado
      const pick = scene.pick(e.clientX, e.clientY);
      const dropPos = pick?.pickedPoint ?? new BABYLON.Vector3(0, 0, 0);

      await this.spawnAsset(assetId, dropPos);
    });
  }

  async spawnAsset(assetId: string, position: BABYLON.Vector3) {
    const meta = this.assetRegistry.get(assetId);
    if (!meta) return;

    const result = await BABYLON.SceneLoader.ImportMeshAsync("", meta.basePath, meta.file, scene);
    const root   = result.meshes[0];
    root.position = position.clone();
    root.metadata = { editorObject: true, sourceFile: meta.file, assetId };

    // Registrar no undo stack
    UndoRedoStack.push({
      type: "spawn",
      undo: () => root.dispose(),
      redo: () => { /* re-spawn */ },
    });

    // Selecionar automaticamente
    SelectionManager.select(root);
  }
}
```

---

## 9. Sistema de Prefabs e Templates

```typescript
// Prefabs = templates de objetos com configuração predefinida
interface PrefabDefinition {
  id:       string;
  name:     string;
  icon:     string;
  baseFile: string;
  defaults: {
    scale?:   number[];
    rotation?: number[];
    material?: Partial<MaterialData>;
    physics?:  PhysicsConfig;
    ai?:       AIConfig;
    tags?:     string[];
  };
}

class PrefabSystem {
  private prefabs: Map<string, PrefabDefinition> = new Map();

  register(prefab: PrefabDefinition) {
    this.prefabs.set(prefab.id, prefab);
  }

  async instantiate(prefabId: string, position: BABYLON.Vector3): Promise<BABYLON.AbstractMesh> {
    const def = this.prefabs.get(prefabId)!;
    const result = await BABYLON.SceneLoader.ImportMeshAsync("", "/assets/", def.baseFile, scene);
    const root   = result.meshes[0];

    root.position = position.clone();
    if (def.defaults.scale)    root.scaling  = BABYLON.Vector3.FromArray(def.defaults.scale);
    if (def.defaults.rotation) root.rotation = BABYLON.Vector3.FromArray(def.defaults.rotation);

    root.metadata = {
      editorObject: true,
      prefabId,
      sourceFile: def.baseFile,
      tags: def.defaults.tags ?? [],
      physics: def.defaults.physics,
      ai: def.defaults.ai,
    };

    // Aplicar IA se configurado
    if (def.defaults.ai) {
      AISystem.attachBehavior(root, def.defaults.ai);
    }

    return root;
  }

  // Salvar objeto selecionado como novo prefab
  saveAsPrefab(mesh: BABYLON.AbstractMesh): PrefabDefinition {
    return {
      id:       `prefab_${Date.now()}`,
      name:     mesh.name,
      icon:     "/icons/default.png",
      baseFile: mesh.metadata.sourceFile,
      defaults: {
        scale:    mesh.scaling.asArray(),
        rotation: mesh.rotation.asArray(),
        tags:     mesh.metadata.tags,
        physics:  mesh.metadata.physics,
        ai:       mesh.metadata.ai,
      }
    };
  }
}

// Prefabs pré-definidos de exemplo
PrefabSystem.register({
  id: "enemy_orc",
  name: "Orc Warrior",
  icon: "/icons/orc.png",
  baseFile: "orc_warrior.glb",
  defaults: {
    scale: [1, 1, 1],
    tags: ["enemy", "melee"],
    ai: { behavior: "patrol", aggroRadius: 15, attackRange: 2, health: 150 },
    physics: { mass: 80, type: "CAPSULE" },
  }
});
```

---

## 10. Behavior Trees para IA de Inimigos

```typescript
// Behavior Tree — forma profissional de IA para jogos
// Cada nó retorna SUCCESS, FAILURE ou RUNNING

type BTStatus = "SUCCESS" | "FAILURE" | "RUNNING";

abstract class BTNode {
  abstract tick(ctx: BTContext): BTStatus;
}

// Selector — tenta filhos até um ter SUCCESS (OR lógico)
class Selector extends BTNode {
  constructor(private children: BTNode[]) { super(); }
  tick(ctx: BTContext): BTStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== "FAILURE") return s;
    }
    return "FAILURE";
  }
}

// Sequence — executa filhos em ordem até um FALHAR (AND lógico)
class Sequence extends BTNode {
  constructor(private children: BTNode[]) { super(); }
  tick(ctx: BTContext): BTStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== "SUCCESS") return s;
    }
    return "SUCCESS";
  }
}

// Nós folha (ações concretas)
class IsPlayerVisible extends BTNode {
  tick(ctx: BTContext): BTStatus {
    return ctx.enemy.memory.isPlayerVisible ? "SUCCESS" : "FAILURE";
  }
}

class ChasePlayer extends BTNode {
  tick(ctx: BTContext): BTStatus {
    if (!ctx.enemy.memory.lastKnownPlayerPos) return "FAILURE";
    ctx.enemy.navAgent.setDestination(ctx.enemy.memory.lastKnownPlayerPos);
    ctx.enemy.animFSM.setParam("speed", 2); // run
    return "RUNNING";
  }
}

class AttackPlayer extends BTNode {
  private cooldown = 0;
  tick(ctx: BTContext): BTStatus {
    const dist = BABYLON.Vector3.Distance(ctx.enemy.mesh.position, ctx.player.position);
    if (dist > ctx.enemy.stats.attackRange) return "FAILURE";
    if (this.cooldown > 0) { this.cooldown -= ctx.dt; return "RUNNING"; }

    // Executar ataque
    ctx.enemy.animFSM.setParam("attackType", 1);
    ctx.enemy.dealDamage(ctx.player, ctx.enemy.stats.damage);
    this.cooldown = 1 / ctx.enemy.stats.attackSpeed;
    return "SUCCESS";
  }
}

class Patrol extends BTNode {
  private waypointIndex = 0;
  tick(ctx: BTContext): BTStatus {
    const wp = ctx.enemy.waypoints[this.waypointIndex];
    const dist = BABYLON.Vector3.Distance(ctx.enemy.mesh.position, wp);
    if (dist < 1.5) {
      this.waypointIndex = (this.waypointIndex + 1) % ctx.enemy.waypoints.length;
    }
    ctx.enemy.navAgent.setDestination(wp);
    ctx.enemy.animFSM.setParam("speed", 1); // walk
    return "RUNNING";
  }
}

class Flee extends BTNode {
  tick(ctx: BTContext): BTStatus {
    const fleeDir = ctx.enemy.mesh.position.subtract(ctx.player.position).normalize();
    const fleeTarget = ctx.enemy.mesh.position.add(fleeDir.scale(20));
    ctx.enemy.navAgent.setDestination(fleeTarget);
    ctx.enemy.animFSM.setParam("speed", 2.5);
    return "RUNNING";
  }
}

// Árvore completa de um inimigo
const buildOrcBT = (): BTNode => new Selector([
  // Prioridade 1: fugir se com medo
  new Sequence([
    new IsEmotionScared(),
    new Flee(),
  ]),
  // Prioridade 2: atacar se player em alcance
  new Sequence([
    new IsPlayerVisible(),
    new IsInAttackRange(),
    new AttackPlayer(),
  ]),
  // Prioridade 3: perseguir se viu o player
  new Sequence([
    new HasLastKnownPosition(),
    new ChasePlayer(),
  ]),
  // Padrão: patrulhar
  new Patrol(),
]);
```

---

## 11. Pathfinding com Navigation Mesh

```typescript
import Recast from "recast-detour";

class NavigationSystem {
  private plugin: BABYLON.RecastJSPlugin;

  async init() {
    const recast = await Recast();
    this.plugin = new BABYLON.RecastJSPlugin(recast);
    scene.enableNavigationPlugin(this.plugin, new BABYLON.Vector3(0, -9.81, 0), new BABYLON.HavokPlugin());
  }

  buildNavMesh(walkableMeshes: BABYLON.Mesh[]) {
    const params = new BABYLON.NavMeshParameters();
    params.cs = 0.2;          // cell size (menor = mais preciso, mais lento)
    params.ch = 0.2;          // cell height
    params.walkableSlopeAngle = 35;
    params.walkableHeight = 2;
    params.walkableClimb  = 0.5;
    params.walkableRadius = 0.5;
    params.maxEdgeLen     = 12;
    params.maxSimplificationError = 1.3;
    params.minRegionArea  = 8;
    params.mergeRegionArea = 20;
    params.maxVertsPerPoly = 6;
    params.detailSampleDist = 6;
    params.detailSampleMaxError = 1;

    this.plugin.createNavMesh(walkableMeshes, params);
  }

  createAgent(mesh: BABYLON.Mesh): BABYLON.INavMeshAgent {
    const crowd = this.plugin.createCrowd(100, 0.5, scene);
    const agentParams: BABYLON.IAgentParameters = {
      radius: 0.5, height: 2,
      maxAcceleration: 8, maxSpeed: 5,
      collisionQueryRange: 1.5,
      pathOptimizationRange: 0,
      separationWeight: 1.0,
    };
    const agentIdx = crowd.addAgent(mesh.position, agentParams, mesh);
    return { crowd, agentIdx };
  }

  // Exibir NavMesh para debug no editor
  showDebugNavMesh() {
    const navMeshMesh = this.plugin.createDebugNavMesh(scene);
    navMeshMesh.name = "_debug_navmesh";
    navMeshMesh.material = new BABYLON.StandardMaterial("navDbg", scene);
    (navMeshMesh.material as BABYLON.StandardMaterial).diffuseColor = new BABYLON.Color3(0, 0.6, 0);
    (navMeshMesh.material as BABYLON.StandardMaterial).wireframe = true;
    navMeshMesh.isPickable = false;
  }
}
```

---

## 12. Procedural World & IA Generativa

### Geração procedural de nível

```typescript
class ProceduralWorldGenerator {
  // Gerar dungeon com Cellular Automata
  generateDungeon(width: number, height: number, fillProb = 0.45): boolean[][] {
    // Inicializar com ruído
    let grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => Math.random() < fillProb)
    );

    // 5 iterações de suavização
    for (let i = 0; i < 5; i++) {
      grid = grid.map((row, y) =>
        row.map((cell, x) => {
          const neighbors = this.countNeighbors(grid, x, y);
          return neighbors > 4;
        })
      );
    }
    return grid;
  }

  // Colocar inimigos proceduralmente baseado em dificuldade e distância
  spawnEnemiesProcedurally(
    rooms: Room[],
    playerLevel: number,
    difficulty: number
  ) {
    rooms.forEach((room, roomIndex) => {
      // Salas mais longe do spawn = mais difíceis
      const roomDifficulty = (roomIndex / rooms.length) * difficulty;
      const enemyCount = Math.floor(1 + roomDifficulty * 3);
      const enemyLevel = Math.max(1, playerLevel + Math.floor(roomDifficulty * 2));

      for (let i = 0; i < enemyCount; i++) {
        const pos = room.getRandomPoint();
        const prefabId = this.selectEnemyPrefab(enemyLevel, roomDifficulty);
        PrefabSystem.instantiate(prefabId, pos);
      }
    });
  }

  // IA decide qual inimigo spawnar com base no contexto
  selectEnemyPrefab(level: number, difficulty: number): string {
    if (level < 5)  return "enemy_goblin";
    if (level < 10) return "enemy_orc";
    if (level < 20) return difficulty > 0.7 ? "enemy_troll" : "enemy_orc_elite";
    return "enemy_dragon";
  }
}
```

---

## 13. Sistema de Eventos e Triggers

```typescript
// Trigger zones — áreas que disparam eventos (cutscenes, spawns, etc.)
class TriggerZone {
  private mesh: BABYLON.Mesh;
  private triggered = false;

  constructor(
    name: string,
    position: BABYLON.Vector3,
    size: BABYLON.Vector3,
    private config: TriggerConfig,
    private scene: BABYLON.Scene
  ) {
    this.mesh = BABYLON.MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
    this.mesh.position = position;
    this.mesh.isVisible = false;
    this.mesh.isPickable = false;
    this.mesh.checkCollisions = false;
    this.mesh.metadata = { isTrigger: true };
  }

  update(playerPos: BABYLON.Vector3) {
    const inside = this.mesh.intersectsPoint(playerPos);

    if (inside && (!this.triggered || this.config.repeatable)) {
      this.triggered = true;
      this.onEnter();
    }
  }

  private onEnter() {
    switch (this.config.type) {
      case "spawn":    SpawnSystem.spawnWave(this.config.waveId!); break;
      case "cutscene": CutsceneSystem.play(this.config.cutsceneId!); break;
      case "music":    AudioManager.crossfadeTo(this.config.musicTrack!); break;
      case "weather":  WeatherSystem.transitionTo(this.config.weather!); break;
      case "dialogue": DialogueSystem.start(this.config.npcId!, this.config.dialogueId!); break;
      case "script":   eval(this.config.script!); break; // custom script
    }
  }
}

// Visualização no editor
class TriggerRenderer {
  static renderAllTriggers(visible: boolean) {
    scene.meshes
      .filter(m => m.metadata?.isTrigger)
      .forEach(m => {
        m.isVisible = visible;
        if (!m.material) {
          const mat = new BABYLON.StandardMaterial("triggerMat", scene);
          mat.diffuseColor = new BABYLON.Color3(0, 1, 1);
          mat.alpha = 0.3;
          mat.wireframe = false;
          m.material = mat;
        }
      });
  }
}
```

---

## 14. Animações Conectadas — Blend Tree Completa

### Additive Animations (camadas sobrepostas)

```typescript
// Animações aditivas permitem sobrepor reações sobre a locomotion base
// Ex: ser atingido na esquerda = torcer o torso enquanto continua correndo

class AdditiveAnimationLayer {
  // Camada 0: Locomotion (base)
  // Camada 1: Upper body (ataques, reações a dano)
  // Camada 2: Face/Expressions (emoções)
  // Camada 3: Procedural IK

  private upperBodyMask: Map<string, number> = new Map(); // boneName -> weight

  setupUpperBodyMask(skeleton: BABYLON.Skeleton) {
    // Só ossos do torso pra cima recebem a animação de ataque
    const upperBones = ["Spine", "Chest", "Neck", "Head",
                        "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
                        "RightShoulder", "RightArm", "RightForeArm", "RightHand"];
    skeleton.bones.forEach(bone => {
      this.upperBodyMask.set(bone.name, upperBones.includes(bone.name) ? 1.0 : 0.0);
    });
  }

  // Blend de animação por máscara de osso
  blendWithMask(
    baseGroup: BABYLON.AnimationGroup,
    overrideGroup: BABYLON.AnimationGroup,
    weight: number
  ) {
    overrideGroup.targetedAnimations.forEach(ta => {
      const boneName = (ta.target as BABYLON.Bone).name;
      const maskW = this.upperBodyMask.get(boneName) ?? 0;
      (ta.animation as any)._weight = maskW * weight;
    });
    overrideGroup.setWeightForAllAnimatables(weight);
  }
}
```

### Transition com Avatar Mask e Sync Points

```typescript
// Sync points — sincronizar ciclo de andar com ciclo de correr
// Evita "pulo" visual ao trocar entre Walk e Run

class SyncedTransition {
  private syncGroups: Map<string, BABYLON.AnimationGroup[]> = new Map();

  // Andar e Correr têm o mesmo ponto de sync: pé esquerdo tocando o chão = frame 0
  registerSyncGroup(tag: string, groups: BABYLON.AnimationGroup[]) {
    this.syncGroups.set(tag, groups);
  }

  transitionSynced(from: BABYLON.AnimationGroup, to: BABYLON.AnimationGroup, duration: number) {
    // Calcular fase atual do ciclo
    const fromAnim = from.targetedAnimations[0].animation;
    const toAnim   = to.targetedAnimations[0].animation;

    const currentPhase = (from.animatables[0]?.masterFrame ?? 0) /
                         (fromAnim.getKeys().slice(-1)[0].frame);

    const syncFrame = Math.floor(currentPhase * (toAnim.getKeys().slice(-1)[0].frame));

    // Iniciar `to` no mesmo ponto de fase
    to.start(true, 1, syncFrame, undefined, false);
    to.setWeightForAllAnimatables(0);

    // Fazer blend suave
    let t = 0;
    const blendInterval = setInterval(() => {
      t += 0.016 / duration;
      from.setWeightForAllAnimatables(1 - t);
      to.setWeightForAllAnimatables(t);
      if (t >= 1) {
        from.stop();
        clearInterval(blendInterval);
      }
    }, 16);
  }
}
```

---

## 15. IK Procedural e Animação Física

### Foot IK — pés no chão mesmo em terreno irregular

```typescript
class FootIKSystem {
  private leftFootBone:  BABYLON.Bone;
  private rightFootBone: BABYLON.Bone;
  private leftTarget:    BABYLON.Mesh;
  private rightTarget:   BABYLON.Mesh;

  update(characterMesh: BABYLON.Mesh, skeleton: BABYLON.Skeleton) {
    const leftFoot  = this.getFootPosition("LeftFoot", characterMesh, skeleton);
    const rightFoot = this.getFootPosition("RightFoot", characterMesh, skeleton);

    // Raycast abaixo de cada pé para encontrar o chão
    const leftGround  = this.groundRaycast(leftFoot);
    const rightGround = this.groundRaycast(rightFoot);

    // Interpolar target de IK suavemente
    if (leftGround)  this.leftTarget.position  = BABYLON.Vector3.Lerp(this.leftTarget.position,  leftGround, 0.1);
    if (rightGround) this.rightTarget.position = BABYLON.Vector3.Lerp(this.rightTarget.position, rightGround, 0.1);

    // Aplicar IK
    const leftIK  = new BABYLON.BoneIKController(characterMesh, this.leftFootBone,  { targetMesh: this.leftTarget, slerpAmount: 0.9 });
    const rightIK = new BABYLON.BoneIKController(characterMesh, this.rightFootBone, { targetMesh: this.rightTarget, slerpAmount: 0.9 });
    leftIK.update();
    rightIK.update();

    // Ajustar altura do personagem baseado nos pés
    const hipHeight = Math.min(leftGround?.y ?? 0, rightGround?.y ?? 0);
    characterMesh.position.y = BABYLON.Scalar.Lerp(
      characterMesh.position.y, hipHeight + 1.0, 0.1
    );
  }

  private groundRaycast(from: BABYLON.Vector3): BABYLON.Vector3 | null {
    const ray = new BABYLON.Ray(from.add(new BABYLON.Vector3(0, 0.5, 0)), new BABYLON.Vector3(0, -1, 0), 1.0);
    const hit = scene.pickWithRay(ray, m => m.metadata?.isGround);
    return hit?.hit ? hit.pickedPoint! : null;
  }
}
```

---

## 16. Sistema de Clima e Ambiente Dinâmico

```typescript
enum WeatherType { CLEAR, CLOUDY, RAIN, STORM, FOG, SNOW }

class WeatherSystem {
  private current: WeatherType = WeatherType.CLEAR;
  private rain: BABYLON.GPUParticleSystem;
  private snow: BABYLON.GPUParticleSystem;

  async transitionTo(next: WeatherType, duration = 10) {
    const prev = this.current;
    this.current = next;

    // Fog
    const fogTargets: Record<WeatherType, { density: number; color: BABYLON.Color3 }> = {
      [WeatherType.CLEAR]:  { density: 0.001, color: new BABYLON.Color3(0.7, 0.7, 0.8) },
      [WeatherType.CLOUDY]: { density: 0.003, color: new BABYLON.Color3(0.5, 0.5, 0.6) },
      [WeatherType.RAIN]:   { density: 0.006, color: new BABYLON.Color3(0.4, 0.4, 0.5) },
      [WeatherType.STORM]:  { density: 0.012, color: new BABYLON.Color3(0.2, 0.2, 0.3) },
      [WeatherType.FOG]:    { density: 0.04,  color: new BABYLON.Color3(0.6, 0.6, 0.6) },
      [WeatherType.SNOW]:   { density: 0.004, color: new BABYLON.Color3(0.8, 0.8, 0.9) },
    };

    const target = fogTargets[next];
    const start  = { density: scene.fogDensity, color: scene.fogColor.clone() };
    const startT = performance.now();

    scene.registerBeforeRender(function fogTransition() {
      const t = Math.min((performance.now() - startT) / (duration * 1000), 1);
      scene.fogDensity = BABYLON.Scalar.Lerp(start.density, target.density, t);
      scene.fogColor   = BABYLON.Color3.Lerp(start.color, target.color, t);
      if (t >= 1) scene.unregisterBeforeRender(fogTransition);
    });

    // Partículas de chuva/neve
    if (next === WeatherType.RAIN || next === WeatherType.STORM) {
      this.rain.start();
      this.rain.emitRate = next === WeatherType.STORM ? 10000 : 3000;
    } else {
      this.rain.stop();
    }
    if (next === WeatherType.SNOW) {
      this.snow.start();
    } else {
      this.snow.stop();
    }

    EventBus.emit("weather:changed", { from: prev, to: next });
  }
}

// Ciclo Dia/Noite
class DayNightCycle {
  private timeOfDay = 8; // horas (0-24)
  private speed = 1;     // 1 = tempo real, 60 = 1 dia = 24min

  update(dt: number) {
    this.timeOfDay = (this.timeOfDay + dt * this.speed / 3600) % 24;

    const sunAngle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
    sunLight.direction = new BABYLON.Vector3(
      Math.cos(sunAngle), -Math.abs(Math.sin(sunAngle)) - 0.1, 0.3
    ).normalize();

    // Intensidade baseada na hora
    const t = Math.sin(sunAngle); // -1 a 1
    sunLight.intensity = Math.max(0, t) * 3;

    // Cor do céu
    const dayColor   = new BABYLON.Color3(0.4, 0.6, 1.0);
    const nightColor = new BABYLON.Color3(0.01, 0.01, 0.08);
    const dawnColor  = new BABYLON.Color3(1.0, 0.4, 0.1);
    // Interpolação multi-ponto baseada na hora...
  }
}
```

---

## 17. Sistema de Dano, Status e RPG

```typescript
// Status effects (buffs/debuffs) que afetam a IA de animação
interface StatusEffect {
  id:          string;
  name:        string;
  duration:    number;
  tickRate?:   number; // para DoT
  onApply?:    (target: Character) => void;
  onRemove?:   (target: Character) => void;
  onTick?:     (target: Character, dt: number) => void;
  // Efeitos visuais
  particleSystem?: string;
  glowColor?:      BABYLON.Color3;
}

const BurningEffect: StatusEffect = {
  id: "burning", name: "Em Chamas",
  duration: 5,
  tickRate: 1,
  onApply: (t) => {
    t.animFSM.setParam("isPanic", true);      // animação de pânico
    t.particleSystem = spawnFireParticles(t.mesh);
    t.mesh.material && (t.mesh.material as any).emissiveColor = new BABYLON.Color3(1, 0.3, 0);
  },
  onRemove: (t) => {
    t.animFSM.setParam("isPanic", false);
    t.particleSystem?.dispose();
    t.mesh.material && (t.mesh.material as any).emissiveColor = BABYLON.Color3.Black();
  },
  onTick: (t, dt) => {
    t.takeDamage(10 * dt, "fire");
    // Inimigo tenta apagar o fogo (rola no chão) com probabilidade
    if (Math.random() < 0.1) t.animFSM.trigger("RollOnGround");
  },
};

// Hit flash — feedback visual de dano
const flashMeshOnHit = (mesh: BABYLON.AbstractMesh, color = new BABYLON.Color3(1, 0, 0)) => {
  const mat = mesh.material as BABYLON.PBRMaterial;
  if (!mat) return;
  const original = mat.emissiveColor.clone();
  mat.emissiveColor = color;
  setTimeout(() => mat.emissiveColor = original, 100);
};
```

---

## 18. Console de Debug e Ferramentas Dev

```typescript
class DevConsole {
  private visible = false;
  private commandHistory: string[] = [];
  private commands: Map<string, (args: string[]) => string> = new Map();

  init() {
    // Togglear com F12 ou backtick
    window.addEventListener("keydown", e => {
      if (e.code === "Backquote") this.toggle();
    });

    // Comandos padrão
    this.register("fps",      () => `FPS: ${engine.getFps().toFixed(1)}`);
    this.register("draw",     () => `Draw calls: ${scene.getActiveMeshes().length}`);
    this.register("pos",      () => `Pos: ${camera.position.toString()}`);
    this.register("tp",       (args) => { camera.position = new BABYLON.Vector3(...args.map(Number)); return "Teleported"; });
    this.register("spawn",    (args) => { PrefabSystem.instantiate(args[0], camera.position); return `Spawned ${args[0]}`; });
    this.register("weather",  (args) => { WeatherSystem.transitionTo(args[0] as any); return `Weather: ${args[0]}`; });
    this.register("time",     (args) => { DayNightCycle.speed = +args[0]; return `Speed: ${args[0]}x`; });
    this.register("god",      () => { player.isGod = !player.isGod; return `God mode: ${player.isGod}`; });
    this.register("navmesh",  () => { NavigationSystem.showDebugNavMesh(); return "NavMesh visible"; });
    this.register("reload",   () => { SceneSerializer.load(SceneSerializer.save()); return "Scene reloaded"; });
  }

  register(cmd: string, fn: (args: string[]) => string) {
    this.commands.set(cmd, fn);
  }

  execute(input: string): string {
    const [cmd, ...args] = input.trim().split(" ");
    const fn = this.commands.get(cmd);
    if (!fn) return `Comando desconhecido: ${cmd}`;
    try { return fn(args); }
    catch (e) { return `Erro: ${e}`; }
  }
}
```

---

## 19. Undo/Redo no Editor

```typescript
interface EditorAction {
  description: string;
  undo: () => void;
  redo: () => void;
}

class UndoRedoStack {
  private stack:   EditorAction[] = [];
  private redoStack: EditorAction[] = [];
  private maxSize = 100;

  push(action: EditorAction) {
    this.stack.push(action);
    this.redoStack = []; // limpa redo ao fazer nova ação
    if (this.stack.length > this.maxSize) this.stack.shift();
  }

  undo() {
    const action = this.stack.pop();
    if (!action) return;
    action.undo();
    this.redoStack.push(action);
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    action.redo();
    this.stack.push(action);
  }

  // Helpers para ações comuns
  recordTransform(mesh: BABYLON.AbstractMesh) {
    const prevPos = mesh.position.clone();
    const prevRot = mesh.rotation.clone();
    const prevScale = mesh.scaling.clone();

    return (newPos: BABYLON.Vector3, newRot: BABYLON.Vector3, newScale: BABYLON.Vector3) => {
      this.push({
        description: `Mover ${mesh.name}`,
        undo: () => {
          mesh.position = prevPos;
          mesh.rotation = prevRot;
          mesh.scaling  = prevScale;
        },
        redo: () => {
          mesh.position = newPos;
          mesh.rotation = newRot;
          mesh.scaling  = newScale;
        }
      });
    };
  }
}

// Ctrl+Z / Ctrl+Y
window.addEventListener("keydown", e => {
  if (EditorMode.isActive) {
    if (e.ctrlKey && e.code === "KeyZ") UndoRedoStack.undo();
    if (e.ctrlKey && e.code === "KeyY") UndoRedoStack.redo();
  }
});
```

---

## 20. Exportar e Importar Cena (JSON completo)

```typescript
// Babylon nativo: SceneSerializer completo
const exportNative = () => {
  const serialized = BABYLON.SceneSerializer.Serialize(scene);
  const json = JSON.stringify(serialized, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "scene.babylon";
  a.click();
};

// Importar
const importNative = async (file: File) => {
  const json = await file.text();
  await BABYLON.SceneLoader.LoadAsync("", "data:" + json, engine);
};

// Exportar como GLB (para abrir no Blender/Sketchfab)
const exportGLB = async () => {
  const glb = await BABYLON.GLTF2Export.GLBAsync(scene, "scene", {
    shouldExportNode: (node) => !node.name.startsWith("_debug_"),
  });
  glb.downloadFiles();
};

// Exportar apenas meshes selecionados
const exportSelected = async () => {
  const selected = SelectionManager.allSelected;
  const glb = await BABYLON.GLTF2Export.GLBAsync(scene, "selection", {
    shouldExportNode: (node) => selected.includes(node as BABYLON.AbstractMesh),
  });
  glb.downloadFiles();
};
```

---

## 21. Integrar LLM/IA Real no Engine

### Bridge para API de IA (OpenAI / Claude)

```typescript
class LLMBridge {
  private apiUrl: string;
  private apiKey: string;
  private context: Message[] = [];

  // A IA controla comportamentos de NPCs via linguagem natural
  async askAI(prompt: string, systemContext: string): Promise<string> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", // ou claude-haiku-4-5
        messages: [
          { role: "system",  content: systemContext },
          ...this.context,
          { role: "user",    content: prompt },
        ],
        max_tokens: 200,
      }),
    });
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "";
    this.context.push({ role: "user", content: prompt });
    this.context.push({ role: "assistant", content: reply });
    if (this.context.length > 20) this.context = this.context.slice(-20);
    return reply;
  }
}

// NPC com diálogo gerado por IA
class AIDialogueNPC {
  private bridge = new LLMBridge();
  private systemPrompt: string;

  constructor(private npc: NPCData) {
    this.systemPrompt = `
Você é ${npc.name}, um ${npc.role} no mundo de fantasia medieval.
Personalidade: ${npc.personality}.
Você sabe sobre: ${npc.knowledge.join(", ")}.
Fale de forma concisa (máximo 2 frases). Nunca saia do personagem.
Estado atual: ${npc.currentState}.
    `;
  }

  async respondTo(playerMessage: string): Promise<string> {
    return await this.bridge.askAI(playerMessage, this.systemPrompt);
  }
}

// IA adapta a dificuldade dinamicamente (DDA - Dynamic Difficulty Adjustment)
class DDASystem {
  private bridge = new LLMBridge();

  async adjustDifficulty(gameStats: GameStats): Promise<DifficultySettings> {
    const prompt = `
O jogador tem estas estatísticas:
- Mortes nos últimos 10 minutos: ${gameStats.recentDeaths}
- Taxa de acerto: ${(gameStats.hitRate * 100).toFixed(0)}%
- HP médio ao terminar combates: ${gameStats.avgCombatEndHP}%
- Tempo médio por combate: ${gameStats.avgCombatTime}s
- Nível: ${gameStats.playerLevel}

Analise e responda APENAS com JSON no formato:
{"enemyDamageMultiplier": 0.8, "enemyHealthMultiplier": 0.9, "spawnRate": 1.1, "reason": "..."}
    `;
    const response = await this.bridge.askAI(prompt, "Você é um sistema de balanceamento de dificuldade para um RPG de ação.");
    return JSON.parse(response);
  }
}

// IA gera eventos de mundo dinâmicos
class WorldEventAI {
  async generateEvent(worldState: WorldState): Promise<GameEvent> {
    const prompt = `
Estado do mundo:
- Hora: ${worldState.timeOfDay}h
- Clima: ${worldState.weather}
- Jogador está em: ${worldState.currentZone}
- Nível do jogador: ${worldState.playerLevel}
- Última ação do jogador: ${worldState.lastAction}

Gere UM evento interessante para acontecer agora. Responda em JSON:
{"type": "ambush|discovery|npc_event|weather|mystery", "description": "...", "reward": "...", "enemies": [...]}
    `;
    const result = await this.bridge.askAI(prompt, "Você é um DM (Dungeon Master) criativo para um RPG de ação.");
    return JSON.parse(result);
  }
}
```

---

## 22. Checklist de Features de Engine AAA

Use este checklist para guiar o desenvolvimento do seu engine:

### ✅ Core Engine
- [ ] WebGPU com fallback WebGL2
- [ ] Game loop com passo fixo de física
- [ ] EventBus desacoplado
- [ ] Asset manager com cache e pool
- [ ] Scene manager multi-zona sem reload
- [ ] Object pooling para projéteis/efeitos

### ✅ Editor
- [ ] Toggle Editor/Game mode (F1 ou tecla)
- [ ] Gizmos Translate/Rotate/Scale (W/E/R)
- [ ] Grid snap (G)
- [ ] Local/Global space (T)
- [ ] Focus no objeto (F)
- [ ] Undo/Redo (Ctrl+Z/Y) — mínimo 100 passos
- [ ] Hierarquia de objetos com filtro
- [ ] Property panel dinâmico por tipo
- [ ] Asset browser com drag & drop
- [ ] Sistema de prefabs
- [ ] Salvar/Carregar cena (JSON)
- [ ] Export GLB
- [ ] Auto-save
- [ ] Debug de NavMesh
- [ ] Debug de colliders
- [ ] Debug de triggers
- [ ] Console de comandos (backtick)

### ✅ Renderização
- [ ] PBR Metallic-Roughness com mapas completos
- [ ] IBL com HDR environment
- [ ] Sombras CSM para mundo aberto
- [ ] SSAO2
- [ ] Bloom com tone mapping ACES
- [ ] Motion blur
- [ ] Depth of field
- [ ] Glow layer para magia/UI
- [ ] Highlight layer para seleção
- [ ] Fog volumétrico
- [ ] LOD em 3 níveis
- [ ] Frustum culling automático
- [ ] Occlusion culling
- [ ] Texture compression KTX2

### ✅ Animação
- [ ] Blend Tree 2D (locomotion)
- [ ] State machine com transições configuráveis
- [ ] Additive layers (upper body / lower body)
- [ ] Animation events em frames específicos
- [ ] Foot IK procedural
- [ ] Look-at IK para cabeça
- [ ] Ragdoll ao morrer
- [ ] Sync points para transições de ciclo
- [ ] Animações procedurais (sway, bob)

### ✅ IA
- [ ] Perception system (visão + audição + memória)
- [ ] Behavior Tree completa
- [ ] NavMesh com Recast.js
- [ ] Crowd simulation
- [ ] Emotion system
- [ ] Animation brain (IA decide animações)
- [ ] DDA (Dynamic Difficulty Adjustment)
- [ ] LLM bridge para NPCs e eventos
- [ ] Spawn procedural por dificuldade

### ✅ Gameplay
- [ ] Combat system com hitboxes por arco
- [ ] Combo system com janela de input
- [ ] Lock-on / targeting
- [ ] Status effects (burn, freeze, poison...)
- [ ] Hit flash e feedback visual
- [ ] Dano flutuante no HUD
- [ ] Sistema de triggers/zonas
- [ ] Quest/objetivo system
- [ ] Inventário e itens
- [ ] Sistema RPG (stats, XP, level)

### ✅ Mundo
- [ ] Chunk streaming por distância
- [ ] Terreno com heightmap
- [ ] Ciclo dia/noite
- [ ] Sistema de clima com transição suave
- [ ] Chuva/neve/tempestade com partículas GPU
- [ ] Geração procedural de dungeons
- [ ] Pathfinding com obstáculos dinâmicos

### ✅ Áudio
- [ ] Som 3D espacial com attenuation
- [ ] Crossfade de música
- [ ] Sons de passos por superfície
- [ ] Voz de NPCs positional
- [ ] Mixagem por categoria (Master/SFX/Music/Voice)
- [ ] Análise de áudio para efeitos reativos

### ✅ Rede (MMO)
- [ ] Colyseus/WebSocket com estado autoritativo
- [ ] Client-side prediction
- [ ] Interpolação de entidades remotas
- [ ] Rate limiting de envio (20hz)
- [ ] Snapshot interpolation
- [ ] Zone transition sem reload

---

## Links e Recursos

- [Playground Babylon.js](https://playground.babylonjs.com) — Teste tudo ao vivo
- [Node Material Editor](https://nme.babylonjs.com) — Shaders visuais
- [Colyseus Multiplayer](https://colyseus.io) — Backend para MMO
- [Recast.js Navigation](https://github.com/isaac-mason/recast-navigation-js)
- [Babylon Inspector](https://doc.babylonjs.com/toolsAndResources/inspector) — Profiling e debug
- [Havok Physics](https://doc.babylonjs.com/features/featuresDeepDive/physics/havokPlugin)
- [Forum Babylon.js](https://forum.babylonjs.com) — Comunidade ativa

---

*Guia de Super Engine — Babylon.js + IA + Editor Completo*
*Baseado nas melhores práticas de engines AAA adaptadas para WebGL/WebGPU*
