import { describe, expect, it } from 'vitest';
import { createIndexedPaletteShaderTexturesV1 } from './indexed-palette-shader-v1.js';
import { INDEXED_PALETTE16_V1, quantizeRgbaToIndexed4BppV1 } from './indexed-palette-texture-v1.js';

// Minimal stand-in for the three.js surface the factory uses. No WebGL is needed.
class FakeDataTexture {
	name = '';
	colorSpace: unknown = null;
	magFilter = 0;
	minFilter = 0;
	wrapS = 0;
	wrapT = 0;
	generateMipmaps = true;
	needsUpdate = false;
	disposed = false;
	constructor(readonly data: Uint8Array, readonly width: number, readonly height: number, readonly format: string) {}
	dispose() { this.disposed = true; }
}
const three = {
	DataTexture: FakeDataTexture,
	RedFormat: 'RED', RGBAFormat: 'RGBA', NearestFilter: 1, LinearFilter: 2,
	ClampToEdgeWrapping: 3, SRGBColorSpace: 'srgb',
};

// Fixture: brick-like stripes, a floor colour, a door colour and transparent pixels.
function fixture(width: number, height: number) {
	const rgba = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const p = (y * width + x) * 4;
		let entry = INDEXED_PALETTE16_V1[1]!; // brick
		if (y > height * 0.7) entry = INDEXED_PALETTE16_V1[2]!; // floor
		if (x > width * 0.6 && y > height * 0.4) entry = INDEXED_PALETTE16_V1[3]!; // door
		if ((x + y) % 7 === 0) rgba.set([0, 0, 0, 0], p); // transparent pixels
		else rgba.set(entry.rgba, p);
	}
	return quantizeRgbaToIndexed4BppV1(width, height, rgba);
}

describe('indexed palette shader textures (existing owner)', () => {
	it('uses nearest filtering on the index texture and the palette texture', () => {
		const tex = createIndexedPaletteShaderTexturesV1(three, fixture(16, 16));
		for (const t of [tex.packedIndexTexture, tex.paletteTexture] as unknown as FakeDataTexture[]) {
			expect(t.magFilter).toBe(three.NearestFilter);
			expect(t.minFilter).toBe(three.NearestFilter);
			expect(t.generateMipmaps).toBe(false);
		}
		expect((tex.paletteTexture as unknown as FakeDataTexture).colorSpace).toBe('srgb');
	});

	it('keeps the index texture separate from the 16-entry palette texture', () => {
		const tex = createIndexedPaletteShaderTexturesV1(three, fixture(16, 16)) as unknown as {
			packedIndexTexture: FakeDataTexture; paletteTexture: FakeDataTexture;
		};
		expect(tex.packedIndexTexture).not.toBe(tex.paletteTexture);
		expect(tex.paletteTexture.width).toBe(16);
		expect(tex.paletteTexture.height).toBe(1);
		expect(tex.paletteTexture.format).toBe('RGBA');
	});

	it('uploads the packed indices and the exact owner palette bytes', () => {
		const indexed = fixture(16, 16);
		const tex = createIndexedPaletteShaderTexturesV1(three, indexed) as unknown as {
			packedIndexTexture: FakeDataTexture; paletteTexture: FakeDataTexture;
		};
		expect(Array.from(tex.packedIndexTexture.data.subarray(0, indexed.packedIndices.length))).toEqual(Array.from(indexed.packedIndices));
		const palette = new Uint8Array(64);
		INDEXED_PALETTE16_V1.forEach((entry, i) => palette.set(entry.rgba, i * 4));
		expect(Array.from(tex.paletteTexture.data.subarray(0, 64))).toEqual(Array.from(palette));
	});

	it('changing a palette entry touches only the palette data, not the index texture', () => {
		const tex = createIndexedPaletteShaderTexturesV1(three, fixture(16, 16)) as unknown as {
			packedIndexTexture: FakeDataTexture; paletteTexture: FakeDataTexture;
		};
		const indexBefore = Array.from(tex.packedIndexTexture.data);
		tex.paletteTexture.data.set([255, 0, 255, 255], 3 * 4); // recolour index 3
		expect(Array.from(tex.paletteTexture.data.subarray(12, 16))).toEqual([255, 0, 255, 255]);
		expect(Array.from(tex.packedIndexTexture.data)).toEqual(indexBefore);
	});

	it('rejects inconsistent input and a missing DataTexture implementation', () => {
		const good = fixture(16, 16);
		expect(() => createIndexedPaletteShaderTexturesV1(three, { ...good, pixelCount: 999 })).toThrow('INDEXED_PALETTE_SHADER_INPUT_INVALID');
		expect(() => createIndexedPaletteShaderTexturesV1({}, good)).toThrow('INDEXED_PALETTE_SHADER_THREE_DATA_TEXTURE_UNAVAILABLE');
	});
});
