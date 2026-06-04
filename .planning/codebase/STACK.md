# Technology Stack

**Analysis Date:** 2026-06-03

## Overview

TransFPS is a browser FPS multiplayer ("Transformice com armas"). The client is a **pure static site** — no bundler, no build step, no transpilation. Babylon.js loads from CDN via `<script>`, and every game module is a native ES module (`type="module"`) imported directly by the browser. The server side is a separate Node.js Colyseus authoritative server.

- Client entry: `index.html` → `<script type="module" src="src/main.js?v=20260603-31">`
- Game code: 122 `.js` files (~2.1 MB) under `src/` (no `node_modules` for the client)
- Server code: `tools/transfps-colyseus/` (Node ≥20, ES modules, has its own `node_modules`)

## Languages

**Primary:**
- JavaScript (ES2020+ modules) — entire client (`src/`) and server (`tools/transfps-colyseus/src/`). No TypeScript, no JSX.

**Secondary:**
- HTML/CSS — `index.html` (38 KB, all HUD/start-screen styles inline), `admin.html` (sound/asset uploader)

## Runtime

**Client:**
- Browser only. Requires WebGPU (preferred) or WebGL2. Served as static files.
- No transpile/bundle. The browser resolves the full ES-module import graph at load (`src/main.js` imports ~120 modules directly).

**Server (`tools/transfps-colyseus/`):**
- Node.js `>=20` (declared in `package.json` `engines`)
- ES modules (`"type": "module"`)

**Package Managers:**
- Root `package.json` has **no dependencies** — only npm scripts that shell out to `npx serve` and node helper tools. No lockfile at root.
- Server `package.json` has real deps + committed `node_modules/`.

## Engine & Rendering

**Babylon.js — loaded from CDN (not npm), pinned to `cdn.babylonjs.com` latest:**
- `https://cdn.babylonjs.com/babylon.js` — core engine
- `https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js` — glTF/GLB loaders
- `https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js` — `SkyMaterial` (day/night sky)
- Project treats this as **Babylon 9.10+** (audio v2 API; `BABYLON.WebGPUEngine`, `BABYLON.PhysicsCharacterController`). See `src/SoundManager.js:20-23` comment ("Babylon 9.10").

**WebGPU vs WebGL2** — `src/main.js:294-374`:
- **WebGPU is primary.** `BABYLON.WebGPUEngine.IsSupportedAsync` gate; `new BABYLON.WebGPUEngine(canvas, { stencil, antialias, adaptToDeviceRatio })` + `await gpu.initAsync()`.
- A dedicated `uncapturederror` handler filters the WebGPU error cascade and logs only the root error (`[WebGPU RAIZ]`).
- **WebGL2 is fallback** via `new BABYLON.Engine(...)`, used when: Quest browser UA detected (WebXR is incompatible with WebGPUEngine), or `?webgl` in URL.
- Current mode is **solo WebGPU test**: `let FALLBACK_WEBGL = false;` (`src/main.js:302`). With fallback OFF, an unsupported browser gets a clear error screen instead of a silent downgrade. A visible badge (🚀 WebGPU / 🛡️ WebGL2) is injected at top of screen. `window._engineKind` / `window._webgpu` expose the active mode.

## Physics

**Havok (WASM) — the real physics engine** — `src/game/physics/PhysicsWorld.js`:
- Loaded on demand from CDN: `https://cdn.babylonjs.com/havok/HavokPhysics_umd.js` (UMD loader injected as `<script>` once), then `await HavokPhysics()` → `new BABYLON.HavokPlugin(true, _havok)` → `scene.enablePhysics(new Vector3(0, -28, 0), plugin)`.
- Initialized **once** before world/player creation. Default gravity `-28`.

