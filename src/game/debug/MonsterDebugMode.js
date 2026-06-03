// ─────────────────────────────────────────────────────────────────
//  MonsterDebugMode.js
//
//  Cena isolada para debugar monstros (e qualquer entidade do jogo):
//  • Monstro real rodando com update() + state machine verdadeira
//  • Dummy player (cápsula azul) — clique no chão para reposicionar
//  • Hitbox da cabeça em wireframe verde/vermelho ao vivo
//  • Círculos de range no chão (ATTACK, BITE, SLAM)
//  • Inspector em tempo real (estado, timers, HP)
//  • Botões para forçar qualquer ataque
//  • Sliders de parâmetros com efeito imediato
//  • Controle de velocidade (slow-motion)
// ─────────────────────────────────────────────────────────────────

import { ASSET_PATHS } from '../../AssetLoader.js';
import { MonsterPlant, HopState } from '../../Enemy.js';
import { EnemyCatalog } from '../data/EnemyCatalog.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

// Encoda path com espaços/acentos pro loader funcionar
function _encPath(p) { return p ? p.split('/').map(s => encodeURIComponent(s)).join('/') : p; }

// ── Catálogo de monstros disponíveis ─────────────────────────────
const MONSTER_CATALOG = [
  {
    label: '🌱 Planta',
    key: 'monsterPlant',
    Class: MonsterPlant,
    scale: 1,
    spawnPos: { x: 0, y: 0, z: 0 },  // convertido para Vector3 em _loadMonster
  },
  // Adicione aqui futuras criaturas:
  // { label: '🦎 Cocatriz', key: 'cockatrice', Class: Cockatrice, scale: 1, spawnPos: {x:0,y:0,z:0} },
];

// ── Parâmetros editáveis via slider ──────────────────────────────
const EDITABLE_PARAMS = [
  { key: 'HEAD_HEIGHT',     label: 'Altura da cabeça',  min: 0,   max: 8,   step: 0.1  },
  { key: 'HEAD_REACH',      label: 'Reach da boca',     min: 0,   max: 5,   step: 0.1  },
  { key: 'HEAD_HIT_RADIUS', label: 'Raio hitbox cabeça',min: 0.1, max: 4,   step: 0.05 },
  { key: 'BODY_HIT_RADIUS', label: 'Raio corpo player', min: 0.1, max: 3,   step: 0.05 },
  { key: 'ATTACK_RANGE',    label: 'Range ataque base', min: 0.5, max: 8,   step: 0.1  },
  { key: 'BITE_RANGE',      label: 'Range bote longo',  min: 0.5, max: 10,  step: 0.1  },
  { key: 'ATTACK_DAMAGE',   label: 'Dano base',         min: 1,   max: 100, step: 1    },
  { key: 'BITE_DAMAGE',     label: 'Dano bote',         min: 1,   max: 100, step: 1    },
  { key: 'SLAM_DAMAGE',     label: 'Dano slam',         min: 1,   max: 150, step: 1    },
];

export class MonsterDebugMode {
  constructor(engine, canvas) {
    this.engine     = engine;
    this.canvas     = canvas;
    this.active     = false;

    this.scene      = null;
    this.camera     = null;
    this.shadowGen  = null;

    this.monster    = null;        // instância MonsterPlant (ou outro)
    this._glbRoot   = null;        // raiz do GLB original para clone
    this._monsterEntry = null;     // entrada do MONSTER_CATALOG

    this._dummy     = null;        // cápsula azul (player fictício)
    this._headSphere   = null;     // esfera wireframe da cabeça
    this._headSphMat   = null;
    this._bodyRing     = null;     // anel ao redor do player
    this._rangeDiscs   = {};       // discos de range no chão

    this._timeScale    = 1.0;
    this._inspectorT   = 0;
    this._dmgFlashT    = 0;
    this._lastDmgInfo  = null;

    this._uiContainer  = null;
    this._obs          = null;     // handle onBeforeRenderObservable
  }

  // ════════════════════════════════════════════════════════════════
  //  Entrada / Saída
  // ════════════════════════════════════════════════════════════════

