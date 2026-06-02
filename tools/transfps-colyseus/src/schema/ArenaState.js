// ─────────────────────────────────────────────────────────────────
//  ArenaState — schema autoritativo do servidor.
//  Clientes apenas recebem deltas e renderizam.
// ─────────────────────────────────────────────────────────────────
import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

// ── 1) Sub-schemas usados como type() em PlayerState ──
// Declarados primeiro pra evitar ReferenceError (sem hoisting de class).

export class InvSlot extends Schema {}
type('string')(InvSlot.prototype, 'item');
type('number')(InvSlot.prototype, 'qty');

export class InventoryState extends Schema {
  constructor() {
    super();
    this.bag = new ArraySchema();
  }
}
type('string')(InventoryState.prototype, 'equip_primary');
type('string')(InventoryState.prototype, 'equip_secondary');
type('string')(InventoryState.prototype, 'equip_skin');
type([InvSlot])(InventoryState.prototype, 'bag');

// ── 2) PlayerState ──
export class PlayerState extends Schema {}
type('string')(PlayerState.prototype, 'id');
type('string')(PlayerState.prototype, 'nickname');
type('string')(PlayerState.prototype, 'avatar_url');
type('boolean')(PlayerState.prototype, 'is_host');
type('boolean')(PlayerState.prototype, 'is_ready');
type('boolean')(PlayerState.prototype, 'pvp_on');
type('number')(PlayerState.prototype, 'hp');
type('number')(PlayerState.prototype, 'maxHp');
type('number')(PlayerState.prototype, 'x');
type('number')(PlayerState.prototype, 'y');
type('number')(PlayerState.prototype, 'z');
type('number')(PlayerState.prototype, 'ry');
type('number')(PlayerState.prototype, 'vy');
type('string')(PlayerState.prototype, 'anim_state');
type('string')(PlayerState.prototype, 'weapon');
type('boolean')(PlayerState.prototype, 'dead');
type('number')(PlayerState.prototype, 'xp');
type('number')(PlayerState.prototype, 'level');
type('number')(PlayerState.prototype, 'kills');
type('number')(PlayerState.prototype, 'deaths');
type('number')(PlayerState.prototype, 'coins');
type('number')(PlayerState.prototype, 'respawn_at');
type('number')(PlayerState.prototype, 'ping');
type(InventoryState)(PlayerState.prototype, 'inv');

// ── 3) Outros sub-schemas ──
export class PropState extends Schema {}
type('string')(PropState.prototype, 'id');
type('string')(PropState.prototype, 'kind');
type('number')(PropState.prototype, 'hp');
type('number')(PropState.prototype, 'maxHp');
type('number')(PropState.prototype, 'x');
type('number')(PropState.prototype, 'y');
type('number')(PropState.prototype, 'z');
type('boolean')(PropState.prototype, 'broken');

export class FxState extends Schema {}
type('string')(FxState.prototype, 'id');
type('string')(FxState.prototype, 'kind');
type('number')(FxState.prototype, 'x');
type('number')(FxState.prototype, 'y');
type('number')(FxState.prototype, 'z');
type('number')(FxState.prototype, 'expires_at');

export class DropState extends Schema {}
type('string')(DropState.prototype, 'id');
type('string')(DropState.prototype, 'kind');
type('number')(DropState.prototype, 'value');
type('number')(DropState.prototype, 'x');
type('number')(DropState.prototype, 'y');
type('number')(DropState.prototype, 'z');
type('number')(DropState.prototype, 'expires_at');

export class MobState extends Schema {}
type('string')(MobState.prototype, 'id');
type('string')(MobState.prototype, 'kind');
type('string')(MobState.prototype, 'tier');
type('number')(MobState.prototype, 'x');
type('number')(MobState.prototype, 'y');
type('number')(MobState.prototype, 'z');
type('number')(MobState.prototype, 'ry');
type('number')(MobState.prototype, 'hp');
type('number')(MobState.prototype, 'maxHp');
type('string')(MobState.prototype, 'state');
type('string')(MobState.prototype, 'target_id');

// ── 4) Root ──
export class ArenaState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.mobs = new MapSchema();
    this.drops = new MapSchema();
    this.props = new MapSchema();
    this.fx = new MapSchema();
  }
}
type({ map: PlayerState })(ArenaState.prototype, 'players');
type({ map: MobState })(ArenaState.prototype, 'mobs');
type({ map: DropState })(ArenaState.prototype, 'drops');
type({ map: PropState })(ArenaState.prototype, 'props');
type({ map: FxState })(ArenaState.prototype, 'fx');
type('string')(ArenaState.prototype, 'host_id');
type('boolean')(ArenaState.prototype, 'started');
type('string')(ArenaState.prototype, 'map_id');
type('number')(ArenaState.prototype, 'started_at');
