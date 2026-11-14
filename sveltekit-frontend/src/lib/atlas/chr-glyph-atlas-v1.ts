/**
 * Parent Atlas — 16-Byte 2bpp 8x8 NES CHR Glyph Atlas (v1)
 *
 * Strictly separates two distinct binary formats:
 *   1. `CHR_TILE_16B`: 16-byte 2bpp 8x8 pixel tiles (8 low-bitplane bytes + 8 high-bitplane bytes)
 *      packaged up to 512 tiles in an 8 KiB NROM CHR-ROM bank (`8192` bytes).
 *   2. `NESCHROM97_META_8B`: 8-byte (64-bit) derived metadata descriptors (`isExported`, `isAsync`,
 *      `complexity`, `domainClass`, `latentCluster`, `authority`, `confidence`, `freshnessDays`) per
 *      `docs/architecture/NES-CHROM97-GLYPH-BITENCODING-ALIGNED.md`. Never pixel data and never
 *      canonical packet identity.
 *
 * Browser-safe and server-safe: uses only `Uint8Array`, `Uint16Array`, `Uint8ClampedArray`, and `DataView`.
 */

export const CHR_TILE_BYTES = 16;
export const CHR_BANK_TILES = 512;
export const CHR_BANK_BYTES = CHR_TILE_BYTES * CHR_BANK_TILES; // 8,192 bytes (8 KiB)
export const NESCHROM97_METADATA_BYTES = 8;

export type ChrBinaryKind = 'CHR_TILE_16B' | 'NESCHROM97_META_8B';

export interface NesChrom97MetadataFieldsV1 {
	isExported: boolean;
	isAsync: boolean;
	complexity: number; // 0..7 (3 bits)
	domainClass: number; // 0..15 (4 bits)
	latentCluster: number; // 0..255 (8 bits)
	authority: number; // 0..255 (8 bits)
	confidence: number; // 0..255 (8 bits)
	freshnessDays: number; // 0..255 (8 bits)
}

export interface UnpackedNesChrom97MetadataV1 extends NesChrom97MetadataFieldsV1 {
	kind: 'NESCHROM97_META_8B';
	byteLength: 8;
	isPixelTile: false;
	canonicalAuthority: false;
}

export type RgbaTuple = readonly [number, number, number, number];

const NES_HEX_COLOR_MAP: Readonly<Record<string, RgbaTuple>> = Object.freeze({
	'0x16': [212, 62, 52, 255],   // auth (crimson)
	'0x2a': [76, 208, 92, 255],   // ui (phosphor green)
	'0x21': [68, 168, 248, 255],  // retrieval (azure)
	'0x2c': [72, 220, 212, 255],  // network (cyan)
	'0x12': [78, 98, 232, 255],   // database (indigo)
	'0x27': [242, 168, 56, 255],  // cache (amber)
	'0x24': [214, 98, 224, 255],  // agent (magenta)
	'0x1a': [58, 184, 112, 255],  // graph (emerald)
	'0x14': [164, 92, 232, 255],  // ml (violet)
	'0x0f': [168, 178, 194, 255], // general / fallback (steel slate)
});

/**
 * Resolves a 4-color RGBA palette for a 2bpp CHR tile from a visual `nesHex` byte.
 * Visual color selection only; never confers authorization or canonical identity.
 */
export function resolveChrPaletteForNesHex(nesHex: string): readonly [RgbaTuple, RgbaTuple, RgbaTuple, RgbaTuple] {
	const key = nesHex.trim().toLowerCase();
	const primary = NES_HEX_COLOR_MAP[key] ?? NES_HEX_COLOR_MAP['0x0f'];
	const bg: RgbaTuple = [12, 14, 22, 255];
	const shadow: RgbaTuple = [
		Math.max(24, Math.floor(primary[0] * 0.35)),
		Math.max(28, Math.floor(primary[1] * 0.35)),
		Math.max(40, Math.floor(primary[2] * 0.35)),
		255,
	];
	const highlight: RgbaTuple = [
		Math.min(255, Math.floor(primary[0] * 0.45 + 140)),
		Math.min(255, Math.floor(primary[1] * 0.45 + 140)),
		Math.min(255, Math.floor(primary[2] * 0.45 + 140)),
		255,
	];
	return [bg, shadow, primary, highlight];
}

/**
 * Runtime guard enforcing strict separation between 16-byte 2bpp pixel CHR tiles
 * and 8-byte NESCHROM97 derived metadata descriptors.
 */
