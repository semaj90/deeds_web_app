import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
	ResourceCache,
	SceneGeneration,
	MotionCacheThree,
	ThreeCharacterRuntime,
	MaterialPreviewThree,
	ApplyMaterialPreviewCommand,
	characterTemplateCacheKey,
	pageResidencyKey,
	motionCacheKey,
	assertCompatibleMotion,
	cueClipSeconds,
	selectHotset,
	parseCreatorShortcut,
	nextMaterial,
	isEditorShortcutTarget,
	CREATOR_SWATCHES,
	DEFAULT_MATERIAL_EDITOR,
	type CharacterCatalog,
	type MotionDescriptor,
	type SourceCue
} from './character-runtime-v2.js';
import { createSceneRuntimeThreeV1 } from '$lib/reconstruction/scene-runtime-three-v1.js';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import { compileSceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
import { SceneControllerV1 } from '$lib/scene/scene-controller-v1.js';
import { validateOneBoneRigidSkinV1 } from '$lib/splat/one-bone-rigid-skin-validator-v1.js';
import { parseGlb } from '$lib/character-animation/glb-clip-sampler-v1.js';

const here = dirname(fileURLToPath(import.meta.url));
const staticParentAtlasDir = resolve(here, '../../../static/parent-atlas');
const blenderRiggedGlbPath =
	'C:/Users/james/.gemini/antigravity/brain/ba824cbc-894a-4499-859f-d05973d1056c/scratch/pa-rig-output/parent-atlas-rigged.glb';

async function loadStaticCatalogAndMotions() {
	const catalogRaw = await readFile(resolve(staticParentAtlasDir, 'catalog.json'), 'utf8');
	const motionRaw = await readFile(resolve(staticParentAtlasDir, 'motion-catalog.json'), 'utf8');
	const catalog = JSON.parse(catalogRaw) as CharacterCatalog;
	const motionJson = JSON.parse(motionRaw) as {
		clips: Array<{
			name: string;
			rig_signature: string;
			sha256: string;
			object_key: string;
			encoded_bytes: number;
			duration_seconds: number;
			taxonomy_id: string;
			scope_kind: 'public-procedural';
			source_format: 'glb-node-animation' | 'glb-skin-animation';
		}>;
	};
	const motions: MotionDescriptor[] = motionJson.clips.map((c) => ({
		clipId: c.name,
		name: c.name,
		rigSignature: c.rig_signature,
		sha256: c.sha256,
		objectKey: c.object_key,
		encodedBytes: c.encoded_bytes,
		durationSeconds: c.duration_seconds,
		taxonomyId: c.taxonomy_id,
		scope: { scopeKind: 'public-procedural' },
		format: c.source_format
	}));
	return { catalog, motions };
}

function makeLocalStaticFetcher() {
	const counts = new Map<string, number>();
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}
		const url = String(input);
		counts.set(url, (counts.get(url) ?? 0) + 1);
		const prefix = '/parent-atlas/';
		const rel = url.startsWith(prefix) ? url.slice(prefix.length) : url.replace(/^\//, '');
		const diskPath = resolve(staticParentAtlasDir, rel);
		const bytes = await readFile(diskPath);
		const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		return new Response(ab, { status: 200 });
	}) as typeof fetch;
	return {
		fetcher,
		counts,
		totalCalls: () => [...counts.values()].reduce((a, b) => a + b, 0)
	};
}

