// ─────────────────────────────────────────────────────────────────
//  GameEntity — entidade leve para a camada de engine.
//
//  Nao substitui tudo do projeto atual de uma vez. A ideia e oferecer
//  uma base simples para entidades novas e para migracoes graduais.
// ─────────────────────────────────────────────────────────────────

export class GameEntity {
  constructor({
    id = null,
    type = 'entity',
    name = null,
    tags = [],
    state = {},
  } = {}) {
    this.id = id || this._makeId(type);
    this.type = type;
    this.name = name || this.id;
    this.components = new Map();
    this.tags = new Set(tags);
    this.state = { ...state };
    this.active = true;
    this.createdAt = Date.now();
  }

  addComponent(name, component) {
    if (!name) return null;
    this.components.set(name, component);
    return component;
  }

  getComponent(name) {
    return this.components.get(name);
  }

  hasComponent(name) {
    return this.components.has(name);
  }

  removeComponent(name) {
    const component = this.components.get(name);
    if (!component) return false;

    try { component.dispose?.(); } catch (_) {}
    this.components.delete(name);
    return true;
  }

  setState(key, value) {
    this.state[key] = value;
    return value;
  }

  getState(key, fallback = undefined) {
    return key in this.state ? this.state[key] : fallback;
  }

  assignState(patch = {}) {
    Object.assign(this.state, patch);
    return this.state;
  }

  addTag(tag) {
    if (tag) this.tags.add(tag);
    return this;
  }

  removeTag(tag) {
    this.tags.delete(tag);
    return this;
  }

  hasTag(tag) {
    return this.tags.has(tag);
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      tags: [...this.tags],
      state: { ...this.state },
      active: this.active === true,
      createdAt: this.createdAt,
    };
  }

  dispose() {
    if (!this.active) return;
    this.active = false;

    for (const component of this.components.values()) {
      try { component?.dispose?.(); } catch (_) {}
    }
    this.components.clear();
    this.tags.clear();
  }

  _makeId(type) {
    return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
}
