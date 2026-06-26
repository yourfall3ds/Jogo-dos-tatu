# Debug Session: server-entry-bounce
- **Status**: [FIXED]
- **Issue**: Ao tentar entrar no servidor, o jogo volta para o menu em vez de carregar a partida.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-server-entry-bounce.ndjson

## Reproduction Steps
1. Abrir o jogo local em `http://localhost:5500`.
2. Abrir a lista de servidores.
3. Tentar entrar no servidor `BRASIL 1`.
4. Observar que a UI volta para o menu/lista em vez de entrar na partida.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O cliente entra na room, mas `_onEnterGame` aborta porque `map_id`/state chega vazio. | High | Low | Pending |
| B | O cliente falha ao carregar mapa/essenciais e executa o fallback que volta para a UI. | High | Med | Pending |
| C | A conexão na room cai logo após o `join`, então a tela retorna ao menu. | Med | Med | Pending |
| D | A room `BRASIL 1` existe, mas o metadata/state enviado pelo servidor está inconsistente para `OPEN_WORLD`. | Med | Med | Pending |
| E | Há uma exceção no cliente durante a transição de UI e o retorno ao menu é um tratamento genérico. | Med | Low | Pending |

## Log Evidence
- **Pré-fix**: o servidor Colyseus registrava `JWT inválido` e rejeitava o `join` porque `JWT_REQUIRED` estava ativo por padrão no `ArenaRoom`.
- **Pós-fix**: o servidor continuou registrando `JWT inválido`, mas aceitou fallback anônimo e os players entraram na room `BRASIL 1`.
- O usuário confirmou que, após reiniciar o servidor, conseguiu entrar no servidor normalmente.

## Verification Conclusion
- Causa raiz confirmada: `JWT_REQUIRED` estava com default incompatível com o fluxo de login opcional do projeto.
- Correção aplicada: default de `JWT_REQUIRED` alterado para exigir JWT apenas quando `process.env.JWT_REQUIRED === '1'`.
