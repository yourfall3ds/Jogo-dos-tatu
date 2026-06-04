// ─────────────────────────────────────────────────────────────────
//  CharacterSelectScreen — tela de seleção de personagem do TransFPS.
//
//  Fluxo: ServerListUI "Entrar" → ESTA TELA → "JOGAR" → mundo.
//
//  Layout (regra dos terços):
//    - ESQUERDA: lista vertical de cards das 7 classes (nome + emoji),
//      card selecionado com glow cyan + borda + scale.
//    - DIREITA: preview 3D (cena Babylon PRÓPRIA, isolada da principal)
//      com ArcRotateCamera (pan manual = arrastar), key light + rim light
//      cyan, disco/plataforma neon, partículas leves + luz pulsando.
//    - EMBAIXO do preview: botão JOGAR grandão.
//
//  Comportamento:
//    - Clicar card → carrega o GLB sob demanda (dispose do anterior),
//      toca idle → ataque → combo → volta idle (encadeado por onEnd),
//      e toca o som da classe (Spray = .m4a; resto = whoosh).
//    - Clicar JOGAR → avatar anda pra direita saindo, fade preto rápido,
//      mostra loading overlay e chama o fluxo de entrada no mundo, com o
//      avatar escolhido aplicado via CharacterSwapper.
//
//  Performance: avatar sob demanda, dispose ao trocar, async, sem PostFX/
//  GlowLayer (regra WebGPU). Engine Babylon própria descartada no hide().
//
//  Paleta: cyberpunk neon cyan. PROIBIDO pink/rosa.
// ─────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Resolve o nome real de uma AnimationGroup por hints (prioridade) + regex
// (fallback robusto). NUNCA retorna null se houver qualquer grupo — sempre
// devolve algo tocável pra não deixar o avatar em T-pose.
function _pickAnim(groups, hints, regex) {
  if (!groups || groups.length === 0) return null;
  const byName = (n) => groups.find(g => g.name && g.name.toLowerCase() === String(n).toLowerCase());
  // 1) hint exato (case-insensitive)
  for (const h of (hints || [])) {
    const g = byName(h);
    if (g) return g;
  }
  // 2) hint como substring
  for (const h of (hints || [])) {
    const hl = String(h).toLowerCase();
    const g = groups.find(x => x.name && x.name.toLowerCase().includes(hl));
    if (g) return g;
  }
  // 3) regex
  if (regex) {
    const g = groups.find(x => x.name && regex.test(x.name));
    if (g) return g;
  }
  return null;
}

