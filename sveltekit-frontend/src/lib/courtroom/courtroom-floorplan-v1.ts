/**
 * The courtroom as a 2D grid: who stands where, which cells can be walked, where the camera sits, and a path finder for
 * "move to the bench". Renderer-independent; the numbers mirror `courtroom-scene.svelte.ts` (STATIONS, CAMERA_PRESETS,
 * the prop boxes in createCourtroom), and a spec reads the scene source to fail if either side drifts.
 *
 * World axes (Babylon): x runs left to right as seen from the gallery, z runs from the back wall (-8, behind the judge)
 * to the gallery (+8), y is height and is ignored by the grid. Grid cell (col, row): col = floor((x + 10) / cell),
 * row = floor((z + 8) / cell), so row 0 is the back wall and row 31 the gallery side at the default 0.5 m cell.
 *
 * Cell values: 0 = open floor, 1 = blocked prop, 2 = standable platform (judge's bench, witness stand: walkable here
 * because the grid has no height). Defendant and user seats are proposals (the scene has no model for either yet).
 */
export const ROOM = { minX: -10, maxX: 10, minZ: -8, maxZ: 8 } as const;
export const CELL = 0.5;
export const COLS = Math.round((ROOM.maxX - ROOM.minX) / CELL);
export const ROWS = Math.round((ROOM.maxZ - ROOM.minZ) / CELL);

export type CellValue = 0 | 1 | 2;
export interface Box { id: string; x: number; z: number; width: number; depth: number; kind: 'blocked' | 'platform'; /** Standing height for a platform (metres). */ height?: number }

/** Props from the scene (centre x, z and footprint). The bench desk sits on the platform; the gallery pews are rows of 7. */
export const PROPS: readonly Box[] = [
	{ id: 'benchPlatform', x: 0, z: -6.5, width: 8, depth: 3, kind: 'platform', height: 1.8 },
	{ id: 'benchDesk', x: 0, z: -5.5, width: 7, depth: 1.5, kind: 'blocked' },
	{ id: 'prosTable', x: 4, z: 0, width: 3, depth: 1.5, kind: 'blocked' },
	{ id: 'defTable', x: -4, z: 0, width: 3, depth: 1.5, kind: 'blocked' },
	{ id: 'witnessBox', x: 2, z: -3, width: 2, depth: 2, kind: 'platform', height: 1.0 },
	// The gallery railing is 18 wide in a 20 wide room, leaving a 1 m gate at each end.
	{ id: 'railing', x: 0, z: 3, width: 18, depth: 0.15, kind: 'blocked' },
	...Array.from({ length: 4 }, (_, row) =>
		Array.from({ length: 7 }, (_, seat): Box => ({ id: `pew_${row}_${seat}`, x: -7.5 + seat * 2.5, z: 4.1 + row * 1.35, width: 2.1, depth: 0.55, kind: 'blocked' })),
	).flat(),
];

export type SeatRole = 'judge' | 'prosecutor' | 'defense' | 'witness' | 'defendant' | 'user' | 'narrator';
export interface Station { role: SeatRole; x: number; z: number; label: string; inScene: boolean }

export const STATIONS: readonly Station[] = [
	{ role: 'judge', x: 0, z: -6.5, label: "judge, on the bench platform", inScene: true },
	{ role: 'witness', x: 2, z: -3, label: 'witness, on the stand', inScene: true },
	{ role: 'prosecutor', x: 4, z: 1.3, label: 'prosecution counsel, behind the table', inScene: true },
	{ role: 'defense', x: -4, z: 1.3, label: 'defense counsel, behind the table', inScene: true },
	{ role: 'narrator', x: 0, z: 2, label: 'narrator, in the well', inScene: true },
	// Proposed: the defendant sits beside defense counsel; the user plays the prosecution, so the user's seat is the
	// prosecutor's station and the camera follows them.
	{ role: 'defendant', x: -5.6, z: 1.3, label: 'defendant, beside defense counsel (proposed)', inScene: false },
	{ role: 'user', x: 4, z: 1.3, label: 'you, at the prosecution table (same cell as the prosecutor)', inScene: false },
];

