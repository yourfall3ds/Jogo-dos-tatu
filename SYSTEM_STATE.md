# Estado Atual do Sistema (TransFPS) - 28/05/2026

## 🎯 Objetivo Atual
Implementação de um sistema de animação e combate modular (estilo Unreal) que permite:
1. Extração dinâmica de animações de GLBs externos (sem Blender).
2. Sistema de combo (Socos/Chutes) quando desarmado.
3. Máquina de estados para gerenciar armas e combate.

## 🛠️ Arquitetura Nova (game/)
- **`AnimationLibrary`**: Gerencia o "transplante" de animações.
- **`AnimationController`**: Controla playback e locomoção (Idle/Walk/Run).
- **`CombatSystem`**: Gerencia danos e efeitos.
- **`ComboSystem`**: Buffer de input.
- **`PlayerStateMachine`**: Estados (`armed`, `unarmed`, `attacking`, `dodging`, `knockdown`).
- **`ImpactEffectSystem`**: Efeitos visuais de anime.

## ✅ O que foi corrigido
1. **Arma 1 (Pistola) Visível**: A Pistola (Slot 1) tinha sumido por estar configurada com uma escala microscópica no novo sistema de reajuste automático (bounding box). Corrigido: agora ela calcula seu tamanho na mão de forma proporcional (tanto no TPS quanto no FPS).
2. **Arma 2 (Rifle) Retificada**: O rifle foi reposicionado. Girei em `Math.PI` (180 graus) para que a parte certa aponte para frente (não para a sua cara) e também incorporei a lógica de auto-resize para ele.

## ⚠️ Próximos Passos
1. **Espada**: Implementar o moveset de espada usando a pasta `Animacoes de espada`.
2. **Sons de Impacto**: Adicionar sons específicos para o "NHAC" das plantas e os socos/chutes.

## 📍 Onde estamos mexendo
- **`src/game/weapons/PistolaBucaneira.js`**: Reajuste de escala.
- **`src/game/weapons/RiflePesado.js`**: Refino de rotação 180°.
