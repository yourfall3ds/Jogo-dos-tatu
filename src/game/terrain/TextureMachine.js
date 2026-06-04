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

// MODELO: Nano Banana NORMAL (rápido e barato). NÃO usar o 'pro' (Nano Banana 2/Pro)
// — é mais lento e caro. A edge function só vai pro Pro se o slug tiver 'pro'.
const NANO_BANANA_MODEL = 'google/nano-banana';

function _rand() { return 'tex_' + Math.random().toString(36).slice(2, 10); }

// Estilo → sufixo de qualidade do prompt.
const STYLE_SUFFIX = {
  realista:   'photorealistic, physically based (PBR), 4k, highly detailed',
  estilizado: 'stylized, hand-painted, clean game art, vibrant',
};
// Presets de material (rótulo PT → termo em inglês p/ melhor resultado no modelo).
const TEX_PRESETS = [
  ['Pedra', 'stone'], ['Paralelepípedo', 'cobblestone'], ['Terra', 'cracked dry earth'],
  ['Grama', 'grass and dirt'], ['Areia', 'sand dunes'], ['Madeira', 'wooden planks'],
  ['Metal sci-fi', 'sci-fi metal hull panels with rivets'], ['Lava', 'lava rock with glowing cracks'],
  ['Neve', 'fresh snow'], ['Musgo', 'mossy rock'], ['Tijolo', 'red brick wall'], ['Gelo', 'cracked ice'],
];

/** Monta o prompt FINAL pra textura de jogo a partir do material que o usuário
 *  digitou — garante seamless/tileable, top-down, sem sombra "queimada", PBR.
 *  É isso que faz sair uma textura USÁVEL (não um quadro/cena). */
