// ─────────────────────────────────────────────────────────────────
//  TerrainSystem — terreno ESCULPÍVEL (heightmap) + PINTÁVEL (vertex color)
//
//  O chão do mundo vira uma GRADE subdividida (cada vértice tem altura Y).
//  Pincéis:
//    • raise   — ergue (montanha)
//    • lower   — abaixa (buraco/cratera)
//    • smooth  — suaviza (média dos vizinhos)
//    • flatten — achata no nível onde começou a pincelada
//    • paint   — pinta cor por vértice (vertex color)
//  Pincel configurável: RAIO (tamanho), FORÇA/OPACIDADE, e cor (no paint).
//
//  Colisão: octree (anda em cima sem testar 14k triângulos por move) + corpo
//  estático Havok quando a física está ativa (reconstruído ao FIM da pincelada,
//  com debounce, pra não travar).
//
//  Persistência (Supabase): heightmap + cores num registro único do mundo
//  (transfps.terrain). Salva com debounce; carrega ao entrar. Sync ao vivo
//  por-pincelada fica pra próxima fase (v1 = load-on-enter + save).
// ─────────────────────────────────────────────────────────────────
import { physicsReady, makeStaticBody } from '../physics/PhysicsWorld.js';
import { getSupabase } from '../auth/SupabaseClient.js';

const VB = () => BABYLON.VertexBuffer;

// ── Persistência do terreno do MUNDO (Supabase transfps.terrain) ─────
//  Um registro único id='world' (mundo compartilhado). v1: load-on-enter +
//  save com debounce. Sync ao vivo por-pincelada fica pra próxima fase.
export const TerrainStore = {
  async load() {
    try {
      const supa = await getSupabase();
      const { data, error } = await supa.schema('transfps').from('terrain')
        .select('size,subdivisions,heights,colors,texture_url').eq('id', 'world').maybeSingle();
      if (error || !data) return null;
      return data;
    } catch (_) { return null; }
  },
  /** Realtime: avisa quando o terreno muda (outro player editou). cb(row.updated_by). */
  async subscribe(onChange) {
    try {
      const supa = await getSupabase();
      try { const { data } = await supa.auth.getSession(); const tok = data?.session?.access_token; if (tok) supa.realtime.setAuth(tok); } catch (_) {}
      supa.channel('transfps_terrain')
        .on('postgres_changes', { event: 'UPDATE', schema: 'transfps', table: 'terrain' }, (p) => { try { onChange?.(p.new?.updated_by); } catch (_) {} })
        .on('postgres_changes', { event: 'INSERT', schema: 'transfps', table: 'terrain' }, (p) => { try { onChange?.(p.new?.updated_by); } catch (_) {} })
        .subscribe((s) => { if (s === 'SUBSCRIBED') console.log('[Terrain] 🌍 realtime ATIVO'); });
    } catch (e) { console.warn('[Terrain] subscribe', e?.message); }
  },
  /** Salva SÓ a textura do chão (todos veem). Upsert pra criar a linha se faltar. */
  async saveTextureUrl(url) {
    try {
      const supa = await getSupabase();
      const { error } = await supa.schema('transfps').from('terrain')
        .upsert({ id: 'world', texture_url: url || null }, { onConflict: 'id' });
      if (error) window._dbg?.('textura do chão NÃO salvou: ' + error.message, '#ff5050');
    } catch (e) { console.warn('[Terrain] saveTextureUrl falhou:', e?.message); }
  },
  async save(size, subdivisions, heights, colors) {
    try {
      const supa = await getSupabase();
      const { data: sess } = await supa.auth.getSession();
      const uid = sess?.session?.user?.id || null;
      // arredonda pra encolher o payload (jsonb)
      const h = Array.from(heights, (v) => Math.round(v * 100) / 100);
      const c = Array.from(colors, (v) => Math.round(v * 1000) / 1000);
      const { error } = await supa.schema('transfps').from('terrain').upsert(
        { id: 'world', size, subdivisions, heights: h, colors: c, updated_by: uid },
        { onConflict: 'id' });
      if (error) { window._dbg?.('terreno NÃO salvou: ' + error.message, '#ff5050'); }
    } catch (e) { console.warn('[Terrain] save falhou:', e?.message); }
  },
};

