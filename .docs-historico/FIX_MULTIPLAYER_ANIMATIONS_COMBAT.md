# 🔧 FIX CRÍTICO - ANIMAÇÕES E COMBATE NO MULTIPLAYER

## PROBLEMA REAL

Players estão vendo TUDO ERRADO no multiplayer:
- Animações trocadas (parado aparece como pulo, etc)
- Armas não aparecem
- Dano não sincroniza visualmente
- Efeitos de combate não aparecem
- Hit detection tá desalinhado
- Knockback não sincroniza
- Estado de morte não sincroniza corretamente

---

## RAIZ DO PROBLEMA

Arquivo: `src/game/multiplayer/RemotePlayer.js`  
Linhas: 63-105 (REMOTE_ANIM_MAP)

### Problema 1: Mapa de Animações INCOMPLETO

```javascript
// Atual (ERRADO):
const REMOTE_ANIM_MAP = {
  idle      : 'Idle_5',
  moving    : 'Walking',
  attacking : 'Run_and_Shoot',
  shooting  : 'Archery_Shot_1',
  // ... e tá faltando MUITA coisa!
};
```

**O que tá faltando:**
- Rodar (run) não tá sincronizado
- Pulo (jump) mal mapeado
- Queda (falling) tá errado
- Reload não sincroniza
- Aim não sincroniza
- Knockdown tá errado
- Estun tá errado
- Death tá errado

### Problema 2: Estados do servidor NÃO chegam corretamente

**Arquivo:** `src\Player.js` (linha 50)
```javascript
this.stateMachine = null; // Setado no main.js quando o sistema de combate carrega
```

O state machine NÃO tá sendo sincronizado pro server!

### Problema 3: Armas não sincronizam visualmente

**Arquivo:** `src/game/multiplayer/RemotePlayer.js` (linha 309-312)

```javascript
case 'weapon':
case 'held_item':
  // Player remoto trocou de arma / item na mão → re-anexa o mesh TPS.
  try { this._attachWeaponFromState(); } catch (e) { console.warn('[RemotePlayer] weapon swap fail', e?.message); }
  break;
```

`_attachWeaponFromState()` não tá implementado! Tá VAZIO!

### Problema 4: Estado de combate não sincroniza

Não tem field de "combating" no state do Colyseus pra sincronizar attack animation overlay.

### Problema 5: Câmera tá tremendo quando leva ou dá tiro

REMOVER TUDO de knockback visual e recoil de câmera.

---

## FIX #1: COMPLETAR REMOTE_ANIM_MAP

**Arquivo:** `src/game/multiplayer/RemotePlayer.js` (linha 63)

**Substituir INTEIRO por:**

