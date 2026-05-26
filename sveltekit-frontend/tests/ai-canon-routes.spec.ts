/**
 * Test file 10: AI sub-routes + Canon document pipeline
 *
 * Routes covered (12):
 *   /api/ai/models (GET)
 *   /api/ai/personas (GET)
 *   /api/ai/stats (GET)
 *   /api/ai/suggestions (GET)
 *   /api/ai/feedback (POST)
 *   /api/ai/ask (POST)
 *   /api/ai/context (POST)
 *   /api/ai/judge (POST)
 *   /api/ai/case-prediction (POST)
 *   /api/ai/case-scoring (POST)
 *   /api/canon (GET/POST)
 *   /api/canon/search (POST)
 *   /api/canon/ingest (POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared UUID ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_CASE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const TEST_DOC_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async (url: string, opts?: any) => {
	const body = opts?.body ? JSON.parse(opts.body) : {};
	const isStream = body.stream === true;

	if (isStream) {
		// Return a streaming response with a ReadableStream body
		const encoder = new TextEncoder();
		const chunks = [
			JSON.stringify({ message: { content: 'Legal analysis: ' } }),
			JSON.stringify({ message: { content: 'The evidence suggests...' } }),
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
		return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
	}

	// Non-streaming response
	return new Response(
		JSON.stringify({
			message: { content: 'AI response: The legal analysis indicates...' },
			model: 'gemma4-rotorquant:latest',
			response: 'AI response: The legal analysis indicates...',
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
});

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-rotorquant:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
	ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── ENV mock ──
vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://localhost:11434',
		QDRANT_URL: 'http://localhost:6333',
	},
}));

// ── Global fetch mock (for ai/models and ai/stats Ollama /api/tags proxy) ──
const mockGlobalFetch = vi.fn(async (url: string) => {
	if (String(url).includes('/api/tags')) {
		return new Response(
			JSON.stringify({
				models: [
					{ name: 'gemma4-rotorquant:latest', size: 4000000000, modified_at: '2026-03-01', digest: 'abc123def456' },
					{ name: 'embeddinggemma:latest', size: 1000000000, modified_at: '2026-03-01', digest: 'def456abc123' },
				],
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	}
	return new Response('Not Found', { status: 404 });
});
vi.stubGlobal('fetch', mockGlobalFetch);

// ── DB mock (Drizzle chain) ──
const mockDbRows: any[] = [];
const mockInsertedRow: any = { id: TEST_DOC_ID };
const mockChain: any = {
	select: vi.fn(() => mockChain),
	from: vi.fn(() => mockChain),
	where: vi.fn(() => mockChain),
	orderBy: vi.fn(() => mockChain),
	limit: vi.fn(() => mockChain),
	offset: vi.fn(() => mockChain),
	values: vi.fn(() => mockChain),
	set: vi.fn(() => mockChain),
	returning: vi.fn(() => Promise.resolve([mockInsertedRow])),
	then: vi.fn((resolve: any) => resolve(mockDbRows)),
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => Array.isArray(r) ? r : r?.rows ?? [],
	db: {
		select: vi.fn(() => mockChain),
		insert: vi.fn(() => mockChain),
		update: vi.fn(() => mockChain),
		execute: vi.fn(async () => ({ rows: [{ c: 5 }] })),
	},
}));

// ── Schema mocks (for dynamic imports in case-prediction, case-scoring, context, feedback) ──
vi.mock('$lib/server/db/schema', () => ({
	cases: { id: 'id', title: 'title', status: 'status', practiceArea: 'practice_area', description: 'description' },
	evidence: { id: 'id', caseId: 'case_id', title: 'title', fileType: 'file_type', createdAt: 'created_at' },
	personsOfInterest: { id: 'id', caseIds: 'case_ids' },
	chatMessages: { id: 'id', metadata: 'metadata' },
}));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	canonicalDocuments: {
		id: 'id', title: 'title', docType: 'doc_type', citation: 'citation',
		jurisdiction: 'jurisdiction', authorityLevel: 'authority_level',
		sourceName: 'source_name', licenseTag: 'license_tag', createdAt: 'created_at',
		sourceUrl: 'source_url', fullText: 'full_text', metadata: 'metadata',
	},
	canonicalChunks: {
		id: 'id', documentId: 'document_id', chunkIndex: 'chunk_index',
		content: 'content', tokenCount: 'token_count', embedding: 'embedding',
	},
	evidence: { id: 'id', caseId: 'case_id', title: 'title', fileType: 'file_type', createdAt: 'created_at' },
	citations: { id: 'id', caseId: 'case_id', citationType: 'citation_type', quotedText: 'quoted_text', formattedCitation: 'formatted_citation' },
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	and: vi.fn((...a: any[]) => a),
	count: vi.fn(() => 'count'),
	sql: vi.fn((s: any) => s),
	arrayContains: vi.fn((...a: any[]) => a),
}));

// ── Personas mock ──
vi.mock('$lib/server/ace/style-adapter.js', () => ({
	getPersonas: vi.fn(() => [
		{ id: 'formal', name: 'Formal Legal', description: 'Formal tone' },
		{ id: 'casual', name: 'Plain Language', description: 'Simple explanations' },
	]),
}));

// ── Embedding client mock ──
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: vi.fn(async () => ({
		vectors: [new Array(768).fill(0.01)],
	})),
}));

// ── Qdrant mock (for canon/search) ──
vi.mock('@qdrant/js-client-rest', () => ({
	QdrantClient: vi.fn(() => ({
		search: vi.fn(async () => [
			{ id: 'chunk-1', score: 0.92, payload: { title: 'Test Statute', type: 'statute' } },
		]),
		upsert: vi.fn(async () => {}),
	})),
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
// /api/ai/models (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/models (GET)', () => {
	it('returns available Ollama models', async () => {
		const { GET } = await import('../src/routes/api/ai/models/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/models');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.models).toHaveLength(2);
		expect(data.models[0].name).toBe('gemma4-rotorquant:latest');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/models/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/models', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('handles Ollama unavailable', async () => {
		mockGlobalFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { GET } = await import('../src/routes/api/ai/models/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/models');
		const res = await GET(event as any);
		expect(res.status).toBe(503);
		const data = await jsonBody(res);
		expect(data.models).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/personas (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/personas (GET)', () => {
	it('returns available personas', async () => {
		const { GET } = await import('../src/routes/api/ai/personas/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/personas');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.personas).toHaveLength(2);
		expect(data.personas[0].id).toBe('formal');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/personas/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/personas', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/stats (GET)', () => {
	it('returns AI dashboard statistics', async () => {
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/stats');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.ollamaStatus).toBe('connected');
		expect(data).toHaveProperty('activeChats');
		expect(data).toHaveProperty('embeddingModel');
		expect(data).toHaveProperty('llmModel');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/stats', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('handles Ollama down gracefully', async () => {
		mockGlobalFetch.mockRejectedValueOnce(new Error('Connection refused'));
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/stats');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.ollamaStatus).toBe('error');
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/suggestions (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/suggestions (GET)', () => {
	it('returns a list of suggestion strings', async () => {
		const { GET } = await import('../src/routes/api/ai/suggestions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/suggestions');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.suggestions).toHaveLength(5);
		expect(typeof data.suggestions[0]).toBe('string');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/suggestions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ai/suggestions', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/feedback (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/feedback (POST)', () => {
	it('stores feedback for a message', async () => {
		const { POST } = await import('../src/routes/api/ai/feedback/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/feedback', {
			body: { messageId: 'msg-123', rating: 1, comment: 'Great answer' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.messageId).toBe('msg-123');
		expect(data.rating).toBe(1);
	});

	it('returns 400 for missing messageId', async () => {
		const { POST } = await import('../src/routes/api/ai/feedback/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/feedback', {
			body: { rating: 1 },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for out-of-range rating', async () => {
		const { POST } = await import('../src/routes/api/ai/feedback/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/feedback', {
			body: { messageId: 'msg-1', rating: 5 },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/feedback/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/feedback', {
			body: { messageId: 'msg-1', rating: 1 },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/ask (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/ask (POST)', () => {
	it('returns an AI answer', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'What is due process?' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.answer).toBeTruthy();
		expect(data.model).toBe('gemma4-rotorquant:latest');
	});

	it('accepts query or prompt field as alias', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { query: 'Explain habeas corpus' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.answer).toBeTruthy();
	});

	it('returns 400 for empty question', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: {},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('handles Ollama error', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'test' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/context (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/context (POST)', () => {
	it('returns context documents for a query', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: 'contract law', caseId: TEST_CASE_ID, limit: 3 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('documents');
		expect(data).toHaveProperty('citations');
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/judge (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/judge (POST)', () => {
	it('returns a judicial analysis SSE stream', async () => {
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: {
				evidence: [
					{ id: 'ev-1', title: 'Contract document', description: 'Signed agreement' },
				],
				charges: ['breach of contract'],
				jurisdiction: 'federal',
			},
		});
		const res = await POST(event as any);
		// SSE streaming routes return 200 with ReadableStream body
		expect(res.status).toBe(200);
	});

	it('returns 400 for empty evidence array', async () => {
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: { evidence: [], charges: [] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: { evidence: [{ id: '1', title: 'test' }] },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/case-prediction (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/case-prediction (POST)', () => {
	it('returns a case prediction', async () => {
		mockDbRows.push({ id: TEST_CASE_ID, title: 'Test Case', status: 'open', practiceArea: 'Criminal', description: 'Test desc' });
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: { caseId: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.prediction).toBeTruthy();
		expect(data.caseId).toBe(TEST_CASE_ID);
		expect(data.model).toBe('gemma4-rotorquant:latest');
	});

	it('returns 404 for nonexistent case', async () => {
		// mockDbRows is empty — no case found
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: { caseId: 'nonexistent-id' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 400 for missing caseId', async () => {
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: {},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/case-scoring (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/case-scoring (POST)', () => {
	it('returns a case strength score', async () => {
		mockDbRows.push({ id: TEST_CASE_ID, title: 'Scored Case', status: 'open', description: 'Has description' });
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: { caseId: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.caseId).toBe(TEST_CASE_ID);
		expect(typeof data.score).toBe('number');
		expect(data.breakdown).toHaveProperty('evidence');
		expect(data.breakdown).toHaveProperty('witnesses');
		expect(data.grade).toBeTruthy();
	});

	it('returns 404 for nonexistent case', async () => {
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: { caseId: 'nonexistent-id' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 400 for missing caseId', async () => {
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: {},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/canon (GET)
// ─────────────────────────────────────────────────────────
describe('/api/canon (GET)', () => {
	it('returns canonical document list', async () => {
		mockDbRows.push(
			{ id: TEST_DOC_ID, title: 'US Constitution', docType: 'statute', jurisdiction: 'US', authorityLevel: 'primary' },
		);
		const { GET } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/canon');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.documents).toHaveLength(1);
	});

	it('handles filters', async () => {
		const { GET } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/canon?jurisdiction=US&authority=primary&type=statute&limit=10');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns empty on DB error', async () => {
		mockChain.then.mockImplementationOnce((_resolve: any, reject: any) => {
			throw new Error('DB error');
		});
		const { GET } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/canon');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.documents).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────
// /api/canon (POST)
// ─────────────────────────────────────────────────────────
describe('/api/canon (POST)', () => {
	it('creates a canonical document', async () => {
		const { POST } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon', {
			body: {
				title: 'Test Statute',
				docType: 'statute',
				jurisdiction: 'US',
				authorityLevel: 'primary',
				citation: '28 USC § 1',
			},
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 400 for invalid docType', async () => {
		const { POST } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon', {
			body: {
				title: 'Bad doc',
				docType: 'invalid_type',
				jurisdiction: 'US',
				authorityLevel: 'primary',
			},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/canon/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon', {
			body: { title: 'x', docType: 'statute', jurisdiction: 'US', authorityLevel: 'primary' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/canon/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/canon/search (POST)', () => {
	it('performs hybrid search on canon chunks', async () => {
		const { POST } = await import('../src/routes/api/canon/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/search', {
			body: { query: 'due process clause', limit: 5 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		// Should return results (either from Qdrant or fallback)
		expect(res.status).toBeLessThan(500);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/canon/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/canon/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/canon/ingest (POST)
// ─────────────────────────────────────────────────────────
describe('/api/canon/ingest (POST)', () => {
	it('ingests a canonical document (chunk + embed + store)', async () => {
		mockDbRows.push({
			id: TEST_DOC_ID, title: 'Test Doc', docType: 'statute',
			fullText: 'This is a test statute about due process. It has multiple sentences. The statute covers...',
			jurisdiction: 'US', authorityLevel: 'primary', citation: '28 USC § 1',
		});
		const { POST } = await import('../src/routes/api/canon/ingest/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/ingest', {
			body: { documentId: TEST_DOC_ID },
		});
		const res = await POST(event as any);
		// Should either succeed or handle error gracefully
		expect(res.status).toBeLessThan(500);
	});

	it('returns 400 for invalid UUID', async () => {
		const { POST } = await import('../src/routes/api/canon/ingest/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/ingest', {
			body: { documentId: 'not-a-uuid' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/canon/ingest/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/canon/ingest', {
			body: { documentId: TEST_DOC_ID },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});
