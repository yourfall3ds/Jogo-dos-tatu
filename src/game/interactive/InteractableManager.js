// ─────────────────────────────────────────────────────────────────
//  InteractableManager — registro + interação (E) + persistência + editor.
//
//   • update(dt): anima todos os interativos, acha o mais próximo no alcance,
//     mostra "[E] …" e dispara no E.
//   • loadForWorld(buildMode): carrega os configs do Supabase e ANEXA cada um ao
//     objeto colocado correspondente (por worldId), com retry (espera o BuildMode
//     restaurar os objetos).
//   • Editor "🔧 Interativos": escolhe um preset e clica num objeto colocado →
//     vira interativo + salva no Supabase (transfps.interactables) → todos veem
//     no reload. (Sync ao vivo de abrir/fechar = próxima fase.)
// ─────────────────────────────────────────────────────────────────
import { getSupabase } from '../auth/SupabaseClient.js';
import { Interactable, INTERACT_PRESETS } from './Interactable.js';

const Store = {
  async save(objectId, type, config) {
    try {
      const supa = await getSupabase();
      const { data: sess } = await supa.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { window._dbg?.('interativo NÃO salvou: sem login', '#ff5050'); return null; }
      if (!objectId) { window._dbg?.('interativo só local (objeto não é do mundo compartilhado)', '#fc8'); return null; }
      const { error } = await supa.schema('transfps').from('interactables')
        .upsert({ id: objectId, object_id: objectId, world_id: 'open', type, config, owner_id: uid }, { onConflict: 'id' });
      if (error) { window._dbg?.('interativo NÃO salvou: ' + error.message, '#ff5050'); return null; }
      return objectId;
    } catch (e) { console.warn('[Interactable] save', e?.message); return null; }
  },
  async loadAll() {
    try {
      const supa = await getSupabase();
      const { data } = await supa.schema('transfps').from('interactables').select('id,object_id,type,config');
      return data || [];
    } catch (_) { return []; }
  },
};

export class InteractableManager {
  constructor(scene, player, buildMode) {
    this.scene = scene;
    this.player = player;
    this.buildMode = buildMode;
    this.items = [];
    this._wasE = false;
    this._pickPreset = null;     // preset aguardando clique no objeto (modo editor)
    this._buildPrompt();
    this._buildEditor();
    this._wirePick();
  }

  add(it) { if (it) this.items.push(it); }

  // ── Loop ─────────────────────────────────────────────────────────
  update(dt) {
    for (const it of this.items) { try { it.update(dt, this.player); } catch (_) {} }
    const pp = this.player?.mesh?.position;
    if (!pp) { this._hidePrompt(); return; }
    // mais próximo com gatilho 'interact'
    let near = null, best = Infinity;
    for (const it of this.items) {
      if (it._auto || it.cfg?.trigger?.kind !== 'interact') continue;
      const c = it.root.getAbsolutePosition ? it.root.getAbsolutePosition() : it.root.position;
      const d = BABYLON.Vector3.Distance(pp, c);
      if (d < (it.range || 3.5) && d < best) { best = d; near = it; }
    }
    if (near) this._showPrompt(near); else this._hidePrompt();
    // E (edge) — só fora do editor/chat
    let eDown = false;
    try { eDown = !!window._gameInput?.isDown?.('KeyE'); } catch (_) {}
    if (near && eDown && !this._wasE) { try { near.trigger(); this._broadcastState(near); } catch (_) {} }
    this._wasE = eDown;
  }

  // ── Carrega do servidor + anexa aos objetos colocados ────────────
  async loadForWorld() {
    const rows = await Store.loadAll();
    for (const r of rows) this._tryAttach(r, 0);
    if (rows.length) window._dbg?.(`${rows.length} interativo(s) no mundo`, '#9fe');
    this._initRealtime();   // liga o tempo real (criar/editar/abrir-fechar pra todos)
  }

