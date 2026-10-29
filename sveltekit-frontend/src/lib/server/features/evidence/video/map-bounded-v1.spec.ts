import { describe, expect, it } from 'vitest';
import { mapBoundedV1 } from './map-bounded-v1.js';

describe('mapBoundedV1', () => {
	it('preserves source order while respecting the concurrency bound', async () => {
		let active = 0;
		let peak = 0;
		const result = await mapBoundedV1([0, 1, 2, 3, 4, 5], 2, async (value) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 2 * (6 - value)));
			active -= 1;
			return value * 10;
		});

		expect(result).toEqual([0, 10, 20, 30, 40, 50]);
		expect(peak).toBe(2);
	});

	it('does not schedule queued work after a mapper fails', async () => {
		const started: number[] = [];
		await expect(mapBoundedV1([0, 1, 2, 3], 1, async (value) => {
			started.push(value);
			if (value === 1) throw new Error('embedding failed');
			return value;
		})).rejects.toThrow('embedding failed');
		expect(started).toEqual([0, 1]);
	});

	it('rejects invalid concurrency', async () => {
		await expect(mapBoundedV1([], 0, async (value: never) => value)).rejects.toThrow(RangeError);
	});
});