// 7 personagens com nomes FINAIS. Cada um: idle/attack/combo por hints +
// regex resolvidos no GLB carregado.
// faceYaw: rotação Y (rad) aplicada ao root no preview pra olhar PRA CÂMERA.
//   0       = já nasce de frente.
//   Math.PI = nasce de costas → vira 180°.
// Ajustado por inspeção visual: FUBA e RONARIA apareciam de costas.
const CHARACTERS = [
  {
    id: 'abelha', name: 'ABELHA', emoji: '🐝',
    url: 'assets/characters/player.glb',
    desc: 'Rato padrão · equilibrado',
    // anims EXATAS (player.glb): Idle_5 / Archery_Shot_1 / Archery_Shot_3 / Walking
    idleHints: ['Idle_5', 'Idle'],
    attackHints: ['Archery_Shot_1', 'Archery_Shot', 'Shot'],
    comboHints: ['Archery_Shot_3', 'Run_and_Shoot'],
    walkHints: ['Walking', 'Walk'],
    faceYaw: 0,
    sound: 'ui_select',
  },
  {
    id: 'dandan', name: 'DAN DAN', emoji: '⚔️',
    url: 'assets/characters/dark_warrior_aaa_ready.glb',
    desc: 'Guerreiro sombrio · ataque pesado',
    // anims EXATAS (dark_warrior): Standing Idle Looking Ver. 1 / Attack Horizontal / Attack 360 Low / Boss-Walking
    idleHints: ['Standing Idle Looking Ver. 1', 'Standing Idle Looking', 'Idle'],
    attackHints: ['Attack Horizontal', 'Attack'],
    comboHints: ['Attack 360 Low', '360'],
    walkHints: ['Boss-Walking', 'Walking', 'Walk'],
    faceYaw: 0,
    sound: 'ui_select',
  },
  {
    id: 'candao', name: 'CANDAO', emoji: '🪓',
    url: 'assets/characters/orc_warrior_ready.glb',
    desc: 'Orc bruto · força máxima',
    // anims EXATAS (orc): Armature|Orc_Ideal / Armature|Orc_Punch / Armature|Jumping_Jack / Armature|Orc_Walk
    idleHints: ['Armature|Orc_Ideal', 'Orc_Ideal', 'Idle'],
    attackHints: ['Armature|Orc_Punch', 'Orc_Punch', 'Punch'],
    comboHints: ['Armature|Jumping_Jack', 'Jumping_Jack', 'Armature|Orc_Punch', 'Orc_Punch'],
    walkHints: ['Armature|Orc_Walk', 'Orc_Walk', 'Walk'],
    faceYaw: 0,
    sound: 'ui_select',
  },
  {
    id: 'ronaria', name: 'RONARIA', emoji: '🏹',
    url: 'assets/characters/cleric_priestess48_ready.glb',
    desc: 'Caçadora · à distância',
    // anims EXATAS (cleric): Idle.001 (EM PÉ, não Crouch) / Fire / Standing Purify / Walk.002
    idleHints: ['Idle.001', 'Idle'],
    attackHints: ['Fire'],
    comboHints: ['Standing Purify', 'Purify'],
    walkHints: ['Walk.002', 'Walk'],
    faceYaw: Math.PI,   // apareceu de costas
    sound: 'ui_select',
  },
  {
    id: 'fuba', name: 'FUBA', emoji: '🔮',
    url: 'assets/characters/mage_oldwizard_ready.glb',
    desc: 'Mago · poder arcano',
    // anims EXATAS (mage): idle / attack / death / run / walk (só UM ataque)
    idleHints: ['idle'],
    attackHints: ['attack'],
    comboHints: ['attack'],
    walkHints: ['walk'],
    faceYaw: Math.PI,   // apareceu de costas
    sound: 'ui_select',
  },
  {
    id: 'spray', name: 'SPRAY-BNOOKKER', emoji: '🦎',
    url: 'assets/characters/lizard_monster_ready.glb',
    desc: 'Monstro lagarto · brutal',
    // anims EXATAS (lizard): SEM idle/death → Walking como pose neutra. Right_Hand_Sword_Slash / Punch_Combo_5
    idleHints: ['Walking', 'Walk'],
    attackHints: ['Right_Hand_Sword_Slash', 'Slash'],
    comboHints: ['Punch_Combo_5', 'Combo', 'Punch'],
    walkHints: ['Walking', 'Walk', 'Running'],
    faceYaw: 0,
    sound: 'spray_bnookker',
  },
];

// Fallbacks regex. RE_IDLE inclui 'ideal' (orc) e 'walk' (spray sem idle).
// NUNCA casa T-pose nem death — só poses neutras/locomoção parada.
const RE_IDLE = /idle|ideal|stand|walk/i;
const RE_ATTACK = /attack|punch|slash|fire|shot/i;
const RE_COMBO = /combo|spin|360|purify|jumping_jack/i;

import { injectGameUI } from './GameUIKit.js';

const CYAN = '#2effb6';
const CYAN_RGB = '46,255,182';
// Fontes sci-fi do GameUIKit (consistencia com as outras telas de menu).
const FONT_HEAD = "'Share Tech Mono','Fira Code',monospace";
const FONT_BODY = "'Fira Code','Share Tech Mono',monospace";

