// ─────────────────────────────────────────────────────────────────
//  DayNightCycle — ciclo de dia/noite HD (sol, lua, fases, sombras)
//
//  • Céu procedural (SkyMaterial) que reage à posição do sol → cores
//    realistas de amanhecer/dia/pôr-do-sol/noite.
//  • SOL (DirectionalLight) gira pelo céu; LUA assume à noite (luz azulada).
//  • Sombras seguem o astro ativo (sol de dia, lua de noite).
//  • Névoa e luz ambiente acompanham a fase.
//  • Fases: madrugada · manhã · tarde · noite (pelo ângulo do sol).
//
//  Tempo: 0..1 = um dia completo. 0.25 = meio-dia, 0.75 = meia-noite.
//  Use setTime(t) pra fixar, ou deixe correr (dayLengthSec).
// ─────────────────────────────────────────────────────────────────

export class DayNightCycle {
  constructor(scene, sun, ambient, shadowGen) {
    this.scene = scene;
    this.sun = sun;            // DirectionalLight existente
    this.ambient = ambient;    // HemisphericLight existente
    this.shadowGen = shadowGen;

    this.t = 0.30;             // começa de manhã
    this.dayLengthSec = 240;   // 4 min por ciclo completo (ajustável)
    this.paused = false;

    // ── Controle MANUAL do sol (painel F8) ──────────────────────────
    //  Quando manual=true, o ciclo PARA de sobrescrever sol/sombra/ambiente
    //  e usa estes valores — assim os ajustes do painel não são desfeitos.
    this.manual = false;
    this.sunElevDeg = 42;      // altura do sol (0=horizonte, 90=vertical)
    this.sunAzimDeg = 35;      // direção (giro do sol no horizonte)
    this.sunIntensity = 1.0;   // intensidade da luz do sol
    this.ambientInt = 0.32;    // luz ambiente (céu) — BAIXA = sombra nítida
    this.shadowDark = 0.18;    // 0=sombra preta, 1=sem sombra
    // limites do ciclo AUTO pra sombra nunca sumir (sol nunca 100% vertical)
    this.maxAutoElev = 0.80;   // teto da altura do sol no auto (~58°)

    // ── Céu procedural HD ────────────────────────────────────────────
    this._buildSky();

    // ── Lua (2ª luz direcional, fria) ────────────────────────────────
    this.moon = new BABYLON.DirectionalLight('moon',
      new BABYLON.Vector3(0.5, -1, 0.5).normalize(), scene);
    this.moon.intensity = 0;
    this.moon.diffuse = new BABYLON.Color3(0.6, 0.7, 1.0);
    this.moon.specular = new BABYLON.Color3(0.3, 0.4, 0.6);
    // Começa DESLIGADA: o jogo inicia de dia (t=0.30). Só o sol gera sombra
    //  ao boot → 1 par de varyings de sombra no PBR (evita overflow WebGPU >16).
    //  _apply() liga/desliga moon vs sun mutuamente conforme o astro dominante.
    this.moon.shadowEnabled = false;

    // ── Sombra da LUA ────────────────────────────────────────────────
    //  A sombra do SOL some abaixo do horizonte → à noite o mapa ficava
    //  sem sombra nenhuma. A lua ganha o PRÓPRIO gerador (CSM), que:
    //   • reaproveita EXATAMENTE os mesmos casters do sol (renderList);
    //   • só renderiza quando a lua é o astro dominante (noite) → 0 custo
    //     de GPU durante o dia (renderList vazia = nada pra desenhar).
    try {
      const CSM = BABYLON.CascadedShadowGenerator;
      const mg = new CSM(1024, this.moon);
      mg.numCascades = 4;
      mg.lambda = 0.8;
      mg.stabilizeCascades = true;
      mg.cascadeBlendPercentage = 0.05;
      mg.shadowMaxZ = 115;
      mg.depthClamp = true;
      mg.autoCalcDepthBounds = true;
      mg.filter = BABYLON.ShadowGenerator.FILTER_PCF;
      mg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
      mg.bias = 0.003;
      mg.normalBias = 0.12;
      mg.setDarkness(0.5);                  // sombra de luar é suave, não preta
      mg.getShadowMap().renderList = [];    // começa desativada (de dia)
      this.moonShadowGen = mg;
      window._moonShadowGen = mg;
    } catch (e) { console.warn('[DayNight] gerador de sombra da lua falhou', e); }

    // Discos visuais de sol e lua no céu (billboard emissivo)
    this._buildCelestials();

    this.setTime(this.t);
  }