export function assertChrTileDistinctFromChrom97(
	buffer: Uint8Array,
	expectedKind: ChrBinaryKind
): void {
	if (expectedKind === 'CHR_TILE_16B') {
		if (buffer.byteLength === NESCHROM97_METADATA_BYTES) {
			throw new RangeError('CHR_FORMAT_VIOLATION: expected 16-byte 2bpp CHR pixel tile, got 8-byte NESCHROM97 metadata');
		}
		if (buffer.byteLength < CHR_TILE_BYTES || buffer.byteLength % CHR_TILE_BYTES !== 0) {
			throw new RangeError(`CHR_TILE_BUFFER_INVALID_LENGTH: expected positive multiple of 16, got ${buffer.byteLength}`);
		}
		return;
	}

	if (buffer.byteLength !== NESCHROM97_METADATA_BYTES) {
		throw new RangeError(`NESCHROM97_FORMAT_VIOLATION: expected exactly 8 bytes, got ${buffer.byteLength}`);
	}
}

/**
 * Decodes a single pixel (palette index 0..3) at (x, y) from a 16-byte 2bpp NES CHR tile.
 * Byte layout per tile: bytes 0..7 = low bitplane rows, bytes 8..15 = high bitplane rows.
 */
export function nesPixel(chr: Uint8Array, tile: number, x: number, y: number): number {
	assertChrTileDistinctFromChrom97(chr, 'CHR_TILE_16B');
	if (!Number.isInteger(x) || x < 0 || x >= 8 || !Number.isInteger(y) || y < 0 || y >= 8) {
		throw new RangeError(`CHR_PIXEL_COORD_OUT_OF_RANGE: (${x}, ${y})`);
	}
	if (!Number.isInteger(tile) || tile < 0) {
		throw new RangeError(`CHR_TILE_INDEX_OUT_OF_RANGE: ${tile}`);
	}
	const base = tile * CHR_TILE_BYTES;
	if (base + CHR_TILE_BYTES > chr.byteLength) {
		throw new RangeError(`CHR_TILE_INDEX_OUT_OF_RANGE: tile=${tile}, byteLength=${chr.byteLength}`);
	}
	const bit = 7 - x;
	const low = (chr[base + y]! >> bit) & 1;
	const high = (chr[base + 8 + y]! >> bit) & 1;
	return low | (high << 1); // 0..3
}

/**
 * Encodes 64 palette indices (0..3, row-major 8x8) into a single 16-byte 2bpp NES CHR tile.
 */
export function encodeChrTile8x8(pixels64: ArrayLike<number>): Uint8Array {
	if (pixels64.length !== 64) {
		throw new RangeError(`CHR_TILE_PIXEL_COUNT_INVALID: expected 64, got ${pixels64.length}`);
	}
	const tile = new Uint8Array(CHR_TILE_BYTES);
	for (let y = 0; y < 8; y += 1) {
		let lowByte = 0;
		let highByte = 0;
		for (let x = 0; x < 8; x += 1) {
			const px = pixels64[y * 8 + x]!;
			if (!Number.isInteger(px) || px < 0 || px > 3) {
				throw new RangeError(`CHR_PIXEL_PALETTE_OUT_OF_RANGE at (${x},${y}): ${px}`);
			}
			const bit = 7 - x;
			lowByte |= (px & 1) << bit;
			highByte |= ((px >> 1) & 1) << bit;
		}
		tile[y] = lowByte;
		tile[8 + y] = highByte;
	}
	return tile;
}

/**
 * Decodes a full 8x8 tile into 64 palette indices (0..3).
 */
export function decodeChrTile8x8(chr: Uint8Array, tile: number): Uint8Array {
	const out = new Uint8Array(64);
	for (let y = 0; y < 8; y += 1) {
		for (let x = 0; x < 8; x += 1) {
			out[y * 8 + x] = nesPixel(chr, tile, x, y);
		}
	}
	return out;
}

/**
 * 8x8 2bpp glyph templates:
 *   '.' = 0 (bg), '1' = 1 (shadow/trim), '2' = 2 (domain color), '3' = 3 (bright face)
 */
