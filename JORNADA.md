# 🦖 DigimonFPS — Checklist da Jornada

> Estado **real** de implementação (o que está no código), não a visão de design.
> Para a visão completa/ideias por gênero, ver [`ROADMAP.md`](./ROADMAP.md).
>
> Hack-and-slash FPS/TPS em **Babylon.js** (CDN) · física **Havok** · Git LFS.
> ~19.5k linhas · 56 arquivos · branch `main`.
>
> Legenda: `[x]` feito · `[~]` parcial / carregado mas não ligado · `[ ]` a fazer

---

## ⚙️ Core & Render
- [x] Babylon.js via CDN (global `BABYLON`)
- [x] Skybox + chão com texturas (PolyHaven) + sombras
- [x] Loading screen com barra + carregamento em background
- [x] Botão JOGAR (pulsa quando pronto)
- [x] Tela de morte + botão Renascer

## 🧱 Física (migração Havok completa)
- [x] Engine Havok + gravidade
- [x] Mundo estático em convex hull (sem lag perto de escada)
- [x] Player como `PhysicsCharacterController` (degrau, rampa, colisão)
- [x] Objetos dinâmicos (rolam / tombam / assentam), forma automática
- [x] Propriedade: collider on/off (pass-through pra portais/efeitos)
- [x] Propriedade: física on/off (cai ou fica estático)
- [x] Propriedade: quebrável + durabilidade escalada pelo tamanho
- [x] **Ragdoll-lite** — inimigo morto vira corpo físico e voa/tomba na direção da pancada

## 🏃 Movimento do Player
- [x] FPS/TPS toggle (V)
- [x] WASD + pulo + coyote time
- [x] Dash (W duplo)
- [x] Esquiva (Shift → dodge)
- [x] Wall Jump
- [x] Sprint + Stamina (barra, exaustão, recuperar fôlego)
- [x] Andar de costas (desarmado / pistola / arma pesada)
- [x] Morte por queda (50m) com anim de caindo + kill plane

## 👊 Combate corpo a corpo
- [x] ComboSystem com buffer de fila (mashing funciona)
- [x] Cancel-window (ritmo seco estilo DBZ)
- [x] Cadeias de soco e chute
- [x] Finalizadores de combo (combo_punch)
- [x] Cross-combo (alternar soco/chute acelera)
- [x] Ataques aéreos (soco voador / chute voador ao pular)
- [x] **Críticos** — golpe forte manda o inimigo voar longe
- [x] Números de dano flutuantes
- [x] Impact FX (faíscas no acerto)
- [x] **Sons** por golpe escalando com força + som de crítico
- [x] Melee empurra objetos físicos
- [x] **Hit-stop** — freeze-frame de impacto no golpe forte (congela + zoom punch + flash/vinheta)

## 🎬 Animações
- [x] LayeredAnimator (tronco/pernas → run-while-punch)
- [x] AnimationController com crossfade
- [x] Locomoção 3-tier (walk / run / run_fast)
- [x] Movelist: 4 socos, chutes Meshy, combo_punch 0-5
- [x] Reações a dano (hit_face, hit_back_run)
- [x] falling / dead / catch_breath / walk_back
- [~] `jump_punch` (soco saltitante) — carregado, falta ligar
- [~] `vault_rifle` (pulo armado com rifle) — carregado, falta ligar
- [~] `pickup` (pegar arma do chão) — carregado, falta ligar

## 🔫 Armas de fogo
- [x] Pistola Bucaneira
- [x] Rifle Pesado
- [x] Editor de arma (WeaponEditor)
- [x] ADS (mira), recarga, troca (1 / 2 / G)

