// ─────────────────────────────────────────────────────────────────
//  LoadingScreenSkin — galeria de backgrounds trocáveis pra tela de
//  loading (estilo "loading skins" de inventário).
//
//  - Persistência: localStorage (depois supabase pra cross-device)
//  - 7 wallpapers CC0 baixados de Unsplash em assets/br/wallpapers
//  - User abre galeria via UI (Inventário > Loading Skins) e clica.
//  - Skin ativa aplicada no LoadingOverlay (já existe em FlowGuard).
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'transfps_loading_skin';

export const LOADING_SKINS = [
  { id: 'default', name: 'Padrão', url: null, color: '#0a1230' },
  { id: 'cyber1', name: 'Neon City', url: 'assets/br/wallpapers/cyber1.jpg' },
  { id: 'cyber3', name: 'Skyline', url: 'assets/br/wallpapers/cyber3.jpg' },
  { id: 'cyber4', name: 'Future Hall', url: 'assets/br/wallpapers/cyber4.jpg' },
  { id: 'cyber5', name: 'Glow Streets', url: 'assets/br/wallpapers/cyber5.jpg' },
  { id: 'cyber6', name: 'Synthwave', url: 'assets/br/wallpapers/cyber6.jpg' },
  { id: 'cyber7', name: 'Tower', url: 'assets/br/wallpapers/cyber7.jpg' },
  { id: 'cyber8', name: 'Rain Tokyo', url: 'assets/br/wallpapers/cyber8.jpg' },
];

export function getActiveSkin() {
  const id = localStorage.getItem(STORAGE_KEY) || 'cyber1';
  return LOADING_SKINS.find(s => s.id === id) || LOADING_SKINS[0];
}

export function setActiveSkin(id) {
  if (!LOADING_SKINS.find(s => s.id === id)) return false;
  localStorage.setItem(STORAGE_KEY, id);
  // Re-aplica no overlay existente, se aberto
  applyToOverlay(document.getElementById('loading-overlay'));
  return true;
}

export function applyToOverlay(el) {
  if (!el) return;
  const skin = getActiveSkin();
  if (skin.url) {
    el.style.background = `linear-gradient(rgba(2,3,10,0.7),rgba(2,3,10,0.85)), url('${skin.url}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  } else {
    el.style.background = `radial-gradient(circle at center,${skin.color || '#0a1230'},#02030a)`;
  }
}

// ── Painel de galeria (tecla I = Inventário tem aba) ──────────
export class LoadingSkinGallery {
  constructor() {
    this._open = false;
    this._build();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) this.close();
    });
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'loading-skin-gallery';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:170; width:640px; max-width:92vw;
      background:linear-gradient(180deg,#0a1a2a,#040810);
      border:1px solid rgba(126,239,196,0.5); border-radius:8px;
      padding:22px; color:#dff5ff; font:600 12px 'Segoe UI',monospace;
      display:none; box-shadow:0 0 30px rgba(0,0,0,0.7);
    `;
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
        <span style="font:800 16px monospace; letter-spacing:3px; color:#2effb6;">🖼 TELAS DE LOADING</span>
        <span id="lsg-close" style="cursor:pointer; opacity:0.6;">✕</span>
      </div>
      <div id="lsg-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; max-height:60vh; overflow-y:auto;"></div>
      <div style="margin-top:14px; opacity:0.55; font-size:10px;">
        Wallpapers cortesia Unsplash (licença Unsplash, uso livre). Atribuição aos fotógrafos em <code>CREDITS.md</code>.
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._grid = el.querySelector('#lsg-grid');
    el.querySelector('#lsg-close').onclick = () => this.close();
  }
  open() {
    this._open = true;
    this._el.style.display = 'block';
    this._render();
  }
  close() { this._open = false; this._el.style.display = 'none'; }
  toggle() { this._open ? this.close() : this.open(); }
  _render() {
    const active = getActiveSkin();
    this._grid.innerHTML = LOADING_SKINS.map(s => {
      const isActive = s.id === active.id;
      const preview = s.url
        ? `background:url('${s.url}') center/cover;`
        : `background:radial-gradient(circle,${s.color || '#0a1230'},#02030a);`;
      return `
        <div data-skin="${s.id}" style="
          aspect-ratio:16/9; ${preview}
          border:2px solid ${isActive ? '#2effb6' : 'rgba(255,255,255,0.1)'};
          border-radius:6px; cursor:pointer; position:relative;
          transition:transform 0.15s, border 0.2s;
          box-shadow:${isActive ? '0 0 14px #2effb6' : 'none'};
        ">
          <div style="position:absolute; bottom:0; left:0; right:0;
                      background:linear-gradient(transparent,rgba(0,0,0,0.85));
                      padding:6px 8px; color:#fff; font-size:11px; font-weight:700;">
            ${s.name} ${isActive ? '<span style="color:#2effb6;">✓ ATIVA</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
    this._grid.querySelectorAll('[data-skin]').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-skin');
        setActiveSkin(id);
        this._render();
        // toast feedback
        const t = document.createElement('div');
        t.textContent = '✓ skin trocada';
        t.style.cssText = `position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
                           z-index:200;background:#2effb6;color:#04101a;padding:6px 14px;
                           border-radius:4px;font:800 11px monospace;opacity:0;transition:opacity 0.2s;`;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 1500);
      };
      el.onmouseenter = () => { el.style.transform = 'scale(1.03)'; };
      el.onmouseleave = () => { el.style.transform = 'scale(1)'; };
    });
  }
}
