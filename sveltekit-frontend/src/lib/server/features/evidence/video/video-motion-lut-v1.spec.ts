import { describe, expect, it } from 'vitest';
import {
	buildPackedMotionLodsV1,
	decodeVideoMotionLutIndicesV1,
	encodeVideoMotionLutV1,
	VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1,
	VIDEO_MOTION_GRAYSCALE_LUT_V1,
	VIDEO_MOTION_LUT_HEADER_BYTES_V1,
	VIDEO_MOTION_LUT_HEIGHT_V1,
	VIDEO_MOTION_LUT_PIXEL_BYTES_V1,
	VIDEO_MOTION_LUT_WIDTH_V1,
} from '$lib/shared/video-motion-lut-v1.js';

const PIXELS = VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1;

describe('video motion LUT v1', () => {
	it('uses a 16-byte header and exactly 4096 packed payload bytes', () => {
		expect(VIDEO_MOTION_LUT_PIXEL_BYTES_V1).toBe(4096);
		expect(VIDEO_MOTION_LUT_HEADER_BYTES_V1).toBe(16);
		expect(VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1).toBe(4112);
		expect(VIDEO_MOTION_GRAYSCALE_LUT_V1).toEqual(Array.from({ length: 16 }, (_, index) => index * 17));
	});

	it('quantizes deltas deterministically and packs even pixels low-nibble first', () => {
		const previous = new Uint8Array(PIXELS);
		const current = new Uint8Array(PIXELS);
		current[0] = 16;
		current[1] = 255;
		current[2] = 31;
		const encoded = encodeVideoMotionLutV1(previous, current);
		expect(encoded.changedPixels).toBe(3);
		expect(encoded.bytes[VIDEO_MOTION_LUT_HEADER_BYTES_V1]).toBe(0xf1);
		expect(encoded.bytes[VIDEO_MOTION_LUT_HEADER_BYTES_V1 + 1]).toBe(0x01);
		expect(decodeVideoMotionLutIndicesV1(encoded.bytes).slice(0, 4)).toEqual(new Uint8Array([1, 15, 1, 0]));
	});

	it('emits a zero first-frame tile and rejects malformed inputs/artifacts', () => {
		const encoded = encodeVideoMotionLutV1(null, new Uint8Array(PIXELS).fill(180));
		expect(encoded.motionScore).toBe(0);
		expect(encoded.changedPixels).toBe(0);
		expect(decodeVideoMotionLutIndicesV1(encoded.bytes).every((index) => index === 0)).toBe(true);
		expect(() => encodeVideoMotionLutV1(null, new Uint8Array(2))).toThrow(/exactly/);
		const corrupt = encoded.bytes.slice();
		corrupt[0] = 0;
		expect(() => decodeVideoMotionLutIndicesV1(corrupt)).toThrow(/magic/);
	});

	it('builds max-pooled packed LODs from 4x8 through 64x128', () => {
		const indices = new Uint8Array(PIXELS);
		indices[20 * VIDEO_MOTION_LUT_WIDTH_V1 + 10] = 15;
		const lods = buildPackedMotionLodsV1(indices);
		expect(lods.map(({ width, height, data }) => [width, height, data.byteLength])).toEqual([
			[4, 8, 16], [8, 16, 64], [16, 32, 256], [32, 64, 1024], [64, 128, 4096],
		]);
		const displayed = lods[3]!;
		const pooledIndex = 10 * displayed.width + 5;
		expect((displayed.data[pooledIndex >>> 1]! >>> ((pooledIndex & 1) * 4)) & 0x0f).toBe(15);
		expect(lods[4]?.data[0]).toBe(0);
		expect(() => buildPackedMotionLodsV1(new Uint8Array(3))).toThrow(/64x128/);
	});
});
