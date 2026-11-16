/**
 * Small deterministic 4-bit indexed-color codec for retro texture derivatives.
 * It does not mutate evidence bytes or replace the source image texture.
 */

export const INDEXED_PALETTE_TEXTURE_REVISION_V1 = 'atlas-indexed-palette16-v1' as const;
export const INDEXED_PALETTE_PIXEL_LIMIT_V1 = 4_194_304;

export interface IndexedPaletteEntryV1 {
	readonly index: number;
	readonly name: string;
	readonly hex: string;
	readonly rgba: readonly [number, number, number, number];
}

/** Index zero is transparent; color indices 1-15 are a separate render palette. */
export const INDEXED_PALETTE16_V1: readonly IndexedPaletteEntryV1[] = Object.freeze([
	{ index: 0, name: 'Transparent', hex: '#00000000', rgba: [0, 0, 0, 0] as const },
	{ index: 1, name: 'Obsidian', hex: '#121316', rgba: [18, 19, 22, 255] as const },
	{ index: 2, name: 'Deep Oxblood', hex: '#421719', rgba: [66, 23, 25, 255] as const },
	{ index: 3, name: 'Oxblood', hex: '#8B1E22', rgba: [139, 30, 34, 255] as const },
	{ index: 4, name: 'Dark Leather', hex: '#352820', rgba: [53, 40, 32, 255] as const },
	{ index: 5, name: 'Umber', hex: '#68452F', rgba: [104, 69, 47, 255] as const },
	{ index: 6, name: 'Taupe', hex: '#888277', rgba: [136, 130, 119, 255] as const },
	{ index: 7, name: 'Blush', hex: '#D4A59A', rgba: [212, 165, 154, 255] as const },
	{ index: 8, name: 'Parchment', hex: '#F7F5EE', rgba: [247, 245, 238, 255] as const },
	{ index: 9, name: 'Brass', hex: '#B88A35', rgba: [184, 138, 53, 255] as const },
	{ index: 10, name: 'Evidence Gold', hex: '#E5A93C', rgba: [229, 169, 60, 255] as const },
	{ index: 11, name: 'Amber', hex: '#F28B38', rgba: [242, 139, 56, 255] as const },
	{ index: 12, name: 'Rust', hex: '#B85A37', rgba: [184, 90, 55, 255] as const },
	{ index: 13, name: 'Steel Blue', hex: '#5B7B93', rgba: [91, 123, 147, 255] as const },
	{ index: 14, name: 'Cyan', hex: '#38BDF8', rgba: [56, 189, 248, 255] as const },
	{ index: 15, name: 'Soft Mint', hex: '#97CFAC', rgba: [151, 207, 172, 255] as const }
]);

export interface IndexedTexture4BppV1 {
	readonly format: typeof INDEXED_PALETTE_TEXTURE_REVISION_V1;
	readonly width: number;
	readonly height: number;
	readonly paletteRevision: typeof INDEXED_PALETTE_TEXTURE_REVISION_V1;
	/** Row-major; even pixels occupy the low nibble, odd pixels the high nibble. */
	readonly packedIndices: Uint8Array;
	readonly pixelCount: number;
}

function validateDimensions(width: number, height: number): number {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
		throw new RangeError('Indexed texture dimensions must be positive safe integers.');
	}
	const pixelCount = width * height;
	if (!Number.isSafeInteger(pixelCount) || pixelCount > INDEXED_PALETTE_PIXEL_LIMIT_V1) {
		throw new RangeError(`Indexed texture exceeds the ${INDEXED_PALETTE_PIXEL_LIMIT_V1.toLocaleString()}-pixel limit; resize before quantizing.`);
	}
	return pixelCount;
}

function nearestOpaquePaletteIndex(red: number, green: number, blue: number): number {
	let bestIndex = 1;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let index = 1; index < INDEXED_PALETTE16_V1.length; index++) {
		const entry = INDEXED_PALETTE16_V1[index];
		if (!entry) continue;
		const [paletteRed, paletteGreen, paletteBlue] = entry.rgba;
		const dr = red - paletteRed;
		const dg = green - paletteGreen;
		const db = blue - paletteBlue;
		// Integer-weighted RGB distance approximates luma sensitivity and keeps
		// output deterministic without floating point color-space conversions.
		const distance = 30 * dr * dr + 59 * dg * dg + 11 * db * db;
		if (distance < bestDistance) {
			bestDistance = distance;
			bestIndex = index;
		}
	}
	return bestIndex;
}

/** Convert RGBA pixels to row-major 4bpp palette indices. */
export function quantizeRgbaToIndexed4BppV1(
	width: number,
	height: number,
	rgba: Uint8Array | Uint8ClampedArray,
	alphaThreshold = 0
): IndexedTexture4BppV1 {
	const pixelCount = validateDimensions(width, height);
	if (rgba.length !== pixelCount * 4) throw new RangeError('RGBA byte length must equal width × height × 4.');
	if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
		throw new RangeError('Alpha threshold must be an integer from 0 to 255.');
	}
	const packedIndices = new Uint8Array(Math.ceil(pixelCount / 2));
	for (let pixel = 0; pixel < pixelCount; pixel++) {
		const offset = pixel * 4;
		const alpha = rgba[offset + 3];
		const paletteIndex = alpha <= alphaThreshold
			? 0
			: nearestOpaquePaletteIndex(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
		const byteIndex = pixel >>> 1;
		packedIndices[byteIndex] |= pixel & 1 ? paletteIndex << 4 : paletteIndex;
	}
	return Object.freeze({
		format: INDEXED_PALETTE_TEXTURE_REVISION_V1,
		width,
		height,
		paletteRevision: INDEXED_PALETTE_TEXTURE_REVISION_V1,
		packedIndices,
		pixelCount
	});
}

/** Expand packed palette indices into a fresh RGBA buffer for a GPU texture. */
export function decodeIndexed4BppToRgbaV1(texture: IndexedTexture4BppV1): Uint8ClampedArray {
	const pixelCount = validateDimensions(texture.width, texture.height);
	if (texture.format !== INDEXED_PALETTE_TEXTURE_REVISION_V1 || texture.paletteRevision !== INDEXED_PALETTE_TEXTURE_REVISION_V1) {
		throw new RangeError('Unsupported indexed texture or palette revision.');
	}
	if (texture.pixelCount !== pixelCount || texture.packedIndices.length !== Math.ceil(pixelCount / 2)) {
		throw new RangeError('Indexed texture packed byte count does not match its dimensions.');
	}
	const rgba = new Uint8ClampedArray(pixelCount * 4);
	for (let pixel = 0; pixel < pixelCount; pixel++) {
		const packed = texture.packedIndices[pixel >>> 1];
		const paletteIndex = pixel & 1 ? packed >>> 4 : packed & 0x0f;
		const entry = INDEXED_PALETTE16_V1[paletteIndex];
		if (!entry) throw new RangeError(`Indexed palette entry ${paletteIndex} is not available.`);
		const offset = pixel * 4;
		rgba[offset] = entry.rgba[0];
		rgba[offset + 1] = entry.rgba[1];
		rgba[offset + 2] = entry.rgba[2];
		rgba[offset + 3] = entry.rgba[3];
	}
	return rgba;
}
