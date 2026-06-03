# Online & Persistência — Arquitetura (TransFPS / DigimonFPS)

> Documento de referência. Decisões: **mundo único global** compartilhado · **quebrar um asset devolve o próprio asset recolocável** ao inventário · **migrar todo o armazenamento local para o Supabase**.

---

## 1. Regra de ouro: VPS vs Supabase

| Camada | Vive em | O que guarda | Como |
|---|---|---|---|
| **Tempo real / efêmero** | **VPS (Colyseus)** `wss://app.overpixel.online/transfps-cs` | Posição, rotação, hp em combate, ataques, IA de inimigos, quem está online agora, props da partida | `ArenaState` (MapSchema), 10 Hz, server-authoritative |
| **Durável / global** | **Supabase** (schema `transfps`) | Perfil, level/xp, **skin equipada**, **inventário**, **construções do mundo**, assets gerados, config de jogo | Tabelas Postgres + RLS |

**Quem escreve no Supabase:**
- **Dados do mundo compartilhado** (construções, estado quebrado) → **o servidor Colyseus escreve** (service role). O cliente manda *intenção* (`place_object`, `break_object`), o servidor valida, atualiza o estado ao vivo e persiste. Mantém o padrão server-authoritative que já existe (mobs, props, perfis).
- **Dados por-usuário** (perfil, skin, inventário, settings, assets gerados) → **o cliente escreve direto** via supabase-js com RLS (`owner = auth.uid()`).

---

## 2. Estado de HOJE (mapa do que existe)

### 2.1 Servidor Colyseus (VPS) — JÁ FUNCIONA
- `tools/transfps-colyseus/` — rooms `lobby` + `arena` (CLASSIC / BATTLE_ROYALE), tick 10 Hz.
- **Inimigos, bosses, props (barril/caixa), drops e FX são server-authoritative** — todos batem no MESMO inimigo, sem spawn duplicado (`MpGuard` bloqueia spawn local em sala).
- Valida JWT do Supabase no `onAuth`; carrega perfil no join; persiste resultado no leave (RPC `transfps_apply_match_result_v2`).

### 2.2 Cliente multiplayer
- URL **hardcoded** em [main.js:123](src/main.js:123) → sem alternância dev/prod (melhorar).
- Envia 20 Hz: `x,y,z,ry,vy,state(anim),weapon(id)`.
- **Gaps**: RemotePlayer é uma **cápsula colorida** (sócio está fazendo o corpo); arma na mão é placeholder (`weapon` chega mas não renderiza GLB); sem animação real.

### 2.3 Persistência LOCAL (o problema central)
Tudo passa pelo choke-point [LocalDB.js](src/game/data/LocalDB.js). **Em produção ele usa SÓ `localStorage`** → nada é compartilhado entre players.

**12 coleções via LocalDB** (config-server `tools/db/*.json` + fallback localStorage):
`placed`, `placed_frames`, `machines_placed`, `scene`, `generated_assets`, `weapons`, `items`, `wishlist_done`, `generated_chars`, `builtin_group_overrides`, `asset_props_overrides`, `asset_default_scale`, `asset_thumbnails` (1.2 MB).

**13 chaves soltas em localStorage:**
`transfps-auth` (sessão Supabase, fica), `transfps_class_id` (skin), `digifps_inv` (inventário), `digifps_stats` (stats), `transfps_anim_map`, `transfps_anim_names`, `transfps_music_volume`, `transfps_music_muted`, `transfps_blood`, `transfps_loading_skin`, `meshy_api_key`, `transfps_tutorial_done`, `TRANSFPS_QUIET`.

### 2.4 Construções (BuildMode, tecla B)
Salva por objeto: `p[x,y,z]`, `ry`, `sc`/`s` (escala), tipo (`url`/`pieceId`/`kind`), `groupProps{physics, breakable, collide, castShadows, hp, bounce, collectable}`. **Só local. Outros não veem.**

### 2.5 Destruição ([GameObject.js](src/game/scene/GameObject.js))
- ✅ `hp` (escala com tamanho), `applyImpulse()→hp--`, `break()` com debris, `collect()→inventory.add(itemId)`.
- ❌ **Sem rachaduras progressivas**. ❌ **Sem regeneração**. ❌ Estado quebrado **não persiste** (volta intacto no F5).

