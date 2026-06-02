// ─────────────────────────────────────────────────────────────────
//  SkillTable — fonte única da verdade pra skills do player.
//
//  Cliente NUNCA decide se skill funcionou. Server checa:
//   - skillId existe?
//   - cooldown passou?
//   - mana/stamina suficiente?
//   - player vivo?
//
//  Resultado: broadcast 'skill_cast' → todos renderizam VFX local.
// ─────────────────────────────────────────────────────────────────

export const SKILLS = {
  // ── Skills do RPG existente (Z/X/C/F/Q) ──
  dash_explosivo:    { mp:  25, cdMs:  900,  range:  6.0, radius: 4.0, dmg: 60, key: 'Z' },
  rajada_socos:     { mp:  30, cdMs: 1400,  range:  3.5, radius: 2.0, dmg: 90, key: 'X' },
  slam_descendente:  { mp:  40, cdMs: 2200,  range:  4.5, radius: 4.0, dmg: 80, key: 'C' },
  defesa_perfeita:  { mp:  20, cdMs: 4000,  range:  0,   radius: 0,   dmg: 0,  key: 'F', kind: 'buff', duration: 1500 },
  ultimate:          { mp:  80, cdMs: 8000,  range:  6.0, radius: 5.5, dmg: 200, key: 'Q' },

  // ── DBZ-style (Sound FX disponíveis) ──
  kamehameha:        { mp: 100, cdMs:10000,  range: 25.0, radius: 3.0, dmg: 250, key: null },
  aura_ssj:          { mp:  40, cdMs: 6000,  range:  0,   radius: 0,   dmg: 0,  key: null, kind: 'buff', duration: 8000 },
};

const FALLBACK = { mp: 9999, cdMs: 1000, range: 0, radius: 0, dmg: 0, kind: 'melee' };

export function getSkill(id) {
  return SKILLS[id] || FALLBACK;
}

/**
 * Valida cast de skill. Retorna { ok, reason, skill }.
 *
 *  caster:  PlayerState
 *  skillId: string
 *  now:     Date.now()
 *  cooldowns: Map<`${playerId}:${skillId}` -> lastCastAt>
 */
export function validateSkillCast({ caster, skillId, now, cooldowns }) {
  if (!caster || caster.dead) return { ok: false, reason: 'caster_dead' };
  const s = SKILLS[skillId];
  if (!s) return { ok: false, reason: 'unknown_skill' };

  const key = `${caster.id}:${skillId}`;
  const lastAt = cooldowns.get(key) || 0;
  if (now - lastAt < s.cdMs) {
    return { ok: false, reason: 'cooldown', remaining: s.cdMs - (now - lastAt) };
  }

  // (Mana check: PlayerState não tem mp ainda — futuro. Por ora aceita.)
  cooldowns.set(key, now);
  return { ok: true, skill: s };
}