export function buildTexturePrompt(material, style = 'realista') {
  const base = (material || '').trim() || 'stone';
  const s = STYLE_SUFFIX[style] || STYLE_SUFFIX.realista;
  return `seamless tileable texture of ${base}, top-down orthographic view, flat even lighting, `
       + `no shadows, no highlights, no perspective, fills the entire frame edge-to-edge, ${s}`;
}

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
      body: { mode: 'generate', prompt, model: NANO_BANANA_MODEL, output_format: 'png', image_size: '1:1' },
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
  async save(name, prompt, srcUrl) {
    const supa = await getSupabase();
    const { data: sess } = await supa.auth.getSession();
    const uid = sess?.session?.user?.id;
    if (!uid) { window._dbg?.('textura NÃO salvou: sem login', '#ff5050'); return null; }
    const id = _rand();
    let url = srcUrl;
    const w = await WasabiHosting.saveFromUrl(srcUrl, id + '.png', 'image/png');
    if (w) url = w;
    if (!url || /^(blob:|data:)/.test(url)) { window._dbg?.('textura NÃO salvou: upload falhou', '#ff5050'); return null; }
    name = (name || 'textura').slice(0, 40);
    const { error } = await supa.schema('transfps').from('textures').insert({ id, owner_id: uid, name, prompt, url });
    if (error) { window._dbg?.('textura NÃO salvou (Supabase): ' + error.message, '#ff5050'); return null; }
    return { id, name, url, prompt };
  },

  /** Realtime: nova textura criada por qualquer player → callback. */
  async subscribe(onInsert) {
    try {
      const supa = await getSupabase();
      try { const { data } = await supa.auth.getSession(); const tok = data?.session?.access_token; if (tok) supa.realtime.setAuth(tok); } catch (_) {}
      supa.channel('transfps_textures')
        .on('postgres_changes', { event: 'INSERT', schema: 'transfps', table: 'textures' }, () => { try { onInsert?.(); } catch (_) {} })
        .subscribe((s) => { if (s === 'SUBSCRIBED') console.log('[Textures] 🌍 realtime ATIVO'); });
    } catch (_) {}
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
    // Realtime: textura nova de qualquer player aparece na biblioteca ao vivo.
    try { TextureStore.subscribe(() => { if (this._panel?.style.display !== 'none') this._refreshGallery(); }); } catch (_) {}
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
      <div style="color:#b9d;font:500 11px monospace;margin-bottom:4px;">Material (clique ou digite):</div>
      <div id="tx-presets" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>
      <input id="tx-prompt" placeholder="ex.: pedra, tijolo, terra rachada, metal…"
             style="width:100%;padding:7px 9px;background:rgba(0,0,0,0.5);border:1px solid #75a;color:#fff;border-radius:6px;font:inherit;">
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="tx-style" data-s="realista"   style="flex:1;padding:5px;border-radius:6px;border:1px solid #75a;background:rgba(120,60,160,0.9);color:#fff;font:600 11px monospace;cursor:pointer;">Realista</button>
        <button class="tx-style" data-s="estilizado" style="flex:1;padding:5px;border-radius:6px;border:1px solid #75a;background:rgba(40,30,55,0.8);color:#cbd;font:600 11px monospace;cursor:pointer;">Estilizado</button>
      </div>
      <button id="tx-gen" style="width:100%;margin-top:8px;background:rgba(120,60,160,0.95);color:#fff;border:none;
              border-radius:6px;padding:8px;font:700 12px monospace;cursor:pointer;">⚡ Gerar textura (Nano Banana)</button>
      <div id="tx-status" style="margin-top:6px;color:#a9c;font:500 11px monospace;min-height:14px;"></div>
      <label style="display:block;margin:8px 0 2px;">Relevo (normal map) <span id="tx-bump-v">100</span>%</label>
      <input id="tx-bump" type="range" min="0" max="200" step="10" value="100" style="width:100%;">
      <label style="display:block;margin:6px 0 2px;">Tamanho do azulejo <span id="tx-tile-v">4</span>m</label>
      <input id="tx-tile" type="range" min="1" max="16" step="1" value="4" style="width:100%;">
      <div style="margin-top:8px;color:#b9d;">Biblioteca (clique p/ aplicar no chão):</div>
      <div id="tx-gallery" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:6px;max-height:200px;overflow:auto;"></div>`;
    document.body.appendChild(el);
    this._panel = el;
    this._prompt = el.querySelector('#tx-prompt');
    this._status = el.querySelector('#tx-status');
    this._gallery = el.querySelector('#tx-gallery');
    this._bump = el.querySelector('#tx-bump');
    this._tile = el.querySelector('#tx-tile');
    this._style = 'realista';

    const bumpV = el.querySelector('#tx-bump-v');
    this._bump.oninput = () => { bumpV.textContent = this._bump.value; };
    const tileV = el.querySelector('#tx-tile-v');
    this._tile.oninput = () => { tileV.textContent = this._tile.value; };

    // Presets de material → preenche o input
    const pres = el.querySelector('#tx-presets');
    for (const [label, term] of TEX_PRESETS) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `background:rgba(45,30,60,0.8);color:#dbf;border:1px solid #63a;border-radius:5px;
        padding:3px 7px;font:600 10px monospace;cursor:pointer;`;
      b.onclick = () => { this._prompt.value = term; };
      pres.appendChild(b);
    }
    // Estilo (realista/estilizado)
    el.querySelectorAll('.tx-style').forEach((b) => {
      b.onclick = () => {
        this._style = b.dataset.s;
        el.querySelectorAll('.tx-style').forEach((x) => {
          const on = x.dataset.s === this._style;
          x.style.background = on ? 'rgba(120,60,160,0.9)' : 'rgba(40,30,55,0.8)';
          x.style.color = on ? '#fff' : '#cbd';
        });
      };
    });
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
    const material = (this._prompt.value || '').trim();
    if (!material) { this._status.textContent = 'escolha/digite um material'; return; }
    // Auto-monta o prompt de TEXTURA (seamless/tileable/top-down/PBR) — o usuário
    // só diz o material; a máquina cuida do resto pra sair uma textura usável.
    const prompt = buildTexturePrompt(material, this._style);
    this._status.textContent = '⏳ gerando… (pode levar até ~1min)';
    try {
      const rawUrl = await TextureStore.generate(prompt);
      this._status.textContent = '💾 salvando na nuvem…';
      const tex = await TextureStore.save(material, prompt, rawUrl);
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
      const bump = (this._bump ? +this._bump.value : 100) / 100;
      const tile = this._tile ? +this._tile.value : 4;
      this.terrain.setGroundTexture(url, { bump, tile });
      // persiste no mundo (todos veem) — import dinâmico do store do terreno
      import('./TerrainSystem.js').then(({ TerrainStore }) => TerrainStore.saveTextureUrl(url)).catch(() => {});
      this._status.textContent = '✅ aplicada no chão (salva pra todos)';
    } catch (e) { this._status.textContent = '❌ ' + (e?.message || 'erro ao aplicar'); }
  }

  dispose() { try { this._btn?.remove(); this._panel?.remove(); } catch (_) {} }
}
