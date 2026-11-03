// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildReliefGrid, heightAt, resampleDepth } from './relief-grid.js';

/** 4x3 cells (5x4 vertices) with a deterministic non-planar depth field. */
function makeGrid() {
	const cols = 4, rows = 3;
	const depth = new Float32Array((cols + 1) * (rows + 1));
	for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) depth[y * (cols + 1) + x] = (x * 0.2 + y * 0.1) % 1;
	return { cols, rows, depth, W: 2, H: 1.5 };
}

describe('buildReliefGrid', () => {
	it('displaces vertices to (depth-0.5)*scale and scales live', () => {
		const { cols, rows, depth, W, H } = makeGrid();
		const grid = buildReliefGrid(W, H, cols, rows, depth);
		grid.apply(0.4);
		const pos = grid.geometry.getAttribute('position');
		for (let i = 0; i < depth.length; i++) expect(pos.getZ(i)).toBeCloseTo((depth[i] - 0.5) * 0.4, 6);
		grid.apply(0.8);
		for (let i = 0; i < depth.length; i++) expect(pos.getZ(i)).toBeCloseTo((depth[i] - 0.5) * 0.8, 6);
	});

	it('rejects a depth array that does not match the grid', () => {
		expect(() => buildReliefGrid(2, 1, 4, 3, new Float32Array(7))).toThrow(/sample count/);
	});
});

describe('heightAt', () => {
	it('is exact at every vertex and bilinear along a grid line', () => {
		const { cols, rows, depth, W, H } = makeGrid();
		const grid = buildReliefGrid(W, H, cols, rows, depth);
		for (let y = 0; y <= rows; y++) {
			for (let x = 0; x <= cols; x++) {
				expect(heightAt(grid, x / cols, y / rows, 0.5)).toBeCloseTo((depth[y * (cols + 1) + x] - 0.5) * 0.5, 6);
			}
		}
		const mid = heightAt(grid, 0.5 / cols, 0, 0.5);
		expect(mid).toBeCloseTo(((depth[0] + depth[1]) / 2 - 0.5) * 0.5, 6);
	});
});

describe('markers sit on the picked (displaced) surface', () => {
	// A ray from the camera side straight down at a vertex's (x,y) must hit z = heightAt, at every relief depth.
	for (const scale of [0.1, 0.35, 0.8]) {
		it(`raycast z equals heightAt at relief scale ${scale}`, () => {
			const { cols, rows, depth, W, H } = makeGrid();
			const grid = buildReliefGrid(W, H, cols, rows, depth);
			grid.apply(scale);
			const mesh = new THREE.Mesh(grid.geometry, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
			mesh.updateMatrixWorld(true);
			const ray = new THREE.Raycaster();
			for (const [u, v] of [[0.25, 0.3333333333], [0.5, 0.6666666667], [0.75, 0.3333333333], [0, 0], [1, 1]] as const) {
				const x = (u - 0.5) * W;
				const y = (0.5 - v) * H;
				ray.set(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));
				const hit = ray.intersectObject(mesh, false)[0];
				expect(hit, `no hit at u=${u} v=${v}`).toBeTruthy();
				expect(hit.point.z).toBeCloseTo(heightAt(grid, u, v, scale), 5);
			}
		});
	}

	it('a stale flat plane would have missed the displaced height (regression for the fixed 0.025 pin depth)', () => {
		const { cols, rows, depth, W, H } = makeGrid();
		const grid = buildReliefGrid(W, H, cols, rows, depth);
		const at = heightAt(grid, 1, 1, 0.8);
		expect(Math.abs(at - 0.025)).toBeGreaterThan(0.05);
	});
});

describe('resampleDepth', () => {
	it('keeps corner values and stays within the source range', () => {
		const { cols, rows, depth } = makeGrid();
		const out = resampleDepth(depth, cols, rows, 2, 1);
		expect(out.length).toBe(3 * 2);
		expect(out[0]).toBeCloseTo(depth[0], 6);
		expect(out[2]).toBeCloseTo(depth[cols], 6);
		expect(out[3]).toBeCloseTo(depth[rows * (cols + 1)], 6);
		expect(out[5]).toBeCloseTo(depth[(rows + 1) * (cols + 1) - 1], 6);
		for (const v of out) {
			expect(v).toBeGreaterThanOrEqual(Math.min(...depth) - 1e-6);
			expect(v).toBeLessThanOrEqual(Math.max(...depth) + 1e-6);
		}
	});
});
