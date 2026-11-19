import { describe, expect, it } from 'vitest';
import { bindObservationToPlaceholderV1, PLACEHOLDER_BINDING_PROVENANCE_V1 } from './observation-placeholder-binding-v1';
import { objectObservationSchemaV1, type ObjectObservationV1 } from './object-observation-v1';

const SHA = 'sha256:' + 'b'.repeat(64);
const OBS = '44444444-4444-4444-8444-444444444444';
const EVID = '11111111-1111-4111-8111-111111111111';

function obs(bbox: [number, number, number, number] = [800, 300, 1000, 700]): ObjectObservationV1 {
	return objectObservationSchemaV1.parse({
		observationId: OBS,
		evidenceId: EVID,
		sourceSha256: SHA,
		framePtsMs: 2000,
		imageWidth: 1920,
		imageHeight: 1080,
		classLabel: 'person',
		detectionConfidence: 0.8,
		bboxXYXY: bbox,
		depthType: null,
		coordinateFrame: 'image',
		status: 'observed'
	});
}

describe('bindObservationToPlaceholderV1', () => {
	it('refuses to bind without an explicit positive scale', () => {
		expect(() => bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0 })).toThrow('ILLUSTRATIVE_SCALE_REQUIRED');
		expect(() => bindObservationToPlaceholderV1(obs(), { metresPerPixel: NaN })).toThrow('ILLUSTRATIVE_SCALE_REQUIRED');
	});

	it('labels the result as illustrative and keeps the evidence reference', () => {
		const r = bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002 });
		expect(r.provenance).toBe(PLACEHOLDER_BINDING_PROVENANCE_V1);
		expect(r.shape).toBe('hexagonal_prism');
		expect(r.evidenceRef).toEqual({
			sourceSha256: SHA,
			framePtsMs: 2000,
			classLabel: 'person',
			bboxXYXY: [800, 300, 1000, 700]
		});
		expect(r.scale.source).toBe('CALLER_SUPPLIED');
		expect(r.provenance).toBe('illustrative');
		expect(r.observationId).toBe(OBS);
		expect(r.evidenceId).toBe(EVID);
		expect(r.primitiveId).toBe('hexagonal_prism_v1');
	});

	it('leaves y null and alignment NOT_GROUNDED without a ground-contact annotation', () => {
		const r = bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002 });
		expect(r.position.yM).toBeNull();
		expect(r.alignment).toBe('NOT_GROUNDED');
		expect(r.position.frame).toBe('camera_illustrative');
	});

	it('places y from an annotated ground-contact point', () => {
		const r = bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002, groundContactPxY: 1000 });
		expect(r.alignment).toBe('GROUND_CONTACT_ANNOTATED');
		// image centre y = 540; 540 - 1000 = -460 px -> -0.92 m
		expect(r.position.yM).toBeCloseTo(-0.92, 6);
	});

	it('rejects a non-finite ground-contact point', () => {
		expect(() =>
			bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002, groundContactPxY: Number.NaN })
		).toThrow('GROUND_CONTACT_PX_INVALID');
	});

	it('derives x from the horizontal offset of the box centre', () => {
		// centre x = 900; image centre x = 960 -> -60 px * 0.002 = -0.12 m
		const r = bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002 });
		expect(r.position.xM).toBeCloseTo(-0.12, 6);
	});

	it('keeps z at 0 without a depth span, and offsets within the span when given one', () => {
		const none = bindObservationToPlaceholderV1(obs(), { metresPerPixel: 0.002 });
		expect(none.position.zM).toBe(0);
		const mid = bindObservationToPlaceholderV1(obs(), {
			metresPerPixel: 0.002,
			depthSpanM: 2,
			relativeDepth: { value: 5, min: 0, max: 10 }
		});
		expect(mid.position.zM).toBeCloseTo(0, 6);
		const far = bindObservationToPlaceholderV1(obs(), {
			metresPerPixel: 0.002,
			depthSpanM: 2,
			relativeDepth: { value: 10, min: 0, max: 10 }
		});
		expect(far.position.zM).toBeCloseTo(1, 6);
	});

	it('clamps the radius so one bad box cannot dominate the scene', () => {
		const tiny = bindObservationToPlaceholderV1(obs([0, 0, 2, 2]), { metresPerPixel: 0.001 });
		expect(tiny.radiusM).toBeCloseTo(0.05, 6);
		const huge = bindObservationToPlaceholderV1(obs([0, 0, 1900, 1000]), { metresPerPixel: 0.01 });
		expect(huge.radiusM).toBe(2);
	});
});
