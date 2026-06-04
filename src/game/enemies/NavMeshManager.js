// ─────────────────────────────────────────────────────────────────
//  NavMeshManager — NavMesh real (Recast) para a IA dos inimigos
//
//  Gera uma malha de navegação a partir do CHÃO + obstáculos estáticos
//  (construção/props sólidos). Os inimigos pedem o próximo ponto do
//  caminho até o player → contornam paredes/objetos em vez de atravessar.
//
//  MUNDO DINÂMICO: o BuildMode muda o cenário. Em vez de regerar a cada
//  bloco (caro), marcamos "sujo" (markDirty) e regeramos com DEBOUNCE
//  (depois de ~1.2s sem novas mudanças). Regen roda só quando há inimigos
//  ativos ou sob demanda.
//
//  Recast é carregado do CDN do Babylon (lib WASM, uma vez).
// ─────────────────────────────────────────────────────────────────

import { DEBUG } from '../../utils/debug.js';

const RECAST_CDN = 'https://cdn.babylonjs.com/recast.js';

// Parâmetros validados no preview (gera ~85ms num chão grande).
const NAV_PARAMS = {
  cs: 0.2, ch: 0.2,              // células menores → detecta paredes finas
  walkableSlopeAngle: 45,
  walkableHeight: 2,            // precisa de 2 unidades de pé-direito
  walkableClimb: 0.5,          // só sobe degraus baixos (não escala paredes)
  walkableRadius: 0.8,         // "engorda" obstáculos pelo raio do inimigo → não cola na parede
  maxEdgeLen: 12, maxSimplificationError: 1.3,
  minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6,
  detailSampleDist: 6, detailSampleMaxError: 1,
};

function loadRecastLib() {
  if (typeof Recast !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = RECAST_CDN; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Falha ao baixar Recast'));
    document.head.appendChild(s);
  });
}

export class NavMeshManager {
  constructor(scene) {
    this.scene   = scene;
    this.plugin  = null;
    this.ready   = false;
    this._dirty  = false;
    this._debounceT = 0;
    this._regenPending = false;
    this.DEBOUNCE = 1.2;          // s sem mudanças antes de regerar
    this._lastBuildMs = 0;
  }

  async init() {
    try {
      await loadRecastLib();
      const recast = await Recast();
      this.plugin = new BABYLON.RecastJSPlugin(recast);
      await this.rebuild();
      this.ready = true;
      DEBUG.log('[NavMesh] ✅ pronto (build', this._lastBuildMs + 'ms)');
      return true;
    } catch (e) {
      console.warn('[NavMesh] falhou:', e?.message, '— IA usa fallback (linha reta)');
      this.ready = false;
      return false;
    }
  }

  // ── Coleta os meshes que formam o "andável" + obstáculos ─────────
  //  Chão/plataformas/escadas + objetos de CONSTRUÇÃO (colidíveis). Ignora
  //  decoração sem colisão, inimigos, drops, partículas, viewmodels.
  _collectMeshes() {
    const out = [];
    for (const m of this.scene.meshes) {
      if (!m || m.isDisposed?.() || (m.getTotalVertices?.() || 0) === 0) continue;
      const n = m.name || '';
      // ignora inimigos, efeitos, drops, billboards (sobe na hierarquia)
      let bad = false, node = m;
      while (node) { if (node._enemyRef) { bad = true; break; } node = node.parent; }
      if (bad) continue;
      if (/^(drop_|hit|tracer|muzzle|spark|trail|lbl|dmg|gun|weapon|hitbox)/i.test(n)) continue;
      if (/imgPlane|_glow|_beam|aim|crosshair|_hp|shadow/i.test(n)) continue;
      if (m._isPlaceholder || m.billboardMode) continue;

      // Chão/estrutura por nome
      let solid = /ground|chao|floor|piso|terrain|plataforma|platform|stair|escada|wall|muro|parede|tower|build|crate|barrel|caixa|container|cube|wood|madeira|tijolo|brick/i.test(n);
      // ou colisor/gameObject em si OU em algum ancestral (child meshes de GLB
      // não têm a flag — só o root tem).
      if (!solid) {
        let a = m;
        while (a && !solid) {
          if (a._isBoxCol || a._colliderOptimized || a.checkCollisions || a._staticBody) solid = true;
          else if (a._gameObject && a._gameObject.collidable !== false) solid = true;
          a = a.parent;
        }
      }
      if (solid) out.push(m);
    }
    return out;
  }

