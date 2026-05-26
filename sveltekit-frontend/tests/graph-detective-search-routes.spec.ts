/**
 * Test file 11: Graph + Detective + Search + Statutes routes
 *
 * Routes covered (11):
 *   /api/graph/connections (GET)
 *   /api/graph/recommendations (POST)
 *   /api/graph/relationships (GET)
 *   /api/graph/sync (POST)
 *   /api/graph/timeline (GET)
 *   /api/detective/analyze (POST)
 *   /api/detective/connections (POST)
 *   /api/search/cases (GET)
 *   /api/search/laws (GET)
 *   /api/search/citations (POST)
 *   /api/search/filters (GET)
 *   /api/statutes/search (POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_CASE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// ── ENV mock ──
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    QDRANT_URL: 'http://localhost:6333',
  },
}));
vi.mock('$lib/config/env.server.js', () => ({
  getOllamaUrl: () => 'http://localhost:11434',
}));

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async (_url: string, opts?: any) => {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  if (body.stream === true) {
    const encoder = new TextEncoder();
    const chunks = [
      JSON.stringify({ message: { content: 'Analysis: ' }, response: 'Analysis: ' }),
      JSON.stringify({ message: { content: 'The evidence...' }, response: 'The evidence...' }),
      JSON.stringify({ done: true }),
    ];
    let index = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index] + '\n'));
          index++;
        } else {
          controller.close();
        }
      },
    });
    return new Response(stream, { status: 200 });
  }
  // Non-streaming: for embeddings and generate
  if (String(_url).includes('/api/embeddings')) {
    return new Response(JSON.stringify({ embedding: new Array(768).fill(0.01) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      message: { content: 'result' },
      response: JSON.stringify({
        summary: 'AI-generated summary',
        recommendations: [{ title: 'Review Evidence', rationale: 'Important', confidence: 'high' }],
        didYouMean: ['alternative query'],
        predictiveSignals: ['signal 1'],
      }),
      model: 'gemma4-rotorquant:latest',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-rotorquant:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── Neo4j mock ──
const mockNeo4jSession = {
  run: vi.fn(async () => ({
    records: [
      {
        get: vi.fn((key: string) => {
          const map: Record<string, any> = {
            connectedCaseId: 'case-2',
            connectedCaseTitle: 'Related Case',
            status: 'open',
            strength: { toNumber: () => 3 },
            sharedEntities: [{ type: 'Person', title: 'John Doe' }],
            sourceId: 'node-1',
            sourceLabel: 'Case',
            sourceTitle: 'Case 1',
            sourceName: '',
            targetId: 'node-2',
            targetLabel: 'Person',
            targetTitle: 'John',
            targetName: 'Doe',
            relType: 'INVOLVES',
          };
          return map[key];
        }),
      },
    ],
  })),
  close: vi.fn(async () => {}),
};
vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => ({
    session: () => mockNeo4jSession,
  }),
}));

// ── Graph sync mock ──
vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({
  syncCaseToGraph: vi.fn(async () => ({ synced: 1, errors: [] })),
  syncAllCasesToGraph: vi.fn(async () => ({ synced: 10, errors: [] })),
}));

// ── Embedding mock ──
vi.mock('$lib/server/embedding/embed.js', () => ({
  embedText: vi.fn(async () => new Float32Array(768).fill(0.01)),
}));

// ── Qdrant mock ──
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    hybridSearch: vi.fn(async () => ({
      results: [
        { payload: { title: 'Evidence 1', content_preview: 'Contract review' }, score: 0.88 },
      ],
    })),
  },
}));

// ── DB mock (Drizzle chain) ──
const mockDbRows: any[] = [];
const mockChain: any = {
  select: vi.fn(() => mockChain),
  selectDistinct: vi.fn(() => mockChain),
  from: vi.fn(() => mockChain),
  where: vi.fn(() => mockChain),
  orderBy: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  offset: vi.fn(() => mockChain),
  leftJoin: vi.fn(() => mockChain),
  groupBy: vi.fn(() => mockChain),
  then: vi.fn((resolve: any) => resolve(mockDbRows)),
  [Symbol.iterator]: function* () {
    yield* mockDbRows;
  },
};
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => (Array.isArray(r) ? r : (r?.rows ?? [])),
  db: {
    select: vi.fn(() => mockChain),
    selectDistinct: vi.fn(() => mockChain),
    execute: vi.fn(async () => ({ rows: [] })),
  },
  pool: {
    query: vi.fn(async () => ({ rows: [] })),
  },
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
  cases: {
    id: 'id',
    title: 'title',
    description: 'description',
    caseNumber: 'case_number',
    status: 'status',
    priority: 'priority',
    jurisdiction: 'jurisdiction',
    court: 'court',
    practiceArea: 'practice_area',
    createdAt: 'created_at',
    userId: 'user_id',
  },
  statutes: {
    id: 'id',
    title: 'title',
    section: 'section',
    jurisdiction: 'jurisdiction',
    category: 'category',
    content: 'content',
    effectiveDate: 'effective_date',
    sourceUrl: 'source_url',
    createdAt: 'created_at',
  },
  canonicalDocuments: {},
}));
vi.mock('$lib/server/db/schema/legal-cases.js', () => ({
  crimes: {
    crimeCode: 'crime_code',
    crimeCategory: 'crime_category',
    crimeClassification: 'crime_classification',
  },
}));
vi.mock('$lib/server/db/schema', () => ({
  savedCitations: {
    id: 'id',
    statuteCode: 'statute_code',
    statuteTitle: 'statute_title',
    highlightedText: 'highlighted_text',
    notes: 'notes',
    jurisdiction: 'jurisdiction',
    severity: 'severity',
    year: 'year',
    sourceType: 'source_type',
    createdAt: 'created_at',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => a),
  desc: vi.fn((c: any) => c),
  and: vi.fn((...a: any[]) => a),
  or: vi.fn((...a: any[]) => a),
  ilike: vi.fn((...a: any[]) => a),
  sql: Object.assign(
    vi.fn((s: any) => s),
    {
      raw: vi.fn((s: any) => s),
    }
  ),
  isNotNull: vi.fn((c: any) => c),
}));

// ── Helpers ──
function makeEvent(
  method: string,
  url: string,
  opts: { body?: any; locals?: any; params?: any } = {}
) {
  const urlObj = new URL(url, 'http://localhost');
  const headers = new Headers({ 'content-type': 'application/json' });
  return {
    request: new Request(urlObj, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
    url: urlObj,
    params: opts.params ?? {},
    locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    platform: {},
  };
}

function jsonBody(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbRows.length = 0;
});

// ─────────────────────────────────────────────────────────
// /api/graph/connections (GET)
// ─────────────────────────────────────────────────────────
describe('/api/graph/connections (GET)', () => {
  it('returns case connections from Neo4j', async () => {
    const { GET } = await import('../src/routes/api/graph/connections/+server.js');
    const event = makeEvent('GET', `http://localhost/api/graph/connections?caseId=${TEST_CASE_ID}`);
    const res = await GET(event as any);
    const data = await jsonBody(res);
    expect(data.caseId).toBe(TEST_CASE_ID);
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].caseId).toBe('case-2');
  });

  it('returns 400 for missing caseId', async () => {
    const { GET } = await import('../src/routes/api/graph/connections/+server.js');
    const event = makeEvent('GET', 'http://localhost/api/graph/connections');
    const res = await GET(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/graph/connections/+server.js');
    const event = makeEvent(
      'GET',
      `http://localhost/api/graph/connections?caseId=${TEST_CASE_ID}`,
      {
        locals: { user: null },
      }
    );
    const res = await GET(event as any);
    expect(res.status).toBe(401);
  });

  it('returns empty connections when Neo4j is down', async () => {
    mockNeo4jSession.run.mockRejectedValueOnce(new Error('Neo4j unavailable'));
    const { GET } = await import('../src/routes/api/graph/connections/+server.js');
    const event = makeEvent('GET', `http://localhost/api/graph/connections?caseId=${TEST_CASE_ID}`);
    const res = await GET(event as any);
    expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(data.connections).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// /api/graph/relationships (GET)
// ─────────────────────────────────────────────────────────
describe('/api/graph/relationships (GET)', () => {
	it('returns entity relationships', async () => {
		const { GET } = await import('../src/routes/api/graph/relationships/+server.js');
		const event = makeEvent('GET', `http://localhost/api/graph/relationships?entityId=entity-1&depth=2`);
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.entityId).toBe('entity-1');
		expect(data.depth).toBe(2);
		expect(data.relationships).toHaveLength(1);
	});

	it('returns 400 for missing entityId', async () => {
		const { GET } = await import('../src/routes/api/graph/relationships/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/graph/relationships');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/graph/relationships/+server.js');
		const event = makeEvent('GET', `http://localhost/api/graph/relationships?entityId=entity-1`, {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/graph/sync (POST)
// ─────────────────────────────────────────────────────────
describe('/api/graph/sync (POST)', () => {
	it('syncs a specific case', async () => {
		const { POST } = await import('../src/routes/api/graph/sync/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/sync', {
			body: { caseId: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.ok).toBe(true);
		expect(data.synced).toBe(1);
	});

	it('syncs all cases when no caseId provided', async () => {
		const { POST } = await import('../src/routes/api/graph/sync/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/sync', {
			body: {},
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.ok).toBe(true);
		expect(data.synced).toBe(10);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/graph/sync/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/sync', {
			body: {},
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/graph/timeline (GET)
// ─────────────────────────────────────────────────────────
describe('/api/graph/timeline (GET)', () => {
	it('returns a timeline of nodes', async () => {
		const { GET } = await import('../src/routes/api/graph/timeline/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/graph/timeline?limit=10');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('nodes');
		expect(data).toHaveProperty('totalNodes');
		expect(data.types).toBeTruthy();
	});

	it('filters by caseId', async () => {
		const { GET } = await import('../src/routes/api/graph/timeline/+server.js');
		const event = makeEvent('GET', `http://localhost/api/graph/timeline?caseId=${TEST_CASE_ID}&limit=5`);
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.caseId).toBe(TEST_CASE_ID);
	});

	it('rejects unauthenticated with throw error(401)', async () => {
		const { GET } = await import('../src/routes/api/graph/timeline/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/graph/timeline', {
			locals: { user: null },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns 400 for invalid caseId', async () => {
		const { GET } = await import('../src/routes/api/graph/timeline/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/graph/timeline?caseId=not-a-uuid');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/graph/recommendations (POST)
// ─────────────────────────────────────────────────────────
describe('/api/graph/recommendations (POST)', () => {
	it('returns AI investigation recommendations', async () => {
		const { POST } = await import('../src/routes/api/graph/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/recommendations', {
			body: { query: 'evidence timeline analysis', caseId: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.recommendations).toBeDefined();
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/graph/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/recommendations', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/graph/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/recommendations', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns fallback recommendations on Ollama failure', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/graph/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/graph/recommendations', {
			body: { query: 'test query' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		// Graceful fallback returns success with static recommendations
		expect(data.success).toBe(true);
		expect(data.recommendations.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────
// /api/detective/analyze (POST)
// ─────────────────────────────────────────────────────────
describe('/api/detective/analyze (POST)', () => {
	it('returns an SSE stream for analysis', async () => {
		const { POST } = await import('../src/routes/api/detective/analyze/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/detective/analyze', {
			body: { text: 'Witness testimony from March 5.', caseId: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		// SSE streaming response
		expect(res.status).toBe(200);
		expect(res.body).toBeTruthy();
	});

	it('returns 400 for invalid JSON', async () => {
		const { POST } = await import('../src/routes/api/detective/analyze/+server.js');
		const urlObj = new URL('http://localhost/api/detective/analyze');
		const event = {
			request: new Request(urlObj, {
				method: 'POST',
				headers: new Headers({ 'content-type': 'application/json' }),
				body: '{invalid json',
			}),
			url: urlObj,
			params: {},
			locals: { user: { id: TEST_USER_ID } },
		};
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing required fields', async () => {
		const { POST } = await import('../src/routes/api/detective/analyze/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/detective/analyze', {
			body: { text: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/detective/analyze/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/detective/analyze', {
			body: { text: 'test', caseId: TEST_CASE_ID },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/detective/connections (POST)
// ─────────────────────────────────────────────────────────
describe('/api/detective/connections (POST)', () => {
	it('returns an SSE stream for connection graph', async () => {
		const { POST } = await import('../src/routes/api/detective/connections/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/detective/connections', {
			body: { caseId: TEST_CASE_ID, focusTypes: ['people', 'evidence'] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);
		expect(res.body).toBeTruthy();
	});

	it('returns 400 for invalid JSON', async () => {
		const { POST } = await import('../src/routes/api/detective/connections/+server.js');
		const urlObj = new URL('http://localhost/api/detective/connections');
		const event = {
			request: new Request(urlObj, {
				method: 'POST',
				headers: new Headers({ 'content-type': 'application/json' }),
				body: '{bad',
			}),
			url: urlObj,
			params: {},
			locals: { user: { id: TEST_USER_ID } },
		};
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/detective/connections/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/detective/connections', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/search/cases (GET)
// ─────────────────────────────────────────────────────────
describe('/api/search/cases (GET)', () => {
	it('returns search results for a query', async () => {
		mockDbRows.push({
			id: TEST_CASE_ID, title: 'Contract Dispute', description: 'Breach claim',
			caseNumber: 'CD-001', status: 'open', priority: 'high',
			jurisdiction: 'US', court: 'District', practiceArea: 'Civil',
			createdAt: '2026-01-01', crimeCategories: [], crimeClassifications: [], score: 0.9,
		});
		const { GET } = await import('../src/routes/api/search/cases/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/cases?query=contract&limit=5');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(res.status).toBeLessThan(400);
	});

	it('returns empty for very short query', async () => {
		const { GET } = await import('../src/routes/api/search/cases/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/cases?query=a');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.results).toEqual([]);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/search/cases/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/cases?query=test', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/search/laws (GET)
// ─────────────────────────────────────────────────────────
describe('/api/search/laws (GET)', () => {
	it('returns statute search results', async () => {
		const { GET } = await import('../src/routes/api/search/laws/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/laws?query=due+process&limit=5');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(res.status).toBeLessThan(400);
	});

	it('returns empty for very short query', async () => {
		const { GET } = await import('../src/routes/api/search/laws/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/laws?query=x');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.results).toEqual([]);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/search/laws/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/laws?query=test', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/search/citations (POST)
// ─────────────────────────────────────────────────────────
describe('/api/search/citations (POST)', () => {
	it('returns citation search results', async () => {
		mockDbRows.push({
			id: 'cit-1', statuteCode: '28 USC § 1', statuteTitle: 'Jurisdiction',
			highlightedText: 'The court has jurisdiction', notes: null,
			jurisdiction: 'US', severity: null, year: 2020, sourceType: 'federal',
			createdAt: '2026-01-01',
		});
		const { POST } = await import('../src/routes/api/search/citations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/search/citations', {
			body: { query: 'jurisdiction', limit: 5 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.results).toHaveLength(1);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/search/citations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/search/citations', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/search/citations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/search/citations', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/search/filters (GET)
// ─────────────────────────────────────────────────────────
describe('/api/search/filters (GET)', () => {
	it('returns filter facets for laws', async () => {
		const { GET } = await import('../src/routes/api/search/filters/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/filters?type=laws');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('jurisdictions');
		expect(data).toHaveProperty('categories');
		expect(data).toHaveProperty('types');
	});

	it('returns filter facets for cases', async () => {
		const { GET } = await import('../src/routes/api/search/filters/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/filters?type=cases');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('jurisdictions');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/search/filters/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/search/filters', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/statutes/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/statutes/search (POST)', () => {
	it('returns statute vector search results', async () => {
		const { pool } = await import('$lib/server/db/client');
		(pool.query as any).mockResolvedValueOnce({
			rows: [
				{
					chunk_id: 'ch-1', node_id: 'nd-1', doc_id: 'doc-1', doc_title: 'Due Process',
					node_heading: 'Amendment XIV', citation: '14th Amd', jurisdiction: 'US',
					category: 'constitutional', source_confidence: 'high', chunk_index: 0,
					content: 'No state shall...', similarity: 0.92,
				},
			],
		});
		const { POST } = await import('../src/routes/api/statutes/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/statutes/search', {
			body: { query: 'due process clause', limit: 5 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.results).toHaveLength(1);
		expect(data.results[0].title).toBe('Due Process');
		expect(data.model).toBe('embeddinggemma:latest');
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/statutes/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/statutes/search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 503 when embedding fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/statutes/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/statutes/search', {
			body: { query: 'test query' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(503);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/statutes/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/statutes/search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});
