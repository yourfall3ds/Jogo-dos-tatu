// ─────────────────────────────────────────────────────────────────
//  MeshyPanel — UI da "Máquina de Criação" (pipeline Meshy AI)
//
//  ASSET (prop):  Imagem → 3D → Acabamento (remesh + textura)
//  PERSONAGEM:    imagem T-pose → 3D → rig(humanoid/quadruped) → animações
//
//  Abre com a tecla J ou ao interagir (E) com a Máquina.
// ─────────────────────────────────────────────────────────────────
import { MeshyClient } from './MeshyClient.js';
import { LocalDB } from '../data/LocalDB.js';
import { AssetHosting } from '../data/AssetHosting.js';
import { WasabiHosting } from '../data/WasabiHosting.js';
import { AssetWishlist, wishlistAllItems } from './AssetWishlist.js';
import { AssetGroups, BUILTIN_GROUPS } from '../data/AssetGroups.js';

export class MeshyPanel {
  constructor(scene, buildMode) {
    this.scene = scene;
    this.buildMode = buildMode;
    this.client = new MeshyClient();
    this._active = false;
    this._state = { imageUrl: null, modelTaskId: null, glbUrl: null, riggedTaskId: null };
    this._currentSession = null;
    this._currentStep = 1; // 1=Imagem, 2=Modelo 3D
    this._stepDone = { 1: false, 2: false };
    this._activeTab = 'asset';
    this._libOpen = false;
    this._build();
  }

