// ─────────────────────────────────────────────────────────────────
//  PlayerAnimator — controla animações do personagem rato
//
//  Sistema de blend por peso (setWeightForAllAnimatables):
//  • Animação anterior e nova tocam SIMULTANEAMENTE
//  • Peso da antiga cai 1→0 enquanto a nova sobe 0→1
//  • Resultado: transição suave sem teleporte de pose
//
//  ATENÇÃO: nomes das AnimationGroups no GLB do Meshy AI não batem
//  com o conteúdo. Tabela de mapeamento calibrada pelo usuário (K):
//
//  Nome no GLB                    │ O que faz de verdade
//  ───────────────────────────────┼──────────────────────────────
//  Jump_Down_from_Wall            │ Parado - Idle
//  Walk_Backward_While_Shooting   │ Andando
//  Walk_Forward_with_Bow_Aimed    │ Correndo mirando
//  Walk_Backward_with_Bow_Aimed   │ Wall jump / andar p/ trás
//  Running                        │ Correndo e recarregando
//  Run_and_Shoot                  │ Tiro arco 2
//  Running_Reload                 │ Subindo escada
//  Regular_Jump                   │ Mirando para trás
//  Jump_Over_Obstacle_2           │ Rolamento (fall)
//  Climb_Stairs                   │ Mortal de lado (wall ready)
//  Parkour_Vault_with_Roll        │ Correr (roll/death)
//  Archery_Shot_1                 │ Tiro-arco
//  Walking                        │ Indo para trás mirando arco
//  Archery_Shot_3                 │ Pulo-com-corrida
//  Idle_5                         │ Pulo parado
//  Roll_Dodge_1                   │ Mirando e andando
// ─────────────────────────────────────────────────────────────────
import { DEBUG } from '../../utils/debug.js';

// ── ANIM_MAP_START ──
// Mapeamento para os nomes limpos do AnimationLibrary (chaves do MOVESETS).
// Para estados sem arquivo dedicado, usamos o mais próximo como fallback.
const ANIM_MAP = {
  idle        : 'idle',
  walk        : 'walk',
  walk_aim    : 'walk_aim',
  walk_back   : 'walk',        // sem arquivo separado → usa walk
  run         : 'run',
  run_shoot   : 'run',         // sem run_shoot → usa run
  run_reload  : 'reload',      // usa reload enquanto corre
  jump        : 'jump',
  fall        : 'jump',        // sem fall dedicado → usa jump
  wall_ready  : 'idle',        // sem wall_ready → usa idle
  wall_jump   : 'jump',        // sem wall_jump → usa jump
  roll        : 'vault_roll',  // parkour/vault_roll.glb
  shoot       : 'idle',        // sem shoot dedicado → idle (inline recoil)
  shoot_back  : 'idle',
  reload      : 'reload',
};
// ── ANIM_MAP_END ──

// ── Duração do crossfade de entrada em cada estado (segundos) ─────
//   Ajuste aqui para deixar as transições mais rápidas ou lentas
const FADE_IN = {
  idle:       0.25,   // volta para idle: longo → parece natural
  walk:       0.20,   // começa a andar
  walk_aim:   0.16,   // anda mirando
  walk_back:  0.16,   // anda para trás
  run:        0.22,   // começa a correr: longo → "pega velocidade"
  run_shoot:  0.10,   // corre e atira: rápido
  run_reload: 0.15,   // corre e recarrega
  jump:       0.07,   // pulo: imediato (responsividade)
  fall:       0.14,   // cai
  wall_ready: 0.12,   // cola na parede
  wall_jump:  0.05,   // wall jump: instantâneo
  roll:       0.05,   // morte/roll: instantâneo
  shoot:      0.07,   // atira parado
  shoot_back: 0.10,   // atira para trás
  reload:     0.15,   // recarrega
};
const DEFAULT_FADE = 0.18;   // fallback

// ── One-shots: tocam uma vez, não fazem loop ──────────────────────
const ONE_SHOT = new Set(['jump', 'wall_jump', 'roll']);

// ── Offset de rotação do modelo ───────────────────────────────────
// 0 = modelo exportado com rosto para +Z (frente da cena Babylon)
// Math.PI = modelo exportado de costas (rosto para −Z)
const FACING_OFFSET = Math.PI;

// ── Ajuste de montagem da ARMA por AVATAR ─────────────────────────
//  A mão de cada rig (rato Meshy vs humano lucasmods) tem orientação/posição
//  local diferente → a arma tunada pro rato fica torta no humano. Aqui dá pra
//  corrigir por avatar (chave = nome do glb sem extensão). pos = unidades locais
//  do osso, rot = GRAUS (euler XYZ), scale = multiplicador. Ajustável AO VIVO com
//  window.wmTune(px,py,pz, rxDeg,ryDeg,rzDeg, scale) — persiste por avatar no
//  localStorage (wm_<chave>), que tem prioridade sobre o default abaixo.
const WEAPON_MOUNTS = {
  // lucasmods: { pos:[0,0,0], rot:[0,0,0], scale:1 },  // calibre com wmTune()
};

// ── Velocidades de rotação do corpo (rad/s) ───────────────────────
const ROT_MOVE = 14;   // girando ao mover — rápido para encarar direção
const ROT_IDLE = 8;    // girando em idle  — suave mas responsivo ao girar câmera

// ── Lerp de ângulo (caminho mais curto pelo círculo) ─────────────
function lerpAngle(a, b, t) {
  let diff = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + diff * Math.min(1, t);
}

