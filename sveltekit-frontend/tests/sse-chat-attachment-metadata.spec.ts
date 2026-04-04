import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalAceChatSelfEvalEnabled = process.env.ACE_CHAT_SELF_EVAL_ENABLED;

const mockInsertValues = vi.fn();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockHistoryLimit = vi.fn();
const mockHistoryOrderBy = vi.fn(() => ({ limit: mockHistoryLimit }));
const mockHistoryWhere = vi.fn(() => ({ orderBy: mockHistoryOrderBy }));
const mockHistoryFrom = vi.fn(() => ({ where: mockHistoryWhere }));
const mockSelect = vi.fn(() => ({ from: mockHistoryFrom }));

const mockLookupCachedResponse = vi.fn();
const mockStoreCachedResponse = vi.fn();
const mockOllamaFetch = vi.fn();
const mockFetchGlossaryMatches = vi.fn();
const mockGetFragment = vi.fn();
const mockSetFragment = vi.fn();
const mockPublishChatContext = vi.fn();
const mockLoadCodebaseContext = vi.fn();
const mockGetGraphContext = vi.fn();
const mockEvaluateResponse = vi.fn();
const mockGenerateCorrectionPrompt = vi.fn();

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
    QDRANT_URL: 'http://qdrant.test',
  },
}));

vi.mock('$lib/server/db/client', () => ({
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
}));

vi.mock('$lib/server/retrieval/codebase-context.js', () => ({
  loadCodebaseContext: mockLoadCodebaseContext,
}));

vi.mock('$lib/server/retrieval/graph-context.js', () => ({
  getGraphContext: mockGetGraphContext,
  getCaseGraphNeighborIds: vi.fn(async () => []),
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
}));

vi.mock('$lib/server/retrieval/document-dag.js', () => ({
  orderByDependency: vi.fn((docs: unknown[]) => ({ ordered: docs, cycles: [] })),
  extractCitationRefs: vi.fn(() => []),
}));

vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
  rabbitmq: {
    publishChatContext: mockPublishChatContext,
  },
}));

function makeJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
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

