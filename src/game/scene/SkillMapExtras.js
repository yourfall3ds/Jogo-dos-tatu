// ─────────────────────────────────────────────────────────────────
//  SkillMapExtras — adiciona elementos de "skill map" ao Level:
//    • Pilares de wall-jump (treinar saltos entre paredes)
//    • Rampas longas (treinar dash + acelerar)
//    • Trajetos de paredes paralelas (corredores de parkour)
//    • Plataformas suspensas (treinar dash aéreo entre)
//    • Arcos/anéis (objetivos de dash de precisão)
//
//  Tudo box estático com colisão Havok. Cores de marcador pra saber
//  "aqui é trecho de skill".
// ─────────────────────────────────────────────────────────────────
import { DEBUG } from '../../utils/debug.js';

export class SkillMapExtras {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.created = [];
  }

  build() {
    this._buildMaterials();
    // ARENA DE SKILL/ESCALADA (a pedido do dono): muito mais estrutura pra
    //  subir, escalar, fazer parkour vertical. A mecânica de locomoção É o jogo.
    this._buildWallJumpCorridor();  // corredor de paredes em zigzag (escalada média)
    this._buildSpeedAlley();        // torres paralelas H=28 (escalada alta)
    this._buildSuspendedPlatforms();// plataformas suspensas (dash aéreo)
    this._buildDashRing();          // arco de dash de precisão
    this._buildClimbTower();        // TORRE CENTRAL de vários andares (escalar até o topo)
    this._buildSpiralAscent();      // plataformas em ESPIRAL subindo (rota alternativa)
    this._buildWallKickShaft();     // poço estreito de wall-kick vertical
    DEBUG.log(`[SkillMap] ${this.created.length} elementos de skill/escalada criados`);
  }

  _buildMaterials() {
    const m = (name, r, g, b, emi = 0.4) => {
      const mat = new BABYLON.StandardMaterial(name, this.scene);
      mat.diffuseColor = new BABYLON.Color3(r, g, b);
      mat.emissiveColor = new BABYLON.Color3(r * emi, g * emi, b * emi);
      mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
      return mat;
    };
    this.mats = {
      skill1: m('skMat1', 0.45, 0.95, 1.0, 0.5),   // cyan — wall jump
      skill2: m('skMat2', 1.0, 0.85, 0.30, 0.5),   // yellow — dash
      skill3: m('skMat3', 1.0, 0.40, 0.50, 0.4),   // pink — combo
      wall:   m('skMatWall', 0.30, 0.32, 0.38, 0.15),
      accent: m('skAccent', 0.18, 0.78, 0.40, 0.6),
    };
  }

  _box(name, w, h, d, x, y, z, mat, ry = 0) {
    const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    b.position.set(x, y, z);
    b.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, ry);
    b.material = mat;
    b.checkCollisions = true;
    b.receiveShadows = true;
    if (this.level?.shadowGen) this.level.shadowGen.addShadowCaster(b);
    if (this.scene.getPhysicsEngine?.()) {
      try { new BABYLON.PhysicsAggregate(b, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.7, restitution: 0.05 }, this.scene); }
      catch (_) {}
    }
    b._isWall = true; // marcador pra wall-kick com espada
    this.created.push(b);
    return b;
  }

  // ── Corredor de wall-jump zigzag — par de paredes paralelas escalonadas ──
  _buildWallJumpCorridor() {
    // posicionado no leste do mapa
    const baseX = -42, baseZ = 0;
    // 4 pares de paredes em zigzag
    for (let i = 0; i < 4; i++) {
      const offset = (i % 2 === 0 ? -1 : 1) * 2.0;
      this._box(`wj_zigL_${i}`, 1.0, 8 + i * 1.5, 4, baseX + offset - 2.5, 4 + i * 0.7, baseZ + i * 5, this.mats.skill1);
      this._box(`wj_zigR_${i}`, 1.0, 8 + i * 1.5, 4, baseX + offset + 2.5, 4 + i * 0.7, baseZ + i * 5, this.mats.skill1);
    }
    // (pad de entrada 'wj_zigEntry' removido — so as paredes de escalada)
  }

  // ── Anel de dash (passagem fina + paredes acima/abaixo) ──
  // Treina dash-throw preciso. Estilo Skill Map The Duel
  _buildDashRing() {
    const x = 0, z = -55;
    // Plataforma de salto
    this._box('dash_launch', 6, 0.4, 6, x, 1.5, z - 4, this.mats.skill2);

    // Duas paredes formando "arco" de passagem (player precisa dashar no espaço)
    this._box('dash_archL', 1.0, 6, 2, x - 3, 5, z + 4, this.mats.skill2);
    this._box('dash_archR', 1.0, 6, 2, x + 3, 5, z + 4, this.mats.skill2);
    this._box('dash_archTop', 7, 0.6, 2, x, 8.7, z + 4, this.mats.skill2);

    // Plataforma de aterrissagem distante
    this._box('dash_land', 6, 0.4, 6, x, 1.5, z + 14, this.mats.accent);
  }

  // ── Plataformas suspensas pra treinar dash aéreo (gap progressivo) ──
  _buildSuspendedPlatforms() {
    const startX = 30, startZ = -30;
    let y = 3;
    // 5 plataformas em altura crescente, gap aumentando
    for (let i = 0; i < 5; i++) {
      const gap = 4 + i * 1.2;          // distância progressiva
      const cx = startX + i * gap;
      const cy = y + i * 1.5;
      this._box(`sus_${i}`, 3, 0.4, 3, cx, cy, startZ, this.mats.skill3);
    }
    // marcador de chegada
    const flag = BABYLON.MeshBuilder.CreateBox('sus_flag', { size: 0.8 }, this.scene);
    flag.position.set(startX + 4 + 4*5.2, y + 5*1.5 + 1, startZ);
    flag.material = this.mats.accent;
    this.created.push(flag);
  }

  // ── 2 rampas longas pra dash + descer correndo ──
  _buildRamps() {
    // Rampa noroeste subindo
    const r1 = BABYLON.MeshBuilder.CreateBox('ramp_1', { width: 20, height: 0.4, depth: 6 }, this.scene);
    r1.position.set(-25, 3.2, -8);
    r1.rotation.z = -0.35;   // inclinada
    r1.material = this.mats.skill2;
    r1.checkCollisions = true;
    if (this.scene.getPhysicsEngine?.()) {
      try { new BABYLON.PhysicsAggregate(r1, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, this.scene); }
      catch (_) {}
    }
    this.created.push(r1);

    // Rampa sudoeste descendo
    const r2 = BABYLON.MeshBuilder.CreateBox('ramp_2', { width: 18, height: 0.4, depth: 6 }, this.scene);
    r2.position.set(20, 4.0, 25);
    r2.rotation.z = 0.32;
    r2.material = this.mats.skill2;
    r2.checkCollisions = true;
    if (this.scene.getPhysicsEngine?.()) {
      try { new BABYLON.PhysicsAggregate(r2, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, this.scene); }
      catch (_) {}
    }
    this.created.push(r2);
  }

  // ── Trecho de paredes paralelas SUPER altas e estreitas ──
  //  Pra wall-jump alternado + wall-kick com espada subindo verticalmente.
  _buildSpeedAlley() {
    const cx = 40, cz = -8;
    const H = 28, GAP = 4.0, W = 1.0;
    this._box('spdAlley_L', W, H, 8, cx - GAP/2, H/2, cz, this.mats.skill1);
    this._box('spdAlley_R', W, H, 8, cx + GAP/2, H/2, cz, this.mats.skill1);
    this._box('spdAlley_back', GAP + W*2, H, W, cx, H/2, cz + 4.5, this.mats.wall);
    // (pad 'spdAlley_floor' e bandeira 'spdAlley_flag' removidos — so as torres)
  }

  // ── TORRE CENTRAL: andares empilhados pra escalar até o topo ──────
  //  Cada andar é uma plataforma com paredes laterais (wall-jump entre elas
  //  pra subir pro próximo). Gaps verticais que exigem dash/wall-jump.
  _buildClimbTower() {
    const cx = 0, cz = 30;          // perto do centro, atrás do spawn
    const FLOORS = 6;               // 6 andares
    const FH = 6;                   // altura entre andares (gap de escalada)
    const PLAT = 8;                 // tamanho da plataforma
    for (let f = 0; f < FLOORS; f++) {
      const y = 2 + f * FH;
      // plataforma do andar (alterna lado pra forçar wall-jump diagonal)
      const side = (f % 2 === 0) ? -1 : 1;
      this._box(`tower_floor_${f}`, PLAT, 0.5, PLAT, cx + side * 3, y, cz, this.mats.skill2);
      // paredes laterais pra wall-jump subir pro próximo andar
      this._box(`tower_wallA_${f}`, 0.8, FH, PLAT, cx - PLAT / 2, y + FH / 2, cz, this.mats.skill1);
      this._box(`tower_wallB_${f}`, 0.8, FH, PLAT, cx + PLAT / 2, y + FH / 2, cz, this.mats.skill1);
    }
    // plataforma do TOPO (recompensa: vista alta da arena)
    this._box('tower_top', PLAT + 2, 0.6, PLAT + 2, cx, 2 + FLOORS * FH, cz, this.mats.accent);
  }

  // ── ESPIRAL ASCENDENTE: plataformas girando em volta de um eixo, subindo ──
  //  Rota alternativa de escalada — pula de plataforma em plataforma circulando.
  _buildSpiralAscent() {
    const cx = -35, cz = 35;        // canto do mapa
    const STEPS = 14;               // 14 degraus
    const R = 7;                    // raio da espiral
    const RISE = 2.4;               // sobe por degrau
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 4;   // 2 voltas completas
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R;
      const y = 2 + i * RISE;
      this._box(`spiral_${i}`, 3.2, 0.4, 3.2, x, y, z, i % 2 ? this.mats.skill3 : this.mats.skill1, a);
    }
    // pilar central (referência visual + wall-jump de emergência)
    this._box('spiral_core', 1.5, STEPS * RISE + 4, 1.5, cx, 2 + (STEPS * RISE) / 2, cz, this.mats.wall);
  }

  // ── POÇO DE WALL-KICK: 4 paredes formando um poço estreito, subir pulando ──
  //  Wall-jump alternando entre as 4 faces — o desafio vertical mais técnico.
  _buildWallKickShaft() {
    const cx = 35, cz = 35;
    const H = 34, GAP = 3.2, W = 1.0;
    // 4 paredes formando um quadrado oco (poço)
    this._box('shaft_N', GAP + W * 2, H, W, cx, H / 2, cz - GAP / 2, this.mats.skill1);
    this._box('shaft_S', GAP + W * 2, H, W, cx, H / 2, cz + GAP / 2, this.mats.skill1);
    this._box('shaft_E', W, H, GAP + W * 2, cx + GAP / 2, H / 2, cz, this.mats.skill2);
    this._box('shaft_W', W, H, GAP + W * 2, cx - GAP / 2, H / 2, cz, this.mats.skill2);
    // plataforma no topo do poço
    this._box('shaft_top', GAP + W * 3, 0.6, GAP + W * 3, cx, H + 0.5, cz, this.mats.accent);
  }
}
