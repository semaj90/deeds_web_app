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
import { admitAnimationGroupTargets } from './animation-target-admission-v1.js';
import { RetargetRuntime } from './character-retarget-runtime-v1.js';
import { createRetargetAssetFetchCacheV1 } from './retarget-asset-fetch-cache-v1.js';
import { CueTracker, type CueOutcome } from './cue-tracker-v1.js';
import { resolveWalkPath } from './courtroom-floorplan-v1.js';
import { isLoopingAnim } from './courtroom-move-set-v1.js';
import { buildWalkPath, composeYaw, type Vec3, type WalkPath } from './walk-path-v1.js';
import { pivotLocalRotation, validateAccessoryManifest, type AccessoryManifest } from './jester-accessory-attach-v1.js';
import { JESTER_ACCESSORY_PIVOTS, JesterAccessoryRig } from './jester-accessory-rig-v1.js';
import {
  estimateGeometryBytes,
  fitsGeometryBudget,
  getN64RenderSize,
  N64_BROWSER_PROFILE_V1,
} from './n64-browser-profile-v1.js';

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
// Camera convention (measured 2026-10-28): the room spans x +-10, z +-8 with the back wall at z = -8 and the judge's bench
// against it; there is no front wall. A negative alpha puts the camera at negative z, i.e. behind that wall (the default
// 'wide' view sat at z = -14.5 looking at the wall's outer face, a blank frame). Positive alpha puts it on the open gallery
// side looking toward the bench, with the characters facing the camera.
const CAMERA_PRESETS: Record<CourtroomView, CameraPreset> = {
	prosecution: { alpha: Math.PI * 0.65, beta: Math.PI * 0.38, radius: 8, target: { x: 4, y: 1.2, z: 0 } },
	defense: { alpha: Math.PI * 0.35, beta: Math.PI * 0.38, radius: 8, target: { x: -4, y: 1.2, z: 0 } },
	judge: { alpha: Math.PI * 0.5, beta: Math.PI * 0.3, radius: 9, target: { x: 0, y: 2.5, z: -6 } },
	witness: { alpha: Math.PI * 0.55, beta: Math.PI * 0.38, radius: 7, target: { x: 2, y: 1.2, z: -3 } },
	wide: { alpha: Math.PI * 0.5, beta: Math.PI * 0.35, radius: 14, target: { x: 0, y: 1.5, z: -2 } },
};

