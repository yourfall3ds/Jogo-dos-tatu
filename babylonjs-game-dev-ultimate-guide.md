# 🎮 BABYLON.JS — GUIA DEFINITIVO DE DESENVOLVIMENTO DE JOGOS
### FPS | MMO | Hack & Slash | Mundo Aberto

> Guia técnico aprofundado cobrindo engine, renderização, animação, som, física, rede, otimização e arquitetura de projetos.
> Baseado na documentação oficial `featuresDeepDive` do Babylon.js.

---

## ÍNDICE

1. [Fundamentos da Engine](#1-fundamentos-da-engine)
2. [Cena, Câmeras e Controles](#2-cena-câmeras-e-controles)
3. [Meshes, Geometria e Importação de Modelos](#3-meshes-geometria-e-importação-de-modelos)
4. [Materiais e Texturas (PBR)](#4-materiais-e-texturas-pbr)
5. [Iluminação e Sombras](#5-iluminação-e-sombras)
6. [Animações e Esqueletos](#6-animações-e-esqueletos)
7. [Física e Colisão](#7-física-e-colisão)
8. [Partículas e Efeitos Visuais](#8-partículas-e-efeitos-visuais)
9. [Pós-Processamento](#9-pós-processamento)
10. [Som e Áudio Espacial](#10-som-e-áudio-espacial)
11. [GUI e HUD em Jogo](#11-gui-e-hud-em-jogo)
12. [Input e Controles do Jogador](#12-input-e-controles-do-jogador)
13. [Multiplayer e Rede (MMO)](#13-multiplayer-e-rede-mmo)
14. [Otimização de Performance](#14-otimização-de-performance)
15. [Arquitetura para FPS](#15-arquitetura-para-fps)
16. [Arquitetura para MMO](#16-arquitetura-para-mmo)
17. [Arquitetura para Hack & Slash](#17-arquitetura-para-hack--slash)
18. [Node Material Editor (NME)](#18-node-material-editor-nme)
19. [Shaders Customizados (GLSL)](#19-shaders-customizados-glsl)
20. [Mundo Aberto, Terreno e Streaming](#20-mundo-aberto-terreno-e-streaming)
21. [LOD e Culling](#21-lod-e-culling)
22. [Asset Pipeline e Ferramentas](#22-asset-pipeline-e-ferramentas)
23. [WebGPU e Futuro da Engine](#23-webgpu-e-futuro-da-engine)
24. [Macetes, Truques e Padrões Avançados](#24-macetes-truques-e-padrões-avançados)

---

## 1. Fundamentos da Engine

### Criando o Engine corretamente

```typescript
// Sempre prefira WebGPU com fallback para WebGL2
const createEngine = async (canvas: HTMLCanvasElement) => {
  if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
    const engine = new BABYLON.WebGPUEngine(canvas, {
      adaptToDeviceRatio: true,
      antialias: true,
    });
    await engine.initAsync();
    return engine;
  }
  return new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    powerPreference: "high-performance", // ← CRÍTICO para jogos
    adaptToDeviceRatio: true,
  });
};
```

**Por que `powerPreference: "high-performance"`?** Garante que o browser solicite a GPU dedicada em laptops com dual GPU (Intel + NVIDIA/AMD). Sem isso, seu jogo pode rodar na GPU integrada sem aviso.

### Render Loop otimizado

```typescript
engine.runRenderLoop(() => {
  scene.render();
});

// Sempre redimensionar com a janela
window.addEventListener("resize", () => engine.resize());
```

### Flags importantes da Engine

```typescript
engine.enableOfflineSupport = false; // desabilita manifest fetch desnecessário
engine.setHardwareScalingLevel(1);   // 1 = resolução nativa; >1 = upscale (performance)
// Para mobile ou PCs fracos:
engine.setHardwareScalingLevel(1.5); // renderiza em 67% da res e escala — ganho enorme
```

---

## 2. Cena, Câmeras e Controles

### Configuração base da cena

```typescript
const scene = new BABYLON.Scene(engine);
scene.gravity = new BABYLON.Vector3(0, -9.81, 0);
scene.collisionsEnabled = true;
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity = 0.005;
scene.fogColor = new BABYLON.Color3(0.6, 0.6, 0.7);
```

### Câmera FPS (UniversalCamera)

```typescript
const camera = new BABYLON.UniversalCamera(
  "FPSCamera",
  new BABYLON.Vector3(0, 2, -5),
  scene
);
camera.setTarget(BABYLON.Vector3.Zero());
camera.attachControl(canvas, true);

// Configurações FPS
camera.speed = 0.5;
camera.angularSensibility = 500; // menor = mais sensível
camera.minZ = 0.1;               // near plane — evite valores muito pequenos
camera.maxZ = 1000;              // far plane — ajuste ao seu mapa

// Colisão e gravidade
camera.checkCollisions = true;
camera.applyGravity = true;
camera.ellipsoid = new BABYLON.Vector3(0.5, 1, 0.5); // hitbox do jogador
camera.ellipsoidOffset = new BABYLON.Vector3(0, 1, 0);

// Pointer lock para FPS
canvas.addEventListener("click", () => canvas.requestPointerLock());
```

### Câmera Terceira Pessoa (Hack & Slash / MMO)

```typescript
const camera = new BABYLON.ArcRotateCamera(
  "TPSCamera",
  -Math.PI / 2,
  Math.PI / 3,
  8,
  BABYLON.Vector3.Zero(),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 2;
camera.upperRadiusLimit = 20;
camera.lowerBetaLimit = 0.1;
camera.upperBetaLimit = Math.PI / 2.2;
camera.checkCollisions = true;
camera.collisionRadius = new BABYLON.Vector3(0.5, 0.5, 0.5);

// Seguir o personagem suavemente
scene.registerBeforeRender(() => {
  camera.target = BABYLON.Vector3.Lerp(
    camera.target,
    playerMesh.position,
    0.1
  );
});
```

### Câmera Isométrica (Hack & Slash estilo Diablo)

```typescript
const camera = new BABYLON.ArcRotateCamera("IsoCamera", -Math.PI / 4, Math.PI / 3.5, 25, BABYLON.Vector3.Zero(), scene);
camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
const ratio = engine.getAspectRatio(camera);
camera.orthoLeft   = -10 * ratio;
camera.orthoRight  =  10 * ratio;
camera.orthoBottom = -10;
camera.orthoTop    =  10;
```

---

## 3. Meshes, Geometria e Importação de Modelos

### Importando GLB/GLTF (padrão para jogos)

```typescript
// Forma moderna — SceneLoader.ImportMeshAsync
const result = await BABYLON.SceneLoader.ImportMeshAsync(
  "",           // "" = importa todos os meshes
  "/assets/",
  "hero.glb",
  scene
);

const { meshes, skeletons, animationGroups, particleSystems } = result;
const hero = meshes[0]; // root mesh
```

**Macete:** Use `.glb` (binário) em vez de `.gltf` + textura separadas. Menos requests HTTP, mais rápido no load.

### Instancias vs Clones

```typescript
// CLONE — cópia completa, tem sua própria transform mas duplica geometria na memória
const clone = originalMesh.clone("enemy_2");

// INSTANCE — não duplica geometria, usa GPU instancing. IDEAL para muitos inimigos iguais
const instance = originalMesh.createInstance("enemy_instance_1");
instance.position = new BABYLON.Vector3(5, 0, 5);

// Thin instances — ainda mais eficiente, para CENTENAS/MILHARES de objetos idênticos
const bufferMatrices = new Float32Array(16 * count);
for (let i = 0; i < count; i++) {
  const matrix = BABYLON.Matrix.Translation(x, y, z);
  matrix.copyToArray(bufferMatrices, i * 16);
}
mesh.thinInstanceSetBuffer("matrix", bufferMatrices, 16);
```

### Merge de meshes (otimização de draw calls)

```typescript
const merged = BABYLON.Mesh.MergeMeshes(
  [mesh1, mesh2, mesh3],
  true,       // disposeSource
  true,       // allow32BitsIndices
  undefined,
  false,
  true        // multiMultiMaterials — mantém sub-materiais
);
```

---

## 4. Materiais e Texturas (PBR)

### PBR Metallic-Roughness (o material certo para jogos modernos)

```typescript
const mat = new BABYLON.PBRMaterial("heroMat", scene);

// Texturas essenciais
mat.albedoTexture        = new BABYLON.Texture("/tex/hero_albedo.png", scene);
mat.normalTexture        = new BABYLON.Texture("/tex/hero_normal.png", scene);
mat.metallicTexture      = new BABYLON.Texture("/tex/hero_metallic.png", scene);

// Metallic-roughness via canais do metallicTexture
mat.useRoughnessFromMetallicTextureAlpha   = false;
mat.useRoughnessFromMetallicTextureGreen   = true;  // G = roughness
mat.useMetallnessFromMetallicTextureBlue   = true;  // B = metalness

mat.metallic  = 1.0; // multiplicador
mat.roughness = 1.0; // multiplicador

// Emissive (para efeitos de brilho, runes, olhos)
mat.emissiveTexture = new BABYLON.Texture("/tex/hero_emissive.png", scene);
mat.emissiveColor   = new BABYLON.Color3(1, 0.5, 0);

// Transparência
mat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATESTANDBLEND;
mat.albedoTexture.hasAlpha = true;
mat.useAlphaFromAlbedoTexture = true;
```

### Compressão de Texturas (KTX2) — ESSENCIAL para performance

```typescript
// Habilitar suporte a KTX2 comprimidos (BC7, ASTC, ETC2)
engine.setTextureFormatToUse([
  "-astc.ktx",   // mobile (iOS/Android)
  "-dxt.ktx",    // desktop NVIDIA/AMD  
  "-pvrtc.ktx",  // iOS legado
  "-etc2.ktx",   // Android legado
]);

// Depois, suas texturas são carregadas automaticamente na versão comprimida
const tex = new BABYLON.Texture("/tex/hero_albedo.png", scene);
// Engine procura hero_albedo-dxt.ktx, hero_albedo-astc.ktx etc.
```

**Por que isso importa?** Texturas comprimidas ficam comprimidas na memória da GPU (não apenas no disco). Uma textura 4K PNG ocupa ~64MB na VRAM. Em KTX2/BC7, a mesma textura ocupa ~10MB. Para um MMO isso é a diferença entre funcionar ou não.

### Texture Atlas e Sprite Sheets

```typescript
// Para UI, efeitos 2D e minimapa
const spriteManager = new BABYLON.SpriteManager(
  "items",
  "/tex/items_atlas.png",
  1000,  // capacidade máxima de sprites
  { width: 64, height: 64 }, // tamanho de cada frame
  scene
);

const sword = new BABYLON.Sprite("sword", spriteManager);
sword.position = new BABYLON.Vector3(3, 1, 0);
sword.cellIndex = 5; // frame no atlas
```

### Environment Map (IBL) — refletividade realista

```typescript
// HDR Environment para reflexos físicos
const hdrTexture = new BABYLON.HDRCubeTexture("/env/sky.hdr", scene, 512);
scene.environmentTexture = hdrTexture;
scene.environmentIntensity = 1.0;

// Skybox a partir do mesmo HDR
scene.createDefaultSkybox(hdrTexture, true, 1000, 0.3);
```

---

## 5. Iluminação e Sombras

### Tipos de Luz

```typescript
// Luz direcional (sol) — a principal para cenários externos
const sun = new BABYLON.DirectionalLight(
  "sun",
  new BABYLON.Vector3(-1, -2, -1),
  scene
);
sun.position = new BABYLON.Vector3(50, 100, 50); // importante para sombras
sun.intensity = 2.5;

// Hemisférica — ambient light natural sem sombras
const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0,1,0), scene);
hemi.intensity = 0.4;
hemi.groundColor = new BABYLON.Color3(0.1, 0.1, 0.15);

// Point Light — tochas, lâmpadas, explosões
const torch = new BABYLON.PointLight("torch", new BABYLON.Vector3(5, 3, 5), scene);
torch.intensity = 10;
torch.diffuse = new BABYLON.Color3(1, 0.6, 0.2);
torch.radius = 8;

// Spot Light — lanternas, faróis de carro, feixe de luz
const flashlight = new BABYLON.SpotLight(
  "flashlight",
  camera.position,
  camera.getForwardRay().direction,
  Math.PI / 6, // ângulo
  2,           // exponent
  scene
);
```

### Sombras de alta qualidade

```typescript
const shadowGen = new BABYLON.ShadowGenerator(2048, sun); // 2048 = resolução do shadow map
shadowGen.useBlurExponentialShadowMap = true; // sombras suaves (mais caro)
// Alternativas: usePoissonSampling (mais rápido), useExponentialShadowMap, useClosedExponentialShadowMap

// Todos os meshes que recebem / projetam sombra
shadowGen.addShadowCaster(heroMesh, true); // true = incluir filhos
terrainMesh.receiveShadows = true;

// Cascaded Shadow Maps — para mundos grandes (FPS, MMO open world)
const csmGenerator = new BABYLON.CascadedShadowGenerator(1024, sun);
csmGenerator.numCascades = 4;
csmGenerator.lambda = 0.5;
csmGenerator.stabilizeCascades = true;
csmGenerator.shadowMaxZ = 200;
```

**Macete de sombras:** Para jogos com muitos personagens, use `shadowGen.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE` e force re-render só quando os casters moverem. Economiza muita GPU.

---

## 6. Animações e Esqueletos

### AnimationGroups — a forma moderna de gerenciar animações

```typescript
const result = await BABYLON.SceneLoader.ImportMeshAsync("", "/", "hero.glb", scene);
const { animationGroups } = result;

// Liste todas as animações importadas
animationGroups.forEach(ag => console.log(ag.name));
// Ex: "Idle", "Walk", "Run", "Attack", "Death"

// Controle básico
const idle   = animationGroups.find(a => a.name === "Idle");
const walk   = animationGroups.find(a => a.name === "Walk");
const attack = animationGroups.find(a => a.name === "Attack");

idle.start(true); // true = loop
```

### Blending de animações (cross-fade suave)

```typescript
// Peso de animação — permite blend entre estados
idle.setWeightForAllAnimatables(0);
walk.setWeightForAllAnimatables(1);

// Transition suave entre idle e walk
const transitionDuration = 0.3; // segundos
let t = 0;

scene.registerBeforeRender(() => {
  const dt = engine.getDeltaTime() / 1000;
  if (isWalking) {
    t = Math.min(t + dt / transitionDuration, 1);
  } else {
    t = Math.max(t - dt / transitionDuration, 0);
  }
  walk.setWeightForAllAnimatables(t);
  idle.setWeightForAllAnimatables(1 - t);
});
```

### Máquina de Estados de Animação (padrão robusto)

```typescript
enum AnimState { IDLE, WALK, RUN, ATTACK, DEATH }

class AnimationStateMachine {
  private current: BABYLON.AnimationGroup;
  private groups: Map<AnimState, BABYLON.AnimationGroup>;
  private blendWeight = 0;

  constructor(animGroups: BABYLON.AnimationGroup[]) {
    this.groups = new Map([
      [AnimState.IDLE,   animGroups.find(a => a.name === "Idle")!],
      [AnimState.WALK,   animGroups.find(a => a.name === "Walk")!],
      [AnimState.RUN,    animGroups.find(a => a.name === "Run")!],
      [AnimState.ATTACK, animGroups.find(a => a.name === "Attack")!],
      [AnimState.DEATH,  animGroups.find(a => a.name === "Death")!],
    ]);
    this.current = this.groups.get(AnimState.IDLE)!;
    this.current.start(true);
  }

  transition(next: AnimState, loop = true) {
    const nextGroup = this.groups.get(next)!;
    if (nextGroup === this.current) return;
    nextGroup.start(loop, 1, nextGroup.from, nextGroup.to, true);
    this.current.stop();
    this.current = nextGroup;
  }
}
```

### Animações procedurais — IK e bone targeting

```typescript
// Apontar a cabeça para um alvo (look-at procedural)
const skeleton = result.skeletons[0];
const headBone = skeleton.bones.find(b => b.name === "Head")!;

scene.registerBeforeRender(() => {
  const targetWorld = target.getAbsolutePosition();
  // BoneIKController para membros
  const ikCtrl = new BABYLON.BoneIKController(heroMesh, armBone, {
    targetMesh: weaponTarget,
    poleTargetMesh: elbowTarget,
    slerpAmount: 0.5,
  });
  ikCtrl.update();
});
```

### AnimationKey e curvas customizadas

```typescript
// Animação programática (para objetos de cenário, UI, efeitos)
const anim = new BABYLON.Animation(
  "doorOpen",
  "rotation.y",
  60, // frames por segundo
  BABYLON.Animation.ANIMATIONTYPE_FLOAT,
  BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
);

anim.setKeys([
  { frame: 0,  value: 0 },
  { frame: 30, value: Math.PI / 2 },
  { frame: 60, value: Math.PI / 2 },
]);

// Easing — animação com aceleração natural
const ease = new BABYLON.CubicEase();
ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
anim.setEasingFunction(ease);

door.animations.push(anim);
scene.beginAnimation(door, 0, 60, false);
```

---

## 7. Física e Colisão

### Havok Physics (plugin nativo — recomendado 2024+)

```typescript
import HavokPhysics from "@babylonjs/havok";

const havokInstance = await HavokPhysics();
const physicsPlugin = new BABYLON.HavokPlugin(true, havokInstance);
scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), physicsPlugin);

// Adicionar corpo físico a um mesh
const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

// Personagem com física
const playerBody = BABYLON.MeshBuilder.CreateCapsule("player", { radius: 0.5, height: 2 }, scene);
const playerAggregate = new BABYLON.PhysicsAggregate(
  playerBody,
  BABYLON.PhysicsShapeType.CAPSULE,
  { mass: 80, restitution: 0, friction: 0.8 },
  scene
);
```

### Character Controller físico (FPS/TPS)

```typescript
// Movimentação baseada em física — sem "deslizamento" em rampas
scene.registerBeforeRender(() => {
  const velocity = playerAggregate.body.getLinearVelocity();
  const input   = getInputVector(); // WASD normalizado

  // Manter velocidade vertical (gravidade) mas controlar horizontal
  const desiredVel = input.scale(moveSpeed);
  playerAggregate.body.setLinearVelocity(
    new BABYLON.Vector3(desiredVel.x, velocity.y, desiredVel.z)
  );

  // Rotacionar o personagem para a direção do movimento
  if (input.length() > 0.01) {
    const angle = Math.atan2(input.x, input.z);
    playerBody.rotation.y = BABYLON.Scalar.LerpAngle(
      playerBody.rotation.y, angle, 0.15
    );
  }
});

// Pulo
const onJump = () => {
  if (isGrounded()) {
    playerAggregate.body.applyImpulse(
      new BABYLON.Vector3(0, 400, 0),
      playerBody.getAbsolutePosition()
    );
  }
};
```

### Detecção de chão (grounded check)

```typescript
const isGrounded = (): boolean => {
  const ray = new BABYLON.Ray(
    playerBody.getAbsolutePosition(),
    new BABYLON.Vector3(0, -1, 0),
    1.1 // distância do cast
  );
  const hit = scene.pickWithRay(ray, m => m !== playerBody);
  return hit?.hit === true;
};
```

### Raycasting para hit detection (FPS Hitscan)

```typescript
// Bala hitscan — ray da câmera ao centro da tela
const shoot = () => {
  const ray = scene.createPickingRay(
    engine.getRenderWidth() / 2,
    engine.getRenderHeight() / 2,
    BABYLON.Matrix.Identity(),
    camera
  );

  const hit = scene.pickWithRay(ray, mesh => mesh.isPickable && mesh !== playerBody);
  if (hit?.hit && hit.pickedMesh) {
    const enemy = hit.pickedMesh.metadata?.enemyRef as Enemy;
    enemy?.takeDamage(25);
    spawnBulletHoleDecal(hit.pickedPoint!, hit.getNormal()!);
  }
};
```

---

## 8. Partículas e Efeitos Visuais

### Sistema de Partículas completo

```typescript
// Fogo
const fire = new BABYLON.ParticleSystem("fire", 2000, scene);
fire.particleTexture = new BABYLON.Texture("/fx/flare.png", scene);
fire.emitter = torchMesh;
fire.minEmitBox = new BABYLON.Vector3(-0.1, 0, -0.1);
fire.maxEmitBox = new BABYLON.Vector3(0.1, 0, 0.1);

fire.color1 = new BABYLON.Color4(1, 0.5, 0, 1);
fire.color2 = new BABYLON.Color4(1, 0.1, 0, 1);
fire.colorDead = new BABYLON.Color4(0.1, 0.1, 0.1, 0);

fire.minSize = 0.1;
fire.maxSize = 0.3;
fire.minLifeTime = 0.2;
fire.maxLifeTime = 0.8;

fire.emitRate = 200;
fire.direction1 = new BABYLON.Vector3(-0.5, 4, -0.5);
fire.direction2 = new BABYLON.Vector3(0.5, 4, 0.5);
fire.gravity = new BABYLON.Vector3(0, -2, 0);
fire.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD; // blend aditivo para fogo/magia
fire.start();
```

### GPU Particle System (para centenas de milhares de partículas)

```typescript
// GPUParticleSystem roda inteiro na GPU — ideal para chuva, neve, multidões
const rain = new BABYLON.GPUParticleSystem("rain", { capacity: 50000 }, scene);
rain.particleTexture = new BABYLON.Texture("/fx/raindrop.png", scene);
rain.emitter = new BABYLON.Vector3(0, 30, 0);
rain.minEmitBox = new BABYLON.Vector3(-50, 0, -50);
rain.maxEmitBox = new BABYLON.Vector3(50, 0, 50);
rain.gravity = new BABYLON.Vector3(0, -30, 0);
rain.direction1 = new BABYLON.Vector3(-0.1, -1, -0.1);
rain.direction2 = new BABYLON.Vector3(0.1, -1, 0.1);
rain.minLifeTime = 0.5;
rain.maxLifeTime = 1.0;
rain.emitRate = 5000;
rain.start();
```

### Solid Particle System (SPS) — para projéteis e objetos físicos em massa

```typescript
// SPS para 1000 setas/projéteis com física simples customizada
const sps = new BABYLON.SolidParticleSystem("arrows", scene);
const arrow = BABYLON.MeshBuilder.CreateCylinder("arrow", { height: 0.5, diameter: 0.05 }, scene);
sps.addShape(arrow, 1000);
arrow.dispose();

const spsMesh = sps.buildMesh();
spsMesh.material = arrowMaterial;

sps.initParticles = () => {
  for (let i = 0; i < sps.nbParticles; i++) {
    sps.particles[i].isVisible = false;
    sps.particles[i].velocity = BABYLON.Vector3.Zero();
  }
};

// No loop de atualização
sps.updateParticle = (p) => {
  if (!p.isVisible) return p;
  p.velocity.y -= 9.81 * dt; // gravidade
  p.position.addInPlace(p.velocity.scale(dt));
  if (p.position.y < 0) p.isVisible = false;
  return p;
};

sps.setParticles(); // chame no render loop
```

---

## 9. Pós-Processamento

### Pipeline de Renderização Padrão (qualidade AAA)

```typescript
const pipeline = new BABYLON.DefaultRenderingPipeline(
  "pipeline",
  true, // HDR
  scene,
  [camera]
);

// FXAA / MSAA
pipeline.fxaaEnabled  = true;
pipeline.samples      = 4; // MSAA 4x (cuidado: caro com transparência)

// Bloom (brilho em áreas claras — essencial para magia/explosões)
pipeline.bloomEnabled    = true;
pipeline.bloomThreshold  = 0.8;
pipeline.bloomWeight     = 0.4;
pipeline.bloomKernel     = 64;
pipeline.bloomScale      = 0.5;

// Depth of Field (desfoque de profundidade)
pipeline.depthOfFieldEnabled     = true;
pipeline.depthOfFieldBlurLevel   = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
pipeline.depthOfField.focalLength = 150;
pipeline.depthOfField.fStop       = 1.4;
pipeline.depthOfField.focusDistance = 2000;

// Tone mapping e color grading
pipeline.imageProcessingEnabled = true;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
pipeline.imageProcessing.exposure = 1.0;
pipeline.imageProcessing.contrast = 1.1;
pipeline.imageProcessing.vignetteEnabled = true;
pipeline.imageProcessing.vignetteWeight = 1.5;

// Sharpening
pipeline.sharpenEnabled = true;
pipeline.sharpen.edgeAmount = 0.3;

// Chromatic Aberration (distorção de lente — dano/impacto)
pipeline.chromaticAberrationEnabled = true;
pipeline.chromaticAberration.aberrationAmount = 1;
```

### Motion Blur

```typescript
const motionBlur = new BABYLON.MotionBlurPostProcess(
  "motionBlur", scene, 1.0, camera
);
motionBlur.motionStrength = 0.3;
motionBlur.motionBlurSamples = 32;
```

### Screen Space Ambient Occlusion (SSAO2)

```typescript
const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, {
  ssaoRatio: 0.5,   // renderiza SSAO na metade da res para performance
  blurRatio: 1.0,
});
ssao.radius     = 3.5;
ssao.totalStrength = 1.3;
ssao.base       = 0.1;
ssao.maxZ       = 100;
scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", camera);
```

### Glow Layer (runes, magia, energia)

```typescript
const glow = new BABYLON.GlowLayer("glow", scene);
glow.intensity = 1.0;

// Só aplica glow em meshes específicos
glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
  if (mesh.name.includes("magic")) {
    result.set(0, 0.5, 1, 1); // azul mágico
  } else {
    result.set(0, 0, 0, 0);   // sem glow
  }
};

// Highlight Layer — contorno de seleção (Hack & Slash, MMO)
const highlight = new BABYLON.HighlightLayer("hl", scene);
highlight.addMesh(selectedEnemy, BABYLON.Color3.Red());
highlight.outerGlow = true;
highlight.blurHorizontalSize = 0.5;
highlight.blurVerticalSize   = 0.5;
```

---

## 10. Som e Áudio Espacial

### Som 3D espacial (essencial para FPS/MMO)

```typescript
// Habilitar engine de áudio
const audioEngine = BABYLON.Engine.audioEngine!;
audioEngine.useCustomUnlockedButton = false;

// Som 3D posicional (passos, vozes de NPCs, combate)
const footstep = new BABYLON.Sound(
  "footstep",
  "/sfx/step_stone.ogg",
  scene,
  null,
  {
    loop: false,
    autoplay: false,
    spatialSound: true,
    maxDistance: 20,
    rolloffFactor: 2,
    distanceModel: "exponential",
  }
);
footstep.setPosition(new BABYLON.Vector3(10, 0, 5));
footstep.play();

// Anexar som a um mesh (segue o objeto)
const enemyGrowl = new BABYLON.Sound("growl", "/sfx/orc_growl.ogg", scene, null, {
  spatialSound: true, loop: true, autoplay: true,
});
enemyGrowl.attachToMesh(enemyMesh);
```

### Música ambiente e transições

```typescript
// Fade crossfade entre músicas
const musicCombat = new BABYLON.Sound("combat", "/music/combat.ogg", scene, null, { loop: true, volume: 0 });
const musicExplore = new BABYLON.Sound("explore", "/music/explore.ogg", scene, null, { loop: true, volume: 1 });

const crossfadeTo = (next: BABYLON.Sound, duration = 3000) => {
  const current = [musicCombat, musicExplore].find(m => m.isPlaying && m !== next);
  if (current) {
    const start = performance.now();
    const tick = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      current.setVolume(1 - t);
      next.setVolume(t);
      if (t < 1) requestAnimationFrame(tick);
      else current.stop();
    };
    next.play();
    tick();
  }
};
```

### Análise de áudio (reatividade — visualizadores, efeitos)

```typescript
// Som reativo — beat detection para efeitos de câmera/world
const track = new BABYLON.Sound("music", "/music/boss.ogg", scene, null, { loop: true });
track.play();

// Acessar analyser node da Web Audio API
const analyser = new BABYLON.Analyser(scene);
BABYLON.Engine.audioEngine!.connectToAnalyser(analyser);
analyser.FFT_SIZE = 512;
analyser.SMOOTHING = 0.9;

scene.registerBeforeRender(() => {
  const level = analyser.getByteFrequencyData();
  const bass = level.slice(0, 10).reduce((a, b) => a + b, 0) / 10 / 255;
  camera.position.y += Math.sin(Date.now() * 0.001) * bass * 0.02; // câmera pulsando
});
```

---

## 11. GUI e HUD em Jogo

### AdvancedDynamicTexture — HUD 2D completo

```typescript
const hud = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("HUD");

// Barra de vida
const healthBarBg = new BABYLON.GUI.Rectangle("hpBg");
healthBarBg.width  = "200px";
healthBarBg.height = "20px";
healthBarBg.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
healthBarBg.verticalAlignment   = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
healthBarBg.left = "20px";
healthBarBg.top  = "20px";
healthBarBg.background = "#333";
healthBarBg.cornerRadius = 5;
hud.addControl(healthBarBg);

const healthBar = new BABYLON.GUI.Rectangle("hp");
healthBar.width  = "100%";
healthBar.height = "100%";
healthBar.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
healthBar.background = "#e74c3c";
healthBar.cornerRadius = 5;
healthBarBg.addControl(healthBar);

// Atualizar barra de vida
const updateHP = (current: number, max: number) => {
  healthBar.width = `${(current / max) * 100}%`;
};

// Dano flutuante (damage numbers)
const showDamageNumber = (worldPos: BABYLON.Vector3, damage: number) => {
  const txt = new BABYLON.GUI.TextBlock();
  txt.text = `-${damage}`;
  txt.color = damage > 100 ? "#f1c40f" : "#e74c3c";
  txt.fontSize = damage > 100 ? 28 : 20;
  txt.fontStyle = "bold";
  hud.addControl(txt);

  // Billboard — acompanha posição 3D
  txt.linkWithMesh(null);
  const update = () => {
    const coords = BABYLON.Vector3.Project(
      worldPos,
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );
    txt.left = `${coords.x - engine.getRenderWidth() / 2}px`;
    txt.top  = `${coords.y - engine.getRenderHeight() / 2 - 30}px`;
    worldPos.y += 0.02;
  };

  let frame = 0;
  const obs = scene.registerBeforeRender(() => {
    update();
    txt.alpha = 1 - frame / 60;
    if (++frame >= 60) {
      scene.unregisterBeforeRender(obs);
      hud.removeControl(txt);
    }
  });
};
```

### GUI 3D (nameplates, health bars em mundo)

```typescript
// Para MMO: nome do player acima da cabeça
const guiPlane = BABYLON.MeshBuilder.CreatePlane("nameplate", { width: 2, height: 0.5 }, scene);
guiPlane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
guiPlane.parent = playerMesh;
guiPlane.position.y = 2.5;

const nameTex = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(guiPlane, 256, 64);
const nameTxt = new BABYLON.GUI.TextBlock();
nameTxt.text = "PlayerName";
nameTxt.color = "#fff";
nameTxt.fontSize = 32;
nameTex.addControl(nameTxt);
```

---

## 12. Input e Controles do Jogador

### Sistema de Input robusto

```typescript
class InputManager {
  private keys: Set<string> = new Set();
  public mouse = { dx: 0, dy: 0, buttons: new Set<number>() };

  constructor(private scene: BABYLON.Scene) {
    window.addEventListener("keydown", e => this.keys.add(e.code));
    window.addEventListener("keyup",   e => this.keys.delete(e.code));
    
    scene.getEngine().getRenderingCanvas()!.addEventListener("mousemove", e => {
      this.mouse.dx = e.movementX;
      this.mouse.dy = e.movementY;
    });

    window.addEventListener("mousedown", e => this.mouse.buttons.add(e.button));
    window.addEventListener("mouseup",   e => this.mouse.buttons.delete(e.button));

    // Reset deltas no fim de cada frame
    scene.registerAfterRender(() => { this.mouse.dx = 0; this.mouse.dy = 0; });
  }

  isDown(code: string) { return this.keys.has(code); }
  
  getMovement(): BABYLON.Vector3 {
    let x = 0, z = 0;
    if (this.isDown("KeyW") || this.isDown("ArrowUp"))    z += 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown"))  z -= 1;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft"))  x -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    return new BABYLON.Vector3(x, 0, z).normalize();
  }
}
```

### Gamepad support

```typescript
scene.gamepadManager.onGamepadConnectedObservable.add((gamepad) => {
  if (gamepad instanceof BABYLON.Xbox360Pad) {
    gamepad.onleftstickchanged(values => {
      // values.x, values.y — movimento
    });
    gamepad.onButtonDownObservable.add(button => {
      if (button === BABYLON.Xbox360Button.A) onJump();
      if (button === BABYLON.Xbox360Button.X) onAttack();
    });
  }
});
```

---

## 13. Multiplayer e Rede (MMO)

### Arquitetura com Colyseus (servidor autoritativo)

```typescript
// cliente (Babylon.js)
import * as Colyseus from "colyseus.js";

const client = new Colyseus.Client("wss://seu-servidor.com");
const room   = await client.joinOrCreate<GameRoomState>("game_room", {
  character: "warrior",
  name: "PlayerName",
});

// Receber estado do servidor
room.state.players.onAdd((player, sessionId) => {
  if (sessionId === room.sessionId) return; // já criamos o próprio player

  const remoteMesh = createRemotePlayer(player);
  
  player.onChange(() => {
    // Interpolação de posição suave (evita jitter de rede)
    remotePositions[sessionId] = {
      target: new BABYLON.Vector3(player.x, player.y, player.z),
      rotation: player.rotY,
    };
  });
});

room.state.players.onRemove((player, sessionId) => {
  remoteMeshes[sessionId]?.dispose();
});

// Enviar input para o servidor (não envie posição! envie input)
const sendInput = () => {
  room.send("input", {
    moveX: inputManager.getMovement().x,
    moveZ: inputManager.getMovement().z,
    attack: inputManager.isDown("Mouse0"),
    seq: sequenceNumber++,
  });
};
```

### Interpolação de entidades remotas

```typescript
// Interpolar posições remotas para eliminar jitter de rede
scene.registerBeforeRender(() => {
  const dt = engine.getDeltaTime() / 1000;
  for (const [id, data] of Object.entries(remotePositions)) {
    const mesh = remoteMeshes[id];
    if (!mesh) continue;
    mesh.position = BABYLON.Vector3.Lerp(mesh.position, data.target, Math.min(dt * 15, 1));
    mesh.rotation.y = BABYLON.Scalar.LerpAngle(mesh.rotation.y, data.rotation, Math.min(dt * 15, 1));
  }
});
```

### Client-Side Prediction (FPS/MMO)

```typescript
// Aplica input localmente sem esperar confirmação do servidor
const pendingInputs: InputSnapshot[] = [];
let sequenceNumber = 0;

const processInput = (input: InputSnapshot) => {
  // Mova o player localmente
  const vel = new BABYLON.Vector3(input.moveX, 0, input.moveZ).scale(moveSpeed);
  playerBody.position.addInPlace(vel.scale(input.dt));
};

// Ao receber estado do servidor
room.onMessage("server_state", (state) => {
  // Reconciliar: volta à posição do servidor e re-aplica inputs pendentes
  playerBody.position.set(state.x, state.y, state.z);
  const acks = pendingInputs.filter(i => i.seq > state.lastProcessedSeq);
  acks.forEach(processInput);
});
```

---

## 14. Otimização de Performance

### Scene Optimizer automático

```typescript
const optimizer = new BABYLON.SceneOptimizer(scene);

// Adicionar otimizações em cascata (do menos ao mais agressivo)
optimizer.optimizations.push(new BABYLON.TextureOptimization(0, 512));    // reduz texturas
optimizer.optimizations.push(new BABYLON.HardwareScalingOptimization(1, 2)); // upscale
optimizer.optimizations.push(new BABYLON.ShadowsOptimization(2));          // desativa sombras
optimizer.optimizations.push(new BABYLON.RenderTargetsOptimization(3));    // desativa RTT
optimizer.optimizations.push(new BABYLON.ParticlesOptimization(4));        // desativa partículas

optimizer.targetFrameRate = 60;
optimizer.trackerDuration  = 2000;
optimizer.start();
```

### Frustum Culling e Occlusion Culling

```typescript
// Babylon já faz frustum culling automaticamente, mas você pode controlar:
mesh.isPickable = false;    // nunca participar de raycasts desnecessários
mesh.alwaysSelectAsActiveMesh = false; // deixa o culling trabalhar

// Occlusion culling via hardware queries (objetos atrás de paredes)
mesh.occlusionType = BABYLON.AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
mesh.occlusionRetryCount = 1;
```

### Freeze e otimizações estáticas

```typescript
// Objetos estáticos (paredes, chão, arvores) — congela transforms e materiais
staticMesh.freezeWorldMatrix();
staticMesh.material!.freeze(); // compila o shader uma vez e não recompila

// Congela a hierarquia inteira de um level chunk
const freezeHierarchy = (root: BABYLON.AbstractMesh) => {
  root.getChildMeshes(false).forEach(m => {
    m.freezeWorldMatrix();
    (m.material as BABYLON.PBRMaterial)?.freeze();
  });
};
```

### Batching e Draw Calls

```typescript
// Ver draw calls em tempo real (Inspector)
scene.debugLayer.show({ embedMode: true });

// Regra de ouro: menos draw calls = mais FPS
// Cada mesh visível = 1 draw call mínimo
// 500 draw calls = ~60fps em hardware médio
// 2000+ draw calls = problemas no mobile

// Usar mergeMeshes para objetos estáticos do mesmo material
// Usar instances para objetos iguais (árvores, pedras, inimigos)
// Usar thinInstances para MUITOS objetos (grama, partículas de cenário)
```

### Object Pooling (para projéteis, inimigos, efeitos)

```typescript
class MeshPool {
  private pool: BABYLON.Mesh[] = [];
  private active: Set<BABYLON.Mesh> = new Set();

  constructor(private factory: () => BABYLON.Mesh, private size: number) {
    for (let i = 0; i < size; i++) {
      const m = factory();
      m.isVisible = false;
      this.pool.push(m);
    }
  }

  acquire(): BABYLON.Mesh | null {
    const mesh = this.pool.pop();
    if (!mesh) return null;
    mesh.isVisible = true;
    this.active.add(mesh);
    return mesh;
  }

  release(mesh: BABYLON.Mesh) {
    mesh.isVisible = false;
    this.active.delete(mesh);
    this.pool.push(mesh);
  }
}

// Uso para projéteis
const bulletPool = new MeshPool(
  () => BABYLON.MeshBuilder.CreateSphere("bullet", { diameter: 0.1 }, scene),
  200
);
```

---

## 15. Arquitetura para FPS

### Game Loop FPS completo

```typescript
class FPSGame {
  private player: FPSPlayer;
  private enemies: Enemy[] = [];
  private inputMgr: InputManager;
  private bulletPool: MeshPool;

  constructor(private scene: BABYLON.Scene, private engine: BABYLON.Engine) {
    this.inputMgr = new InputManager(scene);
    this.player   = new FPSPlayer(scene, engine);
    this.bulletPool = new MeshPool(() => createBulletMesh(scene), 200);

    scene.registerBeforeRender(() => this.update(engine.getDeltaTime() / 1000));
  }

  private update(dt: number) {
    // 1. Processar input
    const moveInput = this.inputMgr.getMovement();
    this.player.move(moveInput, dt);
    this.player.rotateCamera(this.inputMgr.mouse.dx, this.inputMgr.mouse.dy);

    // 2. Atirar
    if (this.inputMgr.mouse.buttons.has(0)) {
      this.player.shoot(this.bulletPool);
    }

    // 3. Atualizar inimigos
    this.enemies.forEach(e => e.update(dt, this.player.position));

    // 4. Verificar colisões projétil-inimigo
    this.checkProjectileCollisions();
  }
}

class FPSPlayer {
  public position: BABYLON.Vector3;
  private camera: BABYLON.UniversalCamera;
  private weapon: WeaponController;

  move(input: BABYLON.Vector3, dt: number) {
    // Transformar input do espaço da câmera para o espaço do mundo
    const forward = this.camera.getForwardRay().direction;
    const right   = BABYLON.Vector3.Cross(forward, BABYLON.Vector3.Up());
    forward.y = 0; forward.normalize();
    right.y   = 0; right.normalize();

    const worldMove = forward.scale(input.z).add(right.scale(input.x));
    this.camera.position.addInPlace(worldMove.scale(5 * dt));
  }
}
```

### Weapon Sway e Bob (realismo de arma)

```typescript
class WeaponController {
  private weaponMesh: BABYLON.Mesh;
  private basePosLocal = new BABYLON.Vector3(0.3, -0.3, 0.8);
  private time = 0;

  update(dt: number, speed: number, isMoving: boolean) {
    this.time += dt;
    const bobAmt = isMoving ? speed * 0.02 : 0;
    
    // Bob de movimento
    const bobX = Math.sin(this.time * 10) * bobAmt;
    const bobY = Math.abs(Math.cos(this.time * 10)) * bobAmt * 0.5;

    // Sway de mouse (segue a câmera com lag)
    const swayX = -inputMgr.mouse.dx * 0.001;
    const swayY = -inputMgr.mouse.dy * 0.001;

    this.weaponMesh.position = BABYLON.Vector3.Lerp(
      this.weaponMesh.position,
      this.basePosLocal.add(new BABYLON.Vector3(bobX + swayX, bobY + swayY, 0)),
      dt * 10
    );
  }
}
```

---

## 16. Arquitetura para MMO

### Chunk System para mundo grande

```typescript
const CHUNK_SIZE = 64;
const LOAD_RADIUS = 3; // chunks em torno do player
const loadedChunks = new Map<string, ChunkData>();

const getChunkKey = (cx: number, cz: number) => `${cx}_${cz}`;

const updateChunkLoading = async (playerPos: BABYLON.Vector3) => {
  const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
  const pcz = Math.floor(playerPos.z / CHUNK_SIZE);

  // Carregar chunks próximos
  for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      const key = getChunkKey(pcx + dx, pcz + dz);
      if (!loadedChunks.has(key)) {
        loadedChunks.set(key, await loadChunk(pcx + dx, pcz + dz));
      }
    }
  }

  // Descarregar chunks distantes
  for (const [key, chunk] of loadedChunks) {
    const [cx, cz] = key.split("_").map(Number);
    if (Math.abs(cx - pcx) > LOAD_RADIUS + 1 || Math.abs(cz - pcz) > LOAD_RADIUS + 1) {
      chunk.dispose();
      loadedChunks.delete(key);
    }
  }
};
```

### Sistema de entidades para MMO (ECS leve)

```typescript
// Entity Component System simplificado
interface Component { update(dt: number): void; }

class Entity {
  public id: string;
  private components = new Map<string, Component>();

  addComponent<T extends Component>(name: string, comp: T): T {
    this.components.set(name, comp);
    return comp;
  }

  getComponent<T extends Component>(name: string): T {
    return this.components.get(name) as T;
  }

  update(dt: number) {
    this.components.forEach(c => c.update(dt));
  }
}

class EntityManager {
  private entities = new Map<string, Entity>();

  spawn(id: string): Entity {
    const e = new Entity();
    this.entities.set(id, e);
    return e;
  }

  despawn(id: string) {
    this.entities.get(id)?.getComponent<MeshComponent>("mesh").dispose();
    this.entities.delete(id);
  }

  update(dt: number) {
    this.entities.forEach(e => e.update(dt));
  }
}
```

---

## 17. Arquitetura para Hack & Slash

### Sistema de Combate (hitboxes e ataques)

```typescript
class CombatSystem {
  // Hitbox de ataque baseada em arco
  checkMeleeHit(attacker: BABYLON.Mesh, enemies: Enemy[], range: number, arc: number): Enemy[] {
    const forward = attacker.getDirection(BABYLON.Vector3.Forward());
    return enemies.filter(e => {
      const toEnemy = e.mesh.position.subtract(attacker.position);
      const dist = toEnemy.length();
      if (dist > range) return false;
      
      toEnemy.normalize();
      const dot = BABYLON.Vector3.Dot(forward, toEnemy);
      return dot > Math.cos(arc / 2); // dentro do arco
    });
  }

  // Combo system
  private comboState = 0;
  private comboTimer = 0;
  private readonly COMBO_WINDOW = 0.8;

  onAttackInput(dt: number): AttackData | null {
    this.comboTimer -= dt;
    
    if (this.comboTimer <= 0) this.comboState = 0;

    if (inputMgr.isDown("Mouse0")) {
      this.comboState = (this.comboState + 1) % 3;
      this.comboTimer = this.COMBO_WINDOW;
      
      const attacks = ["Attack1", "Attack2", "Attack3"];
      return { animName: attacks[this.comboState], damage: [20, 25, 40][this.comboState] };
    }
    return null;
  }
}
```

### Targeting e Lock-On

```typescript
class TargetingSystem {
  private locked: Enemy | null = null;

  lockNearest(playerPos: BABYLON.Vector3, enemies: Enemy[], maxDist = 15): void {
    let nearest: Enemy | null = null;
    let minDist = maxDist;

    enemies.forEach(e => {
      if (!e.isAlive) return;
      const d = BABYLON.Vector3.Distance(playerPos, e.mesh.position);
      if (d < minDist) {
        minDist = d;
        nearest = e;
      }
    });

    if (this.locked) this.locked.setTargetIndicator(false);
    this.locked = nearest;
    if (this.locked) this.locked.setTargetIndicator(true);
  }

  // Câmera orbita em torno do alvo
  updateCameraLockOn(camera: BABYLON.ArcRotateCamera, dt: number) {
    if (!this.locked) return;
    const midpoint = BABYLON.Vector3.Lerp(
      playerMesh.position, this.locked.mesh.position, 0.5
    );
    camera.target = BABYLON.Vector3.Lerp(camera.target, midpoint, dt * 5);
  }
}
```

---

## 18. Node Material Editor (NME)

O NME é uma das ferramentas mais poderosas do Babylon.js. Permite criar shaders visualmente sem escrever GLSL.

```typescript
// Carregar um material criado no NME e salvo como JSON
const nodeMat = await BABYLON.NodeMaterial.ParseFromSnippetAsync("#SNIPPET_ID", scene);
// ou a partir de arquivo
const nodeMat2 = await BABYLON.NodeMaterial.ParseFromFileAsync("heroShader", "/shaders/hero_nme.json", scene);
mesh.material = nodeMat;

// Expor parâmetros do NME para controle em código
const colorParam = nodeMat.getBlockByName("TeamColor") as BABYLON.InputBlock;
colorParam.value = new BABYLON.Color3(1, 0, 0); // time vermelho

// Animação de parâmetro do shader (pulsação mágica)
const timeParam = nodeMat.getBlockByName("Time") as BABYLON.InputBlock;
scene.registerBeforeRender(() => {
  timeParam.value = performance.now() / 1000;
});
```

**Casos de uso no NME:**
- Dissolve effect (morte de inimigo)
- Outline shader estilo cel-shading
- Água com normal maps animadas
- Terrain blending multi-camada
- Efeitos de dano (flash vermelho)
- Camuflagem/invisibilidade distortion

---

## 19. Shaders Customizados (GLSL)

### ShaderMaterial

```typescript
const shaderMat = new BABYLON.ShaderMaterial(
  "customShader",
  scene,
  {
    vertex:   "custom",   // custom.vertex.fx
    fragment: "custom",   // custom.fragment.fx
  },
  {
    attributes: ["position", "normal", "uv"],
    uniforms:   ["world", "worldViewProjection", "time", "playerPos"],
    samplers:   ["textureSampler", "normalSampler"],
  }
);

// Atualizar uniforms
scene.registerBeforeRender(() => {
  shaderMat.setFloat("time", performance.now() / 1000);
  shaderMat.setVector3("playerPos", camera.position);
});
```

```glsl
// custom.vertex.fx
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 worldViewProjection;
uniform float time;

varying vec2 vUV;
varying vec3 vNormal;

void main() {
  vec3 pos = position;
  // Exemplo: ondulação de bandeira
  pos.y += sin(pos.x * 3.0 + time * 2.0) * 0.1;
  gl_Position = worldViewProjection * vec4(pos, 1.0);
  vUV     = uv;
  vNormal = normal;
}
```

```glsl
// custom.fragment.fx
precision highp float;
uniform sampler2D textureSampler;
varying vec2 vUV;

void main() {
  vec4 color = texture2D(textureSampler, vUV);
  // Rim lighting simples
  float rim = 1.0 - dot(normalize(vNormal), normalize(vec3(0,0,-1)));
  color.rgb += vec3(0.2, 0.5, 1.0) * pow(rim, 3.0);
  gl_FragColor = color;
}
```

---

## 20. Mundo Aberto, Terreno e Streaming

### Geração de terreno procedural

```typescript
// Terrain a partir de heightmap
const ground = BABYLON.MeshBuilder.CreateGroundFromHeightMap(
  "terrain",
  "/terrain/heightmap.png",
  {
    width: 512, height: 512,
    subdivisions: 256,   // resolução — mais = mais fiel mas mais vértices
    minHeight: 0,
    maxHeight: 50,
    onReady: (mesh) => {
      mesh.checkCollisions = true;
      mesh.receiveShadows  = true;
      applyTerrainMaterial(mesh);
    },
  },
  scene
);

// Material de terreno com blend de texturas por altitude
const terrainMat = new BABYLON.StandardMaterial("terrainMat", scene);
// (use o NME para blend multi-camada de verdade)
```

### Streaming de assets por distância

```typescript
// Lazy load de objetos distantes
class LODStreamer {
  private loadedObjects = new Map<string, BABYLON.AbstractMesh>();

  async update(playerPos: BABYLON.Vector3, worldObjects: WorldObject[]) {
    for (const obj of worldObjects) {
      const dist = BABYLON.Vector3.Distance(playerPos, obj.position);
      const key  = obj.id;

      if (dist < obj.loadDist && !this.loadedObjects.has(key)) {
        // Carregar
        const result = await BABYLON.SceneLoader.ImportMeshAsync("", "/assets/", obj.file, scene);
        const mesh = result.meshes[0];
        mesh.position = obj.position.clone();
        this.loadedObjects.set(key, mesh);

      } else if (dist > obj.unloadDist && this.loadedObjects.has(key)) {
        // Descarregar
        this.loadedObjects.get(key)!.dispose();
        this.loadedObjects.delete(key);
      }
    }
  }
}
```

---

## 21. LOD e Culling

### LOD automático (Level of Detail)

```typescript
// Criar LODs para um personagem
const heroHigh   = await loadMesh("hero_high.glb");   // 8000 triângulos
const heroMedium = await loadMesh("hero_medium.glb"); // 2000 triângulos
const heroLow    = await loadMesh("hero_low.glb");    // 500 triângulos

// Definir LODs com distâncias
heroHigh.addLODLevel(30, heroMedium);   // >30 unidades: usa medium
heroHigh.addLODLevel(80, heroLow);      // >80 unidades: usa low
heroHigh.addLODLevel(150, null);         // >150 unidades: invisível (dispose visual)
```

### BoundingBox e Octree para cenas grandes

```typescript
// Octree — acelera raycasts e culling em cenas com 1000+ meshes
scene.createOrUpdateSelectionOctree(32, 2); // maxDepth=32, maxBlockSize=2

// Sempre chame após adicionar meshes à cena em bulk
// Para atualizar quando meshes mudam de posição
scene.selectionOctree?.update();
```

---

## 22. Asset Pipeline e Ferramentas

### Melhores formatos para Babylon.js

| Asset | Formato preferido | Motivo |
|-------|------------------|--------|
| Modelos 3D | `.glb` | Binário, compacto, suporte completo a PBR |
| Texturas | `.ktx2` | Comprimido na GPU (BC7/ASTC) |
| Audio | `.ogg` + `.mp3` | `.ogg` para todos exceto Safari |
| Heightmaps | `.png` 16-bit | Precisão de altitude |
| Animações | Embutido no `.glb` | Animações já no arquivo |

### Babylon.js Inspector (ferramenta essencial)

```typescript
// Ativar o Inspector em dev
if (process.env.NODE_ENV === "development") {
  scene.debugLayer.show({
    embedMode: true,
    globalRoot: document.getElementById("debug-root")!,
  });
}

// Inspector permite:
// - Ver todos os meshes, materiais, texturas, luzes
// - Inspecionar animações e esqueletos
// - Medir draw calls e performance em tempo real
// - Editar propriedades ao vivo
// - Exportar cena para Sandbox
```

### Babylon.js Sandbox

Teste seus arquivos `.glb` diretamente em https://sandbox.babylonjs.com — arraste e solte o arquivo para inspecionar meshes, animações, materiais e performance.

---

## 23. WebGPU e Futuro da Engine

### Por que usar WebGPU

```typescript
// WebGPU traz:
// - Compute shaders (IA de pathfinding na GPU, simulação de fluidos)
// - Melhor controle de memória
// - Render bundles (replay de comandos sem re-submit)
// - Até 3x mais eficiente que WebGL2 em draw calls pesados

// Compute shader com WebGPU
const cs = new BABYLON.ComputeShader("pathfind", engine, { computeSource: pathfindCS }, {
  bindingsMapping: {
    "grid":   { group: 0, binding: 0 },
    "result": { group: 0, binding: 1 },
  }
});

const gridBuffer = new BABYLON.StorageBuffer(engine, gridData.byteLength);
gridBuffer.update(gridData);
cs.setStorageBuffer("grid", gridBuffer);
cs.dispatch(Math.ceil(width / 8), Math.ceil(height / 8), 1);
```

---

## 24. Macetes, Truques e Padrões Avançados

### Macetes de Performance

```typescript
// 1. Delta time correto — NUNCA use valores fixos
const dt = Math.min(engine.getDeltaTime() / 1000, 0.05); // cap em 50ms

// 2. Evite criar objetos no render loop — gera GC pressure
// MAL:
scene.registerBeforeRender(() => {
  const v = new BABYLON.Vector3(1, 0, 0); // cria objeto todo frame!
});
// BOM:
const _tempVec = new BABYLON.Vector3();
scene.registerBeforeRender(() => {
  _tempVec.set(1, 0, 0); // reusa o mesmo objeto
});

// 3. Disable picking em meshes que não precisam
scene.meshes.forEach(m => {
  if (!m.name.includes("interactive")) m.isPickable = false;
});

// 4. Freezar a active camera meshes list
// Babylon recalcula qual câmera renderiza o quê todo frame
// Para cenas simples com 1 câmera:
scene.freezeActiveMeshes(); // congela a lista — ~20% de ganho em cenas estáticas
// Chame scene.unfreezeActiveMeshes() quando adicionar/remover meshes

// 5. Definir renderização de materiais em batch (state sorting)
scene.sortLights = false; // desabilita ordenação de luzes se tiver poucas
```

### Truques de Animação

```typescript
// Sincronizar múltiplos inimigos sem custo (phase offset)
enemies.forEach((e, i) => {
  e.idleAnim.start(true);
  e.idleAnim.goToFrame(i * 10 % 60); // offset de fase — evita animações sincronizadas
});

// Reduzir sample rate de animações distantes
const updateAnimSampleRate = (enemy: Enemy) => {
  const dist = BABYLON.Vector3.Distance(camera.position, enemy.mesh.position);
  enemy.skeleton.animationPropertiesOverride = new BABYLON.AnimationPropertiesOverride();
  if (dist > 30) {
    enemy.skeleton.animationPropertiesOverride.enableBlending = false;
    // Rodar animação em 15fps para inimigos distantes (vs 60fps)
    enemy.animGroup.speedRatio = 0.25;
  }
};

// Baked vertex animations (BVA) — para CENTENAS de personagens
// Pre-bake as poses do esqueleto em texture e sample na GPU
// Suporte nativo via BakedVertexAnimationManager
const bvm = new BABYLON.BakedVertexAnimationManager(scene);
mesh.bakedVertexAnimationManager = bvm;
```

### Truques de Textura

```typescript
// Mipmap manual para terrenos (evita aliasing em distância)
const tex = new BABYLON.Texture("/terrain/grass.png", scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
tex.anisotropicFilteringLevel = 16; // 16x anisotropic — enormemente melhora texturas em ângulo

// Atlas de texturas para UI — uma textura, muitos elementos
// Economiza dezenas de binds de textura por frame

// Streaming de texturas (load progressivo)
const tex2 = new BABYLON.Texture("/tex/big_4k.png", scene);
tex2.updateSamplingMode(BABYLON.Texture.LINEAR_LINEAR_MIPLINEAR); // habilita mipmap streaming

// DDS/KTX via extensão
// Converta suas texturas:
// toktx --t2 --encode uastc --uastc_quality 3 output.ktx2 input.png
```

### Truques de Física

```typescript
// Evite muitos objetos físicos dinâmicos — são caros
// Use física apenas para o que PRECISA: player, projéteis, ragdolls, objetos interativos
// NPCs, decoração: use apenas colisão de cena (scene.checkCollisions), não física

// Ragdoll após morte
const enableRagdoll = (skeleton: BABYLON.Skeleton, meshes: BABYLON.Mesh[]) => {
  skeleton.bones.forEach(bone => {
    const boneMesh = meshes.find(m => m.name === bone.name);
    if (boneMesh) {
      new BABYLON.PhysicsAggregate(boneMesh, BABYLON.PhysicsShapeType.SPHERE,
        { mass: 1, restitution: 0.1 }, scene
      );
    }
  });
};
```

### Truques de Rede

```typescript
// Rate limiting de envio — não envie todo frame (60fps de inputs é muito)
let lastSend = 0;
const SEND_RATE = 1000 / 20; // 20 atualizações por segundo

scene.registerBeforeRender(() => {
  const now = performance.now();
  if (now - lastSend >= SEND_RATE) {
    sendInputToServer();
    lastSend = now;
  }
});

// Snapshot interpolation — buffer de estados do servidor
const STATE_BUFFER_MS = 100; // 100ms de delay para interpolar suavemente
const stateBuffer: ServerState[] = [];

const addServerState = (state: ServerState) => {
  state.timestamp = performance.now();
  stateBuffer.push(state);
  if (stateBuffer.length > 10) stateBuffer.shift();
};

const getInterpolatedState = (): ServerState => {
  const renderTime = performance.now() - STATE_BUFFER_MS;
  // Encontrar os dois estados mais próximos ao renderTime e interpolar
  const newer = stateBuffer.find(s => s.timestamp >= renderTime);
  const older = stateBuffer.filter(s => s.timestamp < renderTime).pop();
  if (!older || !newer) return stateBuffer[stateBuffer.length - 1];
  const t = (renderTime - older.timestamp) / (newer.timestamp - older.timestamp);
  return lerpState(older, newer, t);
};
```

### Padrão de Cena Multi-nível (sem reload de página)

```typescript
// Transição suave entre áreas sem reload total
const loadNewZone = async (zoneName: string) => {
  // 1. Fade out
  await fadeScreen("out");

  // 2. Dispor objetos da zona atual (mas manter player e UI)
  currentZoneMeshes.forEach(m => m.dispose());
  currentZoneParticles.forEach(p => p.dispose());

  // 3. Carregar nova zona em background
  const newZone = await loadZoneAssets(zoneName);

  // 4. Reposicionar player
  player.position = newZone.spawnPoint;

  // 5. Fade in
  await fadeScreen("in");
};
```

---

## Referências e Links Essenciais

- [Babylon.js Playground](https://playground.babylonjs.com) — teste qualquer coisa ao vivo
- [Babylon.js Sandbox](https://sandbox.babylonjs.com) — inspetor de modelos GLB
- [Node Material Editor](https://nme.babylonjs.com) — criar shaders visualmente
- [Babylon.js Forum](https://forum.babylonjs.com) — comunidade extremamente ativa
- [Documentação Deep Dive](https://doc.babylonjs.com/features/featuresDeepDive/)
- [Guia de Networking com Colyseus](https://doc.babylonjs.com/guidedLearning/networking/Colyseus)
- [Otimizando sua Cena](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene)

---

*Guia compilado com base na documentação oficial do Babylon.js featuresDeepDive e melhores práticas da comunidade.*
