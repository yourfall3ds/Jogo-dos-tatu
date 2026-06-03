# 🗺️ ROADMAP — TransFPS — Do protótipo ao jogo profissional

> Arquivo vivo — edite conforme o projeto avança.  
> Última atualização: 2026-05-29

---

## ✅ ATUALIZAÇÃO 2026-05-29

- [x] Todos os chutes trazidos como GLB do Meshy AI — prontos para integrar
- [x] RMB kick combo, double-tap dash e aim ADS (código criado, pendente teste)

---

## 📍 ESTADO ATUAL

| Sistema | Status | Qualidade |
|---|---|---|
| FPS/TPS toggle (V) | ✅ | Boa |
| Wall Jump (máquina de estados) | ✅ | Boa |
| Punch combo no LMB (4 socos) | ✅ | Boa |
| Kick no LMB (kick_01, kick_02 no final do chain) | ✅ | Básica |
| Enemy AI MonsterPlant (hop/bite/slam) | ✅ | Muito boa |
| WeaponSystem (Pistola + Rifle) com tracers/decals/glow | ✅ | Muito boa |
| AnimationLibrary (extração externa de GLBs) | ✅ | Boa |
| CrossFade de animações com peso | ✅ | Boa |
| Root motion stripping | ✅ | Boa |
| PlayerStateMachine | ✅ | Básica |
| Dodge no Shift | ✅ | Básica |
| Knockback no player e no inimigo | ✅ | Boa |
| Scene Editor + Weapon Editor | ✅ | Boa |
| Sombras, névoa, iluminação | ✅ | Básica |
| HP bar no inimigo | ✅ | Boa |
| Animator Mode (preview isolado) | ✅ | Básica |
| Monster Debug Mode | ✅ | Básica |
| Damage vignette + death screen | ✅ | Boa |

---

## ❌ PROBLEMAS CONHECIDOS

| Problema | Arquivo | Impacto |
|---|---|---|
| RMB não rastreado — InputManager só captura `button === 0` | `InputManager.js:38` | ALTO |
| AnimationController: `if (currentName === name) return` impede `onComplete` se animação já estava tocando | `AnimationController.js:12` | MÉDIO |
| Combo reset automático nunca acontece — índice trava se player para de clicar no meio | `ComboSystem.js` | MÉDIO |
| Double-tap W dash não existe | `Player.js` | MÉDIO |
| Aim Down Sights (RMB + armado) não existe | `Player.js` | MÉDIO |
| SoundManager existe mas está vazio — sem nenhum som real | `SoundManager.js` | ALTO |
| Assets de `ExternalAssets/Sketchfab/` referenciados mas vários GLBs não existem no disco | `AssetLoader.js` | ALTO |
| `weapon.timer` referenciado no HUD mas não existe em `getAmmoInfo()` | `HUD.js:125` | BAIXO |
| Kick aparece no final do punch chain — player perde controle | `ComboSystem.js` | MÉDIO |

---

## 🚀 FUNCIONALIDADES POR PRIORIDADE

### PRIORIDADE 1 — Combate e Feel (maior impacto imediato)

- [ ] **RMB = Chutes (desarmado) / Mira (armado)**
  - InputManager: rastrear `button === 2`
  - CombatSystem: método `kickAttack()` separado do `lightAttack()`
  - ComboSystem: chains separadas — LMB = socos, RMB = chutes
  - Cross-combo: alternar LMB→RMB dá bônus de velocidade

- [ ] **Aim Down Sights (ADS)**
  - FOV de 1.38 → 0.72 com lerp suave
  - Sensibilidade do mouse cai para 50%
  - Arma move para o centro da tela
  - Crosshair muda para ponto vermelho
  - Camera breath (oscilação leve enquanto mira)
  - Depth of Field (desfoque no fundo)

- [ ] **Double-tap W = Dash**
  - Janela de 280ms para detectar duplo toque
  - Impulso frontal + pequeno salto
  - Invincibility frames de 0.1s durante o dash
  - Rastro visual (trail de partículas)
  - Cooldown de 1.2s

- [ ] **Hitstop (freeze frame)**
  - Quando hit conecta: pausa a simulação por 2-4 frames
  - Sensação de impacto tipo Street Fighter / Elden Ring

- [ ] **Combo Visual**
  - Contador flutuante no centro superior da tela
  - Flash de cor para cross-combo (LMB+RMB alternado)
  - Barra de "combo window" mostrando quando expira
  - Damage numbers flutuando acima do inimigo

- [ ] **Câmera Shake por tipo de hit**
  - Soco: shake suave horizontal
  - Chute alto: shake vertical
  - Roundhouse: shake rotacional

---

### PRIORIDADE 2 — Animações

- [ ] **Expandir kick chain** com os chutes GLB da pasta `Chutes/` (já prontos do Meshy AI)
  - Armada, Inside Crescent Kick, Leg Sweep, Martelo 2, Pontera, Roundhouse Kick, Side Kick
- [ ] **Animação de Wall Jump dedicada** — `vault_roll.glb` existe, integrar
- [ ] **Animação de Idle Armado** — `idle_aim.glb` existe em `armado/`, integrar
- [ ] **Animação de Shoot em TPS** — recuo do corpo inteiro ao atirar
- [ ] **Classificar pasta `ANALISAR E COLOCAR NA PASTA CERTA/`** — +30 animações não organizadas
- [ ] **Integrar animações de `itens 3d/Animations-meshy/`:**
  - Elbow Strike
  - Punch Combo 1, 2, 3, 4, 5
  - Roundhouse Kick
  - Roll Dodge
  - Step-in High Kick
  - Left Hook from Guard
  - Left Uppercut from Guard
  - Jump Down from Wall
- [ ] **Hall de Animações melhorado**
  - Mostrar TODOS os assets (player, inimigos, armas, itens) em cena isolada
  - Teclas numéricas para trocar animação
  - Slider de velocidade de playback
  - Exportar screenshot/GIF da pose

---

### PRIORIDADE 3 — Movimentação

- [ ] **Double Jump** — segundo pulo no ar
- [ ] **Coyote Time** — 0.12s após sair de plataforma ainda pode pular
- [ ] **Variable Jump Height** — segurar espaço = pula mais alto
- [ ] **Sprint** — Shift mantido durante corrida = velocidade 1.5x
- [ ] **Vault / Parkour automático** — ao correr em direção a obstáculo baixo (<1.2m)
  - Animações `vault_01.glb` e `vault_02.glb` já existem
- [ ] **Slide** — Ctrl + corrida = deslizar agachado
- [ ] **Ledge Grab / Mantle** — agarrar borda de plataforma ao pular

---

### PRIORIDADE 4 — Sistemas de Jogo

- [ ] **Inventário**
  - 6-8 slots de item
  - Abre com Tab ou I
  - Hotbar mapeada nas teclas 1-5
  - Pickup de itens do chão com E
  - UI: grade com ícones e tooltips

- [ ] **Sistema de Loadout**
  - Slot arma primária + secundária + corpo-a-corpo
  - Slot de armadura
  - Slot de gadget (granadas, smoke)

- [ ] **Habilidades / Combo Arts**
  - Combo counter > 5 → desbloqueia move especial
  - Ultimate (tecla Q): animação `ultimate.glb` da espada já existe

- [ ] **Sistema de XP e Nível**
  - Kills dão XP
  - Level up melhora stats ou desbloqueia moves
  - Barra de XP abaixo do HP

