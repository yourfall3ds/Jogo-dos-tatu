# Codebase Structure

**Analysis Date:** 2026-06-03

## Directory Layout

```
Jogo-dos-tatu/
├── index.html              # Entry HTML do cliente (carrega src/main.js)
├── admin.html              # Painel admin standalone
├── package.json            # Scripts de dev (serve estático, config-server, LAN https)
├── start.bat               # Atalho Windows
├── assets/                 # GLBs: chibata-maps/, forgotten/ (props/trees/chests)
├── sounds/                 # Áudio
├── src/                    # ── Código do CLIENTE (Babylon.js v9 + WebGPU) ──
│   ├── main.js             # ORQUESTRADOR (~115KB): boot, engine, render loop, fiação MP
│   ├── Player.js           # Controller FPS/TPS local (CharacterController + câmera)
│   ├── WeaponSystem.js     # Armas de fogo + raycast hitscan + sendHit MP
│   ├── PlayerAnimator.js   # Blend de animações do avatar do player
│   ├── InputManager.js     # Teclado/mouse + pointer lock
│   ├── Level.js            # Terreno + obstáculos (checkCollisions, sem Havok no mundo)
│   ├── HUD.js              # HUD básico
│   ├── Enemy.js            # MonsterPlant (inimigo legado solo)
│   ├── AssetLoader.js      # Carrega GLBs do projeto
│   ├── SoundManager.js     # Sons do jogo
│   ├── AnimConfigUI.js     # UI de config de animação
│   ├── WallJumpController.js
│   ├── utils/              # debug.js, quietConsole.js
│   └── game/               # ── Subsistemas ──
│       ├── multiplayer/    # Rede Colyseus + réplicas remotas
│       ├── combat/         # Melee, FX de impacto, hit-stop, sangue
│       ├── scene/          # Mundo: biomas, level, luz, água, sombras
│       ├── ui/             # Todas as telas/HUDs
│       ├── br/             # Battle Royale (skydive, zona, lobby, minimap)
│       ├── build/          # Modo construção + destruição
│       ├── items/          # Inventário, drops, catálogo, máquinas
│       ├── enemies/        # Spawning, NavMesh, director (modo solo/PvE local)
│       ├── animation/      # Controllers, library, layered animator, VAT
│       ├── player/         # FSM, troca de personagem
│       ├── skills/         # Habilidades ativas
│       ├── weapons/        # Configs e meshes de armas
│       ├── data/           # AssetRegistry, hosting, cloud save, catálogos
│       ├── auth/           # Supabase client + AuthSystem (Google OAuth)
│       ├── physics/        # PhysicsWorld (Havok init)
│       ├── stats/          # PlayerStats
│       ├── effects/        # BulletTracer, HitMarker
│       ├── audio/          # MusicSystem
│       ├── meshy/          # Integração Meshy AI (geração de assets)
│       ├── vr/             # VRSystem (WebXR, força WebGL2)
│       └── debug/          # ColliderDebug, MonsterDebugMode, ThumbnailGen
└── tools/
    └── transfps-colyseus/  # ── SERVIDOR (Node 20, Colyseus 0.16) ──
        └── src/
            ├── index.js            # Bootstrap: define lobby + arena, porta 2567
            ├── rooms/ArenaRoom.js  # Sala server-authoritative (1896 linhas)
            ├── rooms/WeaponTable.js# Dano/range/cooldown autoritativos
            ├── rooms/SkillTable.js # Definição de skills (server)
            └── schema/ArenaState.js# Schema replicado (@colyseus/schema)
```

## Directory Purposes

**`src/` (raiz):**
- Purpose: núcleo do jogo single-file por responsabilidade grande
- Key files: `main.js` (orquestrador), `Player.js` (controller local), `WeaponSystem.js`, `Level.js`, `InputManager.js`

**`src/game/multiplayer/`:**
- Purpose: toda a rede e as réplicas server-state
- Key files:
  - `ColyseusClient.js` — wrapper do `colyseus.js`, state callbacks, `send*`/`on(event)`
  - `RemotePlayer.js` (1390 l.) — réplica interpolada de outro player (GLB + nameplate + overlay de ataque)
  - `RemoteMob.js` — visual de mob server-auth (GLB por `state.kind`)
  - `RemoteDrop.js` / `RemoteProp.js` / `RemoteFx.js` — loot/props/fx replicados
  - `MpGuard.js` — fonte única "estou em sala MP?"; bloqueia spawns LOCAIS dentro da sala
  - `DeathCam.js` — câmera de morte cinematográfica (legada; loop atual sem killcam)

**`src/game/combat/`:**
- Purpose: melee local + feedback de impacto
- Key files:
  - `CombatSystem.js` — detecção melee por arco frontal, envia `sendHitPlayer/Mob/Prop`
  - `ComboSystem.js`, `HitStop.js`, `ImpactEffectSystem.js`, `DamageNumbers.js`
  - `BloodFX.js`, `BloodTrail.js`, `LocalAura.js`

