# Coding Conventions

**Analysis Date:** 2026-06-03

Convenções extraídas do código real do TransFPS — cliente estático Babylon.js v9, 122 arquivos `.js`, sem TypeScript, sem build step. Tudo roda direto no browser via ESM (`<script type="module" src="src/main.js">`).

## Naming Patterns

**Files:**
- `PascalCase.js` para módulos que exportam uma classe — 117 `export class` no projeto. Ex: `CombatSystem.js`, `RemotePlayer.js`, `WeaponSystem.js`, `ColyseusClient.js`.
- O nome do arquivo bate com o nome da classe exportada (1 classe principal por arquivo).
- Utilitários/dados também PascalCase quando exportam objeto/funções: `WeaponTable.js`, `AssetGroups.js`, `EnemyCatalog.js`. Exceções minúsculas: `animationNames.js`, `main.js`.
- Diretórios em `camelCase`/lowercase agrupando por domínio: `src/game/combat/`, `src/game/multiplayer/`, `src/game/weapons/`, `src/game/ui/`, `src/game/scene/`, `src/game/br/` (battle royale).

**Functions / métodos:**
- `camelCase` para métodos públicos: `spawn()`, `lockPointer()`, `update()`, `takeDamage()`, `applyServerHp()`, `respawn()`, `getDebugInfo()`.
- Prefixo `_` para métodos privados/internos: `_applyTPSAim()`, `_checkGrounded()`, `_createCamera()`, `_createMesh()`, `_executeNextAttack()`, `_moveWithStepUp()`, `_groundClamp()`. Convenção consistente em todo o codebase.

**Variables:**
- `camelCase` para locais e propriedades de instância.
- Propriedades de estado interno também usam `_` quando "privadas": `this._disposed`, `this._loading`, `this._listeners`, `this._lobbyPromise`, `this._inRoom`.

**Constantes:**
- `UPPER_SNAKE_CASE` para constantes de tuning em instâncias e tabelas: `this.CRIT_KB = 4.5`, `this.INPUT_RATE_MS = 50`, `this.BASE`, `ASSET_PATHS`, `WEAPONS`.

**Globais window:**
- `window._camelCase` com underscore inicial. Ver seção "Comunicação cross-module".

## Code Style

**Formatting:**
- 2 espaços de indentação. Sem ponto-e-vírgula opcional removido — `;` usado consistentemente.
- Aspas simples `'...'` para strings.
- Sem formatter configurado (não há `.prettierrc`, `.eslintrc`, nem `eslint.config.*` no projeto). Formatação é manual/por convenção.

**Linting:**
- Não detectado. Nenhuma ferramenta de lint. A "verificação" de sintaxe é manual (ver TESTING.md).

**Comentários:**
- **PT-BR sempre.** Comentários de bloco e inline em português. Ex: `// Cliente NUNCA envia dmg. Cliente manda 'weapon' e 'target'.`
- Cabeçalho de arquivo padrão: banner com linha de `─` (box-drawing) descrevendo o módulo, fluxo e regras. Padrão forte e replicável:
  ```js
  // ─────────────────────────────────────────────────────────────────
  //  MpGuard — fonte única da verdade sobre "estou em sala MP?".
  //
  //  Regra de ouro: DENTRO de sala MP, NADA do mundo nasce localmente.
  // ─────────────────────────────────────────────────────────────────
  ```
- Seções dentro de arquivos grandes usam comentários `// ── Título ──────` com traços.
- Emojis em logs de console são comuns: `console.log('[MpGuard] 🌐 ENTROU em sala MP')`.

## Import Organization

- **ESM nativo**, sem bundler. Imports relativos com extensão `.js` obrigatória: `import { MpGuard } from './MpGuard.js';`
- **Babylon.js é GLOBAL, não importado.** Carregado via `<script src="https://cdn.babylonjs.com/babylon.js">` em `index.html` e acessado como `BABYLON.*` (1168 usos de `BABYLON.`). NUNCA fazer `import * as BABYLON`.
- **Libs externas via CDN ESM** (`https://esm.sh/...`), importadas direto no módulo:
  - `import * as Colyseus from 'https://esm.sh/colyseus.js@0.16.6';`
  - `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';`
  - Versão sempre pinada na URL.

**Path Aliases:** Nenhum. Só caminhos relativos.

