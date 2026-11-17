// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { applyIndexedPaletteToObjectV1 } from './indexed-palette-object-v1.js';
import { quantizeRgbaToIndexed4BppV1 } from './indexed-palette-texture-v1.js';

function fixtureGroup(meshCount: number, withUv = true) {
	const group = new THREE.Group();
	for (let i = 0; i < meshCount; i += 1) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
		if (withUv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
		const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
		group.add(new THREE.Mesh(geometry, material));
	}
	// One mesh without UVs must be skipped, not coerced.
	const bare = new THREE.BufferGeometry();
	bare.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
	group.add(new THREE.Mesh(bare, new THREE.MeshStandardMaterial()));
	return group;
}

describe('applyIndexedPaletteToObjectV1', () => {
	const width = 8;
	const height = 8;
	const rgba = new Uint8Array(width * height * 4).fill(200);
	const indexed = quantizeRgbaToIndexed4BppV1(width, height, rgba);
	const rgbaTexture = new THREE.DataTexture(new Uint8Array(rgba), width, height, THREE.RGBAFormat);

	it('applies the TSL path to every UV mesh, shares one texture set, and skips the bare mesh', () => {
		const group = fixtureGroup(3);
		const application = applyIndexedPaletteToObjectV1(THREE, group, indexed, rgbaTexture, 'webgpu');
		expect(application.path).toBe('webgpu-tsl-packed');
		expect(application.meshCount).toBe(3);
		expect(application.skippedMeshCount).toBe(1);
		expect(application.textures).not.toBeNull();

		const materials: any[] = [];
		group.traverse((o: any) => { if (o.isMesh && o.geometry.attributes.uv) materials.push(o.material); });
		for (const material of materials) {
			expect(material.isMeshStandardNodeMaterial).toBe(true);
			expect(material.userData.atlasIndexedPaletteRendererPath).toBe('webgpu-tsl-packed');
		}
		application.dispose();
	});

	it('restores original materials and disposes only what it created', () => {
		const group = fixtureGroup(2);
		const originals: any[] = [];
		group.traverse((o: any) => { if (o.isMesh) originals.push(o.material); });
		const application = applyIndexedPaletteToObjectV1(THREE, group, indexed, rgbaTexture, 'webgpu');
		application.restore();
		const restored: any[] = [];
		group.traverse((o: any) => { if (o.isMesh) restored.push(o.material); });
		expect(restored).toEqual(originals);
		application.dispose();
		application.dispose(); // idempotent
	});

	it('uses the RGBA compatibility path with no packed textures when the backend is unknown', () => {
		const group = fixtureGroup(2);
		const application = applyIndexedPaletteToObjectV1(THREE, group, indexed, rgbaTexture, 'unknown');
		expect(application.path).toBe('rgba-compat');
		expect(application.textures).toBeNull();
		group.traverse((o: any) => { if (o.isMesh && o.geometry.attributes.uv) expect(o.material.map).toBe(rgbaTexture); });
		application.dispose();
	});

	it('rejects an invalid root and a missing RGBA texture', () => {
		expect(() => applyIndexedPaletteToObjectV1(THREE, null, indexed, rgbaTexture, 'webgpu')).toThrow(/ROOT_INVALID/);
		expect(() => applyIndexedPaletteToObjectV1(THREE, new THREE.Group(), indexed, null, 'webgpu')).toThrow(/RGBA_TEXTURE_REQUIRED/);
	});

	it('gives Phong sources (the OBJ loader default) finite PBR values so the TSL output is not black', () => {
		const group = new THREE.Group();
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
		group.add(new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: 0xc8a060 })));
		const application = applyIndexedPaletteToObjectV1(THREE, group, indexed, rgbaTexture, 'webgpu');
		let material: any = null;
		group.traverse((o: any) => { if (o.isMesh) material = o.material; });
		expect(Number.isFinite(material.roughness)).toBe(true);
		expect(Number.isFinite(material.metalness)).toBe(true);
		expect(Number.isFinite(material.opacity)).toBe(true);
		application.dispose();
	});
});
