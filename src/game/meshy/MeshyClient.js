// ─────────────────────────────────────────────────────────────────
//  MeshyClient — cliente da API do Meshy AI (https://docs.meshy.ai)
//
//  Pipeline de ASSET (objeto/prop):
//    1. textToImage(prompt)         → imagem (fundo cinza p/ melhor recorte)
//    2. imageTo3D(imageUrl)         → modelo 3D bruto (GLB)
//    3. remesh(taskId, target)      → retopologia (reduz polígonos)
//    4. textureModel(taskId,prompt) → texturização PBR
//
//  Pipeline de PERSONAGEM/INIMIGO (separado):
//    • textToImage com sufixo "T-pose, full body, arms and legs spread"
//    • imageTo3D
//    • rig(taskId, 'humanoid' | 'quadruped')
//    • listAnimations() + animate(taskId, animId) → baixa GLB de cada anim
//
//  Tarefas são ASSÍNCRONAS: POST cria a task → poll GET até SUCCEEDED.
//
//  CORS: chamadas vão por um PROXY no config-server (porta 3099) p/ não
//  esbarrar em CORS do browser. A API key fica só no servidor/localStorage.
// ─────────────────────────────────────────────────────────────────

export class MeshyClient {
  constructor() {
    // Proxy local (config-server) repassa pra api.meshy.ai com a key.
    this.PROXY = 'http://127.0.0.1:3099/meshy';
    // Fallback: chamada direta (precisa CORS liberado + key no browser)
    this.DIRECT = 'https://api.meshy.ai';
    this._key = null;
    this._useProxy = true;
  }

  // ── API Key ──────────────────────────────────────────────────────
  setKey(key) {
    this._key = key;
    try { localStorage.setItem('meshy_api_key', key); } catch (_) {}
  }
  getKey() {
    if (this._key) return this._key;
    try { this._key = localStorage.getItem('meshy_api_key'); } catch (_) {}
    return this._key;
  }
  hasKey() { return !!this.getKey() || this._serverHasKey === true; }

  // Pergunta ao servidor se a chave já está configurada no .env.
  // Se sim, não precisa colar nada no navegador.
  async checkServerKey() {
    try {
      const r = await fetch('http://127.0.0.1:3099/health', { signal: AbortSignal.timeout(1500) });
      const j = await r.json();
      this._serverHasKey = !!j.meshyKey;
      return this._serverHasKey;
    } catch (_) { this._serverHasKey = false; return false; }
  }

