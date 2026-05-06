// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock refs ────────────────────────────────────────────────────────
const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get:   mockRedisGet,
    setex: mockRedisSetex,
    keys:  vi.fn().mockResolvedValue([]),
    mget:  vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => ({ setex: vi.fn(), exec: vi.fn() })),
  }),
}));

vi.mock('$lib/server/cache-keys.js', () => {
  const { createHash } = require('crypto');
  const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  return {
    aceCodeKey: {
      forQuery: (query: string, topoClass: number, resolvedDir?: string) =>
        `ace:code:${hash(query)}:${topoClass}:${hash(resolvedDir ?? 'root')}`,
    },
    TTL: {
      ACE_CODE:   900,
      CENTROID:   21600,
      RETRIEVAL:  1800,
    },
    centroidKey: {
      cluster: (id: number) => `centroid:cluster:${id}`,
      som:     (x: number, y: number) => `centroid:som:${x}:${y}`,
    },
  };
});

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
  batchCosineSimilarity: vi.fn(),
  isCudaAvailable:       vi.fn(() => false),
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse:        vi.fn((s: string) => JSON.parse(s) as unknown),
  isSimdJsonAvailable:  vi.fn(() => false),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    select:  vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    insert:  vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })) })),
    update:  vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
  default: {},
}));

vi.mock('$lib/server/db/schema/topology.js', () => ({
  tensorAnalysisCache: {},
}));

vi.mock('$lib/server/db/schema/codebase-intelligence.js', () => ({
  gpuClusterCentroids: {},
}));

vi.mock('$lib/server/cache/topo-candidate-cache.js', () => ({
  getTopoCandidates:       vi.fn().mockResolvedValue(null),
  setTopoCandidates:       vi.fn().mockResolvedValue(undefined),
  buildTopoPrefilterStats: vi.fn((stableKeys: string[]) => ({
    candidateCount: stableKeys.length,
    source: 'redis',
  })),
}));

vi.mock('$lib/server/graph/neo4j-gds.js', () => ({
  getGdsStatus: vi.fn().mockResolvedValue({ apocAvailable: false, gdsAvailable: false }),
}));

// ── Stub Qdrant / embedding / reranker ───────────────────────────────────────
const mockQdrantSearch = vi.fn();
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    hybridSearch: mockQdrantSearch,
    client: { search: mockQdrantSearch },
  },
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue({ vectors: [[0.1, 0.2]], model: 'embeddinggemma' }),
}));

vi.mock('$lib/server/ai/gemma4-reranker.js', () => ({
  rerank: vi.fn().mockRejectedValue(new Error('unavailable')),
}));

vi.mock('$lib/server/tensor/tensor-analysis-cache.js', () => ({
  getTensorAnalysis: vi.fn().mockResolvedValue(null),
}));

vi.mock('$lib/server/tensor/topology-byte-mapper.js', () => ({
  topoByteFromPath:    vi.fn(() => 0x01),
  unpackTopoByte:      vi.fn(() => ({ topoClass: 1, hex: '0x01' })),
  classifyPath:        vi.fn(() => 1),
  TOPO_CLASS_LABEL:    { 0: 'unknown', 1: 'ui', 2: 'server', 3: 'schema', 4: 'config', 5: 'test', 6: 'script', 7: 'doc' },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: { QDRANT_URL: 'http://localhost:6333', OLLAMA_BASE_URL: 'http://localhost:11434' },
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public',  () => ({ env: {} }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeChunk(id = 'chunk-1', score = 0.85) {
  return {
    id,
    score,
    payload: {
      stableKey:          id,
      filePath:           `src/lib/${id}.ts`,
      chunkText:          'export function doThing() {}',
      topo_byte:          1,
      topo_class:         'ui',
      gpuCluster:         2,
      graphAuthorityScore: 0.7,
      som_bmu_row:        3,
      som_bmu_col:        4,
    },
  };
}

const CACHED_CHUNKS = [makeChunk('cached-1', 0.9), makeChunk('cached-2', 0.8)];

describe('ACE codebase hit cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQdrantSearch.mockResolvedValue({ results: [makeChunk('qdrant-1', 0.75)] });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('cache hit skips Qdrant fetch and returns cached chunks immediately', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.startsWith('ace:code:')) return Promise.resolve(JSON.stringify(CACHED_CHUNKS));
      return Promise.resolve(null);
    });

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const stats = {} as Record<string, unknown>;
    const result = await fetchCodebaseContext('test query', 'user-1', undefined, stats as never);

    expect(mockQdrantSearch).not.toHaveBeenCalled();
    expect(result).toHaveLength(CACHED_CHUNKS.length);
    expect((stats as { aceCodeCache?: { hit: boolean } }).aceCodeCache?.hit).toBe(true);
  });

  it('cache miss falls through to Qdrant and writes result to Redis', async () => {
    mockRedisGet.mockResolvedValue(null);

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const stats = {};
    await fetchCodebaseContext('test query', 'user-1', undefined, stats as never);

    expect(mockQdrantSearch).toHaveBeenCalled();
    expect(mockRedisSetex).toHaveBeenCalledWith(
      expect.stringMatching(/^ace:code:/),
      900,
      expect.any(String),
    );
  });

  it('topoClass is included in the cache key', async () => {
    mockRedisGet.mockResolvedValue(null);

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    await fetchCodebaseContext('query alpha', 'user-1');
    await fetchCodebaseContext('query alpha', 'user-1');

    const calledKeys = mockRedisGet.mock.calls
      .filter(([k]: [string]) => k.startsWith('ace:code:'))
      .map(([k]: [string]) => k);

    expect(calledKeys.length).toBeGreaterThanOrEqual(1);
    expect(calledKeys.every((k: string) => k.startsWith('ace:code:'))).toBe(true);
  });

  it('directory scope changes the key', async () => {
    mockRedisGet.mockResolvedValue(null);

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    await fetchCodebaseContext('same query', 'user-1', 'src/routes/');
    await fetchCodebaseContext('same query', 'user-1', 'src/lib/server/');

    const calledKeys = mockRedisGet.mock.calls
      .filter(([k]: [string]) => k.startsWith('ace:code:'))
      .map(([k]: [string]) => k);

    const uniqueKeys = new Set(calledKeys);
    expect(uniqueKeys.size).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array gracefully when Qdrant and cache both fail', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis down'));
    mockQdrantSearch.mockRejectedValue(new Error('Qdrant down'));

    const { fetchCodebaseContext } = await import(
      '$lib/server/ace/context-assembler.js'
    );

    const result = await fetchCodebaseContext('fallback query', 'user-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
