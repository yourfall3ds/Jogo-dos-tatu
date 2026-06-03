# 🔎 Auditoria Multiplayer — o que ainda não está perfeito

Lista fundamentada no código (não chute). Legenda de severidade:
🔴 crítico (quebra/duplica/exploit) · 🟠 médio (desync perceptível) · 🟡 menor · 🎨 decisão de design.

Status por mecânica: **[SERVER-AUTH+SYNC]** ok · **[PARTIAL]** meio-certo · **[LOCAL]** só na tela de quem fez.

---

## 1) Drops de monstro & coleta  → (é a frente que você pediu)

| # | Item | Sev | Onde | Hoje |
|---|------|-----|------|------|
| 1.1 | **Drop dobrado**: o servidor cria o drop (DropState, compartilhado) **E** o cliente também spawna um drop LOCAL ao matar (`DropSystem.spawnFromEnemy`) → o local é invisível pros outros e confunde | 🔴 | `src/game/items/DropSystem.js`, `src/main.js` (~1625 `onEnemyKilled`, ~1980 `dropSystem.update`) | dois drops no mesmo lugar; um sincroniza, o outro não |
| 1.2 | **Coleta é automática** ao chegar <1.6u — não tem botão **F** | 🟠 | `src/main.js` (~1916 `if dist<1.6 → cs.sendPickup`) | anda por cima e some |
| 1.3 | **Sem prioridade de quem matou** — qualquer um pega na hora | 🎨/🟠 | schema `DropState` (sem `killer_id`/`spawn_time`); `ArenaRoom._onPickupDrop` só checa range | sem janela do matador |
| 1.4 | "Quem pegou pegou" para drops do SERVIDOR **já funciona** (delete atômico + broadcast) ✓ | ✅ | `ArenaRoom.js _onPickupDrop` (`state.drops.delete`) | ok pros drops do servidor |
| 1.5 | Drops de **inimigos locais** (fora do fluxo server) não são validados → coleta local sem servidor | 🟠 | `DropSystem` | só existe na tela do dono |

**Spec desejada (sua):** drop aparece **no servidor** (todos veem o mesmo), **F pra pegar**, **quem matou tem prioridade** por alguns segundos mas depois qualquer um pega, **não é dividido** (um item = um dono), **quem pegou pegou**.
**O que falta:** (a) desligar o `DropSystem` local no MP; (b) trocar auto-pickup por **F**; (c) `DropState` ganhar `killer_id` + `spawn_at` e o `_onPickupDrop` respeitar a janela do matador. O resto (shared + atômico) já existe.

---

## 2) Tiro / dano / knockback / morte (combate)

| # | Item | Sev | Onde | Hoje |
|---|------|-----|------|------|
| 2.1 | **Knockback de PvP não existe**: leva dano (HP cai) mas o corpo não recua/empurra | 🔴 | `ArenaRoom._onHitPlayer` (só seta hp) · `Player.applyServerHp` (sem kb) | sensação "sem impacto" |
| 2.2 | **Player morto pode levar mais hit** (hp vira negativo) — sem guard `target.dead` | 🟠 | `ArenaRoom._onHitPlayer` (`if(!attacker||!target)return`) | hits desperdiçados / kill-steal estranho |
| 2.3 | **Respawn não sincroniza posição**: cliente renasce em `(0,2.5,0)`, servidor te põe noutro ponto → teleport/rubberband até o próximo input | 🟠 | `Player.respawn`/`spawn` (hardcoded) vs `ArenaRoom._pickSpawnPoint` | "pulo" ao renascer |
| 2.4 | **Vítima não ouve o impacto** do golpe/tiro que levou (só vê número de dano) | 🟠 | `CombatSystem._playImpactSound` (só local) · `remote_fire` não carrega "acertou" | feedback só visual |
| 2.5 | **Sem validação de alcance/linha-de-visão no servidor** (confia no raycast do cliente; só checa cooldown) | 🟠 (anti-cheat) | `ArenaRoom._onHitPlayer/_onHitMob` (`validateHit` só cooldown) | exploit possível |
| 2.6 | HP autoritativo na barra local ✓ · tiro/mob server-auth ✓ · tracer remoto ✓ (recém-corrigidos) | ✅ | — | ok |

---

## 3) Construção / colocar itens no mapa

