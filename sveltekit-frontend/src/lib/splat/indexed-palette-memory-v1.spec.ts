import { describe, expect, it } from 'vitest';
import { quantizeRgbaToIndexed4BppV1 } from './indexed-palette-texture-v1.js';
import { createIndexedPaletteShaderTexturesV1 } from './indexed-palette-shader-v1.js';

// Phase 15 item 9: packed asset size and decoded CPU/GPU memory are reported separately.
// Packed = bytes that travel as the asset (CPU). Decoded CPU = expanded RGBA on the host.
// GPU = the R8 index texture plus the palette texture as allocated by the shader factory.
// These are byte counts from the actual allocations, not device memory telemetry.

const three = {
	DataTexture: class {
		name = ''; colorSpace: unknown = null; magFilter = 0; minFilter = 0; wrapS = 0; wrapT = 0;
		generateMipmaps = true; needsUpdate = false; flipY = true; unpackAlignment = 4;
		constructor(readonly data: Uint8Array, readonly width: number, readonly height: number, readonly format: string) {}
		dispose() {}
	},
	RedFormat: 'RED', RGBAFormat: 'RGBA', UnsignedByteType: 1, NearestFilter: 1, LinearFilter: 2,
	ClampToEdgeWrapping: 3, SRGBColorSpace: 'srgb', NoColorSpace: 'none',
};

function texture128(): { rgba: Uint8Array; width: number; height: number } {
	const width = 128;
	const height = 128;
	const rgba = new Uint8Array(width * height * 4);
	for (let p = 0; p < width * height; p++) {
		const i = (p % 15) + 1; // 15 opaque entries, each a fixed palette colour
		rgba.set([18, 19, 22, 255], p * 4);
		rgba[p * 4 + 1] = (i * 16) & 0xff; // vary green so pixels are not all one colour
	}
	return { rgba, width, height };
}

describe('indexed palette memory accounting (item 9)', () => {
	it('128x128 RGBA: 65,536 decoded CPU bytes vs 8,192 packed index bytes', () => {
		const { rgba, width, height } = texture128();
		const packed = quantizeRgbaToIndexed4BppV1(width, height, rgba, 0);
		expect(rgba.byteLength).toBe(65_536);
		expect(packed.packedIndices.byteLength).toBe(8_192);
		expect(packed.packedIndices.byteLength * 8).toBe(width * height * 4);
	});

	it('GPU allocation for 128x128 is the R8 index texture plus a 16x1 RGBA palette', () => {
		const { rgba, width, height } = texture128();
		const packed = quantizeRgbaToIndexed4BppV1(width, height, rgba, 0);
		const gpu = createIndexedPaletteShaderTexturesV1(three, packed);
		// 8,192 bytes laid into a 91x91 R8 texture (ceil(sqrt)), plus 16 x 4 palette bytes.
		expect(gpu.packedTextureWidth * gpu.packedTextureHeight).toBe(8_281);
		expect(gpu.gpuTexelBytes).toBe(8_281 + 64);
		// The GPU index allocation is smaller than the decoded RGBA it replaces.
		expect(gpu.gpuTexelBytes).toBeLessThan(65_536);
		gpu.dispose();
	});
});
