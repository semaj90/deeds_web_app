<script module lang="ts">
	export const CASE_EXHIBIT_DRAG_TYPE = 'application/x-atlas-case-exhibit';
	export type DetectiveGuideAction = 'Idle' | 'Walk' | 'Inspect' | 'Interact';
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { ScenePrimitiveManager, type ScenePrimitiveSnapshot } from '$lib/n64-fsm/scene-primitive-sync.js';
	import { ARENA_BYTE_LENGTH } from '$lib/n64-fsm/scene-fsm-cache.js';
	import { SpatialBvhManagerV1 } from '$lib/splat/spatial-bvh-manager-v1.js';
	import { createIndexedPaletteShaderMaterialV1 } from '$lib/splat/indexed-palette-shader-v1.js';
	import { INDEXED_PALETTE16_V1, quantizeRgbaToIndexed4BppV1 } from '$lib/splat/indexed-palette-texture-v1.js';
	import { buildWalkPath, type Vec3 } from '$lib/courtroom/walk-path-v1.js';
	import {
		legalMotionEnvelope,
		ATLAS_MOTION_DURATIONS,
		type AtlasLegalMotionKey
	} from '$lib/courtroom/atlas-legal-motions-v1.js';
	const scenePrimitiveManager = new ScenePrimitiveManager(
		new Float32Array(ARENA_BYTE_LENGTH / Float32Array.BYTES_PER_ELEMENT)
	);
	const pickBvhManager = new SpatialBvhManagerV1();
	type CaseMarker = { id: string; posX: number; posY: number; posZ: number };

	interface Props {
		activeEvidenceId?: string;
		selectedMarker?: number;
		sceneLayers?: {
			evidence: boolean;
			markers: boolean;
			measurements: boolean;
			reconstruction: boolean;
			environment: boolean;
		};
		transformMode?: 'select' | 'translate' | 'rotate' | 'scale' | 'measure' | 'marker';
		visualStyle?: 'pbr' | 'cel-shaded';
		activeMotion?: 'none' | AtlasLegalMotionKey;
		trajectoryProgress?: number;
		onSelectEvidence?: (evidence: any) => void;
		onSelectMarker?: (markerId: number) => void;
		onSelectScenePrimitive?: (selection: ScenePrimitiveSnapshot) => void;
		caseMarkers?: readonly CaseMarker[];
		indexedFloor?: boolean;
		guideVisible?: boolean;
		guideAction?: DetectiveGuideAction;
		guideScrubTime?: number | null;
		onGuideClipsReady?: (durations: Record<DetectiveGuideAction, number>) => void;
		placementPreview?: Vec3 | null;
		onCaseMarkerSelect?: (id: string) => void;
		onCaseGroundPoint?: (point: Vec3, evidenceId?: string) => void;
	}

	let {
		activeEvidenceId = 'E-002',
		selectedMarker = 1,
		sceneLayers = {
			evidence: true,
			markers: true,
			measurements: true,
			reconstruction: false,
			environment: true
		},
		transformMode = 'select',
		visualStyle = 'pbr',
		activeMotion = 'none',
		trajectoryProgress = 0,
		onSelectEvidence,
		onSelectMarker,
		onSelectScenePrimitive,
		caseMarkers,
		indexedFloor = false,
		guideVisible = true,
		guideAction = 'Idle',
		guideScrubTime = null,
		onGuideClipsReady,
		placementPreview = null,
		onCaseMarkerSelect,
		onCaseGroundPoint
	}: Props = $props();

	let containerEl = $state<HTMLDivElement>();
	let canvasEl = $state<HTMLCanvasElement>();
	let renderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	let controls: OrbitControls | null = null;
	let animId: number = 0;
	let raycaster = new THREE.Raycaster();
	let mouse = new THREE.Vector2();
	let selectedPrimitiveId: string | null = null;
	let primitiveDrag: {
		pointerId: number;
		id: string;
		mode: 'translate' | 'rotate' | 'scale';
		startX: number;
		startY: number;
		startPosition: THREE.Vector3;
		startRotation: THREE.Euler;
		startScale: THREE.Vector3;
		groundStartLocal: THREE.Vector3 | null;
	} | null = null;

	// Groups for layer toggling
	let evidenceGroup: THREE.Group;
	let markersGroup: THREE.Group;
	let measurementsGroup: THREE.Group;
	let reconstructionGroup: THREE.Group;
	let environmentGroup: THREE.Group;
	let groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
	let solidFloorMaterial: THREE.MeshStandardMaterial | null = null;
	let blockout: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
	let caseMarkerReady = $state(false);
	let sceneReady = $state(false);
	let caseMarkerGeometry: THREE.CylinderGeometry | null = null;
	let caseMarkerMaterial: THREE.MeshBasicMaterial | null = null;
	let previewMaterial: THREE.MeshBasicMaterial | null = null;
	let caseMarkerPreview: THREE.Mesh | null = null;
	const caseMarkerMeshes = new Map<string, THREE.Mesh>();

	// Pickable objects map
	let pickables: { object: THREE.Object3D; type: string; id: any }[] = [];
	let detectiveActor: THREE.Group | null = null;
	let guideLoadState = $state<'procedural' | 'rigged' | 'fallback'>('procedural');
	let guideLoadIssue = $state<string | null>(null);
	let guideRigDiagnostic = $state<string | null>(null);
	let activeGuideClip = $state<DetectiveGuideAction | null>(null);
	let riggedGuide: {
		model: THREE.Group;
		mixer: THREE.AnimationMixer;
		actions: Map<string, THREE.AnimationAction>;
		current: THREE.AnimationAction | null;
		scrubAction: DetectiveGuideAction | null;
		walkSeconds: number;
	} | null = null;
	const trajectoryWaypoints: readonly Vec3[] = [
		{ x: -1.8, y: 0.05, z: 1.6 },
		{ x: 0.5, y: 0.45, z: 0.0 },
		{ x: 2.4, y: 0.05, z: -1.2 }
	];
	const walkPath = buildWalkPath(trajectoryWaypoints);
	const guideBoneParents: Readonly<Record<string, string | null>> = {
		hips: 'Detective Guide Rig', chest: 'hips', head: 'chest',
		'upper_arm.L': 'chest', 'forearm.L': 'upper_arm.L', 'hand.L': 'forearm.L',
		'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L',
		'upper_arm.R': 'chest', 'forearm.R': 'upper_arm.R', 'hand.R': 'forearm.R',
		'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R'
	};
	const guideActions: readonly DetectiveGuideAction[] = ['Idle', 'Walk', 'Inspect', 'Interact'];
	const guideRestPosition = new THREE.Vector3(0.2, 0, -0.5);

	function guideRigMismatch(model: THREE.Object3D): string | null {
		const bones = new Map<string, THREE.Bone>();
		model.traverse((object) => {
			if ((object as THREE.Bone).isBone) bones.set(THREE.PropertyBinding.sanitizeNodeName(object.name), object as THREE.Bone);
		});
		if (bones.size !== Object.keys(guideBoneParents).length) return `bone-count:${bones.size}`;
		for (const [name, parent] of Object.entries(guideBoneParents)) {
			const bone = bones.get(THREE.PropertyBinding.sanitizeNodeName(name));
			if (!bone) return `missing:${name}`;
			const expectedParent = parent === null ? null : THREE.PropertyBinding.sanitizeNodeName(parent);
			if ((bone.parent?.name ?? null) !== expectedParent) return `parent:${name}:${bone.parent?.name ?? 'none'}!=${expectedParent ?? 'none'}`;
		}
		return null;
	}

	function disposeGuideModel(model: THREE.Object3D) {
		const materials = new Set<THREE.Material>();
		const textures = new Set<THREE.Texture>();
		model.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			object.geometry.dispose();
			if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				materials.add(material);
				for (const value of Object.values(material)) {
					if (value instanceof THREE.Texture) textures.add(value);
				}
			}
		});
		for (const material of materials) material.dispose();
		for (const texture of textures) {
			texture.dispose();
			if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
		}
	}

	async function loadCaseGuide(root: THREE.Group) {
		try {
			const gltf = await new GLTFLoader().loadAsync('/models/detective-actor-v1.glb');
			const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
			const validClips = guideActions.every((name) => {
				const clip = clips.get(name);
				return !!clip && Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks.length > 0;
			});
			const rigMismatch = guideRigMismatch(gltf.scene);
			if (detectiveActor !== root || rigMismatch || !validClips) {
				disposeGuideModel(gltf.scene);
				if (detectiveActor === root) {
					guideLoadIssue = rigMismatch ? 'RIG_HIERARCHY_MISMATCH' : !validClips ? 'REQUIRED_CLIP_MISSING_OR_INVALID' : null;
					guideRigDiagnostic = rigMismatch;
					guideLoadState = 'fallback';
				}
				return;
			}
			const mixer = new THREE.AnimationMixer(gltf.scene);
			riggedGuide = {
				model: gltf.scene,
				mixer,
				actions: new Map(guideActions.map((name) => [name, mixer.clipAction(clips.get(name)!)])),
				current: null,
				scrubAction: null,
				walkSeconds: 0,
			};
			onGuideClipsReady?.(Object.fromEntries(guideActions.map((name) => [name, clips.get(name)!.duration])) as Record<DetectiveGuideAction, number>);
			for (const child of root.children) child.visible = false;
			root.add(gltf.scene);
			root.rotation.y = 0.6;
			guideLoadState = 'rigged';
		} catch {
			if (detectiveActor === root) {
				guideLoadIssue = 'MODEL_LOAD_FAILED';
				guideLoadState = 'fallback';
			}
		}
	}

	function stepCaseGuide(root: THREE.Group, dt: number) {
		const guide = riggedGuide;
		if (!guide) return;
		if (guideScrubTime !== null) {
			const clip = guide.actions.get(guideAction);
			if (!clip) return;
			if (guide.scrubAction !== guideAction) {
				guide.mixer.stopAllAction();
				clip.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1).play();
				clip.clampWhenFinished = true;
				clip.paused = true;
				guide.scrubAction = guideAction;
				activeGuideClip = guideAction;
			}
			const duration = clip.getClip().duration;
			clip.time = THREE.MathUtils.clamp(Number.isFinite(guideScrubTime) ? guideScrubTime : 0, 0, duration);
			guide.mixer.update(0);
			if (guideAction === 'Walk') {
				const phase = clip.time * 0.85 % (2 * walkPath.length);
				const reverse = phase > walkPath.length;
				const point = walkPath.at(reverse ? 2 * walkPath.length - phase : phase);
				root.position.set(point.x, 0, point.z);
				root.rotation.y = point.heading + (reverse ? Math.PI : 0);
			} else {
				root.position.copy(guideRestPosition);
				root.rotation.y = 0.6;
			}
			return;
		}
		if (guide.scrubAction !== null) {
			guide.mixer.stopAllAction();
			guide.scrubAction = null;
			guide.current = null;
			guide.walkSeconds = 0;
			root.position.copy(guideRestPosition);
			root.rotation.y = 0.6;
		}
		const action = guide.actions.get(guideAction);
		if (action && action !== guide.current) {
			const previous = guide.current;
			guide.current = action;
			action.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
			previous?.crossFadeTo(action, 0.16, false);
			activeGuideClip = guideAction;
		}
		if (guideAction === 'Walk') {
			guide.walkSeconds += dt;
			const phase = guide.walkSeconds * 0.85 % (2 * walkPath.length);
			const reverse = phase > walkPath.length;
			const point = walkPath.at(reverse ? 2 * walkPath.length - phase : phase);
			root.position.set(point.x, 0, point.z);
			root.rotation.y = point.heading + (reverse ? Math.PI : 0);
		}
		guide.mixer.update(dt);
	}

	function rebuildPickBvh(): void {
		pickBvhManager.build(pickables.map((pickable) => pickable.object));
	}

	$effect(() => {
		if (!caseMarkerReady || !caseMarkers || !caseMarkerGeometry || !caseMarkerMaterial) return;
		const ids = new Set(caseMarkers.map((marker) => marker.id));
		let topologyChanged = false;
		for (const [id, mesh] of caseMarkerMeshes) {
			if (ids.has(id)) continue;
			mesh.removeFromParent();
			caseMarkerMeshes.delete(id);
			topologyChanged = true;
		}
		for (const marker of caseMarkers) {
			let mesh = caseMarkerMeshes.get(marker.id);
			if (!mesh) {
				mesh = new THREE.Mesh(caseMarkerGeometry, caseMarkerMaterial);
				caseMarkerMeshes.set(marker.id, mesh);
				markersGroup.add(mesh);
				topologyChanged = true;
			}
			mesh.position.set(marker.posX, marker.posY, marker.posZ);
			mesh.updateWorldMatrix(true, false);
		}
		if (topologyChanged) {
			pickables = pickables.filter((item) => item.type !== 'case-marker');
			for (const [id, object] of caseMarkerMeshes) pickables.push({ object, id, type: 'case-marker' });
			rebuildPickBvh();
		} else {
			pickBvhManager.refit();
		}
	});

	$effect(() => {
		if (!caseMarkerReady || !caseMarkerPreview) return;
		caseMarkerPreview.visible = placementPreview !== null;
		if (placementPreview) {
			caseMarkerPreview.position.set(placementPreview.x, placementPreview.y, placementPreview.z);
		}
	});

	$effect(() => {
		if (!sceneReady || !indexedFloor || !groundMesh || !solidFloorMaterial || !renderer) return;
		const floor = groundMesh;
		const solid = solidFloorMaterial;
		const size = 64;
		const rgba = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const grout = x % 8 === 0 || y % 8 === 0;
				const alternate = ((x >>> 3) + (y >>> 3)) % 2 === 0;
				const paletteIndex = grout ? 4 : alternate ? 6 : 13;
				rgba.set(INDEXED_PALETTE16_V1[paletteIndex].rgba, (y * size + x) * 4);
			}
		}
		const indexed = quantizeRgbaToIndexed4BppV1(size, size, rgba);
		// A one-pixel map enables the standard material's UV map shader chunk.
		const uvMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
		uvMap.needsUpdate = true;
		const source = solid.clone();
		source.color.set(0xffffff);
		source.map = uvMap;
		const packed = createIndexedPaletteShaderMaterialV1(THREE, source, indexed, renderer.capabilities.maxTextureSize);
		source.dispose();
		floor.material = packed.material;
		return () => {
			floor.material = solid;
			packed.material.dispose();
			packed.textures.dispose();
			uvMap.dispose();
		};
	});

	let isWebGLAvailable = $state(true);
	let isHoveringObject = $state(false);

	// Create a canvas texture for evidence markers (yellow tent with black number)
	function createMarkerTexture(num: number): THREE.CanvasTexture {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.fillStyle = '#f59e0b';
			ctx.fillRect(0, 0, 128, 128);
			ctx.lineWidth = 8;
			ctx.strokeStyle = '#000000';
			ctx.strokeRect(6, 6, 116, 116);
			ctx.fillStyle = '#000000';
			ctx.font = 'bold 72px "Courier New", monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(num), 64, 64);
		}
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		return tex;
	}

	// Procedural Detective Low-Poly Model (Crouched posture)
	function createDetectiveActor(): THREE.Group {
		const actor = new THREE.Group();
		actor.name = 'DetectiveActor';

		// Materials
		const suitMat = new THREE.MeshStandardMaterial({
			color: 0x111620,
			roughness: 0.8,
			metalness: 0.1
		});
		const shirtMat = new THREE.MeshStandardMaterial({
			color: 0xf1f5f9,
			roughness: 0.4
		});
		const tieMat = new THREE.MeshStandardMaterial({
			color: 0x090d14,
			roughness: 0.3
		});
		const gloveMat = new THREE.MeshStandardMaterial({
			color: 0xf8fafc,
			roughness: 0.5
		});
		const skinMat = new THREE.MeshStandardMaterial({
			color: 0xd4a373,
			roughness: 0.6
		});
		const hairMat = new THREE.MeshStandardMaterial({
			color: 0x18181b,
			roughness: 0.9
		});
		const glassesMat = new THREE.MeshStandardMaterial({
			color: 0x0284c7,
			roughness: 0.1,
			metalness: 0.9
		});

		// Pelvis / lower torso (crouched low)
		const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.26), suitMat);
		pelvis.position.set(0, 0.32, 0);
		actor.add(pelvis);

		// Upper Torso (leaning forward at ~35 degrees)
		const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.28), suitMat);
		torso.position.set(0.12, 0.58, 0);
		torso.rotation.z = -0.35; // lean toward +X
		actor.add(torso);

		// White shirt collar & chest insert
		const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.24), shirtMat);
		shirt.position.set(0.26, 0.62, 0);
		shirt.rotation.z = -0.35;
		actor.add(shirt);

		// Black tie
		const tie = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), tieMat);
		tie.position.set(0.34, 0.60, 0);
		tie.rotation.z = -0.35;
		actor.add(tie);

		// Head (leaning forward, tilted downward toward bloodstain)
		const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.20), skinMat);
		head.position.set(0.34, 0.88, 0);
		head.rotation.z = -0.42;
		actor.add(head);

		// Hair
		const hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.22), hairMat);
		hair.position.set(0.34, 0.98, 0);
		hair.rotation.z = -0.42;
		actor.add(hair);

		// Sunglasses / Visor
		const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.18), glassesMat);
		glasses.position.set(0.46, 0.88, 0);
		glasses.rotation.z = -0.42;
		actor.add(glasses);

		// Left leg (deep crouch, knee up)
		const lThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.16), suitMat);
		lThigh.position.set(0.18, 0.32, 0.22);
		lThigh.rotation.z = -1.1; // bent forward
		actor.add(lThigh);

		const lShin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.14), suitMat);
		lShin.position.set(0.32, 0.14, 0.22);
		lShin.rotation.z = 0.8; // bent backward to ground
		actor.add(lShin);

		// Right leg (kneeling down near floor)
		const rThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), suitMat);
		rThigh.position.set(-0.10, 0.24, -0.20);
		rThigh.rotation.z = 0.4;
		actor.add(rThigh);

		const rShin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), suitMat);
		rShin.position.set(-0.06, 0.08, -0.20);
		rShin.rotation.z = -1.5; // flat near asphalt
		actor.add(rShin);

		// Shoes
		const shoeMat = new THREE.MeshStandardMaterial({ color: 0x090a0f, roughness: 0.3 });
		const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.12), shoeMat);
		lShoe.position.set(0.40, 0.04, 0.22);
		actor.add(lShoe);

		const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.12), shoeMat);
		rShoe.position.set(-0.20, 0.04, -0.20);
		actor.add(rShoe);

		// Left arm & hand resting on left knee (white glove)
		const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.12), suitMat);
		lArm.position.set(0.22, 0.52, 0.24);
		lArm.rotation.z = -0.6;
		actor.add(lArm);

		const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 0.10), gloveMat);
		lGlove.position.set(0.32, 0.34, 0.22);
		actor.add(lGlove);

		// Right arm extending down with flashlight
		const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), suitMat);
		rArm.position.set(0.26, 0.46, -0.22);
		rArm.rotation.z = -0.9;
		actor.add(rArm);

		const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 0.10), gloveMat);
		rGlove.position.set(0.44, 0.26, -0.20);
		actor.add(rGlove);

		// Flashlight
		const torch = new THREE.Mesh(
			new THREE.CylinderGeometry(0.025, 0.035, 0.18, 12),
			new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.2 })
		);
		torch.rotation.z = Math.PI / 3;
		torch.position.set(0.50, 0.22, -0.20);
		actor.add(torch);

		// Forensic Spotlight from flashlight pointing at bloodstain
		const torchLight = new THREE.SpotLight(0x38bdf8, 4.0, 5.0, Math.PI / 6, 0.35, 1.2);
		torchLight.position.set(0.56, 0.20, -0.20);
		torchLight.target.position.set(1.4, 0.01, -0.5);
		actor.add(torchLight);
		actor.add(torchLight.target);

		// Invisible Hit Box for Spatial BVH Picking
		const actorHitBox = new THREE.Mesh(
			new THREE.BoxGeometry(0.6, 1.4, 0.6),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		actorHitBox.position.set(0.12, 0.7, 0);
		actor.add(actorHitBox);
		if (!caseMarkers) pickables.push({ object: actorHitBox, type: 'actor', id: 'INVESTIGATOR_PAWN' });

		actor.userData = {
			torso,
			shirt,
			tie,
			head,
			lArm,
			lGlove,
			rArm,
			rGlove,
			torch,
			torchLight,
			baseTorsoRotZ: torso.rotation.z,
			baseRArmRotZ: rArm.rotation.z,
			baseLArmRotZ: lArm.rotation.z
		};

		return actor;
	}

	// Create Evidence Marker Tent (Triangular stand with yellow color & number)
	function createEvidenceMarkerTent(markerNum: number, pos: [number, number, number]): THREE.Group {
		const tent = new THREE.Group();
		tent.position.set(pos[0], pos[1], pos[2]);
		tent.name = `EvidenceMarker_${markerNum}`;

		const tex = createMarkerTexture(markerNum);
		const mat = new THREE.MeshStandardMaterial({
			map: tex,
			roughness: 0.4,
			metalness: 0.05,
			side: THREE.DoubleSide
		});

		// Left sloped card
		const leftCard = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.28), mat);
		leftCard.position.set(-0.06, 0.12, 0);
		leftCard.rotation.y = Math.PI / 2;
		leftCard.rotation.x = -0.45;
		tent.add(leftCard);

		// Right sloped card
		const rightCard = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.28), mat);
		rightCard.position.set(0.06, 0.12, 0);
		rightCard.rotation.y = -Math.PI / 2;
		rightCard.rotation.x = -0.45;
		tent.add(rightCard);

		// Clickable bounding volume
		const hitBox = new THREE.Mesh(
			new THREE.BoxGeometry(0.28, 0.30, 0.28),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		hitBox.position.y = 0.15;
		tent.add(hitBox);

		pickables.push({ object: hitBox, type: 'marker', id: markerNum });
		return tent;
	}

	// Create Cyan Footprint Decals
	function createCyanFootsteps(): THREE.Group {
		const group = new THREE.Group();
		group.name = 'CyanFootsteps';

		const footMat = new THREE.MeshStandardMaterial({
			color: 0x06b6d4,
			emissive: 0x22d3ee,
			emissiveIntensity: 0.85,
			roughness: 0.3,
			transparent: true,
			opacity: 0.82
		});

		// Waypoint steps leading into crime scene toward the bloodstain
		const stepCoords: [number, number, boolean][] = [
			[-1.8, 1.6, false],
			[-1.2, 1.2, true],
			[-0.6, 0.7, false],
			[ 0.0, 0.2, true],
			[ 0.6, -0.3, false],
			[ 1.1, -0.6, true],
			[ 1.5, -0.8, false],
			[ 1.9, -0.9, true]
		];

		stepCoords.forEach(([x, z, isLeft], idx) => {
			const foot = new THREE.Group();
			foot.position.set(x, 0.008, z);

			// Angle steps along curve
			const angle = -0.65 + idx * 0.05;
			foot.rotation.y = angle;

			// Sole pad
			const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.18), footMat);
			sole.position.z = -0.04;
			foot.add(sole);

			// Heel pad
			const heel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.09), footMat);
			heel.position.z = 0.09;
			foot.add(heel);

			group.add(foot);
		});

		return group;
	}

	// Create 3D Caliper Bounding Box with RGB Axis Gizmo & Corner Spheres
	function createBoundingCaliperBox(): THREE.Group {
		const group = new THREE.Group();
		group.name = 'CaliperBoundingBox';

		const boxW = 0.42;
		const boxH = 0.18;
		const boxD = 0.38;

		// 1. Cyan Wireframe Box
		const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
		const wireGeo = new THREE.WireframeGeometry(boxGeo);
		const lineMat = new THREE.LineBasicMaterial({
			color: 0x38bdf8,
			linewidth: 2,
			transparent: true,
			opacity: 0.95
		});
		const wireBox = new THREE.LineSegments(wireGeo, lineMat);
		wireBox.position.y = boxH / 2;
		group.add(wireBox);

		// 2. Corner Sphere Calipers (8 blue/cyan spheres)
		const sphereGeo = new THREE.SphereGeometry(0.016, 12, 12);
		const sphereMat = new THREE.MeshStandardMaterial({
			color: 0x38bdf8,
			emissive: 0x0284c7,
			emissiveIntensity: 0.9,
			roughness: 0.2
		});

		const halfX = boxW / 2;
		const halfY = boxH / 2;
		const halfZ = boxD / 2;

		const corners = [
			[-halfX, 0, -halfZ], [halfX, 0, -halfZ],
			[-halfX, 0,  halfZ], [halfX, 0,  halfZ],
			[-halfX, boxH, -halfZ], [halfX, boxH, -halfZ],
			[-halfX, boxH,  halfZ], [halfX, boxH,  halfZ]
		];

		corners.forEach(([cx, cy, cz]) => {
			const s = new THREE.Mesh(sphereGeo, sphereMat);
			s.position.set(cx, cy, cz);
			group.add(s);
		});

		// 3. Transform Axis Gizmo (Red X, Green Y, Blue Z)
		const axisLen = 0.28;
		const headLen = 0.08;
		const headWidth = 0.035;

		const dirX = new THREE.Vector3(1, 0, 0);
		const dirY = new THREE.Vector3(0, 1, 0);
		const dirZ = new THREE.Vector3(0, 0, 1);
		const origin = new THREE.Vector3(0, boxH / 2, 0);

		const arrowX = new THREE.ArrowHelper(dirX, origin, axisLen, 0xef4444, headLen, headWidth);
		const arrowY = new THREE.ArrowHelper(dirY, origin, axisLen + 0.05, 0x22c55e, headLen, headWidth);
		const arrowZ = new THREE.ArrowHelper(dirZ, origin, axisLen, 0x3b82f6, headLen, headWidth);

		group.add(arrowX);
		group.add(arrowY);
		group.add(arrowZ);

		return group;
	}

	// Create Realistic Crime Scene Bloodstain Decal
	function createBloodstainMesh(): THREE.Group {
		const group = new THREE.Group();
		group.name = 'BloodstainMesh';

		// Shape of splatter
		const shape = new THREE.Shape();
		shape.moveTo(0, 0.18);
		shape.bezierCurveTo(0.12, 0.22, 0.22, 0.12, 0.24, 0.04);
		shape.bezierCurveTo(0.28, -0.06, 0.20, -0.16, 0.10, -0.18);
		shape.bezierCurveTo(0.02, -0.22, -0.10, -0.20, -0.18, -0.12);
		shape.bezierCurveTo(-0.25, -0.04, -0.22, 0.10, -0.12, 0.16);
		shape.closePath();

		const geom = new THREE.ShapeGeometry(shape);
		const bloodMat = new THREE.MeshStandardMaterial({
			color: 0x7f1d1d,
			roughness: 0.25,
			metalness: 0.1,
			side: THREE.DoubleSide
		});

		const pool = new THREE.Mesh(geom, bloodMat);
		pool.rotation.x = -Math.PI / 2;
		pool.position.y = 0.005;
		group.add(pool);

		// Satellite droplet splatters
		const dropGeo = new THREE.CircleGeometry(0.025, 12);
		const drops = [
			[0.22, -0.16],
			[-0.20, 0.18],
			[0.18, 0.24],
			[-0.14, -0.22],
			[0.28, 0.05]
		];
		drops.forEach(([dx, dz]) => {
			const drop = new THREE.Mesh(dropGeo, bloodMat);
			drop.rotation.x = -Math.PI / 2;
			drop.position.set(dx, 0.005, dz);
			group.add(drop);
		});

		// Clickable hit plane
		const hitPlane = new THREE.Mesh(
			new THREE.PlaneGeometry(0.6, 0.6),
			new THREE.MeshBasicMaterial({ visible: false })
		);
		hitPlane.rotation.x = -Math.PI / 2;
		hitPlane.position.y = 0.006;
		group.add(hitPlane);

		pickables.push({ object: hitPlane, type: 'evidence', id: 'E-002' });

		return group;
	}

	function initScene() {
		if (!canvasEl || !containerEl) return;

		try {
			// 1. Scene
			scene = new THREE.Scene();
			const background = caseMarkers ? 0x4c5257 : 0x0a0e17;
			scene.background = new THREE.Color(background);
			scene.fog = new THREE.FogExp2(background, caseMarkers ? 0.045 : 0.08);

			// 2. Camera
			const w = containerEl.clientWidth || 800;
			const h = containerEl.clientHeight || 500;
			camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
			// Match crime scene viewpoint from Image 2
			camera.position.set(2.8, 3.2, 5.2);

			// 3. Renderer
			renderer = new THREE.WebGLRenderer({
				canvas: canvasEl,
				antialias: true,
				alpha: false,
				powerPreference: 'high-performance'
			});
			renderer.setSize(w, h);
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, caseMarkers ? 1.5 : 2));
			renderer.toneMapping = THREE.ACESFilmicToneMapping;
			renderer.toneMappingExposure = 1.1;

			// 4. Controls
			controls = new OrbitControls(camera, canvasEl);
			controls.enableDamping = true;
			controls.dampingFactor = 0.05;
			controls.zoomToCursor = true;
			controls.target.set(1.6, 0.4, -0.5);
			controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go below asphalt floor
			controls.minDistance = 1.0;
			controls.maxDistance = 18.0;

			// 5. Lighting
			const ambientLight = new THREE.AmbientLight(caseMarkers ? 0xe0dad1 : 0x1e293b, 1.2);
			scene.add(ambientLight);

			// Warm streetlight from high overhead
			const streetLight = new THREE.DirectionalLight(0xfef08a, 1.6);
			streetLight.position.set(-6, 12, 6);
			scene.add(streetLight);

			// Cyan rim light from distance
			const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.0);
			rimLight.position.set(8, 4, -8);
			scene.add(rimLight);

			// 6. Layer Groups
			environmentGroup = new THREE.Group();
			evidenceGroup = new THREE.Group();
			markersGroup = new THREE.Group();
			measurementsGroup = new THREE.Group();
			reconstructionGroup = new THREE.Group();

			scene.add(environmentGroup);
			scene.add(evidenceGroup);
			scene.add(markersGroup);
			scene.add(measurementsGroup);
			scene.add(reconstructionGroup);

			// 7. Asphalt Ground Floor
			const groundGeo = new THREE.PlaneGeometry(32, 32);
			const groundMat = new THREE.MeshStandardMaterial({
				color: caseMarkers ? 0x52504c : 0x0f172a,
				roughness: 0.75,
				metalness: 0.15
			});
			const ground = new THREE.Mesh(groundGeo, groundMat);
			solidFloorMaterial = groundMat;
			ground.rotation.x = -Math.PI / 2;
			ground.position.y = 0;
			environmentGroup.add(ground);
			groundMesh = ground;

			if (caseMarkers) {
				const blocks = [
					{ position: [-2.15, 0.13, -3.5], size: [6, 0.26, 1.8], color: 0x756d63 },
					{ position: [-3.8, 0.95, -4.16], size: [2.6, 1.9, 0.28], color: 0xc5b49d },
					{ position: [-0.2, 0.95, -4.16], size: [2.7, 1.9, 0.28], color: 0xc5b49d },
					{ position: [-1.95, 1.82, -4.16], size: [1.1, 0.2, 0.4], color: 0x9c8c7a },
					{ position: [-4.87, 0.65, -2.9], size: [0.25, 1.3, 0.25], color: 0x777e7f },
					{ position: [0.52, 0.65, -2.9], size: [0.25, 1.3, 0.25], color: 0x777e7f }
				] as const;
				const material = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
				const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, blocks.length);
				const transform = new THREE.Matrix4();
				blocks.forEach(({ position, size, color }, index) => {
					transform.makeScale(size[0], size[1], size[2]).setPosition(position[0], position[1], position[2]);
					mesh.setMatrixAt(index, transform);
					mesh.setColorAt(index, new THREE.Color(color));
				});
				mesh.name = 'Illustrative platform blockout';
				environmentGroup.add(mesh);
				blockout = mesh;
			}

			// Ground Grid
			const grid = new THREE.GridHelper(30, 60, 0xc59e2b, 0x1e293b);
			grid.position.y = 0.002;
			(grid.material as THREE.Material).transparent = true;
			(grid.material as THREE.Material).opacity = 0.35;
			environmentGroup.add(grid);

			// 8. Detective Character (Crouching over the scene)
			const detective = createDetectiveActor();
			detective.position.set(0.2, 0, -0.5);
			detective.rotation.y = 0.25;
			environmentGroup.add(detective);
			detectiveActor = detective;
			if (caseMarkers) void loadCaseGuide(detective);

			// 9. Cyan Footprints Trail
			const footprints = createCyanFootsteps();
			environmentGroup.add(footprints);

			// 10. Evidence E-002: Bloodstain
			const bloodstain = createBloodstainMesh();
			bloodstain.position.set(2.4, 0, -1.2);
			evidenceGroup.add(bloodstain);

			// 11. 3D Caliper Bounding Box around Bloodstain
			const boundingBox = createBoundingCaliperBox();
			boundingBox.position.set(2.4, 0, -1.2);
			measurementsGroup.add(boundingBox);

			if (caseMarkers) {
				caseMarkerGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 6);
				caseMarkerGeometry.translate(0, 0.04, 0);
				caseMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xf6c65f });
				previewMaterial = new THREE.MeshBasicMaterial({ color: 0x72e0bf, wireframe: true });
				caseMarkerPreview = new THREE.Mesh(caseMarkerGeometry, previewMaterial);
				caseMarkerPreview.visible = false;
				markersGroup.add(caseMarkerPreview);
				caseMarkerReady = true;
			} else {
				const tentPositions: [number, number, number][] = [[1.8, 0, -1.4], [3.2, 0, -0.4], [3.8, 0, -2.4]];
				for (const [index, position] of tentPositions.entries()) {
					const number = index + 1;
					const tent = createEvidenceMarkerTent(number, position);
					markersGroup.add(tent);
					scenePrimitiveManager.register({
						id: `MARKER_0${number}`,
						slotIndex: number,
						type: 'MARKER_TENT',
						mesh: tent,
						metadata: { label: `Evidence Tent #${number}` }
					});
				}
			}
			scenePrimitiveManager.register({
				id: 'EXHIBIT_E002',
				slotIndex: 0,
				type: 'EXHIBIT_OBB',
				mesh: bloodstain,
				metadata: { label: 'Bloodstain Decal (E-002)', dimensions: [0.42, 0.28, 0.02] }
			});
			scenePrimitiveManager.register({
				id: 'INVESTIGATOR_PAWN',
				slotIndex: 4,
				type: 'ACTOR_PAWN',
				mesh: detective,
				metadata: { label: 'Investigator Avatar Pawn' }
			});

			// 13. Reconstruction Trajectory Line (Cyan dotted arc)
			const trajCurve = new THREE.QuadraticBezierCurve3(
				new THREE.Vector3(-1.8, 0.05, 1.6),
				new THREE.Vector3(0.5, 0.45, 0.0),
				new THREE.Vector3(2.4, 0.05, -1.2)
			);
			const trajGeo = new THREE.BufferGeometry().setFromPoints(trajCurve.getPoints(40));
			const trajMat = new THREE.LineDashedMaterial({
				color: 0x22d3ee,
				dashSize: 0.12,
				gapSize: 0.06
			});
			const trajLine = new THREE.Line(trajGeo, trajMat);
			trajLine.computeLineDistances();
			reconstructionGroup.add(trajLine);

			// Update visibility according to initial prop state
			updateLayerVisibility();
			rebuildPickBvh();

			// Start Render Loop
			let elapsed = 0;
			let lastTime = performance.now();
			const animate = () => {
				animId = requestAnimationFrame(animate);
				const now = performance.now();
				const dt = Math.min(0.1, (now - lastTime) / 1000);
				lastTime = now;
				elapsed += dt;

				if (detectiveActor && riggedGuide && detectiveActor.visible) {
					stepCaseGuide(detectiveActor, dt);
					detectiveActor.updateWorldMatrix(true, false);
					scenePrimitiveManager.writeMatrixToArena(4, detectiveActor.matrixWorld);
				} else if (detectiveActor && !riggedGuide) {
					const u = detectiveActor.userData;
					// 1. Catmull-Rom Trajectory sampling along walk path when reconstruction is enabled
					if (sceneLayers.reconstruction && trajectoryProgress > 0) {
						const d = Math.max(0, Math.min(1, trajectoryProgress)) * walkPath.length;
						const sample = walkPath.at(d);
						detectiveActor.position.set(sample.x, sample.y, sample.z);
						detectiveActor.rotation.y = sample.heading;
					}

					// 2. Procedural breathing and legal motion overlays
					const breath = Math.sin(elapsed * 2.5) * 0.02;
					if (activeMotion && activeMotion !== 'none') {
						const dur = ATLAS_MOTION_DURATIONS[activeMotion] ?? 2.5;
						const motionT = elapsed % dur;
						const env = legalMotionEnvelope(motionT, dur);

						if (u.torso) u.torso.rotation.z = (u.baseTorsoRotZ ?? -0.35) + env * 0.15;
						if (u.rArm) {
							if (activeMotion === 'present_evidence') {
								u.rArm.rotation.z = (u.baseRArmRotZ ?? -0.9) + env * 1.2;
								u.rArm.rotation.x = -env * 0.4;
							} else if (activeMotion === 'objection_dramatic') {
								u.rArm.rotation.z = (u.baseRArmRotZ ?? -0.9) + env * 1.5;
								u.rArm.rotation.y = env * 0.3;
							} else if (activeMotion === 'forensic_inspect') {
								u.rArm.rotation.z = (u.baseRArmRotZ ?? -0.9) - env * 0.3;
							} else if (activeMotion === 'witness_oath') {
								u.rArm.rotation.z = (u.baseRArmRotZ ?? -0.9) + env * 1.4;
								u.rArm.rotation.x = env * 0.5;
							}
						}
					} else {
						// Idle breathing
						if (u.torso) u.torso.rotation.z = (u.baseTorsoRotZ ?? -0.35) + breath;
						if (u.rArm) {
							u.rArm.rotation.z = u.baseRArmRotZ ?? -0.9;
							u.rArm.rotation.x = 0;
							u.rArm.rotation.y = 0;
						}
					}

					detectiveActor.updateWorldMatrix(true, false);
					scenePrimitiveManager.writeMatrixToArena(4, detectiveActor.matrixWorld);
				}

				controls?.update();
				renderer?.render(scene!, camera!);
			};
			animate();
			sceneReady = true;

		} catch (err) {
			console.error('Failed to initialize Three.js WebGL scene:', err);
			isWebGLAvailable = false;
		}
	}

	function updateLayerVisibility() {
		if (evidenceGroup) evidenceGroup.visible = sceneLayers.evidence;
		if (markersGroup) markersGroup.visible = sceneLayers.markers;
		if (measurementsGroup) measurementsGroup.visible = sceneLayers.measurements;
		if (reconstructionGroup) reconstructionGroup.visible = sceneLayers.reconstruction;
		if (environmentGroup) environmentGroup.visible = sceneLayers.environment;
		if (detectiveActor) detectiveActor.visible = guideVisible;
	}

	$effect(() => {
		// Reactively update layer visibility when props change
		if (scene) {
			updateLayerVisibility();
		}
	});

	$effect(() => {
		// Reactively update visual style (PBR vs cel-shaded flat lighting)
		if (scene) {
			const isCel = visualStyle === 'cel-shaded';
			scene.traverse((obj) => {
				if ((obj as THREE.Mesh).isMesh) {
					const mesh = obj as THREE.Mesh;
					if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
						const stdMat = mesh.material as THREE.MeshStandardMaterial;
						stdMat.roughness = isCel ? 0.95 : 0.6;
						stdMat.metalness = isCel ? 0.0 : 0.2;
					}
				}
			});
		}
	});

	function setPointerRay(e: MouseEvent): void {
		if (!canvasEl || !camera) return;
		const rect = canvasEl.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouse, camera);
	}

	function selectCaseGroundPoint(event: MouseEvent, evidenceId?: string): void {
		if (!groundMesh || !camera || !onCaseGroundPoint) return;
		setPointerRay(event);
		const point = raycaster.intersectObject(groundMesh, false)[0]?.point;
		if (point) onCaseGroundPoint({ x: point.x, y: point.y, z: point.z }, evidenceId);
	}

	function primitiveIdForPick(pick: { type: string; id: any }): string | null {
		if (pick.type === 'evidence') return 'EXHIBIT_E002';
		if (pick.type === 'marker') return `MARKER_0${pick.id}`;
		if (pick.type === 'actor') return 'INVESTIGATOR_PAWN';
		return null;
	}

	function publishPrimitiveSnapshot(id: string): void {
		const config = scenePrimitiveManager.get(id);
		if (!config) return;
		config.mesh.updateWorldMatrix(true, false);
		scenePrimitiveManager.writeMatrixToArena(config.slotIndex, config.mesh.matrixWorld);
		const snapshot = scenePrimitiveManager.getSnapshot(id);
		if (snapshot) onSelectScenePrimitive?.(snapshot);
	}

	function handlePointerDown(e: PointerEvent) {
		if (!canvasEl || !camera || !scene) return;
		if (transformMode === 'marker' && caseMarkers) {
			if (e.button === 0) selectCaseGroundPoint(e);
			return;
		}
		setPointerRay(e);

		// Interactive Marker Placement: Click-to-place on ground floor in 'marker' mode
		if (transformMode === 'marker') {
			if (groundMesh) {
				const groundHits = raycaster.intersectObject(groundMesh, false);
				if (groundHits.length > 0) {
					const hitPoint = groundHits[0].point;
					const markerCount = pickables.filter((p) => p.type === 'marker').length;
					const nextMarkerId = markerCount + 1;
					const newMarker = createEvidenceMarkerTent(nextMarkerId, [hitPoint.x, 0, hitPoint.z]);
					markersGroup.add(newMarker);
					rebuildPickBvh();

					const slotIdx = 5 + (nextMarkerId - 4);
					scenePrimitiveManager.register({
						id: `MARKER_0${nextMarkerId}`,
						slotIndex: slotIdx,
						type: 'MARKER_TENT',
						mesh: newMarker,
						metadata: {
							label: `Evidence Tent #${nextMarkerId}`,
							position: [Number(hitPoint.x.toFixed(3)), 0, Number(hitPoint.z.toFixed(3))]
						}
					});
					scenePrimitiveManager.focusExhibit(`MARKER_0${nextMarkerId}`);
					const snapshot = scenePrimitiveManager.getSnapshot(`MARKER_0${nextMarkerId}`);
					if (snapshot) onSelectScenePrimitive?.(snapshot);
					onSelectMarker?.(nextMarkerId);
					return;
				}
			}
		}

		const bvhHits = pickBvhManager.raycast(raycaster);
		// Keep the direct Three.js path as a compatibility fallback if a dynamic
		// proxy is not yet represented in the current TLAS.
		if (canvasEl) canvasEl.dataset.pickBackend = bvhHits.length > 0 ? 'bvh' : 'three-raycaster-fallback';
		const intersects = bvhHits.length > 0
			? bvhHits
			: raycaster.intersectObjects(pickables.map((pickable) => pickable.object), false);

		if (intersects.length > 0) {
			const hit = intersects[0].object;
			const pick = pickables.find((p) => p.object === hit);
			if (pick) {
				if (pick.type === 'case-marker') {
					if (sceneLayers.markers) onCaseMarkerSelect?.(pick.id);
					return;
				}
				const primitiveId = primitiveIdForPick(pick);
				if (primitiveId) {
					selectedPrimitiveId = primitiveId;
					scenePrimitiveManager.focusExhibit(primitiveId);
					publishPrimitiveSnapshot(primitiveId);
				}
				if (pick.type === 'evidence') {
					onSelectEvidence?.({ id: pick.id, title: 'Bloodstain', type: 'Bloodstain (Image2D)' });
				} else if (pick.type === 'marker') {
					onSelectMarker?.(pick.id);
				}
				if ((transformMode === 'translate' || transformMode === 'rotate' || transformMode === 'scale') && primitiveId) {
					const config = scenePrimitiveManager.get(primitiveId);
					if (config) {
						let groundStartLocal: THREE.Vector3 | null = null;
						if (transformMode === 'translate' && groundMesh) {
							const groundHit = raycaster.intersectObject(groundMesh, false)[0];
							if (groundHit) {
								const local = groundHit.point.clone();
								config.mesh.parent?.worldToLocal(local);
								groundStartLocal = local;
							}
						}
						if (transformMode !== 'translate' || groundStartLocal) {
							primitiveDrag = {
								pointerId: e.pointerId,
								id: primitiveId,
								mode: transformMode,
								startX: e.clientX,
								startY: e.clientY,
								startPosition: config.mesh.position.clone(),
								startRotation: config.mesh.rotation.clone(),
								startScale: config.mesh.scale.clone(),
								groundStartLocal
							};
							controls && (controls.enabled = false);
							canvasEl.setPointerCapture(e.pointerId);
							e.preventDefault();
						}
					}
				}
			}
		}
	}

	function handlePointerMove(e: PointerEvent): void {
		if (!primitiveDrag || e.pointerId !== primitiveDrag.pointerId || !groundMesh) return;
		const config = scenePrimitiveManager.get(primitiveDrag.id);
		if (!config) return;
		if (primitiveDrag.mode === 'translate') {
			setPointerRay(e);
			const groundHit = raycaster.intersectObject(groundMesh, false)[0];
			if (!groundHit || !primitiveDrag.groundStartLocal) return;
			const currentLocal = groundHit.point.clone();
			config.mesh.parent?.worldToLocal(currentLocal);
			config.mesh.position.copy(primitiveDrag.startPosition).add(currentLocal.sub(primitiveDrag.groundStartLocal));
		} else if (primitiveDrag.mode === 'rotate') {
			config.mesh.rotation.copy(primitiveDrag.startRotation);
			config.mesh.rotation.y += (e.clientX - primitiveDrag.startX) * 0.01;
		} else {
			const factor = THREE.MathUtils.clamp(Math.exp((primitiveDrag.startY - e.clientY) * 0.01), 0.05, 20);
			config.mesh.scale.copy(primitiveDrag.startScale).multiplyScalar(factor);
		}
		config.mesh.updateWorldMatrix(true, false);
		scenePrimitiveManager.writeMatrixToArena(config.slotIndex, config.mesh.matrixWorld);
		pickBvhManager.refit();
		publishPrimitiveSnapshot(primitiveDrag.id);
		e.preventDefault();
	}

	function finishPrimitiveDrag(e: PointerEvent): void {
		if (!primitiveDrag || e.pointerId !== primitiveDrag.pointerId) return;
		const id = primitiveDrag.id;
		primitiveDrag = null;
		if (controls) controls.enabled = true;
		pickBvhManager.refit();
		publishPrimitiveSnapshot(id);
	}

	function handleResize() {
		if (!containerEl || !renderer || !camera) return;
		const w = containerEl.clientWidth;
		const h = containerEl.clientHeight;
		if (w > 0 && h > 0) {
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}
	}

	export function resetCameraOrbit() {
		if (controls && camera) {
			controls.target.set(1.6, 0.4, -0.5);
			camera.position.set(2.8, 3.2, 5.2);
			controls.update();
		}
	}

	export function focusEvidence() {
		if (controls && camera) {
			controls.target.set(2.4, 0.1, -1.2);
			camera.position.set(3.4, 1.4, -0.2);
			controls.update();
		}
	}

	onMount(() => {
		initScene();
		window.addEventListener('resize', handleResize);
		const resizeObs = new ResizeObserver(() => handleResize());
		if (containerEl) resizeObs.observe(containerEl);

		return () => {
			resizeObs.disconnect();
			window.removeEventListener('resize', handleResize);
		};
	});

	onDestroy(() => {
		// This viewer owns its registry and transform arena; tearing it down must not
		// reset the shared inspector FSM used by another active view.
		scenePrimitiveManager.clear(false);
		pickBvhManager.dispose();
		if (animId) cancelAnimationFrame(animId);
		controls?.dispose();
		caseMarkerGeometry?.dispose();
		caseMarkerMaterial?.dispose();
		previewMaterial?.dispose();
		solidFloorMaterial?.dispose();
		groundMesh?.geometry.dispose();
		blockout?.geometry.dispose();
		blockout?.material.dispose();
		blockout?.dispose();
		if (riggedGuide) {
			riggedGuide.mixer.stopAllAction();
			riggedGuide.mixer.uncacheRoot(riggedGuide.model);
			disposeGuideModel(riggedGuide.model);
			riggedGuide = null;
		}
		detectiveActor = null;
		caseMarkerMeshes.clear();
		renderer?.dispose();
		renderer = null;
		scene = null;
		controls = null;
	});