  // ── REALTIME (Supabase) — todos veem ao vivo, sem reload ─────────
  async _initRealtime() {
    if (this._rtOn) return; this._rtOn = true;
    try {
      const supa = await getSupabase();
      try { const { data } = await supa.auth.getSession(); const tok = data?.session?.access_token; if (tok) supa.realtime.setAuth(tok); } catch (_) {}
      // 1) Mudanças de CONFIG (alguém tornou um objeto interativo / editou / removeu)
      supa.channel('transfps_interactables')
        .on('postgres_changes', { event: 'INSERT', schema: 'transfps', table: 'interactables' }, (p) => this._onRowChange(p.new))
        .on('postgres_changes', { event: 'UPDATE', schema: 'transfps', table: 'interactables' }, (p) => this._onRowChange(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'transfps', table: 'interactables' }, (p) => this._onRowRemove(p.old?.id))
        .subscribe((s) => { if (s === 'SUBSCRIBED') console.log('[Interactable] 🌍 realtime ATIVO'); });
      // 2) ESTADO ao vivo (abrir/fechar) via broadcast — sem escrever no DB.
      this._stateCh = supa.channel('transfps_interact_state', { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'state' }, (m) => this._onRemoteState(m.payload))
        .subscribe();
    } catch (e) { console.warn('[Interactable] realtime', e?.message); }
  }
  _onRowChange(row) {
    if (!row?.id) return;
    const i = this.items.findIndex((it) => it.id === row.id);
    if (i >= 0) { try { this.items[i].dispose(); } catch (_) {} this.items.splice(i, 1); }
    this._tryAttach({ id: row.id, object_id: row.object_id, type: row.type, config: row.config }, 0);
  }
  _onRowRemove(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i >= 0) { try { this.items[i].dispose(); } catch (_) {} this.items.splice(i, 1); }
  }
  _onRemoteState(p) {
    if (!p?.id) return;
    const it = this.items.find((x) => x.id === p.id);
    if (it) { try { it.setState(p.state); } catch (_) {} }
  }
  _broadcastState(it) {
    try {
      const state = it._dir > 0 ? 1 : 0;   // após trigger(): dir indica pra onde vai
      this._stateCh?.send({ type: 'broadcast', event: 'state', payload: { id: it.id, state } });
    } catch (_) {}
  }
  _tryAttach(row, tries) {
    if (this.items.some((it) => it.id === row.id)) return;            // já anexado
    const root = this.buildMode?.getPlacedRoot?.(row.object_id);
    if (root) { this.add(new Interactable(root, { id: row.id, type: row.type, ...(row.config || {}) })); return; }
    if (tries < 20) setTimeout(() => this._tryAttach(row, tries + 1), 700);  // espera o BuildMode restaurar
  }

  // ── Editor ───────────────────────────────────────────────────────
  _buildEditor() {
    const btn = document.createElement('button');
    btn.textContent = '🔧 Interativos';
    btn.style.cssText = `position:fixed;top:96px;left:230px;z-index:90;background:rgba(20,30,40,0.85);
      color:#bdf;border:1px solid #58a;border-radius:8px;padding:6px 10px;font:700 12px 'Segoe UI',monospace;cursor:pointer;`;
    btn.onclick = () => this._toggleEditor();
    document.body.appendChild(btn);
    this._btn = btn;

    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:130px;left:230px;z-index:90;display:none;width:230px;
      background:rgba(10,16,22,0.94);border:1px solid #47a;border-radius:10px;padding:12px;color:#cde;font:600 12px 'Segoe UI',monospace;`;
    el.innerHTML = `
      <div style="font-weight:800;color:#7cf;margin-bottom:8px;">🔧 INTERATIVOS</div>
      <div style="color:#9bd;font:500 11px monospace;margin-bottom:6px;">1) escolha · 2) clique no objeto colocado</div>
      <div id="ix-presets" style="display:flex;flex-direction:column;gap:5px;"></div>
      <div id="ix-status" style="margin-top:8px;color:#8ac;font:500 11px monospace;min-height:14px;"></div>`;
    document.body.appendChild(el);
    this._panel = el;
    this._status = el.querySelector('#ix-status');
    const PRES = [['door', '🚪 Porta (gira/E)'], ['elevator', '🛗 Elevador (auto)'], ['lift', '🛗 Plataforma (E)'], ['button', '🔘 Botão']];
    const wrap = el.querySelector('#ix-presets');
    for (const [key, label] of PRES) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `background:rgba(25,40,55,0.8);color:#cdf;border:1px solid #47a;border-radius:6px;padding:6px;font:600 11px monospace;cursor:pointer;text-align:left;`;
      b.onclick = () => { this._pickPreset = key; this._status.textContent = 'agora CLIQUE no objeto colocado…'; };
      wrap.appendChild(b);
    }
  }

  _toggleEditor() {
    const on = this._panel.style.display === 'none';
    this._panel.style.display = on ? 'block' : 'none';
    this._btn.style.background = on ? 'rgba(40,90,130,0.95)' : 'rgba(20,30,40,0.85)';
    if (on) { try { window._gameInput?.deactivate?.(); document.exitPointerLock?.(); } catch (_) {} }
    else { this._pickPreset = null; try { window._gameInput?.activate?.(); } catch (_) {} }
  }

  _wirePick() {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this._pickPreset || e.button !== 0) return;
      const hit = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m.isPickable !== false && !m.name?.startsWith('_ghost'));
      if (!hit?.hit || !hit.pickedMesh) { this._status.textContent = 'nada ali — clique num objeto'; return; }
      const found = this.buildMode?.findPlacedByMesh?.(hit.pickedMesh);
      if (!found?.root) { this._status.textContent = 'esse objeto não é colocável/interativo'; return; }
      this._makeInteractive(found, this._pickPreset);
      this._pickPreset = null;
    });
  }

  _makeInteractive(found, presetKey) {
    try {
      const preset = INTERACT_PRESETS[presetKey];
      if (!preset) return;
      const id = found.worldId || ('local_' + Math.random().toString(36).slice(2, 9));
      // remove interativo anterior do mesmo objeto (re-config)
      const old = this.items.findIndex((it) => it.id === id);
      if (old >= 0) { try { this.items[old].dispose(); } catch (_) {} this.items.splice(old, 1); }
      const it = new Interactable(found.root, { id, type: preset.type, ...preset });
      this.add(it);
      Store.save(found.worldId, preset.type, preset);   // persiste (se for objeto do mundo)
      this._status.textContent = '✅ vira ' + presetKey + (found.worldId ? ' (salvo)' : ' (só local)');
      window._dbg?.('objeto agora é interativo: ' + presetKey, '#9fe');
    } catch (e) { this._status.textContent = '❌ ' + (e?.message || 'erro'); }
  }

  // ── Prompt "[E] …" ───────────────────────────────────────────────
  _buildPrompt() {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:88;display:none;
      background:rgba(0,0,0,0.7);color:#fff;border:1px solid #6ad;border-radius:8px;padding:6px 14px;
      font:700 14px 'Segoe UI',monospace;text-shadow:0 1px 2px #000;`;
    document.body.appendChild(el);
    this._promptEl = el;
  }
  _showPrompt(it) {
    const label = it.type === 'door' ? 'Abrir/Fechar' : (it.type === 'mover' ? 'Acionar' : 'Usar');
    this._promptEl.textContent = `[E] ${label}`;
    this._promptEl.style.display = 'block';
  }
  _hidePrompt() { if (this._promptEl) this._promptEl.style.display = 'none'; }

  dispose() {
    for (const it of this.items) { try { it.dispose(); } catch (_) {} }
    this.items = [];
    try { this._btn?.remove(); this._panel?.remove(); this._promptEl?.remove(); } catch (_) {}
  }
}