export class PlayerAnimator {
  constructor() {
    this.root          = null;
    this.scene         = null;
    this._allMeshes    = [];
    this._anims        = {};    // nome → AnimationGroup
    this._animMap      = { ...ANIM_MAP };

    // Offset Y local do root (calculado no setup, travado a cada frame
    // para neutralizar o root motion das animações do GLB)
    this._rootOffsetY  = 0;

    // Rotação suave do corpo
    this._bodyYaw   = null;  // null = não inicializado ainda

    // Estado atual
    this._cur       = null;  // AnimationGroup rodando (com peso 1)
    this._curKey    = '';

    // Estado anterior (em fade-out)
    this._prev      = null;  // AnimationGroup em fade-out
    this._fadeT     = 0;     // tempo decorrido do crossfade (s)
    this._fadeDur   = 0;     // duração total do crossfade (s)

    // Timers transitórios
    this._shootT    = 0;
    this._wallJumpT = 0;

    this._visible   = false;
    this._weaponSocket = null; // TransformNode parentado ao osso da mão

    // ── Procedural rig (IK / look-at / breathing / aim lean) ──────────
    //  Tudo abaixo é PROCEDURAL (sem clipes dedicados): aplica offsets de
    //  rotação/posição nos ossos DEPOIS da animação rodar, via um hook no
    //  onBeforeRenderObservable instalado no setup(). Cada feature é guardada:
    //  se o osso não existir, ela simplesmente não faz nada (nunca crasha).
    this._bones = null;          // cache de ossos resolvidos { head, neck, spine, ... }
    this._bonesTried = false;    // já tentou resolver (evita re-busca por frame)
    this._procHook = null;       // observer do onBeforeRenderObservable
    this._procEnabled = true;    // master switch (window._procRig = false desliga)
    this._breathPhase = Math.random() * Math.PI * 2;
    this._idleCycleT = 0;        // tempo acumulado em idle (p/ variação)
    this._idleVariant = 'idle';  // clipe de idle atual (idle / idle_02)
    this._footRayLen = 0.6;      // alcance do raycast de foot IK (m, escala local)
  }

  // ── Sockets (Ancoragem de itens) ────────────────────────────────
  
  /**
   * Encontra um osso ou nó pelo nome e cria um TransformNode filho dele
   * para servir de "socket" (ponto de montagem) estável.
   */
  getSocketNode(boneName) {
    if (!this.root || !this.scene || !boneName) return null;

    // Busca exaustiva nos descendentes (TransformNodes e Meshes)
    const nodes = this.root.getDescendants();
    let boneNode = null;

    const lowerName = boneName.toLowerCase();
    
    // Procura por nós que contenham o nome desejado
    boneNode = nodes.find(n => {
      const nLower = n.name.toLowerCase();
      return nLower.includes(lowerName) || 
             (lowerName.includes('left') && nLower.includes('_l') && nLower.includes(lowerName.replace('left', ''))) ||
             (lowerName.includes('right') && nLower.includes('_r') && nLower.includes(lowerName.replace('right', '')));
    });

    // Fallback: se for RightHand e não achar, tenta mixamorig:RightHand, etc
    if (!boneNode) {
      boneNode = nodes.find(n => n.name.toLowerCase().includes(lowerName.replace('hand', '').replace('foot', '')));
    }

    // Mega Fallback para modelos malucos (Digimon, Meshy, etc)
    // Tenta achar extremidades em vez de "arm" ou "leg" (que costumam cair no ombro/quadril)
    if (!boneNode) {
      if (lowerName.includes('right') && lowerName.includes('hand')) {
        boneNode = nodes.find(n => (n.name.toLowerCase().includes('wrist') || n.name.toLowerCase().includes('paw') || n.name.toLowerCase().includes('finger')) && n.name.toLowerCase().includes('r'));
      } else if (lowerName.includes('left') && lowerName.includes('hand')) {
        boneNode = nodes.find(n => (n.name.toLowerCase().includes('wrist') || n.name.toLowerCase().includes('paw') || n.name.toLowerCase().includes('finger')) && n.name.toLowerCase().includes('l'));
      } else if (lowerName.includes('right') && lowerName.includes('foot')) {
        boneNode = nodes.find(n => (n.name.toLowerCase().includes('toe') || n.name.toLowerCase().includes('ankle') || n.name.toLowerCase().includes('paw')) && n.name.toLowerCase().includes('r'));
      } else if (lowerName.includes('left') && lowerName.includes('foot')) {
        boneNode = nodes.find(n => (n.name.toLowerCase().includes('toe') || n.name.toLowerCase().includes('ankle') || n.name.toLowerCase().includes('paw')) && n.name.toLowerCase().includes('l'));
      }
    }

    if (!boneNode) {
      console.warn(`[PlayerAnimator] Socket "${boneName}" não encontrado no modelo. Nomes disponíveis:`, nodes.map(n=>n.name).join(', '));
      return null;
    }

    const socketName = `socket_${boneName}_${this.root.name}`;
    let socket = this.scene.getTransformNodeByName(socketName);

    if (!socket) {
      socket = new BABYLON.TransformNode(socketName, this.scene);
      socket.parent = boneNode;
    }

    return socket;
  }

  /** Aplica o ajuste de montagem da arma do avatar atual (window._avatarKey).
   *  Override do usuário (wmTune → localStorage) tem prioridade sobre o default. */
  _applyAvatarMount(socket) {
    try {
      const key = (window._avatarKey || '').toLowerCase();
      if (!key) return;
      let m = null;
      try { const raw = localStorage.getItem('wm_' + key); if (raw) m = JSON.parse(raw); } catch (_) {}
      if (!m) m = WEAPON_MOUNTS[key] || null;
      if (!m) return;
      if (Array.isArray(m.pos)) {
        socket.position.x += (m.pos[0] || 0);
        socket.position.y += (m.pos[1] || 0);
        socket.position.z += (m.pos[2] || 0);
      }
      if (Array.isArray(m.rot)) {
        socket.rotation.set(
          BABYLON.Tools.ToRadians(m.rot[0] || 0),
          BABYLON.Tools.ToRadians(m.rot[1] || 0),
          BABYLON.Tools.ToRadians(m.rot[2] || 0));
      }
      if (typeof m.scale === 'number' && m.scale > 0) socket.scaling.scaleInPlace(m.scale);
    } catch (_) {}
  }

