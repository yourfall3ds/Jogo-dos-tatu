// ─────────────────────────────────────────────────────────────────
//  SkillSystem — habilidades ativas mapeadas em 1/2/3/4 + Q (ultimate)
//
//  Cada skill: { key, name, icon, mpCost, cooldown, execute(ctx) }
//  ctx = { player, scene, stats, level }
//
//  Escala com stats: dano usa stats.damageMult(), cooldown reduz com
//  attackSpeed. Os efeitos visuais reaproveitam ImpactEffectSystem.
// ─────────────────────────────────────────────────────────────────

// Teclas das skills no cluster perto do WASD (1-9 agora é o inventário).
export const SKILL_DEFS = {
  dashStrike: {
    name: 'Dash Explosivo', icon: '⚡', key: 'KeyZ',
    mpCost: 25, cooldown: 3.5, radius: 4, baseDamage: 40,
    desc: 'Avança rápido e explode em dano de área no destino.',
  },
  flurry: {
    name: 'Rajada de Socos', icon: '👊', key: 'KeyX',
    mpCost: 30, cooldown: 5, radius: 3, baseDamage: 12, hits: 6,
    desc: '6 socos ultrarrápidos em quem estiver à frente.',
  },
  slam: {
    name: 'Slam Descendente', icon: '🔨', key: 'KeyC',
    mpCost: 40, cooldown: 7, radius: 5, baseDamage: 60,
    desc: 'Salta e cai com impacto sísmico em área.',
  },
  parry: {
    name: 'Defesa Perfeita', icon: '🛡️', key: 'KeyF',
    mpCost: 20, cooldown: 6, duration: 1.5,
    desc: 'Janela de parry — reflete dano se acertar o tempo.',
  },
  ultimate: {
    name: 'Ultimate', icon: '🌟', key: 'KeyQ',
    mpCost: 80, cooldown: 18, radius: 8, baseDamage: 150,
    desc: 'Libera energia em uma onda devastadora ao redor.',
  },
};

export class SkillSystem {
  constructor(player, scene, stats) {
    this.player = player;
    this.scene = scene;
    this.stats = stats;
    this._cooldowns = {};       // id → tempo restante
    this._wasDown = {};         // edge-detect por tecla
    this.parryActive = 0;       // >0 = janela de parry aberta
    for (const id of Object.keys(SKILL_DEFS)) this._cooldowns[id] = 0;
  }

  update(dt, input) {
    for (const id in this._cooldowns) {
      if (this._cooldowns[id] > 0) this._cooldowns[id] -= dt;
    }
    if (this.parryActive > 0) this.parryActive -= dt;

    if (!input) return;
    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      const down = input.isDown(def.key);
      if (down && !this._wasDown[id]) this.tryCast(id);
      this._wasDown[id] = down;
    }
  }

  canCast(id) {
    const def = SKILL_DEFS[id];
    if (!def) return false;
    if (this._cooldowns[id] > 0) return false;
    if (this.stats && this.stats.mp < def.mpCost) return false;
    return true;
  }

  tryCast(id) {
    if (!this.canCast(id)) return false;
    const def = SKILL_DEFS[id];
    if (this.stats) this.stats.useMp(def.mpCost);
    // cooldown reduz levemente com attackSpeed
    const cdMult = this.stats ? (1 / (1 + this.stats.get('attackSpeed') * 0.02)) : 1;
    this._cooldowns[id] = def.cooldown * cdMult;
    this._execute(id, def);
    return true;
  }

  _execute(id, def) {
    const p = this.player;
    const dmgMult = this.stats ? this.stats.damageMult() : 1;
    const dmg = (def.baseDamage || 0) * dmgMult;

    switch (id) {
      case 'dashStrike': {
        // impulso forte na direção da câmera + AoE no destino
        const dir = p.camera.getDirection(BABYLON.Vector3.Forward());
        p._vx = dir.x * 34; p._vz = dir.z * 34;
        if (p.isGrounded) p.velY = 5;
        p._dashFovT = 0.18;
        setTimeout(() => this._aoe(p.mesh.position, def.radius, dmg, 'slam'), 200);
        break;
      }
      case 'flurry': {
        let i = 0;
        const tick = () => {
          if (i >= def.hits) return;
          const fwd = p.mesh.getDirection(BABYLON.Vector3.Forward());
          const hp = p.mesh.position.add(fwd.scale(2));
          this._aoe(hp, def.radius, dmg, 'melee', fwd);
          i++; setTimeout(tick, 80);
        };
        tick();
        break;
      }
      case 'slam': {
        p.velY = 12;   // salta
        const checkLand = setInterval(() => {
          if (p.isGrounded && p.velY <= 0) {
            clearInterval(checkLand);
            this._aoe(p.mesh.position, def.radius, dmg, 'slam');
            this._shockRing(p.mesh.position, def.radius);
          }
        }, 50);
        setTimeout(() => clearInterval(checkLand), 3000);
        break;
      }
      case 'parry': {
        this.parryActive = def.duration;
        break;
      }
      case 'ultimate': {
        this._aoe(p.mesh.position, def.radius, dmg, 'slam');
        this._shockRing(p.mesh.position, def.radius, [1, 0.85, 0.2]);
        if (p.weapon?._glowLayer) {
          const gl = p.weapon._glowLayer;
          const old = gl.intensity; gl.intensity = 1.4;
          setTimeout(() => gl.intensity = old, 350);
        }
        break;
      }
    }
  }

  // ── Dano em área aos inimigos próximos ───────────────────────────
  _aoe(center, radius, damage, type = 'melee', dir = null) {
    const level = this.player.level;
    if (!level?.enemies) return;
    for (const e of level.enemies) {
      if (!e.alive || !e.root) continue;
      const d = BABYLON.Vector3.Distance(e.root.position, center);
      if (d <= radius) {
        const kdir = dir || e.root.position.subtract(center).normalize();
        e.takeDamage(damage, kdir, 1.4);
      }
    }
  }

  // ── Anel de choque visual ────────────────────────────────────────
  _shockRing(pos, radius, color = [0.4, 0.7, 1.0]) {
    const ring = BABYLON.MeshBuilder.CreateTorus(`skillRing_${performance.now() | 0}`,
      { diameter: 0.6, thickness: 0.2, tessellation: 32 }, this.scene);
    ring.position.set(pos.x, pos.y - 0.8, pos.z);
    ring.rotation.x = Math.PI / 2; ring.isPickable = false;
    const m = new BABYLON.StandardMaterial('skillRingM', this.scene);
    m.emissiveColor = new BABYLON.Color3(...color); m.disableLighting = true; m.backFaceCulling = false;
    ring.material = m;
    let t = 0; const DUR = 0.5, TR = radius * 2;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const pr = Math.min(t / DUR, 1);
      ring.scaling.setAll(pr * TR); m.alpha = 1 - pr;
      if (pr >= 1) { this.scene.onBeforeRenderObservable.remove(obs); ring.dispose(); }
    });
  }

  // ── Para o HUD ───────────────────────────────────────────────────
  getCooldownInfo() {
    const out = {};
    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      out[id] = {
        name: def.name, icon: def.icon, mpCost: def.mpCost,
        cd: Math.max(0, this._cooldowns[id]), cdMax: def.cooldown,
        ready: this.canCast(id),
      };
    }
    return out;
  }
}