**`src/game/scene/`:**
- Purpose: construção e streaming do mundo
- Key files:
  - `BiomeWorld.js` — mapão por biomas, streaming por proximidade + re-fit por bbox
  - `Level.js` (em `src/Level.js`) — cena base, colisores via checkCollisions
  - `ChibataMapLoader.js` — troca de mapas GLB grandes
  - `ColliderOptimizer.js` (`sweepHeavyColliders`), `DayNightCycle.js`, `GraphicsEnhancer.js`, `WaterSystem.js`, `SkillMapExtras.js`, `TestArena.js`, `SceneEditor.js`

**`src/game/ui/`:**
- Purpose: telas, HUDs e guards de fluxo
- Key files: `ServerListUI.js` (lista de salas), `LobbyUI.js`, `IngameHud.js` (chat/scoreboard in-game), `MapSelectUI.js` (tecla N), `CharacterSelectUI.js` (tecla P), `PvpToggle.js`, `SettingsUI.js` (tecla O), `TransfpsSocial.js` (XP/level/social), `BootLoadGuard.js`, `TransfpsFlowGuard.js`, `LoginScreen.js`, `RpgHUD.js`

**`src/game/br/` (Battle Royale):**
- Purpose: modo BR client-side
- Key files: `BattleRoyaleMode.js` (orquestrador), `SkydiveController.js` (queda WASD), `StormZone.js` (círculo da zona), `BattleBus.js`/`DropPod.js`/`TakeoffSequence.js` (entrada), `LandingImpact.js`, `Minimap.js`, `LobbyHall.js`, `CharacterSelect3D.js`, `BattleRoyaleHUD.js`, `LoadingScreenSkin.js`

**`src/game/build/`:**
- Purpose: construção e destruição (estilo sandbox)
- Key files: `BuildMode.js` (colocar peças, tecla R/Q), `BuildPieces.js`, `Breakable.js` (destruição por golpes)

**`src/game/items/`:**
- Purpose: economia/itens
- Key files: `Inventory.js` (mochila+hotbar+equip), `DropSystem.js` (loot de inimigos), `ItemCatalog.js` (data-driven), `AssetMachine.js` (máquina interativa no mapa), `AssetLink.js`

**`src/game/enemies/` (PvE local):**
- Purpose: inimigos do modo solo/local (em MP os mobs vêm do server via RemoteMob)
- Key files: `EnemyManager.js` (AssetContainers + cache), `CombatDirector.js` (mantém N vivos perto do player), `NavMeshManager.js` (Recast), `AnimatedEnemy.js`

**`src/game/data/`:**
- Purpose: registro de assets + persistência
- Key files: `AssetRegistry.js` (fonte única de GLBs), `AssetHosting.js` (upload Supabase Storage), `CloudSave.js`, `WorldObjects.js` (mundo global compartilhado), catálogos (`EnemyCatalog`, `TemplateDB`, `LocalDB`, `GeneratedAssets`, `AssetGroups`)

**`src/game/auth/`:**
- Purpose: sessão e identidade
- Key files: `AuthSystem.js` (sessão Supabase + Google OAuth), `SupabaseClient.js`

**`tools/transfps-colyseus/src/`:**
- Purpose: servidor authoritative
- Key files: `index.js`, `rooms/ArenaRoom.js`, `rooms/WeaponTable.js`, `rooms/SkillTable.js`, `schema/ArenaState.js`

## Key File Locations

**Entry Points:**
- `index.html` → `src/main.js`: boot do cliente
- `tools/transfps-colyseus/src/index.js`: boot do servidor (porta 2567)

**Configuration:**
- `.env` / `.env.example`: env do cliente/build
- `tools/transfps-colyseus/` env (server): `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_REQUIRED`, `PORT`, `MONITOR_PASS`

**Core Logic:**
- Render loop: `src/main.js` `engine.runRenderLoop` (~linha 1872)
- Player local: `src/Player.js`
- Rede: `src/game/multiplayer/ColyseusClient.js`
- Server tick: `tools/transfps-colyseus/src/rooms/ArenaRoom.js` `_tick` (~1765)

**Networking deploy:**
- VPS `/opt/transfps-colyseus`, systemd `transfps-colyseus.service`, porta 8091/2567
- Nginx → `wss://app.overpixel.online/transfps-cs` (e `/transfps-mp`)

## Naming Conventions

**Files:** PascalCase por classe/módulo (`RemotePlayer.js`, `BiomeWorld.js`, `ArenaRoom.js`). Um export principal por arquivo.

**Diretórios:** lowercase por domínio (`multiplayer`, `combat`, `scene`, `br`).