## 👾 Inimigos
- [x] Catálogo de ~30 Digimons/criaturas (tiers rookie → boss)
- [x] AnimatedEnemy: IA persegue → windup → strike → recover
- [x] Hitbox real de golpe, reação a dano, morte
- [x] EnemyManager (cache de AssetContainer)
- [x] CatalogUI — spawn manual (tecla K)
- [x] **CombatDirector** — povoa a fase sozinho, ondas, escala (tecla H)
- [x] Som de impacto / dano no inimigo
- [x] **NavMesh (Recast)** — IA contorna paredes/objetos; line-of-sight (vai reto quando livre, sem zigue-zague) + string-pulling; obstáculos só do que o player colide (ignora decoração); regenera com debounce no BuildMode
- [x] **Patrulha (wander)** — sem aggro, os inimigos vagueiam perto do spawn (não ficam congelados)
- [x] **Gravidade dos inimigos** — caem até bater numa superfície (chão/plataforma), não ficam boiando; spawn no ar → cai; sai da borda → despenca; ignora decoração como "chão"
- [x] **Horda começa OFF** (paz pra projetar) — tecla H liga
- [ ] Wall-jump dos inimigos
- [x] **Drops visuais ao morrer** — moedas + materiais com FÍSICA + colisor (pop/cai/assenta), loot beam (brilho), magnet, coleta → inventário; usam o modelo GERADO quando existe (senão placeholder ⚙)
- [ ] Ondas de boss / lutas de chefe

## 🎲 RPG
- [x] PlayerStats (XP, nível, atributos, multiplicadores)
- [x] Drop de poção ao matar (escala com Sorte)
- [x] 5 Skills com MP + cooldown (Z / X / C / F / Q)
- [x] Inventário + ItemCatalog (consumíveis, equips, armas)
- [x] RpgHUD (HP / MP / stamina / XP)
- [~] `kungfu_punch` como skill — anim pronta, falta ligar
- [x] **Trocar de personagem (player)** — CharacterSwapper reusa as 66 anims (re-bind por osso); UI seletora (tecla P) com badge de compatibilidade. Modelo rig biped Meshy = 100% anims; rig diferente (Digimon rip) = T-pose (avisado)
- [ ] Save/load completo do progresso

## ✨ Skills & Poderes (sons de DBZ baixados, esperando)
- [ ] Ligar sons: kamehameha, aura SSJ, ki, teleporte
- [ ] Efeitos visuais (beam, aura, partículas)
- [ ] Barra/UI de poderes + carga

## 🛠️ Ferramentas de criação
- [x] BuildMode (B): colocar / rotacionar / escalar objetos
- [x] MeshyPanel: image-to-3D + opção low poly
- [x] AssetMachine + wishlist de assets
- [x] SceneEditor, AssetGroups, AssetEditorUI
- [x] Persistência: LocalDB / TemplateDB / localStorage
- [x] Debug: MonsterDebugMode, AnimatorMode, ColliderDebug, ThumbnailGen

## 🗺️ Mundo & Progressão
- [ ] Dungeons reais / múltiplos mapas
- [ ] Mapa infinito (criar pra fora do mapa)
- [ ] Quests / objetivos
- [ ] Progressão entre fases / hub central

## 🔊 Áudio & Polish
- [x] SoundManager (IndexedDB + disco, silencioso sem arquivo)
- [x] Sons de combate, pulo, wall jump, aterrissagem, morte por queda
- [ ] Música de fundo + mixagem
- [ ] Som espacial (3D)
- [ ] Refino de screen shake

## 🌐 Futuro distante
- [ ] Multiplayer (raiz Transformice)

---

## 🔥 Próximos passos sugeridos (ordem)
1. **Desvio de obstáculo dos inimigos** — sem isso encalham nos objetos construídos
2. Ligar anims soltas (`jump_punch`, `vault_rifle`, `pickup`)
3. `kungfu_punch` como skill + sons/efeitos de poder (kamehameha, aura)
4. Drops visuais + ondas de boss
5. Dungeons / progressão de mundo

---

## 📌 Pendente de commit (sessão atual)
- Sons de combate + críticos (que mandam inimigo voar longe)
- Fix da animação `falling` (só em queda grande)
- `CombatDirector` (povoamento automático da fase)
- **Hit-stop** (freeze-frame de impacto) — `HitStop.js`
- **Ragdoll-lite** na morte do inimigo — `AnimatedEnemy._startRagdoll`
- `.gitattributes`: `.wav/.mp3/.ogg` via LFS (17MB de sons)

_Última atualização: 2026-05-31_
