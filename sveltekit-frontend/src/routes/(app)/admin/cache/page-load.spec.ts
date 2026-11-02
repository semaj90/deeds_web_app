// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.js';

type Fetch = (url: string) => Promise<Response>;
const run = (fetch: Fetch) => (load as unknown as (e: { fetch: Fetch }) => Promise<any>)({ fetch });

describe('/admin/cache load()', () => {
	it('returns the API stats and no error on success', async () => {
		const data = { redis: { connected: true } };
		const out = await run(async () => new Response(JSON.stringify({ data }), { status: 200 }));
		expect(out.stats).toEqual(data);
		expect(out.loadError).toBeNull();
	});

	// Runtime error group #1 on the dashboard: "Failed to fetch" with first app frame admin/cache/+page.ts
	it('degrades instead of throwing when the fetch rejects (network failure)', async () => {
		const out = await run(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		expect(out.loadError).toBe('Failed to fetch');
		expect(out.stats.redis).toMatchObject({ connected: false, totalKeys: 0, keyPatterns: [] });
	});

	it('degrades on a non-OK response and on a body without data', async () => {
		const bad = await run(async () => new Response('boom', { status: 500 }));
		expect(bad.loadError).toMatch(/500/);
		expect(bad.stats.memory.size).toBe(0);

		const empty = await run(async () => new Response(JSON.stringify({}), { status: 200 }));
		expect(empty.loadError).toMatch(/no data/);
	});

	it('degraded stats carry every field the template reads (no undefined deref)', async () => {
		const { stats } = await run(vi.fn().mockRejectedValue(new Error('x')));
		for (const path of [
			'redis.connected', 'redis.totalKeys', 'redis.memoryUsed', 'redis.uptimeMs', 'redis.connectedClients', 'redis.keyPatterns',
			'memory.size', 'memory.estimatedSize', 'memory.defaultTTL', 'memory.hitRate',
			'template.totalKeys', 'template.metadataKeys', 'template.aiContentKeys', 'template.renderedKeys',
			'llm.totalResponses', 'llm.hits', 'llm.misses', 'llm.hitRate',
			'export.totalKeys', 'export.formats', 'export.totalSizeBytes', 'export.oldestExport', 'export.newestExport',
		]) {
			const value = path.split('.').reduce((o: any, k) => o?.[k], stats);
			expect(value, path).not.toBeUndefined();
		}
	});
});
