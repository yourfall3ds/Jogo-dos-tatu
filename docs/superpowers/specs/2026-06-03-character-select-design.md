# Tela de Seleção de Personagem — TransFPS

**Data:** 2026-06-03
**Status:** Design aprovado, pré-implementação

## Objetivo

Após clicar "Entrar" no servidor, mostrar uma tela de seleção de personagem com
preview 3D, animações ao clicar, som, cenário e efeitos. Ao clicar "JOGAR", o
avatar sai andando pra direita, fade preto rápido, e carrega o mapão (servidor
BRASIL, OPEN_WORLD de biomas).

## Fluxo

```
ServerListUI "Entrar"
   → CharSelectScreen (NOVA)            [escolhe personagem]
   → "JOGAR"
   → transição (avatar anda p/ direita + fade preto rápido)
   → load do mapão (OPEN_WORLD de biomas — servidor BRASIL)
```

Hoje o "Entrar" vai direto pro loading/jogo. A CharSelectScreen entra ANTES do
join real do Colyseus (ou logo após, mas antes do spawn no mundo).

## Personagens (7)

Avatares validados por inspeção (riggados + animados + textura). Cada um é uma
"classe" com idle real + ataque + combo. Caminhos dos GLBs em
`D:\GAMES\FORGOTTEN-INSANITY\assets\characters\sketchfab\*_ready.glb` (CLONAR pro
TransFPS em `assets/characters/`, nunca mexer no original).

| # | Nome (PT-BR) | GLB | idle | ataque 1x | combo |
|---|---|---|---|---|---|
| 1 | 🐭 Rato (padrão) | player.glb (já no jogo) | Idle_5 | Archery_Shot | Run_and_Shoot |
| 2 | ⚔️ Guerreiro Sombrio | dark_warrior_aaa_ready.glb | Idle Ver.1 | Attack Horizontal | Attack 360 Low |
| 3 | 🪓 Orc Bruto | orc_warrior_ready.glb | Orc_Ideal | Orc_Punch | Orc_Punch (2x) |
| 4 | 🏹 Caçadora | cleric_priestess48_ready.glb | Idle | Fire | Roll→Fire |
| 5 | 🔮 Mago | mage_oldwizard_ready.glb | idle | attack | attack (2x) |
| 6 | 🦎 Monstro | lizard_monster_ready.glb | Walking (parado) | Right_Hand_Sword_Slash | Punch_Combo_5 |
| 7 | 💀 Spray-Bnookker | reusa player.glb (rato) | Idle_5 | Archery_Shot | Run_and_Shoot |

- Spray-Bnookker reusa o modelo do rato (até ter GLB próprio), com NOME e SOM
  próprios. Som = `SPRAYBNOOKKER.m4a` (já no projeto, falando o nome).
- Os outros tocam um som genérico de UI (whoosh/select) ao clicar no card.
- Cada avatar guarda os NOMES REAIS das suas anims (idle/attack/combo) — resolver
  por regex no GLB carregado (idle/walk/attack/punch/slash/fire), com fallback.

## Layout

- **Esquerda:** lista de cards das 7 classes (nome + ícone/emoji). Clicável.
- **Direita:** preview 3D do avatar em pé, com **pan manual** (arrastar mouse pra
  girar). Cenário 3D de fundo + efeitos (partículas/luz).
- **Embaixo do preview:** botão **JOGAR** grandão.
- Card selecionado destacado (borda/glow). Rato selecionado por padrão.

## Comportamento ao clicar num card

1. Preview troca pro avatar da classe (carrega o GLB se ainda não carregado).
2. Toca a sequência: **idle → ataque 1x → combo → volta pro idle**. NUNCA T-pose
   nem A-pose. Se o avatar não tiver idle com movimento, usa a 1ª anim de
   locomoção parada (nunca a T-pose).
3. Toca o **som** do personagem (Spray = .m4a; resto = whoosh genérico).

## Comportamento ao clicar JOGAR

1. Avatar **anda pra direita** (anim de walk) saindo da tela.
2. **Fade preto rápido** (~400ms).
3. Já aparece o **load da fase** (loading overlay existente).
4. Join no Colyseus + spawn no mapão (OPEN_WORLD de biomas, servidor BRASIL).
5. O personagem escolhido vira o avatar do player (via CharacterSwapper).

Transição fluida, sem lag/travamento. Pré-carregar o avatar escolhido durante o
fade pra não engasgar.

## Arquitetura / Reúso

- **`CharacterSelectScreen.js` (NOVO)** em `src/game/ui/` — a tela completa
  (cards DOM + preview 3D + JOGAR + transição). Orquestra tudo.
- **Reusar `CharacterSelect3D.js`** (já existe, preview 3D do BR) pra o preview
  rotacionável — ou extrair a parte de render de avatar em cena própria.
- **Reusar `CharacterSwapper`** (já existe) pra aplicar o avatar escolhido no
  player ao entrar no mundo.
- **Reusar o loading overlay** existente (`window._loadingOverlay`).
- Preview usa uma **cena/câmera própria** (ArcRotateCamera com pan) OU um
  RenderTarget — pra não conflitar com a cena principal do jogo.
- Sons via SoundManager (registrar `spray_bnookker` → .m4a; `ui_select` → whoosh).

## Assets a clonar (do Forgotten → TransFPS)

```
dark_warrior_aaa_ready.glb   (13.3MB)
orc_warrior_ready.glb        (5.1MB)
cleric_priestess48_ready.glb (13.1MB)
mage_oldwizard_ready.glb     (7.5MB)
lizard_monster_ready.glb     (9.0MB)
→ assets/characters/ no TransFPS  (~48MB; cada um carrega sob demanda no preview)
```

`SPRAYBNOOKKER.m4a` já está no projeto (mover/copiar pra `assets/Sound FX/`).

## Performance / regras do dono

- Carregar avatar do preview **sob demanda** (só quando o card é clicado), não
  todos no boot. Boot leve.
- Dispose do avatar anterior ao trocar (não vazar).
- Avatares re-fit por bbox (humanóide ~1.8m em pé) — reusar o padrão do projeto.
- NÃO usar PostFX pesado (regra: WebGPU já trava com glow — preview pode ter luz
  + partícula leve, sem bloom).
- Transição sem trabalho síncrono pesado no fade (carregar async).

## Out of scope (YAGNI)

- Voz própria de rato/AzureFin (só Spray tem voz por enquanto).
- Customização de skin/cor por avatar.
- Stats/atributos por classe (todos jogam igual por ora — só visual).
- Seleção de mapa (servidor BRASIL é só o mapão).
