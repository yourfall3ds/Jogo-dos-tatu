// ─────────────────────────────────────────────────────────────────
//  GraphicsDebugPanel — painel ao vivo pra calibrar o visual (tecla F8)
//
//  Sliders/toggles pra exposure, contraste, bloom, vinheta, SSAO, sombra
//  (darkness/bias/normalBias), hora do dia e luz do sol. Ajuste em jogo,
//  veja o resultado, e os valores ficam exibidos pra fixar no código.
//
//  Uso: new GraphicsDebugPanel(gfx, dayNight, shadowGen, scene)
//       update() no loop (lê a tecla F8).
// ─────────────────────────────────────────────────────────────────

export class GraphicsDebugPanel {
  constructor(gfx, dayNight, shadowGen, scene) {
    this.gfx = gfx;
    this.dayNight = dayNight;
    this.sg = shadowGen;
    this.scene = scene;
    this.sun = scene.getLightByName('sun');
    this._visible = false;
    this._wasKey = false;
    this._build();
  }

  _row(label, min, max, step, val, on) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin:3px 0;font:12px system-ui';
    const lbl = document.createElement('span'); lbl.textContent = label;
    lbl.style.cssText = 'width:120px;color:#bcd';
    const range = document.createElement('input'); range.type='range';
    range.min=min; range.max=max; range.step=step; range.value=val; range.style.flex='1';
    const num = document.createElement('span'); num.textContent=(+val).toFixed(3);
    num.style.cssText='width:54px;color:#9fe;text-align:right;font-variant-numeric:tabular-nums';
    range.oninput = () => { const v = parseFloat(range.value); num.textContent = v.toFixed(3); on(v); };
    wrap.append(lbl, range, num);
    return wrap;
  }

  _toggle(label, val, on) {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;font:12px system-ui;color:#bcd;cursor:pointer';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=val;
    cb.onchange = () => on(cb.checked);
    wrap.append(cb, document.createTextNode(label));
    return wrap;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'gfx-debug-panel';
    el.style.cssText = [
      'position:fixed','top:50px','right:12px','z-index:90','width:340px','display:none',
      'background:rgba(8,10,18,0.94)','border:1px solid #2a3a6a','border-radius:10px',
      'padding:12px 14px','font-family:system-ui,sans-serif','color:#dde','max-height:88vh','overflow:auto',
    ].join(';');

    const h = document.createElement('div');
    h.innerHTML = '<b style="font-size:14px">🎛️ Gráficos (F8)</b><div style="font-size:10px;color:#789;margin:2px 0 8px">ajuste e me diga os valores bons</div>';
    el.append(h);

    const ip = this.scene.imageProcessingConfiguration;
    const pl = this.gfx.pipeline;

    // — Câmera / tonemapping —
    el.append(this._sec('☀️ Exposição & cor'));
    el.append(this._row('Exposure', 0.2, 2, 0.01, ip.exposure, v => { ip.exposure = v; this.gfx._lockExposure = true; }));
    el.append(this._row('Contraste', 0.5, 2, 0.01, ip.contrast, v => ip.contrast = v));
    el.append(this._toggle('Tonemapping ACES', ip.toneMappingEnabled, v => ip.toneMappingEnabled = v));
    el.append(this._toggle('Vinheta', ip.vignetteEnabled, v => ip.vignetteEnabled = v));

    // — Bloom —
    el.append(this._sec('✨ Bloom'));
    el.append(this._toggle('Bloom ligado', pl.bloomEnabled, v => pl.bloomEnabled = v));
    el.append(this._row('Bloom threshold', 0, 1.5, 0.01, pl.bloomThreshold, v => pl.bloomThreshold = v));
    el.append(this._row('Bloom weight', 0, 1, 0.01, pl.bloomWeight, v => pl.bloomWeight = v));

    // — SSAO —
    if (this.gfx.ssao) {
      el.append(this._sec('🌑 Oclusão (SSAO)'));
      el.append(this._row('Força SSAO', 0, 3, 0.05, this.gfx.ssao.totalStrength, v => this.gfx.ssao.totalStrength = v));
      el.append(this._row('Raio SSAO', 0.1, 4, 0.05, this.gfx.ssao.radius, v => this.gfx.ssao.radius = v));
    }

    // ─── ☀️ CONTROLE COMPLETO DO SOL ───────────────────────────────
    const dn = this.dayNight, sg = this.sg;
    const reapply = () => { try { dn._apply(); } catch (_) {} };
    el.append(this._sec('☀️ SOL — controle completo'));

    // Toggle: assume o sol manualmente (congela o ciclo dia/noite)
    const manualCb = document.createElement('input'); manualCb.type='checkbox'; manualCb.checked = dn.manual;
    const manualLbl = document.createElement('label');
    manualLbl.style.cssText = 'display:flex;align-items:center;gap:6px;margin:3px 0;font:12px system-ui;color:#9fe;cursor:pointer;font-weight:600';
    manualLbl.append(manualCb, document.createTextNode('🔆 Sol MANUAL (congela ciclo)'));
    manualCb.onchange = () => { dn.setManual(manualCb.checked); this._manualHint.style.display = manualCb.checked ? 'block' : 'none'; };
    el.append(manualLbl);
    this._manualHint = document.createElement('div');
    this._manualHint.textContent = '✓ Manual ON — sliders abaixo mandam no sol e sombra.';
    this._manualHint.style.cssText = 'font:10px system-ui;color:#9fe;margin:2px 0 4px;display:' + (dn.manual ? 'block' : 'none');
    el.append(this._manualHint);

    // mexer em QUALQUER slider do sol liga o manual automaticamente
    const sunCtl = (set) => (v) => {
      if (!dn.manual) { dn.setManual(true); manualCb.checked = true; this._manualHint.style.display = 'block'; }
      set(v); reapply();
    };

    //  Ângulo
    el.append(this._row('🌗 Elevação (°)', 3, 89, 1, dn.sunElevDeg, sunCtl(v => dn.sunElevDeg = v)));
    el.append(this._row('🧭 Azimute (°)', 0, 360, 1, dn.sunAzimDeg, sunCtl(v => dn.sunAzimDeg = v)));
    //  Luz
    el.append(this._row('💡 Intensidade sol', 0, 4, 0.05, dn.sunIntensity, sunCtl(v => { dn.sunIntensity = v; this.sun.intensity = v; })));
    el.append(this._row('🌫️ Luz ambiente', 0, 1, 0.02, dn.ambientInt, sunCtl(v => dn.ambientInt = v)));

    // — Sombra —
    el.append(this._sec('🕶️ Sombra'));
    el.append(this._row('Escuridão', 0, 1, 0.01, sg.darkness, sunCtl(v => { sg.darkness = v; dn.shadowDark = v; })));
    el.append(this._row('Suavidade (penumbra)', 0, 0.2, 0.005, sg.contactHardeningLightSizeUVRatio ?? 0.06, v => { sg.contactHardeningLightSizeUVRatio = v; }));
    el.append(this._row('Alcance (maxZ)', 30, 250, 5, sg.shadowMaxZ ?? 130, v => { sg.shadowMaxZ = v; }));
    el.append(this._row('Bias', 0, 0.005, 0.00005, sg.bias, v => sg.bias = v));
    el.append(this._row('Normal bias', 0, 0.1, 0.001, sg.normalBias, v => sg.normalBias = v));

    // — ISOLAR (liga/desliga sistemas pra achar o que mata a sombra) —
    el.append(this._sec('🔬 Isolar (debug sombra)'));
    const cam = () => this.scene.activeCamera;
    const mgr = this.scene.postProcessRenderPipelineManager;
    el.append(this._toggle('☀️ SOL (luz direcional)', this.sun.intensity > 0, v => {
      if (v) { this.sun.setEnabled(true); if (this.sun.intensity === 0) this.sun.intensity = 1.5; }
      else this.sun.setEnabled(false);
    }));
    el.append(this._toggle('🌌 SkyBox (céu HD)', this.dayNight.skyDome?.isEnabled(), v => this.dayNight.skyDome?.setEnabled(v)));
    el.append(this._toggle('🎬 Pós-proc (pipeline)', !this._ppOff, v => {
      this._ppOff = !v;
      try { mgr[v ? 'attachCamerasToRenderPipeline' : 'detachCamerasFromRenderPipeline']('mainPipeline', cam()); } catch (_) {}
    }));
    if (this.gfx.ssao) el.append(this._toggle('🌑 SSAO', !this._ssaoOff, v => {
      this._ssaoOff = !v;
      try { mgr[v ? 'attachCamerasToRenderPipeline' : 'detachCamerasFromRenderPipeline']('ssao', cam()); } catch (_) {}
    }));
    el.append(this._toggle('🖼️ Image processing', this.scene.imageProcessingConfiguration.isEnabled, v => this.scene.imageProcessingConfiguration.isEnabled = v));
    el.append(this._toggle('✨ Glow layer', !!(this.gfx.glow?.isEnabled ?? true), v => { if (this.gfx.glow) this.gfx.glow.isEnabled = v; }));
    el.append(this._toggle('🌫️ Névoa', this.scene.fogMode !== 0, v => this.scene.fogMode = v ? BABYLON.Scene.FOGMODE_EXP2 : 0));
    // botão: cria pilar de teste de sombra
    const tb = document.createElement('button');
    tb.textContent = '🧱 Criar pilar de teste';
    tb.style.cssText = 'width:100%;margin:4px 0;background:#3a2a1a;border:1px solid #a73;color:#fda;border-radius:6px;padding:6px;cursor:pointer';
    tb.onclick = () => window.testShadow?.();
    el.append(tb);

    // — Hora do dia (ciclo automático) —
    el.append(this._sec('🌅 Hora do dia (ciclo auto)'));
    el.append(this._row('Hora (0-1)', 0, 1, 0.005, this.dayNight.t, v => { this.dayNight.pause(true); this.dayNight.setTime(v); }));
    // presets rápidos de hora
    const presets = document.createElement('div');
    presets.style.cssText = 'display:flex;gap:4px;margin:4px 0';
    [['🌅 amanhecer',0.22],['☀️ meio-dia',0.5],['🌇 pôr-do-sol',0.78],['🌙 noite',0.95]].forEach(([t,val])=>{
      const b=document.createElement('button'); b.textContent=t;
      b.style.cssText='flex:1;font:10px system-ui;background:#1a2440;border:1px solid #345;color:#bcd;border-radius:5px;padding:4px 2px;cursor:pointer';
      b.onclick=()=>{ this.dayNight.pause(true); this.dayNight.setTime(val); };
      presets.append(b);
    });
    el.append(presets);
    el.append(this._row('Densidade névoa', 0, 0.01, 0.0002, this.scene.fogDensity, v => this.scene.fogDensity = v));

    // botão: imprime os valores atuais no console pra eu fixar
    const btn = document.createElement('button');
    btn.textContent = '📋 Copiar valores (console)';
    btn.style.cssText = 'width:100%;margin-top:10px;background:#1a3a5a;border:1px solid #3a8;color:#9fe;border-radius:7px;padding:8px;cursor:pointer;font-weight:600';
    btn.onclick = () => this._dump();
    el.append(btn);
    this._dumpOut = document.createElement('div');
    this._dumpOut.style.cssText = 'font:10px monospace;color:#8fb;white-space:pre-wrap;margin-top:6px;word-break:break-all';
    el.append(this._dumpOut);

    document.body.appendChild(el);
    this._el = el;
  }

  _sec(t) {
    const d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'margin:10px 0 2px;font:600 12px system-ui;color:#ffd34d;border-bottom:1px solid #234;padding-bottom:2px';
    return d;
  }

  _dump() {
    const ip = this.scene.imageProcessingConfiguration, pl = this.gfx.pipeline, sg = this.sg, dn = this.dayNight;
    const txt = [
      `exposure: ${ip.exposure.toFixed(2)}`,
      `contrast: ${ip.contrast.toFixed(2)}`,
      `bloom: ${pl.bloomEnabled} thr ${pl.bloomThreshold.toFixed(2)} w ${pl.bloomWeight.toFixed(2)}`,
      this.gfx.ssao ? `ssao: str ${this.gfx.ssao.totalStrength.toFixed(2)} r ${this.gfx.ssao.radius.toFixed(2)}` : 'ssao: off',
      `--- SOL ${dn.manual ? '(MANUAL)' : '(auto)'} ---`,
      `elev: ${dn.sunElevDeg}°  azim: ${dn.sunAzimDeg}°`,
      `sunInt: ${dn.sunIntensity.toFixed(2)}  ambient: ${dn.ambientInt.toFixed(2)}`,
      `shadow: dark ${sg.darkness.toFixed(2)} penumbra ${(sg.contactHardeningLightSizeUVRatio??0).toFixed(3)} maxZ ${sg.shadowMaxZ}`,
      `bias ${sg.bias} nbias ${sg.normalBias}`,
      `fog: ${this.scene.fogDensity}  hora: ${dn.t.toFixed(3)}`,
    ].join('\n');
    this._dumpOut.textContent = txt;
    console.log('=== VALORES GFX ===\n' + txt);
  }

  update() {
    const down = !!window._gameInput?.isDown?.('F8');
    if (down && !this._wasKey) { this._visible = !this._visible; this._el.style.display = this._visible ? 'block' : 'none'; }
    this._wasKey = down;
  }
}