export class TerrainSystem {
  /**
   * @param {BABYLON.Scene} scene
   * @param {object} opts { size, subdivisions, minY, maxY }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.size = opts.size || 240;             // metros (lado do terreno)
    this.subdivisions = opts.subdivisions || 120;  // células => size/subdiv = 2m
    this.minY = opts.minY ?? -30;
    this.maxY = opts.maxY ?? 60;

    // Pincel (ajustável pela UI)
    this.brush = {
      mode: 'raise',          // raise | lower | smooth | flatten | paint
      radius: 8,              // metros
      strength: 0.6,          // força/opacidade por aplicação (0..1+)
      color: [0.45, 0.32, 0.20], // cor do paint (terra)
    };
    this.active = false;       // modo edição ligado?
    this._disposed = false;
    this._flattenY = null;     // alvo do flatten (capturado no início da pincelada)
    this._editT = 0;           // throttle de aplicação
    this._colDirty = false;
    this._colTimer = null;
    this._saveTimer = null;
    this.onSave = null;        // callback(heightArray, colorArray) p/ persistir

    this._build();
  }

  _build() {
    const g = BABYLON.MeshBuilder.CreateGround('terrain', {
      width: this.size, height: this.size,
      subdivisions: this.subdivisions, updatable: true,
    }, this.scene);
    g.position.y = 0;
    g.checkCollisions = true;
    g.receiveShadows = true;
    g.isPickable = true;
    g._isTerrain = true;
    g.alwaysSelectAsActiveMesh = true;

    const mat = new BABYLON.StandardMaterial('terrain_mat', this.scene);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.diffuseColor = new BABYLON.Color3(1, 1, 1);   // branco; vertex color tinge
    mat.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.13);
    g.material = mat;

    this.mesh = g;
    this._pos = g.getVerticesData(VB().PositionKind);
    this._nVerts = this._pos.length / 3;
    // cores iniciais = branco opaco
    this._col = new Float32Array(this._nVerts * 4);
    this._col.fill(1);
    g.setVerticesData(VB().ColorKind, this._col, true);

    this._recomputeNormals();
    this._refreshCollision();
  }

  /** Liga/desliga o modo edição (a UI/loop checam isto). */
  setActive(on) { this.active = !!on; this._flattenY = null; }

  // ── Aplica o pincel no ponto sob o CURSOR (chamar enquanto segura o botão) ──
  apply(dt) {
    if (!this.active || !this.mesh) return;
    // Throttle ~25Hz (recompute de normais é o custo; pinçar verts é barato).
    this._editT -= dt;
    if (this._editT > 0) return;
    this._editT = 0.04;

    const hit = this._pickTerrain();
    if (!hit) return;
    const cx = hit.x, cz = hit.z;
    const r = Math.max(0.5, this.brush.radius);
    const r2 = r * r;
    const s = this.brush.strength;
    const mode = this.brush.mode;

    if (this._flattenY == null) this._flattenY = hit.y;   // captura alvo do flatten

    const pos = this._pos, col = this._col, n = this._nVerts;
    let touchedGeo = false, touchedCol = false;

    // smooth precisa da média local — pré-calcula a média dos Y no raio.
    let avgY = 0, cnt = 0;
    if (mode === 'smooth') {
      for (let i = 0; i < n; i++) {
        const dx = pos[i*3] - cx, dz = pos[i*3+2] - cz;
        if (dx*dx + dz*dz <= r2) { avgY += pos[i*3+1]; cnt++; }
      }
      if (cnt) avgY /= cnt;
    }

    for (let i = 0; i < n; i++) {
      const ix = i*3;
      const dx = pos[ix] - cx, dz = pos[ix+2] - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 > r2) continue;
      // falloff suave (smoothstep) do centro (1) à borda (0)
      const t = 1 - Math.sqrt(d2) / r;
      const fall = t * t * (3 - 2 * t);
      const w = fall * s;

      if (mode === 'paint') {
        const c = ix / 3 * 4;
        col[c]   += (this.brush.color[0] - col[c])   * w;
        col[c+1] += (this.brush.color[1] - col[c+1]) * w;
        col[c+2] += (this.brush.color[2] - col[c+2]) * w;
        touchedCol = true;
      } else {
        let y = pos[ix+1];
        if (mode === 'raise')        y += w * 1.2;
        else if (mode === 'lower')   y -= w * 1.2;
        else if (mode === 'smooth')  y += (avgY - y) * w;
        else if (mode === 'flatten') y += (this._flattenY - y) * w;
        pos[ix+1] = Math.max(this.minY, Math.min(this.maxY, y));
        touchedGeo = true;
      }
    }

