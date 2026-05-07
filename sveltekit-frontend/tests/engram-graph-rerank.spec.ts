// @vitest-environment node
/**
 * Tests for:
 *   engram-memory.ts     — Redis bigram DYM
 *   graph-reranker.ts    — multi-signal rerank
 *   POST /api/graph/fetch-rerank — endpoint contract
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';

// ── engram-memory unit tests ───────────────────────────────────────────────

describe('engram-memory', () => {
  describe('hashQuery', () => {
    it('is deterministic and 16 hex chars', async () => {
      const { hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const h1 = hashQuery('what is hearsay?');
      const h2 = hashQuery('what is hearsay?');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{16}$/);
    });

    it('normalises case and whitespace', async () => {
      const { hashQuery } = await import('$lib/server/ai/engram-memory.js');
      expect(hashQuery('Hearsay')).toBe(hashQuery('hearsay'));
      expect(hashQuery('  hearsay  ')).toBe(hashQuery('hearsay'));
    });

    it('produces different hashes for different queries', async () => {
      const { hashQuery } = await import('$lib/server/ai/engram-memory.js');
      expect(hashQuery('hearsay')).not.toBe(hashQuery('objection'));
    });
  });

  describe('recordEngramTransition', () => {
    function makeRedis() {
      const store: Record<string, string> = {};
      const zsets: Record<string, Record<string, number>> = {};
      return {
        set:    vi.fn(async (key: string, value: string) => { store[key] = value; }),
        get:    vi.fn(async (key: string) => store[key] ?? null),
        zincrby: vi.fn(async (key: string, inc: number, member: string) => {
          if (!zsets[key]) zsets[key] = {};
          zsets[key][member] = (zsets[key][member] ?? 0) + inc;
          return zsets[key][member];
        }),
        expire: vi.fn(async () => 1),
        zrevrange: vi.fn(async (key: string) => {
          if (!zsets[key]) return [];
          return Object.entries(zsets[key])
            .sort(([,a],[,b]) => b - a)
            .flatMap(([m, s]) => [m, String(s)]);
        }),
        _store: store,
        _zsets: zsets,
      } as unknown as Redis & { _store: Record<string, string>; _zsets: Record<string, Record<string, number>> };
    }

    it('stores current query text by hash', async () => {
      const { recordEngramTransition, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const redis = makeRedis() as unknown as Redis;
      const q = 'what is hearsay evidence?';
      await recordEngramTransition(redis, { currentQuery: q });
      const h = hashQuery(q);
      expect(vi.mocked(redis.set)).toHaveBeenCalledWith(
        `ace:engram:query:${h}`, q, 'EX', expect.any(Number)
      );
    });

    it('writes bigram ZSET when previousQuery is given', async () => {
      const { recordEngramTransition, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const redis = makeRedis() as unknown as Redis;
      const prev = 'hearsay basics';
      const curr = 'excited utterance exception';
      await recordEngramTransition(redis, { previousQuery: prev, currentQuery: curr });
      const prevHash = hashQuery(prev);
      const currHash = hashQuery(curr);
      expect(vi.mocked(redis.zincrby)).toHaveBeenCalledWith(
        `ace:engram:bigram:${prevHash}`, 1, currHash
      );
    });

    it('writes BMU keys when somRow/somCol are provided', async () => {
      const { recordEngramTransition, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const redis = makeRedis() as unknown as Redis;
      const q = 'objection hearsay';
      await recordEngramTransition(redis, { currentQuery: q, somRow: 3, somCol: 7 });
      const h = hashQuery(q);
      expect(vi.mocked(redis.set)).toHaveBeenCalledWith(
        `ace:engram:query-bmu:${h}`, '3:7', 'EX', expect.any(Number)
      );
      expect(vi.mocked(redis.zincrby)).toHaveBeenCalledWith(
        'ace:engram:bmu:3:7', 1, h
      );
    });

    it('skips BMU writes when som coords are null', async () => {
      const { recordEngramTransition } = await import('$lib/server/ai/engram-memory.js');
      const redis = makeRedis() as unknown as Redis;
      await recordEngramTransition(redis, { currentQuery: 'test', somRow: null, somCol: null });
      const bmuCalls = vi.mocked(redis.zincrby).mock.calls
        .filter(([k]) => String(k).startsWith('ace:engram:bmu:'));
      expect(bmuCalls).toHaveLength(0);
    });
  });

  describe('getDidYouMeanFromEngram', () => {
    it('returns suggestions from bigram transitions', async () => {
      const { getDidYouMeanFromEngram, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const qA   = 'hearsay rule';
      const qB   = 'excited utterance';
      const hA   = hashQuery(qA);
      const hB   = hashQuery(qB);
      const store: Record<string, string> = {
        [`ace:engram:query:${hB}`]: qB,
      };
      const zsets: Record<string, string[]> = {
        [`ace:engram:bigram:${hA}`]: [hB, '3'],
      };
      const redis = {
        get:       vi.fn(async (k: string) => store[k] ?? null),
        zrevrange: vi.fn(async (k: string) => zsets[k] ?? []),
      } as unknown as Redis;

      const results = await getDidYouMeanFromEngram(redis, qA, 5);
      expect(results).toHaveLength(1);
      expect(results[0].suggestion).toBe(qB);
      expect(results[0].hitCount).toBe(3);
    });

    it('deduplicates across bigram and BMU sources', async () => {
      const { getDidYouMeanFromEngram, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const qA = 'hearsay';
      const qB = 'excited utterance';
      const hA = hashQuery(qA);
      const hB = hashQuery(qB);
      const store: Record<string, string> = {
        [`ace:engram:query:${hB}`]: qB,
        [`ace:engram:query-bmu:${hA}`]: '2:4',
      };
      // Same hash appears in both bigram AND bmu
      const zsets: Record<string, string[]> = {
        [`ace:engram:bigram:${hA}`]: [hB, '5'],
        [`ace:engram:bmu:2:4`]:      [hB, '2'],
      };
      const redis = {
        get:       vi.fn(async (k: string) => store[k] ?? null),
        zrevrange: vi.fn(async (k: string) => zsets[k] ?? []),
      } as unknown as Redis;

      const results = await getDidYouMeanFromEngram(redis, qA, 5);
      expect(results).toHaveLength(1); // deduped
      expect(results[0].suggestion).toBe(qB);
    });

    it('omits the query itself from suggestions', async () => {
      const { getDidYouMeanFromEngram, hashQuery } = await import('$lib/server/ai/engram-memory.js');
      const q  = 'hearsay';
      const h  = hashQuery(q);
      const store: Record<string, string> = {
        [`ace:engram:query:${h}`]: q,
      };
      const zsets: Record<string, string[]> = {
        [`ace:engram:bigram:${h}`]: [h, '10'],
      };
      const redis = {
        get:       vi.fn(async (k: string) => store[k] ?? null),
        zrevrange: vi.fn(async (k: string) => zsets[k] ?? []),
      } as unknown as Redis;

      const results = await getDidYouMeanFromEngram(redis, q, 5);
      expect(results).toHaveLength(0);
    });
  });
});

// ── graph-reranker unit tests ──────────────────────────────────────────────

describe('graph-reranker', () => {
  describe('somAdjacencyBonus', () => {
    it('returns 1 for same cell', async () => {
      const { somAdjacencyBonus } = await import('$lib/server/ai/graph-reranker.js');
      expect(somAdjacencyBonus(3, 4, 3, 4)).toBe(1);
    });

    it('decays with distance', async () => {
      const { somAdjacencyBonus } = await import('$lib/server/ai/graph-reranker.js');
      const near = somAdjacencyBonus(0, 0, 1, 0);
      const far  = somAdjacencyBonus(0, 0, 3, 4);
      expect(near).toBeGreaterThan(far);
    });

    it('returns 0 when coords are missing', async () => {
      const { somAdjacencyBonus } = await import('$lib/server/ai/graph-reranker.js');
      expect(somAdjacencyBonus(undefined, undefined, 1, 1)).toBe(0);
    });
  });

  describe('toUnitQuaternion', () => {
    it('normalises a valid vector', async () => {
      const { toUnitQuaternion } = await import('$lib/server/ai/graph-reranker.js');
      const q = toUnitQuaternion([1, 2, 3, 4]);
      expect(q).not.toBeNull();
      const norm = Math.sqrt(q!.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('returns null for zero vector', async () => {
      const { toUnitQuaternion } = await import('$lib/server/ai/graph-reranker.js');
      expect(toUnitQuaternion([0, 0, 0, 0])).toBeNull();
    });

    it('returns null for wrong length', async () => {
      const { toUnitQuaternion } = await import('$lib/server/ai/graph-reranker.js');
      expect(toUnitQuaternion([1, 2, 3])).toBeNull();
    });
  });

  describe('quaternionSimilarity', () => {
    it('returns 1 for identical unit vectors', async () => {
      const { quaternionSimilarity } = await import('$lib/server/ai/graph-reranker.js');
      const q: [number,number,number,number] = [0.5, 0.5, 0.5, 0.5];
      expect(quaternionSimilarity(q, q)).toBeCloseTo(1, 5);
    });

    it('is symmetric', async () => {
      const { quaternionSimilarity } = await import('$lib/server/ai/graph-reranker.js');
      const a: [number,number,number,number] = [0.5, 0.5, 0.5, 0.5];
      const b: [number,number,number,number] = [0, 0, 0, 1];
      expect(quaternionSimilarity(a, b)).toBeCloseTo(quaternionSimilarity(b, a), 10);
    });
  });

  describe('scoreCandidate', () => {
    it('returns final in [0,1]', async () => {
      const { scoreCandidate } = await import('$lib/server/ai/graph-reranker.js');
      const s = scoreCandidate({
        qdrantScore: 0.8, pagerankScore: 0.5, hyperedgeWeight: 0.3,
        somBonus: 0.7, fastAstScore: 0.4, quaternionScore: 0.6,
      });
      expect(s.final).toBeGreaterThanOrEqual(0);
      expect(s.final).toBeLessThanOrEqual(1);
    });

    it('qdrant score dominates (weight 0.40)', async () => {
      const { scoreCandidate } = await import('$lib/server/ai/graph-reranker.js');
      const high = scoreCandidate({ qdrantScore: 1.0 });
      const low  = scoreCandidate({ qdrantScore: 0.0 });
      expect(high.final).toBeGreaterThan(low.final);
      expect(high.qdrant).toBe(1);
    });
  });

  describe('rerankHits', () => {
    it('sorts by final score descending', async () => {
      const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');
      const hits = [
        { chunkId: 'a', score: 0.4, payload: {} },
        { chunkId: 'b', score: 0.9, payload: {} },
        { chunkId: 'c', score: 0.6, payload: {} },
      ];
      const results = rerankHits(hits);
      expect(results[0].chunkId).toBe('b');
      expect(results[results.length - 1].chunkId).toBe('a');
    });

    it('respects limit', async () => {
      const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');
      const hits = Array.from({ length: 10 }, (_, i) => ({
        chunkId: `c${i}`, score: Math.random(), payload: {},
      }));
      expect(rerankHits(hits, undefined, 3)).toHaveLength(3);
    });

    it('boosts hits adjacent to querySom', async () => {
      const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');
      const nearHit = { chunkId: 'near', score: 0.5, payload: { som_bmu_row: 2, som_bmu_col: 3 } };
      const farHit  = { chunkId: 'far',  score: 0.5, payload: { som_bmu_row: 9, som_bmu_col: 9 } };
      const results = rerankHits([farHit, nearHit], { row: 2, col: 3 });
      expect(results[0].chunkId).toBe('near');
    });

    it('populates scores and why labels', async () => {
      const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');
      const hits = [{ chunkId: 'x', score: 0.95, payload: { pagerank: 0.8 } }];
      const [r] = rerankHits(hits);
      expect(r.scores.qdrant).toBeCloseTo(0.95, 2);
      expect(r.scores.pagerank).toBeCloseTo(0.8, 2);
      expect(r.why).toContain('semantic_hit');
      expect(r.why).toContain('pagerank_boost');
    });
  });
});

// ── POST /api/graph/fetch-rerank endpoint tests ────────────────────────────

const routeMocks = vi.hoisted(() => ({
  getRedis: vi.fn(),
  redis:    { get: vi.fn(async () => null) },
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: routeMocks.getRedis,
}));

describe('POST /api/graph/fetch-rerank', () => {
  beforeEach(() => {
    routeMocks.getRedis.mockReturnValue(routeMocks.redis);
    routeMocks.redis.get.mockResolvedValue(null);
  });

  const makeEvent = (body: unknown, authed = true) => ({
    locals:  authed ? { user: { id: 'u1' } } : {},
    request: new Request('http://x', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }),
  });

  it('returns 401 without auth', async () => {
    const { POST } = await import('../src/routes/api/graph/fetch-rerank/+server.js');
    const res = await POST(makeEvent({ query: 'q', qdrantHits: [{ chunkId: 'a', score: 0.5 }] }, false) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing qdrantHits', async () => {
    const { POST } = await import('../src/routes/api/graph/fetch-rerank/+server.js');
    const res = await POST(makeEvent({ query: 'q' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_params');
  });

  it('returns ranked results with retrievalTrace.graphSort', async () => {
    const { POST } = await import('../src/routes/api/graph/fetch-rerank/+server.js');
    const hits = [
      { chunkId: 'a', score: 0.9, payload: { som_bmu_row: 1, som_bmu_col: 1 } },
      { chunkId: 'b', score: 0.4, payload: {} },
    ];
    const res = await POST(makeEvent({
      query:      'hearsay rule',
      qdrantHits: hits,
      querySom:   { row: 1, col: 1 },
    }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].chunkId).toBe('a'); // SOM adjacency boosts 'a'
    expect(body.retrievalTrace.graphSort.used).toBe(true);
    expect(body.retrievalTrace.graphSort.inputCount).toBe(2);
  });

  it('respects limit param', async () => {
    const { POST } = await import('../src/routes/api/graph/fetch-rerank/+server.js');
    const hits = Array.from({ length: 10 }, (_, i) => ({ chunkId: `c${i}`, score: 0.5 }));
    const res = await POST(makeEvent({ query: 'q', qdrantHits: hits, limit: 3 }) as never);
    const body = await res.json();
    expect(body.results).toHaveLength(3);
  });
});
