export class ImpactEffectSystem {
  constructor(scene) {
    this.scene = scene;
  }

  spawnPunchImpact(position, exactPosition = false) {
    // Efeito anime: hit stop violento + tremor + flash
    this._doCameraShake(0.15);
    this._doHitStop(70); // 70ms congelado para sentir o peso
    this._screenFlash(new BABYLON.Color3(1, 1, 1), 0.05); // Flash branco rápido
    
    const impactPos = position.clone();
    if (!exactPosition) impactPos.y += 1.4; 
    this._createElectricSpark(impactPos, new BABYLON.Color3(0.4, 0.8, 1), 1.5); // Raio azul claro
  }

  spawnKickImpact(position, exactPosition = false) {
    this._doCameraShake(0.25);
    this._doHitStop(100); 
    this._screenFlash(new BABYLON.Color3(1, 0.5, 0), 0.08); // Flash alaranjado
    
    const impactPos = position.clone();
    if (!exactPosition) impactPos.y += 0.8;
    this._createElectricSpark(impactPos, new BABYLON.Color3(1, 0.9, 0.2), 2.2); // Raio amarelo forte
  }

  _screenFlash(color, duration) {
    const overlay = document.getElementById('damage-flash');
    if (overlay) {
      overlay.style.background = `rgba(${color.r*255}, ${color.g*255}, ${color.b*255}, 0.4)`;
      overlay.style.opacity = '1';
      setTimeout(() => { overlay.style.opacity = '0'; }, duration * 1000);
    }
  }

  _createElectricSpark(pos, color, scale) {
    // Cria um efeito de choque/estrela usando caixas cruzadas e esticadas
    const mat = new BABYLON.StandardMaterial("sparkMat", this.scene);
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.alpha = 0.9;

    const sparks = [];
    const numSparks = 4; // 4 linhas formando um asterisco/choque

    for (let i = 0; i < numSparks; i++) {
      const line = BABYLON.MeshBuilder.CreateBox("sparkLine", { width: 0.1, height: 1.5, depth: 0.1 }, this.scene);
      line.position = pos.clone();
      line.material = mat;
      line.scaling.setAll(scale);
      
      // Rotação aleatória louca para simular um raio dinâmico
      line.rotation.x = Math.random() * Math.PI * 2;
      line.rotation.y = Math.random() * Math.PI * 2;
      line.rotation.z = Math.random() * Math.PI * 2;
      
      sparks.push(line);
    }

    // Partícula central brilhante
    const core = BABYLON.MeshBuilder.CreateSphere("sparkCore", { diameter: 0.6, segments: 8 }, this.scene);
    core.position = pos.clone();
    core.material = mat;
    core.scaling.setAll(scale);
    sparks.push(core);

    // Animação super rápida (pop e some)
    let life = 1.0;
    const timer = setInterval(() => {
      life -= 0.15;
      sparks.forEach(s => {
        s.scaling.scaleInPlace(1.1); // Expande rápido
        if (s.material) s.material.alpha = Math.max(0, life);
      });
      
      if (life <= 0) {
        clearInterval(timer);
        sparks.forEach(s => s.dispose());
      }
    }, 16);
  }

  _doCameraShake(intensity) {
    // Aqui assumimos que a câmera pode ser balançada de alguma forma global
    // Caso contrário, apenas deixamos vazio e o _screenFlash dá o feedback visual
  }

  _doHitStop(ms) {
    // Futuro: pausar as animações por X ms para sentir o impacto (Hitstop)
  }
}
