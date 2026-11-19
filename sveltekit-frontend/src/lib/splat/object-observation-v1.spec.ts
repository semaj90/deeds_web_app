import { describe, expect, it } from 'vitest';
import {
	bboxCentrePx,
	bboxSizePx,
	illustrativeSizeMetres,
	medianRelativeDepthInBox,
	objectObservationSchemaV1
} from './object-observation-v1';

const SHA = 'sha256:' + 'a'.repeat(64);
const OBS = '33333333-3333-4333-8333-333333333333';
const EVID = '11111111-1111-4111-8111-111111111111';

function base(overrides: Record<string, unknown> = {}) {
	return {
		observationId: OBS,
		evidenceId: EVID,
		sourceSha256: SHA,
		framePtsMs: 1200,
		imageWidth: 1920,
		imageHeight: 1080,
		classLabel: 'person',
		detectionConfidence: 0.535,
		bboxXYXY: [310.2, 369.4, 400.4, 644.0],
		depthType: null,
		coordinateFrame: 'image',
		status: 'observed',
		...overrides
	};
}

describe('objectObservationSchemaV1', () => {
	it('accepts an image-frame observation with no world position', () => {
		expect(objectObservationSchemaV1.safeParse(base()).success).toBe(true);
	});

	it('rejects a box outside the image or degenerate', () => {
		expect(objectObservationSchemaV1.safeParse(base({ bboxXYXY: [-1, 0, 10, 10] })).success).toBe(false);
		expect(objectObservationSchemaV1.safeParse(base({ bboxXYXY: [10, 10, 10, 20] })).success).toBe(false);
		expect(objectObservationSchemaV1.safeParse(base({ bboxXYXY: [0, 0, 2000, 10] })).success).toBe(false);
	});

	it('rejects a world position without calibration', () => {
		const r = objectObservationSchemaV1.safeParse(
			base({ worldPosition: [1, 0, 2], coordinateFrame: 'world', status: 'estimated' })
		);
		expect(r.success).toBe(false);
	});

	it('rejects the world frame without a world position', () => {
		const r = objectObservationSchemaV1.safeParse(
			base({ coordinateFrame: 'world', cameraCalibrationId: 'cal-1', status: 'estimated' })
		);
		expect(r.success).toBe(false);
	});

	it('rejects a relative-depth world position marked as observed', () => {
		const r = objectObservationSchemaV1.safeParse(
			base({
				depthType: 'relative_monocular',
				cameraCalibrationId: 'cal-1',
				worldPosition: [1, 0, 2],
				coordinateFrame: 'world',
				status: 'observed'
			})
		);
		expect(r.success).toBe(false);
	});

	it('rejects a non-sha256 source id and unknown keys', () => {
		expect(objectObservationSchemaV1.safeParse(base({ sourceSha256: 'abc' })).success).toBe(false);
		expect(objectObservationSchemaV1.safeParse(base({ hiddenThoughts: 'x' })).success).toBe(false);
	});
});

describe('box geometry helpers', () => {
	it('computes centre and size in pixels only', () => {
		const o = { bboxXYXY: [10, 20, 30, 60] as [number, number, number, number] };
		expect(bboxCentrePx(o)).toEqual([20, 40]);
		expect(bboxSizePx(o)).toEqual([20, 40]);
	});
});

describe('medianRelativeDepthInBox', () => {
	it('returns the median of finite samples inside the box', () => {
		// 4x4 raster, box covers the top-left 2x2 block: values 1, 2, 3, 10 -> median 2.5
		const w = 4;
		const h = 4;
		const d = new Float32Array(w * h).fill(100);
		d[0] = 1;
		d[1] = 2;
		d[4] = 3;
		d[5] = 10;
		expect(medianRelativeDepthInBox(d, w, h, [0, 0, 2, 2])).toBe(2.5);
	});

	it('ignores NaN samples and fails when no samples remain', () => {
		const d = new Float32Array([NaN, NaN, NaN, NaN]);
		expect(() => medianRelativeDepthInBox(d, 2, 2, [0, 0, 2, 2])).toThrow('DEPTH_BOX_HAS_NO_FINITE_SAMPLES');
	});

	it('rejects a raster that does not match the image size', () => {
		expect(() => medianRelativeDepthInBox(new Float32Array(3), 2, 2, [0, 0, 1, 1])).toThrow(
			'DEPTH_RASTER_SIZE_MISMATCH'
		);
	});
});

describe('illustrativeSizeMetres', () => {
	it('requires an explicit scale and labels the result as illustrative', () => {
		const o = { bboxXYXY: [0, 0, 100, 200] as [number, number, number, number] };
		expect(() => illustrativeSizeMetres(o, 0)).toThrow('ILLUSTRATIVE_SCALE_REQUIRED');
		expect(illustrativeSizeMetres(o, 0.01)).toEqual({
			widthM: 1,
			heightM: 2,
			provenance: 'ILLUSTRATIVE_FROM_ASSUMED_SCALE'
		});
	});
});