export type View = 'prosecution' | 'defense' | 'judge' | 'witness' | 'wide';
export interface CameraPreset { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } }
export const CAMERA_PRESETS: Record<View, CameraPreset> = {
	prosecution: { alpha: Math.PI * 0.65, beta: Math.PI * 0.38, radius: 8, target: { x: 4, y: 1.2, z: 0 } },
	defense: { alpha: Math.PI * 0.35, beta: Math.PI * 0.38, radius: 8, target: { x: -4, y: 1.2, z: 0 } },
	judge: { alpha: Math.PI * 0.5, beta: Math.PI * 0.3, radius: 9, target: { x: 0, y: 2.5, z: -6 } },
	witness: { alpha: Math.PI * 0.55, beta: Math.PI * 0.38, radius: 7, target: { x: 2, y: 1.2, z: -3 } },
	wide: { alpha: Math.PI * 0.5, beta: Math.PI * 0.35, radius: 14, target: { x: 0, y: 1.5, z: -2 } },
};

/** Babylon ArcRotateCamera position for a preset. */
export function cameraPosition(p: CameraPreset): { x: number; y: number; z: number } {
	return {
		x: p.target.x + p.radius * Math.cos(p.alpha) * Math.sin(p.beta),
		y: p.target.y + p.radius * Math.cos(p.beta),
		z: p.target.z + p.radius * Math.sin(p.alpha) * Math.sin(p.beta),
	};
}

export const worldToCell = (x: number, z: number): { col: number; row: number } => ({
	col: Math.floor((x - ROOM.minX) / CELL),
	row: Math.floor((z - ROOM.minZ) / CELL),
});
export const cellToWorld = (col: number, row: number): { x: number; z: number } => ({
	x: ROOM.minX + (col + 0.5) * CELL,
	z: ROOM.minZ + (row + 0.5) * CELL,
});
export const inRoom = (x: number, z: number): boolean => x >= ROOM.minX && x <= ROOM.maxX && z >= ROOM.minZ && z <= ROOM.maxZ;

/**
 * Rasterise the props. A thick prop blocks a cell when it covers more than half a cell (0.25 m) in both directions (so a
 * person standing 0.25 m from a desk edge is not blocked by it); a prop thinner than a cell (the railing) always blocks
 * the cells it touches, otherwise a path could slip through it.
 */
export function buildGrid(props: readonly Box[] = PROPS): CellValue[][] {
	const grid: CellValue[][] = Array.from({ length: ROWS }, () => Array<CellValue>(COLS).fill(0));
	const overlap = (lo: number, hi: number, cellLo: number) => Math.max(0, Math.min(hi, cellLo + CELL) - Math.max(lo, cellLo));
	const paint = (b: Box, value: CellValue) => {
		const thin = b.width < CELL || b.depth < CELL;
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				const ox = overlap(b.x - b.width / 2, b.x + b.width / 2, ROOM.minX + c * CELL);
				const oz = overlap(b.z - b.depth / 2, b.z + b.depth / 2, ROOM.minZ + r * CELL);
				const covered = thin ? ox > 0 && oz > 0 : ox > CELL / 2 && oz > CELL / 2;
				if (covered) grid[r][c] = value;
			}
		}
	};
	for (const b of props) if (b.kind === 'platform') paint(b, 2);
	for (const b of props) if (b.kind === 'blocked') paint(b, 1); // blocked props win over the platform they sit on
	return grid;
}

/** Floor height at a point: the platform under it, else 0. The grid itself ignores height; paths carry it. */
export function heightAt(x: number, z: number): number {
	let h = 0;
	for (const b of PROPS) {
		if (b.kind === 'platform' && Math.abs(x - b.x) <= b.width / 2 && Math.abs(z - b.z) <= b.depth / 2) h = Math.max(h, b.height ?? 0);
	}
	return h;
}

/** Station ids a story `move` cue may name (the user shares the prosecutor's seat, so it is not a destination). */
export const STATION_IDS: readonly string[] = STATIONS.filter((s) => s.role !== 'user').map((s) => s.role);
export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.role === id);