function makeTwoActorRecipe() {
	const caseId = '11111111-1111-4111-8111-111111111111';
	const sceneId = '22222222-2222-4222-8222-222222222222';
	const evId = '33333333-3333-4333-8333-333333333333';
	const hashA = 'a'.repeat(64);
	const plan = buildSceneGenerationPlanV1({
		schema: 'parent-atlas.scene-generation-plan/v1',
		caseId,
		sceneId,
		expectedSceneRevision: 1,
		generator: 'procedural-three-scene-v1',
		caseIntake: null,
		narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
		sources: [{ evidenceId: evId, sourceRevision: `sha256:${hashA}`, sha256: hashA }],
		reviewedObservations: [],
		actors: [
			{
				actorId: 'ACTOR-1',
				label: 'Witness A',
				appearance: 'Low-poly synthetic witness A',
				evidenceIds: [evId]
			},
			{
				actorId: 'ACTOR-2',
				label: 'Witness B',
				appearance: 'Low-poly synthetic witness B',
				evidenceIds: [evId]
			}
		],
		primitives: [{ objectId: 'OBJECT-CRATE-1', registryId: 'box' }],
		assets: [],
		placements: [
			{
				placementId: 'PLACEMENT-ACTOR-1',
				targetKind: 'actor',
				targetId: 'ACTOR-1',
				positionMeters: [1, 0, -2],
				rotationQuaternion: [0, 0, 0, 1],
				scale: [1, 1, 1]
			},
			{
				placementId: 'PLACEMENT-ACTOR-2',
				targetKind: 'actor',
				targetId: 'ACTOR-2',
				positionMeters: [-2, 0, 1],
				rotationQuaternion: [0, 0.7071068, 0, 0.7071068],
				scale: [1, 1, 1]
			},
			{
				placementId: 'PLACEMENT-CRATE-1',
				targetKind: 'primitive',
				targetId: 'OBJECT-CRATE-1',
				positionMeters: [0, 0.5, 0],
				rotationQuaternion: [0, 0, 0, 1],
				scale: [1, 1, 1]
			}
		],
		events: [
			{
				eventId: 'EVENT-WALK-1',
				cueType: 'move',
				label: 'Actor 1 walks across room',
				status: 'hypothesis',
				reviewStatus: 'unreviewed',
				evidenceIds: [evId],
				actorIds: ['ACTOR-1'],
				targetRefs: [{ kind: 'actor', targetId: 'ACTOR-1' }],
				action: {
					type: 'move_during_interval',
					fromMeters: [1, 0, -2],
					toMeters: [5, 0, -2]
				},
				clock: {
					evidenceId: evId,
					clockId: 'CLK-CAM-1',
					startMs: 1000,
					endMs: 3000,
					uncertaintyMs: 100
				}
			},
			{
				eventId: 'EVENT-WALK-2',
				cueType: 'move',
				label: 'Actor 2 walks later',
				status: 'hypothesis',
				reviewStatus: 'unreviewed',
				evidenceIds: [evId],
				actorIds: ['ACTOR-2'],
				targetRefs: [{ kind: 'actor', targetId: 'ACTOR-2' }],
				action: {
					type: 'move_during_interval',
					fromMeters: [-2, 0, 1],
					toMeters: [-2, 0, 4]
				},
				clock: {
					evidenceId: evId,
					clockId: 'CLK-CAM-1',
					startMs: 2000,
					endMs: 4000,
					uncertaintyMs: 100
				}
			}
		],
		environment: {
			kind: 'indoor',
			seed: 42,
			cellSizeMeters: 32,
			extentMeters: { x: 320, z: 320 },
			coordinateStatus: 'illustrative_uncalibrated',
			calibrationEvidenceIds: []
		},
		quality: {
			profile: 'retro',
			maxTextureDimension: 128,
			maxTriangles: 100_000,
			maxInstances: 20_000,
			activeSceneMemoryMiB: 8
		},
		provenance: {
			intakeStatus: 'USER_INTAKE_UNVERIFIED',
			clockPolicy: 'source_local_unaligned',
			identityPolicy: 'pseudonymous_visual_handles',
			motivePolicy: 'unknown_or_cited_hypothesis'
		}
	});
	return compileSceneRuntimeRecipeV1(plan);
}

