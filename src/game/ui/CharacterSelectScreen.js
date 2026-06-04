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

// ─────────────────────────────────────────────────────────────────
//  THEMES — tema imersivo por classe na TELA DE SELEÇÃO.
//
//  Ao escolher um personagem a tela inteira (SÓ ela, nunca o jogo)
//  vira temática: fundo de bioma (foto blur + overlay escuro), cor de
//  acento (--css-theme), decoração que CRESCE de baixo pra cima
//  (CSS/emoji, scale 0→1 com stagger) e um loop de som ambiente baixo.
//  Tudo crossfade suave ao trocar de card; decor antiga é limpa.
//
//  Cada tema:
//    color    — cor de acento principal (hex)
//    color2   — cor secundária (glow/gradiente)
//    rgb      — 'r,g,b' da cor principal (pra rgba() em sombras)
//    bg       — caminho da foto do bioma (assets/ui/biomes/*)
//    bgGrad   — gradiente CSS de FALLBACK se a imagem não carregar
//    decor    — { glyphs:[emoji...], floor:bool } itens que crescem
//    sound    — id de loop ambiente registrado no SoundManager
// ─────────────────────────────────────────────────────────────────
const THEMES = {
  // SPRAY-BNOOKKER (lagarto) — PÂNTANO
  spray: {
    color: '#3fa847', color2: '#2a7a3a', rgb: '63,168,71',
    bg: 'assets/ui/biomes/pantano.jpg',
    bgGrad: 'radial-gradient(ellipse at 40% 35%, #16331a 0%, #0a1d0e 55%, #03080a 100%)',
    decor: { glyphs: ['🌿', '🍃', '🌱', '🪴', '🌾'], floor: true },
    sound: 'amb_swamp',
  },
  // FUBA (mago) — INFERNO
  fuba: {
    color: '#ff3a2a', color2: '#c41200', rgb: '255,58,42',
    bg: 'assets/ui/biomes/inferno.jpg',
    bgGrad: 'radial-gradient(ellipse at 50% 80%, #5a0a02 0%, #2a0500 55%, #0a0200 100%)',
    decor: { glyphs: ['🔥', '🔥', '✦', '🔥', '☄️'], floor: true },
    sound: 'amb_fire',
  },
  // DAN DAN (guerreiro) — MASMORRA
  dandan: {
    color: '#8a5cff', color2: '#26e0e0', rgb: '138,92,255',
    bg: 'assets/ui/biomes/masmorra.jpg',
    bgGrad: 'radial-gradient(ellipse at 50% 40%, #1b1430 0%, #0c0a1a 55%, #03020a 100%)',
    decor: { glyphs: ['⚔️', '🗡️', '🛡️', '⛓️', '🗝️'], floor: false },
    sound: 'amb_cave',
  },
  // CANDAO (orc) — ACAMPAMENTO bárbaro
  candao: {
    color: '#ff8a1e', color2: '#ff4d00', rgb: '255,138,30',
    bg: 'assets/ui/biomes/acampamento.jpg',
    bgGrad: 'radial-gradient(ellipse at 50% 75%, #3a1a05 0%, #1f0f02 55%, #0a0500 100%)',
    decor: { glyphs: ['🔥', '🪵', '🏕️', '🔥', '🦴'], floor: true },
    sound: 'amb_drums',
  },
  // RONARIA (caçadora) — FLORESTA
  ronaria: {
    color: '#6fe05a', color2: '#2fa84a', rgb: '111,224,90',
    bg: 'assets/ui/biomes/floresta.jpg',
    bgGrad: 'radial-gradient(ellipse at 40% 40%, #16331f 0%, #0a1d12 55%, #03080a 100%)',
    decor: { glyphs: ['🌲', '🍃', '🌿', '🪶', '🍂'], floor: true },
    sound: 'amb_swamp',
  },
  // ABELHA (rato) — CAMPO
  abelha: {
    color: '#ffd23a', color2: '#ffa000', rgb: '255,210,58',
    bg: 'assets/ui/biomes/campo.jpg',
    bgGrad: 'radial-gradient(ellipse at 45% 40%, #3a3208 0%, #1f1b04 55%, #0a0800 100%)',
    decor: { glyphs: ['🌼', '🐝', '🌸', '🌻', '🍀'], floor: true },
    sound: 'amb_swamp',
  },
};
const DEFAULT_THEME = {
  color: '#2effb6', color2: '#1bbf8a', rgb: '46,255,182',
  bg: null, bgGrad: 'radial-gradient(ellipse at 35% 40%, #0a1230 0%, #050816 55%, #01020a 100%)',
  decor: { glyphs: [], floor: false }, sound: null,
};