### 2.6 Inventário ([Inventory.js](src/game/items/Inventory.js))
`bag[{id,qty}]`, `equip{slot:id}`, `hotbar[9]`. `add(id,qty)` com stacking. `toJSON/load`. Persistido local (`digifps_inv`), sem sync.

---

## 3. Schema Supabase proposto (schema `transfps`)

> Tudo no schema `transfps` — não toca o resto do banco da empresa.

```sql
-- 3.1 MUNDO COMPARTILHADO (global). Escrito pelo servidor Colyseus (service role).
create table transfps.world_objects (
  id           uuid primary key default gen_random_uuid(),
  world_id     text not null default 'global',        -- futuro: vários mundos
  owner_id     uuid references auth.users(id),         -- quem colocou
  kind         text not null,                          -- 'glb' | 'piece' | 'frame'
  asset_id     text,                                   -- id da lib/gerado ou pieceId
  url          text,                                   -- glb url (nullable p/ piece)
  px double precision, py double precision, pz double precision,
  ry double precision default 0,
  sx double precision default 1, sy double precision default 1, sz double precision default 1,
  props        jsonb default '{}'::jsonb,              -- physics/breakable/collide/hp/bounce...
  broken       boolean default false,                  -- estado durável
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index on transfps.world_objects (world_id) where broken = false;
-- RLS: leitura p/ todos autenticados; escrita só service role (servidor).

-- 3.2 INVENTÁRIO (por usuário, last-write-wins)
create table transfps.inventory (
  user_id    uuid primary key references auth.users(id),
  bag        jsonb default '[]'::jsonb,
  equip      jsonb default '{}'::jsonb,
  hotbar     jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- 3.3 SETTINGS / preferências (por usuário) — volume, sangue, anim configs, skin etc.
create table transfps.settings (
  user_id    uuid primary key references auth.users(id),
  data       jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 3.4 ASSETS GERADOS (Meshy) — dono escreve, mundo lê (p/ carregar GLB dos outros)
create table transfps.generated_assets (
  id         text primary key,                         -- mantém id atual
  owner_id   uuid references auth.users(id),
  name       text,
  glb_url    text,
  image_url  text,
  group_id   text,
  created_at timestamptz default now()
);

-- 3.5 CONFIG GLOBAL DE JOGO (armas, catálogo de itens, overrides, escalas) — admin
create table transfps.game_config (
  key        text primary key,                         -- 'weapons','items','asset_props_overrides'...
  data       jsonb not null,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);
```

**Profiles (já existe `transfps.profiles`)**: adicionar `class_id int` e `equipped_skin text` (ou guardar em `settings.data`).
**Thumbnails (1.2 MB)**: bucket de **Storage** `transfps-thumbnails` (não relacional).

**RLS resumido:**
- `world_objects`: `select` para `authenticated`; `insert/update/delete` só `service_role` (servidor).
- `inventory`, `settings`: dono total (`user_id = auth.uid()`).
- `generated_assets`: `select` todos; `insert/update/delete` dono.
- `game_config`: `select` todos; escrita admin (lista de uids ou claim).

---

## 4. Migração do LocalDB (mapeamento coleção → destino)

Reescrever [LocalDB.js](src/game/data/LocalDB.js) mantendo a API `get/save` (não mexe nos ~12 call sites), roteando internamente:

| Coleção/Chave atual | Destino Supabase | Escopo |
|---|---|---|
| `placed`, `placed_frames`, `machines_placed` | `world_objects` (kind glb/frame/piece) | global (servidor) |
| `scene` | `world_objects` (objetos de cena) | global |
| `digifps_inv` | `inventory` | por-usuário |
| `digifps_stats`, `transfps_class_id` | `profiles` / `settings` | por-usuário |
| `generated_assets`, `generated_chars` | `generated_assets` | dono, mundo lê |
| `weapons`, `items`, `asset_props_overrides`, `asset_default_scale`, `builtin_group_overrides`, `wishlist_done` | `game_config` (1 linha por chave) | global/admin |
| `asset_thumbnails` | Storage bucket | — |
| áudio/sangue/anim/loading skin/quiet | `settings.data` | por-usuário (quiet pode ficar local) |