  // Catálogo de monstros: a Planta (com AI real) + TODOS os monstros do
  //  EnemyCatalog (digimons etc) como PREVIEW (sem AI ainda). Assim o debug
  //  lista todos os bichos do jogo; quem tiver classe roda a state machine,
  //  o resto só mostra o modelo + idle (a gente cria a AI deles depois).
  _buildCatalog() {
    const list = [{ key: 'monsterPlant', label: '🌱 Planta', path: ASSET_PATHS.monsterPlant, Class: MonsterPlant, spawnPos: { x:0, y:0, z:0 }, targetHeight: 1.6 }];
    const icon = { rookie:'🥚', champion:'⭐', ultimate:'🌟', mega:'💫', boss:'👑' };
    for (const [id, def] of Object.entries(EnemyCatalog)) {
      if (def.asset === 'monsterPlant') continue;       // já é a Planta (com AI)
      const raw = AssetRegistry.path(def.category, def.asset);
      if (!raw) continue;
      list.push({ key: id, label: `${icon[def.tier] || '👾'} ${def.name}`, path: _encPath(raw), Class: null, spawnPos: { x:0, y:0, z:0 }, targetHeight: def.targetHeight || 1.7 });
    }
    return list;
  }

  async enter(monsterKey = 'monsterPlant') {
    this.active = true;
    this._catalog = this._buildCatalog();

    // Cena isolada (não interfere com a cena do jogo)
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.06, 0.06, 0.10, 1);

    // Câmera orbital
    this.camera = new BABYLON.ArcRotateCamera(
      '_dbgCam', -Math.PI / 2, Math.PI / 3.2, 9,
      new BABYLON.Vector3(0, 1.5, 0), this.scene
    );
    this.camera.wheelPrecision     = 60;
    this.camera.lowerRadiusLimit   = 1;
    this.camera.upperRadiusLimit   = 30;
    this.camera.lowerBetaLimit     = 0.1;
    this.camera.upperBetaLimit     = Math.PI / 2.05;
    this.camera.attachControl(this.canvas, true);

    // Iluminação
    const sun = new BABYLON.DirectionalLight('_dbgSun', new BABYLON.Vector3(-1, -2, -1).normalize(), this.scene);
    sun.intensity = 1.6;
    sun.position  = new BABYLON.Vector3(10, 20, 10);

    const amb = new BABYLON.HemisphericLight('_dbgAmb', new BABYLON.Vector3(0, 1, 0), this.scene);
    amb.intensity   = 0.55;
    amb.groundColor = new BABYLON.Color3(0.1, 0.2, 0.1);

    this.shadowGen = new BABYLON.ShadowGenerator(1024, sun);
    this.shadowGen.useBlurExponentialShadowMap = true;

    // Chão com grid
    this._buildGround();

    // Dummy player (cápsula azul)
    this._createDummyPlayer();

    // UI
    this._createUI();

    // Carrega o monstro
    await this._loadMonster(monsterKey);

