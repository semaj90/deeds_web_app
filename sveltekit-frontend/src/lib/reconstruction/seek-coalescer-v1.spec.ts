import { describe, expect, it } from 'vitest';
import { createSeekCoalescerV1 } from './seek-coalescer-v1.js';

describe('seek coalescer v1 (CASE-SCENE-LIVE-03)', () => {
	it('dispatches the first request immediately', () => {
		const c = createSeekCoalescerV1();
		expect(c.request(1000)).toBe(1000);
		expect(c.inFlight).toBe(true);
	});

	it('retains only the latest target while a seek is in flight', () => {
		const c = createSeekCoalescerV1();
		c.request(1000);
		expect(c.request(1100)).toBeNull();
		expect(c.request(1200)).toBeNull();
		expect(c.request(1300)).toBeNull();
		expect(c.pending).toBe(1300);
	});

	it('dispatches only the latest retained target on acknowledge, then goes idle', () => {
		const c = createSeekCoalescerV1();
		c.request(1000);
		c.request(1100);
		c.request(1300);
		expect(c.acknowledge()).toBe(1300);
		expect(c.pending).toBeNull();
		expect(c.inFlight).toBe(true);
		expect(c.acknowledge()).toBeNull();
		expect(c.inFlight).toBe(false);
	});

	it('returns null when acknowledging with nothing in flight', () => {
		const c = createSeekCoalescerV1();
		expect(c.acknowledge()).toBeNull();
	});

	it('cancel drops in-flight and pending state', () => {
		const c = createSeekCoalescerV1();
		c.request(1000);
		c.request(2000);
		c.cancel();
		expect(c.inFlight).toBe(false);
		expect(c.pending).toBeNull();
		expect(c.request(500)).toBe(500);
	});

	it('rejects non-finite and negative times', () => {
		const c = createSeekCoalescerV1();
		expect(() => c.request(Number.NaN)).toThrow(RangeError);
		expect(() => c.request(-1)).toThrow(RangeError);
		expect(() => c.request(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(c.inFlight).toBe(false);
	});
});
