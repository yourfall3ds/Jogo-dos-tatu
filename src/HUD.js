// ─────────────────────────────────────────────
//  HUD — atualiza elementos da UI a cada frame
// ─────────────────────────────────────────────
export class HUD {
  constructor(player) {
    this.player = player;

    this._wjEl      = document.getElementById('wj-indicator');
    this._stateEl   = document.getElementById('hud-state');
    this._speedEl   = document.getElementById('hud-speed');
    this._ammoEl    = document.getElementById('ammo-count');
    this._reloadEl  = document.getElementById('ammo-reload');
    this._hitEl     = document.getElementById('hit-marker');

    // HP
    this._hpTextEl  = document.getElementById('hp-text');
    this._hpBarEl   = document.getElementById('hp-bar');
    this._vigEl     = document.getElementById('damage-vignette');
    this._deathEl   = document.getElementById('death-screen');

    // Cores por fase do wall jump (NONE / READY)
    this._phaseColor = {
      NONE:  'transparent',
      READY: '#44ff66',
    };

    this._prevHp = 100;

    this._setupCatalog();
  }

  _setupCatalog() {
    this._catalogBtn   = document.getElementById('monster-catalog-btn');
    this._catalogOv    = document.getElementById('monster-catalog-overlay');
    this._catalogClose = document.getElementById('catalog-close-x');
    this._catalogList  = document.getElementById('catalog-list');
    
    if (this._catalogBtn) {
      this._catalogBtn.onclick = () => {
        this._showMonsterCatalog();
      };
    }
    if (this._catalogClose) {
      this._catalogClose.onclick = () => {
        this._catalogOv.classList.remove('visible');
      };
    }
  }

  _showMonsterCatalog() {
    this._catalogOv.classList.add('visible');
    
    // Dados dos monstros (Pode ser expandido conforme novos monstros surgirem)
    const monsters = [
      {
        id: 'monster_plant',
        name: '🌱 Planta Carnívora (Monster Plant)',
        desc: 'Uma criatura vegetal mutante e agressiva. Ela usa pulos elásticos para se locomover e atacar. Cuidado ao chegar perto, sua boca é extremamente rápida e perigosa!',
        attacks: [
          { name: 'Mordida Rápida (Quick Bite)', desc: 'Ataque de curto alcance quando o jogador está colado. Ela abre a bocona e dá um NHAC rápido.' },
          { name: 'Bote Longo (Bite Strike)', desc: 'Ela se encolhe como uma mola e estica o corpo em um avanço longo para morder de longe.' },
          { name: 'Salto Esmagador (Slam)', desc: 'Pula muito alto e cai criando uma onda de choque que empurra e dá dano em área.' },
          { name: 'Pulo de Aproximação', desc: 'Sua forma padrão de movimento. Causa dano de contato se cair em cima do jogador.' }
        ]
      }
    ];

    // Limpa lista
    this._catalogList.innerHTML = '';
    
    monsters.forEach(m => {
      const item = document.createElement('div');
      item.className = 'catalog-item';
      item.textContent = m.name;
      item.onclick = () => {
        // Remove active de todos
        Array.from(this._catalogList.children).forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        this._showMonsterDetails(m);
      };
      this._catalogList.appendChild(item);
    });

    // Seleciona o primeiro por padrão
    if (this._catalogList.firstChild) this._catalogList.firstChild.click();
  }

  _showMonsterDetails(monster) {
    document.getElementById('catalog-empty-msg').style.display = 'none';
    document.getElementById('catalog-monster-info').style.display = 'block';

    document.getElementById('catalog-name').textContent = monster.name;
    document.getElementById('catalog-desc').textContent = monster.desc;

    const attacksList = document.getElementById('catalog-attacks-list');
    attacksList.innerHTML = '';

    monster.attacks.forEach(a => {
      const card = document.createElement('div');
      card.className = 'attack-card';
      card.innerHTML = `<strong>${a.name}</strong><p>${a.desc}</p>`;
      attacksList.appendChild(card);
    });
  }

  update() {
    const info   = this.player.getDebugInfo();
    const weapon = this.player.weapon.getAmmoInfo();

    // ── Wall jump indicator (centro-topo) ────
    this._wjEl.textContent = info.wjIndicator;
    this._wjEl.style.color = this._phaseColor[info.wjPhase] ?? '#fff';

    // ── Estado / posição (bottom-left) ──────
    const wj    = this.player.wallJump;
    const state = info.grounded ? '⬛ Chão' : (wj.isOnWall() ? '🧱 Parede ✅' : '🔲 Ar');
    // 4 modos de câmera: FPS / FPS-Mira / TPS / TPS-Mira
    const persp = info.tpsMode ? '3ª Pessoa' : 'FPS';
    const aim   = info.aiming ? ' 🎯 Mira' : '';
    const cam   = ` | 👁️ ${persp}${aim} [V/RMB]`;
    this._stateEl.textContent = `${state} | WJ: ${info.wjPhase}${cam}`;
    this._speedEl.textContent = `Speed: ${info.speed}  |  XYZ: ${info.pos.x.toFixed(1)}, ${info.pos.y.toFixed(1)}, ${info.pos.z.toFixed(1)}`;

    // ── Ammo (bottom-right) ─────────────────
    if (weapon.reloading) {
      const pct  = Math.max(0, 1 - weapon.timer / 1.6);
      const bars = Math.round(pct * 10);
      this._ammoEl.textContent   = '— / —';
      this._reloadEl.textContent = `🔄 ${'█'.repeat(bars)}${'░'.repeat(10 - bars)}`;
    } else {
      this._ammoEl.textContent   = `${weapon.ammo} / ${weapon.max}`;
      this._reloadEl.textContent = weapon.ammo === 0 ? '[ R ] Recarregar' : '';
    }

    // ── Hit marker flash ────────────────────
    this._hitEl.style.opacity = info.hitFlash ? '1' : '0';

    // ── HP bar ──────────────────────────────
    const pct = Math.max(0, Math.min(1, info.hp / info.maxHp));
    if (this._hpTextEl) this._hpTextEl.textContent = info.hp;
    if (this._hpBarEl) {
      this._hpBarEl.style.width = (pct * 100).toFixed(1) + '%';
      // Cor: verde → amarelo → vermelho conforme HP
      let barColor;
      if (pct > 0.5) {
        // verde → amarelo
        const t = (pct - 0.5) / 0.5;
        const r = Math.round(255 * (1 - t));
        barColor = `linear-gradient(90deg, rgb(${r},220,30), rgb(${Math.min(255,r+60)},255,60))`;
      } else {
        // amarelo → vermelho
        const t = pct / 0.5;
        const g = Math.round(200 * t);
        barColor = `linear-gradient(90deg, rgb(220,${g},10), rgb(255,${g+30},30))`;
      }
      this._hpBarEl.style.background = barColor;
    }

    // ── Damage vignette ─────────────────────
    if (this._vigEl) {
      this._vigEl.style.opacity = info.damageFlash ? '1' : '0';
    }

    // ── Death screen ─────────────────────────
    if (this._deathEl) {
      if (info.dead) {
        this._deathEl.classList.add('visible');
      } else {
        this._deathEl.classList.remove('visible');
      }
    }
  }
}