- [ ] **Sistema de Loot**
  - Inimigos dropam items ao morrer
  - Item flutuando + rotate + glow

- [ ] **Sistema de Waves / Hordas**
  - Waves com contador
  - Entre waves: tempo para looting
  - Escala de dificuldade

- [ ] **Save / Load**
  - localStorage para progresso, inventário, configs
  - Keybinds personalizáveis

---

### PRIORIDADE 5 — Novos Inimigos

> Assets disponíveis em `assets/itens 3d/Assets baixados novos/glTF-20260528T011429Z-3-001/glTF/`

- [ ] **Demon** — melee pesado, lento, alto dano
- [ ] **Dragon** — voador, fire breath, patrulha área
- [ ] **Ghost** — atravessa paredes, invisível parcialmente
- [ ] **Tribal** — arqueiro, ataca à distância, recua se chegarem perto
- [ ] **Squidle** — múltiplos membros, agarra player
- [ ] **Alpaking** — tanque, muito HP, empurra player
- [ ] **IA melhorada:** flocking, flanqueamento, retreat se HP baixo
- [ ] **Sistema de Boss** — fases de comportamento + barra de boss no topo

---

### PRIORIDADE 6 — Ambiente e Mapa

> Assets disponíveis mas não integrados:

- [ ] **Natureza** — pasta `PACK AMBIENTE ASSETS/glTF/`
  - BirchTree 1-5 (5 variações)
  - DeadTree 1-10 (10 variações)
  - Arbustos (Bush, Bush_Large, Bush_Small)
  - Flores (Bush_Flowers, Bush_Small_Flowers, Bush_Large_Flowers)

- [ ] **Kits de mapa baixados**
  - Downtown City MegaKit → mapa urbano
  - Medieval Village MegaKit → mapa medieval
  - Modular SciFi MegaKit → mapa sci-fi / nave espacial
  - Fantasy Props MegaKit → mapa de fantasia
  - Stylized Nature MegaKit → floresta estilizada

- [ ] **Editor de Mapa**
  - Paleta de tiles no painel
  - Colocar/remover blocos clicando na cena
  - Pintar terreno (altura, inclinação)
  - Salvar layout em JSON

- [ ] **Terreno Procedural**
  - `BABYLON.MeshBuilder.CreateGroundFromHeightMap()`
  - Heightmap para variação de altitude

- [ ] **Foliage System**
  - `BABYLON.InstancedMesh` para árvores (1 draw call para N cópias)
  - Grama via SPS (Solid Particle System) com shader de vento

- [ ] **Skybox dinâmico**
  - `BABYLON.SkyMaterial`
  - Ciclo dia/noite

---

### PRIORIDADE 7 — Visual e Post-Processing

- [ ] **DefaultRenderingPipeline**
  - Bloom (os efeitos de arma existentes ficam incríveis)
  - FXAA antialiasing
  - Vignette
  - Chromatic aberration ao tomar dano
  - Depth of Field ao mirar

- [ ] **Motion Blur** — ao fazer dash ou wall jump
- [ ] **God Rays / Luz Volumétrica** — sol atravessando árvores/janelas
- [ ] **Screen Space Reflections** — pisos refletivos
- [ ] **Substituir partículas manuais por `BABYLON.ParticleSystem`**
  - Muito mais eficiente: 1000 partículas vs 10 meshes manuais
- [ ] **Trail Renderer**
  - Rastro no dash do player
  - Rastro na arma durante swing
  - `BABYLON.TrailMesh` já existe no Babylon
- [ ] **Materiais PBR** — trocar `StandardMaterial` por `PBRMaterial` nos props importantes

---

### PRIORIDADE 8 — Áudio

> Pasta `sounds/` existe com subpastas mas sem arquivos de som

- [ ] **Sons de combate**
  - Impacto soco: `punch_light.ogg`, `punch_heavy.ogg`
  - Impacto chute: `kick_impact.ogg`
  - Miss (errou): `whoosh.ogg`
  - Roundhouse: `kick_spin.ogg`

- [ ] **Sons de movimento**
  - Passos por superfície (grama, metal, pedra)
  - Dash: `dash_whoosh.ogg`
  - Wall jump: `wall_jump.ogg`
  - Pouso: `land_heavy.ogg`

- [ ] **Sons de arma**
  - Tiro pistola e rifle
  - Reload (clique do pente + armar)
  - Arma vazia: `gun_empty.ogg`

- [ ] **Sons ambiente**
  - Vento em loop
  - Música de combate adaptativa (intensidade sobe com proximidade de inimigo)

- [ ] **Implementação**
  - `BABYLON.Sound` com rolloff 3D para sons posicionais
  - Reverb por ambiente (`BABYLON.ReverbEffectOptions`)

---

### PRIORIDADE 9 — UI e HUD

- [ ] **Move List completa** — painel lateral com todos os moves por categoria (tecla M)
- [ ] **Crosshair dinâmico** — expande ao mover, contrai ao parar, muda por arma
- [ ] **Barra de Combo** — janela de timing visual + multiplicador de dano
- [ ] **Minimap** — canvas 2D no canto com posição de player e inimigos
- [ ] **Kill Feed** — notificações ao matar (+XP, "PERFECT DODGE", etc.)
- [ ] **Damage Numbers** — números flutuantes acima do inimigo (amarelo/laranja/vermelho)
- [ ] **Inventário UI** — grade de slots com ícones e tooltips

---

### PRIORIDADE 10 — Performance e Arquitetura

- [ ] **LOD** — `mesh.addLODLevel()` para inimigos e árvores distantes
- [ ] **Scene Octree** — `scene.createOrUpdateSelectionOctree()` após montar o level
- [ ] **Object Pooling** — estender pool existente para todas as partículas do Enemy.js
- [ ] **Build System** — adicionar Vite para bundling + HMR no desenvolvimento
- [ ] **NavMesh** — pathfinding real para IA (Babylon.js Recast Plugin)

---

## 📦 INVENTÁRIO REAL DE ASSETS (levantamento completo 2026-05-29)

### 🐉 Digimons (`assets/digimons/`) — 21 GLBs
> Ver seção "SE FOSSE DIGIMON" para tabela detalhada e estratégia de compatibilidade

### 🥊 Animações do Player (biped Meshy AI — 100% compatíveis)

