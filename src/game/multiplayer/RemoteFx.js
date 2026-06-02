// ─────────────────────────────────────────────────────────────────
//  RemoteFx — eventos visuais server-broadcasted.
//
//  Quando state.fx ganha entry, todos clientes spawnam particle local
//  por TTL. Não há fonte de verdade no cliente — só renderiza.
// ─────────────────────────────────────────────────────────────────

const _texCache = new Map();

function _getTex(scene, key, draw) {
  if (_texCache.has(key)) return _texCache.get(key);
  const t = new BABYLON.DynamicTexture(`fxtex_${key}`, { width: 32, height: 32 }, scene, false);
  const ctx = t.getContext();
  draw(ctx);
  t.update();
  t.hasAlpha = true;
  _texCache.set(key, t);
  return t;
}

const FX_PRESETS = {
  prop_break_barrel: {
    color1: [0.65, 0.42, 0.18, 1], color2: [0.45, 0.25, 0.08, 1],
    count: 80, gravity: [0, -8, 0], size: [0.10, 0.30], life: [0.5, 1.0],
    dir1: [-4, 2, -4], dir2: [4, 5, 4], textureKey: 'wood',
  },
  prop_break_crate: {
    color1: [0.55, 0.40, 0.20, 1], color2: [0.30, 0.20, 0.08, 1],
    count: 60, gravity: [0, -10, 0], size: [0.12, 0.32], life: [0.5, 0.9],
    dir1: [-3, 1, -3], dir2: [3, 4, 3], textureKey: 'wood',
  },
  explosion: {
    color1: [1.0, 0.65, 0.10, 1], color2: [1.0, 0.25, 0.05, 1],
    count: 200, gravity: [0, 2, 0], size: [0.25, 0.85], life: [0.4, 0.9],
    dir1: [-6, -1, -6], dir2: [6, 6, 6], textureKey: 'fire',
  },
  splash: {
    color1: [0.50, 0.75, 0.95, 1], color2: [0.25, 0.55, 0.85, 1],
    count: 80, gravity: [0, -8, 0], size: [0.10, 0.25], life: [0.4, 0.8],
    dir1: [-3, 2, -3], dir2: [3, 5, 3], textureKey: 'drop',
  },
  spray: {
    color1: [1.0, 0.30, 0.85, 1], color2: [0.85, 0.10, 0.65, 1],
    count: 40, gravity: [0, -1, 0], size: [0.08, 0.18], life: [0.6, 1.2],
    dir1: [-1, 0, -1], dir2: [1, 0.5, 1], textureKey: 'drop',
  },
  sparks: {
    color1: [1.0, 0.90, 0.40, 1], color2: [1.0, 0.55, 0.05, 1],
    count: 40, gravity: [0, -6, 0], size: [0.04, 0.12], life: [0.25, 0.55],
    dir1: [-3, 1, -3], dir2: [3, 4, 3], textureKey: 'spark',
  },
  footprint_blood: {
    color1: [0.55, 0.05, 0.07, 0.95], color2: [0.30, 0.02, 0.03, 0.95],
    count: 8, gravity: [0, 0, 0], size: [0.10, 0.18], life: [4, 6],
    dir1: [0, 0, 0], dir2: [0, 0, 0], textureKey: 'drop',
  },
};

function _drawDrop(ctx) {
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
}
function _drawFire(ctx) {
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.4, 'rgba(255,150,40,0.85)');
  g.addColorStop(1, 'rgba(60,15,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
}
function _drawWood(ctx) {
  ctx.fillStyle = 'rgba(180,130,70,0.95)';
  ctx.fillRect(8, 4, 16, 24);
  ctx.strokeStyle = 'rgba(80,40,10,0.7)';
  ctx.strokeRect(8, 4, 16, 24);
}
function _drawSpark(ctx) {
  ctx.fillStyle = 'rgba(255,240,150,1)';
  ctx.beginPath(); ctx.arc(16, 16, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,220,90,0.65)';
  ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI * 2); ctx.fill();
}
const TEX_DRAWERS = { drop: _drawDrop, fire: _drawFire, wood: _drawWood, spark: _drawSpark };

export class RemoteFx {
  constructor(scene, state) {
    this.scene = scene;
    this.id = state.id;
    this.kind = state.kind;

    const preset = FX_PRESETS[state.kind] || FX_PRESETS.sparks;
    const tex = _getTex(scene, preset.textureKey, TEX_DRAWERS[preset.textureKey] || _drawDrop);

    const ps = new BABYLON.ParticleSystem(`fx_${state.id}`, preset.count, scene);
    ps.particleTexture = tex;
    ps.emitter = new BABYLON.Vector3(state.x || 0, state.y || 0, state.z || 0);
    ps.minEmitBox = new BABYLON.Vector3(-0.1, 0, -0.1);
    ps.maxEmitBox = new BABYLON.Vector3(0.1, 0, 0.1);
    ps.color1 = new BABYLON.Color4(...preset.color1);
    ps.color2 = new BABYLON.Color4(...preset.color2);
    ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    ps.minSize = preset.size[0]; ps.maxSize = preset.size[1];
    ps.minLifeTime = preset.life[0]; ps.maxLifeTime = preset.life[1];
    ps.gravity = new BABYLON.Vector3(...preset.gravity);
    ps.direction1 = new BABYLON.Vector3(...preset.dir1);
    ps.direction2 = new BABYLON.Vector3(...preset.dir2);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.manualEmitCount = preset.count;
    ps.start();
    this.ps = ps;

    // Auto-stop após "emit pulse"
    setTimeout(() => { try { ps.stop(); } catch (_) {} }, 80);
  }

  dispose() {
    try { this.ps?.dispose(); } catch (_) {}
  }
}
