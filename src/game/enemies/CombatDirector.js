// ─────────────────────────────────────────────────────────────────
//  CombatDirector — povoa a fase com inimigos automaticamente.
//
//  Mantém um número-alvo de inimigos VIVOS perto do jogador, spawnando
//  ao longo do tempo. Só age enquanto o jogo está ativo (pointer lock) —
//  no modo construção / editor / catálogo ele pausa, então não atrapalha.
//
//  • Tecla H  → liga/desliga a horda
//  • Escala   → a cada N kills sobe a "onda": mais inimigos vivos + tiers
//               mais fortes entram no pool.
//
//  Uso (main.js):
//    const director = new CombatDirector(enemyManager, player, scene, level);
//    director.update(dt, input, input.gameActive);
// ─────────────────────────────────────────────────────────────────

export class CombatDirector {
  constructor(enemyManager, player, scene, level) {
    this.mgr    = enemyManager;
    this.player = player;
    this.scene  = scene;
    this.level  = level;

    this.active   = false;     // começa DESLIGADO (paz pra projetar) — tecla H liga
    this._spawnT  = 1.0;       // cooldown até o próximo spawn
    this._kills   = 0;
    this.wave     = 1;
    this._pending = 0;         // spawns em voo (async) p/ não estourar o alvo
    this._wasToggle = false;

    // ── Parâmetros de ritmo ─────────────────────────────────────────
    this.maxAlive      = 4;    // inimigos vivos simultâneos (sobe com a onda)
    this.spawnInterval = 2.4;  // segundos entre spawns
    this.minR = 11;            // anel de spawn ao redor do player
    this.maxR = 24;

    // Pool por tier — só IDs cujo GLB existe de fato.
    this._rookie   = ['blossomon', 'agumon', 'veemon', 'dorumon'];
    this._champion = ['gatomon', 'blackGatomon', 'growlmon'];
    this._pool     = [...this._rookie];

    this._buildHUD();
  }

  // ── API ───────────────────────────────────────────────────────────
  setActive(on) {
    this.active = on;
    this._spawnT = 0.6;
    this._syncHUD();
  }
  toggle() { this.setActive(!this.active); }

  /** Chamado quando um inimigo morre (escala a dificuldade). */
  notifyKill() {
    this._kills++;
    // A cada 6 kills sobe a onda: +1 inimigo vivo (cap 9) e, da onda 3+,
    // champions entram no pool.
    if (this._kills % 6 === 0) {
      this.wave++;
      this.maxAlive = Math.min(9, this.maxAlive + 1);
      this.spawnInterval = Math.max(1.2, this.spawnInterval - 0.15);
      if (this.wave >= 3 && !this._pool.includes('gatomon')) {
        this._pool = [...this._rookie, ...this._champion];
      }
      this._syncHUD();
    }
  }

  // ── Loop ──────────────────────────────────────────────────────────
  update(dt, input, gameActive) {
    // ⚠️ MpGuard: em sala MP, mobs vêm do ArenaRoom (servidor).
    // CombatDirector DESLIGADO automaticamente.
    if (window._mpGuard?.isInMpRoom?.()) {
      if (this.active) {
        this.active = false;
        console.log('[CombatDirector] desligado automaticamente (sala MP)');
      }
      this._syncHUD();
      return;
    }

    // Toggle por tecla H (borda de subida)
    const k = !!input?.isDown?.('KeyH');
    if (k && !this._wasToggle) this.toggle();
    this._wasToggle = k;

    if (!this.active || !gameActive) { this._syncHUD(); return; }

    this._spawnT -= dt;
    const alive = this._aliveCount();
    if (this._spawnT <= 0 && alive + this._pending < this.maxAlive) {
      this._spawnT = this.spawnInterval;
      this._spawnOne();
    }
    this._syncHUD(alive);
  }

  // ── Interno ───────────────────────────────────────────────────────
  _aliveCount() {
    let n = 0;
    for (const e of this.level.enemies) if (e.alive) n++;
    return n;
  }

  async _spawnOne() {
    this._pending++;
    try {
      const id  = this._pool[(Math.random() * this._pool.length) | 0];
      const pos = this._spawnPos();
      await this.mgr.spawn(id, pos);
    } catch (_) { /* asset faltando → ignora */ }
    finally { this._pending--; }
  }

  _spawnPos() {
    const p = this.player.mesh?.position ?? BABYLON.Vector3.Zero();
    const a = Math.random() * Math.PI * 2;
    const r = this.minR + Math.random() * (this.maxR - this.minR);
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    // Spawna um pouco ACIMA do nível do player → a GRAVIDADE do inimigo faz
    //  ele cair e assentar no chão/plataforma. Sem física fixa de altura.
    return new BABYLON.Vector3(x, p.y + 1.5, z);
  }

  // ── HUD mínima (canto inferior-esquerdo) ──────────────────────────
  _buildHUD() {
    let el = document.getElementById('combat-director-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'combat-director-hud';
      el.style.cssText = [
        'position:fixed', 'left:12px', 'bottom:12px', 'z-index:60',
        'font:600 13px/1.4 system-ui,sans-serif', 'color:#fff',
        'background:rgba(10,12,20,0.55)', 'padding:6px 10px', 'border-radius:8px',
        'border:1px solid rgba(255,255,255,0.12)', 'pointer-events:none',
        'text-shadow:0 1px 2px #000', 'backdrop-filter:blur(4px)'
      ].join(';');
      document.body.appendChild(el);
    }
    this._hud = el;
    this._syncHUD();
  }

  _syncHUD(alive) {
    if (!this._hud) return;
    const n = alive ?? this._aliveCount();
    if (this.active) {
      this._hud.innerHTML =
        `⚔️ <b>Horda ON</b> · Onda ${this.wave} · 👾 ${n}/${this.maxAlive} · ☠️ ${this._kills}` +
        ` <span style="opacity:.6">[H]</span>`;
    } else {
      this._hud.innerHTML = `⚔️ Horda OFF <span style="opacity:.6">[H] iniciar</span>`;
    }
  }
}
