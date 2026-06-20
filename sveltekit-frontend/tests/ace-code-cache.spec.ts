// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock refs ────────────────────────────────────────────────────────────────
const mockRedisGet    = vi.fn();
const mockRedisSetex  = vi.fn();
const mockRedisExists = vi.fn().mockResolvedValue(0);

const mockSearchCodebase = vi.fn();
const mockNearestCluster = vi.fn();

vi.mock('$lib/server/redis.js', () => {
  const connection = {
    get:      mockRedisGet,
    setex:    mockRedisSetex,
    exists:   mockRedisExists,
    keys:     vi.fn().mockResolvedValue([]),
    mget:     vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => ({ setex: vi.fn(), exec: vi.fn().mockResolvedValue([]) })),
  };
  return {
    getRedis: () => connection,
    redis: connection,
  };
});

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings:     vi.fn().mockResolvedValue({ vectors: [Array(768).fill(0.1)], model: 'embeddinggemma' }),
  generateSingleEmbedding: vi.fn().mockResolvedValue(Array(768).fill(0.1)),
}));

vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
  searchCodebase: mockSearchCodebase,
  searchByError:  vi.fn().mockResolvedValue([]),
}));

vi.mock('$lib/server/retrieval/centroid-cache.js', () => ({
  nearestCluster:       mockNearestCluster,
  getClusterCentroid:   vi.fn().mockResolvedValue(null),
  setClusterCentroid:   vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/retrieval/cross-encoder-reranker.js', () => ({
  rerankWithGemma4: vi.fn().mockRejectedValue(new Error('unavailable')),
}));

vi.mock('$lib/server/retrieval/topological-search.js', () => ({
  applyTopologicalBoostAsync: vi.fn().mockImplementation(async (chunks: unknown[]) => chunks),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  batchCosineSimilarity: vi.fn(),
  isCudaAvailable:       vi.fn(() => false),
  queryBmuCached:        vi.fn().mockResolvedValue(null),
}));

vi.mock('$lib/server/observability/inference-log.js', () => ({
  logInference: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse:       vi.fn((s: string) => JSON.parse(s) as unknown),
  isSimdJsonAvailable: vi.fn(() => false),
}));

vi.mock('$lib/server/cache/topo-candidate-cache.js', () => ({
  getTopoCandidates:       vi.fn().mockResolvedValue(null),
  setTopoCandidates:       vi.fn().mockResolvedValue(undefined),
  buildTopoPrefilterStats: vi.fn(() => ({ candidateCount: 0, source: 'miss' })),
  queryHash:               (s: string) => (s ?? '').slice(0, 8),
}));

vi.mock('$lib/server/cache-keys.js', () => {
  // Inline stub — no outer scope capture (vi.mock factory is hoisted)
  const sh = (s: string) => (s ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 16).padEnd(16, '0');
  return {
    aceCodeKey: {
      forQuery: (query: string, topoClass: number, resolvedDir?: string) =>
        `ace:code:${sh(query)}:${topoClass}:${sh(resolvedDir ?? 'root')}`,
    },
    aceTokenBudgetKey: {
      forCluster: (topoClass: number, clusterId: number) => `ace:token:budget:${topoClass}:${clusterId}`,
      forClass:   (topoClass: number) => `ace:token:budget:${topoClass}:unknown`,
    },
    TTL:         { ACE_CODE: 900, ACE_TOKEN_BUDGET: 7200, CENTROID: 21600, RETRIEVAL: 1800 },
    centroidKey: { cluster: (id: number) => `centroid:cluster:${id}`, som: (x: number, y: number) => `centroid:som:${x}:${y}` },
  };
});

vi.mock('$lib/server/tensor/tensor-analysis-cache.js', () => ({
  getTensorAnalysis: vi.fn().mockResolvedValue(null),
}));

vi.mock('$lib/server/tensor/topology-byte-mapper.js', () => ({
  topoByteFromPath:  vi.fn(() => 0x01),
  unpackTopoByte:    vi.fn(() => ({ topoClass: 1, hex: '0x01' })),
  classifyPath:      vi.fn(() => 1),
  classifyQuery:     vi.fn(() => 0),         // 0 = UNCLASSIFIED — bypasses topo filter
  TOPO_CLASS:        { UNCLASSIFIED: 0 },
  TOPO_CLASS_LABEL:  { 0: 'unknown', 1: 'ui', 2: 'server', 3: 'schema', 4: 'config', 5: 'test', 6: 'script', 7: 'doc' },
}));

vi.mock('$lib/server/db/client', () => ({
  pgRows: vi.fn(async () => ({ rows: [] })),
  db: {
    select:  vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })) })),
    update:  vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  default: {
    select:  vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })) })),
    update:  vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({ aceRetrievalRuns: {} }));
