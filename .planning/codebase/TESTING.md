# Testing Patterns

**Analysis Date:** 2026-06-03

Estado factual de testes do TransFPS. Resumo: **o cliente não tem testes automatizados**; o servidor multiplayer tem **2 scripts E2E manuais**. A validação principal é jogabilidade ao vivo (Lucas + sócio) com painéis de debug in-game.

## Test Framework

**Runner de testes unitários/integração:** **Nenhum.**
- Não há `jest.config.*`, `vitest.config.*`, `mocha`, `playwright`, nem `karma` no projeto.
- Não existem arquivos `*.test.js` nem `*.spec.js` em todo o repositório (cliente ou servidor).
- `package.json` raiz não tem script `test`:
  ```json
  "scripts": {
    "start": "node tools/config-server.js & npx serve -s .",
    "server": "npx serve -s .",
    "config": "node tools/config-server.js",
    "lan": "node tools/lan-https.mjs",
    "lan-vr": "node tools/lan-https.mjs 8443"
  }
  ```
- `tools/transfps-colyseus/package.json` (servidor) também sem script `test`: só `start` e `dev` (`node --watch`).

## O Que Existe: Smoke / E2E do Servidor

Há **dois scripts E2E feitos à mão**, focados no fluxo multiplayer real (não no cliente do jogo). Rodam via Node contra o servidor Colyseus de produção:

- `tools/transfps-colyseus/e2e-test.js`
- `tools/transfps-colyseus/e2e-smoke.mjs`

**Características reais:**
- Usam o cliente `colyseus.js` real (`import { Client, getStateCallbacks } from 'colyseus.js'`).
- Autenticação com **JWT Supabase real** — fazem `signUp`/`signIn` via REST contra `SUPABASE_URL` com a anon key, gerando emails únicos por timestamp (`cs1_${ts}@test.transfps.local`).
- Conectam ao servidor de produção: `CS_URL = 'wss://app.overpixel.online/transfps-cs'`.
- Simulam **2 clientes** entrando numa sala BR e validam o handshake completo.
- `e2e-smoke.mjs` mantém um **checklist booleano** explícito do que precisa acontecer:
  - `signupAB`, `signinAB`, `roomCreated`, `bJoined`, `stateHas2Players`, `chatReceivedByA/B`, `matchStartedA/B`, `brTakeoffA/B`.
- Sem assertion library: validação é `if (checklist.x)` + logs com timestamp (`[hh:mm:ss.mmm] TAG msg`).

**Como rodar (manual):**
```bash
cd tools/transfps-colyseus
node e2e-smoke.mjs    # smoke 2-clientes contra prod
node e2e-test.js      # E2E 2-clientes via JWT Supabase
```
**Cuidados:** apontam para PRODUÇÃO (`wss://app.overpixel.online`) e criam usuários reais no Supabase. Não há ambiente de teste isolado; rodar com consciência.

## Validação Atual do Cliente do Jogo

O cliente (Babylon.js no browser) é validado de três formas, todas manuais:

### 1. Verificação de sintaxe via Node
- Por ser ESM puro (sem build/bundler), a quebra mais comum é erro de sintaxe num `.js`. A checagem é rodar `node --check <arquivo>.js` antes de servir. (Não há script automatizado que percorra os 122 arquivos — é pontual, por arquivo editado.)
- Não há transpilação/typecheck (sem TypeScript), então erros de tipo só aparecem em runtime.

### 2. Teste manual ao vivo (Lucas + sócio)
- Validação real é jogar. Lucas e o sócio entram na mesma sala MP e reportam o comportamento. (Memória do dono: PROIBIDO o agente abrir/rodar o jogo "pra ver por ele" — garantir por código; Lucas joga e reporta.)
- Servidores locais sobem via `start.bat` (config-server na 3099 + `npx serve` na 5500) ou `npm run start`. LAN/VR via `tools/lan-https.mjs` (HTTPS para WebXR).