**Réplicas remotas:** prefixo `Remote*` (`RemotePlayer`, `RemoteMob`, `RemoteDrop`, `RemoteProp`, `RemoteFx`). Marcadores em meshes: `_isRemotePlayer`/`_remoteRef`, `_isRemoteMob`/`_mobRef`, `_isRemoteProp`/`_propRef`, `_isHitProxy`.

**Mensagens de rede:** snake_case (`hit_player`, `remote_fire`, `hit_confirmed`, `br_skydive_start`, `world_object_placed`).

**Schema:** classes `*State` (`PlayerState`, `MobState`, `ZoneState`), maps em `ArenaState`.

## Where to Add New Code

**Novo sistema de cliente (mundo/jogo):**
- Implementação: `src/game/<dominio>/NovoSistema.js`
- Fiação: importar e instanciar em `src/main.js`; chamar `.update(dt)` no render loop (com `try/catch` se opcional)

**Nova entidade replicada (server→cliente):**
1. Adicionar sub-schema + map em `tools/transfps-colyseus/src/schema/ArenaState.js`
2. Popular/atualizar no `ArenaRoom` (`_tick` ou handler)
3. Registrar listeners em `ColyseusClient._attachStateListeners` (`$(state).<map>.onAdd/onRemove/listen`) + entrada em `_listeners`
4. Criar réplica em `src/game/multiplayer/Remote*.js`
5. Conectar `cs.on('<x>_add'/'<x>_change'/'<x>_remove')` em `main.js`

**Nova arma / ajuste de dano:**
- Server (fonte da verdade): `tools/transfps-colyseus/src/rooms/WeaponTable.js` (`WEAPONS[id] = {dmg, range, cdMs, kind}`)
- Cliente (visual/mesh): `src/game/weapons/` + `src/WeaponSystem.js`
- O cliente envia só `weapon` id no `sendHit*` — NUNCA dmg

**Nova mensagem de rede:**
- Server: `this.onMessage('<tipo>', ...)` no `ArenaRoom.onCreate` + handler `_on<X>`
- Cliente: `room.onMessage('<tipo>', ...)` em `ColyseusClient._bindRoom` + entrada em `_listeners` + método `send<X>`

**Novo bioma:**
- `src/game/scene/BiomeWorld.js`: adicionar entrada em `BIOMES` (pos sem sobreposição, >=180m do centro). Re-fit por bbox e scatter de props são automáticos.

**Nova skill:**
- Server: `tools/transfps-colyseus/src/rooms/SkillTable.js`
- Cliente: `src/game/skills/SkillSystem.js`

## Special Directories

**`assets/`:**
- Purpose: GLBs (chibata-maps/, forgotten/props|trees|chests)
- Committed: sim (LFS via `.gitattributes` provável)

**`tools/transfps-colyseus/`:**
- Purpose: servidor independente (próprio `package.json`, `type: module`, Node >=20)
- Deploy: VPS `/opt/transfps-colyseus`

## Dependency Map (arquivos críticos)

```
main.js  (orquestrador — importa ~60 módulos)
 ├─ Player.js ──► WeaponSystem.js ──► game/weapons/*
 │                              └──► window._cs.sendHit* (combate→rede)
 │     └─ PhysicsWorld.js (Havok) · PlayerAnimator.js · InputManager.js
 ├─ Level.js / BiomeWorld.js ──► AssetRegistry · ColliderOptimizer · DayNightCycle
 ├─ combat/CombatSystem.js ──► window._cs.sendHitPlayer/Mob/Prop
 │     └─ HitStop · BloodFX · ImpactEffectSystem · DamageNumbers
 ├─ multiplayer/ColyseusClient.js  ◄── único ponto de I/O de rede
 │     ├─ MpGuard.js (bloqueia spawn local)
 │     └─ cs.on(...) ──► cria RemotePlayer / RemoteMob / RemoteDrop / RemoteProp
 ├─ br/BattleRoyaleMode.js ──► SkydiveController · StormZone · Minimap
 └─ auth/AuthSystem.js ──► SupabaseClient.js (JWT → onAuth do server)

SERVIDOR:
index.js ──► rooms/ArenaRoom.js
                ├─ schema/ArenaState.js (estado replicado)
                ├─ rooms/WeaponTable.js (validateHit — anti-cheat)
                ├─ rooms/SkillTable.js (validateSkillCast)
                └─ Supabase RPC (persistStats / quests / telemetry / loadProfile)
```

**Globais de acoplamento (cliente):** `window._cs`, `window._remotePlayers`, `window._gameInput`, `window._dmgNumbers`, `window._bloodFX`, `window._hitStop`, `window._hitMarker`, `window._assetMachines`. Usados pra combate→rede e FX cross-módulo sem passar refs por construtor.

---

*Structure analysis: 2026-06-03*
