/**
 * Renderer-independent walking path: a Catmull-Rom spline through waypoints, sampled into an arc-length table so an
 * actor advances at constant speed. The scene applies `at(distance)` each frame; the story engine only supplies
 * waypoints (checked against walkable floor by the caller). Forward axis is +Z, heading = atan2(dx, dz).
 */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export interface PathSample extends Vec3 {
	/** Rotation about Y (radians) facing the direction of travel. */
	heading: number;
}

export interface WalkPath {
	length: number;
	at(distance: number): PathSample;
}

function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
	const t2 = t * t;
	const t3 = t2 * t;
	const f = (a: number, b: number, c: number, d: number) =>
		0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
	return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

export function buildWalkPath(waypoints: readonly Vec3[], samplesPerSegment = 12): WalkPath {
	if (waypoints.length < 2) throw new Error('WALK_PATH_NEEDS_TWO_WAYPOINTS');
	for (const w of waypoints) {
		if (![w.x, w.y, w.z].every(Number.isFinite)) throw new Error('WALK_PATH_NON_FINITE_WAYPOINT');
	}
	const pts: Vec3[] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		const p0 = waypoints[Math.max(0, i - 1)];
		const p1 = waypoints[i];
		const p2 = waypoints[i + 1];
		const p3 = waypoints[Math.min(waypoints.length - 1, i + 2)];
		for (let s = 0; s < samplesPerSegment; s++) pts.push(catmull(p0, p1, p2, p3, s / samplesPerSegment));
	}
	pts.push({ ...waypoints[waypoints.length - 1] });

	const cumulative = [0];
	for (let i = 1; i < pts.length; i++) {
		cumulative.push(cumulative[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
	}
	const length = cumulative[cumulative.length - 1];
	let lastHeading = 0;

	return {
		length,
		at(distance: number): PathSample {
			const d = Math.min(Math.max(distance, 0), length);
			let i = 1;
			while (i < cumulative.length - 1 && cumulative[i] < d) i++;
			const seg = cumulative[i] - cumulative[i - 1];
			const t = seg > 0 ? (d - cumulative[i - 1]) / seg : 0;
			const a = pts[i - 1];
			const b = pts[i];
			const dx = b.x - a.x;
			const dz = b.z - a.z;
			if (dx * dx + dz * dz > 1e-10) lastHeading = Math.atan2(dx, dz);
			return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading: lastHeading };
		},
	};
}

/**
 * Turn a character to face `heading` (radians about Y, 0 = facing +Z) while keeping the root's own base rotation. The glTF
 * loader puts a 180 degree turn on every imported root (with a z mirror) to fix handedness, so the root's rotation must
 * be composed with the heading, never replaced by it: replacing it left characters facing 180 degrees the wrong way.
 * Quaternions are [x, y, z, w]; the result applies `base` first, then the yaw about the world Y axis.
 */
export function composeYaw(heading: number, base: readonly [number, number, number, number] = [0, 0, 0, 1]): [number, number, number, number] {
	const h = Number.isFinite(heading) ? heading : 0;
	const [yx, yy, yz, yw] = [0, Math.sin(h / 2), 0, Math.cos(h / 2)];
	const [bx, by, bz, bw] = base;
	return [
		yw * bx + yx * bw + yy * bz - yz * by,
		yw * by - yx * bz + yy * bw + yz * bx,
		yw * bz + yx * by - yy * bx + yz * bw,
		yw * bw - yx * bx - yy * by - yz * bz,
	];
}
