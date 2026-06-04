// ─────────────────────────────────────────────────────────────────
//  RemotePlayer — representação visual de outro player da sala.
//
//  Recebe um Schema state do Colyseus (PlayerState) e renderiza:
//   - Capsule colorida (cor estável por player id)
//   - Nameplate HTML com avatar + barra HP
//   - Aura vermelha (ParticleSystem) quando pvp_on
//   - Pisca vermelho quando HP < 30% (animação CSS)
//
//  Posição vem do schema (state.x/y/z/ry); interpolação client-side.
// ─────────────────────────────────────────────────────────────────

import { AnimationLibrary } from '../animation/AnimationLibrary.js';
import { AnimationController } from '../animation/AnimationController.js';
import { MOVESETS } from '../animation/animationNames.js';

// ─────────────────────────────────────────────────────────────────
//  MOVESET REAL DO AVATAR REMOTO  (mesmo sistema do player LOCAL)
//
//  Antes o remoto reusava os 16 AnimationGroups crus do player.glb (Meshy),
//  cujos nomes NÃO batem com o conteúdo — daí o "pulando" e "anim de arco ao
//  atirar". Agora cada RemotePlayer ganha sua própria AnimationLibrary +
//  AnimationController e carrega os MESMOS clipes GLB dedicados que o player
//  local (idle/walk/run/jump/punch/sword/aim_shoot…), redirecionados pro
//  esqueleto do avatar remoto (mesmo rig => retarget por nome de osso bate).
//
//  CORE (idle/walk/run) carrega bloqueante; o resto em background. Se o
//  retarget falhar (0 ossos), cai no sistema Meshy antigo como fallback.
// ─────────────────────────────────────────────────────────────────
const REMOTE_MOVESET = {
  // locomoção
  idle:            MOVESETS.basico.idle,
  walk:            MOVESETS.basico.walk,
  run:             MOVESETS.basico.run,
  run_fast:        MOVESETS.extras.run_fast,
  jump:            MOVESETS.basico.jump,
  falling:         MOVESETS.extras.falling,
  // combate (overlay one-shot via remote_fire) — cadeias REAIS do ComboSystem,
  // pra o avatar remoto tocar EXATAMENTE o mesmo golpe que o atacante (paridade).
  punch_01:          MOVESETS.luta_sem_arma.punch_01,
  punch_02:          MOVESETS.luta_sem_arma.punch_02,
  punch_03:          MOVESETS.luta_sem_arma.punch_03,
  punch_04:          MOVESETS.luta_sem_arma.punch_04,
  kick_01:           MOVESETS.luta_sem_arma.kick_01,
  kick_02:           MOVESETS.luta_sem_arma.kick_02,
  sword_attack_01:   MOVESETS.com_espada.sword_attack_01,
  sword_left_slash:  MOVESETS.com_espada.sword_left_slash,
  sword_thrust:      MOVESETS.com_espada.sword_thrust,
  sword_triple_combo:MOVESETS.com_espada.sword_triple_combo,
  aim_shoot:         MOVESETS.armado.aim_shoot,
  // reações / estado
  dodge:           MOVESETS.luta_sem_arma.dodge,
  knockdown:       MOVESETS.luta_sem_arma.knockdown,
  hit_face:        MOVESETS.extras.hit_face,
  dead:            MOVESETS.extras.dead,
};
const REMOTE_CORE_CLIPS = ['idle', 'walk', 'run'];

// network anim_state (locomoção) -> clipe REAL + parâmetros de play.
const REMOTE_LOCO = {
  idle:    { clip: 'idle',    loop: true,  speed: 1.0,  fade: 0.20 },
  unarmed: { clip: 'idle',    loop: true,  speed: 1.0,  fade: 0.20 },
  armed:   { clip: 'idle',    loop: true,  speed: 1.0,  fade: 0.20 },
  sword:   { clip: 'idle',    loop: true,  speed: 1.0,  fade: 0.20 },
  walk:    { clip: 'walk',    loop: true,  speed: 1.0,  fade: 0.16 },
  walking: { clip: 'walk',    loop: true,  speed: 1.0,  fade: 0.16 },
  moving:  { clip: 'walk',    loop: true,  speed: 1.0,  fade: 0.16 },
  run:     { clip: 'run',     loop: true,  speed: 1.0,  fade: 0.18 },
  run_fast:{ clip: 'run_fast',loop: true,  speed: 1.0,  fade: 0.16 },
  fall:    { clip: 'falling', loop: true,  speed: 1.0,  fade: 0.14 },
  falling: { clip: 'falling', loop: true,  speed: 1.0,  fade: 0.14 },
  jump:    { clip: 'jump',    loop: false, speed: 1.0,  fade: 0.08 },
};
const REMOTE_LOCO_DEFAULT = REMOTE_LOCO.idle;

const COLORS = [
  [1.0, 0.45, 0.30], [0.30, 0.85, 1.0], [0.95, 0.75, 0.25],
  [0.70, 0.45, 0.95], [0.45, 0.90, 0.50], [1.0, 0.55, 0.75],
  [0.30, 0.55, 1.0], [0.95, 0.35, 0.35],
];