  // ══════════════════════════════════════════════════════════════════
  //  BUILD
  // ══════════════════════════════════════════════════════════════════
  _build() {
    const el = document.createElement('div');
    el.id = 'meshy-panel';
    el.style.cssText = `
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      width:580px; max-height:90vh; overflow:hidden;
      background:#07071a; border:2px solid #b6f; border-radius:16px;
      color:#dce; font-family:'Segoe UI',monospace; font-size:13px;
      display:none; z-index:9200;
      box-shadow:0 0 60px rgba(130,80,255,.35),0 20px 60px rgba(0,0,0,.85);
      flex-direction:column;
    `;
    el.innerHTML = `
      ${this._css()}

      <!-- HEADER -->
      <div style="
        display:flex;justify-content:space-between;align-items:center;
        padding:14px 18px 12px;border-bottom:1px solid #2a1a4a;
        background:linear-gradient(135deg,#0d0d22,#130d2a);flex-shrink:0
      ">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">🤖</span>
          <div>
            <div style="color:#c9f;font-size:15px;font-weight:700;letter-spacing:.5px">MÁQUINA DE CRIAÇÃO</div>
            <div style="color:#668;font-size:10px;letter-spacing:1px">MESHY AI PIPELINE</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button id="m-lib-btn" class="mp-hdr-btn" title="Biblioteca desta máquina">📚 Biblioteca</button>
          <button id="m-clear-btn" class="mp-hdr-btn mp-hdr-danger" title="Recomeçar do zero">🗑 Limpar</button>
          <button id="meshy-close" style="background:none;border:none;color:#a8c;cursor:pointer;font-size:22px;line-height:1;padding:0 0 0 4px">×</button>
        </div>
      </div>

      <!-- API KEY ROW (oculto por padrão — só aparece se NÃO houver key no .env) -->
      <div id="meshy-keyrow" style="
        display:none;gap:6px;align-items:center;
        padding:8px 18px;background:#09091e;border-bottom:1px solid #1a1a30;flex-shrink:0
      ">
        <span style="color:#a9c;font-size:11px">🔑 API Key:</span>
        <input id="meshy-key" type="password" placeholder="cole sua Meshy API key"
          style="flex:1;background:#0c0c1e;color:#cdf;border:1px solid #527;padding:5px 8px;border-radius:5px;font-size:12px;font-family:inherit">
        <button id="meshy-key-save" class="mp-btn">Salvar</button>
      </div>

      <!-- TABS -->
      <div style="display:flex;gap:0;padding:0 18px;background:#09091e;border-bottom:1px solid #1a1a30;flex-shrink:0">
        <button id="m-tab-asset" class="mp-tab mp-tab-on">📦 Asset</button>
        <button id="m-tab-char"  class="mp-tab">🐉 Personagem</button>
        <button id="m-tab-tree"  class="mp-tab">🌳 Árvore</button>
      </div>

      <!-- SCROLLABLE BODY -->
      <div id="m-body" style="overflow-y:auto;flex:1;min-height:0">

        <!-- ══ ASSET PIPELINE ══ -->
        <div id="m-asset" style="padding:16px 18px">

          <!-- Step indicator (2 passos) -->
          <div id="m-steps-indicator" style="display:flex;align-items:center;margin-bottom:18px">
            ${this._buildStepDot(1, 'Imagem')}
            <div class="mp-step-line" id="m-line-1-2"></div>
            ${this._buildStepDot(2, 'Modelo 3D')}
          </div>

          <!-- STEP 1: Imagem -->
          <div id="m-step1-panel" class="mp-step-panel mp-step-active">
            <div class="mp-step-header" id="m-step1-header">
              <span style="color:#c9f;font-weight:700;font-size:13px">1. Descreva o item</span>
            </div>
            <div id="m-step1-body">
              <textarea id="meshy-prompt" rows="2"
                placeholder="ex: um baú de tesouro de madeira com detalhes em ouro"
                style="width:100%;background:#0c0c1e;color:#cdf;border:1px solid #527;border-radius:7px;
                       padding:9px 10px;margin:8px 0 4px;box-sizing:border-box;font-family:inherit;
                       font-size:12px;resize:vertical;line-height:1.5"></textarea>
              <div style="font-size:10px;color:#556;margin-bottom:10px;font-style:italic">
                Sufixo automático: ", fundo cinza sólido, objeto único, centralizado"
              </div>
              <!-- Image preview area -->
              <div id="m-img-area" style="
                min-height:200px;border:2px dashed #2a2a4a;border-radius:10px;
                display:flex;align-items:center;justify-content:center;
                margin-bottom:10px;overflow:hidden;background:#050514;position:relative
              ">
                <div id="m-img-placeholder" style="text-align:center;color:#334;pointer-events:none">
                  <div style="font-size:36px;margin-bottom:6px">🖼️</div>
                  <div style="font-size:11px">A imagem gerada aparecerá aqui</div>
                </div>
                <img id="meshy-img" style="
                  display:none;width:100%;max-height:280px;object-fit:contain;border-radius:8px
                ">
              </div>
              <!-- Buttons -->
              <div style="display:flex;gap:6px">
                <button id="m-s1-gen" class="mp-action-btn" style="flex:1">
                  🎨 Gerar Imagem
                </button>
                <button id="m-frame-btn" class="mp-btn" style="display:none;white-space:nowrap" title="Criar quadro com esta imagem">
                  🖼️ Quadro
                </button>
                <button id="m-store-img-btn" class="mp-btn" style="display:none;white-space:nowrap" title="Guardar esta imagem no inventário">
                  📥 Guardar
                </button>
              </div>
              <button id="m-insert-inv-btn" class="mp-btn" style="width:100%;margin-top:6px;border-color:#7a4aff;color:#c9b0ff">
                📦 Inserir Imagem do Inventário
              </button>
              <div id="m-step1-approve" style="display:none;margin-top:8px">
                <button id="m-s1-approve" class="mp-approve-btn" style="width:100%">
                  ✓ Aprovar → Gerar 3D
                </button>
              </div>

              <!-- Picker de imagens do inventário -->
              <div id="m-inv-picker" style="display:none;margin-top:8px;
                   background:#0a0a18;border:1px solid #3a2a6a;border-radius:8px;padding:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span style="font-size:11px;color:#c9b0ff;font-weight:600">📦 Imagens guardadas</span>
                  <button id="m-inv-picker-close" style="background:none;border:none;color:#88a;cursor:pointer;font-size:16px">×</button>
                </div>
                <div id="m-inv-picker-grid" style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto"></div>
              </div>
              <!-- Step 1 inline status + progress -->
              <div id="m-step1-status" class="mp-inline-status" style="display:none"></div>
              <div id="m-step1-prog" class="mp-prog-wrap" style="display:none">
                <div class="mp-prog-track"><div id="m-step1-prog-bar" class="mp-prog-bar" style="width:0%"></div></div>
                <div id="m-step1-prog-txt" class="mp-prog-txt">…</div>
              </div>
            </div>
            <!-- Completed summary (shown when step is done and collapsed) -->
            <div id="m-step1-done" style="display:none">
              <div style="display:flex;align-items:center;gap:10px">
                <img id="m-step1-thumb" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid #446">
                <div style="flex:1;min-width:0">
                  <div id="m-step1-done-prompt" style="font-size:11px;color:#9cf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
                  <div style="font-size:10px;color:#557;margin-top:2px">Imagem gerada ✓</div>
                </div>
                <button id="m-step1-redo" class="mp-redo-btn">↩ Refazer</button>
              </div>
            </div>
          </div>

          <!-- STEP 2: Modelo 3D (image-to-3d colorido + remesh quad 30k) -->
          <div id="m-step2-panel" class="mp-step-panel mp-step-locked">
            <div class="mp-step-header">
              <span style="color:#c9f;font-weight:700;font-size:13px">2. Gerar Modelo 3D</span>
            </div>
            <div id="m-step2-body">
              <div style="font-size:11px;color:#668;margin-bottom:10px">
                A imagem vira um modelo 3D <b style="color:#9cf">já colorido</b> e é otimizado
                automaticamente. Entrega pronto pra usar.
              </div>
              <!-- Nível de detalhe (polígonos) -->
              <div style="display:flex;gap:6px;margin-bottom:10px">
                <label class="mp-poly-opt" style="flex:1">
                  <input type="radio" name="polylevel" value="normal" checked>
                  <span><b>Normal</b><br><small style="color:#779">~30k polígonos</small></span>
                </label>
                <label class="mp-poly-opt" style="flex:1">
                  <input type="radio" name="polylevel" value="low">
                  <span><b>⚡ Low Poly</b><br><small style="color:#779">~5k · bem leve</small></span>
                </label>
              </div>
              <button id="m-s2-gen" class="mp-action-btn" style="width:100%">
                📦 Gerar 3D + Otimizar
              </button>
              <div id="m-step2-status" class="mp-inline-status" style="display:none"></div>
              <div id="m-step2-prog" class="mp-prog-wrap" style="display:none">
                <div class="mp-prog-track"><div id="m-step2-prog-bar" class="mp-prog-bar" style="width:0%"></div></div>
                <div id="m-step2-prog-txt" class="mp-prog-txt">…</div>
              </div>
            </div>
            <!-- Done = asset pronto + área de salvar -->
            <div id="m-step2-done" style="display:none">
              <div style="
                background:#0a1a0a;border:1px solid #2a5a2a;border-radius:8px;
                padding:12px;margin-top:4px
              ">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <span style="color:#5fc;font-size:12px;font-weight:600">✨ Asset Pronto!</span>
                  <button id="m-step2-redo" class="mp-redo-btn">↩ Refazer 3D</button>
                </div>
                <div style="display:flex;gap:6px;margin-bottom:8px">
                  <input id="meshy-name" placeholder="nome do asset"
                    style="flex:1;background:#0c0c1e;color:#cdf;border:1px solid #527;padding:6px 10px;
                           border-radius:6px;font-family:inherit;font-size:12px">
                  <button id="meshy-save" class="mp-btn mp-btn-green">💾 Salvar</button>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
                  <span style="font-size:10px;color:#668">Grupo:</span>
                  <select id="meshy-group-sel" style="
                    flex:1;background:#0c0c1e;color:#cdf;border:1px solid #527;
                    padding:5px 8px;border-radius:5px;font-family:inherit;font-size:12px
                  "></select>
                </div>
                <button id="m-place-btn" class="mp-btn" style="width:100%;padding:8px;font-size:12px">
                  ▶ Colocar no Mapa
                </button>
              </div>
            </div>
          </div>

          <!-- Pipeline completo (auto) button -->
          <button id="meshy-auto" class="mp-btn" style="
            width:100%;margin-top:12px;background:#1a2050;border-color:#46a;
            padding:9px;font-size:12px;letter-spacing:.3px
          ">⚡ Pipeline Completo (1→2 automático)</button>

        </div>

        <!-- ══ CHARACTER PIPELINE ══ -->
        <div id="m-char" style="display:none;padding:16px 18px">
          <div style="color:#89a;font-size:11px;margin-bottom:12px;line-height:1.5">
            Gere um personagem 3D riggado e pronto para animações.
          </div>
          <label style="color:#c9f;font-weight:700;font-size:12px">Descreva o personagem</label>
          <textarea id="meshy-char-prompt" rows="2"
            placeholder="ex: um dragão laranja bípede estilo digimon"
            style="width:100%;background:#0c0c1e;color:#cdf;border:1px solid #527;border-radius:7px;
                   padding:9px;margin:8px 0 10px;box-sizing:border-box;font-family:inherit;font-size:12px;resize:vertical"></textarea>
          <div style="display:flex;gap:12px;margin-bottom:12px;font-size:12px">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="radio" name="chartype" value="humanoid" checked> Humanoide
            </label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="radio" name="chartype" value="quadruped"> Quadrúpede
            </label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button id="meshy-c1" class="mp-step-btn">1️⃣ Imagem T-pose</button>
            <button id="meshy-c2" class="mp-step-btn" disabled>2️⃣ Imagem → 3D</button>
            <button id="meshy-c3" class="mp-step-btn" disabled>3️⃣ Rig</button>
            <button id="meshy-c4" class="mp-step-btn" disabled>4️⃣ Animações</button>
          </div>
          <!-- char preview -->
          <div id="m-char-preview" style="display:none;text-align:center;margin:12px 0">
            <img id="m-char-img" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid #527">
          </div>
          <!-- char progress -->
          <div id="m-char-prog" style="display:none;margin-top:10px">
            <div class="mp-prog-track"><div id="m-char-prog-bar" class="mp-prog-bar" style="width:0%"></div></div>
            <div id="m-char-prog-txt" class="mp-prog-txt" style="margin-top:4px">…</div>
          </div>
          <div id="m-char-status" style="margin-top:10px;font-size:11px;color:#89a"></div>
        </div>

        <!-- ══ WISHLIST TREE ══ -->
        <div id="m-tree" style="display:none;padding:16px 18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:11px;color:#89a;line-height:1.5">
              Tudo que o jogo precisa. Clique para carregar o prompt.
            </div>
            <span id="meshy-tree-prog" style="font-size:11px;color:#c9f;white-space:nowrap"></span>
          </div>
          <div id="meshy-tree-list"></div>
        </div>

      </div><!-- /m-body -->

      <!-- LIBRARY DRAWER (slides in from right) -->
      <div id="m-lib-drawer" style="
        position:absolute;top:0;right:-100%;width:100%;height:100%;
        background:#07071a;border-left:2px solid #b6f;
        transition:right .25s cubic-bezier(.4,0,.2,1);
        display:flex;flex-direction:column;z-index:10
      ">
        <div style="
          display:flex;justify-content:space-between;align-items:center;
          padding:14px 18px;border-bottom:1px solid #2a1a4a;
          background:linear-gradient(135deg,#0d0d22,#130d2a);flex-shrink:0
        ">
          <span style="color:#c9f;font-weight:700;font-size:14px">📚 Biblioteca desta Máquina</span>
          <button id="m-lib-close" style="background:none;border:none;color:#a8c;cursor:pointer;font-size:22px;line-height:1">×</button>
        </div>
        <div id="m-lib-list" style="overflow-y:auto;flex:1;padding:14px 18px;display:flex;flex-direction:column;gap:10px">
          <div style="color:#445;font-size:12px">Carregando…</div>
        </div>
      </div>

      <!-- GLOBAL STATUS (bottom bar) -->
      <div id="meshy-status" style="
        padding:6px 18px;font-size:11px;color:#89a;min-height:28px;
        background:#06060f;border-top:1px solid #13132a;flex-shrink:0;
        display:flex;align-items:center;gap:6px
      "></div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._bind();
  }

  _buildStepDot(n, label) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0" id="m-dot-wrap-${n}">
        <div id="m-dot-${n}" style="
          width:32px;height:32px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:700;
          border:2px solid #2a2a4a;background:#0c0c1e;color:#445;
          transition:all .3s
        ">${n}</div>
        <div id="m-dot-lbl-${n}" style="font-size:9px;color:#445;letter-spacing:.5px;text-transform:uppercase;transition:color .3s">${label}</div>
      </div>`;
  }