// ── Character station positions ──
const STATIONS: Record<string, { x: number; y: number; z: number }> = {
	// Counsel stand behind their tables (tables are 3 x 1.5 at z = 0); the witness stands on the 1.0 high stand and the
	// judge on the 1.8 high bench platform. Previously prosecutor, defense and witness were inside the props.
	prosecutor: { x: 4, y: 0, z: 1.3 },
	defense: { x: -4, y: 0, z: 1.3 },
	judge: { x: 0, y: 1.8, z: -6.5 },
	witness: { x: 2, y: 1.0, z: -3 },
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
	/** Set when the .glb has a J_Bip_* humanoid skeleton: clips are then retargeted from their GLB tracks. */
	retarget?: RetargetRuntime;
	boneNodes?: Map<string, any>;
	/** The root's rotation as imported (glTF handedness turn), captured before the first move. */
	baseRotation?: [number, number, number, number];
	currentAnim?: string;
	accessoryMeshes?: any[];
	accessoryPivots?: Map<string, any>;
	accessoryRig?: JesterAccessoryRig;
	accessoryMaterials?: any[];
	accessoryRoot?: any;
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
  loadingStage = $state('');
  loadingFailures = $state<string[]>([]);
  estimatedGeometryBytes = $state(0);
  geometryBudgetBytes = N64_BROWSER_PROFILE_V1.geometryBudgetBytes;
  activeCharacter = $state<string | null>(null);
  evidenceVisible = $state(false);

  private engine: any = null;
  private scene: any = null;
  private camera: any = null;
  private characters = new Map<string, CharacterData>();
  private retargetAssetCache = createRetargetAssetFetchCacheV1();
  private crtPostProcess: any = null;
  private animatingCamera = false;
  private renderLoop: (() => void) | null = null;
  private fpsInterval: ReturnType<typeof setInterval> | null = null;
  private evidencePlane: any = null;
  private evidenceMaterial: any = null;
  /** Pending awaitable cues keyed `anim:<role>` / `move:<role>`; see playAnimationAsync and moveTo. */
  private cues = new CueTracker();
  private moves = new Map<string, { path: WalkPath; distance: number; speed: number; lastMs: number }>();

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const B = await loadBabylon();

    // Try WebGPU first, fall back to WebGL2
    try {
      // Babylon's own probe (adapter + device); constructing WebGPUEngine without it let a failed requestDevice escape
      // as an unhandled rejection that the app error boundary turned into a full-page crash (measured 2026-10-28).
      const supported = await B.WebGPUEngine.IsSupportedAsync;
      if (!supported) throw new Error('WebGPU not supported');
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
    this.resizeToN64Profile(canvas);
    this.scene.clearColor = new B.Color4(0.12, 0.075, 0.045, 1);

    // Fog (N64 style)
    this.scene.fogMode = B.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.008;
    this.scene.fogColor = new B.Color3(0.28, 0.19, 0.12);

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
    hemi.intensity = 0.85;
    hemi.groundColor = new B.Color3(0.1, 0.08, 0.06);

    const spot = new B.PointLight('spot', new B.Vector3(0, 6, -3), this.scene);
    spot.intensity = 1.5;
    spot.diffuse = new B.Color3(1, 0.95, 0.85);

    const daylight = new B.DirectionalLight('courtroomDaylight', new B.Vector3(0.1, -1, 0.35), this.scene);
    daylight.intensity = 1.1;
    daylight.diffuse = new B.Color3(1, 0.88, 0.7);

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
    this.estimatedGeometryBytes = estimateGeometryBytes(this.scene.meshes);

    // Render loop
    // WebGPU compiles pipelines asynchronously; drawing a mesh before its pipeline exists throws inside
    // _WebGPUCacheBindGroups.getBindGroups, so only render once every material/effect reports ready.
    this.renderLoop = () => {
      if (this.engineType === 'webgpu' && !this.scene.isReady()) return;
      this.scene.render();
    };
    this.scene.onBeforeRenderObservable.add(() => {
      this.applyRetargets();
      this.advanceAccessoryRigs();
    });
    this.engine.runRenderLoop(this.renderLoop);

    // FPS tracking
    this.fpsInterval = setInterval(() => {
      this.fps = Math.round(this.engine.getFps());
    }, 1000);

    // Handle resize
    const resizeHandler = () => this.resizeToN64Profile(canvas);
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
    this.loadingStage = 'Preparing actor models';
    this.loadingFailures = [];
    this.retargetAssetCache.clear();

    for (const modelDef of models) {
      try {
        this.loadingStage = `${modelDef.role}: model`;
        const result = await B.SceneLoader.ImportMeshAsync('', '', modelDef.modelUrl, this.scene);

        const addedGeometryBytes = estimateGeometryBytes(result.meshes);
        const currentGeometryBytes = estimateGeometryBytes(this.scene.meshes.filter(
          (mesh: any) => !result.meshes.includes(mesh),
        ));
        if (!fitsGeometryBudget(currentGeometryBytes, addedGeometryBytes)) {
          result.animationGroups.forEach((group: any) => group.dispose());
          result.meshes.forEach((mesh: any) => mesh.dispose(true, true));
          console.warn(`[courtroom] Skipped ${modelDef.role} model: estimated geometry exceeds the 8 MiB N64 profile budget`);
          throw new Error('N64_GEOMETRY_BUDGET_EXCEEDED');
        }

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
        this.estimatedGeometryBytes = estimateGeometryBytes(this.scene.meshes);

        // Humanoid (J_Bip_*) characters: retarget clips from their GLB tracks instead of Babylon's by-name import.
        try {
          this.loadingStage = `${modelDef.role}: rig`;
          const rt = new RetargetRuntime((url) => this.retargetAssetCache.fetch(url));
          if (await rt.init(modelDef.modelUrl)) charData.retarget = rt;
        } catch (err) {
          console.warn(`[courtroom] Retarget runtime unavailable for ${modelDef.role}:`, err);
        }

        // Load additional animation clips
        if (modelDef.animations) {
          for (const animDef of modelDef.animations) {
            this.loadingStage = `${modelDef.role}: ${animDef.animType}`;
            await this.loadAnimationClip(modelDef.role, animDef.url, animDef.animType);
          }
        }

        if (modelDef.role === 'defense' && /character_alice/i.test(modelDef.modelUrl)) {
          this.loadingStage = `${modelDef.role}: accessories`;
          await this.loadJesterAccessories(modelDef.role, charData);
        }

        // Start idle animation
        this.playAnimation(modelDef.role, 'idle');
      } catch (err) {
        console.warn(`[courtroom] Failed to load model for ${modelDef.role}:`, err);
        this.loadingFailures.push(modelDef.role);
        this.loadingStage = `${modelDef.role}: using fallback`;
        // Keep procedural fallback
      }

      loaded++;
      this.loadingProgress = Math.round((loaded / models.length) * 100);
    }

    this.retargetAssetCache.clear();
    this.modelsLoaded = true;
    this.loadingStage = this.loadingFailures.length
      ? `Complete · ${this.loadingFailures.length} fallback${this.loadingFailures.length === 1 ? '' : 's'}`
      : 'Ready';
  }

  /**
   * Hang the jester accessories (built by scripts/atlas/build-jester-accessories-v1.py) off the character's bones.
   * Root pivots are parented to their `J_Bip_*` bone with the manifest's bone-local offset and counter-rotation, so each
   * rotates about its own joint and stands world-aligned at rest; chain links (cap horns, tail) stay nested under the
   * previous link. Node transforms are glTF-space values: the glTF loader keeps them raw and handles handedness with
   * its root node, so no axis conversion happens here.
   */
  private async loadJesterAccessories(role: string, character: CharacterData): Promise<void> {
    if (!this.scene || !BABYLON || character.accessoryRig) return;
    let imported: any = null;
    const attached: any[] = [];
    try {
      const response = await fetch('/models/courtroom/jester_accessories.manifest.json');
      if (!response.ok) throw new Error(`JESTER_ACCESSORY_MANIFEST_HTTP_${response.status}`);
      const manifest = (await response.json()) as AccessoryManifest;
      validateAccessoryManifest(manifest);
      imported = await BABYLON.SceneLoader.ImportMeshAsync('', '', '/models/courtroom/jester_accessories.glb', this.scene);

      const nodes = new Map<string, any>();
      for (const node of imported.transformNodes ?? []) nodes.set(node.name, node);
      const boneNodes = new Map<string, any>();
      for (const node of character.root?.getChildTransformNodes?.(false) ?? []) boneNodes.set(node.name, node);

      const pivots = new Map<string, any>();
      for (const entry of manifest.pivots) {
        const node = nodes.get(entry.id);
        if (!node) throw new Error(`JESTER_ACCESSORY_NODE_MISSING:${entry.id}`);
        if (entry.parent === null) {
          const bone = boneNodes.get(entry.bone);
          if (!bone) throw new Error(`JESTER_ACCESSORY_BONE_MISSING:${entry.bone}`);
          node.parent = bone;
          node.position.set(entry.offset[0], entry.offset[1], entry.offset[2]);
        }
        node.rotationQuaternion = node.rotationQuaternion ?? new BABYLON.Quaternion();
        node.metadata = { baseRotation: entry.baseRotation ?? null };
        pivots.set(entry.id, node);
        attached.push(node);
      }
      // The import's own root and group nodes are empty now that every root pivot is on a bone.
      for (const node of imported.transformNodes ?? []) if (node.name === 'jester_accessories') node.dispose(false, false);
      imported.meshes.find((mesh: any) => mesh.name === '__root__')?.dispose(false, false);

      character.accessoryMeshes = imported.meshes.filter((mesh: any) => !mesh.isDisposed?.() && mesh.getTotalVertices?.() > 0);
      character.accessoryPivots = pivots;
      character.accessoryRig = new JesterAccessoryRig();
      character.accessoryMaterials = [];
      this.estimatedGeometryBytes = estimateGeometryBytes(this.scene.meshes);
    } catch (error) {
      attached.forEach((node) => node.dispose(false, false));
      if (imported) imported.meshes.forEach((mesh: any) => { if (!mesh.isDisposed?.()) mesh.dispose(false, false); });
      console.warn('[courtroom] Jester accessories unavailable; leaving Alice unchanged:', error);
    }
  }

  private advanceAccessoryRigs(): void {
    if (!this.engine || !BABYLON) return;
    const dt = this.engine.getDeltaTime() / 1000;
    for (const character of this.characters.values()) {
      if (!character.accessoryRig || !character.accessoryPivots) continue;
      character.accessoryRig.step(dt);
      for (const spec of JESTER_ACCESSORY_PIVOTS) {
        const pivot = character.accessoryPivots.get(spec.id);
        if (!pivot) continue;
        const base = (pivot.metadata?.baseRotation ?? null) as [number, number, number, number] | null;
        const [x, y, z, w] = pivotLocalRotation(spec, base, character.accessoryRig.angle(spec.id));
        (pivot.rotationQuaternion ??= new BABYLON.Quaternion()).set(x, y, z, w);
      }
    }
  }

  setAccessoryMood(role: string, mood: import('./story/engine.js').Mood): void {
    this.characters.get(role)?.accessoryRig?.setMood(mood);
  }

  /**
   * Load an additional animation clip from a .glb file and attach it to a character.
   */
  async loadAnimationClip(role: string, url: string, animType: string): Promise<void> {
    if (!this.scene || !BABYLON) return;
    const B = BABYLON;
    const char = this.characters.get(role);
    if (!char || !char.isModel) return;

    if (char.retarget) {
      try {
        await char.retarget.addClip(animType, url);
      } catch (err) {
        console.warn(`[courtroom] Rejected retargeted clip ${animType} for ${role}:`, err);
      }
      return;
    }

    try {
      const groupsBeforeImport = new Set(this.scene.animationGroups);
      const importedScene = await B.SceneLoader.ImportAnimationsAsync(
        '',
        url,
        this.scene,
        false, // don't override existing
        B.SceneLoaderAnimationGroupLoadingMode.NoSync
      );

      const importedGroups = importedScene.animationGroups.filter((group) => !groupsBeforeImport.has(group));
      if (importedGroups.length !== 1) {
        for (const group of importedGroups) group.dispose();
        console.warn(`[courtroom] Rejected animation clip ${animType} for ${role}: expected one imported group, found ${importedGroups.length}`);
        return;
      }

      const [group] = importedGroups;
      const admission = admitAnimationGroupTargets(group, char);
      if ('reason' in admission) {
        group.dispose();
        console.warn(`[courtroom] Rejected animation clip ${animType} for ${role}: ${admission.reason}`);
        return;
      }
      if (char.animGroups.has(animType) || char.animGroups.has(group.name)) {
        group.dispose();
        return;
      }
      char.animGroups.set(animType, group);
      group.stop();
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
      if (char.retarget?.has(animType)) {
        if (char.currentAnim) char.animGroups.get(char.currentAnim)?.stop();
        char.retarget.play(animType, performance.now(), isLoopingAnim(animType));
        char.currentAnim = animType;
        return;
      }
      char.retarget?.stop();
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

      if (ag) {
        const admission = admitAnimationGroupTargets(ag, char);
        if ('reason' in admission) {
          console.warn(`[courtroom] Rejected animation ${animType} for ${role}: ${admission.reason}`);
          return;
        }
        if (char.currentAnim) {
          const currentAg = char.animGroups.get(char.currentAnim);
          if (currentAg) currentAg.stop();
        }
        const shouldLoop = isLoopingAnim(animType);
        ag.start(shouldLoop);
        char.currentAnim = animType;
      }
    } else {
      // Procedural character animation (bob, shake, etc.)
      this.playProceduralAnimation(role, animType);
    }
  }

  /**
   * Play a clip and resolve when it ends. `finished` = a non-looping clip reached its end; `interrupted` = another
   * cue replaced it; `timeout` = no completion within `timeoutMs`; `unavailable` = nothing could play (no such
   * character/clip), so the story must not assume the gesture happened. Looping clips never finish, only time out.
   */
  playAnimationAsync(role: string, animType: string, timeoutMs = 15000): Promise<CueOutcome> {
    const char = this.characters.get(role);
    if (!char) return Promise.resolve('unavailable');
    const key = `anim:${role}`;
    if (char.isModel && char.retarget?.has(animType)) {
      const pending = this.cues.begin(key, timeoutMs);
      this.playAnimation(role, animType);
      return pending;
    }
    const group = char.animGroups.get(animType);
    if (char.isModel && group) {
      const pending = this.cues.begin(key, timeoutMs);
      this.playAnimation(role, animType);
      group.onAnimationGroupEndObservable?.addOnce(() => this.cues.settle(key, 'finished'));
      return pending;
    }
    this.playAnimation(role, animType);
    return Promise.resolve('unavailable');
  }

  /**
   * Walk a character along a Catmull-Rom path at constant speed (m/s), facing the direction of travel, and resolve
   * `finished` on arrival. The requested endpoint is re-routed through the authoritative walkable floorplan.
   * Plays `walk` while moving when a walk clip exists, then returns to `idle`.
   */
  moveTo(role: string, waypoints: Vec3[], speed = 1.5, timeoutMs?: number): Promise<CueOutcome> {
    const char = this.characters.get(role);
    if (!char?.root || !Array.isArray(waypoints) || !Number.isFinite(speed) || speed <= 0) return Promise.resolve('unavailable');
    const current = char.root.position;
    const safeWaypoints = resolveWalkPath({ x: current.x, z: current.z }, waypoints);
    if (!safeWaypoints) return Promise.resolve('unavailable');
    if (safeWaypoints.length < 2) {
      char.root.position.set(safeWaypoints[0].x, safeWaypoints[0].y, safeWaypoints[0].z);
      return Promise.resolve('finished');
    }
    const path = buildWalkPath(safeWaypoints);
    const key = `move:${role}`;
    const pending = this.cues.begin(key, timeoutMs ?? (path.length / speed) * 1000 + 3000);
    this.moves.set(role, { path, distance: 0, speed, lastMs: performance.now() });
    this.playAnimation(role, 'walk');
    return pending.then((outcome) => {
      if (outcome !== 'finished') this.moves.delete(role);
      this.playAnimation(role, 'idle');
      return outcome;
    });
  }

  /** Current floor-plan position (x, z) of a character, or null when it is not loaded. */
  getPosition(role: string): { x: number; z: number } | null {
    const root = this.characters.get(role)?.root;
    return root?.position ? { x: root.position.x, z: root.position.z } : null;
  }

  private advanceMoves(nowMs: number): void {
    for (const [role, move] of this.moves) {
      const char = this.characters.get(role);
      if (!char?.root) { this.moves.delete(role); this.cues.settle(`move:${role}`, 'interrupted'); continue; }
      const dt = Math.min((nowMs - move.lastMs) / 1000, 0.05);
      move.lastMs = nowMs;
      move.distance = Math.min(move.path.length, move.distance + move.speed * dt);
      const p = move.path.at(move.distance);
      char.root.position.set(p.x, p.y, p.z);
      // Compose the heading with the root's own rotation (the glTF loader puts a 180 degree handedness turn there).
      if (!char.baseRotation) {
        const q = char.root.rotationQuaternion;
        char.baseRotation = q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1];
      }
      const [qx, qy, qz, qw] = composeYaw(p.heading, char.baseRotation);
      (char.root.rotationQuaternion ??= new BABYLON.Quaternion()).set(qx, qy, qz, qw);
      if (move.distance >= move.path.length) { this.moves.delete(role); this.cues.settle(`move:${role}`, 'finished'); }
    }
  }

  /** Writes the active retargeted pose onto each character's own bone nodes (looked up per character, not by scene-wide name). */
  private applyRetargets(): void {
    const now = performance.now();
    this.advanceMoves(now);
    for (const [role, char] of this.characters) {
      if (char.retarget?.isFinished(now)) this.cues.settle(`anim:${role}`, 'finished');
      const pose = char.retarget?.frame(now);
      if (!pose) continue;
      if (!char.boneNodes) {
        char.boneNodes = new Map();
        for (const node of char.root?.getChildTransformNodes?.(false) ?? []) char.boneNodes.set(node.name, node);
      }
      for (const [name, q] of Object.entries(pose)) {
        const node = char.boneNodes.get(name);
        if (!node) continue;
        node.rotationQuaternion = node.rotationQuaternion ?? new BABYLON.Quaternion();
        node.rotationQuaternion.set(q[0], q[1], q[2], q[3]);
      }
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
        for (const mesh of [...charData.meshes, ...(charData.accessoryMeshes ?? [])]) {
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
  }, options: { skipAnimation?: boolean } = {}): void {
    // Animation
    if (kf.animType && !options.skipAnimation) {
      this.playAnimation(kf.characterRole, kf.animType);
    }

    // Camera
    if (kf.cameraView) {
      this.transitionToView(kf.cameraView as CourtroomView);
    }

    // Position override
    const hasPositionCue = kf.posX != null || kf.posY != null || kf.posZ != null;
    if (hasPositionCue) {
      const current = this.getPosition(kf.characterRole);
      if (current) this.moveTo(kf.characterRole, [
        { x: current.x, y: 0, z: current.z },
        { x: kf.posX ?? current.x, y: 0, z: kf.posZ ?? current.z },
      ]);
    }

    // Rotation
    if (kf.rotY != null && Number.isFinite(kf.rotY) && !hasPositionCue) {
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

    // The CRT shader is GLSL; Babylon's WebGPU engine cannot compile it (measured 2026-10-28: "reading 'shaderLanguage'"
    // thrown from _preparePipelineContextAsync, which crashed the page). Skip it until a WGSL variant exists.
    if (enabled && this.engineType === 'webgpu') {
      console.warn('[courtroom] CRT post-process is GLSL-only; skipped on the WebGPU engine');
      return;
    }

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

  /** Move the camera to one of the fixed presets (used by the Level 1 demo controls). */
  setCameraView(view: CourtroomView): void {
    this.transitionToView(view);
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

    const walnut = mat('walnutTrimMat', 0.34, 0.16, 0.065);
    const oak = mat('oakPanelMat', 0.46, 0.25, 0.11);
    const brass = mat('brassMat', 0.58, 0.39, 0.13);
    const upholstery = mat('galleryUpholsteryMat', 0.28, 0.07, 0.08);

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

    // Low-poly timber wainscoting and tall arched-window bays evoke the supplied courtroom reference.
    const panelRail = B.MeshBuilder.CreateBox('wainscotRail', { width: 19.5, height: 0.18, depth: 0.18 }, this.scene);
    panelRail.position = new B.Vector3(0, 2.15, -7.78);
    panelRail.material = walnut;
    const panelTop = B.MeshBuilder.CreateBox('wainscotCap', { width: 19.5, height: 0.12, depth: 0.24 }, this.scene);
    panelTop.position = new B.Vector3(0, 3.12, -7.72);
    panelTop.material = brass;
    for (let index = 0; index < 18; index++) {
      const x = -9.1 + index * 1.07;
      const panel = B.MeshBuilder.CreateBox(`wainscotPanel${index}`, { width: 0.84, height: 0.78, depth: 0.12 }, this.scene);
      panel.position = new B.Vector3(x, 2.62, -7.75);
      panel.material = oak;
      const inset = B.MeshBuilder.CreateBox(`wainscotInset${index}`, { width: 0.68, height: 0.62, depth: 0.05 }, this.scene);
      inset.position = new B.Vector3(x, 2.62, -7.66);
      inset.material = walnut;
    }

    for (let windowIndex = 0; windowIndex < 3; windowIndex++) {
      const x = -5.5 + windowIndex * 5.5;
      const glass = B.MeshBuilder.CreateBox(`archedWindowGlass${windowIndex}`, { width: 2.45, height: 4.1, depth: 0.06 }, this.scene);
      glass.position = new B.Vector3(x, 5.15, -7.76);
      const glassMat = new B.StandardMaterial(`archedWindowMat${windowIndex}`, this.scene);
      glassMat.diffuseColor = new B.Color3(0.82, 0.86, 0.82);
      glassMat.emissiveColor = new B.Color3(0.72, 0.64, 0.46);
      glassMat.alpha = 0.94;
      glassMat.specularColor = new B.Color3(0, 0, 0);
      glass.material = glassMat;

      for (const side of [-1, 1]) {
        const jamb = B.MeshBuilder.CreateBox(`windowJamb${windowIndex}_${side}`, { width: 0.18, height: 4.5, depth: 0.3 }, this.scene);
        jamb.position = new B.Vector3(x + side * 1.32, 5.12, -7.56);
        jamb.material = walnut;
      }
      const sill = B.MeshBuilder.CreateBox(`windowSill${windowIndex}`, { width: 2.85, height: 0.22, depth: 0.42 }, this.scene);
      sill.position = new B.Vector3(x, 2.92, -7.48);
      sill.material = walnut;
      const crown = B.MeshBuilder.CreateCylinder(`windowCrown${windowIndex}`, {
        height: 0.24, diameter: 2.8, tessellation: 12, arc: 0.5,
      }, this.scene);
      crown.rotation.z = Math.PI / 2;
      crown.position = new B.Vector3(x, 7.32, -7.56);
      crown.material = walnut;

      for (const mullion of [-0.55, 0.55]) {
        const vertical = B.MeshBuilder.CreateBox(`windowMullionV${windowIndex}_${mullion}`, { width: 0.07, height: 4.05, depth: 0.08 }, this.scene);
        vertical.position = new B.Vector3(x + mullion, 5.15, -7.68);
        vertical.material = brass;
      }
      const horizontal = B.MeshBuilder.CreateBox(`windowMullionH${windowIndex}`, { width: 2.4, height: 0.07, depth: 0.08 }, this.scene);
      horizontal.position = new B.Vector3(x, 5.1, -7.68);
      horizontal.material = brass;
    }

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

    // Repeated gallery pews use a small shared material set and box primitives rather than imported furniture.
    for (let row = 0; row < 4; row++) {
      const z = 4.1 + row * 1.35;
      for (let seat = 0; seat < 7; seat++) {
        const x = -7.5 + seat * 2.5;
        const bench = B.MeshBuilder.CreateBox(`galleryBench_${row}_${seat}`, { width: 2.1, height: 0.14, depth: 0.55 }, this.scene);
        bench.position = new B.Vector3(x, 0.72, z);
        bench.material = walnut;
        const back = B.MeshBuilder.CreateBox(`galleryBack_${row}_${seat}`, { width: 2.1, height: 0.86, depth: 0.14 }, this.scene);
        back.position = new B.Vector3(x, 1.17, z + 0.22);
        back.material = oak;
        const cushion = B.MeshBuilder.CreateBox(`galleryCushion_${row}_${seat}`, { width: 1.9, height: 0.08, depth: 0.46 }, this.scene);
        cushion.position = new B.Vector3(x, 0.83, z);
        cushion.material = upholstery;
        for (const legSide of [-1, 1]) {
          const leg = B.MeshBuilder.CreateBox(`galleryLeg_${row}_${seat}_${legSide}`, { width: 0.12, height: 0.62, depth: 0.12 }, this.scene);
          leg.position = new B.Vector3(x + legSide * 0.86, 0.38, z);
          leg.material = walnut;
        }
      }
    }

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

  private resizeToN64Profile(canvas: HTMLCanvasElement): void {
    if (!this.engine) return;
    const size = getN64RenderSize(canvas.clientWidth || N64_BROWSER_PROFILE_V1.internalWidth,
      canvas.clientHeight || N64_BROWSER_PROFILE_V1.internalHeight);
    this.engine.setSize(size.width, size.height);
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
    char.accessoryPivots?.forEach((pivot) => pivot.dispose(false, false));
    char.accessoryMeshes?.forEach((mesh) => mesh.dispose(false, false));
    char.accessoryMaterials?.forEach((material) => material.dispose(false, false));
    char.accessoryRoot?.dispose(false, false);
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
    this.moves.clear();
    this.cues.settleAll();
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
    this.retargetAssetCache.clear();
    this.isReady = false;
    this.modelsLoaded = false;
    this.loadingStage = '';
    this.loadingFailures = [];
  }
}
