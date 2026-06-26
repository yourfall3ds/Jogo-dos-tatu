import { DEBUG } from '../../utils/debug.js';

const DEFAULT_BABYLON_VERSION = '8.36.0';
const RECAST_CORE_URL = 'https://esm.sh/@recast-navigation/core?bundle';
const RECAST_GENERATORS_URL = 'https://esm.sh/@recast-navigation/generators?bundle';
const NAV_CACHE_KEY = 'transfps_nav_v2_cache';
const NAV_CACHE_VERSION = '2026-06-08-v6-clean-arena-layout';
const CROWD_MAX_AGENTS = 96;

const NAV_PARAMS = {
  cs: 0.25,
  ch: 0.2,
  walkableSlopeAngle: 45,
  walkableHeight: 2,
  walkableClimb: 0.5,
  walkableRadius: 0.8,
  maxEdgeLen: 12,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
  borderSize: 1,
  tileSize: 12,
  maxObstacles: 512,
  expectedLayersPerTile: 4,
  keepIntermediates: false,
};

const NAV_QUERY_OPTIONS = {
  halfExtents: { x: 2, y: 4, z: 2 },
};

function getNavBuildProfiles() {
  return [
    {
      // Baseline igual ao exemplo minimo do Roland:
      // primeiro faz o V2 simplesmente nascer com createNavMeshAsync.
      label: 'baseline-minimal',
      params: {
        cs: 0.05,
        ch: 0.2,
      },
    },
    {
      label: 'full-v2',
      params: { ...NAV_PARAMS },
    },
    {
      // Perfil alinhado com os exemplos da doc do Nav2/TileCache.
      label: 'doc-safe',
      params: {
        cs: 0.1,
        ch: 0.05,
        walkableSlopeAngle: 45,
        walkableHeight: 2,
        walkableClimb: 0.5,
        walkableRadius: Math.ceil((NAV_PARAMS.walkableRadius || 0.8) / 0.1),
        maxEdgeLen: 12,
        maxSimplificationError: 1.3,
        minRegionArea: 8,
        mergeRegionArea: 20,
        maxVertsPerPoly: 6,
        detailSampleDist: 6,
        detailSampleMaxError: 1,
        tileSize: 32,
        maxObstacles: NAV_PARAMS.maxObstacles || 128,
        expectedLayersPerTile: 4,
        keepIntermediates: false,
      },
    },
    {
      // Fallback extremo: só o essencial para a nav nascer.
      label: 'minimal-tilecache',
      params: {
        cs: 0.1,
        ch: 0.05,
        tileSize: 32,
        maxObstacles: NAV_PARAMS.maxObstacles || 128,
        keepIntermediates: false,
      },
    },
  ];
}

let navFactoryPromise = null;

function normalizeBabylonVersion(version) {
  const match = /(\d+\.\d+\.\d+)/.exec(String(version || ''));
  return match?.[1] || DEFAULT_BABYLON_VERSION;
}

function getBabylonVersion() {
  return normalizeBabylonVersion(globalThis.BABYLON?.Engine?.Version);
}