| Pasta | Animações | Status |
|---|---|---|
| `animations/basico/` | idle, walk, run, jump | ✅ Em uso |
| `animations/armado/` | idle_aim, walk_aim, reload | ✅ Em uso |
| `animations/luta_sem_arma/` | punch_01~04, kick_01~02, dodge, knockdown | ✅ Em uso |
| `animations/com_espada/` | attack_01, combo_2, combo_3, charged, idle, ultimate | ✅ Mapeado, pendente integração |
| `animations/parkour/` | vault_01, vault_02, vault_roll | ✅ Mapeado, pendente integração |
| `animations/Chutes-glb/` | **11 chutes:** Double_kick_forward, Flying_Fist_Kick, High_Kick, Lunge_Spin_Kick, Rising_Flying_Kick, Roundhouse_Kick, Spartan_Kick, Step_in_High_Kick, Step_Step_Turn_Kick, Sweeping_Kick, Sweep_Kick | ⚠️ Prontos, não integrados ao ComboSystem |
| `itens 3d/Animations-meshy/` | Elbow_Strike, Punch_Combo_1~5, Roundhouse, Roll_Dodge, Step_in_High_Kick, Climb_Stairs, Jump_Down_from_Wall, Knock_Down, Left_Hook_from_Guard, Left_Uppercut_from_Guard, Regular_Jump | ⚠️ Prontos, não organizados |
| `animations/ANALISAR.../Espada/` | Attack, Axe_Spin, Basic_Jump, Charged_Slash, Combat_Stance, Double_Blade_Spin, Double_Combo, Draw_and_Shoot, Heavy_Hammer, Left_Slash, Simple_Kick, Sword_Judgment, Thrust_Slash, Triple_Combo, Weapon_Combo_2 | ⚠️ Não organizados |
| `animations/ANALISAR.../Armado/` | Block8, Forward_Reload, Gun_Hold_Turn, Rifle_Charge, Running_Reload (x2), Slow_Walk_Reload (x2), Standing_Reload, Walk_Backward_Shooting, Walk_with_Gun (várias variações), Walk_with_Bow_Aimed | ⚠️ Não organizados |
| `animations/ANALISAR.../Parkour/` | Jump_Over_Obstacle_1~2, Parkour_Vault_1~3, Parkour_Vault_with_Roll | ⚠️ Não organizados |

### 🏰 Kits de Mapa (todos `.gltf`, prontos para usar)

| Kit | Conteúdo resumido | Dungeon ideal |
|---|---|---|
| **Medieval Village MegaKit** | Paredes, portas (8 estilos), pisos (tijolo/madeira), balcões, HoleCover, escadas | Dungeon 2 — Ruínas |
| **Downtown City MegaKit** | Prédios (3 tamanhos), ruas (2/4 pistas), calçadas, janelas, portas, telhados, props (AC, bueiro, grade) | Dungeon 3 — Cidade |
| **Modular SciFi MegaKit** | Corredores, plataformas, paredes tech, colunas, decals, alien props | Dungeon 4 — Digital |
| **Fantasy Props MegaKit** | Baús (Chest_Wood), poções (Potion_1/2/4), espadas (Sword_Bronze), chaves (Key_Gold/Metal), tochas, velas, barris, livros, pergaminhos, manequim de treino (Dummy), bancada, moedas | Hub + Dungeons 1/2 |
| **PACK AMBIENTE ASSETS** | 5x BirchTree, 10x DeadTree, Bush/Bush_Large/Bush_Small + variações com flores | Dungeon 1 — Floresta |
| **Stylized Nature MegaKit** | Natureza estilizada | Dungeon 1 alternativa |

### ⚔️ Criaturas disponíveis como inimigos

| Pack | Criaturas | Nota |
|---|---|---|
| `glTF-20260528T011429Z-3-001/` | Alpaking, Alpaking_Evolved, Armabee, Armabee_Evolved, Dragon, Dragon_Evolved, Ghost, Ghost_Skull, Glub, Glub_Evolved, Goleling, Goleling_Evolved, Hywirl, Pigeon, Squidle, Tribal, Demon | Formas Evolved são perfeitas para Digivolution visual |
| `assets/digimons/` | 21 Digimons (ver tabela completa na seção Digimon) | Rig próprio — usar como inimigos |

### 🔫 Armas disponíveis

| Arquivo | Status |
|---|---|
| `itens 3d/Armas/Arma inicial.glb` | ✅ Em uso (pistola) |
| `itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020348_texture.glb` | ⚠️ Não registrada |
| `itens 3d/Armas/Meshy_AI_Faça_uma_Arma_QUE_DE_0527020413_texture.glb` | ⚠️ Não registrada |
| `Fantasy Props/Sword_Bronze.gltf` | ⚠️ Disponível, não registrada |
| `Fantasy Props/Axe_Bronze.gltf` | ⚠️ Disponível, não registrada |
| `Fantasy Props/Pickaxe_Bronze.gltf` | ⚠️ Disponível, não registrada |

### 🏺 Props Meshy AI (`itens 3d/assets/`)
> Todos texturizados, prontos para usar como decoração ou itens de dungeon

Ancient_Chest, Ancient_Scroll, Aqua_Rune, Azure_Obelisk, Rustic_Church, Gargoyle_Fountain, Leo_Throne, Mystical_Stone_Block, Owl_Chalice, Rustbound_Cannon, Rustic_Cabinet, Stone_Sanctuary, Cogsteel_Saber, Crystal_Egg, Runic_Hare, Woodland_Haven

### 🏺 Props de Poção já disponíveis (Fantasy Props)
> Sem precisar gerar nada — já existem modelos de poção

`Potion_1.gltf`, `Potion_2.gltf`, `Potion_4.gltf`, `SmallBottle.gltf`, `SmallBottles_1.gltf`, `Bottle_1.gltf`

---

---

## 🎬 EDITOR DE ANIMAÇÕES IN-ENGINE (sem Blender)

> Ideia: criar animações diretamente no projeto animando ossos/nodes via keyframes em código.  
> Babylon.js já tem a API completa pra isso — só precisamos de uma UI em cima.

### Como funciona por baixo
- `BABYLON.Animation` aceita um array de keyframes `{ frame, value }` para qualquer propriedade (rotation.x, position.y, scaling, etc.)
- `BABYLON.AnimationGroup` agrupa várias animations em sync
- Tudo pode ser criado 100% em JavaScript, sem arquivo externo

### Casos de uso imediatos
- Baú abrindo: animar `rotation.x` da tampa de 0 → -Math.PI/2 em 30 frames
- Porta abrindo pelo batente: animar `rotation.y` do pivô de 0 → Math.PI/2
- Arco sendo puxado: animar `rotation.z` das hastes + scaling da corda
- Tocha balançando: animar `rotation.z` em loop com sine wave
- Plataforma se movendo: animar `position.y` em loop (ida e volta)
- Cofre tremendo antes de abrir: animar rotation.z com shake rápido

### O que construir

- [ ] **Timeline UI** — painel dentro do engine mode com linha do tempo visual
  - Scrubber para navegar entre frames
  - Botão play/stop/loop
  - FPS configurável (12, 24, 30, 60)

- [ ] **Bone/Node Inspector** — selecionador de node do GLB
  - Lista todos os TransformNodes e Meshes do objeto selecionado
  - Mostra position, rotation, scaling atual
  - Botão "Add Keyframe" na frame atual

- [ ] **Keyframe Editor**
  - Lista de keyframes por propriedade (rotation.x, position.y, etc.)
  - Editar valor e frame de cada keyframe
  - Deletar keyframe
  - Interpolação: LINEAR, EASEINOUT, STEP

- [ ] **Curve Editor** (avançado)
  - Visualizar curva de animação por propriedade
  - Handles de bezier para suavizar transições

- [ ] **Preview in-scene**
  - Animar o objeto diretamente na cena enquanto edita
  - Isolamento: esconde outros objetos para focar no objeto animado

- [ ] **Export como JSON**
  - Salvar a animação como JSON com todos os keyframes
  - Carregar de volta via `AnimationLibrary`
  - Permite compartilhar animações sem Blender

- [ ] **Biblioteca de animações procedurais pré-prontas**
  - `AnimProc.openLid(mesh, pivotOffset, durationFrames)` — qualquer tampa
  - `AnimProc.swingDoor(mesh, axis, angle)` — qualquer porta
  - `AnimProc.shake(mesh, intensity, duration)` — shake genérico
  - `AnimProc.floatBob(mesh, amplitude, speed)` — item flutuando
  - `AnimProc.bowPull(mesh, pullBone, stringBone, amount)` — arco

