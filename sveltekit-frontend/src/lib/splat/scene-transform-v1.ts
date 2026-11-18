/**
 * Pure 2D and 3D transform helpers for placeholder geometry: translate (shift), rotate about a
 * pivot, and a grid shift with wrap-around for tiled textures. No mutable state, no GPU use.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export function shift2(points: readonly Vec2[], dx: number, dy: number): Vec2[] {
	assertFinite(dx, dy);
	return points.map(([x, y]) => [x + dx, y + dy] as const);
}

export function rotate2(points: readonly Vec2[], angleRadians: number, pivot: Vec2 = [0, 0]): Vec2[] {
	assertFinite(angleRadians, pivot[0], pivot[1]);
	const c = Math.cos(angleRadians);
	const s = Math.sin(angleRadians);
	return points.map(([x, y]) => {
		const px = x - pivot[0];
		const py = y - pivot[1];
		return [pivot[0] + px * c - py * s, pivot[1] + px * s + py * c] as const;
	});
}

/** Rotate a 3D point about the Z axis (up in the scene's Z-up convention). */
export function rotateZ(point: Vec3, angleRadians: number): Vec3 {
	assertFinite(angleRadians, ...point);
	const c = Math.cos(angleRadians);
	const s = Math.sin(angleRadians);
	return [point[0] * c - point[1] * s, point[0] * s + point[1] * c, point[2]];
}

/**
 * Shift an integer grid index by (dx, dy) with wrap-around in a width x height grid.
 * Used for tiled textures and sliding windows over packed rows.
 */
export function wrapGridIndex(x: number, y: number, dx: number, dy: number, width: number, height: number): [number, number] {
	if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(dx) || !Number.isInteger(dy)) {
		throw new Error('Grid indices and shifts must be integers');
	}
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		throw new Error('Grid dimensions must be positive integers');
	}
	return [mod(x + dx, width), mod(y + dy, height)];
}

function mod(a: number, n: number): number {
	return ((a % n) + n) % n;
}

function assertFinite(...values: number[]): void {
	for (const v of values) {
		if (!Number.isFinite(v)) throw new Error('Transform inputs must be finite numbers');
	}
}
