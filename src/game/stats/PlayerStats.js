// ─────────────────────────────────────────────────────────────────
//  PlayerStats — atributos do personagem que afetam o gameplay real
//
//  Cada stat tem um valor BASE (do nível/atributos) e um valor de BÔNUS
//  (de equipamentos + buffs temporários). O total alimenta as fórmulas
//  consumidas por Player / CombatSystem / WeaponSystem / SkillSystem.
//
//  Fórmulas (ver META.md):
//    força          → dano *= (1 + str*0.12)
//    vitalidade     → maxHp = 80 + vit*12
//    velAtaque      → animSpeed = 1 + atkSpd*0.08 ; fireRate /= (1 + atkSpd*0.05)
//    velMovimento   → speed = 8 + mov*0.4
//    velCorrida     → multiplicador de sprint
//    velRecarga     → reload = base / (1 + reload*0.1)
//    precisão       → spread = base / (1 + prec*0.05)
//    defesa         → dano recebido *= (1 - def*0.01), cap 75%
//    esquiva        → chance de anular dano (dodge*0.01)
//    crítico        → chance crit (crit*0.01), multiplicador 2.5x
//    pulos          → maxAirJumps = 1 + jumps
//    resiliência    → reduz knockback/stun
//    sorte          → drop rate
// ─────────────────────────────────────────────────────────────────

export const STAT_KEYS = [
  'strength', 'vitality', 'attackSpeed', 'moveSpeed', 'runSpeed',
  'reloadSpeed', 'precision', 'defense', 'dodge', 'crit',
  'jumps', 'resilience', 'luck',
];

export const STAT_LABELS = {
  strength:    { name: 'Força',              icon: '💪', desc: 'Aumenta o dano de todos os ataques.' },
  vitality:    { name: 'Vitalidade',        icon: '❤️', desc: 'Aumenta o HP máximo.' },
  attackSpeed: { name: 'Vel. de Ataque',    icon: '⚡', desc: 'Acelera animações de combate e cadência de tiro.' },
  moveSpeed:   { name: 'Vel. de Movimento', icon: '🏃', desc: 'Aumenta a velocidade ao andar.' },
  runSpeed:    { name: 'Vel. de Corrida',   icon: '💨', desc: 'Aumenta a velocidade ao correr/sprint.' },
  reloadSpeed: { name: 'Vel. de Recarga',   icon: '🔄', desc: 'Reduz o tempo de recarga.' },
  precision:   { name: 'Precisão',          icon: '🎯', desc: 'Reduz o espalhamento dos tiros.' },
  defense:     { name: 'Defesa',            icon: '🛡️', desc: 'Reduz o dano recebido (até 75%).' },
  dodge:       { name: 'Esquiva',           icon: '🌀', desc: 'Chance de anular um ataque por completo.' },
  crit:        { name: 'Crítico',           icon: '💥', desc: 'Chance de causar dano crítico (2.5x).' },
  jumps:       { name: 'Pulos Extras',      icon: '🦘', desc: 'Pulos adicionais no ar.' },
  resilience:  { name: 'Resiliência',       icon: '🗿', desc: 'Reduz knockback e atordoamento sofridos.' },
  luck:        { name: 'Sorte',             icon: '🍀', desc: 'Aumenta a qualidade e quantidade de loot.' },
};

// Valores iniciais de um Digimon Rookie
const BASE_DEFAULTS = {
  strength: 5, vitality: 5, attackSpeed: 3, moveSpeed: 5, runSpeed: 4,
  reloadSpeed: 2, precision: 3, defense: 2, dodge: 2, crit: 3,
  jumps: 0, resilience: 2, luck: 1,
};

export class PlayerStats {
  constructor(initial = {}) {
    this.base  = { ...BASE_DEFAULTS, ...initial };
    this.bonus = {};            // de equipamentos (persistente)
    this._buffs = [];           // { stat, amount, mult, expires }
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.attributePoints = 0;
    this._listeners = [];       // callbacks ao recalcular
    this.maxMp = 100;
    this.mp = 100;
    this.MP_REGEN = 10;         // por segundo
  }

