# Divisão de Trabalho — Multiplayer TransFPS

> Documento de coordenação entre as duas frentes. Contexto técnico completo em [MULTIPLAYER_PERSISTENCIA.md](MULTIPLAYER_PERSISTENCIA.md).
>
> **Objetivo da divisão:** trabalhar em paralelo SEM conflito de merge. Cada um é dono dos seus arquivos; o que se cruza está no "Contrato de integração".

---

## Resumo rápido

| Frente | Dono | Foco |
|---|---|---|
| 🟦 **Backend / dados / mundo** | Lucas (+ Claude) | Supabase, sincronização do estado equipado, construções compartilhadas, destruição sandbox |
| 🟩 **Visual dos outros players + mapa** | Sócio | "Se ver" (corpo/skin), renderizar arma/item na mão, animações, **limpar o mapa** |

---

## 🟦 MINHA PARTE (Lucas + Claude)

Tudo que é **dado, servidor e persistência**. Não toco no visual do RemotePlayer.

1. **F0 — Migração total pro Supabase.** Reescrever o `LocalDB` como adapter do Supabase (schema `transfps`), com cache local offline. Tabelas: `world_objects`, `inventory`, `settings`, `generated_assets`, `game_config`. Hoje em produção tudo fica só no `localStorage` → ninguém compartilha nada.
2. **Sincronização do ESTADO EQUIPADO (camada de dados).** Garantir que o servidor sempre saiba e replique pra todos: **arma na mão** (`weapon`), **item da hotbar atualmente segurado** (`held_item`, campo novo), **skin** (`equip_skin`/`class_id`). Ao trocar de slot, o novo valor sobe no input e o servidor faz o broadcast. → **Eu entrego os campos prontos no schema; você (sócio) só renderiza.**
3. **F2 — Construções compartilhadas globais.** Tabela `world_objects` + sincronização via Colyseus (`place_object`/`remove_object`): qualquer construção aparece pra todos ao vivo e ao reconectar.
4. **F3 — Destruição sandbox.** Bater em sequência → rachaduras progressivas → quebra; parar de bater → regenera; ao quebrar **dropa o próprio asset recolocável** pro inventário. Sincronizado e persistido (estado quebrado/removido).

**Arquivos que EU mexo (não mexer sem combinar):**
- `src/game/data/LocalDB.js`
- `src/game/multiplayer/ColyseusClient.js` (lado de **envio** — `sendInput` e novos `send*`)
- `tools/transfps-colyseus/**` (schema `ArenaState.js` + `ArenaRoom.js`)
- `src/game/build/BuildMode.js`, `src/game/scene/GameObject.js`, `src/game/items/Inventory.js`, `src/game/items/**`
- Tabelas/RLS no Supabase (schema `transfps`)

---

## 🟩 SUA PARTE (Sócio)

Tudo que é **visual dos outros players** + preparar o mapa.

1. **"Se ver" — corpo/skin do RemotePlayer.** Trocar a cápsula colorida pelo GLB do Digimon do player (a skin dele), em [src/game/multiplayer/RemotePlayer.js](src/game/multiplayer/RemotePlayer.js).
2. **Renderizar a arma/item na mão do RemotePlayer.** Quando o campo `weapon` / `held_item` mudar (eu sincronizo — veja o Contrato abaixo), carregar o GLB do item e anexar na mão do modelo. Hoje isso é só um placeholder em `onSchemaChange('weapon')`.
3. **Animações do RemotePlayer por `anim_state`.** O servidor já manda `anim_state` (idle/run/attack/…); tocar a animação correspondente no GLB.
4. **🧹 Limpar os itens do mapa.** Remover todos os objetos/construções atuais do mapa e **deixar só o quadrado do chão**, pra começarmos do zero colocando os itens **no servidor**, pessoalmente. (Isso zera o `placed`/`scene` local e a geometria de cenário, mantendo só o plano do chão.) — É o ponto de partida da F2: depois que eu subir as `world_objects`, cada item colocado já vai pro servidor e todo mundo vê.

**Arquivos que VOCÊ mexe (eu não toco):**
- `src/game/multiplayer/RemotePlayer.js` (corpo, skin, arma na mão, animação)
- O que for de carregamento/render de skin dos outros
- A limpeza de cenário (geometria do mapa)

---

## 🔌 Contrato de integração (onde as frentes se encontram)

O ponto de encontro é o **estado do player no schema do Colyseus**. **Eu garanto que estes campos chegam preenchidos e atualizados** em `state` de cada `RemotePlayer`; **você lê e renderiza**:

| Campo no `state` | Significado | Quem escreve | Quem renderiza |
|---|---|---|---|
| `weapon` | id da arma ativa (`unarmed`/`pistol`/`rifle`/`sword_paladin`…) | Eu (sendInput) | Você (GLB na mão) |
| `held_item` ✅ **PRONTO** | item atualmente na mão. Formato: id da arma (igual `weapon`) **OU** `asset:<assetId>` (construível da biblioteca/gerado na mão) **OU** `piece:<pieceId>` (parede/chão/etc) **OU** `unarmed`. Atualiza ao trocar de slot da hotbar. | Eu (sendInput) ✅ | Você → tratar `case 'held_item'` no `onSchemaChange` |
| `equip_skin` / `class_id` | skin/personagem equipado | Eu | Você (modelo do corpo) |
| `anim_state` | estado de animação atual | Eu (já existe) | Você (tocar anim) |
| `x,y,z,ry` / `hp` / `pvp_on` / `dead` | posição/vida/estado | Eu (já existe) | Você (já usa) |

**Como você é notificado:** o `ColyseusClient` dispara `player_change` com `{ id, field }`. No `RemotePlayer.onSchemaChange(field)` você trata os campos novos. Eu adiciono os `listen()` de `held_item`/`equip_skin`/`class_id` no `ColyseusClient` (lado de envio/listeners) — você só implementa o `case` no `onSchemaChange`.

**Onde anexar a arma na mão:** o `PlayerAnimator` já tem `getSocketNode(boneName)` (ex.: `RightHand`) e `attachWeapon(...)` que compensa a escala do osso. Reaproveite a mesma lógica do player local pro RemotePlayer.

---

## ⚠️ Regras pra não dar conflito de merge

1. **Eu não toco** em `RemotePlayer.js` nem no render de skin/animação dos outros. **É todo seu.**
2. **Você não toca** em `ColyseusClient.sendInput`, no schema do servidor (`tools/transfps-colyseus`), no `LocalDB`, no `BuildMode`/`GameObject`/`Inventory`. **São meus.**
3. **`src/main.js` é compartilhado** → combinar antes de editar a mesma região (os listeners `cs.on('player_*')` ficam numa seção; o loop de update em outra). Avisar no chat antes de mexer.
4. Cada um na sua **branch**; PRs pequenos e frequentes pra integrar cedo.

---

## Ordem sugerida pra destravar você

1. **Eu primeiro** garanto `held_item`/`equip_skin` no schema + envio (rápido) → assim você já tem os campos pra renderizar.
2. **Em paralelo**, você faz o corpo/skin e a limpeza do mapa (não dependem de mim).
3. Integramos a arma na mão quando os dois lados estiverem prontos.
