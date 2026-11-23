import { describe, expect, it } from 'vitest';
import { buildReviewedMotionDisplayV1 } from './reviewed-motion-display-v1.js';

const points = [
	{ frameIndex: 0, planeM: [0.137, -0.421] as const },
	{ frameIndex: 1, planeM: [0.912, 0.058] as const },
	{ frameIndex: 2, planeM: [-1.333, 2.077] as const },
];

describe('reviewed motion display v1 (15.D2)', () => {
	it('snaps display positions to the requested grid', () => {
		const m = buildReviewedMotionDisplayV1(points, { cellM: 0.5 });
		expect(m.display.map((d) => d.planeM)).toEqual([[0, -0.5], [1, 0], [-1.5, 2]]);
	});

	it('keeps reviewed coordinates identical across different display cells', () => {
		const a = buildReviewedMotionDisplayV1(points, { cellM: 0.5 });
		const b = buildReviewedMotionDisplayV1(points, { cellM: 0.05 });
		expect(a.reviewed).toEqual(b.reviewed);
		expect(a.reviewed.map((p) => p.planeM)).toEqual(points.map((p) => [...p.planeM]));
	});

	it('does not mutate the input points', () => {
		const snapshot = JSON.parse(JSON.stringify(points));
		buildReviewedMotionDisplayV1(points, { cellM: 1 });
		expect(points).toEqual(snapshot);
	});

	it('freezes the reviewed record so display code cannot write back into it', () => {
		const m = buildReviewedMotionDisplayV1(points, { cellM: 0.5 });
		expect(Object.isFrozen(m.reviewed)).toBe(true);
		expect(Object.isFrozen(m.reviewed[0].planeM)).toBe(true);
		expect(() => { (m.reviewed[0].planeM as unknown as number[])[0] = 99; }).toThrow();
	});

	it('keeps display frame order aligned with reviewed frames', () => {
		const m = buildReviewedMotionDisplayV1(points, { cellM: 0.25 });
		expect(m.display.map((d) => d.frameIndex)).toEqual(m.reviewed.map((r) => r.frameIndex));
	});

	it('rejects a non-positive or non-finite cell', () => {
		expect(() => buildReviewedMotionDisplayV1(points, { cellM: 0 })).toThrow('REVIEWED_MOTION_DISPLAY_CELL_INVALID');
		expect(() => buildReviewedMotionDisplayV1(points, { cellM: Number.NaN })).toThrow('REVIEWED_MOTION_DISPLAY_CELL_INVALID');
	});
});
