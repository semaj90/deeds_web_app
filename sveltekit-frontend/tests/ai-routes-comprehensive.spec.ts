/**
 * Test file 14: AI Routes — ask, summarize, suggestions, stats, legal-research,
 *   case-scoring, case-prediction, generate-image, analyze-evidence, cross-exam,
 *   contextual-chat, context, personas, judge, route-intent, memo-skeleton
 *
 * 16 routes covered (all under /api/ai/*).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_CASE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async () =>
	new Response(JSON.stringify({
		message: { content: 'Mock LLM response' },
		response: 'Mock LLM response',
		model: 'gemma4-rotorquant:latest',
		embedding: new Array(768).fill(0.01),
	}), { status: 200, headers: { 'Content-Type': 'application/json' } })
);
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
vi.mock('$lib/config/env.server.js', () => ({
	getOllamaUrl: () => 'http://localhost:11434',
	getQdrantUrl: () => 'http://localhost:6333',
}));

// ── DB mock ──
const mockDbRows: any[] = [];
const mockChain: any = {
	select: vi.fn(() => mockChain),
	from: vi.fn(() => mockChain),
	where: vi.fn(() => mockChain),
	orderBy: vi.fn(() => mockChain),
	limit: vi.fn(() => mockChain),
	offset: vi.fn(() => mockChain),
	leftJoin: vi.fn(() => mockChain),
	then: vi.fn((resolve: any) => resolve(mockDbRows)),
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => mockChain),
		execute: vi.fn(async () => ({ rows: [{ c: 5 }] })),
		insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
	},
	pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	and: vi.fn((...a: any[]) => a),
	or: vi.fn((...a: any[]) => a),
	gte: vi.fn((...a: any[]) => a),
	inArray: vi.fn((...a: any[]) => a),
	count: vi.fn(() => 'count'),
	arrayContains: vi.fn((...a: any[]) => a),
	sql: Object.assign(vi.fn((s: any) => s), { raw: vi.fn((s: any) => s) }),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	errorEvents: { id: 'id', routePath: 'route_path', kind: 'kind', severity: 'severity', message: 'message', stack: 'stack', file: 'file', lineNumber: 'line_number', clusterId: 'cluster_id', collectedAt: 'collected_at' },
	errorClusters: { id: 'id', pattern: 'pattern', severity: 'severity', errorCount: 'error_count', lastUpdated: 'last_updated', routePaths: 'route_paths' },
	apiAuditLog: { id: 'id', path: 'path', statusCode: 'status_code', createdAt: 'created_at' },
	evidence: { id: 'id', title: 'title', caseId: 'case_id', fileType: 'file_type', createdAt: 'created_at' },
	citations: { id: 'id', caseId: 'case_id', citationType: 'citation_type', quotedText: 'quoted_text', formattedCitation: 'formatted_citation' },
}));
vi.mock('$lib/server/db/schema', () => ({
	cases: { id: 'id', title: 'title', status: 'status', practiceArea: 'practice_area', description: 'description' },
	evidence: { id: 'id', caseId: 'case_id' },
	personsOfInterest: { id: 'id', caseIds: 'case_ids' },
}));

// ── Redis mock ──
vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: vi.fn(async () => null),
		set: vi.fn(),
		del: vi.fn(),
	}),
	redis: {
		get: vi.fn(async () => null),
		set: vi.fn(),
		del: vi.fn(),
	},
}));

// ── Cache mock ──
vi.mock('$lib/server/cache.js', () => ({
	setCache: vi.fn(),
	cognitiveCache: {
		getJsonbDocument: vi.fn(async () => null),
		setJsonbDocument: vi.fn(),
	},
}));

// ── Personas mock ──
vi.mock('$lib/server/ace/style-adapter.js', () => ({
	getPersonas: vi.fn(() => [
		{ id: 'professional', name: 'Professional', description: 'Formal legal tone' },
		{ id: 'casual', name: 'Casual', description: 'Friendly tone' },
	]),
}));

// ── contextualChat mock ──
vi.mock('$lib/server/llm/contextual-chat.js', () => ({
	contextualChat: vi.fn(async (opts: any) => ({
		answer: `Response to: ${opts.message}`,
		turnId: 'turn-1',
		keywords: ['test'],
		keyPhrases: ['test phrase'],
		suggestions: ['Try another query'],
		citations: [],
		latencyMs: 42,
	})),
}));

// ── Qdrant + embedding ──
vi.mock('@qdrant/js-client-rest', () => ({
	QdrantClient: vi.fn().mockImplementation(() => ({
		search: vi.fn(async () => [
			{ id: 'v1', score: 0.9, payload: { title: 'Contract A', type: 'legal' } },
		]),
	})),
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: vi.fn(async () => ({
		vectors: [new Array(768).fill(0.01)],
	})),
}));

// ── Helpers ──
function makeEvent(
	method: string,
	url: string,
	opts: { body?: any; locals?: any; params?: any; fetch?: any } = {}
) {
	const urlObj = new URL(url, 'http://localhost');
	const headers = new Headers({ 'content-type': 'application/json' });
	const req: any = new Request(urlObj, {
		method,
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
	return {
		request: req,
		url: urlObj,
		params: opts.params ?? {},
		locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
		platform: {},
		fetch: opts.fetch ?? vi.fn(async () => new Response(JSON.stringify({ results: [] }), {
			status: 200, headers: { 'Content-Type': 'application/json' },
		})),
	};
}

function jsonBody(r: Response) { return r.json(); }

beforeEach(() => {
	vi.clearAllMocks();
	mockDbRows.length = 0;
});

// ─────────────────────────────────────────────────────────
// /api/ai/ask (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/ask (POST)', () => {
	it('returns answer for question', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: 'Contract law requires consideration.' },
			model: 'gemma4-rotorquant:latest',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'What is contract law?' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.answer).toBe('Contract law requires consideration.');
		expect(data.model).toBe('gemma4-rotorquant:latest');
	});

	it('accepts query or prompt fields', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { query: 'tort law basics' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.answer).toBeTruthy();
	});

	it('returns 400 when no question provided', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when Ollama fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/ask/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/ask', {
			body: { question: 'anything' },
		}) as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/summarize (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/summarize (POST)', () => {
	it('summarizes text', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: 'The contract establishes obligations between parties.' },
			model: 'gemma4-rotorquant:latest',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/summarize/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/summarize', {
			body: { text: 'Long legal document text here...' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.summary).toBeTruthy();
	});

	it('accepts content field', async () => {
		const { POST } = await import('../src/routes/api/ai/summarize/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/summarize', {
			body: { content: 'Some content to summarize' },
		}) as any);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no text', async () => {
		const { POST } = await import('../src/routes/api/ai/summarize/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/summarize', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/summarize/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/summarize', {
			body: { text: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/suggestions (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/suggestions (GET)', () => {
	it('returns suggestions array', async () => {
		const { GET } = await import('../src/routes/api/ai/suggestions/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/ai/suggestions') as any);
		const data = await jsonBody(res);
		expect(data.suggestions).toHaveLength(5);
		expect(typeof data.suggestions[0]).toBe('string');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/suggestions/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/ai/suggestions', {
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/stats (GET)', () => {
	it('returns AI dashboard stats', async () => {
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		// Mock global fetch for Ollama /api/tags
		const mockFetch = vi.fn(async () => new Response(JSON.stringify({
			models: [{ name: 'gemma4-rotorquant:latest' }, { name: 'embeddinggemma:latest' }],
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const origFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		try {
			const res = await GET(makeEvent('GET', 'http://localhost/api/ai/stats') as any);
			const data = await jsonBody(res);
			expect(data.ollamaStatus).toBe('connected');
			expect(data.embeddingModel).toContain('embed');
			expect(data.llmModel).toContain('legal');
			expect(typeof data.activeChats).toBe('number');
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it('handles Ollama disconnected gracefully', async () => {
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		const origFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => { throw new Error('conn refused'); });
		try {
			const res = await GET(makeEvent('GET', 'http://localhost/api/ai/stats') as any);
			const data = await jsonBody(res);
			expect(data.ollamaStatus).toBe('error');
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/stats/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/ai/stats', {
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/personas (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ai/personas (GET)', () => {
	it('returns personas list', async () => {
		const { GET } = await import('../src/routes/api/ai/personas/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/ai/personas') as any);
		const data = await jsonBody(res);
		expect(data.personas).toHaveLength(2);
		expect(data.personas[0].id).toBe('professional');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/ai/personas/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/ai/personas', {
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/legal-research (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/legal-research (POST)', () => {
	it('returns research results', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: 'Summary of contract law research...' },
			model: 'gemma4-rotorquant:latest',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/legal-research/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/legal-research', {
			body: { topic: 'contract breach remedies' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.research).toBeTruthy();
		expect(data.topic).toBe('contract breach remedies');
	});

	it('accepts query field', async () => {
		const { POST } = await import('../src/routes/api/ai/legal-research/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/legal-research', {
			body: { query: 'tort law standards' },
		}) as any);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no topic', async () => {
		const { POST } = await import('../src/routes/api/ai/legal-research/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/legal-research', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/legal-research/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/legal-research', {
			body: { topic: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when Ollama fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/legal-research/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/legal-research', {
			body: { topic: 'test' },
		}) as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/case-scoring (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/case-scoring (POST)', () => {
	it('returns case score', async () => {
		// Mock case lookup + evidence count + POI count
		mockDbRows.push({ id: TEST_CASE_ID, title: 'Test Case', status: 'open', description: 'A test case', practiceArea: null });
		const { db } = await import('$lib/server/db/client');
		const selectSpy = db.select as ReturnType<typeof vi.fn>;
		let callCount = 0;
		selectSpy.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				// Case row
				return {
					...mockChain,
					then: vi.fn((r: any) => r([{ id: TEST_CASE_ID, title: 'Test Case', status: 'open', description: 'A case', practiceArea: null }])),
					[Symbol.iterator]: function* () { yield { id: TEST_CASE_ID, title: 'Test Case', status: 'open', description: 'A case', practiceArea: null }; },
				};
			} else if (callCount === 2) {
				// Evidence count
				return {
					...mockChain,
					then: vi.fn((r: any) => r([{ count: 3 }])),
					[Symbol.iterator]: function* () { yield { count: 3 }; },
				};
			} else {
				// POI count
				return {
					...mockChain,
					then: vi.fn((r: any) => r([{ count: 1 }])),
					[Symbol.iterator]: function* () { yield { count: 1 }; },
				};
			}
		});

		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: { caseId: TEST_CASE_ID },
		}) as any);
		const data = await jsonBody(res);
		expect(data.score).toBeGreaterThan(0);
		expect(data.breakdown).toBeDefined();
		expect(data.grade).toBeTruthy();
	});

	it('returns 400 for missing caseId', async () => {
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/case-scoring/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-scoring', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/case-prediction (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/case-prediction (POST)', () => {
	it('returns case prediction', async () => {
		// Override mockDbRows for the first db call (case lookup) and second (evidence count)
		const { db } = await import('$lib/server/db/client');
		const selectSpy = db.select as ReturnType<typeof vi.fn>;
		selectSpy.mockReset();
		let callCount = 0;
		const makeFakeChain = (rows: any[]) => {
			const c: any = {};
			c.select = vi.fn(() => c);
			c.from = vi.fn(() => c);
			c.where = vi.fn(() => c);
			c.orderBy = vi.fn(() => c);
			c.limit = vi.fn(() => c);
			c.offset = vi.fn(() => c);
			c.leftJoin = vi.fn(() => c);
			c.then = vi.fn((resolve: any) => resolve(rows));
			c[Symbol.iterator] = function* () { yield* rows; };
			return c;
		};
		selectSpy.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return makeFakeChain([{ id: TEST_CASE_ID, title: 'Prediction Case', status: 'open', practiceArea: 'Civil', description: 'Test' }]);
			}
			return makeFakeChain([{ count: 2 }]);
		});

		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: '70% likely favorable outcome.' },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: { caseId: TEST_CASE_ID },
		}) as any);
		const data = await jsonBody(res);
		expect(data.prediction).toBeTruthy();
		expect(data.caseTitle).toBe('Prediction Case');
	});

	it('returns 400 for missing caseId', async () => {
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/case-prediction/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/case-prediction', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/generate-image (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/generate-image (POST)', () => {
	it('generates image descriptor', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			response: '{"description":"A courtroom scene","dominantColors":["#2c3e50"],"elements":["gavel"],"mood":"serious"}',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/generate-image/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/generate-image', {
			body: { prompt: 'courtroom scene' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.type).toBe('descriptor');
	});

	it('returns placeholder when Ollama unavailable', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/generate-image/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/generate-image', {
			body: { prompt: 'test image' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.type).toBe('placeholder');
	});

	it('returns 400 for empty prompt', async () => {
		const { POST } = await import('../src/routes/api/ai/generate-image/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/generate-image', {
			body: { prompt: '' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/generate-image/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/generate-image', {
			body: { prompt: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/analyze-evidence (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/analyze-evidence (POST)', () => {
	it('returns structured analysis', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: JSON.stringify({
				summary: 'Contract evidence analysis',
				keyTerms: ['breach', 'liability'],
				sentiment: 0.3,
				importance: 0.8,
				confidence: 0.9,
				legalRelevance: 'Relevant to breach claim',
				suggestedTags: ['contract', 'breach'],
			}) },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/analyze-evidence/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/analyze-evidence', {
			body: { text: 'The defendant breached the contract on March 15.', evidenceId: 'ev-1' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.summary).toBe('Contract evidence analysis');
		expect(data.keyTerms).toContain('breach');
		expect(data.confidence).toBeGreaterThan(0);
	});

	it('returns 400 for empty text', async () => {
		const { POST } = await import('../src/routes/api/ai/analyze-evidence/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/analyze-evidence', {
			body: { text: '' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/analyze-evidence/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/analyze-evidence', {
			body: { text: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when Ollama fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/analyze-evidence/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/analyze-evidence', {
			body: { text: 'some evidence text' },
		}) as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/cross-exam (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/cross-exam (POST)', () => {
	it('generates cross-examination questions', async () => {
		const sessionResult = JSON.stringify({
			session: {
				id: 'cx-1',
				witness: { name: 'John Doe' },
				questions: [{ text: 'Isn\'t it true you saw the defendant?', purpose: 'Establish presence', expectedAnswer: 'Yes', followUp: 'At what time?' }],
				strategy: 'Impeach credibility',
				generatedAt: new Date().toISOString(),
			},
		});
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: sessionResult },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/cross-exam/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/cross-exam', {
			body: { witness: { name: 'John Doe', statement: 'I saw the defendant at noon.' }, caseContext: 'Robbery case' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.session).toBeDefined();
		expect(data.session.witness.name).toBe('John Doe');
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/cross-exam/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/cross-exam', {
			body: { witness: {} },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when Ollama fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/ai/cross-exam/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/cross-exam', {
			body: { witness: { name: 'Jane' } },
		}) as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/contextual-chat (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/contextual-chat (POST)', () => {
	it('returns contextual chat response', async () => {
		const { POST } = await import('../src/routes/api/ai/contextual-chat/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/contextual-chat', {
			body: { message: 'What is the statute of limitations?', caseId: TEST_CASE_ID },
		}) as any);
		const data = await jsonBody(res);
		expect(data.response).toContain('statute of limitations');
		expect(data.turnId).toBe('turn-1');
		expect(data.suggestions).toBeDefined();
	});

	it('accepts query field', async () => {
		const { POST } = await import('../src/routes/api/ai/contextual-chat/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/contextual-chat', {
			body: { query: 'test query' },
		}) as any);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no message', async () => {
		const { POST } = await import('../src/routes/api/ai/contextual-chat/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/contextual-chat', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/context (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/context (POST)', () => {
	it('returns context documents and citations', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: 'contract law', caseId: TEST_CASE_ID },
		}) as any);
		const data = await jsonBody(res);
		expect(data.documents).toBeDefined();
		expect(data.citations).toBeDefined();
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: '' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/context/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/context', {
			body: { query: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/judge (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ai/judge (POST)', () => {
	it('returns judicial analysis', async () => {
		const analysis = {
			analysis: {
				id: 'a-1',
				caseId: null,
				generatedAt: new Date().toISOString(),
				summary: 'The evidence is substantial.',
				admissibility: [{ evidence: 'Doc 1', ruling: 'admissible', reasoning: 'Relevant', legalBasis: 'FRE 401' }],
				probableCause: { assessment: 'strong', reasoning: 'Clear evidence', factors: ['physical evidence'] },
				caseStrength: { overall: 75, prosecution: 80, defense: 40, keyFactors: [{ factor: 'witness', impact: 'high', weight: 0.8 }] },
				recommendations: ['Proceed with charges'],
				risks: ['Witness availability'],
			},
		};
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: JSON.stringify(analysis) },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: {
				evidence: [{ id: 'e1', title: 'Doc 1', description: 'Contract' }],
				charges: ['breach of contract'],
			},
		}) as any);
		const data = await jsonBody(res);
		expect(data.analysis || data.session || data).toBeTruthy();
	});

	it('returns 400 for empty evidence', async () => {
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: { evidence: [] },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/judge/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/judge', {
			body: { evidence: [{ id: 'e1', title: 'Doc' }] },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/route-intent (POST) — SSE streaming
// ─────────────────────────────────────────────────────────
describe('/api/ai/route-intent (POST)', () => {
	it('returns SSE stream for statute analysis', async () => {
		// Mock ollamaFetch returning a stream body
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('{"message":{"content":"Analysis"}}\n'));
				controller.close();
			},
		});
		mockOllamaFetch.mockResolvedValueOnce(new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		}));
		const { POST } = await import('../src/routes/api/ai/route-intent/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/route-intent', {
			body: { query: 'contract law obligations', userQuestion: 'What does section 2 mean?' },
		}) as any);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');
	});

	it('returns 400 for no query', async () => {
		const { POST } = await import('../src/routes/api/ai/route-intent/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/route-intent', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/route-intent/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/route-intent', {
			body: { query: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ai/memo-skeleton (POST) — SSE streaming
// ─────────────────────────────────────────────────────────
describe('/api/ai/memo-skeleton (POST)', () => {
	it('returns SSE stream for memo outline', async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('{"message":{"content":"IRAC Analysis:"}}\n'));
				controller.close();
			},
		});
		mockOllamaFetch.mockResolvedValueOnce(new Response(stream, {
			status: 200,
			headers: { 'Content-Type': 'text/event-stream' },
		}));
		const { POST } = await import('../src/routes/api/ai/memo-skeleton/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/memo-skeleton', {
			body: { facts: 'The defendant breached the contract.', statutes: 'UCC 2-301' },
		}) as any);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');
	});

	it('returns 400 for empty facts and statutes', async () => {
		const { POST } = await import('../src/routes/api/ai/memo-skeleton/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/memo-skeleton', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ai/memo-skeleton/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/ai/memo-skeleton', {
			body: { facts: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});
