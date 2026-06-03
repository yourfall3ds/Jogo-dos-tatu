<!-- refreshed: 2026-06-03 -->
# Architecture

**Analysis Date:** 2026-06-03

## System Overview

TransFPS é um FPS/TPS multiplayer web. O **cliente** (Babylon.js v9 + WebGPU) é puro renderizador/preditor; o **servidor** (Colyseus, Node 20) é a fonte de verdade do estado. Modo principal: `OPEN_WORLD` (sala única persistente 24/7, `BRASIL1`).

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       CLIENTE (browser, WebGPU)                       │
├──────────────────┬──────────────────────┬───────────────────────────┤
│   Player local   │   Sistemas combate   │   Réplicas remotas         │
│  `src/Player.js` │ `game/combat/*`       │ `game/multiplayer/*`       │
│  `WeaponSystem`  │ `WeaponSystem.js`     │ RemotePlayer/Mob/Drop/Prop │
└────────┬─────────┴──────────┬───────────┴─────────────┬─────────────┘
         │ runRenderLoop (main.js: orquestrador ~115KB)  │
         │                    │                          │
         ▼ predição local     ▼ send('input'/'hit_*')    ▼ interpolação
┌─────────────────────────────────────────────────────────────────────┐
│              ColyseusClient `game/multiplayer/ColyseusClient.js`      │
│   send(...) ──────────────►            ◄────────── onMessage / state  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ wss://app.overpixel.online/transfps-cs
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│        SERVIDOR Colyseus  `tools/transfps-colyseus/src/index.js`      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ArenaRoom (`rooms/ArenaRoom.js`) — server-authoritative        │   │
│  │  onAuth(JWT Supabase) · onJoin/onLeave · onMessage(handlers)   │   │
│  │  _tick(dt) @10Hz: mob AI · boss · BR zone · match director      │   │
│  │  WeaponTable (dmg/range/cd) · SkillTable                        │   │
│  │  ArenaState schema (MapSchema players/mobs/drops/props/fx/wo)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▼ fire-and-forget RPC
┌─────────────────────────────────────────────────────────────────────┐
│   Supabase (schema `transfps`): profiles, quests, telemetry, match    │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Orquestrador | Boot, engine WebGPU, render loop, fiação MP/combate | `src/main.js` |
| Player local | Controller FPS/TPS, física, câmera, tiro hitscan | `src/Player.js` |
| WeaponSystem | Armas de fogo, raycast hitscan, `sendHitMob/Player` | `src/WeaponSystem.js` |
| CombatSystem | Melee (soco/chute/espada): detecção por arco frontal | `src/game/combat/CombatSystem.js` |
| ColyseusClient | Wrapper do `colyseus.js`, state callbacks, send/notify | `src/game/multiplayer/ColyseusClient.js` |
| RemotePlayer | Réplica interpolada de outro player | `src/game/multiplayer/RemotePlayer.js` |
| RemoteMob/Drop/Prop/Fx | Réplicas de mobs/loot/props/fx server-state | `src/game/multiplayer/Remote*.js` |
| BiomeWorld | Mapão por biomas, streaming por proximidade | `src/game/scene/BiomeWorld.js` |
| Level | Cena base, luzes, sombras, colisores | `src/Level.js` |
| ArenaRoom | Sala server-auth: tick, hits, match, BR | `tools/transfps-colyseus/src/rooms/ArenaRoom.js` |
| WeaponTable | Fonte ÚNICA de dano/range/cooldown (anti-cheat) | `tools/transfps-colyseus/src/rooms/WeaponTable.js` |
| ArenaState | Schema autoritativo replicado | `tools/transfps-colyseus/src/schema/ArenaState.js` |

## Pattern Overview

**Overall:** Cliente-servidor **server-authoritative** com state sync por delta (Colyseus Schema) + predição/interpolação no cliente.

**Key Characteristics:**
- **Servidor é dono do dano/HP/morte.** O cliente NUNCA envia `dmg` — só `weapon` + `target`. O servidor consulta `WeaponTable` (`validateHit`) e calcula dano, valida cooldown e range.
- **Estado replicado via `@colyseus/schema@3`** (`ArenaState`) com `getStateCallbacks` — `onAdd`/`onRemove`/`listen` por campo.
- **Eventos transientes via `broadcast`/`onMessage`** (não vão pro schema): `remote_fire`, `hit_confirmed`, `died`, `xp_gain`, `level_up`, etc.
- **Predição local + reconvergência:** o player local move-se na hora (predição); RemotePlayers interpolam com buffer (RENDER_LAG). O próximo snapshot do server reconverge.
- **OPEN_WORLD:** sala única persistente, sem `autoDispose`, `maxClients` até 64. `match_state=RUNNING` desde sempre.