    if (touchedGeo) {
      this.mesh.updateVerticesData(VB().PositionKind, pos, false, false);
      this._recomputeNormals();
      this._colDirty = true;
    }
    if (touchedCol) {
      this.mesh.updateVerticesData(VB().ColorKind, col, false, false);
    }
    if (touchedGeo || touchedCol) this._scheduleSave();
  }

  /** Fim da pincelada (soltar o botão): reconstrói colisão + salva. */
  endStroke() {
    this._flattenY = null;
    if (this._colDirty) this._scheduleCollision();
  }

  // ── Raycast do CURSOR (mouse) contra o terreno ───────────────────
  _pickTerrain() {
    try {
      const hit = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.mesh);
      return (hit?.hit && hit.pickedPoint) ? hit.pickedPoint : null;
    } catch (_) { return null; }
  }

  _recomputeNormals() {
    try {
      const normals = this.mesh.getVerticesData(VB().NormalKind) || new Float32Array(this._nVerts * 3);
      BABYLON.VertexData.ComputeNormals(this._pos, this.mesh.getIndices(), normals);
      this.mesh.updateVerticesData(VB().NormalKind, normals, false, false);
    } catch (_) {}
  }

  // Colisão pesada → debounce 250ms após a última edição.
  _scheduleCollision() {
    if (this._colTimer) clearTimeout(this._colTimer);
    this._colTimer = setTimeout(() => { this._colTimer = null; this._refreshCollision(); }, 250);
  }

  _refreshCollision() {
    if (!this.mesh) return;
    try {
      this.mesh.refreshBoundingInfo(true);
      if (physicsReady()) {
        // Reconstrói o corpo estático Havok com a nova malha (sobe degraus nativo).
        try { this.mesh._staticBody?.dispose?.(); } catch (_) {}
        this.mesh._staticBody = null;
        makeStaticBody(this.mesh, this.scene, 'mesh');
      } else {
        // Sem física: octree p/ colisão barata por região (anti-lag no move).
        this.mesh.createOrUpdateSubmeshesOctree(64);
        this.mesh.useOctreeForCollisions = true;
        this.mesh.checkCollisions = true;
      }
    } catch (e) { console.warn('[Terrain] colisão refresh falhou:', e?.message); }
    this._colDirty = false;
  }

  // ── Persistência ─────────────────────────────────────────────────
  _scheduleSave() {
    if (!this.onSave) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.onSave(this.getHeights(), this._col); } catch (_) {}
    }, 1200);
  }

  /** Aplica uma TEXTURA no chão (tileada) + NORMAL MAP (relevo) derivado da
   *  própria textura na GPU. url null = volta pro branco.
   *  @param {object} o { tile, bump }  tile=metros por repetição; bump=força do relevo (0=sem). */
  setGroundTexture(url, o = {}) {
    const tile = o.tile ?? 4;
    const bump = o.bump ?? 1.0;
    this._textureUrl = url || null;
    this._bump = bump;
    try {
      const mat = this.mesh.material;
      // limpa anteriores
      if (mat.diffuseTexture) { try { mat.diffuseTexture.dispose(); } catch (_) {} mat.diffuseTexture = null; }
      if (mat.bumpTexture)    { try { mat.bumpTexture.dispose(); }    catch (_) {} mat.bumpTexture = null; }
      if (this._normalPT)     { try { this._normalPT.dispose(); }     catch (_) {} this._normalPT = null; }
      if (!url) { mat.diffuseColor = new BABYLON.Color3(1, 1, 1); return; }

      const cells = Math.max(1, this.size / tile);   // ~1 repetição a cada `tile` metros
      const tex = new BABYLON.Texture(url, this.scene);
      tex.uScale = cells; tex.vScale = cells;
      mat.diffuseTexture = tex;
      mat.diffuseColor = new BABYLON.Color3(1, 1, 1);

      // ── NORMAL MAP (relevo) derivado da textura na GPU (sem readback/CORS) ──
      if (bump > 0) {
        const npt = TerrainSystem._buildNormalMap(tex, this.scene, bump);
        if (npt) {
          npt.uScale = cells; npt.vScale = cells;
          mat.bumpTexture = npt;
          mat.bumpTexture.level = Math.min(2, bump);   // intensidade do relevo
          this._normalPT = npt;
        }
      }
    } catch (e) { console.warn('[Terrain] textura falhou:', e?.message); }
  }

  /** Cria um normal map (ProceduralTexture) que deriva o relevo do brilho da
   *  textura na GPU. Roda algumas vezes e congela (relevo estático). */
  static _buildNormalMap(diffuseTex, scene, strength) {
    try {
      const SHADER = 'terrainNormal';
      if (!BABYLON.Effect.ShadersStore[`${SHADER}PixelShader`]) {
        BABYLON.Effect.ShadersStore[`${SHADER}PixelShader`] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D diffuseSampler;
uniform vec2 texel;
uniform float strength;
float lum(vec2 uv){ vec3 c = texture2D(diffuseSampler, uv).rgb; return dot(c, vec3(0.299,0.587,0.114)); }
void main(){
  float l = lum(vUV - vec2(texel.x, 0.0));
  float r = lum(vUV + vec2(texel.x, 0.0));
  float d = lum(vUV - vec2(0.0, texel.y));
  float u = lum(vUV + vec2(0.0, texel.y));
  vec3 n = normalize(vec3((l - r) * strength, (d - u) * strength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;
      }
      const S = 512;
      const npt = new BABYLON.ProceduralTexture('terrainNormalTex', S, SHADER, scene, null, true, false);
      npt.setTexture('diffuseSampler', diffuseTex);
      npt.setVector2('texel', new BABYLON.Vector2(1 / S, 1 / S));
      npt.setFloat('strength', Math.max(0.5, strength * 4));   // escala o gradiente
      // Congela depois que a textura-fonte carregou + alguns frames (relevo estático).
      setTimeout(() => { try { npt.refreshRate = 0; } catch (_) {} }, 1200);
      return npt;
    } catch (e) { console.warn('[Terrain] normal map falhou:', e?.message); return null; }
  }

  /** Array de alturas (Y de cada vértice) — compacto pra salvar. */
  getHeights() {
    const n = this._nVerts, h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = this._pos[i*3+1];
    return h;
  }

  /** Aplica um heightmap + cores carregados (do Supabase). */
  load(heights, colors) {
    try {
      if (heights && heights.length === this._nVerts) {
        for (let i = 0; i < this._nVerts; i++) {
          this._pos[i*3+1] = Math.max(this.minY, Math.min(this.maxY, heights[i]));
        }
        this.mesh.updateVerticesData(VB().PositionKind, this._pos, false, false);
        this._recomputeNormals();
      }
      if (colors && colors.length === this._col.length) {
        this._col.set(colors);
        this.mesh.updateVerticesData(VB().ColorKind, this._col, false, false);
      }
      this._refreshCollision();
    } catch (e) { console.warn('[Terrain] load falhou:', e?.message); }
  }

  dispose() {
    this._disposed = true;
    if (this._colTimer) clearTimeout(this._colTimer);
    if (this._saveTimer) clearTimeout(this._saveTimer);
    try { this.mesh?._staticBody?.dispose?.(); } catch (_) {}
    try { this.mesh?.dispose(); } catch (_) {}
  }
}
