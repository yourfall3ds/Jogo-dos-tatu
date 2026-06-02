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

    // ── Céu procedural HD ────────────────────────────────────────────
    this._buildSky();

    // ── Lua (2ª luz direcional, fria) ────────────────────────────────
    this.moon = new BABYLON.DirectionalLight('moon',
      new BABYLON.Vector3(0.5, -1, 0.5).normalize(), scene);
    this.moon.intensity = 0;
    this.moon.diffuse = new BABYLON.Color3(0.6, 0.7, 1.0);
    this.moon.specular = new BABYLON.Color3(0.3, 0.4, 0.6);

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

  update(dt) {
    if (this.paused) return;
    this.t = (this.t + dt / this.dayLengthSec) % 1;
    this._apply();
  }

  // ── Aplica iluminação/céu/cores conforme o tempo ─────────────────
  _apply() {
    // Ângulo do sol: t=0 nascente (leste), sobe ao meio-dia, põe no oeste.
    //  elevation: -1 (meia-noite) .. +1 (meio-dia)
    const ang = this.t * Math.PI * 2 - Math.PI / 2;   // -90° em t=0
    const elev = Math.sin(ang);          // altura do sol no céu
    const cosA = Math.cos(ang);

    // Direção do SOL (de onde a luz vem → aponta pra baixo quando alto)
    const sunDir = new BABYLON.Vector3(-cosA, -Math.max(0.05, Math.abs(elev)) * (elev >= 0 ? 1 : -1), -0.35).normalize();
    // posição visual do disco do sol (longe)
    const dist = 400;
    const sunPos = new BABYLON.Vector3(cosA * dist, elev * dist, 0.35 * dist);

    // ── DIA vs NOITE ──────────────────────────────────────────────────
    const isDay = elev > -0.05;
    const dayF = Math.max(0, Math.min(1, (elev + 0.15) / 0.5));   // 0 noite → 1 dia pleno

    // SOL: forte de dia, some à noite. Só a DIREÇÃO muda com a hora; a
    //  POSIÇÃO da luz é controlada por _updateShadowFrustum (segue o player)
    //  pra manter a sombra nítida. Aqui só atualizamos a direção.
    this.sun.direction = sunDir.clone();
    this.sun.intensity = 0.15 + dayF * 1.7;
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
      this.shadowGen.darkness = 0.35 + (1 - dayF) * 0.25;   // sombra mais fraca à noite
    }

    // AMBIENTE: claro de dia, azul-escuro à noite
    this.ambient.intensity = 0.18 + dayF * 0.45;
    this.ambient.diffuse = new BABYLON.Color3(
      0.5 + dayF * 0.5, 0.55 + dayF * 0.45, 0.7 + dayF * 0.3
    );
    this.ambient.groundColor = new BABYLON.Color3(0.10 + dayF*0.12, 0.12 + dayF*0.16, 0.10 + dayF*0.10);

    // ── CÉU ───────────────────────────────────────────────────────────
    if (this._hasSkyMat) {
      // SkyMaterial: posição do sol ALINHADA com a esfera visual (mesma
      //  direção), pra não desenhar um halo deslocado (o triângulo branco).
      this.skyMat.sunPosition = new BABYLON.Vector3(cosA, Math.max(-0.35, elev), 0.35).normalize();
      this.skyMat.luminance = 0.5 + dayF * 0.5;
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

    // Acabamento gráfico acompanha a hora (exposure/bloom)
    if (this.gfx?.setDayFactor) this.gfx.setDayFactor(dayF);

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
