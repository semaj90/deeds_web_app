import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalAceChatSelfEvalEnabled = process.env.ACE_CHAT_SELF_EVAL_ENABLED;

/** 768-dim embedding vector required by the route's dimension check */
const MOCK_EMBEDDING_768 = Array.from({ length: 768 }, (_, i) => 0.001 * (i + 1));

const mockInsertValues = vi.fn();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockHistoryLimit = vi.fn();
const mockHistoryOrderBy = vi.fn(() => ({ limit: mockHistoryLimit }));
const mockHistoryWhere = vi.fn(() => ({ orderBy: mockHistoryOrderBy, limit: mockHistoryLimit }));
const mockHistoryFrom = vi.fn(() => ({ where: mockHistoryWhere }));
const mockSelect = vi.fn(() => ({ from: mockHistoryFrom }));

const mockLookupCachedResponse = vi.fn();
const mockStoreCachedResponse = vi.fn();
const mockOllamaFetch = vi.fn();
const mockFetchGlossaryMatches = vi.fn();
const mockGetFragment = vi.fn();
const mockSetFragment = vi.fn();
const mockPublishChatContext = vi.fn();
const mockEvaluateResponse = vi.fn();
const mockGenerateCorrectionPrompt = vi.fn();
const mockLoadCodebaseContext = vi.fn();
const mockGetGraphContext = vi.fn();

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
    QDRANT_URL: 'http://qdrant.test',
  },
}));

vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => Array.isArray(r) ? r : r?.rows ?? [],
  db: {
    insert: mockInsert,
    select: mockSelect,
    execute: vi.fn(),
  },
}));

vi.mock('$lib/server/db/schema', () => ({
  chatMessages: {
    role: 'role',
    content: 'content',
    chatId: 'chatId',
    timestamp: 'timestamp',
  },
}));

vi.mock('$lib/server/ollama.js', () => ({
  ollamaFetch: mockOllamaFetch,
  getChatModelKeepAlive: vi.fn(() => '5m'),
  getEmbeddingModelKeepAlive: vi.fn(() => '5m'),
  VLM_MODELS: {
    vision: 'gemma4-rotorquant:latest',
    embedding: 'embeddinggemma:latest',
    legal: 'gemma4-rotorquant:latest',
    gemma4: 'gemma4-rotorquant:latest',
    tool: 'gemma4-rotorquant:latest',
  },
}));

vi.mock('$lib/server/features/rag/index.js', () => ({
  loadCodebaseContext: mockLoadCodebaseContext,
}));

vi.mock('$lib/server/retrieval/graph-context.js', () => ({
  getGraphContext: mockGetGraphContext,
  getCaseGraphNeighborIds: vi.fn(async () => []),
  getNeo4jMultiHopNeighbors: vi.fn(async () => []),
  formatNeo4jContext: vi.fn(() => ''),
  buildGraphShouldFilter: vi.fn(() => null),
  applyGraphAuthorityScoring: vi.fn((docs: unknown[]) => docs),
}));

vi.mock('$lib/server/retrieval/graph-informed-retrieval.js', () => ({
  graphExpandRetrieval: vi.fn(async (_qv: unknown, docs: unknown[]) => docs),
}));

vi.mock('$lib/server/retrieval/authority-chain.js', () => ({
  authorityChainExpansion: vi.fn(async (_qv: unknown, docs: unknown[]) => ({ docs, hops: 0, expanded: 0, authorities: { statutes: [], cases: [] } })),
}));

vi.mock('$lib/server/ai/llm-cache.js', () => ({
  lookupCachedResponse: mockLookupCachedResponse,
  storeCachedResponse: mockStoreCachedResponse,
}));

vi.mock('$lib/server/glyph-prompt-cache.js', () => ({
  getFragment: mockGetFragment,
  setFragment: mockSetFragment,
  getGlyphCacheMetrics: vi.fn(() => ({ entries: 0, hitRate: 0, avgCompressionRatio: 0 })),
  FragmentType: {
    CASE: 'case',
    RAG: 'rag',
    CODE: 'code',
    KAG: 'kag',
  },
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
  traceCouchDB: vi.fn(
    async (_operation: string, _details: unknown, action: () => Promise<unknown>) => action()
  ),
}));

