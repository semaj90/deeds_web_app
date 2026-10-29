// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CAMERA_PRESETS, COLS, COURTROOM_GRID, ROOM, ROWS, STATIONS, cameraPosition, cellToWorld, findPath, inRoom, isWalkable, positionLog, renderAscii, resolveWalkPath, worldToCell,
} from './courtroom-floorplan-v1.js';

const sceneSource = readFileSync(join(process.cwd(), 'src/lib/courtroom/courtroom-scene.svelte.ts'), 'utf8');
const evalPi = (expr: string) => Number(Function(`const Math_PI = Math.PI; return (${expr.replace(/Math\.PI/g, 'Math_PI')});`)());

describe('floor plan stays in step with the scene', () => {
	it('stations match STATIONS in the scene source', () => {
		const block = sceneSource.match(/const STATIONS[^{]*\{([\s\S]*?)\n\};/)![1];
		for (const m of block.matchAll(/(\w+):\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*[-\d.]+,\s*z:\s*(-?[\d.]+)\s*\}/g)) {
			const s = STATIONS.find((st) => st.role === m[1] && st.inScene);
			expect(s, `station ${m[1]} missing from the floor plan`).toBeDefined();
			expect([s!.x, s!.z]).toEqual([Number(m[2]), Number(m[3])]);
		}
	});

	it('camera presets match CAMERA_PRESETS in the scene source', () => {
		const block = sceneSource.match(/const CAMERA_PRESETS[^{]*\{([\s\S]*?)\n\};/)![1];
		let found = 0;
		for (const m of block.matchAll(/(\w+):\s*\{\s*alpha:\s*([^,]+),\s*beta:\s*([^,]+),\s*radius:\s*([\d.]+),\s*target:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g)) {
			const p = CAMERA_PRESETS[m[1] as keyof typeof CAMERA_PRESETS];
			expect(p, m[1]).toBeDefined();
			expect(p.alpha).toBeCloseTo(evalPi(m[2]), 6);
			expect(p.beta).toBeCloseTo(evalPi(m[3]), 6);
			expect(p.radius).toBe(Number(m[4]));
			expect(p.target).toEqual({ x: Number(m[5]), y: Number(m[6]), z: Number(m[7]) });
			found++;
		}
		expect(found).toBe(5);
	});
});

describe('grid', () => {
	it('has the documented size and coordinate round trip', () => {
		expect([COLS, ROWS, COURTROOM_GRID.length, COURTROOM_GRID[0].length]).toEqual([40, 32, 32, 40]);
		const c = worldToCell(4, 1.3);
		const w = cellToWorld(c.col, c.row);
		expect(Math.abs(w.x - 4)).toBeLessThanOrEqual(0.25);
		expect(Math.abs(w.z - 1.3)).toBeLessThanOrEqual(0.25);
	});

	it('blocks the tables, desk and pews, and lets people stand on the bench and witness stand', () => {
		expect(isWalkable(4, 0)).toBe(false); // prosecution table
		expect(isWalkable(-4, 0)).toBe(false); // defense table
		expect(isWalkable(0, -5.5)).toBe(false); // bench desk
		expect(isWalkable(-7.5, 4.1)).toBe(false); // first pew
		expect(isWalkable(0, -6.5)).toBe(true); // judge on the platform
		expect(isWalkable(2, -3)).toBe(true); // witness on the stand
		expect(isWalkable(0, 1)).toBe(true); // open well
		expect(isWalkable(11, 0)).toBe(false); // outside the room
	});

	it('puts every in-scene station on a walkable cell inside the room', () => {
		for (const s of STATIONS) {
			expect(inRoom(s.x, s.z), s.role).toBe(true);
			expect(isWalkable(s.x, s.z), s.role).toBe(true);
		}
	});

	it('keeps every camera behind the back wall line and between the side walls (the old negative-alpha bug put it outside the back wall)', () => {
		for (const [view, preset] of Object.entries(CAMERA_PRESETS)) {
			const p = cameraPosition(preset);
			expect(p.z, `${view} camera z`).toBeGreaterThan(ROOM.minZ);
			expect(Math.abs(p.x), `${view} camera x`).toBeLessThanOrEqual(ROOM.maxX);
			expect(p.y).toBeGreaterThan(0);
		}
	});

	it('records which cameras sit past the gallery edge, where the room has no wall (the wide shot is there)', () => {
		const outside = Object.entries(CAMERA_PRESETS).filter(([, c]) => !inRoom(cameraPosition(c).x, cameraPosition(c).z)).map(([v]) => v);
		expect(outside).toEqual(['wide']);
	});
});

describe('findPath', () => {
	it('walks the witness to the bench around the tables and desk, on walkable cells only', () => {
		const path = findPath({ x: 2, z: -3 }, { x: 0, z: -6.5 })!;
		expect(path).not.toBeNull();
		expect(path[0]).toMatchObject({ x: 2, z: -3 });
		expect(path[path.length - 1]).toMatchObject({ x: 0, z: -6.5 });
		for (let i = 1; i < path.length; i++) {
			for (let t = 0; t <= 1; t += 0.1) expect(isWalkable(path[i - 1].x + (path[i].x - path[i - 1].x) * t, path[i - 1].z + (path[i].z - path[i - 1].z) * t)).toBe(true);
		}
	});

	it('routes the gallery to the well through the end gates, not through the railing', () => {
		const path = findPath({ x: -9.5, z: 7 }, { x: 0, z: 1.5 })!;
		expect(path).not.toBeNull();
		expect(path.some((p) => Math.abs(p.x) > 9)).toBe(true); // squeezes past a gate at x = +/-9 .. 10
	});

	it('returns null for blocked or outside targets instead of throwing', () => {
		expect(findPath({ x: 0, z: 1 }, { x: 4, z: 0 })).toBeNull();
		expect(findPath({ x: 0, z: 1 }, { x: 50, z: 50 })).toBeNull();
		expect(findPath({ x: NaN, z: 1 }, { x: 0, z: 1 })).toBeNull();
	});
});

describe('resolveWalkPath', () => {
	it('discards caller-supplied intermediate points and finds a safe route to the destination', () => {
		const path = resolveWalkPath({ x: 0, z: 1 }, [{ x: 4, z: 0 }, { x: 2, z: -3 }]);
		expect(path).not.toBeNull();
		expect(path?.[0]).toMatchObject({ x: 0, z: 1 });
		expect(path?.at(-1)).toMatchObject({ x: 2, z: -3 });
		expect(path?.some((point) => !isWalkable(point.x, point.z))).toBe(false);
	});

	it('rejects blocked destinations, invalid positions, and unbounded waypoint lists', () => {
		expect(resolveWalkPath({ x: 0, z: 1 }, [{ x: 0, z: 1 }, { x: 4, z: 0 }])).toBeNull();
		expect(resolveWalkPath({ x: Number.NaN, z: 1 }, [{ x: 0, z: 1 }, { x: 2, z: -3 }])).toBeNull();
		expect(resolveWalkPath({ x: 0, z: 1 }, Array.from({ length: 129 }, () => ({ x: 0, z: 1 })))).toBeNull();
	});
});

describe('logs', () => {
	it('logs every station and camera with world and grid coordinates', () => {
		const log = positionLog();
		expect(log.filter((e) => e.kind === 'station').length).toBe(STATIONS.length);
		expect(log.filter((e) => e.kind === 'camera').length).toBe(5);
		expect(log.filter((e) => e.kind === 'station').every((e) => e.inRoom)).toBe(true);
		expect(log.find((e) => e.id === 'judge')!.cell).toEqual(worldToCell(0, -6.5));
	});

	it('renders a 32 x 40 text map with each station letter present', () => {
		const rows = renderAscii().split('\n');
		expect(rows.length).toBe(32);
		expect(rows.every((r) => r.length === 40)).toBe(true);
		const flat = rows.join('');
		for (const ch of ['J', 'W', 'P', 'D', 'd', 'N', 'C', '#', '^']) expect(flat.includes(ch), ch).toBe(true);
	});
});
