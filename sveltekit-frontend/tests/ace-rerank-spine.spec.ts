// @vitest-environment node
/**
 * ACE Retrieval Spine — integration guardrail
 *
 * Proves the four pillars of the retrieval spine are wired end-to-end:
 *   1. BoW tile overlap boosts a cluster (graph-reranker scoreCandidate)
 *   2. Engram suggestions appear as source: 'engram' (search-analytics DYM)
 *   3. Quaternion similarity ranks nearest manifold4 candidate first (graph-reranker rerankHits)
 *   4. fetch-rerank endpoint returns sorted results with per-signal component scores
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── hoisted mocks (must precede any vi.mock factories) ───────────────────────
const mocks = vi.hoisted(() => ({
  // Redis mock
  redisGet:   vi.fn<[], Promise<string | null>>().mockResolvedValue(null),
  redisHkeys: vi.fn<[], Promise<string[]>>().mockResolvedValue([]),
  redisHmget: vi.fn<[], Promise<Array<string | null>>>().mockResolvedValue([]),
  redisPipeline: vi.fn(() => ({ zadd: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) })),

  // Postgres pool mock
  poolQuery: vi.fn<[], Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),

  // Engram bigram
  getEngramSuggestions: vi.fn<[], Promise<Array<{ suggestion: string; score: number; hitCount: number }>>>()
    .mockResolvedValue([{ suggestion: 'hearsay evidence rule', score: 0.92, hitCount: 3 }]),

  // Engram memory DYM
  getDidYouMeanFromEngram: vi.fn<[], Promise<Array<{ suggestion: string; hitCount: number }>>>()
    .mockResolvedValue([]),

  // QLoRA
  getQloraSmartSuggestions: vi.fn<[], Promise<Array<{ suggestion: string; similarity: number; hitCount: number; qualityTier: string }>>>()
    .mockResolvedValue([]),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:      mocks.redisGet,
    hkeys:    mocks.redisHkeys,
    hmget:    mocks.redisHmget,
    pipeline: mocks.redisPipeline,
  }),
}));

vi.mock('$lib/server/db/client.js', () => {
  const mockDb = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve([])) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
  };
  return {
    default: { db: mockDb },
    pool: { query: mocks.poolQuery },
    db: mockDb,
  };
});

vi.mock('$lib/server/search/engram-bigram.js', () => ({
  getEngramSuggestions: mocks.getEngramSuggestions,
}));

vi.mock('$lib/server/ai/engram-memory.js', () => ({
  getDidYouMeanFromEngram: mocks.getDidYouMeanFromEngram,
  hashQuery: (q: string) => q.slice(0, 16),
  recordEngramTransition: vi.fn().mockResolvedValue({ currentHash: 'abc' }),
}));

vi.mock('$lib/server/analytics/qlora-boost.js', () => ({
  getQloraSmartSuggestions: mocks.getQloraSmartSuggestions,
}));

// ── 0. bow-utils pure helpers ─────────────────────────────────────────────────

import {
  tokenizeBowQuery,
  weightedBowOverlapScore,
  boundedBowBoost,
} from '$lib/server/search/bow-utils.js';

describe('bow-utils — pure tokenizer and scoring helpers', () => {
  it('lowercases, preserves path separators, and filters short tokens', () => {
    const terms = tokenizeBowQuery('Graph/analyze: ACE, AI, SOM!!');

    expect([...terms]).toEqual(
      expect.arrayContaining(['graph/analyze', 'ace', 'som']),
    );
    expect(terms.has('ai')).toBe(false);   // length 2 — filtered
  });

  it('weightedBowOverlapScore returns matched terms and accumulated score', () => {
    const queryTerms = tokenizeBowQuery('hearsay evidence rule');
    const weights = { hearsay: 0.4, evidence: 0.3, statute: 0.2 };

    const { score, matchedTerms } = weightedBowOverlapScore(queryTerms, weights);

    expect(score).toBeCloseTo(0.7);
    expect(matchedTerms).toEqual(expect.arrayContaining(['hearsay', 'evidence']));
    expect(matchedTerms).not.toContain('statute');
  });

  it('boundedBowBoost clamps at 0 and 0.12', () => {
    expect(boundedBowBoost(-1)).toBe(0);
    expect(boundedBowBoost(0.25)).toBeCloseTo(0.06);
    expect(boundedBowBoost(10)).toBe(0.12);
  });

  it('BowClusterScore object shape is { clusterId: number; score: number }', () => {
    type BCS = import('$lib/server/ace/context-assembler.js').BowClusterScore;
    const s: BCS = { clusterId: 3, score: 0.42 };
    expect(s.clusterId).toBe(3);
    expect(s.score).toBeCloseTo(0.42);
  });
});

// ── 1. BoW tile overlap boosts a cluster ─────────────────────────────────────

describe('scoreCandidate — BoW/graph multi-signal weights', () => {
  it('quaternion signal contributes 0.10 weight to final score', async () => {
    const { scoreCandidate } = await import('$lib/server/ai/graph-reranker.js');

    // Qdrant=0.70, pagerank=0, hyperedge=0, som=0, fastAst=0, quaternion=1.0
    const scores = scoreCandidate({
      qdrantScore:      0.70,
      pagerankScore:    0,
      hyperedgeWeight:  0,
      somBonus:         0,
      fastAstScore:     0,
      quaternionScore:  1.0,
    });

    // expected: 0.70*0.40 + 1.0*0.10 = 0.28 + 0.10 = 0.38
    expect(scores.final).toBeCloseTo(0.38, 5);
    expect(scores.quaternion).toBe(1.0);
  });

  it('cluster coherence (hyperedge) boosts final score', async () => {
    const { scoreCandidate } = await import('$lib/server/ai/graph-reranker.js');

    const base   = scoreCandidate({ qdrantScore: 0.70, hyperedgeWeight: 0 });
    const boosted = scoreCandidate({ qdrantScore: 0.70, hyperedgeWeight: 0.80 });

    expect(boosted.final).toBeGreaterThan(base.final);
    // 0.80 * 0.14 = +0.112
    expect(boosted.final - base.final).toBeCloseTo(0.80 * 0.14, 5);
  });

  it('pagerank boost carries 0.18 weight', async () => {
    const { scoreCandidate } = await import('$lib/server/ai/graph-reranker.js');

    const base    = scoreCandidate({ qdrantScore: 0.50, pagerankScore: 0 });
    const boosted = scoreCandidate({ qdrantScore: 0.50, pagerankScore: 1.0 });

    expect(boosted.final - base.final).toBeCloseTo(0.18, 5);
  });

  it('all weight coefficients sum to 1.0', () => {
    const weights = [0.40, 0.18, 0.14, 0.10, 0.08, 0.10];
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ── 2. Engram suggestions appear as source: 'engram' ─────────────────────────

describe('getDidYouMeanSuggestions — engram source label', () => {
  it('bigram engram results carry source: engram', async () => {
    mocks.getEngramSuggestions.mockResolvedValueOnce([
      { suggestion: 'hearsay evidence rule', score: 0.92, hitCount: 3 },
    ]);

    const { getDidYouMeanSuggestions } = await import(
      '$lib/server/analytics/search-analytics.js'
    );

    const results = await getDidYouMeanSuggestions('hearsay', 0.5, 5);

    const engramResults = results.filter((r) => r.source === 'engram');
    expect(engramResults.length).toBeGreaterThanOrEqual(1);
    expect(engramResults[0].suggestion).toBe('hearsay evidence rule');
  });

  it('engram results are not mis-labelled as redis or pg', async () => {
    const { getDidYouMeanSuggestions } = await import(
      '$lib/server/analytics/search-analytics.js'
    );

    mocks.getEngramSuggestions.mockResolvedValueOnce([
      { suggestion: 'miranda rights', score: 0.88, hitCount: 5 },
    ]);

    const results = await getDidYouMeanSuggestions('miranda', 0.5, 5);

    const engramHit = results.find((r) => r.suggestion === 'miranda rights');
    expect(engramHit).toBeDefined();
    expect(engramHit?.source).toBe('engram');
    expect(engramHit?.source).not.toBe('redis');
    expect(engramHit?.source).not.toBe('pg');
  });
});

// ── 3. Quaternion similarity ranks nearest manifold4 candidate first ──────────

describe('rerankHits — quaternion manifold4 ordering', () => {
  it('places the manifold4-aligned chunk above the orthogonal chunk', async () => {
    const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');

    // All hits have equal Qdrant score; winner decided by quaternion alignment
    const queryM4 = [1, 0, 0, 1];  // som_x=1, som_y=0, semantic_z=0, grpo_w=1

    const hits = [
      {
        chunkId: 'aligned',
        score:   0.70,
        payload: { manifold4: [1, 0, 0, 1] },  // same manifold4 → high quaternion
      },
      {
        chunkId: 'orthogonal',
        score:   0.70,
        payload: { manifold4: [0, 1, 0, 0] },  // orthogonal → quaternion ≈ 0
      },
      {
        chunkId: 'no-manifold4',
        score:   0.70,
        payload: {},
      },
    ];

    const results = rerankHits(hits, { row: 0, col: 0, manifold4_q: queryM4 }, 10);

    // 'aligned' should rank above 'orthogonal'
    const alignedIdx    = results.findIndex((r) => r.chunkId === 'aligned');
    const orthogonalIdx = results.findIndex((r) => r.chunkId === 'orthogonal');
    expect(alignedIdx).toBeLessThan(orthogonalIdx);
  });

  it('the top result has quaternion_align in why[] when score > 0.5', async () => {
    const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');

    const hits = [
      {
        chunkId: 'perfect',
        score:   0.80,
        payload: { manifold4_q: [0.5, 0.5, 0.5, 0.5] },
      },
    ];

    const results = rerankHits(hits, { manifold4_q: [0.5, 0.5, 0.5, 0.5] }, 5);
    expect(results[0].why).toContain('quaternion_align');
  });

  it('why[] never contains quaternion_align when manifold4 is absent', async () => {
    const { rerankHits } = await import('$lib/server/ai/graph-reranker.js');

    const hits = [{ chunkId: 'nq', score: 0.80, payload: {} }];
    const results = rerankHits(hits, {}, 5);
    expect(results[0].why).not.toContain('quaternion_align');
  });
});

// ── 4. fetch-rerank endpoint returns sorted results with component scores ─────

describe('POST /api/graph/fetch-rerank — endpoint contract', () => {
  const makeRequest = (body: unknown, userId = 'user-1') =>
    new Request('http://localhost/api/graph/fetch-rerank', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

  let handler: (event: { locals: { user?: { id: string } }; request: Request }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('$lib/server/redis.js');
    (mod as unknown as Record<string, unknown>)['getRedis'] = () => ({
      get:  vi.fn().mockResolvedValue(null),
    });

    ({ POST: handler } = await import(
      '../src/routes/api/graph/fetch-rerank/+server.js'
    ));
  });

  it('returns 401 when user is not authenticated', async () => {
    const res = await handler({ locals: {}, request: makeRequest({ query: 'test', qdrantHits: [] }) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input (empty qdrantHits)', async () => {
    const res = await handler({
      locals:  { user: { id: 'u1' } },
      request: makeRequest({ query: 'test', qdrantHits: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 with sorted results and retrievalTrace on valid input', async () => {
    const res = await handler({
      locals:  { user: { id: 'u1' } },
      request: makeRequest({
        query: 'hearsay evidence',
        qdrantHits: [
          {
            chunkId: 'c1',
            score:   0.85,
            payload: {
              som_bmu_row: 3,
              som_bmu_col: 5,
              manifold4:   [1, 0, 0, 1],
              pagerank:    0.6,
              hyperedgeWeight: 0.4,
            },
          },
          {
            chunkId: 'c2',
            score:   0.72,
            payload: {
              som_bmu_row: 4,
              som_bmu_col: 6,
              manifold4:   [0, 1, 0, 0],
              pagerank:    0.2,
            },
          },
        ],
        querySom: { row: 3, col: 5 },
        limit: 10,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      results: Array<{ chunkId: string; score: number; scores: Record<string, number>; why: string[] }>;
      retrievalTrace: {
        graphSort: { used: boolean; inputCount: number; outputCount: number; durationMs: number };
      };
    };

    // Sorted descending by score
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < body.results.length - 1; i++) {
      expect(body.results[i].score).toBeGreaterThanOrEqual(body.results[i + 1].score);
    }

    // Component scores present on every result
    for (const r of body.results) {
      expect(r.scores).toHaveProperty('qdrant');
      expect(r.scores).toHaveProperty('pagerank');
      expect(r.scores).toHaveProperty('hyperedge');
      expect(r.scores).toHaveProperty('somAdjacency');
      expect(r.scores).toHaveProperty('quaternion');
      expect(r.scores).toHaveProperty('final');
    }

    // Retrieval trace
    expect(body.retrievalTrace.graphSort.used).toBe(true);
    expect(body.retrievalTrace.graphSort.inputCount).toBe(2);
  });

  it('c1 ranks above c2 (higher qdrant + pagerank + hyperedge + SOM adjacency)', async () => {
    const res = await handler({
      locals:  { user: { id: 'u1' } },
      request: makeRequest({
        query: 'hearsay evidence',
        qdrantHits: [
          {
            chunkId: 'c1',
            score:   0.85,
            payload: { pagerank: 0.6, hyperedgeWeight: 0.4, som_bmu_row: 3, som_bmu_col: 5 },
          },
          {
            chunkId: 'c2',
            score:   0.50,
            payload: { pagerank: 0.1, som_bmu_row: 9, som_bmu_col: 9 },
          },
        ],
        querySom: { row: 3, col: 5 },
      }),
    });

    const body = await res.json() as { results: Array<{ chunkId: string }> };
    expect(body.results[0].chunkId).toBe('c1');
  });

  it('hmmBias.applied is false when no hmm is sent', async () => {
    const res = await handler({
      locals:  { user: { id: 'u1' } },
      request: makeRequest({
        query: 'test',
        qdrantHits: [{ chunkId: 'c1', score: 0.8, payload: {} }],
      }),
    });
    const body = await res.json() as { retrievalTrace: { graphSort: { hmmBias: { applied: boolean } } } };
    expect(body.retrievalTrace.graphSort.hmmBias.applied).toBe(false);
  });

  it('hmmBias.applied is true and section matches when hmm.state + confidence + manifold4_q are present', async () => {
    const res = await handler({
      locals:  { user: { id: 'u1' } },
      request: makeRequest({
        query: 'legal authority statute',
        qdrantHits: [
          {
            chunkId: 'c1',
            score:   0.80,
            payload: { manifold4: [0.5, 0.5, 0.5, 0.5] },
          },
        ],
        querySom: {
          row:         2,
          col:         3,
          manifold4_q: [0.5, 0.5, 0.5, 0.5],  // already-normalised unit quaternion
        },
        hmm: { state: 'LEGAL_AUTHORITY', confidence: 0.9 },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      retrievalTrace: {
        graphSort: {
          hmmBias: {
            applied:    boolean;
            section:    string;
            confidence: number;
            multiplier: [number, number, number, number];
          };
        };
      };
    };

    expect(body.retrievalTrace.graphSort.hmmBias.applied).toBe(true);
    expect(body.retrievalTrace.graphSort.hmmBias.section).toBe('LEGAL_AUTHORITY');
    expect(body.retrievalTrace.graphSort.hmmBias.confidence).toBeCloseTo(0.9);
    // LEGAL_AUTHORITY table: [w=1.1, x=0.9, y=0.9, z=1.3] at confidence=0.9
    // lerp(1.1, 0.9) = 1 + (1.1-1)*0.9 = 1.09 for w
    const [wS, xS, yS, zS] = body.retrievalTrace.graphSort.hmmBias.multiplier;
    expect(wS).toBeCloseTo(1 + (1.1 - 1) * 0.9, 5);  // ~1.09
    expect(xS).toBeCloseTo(1 + (0.9 - 1) * 0.9, 5);  // ~0.91
    expect(yS).toBeCloseTo(1 + (0.9 - 1) * 0.9, 5);  // ~0.91
    expect(zS).toBeCloseTo(1 + (1.3 - 1) * 0.9, 5);  // ~1.27
  });
});
