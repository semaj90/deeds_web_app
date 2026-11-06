import { describe, expect, it } from 'vitest';
import { interpolateTrianglePointV1, triangleBarycentricV1 } from './surface-marker-v1.js';

describe('mesh-relative surface anchors', () => {
	const a = [0, 0, 0] as const, b = [2, 0, 0] as const, c = [0, 2, 0] as const;
	it('round trips a point through barycentric coordinates', () => {
		const point = [0.5, 0.75, 0] as const;
		const weights = triangleBarycentricV1(point, a, b, c);
		expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
		expect(interpolateTrianglePointV1(a, b, c, weights)).toEqual(point);
	});
	it('accepts triangle vertices and edges', () => {
		expect(triangleBarycentricV1(a, a, b, c)).toEqual([1, 0, 0]);
		expect(triangleBarycentricV1([1, 1, 0], a, b, c)).toEqual([0, 0.5, 0.5]);
	});
	it('rejects degenerate, outside, and non-finite anchors', () => {
		expect(() => triangleBarycentricV1([0, 0, 0], a, a, c)).toThrow(/degenerate/);
		expect(() => triangleBarycentricV1([3, 3, 0], a, b, c)).toThrow(/outside/);
		expect(() => triangleBarycentricV1([Number.NaN, 0, 0], a, b, c)).toThrow(/finite/);
	});
	it('rejects invalid saved barycentric weights', () => {
		expect(() => interpolateTrianglePointV1(a, b, c, [0.2, 0.2, 0.2])).toThrow(/sum to one/);
	});
});
