// ─────────────────────────────────────────────────────────────────
//  EventBus — barramento simples de eventos para a camada de engine.
//
//  Serve para desacoplar sistemas novos sem depender tanto de window.*
//  nem espalhar callbacks ad-hoc por todo lado.
// ─────────────────────────────────────────────────────────────────

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(eventName, callback) {
    if (!eventName || typeof callback !== 'function') return () => {};
    let set = this._listeners.get(eventName);
    if (!set) {
      set = new Set();
      this._listeners.set(eventName, set);
    }
    set.add(callback);
    return () => this.off(eventName, callback);
  }

  once(eventName, callback) {
    if (!eventName || typeof callback !== 'function') return () => {};
    const off = this.on(eventName, (...args) => {
      try { callback(...args); }
      finally { off(); }
    });
    return off;
  }

  off(eventName, callback) {
    const set = this._listeners.get(eventName);
    if (!set) return false;
    const removed = set.delete(callback);
    if (!set.size) this._listeners.delete(eventName);
    return removed;
  }

  emit(eventName, payload = undefined) {
    const set = this._listeners.get(eventName);
    if (!set?.size) return 0;

    let delivered = 0;
    for (const callback of [...set]) {
      try {
        callback(payload);
        delivered++;
      } catch (e) {
        console.error('[EventBus] erro ao emitir', eventName, e);
      }
    }
    return delivered;
  }

  clear(eventName = null) {
    if (!eventName) {
      this._listeners.clear();
      return;
    }
    this._listeners.delete(eventName);
  }

  has(eventName) {
    return this._listeners.has(eventName);
  }

  listenerCount(eventName) {
    return this._listeners.get(eventName)?.size || 0;
  }

  eventNames() {
    return [...this._listeners.keys()];
  }
}
