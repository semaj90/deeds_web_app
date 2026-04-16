/**
 * Unit tests for GET + POST /api/phase109/tag-chunks
 *
 * Cases covered:
 *  GET:
 *   - 401 unauthenticated
 *   - 200 collection not found
 *   - 200 collection exists with point count
 *   - 200 degraded (no error leak) when Qdrant throws
 *
 *  POST:
 *   - 401 unauthenticated
 *   - 400 invalid body (limit out of range)
 *   - 200 dryRun — returns preview, no mutations
 *   - 200 success — tagged N chunks
 *   - 500 safe error when Qdrant throws on POST
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static module mocks ───────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockGetCollections, mockGetCollection, mockScroll, mockSetPayload } = vi.hoisted(() => ({
	mockGetCollections: vi.fn(),
	mockGetCollection: vi.fn(),
	mockScroll: vi.fn(),
	mockSetPayload: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		client: {
			getCollections: (...args: unknown[]) => mockGetCollections(...args),
			getCollection: (...args: unknown[]) => mockGetCollection(...args),
			scroll: (...args: unknown[]) => mockScroll(...args),
			setPayload: (...args: unknown[]) => mockSetPayload(...args),
		},
	},
}));

// Stub fetch so classifyChunk's Ollama call returns deterministic tags
const mockFetch = vi.fn(async () =>
	new Response(JSON.stringify({ response: 'api-route, auth' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
);

// ── Helpers ───────────────────────────────────────────────────────────────────

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/phase109/tag-chunks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockFetch);
		mockGetCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768' }] });
		mockGetCollection.mockResolvedValue({ points_count: 1335 });
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeEvent({ url: '/api/phase109/tag-chunks' });
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 200 exists=false when collection is absent', async () => {
		mockGetCollections.mockResolvedValue({ collections: [] });

		const { GET } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({ url: '/api/phase109/tag-chunks' });
		const res = await GET(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.exists).toBe(false);
		expect(body.collection).toBe('codebase_chunks_768');
	});

	it('returns 200 with point count when collection exists', async () => {
		const { GET } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({ url: '/api/phase109/tag-chunks' });
		const res = await GET(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.exists).toBe(true);
		expect(body.totalPoints).toBe(1335);
	});

	it('returns 200 degraded shape (no error string) when Qdrant throws', async () => {
		mockGetCollections.mockRejectedValue(new Error('ECONNREFUSED — do not expose me'));

		const { GET } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({ url: '/api/phase109/tag-chunks' });
		const res = await GET(event as any);

		// Degraded-response contract: GET returns 200
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		// degradedJson() adds this marker
		expect(body.degraded).toBe(true);
		// Internal error string must NOT appear
		expect(JSON.stringify(body)).not.toContain('do not expose me');
		expect(body.error).toBeUndefined();
		// Shape keys present
		expect(body).toHaveProperty('collection');
		expect(body).toHaveProperty('exists');
	});
});

describe('POST /api/phase109/tag-chunks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockFetch);
		mockGetCollections.mockResolvedValue({ collections: [{ name: 'codebase_chunks_768' }] });
		mockGetCollection.mockResolvedValue({ points_count: 10 });
		mockScroll.mockResolvedValue({
			points: [{ id: 'pt1', payload: { content: 'export const GET: RequestHandler = async' } }],
			next_page_offset: null,
		});
		mockSetPayload.mockResolvedValue({ status: 'ok' });
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeEvent({ method: 'POST', url: '/api/phase109/tag-chunks', body: {} });
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when limit is out of range', async () => {
		const { POST } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({ method: 'POST', url: '/api/phase109/tag-chunks', body: { limit: 9999 } });
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 200 dryRun preview without mutating Qdrant', async () => {
		const { POST } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/phase109/tag-chunks',
			body: { limit: 10, dryRun: true },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.dryRun).toBe(true);
		expect(body).toHaveProperty('wouldTag');
		expect(mockSetPayload).not.toHaveBeenCalled();
	});

	it('returns 200 with tagged count on success', async () => {
		const { POST } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/phase109/tag-chunks',
			body: { limit: 10, dryRun: false },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(typeof body.tagged).toBe('number');
		expect(typeof body.total).toBe('number');
	});

	it('returns 500 with safe message when Qdrant scroll throws', async () => {
		mockScroll.mockRejectedValue(new Error('Qdrant internal: do not expose'));

		const { POST } = await import('../../src/routes/api/phase109/tag-chunks/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/phase109/tag-chunks',
			body: { limit: 10, dryRun: false },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(500);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.error).toBe('Auto-tagging failed');
		expect(JSON.stringify(body)).not.toContain('do not expose');
	});
});