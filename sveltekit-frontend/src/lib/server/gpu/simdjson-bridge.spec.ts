import { afterEach, describe, expect, it } from 'vitest';
import { clearSimdjsonCache, fastJsonParseWithBackend, getSimdjsonCacheStats } from './simdjson-bridge.js';

describe('simdjson bridge parse cache', () => {
	afterEach(() => clearSimdjsonCache());

	it('does not reuse a sampled-hash cache entry for different JSON input', () => {
		const firstInput = JSON.stringify({ payload: 'a'.repeat(1024) });
		const changedOffset = 65;
		const secondInput = `${firstInput.slice(0, changedOffset)}b${firstInput.slice(changedOffset + 1)}`;

		const firstResult = fastJsonParseWithBackend<{ payload: string }>(firstInput);
		const secondResult = fastJsonParseWithBackend<{ payload: string }>(secondInput);

		expect(secondResult.backend).not.toBe('CACHE');
		expect(secondResult.value).toEqual(JSON.parse(secondInput));
		expect(secondResult.value).not.toEqual(firstResult.value);
	});

	it('keeps the byte budget correct when replacing a colliding cache key', () => {
		const firstInput = JSON.stringify({ payload: 'a'.repeat(1024) });
		const secondInput = `${firstInput.slice(0, 65)}b${firstInput.slice(66)}`;

		fastJsonParseWithBackend(firstInput);
		const firstStats = getSimdjsonCacheStats();
		fastJsonParseWithBackend(secondInput);
		const secondStats = getSimdjsonCacheStats();
		fastJsonParseWithBackend(firstInput);
		const replacementStats = getSimdjsonCacheStats();

		expect(firstStats.entries).toBe(1);
		expect(secondStats.entries).toBe(1);
		expect(replacementStats.entries).toBe(1);
		expect(secondStats.budgetUsedBytes).toBe(firstStats.budgetUsedBytes);
		expect(replacementStats.budgetUsedBytes).toBe(firstStats.budgetUsedBytes);
	});
});
