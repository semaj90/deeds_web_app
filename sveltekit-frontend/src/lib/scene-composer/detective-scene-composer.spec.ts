import { describe, it, expect } from 'vitest';
import {
	DETECTIVE_OBJECT_CATALOG,
	createSyntheticStairwellScene,
	convertSceneCompositionToKeyframeChunks,
	quaternionToRot6D,
	generateBlenderRnaExtractionScript
} from './detective-scene-composer.js';

describe('Detective Scene Composer V1 & Primitives Alignment', () => {
	it('defines the 5 standard calibrated forensic catalog primitives', () => {
		const keys = Object.keys(DETECTIVE_OBJECT_CATALOG);
		expect(keys).toContain('catalog:stairwell-concrete');
		expect(keys).toContain('catalog:office-chair-mesh');
		expect(keys).toContain('catalog:security-door-heavy');
		expect(keys).toContain('catalog:surveillance-camera-cctv');
		expect(keys).toContain('catalog:evidence-marker-tent');

		const marker = DETECTIVE_OBJECT_CATALOG['catalog:evidence-marker-tent'];
		expect(marker.category).toBe('forensic');
		expect(marker.boundingVolume).toEqual([0.12, 0.10, 0.14]);
	});

	it('converts quaternion to 6D continuous rotation correctly', () => {
		// Identity quaternion [0, 0, 0, 1]
		const identityRot6d = quaternionToRot6D([0, 0, 0, 1]);
		expect(identityRot6d[0]).toBeCloseTo(1, 4); // R00
		expect(identityRot6d[1]).toBeCloseTo(0, 4); // R10
		expect(identityRot6d[2]).toBeCloseTo(0, 4); // R20
		expect(identityRot6d[3]).toBeCloseTo(0, 4); // R01
		expect(identityRot6d[4]).toBeCloseTo(1, 4); // R11
		expect(identityRot6d[5]).toBeCloseTo(0, 4); // R21
	});

	it('creates a valid 5-object synthetic stairwell scene matching schema', () => {
		const scene = createSyntheticStairwellScene();
		expect(scene.schema).toBe('atlas.detective-scene-composition.v1');
		expect(scene.classification).toBe('SYNTHETIC_FIXTURE');
		expect(scene.calibration).toBe('CALIPER_VERIFIED');
		expect(scene.objects.length).toBe(5);

		// Verified objects
		expect(scene.objects[0].objectId).toBe('obj-stairs-01');
		expect(scene.objects[1].objectId).toBe('obj-door-01');
		expect(scene.objects[2].objectId).toBe('obj-cctv-01');
		expect(scene.objects[3].objectId).toBe('obj-chair-01');
		expect(scene.objects[4].objectId).toBe('obj-marker-02');

		// Location context
		expect(scene.location.latitude).toBeCloseTo(34.0522, 4);
		expect(scene.location.longitude).toBeCloseTo(-118.2437, 4);
	});

	it('converts scene composition to SIMD keyframe chunks with Morton codes', () => {
		const scene = createSyntheticStairwellScene();
		const chunks = convertSceneCompositionToKeyframeChunks(scene);

		expect(chunks.length).toBe(5);
		chunks.forEach((chunk, i) => {
			expect(chunk.slotIndex).toBe(i);
			expect(chunk.mortonCode).toBeGreaterThanOrEqual(0);
			expect(chunk.rot6d.length).toBe(6);
			expect(chunk.position.length).toBe(3);
			expect(chunk.scale.length).toBe(3);
		});
	});

	it('generates Blender Python RNA extraction script with foreach_get memory safety', () => {
		const script = generateBlenderRnaExtractionScript('StairwellMesh');
		expect(script).toContain('foreach_get("co", coords)');
		expect(script).not.toContain('as_pointer()');
		expect(script).toContain('np.float32');
	});
});
