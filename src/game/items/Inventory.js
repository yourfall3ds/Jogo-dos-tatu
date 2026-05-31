// ─────────────────────────────────────────────────────────────────
//  Inventory — mochila + hotbar + equipamentos
//
//  Hotbar: 5 slots (teclas 5-9 ou roda) para uso rápido de consumíveis.
//  Bag: lista geral com stacking.
//  Equip: slots por tipo (gloves/boots/chest/amulet) que somam statBonus.
// ─────────────────────────────────────────────────────────────────
import { ItemCatalog, getItemDef } from './ItemCatalog.js';

export class Inventory {
  constructor(player, stats) {
    this.player = player;
    this.stats = stats;
    this.bag = [];               // [{ id, qty }]
    this.equip = {};             // slot → id
    this.hotbar = new Array(9).fill(null);   // teclas 1-9
    this._listeners = [];
  }

  // ── Adiciona item (stack automático) ─────────────────────────────
  add(id, qty = 1) {
    const def = getItemDef(id);
    if (!def) return false;
    const maxStack = def.stack || 1;
    if (maxStack > 1) {
      const existing = this.bag.find(s => s.id === id && s.qty < maxStack);
      if (existing) { existing.qty = Math.min(maxStack, existing.qty + qty); this._notify(); return true; }
    }
    this.bag.push({ id, qty });
    // auto-atribui consumível à primeira vaga livre da hotbar
    if (def.type === 'consumable') {
      const free = this.hotbar.indexOf(null);
      if (free >= 0) this.hotbar[free] = id;
    }
    this._notify();
    return true;
  }

  remove(id, qty = 1) {
    const slot = this.bag.find(s => s.id === id);
    if (!slot) return false;
    slot.qty -= qty;
    if (slot.qty <= 0) this.bag = this.bag.filter(s => s !== slot);
    this._notify();
    return true;
  }

  count(id) {
    return this.bag.filter(s => s.id === id).reduce((a, s) => a + s.qty, 0);
  }

  getEntry(id) { return this.bag.find(s => s.id === id); }

  // ── Imagens geradas como itens ───────────────────────────────────
  addImage({ name = 'imagem', imageUrl, prompt = '' } = {}) {
    if (!imageUrl) return null;
    const id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    this.bag.push({ id, qty: 1, kind: 'image', data: { name, imageUrl, prompt } });
    // auto-atribui à primeira vaga livre da hotbar
    const free = this.hotbar.indexOf(null);
    if (free >= 0) this.hotbar[free] = id;
    this._notify();
    return id;
  }

  getImages() { return this.bag.filter(s => s.kind === 'image'); }

  // ── Usar consumível ──────────────────────────────────────────────
  use(id) {
    const def = getItemDef(id);
    if (!def || def.type !== 'consumable') return false;
    if (this.count(id) <= 0) return false;
    def.effect?.({ player: this.player, stats: this.stats });
    this.remove(id, 1);
    this.player?.sounds?.playNow?.('item_use');
    return true;
  }

  useHotbar(index) {
    const id = this.hotbar[index];
    if (!id) return false;
    const def = getItemDef(id);
    if (def?.type === 'weapon') return this.equipWeapon(id);   // arma → equipa
    const entry = this.getEntry(id);
    if (entry?.kind === 'image') return false;                 // imagem → não usa pelo número
    const ok = this.use(id);
    if (this.count(id) <= 0) this.hotbar[index] = null;
    return ok;
  }

  // ── Itens iniciais (armas) ───────────────────────────────────────
  ensureStarterItems() {
    for (const wid of ['weapon_pistol', 'weapon_rifle']) {
      if (getItemDef(wid) && !this.bag.some(s => s.id === wid)) {
        this.bag.push({ id: wid, qty: 1 });
      }
    }
    this._notify();
  }

  // ── Equipar arma → troca a arma ativa do WeaponSystem ────────────
  equipWeapon(id) {
    const def = getItemDef(id);
    if (!def || def.type !== 'weapon') return false;
    const player = window._gamePlayer;
    const ws     = player?.weapon;
    if (!ws) return false;
    ws.switchWeapon(def.weaponIndex ?? 0);
    player._updateWeaponVisibility?.();
    // saca a arma se estiver guardada
    try { player.stateMachine?.draw?.(); } catch (_) {}
    this.equippedWeapon = id;
    this._notify();
    return true;
  }

  // ── Equipar / desequipar (aplica statBonus) ──────────────────────
  equipItem(id) {
    const def = getItemDef(id);
    if (def?.type === 'weapon') return this.equipWeapon(id);
    if (!def || def.type !== 'equipment') return false;
    const slot = def.slot;
    if (this.equip[slot]) this.unequip(slot);
    this.equip[slot] = id;
    this.stats?.applyEquipBonus(def.statBonus);
    this.remove(id, 1);
    if (this.player) this.player.maxHp = this.stats?.maxHp?.() ?? this.player.maxHp;
    this._notify();
    return true;
  }

  unequip(slot) {
    const id = this.equip[slot];
    if (!id) return false;
    const def = getItemDef(id);
    this.stats?.removeEquipBonus(def.statBonus);
    delete this.equip[slot];
    this.add(id, 1);
    this._notify();
    return true;
  }

  // ── Persistência ─────────────────────────────────────────────────
  toJSON() { return { bag: this.bag, equip: this.equip, hotbar: this.hotbar }; }
  load(data) {
    if (!data) return;
    this.bag = data.bag || [];
    // hotbar agora tem 9 slots — normaliza saves antigos (5 slots)
    this.hotbar = new Array(9).fill(null);
    (data.hotbar || []).forEach((v, i) => { if (i < 9) this.hotbar[i] = v; });
    // re-aplica bônus de equipamento
    this.equip = {};
    for (const [slot, id] of Object.entries(data.equip || {})) {
      const def = getItemDef(id);
      if (def) { this.equip[slot] = id; this.stats?.applyEquipBonus(def.statBonus); }
    }
    this._notify();
  }

  onChange(cb) { this._listeners.push(cb); }
  _notify() { for (const cb of this._listeners) try { cb(this); } catch (_) {} }
}