export const COURTROOM_GRID: readonly (readonly CellValue[])[] = buildGrid();

export const isWalkableCell = (col: number, row: number, grid: readonly (readonly CellValue[])[] = COURTROOM_GRID): boolean =>
	col >= 0 && row >= 0 && col < COLS && row < ROWS && grid[row][col] !== 1;
export const isWalkable = (x: number, z: number, grid: readonly (readonly CellValue[])[] = COURTROOM_GRID): boolean => {
	if (!inRoom(x, z)) return false;
	const { col, row } = worldToCell(x, z);
	return isWalkableCell(Math.min(col, COLS - 1), Math.min(row, ROWS - 1), grid);
};

/** A* over the grid (8 neighbours, no corner cutting), then line-of-sight smoothing. Returns world waypoints or null. */
export function findPath(
	from: { x: number; z: number },
	to: { x: number; z: number },
	grid: readonly (readonly CellValue[])[] = COURTROOM_GRID,
): Array<{ x: number; y: number; z: number }> | null {
	if (!isWalkable(from.x, from.z, grid) || !isWalkable(to.x, to.z, grid)) return null;
	const s = worldToCell(from.x, from.z);
	const g = worldToCell(to.x, to.z);
	const key = (c: number, r: number) => r * COLS + c;
	const open = new Map<number, { c: number; r: number; g: number; f: number }>();
	const best = new Map<number, number>();
	const parent = new Map<number, number>();
	const h = (c: number, r: number) => Math.hypot(c - g.col, r - g.row);
	open.set(key(s.col, s.row), { c: s.col, r: s.row, g: 0, f: h(s.col, s.row) });
	best.set(key(s.col, s.row), 0);
	while (open.size) {
		let cur: { c: number; r: number; g: number; f: number } | null = null;
		let curKey = -1;
		for (const [k, n] of open) if (!cur || n.f < cur.f) { cur = n; curKey = k; }
		if (!cur) break;
		open.delete(curKey);
		if (cur.c === g.col && cur.r === g.row) {
			const cells: number[] = [curKey];
			while (parent.has(cells[cells.length - 1])) cells.push(parent.get(cells[cells.length - 1])!);
			cells.reverse();
			const pts = cells.map((k) => cellToWorld(k % COLS, Math.floor(k / COLS)));
			if (pts.length === 1) return [{ x: to.x, y: heightAt(to.x, to.z), z: to.z }]; // start and goal share a cell: already there
			pts[0] = { x: from.x, z: from.z };
			pts[pts.length - 1] = { x: to.x, z: to.z };
			return smooth(pts, grid).map((p) => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z }));
		}
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				if (!dc && !dr) continue;
				const nc = cur.c + dc, nr = cur.r + dr;
				if (!isWalkableCell(nc, nr, grid)) continue;
				if (dc && dr && (!isWalkableCell(cur.c + dc, cur.r, grid) || !isWalkableCell(cur.c, cur.r + dr, grid))) continue;
				const ng = cur.g + (dc && dr ? Math.SQRT2 : 1);
				const nk = key(nc, nr);
				if (ng >= (best.get(nk) ?? Infinity)) continue;
				best.set(nk, ng);
				parent.set(nk, curKey);
				open.set(nk, { c: nc, r: nr, g: ng, f: ng + h(nc, nr) });
			}
		}
	}
	return null;
}

export function resolveWalkPath(
	from: { x: number; z: number },
	requestedWaypoints: readonly { x: number; z: number }[],
): Array<{ x: number; y: number; z: number }> | null {
	if (requestedWaypoints.length < 2 || requestedWaypoints.length > 128) return null;
	if (!Number.isFinite(from.x) || !Number.isFinite(from.z)) return null;
	const destination = requestedWaypoints[requestedWaypoints.length - 1];
	if (!Number.isFinite(destination.x) || !Number.isFinite(destination.z)) return null;
	return findPath(from, destination);
}

function clearLine(a: { x: number; z: number }, b: { x: number; z: number }, grid: readonly (readonly CellValue[])[]): boolean {
	const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 4)) || 1;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		if (!isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, grid)) return false;
	}
	return true;
}