  // ── Valor total de um stat (base + bônus + buffs) ────────────────
  get(stat) {
    let flat = (this.base[stat] || 0) + (this.bonus[stat] || 0);
    let mult = 1;
    for (const b of this._buffs) {
      if (b.stat !== stat) continue;
      if (b.amount) flat += b.amount;
      if (b.mult)   mult *= b.mult;
    }
    return flat * mult;
  }

  // ── Fórmulas derivadas (usadas pelos sistemas) ──────────────────
  maxHp()        { return 80 + this.get('vitality') * 12; }
  damageMult()   { return 1 + this.get('strength') * 0.12; }
  animSpeed()    { return 1 + this.get('attackSpeed') * 0.08; }
  fireRateMult() { return 1 / (1 + this.get('attackSpeed') * 0.05); }
  moveSpd()      { return 8 + this.get('moveSpeed') * 0.4; }
  runMult()      { return 1.5 + this.get('runSpeed') * 0.04; }
  reloadMult()   { return 1 / (1 + this.get('reloadSpeed') * 0.1); }
  spreadMult()   { return 1 / (1 + this.get('precision') * 0.05); }
  defenseFactor(){ return 1 - Math.min(0.75, this.get('defense') * 0.01); }
  dodgeChance()  { return Math.min(0.75, this.get('dodge') * 0.01); }
  critChance()   { return Math.min(1, this.get('crit') * 0.01); }
  critMult()     { return 2.5; }
  maxAirJumps()  { return 1 + Math.floor(this.get('jumps')); }
  resilienceFactor() { return 1 - Math.min(0.8, this.get('resilience') * 0.04); }
  lootMult()     { return 1 + this.get('luck') * 0.05; }

  // ── Buffs temporários (poções/skills) ────────────────────────────
  addBuff(stat, { amount = 0, mult = 1, duration = 10 }) {
    this._buffs.push({ stat, amount, mult, expires: duration });
    this._notify();
  }

  // ── Equipamento (bônus persistente) ──────────────────────────────
  applyEquipBonus(bonusObj) {
    for (const [k, v] of Object.entries(bonusObj || {})) {
      this.bonus[k] = (this.bonus[k] || 0) + v;
    }
    this._notify();
  }
  removeEquipBonus(bonusObj) {
    for (const [k, v] of Object.entries(bonusObj || {})) {
      this.bonus[k] = (this.bonus[k] || 0) - v;
    }
    this._notify();
  }

  // ── XP / Level ───────────────────────────────────────────────────
  addXp(amount) {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.attributePoints += 3;
      this.xpToNext = Math.round(this.xpToNext * 1.35);
      leveled = true;
    }
    if (leveled) this._notify();
    return leveled;
  }

  spendPoint(stat) {
    if (this.attributePoints <= 0 || !(stat in this.base)) return false;
    this.base[stat] += 1;
    this.attributePoints -= 1;
    this._notify();
    return true;
  }

  // ── MP ───────────────────────────────────────────────────────────
  useMp(cost) {
    if (this.mp < cost) return false;
    this.mp -= cost;
    return true;
  }

  // ── Update por frame (buffs + regen de MP) ───────────────────────
  update(dt) {
    let dirty = false;
    for (let i = this._buffs.length - 1; i >= 0; i--) {
      this._buffs[i].expires -= dt;
      if (this._buffs[i].expires <= 0) { this._buffs.splice(i, 1); dirty = true; }
    }
    if (this.mp < this.maxMp) {
      this.mp = Math.min(this.maxMp, this.mp + this.MP_REGEN * dt);
    }
    if (dirty) this._notify();
  }

  // ── Persistência ─────────────────────────────────────────────────
  toJSON() {
    return { base: this.base, bonus: this.bonus, level: this.level, xp: this.xp, xpToNext: this.xpToNext, attributePoints: this.attributePoints };
  }
  load(data) {
    if (!data) return;
    Object.assign(this.base, data.base || {});
    Object.assign(this.bonus, data.bonus || {});
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.xpToNext = data.xpToNext ?? 100;
    this.attributePoints = data.attributePoints ?? 0;
    this._notify();
  }

  onChange(cb) { this._listeners.push(cb); }
  _notify() { for (const cb of this._listeners) try { cb(this); } catch (_) {} }
}