vi.mock('$lib/server/ace/self-prompt.js', () => ({
  evaluateResponse: mockEvaluateResponse,
  generateCorrectionPrompt: mockGenerateCorrectionPrompt,
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  fetchGlossaryMatches: mockFetchGlossaryMatches,
  fetchCachedACEChunks: vi.fn(async () => []),
  persistACEChunks: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/retrieval/document-dag.js', () => ({
  orderByDependency: vi.fn((docs: unknown[]) => ({ ordered: docs, cycles: [] })),
  extractCitationRefs: vi.fn(() => []),
}));

vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
  rabbitmq: {
    publishChatContext: mockPublishChatContext,
    isReady: vi.fn(() => true),
  },
}));

// Prevent in-memory synthesis cache from leaking between tests.
vi.mock('$lib/server/cache.js', () => ({
  setCache: vi.fn(async () => undefined),
  getFromMemoryCache: vi.fn(() => ({ found: false, value: null })),
  getFromRedisCache: vi.fn(async () => null),
}));

// Block the L1 Redis exact-match cache from hitting the live Docker Redis instance.
// The real Redis IS running (Docker), so without this mock the dynamic import would
// find stale entries from dev-server usage and force tests onto the cached path.
vi.mock('$lib/server/cache/redis-exact-match.js', () => ({
  generateCacheKey: vi.fn((_opts: unknown) => 'test-cache-key'),
  getExactMatchCache: vi.fn(async () => null),
  setExactMatchCache: vi.fn(async () => undefined),
}));

// Prevent Bifrost streaming cache from intercepting live-path tests.
vi.mock('$lib/server/ai/cached-stream.js', () => ({
  getCachedStreamResponse: vi.fn(async () => null),
  storeCachedStreamResponse: vi.fn(async () => undefined),
  streamCachedResponse: vi.fn(function* () {}),
}));

vi.mock('$lib/server/rag/tag-extractor.js', () => ({
  extractLegalTags: vi.fn(() => ({ statutes: [], cases: [], citations: [], dates: [] })),
}));

vi.mock('$lib/server/knowledge-cache.js', () => ({
  getCachedEmbedding: vi.fn(async () => null),
  setCachedEmbedding: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/cache/dag-cache.js', () => ({
  getCachedDAG: vi.fn(() => null),
  setCachedDAG: vi.fn(() => undefined),
}));

vi.mock('$lib/server/observability/inference-log.js', () => ({
  logInference: vi.fn(),
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  chatDocumentAttachments: { chatId: 'chatId', documentId: 'documentId', attachedAt: 'attachedAt' },
}));

vi.mock('$lib/server/trt-llm.js', () => ({
  streamLLM: vi.fn(async function* () {}),
  healthCheck: vi.fn(async () => false),
}));

vi.mock('$lib/server/triton-llm.js', () => ({
  streamLLM: vi.fn(async function* () {}),
  healthCheck: vi.fn(async () => false),
}));

vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
  acquireGpuLease: vi.fn(async () => ({ acquired: false, reason: 'test' })),
  releaseGpuLease: vi.fn(async () => undefined),
  getGpuLeaseStatus: vi.fn(async () => ({ available: false })),
}));

vi.mock('$lib/server/redis-streams.js', () => ({
  produceTokenChunk: vi.fn(async () => undefined),
  trimTokenStream: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/retrieval/auto-backfill.js', () => ({
  shouldBackfill: vi.fn(() => false),
  triggerBackfillAsync: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/cache-keys.js', () => ({
  synthesisKey: {
    forQuery: vi.fn((...args: string[]) => `synthesis:${args.join(':')}`),
    global: vi.fn((...args: string[]) => `synthesis:global:${args.join(':')}`),
  },
  getCaseVersion: vi.fn(async () => 1),
  TTL: { SYNTHESIS: 3600, CASE_VERSION: 1800, EMBEDDING: 7200 },
  caseVersionKey: { forCase: vi.fn((id: string) => `case:${id}:version`) },
  retrievalKey: {
    forQuery: vi.fn((...args: string[]) => `retrieval:${args.join(':')}`),
    global: vi.fn((...args: string[]) => `retrieval:global:${args.join(':')}`),
  },
  embeddingKey: { forText: vi.fn((text: string) => `emb:${text.slice(0, 10)}`) },
}));