  // ── Caixa-proxy leve (AABB) p/ alimentar o Recast no lugar de uma malha
  //  pesada. Voxelizar a malha real high-poly é o que trava. A caixa cobre
  //  chão/parede igual pra navegação. Invisível, descartada após o build. ──
  _navProxyBox(m) {
    try {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      const min = bb.minimumWorld, max = bb.maximumWorld;
      const size = max.subtract(min);
      const box = BABYLON.MeshBuilder.CreateBox('_navproxy', {
        width:  Math.max(0.1, size.x),
        height: Math.max(0.1, size.y),
        depth:  Math.max(0.1, size.z),
      }, this.scene);
      box.position.copyFrom(min.add(max).scale(0.5));
      box.isVisible = false; box.isPickable = false;
      return box;
    } catch (_) { return null; }
  }

  // ── (Re)gera a navmesh agora ─────────────────────────────────────
  async rebuild() {
    if (!this.plugin) return false;
    const collected = this._collectMeshes();
    if (!collected.length) return false;

    // ── ANTI-FREEZE (asset gerado high-poly): troca malhas PESADAS por uma
    //  CAIXA do AABB antes do createNavMesh. Um piso/parede gerado pela máquina
    //  tem dezenas/centenas de milhares de tris; voxelizar isso no Recast
    //  (síncrono) travava o jogo ~30s. A caixa dá a mesma cobertura de navegação
    //  sem o custo. Boxes temporárias são descartadas após o build. ──
    const NAV_MAX_VERTS = 6000;
    const navInput = [];
    const temps = [];
    for (const m of collected) {
      const verts = m.getTotalVertices?.() || 0;
      if (verts > NAV_MAX_VERTS && !m._isBoxCol) {
        const box = this._navProxyBox(m);
        if (box) { navInput.push(box); temps.push(box); }   // sem box → pula (não trava)
      } else {
        navInput.push(m);
      }
    }
    const meshes = collected;   // obstáculos/walkables usam as malhas REAIS (LOS por raycast)
    if (!navInput.length) { temps.forEach(t => { try { t.dispose(); } catch (_) {} }); return false; }
    try {
      const t0 = performance.now();
      this.plugin.createNavMesh(navInput, NAV_PARAMS);
      this._lastBuildMs = +(performance.now() - t0).toFixed(1);
      temps.forEach(t => { try { t.dispose(); } catch (_) {} });   // limpa proxies
      this._dirty = false;
      // DEBUG: mostra a duração real no chat. Se isto for pequeno (~50-200ms) mas
      // o jogo ainda travar ao construir/destruir, o culpado NÃO é o navmesh.
      try {
        if (typeof window !== 'undefined' && window._dbg && this._lastBuildMs > 60) {
          window._dbg(`navmesh: ${this._lastBuildMs.toFixed(0)}ms (${navInput.length} meshes)`,
            this._lastBuildMs > 800 ? '#ff5050' : '#9fe');
        }
      } catch (_) {}
      // Lista de obstáculos p/ os inimigos: SÓ o que o player realmente colide
      //  (parede/construção/escada com collider). Exclui o chão e a decoração
      //  pura (Sketchfab solto sem colisão), que o player atravessa → senão a
      //  IA "vê" parede onde não tem e zigue-zagueia.
      // Decoração que NÃO bloqueia nem é pisável (mesmo tendo checkCollisions):
      //  itens soltos, props Sketchfab, plantas, cogumelos, cristais, etc.
      const DECOR = /medkit|sketchfab|cube_material|node\d|plant\.|mushroom|cogumelo|crystal|cristal|barsign|sciencetube|obelisk|gargoyle|altar|chest|baú|potion|scroll|rune|egg|coin|shard|object_\d|mesh\d|demo_/i;

      this.obstacles = meshes.filter(m => {
        const n = (m.name || '') + ' ' + (m.parent?.name || '') + ' ' + (m.parent?.parent?.name || '');
        if (DECOR.test(n)) return false;                      // decoração nunca bloqueia
        if (/ground|chao|floor|piso|terrain|bump/i.test(m.name || '')) return false;
        // colisor real (em si ou num ancestral) ou estrutura nomeada
        let a = m;
        while (a) {
          if (a._isBoxCol || a._colliderOptimized || a.checkCollisions || a._staticBody) return true;
          if (a._gameObject && a._gameObject.collidable !== false &&
              (a._gameObject.checkCollisions || a._gameObject.physics || a._gameObject.collidable === true)) return true;
          a = a.parent;
        }
        // estrutura do mapa por nome (alley/tower/wall/escada/plataforma)
        return /wall|muro|parede|stair|escada|plataforma|platform|tower|alley|ramp|brick|tijolo/i.test(n);
      });
      // PISÁVEIS (gravidade dos inimigos): obstáculos sólidos + o CHÃO.
      //  NÃO inclui decoração (medkit/cube/node solto) → o bicho não "pisa no ar".
      const grounds = meshes.filter(m => /ground|chao|floor|piso|terrain|bump/i.test(m.name || ''));
      this.walkables = [...this.obstacles, ...grounds];
      return true;
    } catch (e) {
      temps.forEach(t => { try { t.dispose(); } catch (_) {} });   // limpa proxies mesmo no erro
      console.warn('[NavMesh] rebuild falhou:', e?.message);
      return false;
    }
  }

