import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	MINIFORGE_SIDECAR_URL: undefined as string | undefined,
	LANGEXTRACT_URL: undefined as string | undefined,
}));

vi.mock('$lib/server/env.server.js', () => ({ ENV: env }));

import { POST } from './+server.js';

describe('POST /api/admin/atlas/ontology-resolution/oak-search', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('rejects non-admin callers before parsing or contacting OAK', async () => {
		const json = vi.fn();
		const fetch = vi.spyOn(globalThis, 'fetch');
		await expect(POST({
			locals: { user: { id: 'user-1', role: 'user' } },
			request: { json },
		} as never)).rejects.toMatchObject({ status: 403 });
		expect(json).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects invalid bodies without contacting OAK', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		const response = await POST({
			locals: { user: { id: 'admin-1', role: 'admin' } },
			request: { json: async () => ({ query: '' }) },
		} as never);
		expect(response.status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('returns 503 when the OAK sidecar URL is not configured', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		const response = await POST({
			locals: { user: { id: 'admin-1', role: 'admin' } },
			request: { json: async () => ({ query: 'ontology term' }) },
		} as never);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ ok: false, error: 'oak_kernel_not_configured' });
		expect(fetch).not.toHaveBeenCalled();
	});
});