  // ── Verifica se o proxy (config-server) está online ──────────────
  async proxyOnline() {
    try {
      const r = await fetch('http://127.0.0.1:3099/health', { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch (_) { return false; }
  }

  // ── Request genérico (via proxy ou direto) ───────────────────────
  async _req(method, path, body) {
    const key = this.getKey();
    if (this._useProxy && await this.proxyOnline()) {
      // proxy: o servidor injeta a Authorization. Mandamos a key uma vez
      // via header custom pra ele guardar/usar.
      const resp = await fetch(`${this.PROXY}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Meshy-Key': key || '' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!resp.ok) throw new Error(`Meshy ${resp.status}: ${await resp.text()}`);
      return resp.json();
    }
    // direto (pode falhar por CORS)
    const resp = await fetch(`${this.DIRECT}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error(`Meshy ${resp.status}: ${await resp.text()}`);
    return resp.json();
  }

  // ── Poll de uma task até terminar ────────────────────────────────
  //  onProgress(pct, status) chamado a cada checagem.
  async _poll(getPath, onProgress, intervalMs = 4000, timeoutMs = 360000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const data = await this._req('GET', getPath);
      const status = data.status || data.state;
      const pct = data.progress ?? 0;
      onProgress?.(pct, status, data);
      if (status === 'SUCCEEDED') return data;
      if (status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED') {
        throw new Error(`Meshy task ${status}: ${data.task_error?.message || ''}`);
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Meshy task timeout');
  }

  // ════════════════════════════════════════════════════════════════
  //  PIPELINE DE ASSET (prop/objeto)
  // ════════════════════════════════════════════════════════════════

  // ── 1. Texto → Imagem ────────────────────────────────────────────
  //  enhanceSuffix: adicionado ao prompt p/ melhorar o recorte do item.
  async textToImage(prompt, { enhanceSuffix = ', solid flat gray background, centered, single object, product shot', onProgress } = {}) {
    const full = prompt + enhanceSuffix;
    const create = await this._req('POST', '/openapi/v1/text-to-image', {
      prompt: full,
      art_style: 'realistic',
      ai_model: 'meshy-4',
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/text-to-image/${id}`, onProgress);
    // retorna a(s) url(s) da imagem
    return { taskId: id, imageUrl: done.image_urls?.[0] || done.result?.[0] || done.images?.[0]?.url, raw: done };
  }

  // ── 2. Imagem → 3D ───────────────────────────────────────────────
  async imageTo3D(imageUrl, { enablePbr = true, onProgress } = {}) {
    const create = await this._req('POST', '/openapi/v1/image-to-3d', {
      image_url: imageUrl,
      enable_pbr: enablePbr,
      should_remesh: false,   // remesh manual na etapa 3
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/image-to-3d/${id}`, onProgress);
    return { taskId: id, glbUrl: done.model_urls?.glb, raw: done };
  }

  // ── 3. Retopologia (remesh) ──────────────────────────────────────
  async remesh(taskId, { targetPolycount = 8000, topology = 'quad', onProgress } = {}) {
    const create = await this._req('POST', '/openapi/v1/remesh', {
      input_task_id: taskId,
      target_polycount: targetPolycount,
      topology,
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/remesh/${id}`, onProgress);
    return { taskId: id, glbUrl: done.model_urls?.glb, raw: done };
  }

  // ── 4. Texturização PBR ──────────────────────────────────────────
  async textureModel(taskId, prompt, { onProgress } = {}) {
    const create = await this._req('POST', '/openapi/v1/text-to-texture', {
      input_task_id: taskId,
      text_style_prompt: prompt,
      enable_pbr: true,
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/text-to-texture/${id}`, onProgress);
    return { taskId: id, glbUrl: done.model_urls?.glb, raw: done };
  }

  // ════════════════════════════════════════════════════════════════
  //  PIPELINE DE PERSONAGEM/INIMIGO
  // ════════════════════════════════════════════════════════════════

  // T-pose: sufixo que força braços/pernas abertos p/ permitir rig.
  characterImagePrompt(base, type = 'humanoid') {
    const tpose = type === 'humanoid'
      ? ', full body T-pose, arms straight out to the sides, legs apart, front view, symmetric, solid gray background'
      : ', full body side view, four legs clearly separated, standing, solid gray background';
    return base + tpose;
  }

  // ── Rig (esqueleto) ──────────────────────────────────────────────
  async rig(taskId, charType = 'humanoid', { onProgress } = {}) {
    const create = await this._req('POST', '/openapi/v1/rigging', {
      input_task_id: taskId,
      character_type: charType,   // 'humanoid' | 'quadruped'
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/rigging/${id}`, onProgress);
    return { taskId: id, glbUrl: done.model_urls?.glb, raw: done };
  }

  // ── Lista de animações disponíveis ───────────────────────────────
  async listAnimations() {
    const data = await this._req('GET', '/openapi/v1/animations');
    return data.result || data.animations || [];
  }

  // ── Aplica uma animação ao modelo riggado → GLB ──────────────────
  async animate(riggedTaskId, animationId, { onProgress } = {}) {
    const create = await this._req('POST', '/openapi/v1/animations', {
      input_task_id: riggedTaskId,
      animation_id: animationId,
      format: 'glb',
    });
    const id = create.result || create.id;
    const done = await this._poll(`/openapi/v1/animations/${id}`, onProgress);
    return { taskId: id, glbUrl: done.model_urls?.glb, raw: done };
  }

  // ── Baixa um GLB pra Blob URL (importável no Babylon) ────────────
  async downloadToBlobURL(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('download falhou: ' + resp.status);
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  }
}
