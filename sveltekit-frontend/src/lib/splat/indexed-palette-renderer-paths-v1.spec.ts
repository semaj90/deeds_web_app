// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import {
	selectIndexedPaletteRendererPathV1,
	describeIndexedPaletteRendererPathV1,
	paletteIndexForPixelV1
} from './indexed-palette-renderer-paths-v1.js';
import { INDEXED_PALETTE16_V1, decodeIndexed4BppToRgbaV1, quantizeRgbaToIndexed4BppV1 } from './indexed-palette-texture-v1.js';
import { createIndexedPaletteTslMaterialV1 } from './indexed-palette-shader-v1.js';

describe('renderer path selection', () => {
	it('uses GLSL on WebGL2 and TSL on WebGPU when TSL is available', () => {
		expect(selectIndexedPaletteRendererPathV1('webgl2', false)).toBe('webgl2-glsl-packed');
		expect(selectIndexedPaletteRendererPathV1('webgpu', true)).toBe('webgpu-tsl-packed');
	});

	it('falls back to RGBA when WebGPU lacks TSL or the backend is unknown', () => {
		expect(selectIndexedPaletteRendererPathV1('webgpu', false)).toBe('rgba-compat');
		expect(selectIndexedPaletteRendererPathV1('unknown', true)).toBe('rgba-compat');
		expect(selectIndexedPaletteRendererPathV1(null, true)).toBe('rgba-compat');
	});

	it('reports the same fields for both packed paths', () => {
		const gl = describeIndexedPaletteRendererPathV1('webgl2-glsl-packed', 8, 4, 40);
		const tsl = describeIndexedPaletteRendererPathV1('webgpu-tsl-packed', 8, 4, 40);
		expect(gl).toContain('packed 4bpp GLSL shader');
		expect(tsl).toContain('packed 4bpp TSL shader');
		expect(gl.replace('GLSL', 'X')).toBe(tsl.replace('TSL', 'X'));
	});
});

describe('CPU oracle for the shared index formula', () => {
	it('matches the codec on odd widths, where nibbles cross row boundaries', () => {
		const width = 5;
		const height = 3;
		const rgba = new Uint8Array(width * height * 4);
		for (let pixel = 0; pixel < width * height; pixel += 1) {
			const entry = INDEXED_PALETTE16_V1[(pixel * 7) % INDEXED_PALETTE16_V1.length];
			rgba.set(entry.rgba, pixel * 4);
		}
		const indexed = quantizeRgbaToIndexed4BppV1(width, height, rgba);
		const decoded = decodeIndexed4BppToRgbaV1(indexed);
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const index = paletteIndexForPixelV1(indexed, x, y);
				const pixel = (y * width + x) * 4;
				const paletteRgba = INDEXED_PALETTE16_V1[index].rgba;
				expect([decoded[pixel], decoded[pixel + 1], decoded[pixel + 2], decoded[pixel + 3]])
					.toEqual([paletteRgba[0], paletteRgba[1], paletteRgba[2], paletteRgba[3]]);
			}
		}
	});

	it('rejects out-of-range pixels', () => {
		const indexed = quantizeRgbaToIndexed4BppV1(2, 2, new Uint8Array(16));
		expect(() => paletteIndexForPixelV1(indexed, 2, 0)).toThrow(/OUT_OF_RANGE/);
		expect(() => paletteIndexForPixelV1(indexed, -1, 0)).toThrow(/OUT_OF_RANGE/);
	});
});

describe('TSL material construction (no GPU required)', () => {
	it('builds a node material with a colour node and the packed texture uniforms', () => {
		const width = 4;
		const height = 4;
		const rgba = new Uint8Array(width * height * 4).fill(128);
		const indexed = quantizeRgbaToIndexed4BppV1(width, height, rgba);
		const source = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
		const { material, textures } = createIndexedPaletteTslMaterialV1(THREE, source, indexed);
		expect(material.isMeshStandardNodeMaterial).toBe(true);
		expect(material.colorNode).toBeTruthy();
		expect(material.userData.atlasIndexedPaletteRendererPath).toBe('webgpu-tsl-packed');
		expect(textures.packedIndexTexture.format).toBe(THREE.RedFormat);
		expect(textures.gpuTexelBytes).toBeGreaterThan(0);
		textures.dispose();
	});
});
