/**
 * Phoenix Wright-style 3D courtroom scene manager.
 * Babylon.js WebGPU engine with N64/retro rendering.
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

async function loadBabylon() {
	if (!BABYLON) {
		BABYLON = await import('@babylonjs/core');
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

export class CourtroomScene {
	// Reactive state (readable from Svelte components)
	isReady = $state(false);
	engineType = $state<'webgpu' | 'webgl'>('webgl');
	fps = $state(0);
	currentView = $state<CourtroomView>('wide');

	private engine: any = null;
	private scene: any = null;
	private camera: any = null;
	private characters = new Map<string, any>();
	private crtPostProcess: any = null;
	private animatingCamera = false;
	private renderLoop: (() => void) | null = null;
	private fpsInterval: ReturnType<typeof setInterval> | null = null;

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
			this.scene,
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

		// Build courtroom
		this.buildCourtroom(B);
		this.buildCharacters(B);

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
		const backWall = B.MeshBuilder.CreateBox('backWall', { width: 20, height: 8, depth: 0.3 }, this.scene);
		backWall.position = new B.Vector3(0, 4, -8);
		backWall.material = mat('wallMat', 0.18, 0.14, 0.1);

		// Side walls
		for (const side of [-1, 1]) {
			const wall = B.MeshBuilder.CreateBox(`sideWall${side}`, { width: 0.3, height: 8, depth: 16 }, this.scene);
			wall.position = new B.Vector3(side * 10, 4, 0);
			wall.material = mat('wallMat', 0.18, 0.14, 0.1);
		}

		// Judge's bench (elevated platform + desk)
		const benchPlatform = B.MeshBuilder.CreateBox('benchPlatform', { width: 8, height: 1.8, depth: 3 }, this.scene);
		benchPlatform.position = new B.Vector3(0, 0.9, -6.5);
		benchPlatform.material = mat('benchMat', 0.35, 0.2, 0.1);

		const benchDesk = B.MeshBuilder.CreateBox('benchDesk', { width: 7, height: 0.8, depth: 1.5 }, this.scene);
		benchDesk.position = new B.Vector3(0, 2.3, -5.5);
		benchDesk.material = mat('deskMat', 0.3, 0.18, 0.08);

		// Prosecution table (right)
		const prosTable = B.MeshBuilder.CreateBox('prosTable', { width: 3, height: 0.8, depth: 1.5 }, this.scene);
		prosTable.position = new B.Vector3(4, 0.4, 0);
		prosTable.material = mat('tableMat', 0.3, 0.18, 0.08);

		// Defense table (left)
		const defTable = B.MeshBuilder.CreateBox('defTable', { width: 3, height: 0.8, depth: 1.5 }, this.scene);
		defTable.position = new B.Vector3(-4, 0.4, 0);
		defTable.material = mat('tableMat', 0.3, 0.18, 0.08);

		// Witness stand
		const witnessBox = B.MeshBuilder.CreateBox('witnessBox', { width: 2, height: 1.0, depth: 2 }, this.scene);
		witnessBox.position = new B.Vector3(2, 0.5, -3);
		witnessBox.material = mat('witnessMat', 0.3, 0.2, 0.12);

		// Gallery railing
		const railing = B.MeshBuilder.CreateBox('railing', { width: 18, height: 0.8, depth: 0.15 }, this.scene);
		railing.position = new B.Vector3(0, 0.4, 3);
		railing.material = mat('railMat', 0.28, 0.16, 0.08);

		// American flag (simplified — thin colored box)
		const flag = B.MeshBuilder.CreateBox('flag', { width: 1.2, height: 1.8, depth: 0.05 }, this.scene);
		flag.position = new B.Vector3(3, 5.5, -7.8);
		const flagMat = new B.StandardMaterial('flagMat', this.scene);
		flagMat.diffuseColor = new B.Color3(0.7, 0.15, 0.15);
		flagMat.specularColor = new B.Color3(0, 0, 0);
		flag.material = flagMat;

		// Flag pole
		const pole = B.MeshBuilder.CreateCylinder('pole', { height: 6, diameter: 0.08 }, this.scene);
		pole.position = new B.Vector3(3, 3.5, -7.8);
		pole.material = mat('poleMat', 0.6, 0.55, 0.4);

		// Court seal (circle on wall behind judge)
		const seal = B.MeshBuilder.CreateDisc('seal', { radius: 1.2, tessellation: 16 }, this.scene);
		seal.position = new B.Vector3(0, 5, -7.8);
		seal.rotation.y = Math.PI; // Face forward
		const sealMat = new B.StandardMaterial('sealMat', this.scene);
		sealMat.diffuseColor = new B.Color3(0.6, 0.5, 0.2);
		sealMat.specularColor = new B.Color3(0.2, 0.2, 0.1);
		seal.material = sealMat;
	}

	private buildCharacters(B: typeof import('@babylonjs/core')): void {
		const roles = ['prosecutor', 'defense', 'judge', 'witness'] as const;

		for (const role of roles) {
			const station = STATIONS[role];
			const hex = ROLE_COLORS[role] ?? '#7c7c7c';
			const color = B.Color3.FromHexString(hex);

			// Torso
			const torso = B.MeshBuilder.CreateBox(`${role}_torso`, { width: 0.6, height: 0.8, depth: 0.4 }, this.scene);
			torso.position = new B.Vector3(station.x, station.y + 1.2, station.z);
			const torsoMat = new B.StandardMaterial(`${role}_torsoMat`, this.scene);
			torsoMat.diffuseColor = color;
			torsoMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
			torso.material = torsoMat;

			// Head
			const head = B.MeshBuilder.CreateBox(`${role}_head`, { width: 0.4, height: 0.4, depth: 0.4 }, this.scene);
			head.position = new B.Vector3(station.x, station.y + 1.9, station.z);
			const headMat = new B.StandardMaterial(`${role}_headMat`, this.scene);
			headMat.diffuseColor = new B.Color3(0.85, 0.7, 0.55); // Skin tone
			headMat.specularColor = new B.Color3(0.05, 0.05, 0.05);
			head.material = headMat;

			// Arms (cylinders)
			for (const side of [-1, 1]) {
				const arm = B.MeshBuilder.CreateCylinder(`${role}_arm${side}`, { height: 0.6, diameter: 0.15 }, this.scene);
				arm.position = new B.Vector3(station.x + side * 0.45, station.y + 1.1, station.z);
				arm.material = torsoMat;
			}

			// Idle bob animation
			const bobAnim = new B.Animation(
				`${role}_bob`,
				'position.y',
				30,
				B.Animation.ANIMATIONTYPE_FLOAT,
				B.Animation.ANIMATIONLOOPMODE_CYCLE,
			);
			bobAnim.setKeys([
				{ frame: 0, value: torso.position.y },
				{ frame: 30, value: torso.position.y + 0.05 },
				{ frame: 60, value: torso.position.y },
			]);
			torso.animations.push(bobAnim);
			this.scene.beginAnimation(torso, 0, 60, true);

			this.characters.set(role, { torso, head });
		}
	}

	/** Switch camera to face the speaking character with smooth animation */
	showCharacter(role: string): void {
		const view = ROLE_CAMERA_MAP[role] ?? 'wide';
		this.transitionToView(view);

		// Brighten active character, dim others
		for (const [r, meshes] of this.characters) {
			const isActive = r === role;
			const torsoMat = meshes.torso.material;
			if (torsoMat) {
				torsoMat.alpha = isActive ? 1.0 : 0.6;
			}
		}
	}

	/** Transition camera to a named phase */
	setPhase(phase: string): void {
		const view = PHASE_CAMERA_MAP[phase] ?? 'wide';
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

		// Animate alpha
		const alphaAnim = new B.Animation('camAlpha', 'alpha', fps, B.Animation.ANIMATIONTYPE_FLOAT, B.Animation.ANIMATIONLOOPMODE_CONSTANT);
		alphaAnim.setKeys([{ frame: 0, value: this.camera.alpha }, { frame: frames, value: preset.alpha }]);

		// Animate beta
		const betaAnim = new B.Animation('camBeta', 'beta', fps, B.Animation.ANIMATIONTYPE_FLOAT, B.Animation.ANIMATIONLOOPMODE_CONSTANT);
		betaAnim.setKeys([{ frame: 0, value: this.camera.beta }, { frame: frames, value: preset.beta }]);

		// Animate radius
		const radiusAnim = new B.Animation('camRadius', 'radius', fps, B.Animation.ANIMATIONTYPE_FLOAT, B.Animation.ANIMATIONLOOPMODE_CONSTANT);
		radiusAnim.setKeys([{ frame: 0, value: this.camera.radius }, { frame: frames, value: preset.radius }]);

		// Animate target
		const targetAnim = new B.Animation('camTarget', 'target', fps, B.Animation.ANIMATIONTYPE_VECTOR3, B.Animation.ANIMATIONLOOPMODE_CONSTANT);
		targetAnim.setKeys([
			{ frame: 0, value: this.camera.target.clone() },
			{ frame: frames, value: new B.Vector3(preset.target.x, preset.target.y, preset.target.z) },
		]);

		// Easing
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

		// Camera shake
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
	}
}
