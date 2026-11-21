import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SpatialBvhManagerV1 } from '$lib/splat/spatial-bvh-manager-v1.js';
import {
	SceneDeformationBrushV1,
	computeSoftFalloffWeightV1,
	decodeDeformationDeltaBinaryV1,
	encodeDeformationDeltaBinaryV1
} from './scene-deformation-brush-v1.js';

describe('SceneDeformationBrushV1 (ENG-04)', () => {
	it('computes exact soft falloff weights and rejects invalid radii', () => {
		expect(computeSoftFalloffWeightV1(0, 2, 2)).toBe(1);
		expect(computeSoftFalloffWeightV1(1, 2, 2)).toBeCloseTo(0.25, 6);
		expect(computeSoftFalloffWeightV1(2, 2, 2)).toBe(0);
		expect(computeSoftFalloffWeightV1(3, 2, 2)).toBe(0);
		expect(() => computeSoftFalloffWeightV1(0, 0, 2)).toThrow();
	});

	it('rejects immutable evidence meshes and point clouds', () => {
		const brush = new SceneDeformationBrushV1();

		const evidenceMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
		evidenceMesh.userData = { readOnlyEvidence: true };
		expect(() =>
			brush.applyStrokeStep(evidenceMesh, { center: [0, 0, 0], delta: [0, 0.2, 0], radius: 1 })
		).toThrow(/IMMUTABLE_EVIDENCE_GEOMETRY/);

		const points = new THREE.Points(new THREE.BoxGeometry(1, 1, 1));
		expect(() =>
			brush.applyStrokeStep(points, { center: [0, 0, 0], delta: [0, 0.2, 0], radius: 1 })
		).toThrow(/IMMUTABLE_POINT_CLOUD/);
	});

	it('displaces vertices, calls bvh.refit() on commit, encodes binary delta, and supports undo/redo', () => {
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 4, 4));
		const bvh = new SpatialBvhManagerV1();
		bvh.build(mesh);
		const refitSpy = vi.spyOn(bvh, 'refit');

		const brush = new SceneDeformationBrushV1(bvh);
		const posBefore = Float32Array.from(
			(mesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
		);

		const touched = brush.applyStrokeStep(mesh, {
			center: [0, 0, 0],
			delta: [0, 0, 0.5],
			radius: 1.5,
			falloffExponent: 2.0
		});
		expect(touched).toBeGreaterThan(0);

		const { receipt, deltas, binary } = brush.commitStroke('rev-test-001');
		expect(refitSpy).toHaveBeenCalledTimes(1);
		expect(receipt.bvhRefitted).toBe(true);
		expect(receipt.storageKey).toBe('atlas-artifacts/deformations/rev-test-001.bin');
		expect(receipt.affectedVertexCount).toBe(deltas.length);

		// Binary round-trip
		const decoded = decodeDeformationDeltaBinaryV1(binary);
		expect(decoded.length).toBe(deltas.length);
		expect(decoded[0].vertexIndex).toBe(deltas[0].vertexIndex);
		expect(decoded[0].dz).toBeCloseTo(deltas[0].dz, 5);

		// Undo restores exact original positions
		brush.applyDeltaRevision(mesh, decoded, -1);
		const posAfterUndo = (mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
			.array as Float32Array;
		for (let i = 0; i < posBefore.length; i++) {
			expect(posAfterUndo[i]).toBeCloseTo(posBefore[i], 5);
		}
		expect(refitSpy).toHaveBeenCalledTimes(2);
		bvh.dispose();
	});
});
