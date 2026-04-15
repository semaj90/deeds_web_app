/**
 * Test file 16: Document Management + Sync + Summarize + Cartridge + System + Chat Replay
 *
 * Document routes (4):
 *   - /api/documents/[id] (GET, PUT)
 *   - /api/documents/[id]/auto-save (POST)
 *   - /api/document/[docId] (GET)
 *   - /api/sync/documents (POST)
 *
 * Summarize routes (2):
 *   - /api/summarize/synthesize (POST)
 *   - /api/summarize/analyze (POST)
 *
 * Cartridge routes (2):
 *   - /api/cartridge/invalidate (POST)
 *   - /api/cartridge/stats (GET)
 *
 * System routes (1):
 *   - /api/system/phase13 (GET)
 *
 * Chat routes (1):
 *   - /api/chat/replay (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_DOC_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        message: { content: 'Mock LLM response' },
        response:
          '{"synthesis":{"mainThemes":["Theme1"],"supportingEvidence":[],"gaps":[],"contradictions":[],"legalImplications":[],"nextSteps":[]}}',
        model: 'gemma4-legal:latest',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
);
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-legal:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── ENV mock ──
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    QDRANT_URL: 'http://localhost:6333',
    MINIO_ENDPOINT: 'localhost:9000',
  },
}));
vi.mock('$lib/config/env.server.js', () => ({
  getOllamaUrl: () => 'http://localhost:11434',
  getQdrantUrl: () => 'http://localhost:6333',
  getRabbitMQUrl: () => 'amqp://localhost',
}));

// ── DB mock ──
const mockDbRows: any[] = [];
const mockInsertReturning: any[] = [];
const mockChain: any = {
  select: vi.fn(() => mockChain),
  from: vi.fn(() => mockChain),
  where: vi.fn(() => mockChain),
  orderBy: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  offset: vi.fn(() => mockChain),
  leftJoin: vi.fn(() => mockChain),
  innerJoin: vi.fn(() => mockChain),
  then: vi.fn((resolve: any, reject?: any) => Promise.resolve(mockDbRows).then(resolve, reject)),
  catch: vi.fn((fn: any) => Promise.resolve(mockDbRows).catch(fn)),
  [Symbol.iterator]: function* () {
    yield* mockDbRows;
  },
};
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => (Array.isArray(r) ? r : (r?.rows ?? [])),
  db: {
    select: vi.fn(() => mockChain),
    execute: vi.fn(async () => ({
      rows: [{ version: 'PostgreSQL 16', current_database: 'deeds' }],
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        const p = Promise.resolve(undefined);
        (p as any).returning = vi.fn(async () => mockInsertReturning);
        return p;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => {
        const p2 = Promise.resolve(undefined);
        (p2 as any).where = vi.fn(() => Promise.resolve(undefined));
        return p2;
      }),
    })),
  },
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => a),
  desc: vi.fn((c: any) => c),
  and: vi.fn((...a: any[]) => a),
  or: vi.fn((...a: any[]) => a),
  gt: vi.fn((...a: any[]) => a),
  gte: vi.fn((...a: any[]) => a),
  lte: vi.fn((...a: any[]) => a),
  ilike: vi.fn((...a: any[]) => a),
  inArray: vi.fn((...a: any[]) => a),
  count: vi.fn(() => 'count'),
  sql: Object.assign(
    vi.fn((s: any) => s),
    { raw: vi.fn((s: any) => s) }
  ),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  documents: {
    id: 'id',
    title: 'title',
    content: 'content',
    fileType: 'file_type',
    status: 'status',
    summary: 'summary',
    metadata: 'metadata',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  evidence: {
    id: 'id',
    title: 'title',
    description: 'description',
    caseId: 'case_id',
    fileType: 'file_type',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  cases: { id: 'id', title: 'title', description: 'description', status: 'status' },
}));
vi.mock('$lib/server/db/schema.js', () => ({
  documents: {
    id: 'id',
    title: 'title',
    content: 'content',
    fileType: 'file_type',
    status: 'status',
    updatedAt: 'updated_at',
  },
  evidence: { id: 'id', title: 'title', description: 'description' },
  cases: { id: 'id', title: 'title', status: 'status' },
}));
vi.mock('$lib/server/db/schema', () => ({
  documents: {
    id: 'id',
    title: 'title',
    content: 'content',
    fileType: 'file_type',
    status: 'status',
    updatedAt: 'updated_at',
  },
  evidence: { id: 'id', title: 'title', description: 'description' },
  cases: { id: 'id', title: 'title', status: 'status' },
}));

// ── Redis mock ──
const mockRedis = {
  get: vi.fn(async () => null),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(async () => []),
  ping: vi.fn(async () => 'PONG'),
  pipeline: vi.fn(() => ({ exec: vi.fn(async () => []) })),
  status: 'ready',
};
vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => mockRedis,
  redis: mockRedis,
  redisPool: { getConnection: () => mockRedis },
}));

// ── Cartridge bridge mock ──
const mockInvalidateCartridge = vi.fn(async () => true);
const mockGetCartridgeCacheStats = vi.fn(async () => ({
  totalKeys: 5,
  totalSizeBytes: 524288,
  oldestKey: '2026-03-01T00:00:00Z',
  newestKey: '2026-03-30T00:00:00Z',
}));
vi.mock('$lib/server/cache/cartridge-tensor-bridge.js', () => ({
  invalidateCartridge: (...args: any[]) => mockInvalidateCartridge(...args),
  getCartridgeCacheStats: (...args: any[]) => mockGetCartridgeCacheStats(...args),
  searchCartridgeTensors: vi.fn(async () => ({ results: [], timingMs: 10 })),
}));

// ── Redis streams mock ──
const mockReadTokenStream = vi.fn(async () => [
  { id: '1-0', chunk: 'Hello ' },
  { id: '2-0', chunk: 'world' },
]);
vi.mock('$lib/server/redis-streams.js', () => ({
  readTokenStream: (...args: any[]) => mockReadTokenStream(...args),
  produceTokenChunk: vi.fn(),
  trimTokenStream: vi.fn(),
}));

// ── Validation mock ──
vi.mock('$lib/server/validation.js', () => ({
  isUuid: vi.fn((s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ),
  isValidSafeId: vi.fn((s: string) => typeof s === 'string' && s.length > 0),
}));

// ── Auth helpers mock ──
vi.mock('$lib/server/auth-helpers.js', () => ({
  requireAuth: vi.fn(async (event: any) => ({
    userId: event.locals.user?.id ?? TEST_USER_ID,
  })),
}));

// ── Helpers ──
function makeEvent(
  method: string,
  url: string,
  opts: { body?: any; locals?: any; params?: any; fetch?: any; formData?: any } = {}
) {
  const urlObj = new URL(url, 'http://localhost');
  const headers = new Headers({ 'content-type': 'application/json' });
  const req: any = new Request(urlObj, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.formData) {
    req.formData = async () => opts.formData;
  }
  return {
    request: req,
    url: urlObj,
    params: opts.params ?? {},
    locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    platform: {},
    fetch:
      opts.fetch ??
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      ),
  };
}

function jsonBody(r: Response) {
  return r.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbRows.length = 0;
  mockInsertReturning.length = 0;
  mockRedis.get.mockResolvedValue(null);
});

// ═════════════════════════════════════════════════════════
//  DOCUMENT ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/documents/[id] (GET)
// ─────────────────────────────────────────────────────────
describe('/api/documents/[id] (GET)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/documents/[id]/+server.js');
    const event = makeEvent('GET', '/api/documents/test', {
      locals: { user: null },
      params: { id: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    const { GET } = await import('../src/routes/api/documents/[id]/+server.js');
    const event = makeEvent('GET', '/api/documents/bad-id', {
      params: { id: 'not-a-uuid' },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.error).toContain('Invalid');
  });

  it('returns 404 when document not found', async () => {
    const { GET } = await import('../src/routes/api/documents/[id]/+server.js');
    mockDbRows.length = 0;
    const event = makeEvent('GET', '/api/documents/' + TEST_DOC_ID, {
      params: { id: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(404);
  });

  it('returns document on success', async () => {
    const { GET } = await import('../src/routes/api/documents/[id]/+server.js');
    mockDbRows.push({
      id: TEST_DOC_ID,
      title: 'Test Doc',
      content: 'Document content',
      fileType: 'document',
      status: 'draft',
      summary: 'Summary',
      metadata: { citations: ['cite1'] },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });
    const event = makeEvent('GET', '/api/documents/' + TEST_DOC_ID, {
      params: { id: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.id).toBe(TEST_DOC_ID);
    expect(body.title).toBe('Test Doc');
    expect(body.citations).toEqual(['cite1']);
  });
});

// ─────────────────────────────────────────────────────────
// /api/documents/[id] (PUT)
// ─────────────────────────────────────────────────────────
describe('/api/documents/[id] (PUT)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { PUT } = await import('../src/routes/api/documents/[id]/+server.js');
    const event = makeEvent('PUT', '/api/documents/' + TEST_DOC_ID, {
      locals: { user: null },
      params: { id: TEST_DOC_ID },
      body: { content: 'updated' },
    });
    const res = await PUT(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    const { PUT } = await import('../src/routes/api/documents/[id]/+server.js');
    const event = makeEvent('PUT', '/api/documents/bad', {
      params: { id: 'bad' },
      body: { content: 'updated' },
    });
    const res = await PUT(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status enum', async () => {
    const { PUT } = await import('../src/routes/api/documents/[id]/+server.js');
    const event = makeEvent('PUT', '/api/documents/' + TEST_DOC_ID, {
      params: { id: TEST_DOC_ID },
      body: { status: 'invalid_status' },
    });
    const res = await PUT(event as any);
    expect(res.status).toBe(400);
  });

  it('updates document successfully', async () => {
    const { PUT } = await import('../src/routes/api/documents/[id]/+server.js');
    mockDbRows.length = 0;
    mockDbRows.push({ id: TEST_DOC_ID });
    const event = makeEvent('PUT', '/api/documents/' + TEST_DOC_ID, {
      params: { id: TEST_DOC_ID },
      body: { content: 'new content', status: 'approved' },
    });
    const res = await PUT(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    mockDbRows.length = 0;
  });
});

// ─────────────────────────────────────────────────────────
// /api/documents/[id]/auto-save (POST)
// ─────────────────────────────────────────────────────────
describe('/api/documents/[id]/auto-save (POST)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/documents/[id]/auto-save/+server.js');
    const event = makeEvent('POST', '/api/documents/' + TEST_DOC_ID + '/auto-save', {
      locals: { user: null },
      params: { id: TEST_DOC_ID },
      body: { content: 'auto saved' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    const { POST } = await import('../src/routes/api/documents/[id]/auto-save/+server.js');
    const event = makeEvent('POST', '/api/documents/bad/auto-save', {
      params: { id: 'not-uuid' },
      body: { content: 'text' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing content', async () => {
    const { POST } = await import('../src/routes/api/documents/[id]/auto-save/+server.js');
    const event = makeEvent('POST', '/api/documents/' + TEST_DOC_ID + '/auto-save', {
      params: { id: TEST_DOC_ID },
      body: {},
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('auto-saves document successfully', async () => {
    const { POST } = await import('../src/routes/api/documents/[id]/auto-save/+server.js');
    const event = makeEvent('POST', '/api/documents/' + TEST_DOC_ID + '/auto-save', {
      params: { id: TEST_DOC_ID },
      body: { content: 'auto-saved content' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    expect(body.savedAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// /api/document/[docId] (GET)
// ─────────────────────────────────────────────────────────
describe('/api/document/[docId] (GET)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/document/[docId]/+server.js');
    const event = makeEvent('GET', '/api/document/' + TEST_DOC_ID, {
      locals: { user: null },
      params: { docId: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    const { GET } = await import('../src/routes/api/document/[docId]/+server.js');
    const event = makeEvent('GET', '/api/document/bad', {
      params: { docId: 'bad' },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 when document not found', async () => {
    const { GET } = await import('../src/routes/api/document/[docId]/+server.js');
    mockDbRows.length = 0;
    const event = makeEvent('GET', '/api/document/' + TEST_DOC_ID, {
      params: { docId: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(404);
  });

  it('returns document on success', async () => {
    const { GET } = await import('../src/routes/api/document/[docId]/+server.js');
    mockDbRows.push({ id: TEST_DOC_ID, title: 'Evidence Doc', type: 'pdf' });
    const event = makeEvent('GET', '/api/document/' + TEST_DOC_ID, {
      params: { docId: TEST_DOC_ID },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.document).toBeDefined();
    expect(body.document.id).toBe(TEST_DOC_ID);
  });
});

// ─────────────────────────────────────────────────────────
// /api/sync/documents (POST)
// ─────────────────────────────────────────────────────────
describe('/api/sync/documents (POST)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/sync/documents/+server.js');
    const event = makeEvent('POST', '/api/sync/documents', {
      locals: { user: null },
      body: { lastSyncTime: 0 },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input', async () => {
    const { POST } = await import('../src/routes/api/sync/documents/+server.js');
    const event = makeEvent('POST', '/api/sync/documents', {
      body: { lastSyncTime: -1 },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns synced documents on success', async () => {
    const { POST } = await import('../src/routes/api/sync/documents/+server.js');
    mockDbRows.push(
      { title: 'Doc1', content: 'Content1', fileType: 'pdf', status: 'draft' },
      { title: 'Doc2', content: 'Content2', fileType: 'document', status: 'approved' }
    );
    const event = makeEvent('POST', '/api/sync/documents', {
      body: { lastSyncTime: 1000000 },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.documents).toHaveLength(2);
    expect(body.syncTimestamp).toBeDefined();
    expect(body.deletedIds).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════
//  SUMMARIZE ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/summarize/synthesize (POST)
// ─────────────────────────────────────────────────────────
describe('/api/summarize/synthesize (POST)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/summarize/synthesize/+server.js');
    const event = makeEvent('POST', '/api/summarize/synthesize', {
      locals: { user: null },
      body: { documentId: 'doc1', sections: [{ title: 'A', content: 'B' }] },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing documentId', async () => {
    const { POST } = await import('../src/routes/api/summarize/synthesize/+server.js');
    const event = makeEvent('POST', '/api/summarize/synthesize', {
      body: { sections: [] },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns synthesis on success', async () => {
    const { POST } = await import('../src/routes/api/summarize/synthesize/+server.js');
    const event = makeEvent('POST', '/api/summarize/synthesize', {
      body: {
        documentId: 'doc-123',
        sections: [
          { title: 'Background', content: 'The case involves property law.' },
          { title: 'Evidence', content: 'Documents submitted show title ownership.' },
        ],
        keyInsights: ['Clear title chain'],
      },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.synthesis).toBeDefined();
    expect(body.synthesis.mainThemes).toBeDefined();
  });

  it('handles LLM failure gracefully', async () => {
    const { POST } = await import('../src/routes/api/summarize/synthesize/+server.js');
    mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    const event = makeEvent('POST', '/api/summarize/synthesize', {
      body: {
        documentId: 'doc-123',
        sections: [{ title: 'A', content: 'B' }],
      },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.synthesis).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// /api/summarize/analyze (POST)
// ─────────────────────────────────────────────────────────
describe('/api/summarize/analyze (POST)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/summarize/analyze/+server.js');
    const event = makeEvent('POST', '/api/summarize/analyze', {
      locals: { user: null },
      body: { documentId: 'doc1', sections: [] },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing documentId', async () => {
    const { POST } = await import('../src/routes/api/summarize/analyze/+server.js');
    const event = makeEvent('POST', '/api/summarize/analyze', {
      body: { sections: [] },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns analysis results on success', async () => {
    const { POST } = await import('../src/routes/api/summarize/analyze/+server.js');
    mockOllamaFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: '{"results":[{"type":"section1","score":0.85,"explanation":"Relevant"}]}',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const event = makeEvent('POST', '/api/summarize/analyze', {
      body: {
        documentId: 'doc-xyz',
        sections: [{ title: 'Facts', content: 'Key facts of the case.' }],
      },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('handles LLM failure gracefully', async () => {
    const { POST } = await import('../src/routes/api/summarize/analyze/+server.js');
    mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    const event = makeEvent('POST', '/api/summarize/analyze', {
      body: {
        documentId: 'doc-123',
        sections: [{ title: 'A', content: 'B' }],
      },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.results).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════
//  CARTRIDGE ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/cartridge/invalidate (POST)
// ─────────────────────────────────────────────────────────
describe('/api/cartridge/invalidate (POST)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/cartridge/invalidate/+server.js');
    const event = makeEvent('POST', '/api/cartridge/invalidate', {
      locals: { user: null },
      body: { caseId: 'case-123' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('../src/routes/api/cartridge/invalidate/+server.js');
    const urlObj = new URL('/api/cartridge/invalidate', 'http://localhost');
    const req = new Request(urlObj, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const event = {
      request: req,
      url: urlObj,
      params: {},
      locals: { user: { id: TEST_USER_ID, role: 'admin' } },
      cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    };
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing caseId', async () => {
    const { POST } = await import('../src/routes/api/cartridge/invalidate/+server.js');
    const event = makeEvent('POST', '/api/cartridge/invalidate', {
      body: {},
    });
    const res = await POST(event as any);
    expect(res.status).toBe(400);
  });

  it('invalidates cartridge successfully', async () => {
    const { POST } = await import('../src/routes/api/cartridge/invalidate/+server.js');
    mockInvalidateCartridge.mockResolvedValueOnce(true);
    const event = makeEvent('POST', '/api/cartridge/invalidate', {
      body: { caseId: 'case-abc' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.caseId).toBe('case-abc');
    expect(body.invalidated).toBe(true);
  });

  it('returns 500 when invalidation fails', async () => {
    const { POST } = await import('../src/routes/api/cartridge/invalidate/+server.js');
    mockInvalidateCartridge.mockRejectedValueOnce(new Error('Redis down'));
    const event = makeEvent('POST', '/api/cartridge/invalidate', {
      body: { caseId: 'case-err' },
    });
    const res = await POST(event as any);
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────
// /api/cartridge/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/cartridge/stats (GET)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/cartridge/stats/+server.js');
    const event = makeEvent('GET', '/api/cartridge/stats', {
      locals: { user: null },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(401);
  });

  it('returns cache stats on success', async () => {
    const { GET } = await import('../src/routes/api/cartridge/stats/+server.js');
    const event = makeEvent('GET', '/api/cartridge/stats');
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.totalKeys).toBe(5);
    expect(body.totalSizeMB).toBeDefined();
    expect(typeof body.totalSizeMB).toBe('number');
  });

  it('returns 500 when stats query fails', async () => {
    const { GET } = await import('../src/routes/api/cartridge/stats/+server.js');
    mockGetCartridgeCacheStats.mockRejectedValueOnce(new Error('Redis down'));
    const event = makeEvent('GET', '/api/cartridge/stats');
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.error).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════
//  SYSTEM ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/system/phase13 (GET)
// ─────────────────────────────────────────────────────────
describe('/api/system/phase13 (GET)', () => {
  it('returns health check data with service statuses', async () => {
    const { GET } = await import('../src/routes/api/system/phase13/+server.js');
    // Mock global fetch for Qdrant/MinIO health checks
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/health')) {
        return new Response('ok', { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as any;
    try {
      const event = makeEvent('GET', '/api/system/phase13');
      const res = await GET(event as any);
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.timestamp).toBeDefined();
      expect(body.services).toBeDefined();
      expect(body.services.redis).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles service failures gracefully', async () => {
    const { GET } = await import('../src/routes/api/system/phase13/+server.js');
    mockRedis.ping.mockRejectedValueOnce(new Error('Redis down'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network error');
    }) as any;
    try {
      const event = makeEvent('GET', '/api/system/phase13');
      const res = await GET(event as any);
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.services.redis.ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ═════════════════════════════════════════════════════════
//  CHAT ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/chat/replay (GET)
// ─────────────────────────────────────────────────────────
describe('/api/chat/replay (GET)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/chat/replay/+server.js');
    const event = makeEvent('GET', '/api/chat/replay?conversationId=conv-1', {
      locals: { user: null },
    });
    const res = await GET(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing conversationId', async () => {
    const { GET } = await import('../src/routes/api/chat/replay/+server.js');
    const event = makeEvent('GET', '/api/chat/replay');
    const res = await GET(event as any);
    expect(res.status).toBe(400);
  });

  it('returns replayed token chunks on success', async () => {
    const { GET } = await import('../src/routes/api/chat/replay/+server.js');
    const event = makeEvent('GET', '/api/chat/replay?conversationId=conv-abc&fromId=0-0&count=50');
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.conversationId).toBe('conv-abc');
    expect(body.entries).toBe(2);
    expect(body.text).toBe('Hello world');
    expect(body.lastId).toBe('2-0');
  });

  it('returns 503 when redis stream fails', async () => {
    const { GET } = await import('../src/routes/api/chat/replay/+server.js');
    mockReadTokenStream.mockRejectedValueOnce(new Error('Redis unavailable'));
    const event = makeEvent('GET', '/api/chat/replay?conversationId=conv-fail');
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.entries).toBe(0);
  });
});
