/**
 * Validation and deterministic ear clipping for simple, hole-free scene polygons.
 * Input coordinates are local metres. This validates geometry only; it does not
 * assign a world location or establish that a shape matches real evidence.
 */

export type PolygonPointV1 = readonly [number, number];

const EPSILON = 1e-10;
const MAX_VERTICES = 256;
const MAX_ABS_LOCAL_METERS = 10_000;

function cross(a: PolygonPointV1, b: PolygonPointV1, c: PolygonPointV1): number {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: PolygonPointV1, b: PolygonPointV1, p: PolygonPointV1): boolean {
	return Math.abs(cross(a, b, p)) <= EPSILON &&
		p[0] >= Math.min(a[0], b[0]) - EPSILON && p[0] <= Math.max(a[0], b[0]) + EPSILON &&
		p[1] >= Math.min(a[1], b[1]) - EPSILON && p[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function segmentsIntersect(a: PolygonPointV1, b: PolygonPointV1, c: PolygonPointV1, d: PolygonPointV1): boolean {
	const abC = cross(a, b, c);
	const abD = cross(a, b, d);
	const cdA = cross(c, d, a);
	const cdB = cross(c, d, b);
	if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
		((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
	return (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) ||
		(Math.abs(abD) <= EPSILON && onSegment(a, b, d)) ||
		(Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) ||
		(Math.abs(cdB) <= EPSILON && onSegment(c, d, b));
}

function insideOrBoundary(point: PolygonPointV1, a: PolygonPointV1, b: PolygonPointV1, c: PolygonPointV1): boolean {
	return cross(a, b, point) >= -EPSILON && cross(b, c, point) >= -EPSILON && cross(c, a, point) >= -EPSILON;
}

/** Validate a simple polygon and return deterministic CCW ear-clipped triangle indices. */
export function triangulateSimplePolygonV1(points: readonly PolygonPointV1[]): Uint16Array {
	if (!Array.isArray(points) || points.length < 3 || points.length > MAX_VERTICES) {
		throw new RangeError(`polygon must contain 3..${MAX_VERTICES} vertices`);
	}
	for (let i = 0; i < points.length; i++) {
		const point: unknown = points[i];
		if (!Array.isArray(point) || point.length !== 2 || point.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
			throw new TypeError(`vertex[${i}] must contain two finite coordinates`);
		}
		if (Math.abs(point[0]) > MAX_ABS_LOCAL_METERS || Math.abs(point[1]) > MAX_ABS_LOCAL_METERS) {
			throw new RangeError(`vertex[${i}] exceeds the local scene bounds`);
		}
	}

	let twiceArea = 0;
	for (let i = 0; i < points.length; i++) {
		const current = points[i]!;
		const next = points[(i + 1) % points.length]!;
		if (Math.hypot(current[0] - next[0], current[1] - next[1]) <= EPSILON) {
			throw new RangeError('polygon contains duplicate consecutive vertices');
		}
		twiceArea += current[0] * next[1] - next[0] * current[1];
	}
	if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= EPSILON) throw new RangeError('polygon area is degenerate');

	for (let i = 0; i < points.length; i++) {
		const nextI = (i + 1) % points.length;
		for (let j = i + 1; j < points.length; j++) {
			const nextJ = (j + 1) % points.length;
			if (nextI === j || nextJ === i) continue;
			if (segmentsIntersect(points[i]!, points[nextI]!, points[j]!, points[nextJ]!)) {
				throw new RangeError('polygon self-intersects or touches a non-adjacent edge');
			}
		}
	}

	const remaining = Array.from({ length: points.length }, (_, index) => index);
	if (twiceArea < 0) remaining.reverse();
	const triangles: number[] = [];
	let attempts = 0;
	while (remaining.length > 3) {
		let clipped = false;
		for (let i = 0; i < remaining.length; i++) {
			const a = remaining[(i + remaining.length - 1) % remaining.length]!;
			const b = remaining[i]!;
			const c = remaining[(i + 1) % remaining.length]!;
			if (cross(points[a]!, points[b]!, points[c]!) <= EPSILON) continue;
			if (remaining.some((candidate) => candidate !== a && candidate !== b && candidate !== c &&
				insideOrBoundary(points[candidate]!, points[a]!, points[b]!, points[c]!))) continue;
			triangles.push(a, b, c);
			remaining.splice(i, 1);
			clipped = true;
			break;
		}
		if (!clipped || ++attempts > MAX_VERTICES) throw new RangeError('polygon could not be triangulated');
	}
	triangles.push(...remaining);
	return Uint16Array.from(triangles);
}

export function estimatePolygonPrismTrianglesV1(vertexCount: number): number {
	if (!Number.isInteger(vertexCount) || vertexCount < 3 || vertexCount > MAX_VERTICES) {
		throw new RangeError(`polygon vertex count must be 3..${MAX_VERTICES}`);
	}
	return 4 * vertexCount - 4;
}