### Exemplo de como ficaria em código

```js
// Criar animação de baú abrindo programaticamente
const tampa = scene.getMeshByName('Lid');
const anim  = new BABYLON.Animation('openChest', 'rotation.x', 30,
  BABYLON.Animation.ANIMATIONTYPE_FLOAT,
  BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
);
anim.setKeys([
  { frame:  0, value: 0 },
  { frame: 15, value: -0.3 },   // começa a abrir
  { frame: 25, value: -1.5 },   // abre rápido
  { frame: 30, value: -1.57 },  // para no final (90°)
]);
const ease = new BABYLON.CubicEase();
ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
anim.setEasingFunction(ease);
tampa.animations = [anim];
scene.beginAnimation(tampa, 0, 30, false);
```

---

## 📊 SISTEMA DE STATUS DO PERSONAGEM

> Todos os stats afetam diretamente o gameplay — não são só números na tela.

### Stats do player

| Stat | Descrição | Afeta |
|---|---|---|
| **Força** | Poder de ataque base | Dano de socos, chutes, armas melee |
| **Vitalidade** | HP máximo | `maxHp = 80 + vitalidade * 12` |
| **Velocidade de Ataque** | Velocidade das animações de combate | `animSpeed` no `animController.play()` + fire rate da arma |
| **Velocidade de Movimento** | Velocidade de andar | `SPEED` do Player |
| **Velocidade de Corrida** | Velocidade de correr | Multiplicador sobre SPEED ao sprint |
| **Velocidade de Recarga** | Tempo de reload | `reloadTime = 1.5 / (1 + reloadSpeed * 0.1)` |
| **Precisão** | Spread dos tiros | Spread = base / (1 + precisão * 0.05) |
| **Defesa** | Redução de dano recebido | `dano final = dano * (1 - defesa * 0.01)` com cap de 75% |
| **Esquiva** | Chance de desviar de ataques | % chance de negar dano completamente |
| **Crítico** | Chance e multiplicador de crítico | `dano * 2.5` quando critica |
| **Quantidade de Pulos** | Número de pulos no ar | 1 = normal, 2 = double jump, 3+ = triple |
| **Resiliência** | Resistência a CC (knockback, stun) | Reduz duração e força do knockback |
| **Sorte** | Loot drop rate | Aumenta raridade e quantidade dos drops |

### Como os stats afetam o código

```
Velocidade de Ataque → animController.play(anim, { speed: 1.0 + (atkSpeed * 0.08) })
Velocidade de Ataque → weapon.FIRE_RATE = baseFireRate / (1 + atkSpeed * 0.05)
Força               → combatSystem.attackData[anim].damage * (1 + strength * 0.12)
Velocidade Movimento → player.SPEED = 8 + (movSpeed * 0.4)
Vitalidade          → player.maxHp = 80 + (vit * 12)
Precisão            → weapon spread calculado no shoot()
Defesa              → player.takeDamage: amount *= (1 - defense * 0.01)
Esquiva             → player.takeDamage: if (Math.random() < dodge * 0.01) return
Crítico             → hit: if (Math.random() < crit * 0.01) damage *= 2.5
Qtd. Pulos          → player._maxAirJumps = 1 + jumpCount
```

### O que construir

- [ ] **Classe `PlayerStats`** — objeto central com todos os valores base + bonus de equipamentos
- [ ] **`StatsManager`** — aplica os stats no Player, CombatSystem, WeaponSystem a cada mudança
- [ ] **UI de Stats** — painel abrindo com P ou dentro do inventário
  - Mostrar valor atual + bônus de equipamento em cor diferente
  - Tooltip explicando o que cada stat faz
- [ ] **Sistema de pontos de atributo** — ao subir de nível ganhar pontos para distribuir
- [ ] **Equipamentos modificam stats** — cada arma/armadura tem bônus de stat
- [ ] **Buffs temporários** — poções e skills afetam stats por X segundos
- [ ] **Barra de stats comparativa** — ao pegar item novo, mostra diferença vs equipado atual

---

## ⚡ SISTEMA DE SKILLS (Player)

> Inimigos já têm habilidades especiais. O player precisa também.  
> Mapeado nas teclas **1, 2, 3, 4** (sem conflito com troca de arma — usar F1/F2 para armas).

### Skills planejadas (exemplos iniciais)

| Tecla | Skill | Descrição | Custo |
|---|---|---|---|
| **1** | **Dash Explosivo** | Dash com dano em área no destino | 25 MP |
| **2** | **Rajada de Socos** | 6 socos automáticos ultrarrápidos | 30 MP |
| **3** | **Slam Descendente** | Pula e cai com impacto em área (igual ao Slam do monstro) | 40 MP |
| **4** | **Defesa Perfeita** | 1.5s de parry — se acertar timing, reflete dano | 20 MP |
| **Q** | **Ultimate** | Usa animação `ultimate.glb` da espada — área grande | 80 MP |

### Recurso: MP (Mana / Stamina)
- Barra de MP abaixo da HP
- Regenera ~10 MP/s quando não está usando skills
- Cooldown individual por skill (não consome MP se em cooldown)
- Cooldown visual: ícone da skill escurece e conta o tempo

### O que construir

- [ ] **Classe `SkillSystem`** — registra skills com custo, cooldown e efeito
- [ ] **`SkillSlot`** — estrutura: `{ key, name, icon, mpCost, cooldown, execute() }`
- [ ] **Barra de MP** — UI abaixo da HP, regenera passivamente
- [ ] **HUD de Skills** — 4 ícones na parte inferior mostrando cooldown
- [ ] **Efeitos visuais por skill** — partículas, luz, câmera shake específicos
- [ ] **Skills escalando com stats** — Força aumenta dano do Slam, Esquiva reduz cooldown do Dash
- [ ] **Árvore de Skills** (futuro) — desbloquear novas skills gastando pontos de skill

---

## 🧪 POÇÕES E ITENS

### Tipos de consumíveis

| Item | Efeito | Duração |
|---|---|---|
| **Poção de Vida Pequena** | +30 HP | Instantâneo |
| **Poção de Vida Grande** | +80 HP | Instantâneo |
| **Poção de Vida Máxima** | HP total | Instantâneo |
| **Poção de Mana** | +40 MP | Instantâneo |
| **Elixir de Força** | +50% Força | 30s |
| **Elixir de Velocidade** | +40% Vel. Ataque + Vel. Movimento | 20s |
| **Elixir de Defesa** | +60% Defesa | 25s |
| **Elixir Crítico** | +30% Crit chance e multiplicador | 15s |
| **Bomba de Fumaça** | Cria névoa ao redor (stealth 3s) | 5s |
| **Granada** | Explosão em área com dano e knockback | Instantâneo |

### Itens de equipamento

| Tipo | Slots | Efeito |
|---|---|---|
| **Armadura** (cabeça, torso, pernas) | 3 slots | +Defesa, +Vitalidade |
| **Luvas** | 1 slot | +Força, +Vel. Ataque |
| **Botas** | 1 slot | +Vel. Movimento, +Esquiva |
| **Amuleto** | 1 slot | +Crítico, +Sorte |
| **Anel** | 2 slots | Stats variados |

### O que construir

