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

  // ── Assets construíveis como itens (stack) ───────────────────────
  //  Um asset da Biblioteca vira um item EMPILHÁVEL do inventário. Ao
  //  ativar o slot (tecla 1-9) ele vai "pra mão" → modo de colocar; cada
  //  peça posicionada GASTA 1 do estoque (consumeBuildable). Em 0, some.
  static BUILD_MAX_STACK = 99;
  addBuildable({ assetId, name = 'asset', glbUrl, path, groupId, groupProps = {}, thumb, qty = 1, pieceId, drag } = {}) {
    if (!assetId && !glbUrl && !path && !pieceId) return null;
    const MAX = Inventory.BUILD_MAX_STACK;
    // já existe esse asset? empilha a quantidade.
    const exists = this.bag.find(s => s.kind === 'buildable' && s.data?.assetId === assetId);
    let id;
    if (exists) {
      exists.qty = Math.min(MAX, (exists.qty || 1) + qty);
      id = exists.id;
    } else {
      id = 'build_' + (assetId || Date.now().toString(36)) + '_' + Math.random().toString(36).slice(2, 4);
      this.bag.push({ id, qty: Math.min(MAX, qty), kind: 'buildable', data: { assetId, name, glbUrl, path, groupId, groupProps, thumb, pieceId, drag } });
    }
    if (!this.hotbar.includes(id)) {
      const free = this.hotbar.indexOf(null);
      if (free >= 0) this.hotbar[free] = id;
    }
    this._notify();
    return id;
  }

  /**
   * Gasta 1 unidade de um construível (ao posicionar no mapa). Em 0, remove
   * da mochila e libera o slot da hotbar. Retorna o estoque restante
   * (0 = acabou) ou false se não havia estoque.
   */
  consumeBuildable(assetId, n = 1) {
    const slot = this.bag.find(s => s.kind === 'buildable' && s.data?.assetId === assetId);
    if (!slot || slot.qty <= 0) return false;
    slot.qty = Math.max(0, slot.qty - n);
    const left = slot.qty;
    if (left <= 0) {
      const hi = this.hotbar.indexOf(slot.id);
      if (hi >= 0) this.hotbar[hi] = null;
      this.bag = this.bag.filter(s => s !== slot);
    }
    this._notify();
    return left;
  }

  getBuildables() { return this.bag.filter(s => s.kind === 'buildable'); }

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

  /** Guarda a arma (sai da mão → punhos) ao trocar p/ item não-arma. */
  _holsterWeapon() {
    const p = window._gamePlayer;
    try {
      if (p?.stateMachine?.state === 'armed') p.stateMachine.dropWeapon();
      p?._updateWeaponVisibility?.();
    } catch (_) {}
    this.equippedWeapon = null;
  }

  useHotbar(index) {
    const id = this.hotbar[index];
    if (!id) return false;
    const entry = this.getEntry(id);
    // construível → vai "pra mão" (modo de colocar). Guarda a arma. Não consome.
    if (entry?.kind === 'buildable') {
      this._holsterWeapon();
      window._buildMode?.startPlacingInventoryAsset?.(entry.data);
      return true;
    }
    const def = getItemDef(id);
    if (def?.type === 'weapon') return this.equipWeapon(id);   // arma → equipa
    if (entry?.kind === 'image') return false;                 // imagem → não usa pelo número
    const ok = this.use(id);
    if (this.count(id) <= 0) this.hotbar[index] = null;
    return ok;
  }

  // ── Itens iniciais (armas) ───────────────────────────────────────
  //  TODAS as armas entram no inventário e ocupam um número da hotbar (1-9).
  //  A vaga default vem de def.defaultHotbar (reorganizável depois: o jogador
  //  pode reordenar a hotbar livremente — só não sobrescrevemos vagas usadas).
  ensureStarterItems() {
    const STARTER = [
      'weapon_rifle',          // 1
      'weapon_machinegun',     // 2
      'weapon_sword_paladin',  // 3
      'weapon_chibata',        // 4
      'weapon_sword_zweihander', // 5
      'weapon_pistol',         // 6
    ];
    for (const wid of STARTER) {
      const def = getItemDef(wid);
      if (!def) continue;
      if (!this.bag.some(s => s.id === wid)) this.bag.push({ id: wid, qty: 1 });
      // arma ocupa um slot da hotbar → trocável pelo número (1-9)
      if (!this.hotbar.includes(wid)) {
        // tenta a vaga default; se ocupada, cai na primeira livre
        const pref = def.defaultHotbar;
        if (Number.isInteger(pref) && pref >= 0 && pref < this.hotbar.length && this.hotbar[pref] == null) {
          this.hotbar[pref] = wid;
        } else {
          const free = this.hotbar.indexOf(null);
          if (free >= 0) this.hotbar[free] = wid;
        }
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

  // ── Drag & Drop (estilo Terraria) ────────────────────────────────
  //  Move/troca itens entre mochila (bag, por index) e hotbar (por index).
  //  bag[]: slots {id,...}. hotbar[]: ids (string) ou null.

  /** Reordena a mochila: troca os slots de origem e destino (por index). */
  moveBag(from, to) {
    const bag = this.bag;
    if (from === to || from < 0 || from >= bag.length) return false;
    const item = bag[from];
    if (!item) return false;
    if (to >= bag.length) {
      // arrastado pra uma célula vazia além do fim → vai pro final
      bag.splice(from, 1);
      bag.push(item);
    } else {
      // swap dentro da mochila
      const tmp = bag[to];
      bag[to] = item;
      bag[from] = tmp;
    }
    this._notify();
    return true;
  }

  /** Põe o item da mochila (index) num slot da hotbar (index). */
  bagToHotbar(bagIdx, hotIdx) {
    const slot = this.bag[bagIdx];
    if (!slot || hotIdx < 0 || hotIdx >= this.hotbar.length) return false;
    this.hotbar[hotIdx] = slot.id;          // hotbar referencia por id
    this._notify();
    return true;
  }

  /** Troca dois slots da hotbar (por index). */
  swapHotbar(from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.hotbar.length || to >= this.hotbar.length) return false;
    const tmp = this.hotbar[from];
    this.hotbar[from] = this.hotbar[to];
    this.hotbar[to] = tmp;
    this._notify();
    return true;
  }

  /** Tira um item da hotbar (index) → volta pra mochila (já está na bag). */
  hotbarToBag(hotIdx) {
    if (hotIdx < 0 || hotIdx >= this.hotbar.length) return false;
    if (this.hotbar[hotIdx] == null) return false;
    this.hotbar[hotIdx] = null;
    this._notify();
    return true;
  }
}
