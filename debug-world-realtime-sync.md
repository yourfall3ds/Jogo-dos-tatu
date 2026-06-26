# Debug Session: world-realtime-sync
- **Status**: [OPEN]
- **Issue**: Mover ou apagar objetos pelo `SceneEditor` altera a cena local, mas os outros clientes não recebem a mudança em tempo real.
- **Debug Server**: TBD
- **Log File**: .dbg/trae-debug-log-world-realtime-sync.ndjson

## Reproduction Steps
1. Abrir dois clientes no jogo.
2. Entrar no mesmo mundo/servidor.
3. Mover ou apagar um item pelo `SceneEditor` no cliente A.
4. Observar que o cliente B não recebe a mudança imediatamente.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O `SceneEditor` não está chamando o caminho global (`syncPlacedTransform` / `removePlacedByMesh`) para esse tipo de objeto. | High | Low | Pending |
| B | O `WorldObjects.updateTransform/remove` está falhando no Supabase e a mudança fica só local. | High | Low | Pending |
| C | O `loadAll` funciona, mas a assinatura `WorldObjects.subscribe()` não entrega eventos `UPDATE/DELETE` para os outros clientes. | High | Med | Pending |
| D | Os clientes estão vendo objetos que não vêm de `world_objects`, então mover/apagar afeta outra fonte de dados. | Med | Med | Pending |
| E | Há race/overwrite local no cliente remoto, que recebe o evento mas re-renderiza estado antigo por cache/fallback. | Med | Med | Pending |

## Log Evidence
- Ainda sem coleta nesta sessão.

## Verification Conclusion
- Pendente.