  _buildSky() {
    // SkyMaterial vem no bundle do Babylon (materialsLibrary). Se não houver,
    //  cai num gradiente simples (fallback).
    // ESFERA (não box!) — o SkyMaterial deforma o sol nas quinas de um box,
    //  virando aquele "triângulo" branco. Esfera dá céu/sol redondo correto.
    this.skyDome = BABYLON.MeshBuilder.CreateSphere('skyHD', { diameter: 1000, segments: 24 }, this.scene);
    this.skyDome.infiniteDistance = true;
    this.skyDome.isPickable = false;
    if (BABYLON.SkyMaterial) {
      const sky = new BABYLON.SkyMaterial('skyHDMat', this.scene);
      sky.backFaceCulling = false;
      sky.turbidity = 8;          // atmosfera (haze)
      sky.luminance = 1;
      sky.rayleigh = 2;           // azul do céu
      // mie BAIXO → mata o "cone/raio" de luz do sol que virava o triângulo
      //  branco gritante no céu. Halo do sol fica sutil.
      sky.mieCoefficient = 0.001;
      sky.mieDirectionalG = 0.05;
      sky.useSunPosition = true;  // controlamos o sol manualmente
      this.skyMat = sky;
      this.skyDome.material = sky;
      this._hasSkyMat = true;
    } else {
      // fallback: emissivo simples
      const m = new BABYLON.StandardMaterial('skyHDMat', this.scene);
      m.backFaceCulling = false; m.disableLighting = true;
      m.emissiveColor = new BABYLON.Color3(.55, .68, .92);
      this.skyMat = m;
      this.skyDome.material = m;
      this._hasSkyMat = false;
    }
    // esconde o sky antigo do Level (se existir) pra não brigar
    this._hideOldSky();
  }

  // O skyBox antigo (StandardMaterial do Level) pode ser criado DEPOIS do
  //  DayNightCycle no boot → dois céus sobrepostos = estourado. Garante que
  //  ele fique escondido (chamado no boot e periodicamente no início).
  _hideOldSky() {
    const old = this.scene.getMeshByName('skyBox');
    if (old && old.isEnabled()) { old.setEnabled(false); return true; }
    return false;
  }

  _buildCelestials() {
    // Textura radial (disco brilhante no centro → transparente na borda) →
    //  sol/lua REDONDOS com halo, não um quadrado estilo Minecraft.
    const radialTex = (name, r, g, b) => {
      const S = 256, dt = new BABYLON.DynamicTexture(name, { width: S, height: S }, this.scene, false);
      dt.hasAlpha = true;
      const ctx = dt.getContext();
      const grd = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
      grd.addColorStop(0.00, `rgba(255,255,255,1)`);
      grd.addColorStop(0.22, `rgba(${r},${g},${b},1)`);
      grd.addColorStop(0.45, `rgba(${r},${g},${b},0.6)`);
      grd.addColorStop(0.75, `rgba(${r},${g},${b},0.15)`);
      grd.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
      dt.update();
      return dt;
    };

    // Sol/Lua = ESFERAS emissivas sólidas (sempre redondas de qualquer
    //  ângulo). O plano billboard com alpha mostrava um TRIÂNGULO em ângulos
    //  rasos — esfera resolve. Sem alpha, sem billboard.
    this.sunDisc = BABYLON.MeshBuilder.CreateSphere('sunDisc', { diameter: 26, segments: 16 }, this.scene);
    const sm = new BABYLON.StandardMaterial('sunDiscMat', this.scene);
    sm.emissiveColor = new BABYLON.Color3(1, 0.92, 0.65);
    sm.diffuseColor = new BABYLON.Color3(0, 0, 0);
    sm.disableLighting = true;
    this.sunDisc.material = sm;
    this.sunDisc.isPickable = false;

    this.moonDisc = BABYLON.MeshBuilder.CreateSphere('moonDisc', { diameter: 18, segments: 16 }, this.scene);
    const mm = new BABYLON.StandardMaterial('moonDiscMat', this.scene);
    mm.emissiveColor = new BABYLON.Color3(0.82, 0.88, 1.0);
    mm.diffuseColor = new BABYLON.Color3(0, 0, 0);
    mm.disableLighting = true;
    this.moonDisc.material = mm;
    this.moonDisc.isPickable = false;
  }