  attachWeapon(weaponMesh, boneName = 'RightHand') {
    if (!weaponMesh || !this.root) return;

    const socket = this.getSocketNode(boneName);
    if (!socket) {
        console.error(`[PlayerAnimator] Não foi possível anexar arma: osso "${boneName}" não encontrado.`);
        return;
    }

    // ── COMPENSAÇÃO DE ESCALA DO OSSO ───────────────────────────────
    // O esqueleto do rato tem escala interna minúscula (~0.01). Sem
    // compensar, a arma fica microscópica (0.262 × 0.01 ≈ 0.003 = 6mm).
    // Setamos a escala local do socket = 1/escalaAbsolutaDoOsso, de modo
    // que o socket fique em escala mundial 1 e a arma renderize no
    // tamanho real definido por applyToMesh (tpsScale).
    const bone = socket.parent;
    // Socket é REUSADO (mesmo nome entre re-attaches) — reseta pos/rot antes de
    // aplicar o mount por-avatar, senão o ajuste acumularia a cada re-attach.
    socket.position.set(0, 0, 0);
    socket.rotation.set(0, 0, 0);
    if (bone) {
      // Força o recálculo da matriz mundial da CADEIA inteira (root → osso).
      // CRÍTICO no swap de personagem em runtime: ler a escala sem isso devolvia
      // a escala LOCAL (1,1,1) em vez da acumulada (~0.01) → socket.scaling=1 →
      // arma MINÚSCULA (tpsScale × 0.01). Computando do topo pra baixo + lendo a
      // escala via decompose da matriz mundial, o valor fica correto em qualquer
      // rig (rato OU humano), tanto no boot quanto no swap.
      const chain = [];
      for (let b = bone; b; b = b.parent) chain.push(b);
      for (let i = chain.length - 1; i >= 0; i--) { try { chain[i].computeWorldMatrix(true); } catch (_) {} }
      const bs = new BABYLON.Vector3(1, 1, 1);
      try { bone.getWorldMatrix().decompose(bs, undefined, undefined); } catch (_) {}
      const inv = new BABYLON.Vector3(
        bs.x ? 1 / bs.x : 1,
        bs.y ? 1 / bs.y : 1,
        bs.z ? 1 / bs.z : 1
      );
      socket.scaling.copyFrom(inv);
    }

    // Ajuste POR-AVATAR (mão humana vs rato) — pos/rot extra + scale no socket.
    this._applyAvatarMount(socket);

    weaponMesh.parent = socket;

    // As transformações (posição e rotação) são definidas pela própria classe da arma
    // (tpsPosition, tpsRotation) no método applyToMesh() e não devem ser sobrescritas aqui.

    this._weaponSocket = socket;
    DEBUG.log(`[PlayerAnimator] ✅ Arma "${weaponMesh.name}" fixada no osso: ${socket.parent.name}`);
  }

  // ── API do AnimConfigUI ──────────────────────────────────────────
  setAnimMap(map)  { this._animMap = { ...ANIM_MAP, ...map }; }
  resetAnimMap()   { this._animMap = { ...ANIM_MAP };          }

  // ── Setup ────────────────────────────────────────────────────────
  setup(meshes, animGroups, playerMesh, playerHeight, shadowGen) {
    if (!meshes?.length) return;

    // Sobe na hierarquia até o __root__ real do GLB
    let r = meshes[0];
    while (r.parent) r = r.parent;
    this.root = r;
    this.scene = this.root.getScene();

    // Coleta todos os meshes renderizáveis
    const seen = new Set();
    this._allMeshes = [];
    for (const m of meshes) {
      if (m && !seen.has(m) && typeof m.visibility !== 'undefined') {
        seen.add(m); this._allMeshes.push(m);
      }
    }
    if (this.root.getChildMeshes) {
      for (const m of this.root.getChildMeshes(false)) {
        if (!seen.has(m) && typeof m.visibility !== 'undefined') {
          seen.add(m); this._allMeshes.push(m);
        }
      }
    }

    DEBUG.log(
      `🐭 PlayerAnimator setup:\n` +
      `   root: "${this.root.name}" (${this.root.getClassName?.() ?? 'Node'})\n` +
      `   meshes: ${meshes.length} | _allMeshes: ${this._allMeshes.length}`
    );

    // Catálogo de animações — para e zera peso de todas
    for (const ag of (animGroups ?? [])) {
      ag.stop();
      this._anims[ag.name] = ag;
    }
    if (!Object.keys(this._anims).length) {
      const scene = playerMesh.getScene();
      for (const ag of (scene.animationGroups ?? [])) {
        this._anims[ag.name] = ag;
      }
    }
    DEBUG.log('🐭 Animações disponíveis:', Object.keys(this._anims));

    // Zera peso de todas as animações (blend system manual)
    for (const ag of Object.values(this._anims)) {
      ag.stop();
    }

    // ── Strip root motion ─────────────────────────────────────────
    // Animações GLB do Meshy AI contêm tracks de position/rotation
    // no nó raiz que fisicamente deslocam o modelo a cada ciclo.
    // Como controlamos o root transform manualmente, removemos esses
    // tracks das AnimationGroups → animações ficam verdadeiramente
    // in-place sem deslizamento.
    this._stripRootMotion();

    // Configura meshes
    for (const m of this._allMeshes) {
      m.isPickable              = false;
      m.alwaysSelectAsActiveMesh = true;
      m.receiveShadows           = true;
      shadowGen?.addShadowCaster(m);
    }

    // Escala e parent
    this.root.scaling.setAll(1.164);
    this.root.parent = playerMesh;
    this._rootOffsetY = -(playerHeight / 2);
    this.root.position.set(0, this._rootOffsetY, 0);

    // Visibilidade inicial
    this.setVisible(false);

    // Inicia em idle
    this._playKey('idle');

    // ── Instala o hook procedural (foot IK / look-at / breathing / lean) ──
    //  Roda DEPOIS do passo de animação (skeleton já avaliado pelo Babylon),
    //  só quando o avatar está visível (TPS). Removido junto com o root.
    this._installProcHook();
  }

