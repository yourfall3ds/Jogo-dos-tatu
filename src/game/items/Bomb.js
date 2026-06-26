// ─────────────────────────────────────────────────────────────────
//  Bomb — bomba arremessável (slot 4 da hotbar)
//
//  Fluxo: useHotbar(3) → Inventory.use('bomb') → throwBomb({ player }).
//  A bomba sai dos olhos na direção da câmera, voa em ARCO (gravidade +
//  quique no cenário), BIPA "pip pip pip" acelerando, e ao fim do pavio
//  EXPLODE: flash + luz + som + DANO EM ÁREA (falloff) nos inimigos.
//
//  100% client-side e auto-limpante (não depende do loop principal: se
//  registra/desregistra no onBeforeRenderObservable da cena). Em sala MP
//  o dano vai pros mobs/players remotos via _cs (server-authoritative).
//
//  ── Knobs (ajuste à vontade) ────────────────────────────────────────
const FUSE_TIME    = 1.8;    // s do arremesso até explodir
const THROW_SPEED  = 16;     // m/s pra frente (força do arremesso)
const THROW_UP     = 5.5;    // componente vertical (altura do arco)
const GRAVITY      = -22;    // m/s²
const BOUNCE       = 0.45;   // restituição ao quicar (0 = gruda, 1 = pula tudo)
const FRICTION     = 0.78;   // atrito ao quicar (segura o rolamento)
const BLAST_RADIUS = 6.5;    // m — raio da explosão
const BLAST_DMG    = 130;    // dano no CENTRO da explosão
const MIN_DMG_FRAC = 0.30;   // dano na BORDA = 30% do centro (falloff linear)
const SELF_DAMAGE  = false;  // a própria bomba machuca o jogador?
const SELF_DMG_MULT= 0.6;    // se SELF_DAMAGE, fração do dano no jogador
// ─────────────────────────────────────────────────────────────────

/** "pip" curto sintetizado no AudioContext cru compartilhado. */
function beep(freq = 950) {
  try {
    const ctx = window._audioCtx ||
      (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.1);
  } catch (_) {}
}

/** Filtro do ray de colisão: só cenário estático (não inimigo/player/efeitos). */
function _blastFilter(m) {
  return m.isEnabled()
    && m.isPickable !== false
    && m.isVisible  !== false
    && (m.visibility ?? 1) > 0.05
    && !m._enemyRef && !m._isRemotePlayer && !m._isRemoteMob && !m._isHitProxy
    && !m.name.startsWith('bomb')
    && !m.name.startsWith('explFx')
    && !m.name.startsWith('gun')
    && !m.name.startsWith('arm')
    && !m.name.startsWith('muzzle')
    && !m.name.startsWith('hit')
    && !m.name.startsWith('tracer')
    && !m.name.startsWith('spark')
    && !m.name.startsWith('expl')
    && !m.name.startsWith('bhole')
    && !m.name.startsWith('tps_')
    && !m.name.startsWith('weaponRoot');
}

/**
 * Arremessa a bomba. Retorna false se não deu (sem cena/morto) → aí o
 * Inventory NÃO consome a unidade.
 * @param {{player:object}} ctx
 */