const FONT_BITMAPS_8X8: Readonly<Record<string, readonly string[]>> = Object.freeze({
	' ': [
		'........',
		'........',
		'........',
		'........',
		'........',
		'........',
		'........',
		'........',
	],
	'0': [
		'.23332..',
		'23...31.',
		'23..231.',
		'23.2.31.',
		'232..31.',
		'23...31.',
		'.23331..',
		'........',
	],
	'1': [
		'..232...',
		'.2332...',
		'...32...',
		'...32...',
		'...32...',
		'...32...',
		'.233331.',
		'........',
	],
	'2': [
		'.23332..',
		'23...31.',
		'.....31.',
		'..2332..',
		'.231....',
		'23......',
		'2333331.',
		'........',
	],
	'3': [
		'.23332..',
		'23...31.',
		'.....31.',
		'..2332..',
		'.....31.',
		'23...31.',
		'.23331..',
		'........',
	],
	'4': [
		'...232..',
		'..2332..',
		'.23.32..',
		'23..32..',
		'2333331.',
		'....32..',
		'....31..',
		'........',
	],
	'5': [
		'2333331.',
		'23......',
		'233332..',
		'.....31.',
		'.....31.',
		'23...31.',
		'.23331..',
		'........',
	],
	'6': [
		'..2332..',
		'.231....',
		'23......',
		'233332..',
		'23...31.',
		'23...31.',
		'.23331..',
		'........',
	],
	'7': [
		'2333331.',
		'.....31.',
		'....231.',
		'...232..',
		'..231...',
		'..231...',
		'..231...',
		'........',
	],
	'8': [
		'.23332..',
		'23...31.',
		'23...31.',
		'.23332..',
		'23...31.',
		'23...31.',
		'.23331..',
		'........',
	],
	'9': [
		'.23332..',
		'23...31.',
		'23...31.',
		'.233331.',
		'.....31.',
		'....231.',
		'.23321..',
		'........',
	],
	A: [
		'..232...',
		'.23.31..',
		'23...31.',
		'2333331.',
		'23...31.',
		'23...31.',
		'23...31.',
		'........',
	],
	B: [
		'233332..',
		'23...31.',
		'23...31.',
		'233332..',
		'23...31.',
		'23...31.',
		'233331..',
		'........',
	],
	C: [
		'.23332..',
		'23...31.',
		'23......',
		'23......',
		'23......',
		'23...31.',
		'.23331..',
		'........',
	],
	D: [
		'23332...',
		'23..31..',
		'23...31.',
		'23...31.',
		'23...31.',
		'23..31..',
		'23331...',
		'........',
	],
	E: [
		'2333331.',
		'23......',
		'23......',
		'233332..',
		'23......',
		'23......',
		'2333331.',
		'........',
	],
	F: [
		'2333331.',
		'23......',
		'23......',
		'233332..',
		'23......',
		'23......',
		'231.....',
		'........',
	],
	G: [
		'.23332..',
		'23...31.',
		'23......',
		'23..331.',
		'23...31.',
		'23...31.',
		'.23331..',
		'........',
	],
	H: [
		'23...31.',
		'23...31.',
		'23...31.',
		'2333331.',
		'23...31.',
		'23...31.',
		'23...31.',
		'........',
	],
	I: [
		'.23331..',
		'...32...',
		'...32...',
		'...32...',
		'...32...',
		'...32...',
		'.23331..',
		'........',
	],
	J: [
		'..23331.',
		'....32..',
		'....32..',
		'....32..',
		'23..32..',
		'23..32..',
		'.2331...',
		'........',
	],
	K: [
		'23...31.',
		'23..31..',
		'23.31...',
		'2332....',
		'23.31...',
		'23..31..',
		'23...31.',
		'........',
	],
	L: [
		'231.....',
		'231.....',
		'231.....',
		'231.....',
		'231.....',
		'231.....',
		'2333331.',
		'........',
	],
	M: [
		'23...31.',
		'233.331.',
		'23.3.31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'........',
	],
	N: [
		'23...31.',
		'233..31.',
		'23.3.31.',
		'23..331.',
		'23...31.',
		'23...31.',
		'23...31.',
		'........',
	],
	O: [
		'.23332..',
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'.23331..',
		'........',
	],
	P: [
		'233332..',
		'23...31.',
		'23...31.',
		'233331..',
		'231.....',
		'231.....',
		'231.....',
		'........',
	],
	Q: [
		'.23332..',
		'23...31.',
		'23...31.',
		'23...31.',
		'23.3.31.',
		'23..31..',
		'.233.31.',
		'........',
	],
	R: [
		'233332..',
		'23...31.',
		'23...31.',
		'233331..',
		'23.31...',
		'23..31..',
		'23...31.',
		'........',
	],
	S: [
		'.233331.',
		'231.....',
		'231.....',
		'.23332..',
		'.....31.',
		'.....31.',
		'233331..',
		'........',
	],
	T: [
		'2333331.',
		'...32...',
		'...32...',
		'...32...',
		'...32...',
		'...32...',
		'...31...',
		'........',
	],
	U: [
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'.23331..',
		'........',
	],
	V: [
		'23...31.',
		'23...31.',
		'23...31.',
		'23...31.',
		'.23.31..',
		'..231...',
		'...31...',
		'........',
	],
	W: [
		'23...31.',
		'23...31.',
		'23...31.',
		'23.3.31.',
		'23.3.31.',
		'233.331.',
		'23...31.',
		'........',
	],
	X: [
		'23...31.',
		'.23.31..',
		'..231...',
		'..231...',
		'.23.31..',
		'23...31.',
		'23...31.',
		'........',
	],
	Y: [
		'23...31.',
		'23...31.',
		'.23.31..',
		'..231...',
		'...32...',
		'...32...',
		'...31...',
		'........',
	],
	Z: [
		'2333331.',
		'....31..',
		'...31...',
		'..31....',
		'.31.....',
		'31......',
		'2333331.',
		'........',
	],
	':': [
		'........',
		'..231...',
		'..231...',
		'........',
		'..231...',
		'..231...',
		'........',
		'........',
	],
	'-': [
		'........',
		'........',
		'........',
		'.233331.',
		'........',
		'........',
		'........',
		'........',
	],
	'_': [
		'........',
		'........',
		'........',
		'........',
		'........',
		'........',
		'2333331.',
		'........',
	],
	'/': [
		'.....31.',
		'....23..',
		'...23...',
		'..23....',
		'.23.....',
		'23......',
		'1.......',
		'........',
	],
	'.': [
		'........',
		'........',
		'........',
		'........',
		'........',
		'..231...',
		'..231...',
		'........',
	],
	'#': [
		'.23.23..',
		'2333331.',
		'.23.23..',
		'.23.23..',
		'2333331.',
		'.23.23..',
		'........',
		'........',
	],
	'[': [
		'.2332...',
		'.231....',
		'.231....',
		'.231....',
		'.231....',
		'.231....',
		'.2332...',
		'........',
	],
	']': [
		'..2332..',
		'...231..',
		'...231..',
		'...231..',
		'...231..',
		'...231..',
		'..2332..',
		'........',
	],
	'!': [
		'..231...',
		'..231...',
		'..231...',
		'..231...',
		'..231...',
		'........',
		'..231...',
		'........',
	],
});

