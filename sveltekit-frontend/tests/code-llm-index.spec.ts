// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from 'vitest';

const redisStore = vi.hoisted(() => ({
	strings: new Map<string, string>(),
	zsets:   new Map<string, Map<string, number>>(),
	sets:    new Map<string, Set<string>>(),
}));

const mockRedis = vi.hoisted(() => ({
	get: async (k: string) => redisStore.strings.get(k) ?? null,
	set: async (k: string, v: string) => { redisStore.strings.set(k, v); return 'OK'; },
	del: async (k: string) => {
		const had = redisStore.strings.delete(k);
		return had ? 1 : 0;
	},
	mget: async (...keys: string[]) => keys.map((k) => redisStore.strings.get(k) ?? null),
	zadd: async (k: string, score: number, member: string) => {
		const z = redisStore.zsets.get(k) ?? new Map();
		z.set(member, score);
		redisStore.zsets.set(k, z);
		return 1;
	},
	zincrby: async (k: string, inc: number, member: string) => {
		const z = redisStore.zsets.get(k) ?? new Map();
		const cur = z.get(member) ?? 0;
		z.set(member, cur + inc);
		redisStore.zsets.set(k, z);
		return cur + inc;
	},
	zrem: async (k: string, member: string) => {
		const z = redisStore.zsets.get(k);
		return z?.delete(member) ? 1 : 0;
	},
	zrevrange: async (k: string, start: number, stop: number, _withscores?: string) => {
		const z = redisStore.zsets.get(k);
		if (!z) return [] as string[];
		const sorted = [...z.entries()].sort((a, b) => b[1] - a[1]);
		const slice = sorted.slice(start, stop + 1);
		return slice.flatMap(([m, s]) => [m, String(s)]);
	},
	zrange: async (k: string, _s: number, _e: number, _ws?: string) => {
		const z = redisStore.zsets.get(k);
		if (!z) return [] as string[];
		return [...z.entries()].flatMap(([m, s]) => [m, String(s)]);
	},
	zcard: async (k: string) => redisStore.zsets.get(k)?.size ?? 0,
	sadd: async (k: string, member: string) => {
		const s = redisStore.sets.get(k) ?? new Set();
		s.add(member);
		redisStore.sets.set(k, s);
		return 1;
	},
	smembers: async (k: string) => [...(redisStore.sets.get(k) ?? [])],
	pipeline: () => {
		const ops: Array<() => Promise<unknown>> = [];
		const p = {
			set:     (k: string, v: string, ..._args: unknown[]) => { ops.push(() => mockRedis.set(k, v)); return p; },
			zadd:    (k: string, s: number, m: string) => { ops.push(() => mockRedis.zadd(k, s, m)); return p; },
			zincrby: (k: string, i: number, m: string) => { ops.push(() => mockRedis.zincrby(k, i, m)); return p; },
			zrem:    (k: string, m: string) => { ops.push(() => mockRedis.zrem(k, m)); return p; },
			sadd:    (k: string, m: string) => { ops.push(() => mockRedis.sadd(k, m)); return p; },
			exec:    async () => { for (const op of ops) await op(); return []; },
		};
		return p;
	},
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => mockRedis,
}));

// Avoid Qdrant/Ollama network calls during unit tests
vi.mock('node-fetch', () => ({ default: vi.fn().mockRejectedValue(new Error('blocked')) }));