function getNavigationFactoryUrl(version = getBabylonVersion()) {
  return `https://esm.sh/@babylonjs/addons@${version}/navigation/factory?bundle`;
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function uint8ToBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function base64ToUint8Array(base64) {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function scheduleIdle(callback, delay = 0) {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(callback, { timeout: Math.max(250, delay) });
  }
  return setTimeout(callback, delay);
}

async function loadNavigationFactory() {
  if (!navFactoryPromise) {
    navFactoryPromise = (async () => {
      const babylonVersion = getBabylonVersion();
      const [mod, recastCore, recastGenerators] = await Promise.all([
        import(getNavigationFactoryUrl(babylonVersion)),
        import(RECAST_CORE_URL),
        import(RECAST_GENERATORS_URL),
      ]);

      // FIX init: recastCore e recastGenerators são bundles CDN SEPARADOS,
      //  cada um com sua própria instância WASM. Antes só o core era init →
      //  quando o generator rodava, batia em recast não inicializado:
      //  '"init" must be called before using any recast-navigation-js APIs'.
      //  Agora inicializamos AMBOS (e toleramos se um deles não expõe init).
      if (typeof recastCore.init === 'function') {
        await recastCore.init();
      }
      if (recastGenerators && typeof recastGenerators.init === 'function'
          && recastGenerators.init !== recastCore.init) {
        try { await recastGenerators.init(); } catch (_) {}
      }

      if (typeof mod.CreateNavigationPluginAsync === 'function') {
        const recastInstance = {
          ...recastCore,
          ...recastGenerators,
        };
        delete recastInstance.default;

        return {
          CreateNavigationPluginAsync: mod.CreateNavigationPluginAsync,
          WaitForFullTileCacheUpdate: typeof mod.WaitForFullTileCacheUpdate === 'function'
            ? mod.WaitForFullTileCacheUpdate
            : null,
          recastInstance,
          babylonVersion,
        };
      }
      throw new Error('CreateNavigationPluginAsync nao encontrado');
    })();
  }
  return navFactoryPromise;
}

export class NavMeshManager {
  constructor(scene) {
    this.scene = scene;
    this.plugin = null;
    this.ready = false;
    this.obstacles = [];
    this.walkables = [];
    this.debugEnabled = false;

    this._crowd = null;
    this._navMesh = null;
    this._tileCache = null;
    this._navMeshQuery = null;
    this._waitForFullTileCacheUpdate = null;
    this._dirty = false;
    this._dynamicDirty = false;
    this._debounceT = 0;
    this._building = false;
    this._buildPromise = null;
    this._buildScheduled = false;
    this._lastBuildMs = 0;
    this._baseSignature = null;
    this._staticMeshes = [];
    this._dynamicObstacles = new Map();
    this._crowdAgents = new Map();
    this._dynamicRevision = 0;
    this._usedV2 = false;
    this._cacheRestored = false;
    this._activeBuildProfile = null;
    this._buildFailStreak = 0;
    this._buildBlockedUntil = 0;
    this._navRuntimeMode = 'unknown';
    this._debugNavMesh = null;
    this._debugObstacleMeshes = new Map();

    this.DEBOUNCE = 0.2;
  }

  setDebugEnabled(enabled = true) {
    this.debugEnabled = enabled === true;
    if (!this.debugEnabled) {
      this._disposeDebugMeshes();
      return;
    }
    this._updateDebugVisuals();
  }

  _disposeDebugMeshes() {
    try { this._debugNavMesh?.dispose?.(); } catch (_) {}
    this._debugNavMesh = null;
    for (const mesh of this._debugObstacleMeshes.values()) {
      try { mesh?.dispose?.(); } catch (_) {}
    }
    this._debugObstacleMeshes.clear();
  }

  _syncDebugObstacleMeshes() {
    if (!this.debugEnabled) return;
    const active = new Set();
    for (const [key, entry] of this._dynamicObstacles.entries()) {
      const snapshot = entry?.snapshot;
      if (!snapshot) continue;
      active.add(key);
      let mesh = this._debugObstacleMeshes.get(key);
      if (!mesh || mesh.isDisposed?.()) {
        mesh = BABYLON.MeshBuilder.CreateBox(`navDbgObstacle_${key}`, {
          width: Math.max(0.1, snapshot.extent.x * 2),
          height: Math.max(0.1, snapshot.extent.y * 2),
          depth: Math.max(0.1, snapshot.extent.z * 2),
        }, this.scene);
        const mat = new BABYLON.StandardMaterial(`navDbgObstacleMat_${key}`, this.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0.55, 0.1);
        mat.emissiveColor = new BABYLON.Color3(1, 0.45, 0.1);
        mat.alpha = 0.1;
        mat.wireframe = true;
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        this._debugObstacleMeshes.set(key, mesh);
      }
      mesh.position.copyFrom(snapshot.center);
      mesh.rotation.set(0, snapshot.angle || 0, 0);
      mesh.isVisible = true;
    }
    for (const [key, mesh] of this._debugObstacleMeshes.entries()) {
      if (active.has(key)) continue;
      try { mesh?.dispose?.(); } catch (_) {}
      this._debugObstacleMeshes.delete(key);
    }
  }

  _updateDebugVisuals() {
    if (!this.debugEnabled) return;
    this._syncDebugObstacleMeshes();
    if (!this.ready || !this.plugin) return;
    if (this._debugNavMesh?.isDisposed?.()) this._debugNavMesh = null;
    if (!this._debugNavMesh) {
      try {
        this._debugNavMesh = this.plugin.createDebugNavMesh?.(this.scene) || null;
      } catch (_) {
        this._debugNavMesh = null;
      }
      if (this._debugNavMesh) {
        this._debugNavMesh.isPickable = false;
        this._debugNavMesh.alwaysSelectAsActiveMesh = true;
        if (this._debugNavMesh.material) {
          this._debugNavMesh.material.wireframe = true;
          this._debugNavMesh.material.alpha = 0.28;
        }
      }
    }
  }

  async init() {
    try {
      const addons = await loadNavigationFactory();
      this._waitForFullTileCacheUpdate = addons.WaitForFullTileCacheUpdate || null;
      try {
        this.plugin = await addons.CreateNavigationPluginAsync({
          version: addons.babylonVersion,
          instance: addons.recastInstance,
        });
        this._navRuntimeMode = 'injected-instance';
      } catch (injectErr) {
        DEBUG.warn('[NavMesh] falha ao iniciar com instance injetada, tentando fallback padrao', injectErr);
        this.plugin = await addons.CreateNavigationPluginAsync({
          version: addons.babylonVersion,
        });
        this._navRuntimeMode = 'factory-fallback';
      }
      this._usedV2 = true;
      try {
        this.plugin.setDefaultQueryExtent?.(new BABYLON.Vector3(2, 4, 2));
      } catch (_) {}

      const baseMeshes = this._collectBaseMeshes();
      this._staticMeshes = baseMeshes;
      this._baseSignature = this._makeBaseSignature(baseMeshes);
      this._refreshCollisionLists(baseMeshes);
      this._updateDebugVisuals();

      if (this._restoreCache(this._baseSignature)) {
        this.ready = true;
        this._cacheRestored = true;
        this._ensureCrowd();
        this._syncCrowdAgentsToNav();
        this._dynamicDirty = true;
        this._updateDebugVisuals();
        DEBUG.log('[NavMesh] V2 restaurada do cache');
      } else {
        DEBUG.log('[NavMesh] V2 pronta; bake em background agendado');
      }

      this._scheduleBuild(600);
      return true;
    } catch (e) {
      console.warn('[NavMesh] V2 falhou:', e?.message || e, '— IA usa fallback (linha reta)');
      this.plugin = null;
      this.ready = false;
      return false;
    }
  }

  markDirty() {
    this._dirty = true;
    this._dynamicDirty = true;
    this._debounceT = this.DEBOUNCE;
    if (!this.ready) this._scheduleBuild(150);
  }

  markDynamicDirty() {
    this._dynamicDirty = true;
    this._debounceT = this.DEBOUNCE;
  }

  update(dt) {
    const now = performance.now();
    if (this._crowd?.update) {
      try { this._crowd.update(dt); } catch (_) {}
    }
    if (!this.plugin) return;

    if (!this.ready && !this._building && now >= this._buildBlockedUntil && this._hasActiveConsumers()) {
      this._scheduleBuild(50);
    }

    if (!this._dynamicDirty && !this._dirty) return;
    if (window._buildMode?._state === 'placing') {
      this._debounceT = this.DEBOUNCE;
      return;
    }

    this._debounceT -= dt;
    if (this._debounceT > 0) return;

    if (this.ready && this.plugin.tileCache && this._dynamicDirty) {
      this._dynamicDirty = false;
      Promise.resolve().then(() => this._syncDynamicObstacles());
      return;
    }

    if (!this._building) {
      this._dirty = false;
      this._scheduleBuild(0);
    }
  }

  async rebuild() {
    return this._buildBaseNavMesh({ force: true });
  }

  closest(pos) {
    if (!this.ready || !this.plugin) return pos;
    try {
      return this._toBjsVec(this.plugin.getClosestPoint(pos, NAV_QUERY_OPTIONS)) || pos;
    } catch (_) {
      return pos;
    }
  }

  raycast(from, to) {
    if (!this.ready || !this.plugin || typeof this.plugin.raycast !== 'function') {
      return { hit: false, hitPoint: null, source: 'unavailable' };
    }
    try {
      const start = this.closest(from);
      const end = this.closest(to);
      const result = this.plugin.raycast(start, end, NAV_QUERY_OPTIONS) || null;
      return {
        hit: result?.hit === true,
        hitPoint: this._toBjsVec(result?.hitPoint) || null,
        start,
        end,
        source: 'plugin',
      };
    } catch (_) {
      return { hit: false, hitPoint: null, source: 'error' };
    }
  }

  _computePathPoints(from, to) {
    if (!this.ready || !this.plugin) return [];
    try {
      const start = this.closest(from);
      const end = this.closest(to);
      let path = [];
      if (typeof this.plugin.computePathSmooth === 'function') {
        path = this.plugin.computePathSmooth(start, end, NAV_QUERY_OPTIONS) || [];
      }
      if (!path.length) {
        path = this.plugin.computePath(start, end, NAV_QUERY_OPTIONS) || [];
      }
      path = path.map((p) => this._toBjsVec(p)).filter(Boolean);
      return path;
    } catch (_) {
      return [];
    }
  }

  getDebugPathData(from, to) {
    const ray = this.raycast(from, to);
    const start = ray.start || this.closest(from);
    const end = ray.end || this.closest(to);
    const path = this._computePathPoints(start, end);
    return {
      start,
      end,
      path,
      ray,
    };
  }

  hasObstacleBetween(a, b, y = 0.9) {
    const obs = this.obstacles;
    if (!obs || !obs.length) return false;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) return false;

    const dir = new BABYLON.Vector3(dx / dist, 0, dz / dist);
    const origin = new BABYLON.Vector3(a.x, (a.y || 0) + y, a.z);
    const ray = new BABYLON.Ray(origin, dir, dist);

    for (const mesh of obs) {
      if (!mesh || mesh.isDisposed?.()) continue;
      const sphere = mesh.getBoundingInfo?.().boundingSphere;
      if (sphere) {
        const radius = sphere.radiusWorld + 1;
        const t = Math.max(0, Math.min(dist, (sphere.centerWorld.x - a.x) * dir.x + (sphere.centerWorld.z - a.z) * dir.z));
        const px = a.x + dir.x * t;
        const pz = a.z + dir.z * t;
        const dd = (sphere.centerWorld.x - px) ** 2 + (sphere.centerWorld.z - pz) ** 2;
        if (dd > radius * radius) continue;
      }
      const pick = ray.intersectsMesh(mesh);
      if (pick?.hit && pick.distance < dist) return true;
    }
    return false;
  }

  nextStep(from, to) {
    if (!this.ready || !this.plugin) return null;
    try {
      const debugData = this.getDebugPathData(from, to);
      const navRay = debugData.ray;
      const start = debugData.start;
      const end = debugData.end;
      const path = debugData.path;
      if (path.length < 2) {
        const directSight = navRay.source === 'plugin'
          ? navRay.hit !== true
          : !this.hasObstacleBetween(from, to);
        return directSight ? end : null;
      }

      let best = null;
      for (let i = 1; i < path.length; i++) {
        const point = path[i];
        if (!this.hasObstacleBetween(from, point)) best = point;
        else break;
      }
      if (best) {
        const dx = best.x - from.x;
        const dz = best.z - from.z;
        if (dx * dx + dz * dz > 0.25) return best;
      }

      for (let i = 1; i < path.length; i++) {
        const point = path[i];
        const dx = point.x - from.x;
        const dz = point.z - from.z;
        if (dx * dx + dz * dz > 0.25) return point;
      }
      return path[path.length - 1] || end;
    } catch (_) {
      return null;
    }
  }

  registerCrowdAgent(owner, position, parameters = {}) {
    if (!owner || !this.ready || !this._crowd || !this.plugin) return null;
    let entry = this._crowdAgents.get(owner);
    const start = this.closest(position || owner.root?.position || BABYLON.Vector3.Zero());
    if (!start) return null;
    if (entry?.index != null) {
      this.syncCrowdAgent(owner, start, { force: true });
      return entry;
    }

    const node = new BABYLON.TransformNode(`navAgent_${owner.id || owner.root?.name || this._crowdAgents.size}`, this.scene);
    node.position.copyFrom(start);
    node.setEnabled(false);

    const agentParams = {
      radius: parameters.radius ?? 0.45,
      height: parameters.height ?? 1.8,
      maxAcceleration: parameters.maxAcceleration ?? 8,
      maxSpeed: parameters.maxSpeed ?? 2.5,
      collisionQueryRange: parameters.collisionQueryRange ?? 3.5,
      pathOptimizationRange: parameters.pathOptimizationRange ?? 8,
      separationWeight: parameters.separationWeight ?? 1.2,
      reachRadius: parameters.reachRadius ?? Math.max(0.35, (parameters.radius ?? 0.45) * 1.4),
    };

    let index = null;
    try {
      index = this._crowd.addAgent(start, agentParams, node);
    } catch (e) {
      console.warn('[NavMesh] addAgent falhou:', e?.message || e);
      try { node.dispose(); } catch (_) {}
      return null;
    }

    entry = {
      owner,
      node,
      index,
      parameters: agentParams,
      target: null,
      path: [],
      targetStamp: '',
      lastSyncPos: start.clone(),
      lastSyncAt: performance.now(),
      navRevision: this._dynamicRevision,
    };
    this._crowdAgents.set(owner, entry);
    return entry;
  }

  unregisterCrowdAgent(owner) {
    const entry = this._crowdAgents.get(owner);
    if (!entry) return;
    try { this._crowd?.removeAgent?.(entry.index); } catch (_) {}
    try { entry.node?.dispose?.(); } catch (_) {}
    this._crowdAgents.delete(owner);
  }

  syncCrowdAgent(owner, worldPos, { force = false, snapDistance = 1.35 } = {}) {
    const entry = this._crowdAgents.get(owner);
    if (!entry || !this._crowd || !this.plugin) return false;
    const targetPos = this.closest(worldPos || owner?.root?.position || entry.node?.position);
    if (!targetPos) return false;

    const agentPos = this._toBjsVec(this._crowd.getAgentPosition?.(entry.index)) || entry.node?.position;
    const dist = agentPos ? BABYLON.Vector3.Distance(agentPos, targetPos) : Infinity;
    if (!force && dist < snapDistance) return false;

    try {
      this._crowd.agentTeleport(entry.index, targetPos);
      entry.lastSyncPos = targetPos.clone();
      entry.lastSyncAt = performance.now();
      if (entry.target) {
        this._crowd.agentGoto(entry.index, entry.target);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  updateCrowdAgent(owner, targetPos, options = {}) {
    if (!owner || !targetPos || !this.ready || !this._crowd || !this.plugin) return null;
    const entry = this.registerCrowdAgent(owner, owner.root?.position, options.parameters);
    if (!entry) return null;

    const now = performance.now();
    const desired = this.closest(targetPos);
    if (!desired) return null;
    const stamp = `${desired.x.toFixed(2)}:${desired.y.toFixed(2)}:${desired.z.toFixed(2)}:${this._dynamicRevision}`;
    const minRetargetMs = options.minRetargetMs ?? 180;
    const needsPathRefresh = options.force === true
      || entry.targetStamp !== stamp
      || entry.navRevision !== this._dynamicRevision
      || !entry.path?.length;

    if (needsPathRefresh) {
      entry.path = this._computePathPoints(owner.root?.position || entry.node?.position, desired);
    }

    if ((options.force === true || entry.targetStamp !== stamp) && (!entry._lastGotoAt || now - entry._lastGotoAt >= minRetargetMs)) {
      try {
        this._crowd.agentGoto(entry.index, desired);
        entry.target = desired.clone();
        entry.targetStamp = stamp;
        entry._lastGotoAt = now;
        entry.navRevision = this._dynamicRevision;
      } catch (_) {}
    }

    if (options.syncPosition !== false) {
      this.syncCrowdAgent(owner, owner.root?.position, {
        force: options.forceSync === true,
        snapDistance: options.snapDistance ?? 1.5,
      });
    }
    return this.getCrowdAgentState(owner);
  }

  getCrowdAgentState(owner) {
    const entry = this._crowdAgents.get(owner);
    if (!entry || !this._crowd) return null;
    const position = this._toBjsVec(this._crowd.getAgentPosition?.(entry.index)) || entry.node?.position?.clone?.() || null;
    const velocity = this._toBjsVec(this._crowd.getAgentVelocity?.(entry.index)) || BABYLON.Vector3.Zero();
    const crowdCorner = this._toBjsVec(this._crowd.getAgentNextTargetPath?.(entry.index)) || null;
    const nextCorner = crowdCorner || entry.path?.find?.((point) => {
      if (!position || !point) return false;
      const dx = point.x - position.x;
      const dz = point.z - position.z;
      return (dx * dx + dz * dz) > 0.08;
    }) || null;
    return {
      index: entry.index,
      position,
      velocity,
      nextCorner,
      target: entry.target?.clone?.() || null,
      path: (entry.path || []).map((point) => point.clone?.() || point),
      navRevision: entry.navRevision,
    };
  }

  _syncCrowdAgentsToNav() {
    if (!this._crowd) return;
    for (const [owner, entry] of this._crowdAgents.entries()) {
      if (!owner?.root || owner._state === 'DEAD' || owner.alive === false) {
        this.unregisterCrowdAgent(owner);
        continue;
      }
      this.syncCrowdAgent(owner, owner.root.position, { force: true, snapDistance: 0 });
      if (entry.target) {
        try { this._crowd.agentGoto(entry.index, entry.target); } catch (_) {}
      }
    }
  }

  async _buildBaseNavMesh({ force = false } = {}) {
    if (!this.plugin) return false;
    if (this._buildPromise) return this._buildPromise;
    if (!force && performance.now() < this._buildBlockedUntil) return false;

    this._buildPromise = (async () => {
      this._building = true;
      this._buildScheduled = false;
      const baseMeshes = this._collectBaseMeshes();
      this._staticMeshes = baseMeshes;
      this._baseSignature = this._makeBaseSignature(baseMeshes);
      this._refreshCollisionLists(baseMeshes);

      if (!baseMeshes.length) {
        this._building = false;
        this._buildPromise = null;
        return false;
      }

      if (!force && this.ready && this._cacheRestored) {
        this._building = false;
        this._buildPromise = null;
        return true;
      }

      const { navInput, temps } = this._prepareNavInput(baseMeshes);
      if (!navInput.length) {
        temps.forEach((mesh) => { try { mesh.dispose(); } catch (_) {} });
        this._building = false;
        this._buildPromise = null;
        return false;
      }

      const profiles = getNavBuildProfiles();
      let lastError = null;
      let success = false;
      const t0 = performance.now();
      for (const profile of profiles) {
        try {
          const result = await this.plugin.createNavMeshAsync(navInput, profile.params);
          this._navMesh = result?.navMesh || this.plugin.navMesh || this._navMesh;
          this._tileCache = result?.tileCache || this.plugin.tileCache || this._tileCache;
          this._navMeshQuery = result?.navMeshQuery || this.plugin.navMeshQuery || this._navMeshQuery;
          this._activeBuildProfile = profile.label;
          success = true;
          break;
        } catch (e) {
          lastError = e;
        }
      }

      try {
        if (!success) throw lastError || new Error('nav build falhou em todos os perfis');
        this._lastBuildMs = +(performance.now() - t0).toFixed(1);
        this.ready = true;
        this._cacheRestored = false;
        this._dirty = false;
        this._dynamicDirty = true;
        this._buildFailStreak = 0;
        this._buildBlockedUntil = 0;
        this._ensureCrowd();
        this._syncCrowdAgentsToNav();
        this._saveCache(this._baseSignature);
        this._refreshCollisionLists(baseMeshes);
        this._updateDebugVisuals();
        if (typeof window !== 'undefined' && window._dbg) {
          window._dbg(
            `navmesh v2: ${this._lastBuildMs.toFixed(0)}ms (${navInput.length} meshes)`,
            this._lastBuildMs > 1200 ? '#ff5050' : '#9fe'
          );
        }
        DEBUG.log('[NavMesh] V2 pronta', `${this._lastBuildMs}ms`, this._activeBuildProfile || 'unknown-profile');
      } catch (e) {
        this._buildFailStreak += 1;
        this._buildBlockedUntil = performance.now() + Math.min(15000, 1200 * this._buildFailStreak);
        console.warn('[NavMesh] build V2 falhou:', e?.message || e);
      } finally {
        temps.forEach((mesh) => { try { mesh.dispose(); } catch (_) {} });
        this._building = false;
        this._buildPromise = null;
      }

      if (this.ready) await this._syncDynamicObstacles();
      return this.ready;
    })();

    return this._buildPromise;
  }

  _scheduleBuild(delay = 0) {
    if (this._buildScheduled || this._building || !this.plugin) return;
    this._buildScheduled = true;
    scheduleIdle(() => {
      if (!this.plugin) return;
      this._buildBaseNavMesh();
    }, delay);
  }

  _ensureCrowd() {
    if (!this.plugin || this._crowd || typeof this.plugin.createCrowd !== 'function') return;
    try {
      this._crowd = this.plugin.createCrowd(CROWD_MAX_AGENTS, NAV_PARAMS.walkableRadius || 1, this.scene);
    } catch (e) {
      console.warn('[NavMesh] crowd auxiliar falhou:', e?.message || e);
    }
  }

  _collectBaseMeshes() {
    const out = [];
    for (const mesh of this.scene.meshes) {
      if (!mesh || mesh.isDisposed?.() || (mesh.getTotalVertices?.() || 0) === 0) continue;
      if (mesh.billboardMode || mesh._isPlaceholder) continue;
      if (this._isIgnoredMesh(mesh)) continue;
      if (this._isDynamicPlacementMesh(mesh)) continue;
      const isSurface = this._isNavSurfaceMesh(mesh);
      const isSolid = this._isSolidMesh(mesh);
      if (!isSurface && !isSolid) continue;
      out.push(mesh);
    }
    return out;
  }

  _isNavSurfaceMesh(mesh) {
    const name = [
      mesh.name || '',
      mesh.parent?.name || '',
      mesh.parent?.parent?.name || '',
    ].join(' ').toLowerCase();
    if (/ground|chao|floor|piso|terrain|platform|plataforma|ramp|slope|stairs?|escada|bridge|ponte|walkway|path|road|arena/i.test(name)) {
      return true;
    }
    let node = mesh;
    while (node) {
      if (node._isGround || node._isTerrain || node._navSurface) return true;
      node = node.parent;
    }
    return false;
  }

  _isIgnoredMesh(mesh) {
    const name = (mesh.name || '').toLowerCase();
    if (/^(drop_|hit|tracer|muzzle|spark|trail|lbl|dmg|gun|weapon|hitbox)/i.test(name)) return true;
    if (/imgplane|_glow|_beam|aim|crosshair|_hp|shadow/i.test(name)) return true;
    let node = mesh;
    while (node) {
      if (node._enemyRef) return true;
      node = node.parent;
    }
    return false;
  }

  _isDynamicPlacementMesh(mesh) {
    const names = [
      mesh.name || '',
      mesh.parent?.name || '',
      mesh.parent?.parent?.name || '',
    ].join(' ').toLowerCase();
    if (/^(placed_|mac_|_ghost|_gf_|_gfm|_gfbm)/.test(mesh.name || '')) return true;
    if (/placed_|mac_|_ghost/.test(names)) return true;
    let node = mesh;
    while (node) {
      if (node._pieceBodies || node._placedEntry || node._worldId) return true;
      node = node.parent;
    }
    return false;
  }

  _isSolidMesh(mesh) {
    const name = (mesh.name || '').toLowerCase();
    let solid = /ground|chao|floor|piso|terrain|plataforma|platform|stair|escada|wall|muro|parede|tower|build|crate|barrel|caixa|container|cube|wood|madeira|tijolo|brick|ramp|slope/i.test(name);
    if (!solid) {
      let node = mesh;
      while (node && !solid) {
        if (node._isBoxCol || node._colliderOptimized || node.checkCollisions || node._staticBody) solid = true;
        else if (node._gameObject && node._gameObject.collidable !== false) solid = true;
        node = node.parent;
      }
    }
    return solid;
  }

  _prepareNavInput(meshes) {
    const navInput = [];
    const temps = [];
    for (const mesh of meshes) {
      const verts = mesh.getTotalVertices?.() || 0;
      if (this._shouldProxyMeshForNav(mesh, verts)) {
        const proxy = this._navProxyBox(mesh);
        if (proxy) {
          navInput.push(proxy);
          temps.push(proxy);
        }
      } else {
        navInput.push(mesh);
      }
    }
    if (navInput.length <= 1) {
      return { navInput, temps };
    }

    try {
      const clones = [];
      for (const mesh of navInput) {
        if (!mesh || mesh.isDisposed?.()) continue;
        const clone = mesh.clone?.(`_navsrc_${mesh.uniqueId || mesh.name || clones.length}`, null, false);
        if (!clone) continue;
        clone.parent = null;
        clone.material = null;
        clone.isVisible = false;
        clone.isPickable = false;
        clone.computeWorldMatrix?.(true);
        clone.bakeCurrentTransformIntoVertices?.();
        clone.position.setAll?.(0);
        clone.rotation.setAll?.(0);
        clone.scaling.setAll?.(1);
        clone.rotationQuaternion = null;
        clones.push(clone);
      }

      const merged = clones.length > 1
        ? BABYLON.Mesh.MergeMeshes(clones, true, true, undefined, false, true)
        : clones[0] || null;

      if (merged) {
        merged.name = '_nav_static_merged';
        merged.isVisible = false;
        merged.isPickable = false;
        temps.push(merged);
        return { navInput: [merged], temps };
      }
    } catch (_) {}

    return { navInput, temps };
  }

  _shouldProxyMeshForNav(mesh, verts = 0) {
    if (!mesh || mesh._isBoxCol) return false;
    const name = [
      mesh.name || '',
      mesh.parent?.name || '',
      mesh.parent?.parent?.name || '',
    ].join(' ').toLowerCase();
    if (/stairs?|escada|ramp|slope|ladder/.test(name)) return verts > 6000;
    if (/ground|chao|floor|piso|terrain/.test(name)) return verts > 12000;
    return verts > 8000;
  }

  _navProxyBox(mesh) {
    try {
      mesh.computeWorldMatrix(true);
      const bb = mesh.getBoundingInfo().boundingBox;
      const min = bb.minimumWorld;
      const max = bb.maximumWorld;
      const size = max.subtract(min);
      const box = BABYLON.MeshBuilder.CreateBox('_navproxy', {
        width: Math.max(0.1, size.x),
        height: Math.max(0.1, size.y),
        depth: Math.max(0.1, size.z),
      }, this.scene);
      box.position.copyFrom(min.add(max).scale(0.5));
      box.isVisible = false;
      box.isPickable = false;
      return box;
    } catch (_) {
      return null;
    }
  }

  _makeBaseSignature(meshes) {
    const parts = meshes.map((mesh) => {
      mesh.computeWorldMatrix?.(true);
      const bb = mesh.getBoundingInfo?.()?.boundingBox;
      const min = bb?.minimumWorld;
      const max = bb?.maximumWorld;
      return [
        mesh.name || '',
        mesh.getTotalVertices?.() || 0,
        min ? min.x.toFixed(2) : 0,
        min ? min.y.toFixed(2) : 0,
        min ? min.z.toFixed(2) : 0,
        max ? max.x.toFixed(2) : 0,
        max ? max.y.toFixed(2) : 0,
        max ? max.z.toFixed(2) : 0,
      ].join(':');
    });
    return `${NAV_CACHE_VERSION}:${hashString(parts.join('|'))}`;
  }

  _saveCache(signature) {
    if (!this.plugin || !signature) return;
    try {
      const payload = { version: NAV_CACHE_VERSION, signature, savedAt: Date.now() };
      if (this.plugin.tileCache && typeof this.plugin.getTileCacheData === 'function') {
        payload.kind = 'tilecache';
        payload.data = uint8ToBase64(this.plugin.getTileCacheData());
      } else if (typeof this.plugin.getNavmeshData === 'function') {
        payload.kind = 'navmesh';
        payload.data = uint8ToBase64(this.plugin.getNavmeshData());
      } else {
        return;
      }
      localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[NavMesh] cache save falhou:', e?.message || e);
    }
  }

  _restoreCache(signature) {
    if (!this.plugin || !signature) return false;
    try {
      const raw = localStorage.getItem(NAV_CACHE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload || payload.version !== NAV_CACHE_VERSION || payload.signature !== signature || !payload.data) return false;
      const bytes = base64ToUint8Array(payload.data);
      if (payload.kind === 'tilecache' && typeof this.plugin.buildFromTileCacheData === 'function') {
        this.plugin.buildFromTileCacheData(bytes);
      } else if (payload.kind === 'navmesh' && typeof this.plugin.buildFromNavmeshData === 'function') {
        this.plugin.buildFromNavmeshData(bytes);
      } else {
        return false;
      }
      this._navMesh = this.plugin.navMesh || this._navMesh;
      this._tileCache = this.plugin.tileCache || this._tileCache;
      this._navMeshQuery = this.plugin.navMeshQuery || this._navMeshQuery;
      return true;
    } catch (e) {
      console.warn('[NavMesh] cache restore falhou:', e?.message || e);
      return false;
    }
  }

  async _syncDynamicObstacles() {
    const tileCache = this._tileCache || this.plugin?.tileCache;
    if (!tileCache) {
      this._refreshCollisionLists(this._staticMeshes);
      return false;
    }

    const roots = this._collectDynamicRoots();
    const seen = new Set();

    for (const root of roots) {
      const key = this._rootKey(root);
      seen.add(key);
      const snapshot = this._makeObstacleSnapshot(root);
      if (!snapshot) continue;

      const current = this._dynamicObstacles.get(key);
      if (current && current.signature === snapshot.signature) continue;

      if (current?.handle) {
        try { this.plugin.removeObstacle?.(current.handle); } catch (_) {}
      }

      const handle = this.plugin.addBoxObstacle?.(
        snapshot.center,
        snapshot.extent,
        snapshot.angle,
        true
      ) || null;

      this._dynamicObstacles.set(key, {
        root,
        handle,
        snapshot,
        signature: snapshot.signature,
      });
      this._dynamicRevision++;
    }

    for (const [key, entry] of [...this._dynamicObstacles.entries()]) {
      if (seen.has(key)) continue;
      try { this.plugin.removeObstacle?.(entry.handle); } catch (_) {}
      this._dynamicObstacles.delete(key);
      this._dynamicRevision++;
    }

    this._refreshCollisionLists(this._staticMeshes);
    this._syncDebugObstacleMeshes();
    if (this._waitForFullTileCacheUpdate && this._navMesh && tileCache) {
      try {
        await this._waitForFullTileCacheUpdate(this._navMesh, tileCache);
      } catch (_) {}
    }
    this._syncCrowdAgentsToNav();
    return true;
  }

  _collectDynamicRoots() {
    const placed = window._buildMode?._placed;
    if (!Array.isArray(placed)) return [];
    const out = [];
    for (const entry of placed) {
      const root = entry?.root;
      if (!root || root.isDisposed?.()) continue;
      if (!this._rootHasCollider(root)) continue;
      out.push(root);
    }
    return out;
  }

  _rootHasCollider(root) {
    if (!root) return false;
    if (root._pieceBodies?.length || root._staticBody || root.checkCollisions) return true;
    const meshes = root.getChildMeshes?.(false) || [];
    return meshes.some((mesh) => mesh._isBoxCol || mesh.checkCollisions || mesh._staticBody || mesh._colliderOptimized);
  }

  _rootKey(root) {
    return String(root.uniqueId || root.id || root.name || Math.random());
  }

  _makeObstacleSnapshot(root) {
    try {
      root.computeWorldMatrix?.(true);
      const angle = root.rotationQuaternion?.toEulerAngles?.().y ?? root.rotation?.y ?? 0;
      const rootPos = root.getAbsolutePosition?.() || root.position?.clone?.() || BABYLON.Vector3.Zero();
      const rotInv = BABYLON.Matrix.RotationY(-angle);
      const rotFwd = BABYLON.Matrix.RotationY(angle);
      let min = null;
      let max = null;
      const meshes = root.getChildMeshes?.(false) || [];
      for (const mesh of meshes) {
        if (!mesh || mesh.isDisposed?.() || (mesh.getTotalVertices?.() || 0) === 0) continue;
        mesh.computeWorldMatrix?.(true);
        const corners = mesh.getBoundingInfo?.()?.boundingBox?.vectorsWorld || [];
        for (const corner of corners) {
          const local = BABYLON.Vector3.TransformCoordinates(corner.subtract(rootPos), rotInv);
          if (!min) {
            min = local.clone();
            max = local.clone();
          } else {
            min = BABYLON.Vector3.Minimize(min, local);
            max = BABYLON.Vector3.Maximize(max, local);
          }
        }
      }
      if (!min || !max) {
        const bb = root.getHierarchyBoundingVectors?.(true);
        if (!bb?.min || !bb?.max) return null;
        min = BABYLON.Vector3.TransformCoordinates(bb.min.subtract(rootPos), rotInv);
        max = BABYLON.Vector3.TransformCoordinates(bb.max.subtract(rootPos), rotInv);
      }
      const size = max.subtract(min);
      const localCenter = min.add(max).scale(0.5);
      const center = rootPos.add(BABYLON.Vector3.TransformCoordinates(localCenter, rotFwd));
      const extent = new BABYLON.Vector3(
        Math.max(0.15, size.x * 0.5 + 0.05),
        Math.max(0.15, size.y * 0.5 + 0.05),
        Math.max(0.15, size.z * 0.5 + 0.05),
      );
      const signature = [
        center.x.toFixed(2),
        center.y.toFixed(2),
        center.z.toFixed(2),
        extent.x.toFixed(2),
        extent.y.toFixed(2),
        extent.z.toFixed(2),
        angle.toFixed(3),
      ].join(':');
      return { center, extent, angle, signature };
    } catch (_) {
      return null;
    }
  }

  _refreshCollisionLists(baseMeshes = []) {
    const unique = new Set();
    const pushMesh = (mesh, list) => {
      if (!mesh || mesh.isDisposed?.()) return;
      const key = mesh.uniqueId || mesh.id || mesh.name;
      if (unique.has(`${list}:${key}`)) return;
      unique.add(`${list}:${key}`);
      if (list === 'obstacles') this.obstacles.push(mesh);
      else this.walkables.push(mesh);
    };

    this.obstacles = [];
    this.walkables = [];

    const decor = /medkit|sketchfab|cube_material|node\d|plant\.|mushroom|cogumelo|crystal|cristal|barsign|sciencetube|obelisk|gargoyle|altar|chest|baú|potion|scroll|rune|egg|coin|shard|object_\d|mesh\d|demo_/i;

    for (const mesh of this.scene.meshes) {
      if (!mesh || mesh.isDisposed?.() || (mesh.getTotalVertices?.() || 0) === 0) continue;
      if (this._isIgnoredMesh(mesh)) continue;
      if (this._isDynamicPlacementMesh(mesh)) continue;
      const names = `${mesh.name || ''} ${mesh.parent?.name || ''} ${mesh.parent?.parent?.name || ''}`;
      if (this._isNavSurfaceMesh(mesh)) pushMesh(mesh, 'walkables');
      if (!decor.test(names) && this._isSolidMesh(mesh)) pushMesh(mesh, 'obstacles');
    }

    for (const root of this._collectDynamicRoots()) {
      const meshes = root.getChildMeshes?.(false) || [];
      if (!meshes.length) continue;
      for (const mesh of meshes) pushMesh(mesh, 'obstacles');
      pushMesh(meshes[0], 'walkables');
    }

    for (const mesh of this.obstacles) pushMesh(mesh, 'walkables');
  }

  _hasActiveConsumers() {
    if (window._mpGuard?.isInMpRoom?.()) return false;
    const directorActive = window._combatDirector?.active === true;
    const enemies = window._gameLevel?.enemies;
    const aliveEnemies = Array.isArray(enemies) && enemies.some((enemy) => enemy?.alive);
    return directorActive || aliveEnemies;
  }

  _toBjsVec(value) {
    if (!value) return null;
    if (value instanceof BABYLON.Vector3) return value;
    if (typeof value.x !== 'number' || typeof value.y !== 'number' || typeof value.z !== 'number') return null;
    return new BABYLON.Vector3(value.x, value.y, value.z);
  }
}
