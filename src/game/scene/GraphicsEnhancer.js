// ─────────────────────────────────────────────────────────────────
//  GraphicsEnhancer — acabamento cinematográfico (o "next-gen")
//
//  Liga, em cima da cena, tudo que o Babylon oferece de pós-processamento
//  e qualidade — sem ray tracing de hardware (não existe em WebGL), mas com
//  o conjunto que dá o visual realista:
//    • DefaultRenderingPipeline: FXAA, Bloom, Tonemapping (ACES), exposure,
//      contraste, vinheta, sharpen, grão
//    • SSAO2: oclusão de ambiente (cantos/contatos escurecem → profundidade)
//    • GlowLayer: brilho de emissivos (sol, neon, plasma)
//    • MSAA + hardware scaling pra nitidez
//
//  Qualidade ajustável (alto/médio/baixo) — tecla pra alternar se precisar.
// ─────────────────────────────────────────────────────────────────

export class GraphicsEnhancer {
  constructor(scene, camera, engine) {
    this.scene = scene;
    this.camera = camera;
    this.engine = engine;
    this.quality = 'alto';
    this._build();
  }

  _build() {
    const scene = this.scene, cam = this.camera;

    // ── Image processing global (tonemapping cinematográfico) ────────
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.01;   // valor escolhido no painel F8
    ip.contrast = 1.68;   // valor escolhido no painel F8
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.2;
    ip.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);

    // ── DefaultRenderingPipeline: FXAA + Bloom + sharpen + grão ──────
    const pl = new BABYLON.DefaultRenderingPipeline('mainPipeline', true, scene, [cam]);
    // MSAA: no WebGPU, MSAA (samples>1) propaga pros RTTs de post-process
    //  (bloom highlights) → "Invalid RenderPipeline ...samples4..." e tela
    //  preta ao trocar de arma. MSAA em post-process é inválido por design no
    //  WebGPU. Solução: samples=1 + FXAA (mais leve, sem o crash). No WebGL2
    //  mantém MSAA 4x.
    pl.samples = window._webgpu ? 1 : 4;
    pl.fxaaEnabled = true;          // AA principal (cobre a falta de MSAA no WebGPU)
    // ⚠️ BLOOM/SHARPEN/GRAIN DESLIGADOS no WebGPU. O bloom cria o render pass
    // "PostProcessRTT-highlights" (extração de áreas brilhantes) que injeta
    // varyings extras no fragment shader → com PBR pesado o total passa de 16
    // ("fragment input 17 > 16") → RenderPipeline inválido → TELA PRETA cheia de
    // artefatos ao olhar pra cena (spam de GPUValidationError todo frame). ESTE
    // era o culpado real (não o GlowLayer). No WebGL2 o bloom continua. Mantemos
    // FXAA + tonemapping/imageProcessing (leves, sem highlights pass).
    const _heavyFX = !window._webgpu;
    pl.bloomEnabled = _heavyFX;
    if (_heavyFX) {
      pl.bloomThreshold = 1.0;     // só brilho REAL (>1) floresce
      pl.bloomWeight = 0.30;
      pl.bloomKernel = 48;
      pl.bloomScale = 0.5;
    }
    // ⚠️ imageProcessing do PIPELINE desligado no WebGPU. O log provou que o
    //  "PostProcessRTT-imageProcessing" é o que injeta o 17º varying quando um
    //  avatar PBR pesado (orc/dark_warrior, muitos canais uv/normal/tangent)
    //  entra na cena → "fragment input 17 > 16" → tela preta + spam.
    //  O ACES tonemapping/exposure/contrast/vignette JÁ está em
    //  scene.imageProcessingConfiguration (configurado no topo de _build) —
    //  aplicado direto no material, SEM render-target extra. Então desligar o
    //  do pipeline no WebGPU NÃO perde o tonemapping. No WebGL2 mantém o do
    //  pipeline (mais preciso, sem o problema de varyings).
    pl.imageProcessingEnabled = _heavyFX;
    pl.sharpenEnabled = _heavyFX;
    if (_heavyFX) pl.sharpen.edgeAmount = 0.20;
    pl.grainEnabled = _heavyFX;
    if (_heavyFX) { pl.grain.intensity = 4; pl.grain.animated = true; }
    this.pipeline = pl;

