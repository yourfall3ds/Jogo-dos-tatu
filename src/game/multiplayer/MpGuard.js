// ─────────────────────────────────────────────────────────────────
//  MpGuard — fonte única da verdade sobre "estou em sala MP?".
//
//  Regra de ouro: DENTRO de sala MP, NADA do mundo nasce localmente.
//
//  Sistemas que consultam this.isInMpRoom() pra decidir se rodam:
//    - EnemyManager.spawn / CombatDirector (mobs)
//    - CatalogUI (tecla C — spawn manual)
//    - MonsterDebugMode (debug visual)
//    - DropSystem (loot local — fase 3 vai mover pro servidor)
//    - Level.spawnEnemyPlants / spawnPickups (mundo procedural)
//
//  Estado controlado pelo ColyseusClient via setRoom() / clearRoom().
// ─────────────────────────────────────────────────────────────────

class _MpGuard {
  constructor() {
    this._inRoom = false;
    this._roomId = null;
    this._listeners = new Set();
  }

  /** Chamado quando o cliente entra numa Colyseus Room (arena). */
  enterRoom(roomId) {
    this._inRoom = true;
    this._roomId = roomId || null;
    console.log(`[MpGuard] 🌐 ENTROU em sala MP ${roomId} — spawns locais BLOQUEADOS`);
    this._notify();
  }

  /** Chamado quando sai da sala. */
  exitRoom() {
    if (!this._inRoom) return;
    console.log(`[MpGuard] 🔓 SAIU de sala MP — spawns locais LIBERADOS`);
    this._inRoom = false;
    this._roomId = null;
    this._notify();
  }

  /** Source of truth — chame onde for spawnar/destruir/dropar algo. */
  isInMpRoom() { return this._inRoom; }
  getRoomId()  { return this._roomId; }

  /** Helper: retorna true se a ação for permitida (= não estamos em MP). */
  allowLocalSpawn() { return !this._inRoom; }

  /** Subscriptor para mudanças (UI pode esconder botão Spawn). */
  onChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _notify() { for (const cb of this._listeners) try { cb(this._inRoom); } catch (_) {} }
}

export const MpGuard = new _MpGuard();
// Expõe global pra módulos legados (Level/EnemyManager) que não importam o módulo
if (typeof window !== 'undefined') window._mpGuard = MpGuard;
