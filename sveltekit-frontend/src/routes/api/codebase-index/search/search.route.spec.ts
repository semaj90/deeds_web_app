// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { orchestrateRetrieval, recordSearchQuery } = vi.hoisted(() => ({
	orchestrateRetrieval: vi.fn(),
	recordSearchQuery: vi.fn(),
}));

vi.mock('$lib/server/retrieval/orchestrator.js', () => ({ orchestrateRetrieval }));
vi.mock('$lib/server/analytics/search-analytics.js', () => ({ recordSearchQuery }));

import { POST } from './+server.js';

function makeEvent(body: unknown, authenticated = true) {
	const request = new Request('http://app.test/api/codebase-index/search', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
	return { request, locals: authenticated ? { user: { id: 7 } } : {} } as any;
}

describe('POST /api/codebase-index/search', () => {
	beforeEach(() => {
		orchestrateRetrieval.mockReset();
		recordSearchQuery.mockReset();
	});

	it('rejects unauthenticated requests without calling retrieval', async () => {
		const response = await POST(makeEvent({ query: 'symbol lookup' }, false));

		expect(response.status).toBe(401);
		expect(orchestrateRetrieval).not.toHaveBeenCalled();
	});

	it('rejects invalid limits and malformed bodies before retrieval', async () => {
		for (const body of [{ query: 'lookup', limit: 0 }, '{broken']) {
			const response = await POST(makeEvent(body));
			expect(response.status).toBe(400);
		}
		expect(orchestrateRetrieval).not.toHaveBeenCalled();
	});

	it('forwards the requested Top-K and preserves canonical result order and shape', async () => {
		orchestrateRetrieval.mockResolvedValue({
			chunks: [
				{ documentId: 'canonical:chunk-a', similarity: 0.94, sourceId: 'src/a.ts', content: 'first ranked source' },
				{ documentId: 'canonical:chunk-b', similarity: 0.81, sourceId: 'src/b.ts', content: 'second ranked source' },
				{ documentId: 'canonical:chunk-c', similarity: 0.72, sourceId: 'src/c.ts', content: 'outside requested Top-K' },
			],
			latencyMs: { search: 12, total: 18 },
		});

		const response = await POST(makeEvent({ query: 'packet identity', limit: 2 }));

		expect(response.status).toBe(200);
		expect(orchestrateRetrieval).toHaveBeenCalledWith({
			query: 'packet identity',
			pipeline: 'codebase',
			topK: 2,
			skipGraph: true,
			skipDag: true,
			skipAuthority: true,
		});
		expect(recordSearchQuery).toHaveBeenCalledWith({
			query: 'packet identity', pipeline: 'codebase', cacheHit: false, userId: 7,
		});
		expect(await response.json()).toEqual({
			query: 'packet identity',
			results: [
				{
					id: 'canonical:chunk-a', score: 0.94,
					payload: {
						file_path: 'src/a.ts', file_name: 'a.ts', extension: 'ts',
						content: 'first ranked source', chunk_index: 0, total_chunks: 0,
					},
				},
				{
					id: 'canonical:chunk-b', score: 0.81,
					payload: {
						file_path: 'src/b.ts', file_name: 'b.ts', extension: 'ts',
						content: 'second ranked source', chunk_index: 0, total_chunks: 0,
					},
				},
			],
			total: 2,
			vector_used: 'content',
			latencyMs: { search: 12, total: 18 },
		});
	});
});
