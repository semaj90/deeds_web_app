import { describe, expect, it } from 'vitest';
import {
	buildPackedMotionLodsV1,
	compactPackedMotionLodV1,
	decodeVideoMotionLutIndicesV1,
	encodeVideoMotionLutV1,
	hasValidMotionComparisonV1,
	readPackedVideoMotionLutV1,
	selectPackedMotionLodV1,
	type VideoMotionLutManifestV1,
	VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1,
	VIDEO_MOTION_GRAYSCALE_LUT_V1,
	VIDEO_MOTION_LUT_HEADER_BYTES_V1,
	VIDEO_MOTION_LUT_HEIGHT_V1,
	VIDEO_MOTION_LUT_PIXEL_BYTES_V1,
	VIDEO_MOTION_LUT_WIDTH_V1,
} from '$lib/shared/video-motion-lut-v1.js';

const PIXELS = VIDEO_MOTION_LUT_WIDTH_V1 * VIDEO_MOTION_LUT_HEIGHT_V1;

describe('video motion LUT v1', () => {
	it('binds a comparison timestamp to the immediately preceding frame of the same run', () => {
		const tile = { frameIndex: 1, timestampMs: 1000, previousTimestampMs: 0, sourceRevision: 'source', analysisRevision: 'run', motionScore: 0.3 } as VideoMotionLutManifestV1;
		const previous = { frameIndex: 0, timestampMs: 0, sourceRevision: 'source', analysisRevision: 'run' };
		expect(hasValidMotionComparisonV1(tile, [previous])).toBe(true);
		expect(hasValidMotionComparisonV1({ ...tile, previousTimestampMs: 500 }, [previous])).toBe(false);
		expect(hasValidMotionComparisonV1(tile, [{ ...previous, analysisRevision: 'stale' }])).toBe(false);
		expect(hasValidMotionComparisonV1({ ...tile, frameIndex: 0 }, [previous])).toBe(false);
		expect(hasValidMotionComparisonV1({ ...tile, previousTimestampMs: null, motionScore: 0 }, [])).toBe(true);
		expect(hasValidMotionComparisonV1({ ...tile, previousTimestampMs: null }, [])).toBe(false);
	});
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

	it('matches the existing unpacked max-pool at every compact pixel', () => {
		const indices = Uint8Array.from({ length: PIXELS }, (_, pixel) =>
			(pixel * 5 + Math.floor(pixel / 64) * 7 + Math.floor(pixel / 9)) % 16);
		const luma = Uint8Array.from(indices, (index) => index * 16);
		const { bytes } = encodeVideoMotionLutV1(new Uint8Array(PIXELS), luma);
		const source = readPackedVideoMotionLutV1(bytes);
		expect(source.data.buffer).toBe(bytes.buffer);
		expect(compactPackedMotionLodV1(source)).toEqual(buildPackedMotionLodsV1(indices)[3]);
	});

	it('selects the largest packed LOD that fits the physical preview and caps at the 4 KiB source', () => {
		const lods = buildPackedMotionLodsV1(new Uint8Array(PIXELS));
		expect(selectPackedMotionLodV1(lods, 24, 48)).toMatchObject({ width: 16, height: 32, data: { byteLength: 256 } });
		expect(selectPackedMotionLodV1(lods, 48, 80)).toMatchObject({ width: 32, height: 64, data: { byteLength: 1024 } });
		expect(selectPackedMotionLodV1(lods, 3, 5)).toMatchObject({ width: 4, height: 8, data: { byteLength: 16 } });
		expect(selectPackedMotionLodV1(lods, 640, 1280)).toMatchObject({ width: 64, height: 128, data: { byteLength: 4096 } });
		expect(() => selectPackedMotionLodV1([], 1, 1)).toThrow(/at least one/i);
		expect(() => selectPackedMotionLodV1(lods, 0, 1)).toThrow(/positive finite/i);
	});
});