localStorage continua como **cache offline** (escreve local + Supabase; lê Supabase, cai no local se offline).

---

## 5. Plano em fases

- **F0 — Fundação Supabase** *(foundational)* — **EM ANDAMENTO**:
  - ✅ Tabelas + RLS criadas no schema `transfps` (migration `transfps_world_and_persistence`): `world_objects`, `inventory`, `settings`, `generated_assets`, `game_config`. Auditor de segurança limpo.
  - ✅ `CloudSave.js` (per-usuário) + **inventário e stats** religados pro Supabase (`transfps.inventory` / `transfps.settings.data`), com localStorage como cache offline. Boot verificado sem erros.
  - ⏳ Migrar restante: assets gerados (precisa hosting de GLB público), config de jogo (`game_config`, escrita só servidor/admin), e prefs soltas → `settings`.
  - **Nuance de autoria de escrita** (importante): `world_objects` e `game_config` são **escritos só pelo servidor (service_role)** — o cliente só lê. Logo eles NÃO entram no swap simples do `LocalDB`; dependem do handler Colyseus (F2) / path de admin. `inventory`, `settings`, `generated_assets` são graváveis direto pelo cliente (RLS dono).
- **F1 — Arma na mão dos remotos**: renderizar GLB da arma no RemotePlayer pelo campo `weapon`. *(coordenar com o sócio que faz o corpo).*
- **F2 — Construções compartilhadas globais** — **CÓDIGO PRONTO** (pendente teste multi-cliente):
  - **PIVOT de arquitetura** (autorizado pelo dono): em vez do servidor Colyseus, o mundo é **cliente-escreve + Supabase Realtime** — mais simples, testável sem redeploy da VPS, e 100% no Supabase. RLS do `world_objects` liberado pra mundo **colaborativo total** (qualquer autenticado constrói/modifica/destrói qualquer objeto), Realtime ligado.
  - `src/game/data/WorldObjects.js`: CRUD + Realtime (insert/update/delete ao vivo) + mapeamento linha↔registro do BuildMode.
  - `BuildMode`: ao logar carrega o mundo global do Supabase e assina Realtime (vê builds dos outros na hora); ao colocar persiste; undo/apagar-chão remove do mundo; dedupe do próprio echo. Sem login → fallback local (offline).
  - ⚠️ **Limitação conhecida**: assets **da biblioteca embutida** (caminhos relativos) sincronizam e carregam pra todos. Assets **gerados no Meshy** usam blob/URL local → NÃO carregam pra outros players até terem **hosting público** (depende da F4). Por isso comecem o mundo com itens da biblioteca.
- **F3 — Destruição sandbox** — **CÓDIGO PRONTO** (pendente teste in-game):
  - `src/game/build/Breakable.js`: hp em GOLPES (escala com tamanho), rachaduras progressivas (material escurece + brasa avermelhada cresce + squash no hit), **regenera** se parar de bater (~2.2s), e ao quebrar **dropa o próprio asset recolocável** pro inventário (`inventory.addBuildable`).
  - `BuildMode._attachBreakable`: todo asset GLB colocado/carregado vira quebrável; `_onObjectBroken` dropa + `WorldObjects.markBroken` (some pra todos via Realtime) + remove local.
  - `CombatSystem`: golpe de melee em malha `m._breakable` chama `.hit()` (dedupe por golpe).
  - Quebrado persiste como `broken=true` (não recarrega). ⚠️ Teste real exige login + colocar objeto + bater nele.

---

## 6. Pendências / riscos
- URL do Colyseus hardcoded → transformar em config (env/localStorage) p/ alternar dev/prod.
- Senha do monitor Colyseus hardcoded (`transfps-admin-2026`) → mover p/ env.
- Banco é **produção compartilhada** com o negócio → migrations só no schema `transfps`, com cuidado.
- ⚠️ Advisory do Supabase: `public.app_trial_events` está com **RLS desabilitado** (não é do jogo, mas exposto ao anon key). Avaliar `ALTER TABLE public.app_trial_events ENABLE ROW LEVEL SECURITY;` + políticas.
