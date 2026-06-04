// ─────────────────────────────────────────────────────────────────
//  TextureMachine — gera TEXTURAS por IA (Kie / Nano Banana) e aplica/salva.
//
//  Fluxo (reusa edge functions existentes — NÃO precisa criar nova):
//   1) kie-nano-banana  → cria task (model google/nano-banana) → taskId
//   2) kie-record-info  → poll até a imagem ficar pronta → URL
//   3) WasabiHosting.saveFromUrl → hospeda no Wasabi (URL estável)
//   4) transfps.textures (Supabase) → registro GLOBAL (todos veem)
//   5) aplica no chão (terrain.setGroundTexture) e salva terrain.texture_url
//
//  v1: aplica no CHÃO. Aplicar em itens específicos + sync por-item = próxima fase.
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';
import { WasabiHosting } from '../data/WasabiHosting.js';

function _rand() { return 'tex_' + Math.random().toString(36).slice(2, 10); }

// Extrai a URL da imagem do recordInfo do Kie (formato varia).
function _extractUrl(info) {
  if (!info) return null;
  try {
    if (Array.isArray(info.resultUrls) && info.resultUrls[0]) return info.resultUrls[0];
    const rj = info.resultJson ?? info.result ?? info.response;
    if (typeof rj === 'string') {
      const p = JSON.parse(rj);
      if (p?.resultUrls?.[0]) return p.resultUrls[0];
      if (p?.resultUrl) return p.resultUrl;
      if (p?.imageUrl) return p.imageUrl;
    } else if (rj && typeof rj === 'object') {
      if (rj.resultUrls?.[0]) return rj.resultUrls[0];
      if (rj.resultUrl) return rj.resultUrl;
    }
    if (info.imageUrl) return info.imageUrl;
  } catch (_) {}
  return null;
}

export const TextureStore = {
  /** Gera uma textura por prompt. Retorna a URL CRUA do Kie (a hospedar). */
  async generate(prompt) {
    const supa = await getSupabase();
    const { data: t, error: e1 } = await supa.functions.invoke('kie-nano-banana', {
      body: { mode: 'generate', prompt, model: 'google/nano-banana', output_format: 'png', image_size: '1:1' },
    });
    if (e1 || !t?.taskId) throw new Error(e1?.message || t?.error || 'falha ao iniciar geração');
    const taskId = t.taskId;
    // poll ~ até 2min
    for (let i = 0; i < 48; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const { data: info } = await supa.functions.invoke('kie-record-info', { body: { taskId } });
      const url = _extractUrl(info);
      if (url) return url;
      const state = String(info?.state ?? info?.status ?? '').toLowerCase();
      if (state.includes('fail') || info?.failCode || info?.errorCode) throw new Error('geração falhou no Kie');
    }
    throw new Error('timeout na geração (>2min)');
  },

  /** Hospeda no Wasabi + registra global. Retorna { id, name, url, prompt }. */
  async save(prompt, srcUrl) {
    const supa = await getSupabase();
    const { data: sess } = await supa.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (!uid) { window._dbg?.('textura NÃO salvou: sem login', '#ff5050'); return null; }
    const id = _rand();
    let url = srcUrl;
    const w = await WasabiHosting.saveFromUrl(srcUrl, id + '.png', 'image/png');
    if (w) url = w;
    if (!url || /^(blob:|data:)/.test(url)) { window._dbg?.('textura NÃO salvou: upload falhou', '#ff5050'); return null; }
    const name = (prompt || 'textura').slice(0, 40);
    const { error } = await supa.schema('transfps').from('textures').insert({ id, owner_id: uid, name, prompt, url });
    if (error) { window._dbg?.('textura NÃO salvou (Supabase): ' + error.message, '#ff5050'); return null; }
    return { id, name, url, prompt };
  },

  /** Lista as texturas globais (todos veem). */
  async list() {
    try {
      const supa = await getSupabase();
      const { data } = await supa.schema('transfps').from('textures')
        .select('id,name,url,prompt,created_at').order('created_at', { ascending: false }).limit(60);
      return data || [];
    } catch (_) { return []; }
  },
};