export class CharacterSelectScreen {
  constructor(opts = {}) {
    this.cs = opts.cs || null;
    this.swapper = opts.swapper || null;
    this._onPlay = null;
    this._open = false;
    this._selectedId = 'abelha';

    // Sub-engine Babylon isolada (não toca a cena principal).
    this._previewEngine = null;
    this._previewScene = null;
    this._previewCamera = null;
    this._previewMesh = null;
    this._previewAnims = null;       // { idle, attack, combo, walk }
    this._previewGroups = [];        // todos os AnimationGroups do GLB atual
    this._disc = null;
    this._keyLight = null;
    this._rimLight = null;
    this._particles = null;
    this._loadToken = 0;             // invalida loads concorrentes
    this._userInteracting = false;
    this._t = 0;                     // tempo p/ luz pulsante

    this._build();
  }

  _build() {
    injectGameUI();   // garante tokens/fontes do kit (idempotente)
    const el = document.createElement('div');
    el.id = 'char-select-screen';
    el.style.cssText = `
      position:fixed; inset:0; z-index:480; display:none;
      background:radial-gradient(ellipse at 35% 40%, #0a1230 0%, #050816 55%, #01020a 100%);
      color:#dfeaf2; font-family:${FONT_BODY};
      opacity:0; transition:opacity .25s ease;
    `;
    el.innerHTML = `
      <!-- vinheta -->
      <div style="position:absolute; inset:0; pointer-events:none;
                  box-shadow:inset 0 0 240px 60px rgba(0,0,0,0.85);"></div>

      <header style="position:relative; display:flex; align-items:center; justify-content:space-between;
                     padding:16px 28px; border-bottom:1px solid rgba(${CYAN_RGB},0.22);">
        <span style="font:400 18px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:6px; color:${CYAN};
                     text-shadow:0 0 16px rgba(${CYAN_RGB},0.5);">SELECIONE SEU OPERADOR</span>
        <span id="css-back" style="cursor:pointer; opacity:0.55; font:400 12px ${FONT_HEAD};
                     text-transform:uppercase; letter-spacing:2px;">&larr; VOLTAR (Esc)</span>
      </header>

      <div style="position:relative; display:flex; height:calc(100% - 58px);">
        <!-- ESQUERDA: cards -->
        <aside id="css-list" style="
          flex:0 0 320px; padding:18px 16px; overflow-y:auto;
          display:flex; flex-direction:column; gap:10px;
          border-right:1px solid rgba(${CYAN_RGB},0.12);
          background:linear-gradient(90deg, rgba(0,0,0,0.5), rgba(0,0,0,0.15));
        "></aside>

        <!-- DIREITA: preview + JOGAR -->
        <main style="flex:1; position:relative; display:flex; flex-direction:column;">
          <canvas id="css-canvas" style="flex:1; width:100%; height:100%;
                  cursor:grab; outline:none; display:block;"></canvas>

          <!-- nome grande sobre a base do preview -->
          <div style="position:absolute; left:0; right:0; bottom:104px; text-align:center;
                      pointer-events:none;">
            <div id="css-name" style="font:400 46px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:8px;
                 color:#fff; text-shadow:0 0 24px rgba(${CYAN_RGB},0.6), 0 4px 12px #000;">—</div>
            <div id="css-desc" style="font:500 14px ${FONT_BODY}; letter-spacing:2px; opacity:0.7;
                 margin-top:4px; color:${CYAN};">—</div>
          </div>

          <!-- botão JOGAR -->
          <div style="position:absolute; left:0; right:0; bottom:24px; display:flex;
                      justify-content:center; pointer-events:none;">
            <button id="css-play" style="pointer-events:auto;
              background:linear-gradient(180deg, ${CYAN}, #1bbf8a);
              color:#04101a; border:0;
              padding:16px 64px; font:400 20px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:6px;
              cursor:pointer; box-shadow:0 0 28px rgba(${CYAN_RGB},0.45), inset 0 0 14px rgba(255,255,255,0.3);
              clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px);
              transition:transform .12s, box-shadow .25s;">JOGAR</button>
          </div>

          <div style="position:absolute; bottom:6px; right:16px; opacity:0.4;
                      font:600 10px monospace; pointer-events:none;">
            arrastar = girar · scroll = zoom
          </div>
        </main>
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._listEl = el.querySelector('#css-list');
    this._canvas = el.querySelector('#css-canvas');
    this._nameEl = el.querySelector('#css-name');
    this._descEl = el.querySelector('#css-desc');
    this._playBtn = el.querySelector('#css-play');

    el.querySelector('#css-back').onclick = () => this.hide();
    this._playBtn.onclick = () => this._play();
    this._playBtn.onmouseenter = () => {
      this._playBtn.style.transform = 'scale(1.05)';
      this._playBtn.style.boxShadow = `0 0 40px rgba(${CYAN_RGB},0.7)`;
    };
    this._playBtn.onmouseleave = () => {
      this._playBtn.style.transform = '';
      this._playBtn.style.boxShadow = `0 0 28px rgba(${CYAN_RGB},0.45)`;
    };

    this._keyHandler = (e) => {
      if (!this._open) return;
      if (e.key === 'Escape') this.hide();
    };
    document.addEventListener('keydown', this._keyHandler);

    this._renderCards();
  }

  _renderCards() {
    this._listEl.innerHTML = CHARACTERS.map(c => {
      const sel = c.id === this._selectedId;
      return `
        <div data-id="${_esc(c.id)}" class="css-card" style="
          background:${sel ? `rgba(${CYAN_RGB},0.16)` : 'rgba(0,0,0,0.42)'};
          border:1px solid ${sel ? CYAN : 'rgba(255,255,255,0.08)'};
          border-radius:9px; padding:15px 16px; cursor:pointer;
          transition:transform .14s, box-shadow .2s, border-color .2s, background .2s;
          transform:${sel ? 'scale(1.04)' : 'scale(1)'};
          box-shadow:${sel ? `0 0 18px rgba(${CYAN_RGB},0.5)` : 'none'};
          display:flex; align-items:center; gap:14px;
        ">
          <span style="font-size:30px; filter:drop-shadow(0 0 6px rgba(${CYAN_RGB},0.4));">${c.emoji}</span>
          <div style="min-width:0;">
            <div style="font:400 17px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:2px;
                 color:${sel ? CYAN : '#eaffff'};">${_esc(c.name)}</div>
            <div style="font:500 11px ${FONT_BODY}; opacity:0.6; margin-top:3px;">${_esc(c.desc)}</div>
          </div>
        </div>
      `;
    }).join('');

    this._listEl.querySelectorAll('.css-card').forEach(row => {
      const id = row.getAttribute('data-id');
      row.onclick = () => this._select(id);
      row.onmouseenter = () => {
        if (id !== this._selectedId) {
          row.style.borderColor = `rgba(${CYAN_RGB},0.4)`;
          row.style.transform = 'scale(1.02)';
        }
      };
      row.onmouseleave = () => {
        if (id !== this._selectedId) {
          row.style.borderColor = 'rgba(255,255,255,0.08)';
          row.style.transform = 'scale(1)';
        }
      };
    });
  }

  // ── Cena 3D de preview (engine Babylon própria) ──────────────────
  _ensureScene() {
    if (this._previewScene) return;
    if (typeof BABYLON === 'undefined') {
      console.warn('[CharSelectScreen] BABYLON ausente');
      return;
    }
    try {
      this._previewEngine = new BABYLON.Engine(this._canvas, true, {
        preserveDrawingBuffer: true, stencil: true, antialias: true,
      });
      const scene = new BABYLON.Scene(this._previewEngine);
      scene.clearColor = new BABYLON.Color4(0.02, 0.04, 0.08, 1);
      this._previewScene = scene;

      // Câmera: mira ~60% da altura (heroico), pan manual = arrastar.
      const cam = new BABYLON.ArcRotateCamera('cssCam',
        -Math.PI / 2.2, Math.PI / 2.15, 4.2,
        new BABYLON.Vector3(0, 1.05, 0), scene);
      cam.attachControl(this._canvas, true);
      cam.lowerRadiusLimit = 2.2;
      cam.upperRadiusLimit = 8;
      cam.lowerBetaLimit = 0.6;
      cam.upperBetaLimit = Math.PI / 1.85;
      cam.wheelDeltaPercentage = 0.012;
      cam.panningSensibility = 0;       // sem pan-translate; arrastar só gira
      cam.inertia = 0.9;                // giro pesado/premium
      this._previewCamera = cam;

      // ── 3 luzes de estúdio ──
      const hemi = new BABYLON.HemisphericLight('cssHemi', new BABYLON.Vector3(0, 1, 0), scene);
      hemi.intensity = 0.28;
      hemi.diffuse = new BABYLON.Color3(0.7, 0.85, 1);

      const key = new BABYLON.DirectionalLight('cssKey', new BABYLON.Vector3(-0.6, -1.2, -0.8), scene);
      key.intensity = 1.05;
      key.diffuse = new BABYLON.Color3(1, 0.98, 0.92);
      this._keyLight = key;

      // RIM cyan vinda de TRÁS: recorta a silhueta.
      const rim = new BABYLON.DirectionalLight('cssRim', new BABYLON.Vector3(0.4, -0.3, 1), scene);
      rim.intensity = 0.75;
      rim.diffuse = new BABYLON.Color3(0.18, 1, 0.72);
      this._rimLight = rim;

      // ── Disco/plataforma neon embaixo ──
      const disc = BABYLON.MeshBuilder.CreateDisc('cssDisc', { radius: 1.5, tessellation: 64 }, scene);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.001;
      const dmat = new BABYLON.StandardMaterial('cssDiscMat', scene);
      dmat.emissiveColor = new BABYLON.Color3(0.05, 0.55, 0.42);
      dmat.diffuseColor = new BABYLON.Color3(0.02, 0.1, 0.12);
      dmat.specularColor = new BABYLON.Color3(0, 0, 0);
      dmat.alpha = 0.55;
      disc.material = dmat;
      this._disc = disc;

      // ── Partículas leves flutuando (barato) ──
      try {
        const ps = new BABYLON.ParticleSystem('cssParticles', 120, scene);
        // textura procedural: pontinho. Usa DynamicTexture pra não depender de asset.
        const dt = new BABYLON.DynamicTexture('cssPx', 8, scene, false);
        const ctx = dt.getContext();
        ctx.fillStyle = 'rgba(120,255,220,1)';
        ctx.beginPath(); ctx.arc(4, 4, 3, 0, Math.PI * 2); ctx.fill();
        dt.update();
        ps.particleTexture = dt;
        ps.emitter = new BABYLON.Vector3(0, 1, 0);
        ps.minEmitBox = new BABYLON.Vector3(-2.5, -0.5, -2.5);
        ps.maxEmitBox = new BABYLON.Vector3(2.5, 3, 2.5);
        ps.color1 = new BABYLON.Color4(0.18, 1, 0.72, 0.5);
        ps.color2 = new BABYLON.Color4(0.1, 0.8, 1, 0.4);
        ps.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        ps.minSize = 0.02; ps.maxSize = 0.06;
        ps.minLifeTime = 3; ps.maxLifeTime = 6;
        ps.emitRate = 22;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        ps.gravity = new BABYLON.Vector3(0, 0.04, 0);
        ps.direction1 = new BABYLON.Vector3(-0.1, 0.15, -0.1);
        ps.direction2 = new BABYLON.Vector3(0.1, 0.3, 0.1);
        ps.minEmitPower = 0.05; ps.maxEmitPower = 0.15;
        ps.start();
        this._particles = ps;
      } catch (e) { console.warn('[CharSelectScreen] particles:', e); }

      // Render loop + disco girando + luz pulsando.
      this._previewEngine.runRenderLoop(() => {
        const s = this._previewScene;
        if (!s || s.isDisposed) return;
        this._t += 0.016;
        if (this._disc && !this._disc.isDisposed) this._disc.rotation.z += 0.004;
        if (this._rimLight) this._rimLight.intensity = 0.62 + Math.sin(this._t * 1.6) * 0.18;
        // auto-rotate leve quando o usuário não está girando
        if (this._previewMesh && !this._userInteracting && !this._previewMesh.isDisposed) {
          this._previewMesh.rotation.y += 0.0035;
        }
        s.render();
      });

      // Pausa auto-rotate enquanto arrasta.
      this._canvas.addEventListener('pointerdown', () => {
        this._userInteracting = true;
        this._canvas.style.cursor = 'grabbing';
      });
      const release = () => {
        this._canvas.style.cursor = 'grab';
        clearTimeout(this._interactT);
        this._interactT = setTimeout(() => { this._userInteracting = false; }, 2200);
      };
      this._canvas.addEventListener('pointerup', release);
      this._canvas.addEventListener('pointerleave', release);

      this._ro = new ResizeObserver(() => {
        try { this._previewEngine?.resize(); } catch (_) {}
      });
      this._ro.observe(this._canvas);
    } catch (e) {
      console.warn('[CharSelectScreen] scene init:', e);
    }
  }

  async _select(id) {
    const c = CHARACTERS.find(x => x.id === id);
    if (!c) return;
    const changed = id !== this._selectedId || !this._previewMesh;
    this._selectedId = id;
    this._renderCards();
    this._nameEl.textContent = c.name;
    this._descEl.textContent = c.desc;

    if (changed) {
      await this._loadAvatar(c);
      // som da classe
      this._playSound(c.sound);
      // sequência idle → ataque → combo → idle
      this._playSequence();
    }
  }

  _playSound(id) {
    try {
      const sm = window._gamePlayer?.sounds || window._soundManager;
      if (!sm?.playNow || !id) return;
      // Voz dos personagens ALTA. Spray-Bnookker fala o nome: +35% (1.3).
      // Os outros (ui_select/whoosh) tambem altos pra dar impacto.
      const vol = id === 'spray_bnookker' ? 1.3 : 1.0;
      sm.playNow(id, vol);
    } catch (e) { console.warn('[CharSelectScreen] sound:', e); }
  }

  async _loadAvatar(c) {
    this._ensureScene();
    if (!this._previewScene) return;
    const token = ++this._loadToken;

    // dispose do anterior
    if (this._previewMesh) {
      try { this._previewMesh.dispose(false, true); } catch (_) {}
      this._previewMesh = null;
    }
    if (this._previewGroups?.length) {
      for (const g of this._previewGroups) { try { g.dispose(); } catch (_) {} }
    }
    this._previewGroups = [];
    this._previewAnims = null;

    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', c.url, this._previewScene);
      if (token !== this._loadToken) {
        // outro select disparou no meio — descarta este
        try { result.meshes?.[0]?.dispose(false, true); } catch (_) {}
        for (const g of (result.animationGroups || [])) { try { g.dispose(); } catch (_) {} }
        return;
      }
      const meshes = result.meshes || [];
      if (meshes.length === 0) return;

      let root = meshes.find(m => !m.parent && m.getChildren?.().length > 0) || meshes[0];

      // re-fit por bbox → altura-alvo FIXA, pé no chão, centrado.
      // CRÍTICO: forçar computeWorldMatrix(true) em TODA a hierarquia ANTES de
      // medir — senão o bbox vem com escala errada (o FUBÁ vinha gigante porque
      // getHierarchyBoundingVectors mediu antes das matrizes assentarem).
      try {
        root.scaling.set(1, 1, 1); root.position.set(0, 0, 0);
        meshes.forEach(m => { try { m.computeWorldMatrix(true); } catch (_) {} });
        root.computeWorldMatrix(true);
      } catch (_) {}
      const bb = root.getHierarchyBoundingVectors(true);
      const size = bb.max.subtract(bb.min);
      // Usa SÓ a altura (Y) como referência — humanóide em pé deve ter ~1.8m de
      // ALTURA, independente de braços abertos (que inflariam o maxDim e
      // encolheriam o boneco). Clamp pra nunca explodir.
      const heightY = Math.max(0.1, size.y);
      let scale = 1.8 / heightY;
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      scale = Math.max(0.001, Math.min(scale, 100));
      root.scaling.set(scale, scale, scale);
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      root.position.set(-cx * scale, -bb.min.y * scale, -cz * scale);
      root.rotation = new BABYLON.Vector3(0, 0, 0);
      this._previewMesh = root;

      // orientação: vira o root pra olhar PRA CÂMERA (faceYaw por avatar).
      // FUBA e RONARIA nascem de costas → faceYaw = Math.PI.
      try { root.rotation.y = (typeof c.faceYaw === 'number') ? c.faceYaw : 0; } catch (_) {}

      // resolve anims por hints EXATOS (perfil) + substring + regex.
      const groups = result.animationGroups || [];
      this._previewGroups = groups;
      groups.forEach(g => { try { g.stop(); } catch (_) {} });

      // Fallback de IDLE BLINDADO: nunca pega cegamente groups[0] (pode ser
      // T-pose/death/ataque). Procura primeiro algo neutro (idle/walk/stand),
      // excluindo explicitamente t-pose e morte; só então cai pra groups[0].
      const RE_BAD = /t.?pose|death|dying|die|dead/i;
      const neutralFallback = () =>
        groups.find(g => g.name && RE_IDLE.test(g.name) && !RE_BAD.test(g.name)) ||
        groups.find(g => g.name && !RE_BAD.test(g.name)) ||
        groups[0] || null;

      const idle = _pickAnim(groups, c.idleHints, RE_IDLE) || neutralFallback();
      const attack = _pickAnim(groups, c.attackHints, RE_ATTACK) || idle;
      const combo = _pickAnim(groups, c.comboHints, RE_COMBO) || attack;
      const walk = _pickAnim(groups, c.walkHints || ['walk', 'walking', 'run', 'move'], /walk|run|move/i) || idle;
      this._previewAnims = { idle, attack, combo, walk };

      // garante que NUNCA fica em T-pose: já deixa o idle rodando.
      if (idle) { try { idle.start(true); } catch (_) {} }
    } catch (e) {
      console.warn('[CharSelectScreen] load avatar:', c.url, e);
    }
  }

  // idle → ataque (1x) → combo (1x) → idle (loop), encadeado por onEnd.
  _playSequence() {
    const a = this._previewAnims;
    if (!a) return;
    const { idle, attack, combo } = a;
    const stopAll = () => this._previewGroups.forEach(g => { try { g.stop(); } catch (_) {} });

    const toIdle = () => {
      stopAll();
      if (idle) { try { idle.start(true); } catch (_) {} }
    };
    const playOnce = (grp, next) => {
      if (!grp || grp === idle) { next(); return; }
      stopAll();
      try {
        grp.onAnimationGroupEndObservable.addOnce(() => next());
        grp.start(false);
      } catch (_) { next(); }
    };

    // idle breve → attack → combo → idle loop
    stopAll();
    if (idle) { try { idle.start(true); } catch (_) {} }
    clearTimeout(this._seqT);
    this._seqT = setTimeout(() => {
      playOnce(attack, () => playOnce(combo, () => toIdle()));
    }, 450);
  }

  // ── JOGAR: avatar anda pra direita + fade preto + entra no mundo ──
  async _play() {
    if (this._playing) return;
    this._playing = true;
    const c = CHARACTERS.find(x => x.id === this._selectedId) || CHARACTERS[0];

    // anim de walk + desliza pra direita saindo da tela
    try {
      const a = this._previewAnims;
      if (a) {
        this._previewGroups.forEach(g => { try { g.stop(); } catch (_) {} });
        if (a.walk) { try { a.walk.start(true); } catch (_) {} }
      }
      const mesh = this._previewMesh;
      if (mesh && !mesh.isDisposed) {
        mesh.rotation.y = Math.PI / 2;  // vira pra direita
        const startX = mesh.position.x;
        const t0 = performance.now();
        const slide = () => {
          const k = Math.min(1, (performance.now() - t0) / 700);
          if (mesh && !mesh.isDisposed) mesh.position.x = startX + k * 6;
          if (k < 1 && this._playing) requestAnimationFrame(slide);
        };
        requestAnimationFrame(slide);
      }
    } catch (e) { console.warn('[CharSelectScreen] play anim:', e); }

    // fade preto rápido (~400ms)
    const fade = document.createElement('div');
    fade.style.cssText = `
      position:fixed; inset:0; z-index:600; background:#000;
      opacity:0; transition:opacity .4s ease; pointer-events:none;`;
    document.body.appendChild(fade);
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    await new Promise(r => setTimeout(r, 420));

    // esconde a tela (descarta engine 3D)
    this.hide();

    // mostra loading e chama o fluxo de entrada com o avatar escolhido
    try {
      const cb = this._onPlay;
      this._onPlay = null;
      if (cb) await cb(c);
    } catch (e) {
      console.error('[CharSelectScreen] onPlay:', e);
      try { window._loadingOverlay?.hide(); } catch (_) {}
    } finally {
      // remove o fade após a transição
      setTimeout(() => { try { fade.remove(); } catch (_) {} }, 600);
      this._playing = false;
    }
  }

  // ── API pública ──────────────────────────────────────────────────
  // show(onPlay): onPlay(character) é chamado ao clicar JOGAR (após o fade).
  // character = { id, name, url, ... }
  show(onPlay) {
    if (this._open) return;
    this._onPlay = onPlay || null;
    this._open = true;
    this._playing = false;
    this._el.style.display = 'block';
    // força reflow → transição de opacity
    void this._el.offsetWidth;
    this._el.style.opacity = '1';
    // carrega o selecionado (lazy). ABELHA por padrão se nada escolhido.
    if (!CHARACTERS.find(c => c.id === this._selectedId)) this._selectedId = 'abelha';
    setTimeout(() => {
      this._ensureScene();
      // força (re)carga mesmo se id igual (cena nova após hide).
      const id = this._selectedId;
      this._selectedId = '__none__';
      this._select(id);
    }, 60);
  }

  hide() {
    if (!this._open) return;
    this._open = false;
    this._el.style.opacity = '0';
    setTimeout(() => { if (!this._open) this._el.style.display = 'none'; }, 250);
    this._disposeScene();
  }

  _disposeScene() {
    clearTimeout(this._seqT);
    if (this._particles) { try { this._particles.dispose(); } catch (_) {} this._particles = null; }
    if (this._previewMesh) { try { this._previewMesh.dispose(false, true); } catch (_) {} this._previewMesh = null; }
    if (this._ro) { try { this._ro.disconnect(); } catch (_) {} this._ro = null; }
    if (this._previewScene) { try { this._previewScene.dispose(); } catch (_) {} this._previewScene = null; }
    if (this._previewEngine) {
      try { this._previewEngine.stopRenderLoop(); } catch (_) {}
      try { this._previewEngine.dispose(); } catch (_) {}
      this._previewEngine = null;
    }
    this._previewCamera = null;
    this._previewGroups = [];
    this._previewAnims = null;
    this._keyLight = null;
    this._rimLight = null;
    this._disc = null;
  }

  dispose() {
    this.hide();
    this._disposeScene();
    try { document.removeEventListener('keydown', this._keyHandler); } catch (_) {}
    try { this._el?.remove(); } catch (_) {}
    this._el = null;
  }
}
