// ─────────────────────────────────────────────────────────────────
//  WeaponTable — fonte ÚNICA da verdade de dano/range/cooldown.
//
//  Cliente NUNCA envia dmg. Cliente manda `weapon` e `target`.
//  Servidor consulta esta tabela e calcula o resto.
//
//  Cooldown server-side: lastUseAt por (playerId, weapon).
//  Range: distância entre attacker.pos e target.pos.
// ─────────────────────────────────────────────────────────────────

export const WEAPONS = {
  // ── Punho/Chute (sem arma) ──
  unarmed:        { dmg: 14, range: 2.2,  cdMs: 250, kind: 'melee'  },
  punch_01:       { dmg: 15, range: 2.2,  cdMs: 220, kind: 'melee'  },
  punch_02:       { dmg: 18, range: 2.2,  cdMs: 240, kind: 'melee'  },
  punch_03:       { dmg: 22, range: 2.4,  cdMs: 280, kind: 'melee'  },
  punch_04:       { dmg: 25, range: 2.4,  cdMs: 300, kind: 'melee'  },
  kick_01:        { dmg: 30, range: 2.5,  cdMs: 380, kind: 'melee'  },
  kick_02:        { dmg: 50, range: 2.6,  cdMs: 600, kind: 'melee'  },
  combo_punch_5:  { dmg: 30, range: 2.4,  cdMs: 420, kind: 'melee'  },

  // ── Espadas ──
  sword_paladin:    { dmg: 40,  range: 3.2, cdMs: 320, kind: 'sword' },
  sword_zweihander: { dmg: 65,  range: 3.6, cdMs: 520, kind: 'sword' },
  sword_attack_01:  { dmg: 40,  range: 3.2, cdMs: 300, kind: 'sword' },
  sword_left_slash: { dmg: 45,  range: 3.2, cdMs: 320, kind: 'sword' },
  sword_thrust:     { dmg: 55,  range: 3.4, cdMs: 360, kind: 'sword' },
  sword_charged:    { dmg: 110, range: 3.4, cdMs: 800, kind: 'sword' },
  sword_charged_slash: { dmg: 120, range: 3.6, cdMs: 850, kind: 'sword' },
  sword_judgment:   { dmg: 90,  range: 3.4, cdMs: 700, kind: 'sword' },
  sword_blade_spin: { dmg: 80,  range: 3.8, cdMs: 720, kind: 'sword' },
  sword_triple_combo: { dmg: 60, range: 3.2, cdMs: 480, kind: 'sword' },
  sword_ultimate:   { dmg: 180, range: 4.0, cdMs: 2500, kind: 'sword' },

  // ── Chibata (whip) ──
  chibata:          { dmg: 35, range: 3.5, cdMs: 350, kind: 'whip'  },

  // ── Armas de fogo ──
  pistol:           { dmg: 40, range: 60,  cdMs: 280, kind: 'gun'   },
  rifle:            { dmg: 28, range: 80,  cdMs: 110, kind: 'gun'   },
};

const FALLBACK = { dmg: 12, range: 2.5, cdMs: 400, kind: 'melee' };

/** Lookup com fallback seguro. */
export function getWeapon(id) {
  return WEAPONS[id] || FALLBACK;
}

/**
 * Valida hit do cliente. Retorna { ok, reason, dmg } — servidor aplica dmg
 * só se ok=true.
 *
 *  attacker: PlayerState
 *  target:   PlayerState | MobState (precisa ter x/y/z + hp)
 *  weaponId: string
 *  now:      Date.now()
 *  cooldowns: Map<string, number>  // key `${playerId}:${weaponId}` → lastUseAt
 */
export function validateHit({ attacker, target, weaponId, now, cooldowns, pvpRequired = false }) {
  if (!attacker || !target) return { ok: false, reason: 'no_actor' };
  if (target.hp <= 0) return { ok: false, reason: 'already_dead' };
  if (attacker.dead) return { ok: false, reason: 'attacker_dead' };

  const w = getWeapon(weaponId);

  // PvP gate
  if (pvpRequired && (!attacker.pvp_on || !target.pvp_on)) {
    return { ok: false, reason: 'pvp_off' };
  }

  // Cooldown
  const key = `${attacker.id}:${weaponId}`;
  const lastAt = cooldowns.get(key) || 0;
  if (now - lastAt < w.cdMs) {
    return { ok: false, reason: 'cooldown', remaining: w.cdMs - (now - lastAt) };
  }

  // Range (XZ apenas — pula altura)
  const dx = (target.x ?? 0) - (attacker.x ?? 0);
  const dz = (target.z ?? 0) - (attacker.z ?? 0);
  const dist = Math.sqrt(dx * dx + dz * dz);
  // Tolerância: range + 1u pra cobrir interp client-side
  if (dist > w.range + 1.0) {
    return { ok: false, reason: 'out_of_range', dist: dist.toFixed(2), max: w.range };
  }

  // OK — registra cooldown e devolve dmg autoritativo
  cooldowns.set(key, now);
  return { ok: true, dmg: w.dmg, weapon: w };
}
