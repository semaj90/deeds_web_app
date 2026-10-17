import { describe, expect, it } from 'vitest';
import { stableHash, withRpcCache, type RpcCacheStore } from './rpc-cache.js';

class MemoryRpcCache implements RpcCacheStore {
	readonly entries = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.entries.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<void> {
		this.entries.set(key, value);
	}

	async del(key: string): Promise<number> {
		return Number(this.entries.delete(key));
	}
}

describe('RPC cache key hashing', () => {
	it('canonicalizes object key order for the same logical arguments', () => {
		expect(stableHash({ query: 'atlas', options: { limit: 10, lane: 'semantic' } })).toBe(
			stableHash({ options: { lane: 'semantic', limit: 10 }, query: 'atlas' }),
		);
	});

	it('retains a full SHA-256 digest and distinguishes changed inputs', () => {
		const first = stableHash({ packetKey: 'packet-a', sourceRevision: 'rev-1' });
		const changed = stableHash({ packetKey: 'packet-a', sourceRevision: 'rev-2' });

		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(changed).not.toBe(first);
	});
});

describe('RPC cache envelope validation', () => {
  it('hashes the actual persisted JSON payload rather than undefined properties that JSON drops', async () => {
    const cacheStore = new MemoryRpcCache();
    const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 60, cacheStore };
    let computes = 0;
    const compute = async () => {
      computes += 1;
      return { ids: ['node-1'], trace_id: undefined, nested: { absent: undefined, present: 'yes' }, values: [undefined, 1] };
    };
    const cold = await withRpcCache({ fixture: 'undefined-json' }, compute, options);
    const warm = await withRpcCache({ fixture: 'undefined-json' }, compute, options);
    expect(cold.cache.hit).toBe(false);
    expect(warm.cache.hit).toBe(true);
    expect(computes).toBe(1);
    expect(warm.value).toEqual({ ids: ['node-1'], nested: { present: 'yes' }, values: [null, 1] });
  });
	it('returns a warm hit only after validating the versioned payload envelope', async () => {
		const cacheStore = new MemoryRpcCache();
		const args = { query: 'graph', sourceRevision: 'source-a' };
		let computes = 0;
		const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 60, cacheStore };

		const cold = await withRpcCache(args, async () => {
			computes += 1;
			return { ids: ['node-1'] };
		}, options);
		const warm = await withRpcCache(args, async () => {
			computes += 1;
			return { ids: ['unexpected'] };
		}, options);

		expect(cold.cache.hit).toBe(false);
		expect(warm.cache.hit).toBe(true);
		expect(warm.value).toEqual({ ids: ['node-1'] });
		expect(computes).toBe(1);
	});

	it('discards a payload whose checksum no longer matches and recomputes', async () => {
		const cacheStore = new MemoryRpcCache();
		const args = { query: 'graph', sourceRevision: 'source-a' };
		const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 60, cacheStore };
		await withRpcCache(args, async () => ({ ids: ['original'] }), options);
		const key = [...cacheStore.entries.keys()][0];
		const envelope = JSON.parse(cacheStore.entries.get(key)!) as { payload: unknown };
		envelope.payload = { ids: ['tampered'] };
		cacheStore.entries.set(key, JSON.stringify(envelope));

		const result = await withRpcCache(args, async () => ({ ids: ['recomputed'] }), options);

		expect(result.cache.hit).toBe(false);
		expect(result.value).toEqual({ ids: ['recomputed'] });
	});

	it('discards an expired envelope and recomputes', async () => {
		const cacheStore = new MemoryRpcCache();
		const args = { query: 'graph', sourceRevision: 'source-a' };
		const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 60, cacheStore };
		await withRpcCache(args, async () => ({ ids: ['old'] }), options);
		const key = [...cacheStore.entries.keys()][0];
		const envelope = JSON.parse(cacheStore.entries.get(key)!) as { expiresAt: string };
		envelope.expiresAt = new Date(Date.now() - 1000).toISOString();
		cacheStore.entries.set(key, JSON.stringify(envelope));

		const result = await withRpcCache(args, async () => ({ ids: ['fresh'] }), options);

		expect(result.cache.hit).toBe(false);
		expect(result.value).toEqual({ ids: ['fresh'] });
	});

	it('isolates entries by source revision', async () => {
		const cacheStore = new MemoryRpcCache();
		const options = { transport: 'grpc' as const, method: 'SearchChunks', ttlSeconds: 60, cacheStore };
		await withRpcCache({ query: 'graph', sourceRevision: 'source-a' }, async () => 'a', options);
		await withRpcCache({ query: 'graph', sourceRevision: 'source-b' }, async () => 'b', options);

		expect(cacheStore.entries.size).toBe(2);
	});
});
