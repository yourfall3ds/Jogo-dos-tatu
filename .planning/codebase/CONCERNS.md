# TransFPS — CONCERNS (Bugs / Dívida Técnica / Faltando para PvP completo)

**Data da análise:** 2026-06-03
**Escopo:** FPS multiplayer Babylon.js v9 + WebGPU + Colyseus + Havok.
**Método:** Leitura direta de `main.js`, `Player.js`, `WeaponSystem.js`, `CombatSystem.js`, `RemotePlayer.js`, `ColyseusClient.js`, `BiomeWorld.js`, `ArenaRoom.js`, `WeaponTable.js`, `index.js`. Itens só listados se estão REALMENTE no código atual.

> NÃO incluídos (já consertados): anim_map completo, `_attachWeaponFromState`, dano visual remoto (`_flashHit`/`_spawnDamageNumber`), slash VFX, hitmarker, knockback preditivo, tela preta do mapão, sons de luta (`target_id`→`m.to`), dash duplo space, câmera clipping TPS, recoil estável, interpolação 70ms.

---

# A) O QUE PRECISA CONSERTAR (bugs / dívida real no código)

## A1. CRÍTICA — Maps de cooldown/estado no servidor NUNCA são limpos no `onLeave` (leak permanente na sala 24/7)
- **Arquivo:** `tools/transfps-colyseus/src/rooms/ArenaRoom.js`
  - Declaração: linhas 204-209 (`_cooldowns`, `_atkCooldowns`, `_kills`, `_lastInputAt`, `_msgRate`).
  - Também `_fireSoundCd` (606), `_spawnRate` (1681), `_skillCooldowns` (271).
  - `onLeave` (517-574) deleta APENAS `this.state.players` (559). Nenhum desses Maps tem `.delete(pid)`.
- **Fato:** As chaves crescem por `${playerId}:${weaponId}`, `use:${pid}:${itemId}`, etc. A cada arma/item/skill diferente que um player usa, uma nova chave é criada e nunca removida. `onDispose` (1892) só limpa `_idleCheckT`.
- **Impacto PvP:** A sala `OPEN_WORLD` ("BRASIL 1") tem `autoDispose=false` (274) e roda 24/7 (recriada a cada 60s em `index.js:97`). Esses Maps crescem indefinidamente com cada player que entra e sai → vazamento de memória contínuo no processo de produção, podendo derrubar o servidor após horas/dias de uptime.
- **Fix:** Em `onLeave`, varrer e deletar todas as chaves que começam com `pid` em cada Map, e `_kills.delete(pid)`, `_lastInputAt.delete(pid)`, `_msgRate.delete(pid)`, `_fireSoundCd.delete(pid)`, `_spawnRate.delete(pid)`.

## A2. CRÍTICA — Validação de hit NÃO checa linha de visão (LoS) nem eixo Y (anti-cheat / parede)
- **Arquivo:** `tools/transfps-colyseus/src/rooms/WeaponTable.js:79-86` (`validateHit`).
- **Fato:** O range check usa só distância XZ (`dx`,`dz`), ignorando Y explicitamente ("// Range (XZ apenas — pula altura)"). Não há raycast contra geometria do mapa.
- **Impacto PvP:**
  - Player no topo de um prédio acerta alvo no chão (mesma XZ, Y muito diferente) com soco de range 2.2.
  - Atira/acerta ATRAVÉS de paredes — o servidor não sabe que há obstáculo entre atacante e alvo (o servidor não carrega a colisão do mapa). É um vetor de wallhack-damage real.
- **Fix:** Adicionar checagem de |dy| <= range para melee, e (ideal) um sistema de colisão server-side simplificado ou validação de oclusão. Pelo menos clampar Y no melee.

## A3. CRÍTICA — Anti-teleport por-tick é frouxo e a posição é 100% client-trusted
- **Arquivo:** `ArenaRoom.js:_onInput` linhas 577-595.
- **Fato:** O comentário admite "Trust limitado: cliente envia posição (server-auth real exigiria simular)". O único filtro é `d > 50` por tick (588) — 50 unidades a 20Hz = 1000 u/s. Não há validação de velocidade contínua, colisão, nem gravidade. `ny` (altura) é aceito sem nenhum limite.
- **Impacto PvP:** Speedhack/fly-hack/noclip indetectáveis abaixo de 50u/tick. Como toda a detecção de hit usa essas coordenadas (A2), um cheater pode se teleportar 49u/tick para ficar sempre em range de melee ou fugir de tiros. Em BR, pode-se setar `y` arbitrário para escapar da zona.
- **Fix:** Reduzir o cap por tick para algo coerente com a física real (`Player.SPEED=11`, sprint ~19.25 → ~1u/tick + margem de dash), validar Y contra um teto, e idealmente reconciliação server-side da física.

