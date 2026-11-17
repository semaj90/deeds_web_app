import { describe, expect, it } from 'vitest';
import {
	createPlanarCameraCalibrationV1,
	projectImagePointToPlaneV1,
	type PlanarCameraCalibrationInputV1,
} from './planar-camera-calibration-v1';

const base = {
	evidenceId: '11111111-1111-4111-8111-111111111111',
	sourceRevision: `sha256:${'a'.repeat(64)}`,
	analysisRevision: 'video-run-r3',
	calibrationFrameIndex: 12,
	calibrationFramePtsUs: 500_000,
	frameWidth: 640,
	frameHeight: 480,
	operatorConfirmedFixedCamera: true,
	fitAnchors: [
		{ id: 'a', imagePx: [0, 0], planeM: [0, 0] },
		{ id: 'b', imagePx: [640, 0], planeM: [6.4, 0] },
		{ id: 'c', imagePx: [640, 480], planeM: [6.4, 4.8] },
		{ id: 'd', imagePx: [0, 480], planeM: [0, 4.8] },
	],
	validationAnchors: [
		{ id: 'v1', imagePx: [160, 120], planeM: [1.6, 1.2] },
		{ id: 'v2', imagePx: [480, 120], planeM: [4.8, 1.2] },
		{ id: 'v3', imagePx: [480, 360], planeM: [4.8, 3.6] },
		{ id: 'v4', imagePx: [160, 360], planeM: [1.6, 3.6] },
	],
	toleranceMeters: 0.001,
} satisfies PlanarCameraCalibrationInputV1;

describe('planar-camera-calibration-v1', () => {
	it('fits a perspective transform and projects a held-out point', () => {
		const mapKnown = (x: number, y: number): [number, number] => {
			const denominator = 1 + 0.0003 * x + 0.0002 * y;
			return [(0.01 * x + 0.002 * y + 1) / denominator, (-0.001 * x + 0.009 * y + 0.5) / denominator];
		};
		const fitPixels = [[0, 0], [640, 0], [640, 480], [0, 480]] as const;
		const checkPixels = [[160, 120], [480, 120], [480, 360], [160, 360]] as const;
		const input = {
			...base,
			fitAnchors: fitPixels.map(([x, y], index) => ({ id: `fit-${index}`, imagePx: [x, y], planeM: mapKnown(x, y) })),
			validationAnchors: checkPixels.map(([x, y], index) => ({ id: `check-${index}`, imagePx: [x, y], planeM: mapKnown(x, y) })),
		};
		const calibration = createPlanarCameraCalibrationV1(input);
		expect(calibration.validationStatus).toBe('CHECKS_PASSED');
		const point: [number, number] = [273, 211];
		const result = projectImagePointToPlaneV1(calibration, {
			evidenceId: base.evidenceId,
			sourceRevision: base.sourceRevision,
			analysisRevision: base.analysisRevision,
			frameWidth: base.frameWidth,
			frameHeight: base.frameHeight,
			imagePx: point,
		});
		const expected = mapKnown(...point);
		expect(result.planeM[0]).toBeCloseTo(expected[0], 8);
		expect(result.planeM[1]).toBeCloseTo(expected[1], 8);
	});

	it('projects a point only after an independent anchor check passes', () => {
		const calibration = createPlanarCameraCalibrationV1(base);
		expect(calibration.validationStatus).toBe('CHECKS_PASSED');
		const result = projectImagePointToPlaneV1(calibration, {
			evidenceId: base.evidenceId,
			sourceRevision: base.sourceRevision,
			analysisRevision: base.analysisRevision,
			frameWidth: base.frameWidth,
			frameHeight: base.frameHeight,
			imagePx: [160, 120],
		});
		expect(result.planeM[0]).toBeCloseTo(1.6, 8);
		expect(result.planeM[1]).toBeCloseTo(1.2, 8);
		expect(result.status).toBe('UNREVIEWED_GROUND_PLANE_PROJECTION');
	});

	it('refuses projection without independent validation anchors', () => {
		const input = { ...base, validationAnchors: [] };
		const calibration = createPlanarCameraCalibrationV1(input);
		expect(calibration.validationStatus).toBe('FIT_ONLY_UNVERIFIED');
		expect(() => projectImagePointToPlaneV1(calibration, {
			evidenceId: base.evidenceId,
			sourceRevision: base.sourceRevision,
			analysisRevision: base.analysisRevision,
			frameWidth: base.frameWidth,
			frameHeight: base.frameHeight,
			imagePx: [160, 120],
		})).toThrow('PLANAR_CALIBRATION_REQUIRES_PASSED_INDEPENDENT_CHECKS');
	});

	it('refuses a calibration when an independent anchor exceeds tolerance', () => {
		const input = {
			...base,
			validationAnchors: [
				{ id: 'v1', imagePx: [160, 120], planeM: [9, 9] },
				...base.validationAnchors.slice(1),
			],
		};
		const calibration = createPlanarCameraCalibrationV1(input);
		expect(calibration.validationStatus).toBe('CHECKS_FAILED');
		expect(() => projectImagePointToPlaneV1(calibration, {
			evidenceId: base.evidenceId,
			sourceRevision: base.sourceRevision,
			analysisRevision: base.analysisRevision,
			frameWidth: base.frameWidth,
			frameHeight: base.frameHeight,
			imagePx: [160, 120],
		})).toThrow('PLANAR_CALIBRATION_REQUIRES_PASSED_INDEPENDENT_CHECKS');
	});

	it('rejects cross-revision and out-of-frame projections', () => {
		const calibration = createPlanarCameraCalibrationV1(base);
		const input = {
			evidenceId: base.evidenceId,
			sourceRevision: base.sourceRevision,
			analysisRevision: base.analysisRevision,
			frameWidth: base.frameWidth,
			frameHeight: base.frameHeight,
			imagePx: [160, 120] as const,
		};
		expect(() => projectImagePointToPlaneV1(calibration, { ...input, sourceRevision: `sha256:${'b'.repeat(64)}` }))
			.toThrow('PLANAR_CALIBRATION_SOURCE_OR_FRAME_MISMATCH');
		expect(() => projectImagePointToPlaneV1(calibration, { ...input, imagePx: [641, 120] }))
			.toThrow('PLANAR_CALIBRATION_IMAGE_POINT_OUT_OF_BOUNDS');
	});

	it('rejects degenerate anchors and duplicate anchor identities', () => {
		const collinear = {
			...base,
			fitAnchors: [
				{ id: 'a', imagePx: [0, 0], planeM: [0, 0] },
				{ id: 'b', imagePx: [1, 0], planeM: [1, 0] },
				{ id: 'c', imagePx: [2, 0], planeM: [2, 0] },
				{ id: 'd', imagePx: [0, 1], planeM: [0, 1] },
			],
		};
		expect(() => createPlanarCameraCalibrationV1(collinear)).toThrow('PLANAR_CALIBRATION_ANCHORS_DEGENERATE');
		expect(() => createPlanarCameraCalibrationV1({
			...base,
			validationAnchors: [{ ...base.validationAnchors[0]!, id: 'a' }, ...base.validationAnchors.slice(1)],
		})).toThrow('PLANAR_CALIBRATION_ANCHOR_IDS_MUST_BE_UNIQUE');
	});
});
