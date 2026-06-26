# Engine Roadmap

## Objetivo

Formalizar a camada de engine do TransFPS sem reinventar Babylon.js, Havok, Colyseus ou Supabase.

A regra é simples:

- `Babylon.js` renderiza.
- `Havok` cuida da fisica.
- `Colyseus` sincroniza o estado autoritativo.
- `Supabase` persiste identidade, progresso e dados de apoio.
- A engine do projeto organiza sistemas, entidades, recursos, fluxo de jogo, ferramentas e debug.

## O Que Ja Existe

O projeto ja tem uma base forte:

- `src/main.js` ja funciona como orquestrador principal.
- `src/game/combat/` ja contem combate, combos, hit-stop e efeitos.
- `src/game/multiplayer/` ja contem cliente de rede e replicas remotas.
- `src/game/build/` ja contem construcao, destruicao e persistencia de objetos.
- `src/game/data/` ja contem catalogos, registros e persistencia local/remota.
- `src/game/debug/` e partes de `src/game/scene/` ja contem ferramentas internas.

O problema atual nao e ausencia de sistema.
O problema e falta de um `core` explicito e de fronteiras mais claras entre modulos.

## O Que Falta

Os pontos mais importantes para formalizar a engine sao:

1. `core` reutilizavel
2. `GameLoop` com fases organizadas
3. `Entity` e componentes simples
4. `EventBus` comum em vez de depender tanto de `window.*`
5. `ResourceManager` para recursos carregados, promessas e descarte
6. `DebugPanel` unificado
7. `AssetRegistry` mais rico, com metadados de pipeline
8. contratos mais claros entre cliente, server e mundo

## Estrutura Alvo

```text
src/game/
  app/
    GameApp.js
    GameLoop.js
    SceneManager.js

  core/
    EventBus.js
    GameEntity.js
    ResourceManager.js

  player/
  world/
  combat/
  network/
  assets/
  debug/
```

## Ordem Recomendada

### Fase 1 - Base estrutural

- Criar `core/EventBus.js`
- Criar `core/GameEntity.js`
- Criar `core/ResourceManager.js`
- Criar `app/GameLoop.js`
- Nao integrar tudo de uma vez
- Usar esses modulos primeiro em sistemas novos e migracoes pequenas

### Fase 2 - Orquestracao

- Extrair de `src/main.js` um `GameApp`
- Mover a ordem de update para fases claras
- Criar um `SceneManager` leve para boot, troca de estado e cleanup

### Fase 3 - Mundo e construcao

- Formalizar `BuildingSystem`
- Formalizar `WorldManager`
- Isolar navmesh, objetos colocados e persistencia em contratos menores

### Fase 4 - Assets

- Evoluir `AssetRegistry` de tabela de caminhos para registro de verdade
- Adicionar metadados de cache, versao, tags, collider, LOD e origem
- Preparar pipeline de assets gerados

### Fase 5 - Ferramentas internas

- Criar um `DebugPanel` unico
- Expor player, mundo, rede, assets e performance
- Reduzir a cegueira na hora de depurar bugs de runtime

## Regras De Migracao

- Nao reescrever o jogo inteiro de uma vez.
- Nao quebrar `src/main.js` antes de a nova base provar valor.
- Cada modulo novo deve ser pequeno, reutilizavel e sem acoplamento desnecessario.
- Logica importante nao deve morar dentro do mesh.
- Estado do jogo deve ser separado da representacao visual sempre que possivel.
- Sistemas multiplayer devem continuar respeitando a regra de autoridade do servidor.

## Primeiro Corte Escolhido

O primeiro corte desta roadmap e:

1. documentar a direcao da engine
2. criar o `core` inicial
3. criar um `GameLoop` simples por fases

Isso gera valor sem forcar uma refatoracao gigante agora.
