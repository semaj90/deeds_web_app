import { describe, expect, it } from 'vitest';
import {
	FILMCRAFT_TICKS_PER_MILLISECOND_V1,
	packGrayPixelsLsb0V1
} from './atlas-video-wasm-v1.js';

describe('atlas-video-wasm-v1 contract', () => {
	it('uses exact integer FilmCraft ticks per millisecond', () => {
		expect(1n * FILMCRAFT_TICKS_PER_MILLISECOND_V1).toBe(254_016_000n);
		expect(1_000n * FILMCRAFT_TICKS_PER_MILLISECOND_V1).toBe(254_016_000_000n);
		expect(60_000n * FILMCRAFT_TICKS_PER_MILLISECOND_V1).toBe(15_240_960_000_000n);
	});

	it('packs exactly 72 grayscale pixels into low-byte-first words', () => {
		const rgba = new Uint8ClampedArray(72 * 4);
		rgba[0] = 255;
		rgba[1] = 255;
		rgba[2] = 255;
		rgba[3] = 255;
		rgba[4] = 128;
		rgba[5] = 128;
		rgba[6] = 128;
		rgba[7] = 255;
		const words = packGrayPixelsLsb0V1(rgba);
		expect(words).toHaveLength(9);
		expect(words[0] & 0xffn).toBe(255n);
		expect((words[0] >> 8n) & 0xffn).toBe(128n);
	});

	it('rejects pixel buffers that could shift the 9x8 source layout', () => {
		expect(() => packGrayPixelsLsb0V1(new Uint8ClampedArray(287))).toThrow(
			'VIDEO_SAMPLE_MUST_BE_9X8_RGBA'
		);
	});
});