## Export Conventions

- **`export class Foo`** é o padrão dominante (117 ocorrências). Uma classe por arquivo.
- **Singletons** exportados como instância já construída: `export const MpGuard = new _MpGuard();` (a classe interna usa `_` prefixo para não vazar). Também exposto em `window._mpGuard`.
- **Tabelas de dados** como objetos `export const`: `export const WEAPONS = {...}`, `export const ASSET_PATHS = {...}`, com helper de lookup com fallback: `export function getWeapon(id) { return WEAPONS[id] || FALLBACK; }`.
- `export default` praticamente não usado (1 ocorrência no projeto inteiro).

## Comunicação Cross-Module

O codebase NÃO usa injeção de dependência consistente. A cola entre módulos é o objeto `window`, com convenção `window._nome`. Principais (por frequência de uso):

| Global | Papel |
|--------|-------|
| `window._sceneEditor` | Editor de cena (59 usos) |
| `window._gameInput` | InputManager — teclado/mouse (50) |
| `window._gamePlayer` / `window._player` | Player local (33) |
| `window._cs` | ColyseusClient (cliente MP) (13) |
| `window._remotePlayers` | Map de RemotePlayers (12) |
| `window._mpGuard` | MpGuard singleton |
| `window._gameLevel`, `window._gameInventory`, `window._navMesh` | Sistemas de mundo |
| `window._dmgNumbers`, `window._bloodFX`, `window._hitStop`, `window._hitMarker` | Sistemas de feedback de combate |
| `window._auth`, `window._loginScreen` | Auth/Supabase |
| `window._gfx`, `window._shadowGen`, `window._webgpu` | Gráficos |
| `window._QUIET`, `window._isProd`, `window._ppOff` | Flags de runtime |

**Regra prática:** módulos "legados" (Level, EnemyManager) que não importam um módulo consultam o global. Singletons expõem-se via `if (typeof window !== 'undefined') window._xxx = instance;`.

### Eventos (pub/sub manual)

Dois padrões de eventos, ambos implementados na mão (sem EventEmitter):

1. **ColyseusClient — `cs.on(event, cb)`** (`src/game/multiplayer/ColyseusClient.js`):
   - Lista de eventos é **pré-registrada** num objeto `this._listeners = { 'player_add': new Set(), 'died': new Set(), ... }` (~70 eventos declarados).
   - `on(event, cb)` lança erro se o evento não foi registrado: `throw new Error('[CS] event nao registrado: ' + event)`. Retorna função de unsubscribe.
   - Dispatch via `_notify(event, payload)` que itera o Set com try/catch por callback:
     ```js
     _notify(event, payload) {
       const set = this._listeners[event]; if (!set) return;
       for (const cb of set) {
         try { cb(payload); }
         catch (e) { console.error('[Colyseus] cb erro:', event, e); }
       }
     }
     ```
   - Eventos relevantes: `player_add/remove/change`, `mob_*`, `died`, `respawn`, `hit_confirmed`, `match_started`, `br_takeoff`, `chat`, `xp_gain`, `level_up`.

2. **Singletons com `onChange(cb)`** (ex: `MpGuard.onChange`): `Set` de listeners, retorna unsubscribe, `_notify()` itera com `try { cb() } catch (_) {}`.

## Padrões de Guard (defensivo)

Estilo extremamente defensivo — o jogo nunca deve quebrar em runtime ao vivo.

- **Optional chaining massivo**: 1242 usos de `?.`. Padrão `window._gameInput?.isDown?.('F8')`, `result.user?.id?.slice(0, 8)`.
- **try/catch em todo lugar**: 773 blocos `try {`. Callbacks de evento, dispose, leave de sala, parse — tudo envolto. Muitos `catch (_) {}` silenciosos para código não-crítico; `catch (e) { console.error(...) }` quando vale logar.
- **Flag `_disposed` / early-return**: classes com ciclo de vida guardam `if (this._disposed) return;` no topo de métodos chamados no loop (ex: `RemotePlayer.js`). 12 arquivos usam flags de disposed/destroyed.
- **Fallback seguro em lookups**: tabelas sempre retornam um default em vez de `undefined` (`getWeapon` → `FALLBACK`).
- **Race-guards em async**: `ColyseusClient.subscribeLobby` guarda `this._lobbyPromise` e checa `connection?.isOpen` para evitar criar WebSocket duplicado.