```javascript
const REMOTE_ANIM_MAP = {
  // ── LOCOMOÇÃO BÁSICA ──
  idle      : 'Idle_5',              // parado
  unarmed   : 'Idle_5',              // sem arma = parado
  armed     : 'Idle_5',              // arma equipada, parado
  sword     : 'Idle_5',              // espada equipada, parado
  
  // ── ANDAR / CORRER ──
  moving    : 'Walking',             // andando devagar
  walking   : 'Walking',
  walk      : 'Walking',
  
  run       : 'Running',             // NOVO: correr!
  running   : 'Running',
  run_fast  : 'Running',
  run_reload: 'Running_Reload',      // correr recarregando
  reload    : 'Running_Reload',      // recarregar parado
  
  // ── PULO / QUEDA ──
  jump      : 'Regular_Jump',        // pular (sai do chão)
  jumping   : 'Regular_Jump',
  falling   : 'Regular_Jump',        // caindo no ar
  fall      : 'Regular_Jump',
  landed    : 'Idle_5',              // aterrissar = volta ao idle
  
  // ── COMBATE MELEE ──
  attacking : 'Run_and_Shoot',       // ataque genérico
  punch     : 'Run_and_Shoot',       // soco
  melee     : 'Run_and_Shoot',       // golpe melee
  sword_atk : 'Run_and_Shoot',       // golpe de espada
  
  // ── COMBATE RANGED ──
  shooting  : 'Archery_Shot_1',      // tiro com arco
  shoot     : 'Archery_Shot_1',
  firing    : 'Archery_Shot_1',      // disparando
  
  // ── ESQUIVA / EVASÃO ──
  dodging   : 'Roll_Dodge_1',        // esquiva
  dodge     : 'Roll_Dodge_1',
  rolling   : 'Parkour_Vault_with_Roll',  // rolling/tumbling
  roll      : 'Parkour_Vault_with_Roll',
  
  // ── EFEITOS NEGATIVOS ──
  stunned   : 'Parkour_Vault_with_Roll',  // atordoado
  stun      : 'Parkour_Vault_with_Roll',
  knockdown : 'Parkour_Vault_with_Roll',  // nocaute
  knockback : 'Parkour_Vault_with_Roll',  // levando knockback
  pain      : 'Parkour_Vault_with_Roll',  // dano severo
  
  // ── MORTE ──
  dead      : 'Parkour_Vault_with_Roll',  // morto
  death     : 'Parkour_Vault_with_Roll',
  dying     : 'Parkour_Vault_with_Roll',
  
  // ── MIRA / AIM ──
  aim       : 'Walk_Forward_with_Bow_Aimed',      // mirando parado
  aim_idle  : 'Walk_Forward_with_Bow_Aimed',
  aiming    : 'Walk_Forward_with_Bow_Aimed',
  aim_walk  : 'Walk_Forward_with_Bow_Aimed',       // andando mirando
  walk_aim  : 'Walk_Forward_with_Bow_Aimed',
  aim_back  : 'Walk_Backward_with_Bow_Aimed',     // andando pra trás mirando
  
  // ── WALL MECHANICS ──
  wall_ready: 'Climb_Stairs',        // pronto pra escalar parede
  wall_climb: 'Climb_Stairs',        // escalando
  climbing  : 'Climb_Stairs',
  wall_jump : 'Regular_Jump',        // pulando da parede
  wall_slide: 'Climb_Stairs',        // deslizando na parede
  
  // ── OUTROS ──
  slide     : 'Running',             // deslizando (praticamente run)
  dash      : 'Running',             // dashando (praticamente run)
  sprint    : 'Running',             // sprintando
};
```

---

## FIX #2: SINCRONIZAR ARMA DO PLAYER REMOTO

**Arquivo:** `src/game/multiplayer/RemotePlayer.js`

**Adicionar este método NOVO** (após `_playAnimState`):

```javascript
async _attachWeaponFromState() {
  const state = this.state;
  if (!state?.held_item) {
    // Sem arma
    if (this._weaponMesh) this._weaponMesh.setEnabled(false);
    this._weaponId = null;
    return;
  }

  const weaponId = state.held_item;
  if (weaponId === this._weaponId) return; // Já está anexada

  // Detach anterior
  if (this._weaponMesh) this._weaponMesh.setEnabled(false);
  if (this._weaponSocket) this._weaponSocket = null;

  // Carregar novo GLB da arma TPS
  try {
    const weaponPath = `/assets/weapons/tps/${weaponId}.glb`;
    const container = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      '',
      weaponPath,
      this.scene
    );

    if (!container.meshes || !container.meshes.length) return;

    const weaponRoot = container.meshes[0];
    this._weaponMesh = weaponRoot;

    // Procura socket na mão do avatar (osso 'hand' ou 'RightHand')
    const socket = this.root.getChildMeshes(false).find(m =>
      m.name && (m.name.includes('Hand') || m.name.includes('hand'))
    );

    if (socket) {
      weaponRoot.parent = socket;
      weaponRoot.position.set(0, 0, 0);
      weaponRoot.rotation.set(0, 0, 0);
    } else {
      // Fallback: parent no root
      weaponRoot.parent = this.root;
    }

    this._weaponId = weaponId;
  } catch (e) {
    console.warn(`[RemotePlayer] Falha carregar arma ${weaponId}:`, e?.message);
  }
}
```

---

