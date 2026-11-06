export type Point3V1 = readonly [number, number, number];
export type BarycentricV1 = [number, number, number];

/** Return normalized triangle weights for a point in the triangle's local frame. */
export function triangleBarycentricV1(point: Point3V1, a: Point3V1, b: Point3V1, c: Point3V1): BarycentricV1 {
	const values = [...point, ...a, ...b, ...c];
	if (!values.every(Number.isFinite)) throw new RangeError('Triangle coordinates must be finite.');
	const v0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
	const v1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
	const v2 = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
	const dot = (left: number[], right: number[]) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
	const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1);
	const d20 = dot(v2, v0), d21 = dot(v2, v1);
	const denominator = d00 * d11 - d01 * d01;
	if (!Number.isFinite(denominator) || denominator <= Number.EPSILON * Math.max(d00 * d11, 1)) {
		throw new RangeError('Cannot anchor to a degenerate triangle.');
	}
	const v = (d11 * d20 - d01 * d21) / denominator;
	const w = (d00 * d21 - d01 * d20) / denominator;
	const u = 1 - v - w;
	const epsilon = 1e-7;
	if (u < -epsilon || v < -epsilon || w < -epsilon || u > 1 + epsilon || v > 1 + epsilon || w > 1 + epsilon) {
		throw new RangeError('Anchor point lies outside the target triangle.');
	}
	const weights = [u, v, w].map((weight) => Math.max(0, Math.min(1, weight)));
	const sum = weights[0] + weights[1] + weights[2];
	return [weights[0] / sum, weights[1] / sum, weights[2] / sum];
}

/** Recover a triangle-local point from its saved barycentric weights. */
export function interpolateTrianglePointV1(a: Point3V1, b: Point3V1, c: Point3V1, weights: BarycentricV1): Point3V1 {
	if (![...a, ...b, ...c, ...weights].every(Number.isFinite)) throw new RangeError('Triangle coordinates and weights must be finite.');
	if (weights.some((weight) => weight < 0 || weight > 1) || Math.abs(weights[0] + weights[1] + weights[2] - 1) > 1e-5) {
		throw new RangeError('Barycentric weights must be within [0, 1] and sum to one.');
	}
	return [0, 1, 2].map((axis) => a[axis] * weights[0] + b[axis] * weights[1] + c[axis] * weights[2]) as unknown as Point3V1;
}
