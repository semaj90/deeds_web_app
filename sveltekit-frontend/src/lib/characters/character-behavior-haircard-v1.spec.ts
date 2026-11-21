import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
	HUMANOID_ARCHETYPES_V1,
	mountModularPartToSocketV1,
	generateHaircardStripGeometryV1,
	evaluateCharacterFsmAtSourceTimeV1,
	puctSelectActionV1,
	matrix4x4ToHexV1,
	hexToMatrix4x4V1,
	BoundedAssetDedupeQueueV1,
	createOntologyMeshAnimationClipsV1,
	seekOntologyMeshAnimationV1,
	type SourceClockFsmCueV1
} from './character-behavior-haircard-v1.js';
import {
	CHARACTER_ASSETS_BUCKET,
	EVIDENCE_BUCKET,
	resolveCharacterAssetsBucket,
	assertCharacterAssetsBucket
} from '$lib/server/storage/storage-buckets.js';

describe('Character Haircards, Sockets, N64 FSM / PUCT & 8 MiB Dedupe Queue (v1)', () => {
	it('defines neutral, male, and female illustrative humanoid archetypes and mounts modular eye/hair sockets', () => {
		expect(HUMANOID_ARCHETYPES_V1.neutral_forensic.heightMeters).toBe(1.75);
		expect(HUMANOID_ARCHETYPES_V1.male_archetype.shoulderWidthMeters).toBeGreaterThan(
			HUMANOID_ARCHETYPES_V1.female_archetype.shoulderWidthMeters
		);
		expect(HUMANOID_ARCHETYPES_V1.female_archetype.authority).toBe('GENERATED_ILLUSTRATIVE');

		const leftEye = mountModularPartToSocketV1({
			socketId: 'face.eye.left',
			partId: 'part:iris_amber_v1',
			headBoneWorldPosition: [0, 1.6, 0]
		});
		const rightEye = mountModularPartToSocketV1({
			socketId: 'face.eye.right',
			partId: 'part:iris_amber_v1',
			headBoneWorldPosition: [0, 1.6, 0]
		});

		expect(leftEye.boneName).toBe('Head');
		expect(leftEye.boneIndex).toBe(3);
		expect(leftEye.worldPositionOffset[0]).toBeCloseTo(-0.035, 5);
		expect(rightEye.worldPositionOffset[0]).toBeCloseTo(0.035, 5);
	});

	it('generates NVIDIA-style quad haircard strips with root-to-tip UVs and normalized Head/Neck bone weights', () => {
		const hair = generateHaircardStripGeometryV1(12, 0.11);

		expect(hair.slotTaxonomy).toBe('head.hair.cards_v1');
		expect(hair.vertexCount).toBe(12 * 6); // 72 vertices
		expect(hair.triangleCount).toBe(12 * 4); // 48 triangles
		expect(hair.indices.length).toBe(48 * 3);

		// Verify every vertex has normalized bone weights summing to 1.0
		for (let v = 0; v < hair.vertexCount; v++) {
			const w0 = hair.WEIGHTS_0[v * 4 + 0];
			const w1 = hair.WEIGHTS_0[v * 4 + 1];
			const w2 = hair.WEIGHTS_0[v * 4 + 2];
			const w3 = hair.WEIGHTS_0[v * 4 + 3];
			expect(w0 + w1 + w2 + w3).toBeCloseTo(1.0, 5);
			expect(hair.JOINTS_0[v * 4 + 0]).toBe(3); // Head bone
			expect(hair.JOINTS_0[v * 4 + 1]).toBe(2); // Neck bone
		}

		// Scalp root vertex (v=0) binds 100% to Head (bone 3); tip vertex (v=1) blends 0.85 Head + 0.15 Neck
		expect(hair.TEXCOORD_0[1]).toBe(0.0);
		expect(hair.WEIGHTS_0[0]).toBeCloseTo(1.0, 5);
		expect(hair.TEXCOORD_0[4 * 2 + 1]).toBe(1.0);
		expect(hair.WEIGHTS_0[4 * 4 + 0]).toBeCloseTo(0.85, 5);
		expect(hair.WEIGHTS_0[4 * 4 + 1]).toBeCloseTo(0.15, 5);
	});

	it('evaluates N64 character FSM states deterministically per source-clock domain and selects PUCT bandit actions', () => {
		const cues: SourceClockFsmCueV1[] = [
			{
				eventId: 'evt:cam1_walk',
				clockId: 'evidence:cam1',
				startMs: 1000,
				endMs: 4000,
				fsmState: 'WALK',
				clipDurationSeconds: 1.0,
				reviewStatus: 'HUMAN_ACCEPTED'
			},
			{
				eventId: 'evt:interview_dialogue',
				clockId: 'evidence:interview_02',
				startMs: 1500,
				endMs: 5000,
				fsmState: 'DIALOGUE',
				clipDurationSeconds: 2.0,
				reviewStatus: 'UNREVIEWED_HYPOTHESIS'
			}
		];

		// Before cam1 interval -> IDLE
		expect(evaluateCharacterFsmAtSourceTimeV1('evidence:cam1', 500, cues).state).toBe('IDLE');
		// Inside cam1 interval -> WALK at 0.5s playhead
		const walkState = evaluateCharacterFsmAtSourceTimeV1('evidence:cam1', 2500, cues);
		expect(walkState.state).toBe('WALK');
		expect(walkState.clipTimeSeconds).toBeCloseTo(0.5, 5);
		expect(walkState.reviewStatus).toBe('HUMAN_ACCEPTED');

		// Separate clock domain at same timestamp -> DIALOGUE (never mixes clocks)
		const dialogueState = evaluateCharacterFsmAtSourceTimeV1('evidence:interview_02', 2500, cues);
		expect(dialogueState.state).toBe('DIALOGUE');
		expect(dialogueState.reviewStatus).toBe('UNREVIEWED_HYPOTHESIS');

		// AlphaGo PUCT selection
		const puct = puctSelectActionV1({
			priors: [0.1, 0.15, 0.55, 0.1, 0.1], // High prior on index 2 (INSPECT)
			qValues: [0.0, 0.1, 0.4, 0.0, 0.0],
			visits: [5, 5, 1, 5, 5]
		});
		expect(puct.actionState).toBe('INSPECT');
	});

	it('roundtrips 4x4 Float32 matrices through 128-char hex and deduplicates 100 instanced walls in 8 MiB queue', async () => {
		const mat = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 12.5, 0, -4.25, 1]);
		const hex = matrix4x4ToHexV1(mat);
		expect(hex.length).toBe(128);
		const decoded = hexToMatrix4x4V1(hex);
		expect(Array.from(decoded)).toEqual(Array.from(mat));

		const dedupeQueue = new BoundedAssetDedupeQueueV1(8 * 1024 * 1024, 4096);
		const sharedWallBytes = new Uint8Array(4096).fill(0x21);

		for (let i = 0; i < 100; i++) {
			const m = new Float32Array(mat);
			m[12] = i * 2.0;
			await dedupeQueue.admit(`wall-${i}`, sharedWallBytes, m);
		}

		const stats = dedupeQueue.stats();
		expect(stats.queuedInstances).toBe(100);
		expect(stats.uniqueAssets).toBe(1);
		expect(stats.dedupeHits).toBe(99);
		expect(stats.residentBytes).toBe(4096); // 4 KiB instead of 400 KiB!
	});

	it('isolates CHARACTER_ASSETS_BUCKET (character-assets) from legal-evidence', () => {
		expect(resolveCharacterAssetsBucket({})).toBe(CHARACTER_ASSETS_BUCKET);
		expect(() => assertCharacterAssetsBucket(CHARACTER_ASSETS_BUCKET, {})).not.toThrow();
		expect(() => assertCharacterAssetsBucket(EVIDENCE_BUCKET, {})).toThrow(/CHARACTER_ASSETS_BUCKET_MISMATCH/);
		expect(() =>
			resolveCharacterAssetsBucket({ SEAWEED_CHARACTER_ASSETS_BUCKET: EVIDENCE_BUCKET })
		).toThrow(/CHARACTER_ASSETS_BUCKET_COLLISION/);
	});

	it('creates ontology-linked THREE.AnimationClips for skinned-7bone, procedural-nodes, and prop-mesh targets and seeks deterministically', () => {
		const skinnedClips = createOntologyMeshAnimationClipsV1('skinned-7bone');
		const nodeClips = createOntologyMeshAnimationClipsV1('procedural-nodes');
		const propClips = createOntologyMeshAnimationClipsV1('prop-mesh');

		expect(skinnedClips.map((c) => c.clipName)).toEqual(['IDLE', 'WALK', 'INSPECT', 'REACH', 'DIALOGUE']);
		expect(nodeClips.map((c) => c.clipName)).toEqual(['IDLE', 'WALK', 'INSPECT', 'REACH', 'DIALOGUE']);
		expect(propClips.map((c) => c.clipName)).toEqual(['DoorSwing', 'ChairPullOut', 'VehicleApproach', 'HairCardSway']);

		// 1. Seek skinned-7bone REACH clip at t=0.6s and verify ArmR rotates forward
		const rigRoot = new THREE.Group();
		const spine = new THREE.Object3D();
		spine.name = 'Spine';
		const armR = new THREE.Object3D();
		armR.name = 'ArmR';
		rigRoot.add(spine, armR);

		const reachClip = skinnedClips.find((c) => c.clipName === 'REACH')!;
		expect(reachClip.ontologyConceptId).toBe('pa:geometry.representation.skinned-mesh');
		expect(reachClip.cueConceptId).toBe('pa:event.cue.interact');

		seekOntologyMeshAnimationV1(rigRoot, reachClip.clip, 0.6);
		expect(Math.abs(armR.quaternion.x)).toBeGreaterThan(0.5);

		// 2. Seek prop-mesh ChairPullOut clip at t=0.6s and verify ChairRoot slides to z=-0.45m
		const propRoot = new THREE.Group();
		const chairRoot = new THREE.Object3D();
		chairRoot.name = 'ChairRoot';
		propRoot.add(chairRoot);

		const chairClip = propClips.find((c) => c.clipName === 'ChairPullOut')!;
		expect(chairClip.ontologyConceptId).toBe('pa:geometry.composite.chair');
		seekOntologyMeshAnimationV1(propRoot, chairClip.clip, 0.6);
		expect(chairRoot.position.z).toBeCloseTo(-0.45, 4);
	});
});