  // ─────────────────────────────────────────────────────────────────
  //  MODO ESPAÇO — paisagem de galáxia (flutuando no vácuo, "outro planeta")
  //
  //  Em vez do céu azul atmosférico, a cúpula vira um campo estelar com
  //  nebulosas e a faixa da Via Láctea (textura equiretangular gerada por
  //  canvas — offline, sem download). O vácuo não dispersa luz → céu PRETO,
  //  ambiente baixíssimo e sombra quase preta (look lunar/Marte real). O sol
  //  vira uma estrela distante, branca e forte, fixa no alto (sombra dura).
  // ─────────────────────────────────────────────────────────────────

  // Gera a textura do universo (uma vez, cacheada). Equiretangular: as UVs
  //  padrão da esfera mapeiam lat/long, então o campo cobre 360°.
  _buildSpaceTexture() {
    if (this._spaceTex) return this._spaceTex;
    const W = 2048, H = 1024;
    const dt = new BABYLON.DynamicTexture('spaceSkyTex', { width: W, height: H }, this.scene, true);
    const ctx = dt.getContext();
    const rnd = Math.random;
    // fundo: preto azulado profundo
    ctx.fillStyle = '#01010a';
    ctx.fillRect(0, 0, W, H);

    const bandY = H * 0.52;   // faixa central onde concentra nebulosa/estrelas
    ctx.globalCompositeOperation = 'lighter';

    // blob radial desenhado COM WRAP horizontal (sem costura no meridiano)
    const blob = (cx, cy, r, css0, css1) => {
      for (const ox of [0, -W, W]) {
        if (cx + ox < -r || cx + ox > W + r) continue;
        const g = ctx.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, r);
        g.addColorStop(0, css0);
        g.addColorStop(0.5, css1);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx + ox, cy, r, 0, 7); ctx.fill();
      }
    };

    // 1) Nebulosas coloridas (azul/roxo/magenta/teal/âmbar), perto da faixa
    const neb = [[40,30,95],[78,24,84],[18,64,104],[88,46,28],[24,86,96],[58,30,118]];
    for (let i = 0; i < 28; i++) {
      const cx = rnd() * W;
      const cy = bandY + (rnd() - 0.5) * H * 0.58;
      const r  = 130 + rnd() * 360;
      const c  = neb[(rnd() * neb.length) | 0];
      const a  = 0.05 + rnd() * 0.10;
      blob(cx, cy, r, `rgba(${c[0]},${c[1]},${c[2]},${a})`, `rgba(${c[0]},${c[1]},${c[2]},${a*0.4})`);
    }
    // 2) Haze da Via Láctea (poeira clara difusa ao longo da faixa)
    for (let i = 0; i < 16; i++) {
      const cx = rnd() * W;
      const cy = bandY + (rnd() - 0.5) * H * 0.16;
      const r  = 200 + rnd() * 320;
      const a  = 0.05 + rnd() * 0.06;
      blob(cx, cy, r, `rgba(185,188,215,${a})`, `rgba(185,188,215,${a*0.4})`);
    }

    // 3) Estrelas (mais densas perto da faixa); tamanho/brilho/cor variados
    const sc = ['255,255,255','205,222,255','255,232,205','182,202,255','255,255,236'];
    for (let i = 0; i < 5400; i++) {
      const x = rnd() * W;
      const y = rnd() < 0.45 ? bandY + (rnd() - 0.5) * H * 0.30 : rnd() * H;
      const c = sc[(rnd() * sc.length) | 0];
      const br = rnd();
      const a = 0.25 + br * 0.75;
      const s = br > 0.985 ? 2.3 : br > 0.9 ? 1.5 : 1.0;
      ctx.fillStyle = `rgba(${c},${a})`;
      ctx.fillRect(x, y, s, s);
    }
    // 4) Estrelas-herói com glow + núcleo branco (brilham/blooam)
    for (let i = 0; i < 80; i++) {
      const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 7;
      const c = sc[(rnd() * sc.length) | 0];
      blob(x, y, r, `rgba(${c},0.95)`, `rgba(${c},0.32)`);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(x - 0.75, y - 0.75, 1.6, 1.6);
    }

    ctx.globalCompositeOperation = 'source-over';
    dt.update();
    this._spaceTex = dt;
    return dt;
  }

  // Liga/desliga o modo espaço. Default do jogo = ligado (boot em main.js).
  setSpaceMode(on = true) {
    on = !!on;
    if (this.space === on) return;
    this.space = on;
    if (on) {
      const tex = this._buildSpaceTexture();
      if (!this.spaceMat) {
        const m = new BABYLON.StandardMaterial('spaceSkyMat', this.scene);
        m.backFaceCulling = false;
        m.disableLighting = true;
        m.emissiveTexture = tex;
        m.emissiveColor  = new BABYLON.Color3(1, 1, 1);
        m.diffuseColor   = new BABYLON.Color3(0, 0, 0);
        m.specularColor  = new BABYLON.Color3(0, 0, 0);
        this.spaceMat = m;
      }
      this._envIntensitySaved = this.scene.environmentIntensity ?? 0.55;
      this.skyDome.material = this.spaceMat;
      // sol fixo no alto → sombra dura e estável (sem ciclo dia/noite no espaço)
      this.setManual(true);
      this._apply();
      console.log('[DayNight] 🌌 modo ESPAÇO ligado');
    } else {
      this.skyDome.material = this.skyMat;
      if (this._envIntensitySaved != null) this.scene.environmentIntensity = this._envIntensitySaved;
      if (this.gfx) this.gfx._lockExposure = false;
      this.setManual(false);
      this._apply();
      console.log('[DayNight] ☀️ modo espaço desligado');
    }
  }

  // Sobrescreve céu/luz pro vácuo (chamado no fim de _apply quando space=true).
  _applySpaceOverride(sunPos) {
    const s = this.scene;
    // céu/horizonte: preto profundo (sem dispersão atmosférica)
    s.clearColor = new BABYLON.Color4(0.004, 0.005, 0.013, 1);
    s.fogColor   = new BABYLON.Color3(0.004, 0.005, 0.013);  // distância some no escuro
    s.environmentIntensity = 0.12;                            // reflexos discretos (não céu azul)
    // ambiente: luar estelar frio e BAIXO → sombra quase preta (lunar)
    this.ambient.intensity   = 0.10;
    this.ambient.diffuse     = new BABYLON.Color3(0.34, 0.40, 0.58);
    this.ambient.groundColor = new BABYLON.Color3(0.03, 0.03, 0.05);
    // sol = estrela distante: branca, forte, sombra dura
    this.sun.intensity = 1.30;
    this.sun.diffuse   = new BABYLON.Color3(1.0, 0.99, 0.96);
    if (this.shadowGen) this.shadowGen.darkness = 0.05;
    // lua off; disco do sol vira a estrela (estoura no bloom)
    this.moon.intensity = 0;
    if (this.moonDisc) this.moonDisc.setEnabled(false);
    if (this.sunDisc) {
      this.sunDisc.setEnabled(true);
      this.sunDisc.position = sunPos;
      this.sunDisc.material.emissiveColor = new BABYLON.Color3(2.4, 2.3, 2.1);
    }
  }

  // ── Controle de tempo ────────────────────────────────────────────
  setTime(t) { this.t = ((t % 1) + 1) % 1; this._apply(); }
  setPhase(name) {
    const map = { madrugada: 0.92, manha: 0.28, manhã: 0.28, tarde: 0.62, noite: 0.80, meiodia: 0.50 };
    if (map[name] != null) this.setTime(map[name]);
  }
  pause(v = true) { this.paused = v; }

  // Liga/desliga o controle manual do sol. Ao ligar, congela o tempo e passa
  //  a usar sunElevDeg/sunAzimDeg/sunIntensity/ambientInt/shadowDark.
  setManual(v = true) {
    this.manual = v;
    if (v && this.gfx) this.gfx._lockExposure = true;   // painel controla exposição
    this._apply();
  }

  update(dt) {
    if (this.manual) { this._apply(); return; }   // re-impõe o sol manual
    if (this.paused) return;
    // SINCRONIZADO ENTRE TODOS: a hora do dia NÃO é mais um acumulador local de
    // dt (que divergia entre clientes — um de dia, outro de noite). Agora deriva
    // do RELÓGIO global (Date.now()), igual em todas as máquinas (±skew de poucos
    // segundos, irrelevante num ciclo de 4 min). Mesmo mundo, mesma hora pra todos.
    const secs = Date.now() / 1000;
    this.t = ((secs / this.dayLengthSec) + 0.30) % 1;   // +0.30 = começa de manhã
    this._apply();
  }

  // ── Aplica iluminação/céu/cores conforme o tempo ─────────────────
  _apply() {
    let elev, cosA, sunDir;

    if (this.manual) {
      // MANUAL: ângulo vem dos sliders (elevação + azimute), não do tempo.
      const el = this.sunElevDeg * Math.PI / 180;
      const az = this.sunAzimDeg * Math.PI / 180;
      elev = Math.sin(el);
      cosA = Math.cos(az);                         // pro disco/azul do céu
      const hx = Math.cos(el) * Math.cos(az);      // componente horizontal
      const hz = Math.cos(el) * Math.sin(az);
      // direção da LUZ: aponta do sol pra cena (pra baixo)
      sunDir = new BABYLON.Vector3(-hx, -Math.max(0.05, Math.sin(el)), -hz).normalize();
    } else {
      // AUTO: ângulo do sol pelo tempo. t=0 nascente, sobe, põe no oeste.
      const ang = this.t * Math.PI * 2 - Math.PI / 2;   // -90° em t=0
      elev = Math.sin(ang);
      cosA = Math.cos(ang);
      // teto na altura → sol nunca 100% vertical → sombra sempre projeta
      const ySun = Math.min(this.maxAutoElev, Math.max(0.05, Math.abs(elev))) * (elev >= 0 ? 1 : -1);
      sunDir = new BABYLON.Vector3(-cosA, -ySun, -0.35).normalize();
    }
    // posição do disco do sol + halo do céu — alinhados com a direção da luz
    const dist = 400;
    const sunWorldDir = sunDir.negate();              // aponta PRA o sol
    const sunPos = sunWorldDir.scale(dist);

    // ── DIA vs NOITE ──────────────────────────────────────────────────
    const isDay = elev > -0.05;
    const dayF = Math.max(0, Math.min(1, (elev + 0.15) / 0.5));   // 0 noite → 1 dia pleno

    // SOL: forte de dia, some à noite. Só a DIREÇÃO muda com a hora; a
    //  POSIÇÃO da luz é controlada por _updateShadowFrustum (segue o player)
    //  pra manter a sombra nítida. Aqui só atualizamos a direção.
    this.sun.direction = sunDir.clone();
    this.sun.intensity = this.manual ? this.sunIntensity : (0.12 + dayF * 0.88);
    // cor do sol: alaranjada perto do horizonte, branca alto
    const horizon = 1 - Math.min(1, Math.abs(elev) / 0.35);   // 1 no horizonte
    this.sun.diffuse = new BABYLON.Color3(
      1.0,
      0.78 + 0.22 * (1 - horizon),
      0.55 + 0.45 * (1 - horizon)
    );

    // LUA: assume à noite (oposta ao sol)
    const moonElev = -elev;
    const moonF = Math.max(0, Math.min(1, (moonElev + 0.1) / 0.5));
    this.moon.direction = new BABYLON.Vector3(cosA, -Math.max(0.05, Math.abs(moonElev)) * (moonElev >= 0 ? 1 : -1), 0.35).normalize();
    this.moon.intensity = moonF * 0.5;

    // Sombra segue o astro ATIVO (sol de dia, lua de noite)
    if (this.shadowGen) {
      const activeLight = dayF > moonF ? this.sun : this.moon;
      if (this.shadowGen.getLight && this.shadowGen.getLight() !== activeLight) {
        // ShadowGenerator é fixo numa luz; em vez de trocar, ajustamos a
        //  intensidade — sombra some suavemente na transição.
      }
      // darkness: MENOR = sombra mais escura. Forte de dia (0.3), suave à noite.
      this.shadowGen.darkness = this.manual ? this.shadowDark : (0.3 + (1 - dayF) * 0.35);
    }

    // ── Sombra da LUA: liga só quando a lua domina (noite) ────────────
    //  CRÍTICO (WebGPU): cada luz com shadowEnabled+gerador ATIVO declara
    //  um par de varyings (vPositionFromLight[i]+vDepthMetric[i]) no shader
    //  PBR — INDEPENDENTE da renderList estar vazia. WebGPU só permite 16
    //  inter-stage outputs; com sol+lua sempre ligados + varyings do PBR
    //  pesado, qualquer 3ª fonte estoura o limite → shader não compila →
    //  material quebrado / tela preta. Solução: sun e moon shadowEnabled
    //  MUTUAMENTE EXCLUSIVOS — no máximo UMA luz-sombra existe por vez.
    if (this.moonShadowGen && this.shadowGen?.getShadowMap) {
      const sunSM  = this.shadowGen.getShadowMap();
      const moonSM = this.moonShadowGen.getShadowMap();
      const moonActive = moonF > 0.05 && moonF >= dayF;   // lua é o astro dominante
      if (moonActive) {
        // NOITE: só a lua gera sombra. Desliga o varying do sol.
        this.moon.shadowEnabled = true;
        this.sun.shadowEnabled = false;
        // compartilha os MESMOS casters do sol (fica em sincronia automática)
        if (moonSM.renderList !== sunSM.renderList) moonSM.renderList = sunSM.renderList;
        // sombra mais marcada quando a lua está alta
        this.moonShadowGen.setDarkness(0.45 + (1 - moonF) * 0.4);
      } else {
        // DIA: só o sol gera sombra. Desliga o varying da lua (não basta
        //  esvaziar a renderList — o varying continua declarado no shader).
        this.sun.shadowEnabled = true;
        this.moon.shadowEnabled = false;
        if (moonSM.renderList && moonSM.renderList.length) {
          moonSM.renderList = [];   // de dia: nada a renderizar → custo ~zero
        }
      }
    }

    // AMBIENTE: claro de dia, azul-escuro à noite
    this.ambient.intensity = this.manual ? this.ambientInt : (0.15 + dayF * 0.28);
    this.ambient.diffuse = new BABYLON.Color3(
      0.45 + dayF * 0.40, 0.50 + dayF * 0.38, 0.60 + dayF * 0.32   // céu suave (não branco puro)
    );
    this.ambient.groundColor = new BABYLON.Color3(0.10 + dayF*0.12, 0.12 + dayF*0.16, 0.10 + dayF*0.10);

    // ── CÉU ───────────────────────────────────────────────────────────
    if (this._hasSkyMat) {
      // SkyMaterial: posição do sol ALINHADA com a esfera visual (mesma
      //  direção), pra não desenhar um halo deslocado (o triângulo branco).
      this.skyMat.sunPosition = sunWorldDir.clone();
      this.skyMat.luminance = 0.4 + dayF * 0.4;
      this.skyMat.turbidity = 4 + (1 - dayF) * 6;
      this.skyMat.rayleigh = 1.5 + dayF * 1.2;
    } else {
      // fallback gradiente: cor do céu por fase
      const c = this._skyColorFor(elev, horizon);
      this.skyMat.emissiveColor = c;
    }

    // clearColor + névoa acompanham o céu
    const fog = this._skyColorFor(elev, horizon);
    this.scene.clearColor = new BABYLON.Color4(fog.r, fog.g, fog.b, 1);
    this.scene.fogColor = fog;

    // ── Discos sol/lua ────────────────────────────────────────────────
    if (this.sunDisc) {
      this.sunDisc.position = sunPos;
      this.sunDisc.setEnabled(elev > -0.2);
      this.sunDisc.material.emissiveColor = new BABYLON.Color3(1, 0.85 + 0.1*(1-horizon), 0.5 + 0.4*(1-horizon));
    }
    if (this.moonDisc) {
      const mp = new BABYLON.Vector3(-cosA * dist, moonElev * dist, -0.35 * dist);
      this.moonDisc.position = mp;
      this.moonDisc.setEnabled(moonElev > -0.2);
    }

    // Acabamento gráfico acompanha a hora (exposure/bloom). No modo manual
    //  o painel controla a exposição → não sobrescreve.
    if (!this.manual && this.gfx?.setDayFactor) this.gfx.setDayFactor(dayF);

    // ── ESPAÇO: sobrescreve céu/luz pro vácuo (preto, sombra dura) ──────
    if (this.space) this._applySpaceOverride(sunPos);

    this._phase = this._phaseName(elev, cosA);
  }

  // Cor do céu/névoa por elevação (gradiente manhã→dia→tarde→noite)
  _skyColorFor(elev, horizon) {
    // paleta-chave
    const day    = new BABYLON.Color3(0.53, 0.68, 0.92);
    const sunset = new BABYLON.Color3(0.95, 0.55, 0.30);
    const night  = new BABYLON.Color3(0.04, 0.05, 0.12);
    if (elev > 0.25) return day;
    if (elev > -0.05) {
      // horizonte: mistura dia↔pôr-do-sol
      const k = (elev + 0.05) / 0.30;
      return BABYLON.Color3.Lerp(sunset, day, Math.max(0, Math.min(1, k)));
    }
    // abaixo do horizonte: pôr-do-sol↔noite
    const k = Math.max(0, Math.min(1, (-elev - 0.05) / 0.25));
    return BABYLON.Color3.Lerp(sunset, night, k);
  }

  _phaseName(elev, cosA) {
    if (elev < -0.1) return 'noite';
    if (elev < 0.12) return cosA > 0 ? 'amanhecer' : 'anoitecer';
    return cosA > 0 ? 'manhã' : 'tarde';
  }

  get phase() { return this._phase || 'dia'; }
}