## A4. ALTA — Dano local de PvP só atualiza pela barra; sem reconciliação preditiva (lag = morte "do nada")
- **Arquivo:** `main.js:780-792` (recebimento) + `main.js:616-622` (`player_change` hp).
- **Fato:** Quem leva o tiro só toca `hurt`+flash (789) e a barra atualiza via `applyServerHp` quando o `hp` do schema muda (621). Não há predição/interpolação do dano recebido. O HP do alvo cai no servidor (`_onHitPlayer:649`) e chega como delta de schema.
- **Impacto PvP:** Com ping alto, o atacante já viu o hitmarker (preditivo, `CombatSystem.js:495`) mas a vítima só percebe o dano 1 RTT depois — sensação de "morri sem ver". Aceitável em estágio atual, mas é dívida de game-feel competitivo.
- **Fix:** Considerar buffer de snapshot de HP com interpolação curta, ou ack otimista de dano com rollback.

## A5. ALTA — `getStateCallbacks`/listeners atachados em `onStateChange.once`: race de welcome documentada mas não resolvida
- **Arquivo:** `ColyseusClient.js:204` + `_attachStateListeners` (286-394).
- **Fato:** O próprio código admite (291-298) que "Welcome às vezes chega sem o próprio player (race)". O re-emit em 388-393 cobre players já presentes, mas se o player PRÓPRIO chega num delta posterior, ele entra via `players.onAdd` (304) — OK — porém `this.nickname` só é setado se `serverNick` existir no welcome (296-298), podendo ficar nulo.
- **Impacto PvP:** Em entradas sob latência, nickname/HUD do próprio player pode ficar inconsistente até o próximo patch. Não trava, mas é frágil.
- **Fix:** Setar `this.nickname` também dentro do `players.onAdd` quando `key === this.playerId`.

## A6. ALTA — Toda a detecção de hit melee é client-side; servidor só valida range/cooldown (não valida que o alvo estava no arco/frente)
- **Arquivos:** `CombatSystem.js:_applyHit` (354-670) decide o alvo no cliente via `intersectsMesh`/`_inFront` (cone) e então chama `sendHitPlayer` (491). O servidor (`WeaponTable.validateHit`) NÃO reaplica o teste de arco/direção — só distância + cooldown + pvp.
- **Fato:** O cliente envia apenas `{to, weapon}` (`ColyseusClient.js:441`). O servidor confia que o alvo estava na frente.
- **Impacto PvP:** Um cliente modificado pode mandar `hit_player` para qualquer alvo dentro do range (mesmo às costas / sem animação de ataque), com o cooldown da arma. Aim-bot de melee 360°.
- **Fix:** Server validar ângulo entre `attacker.ry` e a direção até o alvo (cone), além de range.

## A7. ALTA — Knockback/flinch do PvP é só PREDITIVO no atacante; o alvo não recebe knockback replicado
- **Arquivos:** `CombatSystem.js:500` (`m._remoteRef.playHit(...)` — preditivo, cosmético no lado do atacante) e `WeaponSystem.js:570`. O servidor (`_onHitPlayer:649-668`) só altera `hp`; nunca toca posição nem manda evento de knockback.
- **Fato:** Comentário em `CombatSystem.js:497-499` confirma: "É cosmético — o snapshot do server reconverge a posição no próximo tick".
- **Impacto PvP:** O player ATINGIDO não sente empurrão real (a posição dele é autoritativa via input dele mesmo). Só o atacante vê o boneco "voar" e o server puxa de volta no tick seguinte → desync visual de knockback entre os dois clientes. Combate de "voadeira/manda longe" não existe de fato no alvo.
- **Fix:** Server aplicar um deslocamento/impulso na posição do alvo (ou flag de stun temporário que o cliente-alvo respeita) e broadcastar. Ver seção B.