### 3. Painéis de debug / telemetria in-game (teclas de função)
Diagnóstico é feito por painéis embutidos, acionados por tecla, lidos via `window._gameInput?.isDown('Fx')`:
- **F8 — Painel de gráficos** (`src/game/scene/GraphicsDebugPanel.js`): calibração ao vivo de exposure/contrast/bloom/SSAO. Valores escolhidos viram constantes hardcoded (`GraphicsEnhancer.js`, `main.js`).
- **F9 — Test Arena** (`src/game/scene/TestArena.js`): entra numa cena isolada (torus de referência de sombra) e volta. Usado para isolar problema de render fora do mundo completo.
- Debug visual extra: `src/game/debug/` (`ColliderDebug.js`, `MonsterDebugMode.js`, `ThumbnailGen.js`).

> Nota: o pipeline F8/F9/F10 de trace/Spector/heap descrito na memória do dono é do projeto **Chibata** (engine R3F), não deste cliente Babylon. Aqui F8/F9 são painéis de gráficos/arena. Não confundir.

## Mocking / Fixtures

- **Não há mocks** — não existe framework para isso. O E2E usa serviços reais (Supabase + Colyseus de produção).
- "Fixtures" implícitas: usuários de teste gerados on-the-fly por timestamp nos scripts E2E. Não são limpos depois (acúmulo no Supabase).
- Tabelas de dados (`WEAPONS`, `ASSET_PATHS`, `EnemyCatalog`) funcionam como dados determinísticos que *seriam* trivialmente testáveis, mas não há testes sobre elas.

## Cobertura

- **0% automatizada.** Nenhuma ferramenta de coverage configurada.
- Cobertura efetiva = sessões de playtest + os 2 scripts E2E do handshake MP.

## Riscos de Não Ter Testes

- **Regressão silenciosa em runtime**: sem typecheck e sem testes, um `?.` faltando ou rename de chave em `WEAPONS`/`ASSET_PATHS` só estoura quando alguém joga aquele caminho específico. O estilo super-defensivo (try/catch, optional chaining, fallbacks) mascara bugs em vez de falhar visível.
- **Acoplamento por `window._*`**: globais não-tipados quebram em cascata se uma ordem de inicialização muda; nada detecta isso fora do jogo rodando.
- **Drift cliente↔servidor de dano**: `CombatSystem.attackData` (cliente, feel) e `WeaponTable.WEAPONS` (servidor, autoritativo) duplicam balanceamento. Sem teste que compare as duas tabelas, elas divergem sem aviso.
- **E2E aponta para produção**: o único teste de integração existente depende de prod estar no ar e cria lixo no Supabase. Não dá para rodar offline/CI sem reescrever URLs.
- **122 arquivos, vários >1000 linhas** (`main.js` 2391, `SceneEditor.js` 2114, `Player.js` 1768): regressões em arquivos grandes são difíceis de pegar só por inspeção.

## O Que Seria Testável (alvos de baixo custo, alto valor)

Sem precisar do browser nem do Babylon (lógica pura, importável em Node):
- **`WeaponTable` (servidor)** — `getWeapon(id)` retorna fallback correto; ranges/cooldowns dentro de limites sãos; toda chave usada no cliente existe no servidor.
- **Consistência de dano cliente↔servidor** — para cada ataque em `CombatSystem.attackData`, existe entrada correspondente em `WEAPONS` e o dano não diverge além de um delta aceitável.
- **Cálculo de combate server-side** — dano por hit, cooldown por (player, weapon), validação de range (distância attacker↔target) na `ArenaRoom`.
- **Interpolação / reconciliação** de `RemotePlayer` — funções de lerp de posição/rotação por timestamp são matemática pura e determinística.
- **`SkillTable` / progressão** (`xp_gain` → `level_up`) — curvas de XP e thresholds.
- **`AssetLoader.enc()`** — encoding de caminhos com espaços/acentos preservando `/`.
- **Tabelas/catálogos** (`EnemyCatalog`, `ItemCatalog`, `AssetGroups`) — integridade referencial (toda referência aponta para arquivo/chave existente).

**Caminho recomendado se for adotar testes:** começar pelo servidor (`tools/transfps-colyseus/`, já é Node ESM `>=20`) com `node:test` nativo — zero dependências novas — cobrindo `WeaponTable`, `SkillTable` e o cálculo de dano da `ArenaRoom`. Depois extrair lógica pura do cliente (interpolação, encoding) para módulos testáveis fora do Babylon.

---

*Testing analysis: 2026-06-03*
