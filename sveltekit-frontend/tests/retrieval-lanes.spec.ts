// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockQuery = vi.fn();
  return { mockGet, mockQuery };
});

describe('retrieval-lanes: runRetrievalLanes', () => {
  const redis = { get: mocks.mockGet } as any;
  const pool = { query: mocks.mockQuery } as any;

  let runRetrievalLanes: (typeof import('$lib/server/ace/retrieval-lanes.js'))['runRetrievalLanes'];
  let mergeContextHits: (typeof import('$lib/server/ace/retrieval-lanes.js'))['mergeContextHits'];

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.mockQuery.mockResolvedValue({ rows: [] });
    mocks.mockGet.mockResolvedValue(null);
    const mod = await import('$lib/server/ace/retrieval-lanes.js');
    runRetrievalLanes = mod.runRetrievalLanes;
    mergeContextHits = mod.mergeContextHits;
  });

  it('merges hits from all lanes when all succeed', async () => {
    mocks.mockGet.mockResolvedValue(
      JSON.stringify([{ id: 'c1', filePath: 'src/lib/server/cache.ts', text: 'cache context', score: 0.9 }])
    );
    mocks.mockQuery.mockResolvedValue({
      rows: [{ id: 'p1', text: 'pg result', file_path: 'src/lib/server/db.ts', score: 0.6 }],
    });

    const result = await runRetrievalLanes({ query: 'how does redis caching work', pool, redis });

    expect(result.lanes).toHaveLength(4);
    expect(result.lanes.map((l) => l.lane)).toEqual(
      expect.arrayContaining(['redis_ace', 'postgres_trigram', 'ast_symbol', 'som_topology'])
    );
    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.totalHits).toBeGreaterThan(0);
    expect(typeof result.durationMs).toBe('number');
    expect(Array.isArray(result.topFiles)).toBe(true);
    expect(Array.isArray(result.topSymbols)).toBe(true);
  });

  it('returns degraded postgres_trigram lane when pool throws', async () => {
    mocks.mockQuery.mockRejectedValue(new Error('pg connection refused'));
    mocks.mockGet.mockResolvedValue(
      JSON.stringify([{ id: 'c2', filePath: 'src/a.ts', text: 'redis hit', score: 0.85 }])
    );

    const result = await runRetrievalLanes({ query: 'how does caching work', pool, redis });

    const pgLane = result.lanes.find((l) => l.lane === 'postgres_trigram');
    expect(pgLane?.degraded).toBe(true);
    expect(pgLane?.reason).toBeTruthy();

    const redisLane = result.lanes.find((l) => l.lane === 'redis_ace');
    expect(redisLane?.degraded).toBe(false);
    expect(redisLane?.hits.length).toBeGreaterThan(0);
  });

  it('degrades redis-dependent lanes when redis is undefined', async () => {
    mocks.mockQuery.mockResolvedValue({
      rows: [{ id: 'p2', text: 'pg only result', file_path: null, score: 0.55 }],
    });

    const result = await runRetrievalLanes({ query: 'postgres schema drift', pool, redis: undefined });

    expect(result.lanes.find((l) => l.lane === 'redis_ace')?.degraded).toBe(true);
    expect(result.lanes.find((l) => l.lane === 'ast_symbol')?.degraded).toBe(true);
    expect(result.lanes.find((l) => l.lane === 'som_topology')?.degraded).toBe(true);
    expect(result.lanes.find((l) => l.lane === 'postgres_trigram')?.degraded).toBe(false);
    expect(result.lanes).toHaveLength(4);
  });

  it('handles redis cache miss gracefully with no error', async () => {
    mocks.mockGet.mockResolvedValue(null);
    mocks.mockQuery.mockResolvedValue({ rows: [] });

    const result = await runRetrievalLanes({ query: 'vector embedding cache', pool, redis });

    const redisLane = result.lanes.find((l) => l.lane === 'redis_ace');
    expect(redisLane?.degraded).toBe(false);
    expect(redisLane?.hits).toHaveLength(0);
    expect(result).toMatchObject({
      lanes: expect.any(Array),
      merged: expect.any(Array),
      totalHits: expect.any(Number),
      durationMs: expect.any(Number),
    });
  });

  it('deduplicates hits sharing the same filePath, keeping highest weighted score', () => {
    const SHARED_PATH = 'src/lib/server/ace/context-assembler.ts';
    const lanes = [
      {
        lane: 'redis_ace' as const,
        degraded: false,
        latencyMs: 10,
        hits: [{ id: 'h1', filePath: SHARED_PATH, source: 'redis_ace' as const, text: 'redis hit', score: 0.9 }],
      },
      {
        lane: 'postgres_trigram' as const,
        degraded: false,
        latencyMs: 15,
        hits: [{ id: 'h2', filePath: SHARED_PATH, source: 'postgres_trigram' as const, text: 'pg hit', score: 0.7 }],
      },
    ];

    const merged = mergeContextHits(lanes);

    const byPath = merged.filter((h) => h.filePath === SHARED_PATH);
    expect(byPath).toHaveLength(1);
    // redis_ace weight=1.0 → 0.9 beats postgres_trigram weight=0.75 → 0.525
    expect(byPath[0].source).toBe('redis_ace');
  });

  it('returns context from trigram lane when all redis lanes miss', async () => {
    mocks.mockGet.mockResolvedValue(null);
    mocks.mockQuery.mockResolvedValue({
      rows: [{ id: 'doc1', text: 'statute context', file_path: 'src/routes/api/statutes/+server.ts', score: 0.45 }],
    });

    const result = await runRetrievalLanes({ query: 'statute search implementation', pool, redis });

    const pgLane = result.lanes.find((l) => l.lane === 'postgres_trigram');
    expect(pgLane?.hits.length).toBeGreaterThan(0);
    expect(result.merged.some((h) => h.source === 'postgres_trigram')).toBe(true);
  });

  it('ast_symbol lane returns scored hits when query contains a src/ file path', async () => {
    const SRC_PATH = 'src/lib/server/ace/retrieval-lanes.ts';
    mocks.mockGet.mockImplementation(async (key: string) => {
      if (key.startsWith('code:graph:node:')) {
        return JSON.stringify({ file_path: SRC_PATH, directFanIn: 20, text: 'retrieval lane module' });
      }
      return null;
    });
    mocks.mockQuery.mockResolvedValue({ rows: [] });

    const result = await runRetrievalLanes({
      query: `how does ${SRC_PATH} handle degradation`,
      pool,
      redis,
    });

    const astLane = result.lanes.find((l) => l.lane === 'ast_symbol');
    expect(astLane?.degraded).toBe(false);
    expect(astLane?.hits.length).toBeGreaterThan(0);
    // score = min(0.5 + 20/100, 0.9) = 0.7
    expect(astLane?.hits[0].score).toBeCloseTo(0.7, 2);
  });

  it('returns all required fields with correct types even when every lane throws', async () => {
    mocks.mockGet.mockRejectedValue(new Error('redis dead'));
    mocks.mockQuery.mockRejectedValue(new Error('pg dead'));

    const result = await runRetrievalLanes({ query: 'anything', pool, redis });

    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.totalHits).toBe('number');
    expect(Array.isArray(result.lanes)).toBe(true);
    expect(Array.isArray(result.merged)).toBe(true);
    expect(Array.isArray(result.topFiles)).toBe(true);
    expect(Array.isArray(result.topSymbols)).toBe(true);
    expect(result.lanes).toHaveLength(4);
    for (const lane of result.lanes) {
      expect(typeof lane.degraded).toBe('boolean');
      expect(Array.isArray(lane.hits)).toBe(true);
    }
  });
});
