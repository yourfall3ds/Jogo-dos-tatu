# ⚡ BABYLON.JS — SUPER ENGINE ARCHITECTURE
### Motor de Jogo Completo com IA, Editor Visual e Recursos AAA

> Guia técnico para construir uma engine robusta em cima do Babylon.js:
> IA comportamental, animation graphs, editor in-game, sistemas reutilizáveis e muito mais.

---

## ÍNDICE

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Core Loop e Sistemas](#2-core-loop-e-sistemas)
3. [Animation Graph — Animações Conectadas](#3-animation-graph)
4. [IA — Behavior Trees](#4-ia--behavior-trees)
5. [IA — Pathfinding (Recast + A*)](#5-ia--pathfinding)
6. [IA — Procedural Animation e IK](#6-ia--procedural-animation-e-ik)
7. [IA — Sensory System](#7-ia--sensory-system)
8. [ECS — Entity Component System](#8-ecs--entity-component-system)
9. [Event Bus](#9-event-bus)
10. [Editor In-Game — Arquitetura](#10-editor-in-game)
11. [Editor — Gizmos de Transformação](#11-editor--gizmos)
12. [Editor — Inspector de Propriedades](#12-editor--inspector)
13. [Editor — Hierarquia de Cena](#13-editor--hierarquia)
14. [Editor — Terrain Sculpt Tool](#14-editor--terrain-sculpt)
15. [Editor — Particle Editor](#15-editor--particle-editor)
16. [Editor — Script Engine](#16-editor--script-engine)
17. [Save/Load — Serialização de Cena](#17-saveload--serialização)
18. [Câmera Inteligente](#18-câmera-inteligente)
19. [Dialogue e Quest System](#19-dialogue--quest-system)
20. [Inventory e Item System](#20-inventory--item-system)
21. [Spatial Audio Engine](#21-spatial-audio-engine)
22. [Shader Library da Engine](#22-shader-library)
23. [Debug e Profiler Tools](#23-debug--profiler)
24. [Bootstrap Completo da Engine](#24-bootstrap-completo)
25. [Tabela: O que a IA controla](#25-tabela-o-que-a-ia-controla)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      SUPER ENGINE                           │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Core Loop   │   ECS World  │  Event Bus   │  Asset Cache  │
├──────────────┼──────────────┼──────────────┼───────────────┤
│ Animation    │ Physics Sys  │  AI Manager  │  Audio Engine │
│   Graph      │  (Havok)     │  (BT + Nav)  │  (3D Spatial) │
├──────────────┼──────────────┼──────────────┼───────────────┤
│  Renderer    │ Post FX Pipe │  GUI / HUD   │  Input Mgr    │
│  (BabylonJS) │  (Pipeline)  │  (BabylonGUI)│  (KB/Mouse/GP)│
├──────────────┴──────────────┴──────────────┴───────────────┤
│                     EDITOR MODE                             │
│  Gizmos | Inspector | Hierarchy | Terrain | Particle | Anim │
└─────────────────────────────────────────────────────────────┘
```

A engine é uma **camada acima do Babylon.js**. Você não substitui o Babylon — você o encapsula e estende com sistemas de alto nível. Todo acesso ao Babylon é feito via `engine.babylon` e `engine.scene`.

---

## 2. Core Loop e Sistemas

### Engine principal

```typescript
export class SuperEngine {
  public readonly babylon: BABYLON.Engine;
  public readonly scene: BABYLON.Scene;
  public readonly world: ECSWorld;
  public readonly events: EventBus;
  public readonly assets: AssetCache;
  public readonly input: InputManager;
  public readonly audio: SpatialAudioEngine;
  public readonly animator: AnimationGraphManager;
  public readonly ai: AIManager;
  public readonly camera: SmartCamera;
  public editor: EditorSystem | null = null;

  private _systems: ISystem[] = [];
  private _deltaTime = 0;

  static async create(canvas: HTMLCanvasElement): Promise<SuperEngine> {
    const babylon = await createBabylonEngine(canvas); // WebGPU com fallback WebGL2
    const scene   = new BABYLON.Scene(babylon);
    return new SuperEngine(babylon, scene);
  }

  constructor(babylon: BABYLON.Engine, scene: BABYLON.Scene) {
    this.babylon  = babylon;
    this.scene    = scene;
    this.events   = new EventBus();
    this.world    = new ECSWorld(this);
    this.assets   = new AssetCache(scene);
    this.input    = new InputManager(scene);
    this.audio    = new SpatialAudioEngine(scene);
    this.animator = new AnimationGraphManager(scene);
    this.ai       = new AIManager(this);
    this.camera   = new SmartCamera(scene);

    this._initSystems();
    this._startLoop();
  }

  private _initSystems() {
    // A ORDEM IMPORTA — define a sequência de update por frame
    this._systems = [
      new InputSystem(this),       // 1. Coleta input
      new PhysicsSystem(this),     // 2. Simula física
      new AISystem(this),          // 3. IA toma decisões
      new AnimationSystem(this),   // 4. Atualiza animation graph
      new ScriptSystem(this),      // 5. Scripts do usuário
      new CameraSystem(this),      // 6. Atualiza câmera
      new AudioSystem(this),       // 7. Atualiza áudio 3D
    ];
  }

  private _startLoop() {
    this.babylon.runRenderLoop(() => {
      this._deltaTime = Math.min(this.babylon.getDeltaTime() / 1000, 0.05);
      this._systems.forEach(s => s.enabled && s.update(this._deltaTime));
      this.scene.render();
    });
  }

  get dt(): number { return this._deltaTime; }

  enableEditor() {
    this.editor = new EditorSystem(this);
    this._systems.push(this.editor);
  }
}
```

### Interface base de sistema

```typescript
export interface ISystem {
  enabled: boolean;
  update(dt: number): void;
  dispose(): void;
}
```

---

## 3. Animation Graph

O Animation Graph é o coração do sistema de animação. Funciona como uma máquina de estados com blend suave entre clipes — exatamente como o Unreal Anim Blueprint ou o Unity Animator.

### Nós do grafo

```typescript
type BTStatus = "success" | "failure" | "running";
type AnimNodeType = "clip" | "blend1d" | "blend2d" | "state_machine";

interface AnimContext {
  dt: number;
  params: Record<string, number | boolean | string>;
}
interface AnimPose { group: BABYLON.AnimationGroup | null; weight: number; }

// Nó simples: reproduz um AnimationGroup
class ClipNode {
  weight = 1;
  private _normalizedTime = 0;

  constructor(public id: string, private _group: BABYLON.AnimationGroup) {
    _group.start(true, 1, _group.from, _group.to, false);
  }

  evaluate(ctx: AnimContext): AnimPose {
    this._normalizedTime += ctx.dt / ((this._group.to - this._group.from) / 60);
    if (this._normalizedTime > 1) this._normalizedTime %= 1;
    this._group.goToFrame(
      this._group.from + this._normalizedTime * (this._group.to - this._group.from)
    );
    return { group: this._group, weight: this.weight };
  }
}

// Blend 1D: interpola entre clipes por um parâmetro (ex: velocidade 0-2)
class Blend1DNode {
  weight = 1;
  private _clips: Array<{ param: number; node: ClipNode }> = [];

  constructor(public id: string) {}

  addClip(paramValue: number, node: ClipNode) {
    this._clips.push({ param: paramValue, node });
    this._clips.sort((a, b) => a.param - b.param);
  }

  evaluate(ctx: AnimContext): AnimPose {
    const val = (ctx.params[this.id] as number) ?? 0;
    let lo = this._clips[0], hi = this._clips[this._clips.length - 1];
    for (let i = 0; i < this._clips.length - 1; i++) {
      if (val >= this._clips[i].param && val <= this._clips[i+1].param) {
        lo = this._clips[i]; hi = this._clips[i+1]; break;
      }
    }
    const t = lo.param === hi.param ? 0 : (val - lo.param) / (hi.param - lo.param);
    lo.node.weight = 1 - t;
    hi.node.weight = t;
    lo.node.evaluate(ctx);
    hi.node.evaluate(ctx);
    return { group: null, weight: this.weight };
  }
}

// Blend 2D: blend por dois parâmetros (locomotion strafe)
class Blend2DNode {
  weight = 1;
  private _clips: Array<{ x: number; z: number; node: ClipNode }> = [];

  constructor(public id: string) {}

  addClip(x: number, z: number, node: ClipNode) { this._clips.push({ x, z, node }); }

  evaluate(ctx: AnimContext): AnimPose {
    const px = (ctx.params[`${this.id}_x`] as number) ?? 0;
    const pz = (ctx.params[`${this.id}_z`] as number) ?? 0;
    let totalW = 0;
    const weights = this._clips.map(c => {
      const dx = px - c.x, dz = pz - c.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const w = dist < 0.001 ? 9999 : 1 / dist;
      totalW += w;
      return w;
    });
    this._clips.forEach((c, i) => { c.node.weight = weights[i] / totalW; c.node.evaluate(ctx); });
    return { group: null, weight: this.weight };
  }
}
```

### State Machine — transições com blend e exit time

```typescript
interface Transition {
  from: string;  // "*" = de qualquer estado
  to: string;
  condition: (params: Record<string, any>) => boolean;
  blendDuration: number; // segundos
  exitTime?: number;     // 0-1: só transita quando anim chegou aqui
}

class StateMachineNode {
  weight = 1;
  private _states = new Map<string, ClipNode | Blend1DNode | Blend2DNode>();
  private _transitions: Transition[] = [];
  private _current = "";
  private _next: string | null = null;
  private _blendTime = 0;
  private _blendDuration = 0;

  addState(name: string, node: ClipNode | Blend1DNode | Blend2DNode) {
    this._states.set(name, node);
  }
  addTransition(t: Transition) { this._transitions.push(t); }
  setInitial(name: string) { this._current = name; }

  evaluate(ctx: AnimContext): AnimPose {
    if (!this._next) {
      const eligible = this._transitions.filter(
        t => (t.from === "*" || t.from === this._current) && t.condition(ctx.params)
      );
      if (eligible.length > 0) {
        this._next = eligible[0].to;
        this._blendDuration = eligible[0].blendDuration;
        this._blendTime = 0;
      }
    }

    if (this._next) {
      this._blendTime += ctx.dt;
      const t = Math.min(this._blendTime / this._blendDuration, 1);
      this._states.get(this._current)!.weight = 1 - t;
      this._states.get(this._next)!.weight = t;
      this._states.get(this._current)!.evaluate(ctx);
      this._states.get(this._next)!.evaluate(ctx);
      if (t >= 1) { this._current = this._next; this._next = null; }
    } else {
      this._states.get(this._current)!.evaluate(ctx);
    }
    return { group: null, weight: this.weight };
  }
}
```

### Montando o grafo de um personagem completo

```typescript
// Locomotion blend 2D
const locoNode = new Blend2DNode("loco");
locoNode.addClip(0,  0,  new ClipNode("idle",       anims["Idle"]));
locoNode.addClip(0,  1,  new ClipNode("walk_fwd",   anims["WalkForward"]));
locoNode.addClip(0,  2,  new ClipNode("run_fwd",    anims["RunForward"]));
locoNode.addClip(-1, 1,  new ClipNode("walk_left",  anims["WalkLeft"]));
locoNode.addClip(1,  1,  new ClipNode("walk_right", anims["WalkRight"]));
locoNode.addClip(0, -1,  new ClipNode("walk_back",  anims["WalkBack"]));

// State machine completa
const sm = new StateMachineNode();
sm.addState("locomotion", locoNode);
sm.addState("jump",    new ClipNode("jump",    anims["Jump"]));
sm.addState("attack1", new ClipNode("attack1", anims["Attack1"]));
sm.addState("attack2", new ClipNode("attack2", anims["Attack2"]));
sm.addState("attack3", new ClipNode("attack3", anims["Attack3"]));
sm.addState("hit",     new ClipNode("hit",     anims["HitReact"]));
sm.addState("death",   new ClipNode("death",   anims["Death"]));

sm.addTransition({ from: "locomotion", to: "jump",       blendDuration: 0.1,  condition: p => !!p.jump });
sm.addTransition({ from: "jump",       to: "locomotion", blendDuration: 0.25, exitTime: 0.8, condition: p => !!p.grounded });
sm.addTransition({ from: "locomotion", to: "attack1",    blendDuration: 0.1,  condition: p => !!p.attack });
sm.addTransition({ from: "attack1",    to: "attack2",    blendDuration: 0.05, exitTime: 0.5, condition: p => !!p.attack });
sm.addTransition({ from: "attack2",    to: "attack3",    blendDuration: 0.05, exitTime: 0.5, condition: p => !!p.attack });
sm.addTransition({ from: "attack3",    to: "locomotion", blendDuration: 0.2,  exitTime: 0.9, condition: () => true });
sm.addTransition({ from: "*",          to: "death",      blendDuration: 0.15, condition: p => !!p.dead });
sm.addTransition({ from: "*",          to: "hit",        blendDuration: 0.05, condition: p => !!p.hit });
sm.addTransition({ from: "hit",        to: "locomotion", blendDuration: 0.2,  exitTime: 0.7, condition: () => true });
sm.setInitial("locomotion");
```

---

## 4. IA — Behavior Trees

Padrão da indústria (Unreal, Unity) para lógica de IA complexa sem código espaguete.

### Nós base

```typescript
type BTStatus = "success" | "failure" | "running";

abstract class BTNode { abstract tick(ctx: AIContext): BTStatus; }

// Sequence: executa filhos em ordem, para no primeiro failure
class Sequence extends BTNode {
  constructor(private children: BTNode[]) { super(); }
  tick(ctx: AIContext): BTStatus {
    for (const c of this.children) {
      const s = c.tick(ctx);
      if (s !== "success") return s;
    }
    return "success";
  }
}

// Selector: para no primeiro success
class Selector extends BTNode {
  constructor(private children: BTNode[]) { super(); }
  tick(ctx: AIContext): BTStatus {
    for (const c of this.children) {
      const s = c.tick(ctx);
      if (s !== "failure") return s;
    }
    return "failure";
  }
}

// Parallel: executa todos ao mesmo tempo
class Parallel extends BTNode {
  constructor(private children: BTNode[], private threshold: number) { super(); }
  tick(ctx: AIContext): BTStatus {
    let ok = 0, fail = 0;
    for (const c of this.children) {
      const s = c.tick(ctx);
      if (s === "success") ok++;
      if (s === "failure") fail++;
    }
    if (ok >= this.threshold) return "success";
    if (fail > this.children.length - this.threshold) return "failure";
    return "running";
  }
}

class Inverter extends BTNode {
  constructor(private child: BTNode) { super(); }
  tick(ctx: AIContext): BTStatus {
    const s = this.child.tick(ctx);
    return s === "success" ? "failure" : s === "failure" ? "success" : "running";
  }
}
```

### Nós de ação (folhas da árvore)

```typescript
class IsPlayerInRange extends BTNode {
  constructor(private range: number) { super(); }
  tick(ctx: AIContext): BTStatus {
    return BABYLON.Vector3.Distance(ctx.self.position, ctx.player.position) <= this.range
      ? "success" : "failure";
  }
}

class IsHealthBelow extends BTNode {
  constructor(private threshold: number) { super(); }
  tick(ctx: AIContext): BTStatus {
    return ctx.self.health / ctx.self.maxHealth < this.threshold ? "success" : "failure";
  }
}

class MoveTo extends BTNode {
  tick(ctx: AIContext): BTStatus {
    if (BABYLON.Vector3.Distance(ctx.self.position, ctx.targetPosition) < 0.5) return "success";
    ctx.navigator.moveTo(ctx.self, ctx.targetPosition);
    return "running";
  }
}

class AttackPlayer extends BTNode {
  private _cd = 0;
  tick(ctx: AIContext): BTStatus {
    if (this._cd > 0) { this._cd -= ctx.dt; return "running"; }
    ctx.self.animParams["attack"] = true;
    ctx.player.takeDamage(ctx.self.attackDamage);
    this._cd = ctx.self.attackRate;
    return "success";
  }
}

class FleeFrom extends BTNode {
  tick(ctx: AIContext): BTStatus {
    const dir = ctx.self.position.subtract(ctx.player.position).normalize();
    ctx.navigator.moveTo(ctx.self, ctx.self.position.add(dir.scale(10)));
    return "running";
  }
}

class Wait extends BTNode {
  private _elapsed = 0;
  constructor(private duration: number) { super(); }
  tick(ctx: AIContext): BTStatus {
    this._elapsed += ctx.dt;
    if (this._elapsed >= this.duration) { this._elapsed = 0; return "success"; }
    return "running";
  }
}

class MoveToPatrol extends BTNode {
  tick(ctx: AIContext): BTStatus {
    const point = ctx.self.patrolPoints[ctx.self.patrolIdx];
    if (BABYLON.Vector3.Distance(ctx.self.position, point) < 0.5) {
      ctx.self.patrolIdx = (ctx.self.patrolIdx + 1) % ctx.self.patrolPoints.length;
      return "success";
    }
    ctx.navigator.moveTo(ctx.self, point);
    return "running";
  }
}
```

### Árvore de Orc Guard (comportamento completo)

```typescript
const orcBT = new Selector([

  // Morto — não faz nada
  new Sequence([new IsHealthBelow(0), new Wait(9999)]),

  // HP crítico — fuga
  new Sequence([new IsHealthBelow(0.2), new FleeFrom()]),

  // Em range de ataque
  new Sequence([new IsPlayerInRange(2.5), new AttackPlayer()]),

  // Perseguição
  new Sequence([new IsPlayerInRange(20), new MoveTo()]),

  // Patrulha
  new Sequence([new MoveToPatrol(), new Wait(1.5)]),
]);
```

---

## 5. IA — Pathfinding

### Recast.js (integração nativa do Babylon.js)

```typescript
import Recast from "recast-detour";

class NavigationSystem {
  private _plugin: BABYLON.RecastJSPlugin;
  private _crowd: BABYLON.ICrowd;

  async init(scene: BABYLON.Scene, navMesh: BABYLON.Mesh) {
    const recast = await Recast();
    this._plugin = new BABYLON.RecastJSPlugin(recast);
    scene.enableNavigationPlugin(this._plugin);

    this._plugin.createNavMesh([navMesh, ...staticMeshes], {
      cs: 0.2, ch: 0.2,
      walkableSlopeAngle: 35,
      walkableHeight: 2,
      walkableClimb: 0.5,
      walkableRadius: 0.5,
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });

    // Crowd — múltiplos agentes navegando simultaneamente
    this._crowd = this._plugin.createCrowd(500, 0.5, scene);
  }

  addAgent(mesh: BABYLON.Mesh): number {
    return this._crowd.addAgent(mesh.position, {
      radius: 0.4, height: 2,
      maxAcceleration: 4, maxSpeed: 3.5,
      collisionQueryRange: 3,
      pathOptimizationRange: 12,
      separationWeight: 2,
    }, mesh);
  }

  moveTo(agentIdx: number, target: BABYLON.Vector3) {
    const closest = this._plugin.getClosestPoint(target);
    this._crowd.agentGoto(agentIdx, closest);
  }

  update(dt: number) { this._crowd.update(dt); }

  showDebugNavMesh(scene: BABYLON.Scene) {
    const debug = this._plugin.createDebugNavMesh(scene);
    const m = new BABYLON.StandardMaterial("navDebug", scene);
    m.diffuseColor = new BABYLON.Color3(0, 0.5, 1);
    m.wireframe = true;
    debug.material = m;
  }
}
```

### A* em grade (dungeons, estratégia)

```typescript
class AStarGrid {
  private _grid: boolean[][];

  constructor(private _w: number, private _h: number) {
    this._grid = Array.from({ length: _h }, () => new Array(_w).fill(true));
  }

  setWalkable(x: number, y: number, v: boolean) { this._grid[y][x] = v; }

  findPath(sx: number, sy: number, ex: number, ey: number): [number,number][] {
    type N = { x: number; y: number; g: number; h: number; f: number; parent: N|null };
    const h = (x: number, y: number) => Math.abs(x-ex)+Math.abs(y-ey);
    const open: N[] = [{ x: sx, y: sy, g: 0, h: h(sx,sy), f: h(sx,sy), parent: null }];
    const closed = new Set<string>();

    while (open.length > 0) {
      open.sort((a,b)=>a.f-b.f);
      const cur = open.shift()!;
      if (cur.x===ex && cur.y===ey) {
        const path: [number,number][] = [];
        let n: N|null = cur;
        while (n) { path.unshift([n.x,n.y]); n = n.parent; }
        return path;
      }
      closed.add(`${cur.x},${cur.y}`);
      for (const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx = cur.x+dx, ny = cur.y+dy;
        if (nx<0||ny<0||nx>=this._w||ny>=this._h) continue;
        if (!this._grid[ny][nx]||closed.has(`${nx},${ny}`)) continue;
        const g = cur.g+(dx&&dy?1.414:1);
        const ex2 = open.find(n=>n.x===nx&&n.y===ny);
        if (ex2 && g>=ex2.g) continue;
        if (ex2) { ex2.g=g; ex2.f=g+ex2.h; ex2.parent=cur; }
        else open.push({ x:nx,y:ny,g,h:h(nx,ny),f:g+h(nx,ny),parent:cur });
      }
    }
    return [];
  }
}
```

---

## 6. IA — Procedural Animation e IK

### Full Body IK

```typescript
class ProceduralAnimator {
  private _leftFootIK!: BABYLON.BoneIKController;
  private _rightFootIK!: BABYLON.BoneIKController;
  private _headLook!: BABYLON.BoneLookController;

  setup(mesh: BABYLON.Mesh, skeleton: BABYLON.Skeleton, lookTarget: BABYLON.Mesh) {
    const lFoot = skeleton.bones.find(b => b.name === "LeftFoot")!;
    const rFoot = skeleton.bones.find(b => b.name === "RightFoot")!;
    const head  = skeleton.bones.find(b => b.name === "Head")!;

    const lTarget = new BABYLON.Mesh("lft", mesh.getScene()); lTarget.isVisible = false;
    const rTarget = new BABYLON.Mesh("rft", mesh.getScene()); rTarget.isVisible = false;

    this._leftFootIK  = new BABYLON.BoneIKController(mesh, lFoot,  { targetMesh: lTarget, slerpAmount: 0.8 });
    this._rightFootIK = new BABYLON.BoneIKController(mesh, rFoot,  { targetMesh: rTarget, slerpAmount: 0.8 });
    this._headLook    = new BABYLON.BoneLookController(mesh, head, lookTarget.position, {
      adjustYaw: Math.PI / 2, slerpAmount: 0.05,
      minYaw: -Math.PI/3, maxYaw: Math.PI/3,
      minPitch: -Math.PI/4, maxPitch: Math.PI/4,
    });
  }

  // Foot planting — pés grudados no chão
  updateFootPlant(scene: BABYLON.Scene, dt: number) {
    const footIKs = [this._leftFootIK, this._rightFootIK];
    footIKs.forEach(ik => {
      if (!ik.targetMesh) return;
      const footPos = ik.targetMesh.getAbsolutePosition();
      const ray = new BABYLON.Ray(footPos.add(new BABYLON.Vector3(0,0.5,0)), new BABYLON.Vector3(0,-1,0), 1);
      const hit = scene.pickWithRay(ray, m => m.name === "terrain");
      if (hit?.hit) {
        ik.targetMesh.position = BABYLON.Vector3.Lerp(ik.targetMesh.position, hit.pickedPoint!, dt*15);
      }
      ik.update();
    });
    this._headLook.update();
  }
}
```

### Ragdoll

```typescript
class RagdollSystem {
  activate(mesh: BABYLON.Mesh, skeleton: BABYLON.Skeleton, deathVel: BABYLON.Vector3) {
    skeleton.bones.forEach(bone => {
      if (!bone.linkedTransformNode) return;
      const boneMesh = bone.linkedTransformNode as BABYLON.Mesh;
      const agg = new BABYLON.PhysicsAggregate(boneMesh, BABYLON.PhysicsShapeType.SPHERE,
        { mass: 3, restitution: 0.2, friction: 0.7 }, mesh.getScene()
      );
      agg.body.setLinearVelocity(deathVel.add(new BABYLON.Vector3(
        (Math.random()-0.5)*3, Math.random()*3, (Math.random()-0.5)*3
      )));
    });
  }
}
```

---

## 7. IA — Sensory System

```typescript
class SensorySystem {
  // Cone de visão com raycast de obstrução
  canSee(enemy: BABYLON.Mesh, player: BABYLON.Mesh, fov = Math.PI/2.5, maxDist = 25): boolean {
    const toPlayer = player.position.subtract(enemy.position);
    const dist = toPlayer.length();
    if (dist > maxDist) return false;
    const forward = enemy.getDirection(BABYLON.Vector3.Forward());
    if (Math.acos(BABYLON.Vector3.Dot(forward, toPlayer.normalize())) > fov/2) return false;
    const ray = new BABYLON.Ray(enemy.position, toPlayer.normalize(), dist);
    const hit = enemy.getScene().pickWithRay(ray, m => m !== enemy && m !== player);
    return !hit?.hit;
  }

  canHear(enemy: BABYLON.Mesh, soundOrigin: BABYLON.Vector3, radius: number): boolean {
    return BABYLON.Vector3.Distance(enemy.position, soundOrigin) <= radius;
  }
}

// Memória de posição do player
class AIMemory {
  private _lastPos: BABYLON.Vector3 | null = null;
  private _age = 0;
  private readonly FORGET = 10;

  update(dt: number, canSee: boolean, playerPos: BABYLON.Vector3) {
    if (canSee) { this._lastPos = playerPos.clone(); this._age = 0; }
    else { this._age += dt; if (this._age > this.FORGET) this._lastPos = null; }
  }

  get lastKnownPos() { return this._lastPos; }
  get hasMemory() { return !!this._lastPos; }
}
```

---

## 8. ECS — Entity Component System

```typescript
type ComponentCtor<T> = new (...args: any[]) => T;

class ECSWorld {
  private _entities = new Map<number, Set<Function>>();
  private _components = new Map<Function, Map<number, any>>();
  private _nextId = 0;

  create(): number {
    const id = this._nextId++;
    this._entities.set(id, new Set());
    return id;
  }

  add<T extends object>(entityId: number, comp: T): T {
    const type = comp.constructor;
    if (!this._components.has(type)) this._components.set(type, new Map());
    this._components.get(type)!.set(entityId, comp);
    this._entities.get(entityId)!.add(type);
    return comp;
  }

  get<T>(entityId: number, type: ComponentCtor<T>): T | undefined {
    return this._components.get(type)?.get(entityId);
  }

  query<T extends any[]>(...types: { [K in keyof T]: ComponentCtor<T[K]> }): number[] {
    return Array.from(this._entities.entries())
      .filter(([, comps]) => types.every(t => comps.has(t)))
      .map(([id]) => id);
  }

  destroy(entityId: number) {
    this._entities.get(entityId)?.forEach(type => this._components.get(type)?.delete(entityId));
    this._entities.delete(entityId);
  }
}

// Componentes
class TransformComp { constructor(public pos = BABYLON.Vector3.Zero(), public rot = BABYLON.Vector3.Zero(), public scale = BABYLON.Vector3.One()) {} }
class HealthComp    { constructor(public hp = 100, public maxHp = 100) {} }
class MeshComp      { constructor(public mesh: BABYLON.Mesh) {} }
class AIComp        { constructor(public tree: BTNode, public ctx: AIContext) {} }
class AnimComp      { constructor(public sm: StateMachineNode, public ctx: AnimContext) {} }
class PhysicsComp   { constructor(public aggregate: BABYLON.PhysicsAggregate) {} }
class ScriptComp    { constructor(public scriptName: string) {} }
```

---

## 9. Event Bus

```typescript
type Handler<T = any> = (data: T) => void;

export class EventBus {
  private _map = new Map<string, Set<Handler>>();

  on<T>(event: string, fn: Handler<T>): () => void {
    if (!this._map.has(event)) this._map.set(event, new Set());
    this._map.get(event)!.add(fn);
    return () => this._map.get(event)?.delete(fn);
  }

  once<T>(event: string, fn: Handler<T>) {
    const off = this.on<T>(event, d => { fn(d); off(); });
  }

  emit<T>(event: string, data?: T) {
    this._map.get(event)?.forEach(h => h(data));
  }
}

// Exemplos de eventos da engine:
// engine.events.on("player:died",       () => showGameOver());
// engine.events.on("entity:died",       ({ position }) => spawnLoot(position));
// engine.events.on("player:levelup",    ({ level }) => showLevelUpFX(level));
// engine.events.on("zone:transition",   ({ to }) => loadZone(to));
// engine.events.emit("player:attacked", { damage: 50, type: "fire" });
```

---

## 10. Editor In-Game — Arquitetura

```typescript
export class EditorSystem implements ISystem {
  enabled = false;
  private _mode: "select"|"translate"|"rotate"|"scale"|"terrain"|"paint" = "select";
  private _gizmoManager: BABYLON.GizmoManager;
  private _inspector: InspectorPanel;
  private _hierarchy: HierarchyPanel;
  private _undoStack: UndoStack;

  constructor(private engine: SuperEngine) {
    this._gizmoManager = new BABYLON.GizmoManager(engine.scene);
    this._gizmoManager.usePointerToAttachGizmos = true;
    this._inspector   = new InspectorPanel(engine);
    this._hierarchy   = new HierarchyPanel(engine);
    this._undoStack   = new UndoStack();

    window.addEventListener("keydown", e => {
      if (e.key === "F1") this.toggle();
      if (!this.enabled) return;
      if (e.key === "w") this.setMode("translate");
      if (e.key === "e") this.setMode("rotate");
      if (e.key === "r") this.setMode("scale");
      if (e.key === "f") this.focusSelected();
      if (e.key === "Delete") this.deleteSelected();
      if (e.ctrlKey && e.key === "z") this._undoStack.undo();
      if (e.ctrlKey && e.key === "y") this._undoStack.redo();
      if (e.ctrlKey && e.key === "d") this.duplicateSelected();
      if (e.ctrlKey && e.key === "s") this.saveScene();
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    document.body.classList.toggle("editor-mode", this.enabled);
  }

  setMode(mode: typeof this._mode) {
    this._mode = mode;
    this._gizmoManager.positionGizmoEnabled = mode === "translate";
    this._gizmoManager.rotationGizmoEnabled  = mode === "rotate";
    this._gizmoManager.scaleGizmoEnabled     = mode === "scale";
  }

  selectMesh(mesh: BABYLON.Mesh) {
    this._gizmoManager.attachToMesh(mesh);
    this._inspector.inspectMesh(mesh);
  }

  update(_dt: number) {
    if (!this.enabled) return;
    this._inspector.refresh();
    this._hierarchy.refresh();
  }

  dispose() { this._gizmoManager.dispose(); }
}
```

---

## 11. Editor — Gizmos de Transformação

```typescript
// Babylon.js tem GizmoManager nativo — extremamente completo
const setupGizmos = (gm: BABYLON.GizmoManager) => {
  // Cores personalizadas
  const pos = gm.gizmos.positionGizmo!;
  pos.xGizmo.coloredMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.2, 0.2);
  pos.yGizmo.coloredMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.9, 0.2);
  pos.zGizmo.coloredMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.9);

  // Snapping (grade)
  gm.gizmos.positionGizmo!.snapDistance  = 0.5;
  gm.gizmos.rotationGizmo!.snapDistance  = Math.PI / 12; // 15°
  gm.gizmos.scaleGizmo!.snapDistance     = 0.1;

  // Espaço local vs global
  gm.gizmos.positionGizmo!.updateGizmoRotationToMatchAttachedMesh = true; // local

  // Undo ao terminar drag
  gm.onAttachedToMeshObservable.add(mesh => {
    if (!mesh) return;
    const before = mesh.position.clone();
    gm.gizmos.positionGizmo?.xGizmo.dragBehavior.onDragEndObservable.addOnce(() => {
      const after = mesh.position.clone();
      undoStack.push({
        undo: () => mesh.position.copyFrom(before),
        redo: () => mesh.position.copyFrom(after),
      });
    });
  });
};
```

---

## 12. Editor — Inspector de Propriedades

```typescript
class InspectorPanel {
  private _ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("inspector");
  private _panel: BABYLON.GUI.StackPanel;
  private _mesh: BABYLON.Mesh | null = null;

  constructor(private _engine: SuperEngine) {
    this._panel = new BABYLON.GUI.StackPanel();
    this._panel.width = "280px";
    this._panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this._panel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this._panel.background = "rgba(18,18,28,0.92)";
    this._ui.addControl(this._panel);
  }

  inspectMesh(mesh: BABYLON.Mesh) {
    this._mesh = mesh;
    this._panel.clearControls();
    this._header(`📦 ${mesh.name}`);
    this._separator();
    this._header("Transform");
    this._vec3("Position", mesh.position, v => mesh.position.copyFrom(v));
    const rotDeg = mesh.rotation.scale(180/Math.PI);
    this._vec3("Rotation°", rotDeg, v => mesh.rotation.copyFrom(v.scale(Math.PI/180)));
    this._vec3("Scale",     mesh.scaling, v => mesh.scaling.copyFrom(v));
    this._separator();
    this._bool("Visible",  mesh.isVisible,  v => mesh.isVisible = v);
    this._bool("Pickable", mesh.isPickable, v => mesh.isPickable = v);
    this._slider("Opacity", mesh.visibility, 0, 1, v => mesh.visibility = v);
    if (mesh.material instanceof BABYLON.PBRMaterial) {
      this._separator();
      this._header("PBR Material");
      this._slider("Metallic",  mesh.material.metallic  ?? 0, 0, 1, v => (mesh.material as BABYLON.PBRMaterial).metallic  = v);
      this._slider("Roughness", mesh.material.roughness ?? 1, 0, 1, v => (mesh.material as BABYLON.PBRMaterial).roughness = v);
      this._slider("Alpha",     mesh.material.alpha,           0, 1, v => (mesh.material as BABYLON.PBRMaterial).alpha     = v);
    }
    this._separator();
    this._button("🗑 Delete", () => { mesh.dispose(); this._mesh = null; }, "#c0392b");
    this._button("⧉ Duplicate", () => mesh.clone(mesh.name+"_copy"), "#2980b9");
  }

  refresh() { if (this._mesh) this._panel.children; } // invalidate

  private _header(t: string) {
    const h = new BABYLON.GUI.TextBlock("", t);
    h.height = "26px"; h.color = "#7ec8e3"; h.fontSize = 13;
    h.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    h.paddingLeft = "10px";
    this._panel.addControl(h);
  }

  private _slider(label: string, value: number, min: number, max: number, onChange: (v: number) => void) {
    const row = new BABYLON.GUI.StackPanel();
    row.isVertical = false; row.height = "30px";
    const lbl = new BABYLON.GUI.TextBlock("", label);
    lbl.width = "90px"; lbl.color = "#aaa"; lbl.fontSize = 11;
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    const sl = new BABYLON.GUI.Slider();
    sl.width = "120px"; sl.height = "16px";
    sl.minimum = min; sl.maximum = max; sl.value = value;
    sl.color = "#4a9eff"; sl.background = "#2a2a3a";
    const vt = new BABYLON.GUI.TextBlock("", value.toFixed(2));
    vt.width = "40px"; vt.color = "#fff"; vt.fontSize = 10;
    sl.onValueChangedObservable.add(v => { onChange(v); vt.text = v.toFixed(2); });
    [lbl,sl,vt].forEach(c => row.addControl(c));
    this._panel.addControl(row);
  }

  private _bool(label: string, value: boolean, onChange: (v: boolean) => void) {
    const row = new BABYLON.GUI.StackPanel();
    row.isVertical = false; row.height = "26px";
    const lbl = new BABYLON.GUI.TextBlock("", label);
    lbl.width = "140px"; lbl.color = "#aaa"; lbl.fontSize = 11;
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    const cb = new BABYLON.GUI.Checkbox();
    cb.width = "18px"; cb.height = "18px"; cb.isChecked = value;
    cb.color = "#4a9eff";
    cb.onIsCheckedChangedObservable.add(onChange);
    [lbl,cb].forEach(c => row.addControl(c));
    this._panel.addControl(row);
  }

  private _vec3(label: string, vec: BABYLON.Vector3, onChange: (v: BABYLON.Vector3) => void) {
    this._slider(label+" X", vec.x, -500, 500, v => onChange(new BABYLON.Vector3(v, vec.y, vec.z)));
    this._slider(label+" Y", vec.y, -500, 500, v => onChange(new BABYLON.Vector3(vec.x, v, vec.z)));
    this._slider(label+" Z", vec.z, -500, 500, v => onChange(new BABYLON.Vector3(vec.x, vec.y, v)));
  }

  private _button(label: string, onClick: () => void, bg = "#1a1a2e") {
    const btn = BABYLON.GUI.Button.CreateSimpleButton("", label);
    btn.height = "30px"; btn.width = "90%";
    btn.color = "#fff"; btn.background = bg; btn.fontSize = 12; btn.cornerRadius = 4;
    btn.onPointerClickObservable.add(onClick);
    this._panel.addControl(btn);
  }

  private _separator() {
    const sep = new BABYLON.GUI.Rectangle();
    sep.height = "1px"; sep.background = "#333"; sep.thickness = 0;
    this._panel.addControl(sep);
  }
}
```

---

## 13. Editor — Hierarquia de Cena

```typescript
class HierarchyPanel {
  private _ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("hierarchy");
  private _list: BABYLON.GUI.StackPanel;

  constructor(private _engine: SuperEngine) {
    const bg = new BABYLON.GUI.Rectangle();
    bg.width = "220px"; bg.height = "50%";
    bg.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    bg.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    bg.background = "rgba(14,14,22,0.92)"; bg.thickness = 0;
    this._ui.addControl(bg);

    const title = new BABYLON.GUI.TextBlock("", "📁 HIERARCHY");
    title.height = "22px"; title.color = "#7ec8e3"; title.fontSize = 12;
    title.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.paddingLeft = "8px";

    const scroll = new BABYLON.GUI.ScrollViewer();
    scroll.height = "calc(100% - 22px)"; scroll.thickness = 0; scroll.barColor = "#333";
    this._list = new BABYLON.GUI.StackPanel();
    scroll.addControl(this._list);
    bg.addControl(title); bg.addControl(scroll);
  }

  refresh() {
    this._list.clearControls();
    this._engine.scene.meshes
      .filter(m => !m.parent)
      .forEach(m => this._addItem(m, 0));
  }

  private _addItem(mesh: BABYLON.AbstractMesh, depth: number) {
    const icon = mesh.getChildMeshes(true).length > 0 ? "📂" : "📦";
    const btn = BABYLON.GUI.Button.CreateSimpleButton("", " ".repeat(depth*2) + icon + " " + mesh.name);
    btn.height = "22px"; btn.color = "#ddd"; btn.background = "transparent";
    btn.fontSize = 11; btn.thickness = 0;
    btn.textBlock!.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    btn.onPointerEnterObservable.add(() => btn.background = "rgba(74,158,255,0.25)");
    btn.onPointerOutObservable.add(()   => btn.background = "transparent");
    btn.onPointerClickObservable.add(() => this._engine.editor?.selectMesh(mesh as BABYLON.Mesh));
    this._list.addControl(btn);
    mesh.getChildMeshes(true).forEach(c => this._addItem(c, depth+1));
  }
}
```

---

## 14. Editor — Terrain Sculpt Tool

```typescript
class TerrainSculptor {
  brushRadius   = 5;
  brushStrength = 0.08;
  mode: "raise"|"lower"|"smooth"|"flatten" = "raise";

  constructor(private _terrain: BABYLON.GroundMesh) {}

  apply(worldPoint: BABYLON.Vector3) {
    const positions = this._terrain.getVerticesData(BABYLON.VertexBuffer.PositionKind)!;

    for (let i = 0; i < positions.length; i += 3) {
      const vx = positions[i], vy = positions[i+1], vz = positions[i+2];
      const dx = vx - worldPoint.x, dz = vz - worldPoint.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist >= this.brushRadius) continue;

      // Falloff cosine
      const falloff = Math.pow(Math.cos((dist / this.brushRadius) * Math.PI/2), 2);
      const d = this.brushStrength * falloff;

      switch (this.mode) {
        case "raise":   positions[i+1] += d; break;
        case "lower":   positions[i+1] -= d; break;
        case "flatten": positions[i+1] = BABYLON.Scalar.Lerp(vy, worldPoint.y, falloff*0.4); break;
        case "smooth":  positions[i+1] = BABYLON.Scalar.Lerp(vy, this._avgHeight(vx, vz, positions), falloff*0.3); break;
      }
    }

    this._terrain.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    this._terrain.createNormals(true);
    this._terrain.refreshBoundingInfo();
  }

  private _avgHeight(x: number, z: number, pos: Float32Array): number {
    let tot = 0, cnt = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i]-x, dz = pos[i+2]-z;
      if (Math.sqrt(dx*dx+dz*dz) < this.brushRadius) { tot += pos[i+1]; cnt++; }
    }
    return cnt ? tot/cnt : 0;
  }
}
```

---

## 15. Editor — Particle Editor

```typescript
class ParticleEditorPanel {
  buildUI(ps: BABYLON.ParticleSystem, container: BABYLON.GUI.StackPanel) {
    const props: Array<{ label: string; get: ()=>number; set: (v:number)=>void; min:number; max:number }> = [
      { label: "Emit Rate",  get: ()=>ps.emitRate,     set: v=>ps.emitRate=v,     min:0,   max:5000 },
      { label: "Min Life",   get: ()=>ps.minLifeTime,  set: v=>ps.minLifeTime=v,  min:0,   max:10   },
      { label: "Max Life",   get: ()=>ps.maxLifeTime,  set: v=>ps.maxLifeTime=v,  min:0,   max:10   },
      { label: "Min Size",   get: ()=>ps.minSize,      set: v=>ps.minSize=v,      min:0,   max:5    },
      { label: "Max Size",   get: ()=>ps.maxSize,      set: v=>ps.maxSize=v,      min:0,   max:5    },
      { label: "Gravity Y",  get: ()=>ps.gravity.y,    set: v=>ps.gravity.y=v,    min:-30, max:20   },
      { label: "Min Speed",  get: ()=>ps.minEmitPower, set: v=>ps.minEmitPower=v, min:0,   max:20   },
      { label: "Max Speed",  get: ()=>ps.maxEmitPower, set: v=>ps.maxEmitPower=v, min:0,   max:20   },
    ];

    props.forEach(p => {
      const row = this._makeSlider(p.label, p.get(), p.min, p.max, p.set);
      container.addControl(row);
    });

    // Botões rápidos
    const btnStart = BABYLON.GUI.Button.CreateSimpleButton("", "▶ Play");
    btnStart.height = "28px"; btnStart.background = "#27ae60"; btnStart.color = "#fff";
    btnStart.onPointerClickObservable.add(() => ps.start());
    container.addControl(btnStart);

    const btnStop = BABYLON.GUI.Button.CreateSimpleButton("", "⏹ Stop");
    btnStop.height = "28px"; btnStop.background = "#c0392b"; btnStop.color = "#fff";
    btnStop.onPointerClickObservable.add(() => ps.stop());
    container.addControl(btnStop);
  }

  private _makeSlider(label: string, val: number, min: number, max: number, cb: (v:number)=>void) {
    const row = new BABYLON.GUI.StackPanel();
    row.isVertical = false; row.height = "28px";
    const lbl = new BABYLON.GUI.TextBlock("", label);
    lbl.width = "100px"; lbl.color = "#ccc"; lbl.fontSize = 11;
    lbl.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    const sl = new BABYLON.GUI.Slider();
    sl.width = "120px"; sl.height = "16px"; sl.minimum = min; sl.maximum = max; sl.value = val;
    sl.color = "#e67e22"; sl.background = "#2a2a3a";
    const vt = new BABYLON.GUI.TextBlock("", val.toFixed(1));
    vt.width = "40px"; vt.color = "#fff"; vt.fontSize = 10;
    sl.onValueChangedObservable.add(v => { cb(v); vt.text = v.toFixed(1); });
    [lbl,sl,vt].forEach(c => row.addControl(c));
    return row;
  }
}
```

---

## 16. Editor — Script Engine

```typescript
// Scripts JS rodando in-game sem recompilar — para designers
class ScriptEngine {
  private _scripts = new Map<string, Function>();
  private _vars = new Map<string, any>();

  // API segura exposta para scripts
  private _api = {
    getMesh:  (name: string) => engine.scene.getMeshByName(name),
    emit:     (ev: string, data?: any) => engine.events.emit(ev, data),
    play:     (meshName: string, anim: string) => { /* acionar anim */ },
    setVar:   (k: string, v: any) => this._vars.set(k, v),
    getVar:   (k: string) => this._vars.get(k),
    lerp:     BABYLON.Scalar.Lerp,
    sin:      Math.sin,
    cos:      Math.cos,
    V3:       (x: number, y: number, z: number) => new BABYLON.Vector3(x, y, z),
    log:      console.log,
  };

  load(name: string, code: string) {
    try {
      this._scripts.set(name, new Function("api", "dt", "entity", `"use strict";\n${code}`));
    } catch (e) {
      console.error(`[Script '${name}'] Erro:`, e);
    }
  }

  run(name: string, dt: number, entityId: number) {
    this._scripts.get(name)?.(this._api, dt, entityId);
  }
}

// Exemplo de script criado pelo designer no editor:
/*
const mesh = api.getMesh("TorchFlame");
const t = Date.now() / 1000;
mesh.position.y = 0.5 + Math.sin(t * 3) * 0.05;
mesh.scaling.x = 1 + Math.cos(t * 4) * 0.08;
*/
```

---

## 17. Save/Load — Serialização de Cena

```typescript
class SceneSerializer {
  static serialize(scene: BABYLON.Scene): string {
    const data = {
      version: "1.0.0",
      timestamp: Date.now(),
      meshes: scene.meshes.map(m => ({
        name: m.name, id: m.id,
        position: m.position.asArray(),
        rotation: m.rotation.asArray(),
        scaling:  m.scaling.asArray(),
        isVisible: m.isVisible,
        parent: m.parent?.name ?? null,
        assetFile: m.metadata?.assetFile ?? null,
        metadata: m.metadata,
      })),
      lights: scene.lights.map(l => ({
        name: l.name,
        type: l.getTypeID(),
        intensity: l.intensity,
        position: (l as any).position?.asArray(),
        direction: (l as any).direction?.asArray(),
        diffuse: l.diffuse.asArray(),
      })),
      environment: {
        fogMode: scene.fogMode,
        fogDensity: scene.fogDensity,
        fogColor: scene.fogColor.asArray(),
        gravity: scene.gravity.asArray(),
      },
    };
    return JSON.stringify(data, null, 2);
  }

  static download(scene: BABYLON.Scene) {
    const json = this.serialize(scene);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `scene_${Date.now()}.json`;
    a.click();
  }

  static async load(json: string, scene: BABYLON.Scene) {
    const data = JSON.parse(json);
    // Restaurar environment
    scene.fogMode    = data.environment.fogMode;
    scene.fogDensity = data.environment.fogDensity;
    scene.fogColor   = BABYLON.Color3.FromArray(data.environment.fogColor);
    // Restaurar meshes
    for (const md of data.meshes) {
      let mesh: BABYLON.AbstractMesh;
      if (md.assetFile) {
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "/assets/", md.assetFile, scene);
        mesh = result.meshes[0];
      } else {
        mesh = BABYLON.MeshBuilder.CreateBox(md.name, {}, scene);
      }
      mesh.position.fromArray(md.position);
      mesh.rotation.fromArray(md.rotation);
      mesh.scaling.fromArray(md.scaling);
      mesh.isVisible = md.isVisible;
      mesh.metadata  = md.metadata;
    }
  }
}
```

---

## 18. Câmera Inteligente

```typescript
class SmartCamera {
  private _cam: BABYLON.ArcRotateCamera;
  private _preferredRadius = 8;
  private _shaking = false;

  constructor(scene: BABYLON.Scene) {
    this._cam = new BABYLON.ArcRotateCamera("smartcam", -Math.PI/2, Math.PI/3.5, 8, BABYLON.Vector3.Zero(), scene);
    this._cam.checkCollisions = true;
    this._cam.collisionRadius = new BABYLON.Vector3(0.3, 0.3, 0.3);
    this._cam.lowerRadiusLimit = 2;
    this._cam.upperRadiusLimit = 25;
    this._cam.lowerBetaLimit   = 0.1;
    this._cam.upperBetaLimit   = Math.PI/2.1;
  }

  follow(target: BABYLON.TransformNode, dt: number) {
    this._cam.target = BABYLON.Vector3.Lerp(this._cam.target, target.getAbsolutePosition(), dt*8);
    // Anti-clipping em paredes
    const toCamera = this._cam.position.subtract(this._cam.target).normalize();
    const ray = new BABYLON.Ray(this._cam.target, toCamera, this._preferredRadius);
    const hit = this._cam.getScene().pickWithRay(ray, m => m.checkCollisions);
    const safeR = hit?.hit ? Math.max(hit.distance - 0.3, 1) : this._preferredRadius;
    this._cam.radius = BABYLON.Scalar.Lerp(this._cam.radius, safeR, 0.15);
  }

  shake(intensity = 0.5, duration = 0.5) {
    if (this._shaking) return;
    this._shaking = true;
    const start = performance.now();
    const tick = () => {
      const t = 1 - Math.min((performance.now()-start) / (duration*1000), 1);
      this._cam.targetScreenOffset.set(
        (Math.random()-0.5)*intensity*t,
        (Math.random()-0.5)*intensity*t
      );
      if (t > 0) requestAnimationFrame(tick);
      else { this._cam.targetScreenOffset.set(0,0); this._shaking = false; }
    };
    tick();
  }

  async cinematic(path: BABYLON.Vector3[], targets: BABYLON.Vector3[], durationMs: number) {
    const spline = BABYLON.Curve3.CreateCatmullRomSpline(path, 20, false);
    const pts = spline.getPoints();
    const delay = durationMs / pts.length;
    for (let i = 0; i < pts.length; i++) {
      this._cam.position.copyFrom(pts[i]);
      this._cam.setTarget(targets[Math.min(i, targets.length-1)]);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  attachToCanvas(canvas: HTMLCanvasElement) { this._cam.attachControl(canvas, true); }
  get babylonCamera() { return this._cam; }
}
```

---

## 19. Dialogue & Quest System

```typescript
interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  avatar?: string;
  choices?: Array<{ text: string; next: string; condition?: ()=>boolean; action?: ()=>void }>;
  next?: string;
  onEnter?: () => void;
}

class DialogueSystem {
  private _nodes = new Map<string, DialogueNode>();
  private _active: DialogueNode | null = null;

  load(nodes: DialogueNode[]) { nodes.forEach(n => this._nodes.set(n.id, n)); }

  start(nodeId: string) {
    this._active = this._nodes.get(nodeId) ?? null;
    this._active?.onEnter?.();
    engine.events.emit("dialogue:start", this._active);
    this._render();
  }

  choose(choiceIndex: number) {
    const choice = this._active?.choices?.[choiceIndex];
    if (!choice) return;
    choice.action?.();
    this._advance(choice.next);
  }

  private _advance(nextId: string) {
    if (!nextId) { engine.events.emit("dialogue:end"); return; }
    this._active = this._nodes.get(nextId) ?? null;
    this._active?.onEnter?.();
    engine.events.emit("dialogue:node", this._active);
    if (this._active?.next) {
      setTimeout(() => this._advance(this._active!.next!), 2000);
    } else {
      this._render();
    }
  }

  private _render() { /* renderizar UI de diálogo */ }
}

// Quest System
class QuestManager {
  private _quests = new Map<string, Quest>();

  register(quest: Quest) { this._quests.set(quest.id, quest); }

  accept(id: string) {
    const q = this._quests.get(id)!;
    q.status = "active";
    engine.events.emit("quest:accepted", q);
  }

  progress(questId: string, objectiveId: string, amount = 1) {
    const q = this._quests.get(questId)!;
    if (q.status !== "active") return;
    const obj = q.objectives.find(o => o.id === objectiveId)!;
    obj.current = Math.min(obj.current + amount, obj.required);
    if (obj.current >= obj.required) obj.completed = true;
    engine.events.emit("quest:progress", { quest: q, obj });
    if (q.objectives.every(o => o.completed)) this._complete(q);
  }

  private _complete(q: Quest) {
    q.status = "completed";
    // dar recompensas
    engine.events.emit("quest:completed", q);
  }
}
```

---

## 20. Inventory & Item System

```typescript
interface Item {
  id: string; name: string; icon: string;
  type: "weapon"|"armor"|"consumable"|"material"|"quest";
  rarity: "common"|"uncommon"|"rare"|"epic"|"legendary";
  stackable: boolean; maxStack: number;
  stats?: Partial<{ damage: number; defense: number; speed: number; hp: number; mp: number }>;
  onUse?: (player: any) => void;
}

class Inventory {
  private _slots: Array<{ item: Item; qty: number }|null>;
  constructor(private size = 40) { this._slots = new Array(size).fill(null); }

  add(item: Item, qty = 1): boolean {
    if (item.stackable) {
      const slot = this._slots.find(s => s?.item.id === item.id && s.qty < item.maxStack);
      if (slot) { slot.qty += qty; this._changed(); return true; }
    }
    const idx = this._slots.findIndex(s => !s);
    if (idx === -1) return false;
    this._slots[idx] = { item, qty };
    this._changed();
    return true;
  }

  remove(slot: number, qty = 1) {
    if (!this._slots[slot]) return;
    this._slots[slot]!.qty -= qty;
    if (this._slots[slot]!.qty <= 0) this._slots[slot] = null;
    this._changed();
  }

  use(slot: number) {
    const entry = this._slots[slot];
    if (!entry || entry.item.type !== "consumable") return;
    entry.item.onUse?.(player);
    this.remove(slot, 1);
  }

  equip(slot: number) {
    const entry = this._slots[slot];
    if (!entry) return;
    engine.events.emit("item:equip", entry.item);
  }

  private _changed() { engine.events.emit("inventory:changed", this._slots); }
  get slots() { return this._slots; }
}
```

---

## 21. Spatial Audio Engine

```typescript
class SpatialAudioEngine {
  private _sounds = new Map<string, BABYLON.Sound>();
  private _music: BABYLON.Sound | null = null;

  async preload(key: string, url: string, opts: Partial<BABYLON.ISoundOptions> = {}) {
    return new Promise<void>(resolve => {
      this._sounds.set(key, new BABYLON.Sound(key, url, this._scene, resolve, {
        spatialSound: true, maxDistance: 40, rolloffFactor: 1.5,
        distanceModel: "inverse", ...opts,
      }));
    });
  }

  constructor(private _scene: BABYLON.Scene) {}

  playAt(key: string, pos: BABYLON.Vector3, volume = 1) {
    const s = this._sounds.get(key); if (!s) return;
    s.setPosition(pos); s.setVolume(volume); s.play();
  }

  attach(key: string, mesh: BABYLON.Mesh) {
    const s = this._sounds.get(key); if (!s) return;
    s.attachToMesh(mesh); s.play();
  }

  crossfade(nextKey: string, duration = 3) {
    const next = this._sounds.get(nextKey)!;
    next.setVolume(0); next.play();
    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now()-start)/(duration*1000), 1);
      this._music?.setVolume(1-t); next.setVolume(t);
      if (t < 1) requestAnimationFrame(tick);
      else { this._music?.stop(); this._music = next; }
    };
    tick();
  }

  // Reverb por ambiente
  setEnvironment(type: "none"|"cave"|"forest"|"dungeon"|"outdoor") {
    // Carregar impulse response e aplicar convolver node na Web Audio API
    const irFiles: Record<string, string> = {
      cave: "/audio/ir/cave.wav", dungeon: "/audio/ir/dungeon.wav",
      forest: "/audio/ir/forest.wav", outdoor: "/audio/ir/outdoor.wav",
    };
    if (type !== "none" && irFiles[type]) {
      fetch(irFiles[type]).then(r => r.arrayBuffer()).then(buf => {
        const ctx = BABYLON.Engine.audioEngine!.audioContext!;
        ctx.decodeAudioData(buf, decoded => {
          // Aplicar convolver...
        });
      });
    }
  }
}
```

---

## 22. Shader Library

### Shaders prontos para copiar

```glsl
/* === DISSOLVE (morte, teletransporte) ===
   Uniforms: dissolveAmount (0-1), edgeColor, noiseSampler */
uniform float dissolveAmount;
uniform vec3  edgeColor;
uniform sampler2D noiseSampler;
varying vec2 vUV;

void main() {
  float noise = texture2D(noiseSampler, vUV).r;
  if (noise < dissolveAmount) discard;
  float edge = smoothstep(dissolveAmount, dissolveAmount + 0.05, noise);
  vec4 color = texture2D(albedoSampler, vUV);
  color.rgb  = mix(edgeColor, color.rgb, edge);
  gl_FragColor = color;
}
```

```glsl
/* === CEL SHADING (toon) ===
   Cria visual cartoon com steps de luz e outline */
uniform sampler2D rampSampler;
varying vec3 vNormal;
varying vec3 vLightDir;

void main() {
  float NdotL = max(dot(normalize(vNormal), normalize(vLightDir)), 0.0);
  float ramp  = texture2D(rampSampler, vec2(NdotL, 0.5)).r;
  gl_FragColor = vec4(vec3(ramp), 1.0);
}
```

```glsl
/* === WATER (normal map duplo + fresnel) ===
   Uniforms: time, waterColor, normalMap1, normalMap2 */
uniform float time;
uniform vec3  waterColor;
uniform sampler2D normalMap1, normalMap2, reflectionSampler;
varying vec2 vUV;
varying vec3 vWorldPos;

void main() {
  vec2 u1 = vUV + vec2(time*0.02, time*0.015);
  vec2 u2 = vUV + vec2(-time*0.01, time*0.025);
  vec3 n  = normalize(
    (texture2D(normalMap1,u1).xyz*2.0-1.0) +
    (texture2D(normalMap2,u2).xyz*2.0-1.0)
  );
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
  vec3 refl  = texture2D(reflectionSampler, vUV + n.xz*0.05).rgb;
  gl_FragColor = vec4(mix(waterColor, refl, fresnel), 0.85);
}
```

```glsl
/* === OUTLINE / RIM LIGHT (highlight de seleção) ===
   Adiciona em pass separado sobre o mesh */
varying vec3 vNormal;
varying vec3 vViewDir;
uniform vec3 rimColor;
uniform float rimPower;

void main() {
  float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
  rim = pow(rim, rimPower);
  gl_FragColor = vec4(rimColor * rim, rim);
}
```

```glsl
/* === HEAT HAZE (distorção de calor, fogo, explosão) ===
   PostProcess fragment */
uniform sampler2D textureSampler;
uniform sampler2D noiseTex;
uniform float time, intensity;
varying vec2 vUV;

void main() {
  vec2 noise = texture2D(noiseTex, vUV + vec2(0, time*0.1)).rg * 2.0 - 1.0;
  vec2 distUV = vUV + noise * intensity;
  gl_FragColor = texture2D(textureSampler, distUV);
}
```

---

## 23. Debug & Profiler Tools

```typescript
class EngineProfiler {
  private _lines: Record<string, BABYLON.GUI.TextBlock> = {};
  private _history: number[] = [];

  constructor(engine: SuperEngine) {
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("profiler");
    const panel = new BABYLON.GUI.StackPanel();
    panel.width = "220px"; panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.background = "rgba(0,0,0,0.75)"; panel.paddingLeft = "6px";
    ui.addControl(panel);

    ["FPS", "Avg FPS", "Draw Calls", "Active Meshes", "Triangles", "Textures"].forEach(k => {
      const t = new BABYLON.GUI.TextBlock("", `${k}: --`);
      t.height = "18px"; t.color = "#fff"; t.fontSize = 11;
      t.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      panel.addControl(t);
      this._lines[k] = t;
    });

    engine.scene.registerAfterRender(() => {
      const fps = engine.babylon.getFps();
      this._history.push(fps);
      if (this._history.length > 60) this._history.shift();
      const avg = this._history.reduce((a,b)=>a+b,0)/this._history.length;

      const fpsColor = fps < 30 ? "#e74c3c" : fps < 50 ? "#f39c12" : "#2ecc71";
      this._lines["FPS"].text = `FPS: ${fps.toFixed(0)}`;
      this._lines["FPS"].color = fpsColor;
      this._lines["Avg FPS"].text = `Avg: ${avg.toFixed(0)}`;
      this._lines["Draw Calls"].text = `Draws: ${engine.scene.getActiveMeshes().length}`;
      this._lines["Active Meshes"].text = `Meshes: ${engine.scene.meshes.length}`;
      this._lines["Triangles"].text = `Tris: ${(engine.scene.getTotalVertices()/3)|0}`;
      this._lines["Textures"].text = `Textures: ${engine.scene.textures.length}`;
    });
  }
}
```

---

## 24. Bootstrap Completo da Engine

```typescript
// main.ts
async function bootstrap() {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener("resize", () => engine.babylon.resize());

  // 1. Criar engine
  const engine = await SuperEngine.create(canvas);

  // 2. Setup de física (Havok)
  const havok = await HavokPhysics();
  engine.scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), new BABYLON.HavokPlugin(true, havok));

  // 3. Pipeline de pós-processamento
  const pipeline = new BABYLON.DefaultRenderingPipeline("main", true, engine.scene, [engine.camera.babylonCamera]);
  pipeline.bloomEnabled       = true;
  pipeline.bloomThreshold     = 0.8;
  pipeline.bloomWeight        = 0.35;
  pipeline.fxaaEnabled        = true;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight  = 1.2;

  // 4. SSAO
  const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", engine.scene, { ssaoRatio: 0.5, blurRatio: 1.0 });
  ssao.totalStrength = 1.2; ssao.radius = 3;
  engine.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", engine.camera.babylonCamera);

  // 5. Pré-carregar assets
  await Promise.all([
    engine.assets.load("hero",    "/models/hero.glb"),
    engine.assets.load("terrain", "/terrain/world.glb"),
    engine.assets.load("sky",     "/env/sky.hdr", "env"),
  ]);

  // 6. Skybox e IBL
  const hdr = new BABYLON.HDRCubeTexture("/env/sky.hdr", engine.scene, 512);
  engine.scene.environmentTexture = hdr;
  engine.scene.createDefaultSkybox(hdr, true, 1000, 0.3);

  // 7. Criar entidade do player
  const playerId = engine.world.create();
  engine.world.add(playerId, new TransformComp(new BABYLON.Vector3(0, 2, 0)));
  engine.world.add(playerId, new HealthComp(100));
  engine.world.add(playerId, new MeshComp(engine.assets.get("hero")));

  // 8. Eventos globais
  engine.events.on("player:died",   () => { engine.camera.shake(1.5, 1); setTimeout(respawn, 3000); });
  engine.events.on("player:hit",    ({ dmg }) => engine.camera.shake(dmg/100, 0.3));
  engine.events.on("zone:change",   ({ to }) => engine.loadZone(to));
  engine.events.on("item:equip",    ({ item }) => applyItemStats(playerId, item));

  // 9. Áudio inicial
  await engine.audio.preload("music_main", "/music/theme.ogg", { loop: true });
  engine.audio.crossfade("music_main");

  // 10. Editor em dev
  if (import.meta.env.DEV) {
    engine.enableEditor();
    new EngineProfiler(engine);
    console.log("🔧 Editor ativo | F1 = toggle | W/E/R = gizmos | Ctrl+S = salvar cena");
  }

  console.log("✅ Engine inicializada");
}

bootstrap().catch(console.error);
```

---

## 25. Tabela: O que a IA controla

| Sistema | API da Engine | O que a IA faz |
|---------|--------------|----------------|
| **Behavior Tree** | `ai.tick(entityId, ctx)` | Decide ação automaticamente por frame |
| **Animation Graph** | `animCtx.params["speed"] = vel` | Blenda animações com base em estado físico |
| **Pathfinding** | `nav.moveTo(agent, target)` | Calcula rota evitando obstáculos |
| **Sensory** | `sensor.canSee()`, `sensor.canHear()` | Percepção contextual do mundo |
| **Memory** | `memory.lastKnownPos` | Persiste informações entre frames |
| **Procedural IK** | `procAnim.updateFootPlant()` | Adapta animação ao terreno automaticamente |
| **Ragdoll** | `ragdoll.activate(vel)` | Ativa física em morte com impulso correto |
| **Audio** | `audio.playAt("sfx", pos)` | Som 3D situacional e música contextual |
| **Camera** | `camera.shake()`, `camera.cinematic()` | Reage a eventos do jogo |
| **Dialogue** | `dialogue.start("npc_id")` | Inicia conversas por proximidade |
| **Quest** | `quest.progress("kill", "orc", 1)` | Rastreia objetivos automaticamente |
| **Particles** | `fx.play("explosion", pos)` | Efeitos visuais contextuais |
| **Terrain** | `terrain.apply(hitPoint)` | Modifica terreno em runtime |

---

*Engine completa, extensível e com IA integrada — pronta para FPS, MMO e Hack & Slash.*
*Todos os sistemas se comunicam via EventBus, podem ser ativados/desativados individualmente,*
*e o editor in-game expõe todos os recursos do Babylon.js sem sair do jogo.*
