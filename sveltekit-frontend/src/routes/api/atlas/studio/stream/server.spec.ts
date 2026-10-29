import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUser = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/auth-utils.js', () => ({ requireUser }));

import { POST } from './+server.js';

function createRequest(body: unknown): Request {
	return new Request('http://localhost/api/atlas/studio/stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('POST /api/atlas/studio/stream', () => {
	beforeEach(() => {
		requireUser.mockReset().mockImplementation((event: { locals: { user?: unknown } }) => {
			if (!event.locals.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
			return event.locals.user;
		});
	});

	it('rejects unauthenticated callers before processing the request body', async () => {
		const request = new Request('http://localhost/api/atlas/studio/stream', {
			method: 'POST',
			body: 'not-json',
		});

		await expect(POST({ request, locals: {} } as any)).rejects.toMatchObject({ status: 401 });
		expect(requireUser).toHaveBeenCalledOnce();
	});

	it('returns 400 for malformed JSON and 422 for an invalid envelope', async () => {
		const malformed = new Request('http://localhost/api/atlas/studio/stream', {
			method: 'POST',
			body: 'not-json',
		});
		const malformedResponse = await POST({ request: malformed, locals: { user: { id: 'user-1' } } } as any);
		expect(malformedResponse.status).toBe(400);
		expect(await malformedResponse.json()).toEqual({ error: 'INVALID_JSON_PAYLOAD' });

		const invalidResponse = await POST({ request: createRequest({ threadId: '', runId: 'run-1', query: 'diagnose' }), locals: { user: { id: 'user-1' } } } as any);
		expect(invalidResponse.status).toBe(422);
		expect(await invalidResponse.json()).toMatchObject({ error: 'SCHEMA_VALIDATION_FAILED' });
	});

	it('streams deterministic diagnostic events without admitting authority', async () => {
		const response = await POST({
			request: createRequest({ threadId: 'thread-1', runId: 'run-1', query: 'inspect route', permissionTier: 'READ_ONLY' }),
			locals: { user: { id: 'user-1' } },
		} as any);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		expect(body).toContain('RUN_STARTED');
		expect(body).toContain('RUN_FINISHED');
		expect(body).toContain('Diagnostic mode only');
	});

	it('refuses AUTHORITY_ADMITTED requests while workspace admission is closed', async () => {
		const response = await POST({
			request: createRequest({ threadId: 'thread-1', runId: 'run-2', query: 'promote', permissionTier: 'AUTHORITY_ADMITTED' }),
			locals: { user: { id: 'user-1' } },
		} as any);
		const body = await response.text();

		expect(body).toContain('RUN_REFUSED');
		expect(body).toContain('WORKSPACE_NOT_ADMITTED');
		expect(body).not.toContain('RUN_FINISHED');
	});
});
