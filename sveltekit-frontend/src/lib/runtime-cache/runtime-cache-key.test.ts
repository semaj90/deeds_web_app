import { describe, expect, it } from 'vitest';
import { buildRuntimeCacheKey, hashRuntimeCacheBody } from './runtime-cache-key';

describe('runtime cache keys', () => {
	it('hashes equivalent JSON bodies deterministically', async () => {
		const a = await hashRuntimeCacheBody({ b: 2, a: 1 });
		const b = await hashRuntimeCacheBody({ a: 1, b: 2 });
		expect(a).toBe(b);
	});

	it('builds stable POST cache keys without timestamps', async () => {
		const first = new Request('http://localhost/api/rag/search', {
			method: 'POST',
			body: JSON.stringify({ query: 'auth', top_k: 5 }),
		});
		const second = new Request('http://localhost/api/rag/search', {
			method: 'POST',
			body: JSON.stringify({ top_k: 5, query: 'auth' }),
		});

		expect(await buildRuntimeCacheKey(first)).toBe(await buildRuntimeCacheKey(second));
	});
});