  _css() {
    return `<style>
      #meshy-panel .mp-btn {
        background:#1e1e38;border:1px solid #527;color:#bcf;cursor:pointer;
        padding:6px 11px;border-radius:6px;font-size:11px;font-family:inherit;
        transition:background .15s;white-space:nowrap
      }
      #meshy-panel .mp-btn:hover { background:#2a2a50 }
      #meshy-panel .mp-btn-green { background:#122a14;border-color:#3a7a3a;color:#8ef }
      #meshy-panel .mp-btn-green:hover { background:#1a3a1c }

      #meshy-panel .mp-hdr-btn {
        background:#141428;border:1px solid #335;color:#99b;cursor:pointer;
        padding:5px 10px;border-radius:6px;font-size:11px;font-family:inherit;
        transition:background .15s
      }
      #meshy-panel .mp-hdr-btn:hover { background:#1e1e38 }
      #meshy-panel .mp-hdr-danger:hover { background:#2a1a1a;border-color:#a44;color:#faa }

      #meshy-panel .mp-tab {
        background:none;border:none;border-bottom:2px solid transparent;
        color:#668;cursor:pointer;padding:10px 14px;font-family:inherit;font-size:12px;
        transition:all .15s
      }
      #meshy-panel .mp-tab:hover { color:#aac }
      #meshy-panel .mp-tab-on { color:#c9f;border-bottom-color:#b6f }

      #meshy-panel .mp-step-panel {
        border-radius:10px;padding:12px 14px;margin-bottom:10px;
        border:1px solid #1e1e38;transition:all .3s
      }
      #meshy-panel .mp-step-active {
        border-color:#b6f;background:linear-gradient(135deg,#0c0c24,#100d22)
      }
      #meshy-panel .mp-step-locked {
        border-color:#1a1a2a;background:#09090f;opacity:.55;pointer-events:none
      }
      #meshy-panel .mp-step-completed {
        border-color:#2a4a2a;background:#0a120a;opacity:1;pointer-events:auto;cursor:pointer
      }
      #meshy-panel .mp-step-completed:hover { border-color:#4a7a4a }

      #meshy-panel .mp-step-header {
        display:flex;align-items:center;gap:8px;margin-bottom:0
      }

      #meshy-panel .mp-step-line {
        flex:1;height:2px;background:#1e1e38;margin:0 4px;transition:background .3s
      }
      #meshy-panel .mp-step-line.done { background:linear-gradient(90deg,#5a3aaa,#3a6a3a) }

      #meshy-panel .mp-action-btn {
        background:linear-gradient(135deg,#2a1a6a,#1a1a50);
        border:1px solid #7a4aff;color:#d0b0ff;cursor:pointer;
        padding:10px 16px;border-radius:8px;font-size:12px;font-family:inherit;
        font-weight:600;transition:all .2s;letter-spacing:.3px
      }
      #meshy-panel .mp-action-btn:hover {
        background:linear-gradient(135deg,#3a2a7a,#2a2a60);
        box-shadow:0 0 16px rgba(120,60,255,.4)
      }
      #meshy-panel .mp-action-btn:disabled { opacity:.35;cursor:not-allowed;box-shadow:none }
      #meshy-panel .mp-action-gold {
        background:linear-gradient(135deg,#2a1a00,#1a1400);
        border-color:#b8860b;color:#ffd060
      }
      #meshy-panel .mp-action-gold:hover {
        background:linear-gradient(135deg,#3a2a00,#2a2000);
        box-shadow:0 0 16px rgba(184,134,11,.35)
      }

      #meshy-panel .mp-approve-btn {
        background:linear-gradient(135deg,#0a2a0a,#071a07);
        border:1px solid #3a8a3a;color:#8eff8e;cursor:pointer;
        padding:8px 14px;border-radius:7px;font-size:12px;font-family:inherit;
        font-weight:600;transition:all .2s
      }
      #meshy-panel .mp-approve-btn:hover {
        background:linear-gradient(135deg,#0e3a0e,#0a240a);
        box-shadow:0 0 12px rgba(60,180,60,.3)
      }

      #meshy-panel .mp-redo-btn {
        background:#1a1a28;border:1px solid #445;color:#99a;cursor:pointer;
        padding:4px 9px;border-radius:5px;font-size:10px;font-family:inherit;
        transition:background .15s;white-space:nowrap
      }
      #meshy-panel .mp-redo-btn:hover { background:#222238;color:#ccf }

      #meshy-panel .mp-step-btn {
        background:#111a2a;border:1px solid #346;color:#8af;cursor:pointer;
        padding:9px;border-radius:7px;font-size:11px;font-family:inherit;
        transition:background .15s
      }
      #meshy-panel .mp-step-btn:disabled { opacity:.35;cursor:not-allowed }
      #meshy-panel .mp-step-btn:hover:not(:disabled) { background:#1a2a3e }

      #meshy-panel .mp-inline-status {
        margin-top:8px;font-size:11px;color:#a9c;padding:5px 8px;
        background:#0a0a1e;border-radius:5px;border-left:2px solid #527;line-height:1.4
      }

      #meshy-panel .mp-prog-wrap { margin-top:8px }
      #meshy-panel .mp-prog-track {
        background:#0c0c1e;border:1px solid #1e1e38;border-radius:6px;
        height:16px;overflow:hidden
      }
      #meshy-panel .mp-prog-bar {
        height:100%;background:linear-gradient(90deg,#7a4cff,#c49cff);
        transition:width .3s;border-radius:6px
      }
      #meshy-panel .mp-prog-gold {
        background:linear-gradient(90deg,#b8860b,#ffd060)
      }
      #meshy-panel .mp-prog-txt {
        font-size:10px;color:#a9c;margin-top:3px;text-align:center
      }

      #meshy-panel .mp-lib-card {
        background:#0c0c1e;border:1px solid #1e1e30;border-radius:10px;
        padding:12px;cursor:pointer;transition:border-color .2s
      }
      #meshy-panel .mp-lib-card:hover { border-color:#b6f }

      #meshy-panel .mp-lib-badge {
        display:inline-flex;align-items:center;gap:3px;
        padding:2px 8px;border-radius:4px;font-size:10px;
        cursor:pointer;transition:opacity .15s
      }
      #meshy-panel .mp-lib-badge:hover { opacity:.8 }

      #meshy-panel .mp-poly-opt {
        display:flex;align-items:center;gap:7px;cursor:pointer;
        background:#0c0c1e;border:1px solid #2a2a4a;border-radius:8px;
        padding:8px 10px;font-size:12px;transition:border-color .15s
      }
      #meshy-panel .mp-poly-opt:hover { border-color:#7a4aff }
      #meshy-panel .mp-poly-opt:has(input:checked) {
        border-color:#7a4aff;background:#160d2e
      }
      #meshy-panel .mp-poly-opt input { accent-color:#a07cff;margin:0 }
      #meshy-panel .mp-poly-opt span { line-height:1.3 }
    </style>`;
  }

