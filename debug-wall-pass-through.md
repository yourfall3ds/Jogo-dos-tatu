# Debug Session: wall-pass-through

Status: [OPEN]

## Sintoma

Os inimigos continuam atravessando paredes colocadas/construidas em vez de contornar pela navegacao ou falhar o movimento por colisao.

## Hipoteses

1. A parede nova nao esta entrando na lista de obstaculos usada pela IA no `NavMeshManager`, entao o raycast curto e o crowd continuam sem enxergar o bloqueio.
2. O `AnimatedEnemy` esta recebendo waypoint/steer invalido ou nulo e cai num fallback que move direto para o alvo, passando pelo obstaculo.
3. A verificacao de bloqueio `_blockedAhead()` nao reconhece as paredes construidas porque os meshes/parents nao passam pelo filtro atual de obstaculo solido.
4. O crowd/nav nao esta recalculando a rota depois da mudanca dinamica da parede, entao o inimigo insiste numa rota antiga sem invalidacao efetiva.
5. Existe movimento fisico/manual aplicado ao inimigo fora do caminho de nav/colisao, fazendo o `pos.x/pos.z` atravessar apesar de haver parede visual.

## Plano

- Instrumentar `NavMeshManager` e `AnimatedEnemy` para capturar estado de obstaculos, waypoint, crowd e bloqueio.
- Reproduzir colocando parede no caminho do inimigo.
- Comparar logs entre o momento da construcao, o chase e a checagem de colisao.
- Corrigir o ponto confirmado pela evidencia e validar com logs pos-fix.

## Atualizacao 2026-06-08

- Python nao esta funcional no ambiente atual; coletor de debug foi levantado via fallback em Node na porta `7778`.
- Instrumentacao adicionada em:
  - `BuildMode._placePieceAt()` e `BuildMode._save()`
  - `NavMeshManager._syncDynamicObstacles()` e `NavMeshManager._refreshCollisionLists()`
  - `AnimatedEnemy._blockedAhead()`
- Proxima coleta esperada:
  - log de colocacao da parede;
  - log de `markDynamicDirty`;
  - log de `dynamic root candidate` / `dynamic obstacle upsert`;
  - log de `blockedAhead` sem obstaculo proximo ou com `ray miss`.

## Evidencia E Correcao Aplicada

- Evidencia manual do usuario:
  - parede passou a bloquear em alguns casos;
  - cubos/itens do mapa ainda eram atravessados;
  - paredes em angulo exibiam colisor/obstaculo exagerado.
- Leitura do codigo confirmou:
  - `AnimatedEnemy` move no chase via `pos.x += ...` / `pos.z += ...`, entao depende totalmente de `_blockedAhead()` para nao atravessar;
  - `_blockedAhead()` priorizava apenas `window._navMesh.obstacles` quando essa lista existia;
  - `_refreshCollisionLists()` estava montando `obstacles` a partir de `baseMeshes` + dinamicos, deixando de fora varios solidos estaticos do mapa;
  - `_makeObstacleSnapshot()` usava AABB em mundo, inflando extents quando a peça era rotacionada.
- Correcao aplicada:
  - `NavMeshManager._refreshCollisionLists()` agora varre a cena e inclui solidos estaticos reais do mapa na lista de obstaculos;
  - `NavMeshManager._makeObstacleSnapshot()` passou a calcular bounds orientados no eixo da peça, evitando parede gigante em angulo;
  - `AnimatedEnemy._blockedAhead()` agora sempre tem fallback pela cena e a checagem de bloqueio ocorre a cada frame durante chase.

## Pos-Fix / Debug Visual

- Usuario confirmou que o problema de atravessar obstaculos foi corrigido.
- Novo pedido: visualizar rotas da navegacao.
- Implementado:
  - `window._toggleNavDebug(true|false)` em `main.js`;
  - tentativa de mesh de debug da nav pelo plugin, quando disponivel;
  - wireframes dos obstaculos dinamicos da nav;
  - linhas por inimigo mostrando `enemy -> steer/waypoint` e `enemy -> target`.

## Evidencia Nova 2026-06-08

- Usuario reportou que o debug mostrava apenas uma linha direta ate o alvo, sem contorno.
- Leitura do codigo confirmou mais um problema de arquitetura:
  - `AnimatedEnemy` priorizava crowd;
  - se o crowd existisse mas nao retornasse `nextCorner/velocity`, o inimigo mantinha `mx/mz = nx/nz`, ou seja, seguia reto para o alvo;
  - `NavMeshManager.nextStep()` ainda tinha atalho de linha reta antes da tentativa de pathfinding na nav.