  // ════════════════════════════════════════════════════════════════
  //  PROCEDURAL RIG  (itens 31/32/33/36/37 — todos GUARDADOS)
  // ════════════════════════════════════════════════════════════════

  _installProcHook() {
    if (this._procHook || !this.scene) return;
    // onBeforeRenderObservable roda após os AnimationGroups avaliarem os ossos
    // do frame anterior; aplicamos os offsets aditivos por cima. Guardado em
    // try/catch global pra um erro num bone nunca derrubar o render loop.
    this._procHook = this.scene.onBeforeRenderObservable.add(() => {
      try { this._updateProcedural(); } catch (_) {}
    });
  }

  /** Acha um nó/osso descendente cujo nome casa (case-insensitive, exato →
   *  sufixo). Retorna null se não achar (feature dependente se desliga). */
  _findBone(...names) {
    if (!this.root?.getDescendants) return null;
    const desc = this.root.getDescendants(false);
    const low = (s) => String(s || '').toLowerCase();
    for (const want of names) {
      const w = low(want);
      // exato
      let n = desc.find(d => low(d.name) === w);
      if (n) return n;
      // termina-com (cobre prefixos tipo "mixamorig:Head")
      n = desc.find(d => { const dn = low(d.name); return dn.endsWith(':' + w) || dn.endsWith('_' + w) || dn === w; });
      if (n) return n;
    }
    // substring como último recurso
    for (const want of names) {
      const w = low(want);
      const n = desc.find(d => low(d.name).includes(w));
      if (n) return n;
    }
    return null;
  }

  /** Resolve (1x) os ossos usados pelo rig procedural. Tudo opcional. */
  _resolveBones() {
    if (this._bonesTried) return this._bones;
    this._bonesTried = true;
    if (!this.root) { this._bones = null; return null; }
    const b = {
      head:      this._findBone('Head'),
      neck:      this._findBone('Neck'),
      spine:     this._findBone('Spine1', 'Spine'),
      chest:     this._findBone('Spine2', 'Chest', 'Spine1'),
      leftFoot:  this._findBone('LeftFoot'),
      rightFoot: this._findBone('RightFoot'),
      leftLeg:   this._findBone('LeftLeg'),
      rightLeg:  this._findBone('RightLeg'),
      leftHand:  this._findBone('LeftHand'),
      rightHand: this._findBone('RightHand'),
    };
    // Guarda a rest-rotation (pose neutra) dos ossos que recebem offset aditivo,
    // pra somar o offset em cima dela a cada frame (e não acumular).
    for (const k of ['head', 'neck', 'spine', 'chest', 'leftFoot', 'rightFoot']) {
      const n = b[k];
      if (n) {
        try {
          if (n.rotationQuaternion) n.rotationQuaternion = null;
          n._restRot = n.rotation.clone();
          n._restPos = n.position.clone();
        } catch (_) {}
      }
    }
    this._bones = b;
    return b;
  }

  /** Tick procedural por frame. Só roda visível (TPS) e com BABYLON disponível. */
  _updateProcedural() {
    // Auto-remove o hook se o root foi descartado (setMouseCharacter troca o
    // animator inteiro mas o observer ficaria pendurado na cena).
    if (!this.root || this.root.isDisposed?.()) {
      if (this._procHook && this.scene) {
        try { this.scene.onBeforeRenderObservable.remove(this._procHook); } catch (_) {}
        this._procHook = null;
      }
      return;
    }
    if (!this._visible || typeof BABYLON === 'undefined') return;
    if (this._procEnabled === false || (typeof window !== 'undefined' && window._procRig === false)) return;
    const b = this._resolveBones();
    if (!b) return;
    const dt = this.scene?.getEngine?.()?.getDeltaTime?.() / 1000 || 0.016;

    const moving = (this._curKey === 'walk' || this._curKey === 'walk_aim' ||
                    this._curKey === 'run' || this._curKey === 'run_shoot' ||
                    this._curKey === 'walk_back' || this._curKey === 'run_reload');
    const isIdle = this._curKey === 'idle' || this._curKey === '';

    // Lê estado de movimento do player global (vel + facing) p/ strafe/turn.
    let p = null;
    try { p = (typeof window !== 'undefined') ? (window._gamePlayer || window._player) : null; } catch (_) {}

    // 36 — Breathing: respiração sutil no peito/spine durante idle.
    this._applyBreathing(b, dt, isIdle);
    // 34 + 41 — Strafe lean + torso twist (movimento lateral relativo ao facing).
    this._applyStrafeLean(b, p, dt);
    // 35 — Turn-in-place: shuffle de passo quando gira parado.
    this._applyTurnInPlace(b, p, dt, isIdle);
    // 32 + 37 — Look-at de cabeça/pescoço + lean de tronco pela mira.
    this._applyLookAndLean(b);
    // 33 — Hand-on-weapon IK (mão secundária no socket da arma).
    this._applyHandIK(b);
    // 31 — Foot IK (planta os pés no chão/rampa via raycast).
    this._applyFootIK(b, moving);
    // 38 — Expressão facial (morph targets) pain/effort em hit / HP baixo.
    this._applyFacial(p, dt);
  }

