/**
 * Test file 17: Cases Sub-Routes
 *
 * Routes tested (10):
 *   - /api/cases/[id]/overview (GET)
 *   - /api/cases/[id]/connections (GET, POST, PATCH)
 *   - /api/cases/[id]/persons (GET, POST, DELETE)
 *   - /api/cases/[id]/key-points (POST)
 *   - /api/cases/[id]/reasoning-chain (POST)
 *   - /api/cases/[id]/citations (GET, POST)
 *   - /api/cases/[id]/chat (POST)
 *   - /api/cases/[id]/canvas (GET, POST)
 *   - /api/cases/[id]/similar (GET)
 *   - /api/cases/[id]/timeline (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_CASE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const TEST_EVIDENCE_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f';
const TEST_PERSON_ID = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f8a';
const TEST_CITATION_ID = 'e5f6a7b8-c9d0-4e1f-aa3b-4c5d6e7f8a9b';

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async () =>
	new Response(JSON.stringify({
		message: { content: 'Mock LLM response' },
		response: '{"keyPoints":["Point 1","Point 2","Point 3"],"confidence":0.85}',
		model: 'gemma3-legal:latest',
	}), { status: 200, headers: { 'Content-Type': 'application/json' } })
);
vi.mock('$lib/server/ollama.js', () => ({
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
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
const mockPool = {
	query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
};
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => mockChain),
		execute: vi.fn(async () => ({ rows: [{ exists: true }] })),
		insert: vi.fn(() => ({
			values: vi.fn(() => {
				const p = Promise.resolve(undefined) as any;
				p.returning = vi.fn(async () => mockInsertReturning);
				p.onConflictDoNothing = vi.fn(() => {
					const p2 = Promise.resolve(undefined) as any;
					p2.returning = vi.fn(async () => mockInsertReturning);
					return p2;
				});
				p.onConflictDoUpdate = vi.fn(() => Promise.resolve(undefined));
				return p;
			}),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => {
				const p2 = Promise.resolve(undefined) as any;
				p2.where = vi.fn(() => Promise.resolve(undefined));
				return p2;
			}),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => Promise.resolve(undefined)),
		})),
		query: {
			canvasStates: {
				findFirst: vi.fn(async () => null),
			},
		},
	},
	pool: mockPool,
	caseStatuteLinks: { id: 'id', caseId: 'case_id', citationId: 'citation_id', linkType: 'link_type', notes: 'notes', createdAt: 'created_at' },
	citations: { id: 'id', formattedCitation: 'formatted_citation', quotedText: 'quoted_text', annotation: 'annotation', legalPrinciple: 'legal_principle' },
	cases: { id: 'id', title: 'title', description: 'description', status: 'status' },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	and: vi.fn((...a: any[]) => a),
	or: vi.fn((...a: any[]) => a),
	gt: vi.fn((...a: any[]) => a),
	gte: vi.fn((...a: any[]) => a),
	inArray: vi.fn((...a: any[]) => a),
	arrayContains: vi.fn((...a: any[]) => a),
	sql: Object.assign(vi.fn((s: any) => s), { raw: vi.fn((s: any) => s) }),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	documents: { id: 'id', title: 'title', content: 'content', fileType: 'file_type', status: 'status' },
	evidence: { id: 'id', title: 'title', description: 'description', caseId: 'case_id', fileType: 'file_type', fileName: 'file_name', evidenceType: 'evidence_type', userId: 'user_id', summary: 'summary', aiSummary: 'ai_summary', aiAnalysis: 'ai_analysis', type: 'type', createdAt: 'created_at', updatedAt: 'updated_at' },
	cases: { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority', clientName: 'client_name', opposingParty: 'opposing_party', filingDate: 'filing_date', jurisdiction: 'jurisdiction', court: 'court', practiceArea: 'practice_area', createdAt: 'created_at', updatedAt: 'updated_at' },
	personsOfInterest: { id: 'id', name: 'name', fullName: 'full_name', status: 'status', threatLevel: 'threat_level', aiProfile: 'ai_profile', caseIds: 'case_ids' },
	evidenceBoardConnections: { id: 'id', caseId: 'case_id', fromEvidenceId: 'from_evidence_id', toEvidenceId: 'to_evidence_id', connectionType: 'connection_type', label: 'label', notes: 'notes', strength: 'strength', createdBy: 'created_by', isVisible: 'is_visible' },
	caseStatuteLinks: { id: 'id', caseId: 'case_id', citationId: 'citation_id', linkType: 'link_type', notes: 'notes', createdAt: 'created_at' },
	citations: { id: 'id' },
	chatMessages: { id: 'id', userId: 'user_id', chatId: 'chat_id', role: 'role', content: 'content', metadata: 'metadata', timestamp: 'timestamp' },
	reports: { id: 'id', title: 'title' },
	caseNotes: { id: 'id' },
	evidenceAuditLog: { id: 'id' },
	auditLog: { id: 'id' },
	ragMessages: { id: 'id' },
	ragSessions: { id: 'id' },
	users: { id: 'id', name: 'name' },
}));
vi.mock('$lib/server/db/schema-postgres', () => ({
	documents: { id: 'id', title: 'title', content: 'content', fileType: 'file_type', status: 'status' },
	evidence: { id: 'id', title: 'title', description: 'description', caseId: 'case_id', fileType: 'file_type', fileName: 'file_name', evidenceType: 'evidence_type', userId: 'user_id', summary: 'summary', aiSummary: 'ai_summary', aiAnalysis: 'ai_analysis', type: 'type', createdAt: 'created_at', updatedAt: 'updated_at' },
	cases: { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority', clientName: 'client_name', opposingParty: 'opposing_party', filingDate: 'filing_date', jurisdiction: 'jurisdiction', court: 'court', practiceArea: 'practice_area', createdAt: 'created_at', updatedAt: 'updated_at' },
	personsOfInterest: { id: 'id', name: 'name', fullName: 'full_name', status: 'status', threatLevel: 'threat_level', aiProfile: 'ai_profile', caseIds: 'case_ids' },
	evidenceBoardConnections: { id: 'id', caseId: 'case_id', fromEvidenceId: 'from_evidence_id', toEvidenceId: 'to_evidence_id', connectionType: 'connection_type', label: 'label', notes: 'notes', strength: 'strength', createdBy: 'created_by', isVisible: 'is_visible' },
	caseStatuteLinks: { id: 'id', caseId: 'case_id', citationId: 'citation_id', linkType: 'link_type', notes: 'notes', createdAt: 'created_at' },
	citations: { id: 'id' },
	chatMessages: { id: 'id', userId: 'user_id', chatId: 'chat_id', role: 'role', content: 'content', metadata: 'metadata', timestamp: 'timestamp' },
	reports: { id: 'id', title: 'title' },
	caseNotes: { id: 'id' },
	evidenceAuditLog: { id: 'id' },
	auditLog: { id: 'id' },
	ragMessages: { id: 'id' },
	ragSessions: { id: 'id' },
	users: { id: 'id', name: 'name' },
}));
vi.mock('$lib/server/db/schema-chat', () => ({
	chatMetadata: { chatId: 'chat_id', userId: 'user_id', caseId: 'case_id', messageCount: 'message_count', lastMessageAt: 'last_message_at', tags: 'tags' },
}));
vi.mock('$lib/server/db/schema.js', () => ({
	documents: { id: 'id', title: 'title', content: 'content' },
	evidence: { id: 'id', title: 'title', description: 'description' },
	cases: { id: 'id', title: 'title', status: 'status' },
}));
vi.mock('$lib/server/db/schema', () => ({
	documents: { id: 'id', title: 'title', content: 'content' },
	evidence: { id: 'id', title: 'title', description: 'description' },
	cases: { id: 'id', title: 'title', status: 'status' },
	canvasStates: { id: 'id', caseId: 'case_id', stateData: 'state_data', updatedAt: 'updated_at' },
}));
vi.mock('$lib/server/db/schema/persons', () => ({
	personsOfInterest: { id: 'id', fullName: 'full_name', role: 'role', riskLevel: 'risk_level', dob: 'dob', lastKnownLocation: 'last_known_location', notes: 'notes' },
	casePersons: { id: 'id', caseId: 'case_id', personId: 'person_id', relationshipType: 'relationship_type', isPrimary: 'is_primary', createdAt: 'created_at' },
}));

// ── Validation mock ──
vi.mock('$lib/server/validation.js', () => ({
	isUuid: vi.fn((s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)),
}));

// ── Auth helpers mock ──
vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async (event: any) => ({
		userId: event.locals.user?.id ?? TEST_USER_ID,
	})),
}));

// ── Graph sync mock ──
vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({
	syncCaseToGraph: vi.fn(async () => ({ success: true })),
}));

// ── Canvas table verify mock ──
vi.mock('$lib/server/db/verify-canvas-table', () => ({
	verifyCanvasStatesTable: vi.fn(async () => true),
}));

// ── Board schema mock ──
vi.mock('$lib/schemas/board', () => ({
	boardSnapshotSchema: {
		safeParse: vi.fn((data: any) => {
			if (data && typeof data === 'object' && data.nodes) {
				return { success: true, data };
			}
			return { success: false, error: { flatten: () => ({ formErrors: ['Invalid board state'] }) } };
		}),
	},
}));

// ── Reasoning chain mock ──
const mockGenerateReasoningChain = vi.fn(async () => ({
	steps: [
		{ name: 'Issue Identification', reasoning: 'Identified key issues', confidence: 0.9, durationMs: 100 },
		{ name: 'Rule Application', reasoning: 'Applied relevant rules', confidence: 0.85, durationMs: 150 },
		{ name: 'Analysis', reasoning: 'Deep analysis', confidence: 0.88, durationMs: 120 },
		{ name: 'Conclusion', reasoning: 'Final conclusion', confidence: 0.87, durationMs: 80 },
	],
	overallConfidence: 0.875,
}));
vi.mock('$lib/server/ai/legal-reasoning-chain.js', () => ({
	generateReasoningChain: (...args: any[]) => mockGenerateReasoningChain(...args),
}));

// ── Similar cases dependencies ──
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		hybridSearch: vi.fn(async () => ({ results: [] })),
		search: vi.fn(async () => []),
	},
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateSingleEmbedding: vi.fn(async () => new Array(768).fill(0.01)),
	generateEmbeddings: vi.fn(async () => ({ vectors: [new Array(768).fill(0.01)] })),
}));
vi.mock('$lib/server/ace/context-assembler.js', () => ({
	assembleACEContext: vi.fn(async () => ({ context: 'mock' })),
}));
vi.mock('$lib/server/ml/multi-modal-ranker.js', () => ({
	MultiModalRanker: vi.fn().mockImplementation(() => ({
		rerank: vi.fn(async (items: any[]) => items),
	})),
}));
vi.mock('$lib/server/ml/user-history.js', () => ({
	UserHistoryTracker: vi.fn().mockImplementation(() => ({
		getPreferences: vi.fn(async () => ({})),
	})),
}));
vi.mock('$lib/server/graph/graph-centrality.js', () => ({
	computeCentralityForNodes: vi.fn(async () => ({})),
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
		fetch: opts.fetch ?? vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
			status: 200, headers: { 'Content-Type': 'application/json' },
		})),
	};
}

function jsonBody(r: Response) { return r.json(); }

beforeEach(() => {
	vi.clearAllMocks();
	mockDbRows.length = 0;
	mockInsertReturning.length = 0;
	mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/overview (GET)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/overview (GET)', () => {
	it('rejects unauthenticated requests', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/overview/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/overview', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('rejects invalid case ID', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/overview/+server.js');
		const event = makeEvent('GET', '/api/cases/bad/overview', {
			params: { id: 'not-uuid' },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns 404 when case not found', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/overview/+server.js');
		mockDbRows.length = 0;
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/overview', {
			params: { id: TEST_CASE_ID },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns case overview on success', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/overview/+server.js');
		mockDbRows.push({
			id: TEST_CASE_ID,
			title: 'Murder Case',
			status: 'open',
			description: 'A complex case',
			clientName: 'John Doe',
			opposingParty: 'State',
			filingDate: '2026-01-15',
			jurisdiction: 'Federal',
			court: 'District Court',
			practiceArea: 'Criminal Law',
		});
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/overview', {
			params: { id: TEST_CASE_ID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.caseId).toBe(TEST_CASE_ID);
		expect(body.caseData.title).toBe('Murder Case');
		expect(body.evidence).toBeDefined();
		expect(body.persons).toBeDefined();
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/connections (GET, POST, PATCH)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/connections (GET)', () => {
	it('rejects unauthenticated requests', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/connections/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/connections', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns connections list', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/connections/+server.js');
		mockDbRows.push(
			{ id: 'conn1', fromEvidenceId: TEST_EVIDENCE_ID, toEvidenceId: TEST_PERSON_ID, connectionType: 'related', label: 'Link' },
		);
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/connections', {
			params: { id: TEST_CASE_ID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.connections).toHaveLength(1);
	});
});

describe('/api/cases/[id]/connections (POST)', () => {
	it('rejects unauthenticated requests', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/connections/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/connections', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { fromEvidenceId: TEST_EVIDENCE_ID, toEvidenceId: TEST_PERSON_ID },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('rejects invalid input (bad UUID)', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/connections/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/connections', {
			params: { id: TEST_CASE_ID },
			body: { fromEvidenceId: 'not-uuid', toEvidenceId: 'also-bad' },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('creates connection on success', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/connections/+server.js');
		mockInsertReturning.push({ id: 'new-conn-id', caseId: TEST_CASE_ID, fromEvidenceId: TEST_EVIDENCE_ID, toEvidenceId: TEST_PERSON_ID });
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/connections', {
			params: { id: TEST_CASE_ID },
			body: {
				fromEvidenceId: TEST_EVIDENCE_ID,
				toEvidenceId: TEST_PERSON_ID,
				connectionType: 'supports',
				label: 'Key link',
			},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(201);
		const body = await jsonBody(res);
		expect(body.connection).toBeDefined();
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/persons (GET, POST, DELETE)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/persons (GET)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/persons', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns persons list', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		mockDbRows.push({
			linkId: 'link1',
			personId: TEST_PERSON_ID,
			fullName: 'Jane Doe',
			role: 'suspect',
			riskLevel: 'high',
			dob: '1990-01-01',
			lastKnownLocation: 'NYC',
			notes: 'Primary suspect',
			relationshipType: 'suspect',
			isPrimary: 'true',
			linkedAt: '2026-01-01',
		});
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/persons', {
			params: { id: TEST_CASE_ID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.persons).toHaveLength(1);
		expect(body.persons[0].fullName).toBe('Jane Doe');
	});
});

describe('/api/cases/[id]/persons (POST)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/persons', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { personId: TEST_PERSON_ID },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid personId', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/persons', {
			params: { id: TEST_CASE_ID },
			body: { personId: 'not-valid' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('links person to case on success', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		mockInsertReturning.push({ id: 'new-link-id' });
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/persons', {
			params: { id: TEST_CASE_ID },
			body: { personId: TEST_PERSON_ID, relationshipType: 'witness' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(201);
		const body = await jsonBody(res);
		expect(body.success).toBe(true);
	});
});

describe('/api/cases/[id]/persons (DELETE)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { DELETE } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		const event = makeEvent('DELETE', '/api/cases/' + TEST_CASE_ID + '/persons', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { personId: TEST_PERSON_ID },
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(401);
	});

	it('unlinks person from case', async () => {
		const { DELETE } = await import('../src/routes/api/cases/[id]/persons/+server.js');
		const event = makeEvent('DELETE', '/api/cases/' + TEST_CASE_ID + '/persons', {
			params: { id: TEST_CASE_ID },
			body: { personId: TEST_PERSON_ID },
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.success).toBe(true);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/key-points (POST)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/key-points (POST)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/key-points/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/key-points', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid case ID', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/key-points/+server.js');
		const event = makeEvent('POST', '/api/cases/bad/key-points', {
			params: { id: 'bad' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns no-op when no evidence found', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/key-points/+server.js');
		mockDbRows.length = 0;
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/key-points', {
			params: { id: TEST_CASE_ID },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.total).toBe(0);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/reasoning-chain (POST)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/reasoning-chain (POST)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/reasoning-chain/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/reasoning-chain', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { summary: 'A long case summary about property dispute in federal court' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid case ID', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/reasoning-chain/+server.js');
		const event = makeEvent('POST', '/api/cases/bad/reasoning-chain', {
			params: { id: 'bad' },
			body: { summary: 'Some summary text here' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing summary', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/reasoning-chain/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/reasoning-chain', {
			params: { id: TEST_CASE_ID },
			body: {},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns reasoning chain on success', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/reasoning-chain/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/reasoning-chain', {
			params: { id: TEST_CASE_ID },
			body: {
				summary: 'Property dispute involving two parties over deed ownership in federal court',
				keyFacts: ['Title chain unclear', 'Survey discrepancy'],
				jurisdiction: 'Federal',
			},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.success).toBe(true);
		expect(body.chain.steps).toHaveLength(4);
		expect(body.chain.overallConfidence).toBeGreaterThan(0);
	});

	it('returns 500 on chain generation failure', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/reasoning-chain/+server.js');
		mockGenerateReasoningChain.mockRejectedValueOnce(new Error('LLM timeout'));
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/reasoning-chain', {
			params: { id: TEST_CASE_ID },
			body: { summary: 'A case about deed forgery in real property transfers' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(500);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/citations (GET, POST)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/citations (GET)', () => {
	it('rejects unauthenticated requests', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/citations/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/citations', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns 400 for invalid case ID', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/citations/+server.js');
		const event = makeEvent('GET', '/api/cases/bad/citations', {
			params: { id: 'bad' },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});
});

describe('/api/cases/[id]/citations (POST)', () => {
	it('rejects unauthenticated requests', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/citations/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/citations', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { citation_id: TEST_CITATION_ID },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('rejects invalid case ID', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/citations/+server.js');
		const event = makeEvent('POST', '/api/cases/bad/citations', {
			params: { id: 'bad' },
			body: { citation_id: TEST_CITATION_ID },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/chat (POST)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/chat (POST)', () => {
	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/chat/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/chat', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
			body: { chatId: 'chat1', messages: [{ role: 'user', content: 'Hello' }] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid case ID', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/chat/+server.js');
		const event = makeEvent('POST', '/api/cases/bad/chat', {
			params: { id: 'bad' },
			body: { chatId: 'chat1', messages: [{ role: 'user', content: 'Hello' }] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for empty messages', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/chat/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/chat', {
			params: { id: TEST_CASE_ID },
			body: { chatId: 'chat1', messages: [] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('saves chat messages on success', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/chat/+server.js');
		mockInsertReturning.push({ id: 'msg1', role: 'user', content: 'Hello' });
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/chat', {
			params: { id: TEST_CASE_ID },
			body: {
				chatId: 'chat-session-1',
				messages: [
					{ role: 'user', content: 'What are the key facts?' },
					{ role: 'assistant', content: 'The key facts are...' },
				],
			},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.success).toBe(true);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/canvas (GET, POST)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/canvas (POST)', () => {
	it('returns 400 for missing case id', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/canvas/+server.js');
		const event = makeEvent('POST', '/api/cases//canvas', {
			params: { id: '' },
			body: { nodes: [] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid case ID format', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/canvas/+server.js');
		const event = makeEvent('POST', '/api/cases/bad/canvas', {
			params: { id: 'not-uuid' },
			body: { nodes: [] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('saves canvas state on success', async () => {
		const { POST } = await import('../src/routes/api/cases/[id]/canvas/+server.js');
		const event = makeEvent('POST', '/api/cases/' + TEST_CASE_ID + '/canvas', {
			params: { id: TEST_CASE_ID },
			body: { nodes: [{ id: 'n1', x: 100, y: 200 }], edges: [] },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);
		const body = await jsonBody(res);
		expect(body.success).toBe(true);
	});
});

describe('/api/cases/[id]/canvas (GET)', () => {
	it('returns 400 for invalid case ID', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/canvas/+server.js');
		const event = makeEvent('GET', '/api/cases/bad/canvas', {
			params: { id: 'bad' },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns null when no canvas state exists', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/canvas/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/canvas', {
			params: { id: TEST_CASE_ID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(200);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/similar (GET)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/similar (GET)', () => {
	it('returns 400 for invalid case ID', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/similar/+server.js');
		const event = makeEvent('GET', '/api/cases/bad/similar', {
			params: { id: 'not-valid' },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});
});

// ═════════════════════════════════════════════════════════
//  /api/cases/[id]/timeline (GET)
// ═════════════════════════════════════════════════════════
describe('/api/cases/[id]/timeline (GET)', () => {
	it('rejects unauthenticated requests', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/timeline/+server.js');
		const event = makeEvent('GET', '/api/cases/' + TEST_CASE_ID + '/timeline', {
			locals: { user: null },
			params: { id: TEST_CASE_ID },
		});
		await expect(GET(event as any)).rejects.toThrow();
	});

	it('returns 400 for invalid case ID', async () => {
		const { GET } = await import('../src/routes/api/cases/[id]/timeline/+server.js');
		const event = makeEvent('GET', '/api/cases/bad/timeline', {
			params: { id: 'not-uuid' },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});
});