vi.mock('$lib/server/config/vector-config.js', () => ({
  buildVectorPayload: vi.fn((collection: string, vector: number[]) => vector),
  VECTOR_CONFIG: {
    COLLECTIONS: {
      LEGAL_DOCUMENTS: 'legal_documents',
      CHAT_MESSAGES: 'chat_messages',
      EVIDENCE: 'evidence_items',
      CODEBASE: 'codebase_chunks_768',
    },
    EMBEDDING_DIM: 768,
    DISTANCE_METRIC: { COSINE: 'Cosine' },
    SEARCH_DEFAULTS: { limit: 5, scoreThreshold: 0.5 },
    NAMED_VECTORS: {},
  },
  NAMED_VECTOR_MAP: {},
  getVectorSearchConfig: vi.fn(() => undefined),
  getNamedVectorName: vi.fn(() => undefined),
  validateVectorDimensions: vi.fn(() => true),
  checkVectorEnvironment: vi.fn(() => ({ ok: true, issues: [] })),
}));

function makeJsonResponse(body: unknown, ok = true) {
  const bodyStr = JSON.stringify(body);
  return {
    ok,
    json: async () => body,
    text: async () => bodyStr,
  };
}

function makeStreamingResponse(lines: string[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join('\n')));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    }
  );
}

