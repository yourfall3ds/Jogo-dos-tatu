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
import { DEBUG } from './utils/debug.js';

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
  }

  // ── Sockets (Ancoragem de itens) ────────────────────────────────
  
  /**
   * Encontra um osso ou nó pelo nome e cria um TransformNode filho dele
   * para servir de "socket" (ponto de montagem) estável.
   */
  getSocketNode(boneName) {
    if (!this.root || !this.scene) return null;

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
    if (bone) {
      bone.computeWorldMatrix(true);
      const bs = bone.absoluteScaling || BABYLON.Vector3.One();
      const inv = new BABYLON.Vector3(
        bs.x ? 1 / bs.x : 1,
        bs.y ? 1 / bs.y : 1,
        bs.z ? 1 / bs.z : 1
      );
      socket.scaling.copyFrom(inv);
    }

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
      key = 'roll';

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
