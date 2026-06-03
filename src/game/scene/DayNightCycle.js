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
    this.moon.shadowEnabled = true;

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
    this.t = (this.t + dt / this.dayLengthSec) % 1;
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
    if (this.moonShadowGen && this.shadowGen?.getShadowMap) {
      const sunSM  = this.shadowGen.getShadowMap();
      const moonSM = this.moonShadowGen.getShadowMap();
      const moonActive = moonF > 0.05 && moonF >= dayF;   // lua é o astro dominante
      if (moonActive) {
        // compartilha os MESMOS casters do sol (fica em sincronia automática)
        if (moonSM.renderList !== sunSM.renderList) moonSM.renderList = sunSM.renderList;
        // sombra mais marcada quando a lua está alta
        this.moonShadowGen.setDarkness(0.45 + (1 - moonF) * 0.4);
      } else if (moonSM.renderList && moonSM.renderList.length) {
        moonSM.renderList = [];   // de dia: nada a renderizar → custo ~zero
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