async function readSseEvents(response: Response) {
  const text = await response.text();

  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

describe('/api/sse/chat glossary metadata', () => {
  const glossaryMatch = {
    id: 'glossary-probable-cause',
    term: 'Probable Cause',
    definition:
      'Reasonable grounds to believe that a crime has been committed and that the accused is responsible.',
    source: 'legal_glossary',
    citation: 'Cal. Penal Code',
    confidence: 0.97,
    jurisdiction: 'California',
    sourceNodeId: null,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.ACE_CHAT_SELF_EVAL_ENABLED = 'true';

    mockInsertValues.mockResolvedValue(undefined);
    mockHistoryLimit.mockResolvedValue([]);
    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response: 'Probable cause requires reasonable grounds tied to the case facts.',
      confidence: 0.91,
      similarity: 0.99,
      cachedAt: '2026-03-21T00:00:00.000Z',
    });
    mockStoreCachedResponse.mockResolvedValue(undefined);
    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });
    mockFetchGlossaryMatches.mockResolvedValue([glossaryMatch]);
    mockGetFragment.mockReturnValue(null);
    mockEvaluateResponse.mockResolvedValue(null);
    mockGenerateCorrectionPrompt.mockReturnValue(null);
    mockLoadCodebaseContext.mockResolvedValue(null);
    mockGetGraphContext.mockResolvedValue(null);
  });

  afterEach(() => {
    if (typeof originalAceChatSelfEvalEnabled === 'string') {
      process.env.ACE_CHAT_SELF_EVAL_ENABLED = originalAceChatSelfEvalEnabled;
    } else {
      delete process.env.ACE_CHAT_SELF_EVAL_ENABLED;
    }
  });

  it('emits glossary matches in the final SSE metadata payload', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain probable cause for this case.',
        conversationId: 'conversation-glossary-metadata',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent?.status).toBe('done');
    expect(doneEvent?.cachedResponse).toBe(true);
    expect(doneEvent?.confidence).toBe(0.91);
    expect(doneEvent?.glossaryMatches).toEqual([
      {
        id: glossaryMatch.id,
        term: glossaryMatch.term,
        definition: glossaryMatch.definition,
        source: glossaryMatch.source,
        citation: glossaryMatch.citation,
        confidence: glossaryMatch.confidence,
        jurisdiction: glossaryMatch.jurisdiction,
        sourceNodeId: glossaryMatch.sourceNodeId,
      },
    ]);

    expect(mockInsert).toHaveBeenCalledTimes(2);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.glossaryMatches).toEqual(doneEvent?.glossaryMatches);
    expect(assistantMetadata.contextUsed?.glossaryMatches).toEqual(doneEvent?.glossaryMatches);
  });

  it('emits glossary matches on the non-cached streaming generation path', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this case history.' },
      { role: 'assistant', content: 'Prior assistant reply.' },
      { role: 'user', content: 'Explain probable cause for this case.' },
    ]);
    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({ message: { content: 'Probable ' } }),
          JSON.stringify({ message: { content: 'cause applies.' } }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain probable cause for this case.',
        conversationId: 'conversation-glossary-live',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent?.status).toBe('done');
    expect(doneEvent?.cachedResponse).toBeUndefined();
    expect(doneEvent?.content).toBe('Probable cause applies.');
    expect(doneEvent?.conversationTurns).toBe(2);
    expect(doneEvent?.glossaryMatches).toEqual([
      {
        id: glossaryMatch.id,
        term: glossaryMatch.term,
        definition: glossaryMatch.definition,
        source: glossaryMatch.source,
        citation: glossaryMatch.citation,
        confidence: glossaryMatch.confidence,
        jurisdiction: glossaryMatch.jurisdiction,
        sourceNodeId: glossaryMatch.sourceNodeId,
      },
    ]);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe('Probable cause applies.');
    expect(assistantMetadata.model).toBe('gemma4-rotorquant:latest');
    expect(assistantMetadata.conversationTurns).toBe(2);
    expect(assistantMetadata.glossaryMatches).toEqual(doneEvent?.glossaryMatches);
    expect(assistantMetadata.contextUsed?.glossaryMatches).toEqual(doneEvent?.glossaryMatches);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([]);
    expect(assistantMetadata.contextUsed?.citations).toEqual([]);
    expect(assistantMetadata.cachedResponse).toBeUndefined();
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Explain probable cause for this case.',
          response: 'Probable cause applies.',
          model: 'gemma4-rotorquant:latest',
          context: expect.any(String),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: doneEvent?.confidence,
        })
      );
    });
  });

  it('forwards prior user and assistant turns into the live Ollama message array', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    let chatRequestBody: {
      messages?: Array<{ role: string; content: string }>;
    } | null = null;

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Summarize the attachment implications.' },
      { role: 'assistant', content: 'Earlier assistant synthesis.' },
      { role: 'user', content: 'Earlier facts from the file.' },
    ]);
    mockOllamaFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/chat')) {
        chatRequestBody = JSON.parse(String(init?.body ?? '{}'));

        return makeStreamingResponse([
          JSON.stringify({ message: { content: 'Multi-turn answer.' } }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Summarize the attachment implications.',
        conversationId: 'conversation-multi-turn-live',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(doneEvent?.status).toBe('done');
    expect(doneEvent?.content).toBe('Multi-turn answer.');
    expect(doneEvent?.conversationTurns).toBe(2);
    expect(chatRequestBody?.messages).toBeDefined();
    expect(chatRequestBody?.messages).toHaveLength(4);
    expect(chatRequestBody?.messages?.[0]?.role).toBe('system');
    expect(chatRequestBody?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier facts from the file.' },
      { role: 'assistant', content: 'Earlier assistant synthesis.' },
      { role: 'user', content: 'Summarize the attachment implications.' },
    ]);
  });

  it('recomputes citations after a non-attachment retry accepts an improved response', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const chatBodies: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-retry-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved non-attachment legal grounding text that should back the retried answer.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain the legal grounding for this issue.' },
      { role: 'assistant', content: 'Earlier legal summary.' },
      { role: 'user', content: 'Earlier legal facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.41,
      completeness: 0.39,
      accuracy: 0.52,
      suggestions: ['Add source-backed support.'],
      shouldRetry: true,
      evalMs: 17,
    });
    mockGenerateCorrectionPrompt.mockReturnValue('Revise with explicit source support.');

    mockOllamaFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/chat')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages?: Array<{ role: string; content: string }>;
        };
        chatBodies.push(body);

        if (chatBodies.length === 1) {
          return makeStreamingResponse([
            JSON.stringify({
              message: {
                content:
                  'Initial legal draft that lacks cited support but is long enough to trigger retry review.',
              },
            }),
          ]);
        }

        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content: 'Improved legal answer with explicit support [Source 1].',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain the legal grounding for this issue.',
        conversationId: 'conversation-non-attachment-retry',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[0]?.messages?.[0]?.content).toContain(
      'Retrieved non-attachment legal grounding text that should back the retried answer.'
    );
    expect(chatBodies[1]?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier legal facts.' },
      { role: 'assistant', content: 'Earlier legal summary.' },
      { role: 'user', content: 'Explain the legal grounding for this issue.' },
      {
        role: 'assistant',
        content:
          'Initial legal draft that lacks cited support but is long enough to trigger retry review.',
      },
      { role: 'user', content: 'Revise with explicit source support.' },
    ]);

    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content: 'Improved legal answer with explicit support [Source 1].',
        contextUsed: ['legal_documents:legal-doc-retry-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-retry-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.41,
          completeness: 0.39,
          accuracy: 0.52,
        },
      })
    );
    expect(doneEvent?.confidence).toBe(0.5);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'Improved legal answer with explicit support [Source 1].'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual(['legal_documents:legal-doc-retry-1']);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Explain the legal grounding for this issue.',
          response: 'Improved legal answer with explicit support [Source 1].',
          model: 'gemma4-rotorquant:latest',
          context: expect.stringContaining(
            'Retrieved non-attachment legal grounding text that should back the retried answer.'
          ),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: 0.5,
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBe(doneEvent?.confidence);
  });

  it('applies the positive ACE confidence bump on a high-quality live response', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Provide the supporting legal analysis.' },
      { role: 'assistant', content: 'Earlier concise analysis.' },
      { role: 'user', content: 'Earlier supporting facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.91,
      completeness: 0.9,
      accuracy: 0.93,
      suggestions: [],
      shouldRetry: false,
      evalMs: 14,
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-high-quality-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for a high-quality response with explicit support.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'High-quality legal answer with explicit support [Source 1] and sufficient detail for evaluation.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Provide the supporting legal analysis.',
        conversationId: 'conversation-high-quality-live',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'High-quality legal answer with explicit support [Source 1] and sufficient detail for evaluation.',
        contextUsed: ['legal_documents:legal-doc-high-quality-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-high-quality-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.91,
          completeness: 0.9,
          accuracy: 0.93,
        },
      })
    );
    expect(doneEvent?.confidence).toBe(0.7);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'High-quality legal answer with explicit support [Source 1] and sufficient detail for evaluation.'
    );
    expect(assistantMetadata.confidence).toBe(0.7);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.91,
      completeness: 0.9,
      accuracy: 0.93,
      evalMs: 14,
    });

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Provide the supporting legal analysis.',
          response:
            'High-quality legal answer with explicit support [Source 1] and sufficient detail for evaluation.',
          model: 'gemma4-rotorquant:latest',
          context: expect.stringContaining(
            'Retrieved legal grounding text for a high-quality response with explicit support.'
          ),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: 0.7,
        })
      );
    });
  });

  it('applies the positive ACE confidence bump when codebase and KAG context also contribute', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Explain this route handler in this repo with supporting legal context.',
      },
      { role: 'assistant', content: 'Earlier route summary.' },
      { role: 'user', content: 'Earlier route facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.89,
      completeness: 0.88,
      accuracy: 0.9,
      suggestions: [],
      shouldRetry: false,
      evalMs: 15,
    });
    mockLoadCodebaseContext.mockResolvedValue({
      context:
        '## Codebase Context\n- src/routes/api/sse/chat/+server.ts handles SSE streaming\n- retry branch preserves conversation history',
      chunks: [
        { relativePath: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
        {
          relativePath: 'src/lib/server/ai/llm-cache.ts',
          symbol: 'storeCachedResponse',
          score: 0.74,
        },
      ],
    });
    mockGetGraphContext.mockResolvedValue({
      context:
        '## Knowledge Graph Context\n- chat route depends on llm cache\n- llm cache connects to semantic retrieval',
      neighbors: [
        { nodeId: 'node-chat-route', title: 'chat route' },
        { nodeId: 'node-llm-cache', title: 'llm cache' },
      ],
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-code-kag-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for a code-aware high-quality response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'High-quality code-aware legal answer with explicit support [Source 1] and route analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this route handler in this repo with supporting legal context.',
        conversationId: 'conversation-code-kag-high-quality',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'High-quality code-aware legal answer with explicit support [Source 1] and route analysis.',
        contextUsed: ['legal_documents:legal-doc-code-kag-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-code-kag-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.89,
          completeness: 0.88,
          accuracy: 0.9,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.8, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 2,
      kagNeighbors: 2,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'High-quality code-aware legal answer with explicit support [Source 1] and route analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.8, 10);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.74 },
    ]);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Explain this route handler in this repo with supporting legal context.',
          response:
            'High-quality code-aware legal answer with explicit support [Source 1] and route analysis.',
          model: 'gemma4-rotorquant:latest',
          context: expect.stringMatching(
            /Retrieved legal grounding text for a code-aware high-quality response\.[\s\S]*## Knowledge Graph Context[\s\S]*## Codebase Context/
          ),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.8, 10);
  });

  it('applies the positive ACE confidence bump when only KAG context contributes beyond RAG', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this legal relationship with graph-backed support.' },
      { role: 'assistant', content: 'Earlier graph summary.' },
      { role: 'user', content: 'Earlier graph facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.9,
      completeness: 0.88,
      accuracy: 0.91,
      suggestions: [],
      shouldRetry: false,
      evalMs: 12,
    });
    mockLoadCodebaseContext.mockResolvedValue(null);
    mockGetGraphContext.mockResolvedValue({
      context:
        '## Knowledge Graph Context\n- legal grounding connects to the cited document\n- related evidence supports the same analysis',
      neighbors: [
        { nodeId: 'node-legal-grounding', title: 'legal grounding' },
        { nodeId: 'node-related-evidence', title: 'related evidence' },
      ],
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-kag-only-1',
                score: 0.86,
                payload: {
                  full_text: 'Retrieved legal grounding text for a KAG-only high-quality response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'High-quality graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this legal relationship with graph-backed support.',
        conversationId: 'conversation-kag-only-high-quality',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'High-quality graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.',
        contextUsed: ['legal_documents:legal-doc-kag-only-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-kag-only-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.9,
          completeness: 0.88,
          accuracy: 0.91,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.74, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 0,
      kagNeighbors: 2,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'High-quality graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.74, 10);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Explain this legal relationship with graph-backed support.',
          response:
            'High-quality graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.',
          model: 'gemma4-rotorquant:latest',
          context: expect.stringMatching(
            /Retrieved legal grounding text for a KAG-only high-quality response\.[\s\S]*## Knowledge Graph Context/
          ),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
      context?: string;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.74, 10);
    expect(cacheStoreCall.context).not.toContain('## Codebase Context');
  });

  it('persists cached confidence parity on a code-aware cached response path', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response:
        'Cached code-aware legal answer with explicit support [Source 1] and endpoint analysis.',
      confidence: 0.76,
      similarity: 0.98,
      cachedAt: '2026-03-21T12:00:00.000Z',
    });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this endpoint in this repo with legal support.' },
      { role: 'assistant', content: 'Earlier endpoint summary.' },
      { role: 'user', content: 'Earlier endpoint facts.' },
    ]);
    mockLoadCodebaseContext.mockResolvedValue({
      context:
        '## Codebase Context\n- src/routes/api/sse/chat/+server.ts builds SSE responses\n- src/lib/server/ai/llm-cache.ts stores semantic cache entries',
      chunks: [
        { relativePath: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
        {
          relativePath: 'src/lib/server/ai/llm-cache.ts',
          symbol: 'storeCachedResponse',
          score: 0.72,
        },
      ],
    });
    mockGetGraphContext.mockResolvedValue(null);
    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-code-cache-1',
                score: 0.86,
                payload: {
                  full_text: 'Retrieved legal grounding text for a code-aware cached response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this endpoint in this repo with legal support.',
        conversationId: 'conversation-code-aware-cached',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'Cached code-aware legal answer with explicit support [Source 1] and endpoint analysis.',
        cachedResponse: true,
        confidence: 0.76,
        contextUsed: ['legal_documents:legal-doc-code-cache-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-code-cache-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
      })
    );
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 2,
      kagNeighbors: 0,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe(
      'Cached code-aware legal answer with explicit support [Source 1] and endpoint analysis.'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:legal-doc-code-cache-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.72 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Explain this endpoint in this repo with legal support.',
        context: expect.stringMatching(
          /Retrieved legal grounding text for a code-aware cached response\.[\s\S]*## Codebase Context/
        ),
        model: 'gemma4-rotorquant:latest',
      })
    );
    expect(mockStoreCachedResponse).not.toHaveBeenCalled();
  });

  it('persists cached confidence parity on a KAG-aware cached response path', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response:
        'Cached graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.',
      confidence: 0.74,
      similarity: 0.97,
      cachedAt: '2026-03-21T12:10:00.000Z',
    });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this legal relationship with graph-backed support.' },
      { role: 'assistant', content: 'Earlier graph summary.' },
      { role: 'user', content: 'Earlier graph facts.' },
    ]);
    mockLoadCodebaseContext.mockResolvedValue(null);
    mockGetGraphContext.mockResolvedValue({
      context:
        '## Knowledge Graph Context\n- legal grounding connects to the cited document\n- related evidence supports the same analysis',
      neighbors: [
        { nodeId: 'node-legal-grounding', title: 'legal grounding' },
        { nodeId: 'node-related-evidence', title: 'related evidence' },
      ],
    });
    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-kag-cache-1',
                score: 0.86,
                payload: {
                  full_text: 'Retrieved legal grounding text for a KAG-aware cached response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this legal relationship with graph-backed support.',
        conversationId: 'conversation-kag-aware-cached',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'Cached graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.',
        cachedResponse: true,
        confidence: 0.74,
        contextUsed: ['legal_documents:legal-doc-kag-cache-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-kag-cache-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
      })
    );
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 0,
      kagNeighbors: 2,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe(
      'Cached graph-aware legal answer with explicit support [Source 1] and linked evidence analysis.'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:legal-doc-kag-cache-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Explain this legal relationship with graph-backed support.',
        context: expect.stringMatching(
          /Retrieved legal grounding text for a KAG-aware cached response\.[\s\S]*## Knowledge Graph Context/
        ),
        model: 'gemma4-rotorquant:latest',
      })
    );
    const lookupCall = mockLookupCachedResponse.mock.calls.at(-1)?.[0] as {
      context?: string;
    };
    expect(lookupCall.context).not.toContain('## Codebase Context');
    expect(mockStoreCachedResponse).not.toHaveBeenCalled();
  });

  it('persists cached confidence parity on a codebase-and-KAG-aware cached response path', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response:
        'Cached code-and-graph-aware legal answer with explicit support [Source 1] and route analysis.',
      confidence: 0.8,
      similarity: 0.99,
      cachedAt: '2026-03-21T12:20:00.000Z',
    });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Explain this route handler in this repo with supporting legal context.',
      },
      { role: 'assistant', content: 'Earlier route summary.' },
      { role: 'user', content: 'Earlier route facts.' },
    ]);
    mockLoadCodebaseContext.mockResolvedValue({
      context:
        '## Codebase Context\n- src/routes/api/sse/chat/+server.ts handles SSE streaming\n- retry branch preserves conversation history',
      chunks: [
        { relativePath: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
        {
          relativePath: 'src/lib/server/ai/llm-cache.ts',
          symbol: 'storeCachedResponse',
          score: 0.74,
        },
      ],
    });
    mockGetGraphContext.mockResolvedValue({
      context:
        '## Knowledge Graph Context\n- chat route depends on llm cache\n- llm cache connects to semantic retrieval',
      neighbors: [
        { nodeId: 'node-chat-route', title: 'chat route' },
        { nodeId: 'node-llm-cache', title: 'llm cache' },
      ],
    });
    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-code-kag-cache-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for a code-and-KAG-aware cached response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this route handler in this repo with supporting legal context.',
        conversationId: 'conversation-code-kag-cached',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'Cached code-and-graph-aware legal answer with explicit support [Source 1] and route analysis.',
        cachedResponse: true,
        confidence: 0.8,
        contextUsed: ['legal_documents:legal-doc-code-kag-cache-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-code-kag-cache-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
      })
    );
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 2,
      kagNeighbors: 2,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe(
      'Cached code-and-graph-aware legal answer with explicit support [Source 1] and route analysis.'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:legal-doc-code-kag-cache-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.74 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Explain this route handler in this repo with supporting legal context.',
        context: expect.stringMatching(
          /Retrieved legal grounding text for a code-and-KAG-aware cached response\.[\s\S]*## Knowledge Graph Context[\s\S]*## Codebase Context/
        ),
        model: 'gemma4-rotorquant:latest',
      })
    );
    expect(mockStoreCachedResponse).not.toHaveBeenCalled();
  });

  it('uses the same effective context string for cache lookup and cache store on a live non-attachment path', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this endpoint in this repo with legal support.' },
      { role: 'assistant', content: 'Earlier endpoint summary.' },
      { role: 'user', content: 'Earlier endpoint facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.9,
      completeness: 0.89,
      accuracy: 0.91,
      suggestions: [],
      shouldRetry: false,
      evalMs: 13,
    });
    mockLoadCodebaseContext.mockResolvedValue({
      context:
        '## Codebase Context\n- src/routes/api/sse/chat/+server.ts builds SSE responses\n- src/lib/server/ai/llm-cache.ts stores semantic cache entries',
      chunks: [
        { relativePath: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
        {
          relativePath: 'src/lib/server/ai/llm-cache.ts',
          symbol: 'storeCachedResponse',
          score: 0.72,
        },
      ],
    });
    mockGetGraphContext.mockResolvedValue(null);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-context-parity-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for cache context parity on the live path.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'High-quality legal cache context parity answer with explicit support [Source 1] and endpoint analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this endpoint in this repo with legal support.',
        conversationId: 'conversation-context-parity-live',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent?.confidence).toBeCloseTo(0.76, 10);

    const lookupCall = mockLookupCachedResponse.mock.calls.at(-1)?.[0] as {
      query?: string;
      context?: string;
      model?: string;
    };
    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      query?: string;
      context?: string;
      model?: string;
    };

    expect(lookupCall.query).toBe('Explain this endpoint in this repo with legal support.');
    expect(cacheStoreCall.query).toBe(lookupCall.query);
    expect(cacheStoreCall.model).toBe(lookupCall.model);
    expect(cacheStoreCall.context).toBe(lookupCall.context);
    expect(cacheStoreCall.context).toContain(
      'Retrieved legal grounding text for cache context parity on the live path.'
    );
    expect(cacheStoreCall.context).toContain('## Codebase Context');
  });

  it('truncates assistant queue publish at 5000 chars while SSE, persistence, and cache keep the full non-attachment live response', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([]);

    const longResponse = 'B'.repeat(5200) + ' [Source 1]';

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-queue-truncate-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for queue truncation coverage on the live path.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([JSON.stringify({ message: { content: longResponse } })]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Provide a very long legal answer with source support.',
        conversationId: 'conversation-queue-truncate-live',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent?.status).toBe('done');
    expect(doneEvent?.content).toBe(longResponse);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      content?: string;
      role?: string;
    };
    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe(longResponse);

    await vi.waitFor(() => {
      const assistantCall = mockPublishChatContext.mock.calls
        .map((c: unknown[]) => c[0] as { role?: string; sessionId?: string; message?: string; metadata?: { model?: string; confidence?: number } })
        .find((c) => c.role === 'assistant');
      expect(assistantCall).toBeDefined();
      expect(assistantCall!.sessionId).toBe('conversation-queue-truncate-live');
      expect(assistantCall!.role).toBe('assistant');
      expect(assistantCall!.message).toBe(longResponse.slice(0, 5000));
      expect(assistantCall!.message?.length).toBe(5000);
      expect(assistantCall!.metadata?.confidence).toBe(doneEvent?.confidence);
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      response?: string;
    };
    expect(cacheStoreCall.response).toBe(longResponse);
  });

  it('applies the positive ACE confidence bump when only codebase context contributes beyond RAG', async () => {
    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Explain this endpoint in this repo with legal support.' },
      { role: 'assistant', content: 'Earlier endpoint summary.' },
      { role: 'user', content: 'Earlier endpoint facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.9,
      completeness: 0.89,
      accuracy: 0.91,
      suggestions: [],
      shouldRetry: false,
      evalMs: 13,
    });
    mockLoadCodebaseContext.mockResolvedValue({
      context:
        '## Codebase Context\n- src/routes/api/sse/chat/+server.ts builds SSE responses\n- src/lib/server/ai/llm-cache.ts stores semantic cache entries',
      chunks: [
        { relativePath: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
        {
          relativePath: 'src/lib/server/ai/llm-cache.ts',
          symbol: 'storeCachedResponse',
          score: 0.72,
        },
      ],
    });
    mockGetGraphContext.mockResolvedValue(null);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'legal-doc-code-only-1',
                score: 0.86,
                payload: {
                  full_text:
                    'Retrieved legal grounding text for a codebase-only high-quality response.',
                  embedding_model: 'embeddinggemma:latest',
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/chat')) {
        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'High-quality codebase-aware legal answer with explicit support [Source 1] and endpoint analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: MOCK_EMBEDDING_768,
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain this endpoint in this repo with legal support.',
        conversationId: 'conversation-code-only-high-quality',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'High-quality codebase-aware legal answer with explicit support [Source 1] and endpoint analysis.',
        contextUsed: ['legal_documents:legal-doc-code-only-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:legal-doc-code-only-1',
            similarity: 0.86,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.9,
          completeness: 0.89,
          accuracy: 0.91,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.76, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.86,
      embeddingModel: 'embeddinggemma:latest',
      codebaseHits: 2,
      kagNeighbors: 0,
    });

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'High-quality codebase-aware legal answer with explicit support [Source 1] and endpoint analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.76, 10);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.72 },
    ]);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Explain this endpoint in this repo with legal support.',
          response:
            'High-quality codebase-aware legal answer with explicit support [Source 1] and endpoint analysis.',
          model: 'gemma4-rotorquant:latest',
          context: expect.stringMatching(
            /Retrieved legal grounding text for a codebase-only high-quality response\.[\s\S]*## Codebase Context/
          ),
          queryEmbedding: MOCK_EMBEDDING_768,
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
      context?: string;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.76, 10);
    expect(cacheStoreCall.context).not.toContain('## Knowledge Graph Context');
  });
});