  // 38 — Facial expression via morph targets. Se o avatar NÃO tem morph
  //  targets, _resolveMorphs marca _noMorphs=true e a feature se desliga.
  _resolveMorphs() {
    if (this._morphsTried) return this._morphTargets;
    this._morphsTried = true;
    const found = [];
    try {
      const meshes = this._allMeshes || [];
      for (const m of meshes) {
        const mtm = m?.morphTargetManager;
        if (!mtm || !mtm.numTargets) continue;
        for (let i = 0; i < mtm.numTargets; i++) {
          const t = mtm.getTarget(i);
          if (!t) continue;
          const nm = String(t.name || '').toLowerCase();
          // heurística: alvos de boca/sobrancelha/dor servem de "pain/effort".
          if (/pain|hurt|angry|brow|frown|mouth|jaw|grit|effort|aa|oh|ee/.test(nm)) {
            found.push(t);
          }
        }
        // sem match por nome mas tem alvos → usa o primeiro como genérico.
        if (!found.length && mtm.numTargets > 0) {
          const t = mtm.getTarget(0); if (t) found.push(t);
        }
      }
    } catch (_) {}
    this._morphTargets = found;
    this._noMorphs = found.length === 0;
    return found;
  }

  _applyFacial(p, dt) {
    if (this._noMorphs) return;
    const targets = this._resolveMorphs();
    if (!targets || !targets.length) return;   // skip: avatar sem blendshapes
    // Intensidade alvo: sobe em hit recente (shootT é proxy de ação) ou HP baixo.
    let want = 0;
    try {
      if (p) {
        const hp = p.hp ?? p._hp ?? 100, maxHp = p.maxHp ?? p._maxHp ?? 100;
        if (maxHp > 0 && hp / maxHp < 0.35) want = 0.5;       // careta de dor (HP baixo)
        if ((p._hitStunT || 0) > 0) want = 1.0;                // pancada agora
      }
    } catch (_) {}
    this._facialAmt = this._facialAmt ?? 0;
    this._facialAmt += (want - this._facialAmt) * Math.min(1, dt * (want > this._facialAmt ? 12 : 4));
    if (this._facialAmt < 0.005 && want === 0) this._facialAmt = 0;
    for (const t of targets) {
      try { t.influence = this._facialAmt; } catch (_) {}
    }
  }

  // 34 + 41 — Strafe lean / direction-adaptive twist.
  //  Não existem clipes de strafe (esquerda/direita) — quando o corpo está
  //  travado encarando a câmera (armado) e o movimento é LATERAL, o clipe de
  //  andar pra frente girado parece errado. Compensamos com: (a) LEAN do tronco
  //  na direção do movimento lateral e (b) TWIST sutil pra o corpo "liderar" a
  //  direção do deslocamento — barato e legível. Procedural; sem clipes.
  _applyStrafeLean(b, p, dt) {
    const node = b.spine;
    if (!node || !node._restRot || !p) return;
    let vx = p._vx || 0, vz = p._vz || 0;
    const sp = Math.hypot(vx, vz);
    // facing do corpo no mundo (root.rotation.y já inclui FACING_OFFSET = π).
    const facing = (this.root?.rotation?.y || 0) - FACING_OFFSET;
    // componente lateral (direita = +) do movimento relativo ao facing.
    // forward = (sin(facing), cos(facing)); right = (cos(facing), -sin(facing)).
    let lateral = 0, forward = 0;
    if (sp > 0.2) {
      const nx = vx / sp, nz = vz / sp;
      lateral = nx * Math.cos(facing) - nz * Math.sin(facing);
      forward = nx * Math.sin(facing) + nz * Math.cos(facing);
    }
    // Só vale a pena quando o movimento é majoritariamente lateral (strafe).
    const strafeFrac = (sp > 0.2) ? Math.abs(lateral) * (1 - Math.min(1, Math.abs(forward))) : 0;
    const targetRoll  = -lateral * 0.10 * strafeFrac;   // inclina pro lado do strafe
    const targetTwist =  lateral * 0.18 * strafeFrac;   // tronco "lidera" a direção
    this._strafeRoll  = this._strafeRoll ?? 0;
    this._strafeTwist = this._strafeTwist ?? 0;
    const k = Math.min(1, dt * 6);
    this._strafeRoll  += (targetRoll  - this._strafeRoll)  * k;
    this._strafeTwist += (targetTwist - this._strafeTwist) * k;
    try {
      node.rotation.z = node._restRot.z + this._strafeRoll;
      node.rotation.y = node._restRot.y + this._strafeTwist;
    } catch (_) {}
  }

  // 35 — Turn-in-place: quando PARADO e o facing alvo (câmera) gira muito, dá um
  //  "shuffle" procedural (pequeno balanço dos pés alternado) já que não há
  //  clipe de turn-in-place. O giro do corpo em si é feito pelo Player.js; aqui
  //  só adicionamos a leitura de pés pra não parecer que desliza girando.
  _applyTurnInPlace(b, p, dt, isIdle) {
    if (!p) return;
    const yaw = p.yaw || 0;
    this._lastYawTurn = this._lastYawTurn ?? yaw;
    let dyaw = yaw - this._lastYawTurn;
    while (dyaw > 180) dyaw -= 360; while (dyaw < -180) dyaw += 360;
    this._lastYawTurn = yaw;
    // taxa de giro (graus/s) — só dispara o shuffle parado e girando rápido.
    const rate = dt > 0 ? Math.abs(dyaw) / dt : 0;
    const turning = isIdle && rate > 60;   // > ~60°/s parado = girando de propósito
    this._turnShuffle = this._turnShuffle ?? 0;
    const target = turning ? 1 : 0;
    this._turnShuffle += (target - this._turnShuffle) * Math.min(1, dt * 5);
    if (this._turnShuffle < 0.01) return;
    // shuffle: pequeno bob alternado dos pés (sobe/desce em contrafase).
    this._turnPhase = (this._turnPhase || 0) + dt * 9;
    const s = Math.sin(this._turnPhase) * 0.02 * this._turnShuffle;
    if (b.leftFoot && b.leftFoot._restPos) {
      try { b.leftFoot._turnY = s; } catch (_) {}
    }
    if (b.rightFoot && b.rightFoot._restPos) {
      try { b.rightFoot._turnY = -s; } catch (_) {}
    }
  }