/**
 * Icon tiles placed at tile indices 256..266 inside the 8 KiB CHR-ROM bank.
 */
const DOMAIN_ICON_BITMAPS_8X8: Readonly<Record<number, readonly string[]>> = Object.freeze({
	// 256: Fallback / unclassified frame
	256: [
		'12222221',
		'2......2',
		'2..33..2',
		'2.3..3.2',
		'2..33..2',
		'2......2',
		'12222221',
		'........',
	],
	// 257: WHO_IDENTITY_AUTH (shield)
	257: [
		'.233332.',
		'23222231',
		'23233231',
		'23233231',
		'.232231.',
		'..2331..',
		'...21...',
		'........',
	],
	// 258: WHAT_STATUTE_CORPUS (statute tome)
	258: [
		'.233331.',
		'2322231.',
		'2333331.',
		'2322231.',
		'2333331.',
		'2322231.',
		'.233331.',
		'........',
	],
	// 259: WHY_LEDGER_MOTIVE (key/ledger)
	259: [
		'.2332...',
		'23..31..',
		'23..31..',
		'.2333331',
		'....2.31',
		'....2...',
		'........',
		'........',
	],
	// 260: HOW_SCENE_3D_GLB (cube wireframe)
	260: [
		'..23332.',
		'.23..231',
		'23332.31',
		'23.23.31',
		'23.2321.',
		'233321..',
		'.1111...',
		'........',
	],
	// 261: STORAGE_SEAWEED_S3 (packet block)
	261: [
		'12333321',
		'23222232',
		'22333322',
		'23222232',
		'22333322',
		'23222232',
		'12222221',
		'........',
	],
	// 262: DATA_PG18_DRIZZLE (cylinder stack)
	262: [
		'.233332.',
		'23222231',
		'.233331.',
		'23222231',
		'.233331.',
		'23222231',
		'.233331.',
		'........',
	],
	// 263: ENGINE_BVH_N64_ARENA (processor tile)
	263: [
		'.1.2.21.',
		'23333332',
		'.322223.',
		'23233232',
		'.322223.',
		'23333332',
		'.1.2.21.',
		'........',
	],
	// 264: SPLAT_SPZ_SOG_LOD (diamond LOD)
	264: [
		'...32...',
		'..2332..',
		'.232231.',
		'23233231',
		'.232231.',
		'..2331..',
		'...21...',
		'........',
	],
	// 265: AGENT_ORNITH_RAG_GPU (node link)
	265: [
		'.32..23.',
		'.32..23.',
		'..2332..',
		'.233332.',
		'..2332..',
		'.32..23.',
		'.32..23.',
		'........',
	],
	// 266: UI_SVELTE5_BOARD (8x8 window grid)
	266: [
		'23333331',
		'23333331',
		'2......1',
		'2.33.3.1',
		'2.33.3.1',
		'2......1',
		'12222221',
		'........',
	],
});

