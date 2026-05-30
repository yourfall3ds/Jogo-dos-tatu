# 🎯 META DO PROJETO — TransFPS / DigimonFPS

> Documento de orientação rápida. Leia isto antes de qualquer sessão de desenvolvimento.  
> Última atualização: 2026-05-29

---

## O QUE É O JOGO

**Um hack-and-slash dungeon crawler 3D em primeira/terceira pessoa onde você joga como um Digimon.**

Não é um humano com parceiro. Você É o Digimon. Você soca, chuta, usa espada, usa skills, sobe de nível, e evolui (Digivolve) conforme avança por 4 dungeons progressivas. Cada dungeon usa um kit de cenário diferente e termina com um boss Digimon de level mais alto. É linear — sem loop, sem aleatoriedade forçada. Você avança, fica mais forte, e evolui.

**Referências de feel:**
- Combate: Devil May Cry (combos variados, estilo)
- Progressão: Digimon Cyber Sleuth (linear, dungeons, evolução)
- Movimento: Parkour + wall jump estilo plataforma 3D

---

## STACK TÉCNICA

- **Engine:** Babylon.js v9 via CDN (sem bundler, sem npm)
- **Servidor local:** `npx serve -p 5500 .`
- **Linguagem:** JavaScript ES Modules puro
- **Física:** `moveWithCollisions` nativo (sem Havok — CDN bloqueado)
- **Assets:** GLB/GLTF — todos gerados no Meshy AI ou baixados como kits prontos
- **Pasta raiz:** `C:\Users\darck\transformice\`

---

## ESTADO ATUAL DO CÓDIGO (2026-05-29)

### ✅ O que está funcionando
- FPS/TPS toggle (tecla V)
- Wall jump com máquina de estados
- Combo de socos no LMB (punch_01 → 04)
- Kick chain no RMB (recém implementado — pendente teste)
- Enemy AI MonsterPlant com 3 ataques (hop, bite, slam)
- WeaponSystem: Pistola + Rifle com tracers, decals, glow
- AnimationLibrary: carrega animações de GLBs externos, faz retargeting automático
- CrossFade suave entre animações
- Root motion stripping
- PlayerStateMachine
- Dodge no Shift
- Knockback no player e inimigo
- Scene Editor + Weapon Editor (engine mode, ESC)
- Sombras, névoa, iluminação
- HP bar no inimigo (billboard 3D)
- Animator Mode (preview isolado de assets)
- Monster Debug Mode
- Damage vignette + death screen

### ⚠️ Implementado mas não testado
- RMB = kick combo (desarmado) / mira ADS (armado)
- Double-tap W = dash
- MoveListUI (tecla M)
- Aim Down Sights (FOV suave, sens reduzida)

### ❌ Não existe ainda
- Sons (SoundManager existe mas vazio)
- Sistema de Stats do personagem
- Skills (1/2/3/4)
- Inventário
- Poções e itens
- Personagens Digimon jogáveis
- Dungeons
- Sistema de XP e evolução (Digivolution)
- Post-processing (bloom, SSAO)

---

## ARQUITETURA DE PERSONAGENS (DECISÃO DEFINITIVA)

### Inimigos → GLBs de game rip (já na pasta `assets/digimons/`)
- 21 Digimons GLB com animações próprias baked
- IA controla o comportamento — sem compatibilidade com o rig do player
- Usar imediatamente: `dracomon` já tem animações funcionando

### Jogáveis → Gerar no Meshy AI com biped rig
- Mesmo rig do `assets/characters/player.glb`
- Toda a biblioteca de animações existente funciona automaticamente
- Pedir ao Meshy: *"Digimon [nome], biped humanoid rig, game-ready"*

**5 Digimons jogáveis planejados (gerar no Meshy AI):**

| Digimon | Tipo | Linha completa |
|---|---|---|
| Agumon | Fire / Attacker | → Greymon → MetalGreymon → WarGreymon |
| Veemon | Dragon / Speedster | → ExVeemon → AeroVeedramon → UlforceVeedramon |
| Gabumon | Ice / Defender | → Garurumon → WereGarurumon → MetalGarurumon |
| Dorumon | Dark / Balanced | → Dorugamon → DoruGreymon → Alphamon |
| Biyomon | Wind / Support | → Birdramon → Garudamon → Phoenixmon |

---

## ANIMAÇÕES DISPONÍVEIS (biped Meshy AI — 100% compatíveis)

| Categoria | Animações | Status |
|---|---|---|
| Básico | idle, walk, run, jump | ✅ Em uso |
| Armado | idle_aim, walk_aim, reload | ✅ Em uso |
| Luta sem arma | punch_01~04, kick_01~02, dodge, knockdown | ✅ Em uso |
| Chutes extras | **11 GLBs em `Chutes-glb/`**: Double_kick, Flying_Fist, High_Kick, Lunge_Spin, Rising_Flying, Roundhouse, Spartan, Step-in_High, Step_Step_Turn, Sweeping, Sweep | ⚠️ Prontos, integrar ao ComboSystem |
| Espada | attack_01, combo_2, combo_3, charged, idle, ultimate | ⚠️ Mapeado, não integrado |
| Parkour | vault_01, vault_02, vault_roll | ⚠️ Mapeado, não integrado |
| Não organizadas | +30 animações em `ANALISAR E COLOCAR NA PASTA CERTA/` e `Animations-meshy/` | ⚠️ Classificar |

---

## ESTRUTURA DE DUNGEONS (visão)

```
HUB CENTRAL
├─ Loja (Potions: Potion_1/2/4 já existem como GLB no Fantasy Props)
├─ Seleção de Digimon jogável
└─ Digivolution manual

