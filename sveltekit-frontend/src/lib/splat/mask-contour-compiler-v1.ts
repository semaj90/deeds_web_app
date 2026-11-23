import { triangulateSimplePolygonV1, type PolygonPointV1 } from './polygon-prism-validation-v1.js';

export const MASK_CONTOUR_COMPILER_REVISION_V1 = 'mask-contour-compiler-v1';
export const MASK_CONTOUR_MAX_PIXELS_V1 = 4_000_000;
export const MASK_CONTOUR_MAX_EDGES_V1 = 250_000;
export const MASK_CONTOUR_MAX_VERTICES_V1 = 256;

export type MaskPolygonV1 = {
	outer: PolygonPointV1[];
	holes: PolygonPointV1[][];
};

export type MaskContourResultV1 = {
	schema: 'atlas.mask-contours.v1';
	compilerRevision: typeof MASK_CONTOUR_COMPILER_REVISION_V1;
	coordinateSpace: 'MASK_PIXEL_EDGES';
	width: number;
	height: number;
	threshold: number;
	simplificationTolerancePx: number;
	foregroundPixelCount: number;
	boundaryEdgeCount: number;
	status: 'COMPILED' | 'EMPTY';
	polygons: MaskPolygonV1[];
};

function pointKey(x: number, y: number, stride: number): number {
	return y * stride + x;
}

function pointFromKey(key: number, stride: number): PolygonPointV1 {
	return [key % stride, Math.floor(key / stride)];
}

function endVertex(start: number, direction: number, stride: number): number {
	switch (direction) {
		case 0: return start + 1; // east
		case 1: return start + stride; // south
		case 2: return start - 1; // west
		default: return start - stride; // north
	}
}

function squaredDistanceToSegment(point: PolygonPointV1, start: PolygonPointV1, end: PolygonPointV1): number {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
	const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
	return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2;
}

function simplifyOpenPath(points: PolygonPointV1[], tolerance: number): PolygonPointV1[] {
	if (points.length <= 2 || tolerance <= 0) return points;
	const keep = new Uint8Array(points.length);
	keep[0] = 1;
	keep[points.length - 1] = 1;
	const stack: Array<[number, number]> = [[0, points.length - 1]];
	const toleranceSquared = tolerance * tolerance;
	while (stack.length) {
		const [first, last] = stack.pop()!;
		let farthest = -1;
		let farthestDistance = toleranceSquared;
		for (let i = first + 1; i < last; i++) {
			const distance = squaredDistanceToSegment(points[i]!, points[first]!, points[last]!);
			if (distance > farthestDistance) { farthest = i; farthestDistance = distance; }
		}
		if (farthest >= 0) {
			keep[farthest] = 1;
			stack.push([first, farthest], [farthest, last]);
		}
	}
	return points.filter((_, index) => keep[index] === 1);
}

function signedArea(points: readonly PolygonPointV1[]): number {
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i]!;
		const b = points[(i + 1) % points.length]!;
		area += a[0] * b[1] - b[0] * a[1];
	}
	return area / 2;
}

function simplifyClosedRing(input: PolygonPointV1[], tolerance: number): PolygonPointV1[] {
	const collinearReduced = input.filter((point, index) => {
		const previous = input[(index + input.length - 1) % input.length]!;
		const next = input[(index + 1) % input.length]!;
		return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
	});
	if (collinearReduced.length < 3) throw new Error('MASK_CONTOUR_DEGENERATE');
	if (tolerance <= 0 || collinearReduced.length <= 3) return collinearReduced;

	const origin = collinearReduced[0]!;
	let opposite = 1;
	let greatestDistance = -1;
	for (let i = 1; i < collinearReduced.length; i++) {
		const point = collinearReduced[i]!;
		const distance = (point[0] - origin[0]) ** 2 + (point[1] - origin[1]) ** 2;
		if (distance > greatestDistance) { opposite = i; greatestDistance = distance; }
	}
	const firstArc = collinearReduced.slice(0, opposite + 1);
	const secondArc = [...collinearReduced.slice(opposite), origin];
	const simplified = [...simplifyOpenPath(firstArc, tolerance), ...simplifyOpenPath(secondArc, tolerance).slice(1, -1)];
	const result = simplified.length >= 3 ? simplified : collinearReduced;
	if (result.length > MASK_CONTOUR_MAX_VERTICES_V1) throw new Error('MASK_CONTOUR_VERTEX_LIMIT_EXCEEDED');
	triangulateSimplePolygonV1(result);
	if (Math.abs(signedArea(result)) < 0.5) throw new Error('MASK_CONTOUR_DEGENERATE');
	return result;
}

function pointInPolygon(point: PolygonPointV1, ring: readonly PolygonPointV1[]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i]!;
		const b = ring[j]!;
		if ((a[1] > point[1]) !== (b[1] > point[1]) &&
			point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
	}
	return inside;
}