function bitmapLinesToPixels(lines: readonly string[]): Uint8Array {
	const pixels = new Uint8Array(64);
	for (let y = 0; y < 8; y += 1) {
		const row = lines[y] ?? '........';
		for (let x = 0; x < 8; x += 1) {
			const ch = row[x] ?? '.';
			pixels[y * 8 + x] = ch === '3' ? 3 : ch === '2' ? 2 : ch === '1' ? 1 : 0;
		}
	}
	return pixels;
}

/**
 * Builds the deterministic 8 KiB (512 tiles x 16 bytes) NROM CHR-ROM atlas.
 */
export function buildParentAtlasChrRom8KiB(): Uint8Array {
	const bank = new Uint8Array(CHR_BANK_BYTES);
	for (const [charKey, lines] of Object.entries(FONT_BITMAPS_8X8)) {
		const tileIndex = charKey.charCodeAt(0);
		if (tileIndex >= 0 && tileIndex < CHR_BANK_TILES) {
			const tileBytes = encodeChrTile8x8(bitmapLinesToPixels(lines));
			bank.set(tileBytes, tileIndex * CHR_TILE_BYTES);
		}
	}
	for (const [tileIdxStr, lines] of Object.entries(DOMAIN_ICON_BITMAPS_8X8)) {
		const tileIndex = Number(tileIdxStr);
		if (tileIndex >= 0 && tileIndex < CHR_BANK_TILES) {
			const tileBytes = encodeChrTile8x8(bitmapLinesToPixels(lines));
			bank.set(tileBytes, tileIndex * CHR_TILE_BYTES);
		}
	}
	return bank;
}

export function getDomainIconTileIndex(primaryLutByte: number): number {
	if (!Number.isInteger(primaryLutByte) || primaryLutByte < 1 || primaryLutByte > 10) {
		return 256;
	}
	return 256 + primaryLutByte;
}

/**
 * Encodes one or more text lines into a tile nametable referencing the 8 KiB CHR bank.
 */
export function encodeTextToNametable(
	text: string,
	columns?: number,
	leadingTileIndex?: number
): { columns: number; rows: number; tiles: Uint16Array } {
	const lines = text.toUpperCase().split(/\r?\n/);
	const maxLineLen = lines.reduce((m, line) => Math.max(m, line.length), 0) + (leadingTileIndex !== undefined ? 2 : 0);
	const resolvedColumns = Math.max(1, columns ?? Math.max(1, maxLineLen));
	const resolvedRows = Math.max(1, lines.length);
	const tiles = new Uint16Array(resolvedColumns * resolvedRows);
	tiles.fill(32); // space tile

	for (let r = 0; r < resolvedRows; r += 1) {
		const raw = lines[r] ?? '';
		let colOffset = 0;
		if (r === 0 && leadingTileIndex !== undefined) {
			tiles[r * resolvedColumns] = leadingTileIndex;
			colOffset = 2;
		}
		for (let c = 0; c < raw.length && c + colOffset < resolvedColumns; c += 1) {
			const ch = raw[c]!;
			const code = ch in FONT_BITMAPS_8X8 ? ch.charCodeAt(0) : 32;
			tiles[r * resolvedColumns + c + colOffset] = code;
		}
	}

	return {
		columns: resolvedColumns,
		rows: resolvedRows,
		tiles,
	};
}

