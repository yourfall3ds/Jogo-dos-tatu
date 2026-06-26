// ─────────────────────────────────────────────────────────────────
//  GameLoop — loop logico simples com fases ordenadas.
//
//  Nao substitui o render loop atual ainda. A ideia e organizar a
//  execucao de sistemas novos e migrados por camadas previsiveis.
// ─────────────────────────────────────────────────────────────────

const DEFAULT_PHASES = [
  'input',
  'prediction',
  'logic',
  'physics',
  'network',
  'animation',
  'ui',
];

export class GameLoop {
  constructor(phases = DEFAULT_PHASES) {
    this.phases = [...phases];
    this._systems = new Map();
  }

  addSystem({
    name,
    phase = 'logic',
    order = 0,
    enabled = true,
    update,
  } = {}) {
    if (!name || typeof update !== 'function') return null;
    if (!this.phases.includes(phase)) this.phases.push(phase);

    const system = {
      name,
      phase,
      order,
      enabled,
      update,
    };

    this._systems.set(name, system);
    return system;
  }

  removeSystem(name) {
    return this._systems.delete(name);
  }

  hasSystem(name) {
    return this._systems.has(name);
  }

  setEnabled(name, enabled) {
    const system = this._systems.get(name);
    if (!system) return false;
    system.enabled = enabled === true;
    return true;
  }

  tick(dt, context = {}) {
    for (const phase of this.phases) {
      const systems = this._getPhaseSystems(phase);
      for (const system of systems) {
        if (!system.enabled) continue;
        try {
          system.update(dt, context);
        } catch (e) {
          console.error('[GameLoop] erro no sistema', system.name, e);
        }
      }
    }
  }

  getDebugInfo() {
    return {
      phases: [...this.phases],
      systems: [...this._systems.values()].map((system) => ({
        name: system.name,
        phase: system.phase,
        order: system.order,
        enabled: system.enabled === true,
      })),
    };
  }

  _getPhaseSystems(phase) {
    return [...this._systems.values()]
      .filter((system) => system.phase === phase)
      .sort((a, b) => a.order - b.order);
  }
}
