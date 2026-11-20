import { describe, expect, it } from 'vitest';
import { compileMaskContoursV1 } from './mask-contour-compiler-v1.js';

function plane(width: number, height: number, active: Array<[number, number]>) {
	const values = new Uint8Array(width * height);
	for (const [x, y] of active) values[y * width + x] = 255;
	return values;
}

describe('compileMaskContoursV1', () => {
	it('preserves disconnected components as separate editable polygons', () => {
		const result = compileMaskContoursV1({ values: plane(5, 3, [[0, 0], [4, 2]]), width: 5, height: 3, simplificationTolerancePx: 0 });
		expect(result.status).toBe('COMPILED');
		expect(result.foregroundPixelCount).toBe(2);
		expect(result.polygons).toHaveLength(2);
		expect(result.polygons.map(({ outer }) => outer)).toEqual([
			[[0, 0], [1, 0], [1, 1], [0, 1]],
			[[4, 2], [5, 2], [5, 3], [4, 3]]
		]);
	});

	it('preserves a mask hole and simplifies the exterior to pixel-edge corners', () => {
		const pixels: Array<[number, number]> = [];
		for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) pixels.push([x, y]);
		const result = compileMaskContoursV1({ values: plane(5, 5, pixels), width: 5, height: 5 });
		expect(result.polygons).toHaveLength(1);
		expect(result.polygons[0]?.outer).toEqual([[1, 1], [4, 1], [4, 4], [1, 4]]);
		expect(result.polygons[0]?.holes).toEqual([[[3, 2], [2, 2], [2, 3], [3, 3]]]);
	});

	it('returns explicit EMPTY coverage for an all-background mask', () => {
		expect(compileMaskContoursV1({ values: new Uint8Array(6), width: 3, height: 2 })).toMatchObject({ status: 'EMPTY', polygons: [], boundaryEdgeCount: 0 });
	});

	it('rejects excessive geometry and mismatched source dimensions before tracing', () => {
		expect(() => compileMaskContoursV1({ values: new Uint8Array(5), width: 3, height: 2 })).toThrow('MASK_VALUE_PLANE_LENGTH_MISMATCH');
		expect(() => compileMaskContoursV1({ values: new Uint8Array(4_000_001), width: 2001, height: 2000 })).toThrow('MASK_DIMENSIONS_OUT_OF_BOUNDS');
	});

	it('rejects a contour whose boundary exceeds the bounded edge budget', () => {
		const width = 501, height = 501;
		const values = new Uint8Array(width * height);
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((x + y) % 2 === 0) values[y * width + x] = 255;
		expect(() => compileMaskContoursV1({ values, width, height })).toThrow('MASK_BOUNDARY_EDGE_LIMIT_EXCEEDED');
	});
});
