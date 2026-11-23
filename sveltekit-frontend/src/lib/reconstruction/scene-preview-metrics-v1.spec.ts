import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Mesh } from 'three';
import { countSceneGeometryBufferBytesV1, createScenePreviewSamplesV1 } from './scene-preview-metrics-v1.js';

describe('scene preview metrics', () => {
	it('counts shared backing buffers once and includes instance matrices', () => {
		const storage = new Float32Array(18);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new BufferAttribute(storage.subarray(0, 9), 3));
		geometry.setAttribute('normal', new BufferAttribute(storage.subarray(9), 3));
		const mesh = new InstancedMesh(geometry, undefined, 2);
		const root = new Group().add(mesh, new Mesh(geometry));
		expect(countSceneGeometryBufferBytesV1(root)).toBe(storage.byteLength + 2 * 16 * 4);
	});

	it('drops overwritten samples and ignores invalid timing values', () => {
		const series = createScenePreviewSamplesV1(3);
		expect(series.p95()).toBeNull();
		for (const sample of [1000, 12, 13, 14, NaN, -1, Infinity]) series.add(sample);
		expect(series.p95()).toBe(14);
	});
});
