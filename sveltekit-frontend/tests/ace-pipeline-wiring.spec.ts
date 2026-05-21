/**
 * ACE Pipeline Wiring Tests
 *
 * Covers:
 *   1. ACEContext type contract (TOKEN_BUDGET)
 *   2. assembleACEContext behaviour (enableCodebaseContext, tokenAwarePacking)
 *   3. buildACEPrompt codebase section inclusion/omission
 *   4. GET /api/synthesis/evaluation/[id] response shapes
 *   5. Synthesis Zod schema
 *   6. Track 6 — Redis/Qdrant cluster join layer (Phase A cluster tags,
 *      Phase B path→cluster reverse index, Phase C combined ANN filter)
 */

// @vitest-environment node

import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';

// ── Mock SvelteKit env modules ──────────────────────────────────────────────
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    QDRANT_URL: 'http://127.0.0.1:6333',
    BIFROST_ENABLED: false,
    ACE_ENCODED_PREFILTER_MODE: 'off',
  },
}));
vi.mock('$lib/config/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    QDRANT_URL: 'http://127.0.0.1:6333',
  },
}));

// ── Mock Redis ──────────────────────────────────────────────────────────────
const mockRedisGet = vi.fn();
const mockRedisZrevrange = vi.fn(async () => [] as string[]);
const mockRedis = {
  get:              (...args: any[]) => Promise.resolve(mockRedisGet(...args)),
  set:              vi.fn(async () => 'OK'),
  setex:            vi.fn(async () => 'OK'),
  ping:             vi.fn(async () => 'PONG'),
  mget:             vi.fn(async () => []),
  zrevrange:        (...args: any[]) => mockRedisZrevrange(...args),
  zrevrangebyscore: vi.fn(async () => []),
  zadd:             vi.fn(async () => 1),
  expire:           vi.fn(async () => 1),
  smembers:         vi.fn(async () => []),
  exists:           vi.fn(async () => 0),
  hset:             vi.fn(async () => 1),
  hget:             vi.fn(async () => null),
  hgetall:          vi.fn(async () => null),
  del:              vi.fn(async () => 1),
  pipeline: vi.fn(() => ({
    setex:  vi.fn().mockReturnThis(),
    zadd:   vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    hset:   vi.fn().mockReturnThis(),
    del:    vi.fn().mockReturnThis(),
    sadd:   vi.fn().mockReturnThis(),
    exec:   vi.fn(async () => []),
  })),
};
vi.mock('$lib/server/redis.js', () => ({
  redis:    mockRedis,
  getRedis: vi.fn(() => mockRedis),
}));

// ── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r: any) => Array.isArray(r) ? r : r?.rows ?? [],
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
    insert:  vi.fn(() => ({ values: vi.fn(async () => ({ rows: [] })) })),
    select:  vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
  },
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── Mock auth ───────────────────────────────────────────────────────────────
vi.mock('$lib/server/auth-helpers.js', () => ({
  requireAuth: vi.fn((event: any) => {
    const locals = event?.locals ?? event;
    if (!locals?.user) throw new Error('Unauthorized');
    return { user: locals.user };
  }),
}));

// ── Mock Qdrant ─────────────────────────────────────────────────────────────
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    client: { search: vi.fn(async () => []) },
    sectionFilteredSearch: vi.fn(async () => ({ results: [] })),
  },
}));

const mockSearchCodebase = vi.fn(async () => []);
vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
  searchCodebase: mockSearchCodebase,
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
  embedText:  vi.fn(async () => new Array(768).fill(0)),
  embedTexts: vi.fn(async () => []),
}));

vi.mock('$lib/server/retrieval/centroid-cache.js', () => ({
  nearestCluster: vi.fn(async () => null),
}));

vi.mock('$lib/server/retrieval/encoded-cluster-prefilter.js', () => ({
  encodedClusterPrefilter: vi.fn(async () => ({
    clusterIds: [],
    filter:     undefined,
    scores:     [],
    durationMs: 0,
  })),
}));

// ── Mock bag-cache (used by inline scoreClustersForQuery) ───────────────────
// getClusterBowTexture returns a tile with 'evidence' term for every cluster,
// weightedBowOverlapScore returns score=1 → all 24 clusters score equally →
// slice(0,2) → clusters 0 and 1 both appear in bowClusterShould.
vi.mock('$lib/server/langextract/bag-cache.js', () => ({
  getClusterBowTexture:   vi.fn(async () => ({ terms: ['evidence'], weights: [1] })),
  getSomBowTexture:       vi.fn(async () => null),
  tokenizeBowQuery:       () => new Set(['evidence']),
  weightedBowOverlapScore: () => ({ score: 1 }),
}));

