// @vitest-environment node
import { describe, it, expect, vi, afterAll } from 'vitest';

const originalDevBypassAuth = process.env.DEV_BYPASS_AUTH;

afterAll(() => {
	if (originalDevBypassAuth === undefined) {
		delete process.env.DEV_BYPASS_AUTH;
	} else {
		process.env.DEV_BYPASS_AUTH = originalDevBypassAuth;
	}
});

describe('src/routes/api/files/+server.ts', () => {
	it('exports GET and POST handlers', async () => {
		const mod = await import('../../../../src/routes/api/files/+server.js') as Record<string, unknown>;
		expect(typeof mod.GET).toBe('function');
		expect(typeof mod.POST).toBe('function');
	});

	it('rejects unauthenticated GET, POST, and DELETE requests', async () => {
		process.env.DEV_BYPASS_AUTH = 'false';
		vi.resetModules();

		const filesMod = await import('../../../../src/routes/api/files/+server.js');
		const deleteMod = await import('../../../../src/routes/api/files/[id]/+server.js');

		const getResp = await filesMod.GET({
			locals: {},
			request: new Request('http://localhost/api/files', { method: 'GET' })
		} as never);
		expect(getResp.status).toBe(401);
		expect(await getResp.json()).toEqual({ files: [], error: 'Unauthorized' });

		const postResp = await filesMod.POST({
			locals: {},
			request: new Request('http://localhost/api/files', { method: 'POST' })
		} as never);
		expect(postResp.status).toBe(401);
		expect(await postResp.json()).toEqual({ error: 'Unauthorized' });

		const deleteResp = await deleteMod.DELETE({
			locals: {},
			params: { id: 'file-1' },
			request: new Request('http://localhost/api/files/file-1', { method: 'DELETE' })
		} as never);
		expect(deleteResp.status).toBe(401);
		expect(await deleteResp.json()).toEqual({ error: 'Unauthorized' });
	});
});
