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
    ip.exposure = 0.95;
    ip.contrast = 1.1;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.2;
    ip.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);

    // ── DefaultRenderingPipeline: FXAA + Bloom + sharpen + grão ──────
    const pl = new BABYLON.DefaultRenderingPipeline('mainPipeline', true, scene, [cam]);
    pl.samples = 4;                 // MSAA
    pl.fxaaEnabled = true;
    pl.bloomEnabled = true;
    pl.bloomThreshold = 0.92;     // só estoura o que é MUITO brilhante (sol)
    pl.bloomWeight = 0.18;
    pl.bloomKernel = 48;
    pl.bloomScale = 0.5;
    pl.imageProcessingEnabled = true;
    pl.sharpenEnabled = true;
    pl.sharpen.edgeAmount = 0.20;
    pl.grainEnabled = true;
    pl.grain.intensity = 4;
    pl.grain.animated = true;
    this.pipeline = pl;

    // ── SSAO2: oclusão de ambiente (profundidade nos contatos) ───────
    try {
      const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [cam]);
      ssao.radius = 1.2;
      ssao.totalStrength = 1.1;
      ssao.expensiveBlur = true;
      ssao.samples = 16;
      ssao.maxZ = 120;
      this.ssao = ssao;
    } catch (e) { console.warn('[GFX] SSAO2 indisponível:', e?.message); }

    // ── GlowLayer: brilho dos emissivos (sol, neon, plasma) ──────────
    try {
      const glow = new BABYLON.GlowLayer('glow', scene, { mainTextureSamples: 2 });
      glow.intensity = 0.55;
      this.glow = glow;
    } catch (_) {}

    // nitidez: render na resolução nativa
    try { this.engine.setHardwareScalingLevel(1 / (window.devicePixelRatio || 1) <= 0.5 ? 0.5 : 1); } catch (_) {}

    console.log('[GFX] ✨ pós-processamento ligado (Bloom+ACES+SSAO+FXAA+Glow)');
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
      pl.bloomEnabled = true; pl.grainEnabled = false; pl.sharpenEnabled = true; pl.samples = 2;
      this.engine.setHardwareScalingLevel(1);
    } else { // alto
      pl.bloomEnabled = true; pl.grainEnabled = true; pl.sharpenEnabled = true; pl.samples = 4;
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
    console.log(`[GFX] sombras: ${cenario.length} superfícies, luzes FX isoladas`);
  }

  // Ajusta exposure/bloom conforme a hora (chamado pelo DayNightCycle)
  setDayFactor(dayF) {
    const ip = this.scene.imageProcessingConfiguration;
    ip.exposure = 0.75 + dayF * 0.30;      // noite escura, dia ~1.05
    if (this.pipeline) this.pipeline.bloomWeight = 0.15 + dayF * 0.15;
  }
}