- [ ] **Classe `Item`** — base com: id, nome, tipo, ícone, descrição, efeito
- [ ] **Classe `Consumable extends Item`** — execute() aplica o efeito
- [ ] **Classe `Equipment extends Item`** — statsBonus: `{ strength: 5, defense: 10 }`
- [ ] **Sistema de pickup** — item no chão com hitbox, apertar E para pegar
- [ ] **Stack de consumíveis** — poções empilham (ex: "Poção x3")
- [ ] **Uso rápido** — poção equipada no slot de uso rápido, tecla F para usar
- [ ] **Drop de inimigos** — MonsterPlant dropa Poção Pequena com 40% de chance
- [ ] **Loot tables por inimigo** — cada tipo de inimigo tem sua tabela de drops
- [ ] **Visual de item no chão** — mesh flutuando + glow + rotate + label com nome
- [ ] **Preview de item** — ao passar o mouse sobre item no chão, mostra stats antes de pegar

---

## 🤖 INTEGRAÇÃO MESHY AI API

> O usuário já usa o Meshy AI manualmente. A ideia é trazer esse pipeline direto para dentro do motor do jogo — gerar, texturizar, remesh e rigar sem sair do projeto.

### O que o Meshy AI API permite
- Gerar modelo 3D a partir de texto/imagem → retorna GLB/FBX
- Aplicar texturas PBR automáticas no modelo gerado
- Remesh: reduzir polígonos (polycount) preservando forma
- Rig automático: prepara o modelo para animação com esqueleto
- Tudo via chamadas HTTP REST com a API key

### Pipeline completo planejado

```
Texto/Imagem
    ↓
Meshy API: Text/Image to 3D
    ↓ (GLB bruto, sem textura)
Meshy API: Texturizar (PBR — albedo + normal + roughness)
    ↓ (GLB texturizado, polígonos altos)
Meshy API: Remesh (reduzir polycount para game-ready)
    ↓ (GLB otimizado)
[Opcional] Meshy API: Rig (prepara esqueleto para animar)
    ↓
Import automático no AssetLoader
    ↓
Disponível na cena + no inventário de assets do editor
```

### O que construir

- [ ] **Painel Meshy AI no Engine Mode** — nova aba "🤖 Meshy AI" na barra do engine
  - Campo de texto para prompt
  - Upload de imagem de referência (opcional)
  - Seletor de estilo: realistic / cartoon / low-poly / voxel
  - Botão "Gerar" → chama API e mostra progresso
  - Preview do modelo gerado antes de importar

- [ ] **`MeshyAPIClient`** — classe que encapsula todas as chamadas REST
  ```js
  class MeshyAPIClient {
    async textTo3D(prompt, style)     // → taskId
    async imageToD3(imageBase64)      // → taskId
    async getTaskStatus(taskId)       // → { status, progress, glbUrl }
    async texturize(taskId, prompt)   // → taskId da texturização
    async remesh(taskId, targetFaces) // → taskId do remesh
    async rig(taskId)                 // → taskId do rig
    async downloadGLB(url)            // → Blob → importa no Babylon
  }
  ```

- [ ] **Polling de progresso** — mostra barra de progresso enquanto Meshy processa
  - Meshy pode levar 30s a 2min dependendo da tarefa
  - Polling a cada 3s com `setTimeout` ou `scene.registerAfterRender`

- [ ] **Import automático pós-geração**
  - Quando GLB pronto: importar via `SceneLoader.ImportMeshAsync`
  - Colocar na cena na posição do cursor ou em ponto fixo
  - Adicionar ao catálogo de assets salvos localmente

- [ ] **Gerenciador de assets gerados**
  - Lista de todos os assets gerados com thumbnail, nome, data
  - Reusar em diferentes partes do mapa sem gerar novamente
  - Salvar URL/Blob do GLB no localStorage ou IndexedDB

- [ ] **Config de API Key**
  - Campo seguro para inserir a Meshy API key
  - Salvar no localStorage (nunca no código)
  - Aviso visual quando a key não está configurada

- [ ] **Preset de prompts**
  - Lista de prompts favoritos salvos
  - Exemplos pré-prontos: "wooden treasure chest", "medieval door", "fantasy sword", "health potion bottle"

- [ ] **Integração com o Animation Editor**
  - Asset gerado com rig → abre direto no Animation Editor
  - Criar animação de abertura/interação para o asset recém-gerado

### Referência da API
- Documentação: `https://docs.meshy.ai/api-reference`
- Endpoint base: `https://api.meshy.ai`
- Auth: `Authorization: Bearer {API_KEY}`
- Formatos suportados: GLB, FBX, OBJ, STL

---

---

## 🎮 ANÁLISE POR GÊNERO — O que falta para cada direção

> Para cada gênero: o que já temos (✅), o que falta (❌) e o que seria exclusivo desse estilo.

---

### 🗡️ SE FOSSE HACK AND SLASH — estilo Devil May Cry

**O conceito:** combate estiloso, julgado por variedade. Quanto mais variado o combo, maior a nota. Ar, chão, parry, taunt — tudo conta.

**O que já temos:**
- ✅ Combo de socos e chutes com buffer de input
- ✅ Knockback nos inimigos
- ✅ Dodge com i-frames
- ✅ PlayerStateMachine
- ✅ Efeitos visuais de impacto

**O que falta:**

| Funcionalidade | Descrição | Prioridade |
|---|---|---|
| **Style Meter** | Barra S/A/B/C/D que sobe com variedade de combos e cai com dano tomado ou repetição | 🔴 ESSENCIAL |
| **Lock-on** | L-Shift/Q trava câmera no inimigo mais próximo, muda alvo com scroll | 🔴 ESSENCIAL |
| **Launch (enviar inimigo pro ar)** | Ataque especial que arremessa inimigo para cima | 🔴 ESSENCIAL |
| **Air combo** | Combos continuam no ar — player pode se sustentar atacando | 🔴 ESSENCIAL |
| **Juggling** | Manter inimigo no ar com ataques consecutivos | 🔴 ESSENCIAL |
| **Camera de ação automática** | Câmera orbita em volta do combate, não do player | 🔴 ESSENCIAL |
| **Parry / Timed Block** | Bloquear no timing exato → slow-motion + contra-ataque | 🔴 ESSENCIAL |
| **Taunt** | Tecla T para provocar — aumenta Style Meter sem combater | 🟡 IMPORTANTE |
| **Devil Trigger / Super Mode** | Acumula com kills, ativa com tecla: velocidade + dano + visual dramático | 🟡 IMPORTANTE |
| **Multiple Weapon Styles** | Cada arma tem moveset próprio — troca de arma mid-combo muda o próximo hit | 🟡 IMPORTANTE |
| **Slow-motion no parry perfeito** | `scene.getEngine().getDeltaTime()` * 0.15 por 0.3s | 🟡 IMPORTANTE |
| **Ranking de missão** | Tela de resultado com nota SSS/SS/S/A/B/C/D baseada em estilo | 🟡 IMPORTANTE |
| **Stagger / Break Guard** | Inimigos têm postura — ao quebrar: ficam vulneráveis por 2s | 🟡 IMPORTANTE |
| **Enemy variety** | Voadores, armados, bloqueadores, rápidos, tanques — hoje só temos 1 tipo | 🟠 NECESSÁRIO |
| **Boss com fases** | Boss muda comportamento ao passar de HP thresholds | 🟠 NECESSÁRIO |
| **Missões / níveis** | Estrutura de missão com início, objetivo e ranking ao fim | 🟠 NECESSÁRIO |
| **Moeda de Style** | Style Meter converte em orbs/red orbs para comprar moves na loja | 🟠 NECESSÁRIO |
| **Loja de moves** | Comprar novos ataques, extensões de combo e melhorias | 🟠 NECESSÁRIO |
| **Grapple / Snatch** | Puxar inimigo para perto (Nero) ou se puxar até o inimigo (DMC5) | 🔵 DIFERENCIAL |
| **Royal Guard / Just Frame** | Absorver dano no timing exato → explodir em one-shot | 🔵 DIFERENCIAL |
| **EX Gauge** | Barra separada carregada por parries e just-frames | 🔵 DIFERENCIAL |