## FIX #3: SINCRONIZAR DANO VISUALMENTE

**Arquivo:** `src/game/multiplayer/RemotePlayer.js`

**Modificar `onSchemaChange` para adicionar:**

```javascript
onSchemaChange(field, newValue) {
  const s = this.state;
  
  // ... código anterior ...

  switch (field) {
    // ... casos anteriores ...

    case 'hp':
      const oldHp = this._lastHp ?? s.maxHp;
      const newHp = newValue;
      const damage = oldHp - newHp;

      if (damage > 0 && !s.dead) {
        // LEVOU DANO
        this._showDamageFlash();    // Piscar vermelho
        this._showDamageNumber(damage);  // Número flutuante
      }

      this._lastHp = newHp;
      this._applyHp(newHp, s.maxHp || 100);
      break;

    case 'dead':
      if (newValue === true) {
        // Player morreu
        this._applyDead(true);
        // Play morte animation
        if (this._avatarAnims?.length) {
          const deathAnim = _resolveRemoteAnim('death', this._avatarAnims);
          if (deathAnim) {
            deathAnim.play(false);
          }
        }
      } else {
        // Respawnou
        this._applyDead(false);
        if (this._avatarAnims?.length) {
          this._playAnimState(s.anim_state || 'idle');
        }
      }
      break;

    case 'anim_state':
      const v = newValue != null ? newValue : (s?.anim_state || "idle");
      // NÃO interrompe ataque em andamento
      if (this._attackingUntil && performance.now() < this._attackingUntil) {
        this._curAnimState = v;
        return;
      }
      this._playAnimState(v);
      break;
  }
}

// ── Método novo: mostrar dano flash ──
_showDamageFlash() {
  if (!this._bodyMat) return;
  const orig = new BABYLON.Color3(this._rgb.r, this._rgb.g, this._rgb.b);
  const flash = new BABYLON.Color3(1, 0.3, 0.3); // Vermelho

  this._bodyMat.diffuseColor = flash;
  
  setTimeout(() => {
    this._bodyMat.diffuseColor = orig;
  }, 100);
}

// ── Método novo: damage number flutuante ──
_showDamageNumber(damage) {
  const dmgEl = document.createElement('div');
  dmgEl.textContent = '-' + Math.round(damage);
  dmgEl.style.cssText = `
    position: fixed;
    font: 700 16px monospace;
    color: #ff4444;
    text-shadow: 0 0 8px #ff0000, 0 1px 3px black;
    pointer-events: none;
    z-index: 70;
  `;

  const screenPos = this._worldToScreen(
    this.root.position.x,
    this.root.position.y + 1.5,
    this.root.position.z
  );

  dmgEl.style.left = screenPos.x + 'px';
  dmgEl.style.top = screenPos.y + 'px';
  document.body.appendChild(dmgEl);

  let y = 0;
  const start = performance.now();
  const duration = 1000;

  const animate = () => {
    const elapsed = performance.now() - start;
    const progress = elapsed / duration;

    if (progress >= 1) {
      dmgEl.remove();
      return;
    }

    y = progress * 60;
    const opacity = 1 - progress;

    dmgEl.style.transform = `translate(-50%, -${y}px)`;
    dmgEl.style.opacity = opacity;

    requestAnimationFrame(animate);
  };

  animate();
}

// ── Método novo: converter mundo pra tela ──
_worldToScreen(x, y, z) {
  const cam = this.scene.activeCamera;
  const projected = BABYLON.Vector3.Project(
    new BABYLON.Vector3(x, y, z),
    BABYLON.Matrix.Identity(),
    this.scene.getTransformMatrix(),
    cam.getProjectionMatrix()
  );

  return {
    x: projected.x * window.innerWidth,
    y: projected.y * window.innerHeight,
  };
}
```

---

## FIX #4: SINCRONIZAR ESTADO DE COMBATE (ATTACK OVERLAY)

**Arquivo:** `src/game/multiplayer/ColyseusClient.js`

**Adicionar listener para evento `remote_fire`** (já existe mas verificar se tá funcionando):

