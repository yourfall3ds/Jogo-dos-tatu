import { DEBUG } from '../../utils/debug.js';

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
  async loadExternalAnimations(url, name, targetRootMesh, opts = {}) {
    // Separa folder e filename para o Babylon.js
    const lastSlash = url.lastIndexOf('/');
    const folder = url.substring(0, lastSlash + 1);
    const file = url.substring(lastSlash + 1);

    const result = await BABYLON.SceneLoader.ImportMeshAsync(null, folder, file, this.scene);

    // Se o GLB carregado tem animações, vinculamos aos ossos do Player atual.
    if (result.animationGroups.length > 0) {
      let finalAg = null;

      // ── RETARGET OFICIAL (Babylon AnimatorAvatar) — opt-in via opts.retarget ──
      //  Quando os ossos têm os MESMOS nomes mas REST-POSE diferente (ex.: anims
      //  do rato → modelo HUMANO lucasmods), o remap por nome (fallback abaixo)
      //  aplica os keyframes CRUS e CONTORCE o esqueleto. O retargetAnimationKeys
      //  compensa a diferença de rest-pose (math W_target·W_src⁻¹·…) e o
      //  fixRootPosition escala a raiz pela altura (rato baixo → humano alto).
      //  Só é ligado na TROCA de personagem (CharacterSwapper). O boot do rato
      //  (rato→rato) NÃO retarga: seria identidade e custaria por-keyframe à toa.
      if (opts.retarget && typeof BABYLON.AnimatorAvatar === 'function') {
        let mergedSrc = null;
        try {
          // Junta os AGs do arquivo num só "source" (alguns GLBs separam por faixa).
          let sourceAG = result.animationGroups[0];
          if (result.animationGroups.length > 1) {
            mergedSrc = new BABYLON.AnimationGroup(name + '__src', this.scene);
            for (const ag of result.animationGroups) {
              ag.targetedAnimations.forEach(ta => mergedSrc.addTargetedAnimation(ta.animation, ta.target));
            }
            sourceAG = mergedSrc;
          }
          sourceAG.stop();   // fonte DEVE estar em rest-pose antes de retargetar

          const avatar = new BABYLON.AnimatorAvatar(name, targetRootMesh, false);
          const rt = avatar.retargetAnimationGroup(sourceAG, {
            animationGroupName: name,
            retargetAnimationKeys: true,
            fixRootPosition: true,
            fixGroundReference: false,
            rootNodeName: 'Hips',
            checkHierarchy: false,
            fixAnimations: false,
          });
          try { avatar.dispose(); } catch (_) {}  // não dispõe o modelo (só o wrapper)

          if (rt && rt.targetedAnimations && rt.targetedAnimations.length > 0) {
            finalAg = rt;
            DEBUG.log(`[AnimLib] ✅ "${name}" retargetado (${rt.targetedAnimations.length} faixas)`);
          } else {
            try { rt?.dispose?.(); } catch (_) {}
            DEBUG.log(`[AnimLib] retarget "${name}" vazio → fallback remap`);
          }
        } catch (e) {
          console.warn(`[AnimLib] retarget "${name}" falhou (${e?.message}) → fallback remap`);
        } finally {
          try { mergedSrc?.dispose(); } catch (_) {}
        }
      }

      // ── FALLBACK / PADRÃO: remap por nome (rápido; correto p/ mesmo rest-pose) ──
      if (!finalAg) {
        const newAg = new BABYLON.AnimationGroup(name, this.scene);
        const nodesMap = new Map();
        targetRootMesh.getDescendants(false).forEach(n => nodesMap.set(n.name, n));
        let matched = 0, total = 0;
        for (const ag of result.animationGroups) {
          ag.targetedAnimations.forEach(ta => {
            total++;
            const targetNode = nodesMap.get(ta.target.name);
            if (targetNode) { newAg.addTargetedAnimation(ta.animation, targetNode); matched++; }
          });
        }
        if (matched === 0) {
          const glbBones = result.animationGroups.flatMap(ag => ag.targetedAnimations.map(ta => ta.target.name));
          console.warn(
            `[AnimLib] ⚠️ "${name}": 0/${total} ossos mapeados!\n` +
            `  GLB tem: ${[...new Set(glbBones)].join(', ')}\n` +
            `  Player tem: ${[...nodesMap.keys()].slice(0, 10).join(', ')}…`
          );
          newAg.dispose();
        } else {
          DEBUG.log(`[AnimLib] ✅ "${name}": ${matched}/${total} ossos mapeados`);
          finalAg = newAg;
        }
      }

      if (finalAg) { finalAg.stop(); this.animations.set(name, finalAg); }
    }

    // Limpeza pesada: destrói tudo o que veio no arquivo de animação (malhas e esqueletos extras).
    // Adia o dispose das malhas: descartar logo após o ImportMeshAsync pode atingir uma
    // malha ainda em upload pra GPU e travar — o atraso garante que o upload terminou.
    setTimeout(() => {
      result.meshes.forEach(m => { try { if (!m.isDisposed?.()) m.dispose(); } catch (_) {} });
      result.skeletons.forEach(s => { try { s.dispose(); } catch (_) {} });
    }, 50);
    result.animationGroups.forEach(ag => { try { ag.dispose(); } catch (_) {} });
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
      DEBUG.log(`[AnimLib] 🔒 "${name}" root motion XZ travado (${stripped} track).`);
    }

    // ── 2. Trim (limita os frames reproduzidos) ────────────────────
    if (cfg.trimStart != null || cfg.trimEnd != null) {
      const full = ag.to - ag.from;
      const newFrom = ag.from + full * (cfg.trimStart ?? 0);
      const newTo   = ag.from + full * (cfg.trimEnd   ?? 1);
      try {
        ag.normalize(newFrom, newTo);
        DEBUG.log(`[AnimLib] ✂️ "${name}" trim → frames ${newFrom.toFixed(0)}..${newTo.toFixed(0)}`);
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
    DEBUG.log("=== Animações Registradas ===");
    let i = 0;
    this.animations.forEach((ag, key) => {
      DEBUG.log(`${i} - [${key}] (Original: ${ag.name})`);
      i++;
    });
    DEBUG.log("=============================");
  }
}
