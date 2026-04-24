// @vitest-environment node
/**
 * Unit tests for /api/cases/[id]/canvas
 *
 * The canvas endpoint is the durable source of truth for HybridBoard state —
 * POST upserts a board snapshot, GET returns it. Without these tests, the
 * new scheduleServerSave path (via the client debounce) has no server-side
 * guarantee.
 *
 * Cases covered:
 *  - 401 unauthenticated (POST + GET)
 *  - 400 invalid case id (non-UUID)
 *  - 404 case not found / not owned by user
 *  - 400 Zod rejects malformed snapshot
 *  - 503 when canvas_states table is missing
 *  - 200 POST insert (no existing row)
 *  - 200 POST update (existing row)
 *  - 200 GET returns stored snapshot
 *  - 200 GET returns null when no snapshot exists
 *  - 304 GET honors ETag on repeat request
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const {
	mockSelect,
	mockSelectFrom,
	mockSelectWhere,
	mockSelectLimit,
	mockQueryCanvasStatesFindFirst,
	mockUpdate,
	mockUpdateSet,
	mockUpdateWhere,
	mockInsert,
	mockInsertValues,
	mockVerifyTable,
} = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockSelectFrom: vi.fn(),
	mockSelectWhere: vi.fn(),
	mockSelectLimit: vi.fn(),
	mockQueryCanvasStatesFindFirst: vi.fn(),
	mockUpdate: vi.fn(),
	mockUpdateSet: vi.fn(),
	mockUpdateWhere: vi.fn(),
	mockInsert: vi.fn(),
	mockInsertValues: vi.fn(),
	mockVerifyTable: vi.fn(),
}));

// Drizzle fluent builder chain: db.select().from().where().limit()
// We return canned results by passing them via the .limit() leaf.
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockSelect,
		query: {
			canvasStates: {
				findFirst: (...args: unknown[]) => mockQueryCanvasStatesFindFirst(...args),
			},
		},
		update: mockUpdate,
		insert: mockInsert,
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	canvasStates: { caseId: 'canvas_states.case_id' },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.user_id' },
}));

vi.mock('$lib/server/db/verify-canvas-table', () => ({
	verifyCanvasStatesTable: (...args: unknown[]) => mockVerifyTable(...args),
}));

// eq/and are used inside the endpoint; we don't need real implementations
vi.mock('drizzle-orm', () => ({
	eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
	and: (...args: unknown[]) => ({ __and: args }),
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_UUID = '22222222-2222-2222-2222-222222222222';

function validSnapshot() {
	return {
		version: 1,
		viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
		nodes: [
			{ id: 'n1', kind: 'note', x: 10, y: 20, w: 100, h: 80, title: 'Hello' },
		],
		edges: [],
	};
}

function setupDbChainForCaseLookup(returnRows: Array<{ id: string }>) {
	mockSelect.mockReturnValue({ from: mockSelectFrom });
	mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
	mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
	mockSelectLimit.mockResolvedValue(returnRows);
}

function setupDbChainForUpdate() {
	mockUpdate.mockReturnValue({ set: mockUpdateSet });
	mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
	mockUpdateWhere.mockResolvedValue(undefined);
}

function setupDbChainForInsert() {
	mockInsert.mockReturnValue({ values: mockInsertValues });
	mockInsertValues.mockResolvedValue(undefined);
}

describe('/api/cases/[id]/canvas POST', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifyTable.mockResolvedValue(true);
		setupDbChainForUpdate();
		setupDbChainForInsert();
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: validSnapshot(),
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for non-UUID case id', async () => {
		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/cases/not-a-uuid/canvas',
			params: { id: 'not-a-uuid' },
			body: validSnapshot(),
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 404 when case is not owned by user', async () => {
		setupDbChainForCaseLookup([]); // empty = no row matched the AND(userId, caseId)

		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: validSnapshot(),
		});
		const res = await POST(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 503 when canvas_states table is missing', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockVerifyTable.mockResolvedValue(false);

		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: validSnapshot(),
		});
		const res = await POST(event as any);

		expect(res.status).toBe(503);
		const body = await responseJson<{ error: string; code: string }>(res);
		expect(body.code).toBe('TABLE_MISSING');
	});

	it('returns 400 when snapshot fails Zod validation', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);

		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: {
				// Missing required fields (version, nodes, edges)
				viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
			},
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('UPDATE path fires when canvas row already exists', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue({
			caseId: VALID_UUID,
			stateData: { version: 0, viewport: { pan: { x: 0, y: 0 }, zoom: 1 }, nodes: [], edges: [] },
		});

		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: validSnapshot(),
		});
		const res = await POST(event as any);

		expect(res.status).toBe(200);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('INSERT path fires when no canvas row exists', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue(null);

		const { POST } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			method: 'POST',
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
			body: validSnapshot(),
		});
		const res = await POST(event as any);

		expect(res.status).toBe(200);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		expect(mockUpdate).not.toHaveBeenCalled();

		// Body.caseId matches the param (ownership verified earlier)
		const [insertedRow] = mockInsertValues.mock.calls[0];
		expect(insertedRow).toMatchObject({ caseId: VALID_UUID });
	});
});

describe('/api/cases/[id]/canvas GET', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeEvent({
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for non-UUID id', async () => {
		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/cases/not-a-uuid/canvas',
			params: { id: 'not-a-uuid' },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 404 when case not owned by user', async () => {
		setupDbChainForCaseLookup([]);
		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			url: `/api/cases/${OTHER_UUID}/canvas`,
			params: { id: OTHER_UUID },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(404);
	});

	it('returns null body when no canvas row exists', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue(undefined);

		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson(res);
		expect(body).toBeNull();
	});

	it('returns stored snapshot with ETag header', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue({
			caseId: VALID_UUID,
			stateData: validSnapshot(),
		});

		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);
		const event = makeAuthEvent({
			url: `/api/cases/${VALID_UUID}/canvas`,
			params: { id: VALID_UUID },
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		expect(res.headers.get('etag')).toBeTruthy();

		const body = await responseJson<ReturnType<typeof validSnapshot>>(res);
		expect(body.version).toBe(1);
		expect(body.nodes).toHaveLength(1);
	});

	it('returns 304 when If-None-Match matches the stored ETag', async () => {
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue({
			caseId: VALID_UUID,
			stateData: validSnapshot(),
		});

		const { GET } = await import(
			'../../src/routes/api/cases/[id]/canvas/+server.js'
		);

		// First request: grab the ETag
		const first = await GET(
			makeAuthEvent({
				url: `/api/cases/${VALID_UUID}/canvas`,
				params: { id: VALID_UUID },
			}) as any,
		);
		const etag = first.headers.get('etag')!;
		expect(etag).toBeTruthy();

		// Second request: send it back as If-None-Match, reset mocks
		vi.clearAllMocks();
		setupDbChainForCaseLookup([{ id: VALID_UUID }]);
		mockQueryCanvasStatesFindFirst.mockResolvedValue({
			caseId: VALID_UUID,
			stateData: validSnapshot(),
		});

		const second = await GET(
			makeAuthEvent({
				url: `/api/cases/${VALID_UUID}/canvas`,
				params: { id: VALID_UUID },
				headers: { 'if-none-match': etag },
			}) as any,
		);
		expect(second.status).toBe(304);
	});
});