function smooth(pts: Array<{ x: number; z: number }>, grid: readonly (readonly CellValue[])[]): Array<{ x: number; z: number }> {
	const out = [pts[0]];
	let anchor = 0;
	for (let i = 2; i < pts.length; i++) {
		if (!clearLine(pts[anchor], pts[i], grid)) { out.push(pts[i - 1]); anchor = i - 1; }
	}
	out.push(pts[pts.length - 1]);
	return out;
}

export type PathCheck = { ok: true } | { ok: false; reason: 'TOO_FEW_POINTS' | 'NON_FINITE_POINT' | 'OUTSIDE_ROOM' | 'BLOCKED'; at: number };

/**
 * Check a waypoint list against the grid before anything walks it: at least two finite points, every point and every
 * stretch between them (sampled each 12.5 cm) inside the room and not on a blocked cell. The walker's own starting
 * point is exempt, because a character standing a few centimetres inside a table edge must still be able to leave it.
 */
export function validatePath(points: ReadonlyArray<{ x: number; z: number }>, grid: readonly (readonly CellValue[])[] = COURTROOM_GRID): PathCheck {
	if (points.length < 2) return { ok: false, reason: 'TOO_FEW_POINTS', at: 0 };
	for (let i = 0; i < points.length; i++) {
		if (!Number.isFinite(points[i].x) || !Number.isFinite(points[i].z)) return { ok: false, reason: 'NON_FINITE_POINT', at: i };
	}
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1], b = points[i];
		const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 4)));
		for (let k = i === 1 ? 1 : 0; k <= steps; k++) {
			const t = k / steps;
			const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
			if (!inRoom(x, z)) return { ok: false, reason: 'OUTSIDE_ROOM', at: i };
			if (!isWalkable(x, z, grid)) return { ok: false, reason: 'BLOCKED', at: i };
		}
	}
	return { ok: true };
}

/** One row per actor, camera and prop of interest: the coordinate log the story and the UI share. */
export interface PositionLogEntry { id: string; kind: 'station' | 'camera'; world: { x: number; y: number; z: number }; cell: { col: number; row: number }; inRoom: boolean; walkable: boolean; note: string }
export function positionLog(): PositionLogEntry[] {
	const entries: PositionLogEntry[] = STATIONS.map((s) => ({
		id: s.role, kind: 'station', world: { x: s.x, y: 0, z: s.z }, cell: worldToCell(s.x, s.z), inRoom: inRoom(s.x, s.z), walkable: isWalkable(s.x, s.z), note: s.label,
	}));
	for (const [view, preset] of Object.entries(CAMERA_PRESETS)) {
		const p = cameraPosition(preset);
		entries.push({ id: `camera:${view}`, kind: 'camera', world: p, cell: worldToCell(p.x, p.z), inRoom: inRoom(p.x, p.z), walkable: isWalkable(p.x, p.z), note: `looks at (${preset.target.x}, ${preset.target.z})` });
	}
	return entries;
}

/** Text map for logs: `#` blocked, `^` platform, `.` floor, letters for stations (J judge, W witness, P prosecutor, D defense, d defendant, N narrator), `C` camera cells inside the room. */
export function renderAscii(grid: readonly (readonly CellValue[])[] = COURTROOM_GRID): string {
	const rows: string[][] = grid.map((r) => r.map((v) => (v === 1 ? '#' : v === 2 ? '^' : '.')));
	const mark = (x: number, z: number, ch: string) => {
		if (!inRoom(x, z)) return;
		const { col, row } = worldToCell(x, z);
		if (row >= 0 && row < ROWS && col >= 0 && col < COLS) rows[row][col] = ch;
	};
	for (const s of STATIONS) {
		const ch = { judge: 'J', witness: 'W', prosecutor: 'P', defense: 'D', defendant: 'd', narrator: 'N', user: 'P' }[s.role];
		mark(s.x, s.z, ch);
	}
	for (const preset of Object.values(CAMERA_PRESETS)) {
		const p = cameraPosition(preset);
		mark(p.x, p.z, 'C');
	}
	return rows.map((r) => r.join('')).join('\n');
}
