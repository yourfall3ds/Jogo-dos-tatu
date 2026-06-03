# External Integrations

**Analysis Date:** 2026-06-03

## Overview

TransFPS integrates with three external systems plus several CDNs:
1. **Colyseus** self-hosted game server (authoritative multiplayer)
2. **Supabase** (Auth, Postgres schema `transfps`, Realtime, Storage)
3. **Babylon.js CDN** + **esm.sh** for engine/libs and the Havok/Recast WASM
4. **Meshy AI** / **Sketchfab** for 3D asset generation/download (dev tooling)

Assets are self-hosted (local static files), not on a third-party 3D CDN.

## Multiplayer — Colyseus

**Relay/server:**
- Client URL (hardcoded): `wss://app.overpixel.online/transfps-cs` — `src/main.js:130` (`TRANSFPS_CS_URL`).
- Nginx reverse-proxies `wss://app.overpixel.online/transfps-cs` → `127.0.0.1:2567` (Colyseus default port). See `tools/transfps-colyseus/src/index.js:11`.
- Server deploy: `/opt/transfps-colyseus/`, systemd `transfps-colyseus.service`.

> Note: `src/game/auth/SupabaseClient.js:25` also hardcodes `TRANSFPS_MP_WS_URL: 'wss://app.overpixel.online/transfps-mp'`. That is the **older caseiro relay** URL; the active game multiplayer path uses `transfps-cs` (Colyseus). `transfps-mp` is referenced in config but the live gameplay client connects via `TRANSFPS_CS_URL`.

**Client** (`src/game/multiplayer/ColyseusClient.js`):
- `colyseus.js@0.16.6` via `https://esm.sh/colyseus.js@0.16.6`.
- `new Client(wsUrl)` → `joinOrCreate('arena', { token, nickname, avatar_url, map, ... })`, `joinById`, `quickPlay`. Lobby list via built-in `LobbyRoom` (`joinOrCreate('lobby')`) with realtime room listing.
- State sync via `@colyseus/schema@3.0` `getStateCallbacks($)`. Server state is authoritative; client is a pure consumer. `Remote*` proxies (`RemotePlayer`, `RemoteMob`, `RemoteDrop`, `RemoteProp`, `RemoteFx`) mirror server entities.
- Input upstream throttled to 20 Hz (`INPUT_RATE_MS = 50`).
- Large message taxonomy already wired (player/mob/drop/prop/world_object/boss/party/battle-royale events).

**Server** (`tools/transfps-colyseus/src/`):
- `index.js` — `@colyseus/core` `Server` + `@colyseus/ws-transport` `WebSocketTransport`, Express for `/health` and `/colyseus` monitor (basic auth, `MONITOR_PASS`). Rooms: `lobby` (built-in `LobbyRoom`), `arena` (`ArenaRoom`, `enableRealtimeListing().filterBy(['map'])`).
- **"BRASIL 1"** — persistent 24/7 `OPEN_WORLD` arena (map default `cemetery`, max 50). Auto-created on boot and re-created every 60 s if it drops (`ensureBrasil1`).
- `rooms/ArenaRoom.js` — match logic; `schema/ArenaState.js` — synced state; `rooms/SkillTable.js`, `rooms/WeaponTable.js` — server-side balance tables.

**Auth handshake (server-side JWT validation)** — `ArenaRoom.onAuth` (`tools/transfps-colyseus/src/rooms/ArenaRoom.js:322`):
- Client passes the Supabase access token as `options.token` on join.
- Server verifies via `jose`: prefers HS256 with `SUPABASE_JWT_SECRET`; otherwise RS256 via `createRemoteJWKSet(SUPABASE_URL + '/auth/v1/.well-known/jwks.json')`.
- Extracts `sub` (user id), `email`, `avatar_url` from the JWT. `JWT_REQUIRED=0` disables the check (dev).

## Supabase