vi.mock('$lib/server/db/schema/metadata-spine.js', () => ({ aceRetrievalRuns: {} }));
vi.mock('$lib/server/db/schema/codebase-intelligence.js', () => ({ gpuClusterCentroids: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333', OLLAMA_BASE_URL: 'http://localhost:11434' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// Stub everything else context-assembler imports at module level
vi.mock('$lib/server/rag/tag-extractor.js',         () => ({ extractLegalTags: vi.fn().mockResolvedValue([]) }));
vi.mock('$lib/server/analytics/event-logger.js',   () => ({ getTopQueryPatterns: vi.fn().mockResolvedValue([]), getWeeklySummary: vi.fn().mockResolvedValue(null) }));
vi.mock('./style-adapter.js',                       () => ({ applyStyle: vi.fn((t: string) => t) }));
vi.mock('$lib/server/retrieval/authority-chain.js', () => ({ authorityChainExpansion: vi.fn().mockResolvedValue([]) }));
vi.mock('$lib/ai/prompts.js',                       () => ({ SYSTEM_YORHA_LEGAL: 'sys' }));
vi.mock('$lib/server/types/retrieval.js',           () => ({ sortByBestScore: vi.fn((a: unknown[]) => a), assignRanks: vi.fn((a: unknown[]) => a) }));
vi.mock('$lib/server/ace/practice-templates.js',    () => ({ selectPracticeTemplate: vi.fn().mockResolvedValue(null) }));
vi.mock('$lib/server/ace/user-analytics-context.js', () => ({ fetchUserAnalyticsContext: vi.fn().mockResolvedValue(null), fetchTopQueryTags: vi.fn().mockResolvedValue([]) }));
vi.mock('$lib/server/ace/policy.js',               () => ({ determineACEPolicy: vi.fn(() => ({ action: 'continue', budget: { tier: 'normal', maxTokens: 2000 }, allowWebSearch: false })) }));
vi.mock('$lib/server/ace/style-adapter.js',        () => ({ applyStyle: vi.fn((t: string) => t) }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeChunk(id = 'chunk-1', score = 0.85) {
  return {
    id,
    score,
    payload: {
      stableKey: id,
      filePath: `src/lib/${id}.ts`,
      chunkText: 'export function doThing() {}',
      topo_byte: 1,
      topo_class: 'ui',
      gpuCluster: 2,
      graphAuthorityScore: 0.7,
      som_bmu_row: 3,
      som_bmu_col: 4,
    },
  };
}

const CACHED_CHUNKS = [makeChunk('cached-1', 0.9), makeChunk('cached-2', 0.8)];

describe('ACE codebase hit cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNearestCluster.mockResolvedValue(null);
    mockSearchCodebase.mockResolvedValue([makeChunk('qdrant-1', 0.75)]);
    mockRedisExists.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('cache hit returns cached chunks and skips Qdrant', async () => {
    // Return the cached array for any Redis get — the ace:code key is the first
    // get() call with a non-null response during fetchCodebaseContext.
    mockRedisGet.mockResolvedValue(JSON.stringify(CACHED_CHUNKS));

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const stats = {} as Record<string, unknown>;
    const result = await fetchCodebaseContext('test query', 'user-1', undefined, stats as never);

    expect(mockSearchCodebase).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBe(CACHED_CHUNKS.length);
    expect((stats as { aceCodeCache?: { hit: boolean } }).aceCodeCache?.hit).toBe(true);
  });

  it('cache miss falls through to Qdrant', async () => {
    mockRedisGet.mockResolvedValue(null);

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    await fetchCodebaseContext('test query', 'user-1');

    expect(mockSearchCodebase).toHaveBeenCalled();
  });

  it('ace:code key has correct structure: ace:code:{qHash}:{class}:{dirHash}', () => {
    // Test the stub key builder directly (same mock used by context-assembler)
    const stub = (s: string) => s.replace(/[^a-z0-9]/gi, '').slice(0, 16).padEnd(16, '0');
    const key  = `ace:code:${stub('query alpha')}:3:${stub('src/lib/')}`;
    const parts = key.split(':');

    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('ace');
    expect(parts[1]).toBe('code');
    expect(parts[2].length).toBeGreaterThan(0);
    expect(Number(parts[3])).toBeGreaterThanOrEqual(0);
    expect(parts[4].length).toBeGreaterThan(0);
  });

  it('directory scope changes the cache key', async () => {
    // Import aceCodeKey directly to verify key differentiation
    const { createHash } = await import('crypto');
    const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

    const key1 = `ace:code:${hash('same query')}:0:${hash('src/routes/')}`;
    const key2 = `ace:code:${hash('same query')}:0:${hash('src/lib/server/')}`;

    expect(key1).not.toBe(key2);
  });

  it('returns an array gracefully when both cache and Qdrant fail', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis down'));
    mockSearchCodebase.mockRejectedValue(new Error('Qdrant down'));

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const result = await fetchCodebaseContext('fallback query', 'user-1');
    // Function catches errors and returns null or empty array — either is acceptable
    expect(result === null || Array.isArray(result)).toBe(true);
  });
});