**O maior problema hoje:** câmera completamente errada para DMC. Em DMC a câmera orbita a ação, não segue o olhar do player. Trocar de FPS/TPS livre para uma câmera de ação automática seria a maior mudança estrutural.

---

### 🐭 SE FOSSE TRANSFORMICE 3D

**O conceito:** ratos em 3D coletando queijo, com um xamã construindo o caminho. Multiplayer caótico, física absurda, corrida de plataforma.

**O que já temos:**
- ✅ Personagem rato (player.glb)
- ✅ Wall jump e movimentação de plataforma
- ✅ Física básica com `moveWithCollisions`
- ✅ Level com obstáculos

**O que falta:**

| Funcionalidade | Descrição | Prioridade |
|---|---|---|
| **Multiplayer real** | Servidor WebSocket (ex: Socket.io / Colyseus) sincronizando N jogadores | 🔴 ESSENCIAL |
| **Objetivo: Queijo** | Queijo no mapa, primeiro a chegar ganha, teleporta de volta | 🔴 ESSENCIAL |
| **Xamã (Shaman)** | Um jogador vira xamã: cria plataformas, trampolins, caixas com física | 🔴 ESSENCIAL |
| **Física de objetos** | Caixas, tábuas, molas caem com gravidade e empurram ratos | 🔴 ESSENCIAL |
| **Morte por queda / esmagamento** | Cair fora do mapa = morrer e respawnar na entrada | 🔴 ESSENCIAL |
| **Sistema de salas** | Lobby → sala (max 50 players) → mapa → resultado | 🔴 ESSENCIAL |
| **Votação de mapa** | Jogadores votam no próximo mapa entre 3 opções | 🟡 IMPORTANTE |
| **Cosméticos / Skins** | Roupas, chapéus, cores do rato — loja ou drops | 🟡 IMPORTANTE |
| **Emotes** | Teclas para dançar, agachar, acenar | 🟡 IMPORTANTE |
| **Sistema de títulos** | "Coletor de Queijo", "Xamã Mestre", etc. | 🟡 IMPORTANTE |
| **Modo Survivor** | 1 rato vira lobo e caça os outros — último rato ganha | 🟡 IMPORTANTE |
| **Editor de Mapas in-game** | Players criam mapas com editor e submetem para a comunidade | 🟡 IMPORTANTE |
| **Física de corda/corrente** | Ratos podem se segurar em cordas, ganchos, trampolins | 🟠 NECESSÁRIO |
| **Canhão do Xamã** | Canhão lança ratos (e às vezes mata) | 🟠 NECESSÁRIO |
| **Chat in-game** | Chat de texto na sala, sistema de amigos | 🟠 NECESSÁRIO |
| **Scripting Lua** | Modos customizados via scripts — diferencial do Transformice original | 🔵 DIFERENCIAL |
| **Tribos** | Clãs de jogadores com ranking e guerra de tribos | 🔵 DIFERENCIAL |

**O maior problema hoje:** não há multiplayer. Transformice sem multiplayer é só um jogo de plataforma solo. A rede é a alma do jogo.

---

### 🔫 SE FOSSE UM FPS COMPETITIVO

**O conceito:** CS:GO / Valorant style — gunplay preciso, mapas fechados, objetivos táticos, habilidades (ou não).

**O que já temos:**
- ✅ FPS camera com pointer lock
- ✅ Pistola e Rifle com tracers e decals
- ✅ Hitbox básica nos inimigos
- ✅ Recoil básico

**O que falta:**

| Funcionalidade | Descrição | Prioridade |
|---|---|---|
| **Padrão de recuo realista** | Spray pattern fixo por arma (não aleatório) — treinável | 🔴 ESSENCIAL |
| **Hitboxes por zona** | Cabeça (2x dano), tronco (1x), perna (0.7x) | 🔴 ESSENCIAL |
| **Headshot confirmação visual** | Crosshair especial + som diferente ao acertar cabeça | 🔴 ESSENCIAL |
| **Spread por movimento** | Correr → spread alto; parado → spread mínimo | 🔴 ESSENCIAL |
| **Scope / Sniper** | Zoom real com overlay de mira, ADS remove spread | 🔴 ESSENCIAL |
| **Audio de passos** | Ouvir passos dos inimigos — posicionamento por som | 🔴 ESSENCIAL |
| **Audio de reload / tiro** | Sem som não há FPS | 🔴 ESSENCIAL |
| **Granadas / Utilitários** | Flash, smoke, molotov, fragmentation | 🔴 ESSENCIAL |
| **Multiplayer** | PvP 5v5 ou deathmatch — FPS sem adversário humano é treino | 🔴 ESSENCIAL |
| **Minimap tático** | Mapa 2D no canto mostrando aliados e posição do objetivo | 🟡 IMPORTANTE |
| **Sistema de Economia** | Comprar armas com dinheiro ganho por kills/rounds | 🟡 IMPORTANTE |
| **Radar de tiro** | Círculo no minimap indicando de onde vieram os tiros | 🟡 IMPORTANTE |
| **Modo de jogo: Bomb** | Plantar/desarmar bomba — estrutura de round clássica | 🟡 IMPORTANTE |
| **Scoreboard** | Tab mostra kills/mortes/assists/dinheiro de todos | 🟡 IMPORTANTE |
| **Spectator** | Ver perspectiva de qualquer player após morrer | 🟡 IMPORTANTE |
| **Peek vantagem** | Shoulder peek / jiggle peek mecânica | 🟡 IMPORTANTE |
| **Bulletpen / Wallbang** | Balas atravessam paredes finas com dano reduzido | 🟠 NECESSÁRIO |
| **Anti-cheat básico** | Validação server-side de posição e dano | 🟠 NECESSÁRIO |
| **Settings completo** | FOV slider, sens, crosshair color, keybinds | 🟠 NECESSÁRIO |
| **Kill cam** | Replay de 3s mostrando de onde veio o tiro fatal | 🔵 DIFERENCIAL |
| **Sistema de ranks** | ELO / MMR com ranks Bronze→Global | 🔵 DIFERENCIAL |

**O maior problema hoje:** tudo de áudio. Um FPS sem som de passos, tiro e reload não tem loop de gameplay competitivo. O segundo maior: multiplayer. FPS solo contra bots é treino, não jogo.

---

### 🌧️ SE FOSSE RISK OF RAIN 2

**O conceito:** roguelite third-person shooter. Dificuldade escala com o tempo. Itens se acumulam e criam synergies insanas. Cada run diferente.

**O que já temos:**
- ✅ TPS mode funcional
- ✅ Enemy AI com comportamentos
- ✅ Player com combate corpo-a-corpo e arma
- ✅ Efeitos visuais de impacto

