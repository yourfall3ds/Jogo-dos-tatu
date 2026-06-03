// ─────────────────────────────────────────────────────────────────
//  Minimap — minimap circular canto inferior direito.
//
//  Padrão de gênero BR (não copyright): círculo top-down com:
//   - Player em centro (apontando direção)
//   - Zona segura (círculo cyan)
//   - Outros players próximos (dots)
//   - Boss / drops (ícones especiais)
// ─────────────────────────────────────────────────────────────────

export class Minimap {
  constructor(cs, auth, elId = 'br-minimap') {
    this.cs = cs; this.auth = auth;
    this._elId = elId;
    this._build();
    this._size = 180;
    this._scale = 0.5; // 1 unidade mundo = 0.5px minimap → 360u visíveis
  }

  _build() {
    // Reaproveita o elemento se já existir (evita DOM duplicado com mesmo id)
    const existing = document.getElementById(this._elId);
    if (existing) {
      this._el = existing;
      this._canvas = existing.querySelector('canvas');
      this._ctx = this._canvas.getContext('2d');
      return;
    }
    const el = document.createElement('div');
    el.id = this._elId;
    el.style.cssText = `
      position:fixed; bottom:14px; right:14px; z-index:88;
      width:180px; height:180px; pointer-events:none; display:none;
      background:radial-gradient(circle, rgba(10,18,40,0.85) 0%, rgba(2,3,10,0.95) 100%);
      border:2px solid rgba(126,239,196,0.5); border-radius:50%;
      box-shadow:0 0 16px rgba(0,0,0,0.6), inset 0 0 20px rgba(126,239,196,0.1);
      overflow:hidden;
    `;
    el.innerHTML = `
      <canvas id="bmm-canvas" width="180" height="180" style="width:100%;height:100%;"></canvas>
      <div style="position:absolute; top:6px; left:50%; transform:translateX(-50%);
                  font:800 9px monospace; letter-spacing:2px; color:#2effb6; pointer-events:none;">
        N
      </div>
    `;
    document.body.appendChild(el);
    this._el = el;
    this._canvas = el.querySelector('#bmm-canvas');
    this._ctx = this._canvas.getContext('2d');
  }

  show() { this._el.style.display = 'block'; }
  hide() { this._el.style.display = 'none'; }

  /** Chamado em 5Hz por BattleRoyaleMode/BattleRoyaleHUD (BR) ou pelo render loop (modo normal) */
  update() {
    const st = this.cs?.state;
    // Mostra no BATTLE_ROYALE (com zona) E no modo normal/OPEN_WORLD (sem zona).
    // Só esconde se não houver estado/conexão.
    if (!st || !st.players) { this.hide(); return; }
    this.show();
    const me = st.players?.get(this.auth?.getUserId());
    if (!me) return;
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    // Coord world -> minimap (rotaciona pelo yaw do player pra "norte = pra frente")
    const myYawRad = (me.ry || 0) * Math.PI / 180;
    const cos = Math.cos(-myYawRad), sin = Math.sin(-myYawRad);
    const worldToMap = (wx, wz) => {
      const dx = wx - (me.x || 0);
      const dz = wz - (me.z || 0);
      // Rotaciona pelo yaw
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return { x: cx + rx * this._scale, y: cy + rz * this._scale };
    };

    // Zona segura (círculo cyan)
    if (st.zone) {
      const z = st.zone;
      const zp = worldToMap(z.cx || 0, z.cz || 0);
      const radiusPx = (z.radius_current || 100) * this._scale;
      // Storm fill fora da zona
      ctx.fillStyle = 'rgba(255,80,90,0.10)';
      ctx.fillRect(0, 0, W, H);
      // Recorta o "buraco" da zona segura
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(zp.x, zp.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Borda da zona
      ctx.strokeStyle = '#2effb6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(zp.x, zp.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      // Próxima zona (target) se shrinking
      if (z.phase === 'SHRINKING' || z.phase === 'WARNING') {
        const targetRpx = (z.radius_target || 100) * this._scale;
        ctx.strokeStyle = 'rgba(255,213,74,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(zp.x, zp.y, targetRpx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Outros players (dots coloridos pela team/party)
    const myParty = me.party_id;
    st.players.forEach((p, id) => {
      if (id === this.auth.getUserId()) return;
      const pos = worldToMap(p.x || 0, p.z || 0);
      // Dentro do círculo?
      const dx = pos.x - cx, dy = pos.y - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > W/2 - 4) return; // fora do alcance
      let color = '#ff5a5a'; // inimigo
      if (myParty && p.party_id === myParty) color = '#9a7eff'; // party
      else if (window._friendIds && window._friendIds.has(id)) color = '#3aa8ff'; // amigo
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Boss
    if (st.boss?.hp > 0) {
      const bp = worldToMap(st.boss.x || 0, st.boss.z || 0);
      const dx = bp.x - cx, dy = bp.y - cy;
      if (Math.sqrt(dx*dx + dy*dy) < W/2 - 4) {
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Centro: player local (triângulo apontando pra cima = direção do view)
    ctx.fillStyle = '#2effb6';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