| # | Item | Sev | Onde | Hoje |
|---|------|-----|------|------|
| 3.1 | **Duplicação ao quebrar**: dois players batendo no mesmo objeto → os DOIS recebem o drop no inventário (o `_onObjectBroken` roda local em cada cliente, sem "quem destruiu" no servidor) | 🔴 | `BuildMode._onObjectBroken` · `Breakable` | item duplicado / exploit |
| 3.2 | **Quadros (frames) são por-usuário** — os outros NÃO veem os quadros que você coloca | 🎨 | `BuildMode._buildFrameAt`/`_restoreFrames` (LocalDB `placed_frames`) | inconsistente c/ "mundo único" |
| 3.3 | **Máquina de Criação é por-usuário** — os outros NÃO veem a máquina colocada | 🎨 | `BuildMode` (`assetMachine`) · `AssetMachine._persistPlacement` (LocalDB `machines_placed`) | cada um tem a sua |
| 3.4 | **`groupProps` da PEÇA se perde** no sync (`recordToRow` manda `props:{}` p/ piece) — física/quebrável customizada não persiste pros outros | 🟡 | `WorldObjects.recordToRow` | ok p/ peça estática, ruim se tiver props |
| 3.5 | Dedupe do echo usa **posição ≈0.5u** — dois objetos muito próximos podem se confundir | 🟡 | `BuildMode._sameWorldRecord` | edge case raro |
| 3.6 | Construção compartilhada ao vivo (Realtime) + anti-freeze (navmesh) ✓ (recém-corrigidos — testar) | ✅ | — | confirmar in-game |

---

## 4) Inventário / assets gerados / máquina de assets

| # | Item | Sev | Onde | Hoje |
|---|------|-----|------|------|
| 4.1 | **Asset com URL `blob:`/local não compartilha** — se o upload pro Storage falhar, só o criador carrega; os outros veem "faltando" | 🟠 | `GeneratedAssets.add` (rejeita blob) · `AssetHosting.uploadFromUrl` | depende do upload dar certo |
| 4.2 | **Skin/visual equipado NÃO vai pros outros** — `equip_skin` está no `InventoryState` mas nunca é enviado; avatares remotos ficam no modelo padrão (só `class_id` e arma na mão sincronizam) | 🟠 | `ArenaState` (`equip_skin` em inv, não em PlayerState) · `RemotePlayer` | todo mundo se vê "padrão" |
| 4.3 | **Inventário é por-usuário (cloud)** ✓ — ok pra MP. Mas a coleta de drop / quebra de build adiciona item **local** sem validação → ver 1.x e 3.1 (risco de dupe) | 🟠 | `Inventory.addBuildable/addItem` | dupe vem dos itens 1.1/3.1 |
| 4.4 | Biblioteca de gerados **global** (todos veem) ✓ (recém-feito) | ✅ | `GeneratedAssets`+`AssetGroups.getAssets` | ok |
| 4.5 | Arma na mão / held_item / class_id sincronizam no avatar remoto ✓ | ✅ | `RemotePlayer.onSchemaChange` | ok |

---

## 5) Mobs / skills / XP

| # | Item | Sev | Onde | Hoje |
|---|------|-----|------|------|
| 5.1 | **XP é somado LOCAL antes do servidor confirmar** o kill — se o servidor rejeitar o hit, o XP/level fica dessincronizado | 🟠 | `src/main.js` (~1618 `stats.addXp` no `onEnemyKilled`) vs evento `xp_gain` | level "fantasma" |
| 5.2 | Mobs server-auth (posição/HP/sem IA local) ✓ · skills broadcast + dano server ✓ | ✅ | `RemoteMob`, `cast_skill` | ok |

---

## Ordem sugerida de correção
1. **Drops do jeito que você quer** (1.1 desligar local + 1.2 F + 1.3 prioridade do matador). 🔴
2. **Knockback PvP** (2.1) + **guard de morto** (2.2). 🔴
3. **Duplicação ao quebrar build** (3.1). 🔴
4. Respawn posição (2.3), som de impacto na vítima (2.4), XP local-first (5.1). 🟠
5. Skin nos outros (4.2), blob→Storage garantido (4.1). 🟠
6. Decidir: quadros + máquinas viram globais? (3.2/3.3). 🎨

> Itens marcados ✅ são os já corrigidos nesta rodada (HP, tracer, build ao vivo, anti-freeze, assets globais) — falta confirmar in-game + redeploy do servidor pro tracer.