DUNGEON 1 — Floresta Digital (nível Rookie)
  Ambiente: PACK AMBIENTE ASSETS (árvores, arbustos)
  Inimigos: Filmon, Dracomon, Pigeon, MonsterPlant
  Boss: Gatomon

DUNGEON 2 — Ruínas Medievais (nível Champion)
  Ambiente: Medieval Village MegaKit
  Inimigos: Growlmon, Ghost, Goleling, Tribal
  Boss: ExVeemon

DUNGEON 3 — Cidade Corrompida (nível Ultimate)
  Ambiente: Downtown City MegaKit
  Inimigos: Dragon, Alpaking, Armabee, Demon
  Boss: Mervamon

DUNGEON 4 — Núcleo Digital (nível Mega)
  Ambiente: Modular SciFi MegaKit
  Inimigos: Dragon_Evolved, Alpaking_Evolved, Goleling_Evolved
  Boss: Azulongmon / Baihumon / Zhuqiaomon (aleatório)
```

---

## SISTEMA DE STATS (a implementar)

Todos afetam o código diretamente — não são só números:

| Stat | Fórmula no código |
|---|---|
| Força | `damage * (1 + strength * 0.12)` |
| Vitalidade | `maxHp = 80 + vit * 12` |
| Velocidade de Ataque | `animSpeed = 1.0 + atkSpd * 0.08` e `fireRate / (1 + atkSpd * 0.05)` |
| Velocidade de Movimento | `SPEED = 8 + movSpd * 0.4` |
| Velocidade de Corrida | multiplicador sobre SPEED ao sprint |
| Velocidade de Recarga | `reloadTime = 1.5 / (1 + reloadSpd * 0.1)` |
| Precisão | `spread = base / (1 + precision * 0.05)` |
| Defesa | `damage *= (1 - defense * 0.01)` cap 75% |
| Esquiva | `if (Math.random() < dodge * 0.01) return` |
| Crítico | `if (Math.random() < crit * 0.01) damage *= 2.5` |
| Quantidade de Pulos | `_maxAirJumps = 1 + jumpCount` |
| Resiliência | reduz duração e força do knockback |
| Sorte | aumenta drop rate e raridade de loot |

---

## SKILLS (a implementar — teclas 1/2/3/4)

Cada Digimon terá skills únicas. Exemplos genéricos para começar:

| Tecla | Skill | Custo MP |
|---|---|---|
| 1 | Dash Explosivo (dano em área no destino) | 25 |
| 2 | Rajada de Socos (6 hits automáticos) | 30 |
| 3 | Slam Descendente (pula e esmaga em área) | 40 |
| 4 | Defesa Perfeita (parry 1.5s — reflete dano) | 20 |
| Q | Ultimate (animação `ultimate.glb` já existe) | 80 |

---

## ASSETS DISPONÍVEIS — RESUMO EXECUTIVO

| Categoria | Quantidade | Estado |
|---|---|---|
| Digimons GLB (inimigos/bosses) | 21 | Prontos para usar |
| Criaturas com Evolved forms | 17 | Prontos para usar |
| Animações do player (biped rig) | ~60 GLBs | Maioria não integrada |
| Kit Medieval (dungeon 2) | ~80 peças | Pronto |
| Kit Cidade / Downtown (dungeon 3) | ~60 peças | Pronto |
| Kit SciFi (dungeon 4) | ~40 peças | Pronto |
| Kit Natureza / Floresta (dungeon 1) | ~30 peças | Pronto |
| Fantasy Props (poções, baús, armas) | ~60 props | Pronto |
| Props Meshy AI (decoração) | ~16 | Pronto |
| Armas GLB | 3 | 1 em uso, 2 pendentes |
| Poções 3D (já existem!) | 6 modelos | Pronto — só integrar |

---

## PRÓXIMAS 3 SESSÕES SUGERIDAS

### Sessão seguinte — Combate completo
1. Testar RMB kick combo + double-tap dash (código já existe)
2. Integrar os 11 chutes de `Chutes-glb/` no ComboSystem
3. Corrigir bug do `AnimationController` (currentName early return)
4. Adicionar combo reset automático por timeout (~1.5s sem input)

### Sessão 2 — Primeiro Digimon jogável
1. Gerar Agumon no Meshy AI (biped rig)
2. Confirmar que as animações existentes funcionam nele
3. Adaptar o sistema de câmera TPS para ser a câmera padrão do Digimon

### Sessão 3 — Sons básicos
1. Implementar sons de impacto de soco e chute
2. Sons de passo
3. Configurar `SoundManager` que já existe mas está vazio

---

## ARQUIVOS MAIS IMPORTANTES DO PROJETO

| Arquivo | Responsabilidade |
|---|---|
| `src/main.js` | Init, game loop, carregamento de assets |
| `src/Player.js` | Controller FPS/TPS, câmera, input routing |
| `src/InputManager.js` | Teclado, mouse, pointer lock, RMB, double-tap |
| `src/game/combat/CombatSystem.js` | Hit detection, dano, efeitos de impacto |
| `src/game/combat/ComboSystem.js` | Buffer de input, chains de punch/kick |
| `src/game/animation/AnimationLibrary.js` | Carrega e retargeta animações de GLBs externos |
| `src/game/animation/AnimationController.js` | Playback, speed, onComplete |
| `src/game/animation/animationNames.js` | MOVESETS (mapa de nomes → caminhos) + MOVE_LIST |
| `src/game/player/PlayerStateMachine.js` | Estados: unarmed, armed, attacking, dodging, knockdown |
| `src/Enemy.js` | MonsterPlant AI completa (template para novos inimigos) |
| `src/AssetLoader.js` | Carrega GLBs por key, gerencia cache |
| `src/WeaponSystem.js` | Pistola, rifle, tracers, decals, glow |
| `src/Level.js` | Terreno, obstáculos, spawn de inimigos |
| `src/HUD.js` | UI: HP, ammo, wall jump indicator, death screen |
| `ROADMAP.md` | Lista completa de funcionalidades, assets e visão |

---

## REGRAS DO PROJETO

1. **Sem bundler** — tudo via CDN e ES Modules nativos. Não usar npm imports no código do jogo.
2. **Sem Havok** — CDN bloqueado no ambiente de preview. Usar `moveWithCollisions` para tudo.
3. **Animações sempre do Meshy AI** com biped rig para personagens jogáveis. GLBs de game rip = inimigos apenas.
4. **babylonjs.loaders.min.js já incluso** no index.html — suporte a GLB/GLTF/FBX ativo.
5. **Servidor:** `npx serve -p 5500 .` na raiz do projeto.
6. **Engine Mode:** ESC durante o jogo abre o editor (scene editor + weapon editor).