    // Loop de update
    this._obs = this.scene.onBeforeRenderObservable.add(() => this._tick());
  }

  exit() {
    this.active = false;
    if (this._obs && this.scene) {
      this.scene.onBeforeRenderObservable.remove(this._obs);
    }
    if (this._uiContainer) {
      document.body.removeChild(this._uiContainer);
      this._uiContainer = null;
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    this.monster   = null;
    this._glbRoot  = null;
  }

  render() {
    if (this.active && this.scene) this.scene.render();
  }

  // ════════════════════════════════════════════════════════════════
  //  Cena
  // ════════════════════════════════════════════════════════════════

  _buildGround() {
    const ground = BABYLON.MeshBuilder.CreateGround(
      '_dbgGround', { width: 30, height: 30, subdivisions: 30 }, this.scene
    );
    const mat  = new BABYLON.StandardMaterial('_dbgGndMat', this.scene);
    mat.diffuseColor  = new BABYLON.Color3(0.08, 0.09, 0.08);
    mat.specularColor = BABYLON.Color3.Black();
    ground.material   = mat;
    ground.isPickable = true;
    ground.name       = '_dbgGround';

    // Grid de linhas
    const lMat = new BABYLON.StandardMaterial('_dbgLineMat', this.scene);
    lMat.emissiveColor = new BABYLON.Color3(0.15, 0.18, 0.15);
    for (let i = -15; i <= 15; i++) {
      const h = BABYLON.MeshBuilder.CreateLines('', { points: [
        new BABYLON.Vector3(i, 0.01, -15),
        new BABYLON.Vector3(i, 0.01,  15),
      ]}, this.scene);
      const v = BABYLON.MeshBuilder.CreateLines('', { points: [
        new BABYLON.Vector3(-15, 0.01, i),
        new BABYLON.Vector3( 15, 0.01, i),
      ]}, this.scene);
      h.isPickable = false; v.isPickable = false;
      h.color = lMat.emissiveColor; v.color = lMat.emissiveColor;
    }

    // Clique no chão → move dummy player
    this.scene.onPointerObservable.add(info => {
      if (info.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      if (info.pickInfo?.pickedMesh?.name !== '_dbgGround') return;
      const pt = info.pickInfo.pickedPoint;
      if (this._dummy) this._dummy.position.set(pt.x, 0, pt.z);
    });
  }

  _createDummyPlayer() {
    // Cápsula semi-transparente azul representa o "player"
    this._dummy = BABYLON.MeshBuilder.CreateCapsule('_dbgDummy', {
      height: 1.8, radius: 0.45, tessellation: 12,
    }, this.scene);
    this._dummy.position.set(3, 0.9, 0);
    this._dummy.isPickable = false;

    const mat = new BABYLON.StandardMaterial('_dbgDummyMat', this.scene);
    mat.diffuseColor  = new BABYLON.Color3(0.2, 0.5, 1.0);
    mat.emissiveColor = new BABYLON.Color3(0.05, 0.15, 0.3);
    mat.alpha         = 0.65;
    this._dummy.material = mat;

    // Anel de raio do corpo do player
    this._bodyRing = BABYLON.MeshBuilder.CreateTorus(
      '_dbgBodyRing', { diameter: 2, thickness: 0.04, tessellation: 32 }, this.scene
    );
    this._bodyRing.position.y = 0.02;
    this._bodyRing.isPickable = false;
    const rMat = new BABYLON.StandardMaterial('_dbgBRMat', this.scene);
    rMat.emissiveColor = new BABYLON.Color3(0.2, 0.5, 1.0);
    rMat.disableLighting = true;
    this._bodyRing.material = rMat;
  }

  // ════════════════════════════════════════════════════════════════
  //  Carregamento do monstro
  // ════════════════════════════════════════════════════════════════

  async _loadMonster(key) {
    const entry = (this._catalog || MONSTER_CATALOG).find(e => e.key === key);
    if (!entry) { console.warn('[MonsterDebug] Chave não encontrada:', key); return; }

    this._monsterEntry = entry;
    this._setStatus(`Carregando ${entry.label}…`);

    // Destrói instância anterior
    if (this.monster) {
      this.monster._cleanup?.();
      this.monster = null;
    }
    if (this._glbRoot) { this._glbRoot.dispose(); this._glbRoot = null; }
    this._clearRangeDiscs();
    if (this._headSphere) { this._headSphere.dispose(); this._headSphere = null; }

    try {
      const url = entry.path || ASSET_PATHS[key];
      const lastSlash = url.lastIndexOf('/');
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        '', url.substring(0, lastSlash + 1), url.substring(lastSlash + 1), this.scene
      );
      this._glbRoot = result.meshes[0];

      if (entry.Class) {
        // ── Monstro COM AI (Planta): state machine real + debug completo ──
        this._glbRoot.setEnabled(false); // template — a classe clona/instancia
        const sp = entry.spawnPos;
        const spawnPos = new BABYLON.Vector3(sp.x, sp.y, sp.z);
        this.monster = new entry.Class(this.scene, this.shadowGen, [this._glbRoot], spawnPos);

        // Callback de ataque → mostra flash
        this.monster.onAttack = (dmg, type, pos, kb) => {
          this._dmgFlashT  = 0.6;
          this._lastDmgInfo = { dmg, type };
          this._flashDummyRed();
        };

        this._createHeadSphere();
        this._createRangeDiscs();
        this._refreshParamSliders();
        this._setStatus(null);
        const st = document.getElementById('_dbg_state'); if (st) st.textContent = 'WAIT';
      } else {
        // ── Monstro SEM AI ainda → PREVIEW: mostra o modelo e toca idle ──
        //  (state machine/hitbox/ranges ficam ocultos; a AI desse bicho é
        //   criada depois). Os botões/sliders já têm guarda p/ monster null.
        this.monster = null;
        this._glbRoot.setEnabled(true);
        this._fitPreview(result.meshes, entry.targetHeight);
        const groups = result.animationGroups || [];
        groups.forEach(g => g.stop());
        (groups.find(g => /idle/i.test(g.name)) || groups[0])?.play(true);
        const st = document.getElementById('_dbg_state'); if (st) st.textContent = 'PREVIEW';
        this._setStatus('Sem AI ainda — preview do modelo');
      }

      this._refreshMonsterButtons();
      console.log(`[MonsterDebug] ✅ ${entry.label} carregada`);
    } catch (err) {
      console.error('[MonsterDebug] Erro ao carregar monstro:', err);
      this._setStatus(`❌ Erro: ${err.message}`);
    }
  }

  // Normaliza um modelo de preview: escala pra ~targetH e assenta no chão.
  _fitPreview(meshes, targetH = 1.7) {
    const root = this._glbRoot;
    if (!root) return;
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    for (const m of meshes) {
      if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
      any = true;
    }
    if (!any) return;
    const h = Math.max(max.y - min.y, 1e-4);
    const s = targetH / h;
    root.scaling.scaleInPlace(s);
    root.computeWorldMatrix(true);
    root.position.x -= ((min.x + max.x) / 2) * s;
    root.position.z -= ((min.z + max.z) / 2) * s;
    root.position.y -= min.y * s;
  }

  // ════════════════════════════════════════════════════════════════
  //  Debug meshes
  // ════════════════════════════════════════════════════════════════

  _createHeadSphere() {
    const r = this.monster?.HEAD_HIT_RADIUS ?? 1.0;
    this._headSphere = BABYLON.MeshBuilder.CreateSphere(
      '_dbgHead', { diameter: r * 2, segments: 8 }, this.scene
    );
    this._headSphere.isPickable    = false;
    this._headSphere.renderingGroupId = 1;
    const mat = new BABYLON.StandardMaterial('_dbgHeadMat', this.scene);
    mat.wireframe        = true;
    mat.emissiveColor    = new BABYLON.Color3(0, 1, 0.5);
    mat.disableLighting  = true;
    mat.alpha            = 0.55;
    this._headSphere.material = mat;
    this._headSphMat = mat;
  }

  _createRangeDiscs() {
    if (!this.monster) return;
    const ranges = {
      attack: { r: this.monster.ATTACK_RANGE, color: new BABYLON.Color3(1, 0.3, 0.1) },
      bite:   { r: this.monster.BITE_RANGE,   color: new BABYLON.Color3(1, 0.8, 0.0) },
      slam:   { r: this.monster.SLAM_RANGE_MIN,color: new BABYLON.Color3(0.3, 0.6, 1) },
    };
    Object.entries(ranges).forEach(([name, { r, color }]) => {
      const torus = BABYLON.MeshBuilder.CreateTorus(
        `_dbgRange_${name}`, { diameter: r * 2, thickness: 0.05, tessellation: 40 }, this.scene
      );
      torus.position.y  = 0.03;
      torus.isPickable  = false;
      const mat = new BABYLON.StandardMaterial(`_dbgRM_${name}`, this.scene);
      mat.emissiveColor  = color;
      mat.disableLighting = true;
      mat.alpha          = 0.55;
      torus.material     = mat;
      this._rangeDiscs[name] = torus;
    });
  }

  _clearRangeDiscs() {
    Object.values(this._rangeDiscs).forEach(m => m.dispose());
    this._rangeDiscs = {};
  }

  // ════════════════════════════════════════════════════════════════
  //  Tick (loop)
  // ════════════════════════════════════════════════════════════════

  _tick() {
    if (!this.monster || !this._dummy) return;

    const rawDt = this.engine.getDeltaTime() / 1000;
    const dt    = Math.min(rawDt, 0.05) * this._timeScale;

    const playerPos = this._dummy.position.clone();
    playerPos.y     = 0; // chão
    const camPos    = this.camera.position;

    this.monster.update(dt, playerPos, camPos);

    // Atualiza hitbox debug
    this._updateHeadSphere(playerPos);

    // Atualiza anel do player
    if (this._bodyRing) {
      this._bodyRing.position.x = this._dummy.position.x;
      this._bodyRing.position.z = this._dummy.position.z;
      const bodyD = (this.monster.BODY_HIT_RADIUS ?? 0.85) * 2;
      this._bodyRing.scaling.setAll(bodyD);
    }

    // Flash de dano no dummy
    if (this._dmgFlashT > 0) {
      this._dmgFlashT -= rawDt;
      const dMat = this._dummy.material;
      if (dMat) {
        const f = this._dmgFlashT / 0.6;
        dMat.emissiveColor = new BABYLON.Color3(f, f * 0.1, f * 0.1);
      }
    } else if (this._dummy.material) {
      this._dummy.material.emissiveColor = new BABYLON.Color3(0.05, 0.15, 0.3);
    }

    // Inspector UI (throttled a 10 fps)
    this._inspectorT += rawDt;
    if (this._inspectorT > 0.1) {
      this._inspectorT = 0;
      this._refreshInspector();
    }
  }

  _updateHeadSphere(playerPos) {
    if (!this._headSphere || !this.monster?.root) return;
    const mPos   = this.monster.root.position;
    const dx     = playerPos.x - mPos.x;
    const dz     = playerPos.z - mPos.z;
    const distH  = Math.sqrt(dx * dx + dz * dz);

    const head = this.monster._getHeadPos(mPos, dx, dz, distH);
    this._headSphere.position.copyFrom(head);

    // Tamanho = HEAD_HIT_RADIUS atual (muda com slider)
    const r = this.monster.HEAD_HIT_RADIUS;
    this._headSphere.scaling.setAll(r * 2);

    // Cor: verde normal, vermelho se tocando o player
    const hitting = this.monster._checkHeadHit(mPos, playerPos, dx, dz, distH);
    this._headSphMat.emissiveColor = hitting
      ? new BABYLON.Color3(1, 0.1, 0.1)
      : new BABYLON.Color3(0, 1, 0.5);

    // Visível só quando hitbox ativa (em attack states)
    const attackStates = [HopState.QUICK_BITE, HopState.BITE_STRIKE, HopState.BITE_WINDUP];
    const isActive = attackStates.includes(this.monster._hopState);
    this._headSphere.setEnabled(isActive);
    if (!isActive) this._headSphMat.emissiveColor = new BABYLON.Color3(0.3, 0.6, 0.3);
    else this._headSphere.setEnabled(true);
  }

  _flashDummyRed() {
    if (!this._dummy?.material) return;
    this._dummy.material.emissiveColor = new BABYLON.Color3(1, 0.1, 0.1);
  }

  // ════════════════════════════════════════════════════════════════
  //  Actions
  // ════════════════════════════════════════════════════════════════

  _forceState(stateKey) {
    if (!this.monster || !this.monster.alive) { this._respawn(); }
    if (!this.monster) return;

    const m = this.monster;
    switch (stateKey) {
      case 'QUICK_BITE':
        m._hopState = HopState.QUICK_BITE;
        m._hopT     = 0.50;
        m._hitDealtThisSwing = false;
        m._attackT  = 0;
        break;
      case 'BITE_WINDUP':
        m._hopState = HopState.BITE_WINDUP;
        m._hopT     = 0.25;
        m._biteT    = 0;
        m._hitDealtThisSwing = false;
        break;
      case 'SLAM_WINDUP':
        m._slamTargetPos = this._dummy.position.clone();
        m._hopState = HopState.SLAM_WINDUP;
        m._hopT     = 0.55;
        m._slamT    = 0;
        break;
      case 'HOP':
        m._hopState = HopState.CROUCH;
        m._hopT     = 0.35;
        break;
      case 'RESET_POS':
        m.root.position.set(0, 0, 0);
        m._hopState = HopState.WAIT;
        m._hopT     = 0.4;
        m._vx = m._vy = m._vz = 0;
        break;
    }
  }

  _respawn() {
    if (!this.monster) return;
    this.monster.reset?.();
  }

  _setTimeScale(v) {
    this._timeScale = v;
    ['ts1','ts025','ts01'].forEach(id => {
      const el = document.getElementById(`_dbg_${id}`);
      if (el) el.style.background = '#1a1a1a';
    });
    const map = { 1:'ts1', 0.25:'ts025', 0.1:'ts01' };
    const el = document.getElementById(`_dbg_${map[v]}`);
    if (el) el.style.background = '#2a4080';
  }

  _setParam(key, value) {
    if (!this.monster) return;
    this.monster[key] = value;
    const valEl = document.getElementById(`_dbg_pv_${key}`);
    if (valEl) valEl.textContent = value % 1 === 0 ? value : value.toFixed(2);

    // Atualiza visuals dependentes
    if (key === 'HEAD_HIT_RADIUS' && this._headSphere) {
      this._headSphere.scaling.setAll(value * 2);
    }
    if (key === 'BODY_HIT_RADIUS' && this._bodyRing) {
      this._bodyRing.scaling.setAll(value * 2);
    }
  }

  _toggleHeadSphere(alwaysOn) {
    this._headSphereAlwaysOn = alwaysOn;
    if (this._headSphere) this._headSphere.setEnabled(true);
  }

  // ════════════════════════════════════════════════════════════════
  //  UI
  // ════════════════════════════════════════════════════════════════

  _createUI() {
    const ui = document.createElement('div');
    ui.id = '_monster-debug-ui';
    ui.style.cssText = `
      position:fixed; top:10px; left:10px; width:310px; bottom:10px;
      background:rgba(5,5,10,0.95); color:#ddd; padding:14px;
      font-family:'Segoe UI',monospace,sans-serif; font-size:12px;
      border-radius:10px; display:flex; flex-direction:column; z-index:1000;
      border:1px solid #1a3a6a; box-shadow:0 0 24px rgba(0,50,200,.35);
      overflow:hidden; gap:10px;
    `;
    ui.innerHTML = this._buildUIHtml();
    document.body.appendChild(ui);
    this._uiContainer = ui;

    // Fechar
    ui.querySelector('#_dbg_close').onclick = () => window.closeMonsterDebug?.();
    // Botão "always show hitbox"
    ui.querySelector('#_dbg_hitbox_always').onclick = (e) => {
      const on = e.target.dataset.on === '1';
      e.target.dataset.on = on ? '0' : '1';
      e.target.style.background = on ? '#1a1a1a' : '#2a4080';
      this._toggleHeadSphere(!on);
    };
  }

  _buildUIHtml() {
    // Header
    const header = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #223;padding-bottom:10px;flex-shrink:0">
        <span style="color:#4af;font-size:15px;font-weight:700;letter-spacing:1px">🐛 MONSTER DEBUG</span>
        <button id="_dbg_close" style="background:none;border:none;color:#666;font-size:22px;cursor:pointer;transition:.2s">×</button>
      </div>`;

    // Seletor de monstro
    const monsterBtns = (this._catalog || MONSTER_CATALOG).map(e =>
      `<button onclick="window._monsterDebug._loadMonster('${e.key}')"
        style="padding:5px 8px;background:#1a1a1a;border:1px solid #333;color:#eee;cursor:pointer;font-size:11px;border-radius:4px">
        ${e.label}
      </button>`
    ).join('');
    const monsterPicker = `
      <div style="flex-shrink:0">
        <div style="font-size:10px;color:#4af;font-weight:600;letter-spacing:.8px;margin-bottom:5px">MONSTRO</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${monsterBtns}</div>
      </div>`;

    // Inspector
    const inspector = `
      <div style="flex-shrink:0;background:#080c10;border-radius:6px;padding:8px">
        <div style="font-size:10px;color:#4af;font-weight:600;letter-spacing:.8px;margin-bottom:6px">INSPECTOR</div>
        <div id="_dbg_state"  style="color:#ff0;font-weight:700;font-size:13px;margin-bottom:4px">WAIT</div>
        <div id="_dbg_status" style="color:#f55;font-size:10px;margin-bottom:4px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:10px;color:#8af">
          <span>HP:</span>       <span id="_dbg_hp">100/100</span>
          <span>hopT:</span>     <span id="_dbg_hopt">—</span>
          <span>attackT:</span>  <span id="_dbg_attackt">—</span>
          <span>biteT:</span>    <span id="_dbg_bitet">—</span>
          <span>slamT:</span>    <span id="_dbg_slamt">—</span>
          <span>distH:</span>    <span id="_dbg_disth">—</span>
          <span>hitSwing:</span> <span id="_dbg_hitswing">—</span>
          <span>lastDmg:</span>  <span id="_dbg_dmg">—</span>
        </div>
      </div>`;

    // Força ataques
    const attackBtns = `
      <div style="flex-shrink:0">
        <div style="font-size:10px;color:#fa5;font-weight:600;letter-spacing:.8px;margin-bottom:5px">FORÇAR ATAQUE</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <button onclick="window._monsterDebug._forceState('QUICK_BITE')"
            style="padding:5px;background:#2a1a00;border:1px solid #a50;color:#fa5;cursor:pointer;border-radius:4px;font-size:11px">
            👊 Quick Bite
          </button>
          <button onclick="window._monsterDebug._forceState('BITE_WINDUP')"
            style="padding:5px;background:#2a1a00;border:1px solid #a50;color:#fa5;cursor:pointer;border-radius:4px;font-size:11px">
            🐍 Bote Longo
          </button>
          <button onclick="window._monsterDebug._forceState('SLAM_WINDUP')"
            style="padding:5px;background:#1a002a;border:1px solid #60a;color:#c8f;cursor:pointer;border-radius:4px;font-size:11px">
            💥 Slam
          </button>
          <button onclick="window._monsterDebug._forceState('HOP')"
            style="padding:5px;background:#002a1a;border:1px solid #0a5;color:#5fa;cursor:pointer;border-radius:4px;font-size:11px">
            🐸 Hop
          </button>
          <button onclick="window._monsterDebug._forceState('RESET_POS')"
            style="padding:5px;background:#0a0a14;border:1px solid #336;color:#8af;cursor:pointer;border-radius:4px;font-size:11px">
            ↩ Reset Pos
          </button>
          <button onclick="window._monsterDebug._respawn()"
            style="padding:5px;background:#1a0a0a;border:1px solid #633;color:#f88;cursor:pointer;border-radius:4px;font-size:11px">
            💀→✅ Respawn
          </button>
        </div>
      </div>`;

    // Hitbox
    const hitboxSection = `
      <div style="flex-shrink:0">
        <div style="font-size:10px;color:#0fa;font-weight:600;letter-spacing:.8px;margin-bottom:5px">HITBOX</div>
        <div style="display:flex;gap:4px;align-items:center;font-size:10px;color:#7af;margin-bottom:3px">
          <span style="color:#0fa">●</span> Cabeça (verde=miss / vermelho=hit)
          &nbsp;
          <button id="_dbg_hitbox_always" data-on="0"
            style="padding:2px 6px;background:#1a1a1a;border:1px solid #333;color:#aaa;cursor:pointer;font-size:9px;border-radius:3px">
            sempre visível
          </button>
        </div>
        <div style="font-size:10px;color:#5af">● Azul = raio corpo player &nbsp; 🔴🟡🔵 = ranges</div>
      </div>`;

    // Sliders de parâmetros
    const sliders = EDITABLE_PARAMS.map(p => `
      <div style="margin-bottom:5px">
        <div style="display:flex;justify-content:space-between;color:#8af;font-size:10px">
          <span>${p.label}</span>
          <span id="_dbg_pv_${p.key}" style="color:#ff9;min-width:32px;text-align:right">?</span>
        </div>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
          style="width:100%;accent-color:#4af;margin:1px 0"
          oninput="window._monsterDebug._setParam('${p.key}', +this.value)"
          id="_dbg_sl_${p.key}">
      </div>`).join('');

    const paramsSection = `
      <div style="flex:1;overflow-y:auto;padding-right:2px" class="_dbg_scroll">
        <div style="font-size:10px;color:#fa5;font-weight:600;letter-spacing:.8px;margin-bottom:5px">PARÂMETROS</div>
        ${sliders}
      </div>`;

    // Velocidade
    const speedSection = `
      <div style="flex-shrink:0;border-top:1px solid #223;padding-top:8px">
        <div style="font-size:10px;color:#4af;font-weight:600;letter-spacing:.8px;margin-bottom:5px">VELOCIDADE</div>
        <div style="display:flex;gap:4px">
          <button id="_dbg_ts1" onclick="window._monsterDebug._setTimeScale(1)"
            style="flex:1;padding:5px;background:#2a4080;border:1px solid #336;color:#adf;cursor:pointer;border-radius:4px;font-size:11px">
            1× Normal
          </button>
          <button id="_dbg_ts025" onclick="window._monsterDebug._setTimeScale(0.25)"
            style="flex:1;padding:5px;background:#1a1a1a;border:1px solid #333;color:#aaa;cursor:pointer;border-radius:4px;font-size:11px">
            ¼ Lento
          </button>
          <button id="_dbg_ts01" onclick="window._monsterDebug._setTimeScale(0.1)"
            style="flex:1;padding:5px;background:#1a1a1a;border:1px solid #333;color:#aaa;cursor:pointer;border-radius:4px;font-size:11px">
            ¹⁄₁₀ Matrix
          </button>
        </div>
        <div style="margin-top:4px;font-size:9px;color:#445;text-align:center">
          Clique no chão para mover o player azul
        </div>
      </div>
      <style>
        ._dbg_scroll::-webkit-scrollbar { width:3px }
        ._dbg_scroll::-webkit-scrollbar-thumb { background:#4af; border-radius:10px }
        #_monster-debug-ui button:hover { filter: brightness(1.3) }
      </style>`;

    return header + monsterPicker + inspector + attackBtns + hitboxSection + paramsSection + speedSection;
  }

  _refreshInspector() {
    if (!this.monster || !this._uiContainer) return;
    const m  = this.monster;
    const $  = id => document.getElementById(id);

    $('_dbg_state').textContent  = m._hopState ?? '—';
    $('_dbg_hp').textContent     = `${Math.ceil(m.hp)}/${m.maxHp}`;
    $('_dbg_hopt').textContent   = m._hopT?.toFixed(2) ?? '—';
    $('_dbg_attackt').textContent = m._attackT?.toFixed(2) ?? '—';
    $('_dbg_bitet').textContent  = m._biteT?.toFixed(2) ?? '—';
    $('_dbg_slamt').textContent  = m._slamT?.toFixed(2) ?? '—';
    $('_dbg_hitswing').textContent = m._hitDealtThisSwing ? '✅ HIT' : '—';

    if (m.root && this._dummy) {
      const pos  = m.root.position;
      const dp   = this._dummy.position;
      const ddx  = dp.x - pos.x;
      const ddz  = dp.z - pos.z;
      $('_dbg_disth').textContent = Math.sqrt(ddx*ddx + ddz*ddz).toFixed(1) + 'm';
    }

    if (this._lastDmgInfo) {
      const { dmg, type } = this._lastDmgInfo;
      $('_dbg_dmg').textContent = `${dmg} (${type})`;
      $('_dbg_dmg').style.color = '#f55';
    }

    // Estado → cor
    const stateColors = {
      WAIT: '#888', CROUCH: '#fa5', AIR: '#5af', LAND: '#aaa',
      BITE_WINDUP: '#f80', BITE_STRIKE: '#f22', BITE_RECOVER: '#fa5',
      QUICK_BITE: '#f44', SLAM_WINDUP: '#c6f', SLAM_AIR: '#a4f',
      SLAM_LAND: '#855', DYING: '#f00', DEAD: '#444',
    };
    $('_dbg_state').style.color = stateColors[m._hopState] ?? '#ddd';
  }

  _refreshParamSliders() {
    if (!this.monster) return;
    EDITABLE_PARAMS.forEach(p => {
      const sl  = document.getElementById(`_dbg_sl_${p.key}`);
      const val = document.getElementById(`_dbg_pv_${p.key}`);
      const v   = this.monster[p.key];
      if (sl)  sl.value = v;
      if (val) val.textContent = (v % 1 === 0 ? v : v.toFixed(2));
    });
  }

  _refreshMonsterButtons() {
    // Destaca botão do monstro atual
    MONSTER_CATALOG.forEach(e => {
      // botões rebuil ao clicar então não há ID fixo — futuro melhoria
    });
  }

  _setStatus(msg) {
    const el = document.getElementById('_dbg_status');
    if (el) el.textContent = msg ?? '';
  }
}