## A8. MÉDIA — `_inFront`/hitbox melee usa `_pl.yaw` e zera X/Z; em TPS o tiro/golpe sai do centro do personagem, não da câmera (paralaxe de mira)
- **Arquivos:** `CombatSystem.js:407-431` (melee usa `yaw` do player, não a direção da câmera/mira) e `WeaponSystem.js:480-500` (gun: TPS usa `_tpsRayOrigin` nos "olhos", FPS usa `camera.position`).
- **Fato:** Para o GUN há tratamento explícito de origem TPS (497-499: `_tpsRayOrigin.add(dir.scale(0.6))`), mas a DIREÇÃO continua `camera.getDirection(Forward)` (491). Para o MELEE, a direção é puramente o `yaw` horizontal do player (409), ignorando o pitch da câmera — golpe sempre horizontal.
- **Impacto PvP:** Em TPS, mirar para cima/baixo com melee não acompanha (golpe é sempre no plano). No gun, a origem nos olhos + direção da câmera pode divergir do crosshair em alvos muito próximos (paralaxe residual ombro→centro). Não é game-breaking, mas afeta precisão percebida.
- **Fix:** Para melee, derivar a direção do `camera.getForwardRay()` projetada; para gun TPS, considerar mirar da câmera para o ponto sob o crosshair (raycast de tela) e reorientar a origem.

## A9. MÉDIA — Coins/gems do pickup são contados em DUAS fontes divergentes (server `player.coins` vs cliente `player._coins`)
- **Arquivos:** Server `ArenaRoom.js:_onPickupDrop` (1155-1161) soma em `player.coins` (autoritativo). Cliente `main.js:712-719` soma em `player._coins`/`player._gems` (local) com comentário "futuro: server-side".
- **Fato:** Duas contagens paralelas. A persistência (`persistStats:42`) usa `player.coins` (server). O HUD pode mostrar o `_coins` local.
- **Impacto PvP:** Divergência de saldo entre o que o HUD mostra e o que é salvo no Supabase. `coins` não está no schema replicado de forma usada pelo cliente para o saldo — risco de confundir o jogador.
- **Fix:** Unificar: replicar `coins`/`gems` via schema e ler só do server no HUD.

## A10. MÉDIA — `mp` (mana) não existe no schema; usado por broadcast solto e nunca persistido
- **Arquivos:** `ArenaRoom.js:_onUseItem` (1091-1093: "mp não está no schema ainda — broadcast pra cliente aplicar") e `main.js:709`.
- **Impacto PvP:** Mana é puramente client-side; skills que deveriam custar mana não têm gate autoritativo de recurso. Spam de skill só é limitado por cooldown (`validateSkillCast`), não por mana.
- **Fix:** Adicionar `mp/maxMp` ao `PlayerState` e validar custo no `_onCastSkill`.

## A11. MÉDIA — `index.js` não configura CORS/limites de origem explícitos no Express/WS
- **Arquivo:** `tools/transfps-colyseus/src/index.js` (todo o arquivo). Só há `express.json()` (24) e o monitor com basic-auth (32-41).
- **Fato:** Não há restrição de origem para o WebSocketTransport nem rate-limit de conexões por IP. `JWT_REQUIRED` em `ArenaRoom.onAuth:320` é o único gate (e pode ser desligado por env `JWT_REQUIRED=0`, 324-326).
- **Impacto PvP:** Qualquer origem pode abrir socket. Flood de `joinOrCreate` (criação de salas) não é limitado → DoS de salas. Se `JWT_REQUIRED=0` vazar pra prod, auth cai inteiro.
- **Fix:** Allowlist de origem no transport, rate-limit de criação de sala por IP, e travar `JWT_REQUIRED` em prod.

## A12. MÉDIA — `_onHitObject` (world objects) confia no `dmg` enviado pelo cliente
- **Arquivo:** `ArenaRoom.js:_onHitObject` (1749-1762).
- **Fato:** `const dmg = Math.min(50, Math.max(1, parseInt(payload?.dmg) || 10));` — diferente de todo o resto do combate, aqui o dano vem do cliente (clampado 1-50). Não usa `WeaponTable`. Também não há range check nem cooldown.
- **Impacto PvP:** Cliente pode destruir construções (world_objects de outros players) à distância e em qualquer cadência (sem cooldown), spammando `hit_object` com dmg=50.
- **Fix:** Derivar dano da `WeaponTable` pela arma equipada, adicionar range + cooldown como em `_onHitProp`.

## A13. BAIXA — `heavyAttack()` é stub que só loga
- **Arquivo:** `CombatSystem.js:159-162` (`console.log("Heavy attack — em desenvolvimento")`).
- **Impacto:** Ataque carregado (hold RMB) prometido não existe. Sem impacto funcional, mas é feature morta referenciada.

