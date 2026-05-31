// ─────────────────────────────────────────────────────────────────
//  ThumbnailGen — gera miniaturas (PNG base64) dos assets GLB
//
//  Carrega o GLB longe da cena, enquadra numa câmera dedicada, renderiza
//  num RenderTargetTexture off-screen, lê os pixels e devolve um dataURL.
//  Sem aparecer na tela do jogo. Usado em lote pela Biblioteca.
// ─────────────────────────────────────────────────────────────────
export class ThumbnailGen {
  constructor(scene) {
    this.scene = scene;
    this.size  = 160;
    this._far  = new BABYLON.Vector3(100000, 100000, 100000);

    this.cam = new BABYLON.FreeCamera('_thumbCam', this._far.clone(), scene);
    this.cam.minZ = 0.01;
    this.cam.maxZ = 5000;

    this.light = new BABYLON.HemisphericLight('_thumbLight', new BABYLON.Vector3(0.3, 1, 0.5), scene);
    this.light.intensity = 1.15;
    this.light.specular  = new BABYLON.Color3(0.2, 0.2, 0.2);
  }

  // ── Resolve a URL pra algo carregável ────────────────────────────
  async _resolve(url) {
    if (/^https?:/.test(url)) {
      try {
        const proxy = `http://127.0.0.1:3099/proxy-image?url=${encodeURIComponent(url)}`;
        const r = await fetch(proxy, { signal: AbortSignal.timeout(60000) });
        if (r.ok) return { folder: '', file: URL.createObjectURL(await r.blob()), ext: '.glb' };
      } catch (_) {}
    }
    if (url.startsWith('blob:')) return { folder: '', file: url, ext: '.glb' };
    const enc = p => p.split('/').map(s => encodeURIComponent(s)).join('/');
    const i = url.lastIndexOf('/');
    return { folder: enc(url.substring(0, i + 1)), file: encodeURIComponent(url.substring(i + 1)), ext: undefined };
  }

  /** Gera a miniatura de um GLB → dataURL PNG (ou null) */
  async generate(glbUrl) {
    if (!glbUrl) return null;
    const ld = await this._resolve(glbUrl);
    let meshes = null;
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync('', ld.folder, ld.file, this.scene, null, ld.ext);
      meshes = res.meshes;
    } catch (e) {
      console.warn('[ThumbnailGen] load falhou:', e.message);
      return null;
    }

    const root = meshes[0];
    root.position.copyFrom(this._far);
    root.computeWorldMatrix(true);

    // Enquadra
    const bb     = root.getHierarchyBoundingVectors(true);
    const center = bb.min.add(bb.max).scale(0.5);
    const size   = bb.max.subtract(bb.min);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    const dir = new BABYLON.Vector3(0.9, 0.65, 0.9).normalize();
    this.cam.position = center.add(dir.scale(radius * 3.0));
    this.cam.setTarget(center);

    // Deixa as texturas do GLB carregarem antes de renderizar
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));

    const rtt = new BABYLON.RenderTargetTexture('_thumbRTT', this.size, this.scene, false);
    rtt.renderList   = meshes.filter(m => m.getTotalVertices?.() > 0);
    rtt.activeCamera = this.cam;
    rtt.clearColor   = new BABYLON.Color4(0.06, 0.07, 0.13, 1);

    let dataURL = null;
    try {
      rtt.render();
      const pixels = await rtt.readPixels();
      dataURL = this._toDataURL(pixels, this.size);
    } catch (e) {
      console.warn('[ThumbnailGen] render falhou:', e.message);
    }

    rtt.dispose();
    meshes.forEach(m => { try { m.dispose(); } catch (_) {} });
    return dataURL;
  }

  _toDataURL(pixels, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    // readPixels vem bottom-up → inverte o Y
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      const dst = y * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), dst);
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
}