describe('code-llm-index', () => {
	beforeEach(() => {
		redisStore.strings.clear();
		redisStore.zsets.clear();
		redisStore.sets.clear();
	});

	it('writes and reads a single LLM output entry', async () => {
		const { recordLlmOutputHit, getLlmOutputHit } = await import(
			'$lib/server/cache/code-llm-index.js'
		);

		const written = await recordLlmOutputHit(
			'src/lib/ai/client-router.ts',
			'Routes simple queries to local ONNX, complex to server Ollama.',
			{ source: 'gemma4-summary', glyphClusterId: 7 }
		);

		expect(written.path).toBe('src/lib/ai/client-router.ts');
		expect(written.source).toBe('gemma4-summary');
		expect(written.glyphClusterId).toBe(7);
		expect(written.isDir).toBe(false);

		const read = await getLlmOutputHit('src/lib/ai/client-router.ts');
		expect(read).not.toBeNull();
		expect(read!.llmOutput).toContain('local ONNX');
		// hitCount is incremented on read
		expect(read!.hitCount).toBe(1);
	});

	it('normalises path (slashes, case) so different forms resolve to same entry', async () => {
		const { recordLlmOutputHit, getLlmOutputHit } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('src\\lib\\Server\\REDIS.ts', 'OK');
		const hit = await getLlmOutputHit('./src/lib/server/redis.ts');
		expect(hit).not.toBeNull();
		expect(hit!.path).toBe('src/lib/server/redis.ts');
	});

	it('bulk-lookup returns aligned array (null for misses)', async () => {
		const { recordLlmOutputHit, getLlmOutputHitsBulk } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('a.ts', 'A');
		await recordLlmOutputHit('c.ts', 'C');

		const out = await getLlmOutputHitsBulk(['a.ts', 'b.ts', 'c.ts']);
		expect(out).toHaveLength(3);
		expect(out[0]?.llmOutput).toBe('A');
		expect(out[1]).toBeNull();
		expect(out[2]?.llmOutput).toBe('C');
	});

	it('hottest leaderboard ranks by hit count', async () => {
		const { recordLlmOutputHit, getLlmOutputHit, getHottestPaths } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('hot.ts',  'H');
		await recordLlmOutputHit('cold.ts', 'C');
		// Read hot.ts three times → hitCount = 3
		await getLlmOutputHit('hot.ts');
		await getLlmOutputHit('hot.ts');
		await getLlmOutputHit('hot.ts');
		await getLlmOutputHit('cold.ts');

		const top = await getHottestPaths(5);
		expect(top[0].path).toBe('hot.ts');
		expect(top[0].hitCount).toBeGreaterThan(top[1]?.hitCount ?? 0);
	});

	it('cluster index links cached paths to a glyph cluster', async () => {
		const { recordLlmOutputHit, getCachedPathsForCluster } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('a.ts', 'A', { glyphClusterId: 42 });
		await recordLlmOutputHit('b.ts', 'B', { glyphClusterId: 42 });
		await recordLlmOutputHit('c.ts', 'C', { glyphClusterId: 99 });

		const c42 = await getCachedPathsForCluster(42);
		expect(c42).toHaveLength(2);
		expect(c42.map((e) => e.path).sort()).toEqual(['a.ts', 'b.ts']);

		const c99 = await getCachedPathsForCluster(99);
		expect(c99).toHaveLength(1);
		expect(c99[0].path).toBe('c.ts');
	});

	it('invalidation removes the entry and its leaderboard membership', async () => {
		const { recordLlmOutputHit, getLlmOutputHit, invalidateLlmOutput, getHottestPaths } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('gone.ts', 'G');
		await getLlmOutputHit('gone.ts'); // populate hot zset

		const removed = await invalidateLlmOutput('gone.ts');
		expect(removed).toBe(true);
		expect(await getLlmOutputHit('gone.ts')).toBeNull();
		const top = await getHottestPaths(10);
		expect(top.find((t) => t.path === 'gone.ts')).toBeUndefined();
	});

	it('refresh preserves hitCount across writes', async () => {
		const { recordLlmOutputHit, getLlmOutputHit } = await import(
			'$lib/server/cache/code-llm-index.js'
		);
		await recordLlmOutputHit('p.ts', 'V1');
		await getLlmOutputHit('p.ts'); // hit=1
		await getLlmOutputHit('p.ts'); // hit=2
		await recordLlmOutputHit('p.ts', 'V2');     // refresh → preserved
		const after = await getLlmOutputHit('p.ts'); // hit=3
		expect(after!.hitCount).toBe(3);
		expect(after!.llmOutput).toBe('V2');
	});
});
