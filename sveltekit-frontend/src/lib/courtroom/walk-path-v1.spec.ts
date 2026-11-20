import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { buildTimedWalkPath } from './walk-path-v1.js';

describe('absolute source time on the walk spline', () => {
	const anchors = [
		{ x: 0, y: 0, z: 0, framePtsUs: 2_000_009 },
		{ x: 2, y: 0, z: 1, framePtsUs: 3_125_023 },
		{ x: 8, y: 0, z: 5, framePtsUs: 13_101_111 },
	];

	it('hits every anchor at its source PTS with uneven intervals', () => {
		const path = buildTimedWalkPath(anchors);
		for (const anchor of anchors) {
			const sample = path.atSourceTime(anchor.framePtsUs);
			expect(sample.x).toBeCloseTo(anchor.x, 9);
			expect(sample.y).toBeCloseTo(anchor.y, 9);
			expect(sample.z).toBeCloseTo(anchor.z, 9);
			expect(sample.localSeconds).toBe((anchor.framePtsUs - anchors[0].framePtsUs) / 1_000_000);
		}
	});

	it('seeks backwards deterministically and holds a repeated position', () => {
		const repeated = [...anchors, { ...anchors[2], framePtsUs: anchors[2].framePtsUs + 500_000 }];
		const path = buildTimedWalkPath(repeated);
		const t = anchors[2].framePtsUs + 125_000;
		const first = path.atSourceTime(t);
		path.atSourceTime(anchors[0].framePtsUs);
		expect(path.atSourceTime(t)).toEqual(first);
		expect(first).toMatchObject({ x: 8, z: 5 });
	});

	it('rejects duplicate timestamp anchors before they can be replayed', () => {
		expect(() => buildTimedWalkPath([anchors[0], { ...anchors[1], framePtsUs: anchors[0].framePtsUs }]))
			.toThrow('WALK_PATH_INVALID_SOURCE_TIME');
	});

	it('composes scene transforms in translation-rotation-scale order', () => {
		const composed = new Matrix4().compose(
			new Vector3(3, 4, 5),
			new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
			new Vector3(2, 3, 4),
		);
		const reference = new Matrix4().set(
			0, 0, 4, 3,
			0, 3, 0, 4,
			-2, 0, 0, 5,
			0, 0, 0, 1,
		);
		expect(composed.elements).toHaveLength(16);
		composed.elements.forEach((value, index) => expect(value).toBeCloseTo(reference.elements[index], 6));
	});
});