describe('/api/sse/chat attachment metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.ACE_CHAT_SELF_EVAL_ENABLED = 'true';

    mockInsertValues.mockResolvedValue(undefined);
    mockHistoryLimit.mockResolvedValue([]);
    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response: 'According to [Source 1], the uploaded attachment supports the requested answer.',
      confidence: 0.93,
      similarity: 0.98,
      cachedAt: '2026-03-21T00:00:00.000Z',
    });
    mockStoreCachedResponse.mockResolvedValue(undefined);
    mockFetchGlossaryMatches.mockResolvedValue([]);
    mockGetFragment.mockReturnValue(null);
    mockLoadCodebaseContext.mockResolvedValue(null);
    mockGetGraphContext.mockResolvedValue(null);
    mockEvaluateResponse.mockResolvedValue(null);
    mockGenerateCorrectionPrompt.mockReturnValue(null);

    mockOllamaFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });
  });

  afterEach(() => {
    if (typeof originalAceChatSelfEvalEnabled === 'string') {
      process.env.ACE_CHAT_SELF_EVAL_ENABLED = originalAceChatSelfEvalEnabled;
    } else {
      delete process.env.ACE_CHAT_SELF_EVAL_ENABLED;
    }
  });

  it('uses attachment-scoped retrieval and exposes the attachment doc in final SSE metadata', async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-1',
                score: 0.91,
                payload: {
                  full_text:
                    'Uploaded attachment text showing probable cause analysis tied to the current case.',
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

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the newly uploaded attachment to answer this question.',
        conversationId: 'attachment-chat',
        attachmentSourceHash: 'attachment-hash-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        cachedResponse: true,
        contextUsed: ['legal_documents:attachment-doc-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-1',
            similarity: 0.91,
          },
        ],
      })
    );
    expect(doneEvent?.confidence).toBe(0.93);

    expect(mockOllamaFetch).toHaveBeenCalledWith(
      'http://ollama.test/api/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const qdrantBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(qdrantBody.filter).toEqual({
      must: [{ key: 'source_hash', match: { value: 'attachment-hash-123' } }],
    });

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Use the newly uploaded attachment to answer this question.',
        context: expect.stringContaining(
          'Uploaded attachment text showing probable cause analysis'
        ),
      })
    );

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual(['legal_documents:attachment-doc-1']);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
  });

  it('adds case scoping to attachment retrieval when the conversation is bound to a case', async () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}` ? '## Active Case Context\n- **Title**: Scoped case' : null
    );

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-case-1',
                score: 0.88,
                payload: {
                  full_text: 'Case-scoped attachment evidence relevant to this specific matter.',
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

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment only for this case.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-case-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        cachedResponse: true,
        contextUsed: ['legal_documents:attachment-doc-case-1'],
      })
    );
    expect(doneEvent?.confidence).toBe(0.93);

    const qdrantBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(qdrantBody.filter).toEqual({
      must: [
        { key: 'source_hash', match: { value: 'attachment-hash-case-123' } },
        { key: 'case_id', match: { value: caseId } },
      ],
    });

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining('## Active Case Context'),
      })
    );

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-case-1',
    ]);
  });

  it('persists cached confidence parity when attachment grounding and codebase context both contribute', async () => {
    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response:
        'Cached attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.',
      confidence: 0.76,
      similarity: 0.97,
      cachedAt: '2026-03-21T12:30:00.000Z',
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

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [{ key: 'source_hash', match: { value: 'attachment-hash-code-cache-123' } }],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-code-cache-1',
                score: 0.89,
                payload: {
                  full_text:
                    'Uploaded attachment text for a cached code-aware answer about the endpoint behavior.',
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

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to explain this endpoint in the repo.',
        conversationId: 'attachment-code-aware-cached',
        attachmentSourceHash: 'attachment-hash-code-cache-123',
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
          'Cached attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.',
        cachedResponse: true,
        confidence: 0.76,
        contextUsed: ['legal_documents:attachment-doc-code-cache-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-code-cache-1',
            similarity: 0.89,
          },
        ],
      })
    );
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.89,
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
      'Cached attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-code-cache-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.72 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Use the uploaded attachment to explain this endpoint in the repo.',
        context: expect.stringMatching(
          /Uploaded attachment text for a cached code-aware answer about the endpoint behavior\.[\s\S]*## Codebase Context/
        ),
      })
    );
    expect(mockStoreCachedResponse).not.toHaveBeenCalled();
  });

  it('persists cached confidence parity when case-scoped attachment, codebase, and KAG context all contribute', async () => {
    const caseId = '12121212-1212-4212-8212-121212121212';
    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response:
        'Cached scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
      confidence: 0.8,
      similarity: 0.98,
      cachedAt: '2026-03-21T12:40:00.000Z',
    });
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}`
        ? '## Active Case Context\n- **Title**: Cached scoped code and graph case'
        : null
    );
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
        '## Knowledge Graph Context\n- attachment evidence links to the route issue\n- cache state connects to the scoped matter',
      neighbors: [
        { nodeId: 'node-attachment-route', title: 'attachment route' },
        { nodeId: 'node-scoped-cache', title: 'scoped cache' },
      ],
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [
            { key: 'source_hash', match: { value: 'attachment-hash-case-code-kag-cache-123' } },
            { key: 'case_id', match: { value: caseId } },
          ],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-case-code-kag-cache-1',
                score: 0.87,
                payload: {
                  full_text:
                    'Case-scoped attachment grounding text for a cached answer with codebase and graph support.',
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

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment for this case and explain the route behavior in the repo.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-case-code-kag-cache-123',
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
          'Cached scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
        cachedResponse: true,
        confidence: 0.8,
        contextUsed: ['legal_documents:attachment-doc-case-code-kag-cache-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-case-code-kag-cache-1',
            similarity: 0.87,
          },
        ],
      })
    );
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: true,
      ragHits: 1,
      topScore: 0.87,
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
      'Cached scoped attachment answer with explicit support [Source 1], graph context, and route analysis.'
    );
    expect(assistantMetadata.confidence).toBe(doneEvent?.confidence);
    expect(assistantMetadata.cachedResponse).toBe(true);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-case-code-kag-cache-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.74 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    expect(mockLookupCachedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Use the attachment for this case and explain the route behavior in the repo.',
        context: expect.stringMatching(
          /## Active Case Context[\s\S]*Case-scoped attachment grounding text for a cached answer with codebase and graph support\.[\s\S]*## Knowledge Graph Context[\s\S]*## Codebase Context/
        ),
      })
    );
    expect(mockStoreCachedResponse).not.toHaveBeenCalled();
  });

  it('bypasses retrieval and response cache when inline attachment source text is already present', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    mockLookupCachedResponse.mockResolvedValue({
      hit: true,
      response: 'This cached response should not be used.',
      confidence: 0.99,
      similarity: 0.99,
      cachedAt: '2026-03-21T00:00:00.000Z',
    });
    mockOllamaFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/chat')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.messages[0].content).toContain('[ATTACHMENT HANDLING RULES]');
        expect(body.messages[0].content).not.toContain('## Retrieved Evidence');
        expect(body.messages.at(-1)?.content).toContain('[ATTACHMENT SOURCE START]');

        return makeStreamingResponse([
          JSON.stringify({ message: { content: 'Answer from inline attachment. ' } }),
          JSON.stringify({ message: { content: 'No re-upload needed.' } }),
        ]);
      }

      throw new Error(`Unexpected ollamaFetch: ${url}`);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:
          'Answer using this attachment excerpt. [ATTACHMENT SOURCE START] Uploaded excerpt here. [ATTACHMENT SOURCE END]',
        conversationId: 'attachment-inline-chat',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content: 'Answer from inline attachment. No re-upload needed.',
      })
    );
    expect(doneEvent?.cachedResponse).toBeUndefined();
    expect(doneEvent?.contextUsed).toEqual([]);
    expect(mockLookupCachedResponse).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe('Answer from inline attachment. No re-upload needed.');
    expect(assistantMetadata.cachedResponse).toBeUndefined();
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([]);
  });

  it('persists attachment-scoped metadata on the live streaming path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-live-1',
                score: 0.89,
                payload: {
                  full_text:
                    'Uploaded attachment text establishing timeline details for the live streaming answer.',
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
          JSON.stringify({ message: { content: 'Live attachment answer cites [Source 1].' } }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to answer live.',
        conversationId: 'attachment-live-chat',
        attachmentSourceHash: 'attachment-hash-live-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content: 'Live attachment answer cites [Source 1].',
        contextUsed: ['legal_documents:attachment-doc-live-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-live-1',
            similarity: 0.89,
          },
        ],
        conversationTurns: 0,
      })
    );
    expect(doneEvent?.cachedResponse).toBeUndefined();

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      role?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.role).toBe('assistant');
    expect(assistantInsertCall.content).toBe('Live attachment answer cites [Source 1].');
    expect(assistantMetadata.model).toBe('gemma3-legal:latest');
    expect(assistantMetadata.conversationTurns).toBe(0);
    expect(assistantMetadata.cachedResponse).toBeUndefined();
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-live-1',
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
  });

  it('forwards prior turns and attachment grounding together on the live path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Answer using the uploaded attachment.' },
      { role: 'assistant', content: 'Prior attachment-aware reply.' },
      { role: 'user', content: 'Earlier attachment facts.' },
    ]);

    let chatRequestBody: {
      messages?: Array<{ role: string; content: string }>;
    } | null = null;

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-history-1',
                score: 0.9,
                payload: {
                  full_text:
                    'Attachment grounding text for the multi-turn live request about uploaded evidence.',
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

    mockOllamaFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/chat')) {
        chatRequestBody = JSON.parse(String(init?.body ?? '{}'));
        return makeStreamingResponse([
          JSON.stringify({
            message: { content: 'Multi-turn attachment answer cites [Source 1].' },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Answer using the uploaded attachment.',
        conversationId: 'attachment-history-live-chat',
        attachmentSourceHash: 'attachment-hash-history-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content: 'Multi-turn attachment answer cites [Source 1].',
        contextUsed: ['legal_documents:attachment-doc-history-1'],
        conversationTurns: 2,
      })
    );
    expect(chatRequestBody?.messages?.[0]?.content).toContain(
      'Attachment grounding text for the multi-turn live request about uploaded evidence.'
    );
    expect(chatRequestBody?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier attachment facts.' },
      { role: 'assistant', content: 'Prior attachment-aware reply.' },
      { role: 'user', content: 'Answer using the uploaded attachment.' },
    ]);
  });

  it('preserves prior turns and attachment grounding on the retry path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Use the uploaded attachment for the timeline.' },
      { role: 'assistant', content: 'Earlier assistant timeline summary.' },
      { role: 'user', content: 'Earlier uploaded timeline facts.' },
    ]);
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.42,
      completeness: 0.4,
      accuracy: 0.5,
      suggestions: ['Add citation support.'],
      shouldRetry: true,
      evalMs: 18,
    });
    mockGenerateCorrectionPrompt.mockReturnValue('Revise with stronger citation support.');

    const chatBodies: Array<{ messages?: Array<{ role: string; content: string }> }> = [];

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-retry-1',
                score: 0.92,
                payload: {
                  full_text:
                    'Attachment grounding text that should stay present across the retry path.',
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
                  'Initial attachment draft without enough support but long enough to trigger correction review.',
              },
            }),
          ]);
        }

        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'Improved attachment answer with preserved history and citation support [Source 1].',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment for the timeline.',
        conversationId: 'attachment-retry-live-chat',
        attachmentSourceHash: 'attachment-hash-retry-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(chatBodies).toHaveLength(2);

    expect(chatBodies[0]?.messages?.[0]?.content).toContain(
      'Attachment grounding text that should stay present across the retry path.'
    );
    expect(chatBodies[0]?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier uploaded timeline facts.' },
      { role: 'assistant', content: 'Earlier assistant timeline summary.' },
      { role: 'user', content: 'Use the uploaded attachment for the timeline.' },
    ]);

    expect(chatBodies[1]?.messages?.[0]?.content).toContain(
      'Attachment grounding text that should stay present across the retry path.'
    );
    expect(chatBodies[1]?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier uploaded timeline facts.' },
      { role: 'assistant', content: 'Earlier assistant timeline summary.' },
      { role: 'user', content: 'Use the uploaded attachment for the timeline.' },
      {
        role: 'assistant',
        content:
          'Initial attachment draft without enough support but long enough to trigger correction review.',
      },
      { role: 'user', content: 'Revise with stronger citation support.' },
    ]);

    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'Improved attachment answer with preserved history and citation support [Source 1].',
        contextUsed: ['legal_documents:attachment-doc-retry-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-retry-1',
            similarity: 0.92,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.42,
          completeness: 0.4,
          accuracy: 0.5,
        },
      })
    );

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'Improved attachment answer with preserved history and citation support [Source 1].'
    );
    expect(assistantMetadata.conversationTurns).toBe(2);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-retry-1',
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.42,
      completeness: 0.4,
      accuracy: 0.5,
      evalMs: 18,
    });
  });

  it('preserves case-scoped attachment retrieval, prior turns, and recomputed citations on retry', async () => {
    const caseId = '22222222-2222-4222-8222-222222222222';
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Use the attachment only for this case timeline.' },
      { role: 'assistant', content: 'Earlier scoped assistant summary.' },
      { role: 'user', content: 'Earlier scoped attachment facts.' },
    ]);
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}`
        ? '## Active Case Context\n- **Title**: Retry scoped case'
        : null
    );
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.38,
      completeness: 0.35,
      accuracy: 0.48,
      suggestions: ['Add a source-backed answer.'],
      shouldRetry: true,
      evalMs: 21,
    });
    mockGenerateCorrectionPrompt.mockReturnValue('Revise using the scoped attachment source.');

    const chatBodies: Array<{ messages?: Array<{ role: string; content: string }> }> = [];

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [
            { key: 'source_hash', match: { value: 'attachment-hash-case-retry-123' } },
            { key: 'case_id', match: { value: caseId } },
          ],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-case-retry-1',
                score: 0.87,
                payload: {
                  full_text:
                    'Case-scoped attachment grounding text that must survive retry and preserve citations.',
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
                  'Initial scoped attachment draft that should be retried with stronger support and enough detail to trigger evaluation.',
              },
            }),
          ]);
        }

        return makeStreamingResponse([
          JSON.stringify({
            message: {
              content:
                'Improved scoped attachment answer for this case with preserved history [Source 1].',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment only for this case timeline.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-case-retry-123',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[0]?.messages?.[0]?.content).toContain('## Active Case Context');
    expect(chatBodies[0]?.messages?.[0]?.content).toContain(
      'Case-scoped attachment grounding text that must survive retry and preserve citations.'
    );
    expect(chatBodies[0]?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier scoped attachment facts.' },
      { role: 'assistant', content: 'Earlier scoped assistant summary.' },
      { role: 'user', content: 'Use the attachment only for this case timeline.' },
    ]);
    expect(chatBodies[1]?.messages?.[0]?.content).toContain('## Active Case Context');
    expect(chatBodies[1]?.messages?.[0]?.content).toContain(
      'Case-scoped attachment grounding text that must survive retry and preserve citations.'
    );
    expect(chatBodies[1]?.messages?.slice(1)).toEqual([
      { role: 'user', content: 'Earlier scoped attachment facts.' },
      { role: 'assistant', content: 'Earlier scoped assistant summary.' },
      { role: 'user', content: 'Use the attachment only for this case timeline.' },
      {
        role: 'assistant',
        content:
          'Initial scoped attachment draft that should be retried with stronger support and enough detail to trigger evaluation.',
      },
      { role: 'user', content: 'Revise using the scoped attachment source.' },
    ]);

    expect(doneEvent).toEqual(
      expect.objectContaining({
        status: 'done',
        content:
          'Improved scoped attachment answer for this case with preserved history [Source 1].',
        contextUsed: ['legal_documents:attachment-doc-case-retry-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-case-retry-1',
            similarity: 0.87,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.38,
          completeness: 0.35,
          accuracy: 0.48,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.65, 10);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'Improved scoped attachment answer for this case with preserved history [Source 1].'
    );
    expect(assistantMetadata.conversationTurns).toBe(2);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-case-retry-1',
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.38,
      completeness: 0.35,
      accuracy: 0.48,
      evalMs: 21,
    });

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Use the attachment only for this case timeline.',
          response:
            'Improved scoped attachment answer for this case with preserved history [Source 1].',
          model: 'gemma3-legal:latest',
          context: expect.stringMatching(
            /## Active Case Context[\s\S]*Case-scoped attachment grounding text that must survive retry and preserve citations\./
          ),
          queryEmbedding: [0.11, 0.22, 0.33],
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.65, 10);
  });

  it('applies the low-quality ACE confidence decrement when attachment grounding and codebase context both contribute on the live path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Use the uploaded attachment to explain this endpoint in the repo.',
      },
      { role: 'assistant', content: 'Earlier attachment endpoint summary.' },
      { role: 'user', content: 'Earlier attachment endpoint facts.' },
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
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.42,
      completeness: 0.44,
      accuracy: 0.47,
      suggestions: ['Add stronger support and clearer analysis.'],
      shouldRetry: false,
      evalMs: 13,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [{ key: 'source_hash', match: { value: 'attachment-hash-live-code-low-123' } }],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-live-code-low-1',
                score: 0.89,
                payload: {
                  full_text:
                    'Uploaded attachment text for a low-quality live code-aware endpoint answer.',
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
                'Lower-quality attachment-aware endpoint answer with explicit support [Source 1] but weaker synthesis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to explain this endpoint in the repo.',
        conversationId: 'attachment-live-code-low-quality',
        attachmentSourceHash: 'attachment-hash-live-code-low-123',
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
          'Lower-quality attachment-aware endpoint answer with explicit support [Source 1] but weaker synthesis.',
        contextUsed: ['legal_documents:attachment-doc-live-code-low-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-live-code-low-1',
            similarity: 0.89,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.42,
          completeness: 0.44,
          accuracy: 0.47,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.56, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.89,
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
      'Lower-quality attachment-aware endpoint answer with explicit support [Source 1] but weaker synthesis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.56, 10);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.42,
      completeness: 0.44,
      accuracy: 0.47,
      evalMs: 13,
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.56, 10);
  });

  it('applies the low-quality ACE confidence decrement when case-scoped attachment, codebase, and KAG context all contribute on the live path', async () => {
    const caseId = '45454545-4545-4454-8454-454545454545';
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Use the attachment for this case and explain the route behavior in the repo.',
      },
      { role: 'assistant', content: 'Earlier scoped attachment route summary.' },
      { role: 'user', content: 'Earlier scoped route facts.' },
    ]);
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}`
        ? '## Active Case Context\n- **Title**: Low-quality scoped code and graph case'
        : null
    );
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
        '## Knowledge Graph Context\n- attachment evidence links to the route issue\n- cache state connects to the scoped matter',
      neighbors: [
        { nodeId: 'node-attachment-route', title: 'attachment route' },
        { nodeId: 'node-scoped-cache', title: 'scoped cache' },
      ],
    });
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.44,
      completeness: 0.41,
      accuracy: 0.46,
      suggestions: ['Tighten the legal reasoning and source synthesis.'],
      shouldRetry: false,
      evalMs: 15,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [
            { key: 'source_hash', match: { value: 'attachment-hash-live-case-code-kag-low-123' } },
            { key: 'case_id', match: { value: caseId } },
          ],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-live-case-code-kag-low-1',
                score: 0.87,
                payload: {
                  full_text:
                    'Case-scoped attachment grounding text for a lower-quality live answer with codebase and graph support.',
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
                'Lower-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment for this case and explain the route behavior in the repo.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-live-case-code-kag-low-123',
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
          'Lower-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
        contextUsed: ['legal_documents:attachment-doc-live-case-code-kag-low-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-live-case-code-kag-low-1',
            similarity: 0.87,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.44,
          completeness: 0.41,
          accuracy: 0.46,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.75, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: true,
      ragHits: 1,
      topScore: 0.87,
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
      'Lower-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.75, 10);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.44,
      completeness: 0.41,
      accuracy: 0.46,
      evalMs: 15,
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.75, 10);
  });

  it('publishes queue metadata parity for user emotion and assistant confidence on a live attachment flow', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([]);
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
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.91,
      completeness: 0.9,
      accuracy: 0.92,
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
                id: 'attachment-doc-publish-1',
                score: 0.89,
                payload: {
                  full_text: 'Uploaded attachment text for a queue-publish parity answer.',
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
                'High-quality attachment queue publish answer with explicit support [Source 1] and codebase analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to explain this endpoint and keep mood context.',
        conversationId: 'attachment-publish-parity',
        attachmentSourceHash: 'attachment-hash-publish-123',
        emotionMood: 'concerned',
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'test-user' } } } as never);
    const events = await readSseEvents(response);
    const doneEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(doneEvent?.confidence).toBeCloseTo(0.76, 10);

    await vi.waitFor(() => {
      expect(mockPublishChatContext).toHaveBeenCalledTimes(2);
    });

    expect(mockPublishChatContext).toHaveBeenNthCalledWith(1, {
      sessionId: 'attachment-publish-parity',
      message: 'Use the uploaded attachment to explain this endpoint and keep mood context.',
      role: 'user',
      metadata: { emotionMood: 'concerned' },
    });
    expect(mockPublishChatContext).toHaveBeenNthCalledWith(2, {
      sessionId: 'attachment-publish-parity',
      message:
        'High-quality attachment queue publish answer with explicit support [Source 1] and codebase analysis.',
      role: 'assistant',
      metadata: {
        model: 'gemma3-legal:latest',
        confidence: doneEvent?.confidence,
      },
    });
  });

  it('uses the same effective context string for cache lookup and cache store on a live attachment path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Use the uploaded attachment to explain this endpoint in the repo.',
      },
      { role: 'assistant', content: 'Earlier attachment endpoint summary.' },
      { role: 'user', content: 'Earlier attachment endpoint facts.' },
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
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.91,
      completeness: 0.9,
      accuracy: 0.92,
      suggestions: [],
      shouldRetry: false,
      evalMs: 14,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [{ key: 'source_hash', match: { value: 'attachment-hash-context-parity-123' } }],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-context-parity-1',
                score: 0.89,
                payload: {
                  full_text: 'Uploaded attachment text for cache context parity on the live path.',
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
                'High-quality attachment cache context parity answer with explicit support [Source 1] and codebase analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to explain this endpoint in the repo.',
        conversationId: 'attachment-context-parity-live',
        attachmentSourceHash: 'attachment-hash-context-parity-123',
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

    expect(lookupCall.query).toBe(
      'Use the uploaded attachment to explain this endpoint in the repo.'
    );
    expect(cacheStoreCall.query).toBe(lookupCall.query);
    expect(cacheStoreCall.model).toBe(lookupCall.model);
    expect(cacheStoreCall.context).toBe(lookupCall.context);
    expect(cacheStoreCall.context).toContain(
      'Uploaded attachment text for cache context parity on the live path.'
    );
    expect(cacheStoreCall.context).toContain('## Codebase Context');
  });

  it('truncates assistant queue publish at 5000 chars while SSE, persistence, and cache keep the full live response', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([]);

    const longResponse = 'A'.repeat(5200) + ' [Source 1]';

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [{ key: 'source_hash', match: { value: 'attachment-hash-queue-truncate-123' } }],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-queue-truncate-1',
                score: 0.89,
                payload: {
                  full_text:
                    'Uploaded attachment text for queue truncation coverage on the live path.',
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
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to produce a long answer.',
        conversationId: 'attachment-queue-truncate-live',
        attachmentSourceHash: 'attachment-hash-queue-truncate-123',
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

    const queueCall = mockPublishChatContext.mock.calls.at(-1)?.[0] as {
      sessionId?: string;
      message?: string;
      role?: string;
      metadata?: { model?: string; confidence?: number };
    };
    expect(queueCall.sessionId).toBe('attachment-queue-truncate-live');
    expect(queueCall.role).toBe('assistant');
    expect(queueCall.message).toBe(longResponse.slice(0, 5000));
    expect(queueCall.message?.length).toBe(5000);
    expect(queueCall.metadata?.confidence).toBe(doneEvent?.confidence);

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      response?: string;
    };
    expect(cacheStoreCall.response).toBe(longResponse);
  });

  it('applies the positive ACE confidence bump when attachment grounding and codebase context both contribute on the live path', async () => {
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Use the uploaded attachment to explain this endpoint in the repo.',
      },
      { role: 'assistant', content: 'Earlier attachment endpoint summary.' },
      { role: 'user', content: 'Earlier attachment endpoint facts.' },
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
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.91,
      completeness: 0.9,
      accuracy: 0.92,
      suggestions: [],
      shouldRetry: false,
      evalMs: 14,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [{ key: 'source_hash', match: { value: 'attachment-hash-live-code-123' } }],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-live-code-1',
                score: 0.89,
                payload: {
                  full_text: 'Uploaded attachment text for a live code-aware endpoint answer.',
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
                'High-quality attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the uploaded attachment to explain this endpoint in the repo.',
        conversationId: 'attachment-live-code-aware',
        attachmentSourceHash: 'attachment-hash-live-code-123',
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
          'High-quality attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.',
        contextUsed: ['legal_documents:attachment-doc-live-code-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-live-code-1',
            similarity: 0.89,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.91,
          completeness: 0.9,
          accuracy: 0.92,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.76, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: false,
      ragHits: 1,
      topScore: 0.89,
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
      'High-quality attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.76, 10);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-live-code-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.8 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.72 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Use the uploaded attachment to explain this endpoint in the repo.',
          response:
            'High-quality attachment-aware endpoint answer with explicit support [Source 1] and codebase analysis.',
          model: 'gemma3-legal:latest',
          context: expect.stringMatching(
            /Uploaded attachment text for a live code-aware endpoint answer\.[\s\S]*## Codebase Context/
          ),
          queryEmbedding: [0.11, 0.22, 0.33],
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

  it('applies the positive ACE confidence bump when case-scoped attachment, codebase, and KAG context all contribute on the live path', async () => {
    const caseId = '34343434-3434-4343-8343-343434343434';
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      {
        role: 'user',
        content: 'Use the attachment for this case and explain the route behavior in the repo.',
      },
      { role: 'assistant', content: 'Earlier scoped attachment route summary.' },
      { role: 'user', content: 'Earlier scoped route facts.' },
    ]);
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}`
        ? '## Active Case Context\n- **Title**: Live scoped code and graph case'
        : null
    );
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
        '## Knowledge Graph Context\n- attachment evidence links to the route issue\n- cache state connects to the scoped matter',
      neighbors: [
        { nodeId: 'node-attachment-route', title: 'attachment route' },
        { nodeId: 'node-scoped-cache', title: 'scoped cache' },
      ],
    });
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.93,
      completeness: 0.92,
      accuracy: 0.94,
      suggestions: [],
      shouldRetry: false,
      evalMs: 15,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [
            { key: 'source_hash', match: { value: 'attachment-hash-live-case-code-kag-123' } },
            { key: 'case_id', match: { value: caseId } },
          ],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-live-case-code-kag-1',
                score: 0.87,
                payload: {
                  full_text:
                    'Case-scoped attachment grounding text for a live answer with codebase and graph support.',
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
                'High-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment for this case and explain the route behavior in the repo.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-live-case-code-kag-123',
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
          'High-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
        contextUsed: ['legal_documents:attachment-doc-live-case-code-kag-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-live-case-code-kag-1',
            similarity: 0.87,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.93,
          completeness: 0.92,
          accuracy: 0.94,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.95, 10);
    expect(doneEvent?.confidenceFactors).toEqual({
      caseContext: true,
      ragHits: 1,
      topScore: 0.87,
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
      'High-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.95, 10);
    expect(assistantMetadata.confidenceFactors).toEqual(doneEvent?.confidenceFactors);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-live-case-code-kag-1',
    ]);
    expect(assistantMetadata.contextUsed?.codebaseChunks).toEqual([
      { path: 'src/routes/api/sse/chat/+server.ts', symbol: 'POST', score: 0.81 },
      { path: 'src/lib/server/ai/llm-cache.ts', symbol: 'storeCachedResponse', score: 0.74 },
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Use the attachment for this case and explain the route behavior in the repo.',
          response:
            'High-quality scoped attachment answer with explicit support [Source 1], graph context, and route analysis.',
          model: 'gemma3-legal:latest',
          context: expect.stringMatching(
            /## Active Case Context[\s\S]*Case-scoped attachment grounding text for a live answer with codebase and graph support\.[\s\S]*## Knowledge Graph Context[\s\S]*## Codebase Context/
          ),
          queryEmbedding: [0.11, 0.22, 0.33],
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.95, 10);
  });

  it('applies the positive ACE confidence bump on a case-scoped attachment live response', async () => {
    const caseId = '33333333-3333-4333-8333-333333333333';
    mockLookupCachedResponse.mockResolvedValue({ hit: false });
    mockHistoryLimit.mockResolvedValue([
      { role: 'user', content: 'Use the attachment for this case analysis.' },
      { role: 'assistant', content: 'Earlier scoped attachment summary.' },
      { role: 'user', content: 'Earlier case-specific attachment facts.' },
    ]);
    mockGetFragment.mockImplementation((key: string) =>
      key === `glyph:case:${caseId}`
        ? '## Active Case Context\n- **Title**: Positive bump scoped case'
        : null
    );
    mockEvaluateResponse.mockResolvedValue({
      quality: 0.92,
      completeness: 0.91,
      accuracy: 0.94,
      suggestions: [],
      shouldRetry: false,
      evalMs: 16,
    });

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://qdrant.test/collections/legal_documents/points/search') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        expect(body.filter).toEqual({
          must: [
            { key: 'source_hash', match: { value: 'attachment-hash-case-positive-123' } },
            { key: 'case_id', match: { value: caseId } },
          ],
        });

        return new Response(
          JSON.stringify({
            result: [
              {
                id: 'attachment-doc-case-positive-1',
                score: 0.87,
                payload: {
                  full_text:
                    'Case-scoped attachment grounding text for a high-quality supported answer.',
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
                'High-quality case-scoped attachment answer with explicit support [Source 1] and enough detail for evaluation.',
            },
          }),
        ]);
      }

      if (url.endsWith('/api/embeddings')) {
        return makeJsonResponse({
          embedding: [0.11, 0.22, 0.33],
          model: 'embeddinggemma:latest',
        });
      }

      return makeJsonResponse({}, false);
    });

    const { POST } = await import('../src/routes/api/sse/chat/+server.js');

    const request = new Request('http://localhost/api/sse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Use the attachment for this case analysis.',
        conversationId: `case-${caseId}`,
        attachmentSourceHash: 'attachment-hash-case-positive-123',
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
          'High-quality case-scoped attachment answer with explicit support [Source 1] and enough detail for evaluation.',
        contextUsed: ['legal_documents:attachment-doc-case-positive-1'],
        citations: [
          {
            sourceNum: 1,
            documentId: 'legal_documents:attachment-doc-case-positive-1',
            similarity: 0.87,
          },
        ],
        conversationTurns: 2,
        aceEval: {
          quality: 0.92,
          completeness: 0.91,
          accuracy: 0.94,
        },
      })
    );
    expect(doneEvent?.confidence).toBeCloseTo(0.85, 10);

    const assistantInsertCall = mockInsertValues.mock.calls.at(-1)?.[0] as {
      metadata?: string;
      content?: string;
    };
    const assistantMetadata = JSON.parse(assistantInsertCall.metadata ?? '{}');

    expect(assistantInsertCall.content).toBe(
      'High-quality case-scoped attachment answer with explicit support [Source 1] and enough detail for evaluation.'
    );
    expect(assistantMetadata.confidence).toBeCloseTo(0.85, 10);
    expect(assistantMetadata.contextUsed?.ragDocIds).toEqual([
      'legal_documents:attachment-doc-case-positive-1',
    ]);
    expect(assistantMetadata.contextUsed?.citations).toEqual(doneEvent?.citations);
    expect(assistantMetadata.aceEvaluation).toEqual({
      quality: 0.92,
      completeness: 0.91,
      accuracy: 0.94,
      evalMs: 16,
    });

    await vi.waitFor(() => {
      expect(mockStoreCachedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Use the attachment for this case analysis.',
          response:
            'High-quality case-scoped attachment answer with explicit support [Source 1] and enough detail for evaluation.',
          model: 'gemma3-legal:latest',
          context: expect.stringMatching(
            /## Active Case Context[\s\S]*Case-scoped attachment grounding text for a high-quality supported answer\./
          ),
          queryEmbedding: [0.11, 0.22, 0.33],
          confidence: expect.any(Number),
        })
      );
    });

    const cacheStoreCall = mockStoreCachedResponse.mock.calls.at(-1)?.[0] as {
      confidence?: number;
    };
    expect(cacheStoreCall.confidence).toBeCloseTo(0.85, 10);
  });
});