</script>

<div class="crime-scene-3d-wrapper" bind:this={containerEl}>
	{#if caseMarkers && !sceneReady && isWebGLAvailable}
		<div class="case-scene-loading" role="status">Preparing the 3D scene…</div>
	{/if}
	{#if guideVisible && guideLoadState === 'fallback'}
		<p class="case-guide-fallback" role="status">Using the static guide. Its animations are unavailable.</p>
	{/if}
	{#if isWebGLAvailable}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<canvas
			bind:this={canvasEl}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={finishPrimitiveDrag}
			onpointercancel={finishPrimitiveDrag}
			ondragover={(event) => {
				if (onCaseGroundPoint && event.dataTransfer?.types.includes(CASE_EXHIBIT_DRAG_TYPE)) event.preventDefault();
			}}
			ondrop={(event) => {
				const id = event.dataTransfer?.getData(CASE_EXHIBIT_DRAG_TYPE);
				if (!id || !onCaseGroundPoint) return;
				event.preventDefault();
				selectCaseGroundPoint(event, id);
			}}
			class="three-crime-canvas"
			data-guide={guideLoadState}
			data-guide-issue={guideLoadIssue ?? undefined}
			data-guide-rig-diagnostic={guideRigDiagnostic ?? undefined}
			data-guide-action={activeGuideClip}
			data-guide-visible={guideVisible}
			data-guide-scrub-time={guideScrubTime ?? undefined}
			class:hovering={isHoveringObject}
			class:mode-marker={transformMode === 'marker'}
		></canvas>
	{:else if caseMarkers}
		<div class="case-scene-loading" role="status">3D view unavailable. Enter a marker position in the inspector.</div>
	{:else}
		<!-- High-fidelity CSS 3D Isometric Fallback -->
		<div class="isometric-crime-fallback">
			<div class="iso-board">
				<div class="iso-detective-marker">
					<span class="iso-label">Detective Inspection Locus</span>
				</div>
				<div class="iso-bloodstain-marker">
					<span class="iso-tag">E-002 BLOODSTAIN</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.case-guide-fallback {
		position: absolute;
		z-index: 1;
		inset: auto 0.75rem 0.75rem;
		width: max-content;
		max-width: calc(100% - 1.5rem);
		margin: 0;
		padding: 0.4rem 0.65rem;
		border-radius: 6px;
		background: var(--dossier-bg-card, #faf6f0);
		color: var(--dossier-text-main, #141312);
		font-size: 0.8rem;
		pointer-events: none;
	}
	.case-scene-loading {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: var(--dossier-bg-card, #faf6f0);
		color: var(--dossier-text-main, #141312);
		text-align: center;
	}
	.crime-scene-3d-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #0a0e17;
	}
	.three-crime-canvas {
		width: 100% !important;
		height: 100% !important;
		display: block;
		cursor: grab;
	}
	.three-crime-canvas:active {
		cursor: grabbing;
	}
	.three-crime-canvas.hovering {
		cursor: pointer;
	}
	.three-crime-canvas.mode-marker {
		cursor: crosshair;
	}
	.isometric-crime-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: radial-gradient(circle at center, #1e293b 0%, #0a0e17 80%);
		color: #94a3b8;
		font-family: monospace;
	}
</style>
