/**
 * Configuração definitiva da Pistola Bucaneira.
 * Este arquivo isola as constantes de posição, rotação e muzzle flash
 * para garantir que a arma nunca mais "desmonte".
 */
export const BUCANEIRA_CONFIG = {
  id: 'pistol',
  label: 'Pistola Bucaneira',
  damage: 35,
  fireRate: 0.3,
  ammo: 8,
  maxAmmo: 8,
  glbKey: 'pistol',
  
  // ── Ajustes do Viewmodel (FPS) ──────────────────────────────────
  viewmodel: {
    // Escala base para caber na tela
    scale: 0.12, 
    // Posição relativa à câmera (X=Direita, Y=Baixo, Z=Frente)
    position: new BABYLON.Vector3(0.25, -0.35, 0.6),
    // Rotação (A Bucaneira precisa olhar para +Z)
    rotation: new BABYLON.Vector3(0, Math.PI, 0),
    // Ponto exato da boca da arma (Muzzle) em espaço local
    muzzleOffset: new BABYLON.Vector3(0, 0.45, -1.8)
  },

  // ── Ajustes do Socket (3ª Pessoa) ───────────────────────────────
  tps: {
    scale: 0.15,
    rotation: new BABYLON.Vector3(Math.PI / 2, Math.PI, 0),
    position: new BABYLON.Vector3(0, 0, 0)
  }
};