**O que falta:**

| Funcionalidade | Descrição | Prioridade |
|---|---|---|
| **Escalada de dificuldade por tempo** | A cada minuto: mais inimigos, mais HP, mais dano — independente do que o player faz | 🔴 ESSENCIAL |
| **Sistema de itens stackáveis** | 100+ itens que se acumulam e interagem (ex: 10x "Ukelele" → relâmpago em cadeia) | 🔴 ESSENCIAL |
| **Estrutura de stages** | Stage 1 → Stage 2 → Stage 3 → Stage 4 (boss) → loop de volta pro 1 mais difícil | 🔴 ESSENCIAL |
| **Teleporter** | Ativar o teleporter → horda de inimigos ataca por 90s → portal pro próximo estágio | 🔴 ESSENCIAL |
| **Drops de item** | Inimigos e chests dropam itens ao morrer/abrir | 🔴 ESSENCIAL |
| **Raridade de item** | Comum (branco), Incomum (verde), Raro (vermelho), Lunar (azul), Void (roxo) | 🔴 ESSENCIAL |
| **Múltiplos personagens** | Commando, Huntress, Engineer, Loader, cada um com moveset único | 🔴 ESSENCIAL |
| **Inimigos Elite** | Versões de inimigos com afixo (Burning, Glacial, Overloading) — mais fortes e com efeito especial | 🟡 IMPORTANTE |
| **Proc chain** | Item A trigga item B que trigga item C — cálculo de proc coefficient | 🟡 IMPORTANTE |
| **Shrines** | Santuário do Acaso (gambling), Santuário de Sangue (HP por items), Santuário de Combate (waves) | 🟡 IMPORTANTE |
| **Chests / Terminals** | Baús com custo em dinheiro, terminais de comando, pods de equipamento | 🟡 IMPORTANTE |
| **Dinheiro por kill** | Cada kill dá gold para abrir chests | 🟡 IMPORTANTE |
| **Sistema de Artifacts** | Modificadores opcionais de run: Artifact of Command (escolher item), Artifact of Kin (só um tipo de inimigo) | 🟠 NECESSÁRIO |
| **Co-op** | 2-4 players na mesma run, scaling de HP dos inimigos | 🟠 NECESSÁRIO |
| **Unlock de personagem** | Completar desafios específicos para desbloquear novos chars | 🟠 NECESSÁRIO |
| **Codex / Lore** | Texto de lore para cada item e inimigo desbloqueado ao encontrar pela 1a vez | 🟠 NECESSÁRIO |
| **Items Lunar** | Itens poderosos com downside severo — comprados em Bazaar between Ruins | 🔵 DIFERENCIAL |
| **Items Void** | Substituem itens comuns com versão mais forte mas com efeito corrupto | 🔵 DIFERENCIAL |
| **Void Fields** | Stage secreto acessado via portal escondido | 🔵 DIFERENCIAL |

**O maior problema hoje:** não há estrutura de roguelite nem sistema de itens stackáveis. Sem items acumulando e criando sinergia insana, é só um terceiro-person shooter normal. Nota: a dificuldade por tempo não é obrigatória — pode ser substituída por dificuldade por stage (fica mais difícil conforme avança, não conforme o relógio corre).

---

### 🐉 SE FOSSE DIGIMON (você É o Digimon — progressão linear por dungeons)

**A visão revisada:** os jogadores controlam Digimons diretamente — não um humano com parceiro. Alguns Digimons são jogáveis, outros são inimigos. A progressão é linear: dungeons cada vez mais difíceis, Digimon sobe de nível e evolui gradualmente. Sem loop forçado de dificuldade crescente com o tempo.

---

#### 🗂️ INVENTÁRIO DE DIGIMONS JÁ NA PASTA `assets/digimons/`

> 21 GLBs prontos. O problema: vieram de game rips (Digimon Linkz, New Century, ReArise) e **têm rig próprio incompatível com as animações do player** (biped Meshy AI). Estratégia abaixo.

| Arquivo GLB | Digimon | Nível | Uso sugerido |
|---|---|---|---|
| `digimon_linkz_-_agumon.glb` | Agumon | Rookie | 🟡 Visual de referência — versão jogável vem do Meshy AI |
| `digimon_linkz_-_veemon.glb` | Veemon | Rookie | 🟡 Visual de referência — versão jogável vem do Meshy AI |
| `digimon_linkz_-_dorumon.glb` | Dorumon | Rookie | 🟡 Visual de referência — versão jogável vem do Meshy AI |
| `digimon_linkz_-_gabumon.glb` | Gabumon | Rookie | 🟡 Visual de referência — versão jogável vem do Meshy AI |
| `mobile_-_digimon_linkz_-_biyomon.glb` | Biyomon | Rookie | 🟡 Visual de referência — versão jogável vem do Meshy AI |
| `digimon_linkz_-_gatomon.glb` | Gatomon | Champion | 🔴 Inimigo — Dungeon 1 boss |
| `digimon_linkz_-_black_gatomon.glb` | Black Gatomon | Champion | 🔴 Inimigo — dark dungeon |
| `digimon_linkz_-_growlmon.glb` | Growlmon | Champion | 🔴 Inimigo — Dungeon 2 |
| `dracomon_digimon_linkz_sleuth_with_animation.glb` | Dracomon | Rookie | ⭐ Inimigo com animações baked — usar imediatamente |
| `filmon_-_digimon.glb` | Filmon | Baby | 🔴 Inimigo fraco — Dungeon 1 |
| `xv-mon_exveemon_-_digimon_story_cyber_sleuth.glb` | ExVeemon | Ultimate | 🔴 Boss Dungeon 2 |
| `mobile_-_digimon_new_century_-_mervamon.glb` | Mervamon | Mega | 🔴 Boss Dungeon 3 |
| `mobile_-_digimon_new_century_-_ophanimon_x.glb` | Ophanimon X | Mega | 🔴 Boss Dungeon 4 alternativo |
| `mobile_-_digimon_new_century_-_rosemon_x.glb` | Rosemon X | Mega | 🔴 Boss Dungeon 4 alternativo |
| `raihimon_-_digimon_new_century.glb` | Raihimon | Mega | 🔴 Boss secreto |
| `sakuyamon_maid_mode_-_digimon_rearise.glb` | Sakuyamon | Mega | 🟡 NPC lojista do hub |
| `azulongmon_qinglongmon_-_digimon_rearise.glb` | Azulongmon | Royal Knight | 🔴 Boss final Dungeon 4 |
| `baihumon_-_digimon_rearise.glb` | Baihumon | Royal Knight | 🔴 Boss final Dungeon 4 |
| `ebonwumon_xuanwumon_-_digimon_rearise.glb` | Ebonwumon | Royal Knight | 🔴 Boss final Dungeon 4 |
| `zhuqiaomon_-_digimon_rearise.glb` | Zhuqiaomon | Royal Knight | 🔴 Boss final Dungeon 4 |
| `hsw_boss_colossal_squid.glb` | Colossal Squid | Boss | 🔴 Boss de dungeon aquática bônus |

**Também disponíveis como inimigos** (pasta `glTF-20260528T011429Z-3-001/`):
- Alpaking + Alpaking_Evolved, Armabee + Armabee_Evolved, Dragon + Dragon_Evolved, Ghost + Ghost_Skull, Glub + Glub_Evolved, Goleling + Goleling_Evolved, Hywirl, Pigeon, Squidle, Tribal, Demon