## Layers

**Render/Game (cliente):**
- Purpose: renderizar a cena, rodar predição local, interpolar réplicas
- Location: `src/`, `src/game/`
- Entry: `src/main.js` `engine.runRenderLoop`
- Depends on: Babylon.js v9 (WebGPU), Havok WASM (física do player)

**Networking (cliente):**
- Purpose: traduzir state do server em entidades visuais e vice-versa
- Location: `src/game/multiplayer/`
- Hub: `ColyseusClient` (event emitter `on(event, cb)`)

**Server-auth (servidor):**
- Purpose: simular/validar tudo, persistir stats
- Location: `tools/transfps-colyseus/src/`
- Tick: `setSimulationInterval(_tick, 100)` → 10Hz

## Data Flow

### Render loop do cliente (`src/main.js:1872`)

1. `dt = min(getDeltaTime()/1000, 0.05)` — clamp anti-spike.
2. Modos especiais (`monsterDebugMode`, `animatorMode`, `_engineMode`) fazem early-return com `scene.render()`.
3. `hitStop.update(dt)` — se `frozen`, congela lógica (pose de impacto).
4. Quando `input.gameActive`: `player.update(dt)` → `level.update` → `stats.update` → `skills.update`.
5. **Bloco MP** (`if (cs.connected)`): `cs.sendInput(player)` (20Hz throttle), `_pingTick`, `brMode.update`, depois `rp.update(dt, camera)` por RemotePlayer, `m.update` por RemoteMob, auto-pickup de drops (`cs.sendPickup` se dist < 1.6).
6. **Morte/respawn:** lê `cs.state.players.get(meuId).dead`; em `dead→false` chama `player.respawn()` reposicionando na pos do server.
7. `biomeWorld.update(dt, player.mesh.position)` — streaming 2Hz.
8. `combatDirector` · `navMesh` · `dropSystem` · `dayNight` · `hud.update()` · `scene.render()`.

### Player local vs RemotePlayer

| Aspecto | Player local (`Player.js`) | RemotePlayer (`RemotePlayer.js`) |
|---------|---------------------------|----------------------------------|
| Movimento | Predição imediata via input do teclado | Interpolação de snapshots do schema |
| Física | `PhysicsCharacterController` (Havok) + `moveWithCollisions` fallback | Nenhuma — só posição do server |
| Posição | Local, enviada ao server por `cs.sendInput` | `state.x/y/z/ry` interpolados em `update()` |
| Câmera | `FreeCamera` própria (FPS/TPS, tecla V) | Nameplate em screen-space (Vector3.Project) |
| anim_state | Derivado da física, enviado ao server | Recebido (`idle/walk/run/fall`) → clipe real do GLB |
| Hitbox | n/a (é o atacante) | Capsule `_isHitProxy`/`_isRemotePlayer`, `_remoteRef` |
| Combate visual | Toca local na hora | Overlay transiente de ataque via `remote_fire` |

**`cs.sendInput` (`ColyseusClient.js:397`):** envia `{x,y,z,ry,vy,state,weapon,held_item}` a 20Hz. `anim_state` é **locomoção** derivada da velocidade horizontal (`run` se `_sprinting || speed>14`, `walk` se `>0.8`, senão `idle`, `fall` se não-grounded) — NÃO é o FSM de combate, pra o RemotePlayer tocar passos/anim certa.

**RemotePlayer interpolação (`RemotePlayer.js:885`):** buffer de snapshots com `RENDER_LAG_MS`; busca par a/b por timestamp e faz lerp factor `f`. Teleporte (respawn) > 5m → SNAP direto. Segundo suavizador `k = min(1, dt*18)`. Aplica `root.rotation.y = ToRadians(ry) + Math.PI` (avatar Meshy exporta de costas).

### Combate — melee (client-detect + server-auth damage)

1. Cliente detecta acerto local: `CombatSystem._inFront()` testa **arco frontal** (range + `ARC_COS`: espada ~107°, soco/chute ~70°) + `activeHitbox.intersectsMesh`.
2. Por tipo de alvo, envia mensagem (SEM dmg real):
   - RemotePlayer → `window._cs.sendHitPlayer(remoteRef.playerId, _, animName)` (`CombatSystem.js:491`)
   - RemoteMob → `sendHitMob(mobRef.id, _, animName)` (`:460`)
   - RemoteProp → `sendHitProp(propRef.id, animName)` (`:442`)