## Ciclo de Vida (lifecycle)

- **`constructor(deps...)`** recebe dependências por parâmetro quando o módulo é instanciado pelo orquestrador (`src/main.js`), OU lê de `window._*` quando é legado.
- **`update(dt)`** é a convenção de tick — chamado no render loop. 75 métodos `update(dt)`/`_update()`. `dt` é deltaTime em segundos/ms conforme o sistema.
- **`dispose()`** para teardown (14 definições). Deve setar `this._disposed = true` e limpar meshes/listeners.

## Carga de GLB / Assets

- Centralizada em `src/AssetLoader.js`. Tabela `ASSET_PATHS` mapeia chave lógica → caminho de arquivo (sob `assets/itens 3d/`, `assets/characters/`, `assets/weapons/`).
- **Caminhos com espaços e acentos** são comuns ("itens 3d", "Animations-meshy"); SEMPRE codificados com `encodeURIComponent` por segmento (helper `enc()`), preservando as barras `/`.
- API de carga: `BABYLON.SceneLoader.ImportMeshAsync('', folder, file, this.scene)` (20 usos) — retorna `{ meshes }`. Variante `LoadAssetContainerAsync` (4 usos) para instanciar múltiplas cópias.
- Pós-carga padrão: iterar `result.meshes`, pular `__root__`, registrar shadow caster (`shadowGen?.addShadowCaster(m, true)`) e `m.receiveShadows = true`.
- Cache de promessas em andamento: `this._loading[key] = ImportMeshAsync(...).then(...)` para deduplicar carregamentos.
- **Regra de marca (memória do dono):** Chibata é zero-fallback — só GLBs íntegros, nunca placeholder visual básico. GLB quebrado → trocar por outro válido, não degradar.

## Física

- **Babylon Physics v2 com Havok** (`HavokPlugin`, 3 usos). `src/game/physics/PhysicsWorld.js` é o setup central.
- Corpos criados via `new BABYLON.PhysicsAggregate(mesh, shapeType, { mass, friction, restitution }, scene)`. Shape types: `CONVEX_HULL` (props), `BOX` (proxies/caixas).
- **Mas o movimento do player NÃO é dirigido por física rígida** — predomina collide-and-slide manual: `moveWithCollisions` (11) e `checkCollisions` (70 — o mais comum) com `_groundClamp`/`_checkGrounded`/`_moveWithStepUp`. Knockback/impulso usam `applyImpulse` (6) e `setLinearVelocity` (5) pontualmente.
- Dano/combate NÃO depende de colisão física: usa `attackData` com `hitTime`/`bone`/`damage`/`kb` por animação e raycast/cone manual (ver `CombatSystem.js`).

## UI

- **DOM overlay é o padrão exclusivo.** 447 usos de `document.createElement` / `innerHTML` / `getElementById`. UI montada como `<div>` sobre o canvas, estilizada inline.
- **Babylon GUI NÃO é usado** — 0 ocorrências de `AdvancedDynamicTexture`. Não introduzir Babylon.GUI; seguir o padrão DOM.
- Painéis de debug seguem o mesmo padrão (ex: `GraphicsDebugPanel.js` monta HTML inline, lê tecla F8 via `window._gameInput?.isDown('F8')`).
- HUD, lobby, login, settings, character select — todos em `src/game/ui/` como classes que constroem/destroem DOM.

## Autoridade do Servidor (regra arquitetural que vira convenção)

- **Cliente é consumer puro do estado.** `ColyseusClient` comentário: "Estado autoritativo vem do servidor — cliente é puro consumer."
- **Cliente NUNCA envia dano.** Manda `weapon` + `target`; servidor consulta `WeaponTable` (`tools/transfps-colyseus/src/rooms/WeaponTable.js`) e calcula dmg/range/cooldown. Há uma `attackData` no cliente (`CombatSystem.js`) para feel local, mas a verdade é a `WEAPONS` do servidor.
- **MpGuard** é a fonte única de "estou em sala MP?". Dentro de sala MP, nada do mundo nasce localmente — checar `MpGuard.isInMpRoom()` / `allowLocalSpawn()` antes de qualquer spawn/drop/destroy local.

---

*Convention analysis: 2026-06-03*
