/**
 * Phoenix Wright-style 3D courtroom scene manager.
 * Babylon.js WebGPU engine with N64/retro rendering.
 *
 * Supports:
 * - Procedural fallback characters (box/cylinder)
 * - Mixamo-rigged .glb model loading with skeletal animation
 * - Timeline-driven animation state machine (idle → speaking → objection → gesture)
 * - Evidence display on 3D stand (PDF/image overlay)
 * - CRT post-processing
 */
import {
	type CameraPreset,
	type CourtroomView,
	ROLE_CAMERA_MAP,
	ROLE_COLORS,
	PHASE_CAMERA_MAP,
} from './courtroom-types.js';
import { createCRTPostProcess } from './crt-postprocess.js';

// Lazy-loaded Babylon.js modules (tree-shaken)
let BABYLON: typeof import('@babylonjs/core');
let LOADERS_LOADED = false;

async function loadBabylon() {
	if (!BABYLON) {
		BABYLON = await import('@babylonjs/core');
	}
	if (!LOADERS_LOADED) {
    await import('@babylonjs/loaders/glTF');
    LOADERS_LOADED = true;
  }
	return BABYLON;
}

// ── Camera presets (Phoenix Wright fixed angles) ──
const CAMERA_PRESETS: Record<CourtroomView, CameraPreset> = {
	prosecution: { alpha: -Math.PI * 0.65, beta: Math.PI * 0.38, radius: 8, target: { x: 4, y: 1.2, z: 0 } },
	defense: { alpha: -Math.PI * 0.35, beta: Math.PI * 0.38, radius: 8, target: { x: -4, y: 1.2, z: 0 } },
	judge: { alpha: -Math.PI * 0.5, beta: Math.PI * 0.3, radius: 9, target: { x: 0, y: 2.5, z: -6 } },
	witness: { alpha: -Math.PI * 0.55, beta: Math.PI * 0.38, radius: 7, target: { x: 2, y: 1.2, z: -3 } },
	wide: { alpha: -Math.PI * 0.5, beta: Math.PI * 0.35, radius: 14, target: { x: 0, y: 1.5, z: -2 } },
};

// ── Character station positions ──
const STATIONS: Record<string, { x: number; y: number; z: number }> = {
	prosecutor: { x: 4, y: 0, z: 0 },
	defense: { x: -4, y: 0, z: 0 },
	judge: { x: 0, y: 2.0, z: -6.5 },
	witness: { x: 2, y: 0, z: -3 },
	narrator: { x: 0, y: 0, z: 2 },
};

/** Animation type to Mixamo animation name mapping */
const ANIM_TYPE_MAP: Record<string, string> = {
	idle: 'Idle',
	speaking: 'Talking',
	objection: 'Pointing',
	walk: 'Walking',
	gesture: 'Gesturing',
	point: 'Pointing',
	sit: 'Sitting',
	stand: 'Standing Up',
	present_evidence: 'Presenting',
	react_surprised: 'Surprised',
	react_angry: 'Angry',
	react_sad: 'Sad',
	nod: 'Nodding',
	shake_head: 'Head Shake',
};

/** Character mesh + animation data */
interface CharacterData {
	root: any;          // root mesh or TransformNode
	meshes: any[];      // all meshes
	skeleton?: any;     // Skeleton for animation
	animGroups: Map<string, any>; // AnimationGroup by name
	isModel: boolean;   // true = loaded .glb, false = procedural
	currentAnim?: string;
	// Procedural fallback meshes
	torso?: any;
	head?: any;
}

/** Model definition for loading */
export interface ModelDef {
	role: string;
	modelUrl: string;
	scale?: { x: number; y: number; z: number };
	animations?: Array<{
		name: string;
		url: string;
		animType: string;
	}>;
}

export class CourtroomScene {
  // Reactive state (readable from Svelte components)
  isReady = $state(false);
  engineType = $state<'webgpu' | 'webgl'>('webgl');
  fps = $state(0);
  currentView = $state<CourtroomView>('wide');
  modelsLoaded = $state(false);
  loadingProgress = $state(0);
  activeCharacter = $state<string | null>(null);
  evidenceVisible = $state(false);

  private engine: any = null;
  private scene: any = null;
  private camera: any = null;
  private characters = new Map<string, CharacterData>();
  private crtPostProcess: any = null;
  private animatingCamera = false;
  private renderLoop: (() => void) | null = null;
  private fpsInterval: ReturnType<typeof setInterval> | null = null;
  private evidencePlane: any = null;
  private evidenceMaterial: any = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const B = await loadBabylon();