---

#### ✅ ESTRATÉGIA DECIDIDA — Arquitetura de Personagens

**Inimigos** → GLBs de game rip (`assets/digimons/` + `glTF-20260528T011429Z-3-001/`)
- Já têm animações baked (idle, ataque, morte)
- IA controla os comportamentos
- Sem necessidade de compatibilidade com o biped rig
- Pronto para usar agora

**Personagens Jogáveis** → Gerar no Meshy AI com biped rig
- Mesmo rig do player atual → 100% compatível com todos os combos, chutes, parkour, espada
- Toda a biblioteca de animações existente funciona automaticamente
- Pedir ao Meshy AI: "Digimon [nome], biped humanoid rig, game-ready"

**Personagens Jogáveis a gerar no Meshy AI:**

| Digimon | Tipo | Linha de Evolução |
|---|---|---|
| Agumon | Fire / Attacker | Agumon → Greymon → MetalGreymon → WarGreymon |
| Veemon | Dragon / Speedster | Veemon → ExVeemon → AeroVeedramon → UlforceVeedramon |
| Gabumon | Ice / Defender | Gabumon → Garurumon → WereGarurumon → MetalGarurumon |
| Dorumon | Dark / Balanced | Dorumon → Dorugamon → DoruGreymon → Alphamon |
| Biyomon | Wind / Healer | Biyomon → Birdramon → Garudamon → Phoenixmon |

---

#### 📋 O QUE FALTA PARA O JOGO DIGIMON

| Funcionalidade | Descrição | Prioridade |
|---|---|---|
| **Seleção de Digimon** | Tela de seleção antes de entrar na dungeon — escolher entre Rookies desbloqueados | 🔴 ESSENCIAL |
| **Digivolution (evolução)** | Ao atingir certo XP/nível → modelo muda para o Champion/Ultimate/Mega do mesmo Digimon | 🔴 ESSENCIAL |
| **Barra de DigiSoul** | Carrega com combos e kills → ao encher, pode Digivolve por 60s | 🔴 ESSENCIAL |
| **Skills por Digimon (1/2/3/4)** | Cada Digimon tem habilidades únicas: Pepper Breath (Agumon), Blue Blaster (Gabumon), etc. | 🔴 ESSENCIAL |
| **Sistema de XP e Level** | Ganhar XP por kill → level up melhora stats do Digimon | 🔴 ESSENCIAL |
| **Estrutura de Dungeons** | Dungeon 1 (Rookie), Dungeon 2 (Champion), Dungeon 3 (Ultimate), Dungeon 4 (Mega) | 🔴 ESSENCIAL |
| **Boss por Dungeon** | Cada dungeon termina com boss — Ex: Dungeon 1 boss = Gatomon, Dungeon 4 = Azulongmon | 🔴 ESSENCIAL |
| **Progressão linear** | Desbloquear próxima dungeon ao vencer o boss — sem loop, sempre avançando | 🔴 ESSENCIAL |
| **Retornar ao hub** | Área central entre dungeons: loja, repositório, evolução manual | 🟡 IMPORTANTE |
| **Digimon Encyclopedia** | Catálogo de todos os Digimons encontrados com stats e lore | 🟡 IMPORTANTE |
| **Múltiplos Digimons selecionáveis** | Desbloquear novos Digimons ao longo do jogo | 🟡 IMPORTANTE |
| **IA de inimigo por tipo** | Cada Digimon inimigo com comportamento diferente (voador, tanque, atirador) | 🟡 IMPORTANTE |
| **Evolução visual dramática** | Cutscene rápida de luz + partículas ao Digivolve | 🟡 IMPORTANTE |
| **De-evolução ao morrer** | Se morrer em Mega → volta para Ultimate, etc. | 🟡 IMPORTANTE |
| **Fusão / DNA Digivolution** | Dois players se fundem num Digimon mais forte (multiplayer) | 🔵 DIFERENCIAL |
| **Digimon Biomes** | Dungeon temática por tipo: Dungeon de Fogo, Dungeon de Gelo, Dungeon Digital | 🔵 DIFERENCIAL |
| **Digital World Portals** | Rifts no mapa que levam a áreas bônus fora das dungeons principais | 🔵 DIFERENCIAL |

---

#### 🗺️ ESTRUTURA DE PROGRESSÃO SUGERIDA

```
HUB CENTRAL (área entre dungeons)
  ├─ Loja (Fantasy Props: Potion_1, Potion_2, Chest_Wood, WeaponStand)
  ├─ Seleção de Digimon
  └─ Digivolution manual (se tiver XP suficiente)

DUNGEON 1 — Floresta Digital (Rookie)
  ├─ Inimigos: Pigeon, Glub, Filmon, MonsterPlant
  ├─ Ambiente: PACK AMBIENTE ASSETS (Árvores, Arbustos, Stylized Nature)
  └─ Boss: Gatomon

DUNGEON 2 — Ruínas Antigas (Champion)
  ├─ Inimigos: Goleling, Armabee, Tribal, Ghost
  ├─ Ambiente: Medieval Village MegaKit (paredes, portas, torres)
  └─ Boss: ExVeemon

DUNGEON 3 — Cidade Corrompida (Ultimate)
  ├─ Inimigos: Dragon, Alpaking, Demon, Ghost_Skull
  ├─ Ambiente: Downtown City MegaKit (prédios, ruas, becos)
  └─ Boss: Mervamon

DUNGEON 4 — Núcleo Digital (Mega)
  ├─ Inimigos: Dragon_Evolved, Alpaking_Evolved, Goleling_Evolved
  ├─ Ambiente: Modular SciFi MegaKit (corredores tech, plataformas)
  └─ Boss: Azulongmon / Baihumon / Zhuqiaomon (escolha aleatória)
```

---

## 🔑 OS 5 QUE MAIS MUDAM A EXPERIÊNCIA AGORA

1. **RMB = chute separado** — combate fica dinâmico de verdade imediatamente
2. **Sons de impacto** — sem som, qualquer jogo parece vazio
3. **Sistema de Stats** — dá profundidade e progressão ao jogo instantaneamente
4. **Bloom (DefaultRenderingPipeline)** — os efeitos de arma já criados ficam incríveis
5. **Integração Meshy AI API** — gera assets ilimitados direto no projeto

---

## 🎯 SEQUÊNCIA SUGERIDA DE SESSÕES

```
Sessão 1  → RMB kick combo + double-tap dash + aim ADS
Sessão 2  → Sistema de Stats (PlayerStats + StatsManager + UI)
Sessão 3  → Poções básicas (3 tipos) + pickup de item no chão
Sessão 4  → Sons de impacto + feedback áudio básico
Sessão 5  → Skills: Dash Explosivo (1) + Rajada de Socos (2)
Sessão 6  → Post-processing (bloom, vignette, DOF no aim)
Sessão 7  → Integrar assets de natureza + primeiro mapa real
Sessão 8  → Painel Meshy AI API dentro do engine mode
Sessão 9  → Editor de Animações in-engine (Timeline UI + keyframes)
Sessão 10 → Inventário completo com equipamentos e stats
Sessão 11 → Novo tipo de inimigo (Demon ou Ghost dos assets baixados)
Sessão 12 → Damage numbers + kill feed + combo counter visual
Sessão 13 → Sistema de boss + wave system
Sessão 14 → Performance (instancing, LOD, octree, ParticleSystem)
```