**Project:**
- URL: `https://myylkpoisqijfnptlnyk.supabase.co` (hardcoded in `src/game/auth/SupabaseClient.js:22` and server env default `ArenaRoom.js:17`).
- Anon key hardcoded for prod in `SupabaseClient.js:24`. In dev, config is fetched from local config-server `http://127.0.0.1:3099/transfps-env`.
- Client SDK: `@supabase/supabase-js@2.57.4` via `https://esm.sh`.
- **Schema: `transfps`** (isolated from the Chibata project). Many calls use `.schema('transfps').from(...)`; some use flattened `transfps_*` table/view/RPC names in the public schema.

**Auth** (`src/game/auth/AuthSystem.js`, `SupabaseClient.js`):
- Provider: **Google OAuth** via `signInWithOAuth({ provider: 'google' })` (`AuthSystem.js:123-133`), opened in a **popup** window (`transfps_google_login`).
- Flow type: **implicit** (`flowType: 'implicit'`, `SupabaseClient.js:62`). PKCE broke across opener↔popup; implicit returns `access_token` directly in the hash. `detectSessionInUrl: false` — the popup callback is handled manually.
- The OAuth callback (popup) is detected in `src/main.js:73-105` (URL has `?code=`/`?auth=callback`/`#access_token=`). It clears the page, runs `AuthSystem.handleOAuthCallback()`, and posts tokens back to the opener via `BroadcastChannel('transfps-auth')`.
- Session persisted in `localStorage` under key `transfps-auth`, with `autoRefreshToken: true`. Login resolution listens on `onAuthStateChange` + polling + BroadcastChannel.

**RPCs called** (Postgres functions, schema `transfps` / `transfps_*`):
- Client: `transfps_ensure_profile`, `transfps_set_nickname`, `transfps_ensure_daily_quests`, `transfps_send_friend_request`, `transfps_list_friends`, `transfps_accept_friend`, `transfps_decline_friend`, `transfps_set_tutorial_completed` (`AuthSystem.js`, `TransfpsSocial.js`).
- Server (via REST `/rest/v1/rpc/...` with service-role key, `ArenaRoom.js`): `transfps_apply_match_result_v2`, `transfps_quest_progress`, `transfps_log_match_telemetry`. Also direct REST read of `transfps_profiles`.

**Tables / views accessed:**
- `transfps_profiles` (profile), `transfps_leaderboard`, `transfps_daily_quests_view`, `transfps.daily_quests` (`TransfpsSocial.js`, `AuthSystem.js`)
- `transfps.world_objects` — shared-world constructions (`src/game/data/WorldObjects.js`)
- `transfps.inventory`, `transfps.settings` — cloud save (`src/game/data/CloudSave.js`)
- `transfps_storage` — generic key/value collection store (`src/game/data/LocalDB.js`)

**Realtime** (`src/game/data/WorldObjects.js:142-155`):
- Channel `transfps_world_objects` subscribes to `postgres_changes` INSERT/UPDATE/DELETE on `transfps.world_objects` → live building/destruction across all players.
- RLS requires an authenticated channel: `supa.realtime.setAuth(token)` is called before subscribe (otherwise the channel is anon and RLS blocks it).

**Storage** (`src/game/data/AssetHosting.js`):
- Public bucket `transfps-assets`. In-game generated GLBs (Meshy) are uploaded (`storage.from('transfps-assets').upload(..., { contentType: 'model/gltf-binary', upsert: true })`) and shared via `getPublicUrl` so all players load the same asset. Requires a logged-in session (RLS). Falls back to the local `assets/generated/` path when not logged in/offline.
- A public URL is recognized by `/storage/v1/object/public/` in the URL.

## Meshy AI

- 3D model generation. Client: `src/game/meshy/MeshyClient.js`, `MeshyPanel.js`, `AssetWishlist.js`.
- API host `https://api.meshy.ai`. In dev, requests go through the local config-server proxy (`tools/config-server.js`, port 3099) which injects `MESHY_KEY` from `.env` (or the `X-Meshy-Key` header).
- The start-screen server pill (`index.html`) reports config-server status and whether the Meshy key is present.

## Sketchfab

- Asset download tooling: `tools/sketchfab-download.js` (script, uses `SKETCHFAB_KEY` from `.env`). Many shipped GLBs live under `assets/itens 3d/ExternalAssets/Sketchfab/...`. Not a runtime integration — assets are downloaded then committed (Git LFS) and served locally.