    // ── SSAO2: oclusão de ambiente (profundidade nos contatos) ───────
    //  ⚠️ DESLIGADO no WebGPU. O SSAO2 usa o prePass renderer (textura
    //     prePass_Depth). Quando a câmera ativa troca — ex: entrar/sair do
    //     editor de cena, que usa a GhostCamera — o WebGPU DESTRÓI a textura
    //     de prePass da câmera antiga, mas o pipeline ainda a referencia no
    //     próximo Submit → spam "Destroyed texture prePass_Depth used in a
    //     submit" + TELA PRETA. Mesmo motivo pelo qual o SSR está off.
    //     No WebGL2 (fallback) o SSAO continua ligado normalmente.
    const ENABLE_SSAO = !window._webgpu;
    if (ENABLE_SSAO) try {
      const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [cam]);
      ssao.radius = 2.5;            // calibrado no painel F8
      ssao.totalStrength = 1.1;
      ssao.expensiveBlur = true;
      ssao.samples = 16;
      ssao.maxZ = 120;
      this.ssao = ssao;
    } catch (e) { console.warn('[GFX] SSAO2 indisponível:', e?.message); }
    else console.log('[GFX] SSAO2 desligado no WebGPU (prePass instável em troca de câmera)');

    // ── GlowLayer: brilho SÓ de quem é pra brilhar (neon/plasma/sol) ──
    //  Sem filtro, o glow pegava o emissivo leve do PERSONAGEM (rato
    //  radioativo). Filtramos por nome → só tracers/muzzle/neon/sol brilham.
    //
    //  ⚠️ DESLIGADO no WebGPU. O GlowLayer cria o PostProcessRTT-highlights, que
    //  injeta varyings extras no fragment shader: com os materiais PBR pesados
    //  (uv/uv2 + normal+tangent + vColor + fog + front_facing) o total passa de
    //  16 (erro real: "fragment input 17 > 16") → RenderPipeline inválido →
    //  tela quebrada com spam de GPUValidationError. Igual ao SSAO acima, o glow
    //  só roda em WebGL2. Em WebGPU os tracers/neon ainda aparecem (emissivo do
    //  material), só não ganham o "bloom de contorno" do glow.
    if (!window._webgpu) {
      try {
        const glow = new BABYLON.GlowLayer('glow', scene, { mainTextureSamples: 2 });
        glow.intensity = 0.5;
        const GLOW_OK = /tracer|muzzle|spark|neon|plasma|sunDisc|moonDisc|crystal|beam|glow/i;
        glow.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
          if (GLOW_OK.test(mesh.name || '')) {
            const e = material.emissiveColor || BABYLON.Color3.Black();
            result.set(e.r, e.g, e.b, 1);
          } else {
            result.set(0, 0, 0, 0);   // não brilha (player, cenário, etc)
          }
        };
        this.glow = glow;
      } catch (_) {}
    } else {
      // ── Fallback de glow no WebGPU (sem highlights pass / sem varyings) ──
      //  Não dá pra criar o GlowLayer (estoura 16 varyings). Mas dá pra fazer
      //  o emissivo "brilhar" de outro jeito BARATO: amplificar a emissiveColor
      //  dos materiais de tracer/muzzle/neon ACIMA de 1.0. Como o ACES
      //  tonemapping + exposure rodam no material (sem render-target extra), um
      //  emissivo >1 vira um núcleo estourado/brilhante (highlight aditivo) —
      //  sem nenhum postprocess novo → 0 varying extra → seguro no WebGPU.
      //  Roda 1×/seg num observer leve, pega materiais novos (armas trocadas).
      const GLOW_OK = /tracer|muzzle|spark|neon|plasma|sunDisc|moonDisc|crystal|beam|glow/i;
      const BOOST = 2.6;        // multiplicador do emissivo (núcleo estourado)
      let _gAccum = 0;
      this._wgpuGlowObs = scene.onBeforeRenderObservable.add(() => {
        _gAccum += scene.getEngine().getDeltaTime();
        if (_gAccum < 1000) return;
        _gAccum = 0;
        for (const m of scene.meshes) {
          if (!GLOW_OK.test(m.name || '')) continue;
          const mat = m.material;
          if (!mat || !mat.emissiveColor || mat._wgpuGlowBoosted) continue;
          const e = mat.emissiveColor;
          // só amplifica se há emissivo real; marca pra não reaplicar (compounding)
          if (e.r + e.g + e.b <= 0.001) continue;
          mat.emissiveColor = new BABYLON.Color3(e.r * BOOST, e.g * BOOST, e.b * BOOST);
          mat._wgpuGlowBoosted = true;
        }
      });
      console.log('[GFX] GlowLayer OFF no WebGPU → fallback: emissivo amplificado (highlight aditivo, sem varyings)');
    }

    // — Aberração cromática sutil (lente real) → bordas com franja de cor —
    //   ⚠️ SÓ no WebGL2. No WebGPU o CA adiciona um postprocess que injeta o
    //   varying que estoura 16→17 (mesmo com bloom/glow já off) → tela preta +
    //   spam de GPUValidationError. Por isso fica atrás de _heavyFX.
    if (_heavyFX) {
      try {
        pl.chromaticAberrationEnabled = true;
        pl.chromaticAberration.aberrationAmount = 14;
        pl.chromaticAberration.radialIntensity = 0.7;
      } catch (_) {}
    } else {
      try { pl.chromaticAberrationEnabled = false; } catch (_) {}
    }

    // ── Motion blur (câmera) + DoF opcional ──────────────────────────
    //  ⚠️ SÓ no WebGL2 (_heavyFX). Tanto o MotionBlur quanto o DoF usam o
    //  prePass de velocidade/profundidade que injeta varyings extras no
    //  fragment shader → no WebGPU estoura o cap de 16 ("fragment input
    //  17 > 16") → tela preta, igual bloom/glow/SSAO/CA. No WebGPU ficam
    //  desligados; no WebGL2 ligam (motion blur sutil, DoF off por padrão).
    if (_heavyFX) {
      try {
        const mb = new BABYLON.MotionBlurPostProcess('motionBlur', scene, 1.0, cam);
        mb.motionStrength = 0.35;     // sutil — só borra movimento rápido
        mb.motionBlurSamples = 12;
        // objeto-motion exige prePass+velocidade (caro); câmera-motion basta
        if (mb.isObjectBased !== undefined) mb.isObjectBased = false;
        this.motionBlur = mb;
      } catch (e) { console.warn('[GFX] MotionBlur indisponível:', e?.message); }

      // DoF: integrado ao DefaultRenderingPipeline. OFF por padrão (caro e
      //  some o fundo num FPS). Religável via setDoF(true).
      try {
        pl.depthOfFieldEnabled = false;
        pl.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Low;
        pl.depthOfField.focusDistance = 12000;   // mm
        pl.depthOfField.focalLength = 50;
        pl.depthOfField.fStop = 2.8;
      } catch (_) {}
    } else {
      console.log('[GFX] MotionBlur/DoF desligados no WebGPU (prePass de velocidade estoura 16 varyings)');
    }

    // ── Auto-exposure (eye-adaptation) — preparação ──────────────────
    //  Amostra o brilho médio da cena e adapta a exposição suavemente.
    //  Roda em ambos os backends (lê 1 pixel de um RTT minúsculo, sem
    //  postprocess que injete varyings). NÃO briga com o lock manual do F8
    //  (só adapta se _lockExposure for false). Ver _updateAutoExposure().
    this._autoExposure = true;
    this._exposureTarget = ip.exposure;
    this._exposureBase = ip.exposure;   // exposição "neutra" calibrada (F8)
    this._setupAutoExposureProbe();

    // nitidez: render na resolução nativa
    try { this.engine.setHardwareScalingLevel(1 / (window.devicePixelRatio || 1) <= 0.5 ? 0.5 : 1); } catch (_) {}

    console.log(`[GFX] ✨ pós-processamento: ${window._webgpu ? 'FXAA + ACES-no-material (WebGPU: bloom/glow/CA/imgProc-RTT OFF)' : 'Bloom+ACES+FXAA+Glow+CA'}${this.ssao ? '+SSAO' : ''}`);
  }

  // ── Auto-exposure: sonda de brilho + adaptação suave ─────────────
  //  Estratégia barata e cross-backend: a cada ~250ms lê um bloco pequeno
  //  de pixels do framebuffer já renderizado (engine.readPixels), calcula a
  //  luminância média e define um alvo de exposição. O update() (chamado pelo
  //  loop / setDayFactor) faz lerp suave até o alvo. Sem postprocess extra →
  //  zero varyings → seguro no WebGPU. Respeita o lock manual (F8).
  _setupAutoExposureProbe() {
    if (this._aeObserver) return;
    this._aeAccum = 0;
    this._aeBusy = false;
    try {
      this._aeObserver = this.scene.onAfterRenderObservable.add(() => {
        const dt = this.engine.getDeltaTime() / 1000 || 0.016;
        this._aeAccum += dt;
        if (this._aeAccum < 0.25 || this._aeBusy) { this._adaptExposure(dt); return; }
        this._aeAccum = 0;
        this._sampleBrightness();
        this._adaptExposure(dt);
      });
    } catch (e) { console.warn('[GFX] auto-exposure probe falhou:', e?.message); }
  }

  _sampleBrightness() {
    if (!this._autoExposure || this._lockExposure) return;
    const w = this.engine.getRenderWidth?.() || 0;
    const h = this.engine.getRenderHeight?.() || 0;
    if (!w || !h) return;
    // lê um bloco central pequeno (32×32) → barato, representativo do centro de mira
    const sw = 32, sh = 32;
    const sx = Math.max(0, ((w - sw) / 2) | 0);
    const sy = Math.max(0, ((h - sh) / 2) | 0);
    try {
      const res = this.engine.readPixels(sx, sy, sw, sh);
      const apply = (data) => {
        if (!data || !data.length) return;
        let sum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          n++;
        }
        if (!n) return;
        const lum = sum / n;   // 0..1 luminância média percebida
        // alvo: cena escura → exposição maior; cena clara → menor. Centrado na
        //  exposição-base calibrada (F8). Faixa contida pra não estourar o look.
        const k = (0.42 - lum) * 0.9;   // >0 se escuro, <0 se claro
        this._exposureTarget = Math.max(0.6, Math.min(1.5, this._exposureBase + k));
      };
      // WebGPU: readPixels devolve Promise; WebGL2: Uint8Array direto
      if (res && typeof res.then === 'function') {
        this._aeBusy = true;
        res.then((d) => { apply(d); this._aeBusy = false; })
           .catch(() => { this._aeBusy = false; });
      } else {
        apply(res);
      }
    } catch (_) { /* readPixels indisponível → desativa silenciosamente */ }
  }

  _adaptExposure(dt) {
    if (!this._autoExposure || this._lockExposure) return;
    const ip = this.scene.imageProcessingConfiguration;
    // lerp suave (eye-adaptation): ~1.5s de constante de tempo
    const rate = 1 - Math.exp(-dt / 1.5);
    ip.exposure += (this._exposureTarget - ip.exposure) * rate;
  }

  // ── VR: desliga TODO pós-processamento pesado ────────────────────
  //  WebXR não convive com pipelines de post-process HDR/render-target
  //  (DefaultRenderingPipeline, SSAO, SSR, GlowLayer): a sessão imersiva
  //  fica TRAVADA no "carregando" (nenhum frame chega ao headset). Aqui
  //  destruímos tudo isso ao entrar em VR; enableAfterVR() reconstrói ao sair.
  disableForVR() {
    if (this._vrDisabled) return;
    try { this.pipeline?.dispose(); } catch (_) {}
    try { this.ssao?.dispose(); } catch (_) {}
    try { this.ssr?.dispose(); } catch (_) {}
    try { this.glow?.dispose(); } catch (_) {}
    try { this.motionBlur?.dispose(); } catch (_) {}
    try { if (this._aeObserver) this.scene.onAfterRenderObservable.remove(this._aeObserver); } catch (_) {}
    try { if (this._wgpuGlowObs) this.scene.onBeforeRenderObservable.remove(this._wgpuGlowObs); } catch (_) {}
    this._aeObserver = this._wgpuGlowObs = null;
    this.pipeline = this.ssao = this.ssr = this.glow = this.motionBlur = null;
    try { this.engine.setHardwareScalingLevel(1); } catch (_) {}
    this._vrDisabled = true;
    console.log('[GFX] pós-processamento DESLIGADO para VR (compat WebXR)');
  }
  enableAfterVR() {
    if (!this._vrDisabled) return;
    this._vrDisabled = false;
    try { this._build(); } catch (e) { console.warn('[GFX] rebuild pós-VR falhou:', e?.message); }
    console.log('[GFX] pós-processamento religado (saiu do VR)');
  }

  // ── Realismo extra: IBL (reflexão/ambiente HDR) + SSR (reflexo real) ──
  //  Chamado depois do boot. IBL dá luz ambiente e reflexos realistas aos
  //  materiais PBR; SSR espelha a cena em superfícies glossy (ex: chão).
  enableRealism() {
    const scene = this.scene, cam = this.camera;

    // IBL — ambiente HDR pré-filtrado → reflexos/brilho realista no PBR
    try {
      if (!scene.environmentTexture) {
        const env = new BABYLON.CubeTexture(
          'https://playground.babylonjs.com/textures/environment.env', scene);
        scene.environmentTexture = env;
        scene.environmentIntensity = 0.55;   // sutil, não ofusca o estilo
        this.env = env;
        console.log('[GFX] 🌅 IBL (environment HDR) ligado');
      }
    } catch (e) { console.warn('[GFX] IBL falhou:', e?.message); }

    // SSR — reflexões em tempo real (chão/superfícies glossy espelham o mundo).
    //  ⚠️ DESLIGADO por padrão: no WebGPU o prepass de profundidade do SSR é
    //     destruído/recriado a cada frame ("Destroyed texture prePass_Depth
    //     used in a submit") → spam de erro + custo. O reflexo do céu/ambiente
    //     vem do IBL acima (suficiente). Religar quando o SSR/WebGPU estabilizar.
    const ENABLE_SSR = false;
    if (ENABLE_SSR) try {
      const ssr = new BABYLON.SSRRenderingPipeline('ssr', scene, [cam], false,
        BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
      ssr.strength = 0.85;
      ssr.reflectionSpecularFalloffExponent = 2.5;
      ssr.thickness = 0.6;
      ssr.maxSteps = 800;
      ssr.maxDistance = 50;
      ssr.roughnessFactor = 0.25;
      ssr.enableSmoothReflections = true;
      ssr.attenuateScreenBorders = true;
      this.ssr = ssr;
      console.log('[GFX] 🪞 SSR (reflexões em tempo real) ligado');
    } catch (e) { console.warn('[GFX] SSR indisponível:', e?.message); }
  }

  // ── Presets de qualidade ─────────────────────────────────────────
  setQuality(q) {
    this.quality = q;
    const pl = this.pipeline;
    if (q === 'baixo') {
      if (this.ssao) this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', this.camera);
      pl.bloomEnabled = false; pl.grainEnabled = false; pl.sharpenEnabled = false; pl.samples = 1;
      this.engine.setHardwareScalingLevel(1.3);
    } else if (q === 'medio') {
      pl.bloomEnabled = true; pl.grainEnabled = false; pl.sharpenEnabled = true; pl.samples = window._webgpu ? 1 : 2;
      this.engine.setHardwareScalingLevel(1);
    } else { // alto
      pl.bloomEnabled = true; pl.grainEnabled = true; pl.sharpenEnabled = true; pl.samples = window._webgpu ? 1 : 4;
      this.engine.setHardwareScalingLevel(1);
    }
  }

  // Garante que TODAS as superfícies recebam sombra do sol corretamente:
  //  • maxSimultaneousLights alto o bastante (sol+céu+lua+sombra cabem)
  //  • luzes FX locais (tiro/impacto/thumb) NÃO iluminam o cenário (gastavam
  //    os slots de luz e empurravam a sombra pra fora). Chamar após o boot.
  fixSceneShadows() {
    const scene = this.scene;
    for (const m of scene.materials) {
      if (m.maxSimultaneousLights !== undefined && m.maxSimultaneousLights < 8) m.maxSimultaneousLights = 8;
    }
    const aux = ['muzzleLight', 'hitLight', '_thumbLight'];
    const cenario = scene.meshes.filter(m =>
      /ground|bump|alley|tower|tplat|twall|ramp|cover|sniper|cheese|placed_|_decor_/i.test(m.name || '') &&
      (m.getTotalVertices?.() || 0) > 0
    );
    for (const ln of aux) {
      const L = scene.getLightByName(ln);
      if (!L) continue;
      for (const g of cenario) if (!L.excludedMeshes.includes(g)) L.excludedMeshes.push(g);
    }
    // garante receiveShadows em todo o cenário
    cenario.forEach(m => { m.receiveShadows = true; });

    // Registra os CASTERS: objetos sólidos (paredes/torres/construção/props)
    //  projetam sombra. Chão/terreno NÃO (só recebem). Inclui child meshes
    //  dos GLB (root costuma ser vazio). Pega via shadowGen global.
    const sg = window._shadowGen;
    if (sg) {
      const sm = sg.getShadowMap();
      const isCaster = (m) => {
        const n = m.name || '';
        if (/ground|bump_/i.test(n)) return false;   // chão não projeta
        return /alley|tower|tplat|twall|ramp|cover|sniper|cheese|placed_|_decor_|crate|barrel/i.test(n)
          && (m.getTotalVertices?.() || 0) > 0;
      };
      let added = 0;
      for (const m of scene.meshes) {
        if (isCaster(m) && sm.renderList && !sm.renderList.includes(m)) { sg.addShadowCaster(m); added++; }
      }
      console.log(`[GFX] sombras: ${cenario.length} recebem · ${added} casters add · luzes FX isoladas`);
    }
  }

  // Ajusta exposure/bloom conforme a hora (chamado pelo DayNightCycle)
  setDayFactor(dayF) {
    if (this._lockExposure) return;        // usuário travou no painel F8 / sol manual
    const ip = this.scene.imageProcessingConfiguration;
    const exp = 0.82 + dayF * 0.19;        // noite ~0.82, meio-dia ~1.01 (valor F8)
    if (this._autoExposure) {
      // dia/noite define a exposição NEUTRA; o auto-exposure adapta em torno
      //  dela (e o _adaptExposure faz o lerp suave de ip.exposure).
      this._exposureBase = exp;
    } else {
      ip.exposure = exp;
    }
    if (this.pipeline) this.pipeline.bloomWeight = 0.12 + dayF * 0.10;   // bloom contido
  }

  // Liga/desliga o auto-exposure (eye-adaptation). Off → volta pra base.
  setAutoExposure(on = true) {
    this._autoExposure = !!on;
    if (!on) this._exposureTarget = this._exposureBase;
  }

  // Liga/desliga o Depth of Field (off por padrão; só efetivo no WebGL2).
  setDoF(on = true) {
    try { if (this.pipeline) this.pipeline.depthOfFieldEnabled = !!on && !window._webgpu; } catch (_) {}
  }
}