  // 36 — Breathing additivo no peito/spine (idle). Soma seno na rest-pose.
  _applyBreathing(b, dt, isIdle) {
    const node = b.chest || b.spine;
    if (!node || !node._restRot) return;
    // Amplitude desce a 0 quando não está em idle (sem respiração correndo).
    this._breathAmp = this._breathAmp ?? 0;
    const target = isIdle ? 1 : 0;
    this._breathAmp += (target - this._breathAmp) * Math.min(1, dt * 4);
    if (this._breathAmp < 0.001) return;
    this._breathPhase += dt * 1.6;          // ~0.25 Hz respiração calma
    const s = Math.sin(this._breathPhase) * 0.022 * this._breathAmp; // ~1.3°
    try {
      node.rotation.x = node._restRot.x + s;     // peito sobe/desce sutil
    } catch (_) {}
  }

  // 32 + 37 — Head/neck look-at + torso aim lean (additivo, clampado).
  _applyLookAndLean(b) {
    // Pitch/yaw da mira: a câmera olha pra onde a mira aponta. Em TPS o corpo
    // já encara a câmera (Player gira o root), então o DELTA relevante é o
    // PITCH (cima/baixo) — a cabeça acompanha. Lê do player global se houver.
    let pitch = 0, yawDelta = 0;
    try {
      const p = (typeof window !== 'undefined') ? (window._gamePlayer || window._player) : null;
      if (p) {
        pitch = BABYLON.Tools?.ToRadians ? BABYLON.Tools.ToRadians(p.pitch || 0) : (p.pitch || 0) * Math.PI / 180;
      }
    } catch (_) {}
    // clamp
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    pitch = clamp(pitch, 0.6);
    yawDelta = clamp(yawDelta, 0.5);

    // Head look-at: olha pra cima/baixo conforme o pitch da mira.
    if (b.head && b.head._restRot) {
      try { b.head.rotation.x = b.head._restRot.x - pitch * 0.55; } catch (_) {}
    }
    if (b.neck && b.neck._restRot) {
      try { b.neck.rotation.x = b.neck._restRot.x - pitch * 0.3; } catch (_) {}
    }
    // 37 — Aim lean: tronco inclina levemente conforme pitch (mira pra cima =
    //  peito abre pra trás; pra baixo = curva pra frente). Sutil.
    if (b.spine && b.spine._restRot) {
      try { b.spine.rotation.x = b.spine._restRot.x - pitch * 0.12; } catch (_) {}
    }
  }

  // 33 — Hand-on-weapon IK: cola a mão ESQUERDA (secundária) no socket da arma
  //  (cano/antebraço). Sem alvo de socket → não faz nada. Procedural simples:
  //  orienta o osso da mão esquerda pro socket da arma se ambos existirem.
  _applyHandIK(b) {
    const hand = b.leftHand;
    const socket = this._weaponSocket;
    if (!hand || !socket || !hand.getAbsolutePosition) return;
    try {
      // Só atua quando há arma anexada (socket com filhos = arma na mão).
      const hasWeapon = socket.getChildren && socket.getChildren().length > 0;
      if (!hasWeapon) return;
      // Alvo: um pouco "atrás" do socket (empunhadura de apoio). Convertemos a
      // posição mundial do socket pro espaço local do PAI da mão e apontamos.
      const targetW = socket.getAbsolutePosition();
      const parent = hand.parent;
      if (!parent?.getWorldMatrix) return;
      const inv = BABYLON.Matrix.Invert(parent.getWorldMatrix());
      const local = BABYLON.Vector3.TransformCoordinates(targetW, inv);
      // Suaviza pra mão "escorregar" suavemente até a posição (lerp), sem snap.
      if (hand._restPos) {
        const k = 0.18; // peso da correção (mantém parte da pose original)
        hand.position.x = hand._restPos.x + (local.x - hand._restPos.x) * k;
        hand.position.y = hand._restPos.y + (local.y - hand._restPos.y) * k;
        hand.position.z = hand._restPos.z + (local.z - hand._restPos.z) * k;
      }
    } catch (_) {}
  }