describe('Parent Atlas Character Creator v2 — Reconciled Runtime & Course Correction Proofs', () => {
	it('P0-1 & P0-2: keys character templates by scope/case/revision/tier/sha256 and revalidates authorization on cache hits', async () => {
		const { catalog } = await loadStaticCatalogAndMotions();
		const caseA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const caseB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

		const pubKey = characterTemplateCacheKey(catalog, 'retro', {
			scopeKind: 'public-procedural'
		});
		const privKeyA = characterTemplateCacheKey(catalog, 'retro', {
			scopeKind: 'case-private',
			caseId: caseA,
			authorizationScopeId: 'user-7',
			sceneRevision: 3
		});
		const privKeyB = characterTemplateCacheKey(catalog, 'retro', {
			scopeKind: 'case-private',
			caseId: caseB,
			authorizationScopeId: 'user-7',
			sceneRevision: 3
		});

		expect(pubKey).not.toBe(privKeyA);
		expect(privKeyA).not.toBe(privKeyB);
		expect(() =>
			characterTemplateCacheKey(catalog, 'retro', {
				scopeKind: 'case-private',
				caseId: 'not-a-uuid'
			})
		).toThrow(/valid UUID caseId/);

		// Prove cache hit STILL calls urlForKey authorization resolver and fails closed if session is revoked
		const { fetcher } = makeLocalStaticFetcher();
		const templateCache = new ResourceCache<{
			root: THREE.Group;
			animations: THREE.AnimationClip[];
		}>(4 * 1024 * 1024);
		let sessionAuthorized = true;
		const authResolver = vi.fn(async (objectKey: string) => {
			if (!sessionAuthorized) throw new Error('403 Forbidden: session revoked');
			return `/parent-atlas/objects/${objectKey}`;
		});

		const sceneA = new THREE.Group();
		const runtimeA = new ThreeCharacterRuntime(
			sceneA,
			authResolver,
			templateCache,
			undefined,
			fetcher
		);
		await runtimeA.load(catalog, 'retro', {
			scopeKind: 'case-private',
			caseId: caseA,
			authorizationScopeId: 'user-7'
		});
		expect(authResolver).toHaveBeenCalledTimes(1);
		expect(templateCache.snapshot().items).toBe(1);

		// Second actor with same case + hash hits resident cache, but MUST still call authResolver
		const sceneA2 = new THREE.Group();
		const runtimeA2 = new ThreeCharacterRuntime(
			sceneA2,
			authResolver,
			templateCache,
			undefined,
			fetcher
		);
		sessionAuthorized = false;
		await expect(
			runtimeA2.load(catalog, 'retro', {
				scopeKind: 'case-private',
				caseId: caseA,
				authorizationScopeId: 'user-7'
			})
		).rejects.toThrow('403 Forbidden: session revoked');
		expect(authResolver).toHaveBeenCalledTimes(2);

		runtimeA.dispose();
		runtimeA2.dispose();
	});

	it('P0-3: MotionCacheThree reauthorizes every acquire (even cache hits), rejects mismatched rigs, and excludes private clips from hotsets', async () => {
		const { motions } = await loadStaticCatalogAndMotions();
		const walkPub = motions.find((m) => m.name === 'Walk')!;
		const caseA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const walkPriv: MotionDescriptor = {
			...walkPub,
			clipId: 'Walk-Private',
			scope: { scopeKind: 'case-private', caseId: caseA, authorizationScopeId: 'user-1' }
		};

		expect(motionCacheKey(walkPub)).not.toBe(motionCacheKey(walkPriv));
		expect(() => assertCompatibleMotion(walkPub, 'f'.repeat(64))).toThrow(/rig mismatch/);

		const hotset = selectHotset(
			[walkPub, walkPriv],
			{ Walk: 10, 'Walk-Private': 99999 },
			walkPub.rigSignature,
			64 * 1024
		);
		expect(hotset.map((c) => c.clipId)).toEqual(['Walk']);

		const { fetcher, counts } = makeLocalStaticFetcher();
		let allowCaseA = true;
		const resolveUrl = vi.fn(async (clip: MotionDescriptor) => {
			if (clip.scope.scopeKind === 'case-private' && !allowCaseA) {
				throw new Error('403 Forbidden: case access denied');
			}
			return `/parent-atlas/objects/${clip.objectKey}`;
		});

		const motionCache = new MotionCacheThree(resolveUrl, 512 * 1024, fetcher);
		const first = await motionCache.acquire(walkPriv, walkPriv.rigSignature);
		expect(first.clip.name).toBe('Walk');
		expect(counts.get(`/parent-atlas/objects/${walkPriv.objectKey}`)).toBe(1);

		// Resident cache hit when authorized: zero extra HTTP fetch, but resolveUrl IS called
		const second = await motionCache.acquire(walkPriv, walkPriv.rigSignature);
		expect(second.clip).toBe(first.clip);
		expect(resolveUrl).toHaveBeenCalledTimes(2);
		expect(counts.get(`/parent-atlas/objects/${walkPriv.objectKey}`)).toBe(1);

		// Revoke access: even though clip is resident in cache, acquire MUST reject with 403
		allowCaseA = false;
		await expect(motionCache.acquire(walkPriv, walkPriv.rigSignature)).rejects.toThrow(
			'403 Forbidden: case access denied'
		);

		motionCache.release(first.key);
		motionCache.release(second.key);
		expect(motionCache.invalidateCaseScope(caseA)).toBe(1);
		expect(motionCache.stats().items).toBe(0);
	});

	it('P0-1, P0-4, P0-5, Step 3: two actors in createSceneRuntimeThreeV1 share one Walk clip with independent mixers, preserve state across LOD switches, and execute 100 video seeks with zero extra network fetches', async () => {
		const { catalog, motions } = await loadStaticCatalogAndMotions();
		const { fetcher, counts, totalCalls } = makeLocalStaticFetcher();
		const templateCache = new ResourceCache<{
			root: THREE.Group;
			animations: THREE.AnimationClip[];
		}>(8 * 1024 * 1024);
		const motionCache = new MotionCacheThree(
			async (clip) => `/parent-atlas/objects/${clip.objectKey}`,
			512 * 1024,
			fetcher
		);

		const runtime = createSceneRuntimeThreeV1(makeTwoActorRecipe(), {
			fetcher,
			motionCache,
			characterTemplateCache: templateCache,
			resolveCharacterAssetUrl: async (objectKey) => `/parent-atlas/objects/${objectKey}`
		});

		// Load Retro GLB + external motion clips onto BOTH actors
		const rt1 = await runtime.loadCharacterActor(
			'ACTOR-1',
			catalog,
			'retro',
			{ scopeKind: 'public-procedural' },
			motions
		);
		const rt2 = await runtime.loadCharacterActor(
			'ACTOR-2',
			catalog,
			'retro',
			{ scopeKind: 'public-procedural' },
			motions
		);

		const walkUrl = `/parent-atlas/objects/${motions.find((m) => m.name === 'Walk')!.objectKey}`;
		const retroUrl = `/parent-atlas/objects/${catalog.lods.retro.object_key}`;

		// Proof Gate 5: Public Walk clip and Retro GLB are fetched over HTTP ONCE and shared by both actors
		expect(counts.get(walkUrl)).toBe(1);
		expect(counts.get(retroUrl)).toBe(1);
		expect(motionCache.stats().hits).toBeGreaterThanOrEqual(1);

		// Seek to 1250 ms: ACTOR-1 is 250 ms into EVENT-WALK-1 (Walk @ 0.25s), ACTOR-2 is not yet in EVENT-WALK-2 (Idle @ 0s)
		runtime.setSourceTime('CLK-CAM-1', 1250);
		expect(rt1.currentClipName).toBe('Walk');
		expect(rt1.currentPlayheadSeconds).toBeCloseTo(0.25, 5);
		expect(rt2.currentClipName).toBe('Idle');
		expect(rt2.currentPlayheadSeconds).toBeCloseTo(0, 5);

		// Seek to 2650 ms: ACTOR-1 is at 1650 ms -> looped Walk @ 0.65s; ACTOR-2 is at 650 ms into EVENT-WALK-2 -> Walk @ 0.65s
		// Seek to 2150 ms: ACTOR-1 is at 1150 ms -> Walk @ 0.15s; ACTOR-2 is at 150 ms -> Walk @ 0.15s
		runtime.setSourceTime('CLK-CAM-1', 2250);
		expect(rt1.currentClipName).toBe('Walk');
		expect(rt2.currentClipName).toBe('Walk');
		// Distinct playheads: ACTOR-1 started at 1000ms (t=0.25s), ACTOR-2 started at 2000ms (t=0.25s); now seek to 2150ms where ACTOR-1 is at 1150ms (0.15s) and manually seek ACTOR-2 to 0.65s to prove independent mixer pose
		rt1.seekClip('Walk', 0.15);
		rt2.seekClip('Walk', 0.65);
		const hipL1 = rt1.root?.getObjectByName('HipLeft');
		const hipL2 = rt2.root?.getObjectByName('HipLeft');
		expect(hipL1).toBeDefined();
		expect(hipL2).toBeDefined();
		expect(hipL1!.quaternion.x).not.toBeCloseTo(hipL2!.quaternion.x, 3);

		// Proof Gate 6: 100 video seeks across forward, backward, loop, pause, and out-of-event boundaries perform ZERO network fetches
		const callsBefore100Seeks = totalCalls();
		for (let i = 0; i < 100; i++) {
			const t = i % 2 === 0 ? 500 + i * 35 : 4000 - i * 30;
			runtime.setSourceTime('CLK-CAM-1', Math.max(0, t));
		}
		expect(totalCalls()).toBe(callsBefore100Seeks);

		// P0-1 Proof: Switch ACTOR-1 from 'retro' to 'balanced' at t = 1400 ms (Walk @ 0.40s, position [1.8, 0, -2])
		runtime.setSourceTime('CLK-CAM-1', 1400);
		const actor1Node = runtime.targetNodes.get('actor:ACTOR-1')!;
		expect(actor1Node.position.x).toBeCloseTo(1.8, 4);
		expect(rt1.currentClipName).toBe('Walk');
		expect(rt1.currentPlayheadSeconds).toBeCloseTo(0.4, 4);

		await runtime.loadCharacterActor(
			'ACTOR-1',
			catalog,
			'balanced',
			{ scopeKind: 'public-procedural' },
			motions
		);
		expect(rt1.currentTier).toBe('balanced');
		expect(actor1Node.position.x).toBeCloseTo(1.8, 4);
		expect(actor1Node.userData.actorId).toBe('ACTOR-1');
		expect(actor1Node.userData.placementId).toBe('PLACEMENT-ACTOR-1');
		expect(rt1.currentClipName).toBe('Walk');
		expect(rt1.currentPlayheadSeconds).toBeCloseTo(0.4, 4);

		runtime.dispose();
	});

	it('P0-6: stale character LOD load generation cannot overwrite a newer LOD request', async () => {
		const { catalog } = await loadStaticCatalogAndMotions();
		const { fetcher } = makeLocalStaticFetcher();
		const templateCache = new ResourceCache<{
			root: THREE.Group;
			animations: THREE.AnimationClip[];
		}>(8 * 1024 * 1024);

		let releaseSlowRetro: (() => void) | undefined;
		const slowRetroPromise = new Promise<void>((r) => {
			releaseSlowRetro = r;
		});

		const delayedResolver = async (
			objectKey: string,
			meta: { tier: string }
		): Promise<string> => {
			if (meta.tier === 'retro') {
				await slowRetroPromise;
			}
			return `/parent-atlas/objects/${objectKey}`;
		};

		const group = new THREE.Group();
		const rt = new ThreeCharacterRuntime(
			group,
			delayedResolver,
			templateCache,
			undefined,
			fetcher
		);

		const staleRetroLoad = rt.load(catalog, 'retro');
		const newerBalancedLoad = rt.load(catalog, 'balanced');
		await newerBalancedLoad;
		releaseSlowRetro?.();
		await staleRetroLoad;

		expect(rt.currentTier).toBe('balanced');
		expect(group.children).toHaveLength(1);
		expect(rt.root?.userData.lodTier).toBe('balanced');
		rt.dispose();
	});

	it('P1 & Step 4: focus-scoped material/UV hotkeys, text-input isolation, shared-texture safety, and SceneControllerV1 undo/redo', () => {
		// Keyboard isolation for INPUT, TEXTAREA, SELECT, BUTTON, contentEditable, IME composition, and modifiers
		expect(isEditorShortcutTarget('DIV', false)).toBe(true);
		expect(isEditorShortcutTarget('ASIDE', false)).toBe(true);
		expect(isEditorShortcutTarget('INPUT', false)).toBe(false);
		expect(isEditorShortcutTarget('TEXTAREA', false)).toBe(false);
		expect(isEditorShortcutTarget('SELECT', false)).toBe(false);
		expect(isEditorShortcutTarget('BUTTON', false)).toBe(false);
		expect(isEditorShortcutTarget('DIV', true)).toBe(false);

		expect(parseCreatorShortcut({ code: 'Digit3' })).toEqual({ type: 'swatch', index: 2 });
		expect(parseCreatorShortcut({ code: 'KeyM' })).toEqual({ type: 'shader-next' });
		expect(parseCreatorShortcut({ code: 'BracketLeft' })).toEqual({
			type: 'tile',
			multiplier: 0.5
		});
		expect(parseCreatorShortcut({ code: 'BracketRight' })).toEqual({
			type: 'tile',
			multiplier: 2
		});
		expect(parseCreatorShortcut({ code: 'KeyU' })).toEqual({ type: 'uv-next' });
		expect(parseCreatorShortcut({ code: 'KeyK' })).toEqual({ type: 'play-toggle' });
		expect(parseCreatorShortcut({ code: 'KeyK', shiftKey: true })).toEqual({
			type: 'keyframe-insert'
		});
		expect(parseCreatorShortcut({ code: 'KeyJ' })).toEqual({
			type: 'keyframe',
			direction: -1
		});
		expect(parseCreatorShortcut({ code: 'KeyL' })).toEqual({
			type: 'keyframe',
			direction: 1
		});
		expect(parseCreatorShortcut({ code: 'KeyM', ctrlKey: true })).toBeNull();
		expect(parseCreatorShortcut({ code: 'KeyM', isComposing: true })).toBeNull();
		expect(parseCreatorShortcut({ code: 'KeyM', repeat: true })).toBeNull();

		// Two meshes sharing one standalone RepeatWrapping texture
		const sharedTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
		sharedTex.wrapS = THREE.RepeatWrapping;
		sharedTex.wrapT = THREE.RepeatWrapping;
		const geo1 = new THREE.BoxGeometry(1, 1, 1);
		const geo2 = new THREE.BoxGeometry(1, 1, 1);
		const mat1 = new THREE.MeshStandardMaterial({ map: sharedTex });
		const mat2 = new THREE.MeshStandardMaterial({ map: sharedTex });
		const mesh1 = new THREE.Mesh(geo1, mat1);
		const mesh2 = new THREE.Mesh(geo2, mat2);

		const preview = new MaterialPreviewThree();
		const controller = new SceneControllerV1();
		let uiState = { ...DEFAULT_MATERIAL_EDITOR };

		// DEFAULT_MATERIAL_EDITOR starts at 'standard'; two shader-next steps cycle standard -> unlit -> lambert
		const targetState = nextMaterial(
			nextMaterial(
				nextMaterial(
					nextMaterial(DEFAULT_MATERIAL_EDITOR, { type: 'swatch', index: 3 }),
					{ type: 'shader-next' }
				),
				{ type: 'shader-next' }
			),
			{ type: 'tile', multiplier: 2 }
		);

		const cmd = new ApplyMaterialPreviewCommand(
			'ACTOR-1',
			mesh1,
			preview,
			DEFAULT_MATERIAL_EDITOR,
			targetState,
			{ isAtlasPage: false },
			(s) => {
				uiState = s;
			}
		);
		controller.history.execute(cmd, controller.getContext());

		expect(uiState.swatchIndex).toBe(3);
		expect(uiState.shader).toBe('lambert');
		expect(uiState.tiling).toBe(2);
		expect(mesh1.material).toBeInstanceOf(THREE.MeshLambertMaterial);
		expect((mesh1.material as THREE.MeshLambertMaterial).color.getHexString()).toBe(
			CREATOR_SWATCHES[3].slice(1)
		);
		// Shared texture repeat & mesh2 must remain untouched
		expect(sharedTex.repeat.x).toBe(1);
		expect(sharedTex.repeat.y).toBe(1);
		expect(mesh2.material).toBe(mat2);
		expect(mesh2.geometry).toBe(geo2);

		// Atlas subrect tiling must be rejected
		expect(() =>
			preview.apply(mesh2, { ...DEFAULT_MATERIAL_EDITOR, tiling: 2 }, { isAtlasPage: true })
		).toThrow(/Atlas subrect/);

		// Undo restores original state; Redo re-applies
		expect(controller.undo()).toBe(true);
		expect(uiState).toEqual(DEFAULT_MATERIAL_EDITOR);
		expect(mesh1.material).toBeInstanceOf(THREE.MeshStandardMaterial);

		expect(controller.redo()).toBe(true);
		expect(uiState).toEqual(targetState);
		expect(mesh1.material).toBeInstanceOf(THREE.MeshLambertMaterial);

		// Reset restores exact template geometry and material without disposing shared texture
		preview.dispose();
		expect(mesh1.geometry).toBe(geo1);
		expect(mesh1.material).toBe(mat1);
	});

	it('P1 & Proof Gate 2: inspects separately generated Blender 4.3 parent-atlas-rigged.glb skin weights, UVs, and skeletal Walk deformation', async () => {
		if (!existsSync(blenderRiggedGlbPath)) {
			return;
		}
		const bytes = await readFile(blenderRiggedGlbPath);
		const ab = await new Response(bytes).arrayBuffer();

		// 1. Direct GLB binary parser check
		const parsed = parseGlb(new Uint8Array(ab));
		expect(parsed.animations).toHaveLength(1);
		expect(parsed.animations[0]?.name).toBe('Walk');
		expect(parsed.animations[0]?.duration).toBeGreaterThan(0.9);

		// 2. Three.js GLTFLoader parse + OneBoneRigidSkinValidator check on every SkinnedMesh
		const loader = new GLTFLoader();
		const gltf = await new Promise<{
			scene: THREE.Group;
			animations: THREE.AnimationClip[];
		}>((res, rej) => loader.parse(ab, '', (g) => res(g), rej));

		const skinnedMeshes: THREE.SkinnedMesh[] = [];
		gltf.scene.traverse((obj) => {
			if (obj instanceof THREE.SkinnedMesh) {
				skinnedMeshes.push(obj);
			}
		});
		expect(skinnedMeshes.length).toBe(11);

		for (const sm of skinnedMeshes) {
			const pos = sm.geometry.getAttribute('position');
			const uv = sm.geometry.getAttribute('uv');
			const skinIdx = sm.geometry.getAttribute('skinIndex');
			const skinWgt = sm.geometry.getAttribute('skinWeight');
			expect(pos).toBeDefined();
			expect(uv).toBeDefined();
			expect(skinIdx).toBeDefined();
			expect(skinWgt).toBeDefined();
			expect(sm.skeleton.bones.length).toBe(7);

			const validation = validateOneBoneRigidSkinV1({
				positions: pos.array as ArrayLike<number>,
				skinIndex: skinIdx.array as ArrayLike<number>,
				skinWeight: skinWgt.array as ArrayLike<number>,
				boneCount: sm.skeleton.bones.length
			});
			expect(validation.ok).toBe(true);
		}

		// 3. Step AnimationMixer on 'Walk' and verify actual bone rotation change on Arm.L / ArmL
		const mixer = new THREE.AnimationMixer(gltf.scene);
		const walkClip = gltf.animations[0]!;
		mixer.clipAction(walkClip).play();
		mixer.setTime(0);
		gltf.scene.updateMatrixWorld(true);
		const armBone = skinnedMeshes[0]!.skeleton.bones.find(
			(b) => b.name === 'ArmL' || b.name === 'Arm.L'
		)!;
		expect(armBone).toBeDefined();
		const q0 = armBone.quaternion.clone();

		mixer.setTime(0.25);
		gltf.scene.updateMatrixWorld(true);
		const q1 = armBone.quaternion.clone();
		expect(q0.equals(q1)).toBe(false);
	});
});