  // ── Mundo mudou (BuildMode) → regenera com debounce ──────────────
  markDirty() { this._dirty = true; this._debounceT = this.DEBOUNCE; }

  update(dt) {
    if (!this.ready || !this._dirty) return;
    // Não regenera ENQUANTO está construindo: o Recast createNavMesh é síncrono
    // (~85ms+ em cena grande) e travava o jogo a CADA peça colocada. Segura o
    // debounce e regenera de uma vez só quando sair do modo construção.
    if (window._buildMode?._state === 'placing') { this._debounceT = this.DEBOUNCE; return; }
    this._debounceT -= dt;
    if (this._debounceT <= 0 && !this._regenPending) {
      this._regenPending = true;
      // regen é síncrono mas curto; agenda fora do frame pra não travar
      Promise.resolve().then(() => {
        this.rebuild();
        this._regenPending = false;
      });
    }
  }

  // ── API pra IA ───────────────────────────────────────────────────
  /** Ponto andável mais próximo de uma posição (snap na navmesh). */
  closest(pos) {
    if (!this.ready) return pos;
    try { return this.plugin.getClosestPoint(pos); } catch (_) { return pos; }
  }

  // Há um obstáculo entre A e B (no plano)? Raycast contra a lista de
  //  obstáculos (barato). Se NÃO há, a IA vai reto (sem zigue-zague da navmesh).
  hasObstacleBetween(a, b, y = 0.9) {
    const obs = this.obstacles;
    if (!obs || !obs.length) return false;
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) return false;
    const dir = new BABYLON.Vector3(dx / dist, 0, dz / dist);
    const origin = new BABYLON.Vector3(a.x, (a.y || 0) + y, a.z);
    const ray = new BABYLON.Ray(origin, dir, dist);
    for (const m of obs) {
      if (!m || m.isDisposed?.()) continue;
      // só testa obstáculos perto da linha (bounding sphere)
      const c = m.getBoundingInfo?.().boundingSphere;
      if (c) {
        const r = c.radiusWorld + 1;
        // distância do centro à linha (aprox por projeção)
        const t = Math.max(0, Math.min(dist, (c.centerWorld.x - a.x) * dir.x + (c.centerWorld.z - a.z) * dir.z));
        const px = a.x + dir.x * t, pz = a.z + dir.z * t;
        const dd = (c.centerWorld.x - px) ** 2 + (c.centerWorld.z - pz) ** 2;
        if (dd > r * r) continue;
      }
      const pick = ray.intersectsMesh(m);
      if (pick?.hit && pick.distance < dist) return true;
    }
    return false;
  }

  /**
   * Próximo waypoint no caminho de `from` até `to`.
   *  • Se há LINHA DE VISÃO livre → retorna `to` (vai RETO, sem zigue-zague).
   *  • Se há obstáculo → computa o caminho da navmesh e devolve o próximo
   *    waypoint que JÁ tenha linha de visão (string-pulling simples).
   * Null se a navmesh não está pronta → IA cai no fallback (linha reta).
   */
  nextStep(from, to) {
    if (!this.ready) return null;
    try {
      // 1) Sem obstáculo no meio → vai direto ao player (natural, sem curva).
      if (!this.hasObstacleBetween(from, to)) return to;

      // 2) Tem obstáculo → caminho da navmesh.
      const a = this.plugin.getClosestPoint(from);
      const b = this.plugin.getClosestPoint(to);
      const path = this.plugin.computePath(a, b);
      if (!path || path.length < 2) return b;

      // String-pulling: pega o waypoint MAIS LONGE que ainda tem linha de
      //  visão a partir de `from` → corta as curvas desnecessárias.
      let best = null;
      for (let i = 1; i < path.length; i++) {
        const p = path[i];
        if (!this.hasObstacleBetween(from, p)) best = p;
        else break;
      }
      if (best) {
        const dx = best.x - from.x, dz = best.z - from.z;
        if (dx * dx + dz * dz > 0.25) return best;
      }
      // fallback: 1º ponto significativo
      for (let i = 1; i < path.length; i++) {
        const p = path[i];
        const dx = p.x - from.x, dz = p.z - from.z;
        if (dx * dx + dz * dz > 0.25) return p;
      }
      return path[path.length - 1];
    } catch (_) { return null; }
  }
}