// ── UI da máquina de texturas ─────────────────────────────────────
export class TextureMachineUI {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;   // pra "aplicar no chão"
    this._build();
  }

  _build() {
    const btn = document.createElement('button');
    btn.textContent = '🎨 Texturas';
    btn.style.cssText = `position:fixed;top:96px;left:120px;z-index:90;background:rgba(28,20,34,0.85);
      color:#e9d;border:1px solid #a6c;border-radius:8px;padding:6px 10px;font:700 12px 'Segoe UI',monospace;cursor:pointer;`;
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);
    this._btn = btn;

    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:130px;left:120px;z-index:90;display:none;width:300px;
      background:rgba(16,12,20,0.94);border:1px solid #85a;border-radius:10px;padding:12px;color:#ecd;font:600 12px 'Segoe UI',monospace;`;
    el.innerHTML = `
      <div style="font-weight:800;color:#d9f;margin-bottom:8px;">🎨 MÁQUINA DE TEXTURAS</div>
      <input id="tx-prompt" placeholder="ex.: tijolo medieval sem emendas, top-down"
             style="width:100%;padding:7px 9px;background:rgba(0,0,0,0.5);border:1px solid #75a;color:#fff;border-radius:6px;font:inherit;">
      <button id="tx-gen" style="width:100%;margin-top:8px;background:rgba(120,60,160,0.9);color:#fff;border:none;
              border-radius:6px;padding:8px;font:700 12px monospace;cursor:pointer;">Gerar textura (Nano Banana)</button>
      <div id="tx-status" style="margin-top:6px;color:#a9c;font:500 11px monospace;min-height:14px;"></div>
      <div style="margin-top:8px;color:#b9d;">Biblioteca (clique p/ aplicar no chão):</div>
      <div id="tx-gallery" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:6px;max-height:240px;overflow:auto;"></div>`;
    document.body.appendChild(el);
    this._panel = el;
    this._prompt = el.querySelector('#tx-prompt');
    this._status = el.querySelector('#tx-status');
    this._gallery = el.querySelector('#tx-gallery');
    el.querySelector('#tx-gen').onclick = () => this._onGenerate();
  }

  toggle() {
    const on = this._panel.style.display === 'none';
    this._panel.style.display = on ? 'block' : 'none';
    this._btn.style.background = on ? 'rgba(120,60,160,0.95)' : 'rgba(28,20,34,0.85)';
    if (on) { try { window._gameInput?.deactivate?.(); document.exitPointerLock?.(); } catch (_) {} this._refreshGallery(); }
    else { try { window._gameInput?.activate?.(); } catch (_) {} }
  }

  async _onGenerate() {
    const prompt = (this._prompt.value || '').trim();
    if (!prompt) { this._status.textContent = 'digite um prompt'; return; }
    this._status.textContent = '⏳ gerando… (pode levar até ~1min)';
    try {
      const rawUrl = await TextureStore.generate(prompt);
      this._status.textContent = '💾 salvando na nuvem…';
      const tex = await TextureStore.save(prompt, rawUrl);
      if (!tex) { this._status.textContent = '❌ falhou ao salvar (veja o chat)'; return; }
      this._status.textContent = '✅ pronto! clique na miniatura pra aplicar no chão.';
      this._refreshGallery();
    } catch (e) {
      this._status.textContent = '❌ ' + (e?.message || 'erro');
      window._dbg?.('textura erro: ' + (e?.message || e), '#ff5050');
    }
  }

  async _refreshGallery() {
    const list = await TextureStore.list();
    this._gallery.innerHTML = '';
    for (const t of list) {
      const img = document.createElement('img');
      img.src = t.url;
      img.title = t.name || t.prompt || '';
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:5px;border:1px solid #527;cursor:pointer;';
      img.onclick = () => this._applyToTerrain(t.url);
      this._gallery.appendChild(img);
    }
    if (!list.length) this._gallery.innerHTML = '<div style="grid-column:1/5;color:#869;">vazio — gere uma textura</div>';
  }

  _applyToTerrain(url) {
    if (!this.terrain) return;
    try {
      this.terrain.setGroundTexture(url);
      // persiste no mundo (todos veem) — import dinâmico do store do terreno
      import('./TerrainSystem.js').then(({ TerrainStore }) => TerrainStore.saveTextureUrl(url)).catch(() => {});
      this._status.textContent = '✅ aplicada no chão (salva pra todos)';
    } catch (e) { this._status.textContent = '❌ ' + (e?.message || 'erro ao aplicar'); }
  }

  dispose() { try { this._btn?.remove(); this._panel?.remove(); } catch (_) {} }
}