export function throwBomb({ player } = {}) {
  const scene = player?.scene;
  const cam   = player?.camera;
  if (!scene || !cam || player?._dead || !player?.mesh) return false;

  // Origem: nos olhos, um pouco à frente (não nasce dentro da câmera).
  const eye = player.mesh.position.clone();
  eye.y += (player.HEIGHT ?? 1.8) / 2 - 0.1;
  const dir   = cam.getDirection(BABYLON.Vector3.Forward());
  const spawn = eye.add(dir.scale(0.8));

  // Mesh da bomba (esfera escura que pisca vermelho no bip).
  const bomb = BABYLON.MeshBuilder.CreateSphere('bomb', { diameter: 0.35, segments: 10 }, scene);
  bomb.position.copyFrom(spawn);
  bomb.isPickable = false;
  const mat = new BABYLON.StandardMaterial('bombMat', scene);
  mat.diffuseColor  = new BABYLON.Color3(0.05, 0.05, 0.06);
  mat.emissiveColor = new BABYLON.Color3(0.30, 0.0, 0.0);
  mat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  bomb.material = mat;

  // Velocidade inicial: pra frente + arco pra cima.
  const vel = dir.scale(THROW_SPEED);
  vel.y += THROW_UP;

  let fuse         = FUSE_TIME;
  let nextBeep     = 0;
  let beepInterval = 0.42;

  const obs = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    fuse -= dt;

    // ── Integra gravidade + move com colisão (quique) ──────────────
    vel.y += GRAVITY * dt;
    const step = vel.scale(dt);
    const dist = step.length();
    if (dist > 1e-4) {
      const ray = new BABYLON.Ray(bomb.position, step.normalizeToNew(), dist + 0.18);
      const hit = scene.pickWithRay(ray, _blastFilter);
      if (hit?.hit && hit.pickedPoint) {
        const n  = hit.getNormal(true) || BABYLON.Vector3.Up();
        bomb.position.copyFrom(hit.pickedPoint).addInPlace(n.scale(0.18));
        const vn = BABYLON.Vector3.Dot(vel, n);
        vel.subtractInPlace(n.scale(2 * vn));   // reflexão na normal
        vel.scaleInPlace(BOUNCE * FRICTION);
      } else {
        bomb.position.addInPlace(step);
      }
    }

    // ── Bip "pip" acelerando conforme o pavio acaba ────────────────
    nextBeep -= dt;
    if (nextBeep <= 0) {
      beep(880 + (FUSE_TIME - fuse) * 240);
      mat.emissiveColor.set(1, 0.12, 0.0);
      setTimeout(() => { try { mat.emissiveColor.set(0.30, 0, 0); } catch (_) {} }, 70);
      beepInterval = Math.max(0.10, beepInterval * 0.74);
      nextBeep = beepInterval;
    }

    if (fuse <= 0) {
      scene.onBeforeRenderObservable.remove(obs);
      const center = bomb.position.clone();
      try { bomb.dispose(); } catch (_) {}
      try { mat.dispose(); } catch (_) {}
      explode(scene, player, center);
    }
  });

  return true;
}

/** Explosão: feedback visual/sonoro + dano em área. */
function explode(scene, player, center) {
  // ── Som ──────────────────────────────────────────────────────────
  try { player?.sounds?.playNow?.('explosion', 1.0); } catch (_) {}

  // ── Flash: esfera emissiva que expande e some + luz breve ─────────
  const fx = BABYLON.MeshBuilder.CreateSphere('explFx', { diameter: 1, segments: 12 }, scene);
  fx.position.copyFrom(center);
  fx.isPickable = false;
  const fmat = new BABYLON.StandardMaterial('explFxMat', scene);
  fmat.emissiveColor   = new BABYLON.Color3(1, 0.6, 0.15);
  fmat.disableLighting = true;
  fmat.alpha = 0.9;
  fx.material = fmat;

  let light = null;
  try {
    light = new BABYLON.PointLight('explLight', center.clone(), scene);
    light.diffuse   = new BABYLON.Color3(1, 0.6, 0.2);
    light.specular  = new BABYLON.Color3(0, 0, 0);
    light.intensity = 16;
    light.range     = BLAST_RADIUS * 2.5;
  } catch (_) {}

  const DUR = 0.45;
  let t = 0;
  const o = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    t += dt;
    const k = Math.min(1, t / DUR);
    fx.scaling.setAll(1 + k * BLAST_RADIUS * 1.5);
    fmat.alpha = Math.max(0, 0.9 * (1 - k));
    if (light) light.intensity = Math.max(0, 16 * (1 - k));
    if (t >= DUR) {
      scene.onBeforeRenderObservable.remove(o);
      try { fx.dispose(); } catch (_) {}
      try { fmat.dispose(); } catch (_) {}
      try { light?.dispose(); } catch (_) {}
    }
  });

  applyBlastDamage(scene, player, center);
}

