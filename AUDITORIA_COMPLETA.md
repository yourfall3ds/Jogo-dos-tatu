# 🔎 Auditoria Completa — TransFPS (Jogo-dos-tatu)

> Gerada em 2026-06-24. Tudo fundamentado em evidência do código rodando localhost, **sem chute**.
> Legenda: 🔴 crítico · 🟠 médio · 🟡 menor · ✅ OK (já está certo).

O jogo **roda** via `python tools/run-local.py` (game na :5500 + config-server real na :3099). Boot validado:
`index.html` 200, `src/main.js` com MIME de módulo correto, GLB com espaço no path servido (13 MB, 200), `/health` e `/transfps-env` OK.

---

## 1. Peso do repositório / pipeline de assets

| # | Sev | Achado | Evidência |
|---|-----|--------|-----------|
| 1.1 | 🔴 | **5 GLBs acima do limite de 100 MB do GitHub** — se um dia for pra GitHub, é rejeitado no push. | `helldemon-reborn.glb` **233 MB**, `monster-wolf-old-blood.glb` 143 MB, `drogon…dragon.glb` 122 MB, `drogon-dragon.glb` 118 MB, `low-poly-orc.glb` 112 MB |
| 1.2 | 🔴 | **`.git` = 3,7 GB**; 2.261 arquivos de asset versionados como binário. Clone/checkout/branch ficam lentíssimos e o histórico só incha (cada versão de GLB grande fica pra sempre). | `du -sh .git` → 3.7G |
| 1.3 | 🟠 | Assets de máquina já vão pro Wasabi (bucket privado `tranfps`), mas mobs/digimons/props gigantes seguem **dentro do git**. Pipeline dividido pela metade. | `git ls-files assets` = 2261 |

**Recomendação:** tirar os GLBs grandes do versionamento direto — mover pro Wasabi/B2 (mesmo fluxo que já existe) + manifesto, ou Git LFS. O `.gitignore` já ignora `tools/` local; falta a política pra `assets/` pesados. (Lembrando: regra é nunca dar push pra GitHub — mas 3,7 GB de `.git` machuca mesmo só local.)

---

## 2. Dependência de CDN externa (ponto único de falha)

| # | Sev | Achado |
|---|-----|--------|
| 2.1 | 🔴 | **Engine, física, rede e auth vêm 100% de CDN externa, sem fallback local.** Se `cdn.babylonjs.com` ou `esm.sh` cair/for bloqueado, o jogo **morre na hora** — tela preta, sem degradação. |

Dependências externas em runtime:
- `cdn.babylonjs.com/babylon.js` · `/havok/HavokPhysics_umd.js` · `/loaders/babylonjs.loaders.min.js` · `/materialsLibrary/…` · `/recast.js`
- `esm.sh/@supabase/supabase-js@2.57.4`
- `esm.sh/colyseus.js@0.16.6`

**Recomendação:** pinar versões (Babylon vem **sem versão** no URL → uma atualização da CDN pode quebrar o jogo silenciosamente) e hospedar cópia local self-host pelo menos do Babylon + Havok. `esm.sh` já está pinado nas versões — bom.

---

## 3. Segurança

| # | Sev | Achado |
|---|-----|--------|
| 3.1 | ✅ | **`.env` está no `.gitignore`** e o `service_role` **NÃO** vaza pro front. `/transfps-env` expõe só `anon`/URL/CID/WS — correto. |
| 3.2 | 🟠 | **CSP praticamente aberta**: `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http: https: …` + `script-src` com `unsafe-inline`/`unsafe-eval` e `http:`. Na prática não protege contra XSS. (index.html:14) |
| 3.3 | 🟡 | **Anon key hardcoded** como fallback no front (`SupabaseClient.js:23`) **E** vinda do config-server. Anon é pública (ok), mas a duplicação gera drift se a chave rotacionar — atualiza num lugar e esquece o outro. |
| 3.4 | 🟡 | `SKETCHFAB_KEY` é exposta pro front via `/transfps-env` (download in-game). É chave pessoal do Lucas — aceitável em DEV, mas em prod self-host isso vaza a key pra qualquer cliente. |

