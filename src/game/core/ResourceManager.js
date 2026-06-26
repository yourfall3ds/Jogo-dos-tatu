// ─────────────────────────────────────────────────────────────────
//  ResourceManager — registro simples de recursos e cargas async.
//
//  Ajuda a centralizar cache, promessas em andamento e descarte de
//  recursos da camada de engine sem acoplar tudo ao loader atual.
// ─────────────────────────────────────────────────────────────────

export class ResourceManager {
  constructor() {
    this._resources = new Map();
    this._pending = new Map();
  }

  register(key, resource) {
    if (!key) return null;
    this._resources.set(key, resource);
    return resource;
  }

  unregister(key, { dispose = false } = {}) {
    const resource = this._resources.get(key);
    this._resources.delete(key);
    this._pending.delete(key);

    if (dispose) {
      try { resource?.dispose?.(); } catch (_) {}
    }
    return resource || null;
  }

  get(key, fallback = null) {
    return this._resources.has(key) ? this._resources.get(key) : fallback;
  }

  has(key) {
    return this._resources.has(key);
  }

  async loadOnce(key, loader) {
    if (!key || typeof loader !== 'function') return null;
    if (this._resources.has(key)) return this._resources.get(key);
    if (this._pending.has(key)) return this._pending.get(key);

    const promise = Promise.resolve()
      .then(() => loader())
      .then((resource) => {
        this._resources.set(key, resource);
        this._pending.delete(key);
        return resource;
      })
      .catch((e) => {
        this._pending.delete(key);
        throw e;
      });

    this._pending.set(key, promise);
    return promise;
  }

  keys() {
    return [...this._resources.keys()];
  }

  values() {
    return [...this._resources.values()];
  }

  clear({ dispose = false } = {}) {
    if (dispose) {
      for (const resource of this._resources.values()) {
        try { resource?.dispose?.(); } catch (_) {}
      }
    }
    this._resources.clear();
    this._pending.clear();
  }

  getDebugInfo() {
    return {
      loaded: this._resources.size,
      pending: this._pending.size,
      keys: this.keys(),
    };
  }
}
