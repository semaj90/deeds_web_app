/**
 * Unit tests for POST /api/codebase/tags/rename
 *
 * Cases covered:
 *  - 401 unauthenticated
 *  - 400 invalid input (missing fields, bad regex)
 *  - 200 no-op (oldName === newName)
 *  - 200 success — renamed N points
 *  - 500 upstream failure — error message is safe (no err.message leak)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static module mocks ───────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockScroll, mockSetPayload } = vi.hoisted(() => ({
	mockScroll: vi.fn(),
	mockSetPayload: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		client: {
			scroll: (...args: unknown[]) => mockScroll(...args),
			setPayload: (...args: unknown[]) => mockSetPayload(...args),
		},
	},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

function scrollResult(points: Array<{ id: string; payload: Record<string, unknown> }>, nextOffset: null | number = null) {
	return { points, next_page_offset: nextOffset };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/codebase/tags/rename', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockScroll.mockResolvedValue(scrollResult([]));
		mockSetPayload.mockResolvedValue({ status: 'ok' });
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeEvent({
			method: 'POST',
			url: '/api/codebase/tags/rename',
			body: { oldName: 'api-route', newName: 'api-handler' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when oldName is missing', async () => {
		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeAuthEvent({ method: 'POST', url: '/api/codebase/tags/rename', body: { newName: 'api-handler' } });
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when newName contains invalid characters', async () => {
		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/codebase/tags/rename',
			body: { oldName: 'api-route', newName: 'bad name with spaces' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 200 no-op when oldName === newName', async () => {
		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/codebase/tags/rename',
			body: { oldName: 'api-route', newName: 'api-route' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.success).toBe(true);
		expect(body.updated).toBe(0);
		// Qdrant should not be called for no-op
		expect(mockScroll).not.toHaveBeenCalled();
	});

	it('returns 200 success when points are renamed', async () => {
		mockScroll.mockResolvedValue(
			scrollResult([
				{ id: 'pt1', payload: { tags: ['api-route', 'auth'] } },
				{ id: 'pt2', payload: { tags: ['api-route'] } },
			])
		);

		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/codebase/tags/rename',
			body: { oldName: 'api-route', newName: 'api-handler' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.success).toBe(true);
		expect(body.updated).toBe(2);
		expect(mockSetPayload).toHaveBeenCalledTimes(2);
	});

	it('returns 500 with safe error message when Qdrant throws', async () => {
		mockScroll.mockRejectedValue(new Error('INTERNAL: do not expose this to the client'));

		const { POST } = await import('../../src/routes/api/codebase/tags/rename/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/codebase/tags/rename',
			body: { oldName: 'api-route', newName: 'api-handler' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(500);

		const body = await responseJson<Record<string, unknown>>(res);
		// Must use safe public message only
		expect(body.error).toBe('Tag rename failed');
		// Internal detail must NOT be present
		expect(JSON.stringify(body)).not.toContain('do not expose this to the client');
		expect(body.detail).toBeUndefined();
	});
});