    // Try WebGPU first, fall back to WebGL2
    try {
      const webgpuEngine = new B.WebGPUEngine(canvas, {
        antialias: false, // N64 style: no AA
        adaptToDeviceRatio: true,
      });
      await webgpuEngine.initAsync();
      this.engine = webgpuEngine;
      this.engineType = 'webgpu';
    } catch {
      this.engine = new B.Engine(canvas, false, {
        adaptToDeviceRatio: true,
        antialias: false,
      });
      this.engineType = 'webgl';
    }

    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0.06, 0.06, 0.08, 1);

    // Fog (N64 style)
    this.scene.fogMode = B.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.02;
    this.scene.fogColor = new B.Color3(0.06, 0.06, 0.08);

    // Camera
    const wide = CAMERA_PRESETS.wide;
    this.camera = new B.ArcRotateCamera(
      'cam',
      wide.alpha,
      wide.beta,
      wide.radius,
      new B.Vector3(wide.target.x, wide.target.y, wide.target.z),
      this.scene
    );
    this.camera.lowerRadiusLimit = 5;
    this.camera.upperRadiusLimit = 20;
    this.camera.inputs.clear(); // Fixed camera — no user interaction

    // Lighting (dramatic courtroom)
    const hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.5;
    hemi.groundColor = new B.Color3(0.1, 0.08, 0.06);

    const spot = new B.PointLight('spot', new B.Vector3(0, 6, -3), this.scene);
    spot.intensity = 1.2;
    spot.diffuse = new B.Color3(1, 0.95, 0.85);

    // Spotlight for active character (dramatic emphasis)
    const charSpot = new B.SpotLight(
      'charSpot',
      new B.Vector3(0, 8, 0),
      new B.Vector3(0, -1, 0),
      Math.PI / 4,
      2,
      this.scene
    );
    charSpot.intensity = 0;
    charSpot.diffuse = new B.Color3(1, 0.95, 0.85);

    // Build courtroom
    this.buildCourtroom(B);
    this.buildProceduralCharacters(B);
    this.buildEvidenceStand(B);

    // Render loop
    this.renderLoop = () => this.scene.render();
    this.engine.runRenderLoop(this.renderLoop);

    // FPS tracking
    this.fpsInterval = setInterval(() => {
      this.fps = Math.round(this.engine.getFps());
    }, 1000);

    // Handle resize
    const resizeHandler = () => this.engine.resize();
    window.addEventListener('resize', resizeHandler);

    this.isReady = true;
  }

  /**
   * Load 3D character models (Mixamo-rigged .glb files).
   * Replaces procedural characters for the specified roles.
   */
  async loadModels(models: ModelDef[]): Promise<void> {
    if (!this.scene || !BABYLON) return;
    const B = BABYLON;
    let loaded = 0;
    this.loadingProgress = 0;

    for (const modelDef of models) {
      try {
        const result = await B.SceneLoader.ImportMeshAsync('', '', modelDef.modelUrl, this.scene);

        const root = result.meshes[0];
        const station = STATIONS[modelDef.role] ?? STATIONS.narrator;

        // Position at station
        root.position = new B.Vector3(station.x, station.y, station.z);

        // Apply scale
        const scale = modelDef.scale ?? { x: 1, y: 1, z: 1 };
        root.scaling = new B.Vector3(scale.x, scale.y, scale.z);

        // Collect animation groups
        const animGroups = new Map<string, any>();
        for (const ag of result.animationGroups) {
          animGroups.set(ag.name, ag);
          ag.stop(); // Stop all by default
        }

        // Remove procedural character for this role
        const existing = this.characters.get(modelDef.role);
        if (existing && !existing.isModel) {
          this.disposeCharacter(existing);
        }

        const charData: CharacterData = {
          root,
          meshes: result.meshes,
          skeleton: result.skeletons?.[0],
          animGroups,
          isModel: true,
        };

        this.characters.set(modelDef.role, charData);

        // Load additional animation clips
        if (modelDef.animations) {
          for (const animDef of modelDef.animations) {
            await this.loadAnimationClip(modelDef.role, animDef.url, animDef.animType);
          }
        }

        // Start idle animation
        this.playAnimation(modelDef.role, 'idle');
      } catch (err) {
        console.warn(`[courtroom] Failed to load model for ${modelDef.role}:`, err);
        // Keep procedural fallback
      }

      loaded++;
      this.loadingProgress = Math.round((loaded / models.length) * 100);
    }

    this.modelsLoaded = true;
  }

  /**
   * Load an additional animation clip from a .glb file and attach it to a character.
   */
  async loadAnimationClip(role: string, url: string, animType: string): Promise<void> {
    if (!this.scene || !BABYLON) return;
    const B = BABYLON;
    const char = this.characters.get(role);
    if (!char || !char.isModel) return;

    try {
      const result = await B.SceneLoader.ImportAnimationsAsync(
        '',
        url,
        this.scene,
        false, // don't override existing
        B.SceneLoaderAnimationGroupLoadingMode.NoSync
      );

      // Map the imported animation groups
      for (const ag of this.scene.animationGroups) {
        if (!char.animGroups.has(animType) && !char.animGroups.has(ag.name)) {
          char.animGroups.set(animType, ag);
          ag.stop();
          break;
        }
      }
    } catch (err) {
      console.warn(`[courtroom] Failed to load animation clip ${animType} for ${role}:`, err);
    }
  }

  /**
   * Play a named animation on a character.
   * Supports both loaded model animations and procedural character fallbacks.
   */
  playAnimation(role: string, animType: string): void {
    const char = this.characters.get(role);
    if (!char) return;

    if (char.isModel) {
      // Stop current animation with blend-out
      if (char.currentAnim) {
        const currentAg = char.animGroups.get(char.currentAnim);
        if (currentAg) {
          // Cross-fade: weight current down over 10 frames
          currentAg.stop();
        }
      }

      // Find animation group — try direct name, then mapped name
      let ag = char.animGroups.get(animType);
      if (!ag) {
        const mappedName = ANIM_TYPE_MAP[animType];
        if (mappedName) {
          // Search by partial name match
          for (const [name, group] of char.animGroups) {
            if (name.toLowerCase().includes(mappedName.toLowerCase())) {
              ag = group;
              break;
            }
          }
        }
      }

      // Fallback to first animation if specific one not found
      if (!ag && char.animGroups.size > 0) {
        ag = char.animGroups.values().next().value;
      }

      if (ag) {
        const shouldLoop = animType === 'idle' || animType === 'speaking';
        ag.start(shouldLoop);
        char.currentAnim = animType;
      }
    } else {
      // Procedural character animation (bob, shake, etc.)
      this.playProceduralAnimation(role, animType);
    }
  }

  /** Switch camera to face the speaking character with smooth animation */
  showCharacter(role: string): void {
    const view = ROLE_CAMERA_MAP[role] ?? 'wide';
    this.transitionToView(view);
    this.activeCharacter = role;

    // Brighten active character, dim others
    for (const [r, charData] of this.characters) {
      const isActive = r === role;
      if (charData.isModel) {
        for (const mesh of charData.meshes) {
          if (mesh.material) {
            mesh.material.alpha = isActive ? 1.0 : 0.6;
          }
        }
      } else if (charData.torso?.material) {
        charData.torso.material.alpha = isActive ? 1.0 : 0.6;
      }
    }

    // Play speaking animation on active character
    this.playAnimation(role, 'speaking');

    // Return others to idle
    for (const [r] of this.characters) {
      if (r !== role) {
        this.playAnimation(r, 'idle');
      }
    }
  }

  /** Transition camera to a named phase */
  setPhase(phase: string): void {
    const view = PHASE_CAMERA_MAP[phase] ?? 'wide';
    this.transitionToView(view);
  }

  /**
   * Execute a timeline keyframe — dispatches to the appropriate handler.
   */
  executeKeyframe(kf: {
    characterRole: string;
    animType: string;
    cameraView?: string | null;
    posX?: number | null;
    posY?: number | null;
    posZ?: number | null;
    rotY?: number | null;
    effect?: string | null;
    evidenceUrl?: string | null;
  }): void {
    // Animation
    if (kf.animType) {
      this.playAnimation(kf.characterRole, kf.animType);
    }

    // Camera
    if (kf.cameraView) {
      this.transitionToView(kf.cameraView as CourtroomView);
    }

    // Position override
    if (kf.posX != null || kf.posY != null || kf.posZ != null) {
      this.moveCharacter(kf.characterRole, kf.posX, kf.posY, kf.posZ);
    }

    // Rotation
    if (kf.rotY != null) {
      const char = this.characters.get(kf.characterRole);
      if (char?.root) {
        char.root.rotation.y = kf.rotY;
      }
    }

    // Effects
    if (kf.effect) {
      this.triggerEffect(kf.effect);
    }

    // Evidence
    if (kf.evidenceUrl) {
      this.showEvidence(kf.evidenceUrl);
    }
  }

  /** Move a character to a new position with smooth animation */
  private moveCharacter(
    role: string,
    x?: number | null,
    y?: number | null,
    z?: number | null
  ): void {
    const char = this.characters.get(role);
    if (!char?.root || !BABYLON) return;
    const B = BABYLON;

    const current = char.root.position;
    const target = new B.Vector3(x ?? current.x, y ?? current.y, z ?? current.z);

    const moveAnim = new B.Animation(
      'charMove',
      'position',
      60,
      B.Animation.ANIMATIONTYPE_VECTOR3,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    moveAnim.setKeys([
      { frame: 0, value: current.clone() },
      { frame: 30, value: target },
    ]);
    const ease = new B.CubicEase();
    ease.setEasingMode(B.EasingFunction.EASINGMODE_EASEINOUT);
    moveAnim.setEasingFunction(ease);

    char.root.animations = [moveAnim];
    this.scene.beginAnimation(char.root, 0, 30, false);
  }

  /** Trigger a visual effect */
  private triggerEffect(effect: string): void {
    switch (effect) {
      case 'screen_flash':
        this.triggerObjection();
        break;
      case 'shake':
        this.triggerCameraShake();
        break;
      case 'spotlight': {
        const charSpot = this.scene?.getLightByName('charSpot');
        if (charSpot) {
          charSpot.intensity = 2.0;
          setTimeout(() => {
            charSpot.intensity = 0;
          }, 2000);
        }
        break;
      }
      case 'dim': {
        const hemi = this.scene?.getLightByName('hemi');
        if (hemi) {
          const origIntensity = hemi.intensity;
          hemi.intensity = 0.15;
          setTimeout(() => {
            hemi.intensity = origIntensity;
          }, 3000);
        }
        break;
      }
    }
  }

  /** Objection! Screen flash + camera shake */
  triggerObjection(): void {
    if (!BABYLON || !this.camera) return;
    const B = BABYLON;

    // Flash: briefly white-out the scene
    const origClear = this.scene.clearColor.clone();
    this.scene.clearColor = new B.Color4(1, 1, 1, 1);
    setTimeout(() => {
      this.scene.clearColor = origClear;
    }, 100);

    this.triggerCameraShake();

    // Play objection animation on active character
    if (this.activeCharacter) {
      this.playAnimation(this.activeCharacter, 'objection');
    }
  }

  private triggerCameraShake(): void {
    if (!this.camera) return;
    const origAlpha = this.camera.alpha;
    const origBeta = this.camera.beta;
    let shakeCount = 0;
    const shakeInterval = setInterval(() => {
      if (shakeCount >= 8) {
        clearInterval(shakeInterval);
        this.camera.alpha = origAlpha;
        this.camera.beta = origBeta;
        return;
      }
      this.camera.alpha = origAlpha + (Math.random() - 0.5) * 0.05;
      this.camera.beta = origBeta + (Math.random() - 0.5) * 0.03;
      shakeCount++;
    }, 30);
  }

  /** Toggle CRT post-processing */
  setCRT(enabled: boolean): void {
    if (!this.camera) return;

    if (enabled && !this.crtPostProcess && BABYLON) {
      this.crtPostProcess = createCRTPostProcess(BABYLON, this.camera, {
        scanlineIntensity: 0.2,
        curvature: 0.3,
        vignetteStrength: 0.5,
        noiseAmount: 0.02,
        chromaticAberration: 0.6,
      });
    } else if (!enabled && this.crtPostProcess) {
      this.crtPostProcess.dispose();
      this.crtPostProcess = null;
    }
  }

  /** Smooth camera transition to a preset */
  private transitionToView(view: CourtroomView): void {
    if (!BABYLON || !this.camera || this.animatingCamera) return;
    if (view === this.currentView) return;

    const preset = CAMERA_PRESETS[view];
    if (!preset) return;

    this.animatingCamera = true;
    this.currentView = view;

    const B = BABYLON;
    const fps = 60;
    const frames = 30; // 0.5 seconds

    const alphaAnim = new B.Animation(
      'camAlpha',
      'alpha',
      fps,
      B.Animation.ANIMATIONTYPE_FLOAT,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    alphaAnim.setKeys([
      { frame: 0, value: this.camera.alpha },
      { frame: frames, value: preset.alpha },
    ]);

    const betaAnim = new B.Animation(
      'camBeta',
      'beta',
      fps,
      B.Animation.ANIMATIONTYPE_FLOAT,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    betaAnim.setKeys([
      { frame: 0, value: this.camera.beta },
      { frame: frames, value: preset.beta },
    ]);

    const radiusAnim = new B.Animation(
      'camRadius',
      'radius',
      fps,
      B.Animation.ANIMATIONTYPE_FLOAT,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    radiusAnim.setKeys([
      { frame: 0, value: this.camera.radius },
      { frame: frames, value: preset.radius },
    ]);

    const targetAnim = new B.Animation(
      'camTarget',
      'target',
      fps,
      B.Animation.ANIMATIONTYPE_VECTOR3,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    targetAnim.setKeys([
      { frame: 0, value: this.camera.target.clone() },
      { frame: frames, value: new B.Vector3(preset.target.x, preset.target.y, preset.target.z) },
    ]);

    const ease = new B.CubicEase();
    ease.setEasingMode(B.EasingFunction.EASINGMODE_EASEINOUT);
    for (const anim of [alphaAnim, betaAnim, radiusAnim, targetAnim]) {
      anim.setEasingFunction(ease);
    }

    this.camera.animations = [alphaAnim, betaAnim, radiusAnim, targetAnim];
    this.scene.beginAnimation(this.camera, 0, frames, false, 1, () => {
      this.animatingCamera = false;
    });
  }

  private buildCourtroom(B: typeof import('@babylonjs/core')): void {
    const mat = (name: string, r: number, g: number, b: number) => {
      const m = new B.StandardMaterial(name, this.scene);
      m.diffuseColor = new B.Color3(r, g, b);
      m.specularColor = new B.Color3(0.05, 0.05, 0.05);
      return m;
    };

    // Floor (dark wood)
    const floor = B.MeshBuilder.CreateGround('floor', { width: 20, height: 16 }, this.scene);
    floor.material = mat('floorMat', 0.25, 0.15, 0.08);

    // Back wall
    const backWall = B.MeshBuilder.CreateBox(
      'backWall',
      { width: 20, height: 8, depth: 0.3 },
      this.scene
    );
    backWall.position = new B.Vector3(0, 4, -8);
    backWall.material = mat('wallMat', 0.18, 0.14, 0.1);

    // Side walls
    for (const side of [-1, 1]) {
      const wall = B.MeshBuilder.CreateBox(
        `sideWall${side}`,
        { width: 0.3, height: 8, depth: 16 },
        this.scene
      );
      wall.position = new B.Vector3(side * 10, 4, 0);
      wall.material = mat('wallMat', 0.18, 0.14, 0.1);
    }

    // Judge's bench (elevated platform + desk)
    const benchPlatform = B.MeshBuilder.CreateBox(
      'benchPlatform',
      { width: 8, height: 1.8, depth: 3 },
      this.scene
    );
    benchPlatform.position = new B.Vector3(0, 0.9, -6.5);
    benchPlatform.material = mat('benchMat', 0.35, 0.2, 0.1);

    const benchDesk = B.MeshBuilder.CreateBox(
      'benchDesk',
      { width: 7, height: 0.8, depth: 1.5 },
      this.scene
    );
    benchDesk.position = new B.Vector3(0, 2.3, -5.5);
    benchDesk.material = mat('deskMat', 0.3, 0.18, 0.08);

    // Prosecution table (right)
    const prosTable = B.MeshBuilder.CreateBox(
      'prosTable',
      { width: 3, height: 0.8, depth: 1.5 },
      this.scene
    );
    prosTable.position = new B.Vector3(4, 0.4, 0);
    prosTable.material = mat('tableMat', 0.3, 0.18, 0.08);

    // Defense table (left)
    const defTable = B.MeshBuilder.CreateBox(
      'defTable',
      { width: 3, height: 0.8, depth: 1.5 },
      this.scene
    );
    defTable.position = new B.Vector3(-4, 0.4, 0);
    defTable.material = mat('tableMat', 0.3, 0.18, 0.08);

    // Witness stand
    const witnessBox = B.MeshBuilder.CreateBox(
      'witnessBox',
      { width: 2, height: 1.0, depth: 2 },
      this.scene
    );
    witnessBox.position = new B.Vector3(2, 0.5, -3);
    witnessBox.material = mat('witnessMat', 0.3, 0.2, 0.12);

    // Gallery railing
    const railing = B.MeshBuilder.CreateBox(
      'railing',
      { width: 18, height: 0.8, depth: 0.15 },
      this.scene
    );
    railing.position = new B.Vector3(0, 0.4, 3);
    railing.material = mat('railMat', 0.28, 0.16, 0.08);

    // American flag
    const flag = B.MeshBuilder.CreateBox(
      'flag',
      { width: 1.2, height: 1.8, depth: 0.05 },
      this.scene
    );
    flag.position = new B.Vector3(3, 5.5, -7.8);
    const flagMat = new B.StandardMaterial('flagMat', this.scene);
    flagMat.diffuseColor = new B.Color3(0.7, 0.15, 0.15);
    flagMat.specularColor = new B.Color3(0, 0, 0);
    flag.material = flagMat;

    // Flag pole
    const pole = B.MeshBuilder.CreateCylinder('pole', { height: 6, diameter: 0.08 }, this.scene);
    pole.position = new B.Vector3(3, 3.5, -7.8);
    pole.material = mat('poleMat', 0.6, 0.55, 0.4);

    // Court seal
    const seal = B.MeshBuilder.CreateDisc('seal', { radius: 1.2, tessellation: 16 }, this.scene);
    seal.position = new B.Vector3(0, 5, -7.8);
    seal.rotation.y = Math.PI;
    const sealMat = new B.StandardMaterial('sealMat', this.scene);
    sealMat.diffuseColor = new B.Color3(0.6, 0.5, 0.2);
    sealMat.specularColor = new B.Color3(0.2, 0.2, 0.1);
    seal.material = sealMat;
  }

  /** Build procedural box/cylinder characters as fallback */
  private buildProceduralCharacters(B: typeof import('@babylonjs/core')): void {
    const roles = ['prosecutor', 'defense', 'judge', 'witness'] as const;

    for (const role of roles) {
      const station = STATIONS[role];
      const hex = ROLE_COLORS[role] ?? '#7c7c7c';
      const color = B.Color3.FromHexString(hex);

      // Torso
      const torso = B.MeshBuilder.CreateBox(
        `${role}_torso`,
        { width: 0.6, height: 0.8, depth: 0.4 },
        this.scene
      );
      torso.position = new B.Vector3(station.x, station.y + 1.2, station.z);
      const torsoMat = new B.StandardMaterial(`${role}_torsoMat`, this.scene);
      torsoMat.diffuseColor = color;
      torsoMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
      torso.material = torsoMat;

      // Head
      const head = B.MeshBuilder.CreateBox(
        `${role}_head`,
        { width: 0.4, height: 0.4, depth: 0.4 },
        this.scene
      );
      head.position = new B.Vector3(station.x, station.y + 1.9, station.z);
      const headMat = new B.StandardMaterial(`${role}_headMat`, this.scene);
      headMat.diffuseColor = new B.Color3(0.85, 0.7, 0.55);
      headMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
      head.material = headMat;

      // Arms
      for (const side of [-1, 1]) {
        const arm = B.MeshBuilder.CreateCylinder(
          `${role}_arm${side}`,
          { height: 0.6, diameter: 0.15 },
          this.scene
        );
        arm.position = new B.Vector3(station.x + side * 0.45, station.y + 1.1, station.z);
        arm.material = torsoMat;
      }

      // Idle bob animation
      const bobAnim = new B.Animation(
        `${role}_bob`,
        'position.y',
        30,
        B.Animation.ANIMATIONTYPE_FLOAT,
        B.Animation.ANIMATIONLOOPMODE_CYCLE
      );
      bobAnim.setKeys([
        { frame: 0, value: torso.position.y },
        { frame: 30, value: torso.position.y + 0.05 },
        { frame: 60, value: torso.position.y },
      ]);
      torso.animations.push(bobAnim);
      this.scene.beginAnimation(torso, 0, 60, true);

      this.characters.set(role, {
        root: torso,
        meshes: [torso, head],
        animGroups: new Map(),
        isModel: false,
        torso,
        head,
      });
    }
  }

  /** Procedural animation for box characters */
  private playProceduralAnimation(role: string, animType: string): void {
    const char = this.characters.get(role);
    if (!char || char.isModel || !BABYLON) return;
    const B = BABYLON;

    const torso = char.torso;
    const head = char.head;
    if (!torso) return;

    // Stop existing non-bob animations
    this.scene.stopAnimation(torso, 'procAnim');

    switch (animType) {
      case 'speaking': {
        // Head bob (faster than idle)
        if (head) {
          const speakAnim = new B.Animation(
            'procAnim',
            'position.y',
            30,
            B.Animation.ANIMATIONTYPE_FLOAT,
            B.Animation.ANIMATIONLOOPMODE_CYCLE
          );
          speakAnim.setKeys([
            { frame: 0, value: head.position.y },
            { frame: 8, value: head.position.y + 0.06 },
            { frame: 16, value: head.position.y },
            { frame: 24, value: head.position.y + 0.04 },
            { frame: 30, value: head.position.y },
          ]);
          head.animations = [speakAnim];
          this.scene.beginAnimation(head, 0, 30, true);
        }
        break;
      }
      case 'objection': {
        // Dramatic torso lurch forward + arm raise effect
        const objAnim = new B.Animation(
          'procAnim',
          'position.z',
          30,
          B.Animation.ANIMATIONTYPE_FLOAT,
          B.Animation.ANIMATIONLOOPMODE_CONSTANT
        );
        objAnim.setKeys([
          { frame: 0, value: torso.position.z },
          { frame: 5, value: torso.position.z + 0.3 },
          { frame: 15, value: torso.position.z + 0.3 },
          { frame: 30, value: torso.position.z },
        ]);
        torso.animations = [objAnim];
        this.scene.beginAnimation(torso, 0, 30, false);
        break;
      }
      case 'nod': {
        if (head) {
          const nodAnim = new B.Animation(
            'procAnim',
            'rotation.x',
            30,
            B.Animation.ANIMATIONTYPE_FLOAT,
            B.Animation.ANIMATIONLOOPMODE_CONSTANT
          );
          nodAnim.setKeys([
            { frame: 0, value: 0 },
            { frame: 10, value: 0.2 },
            { frame: 20, value: 0 },
            { frame: 30, value: 0.15 },
            { frame: 40, value: 0 },
          ]);
          head.animations = [nodAnim];
          this.scene.beginAnimation(head, 0, 40, false);
        }
        break;
      }
      case 'shake_head': {
        if (head) {
          const shakeAnim = new B.Animation(
            'procAnim',
            'rotation.y',
            30,
            B.Animation.ANIMATIONTYPE_FLOAT,
            B.Animation.ANIMATIONLOOPMODE_CONSTANT
          );
          shakeAnim.setKeys([
            { frame: 0, value: 0 },
            { frame: 8, value: 0.2 },
            { frame: 16, value: -0.2 },
            { frame: 24, value: 0.15 },
            { frame: 32, value: -0.15 },
            { frame: 40, value: 0 },
          ]);
          head.animations = [shakeAnim];
          this.scene.beginAnimation(head, 0, 40, false);
        }
        break;
      }
      case 'present_evidence': {
        // Torso turns toward evidence stand
        const turnAnim = new B.Animation(
          'procAnim',
          'rotation.y',
          30,
          B.Animation.ANIMATIONTYPE_FLOAT,
          B.Animation.ANIMATIONLOOPMODE_CONSTANT
        );
        const targetAngle = Math.atan2(-1 - torso.position.z, 3 - torso.position.x);
        turnAnim.setKeys([
          { frame: 0, value: torso.rotation?.y ?? 0 },
          { frame: 15, value: targetAngle * 0.3 },
          { frame: 60, value: targetAngle * 0.3 },
          { frame: 75, value: 0 },
        ]);
        torso.animations = [turnAnim];
        this.scene.beginAnimation(torso, 0, 75, false);
        break;
      }
      // idle: just the default bob (already running)
    }
  }

  /** Build the evidence display stand (plane + material for image/PDF overlay) */
  private buildEvidenceStand(B: typeof import('@babylonjs/core')): void {
    // Evidence display plane (positioned between prosecution and witness stand)
    this.evidencePlane = B.MeshBuilder.CreatePlane(
      'evidencePlane',
      {
        width: 2.5,
        height: 3.5,
      },
      this.scene
    );
    this.evidencePlane.position = new B.Vector3(3, 2.5, -1.5);
    this.evidencePlane.rotation.y = -Math.PI * 0.15; // Angled toward camera

    this.evidenceMaterial = new B.StandardMaterial('evidenceMat', this.scene);
    this.evidenceMaterial.diffuseColor = new B.Color3(0.9, 0.9, 0.85); // Off-white paper
    this.evidenceMaterial.specularColor = new B.Color3(0.1, 0.1, 0.1);
    this.evidenceMaterial.backFaceCulling = false;
    this.evidencePlane.material = this.evidenceMaterial;

    // Evidence stand frame
    const frame = B.MeshBuilder.CreateBox(
      'evidenceFrame',
      {
        width: 2.7,
        height: 3.7,
        depth: 0.05,
      },
      this.scene
    );
    frame.position = new B.Vector3(3, 2.5, -1.55);
    frame.rotation.y = -Math.PI * 0.15;
    const frameMat = new B.StandardMaterial('frameMat', this.scene);
    frameMat.diffuseColor = new B.Color3(0.3, 0.18, 0.08);
    frameMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
    frame.material = frameMat;

    // Evidence stand (easel)
    const easel = B.MeshBuilder.CreateCylinder('easel', { height: 3, diameter: 0.06 }, this.scene);
    easel.position = new B.Vector3(3, 1.5, -1.3);
    easel.rotation.x = Math.PI * 0.05;
    easel.material = frameMat;

    // Start hidden
    this.evidencePlane.setEnabled(false);
    frame.setEnabled(false);
    easel.setEnabled(false);

    // Store references for show/hide
    this.evidencePlane._frame = frame;
    this.evidencePlane._easel = easel;
  }

  /** Override show/hide to include frame + easel */
  showEvidence(imageUrl: string): void {
    if (!BABYLON || !this.scene) return;
    const B = BABYLON;

    if (!this.evidenceMaterial || !this.evidencePlane) return;

    const tex = new B.Texture(imageUrl, this.scene);
    this.evidenceMaterial.diffuseTexture = tex;
    this.evidenceMaterial.emissiveColor = new B.Color3(0.3, 0.3, 0.3);

    this.evidencePlane.setEnabled(true);
    if (this.evidencePlane._frame) this.evidencePlane._frame.setEnabled(true);
    if (this.evidencePlane._easel) this.evidencePlane._easel.setEnabled(true);
    this.evidenceVisible = true;

    // Scale-up animation
    const scaleAnim = new B.Animation(
      'evidenceScale',
      'scaling',
      60,
      B.Animation.ANIMATIONTYPE_VECTOR3,
      B.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    scaleAnim.setKeys([
      { frame: 0, value: new B.Vector3(0.01, 0.01, 0.01) },
      { frame: 20, value: new B.Vector3(1, 1, 1) },
    ]);
    const ease = new B.CubicEase();
    ease.setEasingMode(B.EasingFunction.EASINGMODE_EASEOUT);
    scaleAnim.setEasingFunction(ease);
    this.evidencePlane.animations = [scaleAnim];
    this.scene.beginAnimation(this.evidencePlane, 0, 20, false);
  }

  hideEvidence(): void {
    if (this.evidencePlane) {
      this.evidencePlane.setEnabled(false);
      if (this.evidencePlane._frame) this.evidencePlane._frame.setEnabled(false);
      if (this.evidencePlane._easel) this.evidencePlane._easel.setEnabled(false);
      this.evidenceVisible = false;
    }
  }

  private disposeCharacter(char: CharacterData): void {
    for (const mesh of char.meshes) {
      mesh.dispose();
    }
    char.animGroups.forEach((ag) => ag.dispose());
    if (char.root && !char.meshes.includes(char.root)) {
      char.root.dispose();
    }
  }

  /** Clean up all GPU resources */
  dispose(): void {
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
    if (this.crtPostProcess) {
      this.crtPostProcess.dispose();
      this.crtPostProcess = null;
    }
    if (this.renderLoop && this.engine) {
      this.engine.stopRenderLoop(this.renderLoop);
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this.characters.clear();
    this.isReady = false;
    this.modelsLoaded = false;
  }
}
