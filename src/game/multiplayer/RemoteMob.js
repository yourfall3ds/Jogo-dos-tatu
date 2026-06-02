// ─────────────────────────────────────────────────────────────────
//  RemoteMob — visual de mob server-authoritative.
//
//  Cliente carrega GLB pelo `state.kind` (que casa com AssetRegistry
//  chibataMob). Interpola posição vinda do schema. HP do schema.
//  Cliente envia 'hit_mob' ao acertar.
// ─────────────────────────────────────────────────────────────────
import { AssetRegistry } from '../data/AssetRegistry.js';

const KIND_TO_ASSET = {
  // chibataMob keys
  cb_zombie: 'zombie',
  cb_skeleton: 'skeleton',
  cb_goblin: 'goblin',
  cb_ghoul: 'ghoul',
  cb_skeletonRogue: 'skeletonRogue',
  cb_orc: 'orc',
  cb_demon: 'demon',
  cb_necromancer: 'necromancer',
};

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _encPath(p) { return p ? p.split('/').map(s => encodeURIComponent(s)).join('/') : p; }

const _containerCache = new Map(); // assetKey → BABYLON.AssetContainer promise

async function _loadContainer(scene, kind) {
  const assetKey = KIND_TO_ASSET[kind] || 'zombie';
  if (_containerCache.has(assetKey)) return _containerCache.get(assetKey);
  const rawPath = AssetRegistry.path('chibataMob', assetKey);
  if (!rawPath) return null;
  const lastSlash = rawPath.lastIndexOf('/');
  const folder = _encPath(rawPath.substring(0, lastSlash + 1));
  const file = _encPath(rawPath.substring(lastSlash + 1));
  const p = BABYLON.SceneLoader.LoadAssetContainerAsync(folder, file, scene)
    .then((c) => { console.log(`[RemoteMob] container "${assetKey}" carregado`); return c; })
    .catch((e) => { console.warn(`[RemoteMob] container "${assetKey}" falhou:`, e.message); return null; });
  _containerCache.set(assetKey, p);
  return p;
}

export class RemoteMob {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.id = state.id;
    this.kind = state.kind;
    this.dead = false;

    this.root = new BABYLON.TransformNode(`mob_${this.id}`, scene);
    this.root.position.set(state.x || 0, state.y || 0, state.z || 0);
    this.root.rotation.y = BABYLON.Tools.ToRadians(state.ry || 0);

    // Placeholder visual antes do GLB carregar (capsule cinza)
    this.placeholder = BABYLON.MeshBuilder.CreateCapsule(`mob_ph_${this.id}`,
      { radius: 0.4, height: 1.6, tessellation: 8 }, scene);
    this.placeholder.parent = this.root;
    this.placeholder.position.y = 0.8;
    const ph = new BABYLON.StandardMaterial(`mob_phmat_${this.id}`, scene);
    ph.diffuseColor = new BABYLON.Color3(0.35, 0.18, 0.18);
    ph.emissiveColor = new BABYLON.Color3(0.12, 0.04, 0.04);
    this.placeholder.material = ph;
    this.placeholder._isRemoteMob = true;
    this.placeholder._mobRef = this;
    this.placeholder.checkCollisions = false;
    this.placeholder.isPickable = true;

    this._loadGlb();