  // 31 — Foot IK: raycast pra baixo sob cada pé e ajusta a ALTURA do tornozelo
  //  pra plantar nas rampas/degraus (sem flutuar/afundar). Procedural, guardado.
  _applyFootIK(b, moving) {
    if (!this.scene) return;
    const feet = [b.leftFoot, b.rightFoot];
    if (!feet[0] && !feet[1]) return;   // sem pés → desliga
    // Não faz IK durante corrida rápida (pés no ar muito tempo → ruído); mantém
    // suave em idle/walk onde o plantio importa.
    const ikAmount = moving ? 0.4 : 0.9;
    for (const foot of feet) {
      if (!foot || !foot._restPos || !foot.getAbsolutePosition) continue;
      try {
        // Shuffle de turn-in-place (item 35) somado por cima da IK.
        const turnY = foot._turnY || 0;
        const fp = foot.getAbsolutePosition();
        // Ray de cima do pé pra baixo, procurando o chão.
        const origin = new BABYLON.Vector3(fp.x, fp.y + 0.4, fp.z);
        const ray = new BABYLON.Ray(origin, new BABYLON.Vector3(0, -1, 0), 0.4 + this._footRayLen);
        const hit = this.scene.pickWithRay(ray, (m) =>
          m && m.isPickable !== false && !m._isRemotePlayer &&
          m !== foot && (this._allMeshes.indexOf(m) < 0));
        if (!hit?.hit || !hit.pickedPoint) continue;
        // Diferença vertical entre o pé e o chão sob ele (mundo).
        const groundY = hit.pickedPoint.y;
        const desiredFootY = groundY + 0.02;        // pequena folga (sola)
        const deltaW = desiredFootY - fp.y;
        // Converte o delta mundial em delta LOCAL (escala do osso ~0.01 no rato).
        const sc = this.root?.scaling?.y || 1;
        const deltaLocal = (deltaW / sc) * ikAmount;
        // Clampa pra não esticar a perna absurdamente.
        const clamped = Math.max(-0.15, Math.min(0.15, deltaLocal));
        // Aplica suave (lerp) na posição Y local do tornozelo, sobre a rest-pose.
        const targetY = foot._restPos.y + clamped;
        foot._ikY = foot._ikY ?? foot._restPos.y;
        foot._ikY += (targetY - foot._ikY) * 0.25;
        foot.position.y = foot._ikY + turnY;
      } catch (_) {}
    }
  }

  // ── Visibilidade ─────────────────────────────────────────────────
  setVisible(visible) {
    this._visible = visible;
    if (!this.root) return;

    // Garante que o nó raiz e TODOS os filhos sejam habilitados/desabilitados
    this.root.setEnabled(visible);
    this.root.isVisible = visible;
    
    const allDesc = this.root.getDescendants?.(false) ?? [];
    for (const node of allDesc) {
        node.setEnabled(visible);
        if (node.visibility !== undefined) node.isVisible = visible;
    }

    if (visible) {
      for (const m of this._allMeshes) { m.visibility = 1; m.isVisible = true; }
    }
  }

  // ── Eventos externos ─────────────────────────────────────────────
  onShoot()    { this._shootT    = 0.50; }
  onWallJump() { this._wallJumpT = 0.65; }

  // ── Update a cada frame ──────────────────────────────────────────
  update(dt, state) {
    if (!this.root) return;

    // Força o estado de visibilidade para evitar que outras lógicas ativem o mesh em FPS
    if (this._visible) {
      if (!this.root.isEnabled()) this.root.setEnabled(true);
    } else {
      if (this.root.isEnabled()) this.root.setEnabled(false);
      return; // Se não estiver visível, não precisa processar o resto do update visual
    }

    // ── Crossfade tick ────────────────────────────────────────────
    // Atualiza pesos da animação saindo (prev) e entrando (cur) a cada frame
    if (this._fadeDur > 0 && this._fadeT < this._fadeDur) {
      this._fadeT += dt;
      const t = Math.min(this._fadeT / this._fadeDur, 1.0);
      const tEased = t * t * (3 - 2 * t);   // smoothstep para evitar aceleração abrupta

      if (this._cur)  this._cur.setWeightForAllAnimatables(tEased);
      if (this._prev) this._prev.setWeightForAllAnimatables(1 - tEased);

      if (t >= 1) {
        // Crossfade completo: para a animação anterior
        if (this._prev) {
          this._prev.setWeightForAllAnimatables(0);
          this._prev.stop();
          this._prev = null;
        }
        if (this._cur) this._cur.setWeightForAllAnimatables(1);
        this._fadeDur = 0;
      }
    }

    // Timers transitórios
    if (this._shootT    > 0) this._shootT    -= dt;
    if (this._wallJumpT > 0) this._wallJumpT -= dt;

    // ── Rotação suave do corpo ────────────────────────────────────
    //
    //  • Movendo   → corpo gira para encarar a DIREÇÃO DO MOVIMENTO
    //               (personagem faz curva natural, não desliza de lado)
    //  • Parado    → corpo gira suavemente para a DIREÇÃO DA CÂMERA
    //               (fica pronto para atirar na direção que você olha)
    //
    const yawRad = state.yawRad ?? 0;

    // Inicializa na primeira chamada
    if (this._bodyYaw === null) this._bodyYaw = yawRad;

    let targetYaw;
    if (state.moving && state.moveDirAngle !== null && state.moveDirAngle !== undefined
        && !state.movingBack) {
      // Enfrenta direção do movimento (apenas quando não está indo para trás)
      // Andar para trás (S sem W) → mantém virado para a câmera, não vira 180°
      targetYaw = state.moveDirAngle;
    } else {
      // Parado ou andando para trás: enfrenta câmera
      targetYaw = yawRad;
    }

    const rotSpeed = state.moving ? ROT_MOVE : ROT_IDLE;
    this._bodyYaw  = lerpAngle(this._bodyYaw, targetYaw, rotSpeed * dt);

    this.root.rotation.y  = this._bodyYaw + FACING_OFFSET;
    this.root.rotationQuaternion = null;   // garante que rotation.y é respeitado

    // ── Trava posição — anula root motion das animações GLB ───────────
    // As animações do Meshy AI têm root motion que move o nó raiz e faz
    // o modelo se afastar do capsule. Ao resetar a posição local a cada
    // frame, o personagem sempre fica centrado no capsule.
    this.root.position.set(0, this._rootOffsetY, 0);

    // ── Máquina de estados ────────────────────────────────────────
    //
    //  Thresholds para SPEED_MAX = 11:
    //    0 – 0.8  → idle
    //    0.8 – 4  → walk
    //    4 – 8    → walk_aim
    //    > 8      → run
    //
    let key;

    if (state.dead) {
      // NÃO 'roll': o roll (Parkour_Vault_with_Roll) GIRA o personagem — é o
      //  "girou ao morrer e ficou de frente pra câmera". Fica PARADO em pé (idle)
      //  e a rotação segue _bodyYaw + FACING_OFFSET(π) = de COSTAS pra câmera; o
      //  vanish (fade cyan + partículas, Player._playDeathVanish) sinaliza a morte.
      //  Mesmo fix do caminho animLib (Player._startDeath toca 'idle', não 'dead').
      key = 'idle';

    } else if (this._wallJumpT > 0) {
      key = 'wall_jump';

    } else if (state.onWall && !state.grounded) {
      key = 'wall_ready';

    } else if (!state.grounded) {
      key = state.velY > 3 ? 'jump' : 'fall';

    } else if (state.reloading) {
      key = state.moving ? 'run_reload' : 'reload';

    } else if (this._shootT > 0) {
      key = state.moving
        ? (state.movingBack ? 'shoot_back' : 'run_shoot')
        : 'shoot';

    } else if (state.moving) {
      // Histerese de velocidade: thresholds diferentes para entrar e sair de cada estado
      // → evita que a animação fique oscilando quando a velocidade flutua no limite
      const curLoco = (this._curKey === 'run' || this._curKey === 'walk_aim' || this._curKey === 'walk')
        ? this._curKey : null;

      if      (state.speed > (curLoco === 'run'      ? 7.0 : 8.0)) key = 'run';
      else if (state.speed > (curLoco === 'walk_aim' ? 3.0 : 4.0)) key = 'walk_aim';
      else                                                          key = 'walk';

    } else {
      key = 'idle';
    }

    this._playKey(key);
  }