## A14. BAIXA — `swordUltimate` pode entrar mesmo sem poder atacar (lógica de guarda invertida)
- **Arquivo:** `CombatSystem.js:177-185`.
- **Fato:** `if (!this.stateMachine.canAttack() && !this.stateMachine.isAttacking()) return;` — permite ultimate DURANTE outro ataque (`isAttacking()` true), cancelando-o sem checar cooldown da ultimate. Pode quebrar o ritmo de combo/cancel.
- **Impacto PvP:** Possível spam de ultimate cancelando animações; o cooldown real da ultimate é só server-side (`WeaponTable: sword_ultimate cdMs 2500`), então o visual local diverge do dano autoritativo.

## A15. BAIXA — `kill feed` e `died` dependem de nicks que podem não estar no state (fallback "alguém")
- **Arquivo:** `main.js:817-823`. Usa `_remotePlayers.get(...)?.nickname` ou `cs.state.players.get(...)?.nickname` com fallback `'alguém'/'player'`.
- **Impacto PvP:** Em mortes logo após alguém sair/entrar, o killfeed mostra "alguém ☠ player". Cosmético.

---

# B) O QUE FALTA IMPLEMENTAR (features incompletas para PvP completo)

## B1. CRÍTICA — Anti-cheat de melee server-side (ângulo + LoS + Y)
- **Onde:** `WeaponTable.validateHit` (79-86) só valida distância XZ + cooldown + pvp.
- **Falta:** Validação de que o alvo estava no cone frontal do atacante (A6), na linha de visão (A2) e dentro do range vertical. Hoje o servidor é "trust-light": confia que o cliente acertou.
- **Impacto:** Sem isso, melee é 360°/através-de-parede para qualquer cliente modificado.

## B2. CRÍTICA — Knockback/stun replicado pelo servidor
- **Onde:** `_onHitPlayer` (627-668) só muda `hp`. Knockback é preditivo-cosmético no atacante (A7).
- **Falta:** Server aplicar empurrão na posição do alvo OU enviar evento `knockback`/`stun` que o cliente-alvo aplica e reporta (com janela em que o input do alvo é parcialmente travado). Sem isso, o "manda longe" do combate hack-and-slash não existe de verdade no MP.

## B3. ALTA — LOD / instancing nos props do mapão (BiomeWorld)
- **Arquivo:** `src/game/scene/BiomeWorld.js` (301 linhas). `grep` por `createInstance|thinInstance|addLODLevel|MergeMeshes|freezeWorldMatrix|registerInstancedBuffer` → **0 ocorrências**. Os meshes só recebem `checkCollisions=true` (212, 275).
- **Falta:** Sem instancing nem LOD, cada prop do mapão é um draw call próprio em bind-pose completo. Mapas grandes (`calcata` raio 14, `lowpolyCity`, `nightCity`) geram muitas draw calls.
- **Impacto PvP:** Custo de render alto no mapão (Lucas relatou tela preta/lag de boot — já parcialmente resolvido por re-fit bbox, mas o custo de runtime de muitos meshes únicos permanece). Falta `mesh.freezeWorldMatrix()` em estáticos, merge de geometria repetida, e LOD por distância.

## B4. ALTA — Validação server-side de recurso (mana) para skills
- **Onde:** `_onCastSkill` (827-898) valida só cooldown (`validateSkillCast`). Mana não existe no schema (A10).
- **Falta:** Custo de mana autoritativo. Hoje skills de dano AOE (855-897) aplicam dano em players/mobs limitadas só por cooldown.

## B5. ALTA — Sistema de espectador / morte real em modos não-BR
- **Onde:** Em CLASSIC/OPEN_WORLD, ao morrer (`_onHitPlayer:657-666`) o player só marca `dead=true` + `respawn_at` (respawn em 5s, `_onRespawn:1694`). BR tem `SPECTATING` (`_brOnPlayerDeath:1554`), mas modo arena não tem espectador.
- **Falta:** Killcam/DeathCam foi REMOVIDA explicitamente (`main.js:825-829`) — ao morrer a câmera fica solta até respawn. Não há tela de espectar o assassino nem placar de morte. Falta fluxo de morte polido para deathmatch.