// Fallbacks regex. RE_IDLE inclui 'ideal' (orc) e 'walk' (spray sem idle).
// NUNCA casa T-pose nem death — só poses neutras/locomoção parada.
const RE_IDLE = /idle|ideal|stand|walk/i;
const RE_ATTACK = /attack|punch|slash|fire|shot/i;
const RE_COMBO = /combo|spin|360|purify|jumping_jack/i;

import { injectGameUI, ambientBackdrop } from './GameUIKit.js';

const CYAN = '#2effb6';
const CYAN_RGB = '46,255,182';

// CSS do sistema de tema (injetado 1x). Usa --css-theme/--css-theme2/
// --css-rgb trocados por JS pra recolorir acentos sem reflow de layout.
const THEME_STYLE_ID = 'css-theme-style';
function injectThemeCSS() {
  if (typeof document === 'undefined' || document.getElementById(THEME_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = THEME_STYLE_ID;
  st.textContent = `
    /* dois layers de fundo de bioma p/ crossfade (troca o ativo) */
    .css-biome {
      position:absolute; inset:0; pointer-events:none; z-index:0;
      background-size:cover; background-position:center;
      filter:blur(7px) brightness(0.5) saturate(1.15);
      transform:scale(1.08); opacity:0;
      transition:opacity .42s ease;
    }
    /* overlay escuro p/ legibilidade sobre a foto */
    .css-biome-overlay {
      position:absolute; inset:0; pointer-events:none; z-index:1;
      background:linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.78) 100%);
    }
    /* camada de decoração que cresce (acima do fundo, abaixo do conteúdo) */
    .css-decor-layer {
      position:absolute; inset:0; pointer-events:none; z-index:2; overflow:hidden;
    }
    .css-decor {
      position:absolute; bottom:0; transform-origin:bottom center;
      transform:scale(0) translateY(20px); opacity:0;
      filter:drop-shadow(0 2px 10px rgba(var(--css-rgb,46,255,182),0.45));
      animation:cssGrow .62s cubic-bezier(.2,1.2,.3,1) forwards,
                cssSway 4.5s ease-in-out infinite;
      will-change:transform, opacity;
    }
    @keyframes cssGrow {
      0%   { transform:scale(0) translateY(24px); opacity:0; }
      70%  { opacity:1; }
      100% { transform:scale(1) translateY(0); opacity:0.95; }
    }
    @keyframes cssSway {
      0%,100% { rotate:-3deg; } 50% { rotate:3deg; }
    }
    .css-decor.css-out {
      animation:cssShrink .3s ease forwards;
    }
    @keyframes cssShrink {
      to { transform:scale(0) translateY(20px); opacity:0; }
    }
  `;
  (document.head || document.documentElement).appendChild(st);
}
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

    // ── Estado do sistema de TEMA por classe ──
    this._currentAmbient = null;     // id do loop ambiente tocando agora
    this._currentDecor = [];         // elementos de decoração ativos (limpar ao trocar)
    this._themeColorRGB = CYAN_RGB;  // cor de acento atual (string 'r,g,b')

    this._build();
  }

  _build() {
    injectGameUI();   // garante tokens/fontes do kit (idempotente)
    injectThemeCSS(); // keyframes + vars do sistema de tema (idempotente)
    const el = document.createElement('div');
    el.id = 'char-select-screen';
    el.style.cssText = `
      position:fixed; inset:0; z-index:480; display:none;
      background:radial-gradient(ellipse at 35% 40%, #0a1230 0%, #050816 55%, #01020a 100%);
      color:#dfeaf2; font-family:${FONT_BODY};
      opacity:0; transition:opacity .25s ease;
      --css-theme:${CYAN}; --css-theme2:#1bbf8a; --css-rgb:${CYAN_RGB};
    `;
    el.innerHTML = `
      <!-- vinheta -->
      <div style="position:absolute; inset:0; pointer-events:none;
                  box-shadow:inset 0 0 240px 60px rgba(0,0,0,0.85);"></div>

      <header style="position:relative; z-index:5; display:flex; align-items:center; justify-content:space-between;
                     padding:16px 28px; border-bottom:1px solid rgba(${CYAN_RGB},0.22);">
        <span style="font:400 18px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:6px; color:${CYAN};
                     text-shadow:0 0 16px rgba(${CYAN_RGB},0.5);">SELECIONE SEU OPERADOR</span>
        <span id="css-back" style="cursor:pointer; opacity:0.55; font:400 12px ${FONT_HEAD};
                     text-transform:uppercase; letter-spacing:2px;">&larr; VOLTAR (Esc)</span>
      </header>

      <div style="position:relative; z-index:5; display:flex; height:calc(100% - 58px);">
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
    // ── Camadas de TEMA (fundo de bioma crossfade + decoração) ──
    //  Inseridas ANTES do ambientBackdrop pra ficarem no fundo de tudo;
    //  os painéis/canvas têm z-index maior e continuam por cima.
    const biomeA = document.createElement('div'); biomeA.className = 'css-biome';
    const biomeB = document.createElement('div'); biomeB.className = 'css-biome';
    const biomeOv = document.createElement('div'); biomeOv.className = 'css-biome-overlay';
    biomeOv.style.opacity = '0';
    biomeOv.style.transition = 'opacity .42s ease';
    const decorLayer = document.createElement('div'); decorLayer.className = 'css-decor-layer';
    el.insertBefore(decorLayer, el.firstChild);
    el.insertBefore(biomeOv, el.firstChild);
    el.insertBefore(biomeB, el.firstChild);
    el.insertBefore(biomeA, el.firstChild);
    this._biomeLayers = [biomeA, biomeB];
    this._biomeOverlay = biomeOv;
    this._activeBiome = 0;
    this._decorLayer = decorLayer;

    // Fundo de jogo com profundidade atras dos paineis (grid/scanlines/glow/
    // particulas). O canvas 3D (opaco) cobre o lado direito normalmente.
    // particles baixo (10) pra nao competir com o preview 3D.
    // z-index 1 + insertBefore as biome layers → grid/partículas ficam
    // POR CIMA da foto do bioma (que está em z-index 0, no fundo de tudo).
    const amb = ambientBackdrop({ particles: 10, scanlines: false });
    amb.style.zIndex = '1';
    el.insertBefore(amb, el.firstChild);

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
      this._playBtn.style.boxShadow = `0 0 40px rgba(${this._themeColorRGB || CYAN_RGB},0.7)`;
    };
    this._playBtn.onmouseleave = () => {
      this._playBtn.style.transform = '';
      this._playBtn.style.boxShadow =
        `0 0 28px rgba(${this._themeColorRGB || CYAN_RGB},0.5), inset 0 0 14px rgba(255,255,255,0.3)`;
    };

    this._keyHandler = (e) => {
      if (!this._open) return;
      if (e.key === 'Escape') this.hide();
    };
    document.addEventListener('keydown', this._keyHandler);

    this._renderCards();
  }

  _renderCards() {
    // cor de acento ATUAL (tema da classe selecionada) — cards recolorem junto.
    const TRGB = this._themeColorRGB || CYAN_RGB;
    const TCOL = `rgb(${TRGB})`;
    this._listEl.innerHTML = CHARACTERS.map(c => {
      const sel = c.id === this._selectedId;
      return `
        <div data-id="${_esc(c.id)}" class="css-card" style="
          background:${sel ? `rgba(${TRGB},0.16)` : 'rgba(0,0,0,0.42)'};
          border:1px solid ${sel ? TCOL : 'rgba(255,255,255,0.08)'};
          border-radius:9px; padding:15px 16px; cursor:pointer;
          transition:transform .14s, box-shadow .2s, border-color .2s, background .2s;
          transform:${sel ? 'scale(1.04)' : 'scale(1)'};
          box-shadow:${sel ? `0 0 18px rgba(${TRGB},0.5)` : 'none'};
          display:flex; align-items:center; gap:14px;
        ">
          <span style="font-size:30px; filter:drop-shadow(0 0 6px rgba(${TRGB},0.4));">${c.emoji}</span>
          <div style="min-width:0;">
            <div style="font:400 17px ${FONT_HEAD}; text-transform:uppercase; letter-spacing:2px;
                 color:${sel ? TCOL : '#eaffff'};">${_esc(c.name)}</div>
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
          row.style.borderColor = `rgba(${this._themeColorRGB || CYAN_RGB},0.4)`;
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
        alpha: true, premultipliedAlpha: false,   // canvas TRANSPARENTE
      });
      const scene = new BABYLON.Scene(this._previewEngine);
      // clearColor com ALPHA 0 → o canvas não pinta fundo opaco; o bioma e a
      //  decoração (atrás, no DOM) aparecem por trás do personagem 3D.
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
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

    // TEMA imersivo da classe: fundo de bioma + cor de acento + decoração
    // que cresce + som ambiente. Aplicado ANTES de re-renderizar os cards
    // pra que eles já saiam com a cor nova. Sempre roda (crossfade suave).
    this._applyTheme(id);

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

  // ── Aplica o TEMA da classe na tela (crossfade fundo + cor + decor + som).
  //    Tudo isolado na tela de seleção; nunca toca o jogo/cena principal.
  _applyTheme(id) {
    const th = THEMES[id] || DEFAULT_THEME;

    // 1) cor de acento via CSS vars (recolore cards/glow/nome/botão sem reflow)
    this._themeColorRGB = th.rgb;
    if (this._el) {
      this._el.style.setProperty('--css-theme', th.color);
      this._el.style.setProperty('--css-theme2', th.color2);
      this._el.style.setProperty('--css-rgb', th.rgb);
    }
    // nome/desc/botão JOGAR recolorem na hora
    if (this._nameEl) this._nameEl.style.textShadow =
      `0 0 24px rgba(${th.rgb},0.65), 0 4px 12px #000`;
    if (this._descEl) this._descEl.style.color = th.color;
    if (this._playBtn) {
      this._playBtn.style.background = `linear-gradient(180deg, ${th.color}, ${th.color2})`;
      this._playBtn.style.boxShadow =
        `0 0 28px rgba(${th.rgb},0.5), inset 0 0 14px rgba(255,255,255,0.3)`;
    }

    // 2) FUNDO de bioma — crossfade entre os 2 layers. Pré-carrega a imagem;
    //    se falhar (404/sem rede), usa o gradiente temático de fallback.
    this._setBiome(th);

    // 3) DECORAÇÃO que cresce — limpa a antiga, spawna a nova com stagger.
    this._spawnDecor(th);

    // 4) SOM ambiente em loop baixo — troca o anterior pelo novo.
    this._setAmbient(th.sound);
  }

  _setBiome(th) {
    const layers = this._biomeLayers;
    if (!layers) return;
    const next = layers[this._activeBiome ^ 1];
    const cur = layers[this._activeBiome];

    const applyGrad = () => { next.style.backgroundImage = th.bgGrad; };
    if (th.bg) {
      // pré-carrega: só faz crossfade quando a foto realmente decodificou.
      const img = new Image();
      img.onload = () => { next.style.backgroundImage =
        `url("${th.bg}")`; this._crossfadeBiome(next, cur); };
      img.onerror = () => { applyGrad(); this._crossfadeBiome(next, cur); };
      img.src = th.bg;
      // se já estiver em cache, onload dispara síncrono; senão segue async.
    } else {
      applyGrad();
      this._crossfadeBiome(next, cur);
    }
    // overlay escuro entra junto (legibilidade)
    if (this._biomeOverlay) this._biomeOverlay.style.opacity = th.bg ? '1' : '0.85';
  }

  _crossfadeBiome(next, cur) {
    if (!next) return;
    next.style.opacity = '1';
    if (cur && cur !== next) cur.style.opacity = '0';
    this._activeBiome ^= 1;
  }

  // Decoração: emojis estilizados que CRESCEM de baixo pra cima (scale 0→1,
  // stagger). Distribuídos no rodapé (chão) ou nas laterais. CSS puro/leve.
  _spawnDecor(th) {
    const layer = this._decorLayer;
    if (!layer) return;

    // limpa a anterior (shrink rápido e remove)
    const old = this._currentDecor;
    this._currentDecor = [];
    for (const node of old) {
      try {
        node.classList.add('css-out');
        setTimeout(() => { try { node.remove(); } catch (_) {} }, 320);
      } catch (_) {}
    }

    const glyphs = (th.decor && th.decor.glyphs) || [];
    if (glyphs.length === 0) return;

    // 14 elementos espalhados pelo rodapé (chão) com tamanho/posição variados.
    const N = 14;
    for (let i = 0; i < N; i++) {
      const g = glyphs[i % glyphs.length];
      const span = document.createElement('span');
      span.className = 'css-decor';
      span.textContent = g;
      // posição horizontal espalhada nas bordas + chão; tamanho aleatório estável
      const leftPct = (i / (N - 1)) * 100;
      const size = 26 + Math.round(Math.abs(Math.sin(i * 1.7)) * 40); // 26–66px
      const bottomPx = th.decor.floor ? (4 + Math.round(Math.abs(Math.cos(i * 2.3)) * 26)) : 8;
      span.style.left = `${leftPct}%`;
      span.style.fontSize = `${size}px`;
      span.style.bottom = `${bottomPx}px`;
      // stagger: cada um cresce um pouco depois (efeito de brotar em onda)
      span.style.animationDelay = `${(i * 45)}ms, ${(i * 120)}ms`;
      layer.appendChild(span);
      this._currentDecor.push(span);
    }
  }

  // Som ambiente em LOOP baixo via SoundManager.startLoop/stopLoop. Troca o
  // anterior pelo novo ao mudar de classe. Se o arquivo faltar, no-op silencioso.
  _setAmbient(soundId) {
    try {
      const sm = window._gamePlayer?.sounds || window._soundManager;
      if (!sm?.startLoop) return;
      if (this._currentAmbient === soundId) return; // já tocando esse
      if (this._currentAmbient) { try { sm.stopLoop(this._currentAmbient); } catch (_) {} }
      this._currentAmbient = soundId || null;
      if (soundId) sm.startLoop(soundId, 0.32); // loop BAIXO (ambiente)
    } catch (e) { console.warn('[CharSelectScreen] ambient:', e); }
  }

  _stopAmbient() {
    try {
      const sm = window._gamePlayer?.sounds || window._soundManager;
      if (sm?.stopLoop && this._currentAmbient) sm.stopLoop(this._currentAmbient);
    } catch (_) {}
    this._currentAmbient = null;
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
    // PARA o som ambiente do bioma JÁ no clique do JOGAR — não pode vazar pra
    //  dentro da partida (Lucas: "música do lobby tá indo pra partida, 2
    //  músicas tocando"). O hide() já chama _stopAmbient, mas o fade/walk
    //  abaixo demora ~800ms; paramos aqui pra cortar na hora.
    this._stopAmbient();

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
    // para o som ambiente do bioma e limpa a decoração (tema só vive na tela).
    this._stopAmbient();
    if (this._currentDecor?.length) {
      for (const n of this._currentDecor) { try { n.remove(); } catch (_) {} }
      this._currentDecor = [];
    }
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
