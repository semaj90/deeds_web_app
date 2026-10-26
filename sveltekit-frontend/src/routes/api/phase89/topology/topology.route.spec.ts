import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client', () => ({ pool: { query } }));

import { GET } from './+server.js';

describe('GET /api/phase89/topology', () => {
	beforeEach(() => query.mockReset());

	it('groups real Phase 89 error instances and returns topology', async () => {
		query.mockResolvedValue({ rows: [
			{ file_path: 'src/routes/+page.svelte', error_count: 3, embedded_count: 2 },
		] });

		const response = await GET({ locals: { user: { id: 'admin' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.topology.summary).toEqual({ totalFiles: 1, totalErrors: 3, totalEmbedded: 2 });
		expect(body.topology.nodes[0]).toMatchObject({
			id: 'src/routes/+page.svelte',
			errorCount: 3,
			embeddedCount: 2,
			status: 'warning',
		});
		expect(query.mock.calls[0]?.[0]).toContain('FROM phase89_error_instances i');
		expect(query.mock.calls[0]?.[0]).not.toContain('raw_text');
	});

	it('keeps stable topology keys when the database query fails', async () => {
		query.mockRejectedValue(new Error('database unavailable'));

		const response = await GET({ locals: { user: { id: 'admin' } } } as never);
		const body = await response.json();

		expect(Object.keys(body).sort()).toEqual(['error', 'topology'].sort());
		expect(body.topology).toEqual({
			nodes: [],
			edges: [],
			summary: { totalFiles: 0, totalErrors: 0, totalEmbedded: 0 },
		});
	});
});
