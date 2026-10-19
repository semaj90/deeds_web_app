import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client', () => ({ pool: { query } }));

import { GET } from './+server.js';

describe('GET /api/phase89/stats', () => {
	beforeEach(() => query.mockReset());

	it('uses the preserved schema columns and stable response keys', async () => {
		query.mockResolvedValue({ rows: [{
			file_nodes: '4', error_nodes: '3', symbol_nodes: '2', doc_nodes: '1',
			import_edges: '5', symbol_edges: '6', error_symbol_edges: '7',
			indexed_files: '8', error_embeddings: '9',
		}] });

		const response = await GET({ locals: { user: { id: 'admin' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ file_nodes: '4', error_embeddings: '9', error: null });
		expect(Object.keys(body).sort()).toEqual([
			'doc_nodes', 'error', 'error_embeddings', 'error_nodes', 'error_symbol_edges',
			'file_nodes', 'import_edges', 'indexed_files', 'symbol_edges', 'symbol_nodes',
		].sort());
		expect(query.mock.calls[0]?.[0]).toContain("kg_nodes WHERE node_type = 'file'");
		expect(query.mock.calls[0]?.[0]).not.toContain('kg_nodes WHERE kind');
	});

	it('returns the same keys for unauthorized and database failure responses', async () => {
		const unauthorized = await GET({ locals: { user: null } } as never);
		expect(unauthorized.status).toBe(401);
		const unauthorizedBody = await unauthorized.json();

		query.mockRejectedValue(new Error('database unavailable'));
		const failed = await GET({ locals: { user: { id: 'admin' } } } as never);
		const failedBody = await failed.json();

		expect(failed.status).toBe(200);
		expect(Object.keys(failedBody).sort()).toEqual(Object.keys(unauthorizedBody).sort());
		expect(failedBody.error).toBe('Stats are temporarily unavailable');
	});
});
