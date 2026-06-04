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
    pl.imageProcessingEnabled = true;   // tonemapping ACES + exposure (leve, ok no WebGPU)
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
      console.log('[GFX] GlowLayer desligado no WebGPU (highlights estoura limite de 16 varyings)');
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

    // nitidez: render na resolução nativa
    try { this.engine.setHardwareScalingLevel(1 / (window.devicePixelRatio || 1) <= 0.5 ? 0.5 : 1); } catch (_) {}

    console.log(`[GFX] ✨ pós-processamento: ${window._webgpu ? 'ACES+FXAA (WebGPU: bloom/glow/CA OFF)' : 'Bloom+ACES+FXAA+Glow+CA'}${this.ssao ? '+SSAO' : ''}`);
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
    this.pipeline = this.ssao = this.ssr = this.glow = null;
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
    ip.exposure = 0.82 + dayF * 0.19;      // noite ~0.82, meio-dia ~1.01 (valor F8)
    if (this.pipeline) this.pipeline.bloomWeight = 0.12 + dayF * 0.10;   // bloom contido
  }
}