**Two physics patterns coexist:**
- **`PhysicsCharacterController`** (capsule) for the player — `src/Player.js:223`. Player visual capsule is created with `MeshBuilder.CreateCapsule`; the CC body is the actual collider (capsule has `alpha=0`). Also used in `src/game/scene/BiomeWorld.js`.
- **`PhysicsAggregate`** for world geometry and props — `src/game/physics/PhysicsWorld.js`:
  - `makeStaticBody(root, scene, shape)` — `mass: 0` static bodies. `'box'` = AABB box (cheap, floors/walls); `'mesh'` = `CONVEX_HULL` on the dominant mesh (ramps/stairs — the CC climbs them; full mesh colliders tanked FPS).
  - `makeDynamicBody(glbRoot, scene, {mass, friction, restitution})` — auto-picks shape via `_pickShapeType`: `SPHERE` (near-equal dims, rolls), `BOX` (flat/thin plates), else `CONVEX_HULL`.

**Pathfinding:** Recast/Detour via CDN — `https://cdn.babylonjs.com/recast.js` (`src/game/enemies/NavMeshManager.js:18`) for enemy navmesh.

## Asset Loading (GLB pipeline)

**GLB is the only 3D format.** Loaded via Babylon's glTF loader:
- `src/AssetLoader.js:87` — `BABYLON.SceneLoader.ImportMeshAsync('', folder, file, scene)`. Paths with spaces are URI-encoded per segment (`enc()` helper) because many asset folders have spaces (`assets/itens 3d/...`, `assets/Sound FX/...`).
- Assets are served **locally as static files** under `assets/` (relative paths) — no external 3D CDN. Total `assets/` is ~4.4 GB on disk.
- Maps are full GLB scenes loaded via `src/game/scene/ChibataMapLoader.js` (catalog `MapCatalog`) from `assets/chibata-maps/`; biome variants from `assets/forgotten/` (`src/game/scene/BiomeWorld.js:18-19`).

**Git LFS** (`.gitattributes`): `*.glb`, `*.glTF`, `*.wav`, `*.mp3`, `*.ogg` are tracked via Git LFS.

**Manifest** — `tools/gen-assets-manifest.mjs` indexes all native assets into `assets/assets-manifest.json` (committed). Browsers can't list directories, so the client reads this manifest to know the full native asset list. `assets/generated/` is excluded (those live in Supabase Storage).

**Note on Draco/KTX2/meshopt/WebP:** No explicit Draco/KTX2/meshopt/WebP decoder configuration was found in client code — GLBs are loaded as-is through the standard Babylon loader (CSP in `index.html` does allow KTX2/Draco workers via `'unsafe-eval'` and `worker-src blob:`, so compressed GLBs decode if present). The manifest tool recognizes `.webp` as an image type but there is no client-side transcode/optimization step.

## Audio

Three layers coexist:
- **Audio Engine v2 (Babylon 9)** — `src/SoundManager.js:20-37`. The legacy `new BABYLON.Sound` API does NOT load audio in Babylon 9.10 (audio engine no longer auto-created). Uses `BABYLON.CreateAudioEngineAsync()` (singleton) + `CreateSoundAsync`, with `unlockAsync()` to resume on first user interaction.
- **`SoundManager`** (`src/SoundManager.js`) — game SFX. Sources, in priority order: (1) IndexedDB uploads (DB `transfps-sounds`, via `admin.html`); (2) static files in `sounds/` and `assets/Sound FX/` (`.ogg/.wav/.mp3`). Missing sounds are silently ignored (never throws).
- **`MusicSystem`** (`src/game/audio/MusicSystem.js`) + `MusicMuteButton` UI — background music.
- Raw WebAudio is also used directly in places for procedural/low-latency effects (sound IDs map to disk fallbacks in `SoundManager._paths`).

## Key Client Subsystems (by directory)