3. Feedback **preditivo** imediato no atacante: damage number, hitmarker, knockback cosmético, sangue.
4. Servidor (`ArenaRoom._onHitPlayer`/`_onHitMob`) chama `validateHit` (WeaponTable): PvP gate, cooldown por `(playerId, weaponId)`, range XZ + 1u de tolerância. Se OK aplica `target.hp -= dmg` e `broadcast('hit_confirmed', {from,to,weapon,dmg})`.
5. Cliente recebe `hit_confirmed` (`main.js:726`): sangue/dmg number no alvo confirmado, BulletTracer, KillCam refs.
6. Tiro de fogo: `WeaponSystem` faz raycast hitscan local; `Player.js:152` e `WeaponSystem.js:565/581` enviam `sendFire` + `sendHitMob/Player`. `sendFire('fire_sound')` → server rebroadcast posicional `remote_fire` pra parceiros OUVIREM/VEREM o tiro mesmo no erro.

### Som/visual de disparo do parceiro (`remote_fire`)

1. Cliente atira → `cs.sendFire(weapon, melee, dir)` → `room.send('fire_sound', {...})`.
2. Server `_onFireSound` (`ArenaRoom.js:602`): throttle 55ms/player, rebroadcast `remote_fire` com **posição server-auth** do atirador + `dx/dy/dz` clampados.
3. Cliente `cs.on('remote_fire')` (`main.js:883`): toca som posicional + overlay de ataque no avatar (`RemotePlayer._playAttackOverlay`).

### State sync (entidades persistentes)

- `ColyseusClient._attachStateListeners` (`:286`) usa `getStateCallbacks($)`.
- `$(state).players.onAdd` → `_notify('player_add')` + `$(player).listen(campo, cb)` por campo (hp, dead, pvp_on, weapon, x/y/z/ry, anim_state...).
- `main.js` cria/atualiza/remove `RemotePlayer`/`RemoteMob`/`RemoteDrop` nos eventos `*_add/*_change/*_remove`.

### Streaming de biomas (`BiomeWorld`)

1. `update(dt, playerPos)` roda a 2Hz (`_checkT`).
2. Para cada bioma em `BIOMES` (grade sem sobreposição, >=180m do centro): calcula dist XZ.
3. `dist < STREAM_IN (260)` e não carregado → `_loadBiome`. `dist > STREAM_OUT (420)` e carregado → `_unloadBiome` (histerese evita liga/desliga).
4. `_loadGlbInto`: importa GLB, **RE-FIT POR BBOX** — `getHierarchyBoundingVectors(true)` (após `computeWorldMatrix` da hierarquia), escala pra maior eixo XZ virar `targetSize (150m)`, centraliza XZ e põe pé no chão (`footY=min.y`). Evita tela preta por mapa gigante cobrindo a câmera.
5. Props/baús: `_scatterProps` com RNG seedado (`mulberry32`, seed por bioma) → **layout determinístico** (todos os clientes veem igual).

### Física do player

- `Player._initCharacterController` (`Player.js:217`): se `physicsReady()`, cria `BABYLON.PhysicsCharacterController` (Havok) com `maxStepHeight=0.6`, `maxSlopeCosine=0.45`, fricção alta. `mesh.checkCollisions=false` (CC cuida).
- Fallback sem Havok: `moveWithCollisions` + `ellipsoid` (`Player.js:325`), com sweep manual de degraus.
- Grounded: `_cc.checkSupport(dt, down)` → `supportedState`. Sem CC: `_checkGrounded` por raycast.
- **Mundo** (`BiomeWorld`/`Level`): geometria usa `checkCollisions=true` (colisão andável barata) em vez de Havok mesh-shape (que trava/estoura memória em mapas grandes). O CharacterController do player colide contra isso.

## Key Abstractions

**ArenaState (schema):**
- Purpose: estado replicado por delta
- File: `tools/transfps-colyseus/src/schema/ArenaState.js`
- Maps: `players`, `mobs`, `drops`, `props`, `fx`, `world_objects`. Sub-schemas: `PlayerState` (pos, hp, anim_state, weapon, held_item, inv, BR fields), `BossState`, `ZoneState`, `MobState`, `WorldObjectState`.

**ColyseusClient (event hub):**
- Purpose: única ponte cliente↔server. `on(event, cb)` (lança erro se evento não registrado em `_listeners`).
- File: `src/game/multiplayer/ColyseusClient.js`