---

## 4. DEV vs PROD — config-server fantasma

| # | Sev | Achado |
|---|-----|--------|
| 4.1 | 🟠 | O config-server (`:3099`) é **só DEV**. `isProd()` (hostname ≠ localhost) faz o front pular o `/transfps-env` — bom. **Mas** as features que dependem dele em runtime **não têm equivalente em prod**: `/proxy-image`, `/meshy/*`, `/cache-asset`, `/save-thumb`. |
| 4.2 | 🟠 | Logo, **Build Mode / geração Meshy / proxy de imagem da CDN Meshy** funcionam no PC do Lucas e **falham mudo** em produção (ERR_CONNECTION_REFUSED em 127.0.0.1:3099). Há `try/timeout` que evita travar, mas a feature simplesmente não existe pro jogador. |
| 4.3 | ✅ | Detecção DEV/PROD e timeouts (`AbortSignal.timeout(1500)`) estão corretos — não trava o boot quando o 3099 está off. |

**Recomendação:** o que for feature de jogador (proxy-image de assets gerados, cache) precisa de equivalente server-side em prod (edge function / VPS), não só o config-server local.

---

## 5. Multiplayer (resumo — detalhe em `MULTIPLAYER_AUDIT.md`)

Já existe auditoria dedicada. 🔴 em aberto que valem destaque:
- **Drop dobrado**: servidor cria o drop compartilhado **e** o cliente spawna um drop LOCAL ao matar → fantasma invisível pros outros.
- **Sem knockback no PvP**: leva dano mas o corpo não recua — "sem impacto".
- **Player morto ainda leva hit** (HP fica negativo) — falta guard `target.dead`.
- Colyseus com **retry/backoff exponencial** ✅ e áudio espacial sincronizado ✅.

---

## 6. Qualidade de código

| # | Sev | Achado | Evidência |
|---|-----|--------|-----------|
| 6.1 | 🟠 | **704 sites de `catch` que engolem erro** (`catch(_){}`/vazios). Muitos são "best-effort" legítimos, mas o volume esconde falhas reais — contraria a regra "zero fingimento". Merece uma passada de sampling. | grep em src |
| 6.2 | 🟡 | **418 chamadas `console.*` em 127 arquivos.** Ruído em prod e custo em hot-paths (combate/render). Falta um logger com nível que silencia em prod. | grep |
| 6.3 | 🟡 | **122 marcadores TODO/FIXME/HACK** pendentes no código. | grep |
| 6.4 | 🟡 | **God files**: `src/main.js` = 2.773 linhas, `index.html` = 1.238 linhas (com lógica inline). Difícil de manter/testar. | wc -l |

---

## 7. O que está bom ✅

- Higiene de secrets (`.env` ignorado, sem `service_role` no front).
- Servir o jogo: paths com espaço (`itens 3d/`) resolvem, MIME de módulo correto.
- Boot resiliente: `index.html` tem handler que detecta falha de carregamento de módulo e mostra mensagem em vez de tela preta muda.
- Detecção DEV/PROD limpa; nada do config-server trava o boot quando off.
- Colyseus com reconexão por backoff; música desligada por padrão (só SFX).

---

## 8. Top 5 ações priorizadas

1. 🔴 **Tirar GLBs grandes do git** (5 arquivos >100 MB, `.git` 3,7 GB) → Wasabi/LFS + manifesto.
2. 🔴 **Self-host + pin do Babylon/Havok** (URL hoje é sem versão) → fim do "CDN caiu = jogo morto".
3. 🟠 **Equivalente prod do config-server** pras features de jogador (proxy-image/cache).
4. 🟠 **Fechar a CSP** (remover `http:` e, onde der, `unsafe-eval`).
5. 🟠 **Fechar os 🔴 do multiplayer** (drop dobrado, knockback, hit em morto).

---

### Como rodar
```bash
python tools/run-local.py            # game :5500 + config :3099, abre o browser
python tools/run-local.py --no-browser --port 8080
```