- `src/game/animation/` — `AnimationLibrary`, `AnimationController`, `LayeredAnimator`, `MonsterVAT` (vertex-animation textures), animation-name movesets
- `src/game/combat/` — `CombatSystem`, `ComboSystem`, `ImpactEffectSystem`, `HitStop`, `BloodFX`, `DamageNumbers`
- `src/game/enemies/` — `EnemyManager`, `CombatDirector`, `NavMeshManager`
- `src/game/multiplayer/` — `ColyseusClient` + `Remote*` proxies (RemotePlayer/Mob/Drop/Prop/Fx)
- `src/game/scene/` — `ChibataMapLoader`, `BiomeWorld`, `DayNightCycle`, `WaterSystem`, `GraphicsEnhancer`, `SceneEditor`
- `src/game/br/` — Battle Royale mode (BattleBus, StormZone, SkydiveController, Minimap, DropPod)
- `src/game/build/` — `BuildMode`, `BuildPieces`, `Breakable` (placeable constructions)
- `src/game/vr/` — `VRSystem` (WebXR, WebGL2-only)
- `src/game/auth/` — `SupabaseClient`, `AuthSystem`
- `src/game/data/` — `WorldObjects`, `CloudSave`, `LocalDB`, `AssetHosting`, `AssetRegistry`

## External Libraries via CDN ESM (no npm, client)

- `@supabase/supabase-js@2.57.4` — `https://esm.sh/@supabase/supabase-js@2.57.4` (`src/game/auth/SupabaseClient.js:10`)
- `colyseus.js@0.16.6` — `https://esm.sh/colyseus.js@0.16.6` (`src/game/multiplayer/ColyseusClient.js:15`)

## Server Dependencies (`tools/transfps-colyseus/package.json`)

- `@colyseus/core` `^0.16.0` — game server framework
- `@colyseus/ws-transport` `^0.16.0` — WebSocket transport
- `@colyseus/schema` `^3.0.0` — state sync schema (client uses `getStateCallbacks`, schema v3 API)
- `@colyseus/monitor` `^0.16.0` — admin monitor at `/colyseus` (basic auth)
- `express` `^4.19.2` — HTTP layer (health + monitor mount)
- `jose` `^5.9.6` — JWT verification of Supabase tokens (`jwtVerify`, `createRemoteJWKSet`)

## Local Dev Tooling (`tools/`)

- `config-server.js` — local HTTP server on **port 3099**. Reads `.env`, proxies Meshy API, serves `/transfps-env` (Supabase config) and `/health`, and persists animation configs back into `src/PlayerAnimator.js`. Dev-only (the client detects prod by hostname and skips it).
- `npx serve` — serves the static client (port 5500 via `start.bat`, or default via `npm run server`)
- `lan-https.mjs` — HTTPS LAN server (for WebXR/Quest testing, needs secure context)
- `gen-assets-manifest.mjs` — regenerate `assets/assets-manifest.json`
- `glb-inspect.js`, `sketchfab-download.js` — GLB inspection / Sketchfab asset download

**Run commands (root `package.json`):**
```bash
npm start      # config-server (3099) + npx serve (static client)
npm run server # static client only
npm run config # config-server only
npm run lan    # HTTPS LAN server (WebXR)
# Windows: start.bat → config-server + serve on :5500 + open browser
```

## Configuration & Secrets

- `.env` (gitignored) holds `MESHY_KEY`, `SKETCHFAB_KEY` (see `.env.example`), and Supabase config consumed by `config-server.js` in dev.
- **In production, the client hardcodes** Supabase URL + anon key and the WS URLs (`src/game/auth/SupabaseClient.js:21-26`), because the local config-server does not run on the VPS. Prod is detected by hostname.
- Server reads secrets from `process.env`: `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (HS256, preferred), `SUPABASE_SERVICE_ROLE_KEY`, `JWT_REQUIRED`, `MONITOR_PASS`, `PORT`, `BRASIL1_MAP`, `BRASIL1_MAX_PLAYERS`.

## Platform Requirements

**Development:**
- Browser with WebGPU (Chrome/Edge) for the primary path; `?webgl` for WebGL2.
- Node ≥20 to run config-server and the Colyseus server.

**Production:**
- Static client deployed to `/var/www/transfps/` on VPS `72.61.25.35`, served behind Nginx (`app.overpixel.online`).
- Colyseus server at `/opt/transfps-colyseus/` as systemd service `transfps-colyseus.service`, port 2567, reverse-proxied to `wss://app.overpixel.online/transfps-cs`.

---

*Stack analysis: 2026-06-03*
