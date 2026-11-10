import { afterEach, describe, expect, it } from 'vitest';
import {
	clearSimdjsonCache,
	fastJsonParse,
	fastJsonParseWithBackend,
	fastJsonValidate,
	getSimdStats,
	getSimdjsonCacheStats,
	isSimdJsonAvailable,
} from './simdjson-bridge.js';

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

	it('reuses the cache entry for identical JSON input and differentiates distinct payloads under SHA-256', () => {
		const firstInput = JSON.stringify({ payload: 'a'.repeat(1024) });
		const secondInput = `${firstInput.slice(0, 65)}b${firstInput.slice(66)}`;

		const firstResult = fastJsonParseWithBackend(firstInput);
		const firstStats = getSimdjsonCacheStats();
		expect(firstStats.entries).toBe(1);

		// Re-parsing firstInput hits cache (no new entry)
		const cachedResult = fastJsonParseWithBackend(firstInput);
		expect(cachedResult.backend).toBe('CACHE');
		expect(getSimdjsonCacheStats().entries).toBe(1);

		// Parsing secondInput creates a second distinct entry under SHA-256
		const secondResult = fastJsonParseWithBackend(secondInput);
		expect(secondResult.backend).not.toBe('CACHE');
		const secondStats = getSimdjsonCacheStats();
		expect(secondStats.entries).toBe(2);
		expect(secondStats.budgetUsedBytes).toBeGreaterThan(firstStats.budgetUsedBytes);
	});

	it('matches JSON.parse for multiline JSON containing Unicode and counts UTF-8 bytes', () => {
		const payload = JSON.stringify({ text: 'π😀'.repeat(400), records: [{ ok: true }, { ok: false }] }, null, 2);
		const before = getSimdStats().totalBytesParsed;
		const result = fastJsonParseWithBackend<Record<string, unknown>>(payload);

		expect(result.value).toEqual(JSON.parse(payload));
		expect(getSimdStats().totalBytesParsed - before).toBe(Buffer.byteLength(payload, 'utf8'));
		if (process.env.SIMDJSON_REQUIRE_NATIVE === '1') {
			expect(result.backend).toBe('SIMDJSON_NAPI');
		}
	});

	it('parses newline-delimited JSON records independently and rejects malformed records', () => {
		const lines = [
			JSON.stringify({ id: 1, text: 'π😀' }),
			JSON.stringify({ id: 2, text: 'line\nvalue' }),
		];
		const payload = `${lines.join('\n')}\n`;
		const parsed = payload.trimEnd().split('\n').map((line) => fastJsonParse(line));

		expect(parsed).toEqual(lines.map((line) => JSON.parse(line)));
		expect(() => fastJsonParse('{"id":3,}')).toThrow();
		expect(fastJsonValidate('{"id":3,}')).toBe(false);
	});

	it('counts native parse failures before falling back to V8 when the addon is available', () => {
		if (!isSimdJsonAvailable()) return;

		clearSimdjsonCache();
		const before = getSimdStats().nativeParseErrors;
		const malformedLargeJson = `{"payload":"${'x'.repeat(1100)}",}`;

		expect(() => fastJsonParseWithBackend(malformedLargeJson)).toThrow();
		expect(getSimdStats().nativeParseErrors - before).toBe(1);
	});

	it('enforces the input cap in UTF-8 bytes, not UTF-16 code units', () => {
		const payload = '\u0800'.repeat(Math.floor((64 * 1024 * 1024) / 3) + 1);

		expect(payload.length).toBeLessThan(64 * 1024 * 1024);
		expect(Buffer.byteLength(payload, 'utf8')).toBeGreaterThan(64 * 1024 * 1024);
		expect(() => fastJsonParseWithBackend(payload)).toThrow(RangeError);
	});
});
