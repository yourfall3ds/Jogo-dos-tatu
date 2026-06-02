// ─────────────────────────────────────────────────────────────────
//  CharacterSelectUI — seletor de personagem (player) — tecla P
//
//  Lista modelos jogáveis. Clicar troca o player via CharacterSwapper.
//  Mostra a taxa de compatibilidade de rig (✓ joga / ⚠ parcial / ✗ T-pose)
//  pra você ver na hora se um GLB funciona com as animações.
//
//  Modelos: o player biped padrão (compatível) + os Digimons do catálogo
//  (rig próprio → provavelmente T-pose, marcados como experimentais).
// ─────────────────────────────────────────────────────────────────
import { EnemyCatalog } from '../data/EnemyCatalog.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

const PLAYER_BIPED = 'assets/itens 3d/Animations-meshy/Meshy_AI_Faça_um_rato_mistura_biped_Character_output.glb';

// Modelos jogáveis COMPATÍVEIS (rig biped Meshy → todas as anims funcionam).
const COMPAT_MODELS = [
  { name: '🐭 Rato (padrão)', url: PLAYER_BIPED },
  { name: '🐉 AzureFin',      url: 'assets/characters/azurefin.glb' },
];

export class CharacterSelectUI {
  constructor(swapper) {
    this.swapper = swapper;
    this._visible = false;
    this._wasP = false;
    this._build();
  }

  _models() {
    // Modelos compatíveis (rig biped) — jogam normal
    const list = COMPAT_MODELS.map(m => ({ ...m, compat: 'ok' }));
    // Digimons do catálogo (experimental — rig do rip)
    for (const [id, def] of Object.entries(EnemyCatalog)) {
      const raw = AssetRegistry.path(def.category, def.asset);
      if (!raw) continue;
      const tier = { rookie:'🥚', champion:'⭐', ultimate:'🌟', mega:'💫', boss:'👑' }[def.tier] || '👾';
      list.push({ name: `${tier} ${def.name}`, url: raw, compat: 'exp' });
    }
    return list;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'charsel-ui';
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:80', 'display:none',
      'background:rgba(6,8,16,0.82)', 'backdrop-filter:blur(4px)',
      'align-items:center', 'justify-content:center', 'flex-direction:column',
      'font-family:system-ui,sans-serif', 'color:#fff',
    ].join(';');
    el.innerHTML = `
      <div style="font:700 22px system-ui;margin-bottom:4px">Escolher Personagem</div>
      <div style="color:#8af;font-size:12px;margin-bottom:14px">✓ joga normal · ⚠ rig experimental (pode ficar em T-pose) · [P] fecha</div>
      <div id="charsel-grid" style="display:grid;grid-template-columns:repeat(4,150px);gap:10px;max-height:62vh;overflow:auto;padding:6px"></div>
      <div id="charsel-status" style="margin-top:12px;font-size:13px;color:#ffd34d;height:18px"></div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._grid = el.querySelector('#charsel-grid');
    this._status = el.querySelector('#charsel-status');
  }

  _render() {
    this._grid.innerHTML = '';
    for (const m of this._models()) {
      const card = document.createElement('button');
      const badge = m.compat === 'ok' ? '<span style="color:#5cdd5c">✓ compatível</span>'
                                      : '<span style="color:#ffb347">⚠ experimental</span>';
      card.style.cssText = [
        'background:rgba(20,26,44,.9)', 'border:1.5px solid #2f4a8f', 'border-radius:10px',
        'color:#dde', 'padding:14px 8px', 'cursor:pointer', 'font:600 13px system-ui',
        'display:flex', 'flex-direction:column', 'gap:6px', 'transition:.12s',
      ].join(';');
      card.innerHTML = `<div style="font-size:15px">${m.name}</div><div style="font-size:10px">${badge}</div>`;
      card.onmouseenter = () => card.style.borderColor = '#5c8fff';
      card.onmouseleave = () => card.style.borderColor = '#2f4a8f';
      card.onclick = async () => {
        this._status.textContent = 'Trocando…';
        const r = await this.swapper.swap(m.url);
        if (!r.ok) { this._status.textContent = '❌ ' + (r.warning || 'falhou'); return; }
        if (r.warning) {
          this._status.innerHTML = `⚠ ${m.name}: ${r.animsOk}/${r.animsTotal} animações. ${r.warning}`;
        } else {
          this._status.innerHTML = `✅ ${m.name} equipado! (${r.animsOk}/${r.animsTotal} anims)`;
          setTimeout(() => this.hide(), 700);
        }
      };
      this._grid.appendChild(card);
    }
  }

  show() {
    this._visible = true;
    this._el.style.display = 'flex';
    this._status.textContent = '';
    this._render();
    window._gameInput?.deactivate?.();
    document.body.classList.remove('game-active');
  }
  hide() {
    this._visible = false;
    this._el.style.display = 'none';
    window._gameInput?.activate?.();
  }
  toggle() { this._visible ? this.hide() : this.show(); }

  update() {
    const k = window._gameInput?.isDown?.('KeyP');
    if (k && !this._wasP) this.toggle();
    this._wasP = k;
  }
}