function _colorFor(id) {
  let h = 0; const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ─────────────────────────────────────────────────────────────────
//  Modelo por CLASSE (skin). O class_id já trafega no PlayerState (e vive
//  no Supabase settings via CloudSave) — quando o player escolhe outra
//  classe/skin, todos veem o avatar trocar AO VIVO, sem redeploy do servidor.
//  Espelha CharacterSelect3D.CLASSES. Mantém scale/foot do player.glb como
//  default (calibração validada); novas classes podem sobrescrever.
// ─────────────────────────────────────────────────────────────────
const REMOTE_CLASS_MODELS = {
  0: { url: 'assets/characters/player.glb',    scale: 1.164, height: 1.8 },
  1: { url: 'assets/characters/azurefin.glb',  scale: 1.164, height: 1.8 },
};
function _classModel(classId) {
  return REMOTE_CLASS_MODELS[classId | 0] || REMOTE_CLASS_MODELS[0];
}

// ─────────────────────────────────────────────────────────────────
//  Mapa de animação remota  (anim_state do server -> clipe REAL do GLB)
//
//  O server manda PlayerStateMachine.state:
//    'unarmed' | 'idle' | 'moving' | 'armed' | 'sword' |
//    'attacking' | 'shooting' | 'stunned' | 'knockdown' | 'dodging'
//
//  O GLB (assets/characters/player.glb, mesmo do player local) tem 16
//  AnimationGroups com nomes do Meshy AI que NAO batem com o conteudo.
//  A tabela abaixo usa a CALIBRAÇÃO do usuario (igual ao comentario do
//  PlayerAnimator.js) — qual clipe Meshy realmente faz o que:
//
//    Jump_Down_from_Wall            -> Parado (idle REAL)
//    Walk_Backward_While_Shooting   -> Andando (walk REAL)
//    Walk_Forward_with_Bow_Aimed    -> Correndo mirando
//    Running                        -> Correndo + recarregando
//    Archery_Shot_1                 -> Tiro de arco (shoot)
//    Run_and_Shoot                  -> Tiro de arco 2
//    Parkour_Vault_with_Roll        -> Roll / morte
//    Roll_Dodge_1                   -> Esquiva (dodge)
//
//  Por isso o resolver NÃO usa includes() na string crua (causava
//  'idle' -> Idle_5 = PULO, e 'moving'/'armed'/... -> nenhum match =
//  avatar congelado). Aqui cada anim_state aponta pro NOME REAL do clipe.
// ─────────────────────────────────────────────────────────────────
//  FIX coerencia: clipes do GLB usados pelos NOMES REAIS (sem includes() cego):
//    Idle_5           -> parado/idle REAL
//    Walking          -> andar
//    Running          -> correr
//    Running_Reload   -> correr recarregando
//    Regular_Jump     -> pulo / queda
//    Run_and_Shoot    -> acao neutra de combate (melee generico)
//    Archery_Shot_1   -> tiro de arco (ranged)
//    Roll_Dodge_1     -> esquiva
//    Parkour_Vault_with_Roll -> roll/morte
//  NUNCA mapear combate pra Jump_Down_from_Wall (pular da parede como golpe = ridiculo).
const REMOTE_ANIM_MAP = {
  // ── estados do server (PlayerStateMachine.state) — locomocao ──
  idle      : 'Idle_5',                        // parado de verdade
  unarmed   : 'Idle_5',                        // sem arma = parado
  armed     : 'Idle_5',                        // arma equipada, parado
  sword     : 'Idle_5',                        // espada equipada, parado (NAO pular da parede)
  moving    : 'Walking',                       // andar de verdade
  walking   : 'Walking',
  // ── combate (overlay transiente via remote_fire) ──
  shooting  : 'Archery_Shot_1',               // tiro de arco (ranged)
  attacking : 'Run_and_Shoot',                // ataque melee/genérico (acao neutra)
  punch     : 'Run_and_Shoot',                // soco -> acao neutra (GLB não tem soco real)
  melee     : 'Run_and_Shoot',                // golpe melee genérico
  sword_atk : 'Run_and_Shoot',                // golpe de espada -> acao neutra (NAO clipe de arco)
  stunned   : 'Parkour_Vault_with_Roll',      // atordoado -> roll/queda
  knockdown : 'Parkour_Vault_with_Roll',      // nocaute/morte -> roll
  dodging   : 'Roll_Dodge_1',                 // esquiva

  // ── aliases p/ nomes "limpos" (PlayerAnimator local / futuro server) ──
  walk      : 'Walking',
  walk_aim  : 'Walk_Forward_with_Bow_Aimed',
  walk_back : 'Walk_Backward_with_Bow_Aimed',
  run       : 'Running',
  run_fast  : 'Running',
  run_shoot : 'Run_and_Shoot',
  run_reload: 'Running_Reload',
  reload    : 'Running_Reload',
  jump      : 'Regular_Jump',
  falling   : 'Regular_Jump',
  fall      : 'Regular_Jump',
  wall_ready: 'Climb_Stairs',
  wall_jump : 'Regular_Jump',
  roll      : 'Parkour_Vault_with_Roll',
  shoot     : 'Archery_Shot_1',
  aim       : 'Walk_Forward_with_Bow_Aimed',
  aim_idle  : 'Walk_Forward_with_Bow_Aimed',
  aim_walk  : 'Walk_Forward_with_Bow_Aimed',
  shoot_back: 'Walk_Backward_with_Bow_Aimed',
  dead      : 'Parkour_Vault_with_Roll',
  death     : 'Parkour_Vault_with_Roll',
  dodge     : 'Roll_Dodge_1',
  stun      : 'Parkour_Vault_with_Roll',
};

const REMOTE_DEFAULT_ANIM = 'Idle_5'; // fallback = idle REAL (NUNCA mira de arco parada)
const REMOTE_BLEND_SPEED  = 0.09;     // crossfade suave entre clipes (sem pose-snap)

/**
 * Resolve um anim_state cru (do server) para a AnimationGroup REAL do GLB.
 *   1) mapa calibrado (estado do server -> nome exato do clipe)
 *   2) match exato pelo nome do clipe (caso o server mande o nome cru do GLB)
 *   3) idle REAL como ultimo recurso (nunca retorna null se houver anim)
 * @returns {object|null} AnimationGroup ou null se a lista estiver vazia.
 */
function _resolveRemoteAnim(rawState, animGroups) {
  if (!animGroups || !animGroups.length) return null;
  const findByName = (name) => {
    if (!name) return null;
    const low = String(name).toLowerCase();
    return animGroups.find(a => a.name && a.name.toLowerCase() === low) || null;
  };

  const key = String(rawState == null ? 'idle' : rawState).toLowerCase().trim() || 'idle';

  // 1) mapa calibrado (estado -> clipe REAL)
  const mapped = REMOTE_ANIM_MAP[key];
  if (mapped) {
    const ag = findByName(mapped);
    if (ag) return ag;
  }

  // 2) server pode ter mandado o nome cru do clipe do GLB
  const exact = findByName(rawState);
  if (exact) return exact;

  // 3) idle REAL (ou primeira anim disponivel) — nunca congela
  return findByName(REMOTE_DEFAULT_ANIM) || animGroups[0] || null;
}

export class RemotePlayer {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.playerId = state.id;
    this.nickname = state.nickname || 'Player';

    const [r, g, b] = _colorFor(this.playerId);
    const rgb255 = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;
    this._rgb = { r, g, b, rgb255 };

    this.root = new BABYLON.TransformNode(`remote_${this.playerId}`, scene);
    this.body = BABYLON.MeshBuilder.CreateCapsule(`remote_body_${this.playerId}`,
      { radius: 0.35, height: 1.8, tessellation: 12 }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.9;
    const mat = new BABYLON.StandardMaterial(`remote_mat_${this.playerId}`, scene);
    mat.diffuseColor = new BABYLON.Color3(r, g, b);
    mat.emissiveColor = new BABYLON.Color3(r * 0.35, g * 0.35, b * 0.35);
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    this.body.material = mat;
    this._bodyMat = mat;

    // ── FIX: retângulo/box indicador de mira REMOVIDO ──
    // Antes era um box branco (this.eye) só pra indicar a frente. Agora a
    // direção é mostrada pelo próprio avatar + arma na mão (orientado por ry,
    // aplicado em this.root.rotation.y no update()). this.eye fica null pra
    // não quebrar dispose/refs antigos.
    this.eye = null;

    // Slot da arma anexada na mão do avatar remoto (preenchido após GLB carregar)
    this._weaponMesh   = null;   // clone TPS atual anexado
    this._weaponSocket = null;   // TransformNode socket no osso da mão
    this._weaponId     = null;   // id da arma atualmente anexada

    // ── Sistema de animação REAL (mesmo do player local) ──
    // Cada RemotePlayer tem sua AnimationLibrary/Controller próprios, com os
    // clipes do moveset redirecionados pro esqueleto deste avatar. _realAnimsReady
    // só vira true quando ao menos os clipes CORE (idle/walk/run) retargetaram OK;
    // até lá (ou se falhar) usa o sistema Meshy antigo como fallback.
    this._animLib       = null;
    this._animCtrl      = null;
    this._realAnimsReady = false;
    this._curLocoState  = 'idle';   // último estado de locomoção (real)

    this.body._isRemotePlayer = true;
    this.body._remoteRef = this;
    // FIX PvP fidelidade: a capsule e o HITBOX dedicado do player remoto.
    // _isHitProxy=true faz o predicate do WeaponSystem sempre escolher ESTE mesh
    // (limpo, capsule simples) em vez do GLB skinnado (bind-pose, hitbox errado).
    // Ela e filha de this.root, que recebe o y interpolado => sobe junto no pulo.
    // Quando o GLB carrega ela fica visibility=0 mas continua enabled + pickable.
    this.body._isHitProxy = true;
    try { this.body.isPickable = true; } catch (_) {}

    // FRENTE 3: capsule ja inicia com visibility baixa (vai ser escondida total quando GLB carregar)
    try { this.body.visibility = 0.25; } catch (_) {}
    this._glbLoadAttempts = 0;
    this._glbMaxAttempts = 3;

    // ── FRENTE 7: tenta carregar GLB do avatar real (capsule fica como fallback) ──
    this._tryLoadAvatar().catch(e => console.warn("[RemotePlayer] GLB load fail", e?.message));

    // ── Aura vermelha (PVP) ──
    this.aura = null;
    this._auraOn = false;
    this._buildAura();

    // ── Nameplate ──
    this._nameEl = document.createElement('div');
    this._nameEl.style.cssText = `
      position: fixed; pointer-events: none; z-index: 80;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      transform: translate(-50%, -100%);
    `;
    this._nameEl.innerHTML = `
      <div class="rp-namebox" style="display:flex;align-items:center;gap:5px;
                  background:rgba(0,0,0,0.72);padding:2px 7px 2px 3px;
                  border:1px solid ${rgb255};border-radius:10px;
                  font:700 11px 'Segoe UI',monospace;color:${rgb255};
                  text-shadow:0 1px 2px rgba(0,0,0,0.9);letter-spacing:0.5px;
                  transition: border-color 0.2s, box-shadow 0.2s;">
        <img class="rp-avatar" src="" style="width:16px;height:16px;border-radius:50%;display:none;border:1px solid ${rgb255};"/>
        <span class="rp-name">${_esc(this.nickname)}</span>
        <span class="rp-pvp" style="display:none;color:#ff4040;font-weight:900;letter-spacing:0;">⚔</span>
      </div>
      <div style="width:60px;height:5px;background:rgba(0,0,0,0.65);border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,0.7);">
        <div class="rp-hp" style="height:100%;width:100%;background:linear-gradient(90deg,#22dd44,#66ff88);transition:width 0.15s;"></div>
      </div>
    `;
    document.body.appendChild(this._nameEl);
    this._nameBox = this._nameEl.querySelector('.rp-namebox');
    this._avatarEl = this._nameEl.querySelector('.rp-avatar');
    this._nameTextEl = this._nameEl.querySelector('.rp-name');
    this._hpEl = this._nameEl.querySelector('.rp-hp');
    this._pvpEl = this._nameEl.querySelector('.rp-pvp');

    if (state.avatar_url) this._setAvatar(state.avatar_url);

    // Interpolação buffer (anti-borrachudo).
    // 70ms = ~4 frames a 60fps: responsivo o bastante pro PvP (100ms era
    // perceptível) sem sacrificar a suavização. O snap de teleporte (>5m) +
    // coalesce de burst já evitam o stutter de buffer vazio.
    this._snapshots = [];
    this.RENDER_LAG_MS = 70;
    this._current = { x: state.x || 0, y: state.y || 0, z: state.z || 0, ry: state.ry || 0 };
    this.root.position.set(this._current.x, this._current.y, this._current.z);

    // Bind listeners do schema
    this._bindStateListeners();
    this._applyHp(state.hp ?? 100, state.maxHp ?? 100);
    this._applyPvp(state.pvp_on === true);
    this._applyDead(state.dead === true);
  }

  _bindStateListeners() {
    // listeners agora são attachados pelo ColyseusClient via getStateCallbacks
    // (player_change events). Aqui só inicializa o estado atual.
    this._pushSnapshot();
  }

  _maybePlayFootstep(state) {
    if (!state) return;
    const a = String(state.anim_state || "");
    let isMoving = a.includes("walk") || a.includes("run");
    let running = a.includes("run");
    // Fallback robusto: mesmo que o anim_state nao chegue como walk/run (ex.: o
    // server so atualizou x/z), detecta movimento real pelo DELTA de posicao
    // horizontal (XZ) entre updates. Garante que os passos do parceiro toquem
    // quando ele anda, independente do estado de animacao.
    if (!isMoving) {
      const px = this._lastStepPos;
      if (px) {
        const dx = (state.x || 0) - px.x, dz = (state.z || 0) - px.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0009) { isMoving = true; running = d2 > 0.02; } // ~0.03m walk / ~0.14m run
      }
    }
    this._lastStepPos = { x: state.x || 0, z: state.z || 0 };
    if (!isMoving) return;
    const now = performance.now();
    const cooldown = running ? 280 : 420;
    if (this._lastStepT && now - this._lastStepT < cooldown) return;
    this._lastStepT = now;
    try {
      const sm = window._soundManager;
      if (!sm?._getSpatialSound) return;
      sm._getSpatialSound("run_concrete", 30).then(snd => {
        if (!snd) return;
        try {
          if (snd.spatial?.position?.set) snd.spatial.position.set(state.x, state.y, state.z);
          snd.volume = 0.45;
          snd.play();
        } catch (_) {}
      }).catch(() => {});
    } catch (_) {}
  }

  /** Chamado pelo ColyseusClient quando um campo do schema muda. */
  onSchemaChange(field, newValue) {
    const s = this.state;
    // 'pos' = wiring real do ColyseusClient p/ x/y/z (ver listeners). 'x'/'z' mantidos
    // por compat caso o wiring passe a emitir nomes de campo crus.
    if (field === "pos" || field === "x" || field === "z" || field === "anim_state") {
      try { this._maybePlayFootstep(s || this.state); } catch (_) {}
    }
    switch (field) {
      case 'pos':
      case 'ry':
        this._pushSnapshot();
        break;
      case 'hp': {
        const newHp = s.hp;
        const prevHp = (this._lastHp != null) ? this._lastHp : newHp;
        const dmg = prevHp - newHp;
        this._lastHp = newHp;
        this._applyHp(newHp, s.maxHp || 100);
        // FIX dano visual remoto: HP caiu e nao esta morto → pisca vermelho no
        // avatar GLB + numero de dano flutuante (reusa o DamageNumbers global).
        // try/catch dedicado por FX: se um falhar, NAO pode pular o overlay de
        // anim_state que vem DEPOIS no mesmo evento (bug central de PvP).
        if (dmg > 0 && newHp > 0 && !this.state?.dead && !this._disposing && !this._disposed) {
          try { this._flashHit(); } catch (_) {}
          try { this._spawnDamageNumber(dmg); } catch (_) {}
        }
        break;
      }
      case 'pvp_on':
        this._applyPvp(s.pvp_on === true);
        break;
      case 'dead':
        this._applyDead(s.dead === true);
        break;
      case 'weapon':
      case 'held_item':
        // Player remoto trocou de arma / item na mão → re-anexa o mesh TPS.
        try { this._attachWeaponFromState(); } catch (e) { console.warn('[RemotePlayer] weapon swap fail', e?.message); }
        break;
      case 'class_id':
      case 'avatar_url':
        // Player remoto trocou de CLASSE/skin (class_id) OU de avatar (avatar_url
        //  dos 6 personagens novos) → recarrega o avatar ao vivo.
        try { this._swapClassModel(); } catch (e) { console.warn('[RemotePlayer] skin swap fail', e?.message); }
        break;
    }
    // FRENTE 7 (FIX): troca animacao quando anim_state muda.
    // Usa o mapa calibrado (estado do server -> clipe REAL do GLB) em vez do
    // antigo includes() na string crua. SEMPRE para a anim anterior e cai pra
    // idle REAL quando o estado for vazio/desconhecido (nunca congela).
    if (field === "anim_state" && (this._realAnimsReady || this._avatarAnims?.length)) {
      const v = newValue != null ? newValue : (s?.anim_state || "idle");
      // Se um overlay de ataque está rodando (via remote_fire), NÃO deixa a
      // locomoção interromper o golpe — só grava o estado pra restaurar depois.
      // O timer de playAttackOnce restaura a locomoção quando o golpe terminar.
      if (this._attackingUntil && performance.now() < this._attackingUntil) {
        this._curAnimState = v;
        return;
      }
      this._playAnimState(v);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  SISTEMA DE ANIMAÇÃO REAL (espelha o player local)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Carrega o moveset REAL no esqueleto do avatar remoto. CORE (idle/walk/run)
   * primeiro (libera _realAnimsReady assim que chegam); o resto em background.
   * Os clipes Meshy embutidos ficam STOPADOS como fallback (não são descartados).
   */
  async _initRealAnims() {
    if (this._animLib || !this._avatarRoot) return;
    const lib  = new AnimationLibrary(this.scene);
    const ctrl = new AnimationController(lib);
    this._animLib = lib;
    this._animCtrl = ctrl;

    const root = this._avatarRoot;
    const loadOne = async (name) => {
      const url = REMOTE_MOVESET[name];
      if (!url) return false;
      try {
        await lib.loadExternalAnimations(url, name, root);
        return lib.has(name);
      } catch (_) { return false; }
    };

    // CORE bloqueante (paralelo) — idle/walk/run retargetados garantem locomoção real.
    const coreOk = await Promise.all(REMOTE_CORE_CLIPS.map(loadOne));
    if (this._disposed || this._disposing) return;
    if (!coreOk.some(Boolean)) {
      // Nenhum core retargetou (rig incompatível) → fica no Meshy fallback.
      console.warn('[RemotePlayer] moveset real não retargetou — usando fallback Meshy');
      return;
    }

    // Pós-processo igual ao local: trava root motion XZ das poses armadas.
    try { lib.configureAll?.({ aim_shoot: { stripRootXZ: true } }); } catch (_) {}

    // Para os clipes Meshy (não disputam os mesmos ossos) e liga o sistema real.
    for (const a of (this._avatarAnims || [])) { try { a.stop(); } catch (_) {} }
    this._realAnimsReady = true;
    this._curAnim = null;               // invalida ref do clipe Meshy anterior
    // Toca já a locomoção atual no sistema real (ou retoma o ataque/morte em curso).
    if (this.state?.dead) { this._applyDeadRagdoll(); }
    else if (!(this._attackingUntil && performance.now() < this._attackingUntil)) {
      this._playLocoReal(this.state?.anim_state || 'idle');
    }

    // Resto do moveset em background (combate/reações) — sem travar nada.
    const rest = Object.keys(REMOTE_MOVESET).filter(n => !REMOTE_CORE_CLIPS.includes(n));
    Promise.all(rest.map(loadOne)).then(() => {
      if (this._disposed || this._disposing) return;
      try { this._animLib?.configureAll?.({ aim_shoot: { stripRootXZ: true } }); } catch (_) {}
    });
  }

  /** Toca o clipe de LOCOMOÇÃO real pro anim_state da rede (idle/walk/run/fall). */
  _playLocoReal(rawState) {
    if (!this._realAnimsReady || !this._animCtrl) return;
    const key = String(rawState == null ? 'idle' : rawState).toLowerCase().trim() || 'idle';
    const m = REMOTE_LOCO[key] || REMOTE_LOCO_DEFAULT;
    // Se o clipe pedido não existe ainda (background), cai pra idle/walk/run já prontos.
    let clip = m.clip;
    if (!this._animLib?.has(clip)) {
      clip = this._animLib?.has('idle') ? 'idle' : (this._animLib?.has('run') ? 'run' : null);
      if (!clip) return;
    }
    this._curLocoState = rawState;
    this._curAnimState = rawState;
    this._animCtrl.play(clip, { loop: m.loop !== false, speed: m.speed ?? 1.0, fade: m.fade ?? 0.16 });
  }

  /** Escolhe o clipe de ATAQUE real conforme melee/ranged + arma. Fixa o "anim
   *  de arco ao atirar": tiro vira aim_shoot, NUNCA um clipe de arco. */
  _attackClipFor(melee, weaponId) {
    const w = String(weaponId || '').toLowerCase();
    if (!melee) return 'aim_shoot';
    if (w.includes('sword') || w.includes('espada') || w.includes('blade') || w.includes('katana')) {
      return 'sword_attack_01';
    }
    // soco genérico (alterna 01/02 pra dar variedade)
    this._punchToggle = !this._punchToggle;
    return this._punchToggle ? 'punch_01' : 'punch_02';
  }

  _playAnimState(rawState) {
    // Sistema real pronto → usa os clipes dedicados (idle/walk/run/…).
    if (this._realAnimsReady) { this._playLocoReal(rawState); return; }

    // ── Fallback Meshy (até o moveset real retargetar / se falhar) ──
    const anims = this._avatarAnims;
    if (!anims?.length) return;

    const next = _resolveRemoteAnim(rawState, anims);
    if (!next) return;

    // Já está tocando esse clipe → não reinicia (evita "tremor" de restart).
    if (this._curAnim === next && next.isPlaying) return;

    this._enableBlending(anims);

    // PARA todas as outras anims: garante que a anterior NUNCA fica rodando
    // empilhada (sem 2 anims sobrepostas). Com enableBlending ativo, o Babylon
    // ja faz a rampa de peso ao iniciar a nova, dando crossfade suave (sem snap).
    for (const a of anims) {
      if (a === next) continue;
      try { a.stop(); } catch (_) {}
    }

    try {
      // loop=true, weight 1.0, speedRatio 1.0 (coerente). O enableBlending faz a
      // transicao ponderada 0->1 ao longo de ~1/blendingSpeed frames.
      next.start(true, 1.0, next.from, next.to, false);
    } catch (_) {
      try { next.start(true, 1.0); } catch (_) {}
    }

    this._curAnim = next;
    this._curAnimState = rawState;
  }

  /** Habilita blending (crossfade) em todos os AnimationGroups do avatar remoto,
   *  uma unica vez. Sem isso, cada troca de clipe e um "pose-snap" (teleporte de
   *  pose) que parece o avatar alucinando. */
  _enableBlending(anims) {
    if (this._blendingEnabled || !anims?.length) return;
    for (const ag of anims) {
      try {
        ag.enableBlending(REMOTE_BLEND_SPEED);
        if (ag.blendingSpeed !== undefined) ag.blendingSpeed = REMOTE_BLEND_SPEED;
        const targeted = ag.targetedAnimations || [];
        for (const ta of targeted) {
          const anim = ta.animation;
          if (anim) {
            anim.enableBlending = true;
            anim.blendingSpeed = REMOTE_BLEND_SPEED;
          }
        }
      } catch (_) {}
    }
    this._blendingEnabled = true;
  }

  /**
   * OVERLAY DE ATAQUE TRANSIENTE — toca um clipe de ação UMA vez (não-loop) por
   * ~ms e depois restaura a locomoção (o anim_state que estava antes).
   *
   * O anim_state que trafega pela rede é SÓ locomoção (idle/walk/run/fall) —
   * o FSM de combate (attacking/punch/sword) é descartado de propósito no
   * sendInput pra não quebrar os passos. Então o sinal de combate que chega é
   * o evento `remote_fire` (rebroadcast do server quando o player dispara/golpeia).
   * Este método dá o "tapa" visual de ataque por cima da locomoção e volta
   * sozinho, sem poluir o _curAnimState de locomoção.
   *
   * @param {string} state estado de ataque ('attacking'|'punch'|'melee'|'shooting'|'sword_atk')
   * @param {number} ms    duração antes de restaurar a locomoção (default 500ms)
   */
  playAttackOnce(state = 'attacking', ms = 500, opts = null) {
    // Sistema real pronto → toca o clipe de ataque REAL (punch/sword/aim_shoot).
    if (this._realAnimsReady && this._animCtrl) {
      this._playAttackReal(state, ms, opts);
      return;
    }

    const anims = this._avatarAnims;
    if (!anims?.length) return;

    const clip = _resolveRemoteAnim(state, anims);
    if (!clip) return;

    // Locomoção pra onde voltar quando o ataque acabar: o último anim_state de
    // locomoção recebido pela rede (ou idle REAL).
    const restoreTo = this._curAnimState || this.state?.anim_state || 'idle';

    this._enableBlending(anims);

    // PARA todas as outras anims pra o clipe de ataque ficar sozinho (sem
    // sobreposicao). O blending faz a entrada/saida do golpe ser suave.
    for (const a of anims) {
      if (a === clip) continue;
      try { a.stop(); } catch (_) {}
    }

    try {
      clip.start(false, 1.0, clip.from, clip.to, false); // loop=false (toca uma vez)
    } catch (_) {
      try { clip.start(false, 1.0); } catch (_) {}
    }

    // ── VFX de corte (slash arc) — barato e transiente (~200ms) ──
    // Só para golpes melee (não pra tiro de arco). Dá a leitura visual da
    // "espadada" que faltava: o clipe do GLB sozinho era sutil demais.
    const k = String(state || '').toLowerCase();
    const isMelee = k === 'attacking' || k === 'melee' || k === 'punch' ||
                    k === 'sword_atk' || k === 'sword';
    if (isMelee) { try { this._spawnSlashVFX(); } catch (_) {} }

    // Marca como "em ataque" SEM gravar em _curAnimState (pra restaurar a locomoção).
    this._curAnim = clip;
    this._attackingUntil = performance.now() + ms;

    // Cancela timer anterior (ataques em sequência re-armam) e agenda a restauração.
    if (this._attackTimer) { try { clearTimeout(this._attackTimer); } catch (_) {} }
    this._attackTimer = setTimeout(() => {
      this._attackTimer = null;
      if (this._disposed || this._disposing) return;
      // Se um anim_state novo chegou nesse meio tempo, ele já mandou no _curAnimState;
      // restaura a locomoção atual (ou a que estava antes do ataque).
      const back = this.state?.anim_state || restoreTo;
      this._playAnimState(back);
    }, ms);
  }

  /**
   * Overlay de ataque com o MOVESET REAL. Resolve o clipe certo (soco/espada/
   * tiro/flinch), toca uma vez por cima da locomoção e volta sozinho. Espelha o
   * que o CombatSystem faz no player local (play one-shot + onComplete).
   * @param {object|null} opts { melee:boolean, weapon:string } do remote_fire.
   */
  _playAttackReal(state, ms, opts) {
    const ctrl = this._animCtrl;
    if (!ctrl) return;
    const k = String(state || '').toLowerCase();

    // 0) Clipe EXATO enviado pelo atacante (paridade total) — se o avatar remoto
    //    tiver esse clipe carregado, toca o MESMO golpe que o player local.
    let clip;
    if (opts && typeof opts.anim === 'string' && opts.anim && this._animLib?.has(opts.anim)) {
      clip = opts.anim;
    } else if (opts && typeof opts.melee === 'boolean') {
      // 1) Sem clipe exato (ou não carregado): decide por melee/weapon.
      clip = this._attackClipFor(opts.melee, opts.weapon);
    } else {
      // 2) Estados internos (flinch/dodge/morte) → clipe de reação real.
      clip = ({
        shooting: 'aim_shoot', shoot: 'aim_shoot',
        attacking: 'punch_01', punch: 'punch_01', melee: 'punch_01',
        sword_atk: 'sword_attack_01', sword: 'sword_attack_01',
        stunned: 'hit_face', knockdown: 'knockdown',
        dodging: 'dodge', dodge: 'dodge', death: 'dead', dead: 'dead',
      })[k] || 'punch_01';
    }

    // Clipe ainda não retargetou (background) → mantém locomoção (sem crashar).
    if (!this._animLib?.has(clip)) return;

    const isMelee = clip.startsWith('punch') || clip.startsWith('sword') || k === 'stunned';
    if (isMelee && k !== 'stunned') { try { this._spawnSlashVFX(); } catch (_) {} }

    // Janela de ataque = duração REAL do clipe (não o ms fixo) pra não cortar
    // combos longos de espada no meio. onComplete restaura no fim de verdade;
    // o timer é só rede de segurança. Espelha o safety-timeout do CombatSystem.
    const realDurMs = (ctrl.getDuration?.(clip) || 0) * 1000;
    const holdMs = Math.max(ms, realDurMs > 0 ? realDurMs + 100 : ms);
    const restoreTo = this._curLocoState || this.state?.anim_state || 'idle';
    this._attackingUntil = performance.now() + holdMs;
    ctrl.play(clip, {
      loop: false, fade: 0.08,
      onComplete: () => {
        if (this._disposed || this._disposing) return;
        this._attackingUntil = 0;
        this._playLocoReal(this.state?.anim_state || restoreTo);
      },
    });
    // Fallback de restauração (se o onComplete não disparar).
    if (this._attackTimer) { try { clearTimeout(this._attackTimer); } catch (_) {} }
    this._attackTimer = setTimeout(() => {
      this._attackTimer = null;
      if (this._disposed || this._disposing) return;
      this._attackingUntil = 0;
      this._playLocoReal(this.state?.anim_state || restoreTo);
    }, holdMs + 80);
  }

  /**
   * REAÇÃO DE HIT no player remoto (lado do ATACANTE).
   *
   * O estado autoritativo (posição/HP) vem do server e é interpolado nos
   * snapshots — NÃO mexemos no estado lógico aqui. Pra dar game-feel de
   * IMPACTO no PvP, aplicamos um EMPURRÃO VISUAL PREDITIVO: deslocamos o
   * `_current` (a posição RENDERIZADA suavizada) na direção do golpe por um
   * instante. O próximo snapshot do server reconverge a posição (update() faz
   * lerp pro alvo), então o nudge some sozinho SEM desync — é puramente
   * cosmético, igual ao hitstop do atacante já existente.
   *
   * Também dispara o flinch (anim de reação) + flash vermelho no avatar.
   *
   * @param {BABYLON.Vector3} dirVec  direção do golpe (do atacante p/ alvo), XZ
   * @param {number} force            força do knockback (kbEff do CombatSystem)
   * @param {number} critLevel        0/1/2 — crit empurra mais
   */
  playHit(dirVec, force = 1, critLevel = 0) {
    if (this._disposed || this._disposing) return;
    try {
      if (dirVec && typeof BABYLON !== 'undefined') {
        let dx = dirVec.x || 0, dz = dirVec.z || 0;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        // Força bruta do kb vira um nudge pequeno (metros). Crit empurra mais.
        // Clamp em ~0.9m: legível mas sem "voar" (o server reconverge no tick).
        const push = Math.min(0.9, 0.16 * (force || 1) * (critLevel >= 1 ? 1.4 : 1.0));
        this._current.x += dx * push;
        this._current.z += dz * push;
        try { this.root.position.set(this._current.x, this._current.y, this._current.z); } catch (_) {}
      }
    } catch (_) {}
    // Flinch (anim de reação) + flash vermelho.
    try { this.playAttackOnce('stunned', critLevel >= 1 ? 360 : 220); } catch (_) {}
    try { this._flashHit(); } catch (_) {}
  }

  /**
   * Flash vermelho transiente no corpo ao tomar dano. Reusado pelo
   * onSchemaChange('hp') (dano autoritativo) e por playHit (preditivo).
   * Pisca o emissiveColor do material por ~140ms e restaura pro estado certo.
   */
  _flashHit() {
    if (this._disposed || this._disposing) return;
    const mat = this._bodyMat;
    if (!mat || typeof BABYLON === 'undefined') return;
    try {
      if (!this._emissiveBackup) {
        this._emissiveBackup = mat.emissiveColor ? mat.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
      }
      mat.emissiveColor = new BABYLON.Color3(0.95, 0.12, 0.12);
      if (this._flashTimer) { clearTimeout(this._flashTimer); }
      this._flashTimer = setTimeout(() => {
        this._flashTimer = null;
        try {
          if (this._disposed || this._disposing) return;
          if (this._auraOn) mat.emissiveColor = new BABYLON.Color3(0.50, 0.05, 0.05);
          else if (this._emissiveBackup) mat.emissiveColor = this._emissiveBackup.clone();
        } catch (_) {}
      }, 140);
    } catch (_) {}
  }

  /**
   * Número de dano flutuante na cabeça do avatar remoto (reusa o
   * DamageNumbers global). Disparado pelo onSchemaChange('hp').
   */
  _spawnDamageNumber(dmg) {
    if (this._disposed || this._disposing) return;
    try {
      const dn = (typeof window !== 'undefined') ? window._dmgNumbers : null;
      if (!dn?.spawn || typeof BABYLON === 'undefined') return;
      const pos = this.root?.getAbsolutePosition?.();
      if (!pos) return;
      const head = pos.add(new BABYLON.Vector3(0, 1.9, 0));
      dn.spawn(head, dmg, { color: '#ff8844' });
    } catch (_) {}
  }

  /**
   * VFX de corte BARATO e transiente (~200ms): um plane com textura de arco
   * (gerada via canvas/DynamicTexture, cacheada estaticamente) anexado na
   * frente do avatar remoto. Faz sweep angular + fade emissivo e se descarta
   * sozinho. Zero TrailMesh, zero shader pesado, zero dependencia externa.
   *
   * Ancora: this._weaponSocket (mao da arma) se existir, senao this.root.
   * Orientacao: usa o ry atual (this._current.ry) ja aplicado no root.
   */
  _spawnSlashVFX() {
    if (this._disposed || this._disposing) return;
    const scene = this.scene;
    if (!scene || typeof BABYLON === 'undefined') return;

    // Textura de arco (canvas) — construida UMA vez e compartilhada por todos.
    // Se a cache aponta pra textura de uma cena ja descartada, recria.
    if (RemotePlayer._slashTex && RemotePlayer._slashTex.getScene &&
        RemotePlayer._slashTex.getScene() !== scene) {
      RemotePlayer._slashTex = null;
    }
    if (!RemotePlayer._slashTex) {
      try {
        const S = 128;
        const tex = new BABYLON.DynamicTexture('slashTex', { width: S, height: S }, scene, false);
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, S, S);
        // Arco em forma de crescente: stroke grosso com gradiente radial pra dar fade nas pontas.
        const cx = S * 0.5, cy = S * 0.95, rad = S * 0.78;
        ctx.lineCap = 'round';
        const grd = ctx.createLinearGradient(0, 0, S, 0);
        grd.addColorStop(0.0, 'rgba(120,230,255,0)');
        grd.addColorStop(0.5, 'rgba(190,250,255,1)');
        grd.addColorStop(1.0, 'rgba(120,230,255,0)');
        ctx.strokeStyle = grd;
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass === 0 ? 26 : 10;
          ctx.globalAlpha = pass === 0 ? 0.55 : 1.0;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, Math.PI * 1.18, Math.PI * 1.82, false);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        tex.update();
        tex.hasAlpha = true;
        RemotePlayer._slashTex = tex;
      } catch (_) { RemotePlayer._slashTex = null; }
    }
    if (!RemotePlayer._slashTex) return;

    let plane = null, mat = null;
    try {
      plane = BABYLON.MeshBuilder.CreatePlane(`slash_${this.playerId}_${performance.now() | 0}`,
        { size: 1.6, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
      mat = new BABYLON.StandardMaterial(`slashMat_${this.playerId}`, scene);
      mat.diffuseTexture = RemotePlayer._slashTex;
      mat.emissiveTexture = RemotePlayer._slashTex;
      mat.opacityTexture = RemotePlayer._slashTex;
      mat.emissiveColor = new BABYLON.Color3(0.55, 0.95, 1.0);
      mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
      mat.specularColor = new BABYLON.Color3(0, 0, 0);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
      mat.alpha = 1;
      plane.material = mat;
      plane.isPickable = false;
      plane.doNotSyncBoundingInfo = true;
      plane.alwaysSelectAsActiveMesh = true;

      // Ancora: socket da mao se existir, senao o root (avatar inteiro).
      const anchor = this._weaponSocket || this.root;
      plane.parent = anchor;
      // Se ancorado no root: posiciona na frente/altura do peito.
      // Se no socket da mao: fica perto da lamina (escala compensada do osso ja
      // aplicada no socket, entao usa offset pequeno).
      if (anchor === this.root) {
        plane.position.set(0, 1.1, 0.7);
        plane.rotation.set(0, 0, 0);
      } else {
        plane.position.set(0, 0, 0);
      }
    } catch (_) {
      try { mat?.dispose(); } catch (_) {}
      try { plane?.dispose(); } catch (_) {}
      return;
    }

    // Animacao manual via RAF: sweep angular (roll) + fade do alpha em ~200ms.
    const DUR = 200;
    const start = performance.now();
    const baseRoll = -0.7; // comeca um pouco "atras"
    const sweep = 1.6;     // varre ~1.6 rad
    const tick = () => {
      if (this._disposed || this._disposing) { try { mat.dispose(); } catch (_) {} try { plane.dispose(); } catch (_) {} return; }
      const e = performance.now() - start;
      const f = Math.min(1, e / DUR);
      try {
        plane.rotation.z = baseRoll + sweep * f;
        const s = 1 + 0.35 * f;
        plane.scaling.set(s, s, s);
        mat.alpha = (1 - f) * (f < 0.25 ? f / 0.25 : 1); // ramp-in rapido, fade-out
      } catch (_) {}
      if (f < 1) requestAnimationFrame(tick);
      else { try { mat.dispose(); } catch (_) {} try { plane.dispose(); } catch (_) {} }
    };
    requestAnimationFrame(tick);
  }

  _pushSnapshot() {
    // FIX bug 2b: o ColyseusClient emite 4 listens distintas por tick do server
    // (x, y, z, ry → ate 4 chamadas quase-simultaneas). Empurrar 4 snapshots por
    // tick polui o buffer (que so guarda N) e colapsa os timestamps, jogando a
    // busca de par a/b pro fallback "sem interpolacao" = stutter/tranco.
    // COALESCE: se a ultima snapshot foi empurrada no MESMO burst (< 6ms), so
    // atualiza ela in-place com o state mais recente em vez de criar outra.
    const now = performance.now();
    const x = this.state.x || 0, y = this.state.y || 0, z = this.state.z || 0, ry = this.state.ry || 0;
    const last = this._snapshots[this._snapshots.length - 1];
    if (last && (now - last.t) < 6) {
      last.x = x; last.y = y; last.z = z; last.ry = ry;
      return;
    }
    this._snapshots.push({ t: now, x, y, z, ry });
    // Buffer maior (16): com ate ~4 deltas/tick agora coalescidos, isto guarda
    // varios ticks reais de margem pra interpolacao sem cair no fallback.
    while (this._snapshots.length > 16) this._snapshots.shift();
  }

  _setNickname(name) {
    if (!name) return;
    this.nickname = name;
    if (this._nameTextEl) this._nameTextEl.textContent = name;
  }
  /** FRENTE H: marca quando esse player tá na minha party. */
  setInMyParty(yes) {
    if (this._inMyParty === !!yes) return;
    this._inMyParty = !!yes;
    if (!this._nameTextEl) return;
    if (yes) {
      this._nameTextEl.style.color = '#9a7eff';
      this._nameTextEl.style.textShadow = '0 0 6px #9a7eff';
      if (!this._partyMark) {
        this._partyMark = document.createElement('span');
        this._partyMark.textContent = '★ ';
        this._partyMark.style.color = '#9a7eff';
        this._nameTextEl.parentElement?.insertBefore(this._partyMark, this._nameTextEl);
      }
    } else {
      this._nameTextEl.style.color = '';
      this._nameTextEl.style.textShadow = '';
      if (this._partyMark) { try { this._partyMark.remove(); } catch (_) {} this._partyMark = null; }
    }
  }

  _setAvatar(url) {
    if (!this._avatarEl || !url) return;
    this._avatarEl.src = url;
    this._avatarEl.style.display = 'block';
  }

  _applyHp(hp, maxHp) {
    this.hp = hp; this.maxHp = maxHp;
    if (!this._hpEl) return;
    const pct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    this._hpEl.style.width = pct + '%';
    if (pct < 30) this._hpEl.style.background = 'linear-gradient(90deg,#dd2222,#ff5555)';
    else if (pct < 60) this._hpEl.style.background = 'linear-gradient(90deg,#dd8822,#ffaa33)';
    else this._hpEl.style.background = 'linear-gradient(90deg,#22dd44,#66ff88)';

    // Piscar vermelho quando morrendo (HP < 30%)
    if (pct < 30 && hp > 0) {
      this._nameBox?.classList.add('rp-dying');
      this._nameBox.style.animation = 'rpDying 0.6s ease-in-out infinite';
    } else {
      this._nameBox?.classList.remove('rp-dying');
      this._nameBox.style.animation = '';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  FEEDBACK DE DANO PvP (chamados em onSchemaChange case 'hp')
  //
  //  _flashHit(): pisca o emissive do avatar/capsule de vermelho por ~120ms e
  //  restaura o emissive correto (vermelho-pvp se aura ligada, senao a cor base).
  //  _spawnDamageNumber(): reusa o DamageNumbers global (window._dmgNumbers) na
  //  posicao do root (acima do peito) — mesmo sistema do dano em mobs.
  // ─────────────────────────────────────────────────────────────────

  /** Pisca o avatar de vermelho por ~120ms ao tomar dano (feedback de hit PvP). */
  _flashHit() {
    if (this._disposing || this._disposed) return;
    // Coleta os materiais a piscar: emissive do GLB (se carregado) ou da capsule.
    const mats = [];
    if (this._avatarRoot && this._avatarRoot.getChildMeshes) {
      for (const m of this._avatarRoot.getChildMeshes()) {
        if (m?.material?.emissiveColor) mats.push(m.material);
      }
    }
    if (this._bodyMat?.emissiveColor) mats.push(this._bodyMat);
    if (!mats.length) return;

    const RED = new BABYLON.Color3(1.0, 0.12, 0.12);
    for (const mat of mats) {
      try {
        if (!mat._rpHitSaved) mat._rpHitSaved = mat.emissiveColor.clone();
        mat.emissiveColor = RED.clone();
      } catch (_) {}
    }
    // Re-arma o timer (hits em sequencia mantem o flash) e restaura no fim.
    if (this._hitFlashTimer) { try { clearTimeout(this._hitFlashTimer); } catch (_) {} }
    this._hitFlashTimer = setTimeout(() => {
      this._hitFlashTimer = null;
      if (this._disposed || this._disposing) return;
      for (const mat of mats) {
        try {
          if (mat._rpHitSaved) { mat.emissiveColor = mat._rpHitSaved; mat._rpHitSaved = null; }
        } catch (_) {}
      }
      // Garante que a capsule volte pro emissive PvP/base correto.
      if (this._bodyMat) {
        try {
          if (this._auraOn) this._bodyMat.emissiveColor = new BABYLON.Color3(0.50, 0.05, 0.05);
          else this._bodyMat.emissiveColor = new BABYLON.Color3(this._rgb.r * 0.35, this._rgb.g * 0.35, this._rgb.b * 0.35);
          this._bodyMat._rpHitSaved = null;
        } catch (_) {}
      }
    }, 120);
  }

  /** Numero de dano flutuante sobre o avatar remoto (reusa o DamageNumbers global). */
  _spawnDamageNumber(dmg) {
    if (this._disposing || this._disposed) return;
    if (!(dmg > 0)) return;
    const dn = (typeof window !== 'undefined') ? window._dmgNumbers : null;
    if (!dn?.spawn) return;
    const pos = new BABYLON.Vector3(this._current.x, this._current.y + 1.4, this._current.z);
    try { dn.spawn(pos, dmg, { color: '#ff6666' }); } catch (_) {}
  }

  _applyPvp(on) {
    if (this._auraOn === on) return;
    this._auraOn = on;
    if (this._pvpEl) this._pvpEl.style.display = on ? 'inline' : 'none';
    if (this._nameBox) {
      if (on) {
        this._nameBox.style.borderColor = '#ff4040';
        this._nameBox.style.boxShadow = '0 0 8px rgba(255,64,64,0.6)';
      } else {
        this._nameBox.style.borderColor = this._rgb.rgb255;
        this._nameBox.style.boxShadow = '';
      }
    }
    if (this.aura) {
      if (on) this.aura.start(); else this.aura.stop();
    }
    // Emissive da cápsula fica vermelho quando PVP on
    if (this._bodyMat) {
      if (on) this._bodyMat.emissiveColor = new BABYLON.Color3(0.50, 0.05, 0.05);
      else this._bodyMat.emissiveColor = new BABYLON.Color3(this._rgb.r * 0.35, this._rgb.g * 0.35, this._rgb.b * 0.35);
    }
  }

  _applyDead(dead) {
    if (dead) { this._applyDeadRagdoll(); return; }
    // ── RESPAWN (dead → false) ──
    // Reset: volta avatar/capsule pro estado em pe.
    const target = this._avatarRoot || this.body;
    try { target.rotation.x = 0; } catch (_) {}
    try { this.body.rotation.x = 0; this.body.position.y = 0.9; } catch (_) {}
    // FIX bug 3b: sem isto o avatar ressuscitado fica CONGELADO na ultima pose
    // de morte ate o proximo delta de anim_state chegar. Reinicia a locomocao
    // agora (idle REAL ou o anim_state atual do schema).
    this._attackingUntil = 0;
    if (this._attackTimer) { try { clearTimeout(this._attackTimer); } catch (_) {} this._attackTimer = null; }
    this._curAnim = null;   // forca _playAnimState a reiniciar o clipe (nao e mais o de morte)
    // Sistema real pronto → retoma locomoção real; senão fallback Meshy.
    if (this._realAnimsReady) {
      try { this._playLocoReal(this.state?.anim_state || 'idle'); } catch (_) {}
    } else if (this._avatarAnims?.length) {
      try { this._playAnimState(this.state?.anim_state || 'idle'); } catch (_) {}
    }
  }

  _applyDeadRagdoll() {
    // FIX bug 3a: cancela qualquer overlay de ataque pendente. Sem isto, um
    // _attackTimer agendado em playAttackOnce dispara ~ms depois e arranca o
    // cadaver da pose de morte de volta pra locomocao.
    this._attackingUntil = 0;
    if (this._attackTimer) { try { clearTimeout(this._attackTimer); } catch (_) {} this._attackTimer = null; }
    try {
      // Sistema real pronto → toca o clipe de morte REAL (dead.glb), one-shot.
      if (this._realAnimsReady && this._animCtrl) {
        if (this._animLib?.has('dead')) {
          this._animCtrl.play('dead', { loop: false, fade: 0.05 });
        } else if (this._animLib?.has('knockdown')) {
          this._animCtrl.play('knockdown', { loop: false, fade: 0.05 });
        } else if (this._avatarRoot) {
          this._avatarRoot.rotation.x = Math.PI / 2;
        }
      } else if (this._avatarRoot) {
        this._avatarAnims?.forEach(a => { try { a.stop(); } catch(_){} });
        // FIX: o GLB Meshy não tem clipe 'dead'/'death'/'fall'. Usa o mapa
        // calibrado (death -> Parkour_Vault_with_Roll, mesmo do roll/morte).
        const dead = _resolveRemoteAnim('death', this._avatarAnims || []);
        if (dead) {
          this._curAnim = dead;
          try { dead.start(false, 1.0); } catch(_){}
        } else { this._avatarRoot.rotation.x = Math.PI / 2; }
      } else {
        // Sem GLB carregado: tomba a capsule fallback.
        try { this.body.rotation.x = -Math.PI / 2; this.body.position.y = 0.4; } catch (_) {}
      }
    } catch (_) {}
  }

  _buildAura() {
    // ParticleSystem 3D em volta da cápsula — esfumaçada vermelha
    const ps = new BABYLON.ParticleSystem(`aura_${this.playerId}`, 80, this.scene);
    if (!RemotePlayer._auraTex) {
      const tex = new BABYLON.DynamicTexture('auraTex', { width: 32, height: 32 }, this.scene, false);
      const ctx = tex.getContext();
      const grd = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,80,40,0.95)');
      grd.addColorStop(0.5, 'rgba(220,30,20,0.55)');
      grd.addColorStop(1, 'rgba(80,0,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 32, 32);
      tex.update(); tex.hasAlpha = true;
      RemotePlayer._auraTex = tex;
    }
    ps.particleTexture = RemotePlayer._auraTex;
    ps.emitter = this.root;
    ps.minEmitBox = new BABYLON.Vector3(-0.45, 0.0, -0.45);
    ps.maxEmitBox = new BABYLON.Vector3( 0.45, 1.7,  0.45);
    ps.color1 = new BABYLON.Color4(1.0, 0.30, 0.10, 0.85);
    ps.color2 = new BABYLON.Color4(0.75, 0.05, 0.05, 0.95);
    ps.colorDead = new BABYLON.Color4(0.2, 0.0, 0.0, 0);
    ps.minSize = 0.18; ps.maxSize = 0.40;
    ps.minLifeTime = 0.45; ps.maxLifeTime = 0.85;
    ps.emitRate = 60;
    ps.gravity = new BABYLON.Vector3(0, 1.6, 0); // sobe (efervescente)
    ps.direction1 = new BABYLON.Vector3(-0.4, 0.6, -0.4);
    ps.direction2 = new BABYLON.Vector3( 0.4, 1.2,  0.4);
    ps.minAngularSpeed = -Math.PI; ps.maxAngularSpeed = Math.PI;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this.aura = ps;
  }

  update(dt, camera) {
    // Tick do crossfade do sistema de animação REAL (peso prev->cur). Sem isto
    // as transições entre idle/walk/run/ataque ficam em "pose-snap".
    if (this._realAnimsReady && this._animCtrl) {
      try { this._animCtrl.update(dt); } catch (_) {}
    }
    // Buffer interpolation (anti-borrachudo)
    const renderT = performance.now() - this.RENDER_LAG_MS;
    let target = null;
    if (this._snapshots.length >= 2) {
      let a = null, b = null;
      for (let i = this._snapshots.length - 1; i >= 0; i--) {
        if (this._snapshots[i].t <= renderT) {
          a = this._snapshots[i]; b = this._snapshots[i + 1] || a; break;
        }
      }
      if (a && b && b.t > a.t) {
        const f = Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
        let dy = b.ry - a.ry;
        while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        target = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, ry: a.ry + dy * f };
      } else { target = this._snapshots[this._snapshots.length - 1]; }
    } else if (this._snapshots.length === 1) {
      target = this._snapshots[0];
    }
    if (target) {
      // FIX bug 2c: deteccao de TELEPORTE (respawn / correcao grande do server).
      // Sem isto, o segundo suavizador (k) desliza _current pelo mapa inteiro —
      // o avatar atravessa parede deslizando ate alcancar o ponto novo. Se o alvo
      // saltou > TELEPORT_DIST do _current, SNAP direto (sem interpolar).
      const ddx = target.x - this._current.x;
      const ddy = target.y - this._current.y;
      const ddz = target.z - this._current.z;
      const dist2 = ddx * ddx + ddy * ddy + ddz * ddz;
      const TELEPORT_DIST = 5; // metros
      if (dist2 > TELEPORT_DIST * TELEPORT_DIST) {
        this._current.x = target.x;
        this._current.y = target.y;
        this._current.z = target.z;
        this._current.ry = target.ry;
      } else {
        const k = Math.min(1, dt * 18);
        this._current.x += ddx * k;
        this._current.y += ddy * k;
        this._current.z += ddz * k;
        let dy = target.ry - this._current.ry;
        while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
        this._current.ry += dy * k;
      }
    }
    this.root.position.set(this._current.x, this._current.y, this._current.z);
    // FIX orientacao: player.glb (Meshy) exporta de COSTAS (rosto para -Z).
    // O player LOCAL compensa com FACING_OFFSET = Math.PI (PlayerAnimator.js:82,391).
    // Aqui o ry vem cru do server, entao replicamos o MESMO +Math.PI; sem isso
    // o avatar remoto fica 180 graus invertido (de costas quando esta de frente).
    this.root.rotation.y = BABYLON.Tools.ToRadians(this._current.ry) + Math.PI;
    this.root.rotationQuaternion = null;   // garante que rotation.y e respeitado

    // Nameplate em screen-space
    // REGRA DO DONO #3: NOME + VIDA somem JUNTO com o cadáver. Quando o player
    // remoto está morto (state.dead), escondemos o nameplate na hora — antes
    // ele ficava boiando no lugar da morte (bug feio). Some no MESMO momento
    // em que o ragdoll/vanish acontece, tudo conectado pra não bugar.
    if (camera && this.state?.dead !== true) {
      const wpos = new BABYLON.Vector3(this._current.x, this._current.y + 2.2, this._current.z);
      const eng = this.scene.getEngine();
      const sc = BABYLON.Vector3.Project(wpos, BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(),
        camera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight()));
      if (sc.z > 0 && sc.z < 1) {
        this._nameEl.style.display = 'flex';
        this._nameEl.style.left = sc.x + 'px';
        this._nameEl.style.top = sc.y + 'px';
      } else this._nameEl.style.display = 'none';
    } else if (this._nameEl) {
      // Morto → nome/vida escondidos junto com o corpo.
      this._nameEl.style.display = 'none';
    }
  }

  /** Dispose imediato (sem animação). Use só em cleanup forçado. */
  disposeNow() {
    if (this._disposed) return;
    this._disposed = true;
    // Cancela timers pendentes (overlay de ataque + flash de hit) pra nao tocarem
    // em materiais/anims ja descartados. As guardas _disposed ja barram o efeito,
    // mas limpar aqui evita o setTimeout solto.
    if (this._attackTimer) { try { clearTimeout(this._attackTimer); } catch (_) {} this._attackTimer = null; }
    if (this._hitFlashTimer) { try { clearTimeout(this._hitFlashTimer); } catch (_) {} this._hitFlashTimer = null; }
    try { this._detachWeapon?.(); } catch (_) {}
    try { this._weaponSocket?.dispose(); } catch (_) {}
    // Sistema de animação real: para e descarta os clipes retargetados.
    try { this._animCtrl?.stopAll?.(); } catch (_) {}
    try { this._animLib?.animations?.forEach(ag => { try { ag.dispose(); } catch (_) {} }); } catch (_) {}
    this._animLib = null; this._animCtrl = null;
    try { this.body?.dispose(); } catch (_) {}
    try { this.eye?.dispose(); } catch (_) {}
    try { this.aura?.dispose(); } catch (_) {}
    try { this._pedestal?.dispose(); } catch (_) {}
    try { this.root?.dispose(); } catch (_) {}
    if (this._nameEl?.parentElement) {
      try { this._nameEl.parentElement.removeChild(this._nameEl); } catch (_) {}
    }
  }

  /** Dispose com animação fade-glow (player saiu / desconectou / morreu).
   *  Avatar brilha cyan/laranja por ~0.8s, encolhe e some. Garante zero stub. */
  dispose() {
    if (this._disposing || this._disposed) return;
    this._disposing = true;
    // Esconde nameplate imediato pra nao ficar HTML stub flutuando
    if (this._nameEl) {
      this._nameEl.style.transition = 'opacity 0.3s';
      this._nameEl.style.opacity = '0';
    }
    // Brilho emissivo forte
    try {
      if (this._bodyMat) {
        this._bodyMat.emissiveColor = new BABYLON.Color3(0.3, 1.0, 0.7);
      }
    } catch (_) {}
    // Particulas de "vanish" (caso BABYLON disponivel)
    try {
      if (typeof BABYLON !== 'undefined' && this.root?.position) {
        const ps = new BABYLON.ParticleSystem('vanish', 80, this.scene);
        const dt = new BABYLON.DynamicTexture('vanishTex', 16, this.scene, false);
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(8,8,2,8,8,8);
        g.addColorStop(0, 'rgba(180,255,220,1)');
        g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,16,16); dt.update();
        ps.particleTexture = dt;
        const emitter = new BABYLON.TransformNode('vanishEmit', this.scene);
        emitter.position.copyFrom(this.root.position);
        emitter.position.y += 1.0;
        ps.emitter = emitter;
        ps.minEmitBox = new BABYLON.Vector3(-0.4, 0, -0.4);
        ps.maxEmitBox = new BABYLON.Vector3(0.4, 0.5, 0.4);
        ps.color1 = new BABYLON.Color4(0.6, 1.0, 0.85, 1);
        ps.color2 = new BABYLON.Color4(0.3, 0.8, 1.0, 0.9);
        ps.colorDead = new BABYLON.Color4(0.3, 0.6, 1.0, 0);
        ps.minSize = 0.15; ps.maxSize = 0.4;
        ps.minLifeTime = 0.4; ps.maxLifeTime = 0.9;
        ps.emitRate = 0;
        ps.manualEmitCount = 60;
        ps.gravity = new BABYLON.Vector3(0, 2, 0);
        ps.direction1 = new BABYLON.Vector3(-1.5, 1, -1.5);
        ps.direction2 = new BABYLON.Vector3(1.5, 4, 1.5);
        ps.minEmitPower = 1; ps.maxEmitPower = 3;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        ps.start();
        setTimeout(() => {
          try { ps.stop(); } catch (_) {}
          setTimeout(() => {
            try { ps.dispose(); emitter.dispose(); } catch (_) {}
          }, 1200);
        }, 200);
      }
    } catch (_) {}

    // Anima escala -> 0, alpha -> 0 ao longo de 0.6s, então dispose hard
    const FADE_MS = 600;
    const startT = performance.now();
    const startScale = (this.root?.scaling?.x) || 1;
    const tick = () => {
      if (this._disposed) return;
      const t = performance.now() - startT;
      const k = Math.min(1, t / FADE_MS);
      const s = startScale * (1 - k * 0.85); // encolhe pra 15%
      try {
        if (this.root?.scaling) this.root.scaling.set(s, s, s);
        if (this.root?.position) {
          this.root.position.y += 0.012; // sobe enquanto desaparece
        }
        if (this._bodyMat) {
          this._bodyMat.alpha = 1 - k;
          this._bodyMat.emissiveColor = new BABYLON.Color3(
            0.3 + 0.7 * (1 - k),
            1.0,
            0.7 + 0.3 * k
          );
        }
      } catch (_) {}
      if (k < 1) requestAnimationFrame(tick);
      else this.disposeNow();
    };
    // Garante materiais transparentes pra fade funcionar
    try {
      if (this._bodyMat) {
        this._bodyMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        this._bodyMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
      }
    } catch (_) {}
    requestAnimationFrame(tick);
    // Safety: hard dispose em 1.2s mesmo se algo trave
    setTimeout(() => { if (!this._disposed) this.disposeNow(); }, FADE_MS + 600);
  }

  /**
   * Troca o modelo do avatar quando o class_id muda (skin ao vivo). Descarta
   * o GLB atual + suas animações + a arma anexada e recarrega pelo novo modelo.
   */
  _swapClassModel() {
    const newId = this.state?.class_id | 0;
    // Decide a URL alvo (mesma lógica do _tryLoadAvatar): avatar_url tem
    //  prioridade sobre class_id. Só recarrega se a URL realmente mudou.
    const avUrl = (this.state?.avatar_url || '').trim();
    const targetUrl = (avUrl && /\.glb($|\?)/i.test(avUrl)) ? avUrl : _classModel(newId).url;
    if (targetUrl === this._loadedAvatarUrl) return;        // já é esse modelo
    if (this._swappingClass) return;                        // evita reentrada
    this._swappingClass = true;
    try {
      // descarta arma anexada (clone TPS) — o socket vive num osso do avatar
      // antigo, então zera a ref pra ser recriada no novo rig.
      try { this._detachWeapon?.(); } catch (_) {}
      try { this._weaponSocket?.dispose(); } catch (_) {}
      this._weaponSocket = null;
      this._weaponId = null;
      // descarta as animationGroups do avatar antigo
      for (const a of (this._avatarAnims || [])) { try { a.dispose(); } catch (_) {} }
      this._avatarAnims = [];
      // descarta o sistema de animação REAL (clipes retargetados no rig antigo)
      try { this._animCtrl?.stopAll?.(); } catch (_) {}
      try { this._animLib?.animations?.forEach(ag => { try { ag.dispose(); } catch (_) {} }); } catch (_) {}
      this._animLib = null;
      this._animCtrl = null;
      this._realAnimsReady = false;
      this._curAnim = null;
      // descarta a árvore do GLB antigo
      try { this._avatarRoot?.dispose(false, true); } catch (_) {}
      this._avatarRoot = null;
      this._glbLoadAttempts = 0;                            // libera as tentativas de novo
    } catch (_) {}
    this._swappingClass = false;
    // recarrega já com o novo class_id
    this._tryLoadAvatar().catch((e) => console.warn('[RemotePlayer] reload avatar fail', e?.message));
  }

  async _tryLoadAvatar() {
    // SKIN: prioriza avatar_url (os 6 personagens novos — orc/mago/cleric/etc
    //  trafegam o caminho do GLB no schema). Cai pro class_id (rato/azurefin)
    //  só se não vier avatar_url. Antes ignorava avatar_url e TODOS os remotos
    //  apareciam como rato — por isso ninguém via a skin escolhida.
    const avUrl = (this.state?.avatar_url || '').trim();
    const model = _classModel(this.state?.class_id);
    const url = (avUrl && /\.glb($|\?)/i.test(avUrl)) ? avUrl : model.url;
    this._loadedAvatarUrl = url;
    this._loadedClassId = this.state?.class_id | 0;
    const shortId = (this.playerId || "").slice(0, 8);
    this._glbLoadAttempts = (this._glbLoadAttempts || 0) + 1;
    console.log("[RemotePlayer]", shortId, "loading avatar from", url, "(attempt", this._glbLoadAttempts, "/", this._glbMaxAttempts, ")");

    // Timeout de 8s pra avisar caso o load esteja travado
    const timeoutId = setTimeout(() => {
      if (!this._avatarRoot) {
        console.warn("[RemotePlayer]", shortId, "avatar load TIMEOUT (>8s) — URL:", url);
      }
    }, 8000);

    try {
      const lastSlash = url.lastIndexOf("/") + 1;
      const rootUrl = url.substring(0, lastSlash);
      const fileName = url.substring(lastSlash);
      const result = await BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, fileName, this.scene);
      clearTimeout(timeoutId);
      if (!result?.meshes?.length) {
        console.warn("[RemotePlayer]", shortId, "avatar load returned ZERO meshes");
        // Tenta de novo se ainda tem tentativas
        if (this._glbLoadAttempts < this._glbMaxAttempts) {
          setTimeout(() => this._tryLoadAvatar().catch(() => {}), 500);
        } else {
          this._applyFallbackColor();
        }
        return;
      }
      const root = result.meshes[0];
      root.name = "remote_avatar_" + this.playerId;
      // FIX AVATAR INVISIVEL: NAO parentar na capsule (this.body).
      // setEnabled(false) na capsule propaga isEnabled()=false pra TODA a arvore
      // de descendentes (incl. este GLB), deixando o avatar 100% invisivel.
      // Parenteia DIRETO no this.root (TransformNode que recebe a posicao do mundo
      // via update/_pushSnapshot). Assim a capsule pode ser escondida sem tocar no avatar.
      root.parent = this.root;
      // FIX flutuacao: this.root recebe o y CRU do server, que e o CENTRO da capsule
      // (~0.9 acima do chao, capsule height=1.8 => meia altura 0.9). O GLB tem origem
      // nos PES, entao precisa descer -(height/2) = -0.9 pra encostar no chao — exatamente
      // o foot-offset que o Player LOCAL aplica (PlayerAnimator.js:293 _rootOffsetY=-(h/2)).
      // Sem isso o avatar remoto flutua ~0.9 acima do chao.
      root.position.set(0, -((model.height || 1.8) / 2), 0);
      // Escala do modelo da classe (default = player.glb Meshy, PlayerAnimator.js:291).
      root.scaling.setAll(model.scale || 1.164);
      // FIX PvP fidelidade: a capsule continua HABILITADA e PICAVEL — ela e o
      // hitbox-proxy limpo do player remoto (segue x/y/z incl. pulo via this.root).
      // So fica INVISIVEL (visibility=0). NAO usar setEnabled(false): isso a tiraria
      // do raycast (predicate exige isEnabled()) e o tiro cairia no GLB skinnado,
      // que tem hitbox de bind-pose (errado de longe e pulando).
      // isVisible fica TRUE pra ela continuar sendo "renderizavel"/picavel, mas com
      // visibility=0 nao aparece. O predicate trata _isHitProxy via bypass.
      try { this.body.visibility = 0; } catch (_) {}
      try { this.body.isVisible = true; } catch (_) {}
      try { this.body.isPickable = true; } catch (_) {}
      try { this.body.setEnabled(true); } catch (_) {}
      // Garante que o avatar GLB e a arvore estejam habilitados/visiveis.
      try {
        root.setEnabled(true);
        const desc = root.getDescendants ? root.getDescendants(false) : [];
        for (const n of desc) {
          try { n.setEnabled(true); } catch (_) {}
          if (n.visibility !== undefined) { try { n.isVisible = true; n.visibility = 1; } catch (_) {} }
        }
      } catch (_) {}

      // ── FIX A (PvP hit): tag o avatar GLB inteiro como remote player picavel ──
      // O raycast do WeaponSystem so dispara o branch PvP se pickedMesh._isRemotePlayer
      // && _remoteRef. Esses markers viviam SO na capsule (this.body), que fica
      // disabled/invisible quando o GLB carrega — entao o ray nunca os acha.
      // Propaga os markers + isPickable=true pro root E todo mesh descendente.
      // ── FIX B (invisivel em cima de objeto): alwaysSelectAsActiveMesh evita
      // que o frustum culling do Babylon derrube o avatar quando elevado em
      // geometria construida (bounding info baked na origem nao acompanha o
      // transform do parent). Aplica no root + descendentes.
      try {
        root.metadata = Object.assign({}, root.metadata, { isRemotePlayer: true, remoteRef: this });
        root._isRemotePlayer = true;
        root._remoteRef = this;
        if (root.isPickable !== undefined) root.isPickable = true;
        try { root.alwaysSelectAsActiveMesh = true; } catch (_) {}
        const all = root.getDescendants ? root.getDescendants(false) : [];
        for (const n of all) {
          try {
            n._isRemotePlayer = true;
            n._remoteRef = this;
            // so meshes reais (com geometria) sao picaveis pelo ray
            if (n.getClassName && /Mesh/.test(n.getClassName())) {
              if (n.isPickable !== undefined) n.isPickable = true;
              try { n.alwaysSelectAsActiveMesh = true; } catch (_) {}
              try { n.refreshBoundingInfo(true); } catch (_) {}
            }
          } catch (_) {}
        }
      } catch (_) {}

      this._avatarRoot = root;
      this._avatarAnims = result.animationGroups || [];
      // Para TODAS as anims antes de iniciar a correta (evita varias tocando
      // ao mesmo tempo logo no load).
      for (const a of this._avatarAnims) { try { a.stop(); } catch (_) {} }
      // Debug: lista os nomes reais das AnimationGroups do GLB remoto.
      console.log("[RemotePlayer]", shortId, "avatar carregado OK — meshes:", result.meshes.length,
        "anims:", this._avatarAnims.length, "→", this._avatarAnims.map(a => a.name).join(", "));
      // Inicia já com o anim_state atual do schema (Meshy fallback enquanto o
      // moveset real ainda não retargetou — upgrade automático quando pronto).
      const initialState = this.state?.anim_state || "idle";
      this._playAnimState(initialState);

      // ── Carrega o MOVESET REAL no esqueleto deste avatar (assíncrono) ──
      // Mesmo rig do player local (player.glb) => o retarget por nome de osso
      // bate. Quando os clipes CORE chegam, _realAnimsReady vira true e a
      // locomoção/combate passam a usar os clipes REAIS (idle/walk/run/punch/…).
      try { this._initRealAnims(); } catch (e) { console.warn("[RemotePlayer] real anims init fail", e?.message); }

      // ── FIX: anexa a arma do player remoto na mão do avatar ──
      // Usa weapon/held_item do state pra saber qual arma e clona o mesh TPS
      // do player LOCAL (window._gamePlayer.weapon). Cada remote precisa do
      // próprio clone. O socket no osso RightHand + escala já replica o local.
      try { this._attachWeaponFromState(); } catch (e) { console.warn("[RemotePlayer] weapon attach fail", e?.message); }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error("[RemotePlayer] AVATAR FALHOU", shortId, e?.message);
      // FRENTE 3 EDIT 3b: retry ate 3x, depois aplica cor fallback unica por player
      if (this._glbLoadAttempts < this._glbMaxAttempts) {
        setTimeout(() => this._tryLoadAvatar().catch(() => {}), 800);
      } else {
        try {
          const hash = (this.playerId || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
          const hue = (hash % 360) / 360;
          const rgb = BABYLON.Color3.FromHSV(hue, 0.7, 1.0);
          if (this.body?.material?.diffuseColor) this.body.material.diffuseColor.copyFrom(rgb);
          else if (this.body) {
            const m = new BABYLON.StandardMaterial("remote_fallback_" + this.playerId, this.scene);
            m.diffuseColor = rgb;
            this.body.material = m;
          }
          // Capsule fica MAIS visivel no fallback (era 0.25)
          try { this.body.visibility = 1.0; } catch (_) {}
        } catch (_) {}
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  ARMA NA MÃO DO AVATAR REMOTO
  //
  //  Replica o que o Player local faz (Player.attachCurrentWeaponToAnimator
  //  + PlayerAnimator.attachWeapon/getSocketNode): pega o mesh TPS da arma,
  //  CLONA (cada remote precisa do próprio), acha o osso da mão direita no
  //  avatar remoto, cria um socket, compensa a escala do osso e parenteia.
  // ─────────────────────────────────────────────────────────────────

  /** Resolve o id de arma a partir do state (weapon → held_item). Itens de
   *  build (ex.: 'asset:crate') e 'unarmed' não viram arma. */
  _resolveWeaponId() {
    const s = this.state || {};
    let id = s.weapon || s.held_item || '';
    id = String(id || '').trim();
    // held_item pode ser um construível ('asset:...') — não é arma de mão
    if (!id || id === 'unarmed' || id.includes(':')) return null;
    return id;
  }

  /** Acesso ao WeaponSystem do player local (fonte dos meshes TPS pra clonar). */
  _localWeaponSystem() {
    const p = (typeof window !== 'undefined')
      ? (window._gamePlayer || window._player) : null;
    return p?.weapon || null;
  }

  /** Acha o osso da mão direita no avatar remoto e devolve um TransformNode
   *  socket filho dele (com escala compensada). Replica getSocketNode +
   *  compensação de escala do PlayerAnimator. Devolve null se não achar. */
  _getRemoteHandSocket(boneName = 'RightHand') {
    if (!this._avatarRoot) return null;
    if (this._weaponSocket) return this._weaponSocket;

    const nodes = this._avatarRoot.getDescendants ? this._avatarRoot.getDescendants() : [];
    if (!nodes.length) return null;
    const lowerName = boneName.toLowerCase();

    // 1) match direto pelo nome (RightHand / mixamorig:RightHand / hand_r ...)
    let boneNode = nodes.find(n => {
      const nLower = (n.name || '').toLowerCase();
      return nLower.includes(lowerName) ||
             (lowerName.includes('right') && nLower.includes('_r') && nLower.includes(lowerName.replace('right', '')));
    });

    // 2) fallback: sem o sufixo hand
    if (!boneNode) {
      boneNode = nodes.find(n => (n.name || '').toLowerCase().includes(lowerName.replace('hand', '')));
    }

    // 3) mega-fallback p/ rigs malucos: wrist/paw/finger do lado direito
    if (!boneNode) {
      boneNode = nodes.find(n => {
        const nl = (n.name || '').toLowerCase();
        return (nl.includes('wrist') || nl.includes('paw') || nl.includes('finger')) && nl.includes('r');
      });
    }

    // 4) último recurso: anexa direto no root do avatar com offset aproximado
    //    de mão (pra arma pelo menos APARECER, mesmo sem osso resolvível).
    let parentNode = boneNode;
    let approx = false;
    if (!parentNode) {
      parentNode = this._avatarRoot;
      approx = true;
      console.warn('[RemotePlayer] osso da mão não encontrado — usando offset aproximado');
    }

    const socket = new BABYLON.TransformNode(`remote_wsock_${this.playerId}`, this.scene);
    socket.parent = parentNode;

    if (!approx) {
      // Compensa a escala absoluta do osso (esqueleto do rato tem escala ~0.01)
      try {
        parentNode.computeWorldMatrix(true);
        const bs = parentNode.absoluteScaling || BABYLON.Vector3.One();
        socket.scaling.copyFromFloats(
          bs.x ? 1 / bs.x : 1,
          bs.y ? 1 / bs.y : 1,
          bs.z ? 1 / bs.z : 1
        );
      } catch (_) {}
    } else {
      // Offset aproximado de mão direita (relativo ao avatar já escalado 1.164)
      socket.position.set(0.25, 1.1, 0.15);
    }

    this._weaponSocket = socket;
    return socket;
  }

  /** Anexa/troca a arma na mão conforme o state atual. */
  _attachWeaponFromState() {
    if (!this._avatarRoot) return;   // só depois do GLB carregar
    const id = this._resolveWeaponId();

    // Sem arma (unarmed / item de build): remove a que estiver anexada.
    if (!id) { this._detachWeapon(); return; }
    // Mesma arma já anexada: nada a fazer.
    if (id === this._weaponId && this._weaponMesh) return;

    const ws = this._localWeaponSystem();
    if (!ws?.getTPSWeaponMesh) return;          // sistema local ainda não pronto
    const srcMesh = ws.getTPSWeaponMesh(id);
    if (!srcMesh) {
      // arma desconhecida (ex.: skin ainda não carregada) — limpa a antiga
      this._detachWeapon();
      this._weaponId = null;
      return;
    }

    const socket = this._getRemoteHandSocket('RightHand');
    if (!socket) return;

    // Cada RemotePlayer precisa do PRÓPRIO clone (não pode reusar o tps do local).
    let clone = null;
    try {
      clone = srcMesh.clone(`rweap_${this.playerId}_${id}`, null, false);
    } catch (_) { clone = null; }
    if (!clone) return;

    // Substitui a arma antiga.
    this._detachWeapon();

    clone.parent = socket;
    // Garante visível + não-picável (não deve atrapalhar raycast PvP).
    try {
      clone.setEnabled(true);
      if (clone.isPickable !== undefined) clone.isPickable = false;
      const kids = clone.getChildMeshes ? clone.getChildMeshes() : [];
      for (const m of kids) {
        try { m.setEnabled(true); m.isVisible = true; m.isPickable = false; } catch (_) {}
      }
    } catch (_) {}

    // Aplica offset/rotação/escala TPS da arma (igual o local via applyToMesh(_, true)).
    try {
      const ws2 = this._localWeaponSystem();
      const weaponRef = ws2?.weapons?.find?.(w => w.id === id);
      weaponRef?.applyToMesh?.(clone, true);
    } catch (_) {}

    this._weaponMesh = clone;
    this._weaponId   = id;
  }

  /**
   * Posição MUNDIAL do cano da arma remota (muzzle). Usa o muzzleOffset real da
   * arma (mesma fonte do player local) transformado pela matriz mundial do mesh
   * anexado na mão. Assim o tracer/flash sai do CANO — antes era uma altura fixa
   * (m.y+1.4 ≈ acima da cabeça, porque o y do server é o centro da cápsula).
   * @returns {BABYLON.Vector3|null}
   */
  getMuzzleWorldPos() {
    const mesh = this._weaponMesh;
    if (mesh) {
      try {
        const ws = this._localWeaponSystem();
        const wref = ws?.weapons?.find?.(w => w.id === this._weaponId);
        mesh.computeWorldMatrix(true);
        if (wref?.muzzleOffset) {
          return BABYLON.Vector3.TransformCoordinates(wref.muzzleOffset, mesh.getWorldMatrix());
        }
        return mesh.getAbsolutePosition().clone();
      } catch (_) {}
    }
    // Fallback: peito do avatar (NUNCA acima da cabeça). O socket da mão é a
    // segunda melhor âncora se existir.
    try {
      if (this._weaponSocket) return this._weaponSocket.getAbsolutePosition().clone();
    } catch (_) {}
    const pos = this.root?.getAbsolutePosition?.();
    if (pos) return new BABYLON.Vector3(pos.x, pos.y + 0.5, pos.z);
    return null;
  }

  /** Remove e descarta a arma atualmente anexada. */
  _detachWeapon() {
    if (this._weaponMesh) {
      try {
        const kids = this._weaponMesh.getChildMeshes ? this._weaponMesh.getChildMeshes() : [];
        for (const m of kids) { try { m.dispose(); } catch (_) {} }
        this._weaponMesh.dispose();
      } catch (_) {}
      this._weaponMesh = null;
    }
  }

  /** Aplica cor fallback unica por playerId quando GLB falha em todas as tentativas. */
  _applyFallbackColor() {
    try {
      const hash = (this.playerId || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const hue = (hash % 360) / 360;
      const rgb = BABYLON.Color3.FromHSV(hue, 0.7, 1.0);
      if (this.body?.material?.diffuseColor) this.body.material.diffuseColor.copyFrom(rgb);
      else if (this.body) {
        const m = new BABYLON.StandardMaterial("remote_fallback_" + this.playerId, this.scene);
        m.diffuseColor = rgb;
        this.body.material = m;
      }
      try { this.body.visibility = 1.0; } catch (_) {}
    } catch (_) {}
  }
}

// Animação CSS de piscar vermelho (injeta uma vez global)
if (typeof document !== 'undefined' && !document.getElementById('rp-style')) {
  const s = document.createElement('style');
  s.id = 'rp-style';
  s.textContent = `
    @keyframes rpDying {
      0%,100% { box-shadow: 0 0 4px rgba(255,40,40,0.4); border-color: #ff5050; }
      50%     { box-shadow: 0 0 18px rgba(255,40,40,1); border-color: #ff8080; }
    }
  `;
  document.head.appendChild(s);
}
