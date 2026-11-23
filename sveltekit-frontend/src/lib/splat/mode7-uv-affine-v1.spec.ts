import { describe, expect, it } from 'vitest';
import {
	IDENTITY_MODE7_UV_AFFINE_V1,
	parseMode7UvAffineV1,
	transformMode7UvV1,
} from './mode7-uv-affine-v1.js';

describe('Mode-7 UV affine v1', () => {
	it('keeps identity UVs unchanged', () => {
		expect(transformMode7UvV1(0.25, 0.75)).toEqual([0.25, 0.75]);
		expect(IDENTITY_MODE7_UV_AFFINE_V1).toEqual([1, 0, 0, 0, 1, 0]);
	});

	it('applies row-major scale, rotation/shear, and translation deterministically', () => {
		const [u, v] = transformMode7UvV1(0.2, 0.3, [2, 1, 0.1, -1, 3, -0.2]);
		expect(u).toBeCloseTo(0.8, 12);
		expect(v).toBeCloseTo(0.5, 12);
	});

	it('rejects malformed matrices and non-finite coordinates', () => {
		expect(() => parseMode7UvAffineV1([1, 0, 0, 0, 1])).toThrow();
		expect(() => parseMode7UvAffineV1([1, 0, 0, 0, Number.NaN, 0])).toThrow();
		expect(() => transformMode7UvV1(Number.POSITIVE_INFINITY, 0)).toThrow('MODE7_UV_COORDINATE_INVALID');
	});
});
