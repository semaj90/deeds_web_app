import { describe, it, expect } from 'vitest';
import {
	applyTransform,
	calibrate,
	markerDiameterM,
	solveTwoAnchorTransform,
	type CalibrationAnchor
} from './calibration.js';

const dist = (a: readonly number[], b: readonly number[]) =>
	Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Splat-space anchors with a known true transform: scale 2.5, yaw 0.7 rad, translation (4, 1, -3)
const TRUE_SCALE = 2.5;
const TRUE_YAW = 0.7;
const TRUE_T = [4, 1, -3] as const;
function trueWorld(p: readonly [number, number, number]): [number, number, number] {
	const c = Math.cos(TRUE_YAW);
	const s = Math.sin(TRUE_YAW);
	const r = [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
	return [TRUE_SCALE * r[0] + TRUE_T[0], TRUE_SCALE * r[1] + TRUE_T[1], TRUE_SCALE * r[2] + TRUE_T[2]];
}

const SPLAT_PTS: Array<[number, number, number]> = [
	[0.1, 0.0, 0.2],
	[1.3, 0.4, -0.5],
	[-0.7, 0.9, 1.1],
	[2.0, -0.3, 0.6]
];

function anchors(): CalibrationAnchor[] {
	return SPLAT_PTS.map((p, i) => ({ id: `a${i}`, splat: p, worldM: trueWorld(p) }));
}

describe('solveTwoAnchorTransform', () => {
	it('recovers scale, yaw and translation from exact two-anchor data', () => {
		const t = solveTwoAnchorTransform(anchors()[0], anchors()[1]);
		expect(t.scale).toBeCloseTo(TRUE_SCALE, 9);
		expect(t.yawRad).toBeCloseTo(TRUE_YAW, 9);
		expect(t.translation[0]).toBeCloseTo(TRUE_T[0], 9);
		expect(t.translation[1]).toBeCloseTo(TRUE_T[1], 9);
		expect(t.translation[2]).toBeCloseTo(TRUE_T[2], 9);
	});

	it('maps both fitted anchors exactly onto their measured positions', () => {
		const a = anchors();
		const t = solveTwoAnchorTransform(a[0], a[1]);
		expect(dist(applyTransform(t, a[0].splat), a[0].worldM)).toBeLessThan(1e-9);
		expect(dist(applyTransform(t, a[1].splat), a[1].worldM)).toBeLessThan(1e-9);
	});

	it('throws on coincident anchors instead of returning a degenerate transform', () => {
		const a = anchors();
		expect(() => solveTwoAnchorTransform(a[0], { ...a[0], id: 'dup' })).toThrow(
			'CALIBRATION_ANCHORS_COINCIDE_IN_SPLAT_SPACE'
		);
	});
});

describe('calibrate', () => {
	it('passes with independent check anchors inside tolerance', () => {
		const r = calibrate(anchors(), 0.02);
		expect(r.pass).toBe(true);
		expect(r.maxResidualM).toBeLessThan(1e-6);
		expect(r.residualsM).toHaveLength(4);
	});

	it('fails when a check anchor is measured off by more than tolerance', () => {
		const a = anchors();
		a[3] = { ...a[3], worldM: [a[3].worldM[0] + 0.15, a[3].worldM[1], a[3].worldM[2]] };
		const r = calibrate(a, 0.02);
		expect(r.pass).toBe(false);
		expect(r.maxResidualM).toBeGreaterThan(0.1);
	});

	it('rejects fewer than two anchors', () => {
		expect(() => calibrate([anchors()[0]], 0.02)).toThrow('CALIBRATION_NEEDS_TWO_ANCHORS');
	});
});

describe('marker sizing in calibrated meters', () => {
	it('a 0.5 m object measures 0.5 m in the scene after the splat transform', () => {
		const a = anchors();
		const t = solveTwoAnchorTransform(a[0], a[1]);
		// Marker endpoints of a 0.5 m object, defined in splat space by the same scale ratio
		const diameter = markerDiameterM(0.5);
		const p0 = a[0].splat;
		// Choose a splat-space offset whose calibrated length is exactly `diameter`
		const offsetSplat: [number, number, number] = [diameter / TRUE_SCALE, 0, 0];
		const p1: [number, number, number] = [p0[0] + offsetSplat[0], p0[1], p0[2]];
		const measured = dist(applyTransform(t, p0), applyTransform(t, p1));
		expect(measured).toBeCloseTo(0.5, 6);
	});

	it('rejects non-positive or non-finite sizes', () => {
		expect(() => markerDiameterM(0)).toThrow('MARKER_SIZE_MUST_BE_POSITIVE_METERS');
		expect(() => markerDiameterM(-1)).toThrow();
		expect(() => markerDiameterM(Number.NaN)).toThrow();
	});
});
