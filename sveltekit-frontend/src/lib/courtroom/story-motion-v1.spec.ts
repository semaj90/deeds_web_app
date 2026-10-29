// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildWalkPath } from './walk-path-v1.js';
import { CueTracker } from './cue-tracker-v1.js';

afterEach(() => vi.useRealTimers());

describe('buildWalkPath', () => {
	const route = [
		{ x: 0, y: 0, z: 5 },
		{ x: -2, y: 0, z: 2 },
		{ x: -1, y: 0, z: -1 },
		{ x: 2, y: 0, z: -4 },
	];

	it('starts and ends exactly on the first and last waypoint', () => {
		const p = buildWalkPath(route);
		expect(p.at(0)).toMatchObject({ x: 0, z: 5 });
		const end = p.at(p.length);
		expect(end.x).toBeCloseTo(2, 6);
		expect(end.z).toBeCloseTo(-4, 6);
		expect(p.at(p.length + 100)).toEqual(end);
		expect(p.at(-5)).toEqual(p.at(0));
	});

	it('advances monotonically at constant arc-length speed', () => {
		const p = buildWalkPath(route);
		const step = p.length / 50;
		let prev = p.at(0);
		for (let i = 1; i <= 50; i++) {
			const cur = p.at(i * step);
			const d = Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z);
			expect(d).toBeGreaterThan(step * 0.5);
			expect(d).toBeLessThan(step * 1.5);
			prev = cur;
		}
	});

	it('faces the direction of travel (+Z forward, heading = atan2(dx, dz))', () => {
		const straightPlusX = buildWalkPath([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]);
		expect(straightPlusX.at(1).heading).toBeCloseTo(Math.PI / 2, 6);
		const straightMinusZ = buildWalkPath([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -4 }]);
		expect(Math.abs(straightMinusZ.at(1).heading)).toBeCloseTo(Math.PI, 6);
	});

	it('rejects too few or non-finite waypoints', () => {
		expect(() => buildWalkPath([{ x: 0, y: 0, z: 0 }])).toThrow('WALK_PATH_NEEDS_TWO_WAYPOINTS');
		expect(() => buildWalkPath([{ x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 1 }])).toThrow('WALK_PATH_NON_FINITE_WAYPOINT');
	});
});

describe('CueTracker', () => {
	it('resolves finished when settled', async () => {
		const t = new CueTracker();
		const p = t.begin('judge', 1000);
		expect(t.isPending('judge')).toBe(true);
		expect(t.settle('judge', 'finished')).toBe(true);
		await expect(p).resolves.toBe('finished');
		expect(t.isPending('judge')).toBe(false);
		expect(t.settle('judge', 'finished')).toBe(false);
	});

	it('interrupts the previous cue for the same key', async () => {
		const t = new CueTracker();
		const first = t.begin('witness', 1000);
		const second = t.begin('witness', 1000);
		await expect(first).resolves.toBe('interrupted');
		t.settle('witness', 'finished');
		await expect(second).resolves.toBe('finished');
	});

	it('times out so a clip that never reports cannot stall the story', async () => {
		vi.useFakeTimers();
		const t = new CueTracker();
		const p = t.begin('defense', 500);
		vi.advanceTimersByTime(500);
		await expect(p).resolves.toBe('timeout');
		expect(t.isPending('defense')).toBe(false);
	});

	it('settleAll releases every awaiter', async () => {
		const t = new CueTracker();
		const a = t.begin('a', 1000);
		const b = t.begin('b', 1000);
		t.settleAll();
		await expect(Promise.all([a, b])).resolves.toEqual(['interrupted', 'interrupted']);
	});
});
