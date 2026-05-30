# 🧀 TransFPS — Guia de Assets GLB

Todos os assets ficam em `assets/models/`. Após criar cada `.glb`,
veja o comentário `TODO` no código correspondente para saber onde carregá-lo.

---

## 🔫 Viewmodels (câmera FPS — só aparece braços + arma)

| Arquivo | Descrição | Dimensões aprox. |
|---------|-----------|-----------------|
| `viewmodel_rifle.glb` | Braços + rifle automático em FPS (visão de baixo-direita) | Comprimento ~0.5u |
| `viewmodel_pistol.glb` | Braços + pistola | Comprimento ~0.3u |
| `viewmodel_cheese_launcher.glb` | Lançador de queijo 🧀 (arma especial Transformice) | Comprimento ~0.55u |

**Convenções para viewmodel:**
- Origem no ponto de encaixe na câmera (base do punho)
- Eixo Z apontando para frente (boca do cano)
- Ponto de muzzle flash: `empty` chamado `muzzle_point` na hierarquia
- Animações necessárias: `idle`, `shoot`, `reload`, `walk_bob`

---

## 🐭 Personagem (para futura visão 3ª pessoa / multiplayer)

| Arquivo | Descrição |
|---------|-----------|
| `mouse_character.glb` | Personagem rato estilo Transformice (full body) |

**Rig & Animações:**
- Armature humanoide padrão (compatível Mixamo)
- Animações necessárias: `idle`, `run`, `jump`, `fall`, `land`, `shoot`, `death`
- Altura: ~1.8 unidades (escala 1:1 com a cápsula do player)

---

## 🏗️ Ambiente / Mapa

> Você pode criar tiles separados **ou** um único `arena.glb` com o mapa completo.

### Opção A — Tiles modulares (recomendado para flexibilidade)

| Arquivo | Descrição | Dimensão |
|---------|-----------|----------|
| `tile_wall.glb` | Parede lisa (vertical) | 1×2×0.2u |
| `tile_floor.glb` | Piso | 1×0.1×1u |
| `tile_platform.glb` | Plataforma flutuante | 2×0.3×1u |
| `tile_ramp.glb` | Rampa 45° | 2×1×2u |
| `tile_corner.glb` | Canto de parede | 1×2×1u |

**Estética sugerida:** tijolos de queijo amarelados, texturas de roquefort, bordas arredondadas.

### Opção B — Mapa único

| Arquivo | Descrição |
|---------|-----------|
| `arena.glb` | Arena completa com colisores (`_col` suffix para meshes de colisão) |

---

## 📦 Props / Obstáculos dinâmicos

| Arquivo | Descrição | Massa sugerida |
|---------|-----------|----------------|
| `barrel.glb` | Barril de madeira | 60 kg |
| `barrel_explosive.glb` | Barril vermelho (futuro: explode) | 60 kg |
| `crate_wood.glb` | Caixote de madeira | 80 kg |
| `crate_metal.glb` | Caixote metálico pesado | 150 kg |
| `sandbag.glb` | Saco de areia (cobertura) | 0 (estático) |

**Convenções de escala:** 1 unidade = 1 metro.

---

## 🧀 Queijo (objetivo)

| Arquivo | Descrição |
|---------|-----------|
| `cheese_pickup.glb` | Queijo animado giratório (objetivo principal) |
| `cheese_block.glb` | Bloco grande de queijo (obstáculo decorativo) |

**Animações:** `idle_spin` (rotação suave), `collect` (escala→0 com bounce).

---

## ✨ VFX / Partículas

| Arquivo | Descrição |
|---------|-----------|
| `fx_bullet_hole.glb` | Decal de impacto de bala (plano com textura) |
| `fx_muzzle_flash.glb` | Flash de boca do cano (sprite billboard) |
| `fx_smoke_puff.glb` | Nuvem de fumaça (para pouso / explosão) |

---

## 🖼️ Texturas (pasta `assets/textures/`)

| Arquivo | Uso |
|---------|-----|
| `crosshair.png` | Mira customizada (64×64, fundo transparente) |
| `bullet_hole.png` | Decal de bala (256×256) |
| `skybox/` | Pasta com 6 faces do skybox (px, nx, py, ny, pz, nz) |

---

## 🔊 Sons (pasta `assets/audio/`) — para fase 2

| Arquivo | Descrição |
|---------|-----------|
| `sfx_shoot.wav` | Tiro |
| `sfx_reload.wav` | Reload |
| `sfx_jump.wav` | Pulo |
| `sfx_land.wav` | Pouso |
| `sfx_walljump.wav` | Wall jump (whoosh) |
| `sfx_cheese_collect.wav` | Pegar queijo |
| `music_arena.ogg` | Trilha de combate em loop |

---

## 📋 Checklist de integração

Quando um GLB estiver pronto, substitua o placeholder no código:

```js
// WeaponSystem.js — linha ~35:
// TODO: substitua _buildPlaceholderGun() por:
BABYLON.SceneLoader.ImportMeshAsync('', 'assets/models/', 'viewmodel_rifle.glb', scene)
  .then(result => {
    result.meshes[0].parent   = this._root;
    result.meshes[0].position = BABYLON.Vector3.Zero();
  });

// Level.js — topo do arquivo:
// TODO: para tiles/arena GLB, use:
BABYLON.SceneLoader.ImportMeshAsync('', 'assets/models/', 'arena.glb', scene)
  .then(({ meshes }) => {
    for (const m of meshes) {
      if (m.name.endsWith('_col')) {
        // mesh de colisão → física mas invisível
        m.isVisible = false;
        new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.MESH, { mass: 0 }, scene);
      } else {
        m.receiveShadows = true;
        shadowGen.addShadowCaster(m);
      }
    }
  });
```

---

## 🎯 Prioridade de produção

**Sprint 1 (MVP visual):**
1. `viewmodel_rifle.glb` — impacto imediato na feel do jogo
2. `barrel.glb` + `crate_wood.glb` — substitui os placeholders
3. `mouse_character.glb` — para quando adicionar multiplayer

**Sprint 2:**
4. Tiles de parede/piso (ou `arena.glb`)
5. `cheese_pickup.glb`

**Sprint 3:**
6. Todos os VFX
7. Áudio
8. Armas extras