  // ══════════════════════════════════════════════════════════════════
  //  BIND
  // ══════════════════════════════════════════════════════════════════
  _bind() {
    const $ = id => this._el.querySelector('#' + id);

    $('meshy-close').onclick = () => this.hide();

    // API key
    const keyInput = $('meshy-key');
    if (this.client.getKey()) keyInput.value = this.client.getKey();
    $('meshy-key-save').onclick = () => {
      this.client.setKey(keyInput.value.trim());
      this._status('🔑 key salva');
    };

    // Tabs
    $('m-tab-asset').onclick = () => this._tab('asset');
    $('m-tab-char').onclick  = () => this._tab('char');
    $('m-tab-tree').onclick  = () => { this._tab('tree'); this._renderTree(); };

    // Header buttons
    $('m-lib-btn').onclick   = () => this._toggleLib();
    $('m-lib-close').onclick = () => this._closeLib();
    $('m-clear-btn').onclick = () => this._clearAll();

    // Asset pipeline step 1
    $('m-s1-gen').onclick      = () => this._step1();
    $('m-s1-approve').onclick  = () => this._approveStep1();
    $('m-step1-redo').onclick  = () => this._redoStep(1);
    $('m-frame-btn').onclick   = () => this._placeFrame();
    $('m-store-img-btn').onclick    = () => this._storeImageInInventory();
    $('m-insert-inv-btn').onclick   = () => this._openInvPicker();
    $('m-inv-picker-close').onclick = () => { $('m-inv-picker').style.display = 'none'; };

    // Asset pipeline step 2
    $('m-s2-gen').onclick      = () => this._step2();
    $('m-step2-redo').onclick  = () => this._redoStep(2);

    // Save & place (área do passo 2)
    $('meshy-save').onclick  = () => this._saveToCatalog();
    $('m-place-btn').onclick = () => this._placeAsset();

    // Auto pipeline
    $('meshy-auto').onclick = () => this._autoPipeline();

    // Character steps
    $('meshy-c1').onclick = () => this._charStep1();
    $('meshy-c2').onclick = () => this._charStep2();
    $('meshy-c3').onclick = () => this._charStep3();
    $('meshy-c4').onclick = () => this._charStep4();

    // Navegar entre etapas concluídas clicando nos dots numerados (revisar)
    for (let n = 1; n <= 2; n++) {
      const dot = $(`m-dot-wrap-${n}`);
      if (dot) dot.addEventListener('click', () => {
        // Só permite ir para etapas já concluídas ou a atual (nunca futuras)
        if (this._stepDone[n] || this._currentStep === n) {
          this._currentStep = n;
          this._updateStepIndicator();
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  TABS
  // ══════════════════════════════════════════════════════════════════
  _tab(which) {
    const $ = id => this._el.querySelector('#' + id);
    $('m-asset').style.display = which === 'asset' ? 'block' : 'none';
    $('m-char').style.display  = which === 'char'  ? 'block' : 'none';
    $('m-tree').style.display  = which === 'tree'  ? 'block' : 'none';
    $('m-tab-asset').classList.toggle('mp-tab-on', which === 'asset');
    $('m-tab-char').classList.toggle('mp-tab-on',  which === 'char');
    $('m-tab-tree').classList.toggle('mp-tab-on',  which === 'tree');
    this._activeTab = which;
  }

  // ══════════════════════════════════════════════════════════════════
  //  STEP INDICATOR
  // ══════════════════════════════════════════════════════════════════
  _updateStepIndicator() {
    for (let n = 1; n <= 2; n++) {
      const dot     = this._el.querySelector(`#m-dot-${n}`);
      const lbl     = this._el.querySelector(`#m-dot-lbl-${n}`);
      const panel   = this._el.querySelector(`#m-step${n}-panel`);
      if (!dot) continue;

      const isActive    = this._currentStep === n;
      const isCompleted = this._stepDone[n];

      if (isCompleted) {
        dot.style.cssText += ';border-color:#4a8a4a;background:#0a2a0a;color:#5fc';
        dot.textContent = '✓';
        lbl.style.color = '#5fc';
      } else if (isActive) {
        dot.style.cssText += ';border-color:#b6f;background:#1a0a3a;color:#d0b0ff';
        dot.textContent = String(n);
        lbl.style.color = '#c9f';
      } else {
        dot.style.cssText += ';border-color:#2a2a4a;background:#0c0c1e;color:#445';
        dot.textContent = String(n);
        lbl.style.color = '#445';
      }

      if (panel) {
        panel.className = 'mp-step-panel';
        panel.style.display = 'block';
        if (isCompleted) {
          // Etapa concluída → mostra resumo recolhido (clicável p/ revisar)
          panel.classList.add('mp-step-completed');
          panel.querySelector(`[id="m-step${n}-body"]`).style.display = 'none';
          panel.querySelector(`[id="m-step${n}-done"]`).style.display = 'block';
        } else if (isActive) {
          // Etapa atual → mostra conteúdo completo
          panel.classList.add('mp-step-active');
          panel.querySelector(`[id="m-step${n}-body"]`).style.display = 'block';
          panel.querySelector(`[id="m-step${n}-done"]`).style.display = 'none';
        } else {
          // Etapa futura/inalcançável → OCULTA totalmente
          panel.style.display = 'none';
        }
      }
    }
    // Cursor nos dots navegáveis (concluídos ou atual)
    for (let n = 1; n <= 2; n++) {
      const wrap = this._el.querySelector(`#m-dot-wrap-${n}`);
      if (wrap) wrap.style.cursor = (this._stepDone[n] || this._currentStep === n) ? 'pointer' : 'default';
    }

    // Linha entre os 2 passos
    const l12 = this._el.querySelector('#m-line-1-2');
    if (l12) l12.className = 'mp-step-line' + (this._stepDone[1] ? ' done' : '');

    // Pipeline Completo (auto) só faz sentido no começo — esconde após iniciar
    const autoBtn = this._el.querySelector('#meshy-auto');
    if (autoBtn) autoBtn.style.display = (this._stepDone[1] || this._currentStep > 1) ? 'none' : 'block';
  }

  _redoStep(n) {
    // Reseta esta etapa e as seguintes
    for (let i = n; i <= 2; i++) this._stepDone[i] = false;
    this._currentStep = n;
    if (n <= 1) {
      this._state.imageUrl = null;
      this._el.querySelector('#meshy-img').style.display = 'none';
      this._el.querySelector('#m-img-placeholder').style.display = 'flex';
      this._el.querySelector('#m-s1-gen').textContent = '🎨 Gerar Imagem';
      this._el.querySelector('#m-step1-approve').style.display = 'none';
      this._el.querySelector('#m-frame-btn').style.display = 'none';
      this._el.querySelector('#m-store-img-btn').style.display = 'none';
    }
    if (n <= 2) {
      this._state.modelTaskId = null;
      this._state.glbUrl = null;
      const d = this._el.querySelector('#m-step2-done');
      if (d) d.style.display = 'none';
    }
    this._hideAllStepStatus();
    this._updateStepIndicator();
  }

  _hideAllStepStatus() {
    for (let n = 1; n <= 2; n++) {
      const s = this._el.querySelector(`#m-step${n}-status`);
      const p = this._el.querySelector(`#m-step${n}-prog`);
      if (s) s.style.display = 'none';
      if (p) p.style.display = 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  STEP INLINE HELPERS
  // ══════════════════════════════════════════════════════════════════
  _stepStatus(n, msg, type = 'info') {
    const el = this._el.querySelector(`#m-step${n}-status`);
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.textContent = msg || '';
    const colors = { info: '#a9c', ok: '#5fc', error: '#f88', warn: '#fa8' };
    el.style.color = colors[type] || colors.info;
    el.style.borderLeftColor = colors[type] || '#527';
    // Also update global status
    if (msg) this._status(msg);
  }

  _stepProg(n, pct, txt, gold = false) {
    const wrap = this._el.querySelector(`#m-step${n}-prog`);
    const bar  = this._el.querySelector(`#m-step${n}-prog-bar`);
    const lbl  = this._el.querySelector(`#m-step${n}-prog-txt`);
    if (!wrap) return;
    wrap.style.display = 'block';
    if (bar) {
      bar.style.width = (pct || 0) + '%';
      bar.className = 'mp-prog-bar' + (gold ? ' mp-prog-gold' : '');
    }
    if (lbl) lbl.textContent = txt || (pct + '%');
  }

  // ══════════════════════════════════════════════════════════════════
  //  MACHINE PROXY
  // ══════════════════════════════════════════════════════════════════
  _machine(method, ...args) {
    this._sessionMachine?.[method]?.(...args);
  }

  // ══════════════════════════════════════════════════════════════════
  //  KEY CHECK
  // ══════════════════════════════════════════════════════════════════
  _checkKey() {
    if (!this.client.hasKey()) {
      this._status('⚠️ configure a API key primeiro');
      return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════════
  //  ASSET PIPELINE — STEP 1 (Imagem)
  // ══════════════════════════════════════════════════════════════════
  async _step1() {
    if (!this._checkKey()) return;
    const prompt = this._el.querySelector('#meshy-prompt').value.trim();
    if (!prompt) { this._stepStatus(1, 'Digite uma descrição primeiro', 'warn'); return; }

    const sess = this._ensureSession(prompt);
    this._stepStatus(1, '🎨 Gerando imagem…');
    this._machine('startGenerating');

    const btn = this._el.querySelector('#m-s1-gen');
    btn.disabled = true;

    try {
      const r = await this.client.textToImage(prompt, {
        onProgress: (p, s) => this._stepProg(1, p, `🎨 Imagem ${s} ${p}%`)
      });
      // ── Baixa a imagem pro PC na hora (nunca expira) ───────────────
      this._stepStatus(1, '💾 Baixando imagem pro PC…');
      const localImg = await this.client.cacheAsset(r.imageUrl, `${sess.id}.png`);
      this._state.imageUrl    = localImg || r.imageUrl;
      this._state.imageRemote = r.imageUrl;     // URL pública da Meshy (p/ imageTo3D)
      sess.image       = this._state.imageUrl;
      sess.imageRemote = r.imageUrl;            // CDN original (backup)
      await this._saveCurrentSession();

      // Show image (caminho local → servido pelo :5500)
      const img = this._el.querySelector('#meshy-img');
      const ph  = this._el.querySelector('#m-img-placeholder');
      img.src = this._state.imageUrl;
      img.style.display = 'block';
      ph.style.display = 'none';

      this._machine('showImage', this._state.imageUrl);
      this._el.querySelector('#m-frame-btn').style.display = 'block';
      this._el.querySelector('#m-store-img-btn').style.display = 'block';
      this._el.querySelector('#m-s1-gen').textContent = '🔄 Regerar Imagem';
      this._el.querySelector('#m-step1-approve').style.display = 'block';
      this._stepStatus(1, '✅ Imagem gerada! Aprove para continuar ou regere.', 'ok');
    } catch (e) {
      this._machine('stopGenerating');
      this._stepStatus(1, '❌ ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  _approveStep1() {
    if (!this._state.imageUrl) return;
    // Mark step 1 done, fill summary
    const prompt = this._el.querySelector('#meshy-prompt').value.trim();
    const thumb  = this._el.querySelector('#m-step1-thumb');
    const lbl    = this._el.querySelector('#m-step1-done-prompt');
    if (thumb) thumb.src = this._state.imageUrl;
    if (lbl)   lbl.textContent = prompt.slice(0, 60) + (prompt.length > 60 ? '…' : '');

    this._stepDone[1] = true;
    this._currentStep = 2;
    this._updateStepIndicator();
    this._stepStatus(2, 'Pronto para converter a imagem em 3D');
  }

  // ══════════════════════════════════════════════════════════════════
  //  ASSET PIPELINE — STEP 2 (3D)
  // ══════════════════════════════════════════════════════════════════
  async _step2() {
    if (!this._state.imageUrl) { this._stepStatus(2, '⚠️ Gere e aprove uma imagem primeiro', 'warn'); return; }
    const prompt = this._el.querySelector('#meshy-prompt').value.trim();
    this._machine('startProcessing');
    this._stepStatus(2, '🧊 Convertendo para 3D…');

    const btn = this._el.querySelector('#m-s2-gen');
    btn.disabled = true;

    try {
      // ── Fase 1: image-to-3d (já vem colorido) — 0–55% ──────────────
      //  FONTE DA VERDADE = a imagem EXIBIDA no painel (local, nunca expira).
      //  Convertemos pra data URI e mandamos ISSO pro image-to-3d → o 3D é
      //  SEMPRE construído a partir da arte que você vê. Antes usávamos a URL
      //  pública da Meshy (imageRemote), que EXPIRA: se demorasse pra clicar
      //  "Gerar 3D", a URL morria e o modelo saía sem relação com a imagem.
      this._stepStatus(2, '🖼️ Lendo a arte gerada…');
      let imgForApi = await this._toDataUri(this._state.imageUrl).catch(() => null);
      if (!imgForApi) {
        // Fallback: data URI do CDN remoto, ou as URLs cruas como último recurso.
        imgForApi = await this._toDataUri(this._state.imageRemote).catch(() => null)
                  || this._state.imageRemote || this._state.imageUrl;
      }

      // Nível de detalhe escolhido no toggle.
      const polyLevel = this._el.querySelector('input[name="polylevel"]:checked')?.value || 'normal';
      const lowPoly   = polyLevel === 'low';

      const sess = this._ensureSession(prompt);

      if (lowPoly) {
        // ── LOW POLY: image-to-3d JÁ entrega no polígono baixo (remesh
        //  inline) → UMA chamada só, sem etapa de remesh separada.
        this._stepStatus(2, '⚡ Gerando 3D low poly (~5k)…');
        const r = await this.client.imageTo3D(imgForApi, {
          shouldRemesh: true, targetPolycount: 5000, topology: 'triangle',
          onProgress: (p, s) => this._stepProg(2, Math.round(p), `⚡ Low Poly ${s} ${p}%`)
        });
        this._state.modelTaskId = r.taskId;
        this._state.glbUrl      = r.glbUrl;
        sess.glb3d       = r.glbUrl;
        sess.modelTaskId = r.taskId;
        sess.glbRemesh   = r.glbUrl;
        await this._saveCurrentSession();
      } else {
        // ── NORMAL: image-to-3d bruto (0–55%) + remesh quad 30k (55–100%) ──
        this._stepStatus(2, '🧊 Convertendo para 3D…');
        const r = await this.client.imageTo3D(imgForApi, {
          onProgress: (p, s) => this._stepProg(2, Math.round(p * 0.55), `🧊 3D ${s} ${p}%`)
        });
        this._state.modelTaskId = r.taskId;
        this._state.glbUrl = r.glbUrl;
        sess.glb3d       = r.glbUrl;
        sess.modelTaskId = r.taskId;
        await this._saveCurrentSession();

        this._stepStatus(2, '🔧 Otimizando (remesh quad 30k)…');
        try {
          const r2 = await this.client.remesh(r.taskId, {
            targetPolycount: 30000,
            topology: 'quad',
            onProgress: (p, s) => this._stepProg(2, 55 + Math.round(p * 0.45), `🔧 Remesh ${s} ${p}%`)
          });
          if (r2.glbUrl) {
            this._state.glbUrl    = r2.glbUrl;
            this._state.modelTaskId = r2.taskId;
            sess.glbRemesh        = r2.glbUrl;
            sess.remeshTaskId     = r2.taskId;
          }
        } catch (remeshErr) {
          // Remesh falhou — usa o GLB bruto do image-to-3d (já colorido)
          console.warn('[MeshyPanel] remesh falhou, usando 3D bruto:', remeshErr.message);
        }
      }
      // ── Baixa o GLB pro PC na hora (nunca expira) ──────────────────
      this._stepStatus(2, '💾 Baixando modelo 3D pro PC…');
      const localGlb = await this.client.cacheAsset(this._state.glbUrl, `${sess.id}.glb`);
      if (localGlb) {
        sess.glbRemote     = this._state.glbUrl;   // CDN original (só backup)
        this._state.glbUrl = localGlb;             // daqui pra frente: LOCAL
        // TODOS os campos persistidos apontam pro arquivo LOCAL → a sessão
        //  nunca mais depende da URL da Meshy (que expira / dá CORS).
        sess.glb3d     = localGlb;
        sess.glbRemesh = localGlb;
      }
      sess.glbTextured = this._state.glbUrl;
      await this._saveCurrentSession();

      // ── Carrega no holograma com efeito ────────────────────────────
      this._stepStatus(2, '📥 Carregando no holograma…');
      this._machine('show3D', this._state.glbUrl);   // local → AssetMachine carrega direto
      this._machine('stopGenerating');

      // ── Marca passo 2 concluído → mostra área de salvar ────────────
      this._stepDone[2] = true;
      this._currentStep = 2;
      this._updateStepIndicator();

      const doneDiv = this._el.querySelector('#m-step2-done');
      if (doneDiv) doneDiv.style.display = 'block';
      this._el.querySelector('#meshy-name').value = (prompt || 'asset').slice(0, 28);
      this._populateGroupSel();
      this._stepStatus(2, '✨ Asset pronto! Dê um nome e salve, ou coloque no mapa.', 'ok');
    } catch (e) {
      this._machine('doneProcessing');
      this._stepStatus(2, '❌ ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async _autoPipeline() {
    await this._step1();
    if (!this._state.imageUrl) return;
    this._approveStep1();
    await this._step2();
  }

  // ══════════════════════════════════════════════════════════════════
  //  SAVE
  // ══════════════════════════════════════════════════════════════════
  async _populateGroupSel() {
    const sel = this._el.querySelector('#meshy-group-sel');
    if (!sel) return;
    const groups = await AssetGroups.getGroups();
    sel.innerHTML = groups.map(g =>
      `<option value="${g.id}">${g.icon} ${g.name} — ${g.props?.desc || ''}</option>`
    ).join('');
  }

  async _saveToCatalog() {
    if (!this._state.glbUrl) { this._status('nada pra salvar'); return; }
    const name    = this._el.querySelector('#meshy-name').value.trim() || 'asset';
    const groupId = this._el.querySelector('#meshy-group-sel')?.value || null;
    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);

    // Hospeda GLB + IMAGEM no Wasabi (server-side, prefixo público) p/ TODOS
    // os players carregarem no mundo compartilhado. Cai pro Supabase Storage
    // (e por fim pra URL original) se o Wasabi falhar/estiver deslogado.
    let hostedUrl = this._state.glbUrl;
    let hostedImg = this._state.imageUrl || null;
    try {
      this._status('☁️ hospedando no Wasabi…');
      const pubGlb = await WasabiHosting.saveFromUrl(this._state.glbUrl, `${id}.glb`, 'model/gltf-binary');
      if (pubGlb) hostedUrl = pubGlb;
      else {
        const fb = await AssetHosting.uploadFromUrl(this._state.glbUrl, `${id}.glb`);
        if (fb) hostedUrl = fb;
      }
      if (hostedImg) {
        const pubImg = await WasabiHosting.saveFromUrl(hostedImg, `${id}.png`, 'image/png');
        if (pubImg) hostedImg = pubImg;
      }
    } catch (_) {}

    const asset = {
      id, name,
      glbUrl:    hostedUrl,
      imageUrl:  hostedImg || null,
      groupId:   groupId || null,
      createdAt: Date.now(),
    };
    await AssetGroups.saveAsset(asset);

    // Compat: também salva em generated_assets para BuildMode legado
    let list = [];
    try { list = await LocalDB.get('generated_assets', []); } catch (_) {}
    list.push({ id, name, glbUrl: hostedUrl });
    await LocalDB.save('generated_assets', list);
    this.buildMode?._load?.();

    if (this._pendingWishId) {
      await this._markDone(this._pendingWishId, id);
      this._status(`✅ "${name}" salvo e marcado na árvore! Aparece em Construção [B]`);
      this._pendingWishId = null;
    } else {
      this._status('💾 salvo! Aparece no menu de Construção [B]');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  LIBRARY DRAWER
  // ══════════════════════════════════════════════════════════════════
  _toggleLib() {
    this._libOpen ? this._closeLib() : this._openLib();
  }

  _openLib() {
    this._libOpen = true;
    this._el.querySelector('#m-lib-drawer').style.right = '0';
    this._renderLib();
  }

  _closeLib() {
    this._libOpen = false;
    this._el.querySelector('#m-lib-drawer').style.right = '-100%';
  }

  async _renderLib() {
    const list    = this._el.querySelector('#m-lib-list');
    if (!list) return;
    const machine = this._sessionMachine ?? window._activeAssetMachine;
    if (!machine) {
      list.innerHTML = '<div style="color:#566;font-size:12px">Nenhuma máquina ativa.</div>';
      return;
    }
    list.innerHTML = '<div style="color:#89a;font-size:11px">Carregando…</div>';
    const sessions = await machine.getSessions().catch(() => []);
    if (!sessions.length) {
      list.innerHTML = '<div style="color:#566;font-size:12px">Nenhuma sessão ainda. Gere algo!</div>';
      return;
    }
    list.innerHTML = '';
    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'mp-lib-card';
      const date = new Date(s.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

      const hasImg  = !!s.image;
      const has3d   = !!(s.glb3d || s.glbTextured);
      const hasFin  = !!s.glbTextured;

      card.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${hasImg
            ? `<img src="${s.image}" style="width:64px;height:64px;object-fit:cover;border-radius:7px;border:1px solid #336;flex-shrink:0;cursor:pointer" class="lib-load-img" data-id="${s.id}" onerror="this.style.display='none'">`
            : `<div style="width:64px;height:64px;background:#0c0c1e;border-radius:7px;border:1px solid #224;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:#334">🖼</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:#c9f;font-weight:600;margin-bottom:2px;word-break:break-word">
              ${s.prompt.slice(0, 55)}${s.prompt.length > 55 ? '…' : ''}
            </div>
            <div style="font-size:10px;color:#445;margin-bottom:8px">${date}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${hasImg  ? `<span class="mp-lib-badge lib-dl" data-url="${s.image}" data-name="imagem.png" style="background:#0f1f0f;border:1px solid #2a5a2a;color:#8ef">🖼 Imagem</span>` : '<span style="color:#334;font-size:10px;padding:2px 6px">🖼</span>'}
              ${has3d   ? `<span class="mp-lib-badge lib-dl" data-url="${s.glbTextured || s.glb3d}" data-name="modelo_3d.glb" style="background:#0f0f1f;border:1px solid #2a4a7a;color:#8af">📦 3D</span>` : '<span style="color:#334;font-size:10px;padding:2px 6px">📦</span>'}
              ${hasFin  ? `<span class="mp-lib-badge lib-dl" data-url="${s.glbTextured}" data-name="finalizado.glb" style="background:#1a100a;border:1px solid #7a5a0a;color:#fd8">✨ Final</span>` : '<span style="color:#334;font-size:10px;padding:2px 6px">✨</span>'}
              ${has3d   ? `<span class="mp-lib-badge lib-view" data-url="${s.glbTextured || s.glb3d}" style="background:#1a1a0a;border:1px solid #6a5a1a;color:#db8;margin-left:2px">👁 Ver</span>` : ''}
            </div>
          </div>
        </div>`;
      list.appendChild(card);

      // Load session on image click
      card.querySelectorAll('.lib-load-img').forEach(img => {
        img.onclick = () => this._loadSessionFromLib(s);
      });
    }

    list.querySelectorAll('.lib-dl').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        this._downloadFile(btn.dataset.url, btn.dataset.name);
      };
    });
    list.querySelectorAll('.lib-view').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        (this._sessionMachine ?? window._activeAssetMachine)?.show3D?.(btn.dataset.url);
      };
    });
  }

  _loadSessionFromLib(s) {
    this._closeLib();
    this._currentSession = s;

    // Restore prompt
    const ta = this._el.querySelector('#meshy-prompt');
    if (ta && s.prompt) ta.value = s.prompt;

    // Restore state
    this._state = {
      imageUrl:    s.image || null,
      modelTaskId: s.remeshTaskId || s.modelTaskId || null,
      glbUrl:      s.glbTextured || s.glbRemesh || s.glb3d || null,
      riggedTaskId: null,
    };

    // Reset steps
    this._stepDone = { 1: false, 2: false };
    this._currentStep = 1;

    if (s.image) {
      const img = this._el.querySelector('#meshy-img');
      const ph  = this._el.querySelector('#m-img-placeholder');
      img.src = s.image;
      img.style.display = 'block';
      ph.style.display = 'none';
      this._el.querySelector('#m-s1-gen').textContent = '🔄 Regerar Imagem';
      this._el.querySelector('#m-step1-approve').style.display = 'block';
      this._el.querySelector('#m-frame-btn').style.display = 'block';
      this._el.querySelector('#m-store-img-btn').style.display = 'block';

      const thumb = this._el.querySelector('#m-step1-thumb');
      const lbl   = this._el.querySelector('#m-step1-done-prompt');
      if (thumb) thumb.src = s.image;
      if (lbl)   lbl.textContent = (s.prompt || '').slice(0, 60);

      this._stepDone[1] = true;
      this._currentStep = 2;
    }

    const bestGlb = s.glbTextured || s.glbRemesh || s.glb3d;
    if (bestGlb) {
      this._stepDone[2] = true;
      this._currentStep = 2;
      const doneDiv = this._el.querySelector('#m-step2-done');
      if (doneDiv) doneDiv.style.display = 'block';
      this._el.querySelector('#meshy-name').value = (s.prompt || 'asset').slice(0, 28);
      this._populateGroupSel();
    }

    this._updateStepIndicator();
    this._status('🔄 Sessão restaurada da biblioteca');
    this._tab('asset');
  }

  // ══════════════════════════════════════════════════════════════════
  //  CLEAR / RESET
  // ══════════════════════════════════════════════════════════════════
  _clearAll() {
    this._machine('startGenerating');
    this._machine('stopGenerating');
    this._state = { imageUrl: null, modelTaskId: null, glbUrl: null, riggedTaskId: null };
    this._currentSession  = null;
    this._stepDone        = { 1: false, 2: false };
    this._currentStep     = 1;
    this._pendingWishId   = null;

    const ta = this._el.querySelector('#meshy-prompt');
    if (ta) ta.value = '';

    const img = this._el.querySelector('#meshy-img');
    const ph  = this._el.querySelector('#m-img-placeholder');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (ph)  ph.style.display = 'flex';

    const genBtn = this._el.querySelector('#m-s1-gen');
    if (genBtn) genBtn.textContent = '🎨 Gerar Imagem';

    const approveRow = this._el.querySelector('#m-step1-approve');
    if (approveRow) approveRow.style.display = 'none';

    const frameBtn = this._el.querySelector('#m-frame-btn');
    if (frameBtn) frameBtn.style.display = 'none';
    const storeBtn = this._el.querySelector('#m-store-img-btn');
    if (storeBtn) storeBtn.style.display = 'none';

    const step2done = this._el.querySelector('#m-step2-done');
    if (step2done) step2done.style.display = 'none';

    this._hideAllStepStatus();
    this._updateStepIndicator();
    this._status('🗑 Limpo — pronto para nova criação');
  }

  // ══════════════════════════════════════════════════════════════════
  //  WISHLIST TREE
  // ══════════════════════════════════════════════════════════════════
  async _loadDone() {
    if (this._done) return this._done;
    try { this._done = await LocalDB.get('wishlist_done', {}); } catch (_) { this._done = {}; }
    return this._done;
  }

  async _renderTree() {
    const list = this._el.querySelector('#meshy-tree-list');
    if (!list) return;
    const done = await this._loadDone();
    const all  = wishlistAllItems();
    const doneCount = all.filter(it => done[it.id]).length;
    this._el.querySelector('#meshy-tree-prog').textContent = `${doneCount}/${all.length} gerados`;

    list.innerHTML = '';
    for (const [cat, group] of Object.entries(AssetWishlist)) {
      const header = document.createElement('div');
      header.style.cssText = 'color:#c9f;font-weight:700;margin:10px 0 4px;border-bottom:1px solid #ffffff12;padding-bottom:3px;font-size:12px';
      const gDone = group.items.filter(it => done[it.id]).length;
      header.textContent = `${group.label}  (${gDone}/${group.items.length})`;
      list.appendChild(header);

      for (const it of group.items) {
        const row = document.createElement('div');
        const isDone = !!done[it.id];
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 8px;margin:2px 0;border-radius:6px;cursor:pointer;background:#ffffff06;transition:background .1s';
        row.innerHTML = `
          <span style="flex:1">${isDone ? '✅' : '⬜'} ${it.name}</span>
          <span style="font-size:9px;color:#789">${isDone ? 'feito' : 'gerar →'}</span>`;
        row.onmouseenter = () => row.style.background = '#ffffff14';
        row.onmouseleave = () => row.style.background = '#ffffff06';
        row.onclick = () => this._pickFromTree(it);
        list.appendChild(row);
      }
    }
  }

  _pickFromTree(item) {
    this._tab('asset');
    const promptBox = this._el.querySelector('#meshy-prompt');
    if (promptBox) promptBox.value = item.prompt;
    this._pendingWishId = item.id;
    this._status(`📝 Prompt de "${item.name}" carregado — clique em Gerar Imagem`);
  }

  async _markDone(wishId, generatedAssetId) {
    const done = await this._loadDone();
    done[wishId] = { at: Date.now(), assetId: generatedAssetId };
    this._done = done;
    try { await LocalDB.save('wishlist_done', done); } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════════════
  //  CHARACTER PIPELINE
  // ══════════════════════════════════════════════════════════════════
  _charType() {
    return this._el.querySelector('input[name=chartype]:checked')?.value || 'humanoid';
  }

  _charStatus(msg) {
    const s = this._el.querySelector('#m-char-status');
    if (s) s.textContent = msg || '';
    this._status(msg);
  }

  _charProg(p, txt) {
    const wrap = this._el.querySelector('#m-char-prog');
    const bar  = this._el.querySelector('#m-char-prog-bar');
    const lbl  = this._el.querySelector('#m-char-prog-txt');
    if (!wrap) return;
    wrap.style.display = 'block';
    if (bar) bar.style.width = (p || 0) + '%';
    if (lbl) lbl.textContent = txt || (p + '%');
  }

  _charEnable(id, on = true) {
    const b = this._el.querySelector('#' + id);
    if (b) b.disabled = !on;
  }

  async _charStep1() {
    if (!this._checkKey()) return;
    const base = this._el.querySelector('#meshy-char-prompt').value.trim();
    if (!base) { this._charStatus('Descreva o personagem'); return; }
    const prompt = this.client.characterImagePrompt(base, this._charType());
    this._charStatus('🎨 Gerando imagem T-pose…');
    try {
      const r = await this.client.textToImage(prompt, {
        enhanceSuffix: '',
        onProgress: (p, s) => this._charProg(p, `🎨 ${s} ${p}%`)
      });
      this._state.imageUrl = r.imageUrl;
      const pv = this._el.querySelector('#m-char-preview');
      pv.style.display = 'block';
      this._el.querySelector('#m-char-img').src = r.imageUrl;
      this._charEnable('meshy-c2');
      this._charStatus('✅ Imagem pronta');
    } catch (e) { this._charStatus('❌ ' + e.message); }
  }

  async _charStep2() {
    this._charStatus('🧊 Convertendo para 3D…');
    try {
      const r = await this.client.imageTo3D(this._state.imageUrl, {
        onProgress: (p, s) => this._charProg(p, `🧊 ${s} ${p}%`)
      });
      this._state.modelTaskId = r.taskId;
      this._state.glbUrl = r.glbUrl;
      this._charEnable('meshy-c3');
      this._charStatus('✅ Modelo pronto');
    } catch (e) { this._charStatus('❌ ' + e.message); }
  }

  async _charStep3() {
    this._charStatus(`🦴 Riggando (${this._charType()})…`);
    try {
      const r = await this.client.rig(this._state.modelTaskId, this._charType(), {
        onProgress: (p, s) => this._charProg(p, `🦴 Rig ${s} ${p}%`)
      });
      this._state.riggedTaskId = r.taskId;
      this._state.glbUrl = r.glbUrl || this._state.glbUrl;
      this._charEnable('meshy-c4');
      this._charStatus('✅ Riggado — pode baixar animações');
    } catch (e) { this._charStatus('❌ ' + e.message); }
  }

  async _charStep4() {
    this._charStatus('🎬 Baixando animações…');
    try {
      const anims = await this.client.listAnimations();
      const quad  = this._charType() === 'quadruped';
      const wanted = quad ? ['walk', 'run'] : ['idle', 'walk', 'run', 'attack', 'death'];
      const picked = anims
        .filter(a => wanted.some(w => (a.name || '').toLowerCase().includes(w)))
        .slice(0, quad ? 2 : 6);
      const out = [];
      for (let i = 0; i < picked.length; i++) {
        this._charProg(Math.round((i / picked.length) * 100), '🎬 ' + picked[i].name);
        const r = await this.client.animate(this._state.riggedTaskId, picked[i].id);
        out.push({ name: picked[i].name, glbUrl: r.glbUrl });
      }
      let chars = [];
      try { chars = await LocalDB.get('generated_chars', []); } catch (_) {}
      const id = 'char_' + Date.now().toString(36);
      chars.push({ id, type: this._charType(), baseGlb: this._state.glbUrl, anims: out });
      await LocalDB.save('generated_chars', chars);
      this._charStatus(`✅ Personagem + ${out.length} animações salvos!`);
    } catch (e) { this._charStatus('❌ ' + e.message); }
  }

  // ══════════════════════════════════════════════════════════════════
  //  SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════
  _ensureSession(prompt) {
    if (!this._currentSession) {
      this._currentSession = {
        id: 'sess_' + Date.now().toString(36),
        prompt: prompt || '',
        createdAt: Date.now(),
        image: null,
        glb3d: null,
        glbRemesh: null,
        glbTextured: null,
      };
    }
    return this._currentSession;
  }

  async _saveCurrentSession() {
    const machine = window._activeAssetMachine;
    if (!machine || !this._currentSession) return;
    await machine.saveSession(this._currentSession);
  }

  // ══════════════════════════════════════════════════════════════════
  //  DOWNLOAD
  // ══════════════════════════════════════════════════════════════════
  async _downloadFile(url, filename) {
    if (!url) return;
    this._status('⬇️ Preparando download…');
    try {
      let blobUrl;
      if (url.startsWith('blob:')) {
        blobUrl = url;
      } else {
        const blob = await this.client.downloadToBlobURL(url)
          .then(bu => fetch(bu))
          .then(r => r.blob())
          .catch(() => fetch(url).then(r => r.blob()));
        blobUrl = URL.createObjectURL(blob);
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (_) {} }, 15000);
      this._status('✅ Download iniciado: ' + filename);
    } catch (e) {
      this._status('❌ Download falhou: ' + e.message);
      window.open(url, '_blank');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PLACE FRAME
  // ══════════════════════════════════════════════════════════════════
  _placeFrame() {
    const imageUrl = this._state.imageUrl;
    if (!imageUrl) { this._status('⚠️ Nenhuma imagem gerada ainda'); return; }
    const prompt = this._el.querySelector('#meshy-prompt')?.value?.trim() || 'imagem';
    this.hide();
    setTimeout(() => this.buildMode?.startFramePlacing?.(imageUrl, prompt), 120);
  }

  // ══════════════════════════════════════════════════════════════════
  //  INVENTÁRIO DE IMAGENS
  // ══════════════════════════════════════════════════════════════════

  /** Guarda a imagem atual no inventário do jogo */
  _storeImageInInventory() {
    const imageUrl = this._state.imageUrl;
    if (!imageUrl) { this._status('⚠️ Nenhuma imagem gerada ainda'); return; }
    const inv = window._gameInventory;
    if (!inv?.addImage) { this._status('⚠️ Inventário indisponível'); return; }
    const prompt = this._el.querySelector('#meshy-prompt')?.value?.trim() || 'imagem';
    inv.addImage({ name: prompt.slice(0, 24), imageUrl, prompt });
    this._status('📥 Imagem guardada no inventário! (slots 1-9)');
  }

  /** Abre o seletor de imagens guardadas no inventário */
  _openInvPicker() {
    const picker = this._el.querySelector('#m-inv-picker');
    const grid   = this._el.querySelector('#m-inv-picker-grid');
    const inv    = window._gameInventory;
    const images = inv?.getImages?.() || [];

    grid.innerHTML = '';
    if (!images.length) {
      grid.innerHTML = `<div style="color:#557;font-size:11px;padding:8px">
        Nenhuma imagem guardada. Gere uma e clique em 📥 Guardar.
      </div>`;
    } else {
      for (const item of images) {
        const card = document.createElement('div');
        card.title = item.data.name;
        card.style.cssText = `
          width:62px;height:62px;border-radius:6px;overflow:hidden;cursor:pointer;
          border:1px solid #446;transition:border-color .15s;flex-shrink:0`;
        card.innerHTML = `<img src="${item.data.imageUrl}" style="width:100%;height:100%;object-fit:cover"
                               onerror="this.parentElement.innerHTML='🖼️'">`;
        card.onmouseenter = () => card.style.borderColor = '#7a4aff';
        card.onmouseleave = () => card.style.borderColor = '#446';
        card.onclick = () => {
          picker.style.display = 'none';
          this._useImageAsStep1(item.data.imageUrl, item.data.name, item.data.prompt);
        };
        grid.appendChild(card);
      }
    }
    picker.style.display = 'block';
  }

  /** Usa uma imagem (do inventário) como resultado do passo 1, sem gerar */
  async _useImageAsStep1(imageUrl, name, prompt) {
    this._state.imageUrl = imageUrl;
    const sess = this._ensureSession(prompt || name || '');
    sess.image = imageUrl;
    await this._saveCurrentSession();

    // Preenche o prompt
    const ta = this._el.querySelector('#meshy-prompt');
    if (ta && (prompt || name)) ta.value = prompt || name;

    // Mostra a imagem + ações
    const img = this._el.querySelector('#meshy-img');
    const ph  = this._el.querySelector('#m-img-placeholder');
    img.src = imageUrl;
    img.style.display = 'block';
    ph.style.display = 'none';
    this._el.querySelector('#m-s1-gen').textContent = '🔄 Regerar Imagem';
    this._el.querySelector('#m-step1-approve').style.display = 'block';
    this._el.querySelector('#m-frame-btn').style.display = 'block';
    this._el.querySelector('#m-store-img-btn').style.display = 'block';

    // Mostra no holograma da máquina
    this._machine('startGenerating');
    this._machine('showImage', imageUrl);

    this._stepStatus(1, '✅ Imagem inserida do inventário! Aprove para gerar o 3D.', 'ok');
  }

  /** Coloca o modelo 3D gerado no mapa (entra em modo placing do BuildMode) */
  async _placeAsset() {
    if (!this._state.glbUrl) { this._status('⚠️ Nenhum modelo 3D gerado ainda'); return; }
    const name    = this._el.querySelector('#meshy-name')?.value?.trim() || 'asset';
    const groupId = this._el.querySelector('#meshy-group-sel')?.value || null;
    const groups  = await AssetGroups.getGroups().catch(() => []);
    const group   = groups.find(g => g.id === groupId);

    this.hide();
    setTimeout(() => this.buildMode?.spawnAsset?.({
      kind:       'generated',
      id:         'gen_' + Date.now().toString(36),
      name,
      glbUrl:     this._state.glbUrl,
      groupId,
      groupProps: group?.props ?? {},
    }), 120);
  }

  /** Converte uma imagem (local/blob) em data:URI base64 (p/ Meshy) */
  async _toDataUri(url) {
    if (!url) return null;
    if (/^data:/.test(url)) return url;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const blob = await resp.blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload  = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  STATUS
  // ══════════════════════════════════════════════════════════════════
  _status(msg) {
    const s = this._el.querySelector('#meshy-status');
    if (s) s.textContent = msg || '';
  }

  // ══════════════════════════════════════════════════════════════════
  //  SHOW / HIDE / TOGGLE
  // ══════════════════════════════════════════════════════════════════
  show() {
    this._active = true;
    this._el.style.display = 'flex';
    this._currentSession  = null;
    this._sessionRestored = false;

    // Snapshot the active machine for this session
    this._sessionMachine = window._activeAssetMachine ?? null;
    window._gameInput?.deactivate?.();

    // Reset state
    this._state = { imageUrl: null, modelTaskId: null, glbUrl: null, riggedTaskId: null };
    this._stepDone = { 1: false, 2: false };
    this._currentStep = 1;
    this._libOpen = false;
    this._el.querySelector('#m-lib-drawer').style.right = '-100%';

    this._hideAllStepStatus();
    this._updateStepIndicator();

    // Reset image area
    const img = this._el.querySelector('#meshy-img');
    const ph  = this._el.querySelector('#m-img-placeholder');
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (ph)  ph.style.display = 'flex';
    const genBtn = this._el.querySelector('#m-s1-gen');
    if (genBtn) genBtn.textContent = '🎨 Gerar Imagem';
    const approveRow = this._el.querySelector('#m-step1-approve');
    if (approveRow) approveRow.style.display = 'none';
    const frameBtn = this._el.querySelector('#m-frame-btn');
    if (frameBtn) frameBtn.style.display = 'none';
    const storeBtn = this._el.querySelector('#m-store-img-btn');
    if (storeBtn) storeBtn.style.display = 'none';
    const picker = this._el.querySelector('#m-inv-picker');
    if (picker) picker.style.display = 'none';
    const step2done = this._el.querySelector('#m-step2-done');
    if (step2done) step2done.style.display = 'none';

    // Restore from machine
    this._restoreFromMachine();

    // Check API key
    this.client.checkServerKey().then(serverHas => {
      const keyrow = this._el.querySelector('#meshy-keyrow');
      if (serverHas) {
        if (keyrow) keyrow.style.display = 'none';
        if (!this._sessionRestored) this._status('🔑 Chave carregada do .env — pronto para gerar!');
      } else if (!this.client.hasKey()) {
        if (keyrow) keyrow.style.display = 'flex';
        if (!this._sessionRestored) this._status('⚠️ Configure a chave: edite o .env (MESHY_KEY=...) e reinicie, ou cole aqui');
      }
    });
  }

  async _restoreFromMachine() {
    const machine = this._sessionMachine ?? window._activeAssetMachine;
    if (!machine) return;
    const sessions = await machine.getSessions().catch(() => []);
    if (!sessions.length) return;

    const last = sessions[0];
    if (!last.image && !last.glb3d) return;

    this._currentSession  = last;
    this._sessionRestored = true;

    const ta = this._el.querySelector('#meshy-prompt');
    if (ta && last.prompt) ta.value = last.prompt;

    if (last.image) {
      this._state.imageUrl    = last.image;
      this._state.imageRemote = last.imageRemote || null;
      const img = this._el.querySelector('#meshy-img');
      const ph  = this._el.querySelector('#m-img-placeholder');
      img.src = last.image;
      img.style.display = 'block';
      ph.style.display = 'none';
      this._el.querySelector('#m-s1-gen').textContent = '🔄 Regerar Imagem';
      this._el.querySelector('#m-step1-approve').style.display = 'block';
      this._el.querySelector('#m-frame-btn').style.display = 'block';
      this._el.querySelector('#m-store-img-btn').style.display = 'block';

      const thumb = this._el.querySelector('#m-step1-thumb');
      const lbl   = this._el.querySelector('#m-step1-done-prompt');
      if (thumb) thumb.src = last.image;
      if (lbl)   lbl.textContent = (last.prompt || '').slice(0, 60);

      this._stepDone[1] = true;
      this._currentStep = 2;
    }

    // 3D pronto (remesh ou bruto) → passo 2 concluído + área de salvar
    const bestGlb = last.glbTextured || last.glbRemesh || last.glb3d;
    if (bestGlb) {
      this._state.glbUrl = bestGlb;
      this._state.modelTaskId = last.remeshTaskId || last.modelTaskId || null;
      this._stepDone[2] = true;
      this._currentStep = 2;

      const doneDiv = this._el.querySelector('#m-step2-done');
      if (doneDiv) doneDiv.style.display = 'block';
      this._el.querySelector('#meshy-name').value = (last.prompt || 'asset').slice(0, 28);
      this._populateGroupSel();
    }

    this._updateStepIndicator();

    const msg = bestGlb ? '✅ Asset 3D restaurado — salve ou coloque no mapa!'
                        : '🔄 Imagem restaurada — continue no passo 2 (Gerar 3D)';
    this._status(msg);
  }

  hide() {
    this._active = false;
    this._el.style.display = 'none';
    window._gameInput?.activate?.();
  }

  toggle() {
    this._active ? this.hide() : this.show();
  }
}