  // ── Crossfade por peso ────────────────────────────────────────────
  //
  //  1. Se a animação atual já é a pedida → nada a fazer
  //  2. Animação anterior continua rodando com peso 1 → vai caindo para 0
  //  3. Nova animação começa com peso 0 → vai subindo para 1
  //  4. Ambas tocam simultaneamente — Babylon blenda automaticamente
  //
  _playKey(key) {
    if (this._curKey === key) return;
    if (this._curKey === '__preview__') return;

    const animName = this._animMap[key];
    const ag = this._anims[animName];

    if (!ag) {
      // Fallback: usa a primeira animação disponível
      const fallback = Object.values(this._anims)[0];
      if (fallback && this._curKey !== '__fallback__') {
        this._startCrossfade(fallback, '__fallback__', false, DEFAULT_FADE);
      }
      return;
    }

    // Não reinicia se a animação é a mesma (pode acontecer ao trocar mapeamento)
    if (this._cur === ag) {
      this._curKey = key;
      return;
    }

    const loop     = !ONE_SHOT.has(key);
    const fadeDur  = FADE_IN[key] ?? DEFAULT_FADE;
    this._startCrossfade(ag, key, loop, fadeDur);
  }

  _startCrossfade(next, key, loop, fadeDur) {
    // Se já havia um fade em andamento com a MESMA animação de destino, ignora
    if (this._cur === next) { this._curKey = key; return; }

    // Para qualquer fade anterior que ainda estava em andamento:
    // a animação que estava em fade-in agora vira o prev do novo fade
    if (this._prev) {
      this._prev.setWeightForAllAnimatables(0);
      this._prev.stop();
      this._prev = null;
    }

    // A animação atual vira o "prev" (vai fazer fade-out)
    this._prev = this._cur;

    // Inicia a nova animação com peso 0
    next.start(loop, 1.0, next.from, next.to, false);
    next.setWeightForAllAnimatables(fadeDur > 0 ? 0 : 1);

    this._cur    = next;
    this._curKey = key;
    this._fadeT  = 0;
    this._fadeDur = fadeDur;

    // One-shot: quando terminar, volta ao estado neutro para re-avaliação
    if (!loop) {
      next.onAnimationGroupEndObservable.addOnce(() => {
        this._curKey = '';
      });
    }
  }

  // ── Remove root motion das AnimationGroups ───────────────────────
  //
  //  GLBs do Meshy AI (e maioria dos exportadores) incluem tracks de
  //  position/rotation/rotationQuaternion no nó raiz para "mover" o
  //  personagem durante a animação (root motion).
  //
  //  Em Babylon não há suporte nativo a "Apply Root Motion = Off"
  //  (ao contrário do Unity), então removemos esses targets direto
  //  do array interno da AnimationGroup → animação toca in-place.
  //
  _stripRootMotion() {
    if (!this.root) return;

    // Propriedades do root que NÃO devemos animar
    // (controladas manualmente: position travada no capsule, rotation = bodyYaw)
    const BLOCK = new Set(['position', 'rotation', 'rotationQuaternion', 'scaling']);

    let removed = 0;
    for (const ag of Object.values(this._anims)) {
      const before = ag.targetedAnimations.length;

      // ag.targetedAnimations devolve a mesma referência de ag._targetedAnimations
      // — substituímos o array filtrado
      ag._targetedAnimations = ag.targetedAnimations.filter(ta => {
        if (ta.target !== this.root) return true;          // preserva ossos e meshes filhos
        const base = ta.animation.targetProperty.split('.')[0];
        return !BLOCK.has(base);                           // descarta transforms do root
      });

      removed += before - ag.targetedAnimations.length;
    }

    DEBUG.log(
      `🐭 Root motion stripped: ${removed} track(s) removidos de ` +
      `${Object.keys(this._anims).length} AnimationGroup(s)`
    );
  }
}