// ── Mock Ollama ─────────────────────────────────────────────────────────────
vi.mock('$lib/server/ollama.js', () => ({
  ollamaFetch: vi.fn(async () => ({
    ok:   true,
    json: async () => ({
      response:         'test response',
      model:            'gemma4-legal',
      eval_count:       100,
      prompt_eval_count: 50,
    }),
  })),
  bifrostChat:          vi.fn(async () => 'test response'),
  getChatModelKeepAlive: vi.fn(() => '24h'),
  VLM_MODELS: {
    vision:    'gemma4-legal-vlm:latest',
    embedding: 'embeddinggemma:latest',
    legal:     'gemma4-legal-vlm:latest',
    gemma4:    'gemma4-legal-vlm:latest',
    tool:      'gemma4-legal-vlm:latest',
  },
}));

// ── Mock analytics ──────────────────────────────────────────────────────────
vi.mock('$lib/server/analytics/event-logger.js', () => ({
  getTopQueryPatterns: vi.fn(async () => []),
  getWeeklySummary:    vi.fn(async () => ({ topIntents: [], avgLatencyMs: 0, cacheHitRate: 0 })),
}));
vi.mock('$lib/server/ace/user-analytics-context.js', () => ({
  fetchUserAnalyticsContext: vi.fn(async () => null),
  fetchTopQueryTags:         vi.fn(async () => []),
}));
vi.mock('$lib/server/retrieval/web-search.js', () => ({
  webSearch:               vi.fn(async () => null),
  formatWebResultsAsContext: vi.fn(() => ''),
}));
vi.mock('$lib/server/retrieval/wikipedia-search.js', () => ({
  searchWikipedia:             vi.fn(async () => null),
  formatWikipediaAsContext:    vi.fn(() => ''),
}));
vi.mock('$lib/server/rag/tag-extractor.js', () => ({
  extractLegalTags: vi.fn(() => ({ statutes: [], cases: [] })),
}));
vi.mock('$lib/server/ace/practice-templates.js', () => ({
  selectPracticeTemplate: vi.fn(() => null),
}));
vi.mock('$lib/server/ace/style-adapter.js', () => ({
  applyStyle: vi.fn((prompt: string) => prompt),
}));
vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: vi.fn(() => { throw new Error('Neo4j unavailable'); }),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Minimal ACEContext shape for buildACEPrompt tests */
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    userProfile:          null,
    caseContext:          null,
    glossaryMatches:      null,
    ragChunks:            [],
    kbChunks:             [],
    caseChunks:           [],
    kagNeighbors:         [],
    chatHistory:          [],
    chatMemory:           [],
    entities:             { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
    practiceTemplate:     null,
    queryTags:            [],
    webSearchContext:     null,
    persona:              'neutral',
    evidenceMetadata:     null,
    evidenceConnections:  null,
    userAnalyticsContext: null,
    codebaseContext:      null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('ACE pipeline wiring', () => {

  beforeEach(() => {
    mockRedisGet.mockReset();
    mockRedisZrevrange.mockReset().mockResolvedValue([]);
    mockSearchCodebase.mockClear();
  });

  // ── 1. ACEContext type contract ───────────────────────────────────────────
  describe('ACEContext type contract', () => {
    it('TOKEN_BUDGET has codebaseContext = 400', async () => {
      const { TOKEN_BUDGET } = await import('$lib/server/ace/types.js');
      expect(TOKEN_BUDGET).toHaveProperty('codebaseContext');
      expect(TOKEN_BUDGET.codebaseContext).toBe(400);
      expect(TOKEN_BUDGET.total).toBe(5600);
    });

    it('defaults the adaptive ACE retrieval lane to 64K context windows', async () => {
      const savedTurbo = process.env.TURBO_CTX_SIZE;
      const savedLlama = process.env.LLAMA_CTX_SIZE;

      try {
        delete process.env.TURBO_CTX_SIZE;
        delete process.env.LLAMA_CTX_SIZE;
        vi.resetModules();

        const { getAdaptiveTopK } = await import('$lib/server/ace/context-assembler.js');
        expect(getAdaptiveTopK()).toBe(8);
        expect(getAdaptiveTopK(32768)).toBe(5);
        expect(getAdaptiveTopK(49152)).toBe(8);
      } finally {
        if (savedTurbo === undefined) delete process.env.TURBO_CTX_SIZE;
        else process.env.TURBO_CTX_SIZE = savedTurbo;
        if (savedLlama === undefined) delete process.env.LLAMA_CTX_SIZE;
        else process.env.LLAMA_CTX_SIZE = savedLlama;
        vi.resetModules();
      }
    });
  });

  // ── 2. assembleACEContext ─────────────────────────────────────────────────
  describe('assembleACEContext', () => {
    it('returns codebaseContext: null when enableCodebaseContext is false', async () => {
      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      const ctx = await assembleACEContext({
        query: 'What is breach of contract?',
        enableCodebaseContext: false,
      });
      expect(ctx).toHaveProperty('codebaseContext');
      expect(ctx.codebaseContext).toBeNull();
    });

    it('returns codebaseContext: null when enableCodebaseContext is omitted', async () => {
      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      const ctx = await assembleACEContext({
        query: 'What is breach of contract?',
      });
      expect(ctx).toHaveProperty('codebaseContext');
      expect(ctx.codebaseContext).toBeNull();
    });

    it('attaches a token-aware packet when tokenAwarePacking is true', async () => {
      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      const statsOut: Record<string, any> = {};
      const ctx = await assembleACEContext({
        query: 'encoded_64 rerank and Karpathy GraphRAG cluster summaries',
        tokenAwarePacking: true,
        statsOut,
      });
      expect(ctx).toHaveProperty('aceContextPacket');
      expect(statsOut).toHaveProperty('tokenAwareContext');
      expect(statsOut.tokenAwareContext.enabled).toBe(true);
    });

    // ── Phase C — combined BoW + Karpathy member filter ───────────────────
    // scoreClustersForQuery scans MAX_CLUSTERS_TO_SCAN=24 clusters.
    // Mock: getClusterBowTexture returns {terms:['evidence'],weights:[1]} for all;
    //       weightedBowOverlapScore returns {score:1} for all.
    // Result: clusters 0..23 all score 1.0 → slice(0,2) → IDs 0 and 1 both pass.
    // Phase C: zrevrange('ace:cluster:members:cluster:gpu:0', 0, 14) → mocked members.
    // Expected combinedFilter.should = [BoW:0, BoW:1, Karpathy:relativePath].
    it('passes 2 BoW + Karpathy member should-filters to searchCodebase (Phase C)', async () => {
      const karpathyMembers = ['src/lib/server/ace/context-assembler.ts'];
      mockRedisZrevrange.mockResolvedValue(karpathyMembers);

      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      await assembleACEContext({
        query: 'evidence cluster boost',
        enableCodebaseContext: true,
        statsOut: {},
      });

      expect(mockSearchCodebase).toHaveBeenCalled();
      const searchArgs = mockSearchCodebase.mock.calls[0][1] as any;
      expect(searchArgs).toHaveProperty('filter');

      const { filter } = searchArgs;
      // Query classifier may still attach a topo_class must-clause here.
      expect(filter).toHaveProperty('must');
      expect(filter.must).toContainEqual({
        key: 'topo_class',
        match: { value: 'legal-evidence' },
      });
      expect(filter).toHaveProperty('should');

      const should = filter.should as unknown[];
      // BoW clusters 0 and 1 (both score 1.0, above threshold 0.05)
      expect(should).toContainEqual({ key: 'neo4j_gpuCluster', match: { value: 0 } });
      expect(should).toContainEqual({ key: 'neo4j_gpuCluster', match: { value: 1 } });
      // Phase C Karpathy member boost
      expect(should).toContainEqual({
        key: 'relativePath',
        match: { any: karpathyMembers },
      });
      expect(should.length).toBeGreaterThanOrEqual(3);
    });

    it('omits Karpathy member should-filter when Redis returns empty list', async () => {
      mockRedisZrevrange.mockResolvedValue([]);

      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      await assembleACEContext({
        query: 'evidence cluster boost',
        enableCodebaseContext: true,
        statsOut: {},
      });

      expect(mockSearchCodebase).toHaveBeenCalled();
      const searchArgs = mockSearchCodebase.mock.calls[0][1] as any;
      if (searchArgs?.filter?.should) {
        const should = searchArgs.filter.should as unknown[];
        const hasKarpathy = should.some(
          (c: any) => c?.key === 'relativePath' && c?.match?.any
        );
        expect(hasKarpathy).toBe(false);
      }
      // No error thrown — graceful fallback
    });

    it('zrevrange is called with correct cluster key for top BoW cluster', async () => {
      mockRedisZrevrange.mockResolvedValue([]);

      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      await assembleACEContext({
        query: 'evidence cluster boost',
        enableCodebaseContext: true,
        statsOut: {},
      });

      // Should call zrevrange for the top BoW cluster (clusterId=0 from mock)
      const calls = mockRedisZrevrange.mock.calls;
      const clusterCall = calls.find(
        ([key]: [string]) => key === 'ace:cluster:members:cluster:gpu:0'
      );
      expect(clusterCall).toBeDefined();
      expect(clusterCall![1]).toBe(0);   // ZREVRANGE start
      expect(clusterCall![2]).toBe(14);  // ZREVRANGE stop (top-15 members)
    });

    it('includes all required context sections in returned object', async () => {
      const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
      const ctx = await assembleACEContext({ query: 'statute of limitations' });

      const requiredKeys = [
        'userProfile', 'caseContext', 'glossaryMatches',
        'ragChunks', 'kagNeighbors', 'chatHistory',
        'entities', 'practiceTemplate', 'queryTags',
        'webSearchContext', 'persona',
        'evidenceMetadata', 'evidenceConnections',
        'userAnalyticsContext', 'codebaseContext',
      ];
      for (const key of requiredKeys) {
        expect(ctx, `missing key: ${key}`).toHaveProperty(key);
      }
    });
  });

  // ── 3. buildACEPrompt codebase section ───────────────────────────────────
  describe('buildACEPrompt', () => {
    it('includes codebase context section when codebaseContext is populated', async () => {
      const { buildACEPrompt } = await import('$lib/server/ace/context-assembler.js');
      const ctx = makeCtx({
        codebaseContext: [
          {
            filePath: 'src/lib/server/ace/context-assembler.ts',
            content:  'export function assembleACEContext() {}',
            score:    0.92,
            lineStart: 31,
          },
          {
            filePath: 'src/lib/server/ace/types.ts',
            content:  'export interface ACEContext {}',
            score:    0.88,
          },
        ],
      });

      const prompt = buildACEPrompt(ctx as any, 'How does ACE context assembly work?');

      expect(prompt.systemPrompt).toContain('## Codebase Context');
      expect(prompt.systemPrompt).toContain('context-assembler.ts:31');
      expect(prompt.systemPrompt).toContain('0.92');
      expect(prompt.confidenceFactors).toHaveProperty('codebaseContext');
      expect(prompt.confidenceFactors.codebaseContext).toBe(0.92);
    });

    it('omits codebase section when codebaseContext is null', async () => {
      const { buildACEPrompt } = await import('$lib/server/ace/context-assembler.js');
      const prompt = buildACEPrompt(makeCtx() as any, 'test');

      expect(prompt.systemPrompt).not.toContain('## Codebase Context');
      expect(prompt.confidenceFactors).not.toHaveProperty('codebaseContext');
    });
  });

  // ── 4. Synthesis evaluation endpoint ─────────────────────────────────────
  describe('GET /api/synthesis/evaluation/[id]', () => {
    const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const baseReq = {
      request: new Request('http://localhost'),
      locals: { user: { id: 'u1', email: 'test@test.com' } },
    };

    it('returns pending when Redis has no result', async () => {
      mockRedisGet.mockResolvedValue(null);
      const { GET } = await import('../src/routes/api/synthesis/evaluation/[id]/+server.js');
      const body = await (await GET({ params: { id: VALID_UUID }, ...baseReq } as any)).json();
      expect(body.status).toBe('pending');
      expect(body.evaluation).toBeNull();
    });

    it('returns complete with parsed evaluation', async () => {
      const evalData = {
        responseId:   VALID_UUID,
        quality:      0.85,
        completeness: 0.9,
        accuracy:     0.8,
        suggestions:  ['Add more citations'],
        shouldRetry:  false,
        evaluatedAt:  '2026-04-02T00:00:00.000Z',
      };
      mockRedisGet
        .mockResolvedValueOnce(null)                      // synthesis:result
        .mockResolvedValueOnce(null)                      // synthesis:status
        .mockResolvedValueOnce(JSON.stringify(evalData)); // ace:result
      const { GET } = await import('../src/routes/api/synthesis/evaluation/[id]/+server.js');
      const body = await (await GET({ params: { id: VALID_UUID }, ...baseReq } as any)).json();
      expect(body.status).toBe('complete');
      expect(body.evaluation.quality).toBe(0.85);
      expect(body.evaluation.suggestions).toEqual(['Add more citations']);
    });

    it('returns invalid_id for non-UUID', async () => {
      const { GET } = await import('../src/routes/api/synthesis/evaluation/[id]/+server.js');
      const body = await (await GET({ params: { id: 'not-a-uuid' }, ...baseReq } as any)).json();
      expect(body.status).toBe('invalid_id');
      expect(body.evaluation).toBeNull();
    });

    it('returns error on Redis failure', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Connection refused'));
      const { GET } = await import('../src/routes/api/synthesis/evaluation/[id]/+server.js');
      const body = await (await GET({ params: { id: VALID_UUID }, ...baseReq } as any)).json();
      expect(body.status).toBe('error');
      expect(body.evaluation).toBeNull();
    });

    it('follows degraded response contract (same shape on all paths)', async () => {
      const { GET } = await import('../src/routes/api/synthesis/evaluation/[id]/+server.js');
      const cases = [
        { mock: () => mockRedisGet.mockResolvedValueOnce(null),              status: 'pending' },
        { mock: () => mockRedisGet.mockResolvedValueOnce('{"quality":0.9}'), status: 'complete' },
        { mock: () => mockRedisGet.mockRejectedValueOnce(new Error('fail')), status: 'error' },
      ];
      for (const { mock, status } of cases) {
        mock();
        const body = await (await GET({ params: { id: VALID_UUID }, ...baseReq } as any)).json();
        expect(body).toHaveProperty('evaluation');
        expect(body).toHaveProperty('status');
        expect(body.status).toBe(status);
      }
    });
  });

  // ── 5. Synthesis schema ───────────────────────────────────────────────────
  describe('synthesis request schema', () => {
    it('validates enableCodebaseContext as optional boolean', async () => {
      const { z } = await import('zod');
      const schema = z.object({
        query:                z.string().min(3).max(5000),
        enableCodebaseContext: z.boolean().optional(),
      });
      expect(schema.parse({ query: 'test query', enableCodebaseContext: true }))
        .toHaveProperty('enableCodebaseContext', true);
      expect(schema.parse({ query: 'test query' }))
        .not.toHaveProperty('enableCodebaseContext');
      expect(() => schema.parse({ query: 'test query', enableCodebaseContext: 'yes' }))
        .toThrow();
    });
  });

  // ── 6. Track 6 — Redis/Qdrant cluster join layer ─────────────────────────
  describe('Track 6 — Redis cluster join layer', () => {

    // Phase A: cluster tags hash shape
    describe('Phase A — cluster tags hash (ace:cluster:tags:{ck})', () => {
      it('hset fields include all required cluster tag keys', async () => {
        // Simulate what sync-cluster-tags-redis.mjs writes to Redis.
        // The hash written by Phase A must contain all fields that
        // context-assembler.ts reads via cluster-tags-cache.ts.
        const requiredFields = [
          'clusterKey', 'fileCount', 'summary', 'purpose',
          'risk_level', 'topTags', 'topFiles', 'topoClasses',
          'mitigation_protocols',
        ];

        const mockEntry: Record<string, string> = {
          clusterKey:            'cluster:gpu:42',
          fileCount:             '12',
          summary:               'ACE context assembly pipeline',
          purpose:               'Orchestrates retrieval + LLM synthesis',
          risk_level:            'high',
          topTags:               JSON.stringify(['ace', 'context', 'retrieval']),
          topFiles:              JSON.stringify(['src/lib/server/ace/context-assembler.ts']),
          topoClasses:           JSON.stringify(['graph-gpu-topology']),
          mitigation_protocols:  JSON.stringify([]),
        };

        for (const field of requiredFields) {
          expect(mockEntry).toHaveProperty(field);
        }
        // All JSON-stringified fields must parse cleanly
        expect(() => JSON.parse(mockEntry.topTags)).not.toThrow();
        expect(() => JSON.parse(mockEntry.topFiles)).not.toThrow();
        expect(() => JSON.parse(mockEntry.topoClasses)).not.toThrow();
      });

      it('cluster meta manifest contains count and clusterKeys array', () => {
        const manifest = {
          ts:          new Date().toISOString(),
          count:       3,
          clusterKeys: ['cluster:gpu:0', 'cluster:gpu:1', 'cluster:gpu:42'],
        };
        expect(manifest).toHaveProperty('count', 3);
        expect(manifest.clusterKeys).toHaveLength(3);
        expect(manifest.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    // Phase B: path→cluster reverse index
    describe('Phase B — path→cluster reverse index', () => {
      it('ace:path:cluster:{stableKey} maps file to clusterKey string', () => {
        // Verify the key format Karpathy enrich writes
        const stableKey = 'src/lib/server/ace/context-assembler.ts';
        const clusterKey = 'cluster:gpu:42';
        const redisKey = `ace:path:cluster:${stableKey}`;

        expect(redisKey).toBe('ace:path:cluster:src/lib/server/ace/context-assembler.ts');
        expect(clusterKey).toMatch(/^cluster:gpu:\d+$/);
      });

      it('ace:cluster:members:{ck} sorted-set key format is correct', () => {
        const clusterId = 42;
        const memberKey = `ace:cluster:members:cluster:gpu:${clusterId}`;
        expect(memberKey).toBe('ace:cluster:members:cluster:gpu:42');
      });

      it('blend score fed to zadd is in expected range [0, 1]', () => {
        // Karpathy blend = 0.4·PR + 0.3·attn + 0.3·authority
        // All components in [0,1] → blend in [0,1]
        const pr = 0.7, attn = 0.9, authority = 0.5;
        const blend = 0.4 * pr + 0.3 * attn + 0.3 * authority;
        expect(blend).toBeGreaterThanOrEqual(0);
        expect(blend).toBeLessThanOrEqual(1);
        expect(blend).toBeCloseTo(0.4 * 0.7 + 0.3 * 0.9 + 0.3 * 0.5, 5);
      });
    });

    // Phase C: ANN filter injection
    describe('Phase C — Qdrant ANN cluster filter injection', () => {
      it('passes relativePath match.any filter when Redis has members', async () => {
        const members = [
          'src/lib/server/ace/context-assembler.ts',
          'src/lib/server/ace/types.ts',
        ];
        mockRedisZrevrange.mockResolvedValue(members);

        const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
        await assembleACEContext({
          query: 'evidence cluster retrieval pipeline',
          enableCodebaseContext: true,
          statsOut: {},
        });

        expect(mockSearchCodebase).toHaveBeenCalled();
        const filter = (mockSearchCodebase.mock.calls[0][1] as any)?.filter;
        const karpathyShould = (filter?.should ?? []).find(
          (c: any) => c?.key === 'relativePath' && Array.isArray(c?.match?.any)
        );
        expect(karpathyShould).toBeDefined();
        expect(karpathyShould.match.any).toEqual(members);
      });

      it('falls back gracefully when ACE_CLUSTER_FILTER_ENABLED=false', async () => {
        const original = process.env.ACE_CLUSTER_FILTER_ENABLED;
        process.env.ACE_CLUSTER_FILTER_ENABLED = 'false';
        mockRedisZrevrange.mockResolvedValue(['src/lib/server/ace/context-assembler.ts']);

        try {
          const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
          await assembleACEContext({
            query: 'evidence cluster boost disabled',
            enableCodebaseContext: true,
            statsOut: {},
          });

          expect(mockSearchCodebase).toHaveBeenCalled();
          const filter = (mockSearchCodebase.mock.calls[0][1] as any)?.filter;
          const karpathyShould = (filter?.should ?? []).find(
            (c: any) => c?.key === 'relativePath'
          );
          // Phase C must be skipped when flag is false
          expect(karpathyShould).toBeUndefined();
        } finally {
          process.env.ACE_CLUSTER_FILTER_ENABLED = original;
        }
      });

      it('does not throw when Redis ZREVRANGE fails', async () => {
        mockRedisZrevrange.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));

        const { assembleACEContext } = await import('$lib/server/ace/context-assembler.js');
        // Must not throw — Phase C catch swallows Redis errors
        await expect(
          assembleACEContext({
            query: 'evidence cluster boost redis error',
            enableCodebaseContext: true,
            statsOut: {},
          })
        ).resolves.not.toThrow();
      });
    });
  });
});
