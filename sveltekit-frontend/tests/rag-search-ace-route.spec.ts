import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheck = vi.fn();
const mockGetVectorCache = vi.fn();
const mockSetVectorCache = vi.fn();
const mockSetEmbeddingCache = vi.fn();
const mockSparseHybridSearch = vi.fn();
const mockSectionFilteredSearch = vi.fn();
const mockAssembleACEContext = vi.fn();
const mockGetCaseVersion = vi.fn();
const mockGetFromMemoryCache = vi.fn();
const mockSetCache = vi.fn();
const mockGetRedis = vi.fn();

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
  getOllamaUrl: () => 'http://ollama.test',
  getQdrantUrl: () => 'http://qdrant.test',
}));

vi.mock('$lib/server/production-logger.js', () => ({
  productionLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('$lib/server/api/response-helper.js', () => ({
  apiResponses: {
    serviceUnavailable: (message: string) =>
      new Response(JSON.stringify({ error: message }), { status: 503 }),
    badRequest: (message: string) =>
      new Response(JSON.stringify({ error: message }), { status: 400 }),
    badGateway: (message: string) =>
      new Response(JSON.stringify({ error: message }), { status: 502 }),
    serverError: (message: string) =>
      new Response(JSON.stringify({ error: message }), { status: 500 }),
  },
}));

vi.mock('$lib/server/middleware/rate-limiter.js', () => ({
  chatRateLimiter: {
    check: mockCheck,
  },
}));

vi.mock('$lib/server/retrieval/tfidf-scorer.js', () => ({
  computeTFIDF: vi.fn(() => []),
}));

vi.mock('$lib/server/vector-cache.js', () => ({
  getVectorCache: mockGetVectorCache,
  setVectorCache: mockSetVectorCache,
  getEmbeddingCache: vi.fn(),
  setEmbeddingCache: mockSetEmbeddingCache,
}));

vi.mock('$lib/server/cache-keys.js', () => ({
  retrievalKey: {
    forQuery: (_caseId: string, _query: string, _ver: number) => 'test-retrieval-key',
    global: (_query: string) => 'test-retrieval-global-key',
  },
  getCaseVersion: mockGetCaseVersion,
  TTL: { RETRIEVAL: 1800, SYNTHESIS: 900, CLIENT_VIEW: 300 },
}));

vi.mock('$lib/server/cache.js', () => ({
  setCache: mockSetCache,
  getFromMemoryCache: mockGetFromMemoryCache,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: mockGetRedis,
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
  embedText: vi.fn(),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceLLM: vi.fn(
    async (
      _name: string,
      _meta: unknown,
      fn: (handle: { end: ReturnType<typeof vi.fn> }) => Promise<unknown>
    ) => fn({ end: vi.fn() })
  ),
  traceEmbedding: vi.fn(async (_query: string, _model: string, operation: () => Promise<unknown>) =>
    operation()
  ),
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-rotorquant:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
  },
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    sparseHybridSearch: mockSparseHybridSearch,
    sectionFilteredSearch: mockSectionFilteredSearch,
  },
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext: mockAssembleACEContext,
}));

describe('/api/rag/search ACE route integration', () => {
  const caseId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();

    mockCheck.mockReturnValue({ allowed: true, resetTime: Date.now() + 60_000 });
    mockGetVectorCache.mockResolvedValue({ entry: null });
    mockSetVectorCache.mockResolvedValue(undefined);
    mockSetEmbeddingCache.mockResolvedValue(undefined);
    mockGetCaseVersion.mockResolvedValue(0);
    mockGetFromMemoryCache.mockReturnValue({ found: false });
    mockSetCache.mockResolvedValue(undefined);
    mockGetRedis.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      zincrby: vi.fn().mockResolvedValue(1),
      hsetnx: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    });
    mockSectionFilteredSearch.mockResolvedValue({ results: [] });
    mockSparseHybridSearch.mockResolvedValue({
      results: [
        {
          id: 'chunk-1',
          score: 0.91,
          payload: {
            content: 'Probable cause analysis under California criminal procedure.',
            title: 'Search Warrant Guide',
            entities: ['probable cause'],
            source_type: 'document',
          },
        },
      ],
      metadata: { searchType: 'hybrid-rrf' },
    });
    mockAssembleACEContext.mockResolvedValue({
      entities: {
        statutes: ['Cal. Penal Code 836'],
        cases: ['People v. Superior Court'],
        persons: ['Detective Hale'],
        organizations: [],
        dates: [],
      },
      kagNeighbors: [{ nodeId: 'kg-1', title: 'Related authority' }],
    });
  });

  it('returns ACE metadata from the real rag/search handler when enableACE is on', async () => {
    const { POST } = await import('../src/routes/api/rag/search/+server.js');

    const request = new Request('http://localhost/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'probable cause search warrant',
        top_k: 5,
        min_score: 0.3,
        use_hybrid: true,
        enableACE: true,
        userId: 'user-1',
        caseId,
        conversationId: `case-${caseId}`,
        precomputedEmbedding: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/rag/search'),
      locals: { user: { id: 'user-1' } },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockAssembleACEContext).toHaveBeenCalledWith({
      query: 'probable cause search warrant',
      userId: 'user-1',
      caseId,
      conversationId: `case-${caseId}`,
    });
    expect(body.ace).toEqual({
      entityCount: 3,
      kagNeighborCount: 1,
    });
    expect(body.diagnostics).toEqual(
      expect.objectContaining({
        cache: expect.objectContaining({ hit: false, source: 'vector-cache' }),
        embedding: expect.objectContaining({
          status: 'success',
          source: 'client-precomputed',
          transport: 'client-onnx',
        }),
        retrieval: expect.objectContaining({
          status: 'success',
          hybridUsed: true,
          totalCandidates: expect.any(Number),
        }),
        ace: expect.objectContaining({
          status: 'success',
          enabled: true,
          metadata: { entityCount: 3, kagNeighborCount: 1 },
        }),
        corrective_rag: expect.objectContaining({
          status: expect.any(String),
          attempted: expect.any(Boolean),
        }),
        dag: expect.objectContaining({ status: expect.any(String) }),
      })
    );
    expect(body.hybrid_search).toBe('bm42-rrf');
    expect(body.total_found).toBeGreaterThan(0);
    expect(body.chunks[0].source_title).toBe('Search Warrant Guide');
  });

  it('returns the cached response on a vector-cache hit without invoking ACE assembly', async () => {
    const { POST } = await import('../src/routes/api/rag/search/+server.js');

    mockGetVectorCache.mockResolvedValue({
      entry: {
        ts: Date.now() - 500,
        results: [
          {
            query_id: 'cached-query-id',
            query: 'probable cause search warrant',
            case_id: caseId,
            chunks: [
              {
                chunk_id: 'cached-chunk-1',
                text: 'Cached probable cause result.',
                snippet: 'Cached probable cause result.',
                score: 0.94,
                dense_score: 0.94,
                confidence: 'high',
                source_type: 'document',
                source_id: 'cached-source-1',
                source_title: 'Cached Search Warrant Guide',
                related_entities: [],
                graph_neighbors: [],
                has_image: false,
                has_table: false,
              },
            ],
            total_found: 1,
            search_time_ms: 7,
            embedding_time_ms: 0,
            embedding_model: 'embeddinggemma-onnx-client',
            scoring_method: 'hybrid',
            ace: {
              entityCount: 3,
              kagNeighborCount: 1,
            },
            diagnostics: {
              cache: { hit: false, source: 'vector-cache' },
              embedding: {
                status: 'success',
                source: 'server-generated',
                transport: 'grpc',
                duration_ms: 4,
              },
              retrieval: {
                status: 'success',
                collections: ['legal_documents'],
                sectionFilterUsed: false,
                hybridUsed: false,
                totalCandidates: 1,
              },
              ace: {
                status: 'success',
                enabled: true,
                metadata: { entityCount: 3, kagNeighborCount: 1 },
              },
              corrective_rag: { status: 'skipped', attempted: false, originalTopScore: 0.94 },
              dag: { status: 'skipped', enabled: false },
            },
            timestamp: '2026-03-21T00:00:00.000Z',
          },
        ],
      },
    });

    const request = new Request('http://localhost/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'probable cause search warrant',
        top_k: 5,
        min_score: 0.3,
        enableACE: true,
        caseId,
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/rag/search'),
      locals: { user: { id: 'user-1' } },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cache).toEqual(
      expect.objectContaining({
        hit: true,
        source: 'vector-cache',
      })
    );
    expect(body.ace).toEqual({
      entityCount: 3,
      kagNeighborCount: 1,
    });
    expect(body.diagnostics).toEqual(
      expect.objectContaining({
        cache: { hit: false, source: 'vector-cache' },
        embedding: expect.objectContaining({
          status: 'success',
          source: 'server-generated',
          transport: 'grpc',
        }),
        retrieval: expect.objectContaining({ status: 'success', totalCandidates: 1 }),
        ace: {
          status: 'success',
          enabled: true,
          metadata: { entityCount: 3, kagNeighborCount: 1 },
        },
      })
    );
    expect(body.chunks[0].source_title).toBe('Cached Search Warrant Guide');
    expect(mockAssembleACEContext).not.toHaveBeenCalled();
    expect(mockSparseHybridSearch).not.toHaveBeenCalled();
  });

  it('returns 503 when the rate limiter rejects the request', async () => {
    const { POST } = await import('../src/routes/api/rag/search/+server.js');

    mockCheck.mockReturnValue({ allowed: false, resetTime: Date.now() + 4_000 });

    const request = new Request('http://localhost/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'probable cause search warrant',
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/rag/search'),
      locals: { user: { id: 'user-1' } },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain('Rate limit exceeded. Try again in');
    expect(mockGetVectorCache).not.toHaveBeenCalled();
    expect(mockAssembleACEContext).not.toHaveBeenCalled();
    expect(mockSparseHybridSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when query is missing', async () => {
    const { POST } = await import('../src/routes/api/rag/search/+server.js');

    const request = new Request('http://localhost/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        top_k: 5,
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/rag/search'),
      locals: { user: { id: 'user-1' } },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid input: expected string, received undefined' });
    expect(mockGetVectorCache).not.toHaveBeenCalled();
    expect(mockAssembleACEContext).not.toHaveBeenCalled();
    expect(mockSparseHybridSearch).not.toHaveBeenCalled();
  });
});