// @vitest-environment node
/**
 * Multi-lane retrieval tests — G26 pattern
 *
 * Covers:
 *   - All lanes succeed and merge results
 *   - Hash lane Redis miss (isError=false)
 *   - Ngram / trigram lane pg failure (graceful degradation)
 *   - Duplicate hit deduplication (same id across lanes accumulates score)
 *   - synthesisBlock shape stability
 *   - skipVectorLane=true returns skipped record (not an error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Env mocks (must precede module imports) ──────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: { REDIS_URL: 'redis://localhost:6379', QDRANT_URL: 'http://localhost:6333' },
}));
vi.mock('$lib/config/env.server.js', () => ({
	ENV: { REDIS_URL: 'redis://localhost:6379' },
}));

// ── Redis mock ───────────────────────────────────────────────────────────────

const mockRedisGet = vi.hoisted(() => vi.fn<[string], Promise<string | null>>());
const mockRedisSetex = vi.hoisted(() => vi.fn<unknown[], Promise<'OK'>>());

vi.mock('$lib/server/redis.js', () => ({
	redis: { get: mockRedisGet, setex: mockRedisSetex },
	getRedis: () => ({ get: mockRedisGet, setex: mockRedisSetex }),
}));

// ── pg Pool mock ─────────────────────────────────────────────────────────────

const mockPoolQuery = vi.hoisted(() => vi.fn<unknown[], Promise<{ rows: unknown[] }>>());

vi.mock('$lib/server/db/client', () => ({
	db: {},
	pool: { query: mockPoolQuery },
}));

// ── Qdrant mock (vector lane) ────────────────────────────────────────────────

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	hybridSearch: vi.fn(async () => []),
}));

// ── Module under test (lazy import per G26) ──────────────────────────────────

let multiLaneSearch: typeof import('../src/lib/server/ace/multi-lane-retrieval.js').multiLaneSearch;

beforeEach(async () => {
	vi.clearAllMocks();
	mockPoolQuery.mockResolvedValue({ rows: [] });
	mockRedisGet.mockResolvedValue(null);
	mockRedisSetex.mockResolvedValue('OK');

	const mod = await import('../src/lib/server/ace/multi-lane-retrieval.js');
	multiLaneSearch = mod.multiLaneSearch;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeRedis(overrides: Partial<{ get: typeof mockRedisGet; setex: typeof mockRedisSetex }> = {}) {
	return {
		get: overrides.get ?? mockRedisGet,
		setex: overrides.setex ?? mockRedisSetex,
	} as unknown as import('ioredis').Redis;
}

function fakePool(rows: unknown[] = []) {
	return { query: vi.fn(async () => ({ rows })) } as unknown as import('pg').Pool;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('multiLaneSearch', () => {
	it('returns all 6 lane slots even when every lane misses', async () => {
		const redis = fakeRedis();
		const pool = fakePool([]);

		const result = await multiLaneSearch(redis, pool, { text: 'hello world', topK: 5 });

		expect(result.lanes).toHaveLength(6);
		expect(result.lanes.map((l) => l.lane)).toEqual(
			expect.arrayContaining(['hash', 'ngram', 'graph', 'ace_cache', 'symbol', 'vector'])
		);
		expect(result.merged).toEqual([]);
		expect(result.totalHits).toBe(0);
		expect(result.knownError).toBe(false);
	});

	it('hash lane skips gracefully when isError=false', async () => {
		const redis = fakeRedis();
		const pool = fakePool([]);

		const result = await multiLaneSearch(redis, pool, { text: 'general query', isError: false });

		const hashLane = result.lanes.find((l) => l.lane === 'hash');
		expect(hashLane).toBeDefined();
		expect(hashLane!.hits).toHaveLength(0);
		expect(hashLane!.cacheHit).toBe(false);
		// Redis should NOT have been called for the error-fingerprint key
		expect(mockRedisGet).not.toHaveBeenCalledWith(expect.stringContaining('ace:error:'));
	});

	it('ngram lane returns empty array when pg.query rejects (graceful degradation)', async () => {
		mockPoolQuery.mockRejectedValue(new Error('pg connection refused'));
		const redis = fakeRedis();
		const pool = { query: mockPoolQuery } as unknown as import('pg').Pool;

		const result = await multiLaneSearch(redis, pool, { text: 'some query' });

		const ngramLane = result.lanes.find((l) => l.lane === 'ngram');
		expect(ngramLane).toBeDefined();
		expect(ngramLane!.hits).toHaveLength(0);
		// Other lanes should still be present (Promise.allSettled)
		expect(result.lanes).toHaveLength(6);
	});

	it('deduplicates hits across lanes and accumulates blended scores', async () => {
		// Ace-cache lane returns a hit with id='dup-1'
		mockRedisGet.mockImplementation(async (key: string) => {
			if (key.startsWith('ace:topk:')) {
				return JSON.stringify([{ id: 'dup-1', text: 'shared chunk', filePath: 'src/a.ts', score: 0.8 }]);
			}
			return null;
		});

		// N-gram lane also returns 'dup-1'
		mockPoolQuery.mockResolvedValue({
			rows: [{ id: 'dup-1', text: 'shared chunk', file_path: 'src/a.ts', sim: 0.6 }],
		});

		const redis = fakeRedis();
		const pool = { query: mockPoolQuery } as unknown as import('pg').Pool;

		const result = await multiLaneSearch(redis, pool, { text: 'shared chunk text', skipVectorLane: true });

		// dup-1 should appear once in merged
		const dupHits = result.merged.filter((h) => h.id === 'dup-1');
		expect(dupHits).toHaveLength(1);

		// Its accumulated score should be > both individual lane scores
		// ace_cache weight=0.90 × 0.8 = 0.72  +  ngram weight=0.60 × 0.6 = 0.36  → 1.08
		expect(dupHits[0].score).toBeGreaterThan(0.8);
	});

	it('synthesisBlock contains expected fields', async () => {
		const result = await multiLaneSearch(fakeRedis(), fakePool(), { text: 'any query' });

		expect(result.synthesisBlock).toContain('Multi-Index Retrieval Summary');
		expect(result.synthesisBlock).toContain('Query hash');
		expect(result.synthesisBlock).toContain('Known error');
		expect(result.queryHash).toHaveLength(12);
	});

	it('skipVectorLane=true returns a skipped record for the vector lane', async () => {
		const result = await multiLaneSearch(fakeRedis(), fakePool(), {
			text: 'query with skipVectorLane',
			skipVectorLane: true,
		});

		const vectorLane = result.lanes.find((l) => l.lane === 'vector');
		expect(vectorLane).toBeDefined();
		expect(vectorLane!.skipped).toBe(true);
		expect(vectorLane!.hits).toHaveLength(0);
	});

	it('knownError=true and priorFix surfaced when hash lane hits', async () => {
		const fp = {
			errorHash: 'abc123',
			normalizedText: 'TypeError: cannot read undefined',
			topFiles: ['src/lib/server/ai/gemma4-agent.ts'],
			topSymbols: ['parseToolCall'],
			priorFix: 'Add null check before accessing response.choices[0]',
		};

		// lookupErrorFingerprint checks Redis first
		mockRedisGet.mockImplementation(async (key: string) => {
			if (key.startsWith('ace:error:fp:')) return JSON.stringify(fp);
			return null;
		});

		const result = await multiLaneSearch(fakeRedis(), fakePool(), {
			text: 'TypeError: cannot read undefined at parseToolCall',
			isError: true,
		});

		expect(result.knownError).toBe(true);
		expect(result.priorFix).toBe(fp.priorFix);
		expect(result.synthesisBlock).toContain('Prior fix');
	});
});
