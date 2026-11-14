// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

const EV_ID = '00000000-0000-0000-0000-000000000042';

function makeGetEvent(options: {
	id?: string;
	user?: { id: string } | null;
} = {}) {
	const id = options.id ?? EV_ID;
	const url = new URL(`http://localhost/api/evidence/${id}/frames`);
	return {
		params: { id },
		url,
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
		request: new Request(url, { method: 'GET' })
	} as never;
}

describe('GET /api/evidence/[id]/frames', () => {
	it('rejects unauthorized unauthenticated requests with 401', async () => {
		const res = await GET(makeGetEvent({ user: null }));
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.frames).toEqual([]);
	});

	it('rejects invalid uuid format with 400', async () => {
		const res = await GET(makeGetEvent({ id: 'invalid-id' }));
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.success).toBe(false);
		expect(body.error).toContain('Invalid ID format');
	});

	it('returns stable JSON structure on not-found or missing records', async () => {
		const res = await GET(makeGetEvent({ id: '99999999-9999-9999-9999-999999999999' }));
		expect([200, 404]).toContain(res.status);
		const body = await res.json();
		expect(Array.isArray(body.frames)).toBe(true);
		expect(typeof body.total).toBe('number');
	});
});
