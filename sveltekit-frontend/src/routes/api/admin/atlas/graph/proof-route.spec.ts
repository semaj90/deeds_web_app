import { describe, expect, it, vi } from 'vitest';

const { buildGraphDispatcherProofSnapshot } = vi.hoisted(() => ({
	buildGraphDispatcherProofSnapshot: vi.fn(),
}));

vi.mock('$lib/server/graph/graph-dispatcher-proof.js', () => ({
	buildGraphDispatcherProofSnapshot,
}));

import { GET } from './proof/+server.js';

describe('GET /api/admin/atlas/graph/proof', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the graph dispatcher proof snapshot when authenticated', async () => {
		buildGraphDispatcherProofSnapshot.mockResolvedValue({
			generatedAt: new Date(0).toISOString(),
			registry: {
				generatedAt: new Date(0).toISOString(),
				algorithms: ['pagerank', 'cheirank', 'personalized_pagerank', 'louvain', 'leiden', 'kcore', 'betweenness'],
				entries: [],
				completeness: {
					exactMatch: true,
					missing: [],
					extra: [],
					duplicateAlgorithms: [],
				},
				receiptId: 'graph-dispatcher-proof-123',
			},
			louvainReceipt: null,
			openGaps: ['no succeeded Louvain run found'],
		});

		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.registry.completeness.exactMatch).toBe(true);
		expect(body.openGaps).toContain('no succeeded Louvain run found');
		expect(buildGraphDispatcherProofSnapshot).toHaveBeenCalledTimes(1);
	});
});
