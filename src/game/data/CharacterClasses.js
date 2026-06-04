// ─────────────────────────────────────────────────────────────────
//  CharacterClasses — FONTE ÚNICA das classes/skins jogáveis.
//
//  Usado por:
//   • CharacterSelect3D  → preview 3D + troca do model LOCAL.
//   • RemotePlayer       → renderiza/troca AO VIVO o avatar que os
//                          OUTROS players escolheram (estilo VRChat).
//
//  COMO A TROCA DE SKIN VIAJA NA REDE (sem reload de servidor):
//   1. Você confirma uma classe → CharacterSelect3D faz swapper.swap()
//      no SEU model e envia 'br_class_select' { class_id } pro servidor.
//   2. O servidor Colyseus grava PlayerState.class_id e RE-BROADCASTA
//      pra todos via state sync (o campo já existia no schema).
//   3. Cada cliente recebe player_change('class_id') → o RemotePlayer
//      daquele jogador troca o GLB na hora, sem ninguém recarregar nada.
//
//  → class_id é o "endereço" da skin. Os dois lados (local e remoto)
//    resolvem o MESMO url a partir daqui, garantindo que o que você vê
//    de si mesmo é igual ao que os outros veem de você.
//
//  Para ADICIONAR uma skin nova: basta uma linha aqui (o GLB precisa
//  estar acessível pela mesma URL pra todos — assets/ versionado ou
//  Supabase Storage público). Nada de mexer/reiniciar o servidor.
// ─────────────────────────────────────────────────────────────────

// scale 1.164 = calibração do player.glb (rig biped Meshy), igual ao
// que o RemotePlayer/PlayerAnimator já usavam. Modelos com proporções
// diferentes podem sobrescrever `scale` por classe.
const DEFAULT_URL   = 'assets/characters/player.glb';
const DEFAULT_SCALE = 1.164;

export const CHARACTER_CLASSES = [
  { id: 0, name: 'Rato Padrão',       icon: '🐭', url: 'assets/characters/player.glb',                  scale: 1.164, desc: 'Equilibrado · HP médio · velocidade média' },
  { id: 1, name: 'AzureFin',          icon: '🐉', url: 'assets/characters/azurefin.glb',                scale: 1.164, desc: 'Tank · +HP, -velocidade' },
  { id: 2, name: 'Guerreiro Sombrio', icon: '⚔️', url: 'assets/characters/dark_warrior_aaa_ready.glb',  scale: 1.164, desc: 'Dano corpo-a-corpo' },
  { id: 3, name: 'Orc',               icon: '🪓', url: 'assets/characters/orc_warrior_ready.glb',       scale: 1.164, desc: 'Bruto · alto HP' },
  { id: 4, name: 'Mago',              icon: '🧙', url: 'assets/characters/mage_oldwizard_ready.glb',    scale: 1.164, desc: 'Skills à distância' },
  { id: 5, name: 'Clériga',           icon: '✨', url: 'assets/characters/cleric_priestess48_ready.glb', scale: 1.164, desc: 'Suporte · cura' },
  { id: 6, name: 'Lagarto',           icon: '🦎', url: 'assets/characters/lizard_monster_ready.glb',    scale: 1.164, desc: 'Ágil' },
];

/** Devolve a classe pelo id (fallback: classe 0). */
export function classById(id) {
  const cid = parseInt(id);
  return CHARACTER_CLASSES.find((c) => c.id === cid) || CHARACTER_CLASSES[0];
}

/** URL do GLB para um class_id (fallback: model padrão). */
export function urlForClass(id) {
  const c = CHARACTER_CLASSES.find((x) => x.id === parseInt(id));
  return (c && c.url) || DEFAULT_URL;
}

/** Escala do GLB para um class_id (fallback: escala padrão do rato). */
export function scaleForClass(id) {
  const c = CHARACTER_CLASSES.find((x) => x.id === parseInt(id));
  return (c && Number.isFinite(c.scale)) ? c.scale : DEFAULT_SCALE;
}
