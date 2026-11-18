import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { quantizeRgbaToIndexed4BppV1 } from './indexed-palette-texture-v1.js';

// Phase 15.A3 parity fixtures. The TypeScript owner writes the expected bytes; a C++ harness
// (simd-bridge/cpp/indexed_palette_4bpp.h) must reproduce them exactly. When
// ATLAS_INDEXED_PARITY_DIR is set, fixtures and expected bytes are written there.

const CASES = [
	{ name: 'odd-7x5-threshold0', width: 7, height: 5, threshold: 0, seed: 1 },
	{ name: 'even-16x16-threshold128', width: 16, height: 16, threshold: 128, seed: 2 },
	{ name: 'single-1x1-opaque', width: 1, height: 1, threshold: 0, seed: 3 },
	{ name: 'all-transparent-3x3', width: 3, height: 3, threshold: 255, seed: 4 },
] as const;

function lcgBytes(length: number, seed: number): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed >>> 0;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

describe('indexed palette 4bpp parity fixtures (15.A3)', () => {
	for (const c of CASES) {
		it(`${c.name}: owner output has ceil(n/2) bytes and low-nibble-first packing`, () => {
			const rgba = lcgBytes(c.width * c.height * 4, c.seed);
			const tex = quantizeRgbaToIndexed4BppV1(c.width, c.height, rgba, c.threshold);
			expect(tex.packedIndices.length).toBe(Math.ceil((c.width * c.height) / 2));
			for (let p = 0; p < c.width * c.height; p++) {
				const nibble = (tex.packedIndices[p >> 1] >> ((p & 1) ? 4 : 0)) & 0x0f;
				const alpha = rgba[p * 4 + 3];
				if (alpha <= c.threshold) expect(nibble).toBe(0);
				else expect(nibble).toBeGreaterThanOrEqual(1);
			}
		});
	}

	it('writes fixtures and expected bytes for the C++ harness when a directory is provided', () => {
		const dir = process.env.ATLAS_INDEXED_PARITY_DIR;
		if (!dir) return;
		mkdirSync(dir, { recursive: true });
		const manifest = CASES.map((c) => {
			const rgba = lcgBytes(c.width * c.height * 4, c.seed);
			const tex = quantizeRgbaToIndexed4BppV1(c.width, c.height, rgba, c.threshold);
			writeFileSync(join(dir, `${c.name}.rgba`), rgba);
			writeFileSync(join(dir, `${c.name}.expected.bin`), tex.packedIndices);
			return { name: c.name, width: c.width, height: c.height, threshold: c.threshold, bytes: tex.packedIndices.length };
		});
		writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
		expect(manifest.length).toBe(CASES.length);
	});
});
