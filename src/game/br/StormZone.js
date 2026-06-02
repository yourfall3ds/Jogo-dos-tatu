// ─────────────────────────────────────────────────────────────────
//  StormZone — renderiza o círculo da zona segura no mundo +
//  indicador visual quando player tá fora.
//
//  Inspirado em padrões de gênero (Suroi/PUBG/Apex/Fortnite — design
//  comum, sem copyright em mecânica). Algoritmo clean-room: lê
//  state.zone (cx, cz, radius_current, phase) do Colyseus.
//
//  Visual:
//   - Círculo emissivo no chão (Disc com bordas grossas)
//   - Wall semitransparente vermelha quando SHRINKING (cylinder hollow)
//   - Vinheta vermelha pulsante na tela quando player fora
//   - Compass arrow apontando pra zone center
// ─────────────────────────────────────────────────────────────────

export class StormZone {
  constructor(scene, cs, auth) {
    this.scene = scene;
    this.cs = cs;
    this.auth = auth;
    this._disc = null;
    this._wall = null;
    this._vignette = null;
    this._compassArrow = null;
    this._lastIsOutside = false;
  }

  /** Chamar a cada frame. */
  update(dt) {
    const z = this.cs?.state?.zone;
    if (!z) { this._dispose(); return; }
    this._ensureMeshes(z);

    // Atualiza posição/radius
    if (this._disc) {
      this._disc.position.x = z.cx || 0;
      this._disc.position.z = z.cz || 0;
      this._disc.position.y = 0.1;
      const r = z.radius_current || 100;
      this._disc.scaling.x = r * 2;
      this._disc.scaling.z = r * 2;
    }
    if (this._wall) {
      this._wall.position.x = z.cx || 0;
      this._wall.position.z = z.cz || 0;
      this._wall.position.y = 5;
      const r = z.radius_current || 100;
      this._wall.scaling.x = r;
      this._wall.scaling.z = r;
      // Pulse na intensidade quando shrinking
      if (z.phase === 'SHRINKING' && this._wall.material) {
        const t = performance.now() * 0.003;
        const a = 0.25 + Math.sin(t) * 0.15;
        this._wall.material.alpha = a;
      } else if (this._wall.material) {
        this._wall.material.alpha = 0.12;
      }
    }

    // Verifica se MEU player tá fora
    const me = this.cs?.state?.players?.get(this.auth?.getUserId());
    if (me && z.damage_per_sec > 0) {
      const dx = (me.x || 0) - (z.cx || 0);
      const dz = (me.z || 0) - (z.cz || 0);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const outside = dist > (z.radius_current || 0);
      this._setOutside(outside, z, me);
    } else {
      this._setOutside(false, z, me);
    }
  }

  _ensureMeshes(zone) {
    if (!this._disc) {
      try {
        this._disc = BABYLON.MeshBuilder.CreateDisc('zoneSafeRing',
          { radius: 0.5, tessellation: 64 }, this.scene);
        this._disc.rotation.x = Math.PI / 2;
        const mat = new BABYLON.StandardMaterial('zoneMat', this.scene);
        mat.emissiveColor = new BABYLON.Color3(0.18, 0.93, 0.71);
        mat.alpha = 0.18;
        mat.disableLighting = true;
        // Faz só borda visível: usa wireframe + transparência
        mat.wireframe = false;
        this._disc.material = mat;
        this._disc.isPickable = false;
      } catch (_) {}
    }
    if (!this._wall) {
      try {
        // Cilindro fino e alto como "parede" da storm
        this._wall = BABYLON.MeshBuilder.CreateCylinder('zoneWall',
          { height: 50, diameter: 2, tessellation: 64, sideOrientation: BABYLON.Mesh.BACKSIDE },
          this.scene);
        const mat = new BABYLON.StandardMaterial('wallMat', this.scene);
        mat.emissiveColor = new BABYLON.Color3(1, 0.2, 0.25);
        mat.diffuseColor = new BABYLON.Color3(0.6, 0.1, 0.15);
        mat.alpha = 0.15;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        this._wall.material = mat;
        this._wall.isPickable = false;
      } catch (_) {}
    }
  }

  _setOutside(outside, zone, me) {
    if (outside && !this._vignette) {
      this._buildVignette();
    }
    if (!outside && this._vignette) {
      try { this._vignette.remove(); } catch (_) {}
      this._vignette = null;
    }
    if (outside && this._vignette) {
      // pulse intensity = damage
      const dps = zone.damage_per_sec || 0;
      const k = Math.min(1, dps / 15);
      const t = performance.now() * 0.005;
      const a = 0.18 + Math.sin(t) * 0.12 + k * 0.3;
      this._vignette.style.boxShadow = `inset 0 0 200px rgba(255,40,60,${a.toFixed(2)})`;
      // texto
      const txtEl = this._vignette.querySelector('.zone-dmg-txt');
      if (txtEl) txtEl.textContent = `⚠ FORA DA ZONA · -${dps.toFixed(0)} HP/s`;
    }
    // Compass arrow when outside
    if (outside && !this._compassArrow) this._buildCompass();
    if (!outside && this._compassArrow) {
      try { this._compassArrow.remove(); } catch (_) {}
      this._compassArrow = null;
    }
    if (outside && this._compassArrow && me) {
      const dx = (zone.cx || 0) - (me.x || 0);
      const dz = (zone.cz || 0) - (me.z || 0);
      const angle = Math.atan2(dx, dz);  // radianos
      // Player yaw em graus
      const meYaw = ((me.ry || 0) * Math.PI / 180);
      const relAngle = angle - meYaw;
      this._compassArrow.style.transform = `translateX(-50%) rotate(${relAngle}rad)`;
    }
  }

  _buildVignette() {
    const el = document.createElement('div');
    el.id = 'storm-vignette';
    el.style.cssText = `
      position:fixed; inset:0; z-index:80; pointer-events:none;
      box-shadow:inset 0 0 200px rgba(255,40,60,0.3);
      transition:box-shadow 0.1s;
    `;
    el.innerHTML = `
      <div class="zone-dmg-txt" style="
        position:absolute; top:50%; left:50%; transform:translate(-50%,-150px);
        color:#ff5a5a; font:900 18px 'Segoe UI',monospace; letter-spacing:3px;
        text-shadow:0 0 12px #ff5a5a; text-align:center;">
        ⚠ FORA DA ZONA
      </div>
    `;
    document.body.appendChild(el);
    this._vignette = el;
  }

  _buildCompass() {
    const el = document.createElement('div');
    el.id = 'storm-compass';
    el.style.cssText = `
      position:fixed; bottom:200px; left:50%; transform-origin:center bottom;
      transform:translateX(-50%); z-index:81; pointer-events:none;
    `;
    el.innerHTML = `
      <svg width="48" height="64" viewBox="0 0 48 64">
        <path d="M24 4 L42 40 L24 32 L6 40 Z" fill="#2effb6" stroke="#fff" stroke-width="2"/>
      </svg>
    `;
    document.body.appendChild(el);
    this._compassArrow = el;
  }

  _dispose() {
    if (this._disc) { try { this._disc.dispose(); } catch (_) {} this._disc = null; }
    if (this._wall) { try { this._wall.dispose(); } catch (_) {} this._wall = null; }
    if (this._vignette) { try { this._vignette.remove(); } catch (_) {} this._vignette = null; }
    if (this._compassArrow) { try { this._compassArrow.remove(); } catch (_) {} this._compassArrow = null; }
  }
}