/**
 * Renders a nametable using 16-byte 2bpp CHR tiles into an RGBA image buffer (`width = columns * 8`, `height = rows * 8`).
 */
export function renderNametableToRgba(
	chrRom: Uint8Array,
	nametable: Uint16Array,
	columns: number,
	rows: number,
	nesHexPaletteByte: string
): {
	width: number;
	height: number;
	rgba: Uint8ClampedArray;
	paletteRgba: readonly [RgbaTuple, RgbaTuple, RgbaTuple, RgbaTuple];
} {
	assertChrTileDistinctFromChrom97(chrRom, 'CHR_TILE_16B');
	if (nametable.length < columns * rows) {
		throw new RangeError('CHR_NAMETABLE_TOO_SMALL');
	}
	const paletteRgba = resolveChrPaletteForNesHex(nesHexPaletteByte);
	const width = columns * 8;
	const height = rows * 8;
	const rgba = new Uint8ClampedArray(width * height * 4);

	for (let tileRow = 0; tileRow < rows; tileRow += 1) {
		for (let tileCol = 0; tileCol < columns; tileCol += 1) {
			const tileId = nametable[tileRow * columns + tileCol] ?? 32;
			for (let py = 0; py < 8; py += 1) {
				for (let px = 0; px < 8; px += 1) {
					const colorIdx = nesPixel(chrRom, tileId, px, py);
					const [r, g, b, a] = paletteRgba[colorIdx]!;
					const outX = tileCol * 8 + px;
					const outY = tileRow * 8 + py;
					const outOffset = (outY * width + outX) * 4;
					rgba[outOffset] = r;
					rgba[outOffset + 1] = g;
					rgba[outOffset + 2] = b;
					rgba[outOffset + 3] = a;
				}
			}
		}
	}

	return { width, height, rgba, paletteRgba };
}

/**
 * Packs a derived 8-byte (64-bit) NESCHROM97 metadata glyph (little-endian uint64).
 * Explicitly NOT a 16-byte 2bpp pixel tile and NOT canonical identity.
 */
export function packNesChrom97MetadataGlyph8B(fields: NesChrom97MetadataFieldsV1): Uint8Array {
	const clampInt = (value: number, max: number, name: string): bigint => {
		if (!Number.isInteger(value) || value < 0 || value > max) {
			throw new RangeError(`NESCHROM97_FIELD_OUT_OF_RANGE: ${name}=${value} (0..${max})`);
		}
		return BigInt(value);
	};

	let bits = 0n;
	bits |= fields.isExported ? 1n : 0n;
	bits |= fields.isAsync ? 2n : 0n;
	bits |= clampInt(fields.complexity, 7, 'complexity') << 2n;
	bits |= clampInt(fields.domainClass, 15, 'domainClass') << 5n;
	bits |= clampInt(fields.latentCluster, 255, 'latentCluster') << 9n;
	bits |= clampInt(fields.authority, 255, 'authority') << 17n;
	bits |= clampInt(fields.confidence, 255, 'confidence') << 25n;
	bits |= clampInt(fields.freshnessDays, 255, 'freshnessDays') << 33n;

	const out = new Uint8Array(NESCHROM97_METADATA_BYTES);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	view.setBigUint64(0, bits, true);
	return out;
}

/**
 * Unpacks an 8-byte NESCHROM97 metadata glyph and rejects 16-byte CHR pixel tiles.
 */
export function unpackNesChrom97MetadataGlyph8B(bytes: Uint8Array): UnpackedNesChrom97MetadataV1 {
	assertChrTileDistinctFromChrom97(bytes, 'NESCHROM97_META_8B');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const bits = view.getBigUint64(0, true);
	return {
		kind: 'NESCHROM97_META_8B',
		byteLength: 8,
		isPixelTile: false,
		canonicalAuthority: false,
		isExported: (bits & 1n) === 1n,
		isAsync: ((bits >> 1n) & 1n) === 1n,
		complexity: Number((bits >> 2n) & 7n),
		domainClass: Number((bits >> 5n) & 15n),
		latentCluster: Number((bits >> 9n) & 255n),
		authority: Number((bits >> 17n) & 255n),
		confidence: Number((bits >> 25n) & 255n),
		freshnessDays: Number((bits >> 33n) & 255n),
	};
}
