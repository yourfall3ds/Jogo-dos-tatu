// ─────────────────────────────────────────────────────────────────
//  AssetGroupsUI.js — painel de biblioteca de assets por grupo
//
//  Layout:
//   ┌─ GRUPOS ─────────┬─ ASSETS ────────────────────────────────┐
//   │ 🏗️ Construção 12 │  [card][card][card][card]              │
//   │ 🎨 Decorativos  5│  card: thumb + nome + ações (hover)   │
//   │ 🌿 Natureza     3│  ações: ▶Spawn  →Mover  ✏️Renomear  🗑 │
//   │ ─────────────── │                                          │
//   │ [+] Novo Grupo   │                                          │
//   └──────────────────┴─────────────────────────────────────────┘
//
//  Abrir: window._assetGroupsUI.open()
// ─────────────────────────────────────────────────────────────────
import { AssetGroups } from '../data/AssetGroups.js';
import { LocalDB } from '../data/LocalDB.js';

export class AssetGroupsUI {
  constructor(buildMode) {
    this.buildMode    = buildMode;
    this._visible     = false;
    this._activeGroup = null;  // null = "todos"
    this._groups      = [];
    this._assets      = [];
    this._build();
  }

  // ══════════════════════════════════════════════════════════════
  //  DOM
  // ══════════════════════════════════════════════════════════════
  _build() {
    const el = document.createElement('div');
    el.id    = 'agui-overlay';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9500;display:none;
      background:rgba(0,0,0,.80);backdrop-filter:blur(6px);
      align-items:center;justify-content:center;
    `;
    el.innerHTML = `
      <div id="agui-panel" style="
        width:900px;max-width:95vw;height:82vh;
        background:#0d0d1a;border:2px solid #446;border-radius:14px;
        display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 0 60px rgba(0,0,100,.5);
        font-family:'Segoe UI',monospace;color:#cde;
      ">
        <!-- Cabeçalho -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:12px 18px;border-bottom:1px solid #223;background:#080812">
          <span style="font-size:16px;font-weight:700;letter-spacing:1px;color:#9cf">
            📦 BIBLIOTECA DE ASSETS
          </span>
          <div style="display:flex;gap:8px;align-items:center">
            <span id="agui-total" style="font-size:11px;color:#446"></span>
            <button id="agui-clear" title="Remove tudo que foi colocado no mapa (mantém o mapa-base)" style="
              background:#3a1010;border:1px solid #c44;color:#fbb;
              cursor:pointer;font-size:11px;padding:5px 10px;border-radius:6px
            ">🧹 Limpar Terreno</button>
            <button id="agui-close" style="
              background:#2a1a3a;border:1px solid #557;color:#a8c;
              cursor:pointer;font-size:18px;padding:2px 10px;border-radius:6px
            ">✕</button>
          </div>
        </div>

        <!-- Corpo: grupos (esq) + assets (dir) -->
        <div style="display:flex;flex:1;overflow:hidden">

          <!-- Coluna esquerda: grupos -->
          <div id="agui-groups-col" style="
            width:210px;min-width:210px;
            border-right:1px solid #223;
            display:flex;flex-direction:column;overflow:hidden;
          ">
            <div id="agui-group-list" style="flex:1;overflow-y:auto;padding:8px 0"></div>
            <div style="padding:10px;border-top:1px solid #223">
              <button id="agui-new-group" style="
                width:100%;background:#1a2a3a;border:1px dashed #448;
                color:#88c;cursor:pointer;padding:8px;border-radius:7px;
                font-size:12px;font-family:inherit;transition:.15s
              ">+ Novo Grupo</button>
            </div>
          </div>

          <!-- Coluna direita: assets -->
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <div id="agui-assets-header" style="
              padding:10px 14px;border-bottom:1px solid #223;
              display:flex;align-items:center;justify-content:space-between;
              font-size:12px;color:#668;
            ">
              <span id="agui-group-title">Todos os assets</span>
              <span id="agui-asset-count" style="color:#446"></span>
            </div>
            <div id="agui-asset-grid" style="
              flex:1;overflow-y:auto;padding:14px;
              display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start;
            "></div>
          </div>
        </div>
      </div>

      <!-- Modal: criar / editar grupo -->
      <div id="agui-group-modal" style="
        display:none;position:absolute;
        top:50%;left:50%;transform:translate(-50%,-50%);
        background:#0d0d1a;border:2px solid #668;border-radius:12px;
        padding:20px 24px;width:360px;z-index:9600;
        box-shadow:0 0 40px rgba(0,0,0,.8);
      ">
        <h3 id="agui-modal-title" style="color:#9cf;margin:0 0 14px;font-size:14px"></h3>

        <label style="font-size:11px;color:#668">Nome</label>
        <input id="agui-gname" maxlength="28" placeholder="ex: Itens de Batalha"
          style="width:100%;background:#0a0a16;color:#cdf;border:1px solid #446;
                 padding:7px 10px;border-radius:6px;margin:4px 0 10px;box-sizing:border-box;
                 font-family:inherit;font-size:13px">

        <div style="display:flex;gap:10px;margin-bottom:10px">
          <div style="flex:1">
            <label style="font-size:11px;color:#668">Ícone</label>
            <input id="agui-gicon" maxlength="4" placeholder="🎯"
              style="width:100%;background:#0a0a16;color:#cdf;border:1px solid #446;
                     padding:7px 10px;border-radius:6px;margin-top:4px;box-sizing:border-box;
                     font-size:18px;text-align:center;font-family:inherit">
          </div>
          <div style="flex:1">
            <label style="font-size:11px;color:#668">Cor</label>
            <input id="agui-gcolor" type="color" value="#4a8fff"
              style="width:100%;height:36px;background:#0a0a16;border:1px solid #446;
                     border-radius:6px;margin-top:4px;cursor:pointer;padding:2px">
          </div>
        </div>

        <label style="font-size:11px;color:#668;display:block;margin-bottom:8px">Propriedades</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
          ${['collidable:⬜ Colisão (sólido)', 'breakable:⬜ Quebráveis', 'physics:⬜ Física/Peso', 'castShadows:⬜ Sombra'].map(s => {
            const [k, lbl] = s.split(':');
            return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" id="agui-g${k}" style="cursor:pointer">
              <span>${lbl}</span></label>`;
          }).join('')}
        </div>
        <input id="agui-gdesc" placeholder="Descrição breve (opcional)"
          style="width:100%;background:#0a0a16;color:#cdf;border:1px solid #446;
                 padding:7px 10px;border-radius:6px;margin-bottom:14px;box-sizing:border-box;
                 font-family:inherit;font-size:12px">

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="agui-modal-cancel" style="
            background:#1a1a2a;border:1px solid #446;color:#88c;
            cursor:pointer;padding:7px 18px;border-radius:6px;font-family:inherit
          ">Cancelar</button>
          <button id="agui-modal-save" style="
            background:#2a4a8a;border:1px solid #66f;color:#cdf;
            cursor:pointer;padding:7px 18px;border-radius:6px;font-family:inherit;font-weight:700
          ">Salvar</button>
        </div>
      </div>

      <!-- Modal: mover asset para grupo -->
      <div id="agui-move-modal" style="
        display:none;position:absolute;
        top:50%;left:50%;transform:translate(-50%,-50%);
        background:#0d0d1a;border:2px solid #668;border-radius:12px;
        padding:20px 24px;width:280px;z-index:9600;
        box-shadow:0 0 40px rgba(0,0,0,.8);
      ">
        <h3 style="color:#9cf;margin:0 0 12px;font-size:13px">Mover para grupo</h3>
        <div id="agui-move-list" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto"></div>
        <button id="agui-move-cancel" style="
          margin-top:12px;width:100%;background:#1a1a2a;border:1px solid #446;
          color:#88c;cursor:pointer;padding:7px;border-radius:6px;font-family:inherit
        ">Cancelar</button>
      </div>

      <style>
        #agui-group-list::-webkit-scrollbar,
        #agui-asset-grid::-webkit-scrollbar { width:5px }
        #agui-group-list::-webkit-scrollbar-track,
        #agui-asset-grid::-webkit-scrollbar-track { background:#0a0a16 }
        #agui-group-list::-webkit-scrollbar-thumb,
        #agui-asset-grid::-webkit-scrollbar-thumb  { background:#334;border-radius:3px }

        .agui-group-item {
          display:flex;align-items:center;gap:8px;
          padding:9px 14px;cursor:pointer;font-size:13px;
          border-left:3px solid transparent;transition:.12s;
          user-select:none;
        }
        .agui-group-item:hover  { background:rgba(255,255,255,.05) }
        .agui-group-item.active { background:rgba(80,120,255,.12);border-left-color:var(--gc) }
        .agui-group-item .gcnt  { margin-left:auto;font-size:10px;color:#446 }
        .agui-group-item .gbtn  { opacity:0;font-size:11px;padding:1px 5px;
                                   border-radius:3px;background:#1a1a2a;border:1px solid #335;
                                   color:#88a;cursor:pointer;transition:.1s }
        .agui-group-item:hover .gbtn { opacity:1 }

        .agui-asset-card {
          width:110px;background:#111122;border:1px solid #223;
          border-radius:8px;overflow:hidden;cursor:pointer;
          transition:border-color .15s,transform .12s;position:relative;
          flex-shrink:0;
        }
        .agui-asset-card:hover { border-color:#449;transform:translateY(-2px) }
        .agui-asset-card .thumb {
          width:110px;height:90px;object-fit:cover;display:block;background:#0a0a18;
        }
        .agui-asset-card .no-thumb {
          width:110px;height:90px;display:flex;align-items:center;justify-content:center;
          background:#0a0a18;color:#334;font-size:28px;
        }
        .agui-asset-card .cname {
          padding:5px 6px;font-size:10px;color:#99b;white-space:nowrap;
          overflow:hidden;text-overflow:ellipsis;
        }
        .agui-asset-card .cactions {
          display:none;position:absolute;left:0;right:0;bottom:0;
          background:linear-gradient(transparent,rgba(5,5,20,.6) 40%,rgba(5,5,20,.96));
          flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:3px;
          padding:10px 4px 4px;
        }
        .agui-asset-card:hover .cactions { display:flex }
        .agui-asset-card .cactions button {
          flex:1;min-width:0;height:24px;background:#1a2a40;border:1px solid #557;
          color:#cdf;cursor:pointer;padding:0;border-radius:5px;
          font-family:inherit;font-size:12px;line-height:1;transition:.1s;
          display:flex;align-items:center;justify-content:center;
        }
        .agui-asset-card .cactions button:hover { background:#2a4a78;border-color:#7af;transform:translateY(-1px) }
        .agui-asset-card .cactions button.btn-inv { background:#13344a;border-color:#2ad;color:#bdf }
        .agui-asset-card .cactions button.btn-inv:hover { background:#1a4a6a }
        .agui-asset-card .cactions button.danger { border-color:#733;color:#f88 }
        .agui-asset-card .cactions button.danger:hover { background:#3a1a1a;border-color:#c55 }
        .agui-asset-card .gbadge {
          position:absolute;top:4px;right:4px;
          font-size:14px;background:rgba(0,0,0,.6);
          border-radius:4px;padding:1px 3px;
        }
      </style>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#agui-close').onclick    = () => this.close();
    el.querySelector('#agui-clear').onclick    = async () => {
      if (!confirm('Limpar TODO o terreno colocado (objetos, quadros, máquinas e colisores órfãos)?\nO mapa-base é preservado. Não dá pra desfazer.')) return;
      const c = await window.clearTerrain?.();
      if (c) this._toast(`🧹 Limpo: ${c.placed} obj · ${c.machines} máq · ${c.bodies} corpo(s)`);
    };
    el.querySelector('#agui-new-group').onclick = () => this._openGroupModal(null);
    el.querySelector('#agui-modal-cancel').onclick = () => this._closeGroupModal();
    el.querySelector('#agui-modal-save').onclick   = () => this._saveGroupModal();
    el.querySelector('#agui-move-cancel').onclick  = () => { el.querySelector('#agui-move-modal').style.display = 'none'; };

    // Fecha clicando fora do painel
    el.addEventListener('click', e => {
      if (e.target === el) this.close();
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  Abrir / Fechar
  // ══════════════════════════════════════════════════════════════
  async open() {
    this._visible = true;
    this._el.style.display = 'flex';
    window._gameInput?.deactivate?.();
    // BLINDADO: se a migração (Supabase/LocalDB) lançar, NÃO pode impedir o
    // _refresh — senão a biblioteca abria VAZIA mesmo com os 160 assets nativos.
    try { await AssetGroups.migrateOld(); } catch (e) { console.warn('[AssetGroups] migrateOld falhou:', e?.message); }
    try { await this._refresh(); } catch (e) { console.warn('[AssetGroups] refresh falhou:', e?.message); }
  }

  close() {
    this._visible = false;
    this._el.style.display = 'none';
    window._gameInput?.activate?.();
  }

  // ══════════════════════════════════════════════════════════════
  //  Renderização
  // ══════════════════════════════════════════════════════════════
  async _refresh() {
    // BLINDADO contra EXCEÇÃO **e TRAVAMENTO**: nada de rede pode segurar a lib.
    //  Helper: corre a promessa contra um timeout que resolve num default.
    const race = (p, ms, def) => Promise.race([
      Promise.resolve().then(() => p).catch(() => def),
      new Promise(r => setTimeout(() => r(def), ms)),
    ]);

    // 1) NATIVOS primeiro (hardcoded, SEM rede) → os 160 assets do jogo aparecem
    //    JÁ, mesmo se o Supabase estiver fora/lento. Era isto que faltava: a lib
    //    abria vazia esperando grupos/gerados que travavam/lançavam.
    let builtin = [];
    try { builtin = await AssetGroups.getBuiltinAssets(); } catch (e) { console.warn('[AssetGroups] builtin:', e?.message); }
    this._groups = await race(AssetGroups.getGroups(), 1200, []) || [];
    this._assets = [...builtin];
    this._renderGroups();
    this._renderAssets();

    // 2) GERADOS depois (rede, com timeout) → mescla quando/se chegarem.
    const generated = await race(AssetGroups.getAssets(), 2500, []) || [];
    this._thumbs    = await race(LocalDB.get('asset_thumbnails', {}), 1000, {}) || {};
    this._assets = [...generated, ...builtin];
    this._renderGroups();
    this._renderAssets();
    const tot = this._el.querySelector('#agui-total');
    if (tot) tot.textContent = `${this._assets.length} assets (${generated.length} gerados · ${builtin.length} do jogo)`;
  }

  _renderGroups() {
    const list = this._el.querySelector('#agui-group-list');
    list.innerHTML = '';

    // Opção "Todos"
    list.appendChild(this._groupRow(null, '📦', 'Todos', this._assets.length, null));

    for (const g of this._groups) {
      const cnt = this._assets.filter(a => a.groupId === g.id).length;
      list.appendChild(this._groupRow(g.id, g.icon, g.name, cnt, g));
    }

    // Assets sem grupo
    const orphans = this._assets.filter(a => !a.groupId).length;
    if (orphans > 0) {
      list.appendChild(this._groupRow('__orphan__', '❓', 'Sem grupo', orphans, null));
    }
  }

  _groupRow(id, icon, name, cnt, group) {
    const div = document.createElement('div');
    div.className = 'agui-group-item' + (this._activeGroup === id ? ' active' : '');
    const color = group?.color || '#446';
    div.style.setProperty('--gc', color);
    div.innerHTML = `
      <span style="font-size:16px">${icon}</span>
      <span style="color:${id === this._activeGroup ? '#ddf' : '#99b'}">${name}</span>
      <span class="gcnt">${cnt}</span>
      ${group && !group.builtin ? `<button class="gbtn" title="Editar grupo">✏️</button>` : ''}
    `;
    div.onclick = (e) => {
      if (e.target.classList.contains('gbtn')) {
        this._openGroupModal(group);
        return;
      }
      this._activeGroup = id;
      this._renderGroups();
      this._renderAssets();
    };
    return div;
  }

  _renderAssets() {
    const grid  = this._el.querySelector('#agui-asset-grid');
    const title = this._el.querySelector('#agui-group-title');
    const count = this._el.querySelector('#agui-asset-count');
    grid.innerHTML = '';

    let filtered;
    if (this._activeGroup === null) {
      filtered = this._assets;
      const g  = null;
      title.textContent = '📦 Todos os assets';
    } else if (this._activeGroup === '__orphan__') {
      filtered = this._assets.filter(a => !a.groupId);
      title.textContent = '❓ Sem grupo';
    } else {
      const g  = this._groups.find(g => g.id === this._activeGroup);
      filtered = this._assets.filter(a => a.groupId === this._activeGroup);
      title.innerHTML  = g ? `<span style="color:${g.color}">${g.icon} ${g.name}</span>` : '';
      if (g?.props?.desc) title.innerHTML += ` <span style="color:#446;font-size:10px;margin-left:6px">${g.props.desc}</span>`;
    }

    count.textContent = `${filtered.length} asset${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
      grid.innerHTML = `<div style="color:#335;font-size:13px;margin:30px auto">
        Nenhum asset neste grupo — gere um na Máquina de Criação!
      </div>`;
      return;
    }

    for (const asset of filtered) {
      grid.appendChild(this._assetCard(asset));
    }
  }

  _assetCard(asset) {
    const group = this._groups.find(g => g.id === asset.groupId);
    const div   = document.createElement('div');
    div.className = 'agui-asset-card';

    // Miniatura: gerada (foto) > imagem do asset > placeholder
    const thumbUrl = this._thumbs?.[asset.id] || asset.imageUrl;
    const thumb = thumbUrl
      ? `<img class="thumb" src="${thumbUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="no-thumb" style="display:none">📦</div>`
      : `<div class="no-thumb">📦</div>`;

    // Editar abre o editor isolado pra TODOS; built-in não deleta/renomeia
    // (escala padrão fica dentro do Editor, junto do Gameplay)
    // Botões compactos (só ícone + tooltip) numa faixa na BASE → a miniatura
    //  continua visível no hover (antes o overlay cobria o card inteiro).
    const actions = `
      <button class="btn-inv"   title="Adicionar ao inventário (+1 · Shift = +10)">📌</button>
      <button class="btn-spawn" title="Spawnar agora (mira)">▶</button>
      <button class="btn-edit"  title="Editar asset">✎</button>
      <button class="btn-move"  title="Mover de grupo">→</button>
      ${asset.builtin ? '' : `<button class="btn-delete danger" title="Excluir da biblioteca">🗑</button>`}`;

    div.innerHTML = `
      ${thumb}
      <div class="cname" title="${asset.name}">${asset.name}</div>
      ${group ? `<div class="gbadge" title="${group.name}">${group.icon}</div>` : ''}
      ${asset.builtin ? `<div class="gbadge" style="top:auto;bottom:22px;right:4px;font-size:9px;background:rgba(40,80,160,.7);color:#bcf;padding:1px 4px" title="Asset do jogo">🎮</div>` : ''}
      <div class="cactions">${actions}</div>
    `;

    div.querySelector('.btn-edit').onclick   = () => { this.close(); window._assetEditor?.open?.(asset); };
    const spawnBtn = div.querySelector('.btn-spawn');
    if (spawnBtn) spawnBtn.onclick = () => this._spawn(asset);
    div.querySelector('.btn-inv').onclick    = (e) => { e.stopPropagation(); this._addToInventory(asset, e.shiftKey ? 10 : 1); };
    div.querySelector('.btn-move')?.addEventListener('click', () => this._openMoveModal(asset));
    div.querySelector('.btn-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteAsset(asset);
    });
    // Clique no corpo do card (fora dos ícones) = ação principal: inventário
    div.onclick = (e) => { if (e.target.closest('button')) return; this._addToInventory(asset, e.shiftKey ? 10 : 1); };
    return div;
  }

  /** Recarrega só as miniaturas (chamado após salvar uma no editor) */
  async _reloadThumbs() {
    this._thumbs = await LocalDB.get('asset_thumbnails', {});
    if (this._visible) this._renderAssets();
  }

  // ══════════════════════════════════════════════════════════════
  //  Ações de asset
  // ══════════════════════════════════════════════════════════════
  async _spawn(asset) {
    // Usa as props específicas do asset (override) senão as do grupo
    const props = await AssetGroups.getAssetProps(asset).catch(() => ({}));
    this.close();
    this.buildMode?.spawnAsset?.({
      kind:      asset.kind === 'piece' ? 'piece' : 'generated',
      id:        asset.id,
      name:      asset.name,
      glbUrl:    asset.glbUrl,
      pieceId:   asset.pieceId,
      drag:      asset.drag,
      groupId:   asset.groupId,
      groupProps: props,
    });
  }

  /** Adiciona o asset ao INVENTÁRIO como item construível empilhável. */
  async _addToInventory(asset, qty = 1) {
    const inv = window._gameInventory;
    if (!inv) { this._toast('⚠ inventário indisponível'); return; }
    const props = await AssetGroups.getAssetProps(asset).catch(() => ({}));
    const thumb = this._thumbs?.[asset.id] || asset.imageUrl || null;
    inv.addBuildable({
      assetId:    asset.id,
      name:       asset.name,
      glbUrl:     asset.glbUrl,
      pieceId:    asset.pieceId,        // peça procedural (parede/porta/janela/chão)
      drag:       asset.drag,           // modo arrastar (parede/chão)
      groupId:    asset.groupId,
      groupProps: props,
      thumb,
      qty,
    });
    const total = inv.getBuildables().find(s => s.data?.assetId === asset.id)?.qty || qty;
    this._toast(`📌 "${asset.name}" ×${total} no inventário · Shift = +10 · tecla 1-9 pra colocar`);
  }

  /** Mensagem flutuante rápida (feedback de ação). */
  _toast(msg) {
    let t = this._el.querySelector('#agui-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'agui-toast';
      t.style.cssText = `position:absolute;bottom:18px;left:50%;transform:translateX(-50%);
        background:#0a1a2a;border:1px solid #2ad;color:#bdf;padding:8px 18px;border-radius:8px;
        font-size:12px;z-index:9700;pointer-events:none;transition:opacity .25s;box-shadow:0 0 18px rgba(40,160,220,.4)`;
      this._el.querySelector('#agui-panel').appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  }

  async _deleteAsset(asset) {
    if (!confirm(`Excluir "${asset.name}" da biblioteca?`)) return;
    await AssetGroups.deleteAsset(asset.id);
    await this._refresh();
  }

  async _renameAsset(asset) {
    const name = prompt('Novo nome:', asset.name);
    if (!name || name === asset.name) return;
    await AssetGroups.renameAsset(asset.id, name.trim());
    await this._refresh();
  }

  _openMoveModal(asset) {
    const modal    = this._el.querySelector('#agui-move-modal');
    const list     = this._el.querySelector('#agui-move-list');
    modal.style.display = 'block';
    list.innerHTML = '';

    const options = [
      { id: null, icon: '❓', name: 'Sem grupo', color: '#446' },
      ...this._groups,
    ];

    for (const g of options) {
      if (g.id === asset.groupId) continue;   // já está aqui
      const btn = document.createElement('button');
      btn.style.cssText = `
        display:flex;align-items:center;gap:8px;width:100%;
        background:#111122;border:1px solid #334;color:#bcd;
        cursor:pointer;padding:9px 12px;border-radius:7px;
        font-family:inherit;font-size:12px;text-align:left;
      `;
      btn.innerHTML = `<span style="font-size:16px">${g.icon || '❓'}</span>
                       <span style="color:${g.color || '#446'}">${g.name}</span>`;
      btn.onclick = async () => {
        await AssetGroups.moveAsset(asset.id, g.id);
        modal.style.display = 'none';
        await this._refresh();
      };
      list.appendChild(btn);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  Modal de criar/editar grupo
  // ══════════════════════════════════════════════════════════════
  _openGroupModal(group) {
    const modal = this._el.querySelector('#agui-group-modal');
    const title = this._el.querySelector('#agui-modal-title');
    modal.style.display = 'block';
    this._editingGroup = group;

    title.textContent = group ? `✏️ Editar grupo — ${group.name}` : '✨ Novo grupo';
    this._el.querySelector('#agui-gname').value  = group?.name  || '';
    this._el.querySelector('#agui-gicon').value  = group?.icon  || '📦';
    this._el.querySelector('#agui-gcolor').value = group?.color || '#4a8fff';
    this._el.querySelector('#agui-gdesc').value  = group?.props?.desc || '';
    ['collidable','breakable','physics','castShadows'].forEach(k => {
      const cb = this._el.querySelector(`#agui-g${k}`);
      if (cb) cb.checked = group?.props?.[k] ?? (k === 'castShadows');
    });
  }

  _closeGroupModal() {
    this._el.querySelector('#agui-group-modal').style.display = 'none';
    this._editingGroup = null;
  }

  async _saveGroupModal() {
    const name  = this._el.querySelector('#agui-gname').value.trim();
    const icon  = this._el.querySelector('#agui-gicon').value.trim() || '📦';
    const color = this._el.querySelector('#agui-gcolor').value;
    const desc  = this._el.querySelector('#agui-gdesc').value.trim();
    if (!name) { alert('Digite um nome para o grupo'); return; }

    const props = {};
    ['collidable','breakable','physics','castShadows'].forEach(k => {
      const cb = this._el.querySelector(`#agui-g${k}`);
      props[k] = cb ? cb.checked : false;
    });
    props.desc = desc;

    if (this._editingGroup) {
      const updated = { ...this._editingGroup, name, icon, color, props };
      await AssetGroups.saveGroup(updated);
    } else {
      await AssetGroups.createGroup({ name, icon, color, props });
    }

    this._closeGroupModal();
    await this._refresh();
  }
}
