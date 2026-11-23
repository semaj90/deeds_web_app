import { describe, expect, it } from 'vitest';
import { rotate2, rotateZ, shift2, wrapGridIndex } from './scene-transform-v1.js';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('scene transform v1', () => {
	it('shifts points by an offset', () => {
		expect(shift2([[1, 2], [-1, 0]], 3, -2)).toEqual([[4, 0], [2, -2]]);
	});

	it('rotates 90 degrees about the origin', () => {
		const [[x, y]] = rotate2([[1, 0]], Math.PI / 2);
		close(x, 0);
		close(y, 1);
	});

	it('rotates about a pivot, leaving the pivot fixed', () => {
		const [[px, py]] = rotate2([[2, 3]], Math.PI, [2, 3]);
		close(px, 2);
		close(py, 3);
	});

	it('rotates 3D points about Z and keeps height', () => {
		const [x, y, z] = rotateZ([1, 0, 5], Math.PI / 2);
		close(x, 0);
		close(y, 1);
		expect(z).toBe(5);
	});

	it('wraps grid indices in both directions', () => {
		expect(wrapGridIndex(7, 0, 1, 0, 8, 4)).toEqual([0, 0]);
		expect(wrapGridIndex(0, 0, -1, -1, 8, 4)).toEqual([7, 3]);
		expect(wrapGridIndex(3, 2, 0, 0, 8, 4)).toEqual([3, 2]);
	});

	it('rejects non-finite, non-integer, and invalid-size inputs', () => {
		expect(() => shift2([[0, 0]], Number.NaN, 0)).toThrow();
		expect(() => rotate2([[0, 0]], Number.POSITIVE_INFINITY)).toThrow();
		expect(() => wrapGridIndex(1.5, 0, 0, 0, 8, 4)).toThrow();
		expect(() => wrapGridIndex(0, 0, 0, 0, 0, 4)).toThrow();
	});
});
