import { describe, expect, it, vi } from 'vitest';
import { createCourtroomApi } from './courtroom-api-client-v1';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const CASE = '123e4567-e89b-42d3-a456-426614174000';

describe('courtroom api client', () => {
	it('lists tools through the registry route and validates the shape', async () => {
		const f = vi.fn().mockResolvedValue(ok({ success: true, tools: [{ name: 'a', category: 'x' }], count: 1 }));
		const r = await createCourtroomApi(f).listTools('evidence');
		expect(r).toEqual({ ok: true, data: [{ name: 'a', category: 'x' }] });
		expect(f).toHaveBeenCalledWith('/api/acp/tools?queryHint=evidence', expect.objectContaining({ method: 'GET' }));
	});

	it('rejects a registry response with the wrong shape', async () => {
		const f = vi.fn().mockResolvedValue(ok({ tools: 'nope' }));
		expect(await createCourtroomApi(f).listTools()).toEqual({ ok: false, reason: 'BAD_RESPONSE' });
	});

	it('posts a validated evidence search, also in local preview (read only)', async () => {
		const f = vi.fn().mockResolvedValue(ok({ results: [] }));
		const r = await createCourtroomApi(f, { localPreview: true }).searchEvidence({ query: 'alibi', caseId: CASE, limit: 5 });
		expect(r).toEqual({ ok: true, data: { results: [] } });
		const [path, init] = f.mock.calls[0];
		expect(path).toBe('/api/evidence/search');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ query: 'alibi', caseId: CASE, limit: 5 });
	});

	it('refuses a bad request before any network call', async () => {
		const f = vi.fn();
		const r = await createCourtroomApi(f).searchEvidence({ query: '', limit: 500 });
		expect(r).toMatchObject({ ok: false, reason: 'BAD_REQUEST' });
		expect(f).not.toHaveBeenCalled();
	});

	it('maps http and network failures', async () => {
		const api500 = createCourtroomApi(vi.fn().mockResolvedValue(new Response('x', { status: 500 })));
		expect(await api500.searchEvidence({ query: 'q' })).toEqual({ ok: false, reason: 'HTTP', status: 500 });
		const down = createCourtroomApi(vi.fn().mockRejectedValue(new Error('refused')));
		expect(await down.listTools()).toEqual({ ok: false, reason: 'NETWORK', message: 'refused' });
	});
});
