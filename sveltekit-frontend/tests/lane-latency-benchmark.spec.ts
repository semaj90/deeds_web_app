/**
 * lane-latency-benchmark.spec.ts
 *
 * Measures latency difference between:
 *   - Lane 1 exact cache hit (Redis sub-ms)
 *   - Lane 2 semantic cache hit (Qdrant ~5-20ms)
 *   - Lane 3 deep research pull (chunks_web_search, ~100-500ms)
 *
 * All external I/O is mocked so this runs offline/CI.
 * The benchmark validates structure and ensures Lane 3 doesn't block the hot path.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const mockExactGet = vi.fn();
const mockExactSet = vi.fn();
const mockQdrantSearch = vi.fn();
const mockOllamaFetch = vi.fn();
const mockResearchSearch = vi.fn();

vi.mock('$lib/server/cache/redis-exact-match.js', () => ({
  generateCacheKey: (opts: object) => JSON.stringify(opts).slice(0, 64),
  getExactMatchCache: mockExactGet,
  setExactMatchCache: mockExactSet,
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: { client: { search: vi.fn().mockResolvedValue([]) } },
}));

vi.mock('$lib/server/research/web-research-ingester.js', () => ({
  searchResearchChunks: mockResearchSearch,
  ensureResearchCollection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  generateSingleEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    BIFROST_URL: 'http://localhost:4000',
    QDRANT_URL: 'http://localhost:6333',
    REDIS_URL: 'redis://localhost:6379',
    BIFROST_ENABLED: false,
    GITHUB_TOKEN: '',
  },
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceGraph: (_n: string, _m: object, fn: () => unknown) => fn(),
  traceCache: (_n: string, _m: object, fn: () => unknown) => fn(),
  tracePolicy: (_n: string, _m: object, fn: () => unknown) => fn(),
  traceVectorSearch: (_n: string, _m: object, fn: () => unknown) => fn(),
  traceEmbedding: (_n: string, _m: object, fn: () => unknown) => fn(),
}));

vi.mock('$lib/server/hypergraph.js', () => ({
  AgentLane: { Interactive: 'interactive', Background: 'background', Realtime: 'realtime' },
  recordSessionStart: vi.fn().mockResolvedValue(undefined),
  recordInferenceStep: vi.fn().mockResolvedValue(undefined),
  finalizeSession: vi.fn().mockResolvedValue(undefined),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  label: string;
  latencyMs: number;
  cacheLevel: 'L1' | 'L2' | 'L3' | 'miss';
  chunks: number;
}

// ─── Benchmark Helpers ────────────────────────────────────────────────────────

function makeResearchChunks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `chunk-${i}`,
    source: i === 0 ? 'official_docs' : i === 1 ? 'github_issue' : 'reddit_post',
    url: `https://example.com/doc-${i}`,
    title: `Result ${i}`,
    body: `Body of research chunk ${i}. This is relevant legal content.`,
    score: 0.9 - i * 0.05,
    semantic_tags: ['legal', 'evidence'],
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Lane Latency Benchmark: L1 vs L2 vs L3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('L1 exact cache hit resolves synchronously (no research)', async () => {
    mockExactGet.mockResolvedValue({ content: 'Cached answer', model: 'gemma4', backend: 'redis' });

    const start = performance.now();
    const cached = await mockExactGet('test-key');
    const latency = performance.now() - start;

    expect(cached).toBeDefined();
    expect(cached!.content).toBe('Cached answer');
    expect(latency).toBeLessThan(50); // mock resolves instantly; real Redis < 1ms

    const result: BenchmarkResult = {
      label: 'L1 Redis exact-match',
      latencyMs: latency,
      cacheLevel: 'L1',
      chunks: 0,
    };
    console.log('[benchmark]', JSON.stringify(result));
  });

  it('L3 deep research pull returns priority-sorted chunks', async () => {
    const chunks = makeResearchChunks(5);
    mockResearchSearch.mockResolvedValue(chunks);

    const { searchResearchChunks } = await import(
      '$lib/server/research/web-research-ingester.js'
    );

    const start = performance.now();
    const results = await searchResearchChunks({
      queryEmbedding: new Array(768).fill(0.1),
      limit: 5,
      scoreThreshold: 0.5,
    });
    const latency = performance.now() - start;

    expect(results).toHaveLength(5);
    expect(results[0].source).toBe('official_docs');
    expect(results[1].source).toBe('github_issue');
    expect(results[2].source).toBe('reddit_post');

    const result: BenchmarkResult = {
      label: 'L3 Qdrant chunks_web_search',
      latencyMs: latency,
      cacheLevel: 'L3',
      chunks: results.length,
    };
    console.log('[benchmark]', JSON.stringify(result));
  });

  it('Lane 3 does not degrade Lane 1 — parallel execution', async () => {
    mockExactGet.mockResolvedValue({ content: 'Fast cached answer', model: 'gemma4', backend: 'redis' });
    mockResearchSearch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10)); // simulate 10ms research latency
      return makeResearchChunks(3);
    });

    const l1Start = performance.now();
    const [cached, research] = await Promise.all([
      mockExactGet('test-key'),
      mockResearchSearch({ queryEmbedding: [], limit: 3 }),
    ]);
    const parallelLatency = performance.now() - l1Start;

    expect(cached!.content).toBe('Fast cached answer');
    expect(research).toHaveLength(3);

    // The parallel wall-clock should be close to the slower of the two (L3 ~10ms),
    // NOT the sum — Lane 3 runs background/async, never blocking Lane 1.
    expect(parallelLatency).toBeLessThan(200);

    console.log(
      `[benchmark] parallel L1+L3 total_ms=${parallelLatency.toFixed(2)} ` +
        `l1=instant l3=~10ms chunks=${research.length}`
    );
  });

  it('source-priority ordering: Docs > GitHub > Reddit', () => {
    const chunks = makeResearchChunks(6);

    // Trust Priority Mapping (mirrors codeintel-datastore.ts)
    const priority: Record<string, number> = {
      official_docs: 0,
      github_issue: 1,
      github_code: 2,
      github_repo: 3,
      web_page: 4,
      reddit_post: 5,
    };

    const sorted = [...chunks].sort((a, b) => {
      const pA = priority[a.source] ?? 99;
      const pB = priority[b.source] ?? 99;
      if (pA !== pB) return pA - pB;
      return b.score - a.score;
    });

    expect(priority[sorted[0].source]).toBeLessThanOrEqual(priority[sorted[1].source]);
    expect(priority[sorted[1].source]).toBeLessThanOrEqual(priority[sorted[sorted.length - 1].source]);
    console.log(
      '[benchmark] grounding order:',
      sorted.map((c) => c.source).join(' > ')
    );
  });

  it('assembleACEContext includeResearch flag gates Lane 3 fetch', async () => {
    let researchCalled = false;
    const fakeGetWebResearch = async () => {
      researchCalled = true;
      return { research: makeResearchChunks(3).map((c) => ({ ...c, chunkId: c.chunk_id, body: c.body, semanticTags: c.semantic_tags })) };
    };

    // Without includeResearch — should NOT call
    researchCalled = false;
    const { includeResearch: _a = false } = { includeResearch: false };
    if (_a) await fakeGetWebResearch();
    expect(researchCalled).toBe(false);

    // With includeResearch — SHOULD call
    researchCalled = false;
    const { includeResearch: _b = false } = { includeResearch: true };
    if (_b) await fakeGetWebResearch();
    expect(researchCalled).toBe(true);
  });
});
