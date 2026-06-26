# Debug Session: wall-build-freeze

Status: OPEN
Started: 2026-06-08

## Sintoma
- Construir paredes e destruí-las trava o jogo por cerca de 30 segundos.

## Hipóteses
- Recalculo global caro de mapa, colisão, navmesh ou chunks a cada alteração.
- Loop quadrático ou atualização em cascata sobre todas as paredes/tiles.
- Operação pesada de persistência, sincronização ou serialização no thread principal.
- Pico de alocações seguido de garbage collection longa.
- Reprocessamento visual caro ao atualizar paredes.

## Plano
- Localizar o fluxo de construir e destruir paredes.
- Adicionar instrumentação mínima, sem alterar a lógica de negócio.
- Reproduzir o travamento e coletar evidências.
- Confirmar a hipótese vencedora.
- Aplicar correção mínima e validar.

## Evidências
- Leitura estática indica que `BuildMode` marca a navmesh como suja ao colocar, remover e quebrar peças.
- `NavMeshManager.rebuild()` usa `RecastJSPlugin.createNavMesh(...)`, que é síncrono.
- O próprio código já documenta um histórico de freeze de ~30s quando a entrada da navmesh fica pesada.
- Instrumentação inicial adicionada em `BuildMode` e `NavMeshManager`, reportando para `.dbg/trae-debug-log-wall-build-freeze.ndjson`.
- Reprodução no navegador confirmou o gargalo: HUD exibiu `navmesh: 19365ms (30 meshes)` logo após colocar uma parede.
- O cenário de reprodução estava com `Horda OFF`, então não havia consumidor real da navmesh naquele momento.
- Conclusão: o freeze vinha do rebuild síncrono da navmesh disparado inutilmente ao mudar paredes, mesmo sem inimigos locais usando pathfinding.
- Correção aplicada em `NavMeshManager`: só construir/reconstruir quando houver consumidores reais, como `CombatDirector` ativo ou inimigos locais vivos.

## Próximo passo
- Recarregar o jogo e validar construção/destruição de paredes com `Horda OFF`.