    // Nameplate (label + HP bar)
    this._nameEl = document.createElement('div');
    this._nameEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 75;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      transform: translate(-50%, -100%);
    `;
    this._nameEl.innerHTML = `
      <div style="background:rgba(20,5,5,0.78);padding:1px 7px;border:1px solid #913030;
                  border-radius:8px;font:600 10px 'Segoe UI',monospace;color:#ff9a8a;
                  text-shadow:0 1px 2px rgba(0,0,0,0.9);">
        ${_esc(this.kind.replace(/^cb_/, ''))}
      </div>
      <div style="width:50px;height:4px;background:rgba(0,0,0,0.7);border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,0.7);">
        <div class="mob-hp" style="height:100%;width:100%;background:linear-gradient(90deg,#dd2222,#ff7777);transition:width 0.15s;"></div>
      </div>
    `;
    document.body.appendChild(this._nameEl);
    this._hpBar = this._nameEl.querySelector('.mob-hp');

    // Buffer de interpolação
    this._snapshots = [];
    this.RENDER_LAG_MS = 100;
    this._current = { x: state.x, y: state.y, z: state.z, ry: state.ry };

    // listeners agora vêm via ColyseusClient.on('mob_change')
    this._push();
    this._applyHp(state.hp || 100, state.maxHp || 100);
  }

  onSchemaChange(field) {
    const s = this.state;
    switch (field) {
      case 'pos':
      case 'ry':
        this._push();
        break;
      case 'hp':
        this._applyHp(s.hp, s.maxHp || 100);
        break;
      case 'state':
        this._applyAnim(s.state);
        break;
    }
  }

  async _loadGlb() {
    const container = await _loadContainer(this.scene, this.kind);
    if (!container) return;
    if (this.dead || !this.root || this.root.isDisposed?.()) return;
    const inst = container.instantiateModelsToScene(
      (n) => `mob_${this.id}_${n}`, false, { doNotInstantiate: true }
    );
    if (!inst.rootNodes?.length) return;
    const meshRoot = inst.rootNodes[0];
    meshRoot.parent = this.root;
    // Auto-scale pra altura ~1.6u
    const bb = meshRoot.getHierarchyBoundingVectors(true);
    const size = bb.max.subtract(bb.min);
    const targetH = 1.6;
    const sc = targetH / Math.max(0.1, size.y);
    meshRoot.scaling.setAll(sc);
    meshRoot.position.y = -bb.min.y * sc;
    // Marca mesh principal para hit detection
    meshRoot.getChildMeshes().forEach((m) => {
      m._isRemoteMob = true;
      m._mobRef = this;
      m.isPickable = true;
    });
    this.glbInstance = inst;
    // Esconde placeholder
    if (this.placeholder) this.placeholder.setEnabled(false);
    // Toca anim idle se existir
    const animGroups = inst.animationGroups || [];
    const idle = animGroups.find((a) => /idle/i.test(a.name)) || animGroups[0];
    if (idle) { idle.start(true, 1.0); this._currentAnim = idle; }
    this._animGroups = animGroups;
  }

  _push() {
    this._snapshots.push({
      t: performance.now(),
      x: this.state.x, y: this.state.y, z: this.state.z, ry: this.state.ry,
    });
    while (this._snapshots.length > 8) this._snapshots.shift();
  }

  _applyHp(hp, maxHp) {
    if (!this._hpBar) return;
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    this._hpBar.style.width = pct + '%';
    if (hp <= 0 && !this.dead) {
      this.dead = true;
      try { this.root.rotation.x = -Math.PI / 2; } catch (_) {}
    }
  }

  _applyAnim(animState) {
    if (!this._animGroups?.length) return;
    let want = null;
    if (animState === 'run' || animState === 'walk') {
      want = this._animGroups.find((a) => /run|walk|move/i.test(a.name));
    } else if (animState === 'attack') {
      want = this._animGroups.find((a) => /attack|bite|hit/i.test(a.name));
    } else {
      want = this._animGroups.find((a) => /idle/i.test(a.name));
    }
    if (want && want !== this._currentAnim) {
      try { this._currentAnim?.stop(); } catch (_) {}
      try { want.start(true, 1.0); } catch (_) {}
      this._currentAnim = want;
    }
  }

  update(dt, camera) {
    const renderT = performance.now() - this.RENDER_LAG_MS;
    let target = null;
    if (this._snapshots.length >= 2) {
      let a = null, b = null;
      for (let i = this._snapshots.length - 1; i >= 0; i--) {
        if (this._snapshots[i].t <= renderT) { a = this._snapshots[i]; b = this._snapshots[i + 1] || a; break; }
      }
      if (a && b && b.t > a.t) {
        const f = Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
        let dy = b.ry - a.ry;
        while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        target = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, ry: a.ry + dy * f };
      } else target = this._snapshots[this._snapshots.length - 1];
    } else if (this._snapshots.length === 1) target = this._snapshots[0];

    if (target) {
      const k = Math.min(1, dt * 14);
      this._current.x += (target.x - this._current.x) * k;
      this._current.y += (target.y - this._current.y) * k;
      this._current.z += (target.z - this._current.z) * k;
      let dy = target.ry - this._current.ry;
      while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
      this._current.ry += dy * k;
    }
    this.root.position.set(this._current.x, this._current.y, this._current.z);
    this.root.rotation.y = BABYLON.Tools.ToRadians(this._current.ry);

    if (camera) {
      const wpos = new BABYLON.Vector3(this._current.x, this._current.y + 2.0, this._current.z);
      const eng = this.scene.getEngine();
      const sc = BABYLON.Vector3.Project(wpos, BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(),
        camera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
      if (sc.z > 0 && sc.z < 1) {
        this._nameEl.style.display = 'flex';
        this._nameEl.style.left = sc.x + 'px';
        this._nameEl.style.top = sc.y + 'px';
      } else this._nameEl.style.display = 'none';
    }
  }

  dispose() {
    try { this.placeholder?.dispose(); } catch (_) {}
    try { this.glbInstance?.rootNodes?.forEach((n) => n.dispose()); } catch (_) {}
    try { this.root.dispose(); } catch (_) {}
    if (this._nameEl?.parentElement) this._nameEl.parentElement.removeChild(this._nameEl);
  }
}
