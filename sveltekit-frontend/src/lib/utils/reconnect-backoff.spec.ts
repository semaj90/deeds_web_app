// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEventDeduper, reconnectDelayMs } from './reconnect-backoff';

describe('reconnectDelayMs (full jitter, floor, cap)', () => {
	it('is uniform within [minMs, min(capMs, base * 2^attempt)]', () => {
		const lo = (a: number) => reconnectDelayMs(a, { baseMs: 1000, capMs: 30_000, minMs: 250, random: () => 0 });
		const hi = (a: number) => reconnectDelayMs(a, { baseMs: 1000, capMs: 30_000, minMs: 250, random: () => 0.999999 });
		expect(lo(0)).toBe(250); // the floor: jitter can never create a tight retry loop
		expect(hi(0)).toBe(999);
		expect(hi(3)).toBe(7999); // 8000 ceiling
		expect(hi(5)).toBe(29_999); // 32000 capped to 30000
		expect(hi(50)).toBeLessThan(30_000); // exponent is bounded
	});

	it('spreads clients out instead of retrying in lockstep', () => {
		let i = 0;
		const draws = [0.1, 0.4, 0.7, 0.95];
		const delays = draws.map(() => reconnectDelayMs(4, { random: () => draws[i++] }));
		expect(new Set(delays).size).toBe(4);
		for (const d of delays) {
			expect(d).toBeGreaterThanOrEqual(250);
			expect(d).toBeLessThanOrEqual(16_000);
		}
	});

	it('treats negative or fractional attempts safely', () => {
		expect(reconnectDelayMs(-3, { random: () => 0.999 })).toBeLessThanOrEqual(1000);
		expect(reconnectDelayMs(2.9, { random: () => 0.999 })).toBeLessThanOrEqual(4000);
	});
});

describe('createEventDeduper (bounded window)', () => {
	it('reports a repeated id once seen, and never flags missing ids', () => {
		const d = createEventDeduper();
		expect(d.isDuplicate('a')).toBe(false);
		expect(d.isDuplicate('a')).toBe(true);
		expect(d.isDuplicate(undefined)).toBe(false);
		expect(d.isDuplicate(null)).toBe(false);
		expect(d.isDuplicate('')).toBe(false);
	});

	it('evicts the oldest id once the window is full', () => {
		const d = createEventDeduper(3);
		['1', '2', '3', '4'].forEach((id) => d.isDuplicate(id)); // '1' evicted
		expect(d.isDuplicate('4')).toBe(true);
		expect(d.isDuplicate('1')).toBe(false); // forgotten, so it counts as new again
	});

	it('clear() forgets everything', () => {
		const d = createEventDeduper();
		d.isDuplicate('x');
		d.clear();
		expect(d.isDuplicate('x')).toBe(false);
	});
});
