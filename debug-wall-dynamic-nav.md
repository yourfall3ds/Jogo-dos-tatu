# Debug Session: wall-dynamic-nav

Status: [OPEN]

## Sintoma

Ao colocar uma parede no caminho de mobs ja perseguindo o player, o jogo nao trava mais, porem os inimigos continuam vindo como se a parede nao tivesse entrado na navegacao dinamica.

## Hipoteses

1. A parede esta sendo criada visualmente, mas nao esta sendo registrada no `TileCache` como obstaculo dinamico.
2. O `TileCache` recebe o obstaculo, mas o `computePath` atual nao esta levando esse obstaculo em conta no fluxo usado pelos mobs.
3. A lista local de `obstacles` para raycast curto da IA nao inclui a parede colocada.
4. O waypoint atual do inimigo nao eh invalidado apos a mudanca dinamica e ele continua insistindo na rota antiga.
5. O `crowd` auxiliar/plugin V2 nao ficou ativo de forma funcional no runtime atual.

## Evidencias

- O freeze original ao construir/destruir parede sumiu.
- O sintoma atual mudou de performance para comportamento de pathfinding dinamico.
- Logs de `AnimatedEnemy` confirmam que a IA esta rodando no cliente e entrando no bloco de perseguicao.
- Os logs coletados ate agora mostram repetidamente `blocked: false` e `hasWaypoint: false`.
- Nao houve evidencia de `nextStep computed path` nem de `dynamic obstacle upsert` na rodada anterior.
- Hipotese forte no momento: `NavMeshManager.ready` nao esta ficando funcional no runtime, ou o build/base sync nao esta concluindo como esperado.
- Integracao nova aplicada: inimigos agora registram agentes no `crowd` do Nav2 e passam a perseguir lendo `getAgentPosition/getAgentVelocity/getAgentNextTargetPath`.
- Obstaculos dinamicos agora usam `doNotWaitForCacheUpdate = true` em lote e aguardam `WaitForFullTileCacheUpdate` ao final da sincronizacao.
- Rodada mais recente confirma que a nav continua falhando antes de ficar `ready`.
- Evidencia direta dos logs: `nav build fail` com erros `null function or function signature mismatch`, `table index is out of bounds` e depois `memory access out of bounds`.
- Nos mesmos instantes, `AnimatedEnemy` continua emitindo `hasWaypoint: false` e `crowdVelocity: null`, provando que o `crowd` nunca entrou em operacao funcional.
- O efeito visual de inimigos "indo para qualquer lado" vem do fallback manual tentando perseguir sem waypoint valido, enquanto o sistema insiste em rebuilds falhos repetidos.

## Proximo passo

- Corrigir o pipeline de build da Nav V2 para usar um conjunto minimo e compativel de geometrias/parametros, e interromper os rebuilds repetidos enquanto a nav estiver falhando.

## Atualizacao 2026-06-08

- Implementado um `TargetSystem` incremental no `AnimatedEnemy` com:
  - memoria curta do ultimo alvo valido;
  - `threat` acumulada ao receber dano;
  - histerese para evitar troca de alvo a cada frame.
- `Level` deixou de escolher apenas "o player mais proximo" por inimigo e agora entrega a lista de candidatos para cada mob resolver localmente.
- `CombatSystem`, `WeaponSystem` e `SkillSystem` agora propagam o atacante local ao chamar `takeDamage()`, permitindo que o inimigo registre ameaca corretamente.
- Validacao estatica concluida sem erros de diagnostico nos arquivos alterados.
- Ainda falta validar em runtime se:
  - o mob segura o alvo atual quando dois players estao proximos;
  - trocar de alvo so acontece quando a nova ameaca supera a anterior;
  - o chase continua estavel junto com o crowd/nav dinamico.