**WeaponTable / validateHit:**
- Purpose: anti-cheat — dano/range/cooldown autoritativos
- File: `tools/transfps-colyseus/src/rooms/WeaponTable.js`

## Entry Points

**Cliente:** `index.html` → `src/main.js` (boot async: AuthSystem OAuth callback, engine WebGPU, cena, login/lobby, join sala).

**Servidor:** `tools/transfps-colyseus/src/index.js` — `gameServer.define('lobby', LobbyRoom)` + `define('arena', ArenaRoom).enableRealtimeListing().filterBy(['map'])`, porta 2567, monitor em `/colyseus`, health em `/health`.

## Architectural Constraints

- **Threading:** cliente single-thread (render loop). Havok roda em WASM. Servidor single-thread por sala (Colyseus).
- **Global state (cliente):** fiação MP via globais — `window._cs` (ColyseusClient), `window._remotePlayers` (Map), `window._gameInput`, `window._dmgNumbers`, `window._bloodFX`, `window._hitStop`, `window._hitMarker`. Combate envia hits por `window._cs?.sendHit*`.
- **MpGuard:** `game/multiplayer/MpGuard.js` bloqueia spawns LOCAIS de mobs/drops quando numa sala (`enterRoom`) — em MP tudo vem do server. Liberado em `exitRoom`.
- **Engine:** WebGPU puro em modo solo (`FALLBACK_WEBGL=false` em `main.js:302`); WebGL2 forçado só no Quest browser (WebXR). PostFX é proibido por perf.
- **Tick de input:** server filtra deltas absurdos (anti-teleport > 50u/tick em `_onInput`), rate limit global 30 msg/s/player.

## Anti-Patterns

### Cliente calculando/enviando dano

**What happens:** tentar `room.send('hit', {dmg})` confiando no número do cliente.
**Why it's wrong:** vetor de cheat; o servidor é dono do HP.
**Do this instead:** envie só `weapon` + `target` (`sendHitPlayer(targetId, _dmgIgnored, weapon)`); o server resolve via `validateHit`/`WeaponTable`.

### Mandar o FSM de combate como `anim_state` na rede

**What happens:** enviar `armed/attacking/sword` no `anim_state` do input.
**Why it's wrong:** RemotePlayer espera locomoção (`walk/run`) pra tocar passos e achar o clipe do GLB — passos nunca tocam, T-pose.
**Do this instead:** derive locomoção da velocidade (ver `ColyseusClient.sendInput:425`). Ataque vai por `remote_fire` (overlay transiente), não pelo schema.

### Havok mesh-shape em mapa grande

**What happens:** dar collider Havok mesh aos GLBs do BiomeWorld.
**Why it's wrong:** trava / estoura memória.
**Do this instead:** `mesh.checkCollisions = true` (ver `BiomeWorld._loadGlbInto:212`); só o player usa CharacterController.

### Resetar scale de node de GLB quantizado

**What happens:** zerar `scaling` de um node de GLB Meshy/quantizado.
**Why it's wrong:** quebra a geometria (escala maluca de origem).
**Do this instead:** RE-FIT por bbox (`getHierarchyBoundingVectors` → escala/pé no chão), nunca reset manual.

## Error Handling

**Strategy:** isolamento por `try/catch` no render loop pra um erro não travar o frame (ex.: `biomeWorld.update`, `pingDisplay`, `brMode.update` com flag `__brErrLogged` pra logar só 1x).

**Patterns:**
- MP callbacks (`ColyseusClient._notify`) envolvem cada `cb` em try/catch.
- Server: RPCs Supabase são fire-and-forget (`.catch(()=>{})`) — falha de persistência não derruba a sala.
- `validateHit` retorna `{ok:false, reason}` e o server loga tentativas rejeitadas (anti-cheat trace) exceto `cooldown`.

## Cross-Cutting Concerns

**Logging:** `utils/quietConsole.js` (silencia ruído de boot), `utils/debug.js` (`DEBUG`). Servidor: `console.log/warn` com prefixos `[ArenaRoom]`, `[hit_player rejected]`, etc.
**Validation:** server-side em todo handler (`Number.isFinite`, clamp, slice de strings, rate limit).
**Authentication:** `ArenaRoom.onAuth` valida JWT Supabase (HS256 com `SUPABASE_JWT_SECRET`, fallback RS256 via JWKS). `JWT_REQUIRED` env.
**Persistência:** Supabase schema `transfps` via RPC service-role (`persistStats`, `pushQuestProgress`, `pushTelemetry`, `loadProfile`).

---

*Architecture analysis: 2026-06-03*
