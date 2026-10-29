import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveOntologyLabelV1: vi.fn(),
	query: vi.fn(),
	env: { MINIFORGE_SIDECAR_URL: undefined as string | undefined, LANGEXTRACT_URL: undefined as string | undefined },
}));

vi.mock('$lib/server/db/client.js', () => ({ pool: { query: mocks.query } }));
vi.mock('$lib/server/atlas/ontology-resolution-boundary-postgres.js', () => ({ resolveOntologyLabelV1: mocks.resolveOntologyLabelV1 }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));

import { GET, POST } from './+server.js';

describe('/api/admin/atlas/ontology-resolution', () => {
	beforeEach(() => vi.clearAllMocks());

	it('rejects non-admin GET before health or database work', async () => {
		await expect(GET({ locals: { user: { id: 'user-1', role: 'user' } } } as never)).rejects.toMatchObject({ status: 403 });
		expect(mocks.resolveOntologyLabelV1).not.toHaveBeenCalled();
	});

	it('rejects malformed POST bodies before ontology resolution', async () => {
		const response = await POST({
			locals: { user: { id: 'admin-1', role: 'admin' } },
			request: { json: async () => ({ label: 17 }) },
		} as never);
		expect(response.status).toBe(400);
		expect(mocks.resolveOntologyLabelV1).not.toHaveBeenCalled();
	});

	it('reports an unconfigured OAK sidecar without probing a guessed localhost URL', async () => {
		mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
		const fetch = vi.spyOn(globalThis, 'fetch');
		const response = await GET({ locals: { user: { id: 'admin-1', role: 'admin' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.oakKernel).toEqual({ reachable: false, configured: false });
		expect(fetch).not.toHaveBeenCalled();
	});
});