/**
 * Convert a bounded, decoded one-byte mask plane to pixel-edge contours.
 * `values` must already be read from the authorized mask artifact; this function
 * performs no storage access, image identity check, evidence inference, or writes.
 */
export function compileMaskContoursV1(input: {
	values: Uint8Array;
	width: number;
	height: number;
	threshold?: number;
	simplificationTolerancePx?: number;
}): MaskContourResultV1 {
	const { values, width, height } = input;
	const threshold = input.threshold ?? 128;
	const simplificationTolerancePx = input.simplificationTolerancePx ?? 1.25;
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > MASK_CONTOUR_MAX_PIXELS_V1) {
		throw new RangeError('MASK_DIMENSIONS_OUT_OF_BOUNDS');
	}
	if (!(values instanceof Uint8Array) || values.byteLength !== width * height) throw new TypeError('MASK_VALUE_PLANE_LENGTH_MISMATCH');
	if (!Number.isInteger(threshold) || threshold < 1 || threshold > 254) throw new RangeError('MASK_THRESHOLD_OUT_OF_BOUNDS');
	if (!Number.isFinite(simplificationTolerancePx) || simplificationTolerancePx < 0 || simplificationTolerancePx > 64) {
		throw new RangeError('MASK_SIMPLIFICATION_TOLERANCE_OUT_OF_BOUNDS');
	}
	const foreground = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && values[y * width + x]! >= threshold;
	let foregroundPixelCount = 0;
	for (const value of values) if (value >= threshold) foregroundPixelCount++;
	const resultBase: Omit<MaskContourResultV1, 'boundaryEdgeCount' | 'status' | 'polygons'> = { schema: 'atlas.mask-contours.v1', compilerRevision: MASK_CONTOUR_COMPILER_REVISION_V1,
		coordinateSpace: 'MASK_PIXEL_EDGES' as const, width, height, threshold, simplificationTolerancePx, foregroundPixelCount };
	if (!foregroundPixelCount) return { ...resultBase, boundaryEdgeCount: 0, status: 'EMPTY', polygons: [] };

	const stride = width + 1;
	const edges: number[] = [];
	const outgoing = new Map<number, number[]>();
	const addEdge = (x: number, y: number, direction: number) => {
		if (edges.length >= MASK_CONTOUR_MAX_EDGES_V1) throw new RangeError('MASK_BOUNDARY_EDGE_LIMIT_EXCEEDED');
		const vertex = pointKey(x, y, stride);
		const edge = vertex * 4 + direction;
		edges.push(edge);
		const list = outgoing.get(vertex) ?? [];
		list.push(edge);
		outgoing.set(vertex, list);
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!foreground(x, y)) continue;
			if (!foreground(x, y - 1)) addEdge(x, y, 0);
			if (!foreground(x + 1, y)) addEdge(x + 1, y, 1);
			if (!foreground(x, y + 1)) addEdge(x + 1, y + 1, 2);
			if (!foreground(x - 1, y)) addEdge(x, y + 1, 3);
		}
	}

	const visited = new Set<number>();
	const outerRings: PolygonPointV1[][] = [];
	const holeRings: PolygonPointV1[][] = [];
	for (const seed of edges) {
		if (visited.has(seed)) continue;
		let current = seed;
		const ring: PolygonPointV1[] = [];
		let closed = false;
		for (let step = 0; step <= edges.length; step++) {
			if (visited.has(current)) { closed = current === seed; break; }
			visited.add(current);
			const direction = current % 4;
			const start = Math.floor(current / 4);
			ring.push(pointFromKey(start, stride));
			const end = endVertex(start, direction, stride);
			const options = outgoing.get(end) ?? [];
			const turnPriority = [(direction + 1) % 4, direction, (direction + 3) % 4, (direction + 2) % 4];
			const next = turnPriority.map((candidate) => options.find((edge) => edge % 4 === candidate && (edge === seed || !visited.has(edge)))).find((edge) => edge !== undefined);
			if (next === undefined) { closed = false; break; }
			current = next;
			if (current === seed) { closed = true; break; }
		}
		if (!closed || ring.length < 4) throw new Error('MASK_BOUNDARY_LOOP_INVALID');
		const simplified = simplifyClosedRing(ring, simplificationTolerancePx);
		const area = signedArea(simplified);
		if (area > 0) outerRings.push(simplified);
		else holeRings.push(simplified);
	}

	const polygons: MaskPolygonV1[] = outerRings.map((outer) => ({ outer, holes: [] }));
	for (const hole of holeRings) {
		const containers = polygons.filter(({ outer }) => pointInPolygon(hole[0]!, outer))
			.sort((a, b) => Math.abs(signedArea(a.outer)) - Math.abs(signedArea(b.outer)));
		const container = containers[0];
		if (!container) throw new Error('MASK_HOLE_WITHOUT_EXTERIOR');
		container.holes.push(hole);
	}
	return { ...resultBase, boundaryEdgeCount: edges.length, status: 'COMPILED', polygons };
}