- Correcao aplicada:
  - `nextStep()` agora tenta calcular caminho na nav primeiro;
  - fallback reto so acontece quando o path ficou curto e o trecho esta realmente livre;
  - `AnimatedEnemy` agora pede `nextStep()` quando o crowd nao entrega steer valido, em vez de continuar em linha reta.

## Ajuste Inspirado No Exemplo Do Roland

- O snippet enviado pelo usuario usa `navigationPlugin.raycast(startPoint, endPoint)` para perguntar para a propria nav se existe colisao/corredor valido.
- Implementado no projeto:
  - novo wrapper `NavMeshManager.raycast(from, to)`;
  - `nextStep()` agora consulta esse `raycast` da nav e registra `hit/hitPoint` nos logs;
  - quando o path vem curto, o fallback reto so acontece se o `raycast` da nav indicar corredor livre.

## Alinhamento Com `computePath`

- O segundo snippet do usuario mostra outro detalhe importante: alem do crowd, ele desenha e inspeciona `computePath(crowd.getAgentPosition(...), getClosestPoint(target))`.
- Implementado no projeto:
  - `NavMeshManager` agora mantem `entry.path` por agente usando `computePath/computePathSmooth`;
  - `getCrowdAgentState()` expõe essa `path` e usa o primeiro ponto valido como `nextCorner` quando o crowd nativo nao entregar corner;
  - `AnimatedEnemy` passou a desenhar a polilinha completa da rota no chao durante o debug.

## Refinamento Do Debug

- O usuario ainda via apenas a linha direta ate o alvo.
- Causa provavel no proprio debug anterior:
  - `_computePathPoints()` ainda mascarava falha devolvendo `[start, end]` quando o path vinha vazio.
- Ajuste aplicado:
  - removido esse fallback falso;
  - adicionado `getDebugPathData(from, to)` no `NavMeshManager`;
  - adicionado no inimigo marcadores visuais de:
    - `closest(start)` em azul;
    - `closest(end)` em verde;
    - `raycast.hitPoint` em amarelo.

## Causa Estrutural Confirmada

- O comportamento "linha reta + preso na parede" bate com a leitura do codigo:
  - o bake da nav estava coletando principalmente superficies navegaveis (`ground/floor/terrain/...`);
  - paredes/blocos estaticos do mapa ficavam fora do `createNavMeshAsync()`;
  - na pratica a navmesh nascia parecida com um plano livre, e quem segurava o inimigo era so a colisao da cena.
- Correcao aplicada:
  - `_collectBaseMeshes()` agora inclui tanto superficies navegaveis quanto solidos estaticos relevantes do mapa para o bake da nav.

## Ajuste Para O Sintoma Global

- Usuario confirmou que o problema ocorre em qualquer parede do mapa, nao so em obstaculo novo.
- Ajustes aplicados:
  - `NAV_CACHE_VERSION` foi incrementada para invalidar qualquer bake antigo restaurado do cache;
  - no `AnimatedEnemy`, quando `nav.ready === true`, o movimento nao nasce mais apontando direto para o alvo;
  - se nao houver `steer/path` valido, o mob para e tenta recalcular rapido em vez de ficar andando eternamente contra a parede.

## Alinhamento Com `staticMesh`

- O snippet do Roland faz o bake a partir de um `staticMesh` unico.
- Para reduzir divergencia de comportamento, `_prepareNavInput()` agora:
  - coleta as geometrias base;
  - cria clones temporarios com transform baked;
  - gera um mesh unificado `_nav_static_merged`;
  - usa esse mesh unico como entrada principal do `createNavMeshAsync()`.

## Correcao Do Chao Autoritativo

- Usuario reportou que o chao parecia infinito, mas ao correr para o lado acabava caindo, e depois percebeu sensacao de chao abaixado/objetos flutuando.
- Causa encontrada:
  - `main.js` criava `openworld_ground` gigante (`800x800`) e escondia o chao real do `Level`;
  - o visual do piso deixava de bater com a area realmente pisavel/navegavel.
- Correcao aplicada:
  - `_ensureOpenWorldGround()` agora reutiliza o mesh `ground` do `Level` quando ele existir;
  - o fallback deixou de ser um plano gigante e virou um piso finito `160x160`;
  - o chao do `Level` passou a ser marcado explicitamente com `_isGround` e `_navSurface`;
  - `NAV_CACHE_VERSION` foi incrementada para forcar bake novo da nav.