/** Dano radial com falloff linear (centro = BLAST_DMG, borda = MIN_DMG_FRAC). */
function applyBlastDamage(scene, player, center) {
  const R       = BLAST_RADIUS;
  const R2      = R * R;
  const dmgAt = (d) => Math.round(BLAST_DMG * (1 - (1 - MIN_DMG_FRAC) * Math.min(1, d / R)));

  // ── Inimigos locais (PvE single-player) ───────────────────────────
  const level   = player?.level || window._gameLevel;
  const enemies = level?.enemies || [];
  for (const e of enemies) {
    if (!e || !e.root || e.alive === false) continue;
    if ((e.hp ?? 1) <= 0) continue;
    const pos = e.root.getAbsolutePosition?.() || e.root.position;
    const d2  = BABYLON.Vector3.DistanceSquared(center, pos);
    if (d2 > R2) continue;
    const d   = Math.sqrt(d2);
    const dmg = dmgAt(d);
    const dir = pos.subtract(center); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    try { e.takeDamage(dmg, dir, 1.5); } catch (_) {}
    try { window._dmgNumbers?.spawn(pos.add(new BABYLON.Vector3(0, 1, 0)), dmg, { color: '#ffae2c' }); } catch (_) {}
    try { window._bloodFX?.spawn(pos, dir, { multiplier: 1.2, sourceNode: e.root }); } catch (_) {}
  }

  // ── Objetos dinâmicos (GameObject): empurrão radial ───────────────
  try {
    for (const m of scene.meshes) {
      if (!m._gameObject) continue;
      const pos = m.getAbsolutePosition();
      const d2  = BABYLON.Vector3.DistanceSquared(center, pos);
      if (d2 > R2) continue;
      const dir = pos.subtract(center);
      const d   = Math.max(0.4, dir.length());
      dir.normalize();
      m._gameObject.applyImpulse(dir.scale(BLAST_DMG * 0.5 * (1 - d / R)), pos);
    }
  } catch (_) {}

  // ── MP: mobs/players remotos (server-authoritative via _cs) ───────
  try {
    const cs = window._cs;
    if (cs) {
      for (const m of scene.meshes) {
        if (!m._isRemoteMob && !m._isRemotePlayer) continue;
        const pos = m.getAbsolutePosition?.();
        if (!pos) continue;
        const d2 = BABYLON.Vector3.DistanceSquared(center, pos);
        if (d2 > R2) continue;
        const dmg = dmgAt(Math.sqrt(d2));
        if (m._isRemoteMob && m._mobRef) {
          cs.sendHitMob?.(m._mobRef.id, dmg, 'bomb');
          window._dmgNumbers?.spawn(pos.add(new BABYLON.Vector3(0, 1, 0)), dmg, { color: '#ffae2c' });
        } else if (m._isRemotePlayer && m._remoteRef) {
          cs.sendHitPlayer?.(m._remoteRef.playerId, dmg, 'bomb');
          window._dmgNumbers?.spawn(pos.add(new BABYLON.Vector3(0, 1, 0)), dmg, { color: '#ff6666' });
        }
      }
    }
  } catch (_) {}

  // ── Auto-dano (opcional) ──────────────────────────────────────────
  if (SELF_DAMAGE && player && !player._dead && player.mesh) {
    const pos = player.mesh.position;
    const d2  = BABYLON.Vector3.DistanceSquared(center, pos);
    if (d2 <= R2) {
      const dmg = Math.round(dmgAt(Math.sqrt(d2)) * SELF_DMG_MULT);
      try { player.takeDamage?.(dmg, 'explosion', center, 4); } catch (_) {}
    }
  }
}
