import { ASSET_PATHS } from '../../AssetLoader.js';
import { MOVESETS } from './animationNames.js';
import { AnimationLibrary } from './AnimationLibrary.js';
import { EnemyCatalog } from '../data/EnemyCatalog.js';
import { AssetRegistry } from '../data/AssetRegistry.js';

// Encoda path com espaços/acentos pro fetch funcionar
function _encPath(p) { return p ? p.split('/').map(s => encodeURIComponent(s)).join('/') : p; }

export class AnimatorMode {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;
    this.scene = null;
    this.active = false;
    this.camera = null;
    this.currentModel = null;
    this._uiContainer = null;
    this.animLib = null;
    this._currentCategoryAnims = {}; // Mapeia categoria -> { animName: ag }
  }

  async enter() {
    this.active = true;
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.05, 0.05, 0.05, 1);

    this.camera = new BABYLON.ArcRotateCamera("animCam", -Math.PI / 2, Math.PI / 2.5, 3, BABYLON.Vector3.Up().scale(0.8), this.scene);
    this.camera.wheelPrecision = 100;
    this.camera.lowerRadiusLimit = 0.5;
    this.camera.upperRadiusLimit = 15;
    this.camera.attachControl(this.canvas, true);

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
    light.intensity = 1.2;
    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), this.scene);
    dirLight.intensity = 0.8;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, this.scene);
    const gridMat = new BABYLON.StandardMaterial("gridMat", this.scene);
    gridMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    gridMat.specularColor = BABYLON.Color3.Black();
    ground.material = gridMat;

    this.animLib = new AnimationLibrary(this.scene);
    this._createUI();
    await this.loadModel(ASSET_PATHS.playerUnarmed, "Player (Novo)");
  }

  _createUI() {
    const ui = document.createElement('div');
    ui.id = "animator-ui";
    ui.style.cssText = `
        position: fixed; top: 10px; left: 10px; width: 300px; bottom: 10px;
        background: rgba(0,0,0,0.92); color: white; padding: 15px;
        font-family: 'Segoe UI', sans-serif; border-radius: 12px;
        display: flex; flex-direction: column; z-index: 1000;
        border: 1px solid #ffcc0033; box-shadow: 0 0 20px rgba(0,0,0,0.5);
        overflow: hidden;
    `;

    ui.innerHTML = `
        <h2 style="margin: 0 0 15px 0; color: #ffcc00; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px;">
            <span style="font-size: 18px; letter-spacing: 1px;">LABORATÓRIO 🐭</span>
            <button id="anim-close-btn" style="background:none; border:none; color:#666; cursor:pointer; font-size:24px; transition: 0.2s;">×</button>
        </h2>
        
        <div style="margin-bottom: 20px;">
            <label style="display:block; margin-bottom:8px; font-size:11px; color:#ffcc00; font-weight:bold; letter-spacing:1px; text-transform: uppercase;">Personagens</label>
            <div id="char-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;"></div>
        </div>

        <div style="flex:1; display:flex; flex-direction:column; overflow: hidden;">
            <label style="display:block; margin-bottom:8px; font-size:11px; color:#ffcc00; font-weight:bold; letter-spacing:1px; text-transform: uppercase;">Hierarquia de Animações</label>
            <div id="anim-categories" style="flex:1; overflow-y: auto; padding-right: 5px;" class="custom-scroll"></div>
        </div>

        <style>
            .custom-scroll::-webkit-scrollbar { width: 4px; }
            .custom-scroll::-webkit-scrollbar-track { background: #111; }
            .custom-scroll::-webkit-scrollbar-thumb { background: #ffcc00; border-radius: 10px; }
            #anim-close-btn:hover { color: #f55; transform: rotate(90deg); }
            .cat-header { 
                background: #222; padding: 8px 12px; margin-bottom: 2px; cursor: pointer; 
                border-radius: 4px; font-size: 13px; font-weight: 600; color: #ddd;
                display: flex; justify-content: space-between; align-items: center;
            }
            .cat-header:hover { background: #333; color: #fff; }
            .anim-btn {
                padding: 6px 12px 6px 20px; background: transparent; border: none; 
                color: #aaa; cursor: pointer; text-align: left; font-size: 12px; 
                transition: 0.1s; border-left: 2px solid #333; margin-left: 10px;
            }
            .anim-btn:hover { color: #ffcc00; border-left-color: #ffcc00; background: #ffffff05; }
        </style>
    `;

    document.body.appendChild(ui);
    this._uiContainer = ui;

    ui.querySelector('#anim-close-btn').onclick = () => window.closeAnimator();

    const charList = ui.querySelector('#char-list');

    // Lista de personagens: Player + TODOS os inimigos do catálogo (Digimons,
    // planta Blossomon, etc) resolvidos pelo AssetRegistry. Assim o animator
    // mostra cada bicho real do jogo (não mais a Cocatriz/asset externo).
    const entries = [];
    const playerPath = ASSET_PATHS.playerUnarmed;
    if (playerPath) entries.push({ label: '🐭 Player', path: playerPath });

    for (const [id, def] of Object.entries(EnemyCatalog)) {
        const raw = AssetRegistry.path(def.category, def.asset);
        if (!raw) continue;
        const tierIcon = { rookie:'🥚', champion:'⭐', ultimate:'🌟', mega:'💫', boss:'👑' }[def.tier] || '👾';
        entries.push({ label: `${tierIcon} ${def.name}`, path: _encPath(raw) });
    }

    entries.forEach(item => {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = "padding: 6px; background: #1a1a1a; border: 1px solid #333; color: #eee; cursor: pointer; font-size: 11px; border-radius: 4px;";
        btn.onclick = () => this.loadModel(item.path, item.label);
        charList.appendChild(btn);
    });
  }

  async loadModel(url, name) {
    if (this.currentModel) this.currentModel.dispose();

    const categoriesContainer = this._uiContainer.querySelector('#anim-categories');
    categoriesContainer.innerHTML = '<div style="color:#666; padding: 20px; text-align:center; font-size:12px;">Carregando assets...</div>';

    this._currentCategoryAnims = {};

    try {
        const lastSlash = url.lastIndexOf('/');
        const folder = url.substring(0, lastSlash + 1);
        const file = url.substring(lastSlash + 1);

        const result = await BABYLON.SceneLoader.ImportMeshAsync("", folder, file, this.scene);
        this.currentModel = result.meshes[0];
        this.currentModel.position.y = 0;
        this.camera.setTarget(this.currentModel);

        if (name.includes("Player")) {
            // Organiza por categorias reais do MOVESETS
            for (const [catName, anims] of Object.entries(MOVESETS)) {
                this._currentCategoryAnims[catName] = {};
                for (const [animName, animPath] of Object.entries(anims)) {
                    if (typeof animPath === 'string') {
                        await this.animLib.loadExternalAnimations(animPath, animName, this.currentModel);
                        this._currentCategoryAnims[catName][animName] = this.animLib.get(animName);
                    }
                }
            }
        } else {
            // Outros modelos (Geralmente flat)
            this.animLib.animations.clear();
            this.animLib.registerFromScene();
            this._currentCategoryAnims["Padrão"] = {};
            this.animLib.animations.forEach((ag, name) => {
                this._currentCategoryAnims["Padrão"][name] = ag;
            });
        }

        this._renderCategoryUI();
        console.log(`🎬 [AnimatorMode] Carregado: ${name}`);
    } catch (err) {
        console.error("Erro no Animador:", err);
        categoriesContainer.innerHTML = '<div style="color:#f55; padding: 20px;">Erro ao carregar modelo.</div>';
    }
  }

  _renderCategoryUI() {
    const container = this._uiContainer.querySelector('#anim-categories');
    container.innerHTML = '';

    Object.entries(this._currentCategoryAnims).forEach(([catName, anims]) => {
        // Header da Categoria (Pasta)
        const header = document.createElement('div');
        header.className = 'cat-header';
        const displayName = catName.replace(/_/g, ' ').toUpperCase();
        header.innerHTML = `<span>📂 ${displayName}</span><span style="font-size:10px; color:#666;">${Object.keys(anims).length}</span>`;
        
        const animGroupDiv = document.createElement('div');
        animGroupDiv.style.display = 'flex';
        animGroupDiv.style.flexDirection = 'column';
        animGroupDiv.style.marginBottom = '10px';

        header.onclick = () => {
            const isHidden = animGroupDiv.style.display === 'none';
            animGroupDiv.style.display = isHidden ? 'flex' : 'none';
            header.style.color = isHidden ? '#ffcc00' : '#ddd';
        };

        container.appendChild(header);
        container.appendChild(animGroupDiv);

        // Botões de Animação dentro da categoria
        Object.entries(anims).forEach(([name, ag]) => {
            const btn = document.createElement('button');
            btn.className = 'anim-btn';
            btn.textContent = name;
            btn.onclick = () => {
                this.animLib.animations.forEach(g => g.stop());
                ag.play(true);
            };
            animGroupDiv.appendChild(btn);
        });
    });

    // Toca idle por padrão se existir
    const idle = this.animLib.get('idle');
    if (idle) idle.play(true);
  }

  exit() {
    this.active = false;
    if (this._uiContainer) document.body.removeChild(this._uiContainer);
    if (this.scene) this.scene.dispose();
  }

  render() {
    if (this.active && this.scene) this.scene.render();
  }
}