## B6. ALTA — Killfeed estruturado + placar/scoreboard de partida
- **Onde:** `main.js:1147+` (`_showKillFeed`) é uma `<div>` HTML com texto solto. `_kills` (server, Map) conta kills por player, e `PlayerState.kills/deaths` existem, mas não há UI de scoreboard (TAB) lendo `kills/deaths` de todos.
- **Falta:** Scoreboard ao vivo (K/D/ping por player), killfeed com armas/ícones. Os dados já existem no schema (`kills`, `deaths`, `ping`) — falta a UI.

## B7. MÉDIA — Matchmaking real / balanceamento de salas
- **Onde:** `ColyseusClient.quickPlay` (187-196) faz `joinOrCreate('arena', {map})` e `index.js` filtra só por `map` (56). Não há skill-based matchmaking, região (exceto BR1 hardcoded), nem balanceamento de times.
- **Falta:** Seleção de região, times balanceados, fila. Hoje é "entra na primeira sala do mapa".

## B8. MÉDIA — Balanceamento de armas é tabela estática sem telemetria de uso
- **Onde:** `WeaponTable.WEAPONS` (11-41). Valores hardcoded (ex: `rifle dmg 28 cdMs 110` = ~255 dps; `pistol dmg 40 cdMs 280`; `sword_ultimate dmg 180`). `pushTelemetry` (94-115) loga match-level, não por-arma.
- **Falta:** Telemetria de dano/kills por arma para balancear. Divergência notável: cliente `PistolaBucaneira.damage=40` bate com server, mas `RiflePesado.damage=22` (cliente) vs `rifle dmg 28` (server) — o número de dano AUTORITATIVO é 28, mas o cliente exibe 22 nos damage numbers de PvE local (`WeaponSystem.js:548,564`). Inconsistência de display.

## B9. MÉDIA — Sistema de progressão incompleto (level só dá maxHp; sem desbloqueios)
- **Onde:** `_awardKill`/`computeLevel` (719-735) — level-up só aumenta `maxHp` (`100 + (lvl-1)*12`, 730). Não há desbloqueio de armas/skills/skins por level.
- **Falta:** Árvore de progressão, unlocks. `xp`/`level`/`coins` são persistidos (`persistStats`), mas não destravam conteúdo.

## B10. MÉDIA — Anti-cheat geral: sem detecção de rate anômalo de hits, nem ban/kick
- **Onde:** Há rate-limit de mensagens (`MSG_RATE_MAX=30/s`, declarado 210-211) mas **não há código que aplique esse limite** — `grep` mostra `_msgRate` só usado em `_onSpawnFx` (964, max 5 FX/s). O `MSG_RATE_MAX` global nunca é checado nos handlers de input/hit.
- **Falta:** Aplicar o rate-limit global declarado, detectar padrões impossíveis (hits acima da cadência da arma já são barrados por cooldown, mas flood de `input`/`hit_player` rejeitados não gera kick), e mecanismo de kick/ban.

## B11. BAIXA — Reconexão preserva state por 15s, mas leak de Maps (A1) não é tratado na reconexão
- **Onde:** `onJoin` reconexão (433-446) e `onLeave` `allowReconnection` (524-533).
- **Falta:** Coerência com a limpeza de Maps (A1) — se limpar Maps no leave, precisa não limpar durante o grace de reconexão.

## B12. BAIXA — `_onClaimQuest` é pass-through sem validação server-side
- **Onde:** `ArenaRoom.js:361-368` — comentário admite "Cliente chama RPC direto no Supabase ... Aqui só repassa broadcast". O server não valida se a quest foi de fato completada.
- **Impacto:** Confia no cliente para o claim (a RPC do Supabase é o único gate). Aceitável se a RPC valida via RLS, mas é dívida de confiança.

---

## Top 5 mais críticos (resumo de ação)
1. **A1** — Maps de cooldown nunca limpos em `onLeave` → leak fatal na sala 24/7 (`ArenaRoom.js:204-209, 517-574`).
2. **A2 / B1** — `validateHit` ignora Y e linha de visão → dano através de parede / por cima (`WeaponTable.js:79-86`).
3. **A3** — Posição 100% client-trusted, anti-teleport frouxo (50u/tick) → speed/fly/noclip hack (`ArenaRoom.js:577-595`).
4. **A6 / B1** — Hit melee decidido no cliente; server não valida ângulo/frente → aimbot melee 360° (`CombatSystem.js:354+`, `ColyseusClient.js:441`).
5. **A7 / B2** — Knockback PvP só preditivo-cosmético; server nunca replica empurrão/stun → combate "manda longe" não existe no alvo (`CombatSystem.js:497-500`, `ArenaRoom.js:649-668`).
