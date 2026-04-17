// @vitest-environment node
/**
 * GET + DELETE /api/codebase-index/tags Tests
 *
 * Contract:
 *   - GET: Auth guard → 401; Qdrant scroll aggregates tags/kinds/auditFlags;
 *          degraded upstream → 200 with empty defaults (same top-level key set)
 *   - DELETE: Auth guard → 401; Zod validation → 400; strips tag from matching
 *             points → { success, tag, removed }; Qdrant error → 500
 *
 * Pattern (G26 — lazy-import):
 *   - vi.hoisted() for variables referenced inside vi.mock() factories
 *   - Lazy-import handler inside beforeEach so mock state is fresh
 *   - 4 baseline cases per verb: 401, success, degraded upstream, key-set parity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGlobalFetch } = vi.hoisted(() => {
	const mockGlobalFetch = vi.fn();
	return { mockGlobalFetch };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://localhost:6333',
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
	fastJsonParse: (text: string) => JSON.parse(text),
}));

// ── response factories ────────────────────────────────────────────────────────

function makeScrollResponse(
	points: { id: number; payload: Record<string, unknown> }[],
	nextOffset: number | null = null,
) {
	const body = JSON.stringify({
		result: { points, next_page_offset: nextOffset },
	});
	return { ok: true, status: 200, text: () => Promise.resolve(body) } as unknown as Response;
}

function makeScrollEmpty() {
	return makeScrollResponse([], null);
}

function makeQdrantError(status = 503) {
	return { ok: false, status, text: () => Promise.resolve('error') } as unknown as Response;
}

function makeQdrantOk() {
	return { ok: true, status: 200, text: () => Promise.resolve('{}') } as unknown as Response;
}

// ── event factories ───────────────────────────────────────────────────────────

function makeGetEvent(params: Record<string, string> = {}, userId = 'user-1') {
	const sp = new URLSearchParams(params);
	const url = new URL(`http://localhost/api/codebase-index/tags?${sp}`);
	return {
		url,
		locals: { user: userId ? { id: userId } : null },
		request: new Request(url.toString()),
	};
}

function makeDeleteEvent(body: unknown = {}, userId = 'user-1') {
	return {
		request: new Request('http://localhost/api/codebase-index/tags', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user: userId ? { id: userId } : null },
	};
}

// ── GET /api/codebase-index/tags ──────────────────────────────────────────────

describe('GET /api/codebase-index/tags', () => {
	let GET: (typeof import('../../src/routes/api/codebase-index/tags/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		const mod = await import('../../src/routes/api/codebase-index/tags/+server.js');
		GET = mod.GET;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// 1. Auth guard
	it('GET returns 401 when user absent', async () => {
		const res = await GET(makeGetEvent({}, '') as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	// 2. Success — required top-level keys
	it('GET success returns required top-level keys', async () => {
		const points = [
			{ id: 1, payload: { tags: ['auth', 'api'], kind: 'route', neo4j_hasAuthGuard: true } },
			{ id: 2, payload: { tags: ['route'], kind: 'component', neo4j_hasAuthGuard: false } },
			{ id: 3, payload: { tags: ['api'], kind: 'util' } },
		];
		mockGlobalFetch.mockResolvedValue(makeScrollResponse(points, null));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('totalChunks');
		expect(body).toHaveProperty('enriched');
		expect(body).toHaveProperty('tags');
		expect(body).toHaveProperty('kinds');
		expect(body).toHaveProperty('routeTypes');
		expect(body).toHaveProperty('clusters');
		expect(body).toHaveProperty('auditFlags');
		expect(body).toHaveProperty('averageComplexity');
		expect(body).toHaveProperty('averagePageRank');
		expect(body).toHaveProperty('scrolledLimit');
		expect(body).toHaveProperty('kindFilter');
		expect(Array.isArray(body.tags)).toBe(true);
	});

	// 3. Degraded — Qdrant !ok on first page → 200 with empty defaults
	it('GET degraded (Qdrant !ok on first page) returns 200 with empty defaults', async () => {
		mockGlobalFetch.mockResolvedValue(makeQdrantError(503));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('tags');
		expect(Array.isArray(body.tags)).toBe(true);
		expect(body.tags).toHaveLength(0);
		expect(body).toHaveProperty('kinds');
		expect(body).toHaveProperty('totalChunks', 0);
	});

	// 4. Degraded — fetch throws → 200 with empty defaults
	it('GET degraded (fetch throws) returns 200 with empty defaults', async () => {
		mockGlobalFetch.mockRejectedValue(new Error('ECONNREFUSED ::1:6333'));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('tags');
		expect(Array.isArray(body.tags)).toBe(true);
		expect(body.tags).toHaveLength(0);
		expect(body).toHaveProperty('kinds');
		expect(body).toHaveProperty('totalChunks', 0);
	});

	// 5. Tag count aggregation
	it('GET aggregates tag counts correctly', async () => {
		const points = [
			{ id: 1, payload: { tags: ['auth', 'api'] } },
			{ id: 2, payload: { tags: ['auth', 'route'] } },
		];
		mockGlobalFetch.mockResolvedValue(makeScrollResponse(points, null));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		const body = await res.json();

		const authTag = body.tags.find((t: { tag: string; count: number }) => t.tag === 'auth');
		const apiTag = body.tags.find((t: { tag: string; count: number }) => t.tag === 'api');

		expect(authTag).toBeDefined();
		expect(authTag.count).toBe(2);
		expect(apiTag).toBeDefined();
		expect(apiTag.count).toBe(1);
	});

	// 6. Audit flag aggregation
	it('GET aggregates audit flags correctly', async () => {
		const points = [
			{ id: 1, payload: { neo4j_hasAuthGuard: true } },
			{ id: 2, payload: { neo4j_hasAuthGuard: true } },
			{ id: 3, payload: { neo4j_hasAuthGuard: false } },
		];
		mockGlobalFetch.mockResolvedValue(makeScrollResponse(points, null));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		const body = await res.json();

		expect(body.auditFlags.hasAuthGuard).toBe(2);
		expect(body.auditFlags.noAuthGuard).toBe(1);
	});

	// 7. Pagination — follows next_page_offset when first page is a full 1000-point batch
	it('GET follows pagination when next_page_offset is set', async () => {
		// Handler only continues to page 2 when points.length >= PAGE_SIZE (1000)
		const page1Points = Array.from({ length: 1000 }, (_, i) => ({
			id: i + 1,
			payload: { tags: ['auth'], kind: 'route' } as Record<string, unknown>,
		}));
		const page2Points = [
			{ id: 1001, payload: { tags: ['util'] } },
			{ id: 1002, payload: { tags: ['component'] } },
		];

		mockGlobalFetch
			.mockResolvedValueOnce(makeScrollResponse(page1Points, 1000))
			.mockResolvedValueOnce(makeScrollResponse(page2Points, null));

		const res = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		const body = await res.json();

		expect(body.totalChunks).toBe(1002);
		expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
	});

	// 8. Kind filter — ?kind=route sends filter in body
	it('GET filters by kind when ?kind=route', async () => {
		mockGlobalFetch.mockResolvedValue(makeScrollEmpty());

		const res = await GET(makeGetEvent({ kind: 'route' }) as unknown as Parameters<typeof GET>[0]);
		const body = await res.json();

		expect(body.kindFilter).toBe('route');

		// Verify fetch was called with a filter in the request body
		const [, fetchOptions] = mockGlobalFetch.mock.calls[0];
		const sentBody = JSON.parse((fetchOptions as RequestInit).body as string);
		expect(sentBody).toHaveProperty('filter');
		expect(sentBody.filter.must[0].key).toBe('kind');
		expect(sentBody.filter.must[0].match.value).toBe('route');
	});

	// 9. Shape parity — degraded and success share same top-level key set
	it('degraded and success shapes share same top-level key set', async () => {
		// Success path
		mockGlobalFetch.mockResolvedValue(makeScrollEmpty());
		const successRes = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		const successBody = await successRes.json();
		const successKeys = Object.keys(successBody);

		// Degraded path
		mockGlobalFetch.mockRejectedValue(new Error('timeout'));
		const degradedRes = await GET(makeGetEvent() as unknown as Parameters<typeof GET>[0]);
		const degradedBody = await degradedRes.json();

		for (const key of successKeys) {
			expect(degradedBody, `degraded missing key: ${key}`).toHaveProperty(key);
		}
	});
});

// ── DELETE /api/codebase-index/tags ──────────────────────────────────────────

describe('DELETE /api/codebase-index/tags', () => {
	let DELETE: (typeof import('../../src/routes/api/codebase-index/tags/+server.js'))['DELETE'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		const mod = await import('../../src/routes/api/codebase-index/tags/+server.js');
		DELETE = mod.DELETE;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// 10. Auth guard
	it('DELETE returns 401 when user absent', async () => {
		const res = await DELETE(makeDeleteEvent({ tag: 'auth' }, '') as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	// 11. Zod validation — tag missing
	it('DELETE returns 400 when tag is missing', async () => {
		const res = await DELETE(makeDeleteEvent({}) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	// 12. Zod validation — tag is empty string
	it('DELETE returns 400 when tag is empty string', async () => {
		const res = await DELETE(makeDeleteEvent({ tag: '' }) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	// 13. Success — removes tag from matching points
	it('DELETE success removes tag from matching points — returns { success: true, tag, removed }', async () => {
		const points = [
			{ id: 1, payload: { tags: ['auth', 'api'] } },
			{ id: 2, payload: { tags: ['auth'] } },
		];

		// scroll returns 2 points + no next page, then payload PUT calls return ok
		mockGlobalFetch
			.mockResolvedValueOnce(makeScrollResponse(points, null)) // scroll
			.mockResolvedValue(makeQdrantOk()); // PUT calls (one per point)

		const res = await DELETE(makeDeleteEvent({ tag: 'auth' }) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.success).toBe(true);
		expect(body.tag).toBe('auth');
		expect(body.removed).toBe(2);
	});

	// 14. No matching points — removed: 0
	it('DELETE when no points have the tag returns { success: true, removed: 0 }', async () => {
		mockGlobalFetch.mockResolvedValue(makeScrollEmpty());

		const res = await DELETE(makeDeleteEvent({ tag: 'nonexistent' }) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.success).toBe(true);
		expect(body.removed).toBe(0);
	});

	// 15. String tags (not array) in payload
	it('DELETE handles string tags (not array) in payload', async () => {
		const points = [
			{ id: 1, payload: { tags: 'auth' } }, // string, not array
		];

		mockGlobalFetch
			.mockResolvedValueOnce(makeScrollResponse(points, null)) // scroll
			.mockResolvedValue(makeQdrantOk()); // PUT

		const res = await DELETE(makeDeleteEvent({ tag: 'auth' }) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.success).toBe(true);
		expect(body.removed).toBe(1);

		// Verify PUT was called with empty tags array (tag stripped)
		const putCalls = mockGlobalFetch.mock.calls.slice(1); // skip first (scroll)
		expect(putCalls.length).toBeGreaterThan(0);
		const putBody = JSON.parse((putCalls[0][1] as RequestInit).body as string);
		expect(putBody.payload.tags).toEqual([]);
	});

	// 16. Scroll throws → 500
	it('DELETE returns 500 when scroll throws', async () => {
		mockGlobalFetch.mockRejectedValue(new Error('ECONNREFUSED ::1:6333'));

		const res = await DELETE(makeDeleteEvent({ tag: 'auth' }) as unknown as Parameters<typeof DELETE>[0]);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});
});