```javascript
this.room.onMessage('remote_fire', (m) => {
  // m = { player_id, weapon_id, hit_count, accuracy }
  const player = this.state?.players?.get(m.player_id);
  if (!player) return;

  // Toca attack overlay no avatar remoto
  try {
    window._remotePlayer?.[m.player_id]?.playAttackOnce?.(m.weapon_id === 'melee' ? 'attacking' : 'shooting', 300);
  } catch (_) {}

  this._notify('remote_fire', m);
});
```

---

---

## FIX #6: SINCRONIZAR ESTADO DE MORTE MELHOR

**Schema precisa ter:**
```
dead: boolean
dead_at: number (timestamp)
respawn_in: number (segundos restantes)
```

**No RemotePlayer.js:**

```javascript
case 'dead':
  if (newValue === true && !this._wasDead) {
    // MORREU AGORA
    this.body.visibility = 0.15; // Fica semi-transparente
    this._applyDead(true);
    
    // Play morte
    if (this._avatarAnims?.length) {
      const deathAnim = _resolveRemoteAnim('death', this._avatarAnims);
      if (deathAnim) deathAnim.play(false);
    }
  } else if (newValue === false && this._wasDead) {
    // RESPAWNOU
    this.body.visibility = 1;
    this._applyDead(false);
    this._playAnimState(s.anim_state || 'idle');
  }
  
  this._wasDead = newValue;
  break;
```

---

## FIX #7: VERIFICAR SE ESTADO TROCOU PRO SERVER

**Arquivo principal: src/main.js**

**Antes do game loop, verificar:**

```javascript
// ✅ VERIFICAÇÃO CRÍTICA
if (!window._localPlayer?.stateMachine) {
  console.error("[CRÍTICO] StateMachine não inicializado! Combate não vai sincronizar!");
}

if (!window._cs?.room?.state?.players) {
  console.error("[CRÍTICO] Colyseus state não conectado! Multiplayer não funciona!");
}
```

---

## CHECKLIST DE IMPLEMENTAÇÃO (HOJE!)

```
[ ] FIX #1: REMOTE_ANIM_MAP completo (10 min)
[ ] FIX #2: _attachWeaponFromState implementado (15 min)
[ ] FIX #3: Dano visual (15 min)
[ ] FIX #4: Attack overlay sync (5 min - verificar)
[ ] FIX #5: Estado de morte melhor (10 min)
[ ] FIX #6: Verificações no main.js (5 min)

TOTAL: ~60 minutos
```

---

## TESTES (DEPOIS DE IMPLEMENTAR)

```
Teste 1: Parado
  Player A: parado
  Player B vê: parado (não pulando!)

Teste 2: Andar
  Player A: andando
  Player B vê: andando

Teste 3: Correr
  Player A: correndo (Shift)
  Player B vê: correndo

Teste 4: Pular
  Player A: pulando (Space)
  Player B vê: pulando

Teste 5: Atirar
  Player A: atirando
  Player B vê: animação de tiro

Teste 6: Receber dano
  Player A: bate em Player B
  Player B vê: flash vermelho + damage number

Teste 7: Morrer
  Player A mata Player B
  Player B vê: animação de morte

Teste 8: Arma
  Player A: troca de arma
  Player B vê: arma nova na mão de A
```

---

## RESULTADO ESPERADO

### ANTES:
```
❌ Parado aparece como pulo
❌ Animações trocadas
❌ Sem arma na mão
❌ Sem dano visual
❌ Morte não sincroniza
```

### DEPOIS:
```
✅ Animações corretas
✅ Arma aparece na mão
✅ Dano mostra visualmente
✅ Morte sincronizada
✅ Parece um jogo de verdade
```

---

## ⚡ COMECE AGORA

1. Abrir: `src/game/multiplayer/RemotePlayer.js`
2. Substituir REMOTE_ANIM_MAP completo (FIX #1)
3. Adicionar métodos novos (FIX #2, #3)
4. Testar com 2 players
5. Se passou: commit!

**Tempo: 70 minutos** 🚀
