export class AnimationLibrary {
  constructor(scene) {
    this.scene = scene;
    this.animations = new Map();
  }

  /**
   * Registra as animações que já estão na cena (ex: as que vieram no GLB principal).
   * @param {Object} mapping - Objeto para renomear { "nomeRuim": "nome_limpo" }
   */
  registerFromScene(mapping = {}) {
    this.scene.animationGroups.forEach(ag => {
      const cleanName = mapping[ag.name] || ag.name;
      this.animations.set(cleanName, ag);
      // Para garantir que não toquem sozinhas no início
      ag.stop();
    });
  }

  /**
   * 🌟 A SOLUÇÃO "SEM BLENDER" 🌟
   * Carrega um GLB externo que contém apenas animações, extrai os AnimationGroups,
   * redireciona os ossos/nós para o mesh do seu Player atual e descarta o mesh baixado.
   * IMPORTANTE: O modelo baixado precisa ter a mesma estrutura de ossos do seu player.
   */
  async loadExternalAnimations(url, name, targetRootMesh) {
    // Separa folder e filename para o Babylon.js
    const lastSlash = url.lastIndexOf('/');
    const folder = url.substring(0, lastSlash + 1);
    const file = url.substring(lastSlash + 1);

    const result = await BABYLON.SceneLoader.ImportMeshAsync(null, folder, file, this.scene);
    
    // Se o GLB carregado tem esqueleto, precisamos garantir que as animações
    // sejam vinculadas aos ossos do Player atual.
    if (result.animationGroups.length > 0) {
      // Mescla todas as AnimationGroups do arquivo num único grupo (alguns GLBs exportam
      // cada propriedade como um grupo separado)
      const newAg = new BABYLON.AnimationGroup(name, this.scene);

      // Mapeia todos os nós do personagem alvo por nome para busca rápida
      const nodesMap = new Map();
      targetRootMesh.getDescendants(false).forEach(n => {
        nodesMap.set(n.name, n);
      });

      let matched = 0;
      let total   = 0;

      for (const ag of result.animationGroups) {
        ag.targetedAnimations.forEach(ta => {
          total++;
          // Busca o nó correspondente APENAS dentro do nosso player
          const targetNode = nodesMap.get(ta.target.name);
          if (targetNode) {
            newAg.addTargetedAnimation(ta.animation, targetNode);
            matched++;
          }
        });
      }

      if (matched === 0) {
        // Nenhum osso correspondeu → provavelmente nomes de ossos diferentes.
        // Registra diagnóstico com os nomes encontrados no GLB de animação.
        const glbBones = result.animationGroups.flatMap(ag =>
          ag.targetedAnimations.map(ta => ta.target.name)
        );
        console.warn(
          `[AnimLib] ⚠️ "${name}": 0/${total} ossos mapeados!\n` +
          `  GLB tem: ${[...new Set(glbBones)].join(', ')}\n` +
          `  Player tem: ${[...nodesMap.keys()].slice(0, 10).join(', ')}…`
        );
        newAg.dispose(); // descarta grupo vazio para não poluir a cena
      } else {
        console.log(`[AnimLib] ✅ "${name}": ${matched}/${total} ossos mapeados`);
        newAg.stop();
        this.animations.set(name, newAg);
      }
    }

    // Limpeza pesada: destrói tudo o que veio no arquivo de animação (malhas e esqueletos extras)
    result.meshes.forEach(m => m.dispose());
    result.skeletons.forEach(s => s.dispose());
    result.animationGroups.forEach(ag => ag.dispose());
  }

  // ════════════════════════════════════════════════════════════════
  //  Pós-processamento de animações (sem Blender)
  // ════════════════════════════════════════════════════════════════

  /**
   * Aplica configurações a uma animação já carregada.
   * @param {string} name
   * @param {Object} cfg
   *   cfg.stripRootXZ  — trava X/Z do osso raiz (Hips) → remove "correr pra frente"
   *   cfg.trimStart    — fração 0..1 do início a manter (ex 0)
   *   cfg.trimEnd      — fração 0..1 do fim a manter (ex 0.25 = só o 1º quarto)
   */
  configure(name, cfg = {}) {
    const ag = this.animations.get(name);
    if (!ag) { console.warn(`[AnimLib] configure: "${name}" não existe`); return; }

    // ── 1. Strip de root motion (trava X/Z do Hips) ────────────────
    if (cfg.stripRootXZ) {
      let stripped = 0;
      for (const ta of ag.targetedAnimations) {
        const bone = ta.target?.name ?? '';
        const prop = ta.animation?.targetProperty ?? '';
        if (!/hips|root/i.test(bone)) continue;
        if (!prop.startsWith('position')) continue;
        const keys = ta.animation.getKeys();
        if (!keys?.length) continue;
        const base = keys[0].value;          // posição do 1º frame
        for (const k of keys) {
          if (k.value && typeof k.value === 'object') {
            // trava X e Z, mantém Y (preserva o "pulinho" vertical natural)
            k.value = new BABYLON.Vector3(base.x, k.value.y, base.z);
          }
        }
        stripped++;
      }
      console.log(`[AnimLib] 🔒 "${name}" root motion XZ travado (${stripped} track).`);
    }

    // ── 2. Trim (limita os frames reproduzidos) ────────────────────
    if (cfg.trimStart != null || cfg.trimEnd != null) {
      const full = ag.to - ag.from;
      const newFrom = ag.from + full * (cfg.trimStart ?? 0);
      const newTo   = ag.from + full * (cfg.trimEnd   ?? 1);
      try {
        ag.normalize(newFrom, newTo);
        console.log(`[AnimLib] ✂️ "${name}" trim → frames ${newFrom.toFixed(0)}..${newTo.toFixed(0)}`);
      } catch (e) {
        console.warn(`[AnimLib] trim falhou em "${name}":`, e.message);
      }
    }
  }

  /** Aplica um mapa { nome: cfg } de uma vez. */
  configureAll(configMap = {}) {
    for (const [name, cfg] of Object.entries(configMap)) {
      if (this.animations.has(name)) this.configure(name, cfg);
    }
  }

  get(name) {
    return this.animations.get(name) || null;
  }

  has(name) {
    return this.animations.has(name);
  }

  list() {
    console.log("=== Animações Registradas ===");
    let i = 0;
    this.animations.forEach((ag, key) => {
      console.log(`${i} - [${key}] (Original: ${ag.name})`);
      i++;
    });
    console.log("=============================");
  }
}
