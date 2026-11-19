import { describe, expect, it } from 'vitest';
import {
	PACKED_ASSET_BUDGET_BYTES_V1,
	createTileBudgetCacheV1,
	packedBudgetReportV1
} from './n64-tile-budget-cache-v1';

describe('createTileBudgetCacheV1', () => {
	it('evicts least recently used entries to stay under the byte budget', () => {
		const c = createTileBudgetCacheV1<string>(100);
		c.put('a', 'A', 40);
		c.put('b', 'B', 40);
		expect(c.get('a')).toBe('A'); // a is now most recently used
		c.put('c', 'C', 40); // needs 40 more: evicts b (LRU), not a
		expect(c.has('b')).toBe(false);
		expect(c.get('a')).toBe('A');
		expect(c.get('c')).toBe('C');
		expect(c.stats().bytes).toBe(80);
		expect(c.stats().evictions).toBe(1);
	});

	it('never exceeds the budget', () => {
		const c = createTileBudgetCacheV1<number>(64);
		for (let i = 0; i < 50; i++) c.put(`k${i}`, i, 16);
		expect(c.stats().bytes).toBeLessThanOrEqual(64);
		expect(c.stats().count).toBe(4);
	});

	it('refuses a single entry larger than the whole budget without evicting anything', () => {
		const c = createTileBudgetCacheV1<string>(50);
		c.put('small', 'x', 10);
		expect(() => c.put('huge', 'y', 51)).toThrow('TILE_LARGER_THAN_BUDGET');
		expect(c.has('small')).toBe(true);
	});

	it('replacing a key keeps the byte total correct', () => {
		const c = createTileBudgetCacheV1<string>(100);
		c.put('a', 'one', 30);
		c.put('a', 'two', 50);
		expect(c.stats().bytes).toBe(50);
		expect(c.get('a')).toBe('two');
	});

	it('tracks hits, misses, and deletions', () => {
		const c = createTileBudgetCacheV1<string>(100);
		c.put('a', 'A', 10);
		c.get('a');
		c.get('missing');
		expect(c.stats()).toMatchObject({ hits: 1, misses: 1 });
		expect(c.delete('a')).toBe(true);
		expect(c.stats().bytes).toBe(0);
	});

	it('rejects invalid budgets and byte sizes', () => {
		expect(() => createTileBudgetCacheV1(0)).toThrow('TILE_BUDGET_MUST_BE_POSITIVE_INTEGER');
		expect(() => createTileBudgetCacheV1<string>(10).put('a', 'x', -1)).toThrow('TILE_BYTES_INVALID');
	});

	it('a 64x64 4bpp tile is 2048 bytes, so 4096 bytes holds two such tiles', () => {
		const tileBytes = (64 * 64) / 2;
		expect(tileBytes).toBe(2048);
		const c = createTileBudgetCacheV1<string>(4096);
		c.put('t1', 'a', tileBytes);
		c.put('t2', 'b', tileBytes);
		c.put('t3', 'c', tileBytes);
		expect(c.stats().count).toBe(2);
	});
});

describe('packedBudgetReportV1', () => {
	it('sums per category and reports the total against 8 MiB', () => {
		const r = packedBudgetReportV1([
			{ category: 'lowPolyGlbAndCharacters', bytes: 1_000_000 },
			{ category: 'indexedTexturesAndPalettes', bytes: 2048 },
			{ category: 'indexedTexturesAndPalettes', bytes: 2048 }
		]);
		expect(r.totalBytes).toBe(1_004_096);
		expect(r.budgetBytes).toBe(PACKED_ASSET_BUDGET_BYTES_V1);
		expect(r.withinTotalBudget).toBe(true);
		const tex = r.categories.find((c) => c.category === 'indexedTexturesAndPalettes');
		expect(tex?.bytes).toBe(4096);
		expect(tex?.withinBudget).toBe(true);
	});

	it('flags a category over its own budget even when the total fits', () => {
		const r = packedBudgetReportV1([{ category: 'animationAndFsmData', bytes: 600 * 1024 }]);
		const anim = r.categories.find((c) => c.category === 'animationAndFsmData');
		expect(anim?.withinBudget).toBe(false);
		expect(r.withinTotalBudget).toBe(true);
	});

	it('flags a total over 8 MiB', () => {
		const r = packedBudgetReportV1([{ category: 'optionalCompressedSpz', bytes: 9 * 1024 * 1024 }]);
		expect(r.withinTotalBudget).toBe(false);
	});

	it('rejects unknown categories and invalid byte counts', () => {
		expect(() => packedBudgetReportV1([{ category: 'nope' as never, bytes: 1 }])).toThrow('PACKED_ASSET_CATEGORY_UNKNOWN');
		expect(() => packedBudgetReportV1([{ category: 'metadataAndReserved', bytes: -5 }])).toThrow('PACKED_ASSET_BYTES_INVALID');
	});
});
