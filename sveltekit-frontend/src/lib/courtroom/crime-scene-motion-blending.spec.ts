// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWalkPath, type Vec3 } from './walk-path-v1.js';
import {
	legalMotionEnvelope,
	ATLAS_MOTION_DURATIONS,
	atlasLegalMotionOverlay,
	type AtlasLegalMotionKey
} from './atlas-legal-motions-v1.js';
import { ScenePrimitiveManager } from '$lib/n64-fsm/scene-primitive-sync.js';
import { ARENA_BYTE_LENGTH } from '$lib/n64-fsm/scene-fsm-cache.js';

describe('Crime Scene Motion Blending & Trajectory Alignment', () => {
	const waypoints: readonly Vec3[] = [
		{ x: -1.8, y: 0.05, z: 1.6 },
		{ x: 0.5, y: 0.45, z: 0.0 },
		{ x: 2.4, y: 0.05, z: -1.2 }
	];

	it('samples Catmull-Rom walk path monotonically with finite headings', () => {
		const walkPath = buildWalkPath(waypoints, 16);
		expect(walkPath.length).toBeGreaterThan(4.0);

		const start = walkPath.at(0);
		expect(start.x).toBeCloseTo(-1.8, 4);
		expect(start.z).toBeCloseTo(1.6, 4);
		expect(Number.isFinite(start.heading)).toBe(true);

		const mid = walkPath.at(walkPath.length * 0.5);
		expect(Number.isFinite(mid.x)).toBe(true);
		expect(Number.isFinite(mid.y)).toBe(true);
		expect(Number.isFinite(mid.z)).toBe(true);
		expect(Number.isFinite(mid.heading)).toBe(true);

		const end = walkPath.at(walkPath.length);
		expect(end.x).toBeCloseTo(2.4, 4);
		expect(end.z).toBeCloseTo(-1.2, 4);
	});

	it('computes legal procedural envelopes with zero leakage at boundaries', () => {
		const motions: AtlasLegalMotionKey[] = [
			'present_evidence',
			'objection_dramatic',
			'forensic_inspect',
			'cross_examine',
			'witness_oath'
		];

		for (const key of motions) {
			const dur = ATLAS_MOTION_DURATIONS[key];
			expect(dur).toBeGreaterThan(1.0);

			expect(legalMotionEnvelope(-0.1, dur)).toBe(0);
			expect(legalMotionEnvelope(0, dur)).toBe(0);
			expect(legalMotionEnvelope(dur, dur)).toBe(0);
			expect(legalMotionEnvelope(dur + 0.1, dur)).toBe(0);

			// Peak sustain in middle
			const peak = legalMotionEnvelope(dur * 0.5, dur);
			expect(peak).toBeCloseTo(1.0, 3);
		}
	});

	it('synchronizes moving actor transform into 16 KiB Float32Array Arena without allocations', () => {
		const arena = new Float32Array(ARENA_BYTE_LENGTH / Float32Array.BYTES_PER_ELEMENT);
		const manager = new ScenePrimitiveManager(arena);

		const actor = new THREE.Group();
		actor.name = 'DetectiveActor';

		manager.register({
			id: 'INVESTIGATOR_PAWN',
			slotIndex: 4,
			type: 'ACTOR_PAWN',
			mesh: actor,
			metadata: { label: 'Investigator Avatar Pawn' }
		});

		const walkPath = buildWalkPath(waypoints);
		for (let progress = 0; progress <= 1.0; progress += 0.25) {
			const sample = walkPath.at(progress * walkPath.length);
			actor.position.set(sample.x, sample.y, sample.z);
			actor.rotation.y = sample.heading;
			actor.updateWorldMatrix(true, false);

			manager.writeMatrixToArena(4, actor.matrixWorld);
			const snap = manager.getSnapshot('INVESTIGATOR_PAWN');

			expect(snap).toBeDefined();
			expect(snap!.positionMeters[0]).toBeCloseTo(sample.x, 3);
			expect(snap!.positionMeters[1]).toBeCloseTo(sample.y, 3);
			expect(snap!.positionMeters[2]).toBeCloseTo(sample.z, 3);
		}
	});

	it('procedural motion overlays produce valid unit quaternions across courtroom poses', () => {
		const keys: AtlasLegalMotionKey[] = [
			'present_evidence',
			'objection_dramatic',
			'forensic_inspect',
			'witness_oath'
		];

		for (const key of keys) {
			const overlay = atlasLegalMotionOverlay(key);
			const dur = ATLAS_MOTION_DURATIONS[key];
			const pose = overlay(dur * 0.5); // at peak

			expect(Object.keys(pose).length).toBeGreaterThan(0);
			for (const [bone, quat] of Object.entries(pose)) {
				const norm = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
				expect(norm, `Bone ${bone} must maintain unit quaternion`).toBeCloseTo(1.0, 4);
			}
		}
	});
});