## CDNs (runtime, loaded by the browser)

- Babylon core/loaders/materials — `https://cdn.babylonjs.com/...` (`index.html`)
- Havok physics WASM — `https://cdn.babylonjs.com/havok/HavokPhysics_umd.js` (`PhysicsWorld.js:14`)
- Recast navmesh WASM — `https://cdn.babylonjs.com/recast.js` (`NavMeshManager.js:18`)
- esm.sh — `@supabase/supabase-js@2.57.4`, `colyseus.js@0.16.6`

## Cloudflare CDN

- The site is served via the `overpixel.online` zone (fronted by Cloudflare per project infra). `index.html` ships aggressive `Cache-Control: no-store` meta tags for dev and versions `main.js` with a `?v=` query string (`src/main.js?v=20260603-31`) to bust caches on deploy.
- Per project deploy convention, edits to files served behind Cloudflare require a **zone purge** before reporting done (see project memory `reference_purge_cloudflare`). No purge automation script was found in `tools/` — purge is a manual/operational step.

## Static Assets

- All 3D/audio assets are **local static files** under `assets/` (~4.4 GB), served directly (relative paths). No third-party 3D asset CDN.
- Map GLBs: `assets/chibata-maps/` (catalog in `ChibataMapLoader.js` `MapCatalog`). Biome/decoration GLBs: `assets/forgotten/` (`BiomeWorld.js`). Other dirs: `assets/itens 3d/`, `assets/weapons/`, `assets/characters/`, `assets/chibata-mobs/`, `assets/Sound FX/`, `assets/music/`, `assets/Spells/`, `assets/digimons/`, `assets/br/`, `assets/animations/`, `assets/generated/` (Supabase-hosted, excluded from manifest).
- `assets/assets-manifest.json` (committed) lists native assets so the browser-only client can discover them without directory listing.

## Deploy Flow

**Client (static):**
1. Build/optimize is N/A (no bundler). Ensure `assets/assets-manifest.json` is regenerated (`node tools/gen-assets-manifest.mjs`) if assets changed.
2. Bump the `?v=` cache-bust on `src/main.js` in `index.html`.
3. Copy static tree (`index.html`, `admin.html`, `src/`, `assets/`, `sounds/`) to `/var/www/transfps/` on VPS `72.61.25.35` (scp/rsync).
4. **Purge the Cloudflare zone** for `overpixel.online` so the new `main.js`/assets are served.

**Colyseus server:**
1. Deploy `tools/transfps-colyseus/` to `/opt/transfps-colyseus/` on the VPS (with its `node_modules`).
2. `systemctl restart transfps-colyseus.service`.
3. Server env must provide `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (or rely on JWKS), `SUPABASE_SERVICE_ROLE_KEY`, `MONITOR_PASS`, optional `PORT`/`BRASIL1_*`/`JWT_REQUIRED`.
4. Nginx already maps `transfps-cs` → `127.0.0.1:2567` (TLS/wss terminated at Nginx/Cloudflare).

## Environment Configuration

**Dev (`.env`, gitignored — see `.env.example`):**
- `MESHY_KEY`, `SKETCHFAB_KEY` (asset tooling)
- Supabase URL/anon key are served to the client by config-server `/transfps-env` in dev (prod uses hardcoded values).

**Server (`process.env`):**
- `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_REQUIRED`, `MONITOR_PASS`, `PORT`, `BRASIL1_MAP`, `BRASIL1_MAX_PLAYERS`

**Secrets locations:**
- Client prod secrets: anon key + WS URLs are hardcoded in `src/game/auth/SupabaseClient.js` and `src/main.js` (anon key is intended public; service-role is **never** in client).
- Service-role key lives only in the Colyseus server environment on the VPS.

## Webhooks & Callbacks

- **Incoming:** none (no inbound webhook endpoints in client or server).
- **Outgoing:** OAuth redirect/callback handled in-app via popup + `BroadcastChannel('transfps-auth')` (not an external webhook). Server makes outbound REST calls to Supabase RPC endpoints with the service-role key.

---

*Integration audit: 2026-06-03*
