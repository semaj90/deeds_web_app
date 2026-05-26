// @vitest-environment node
/**
 * Route contract test for src/routes/api/research/topological-encyclopedia/+server.ts.
 *
 * G26 pattern: node env, vi.hoisted mocks, lazy import in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockGenerateSingleEmbedding,
	mockProbeAutoencoderWeights,
	mockReadLatestQdrantClusterTags,
	mockScoreClusterRelevance,
	mockDbSelect,
} = vi.hoisted(() => ({
	mockGenerateSingleEmbedding: vi.fn(),
	mockProbeAutoencoderWeights: vi.fn(),
	mockReadLatestQdrantClusterTags: vi.fn(),
	mockScoreClusterRelevance: vi.fn(),
	mockDbSelect: vi.fn(),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateSingleEmbedding: mockGenerateSingleEmbedding,
}));

vi.mock('$lib/server/gpu/autoencoder-weights.js', () => ({
	probeAutoencoderWeights: mockProbeAutoencoderWeights,
	getCachedAutoencoderWeights: vi.fn(),
}));

vi.mock('$lib/server/gpu/topology-projection.js', () => ({
	autoencoderEncode2Layer: vi.fn(),
}));

vi.mock('$lib/server/ace/cluster-tags-cache.js', () => ({
	readLatestQdrantClusterTags: mockReadLatestQdrantClusterTags,
	scoreClusterRelevance: mockScoreClusterRelevance,
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockDbSelect,
	},
}));

describe('src/routes/api/research/topological-encyclopedia/+server.ts', () => {
	describe('GET /api/research/topological-encyclopedia', () => {
		let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

		beforeEach(async () => {
			vi.resetAllMocks();
			const mod = await import('../../../../../src/routes/api/research/topological-encyclopedia/+server.js') as Record<string, unknown>;
			handler = mod.GET as typeof handler;
		});

		function makeReq(url: string) {
			return new Request(url, { method: 'GET' });
		}

		function makeUrl(search = '') {
			return new URL(`http://localhost/api/research/topological-encyclopedia${search}`);
		}

		it('401 — returns Unauthorized when locals.user is missing', async () => {
			const resp = await handler({
				request: makeReq('http://localhost/api/research/topological-encyclopedia?q=cluster'),
				locals: {},
				url: makeUrl('?q=cluster'),
				params: {},
			});

			expect(resp.status).toBe(401);
			await expect(resp.json()).resolves.toMatchObject({
				error: 'Unauthorized',
				weightsReady: false,
				rankingSource: 'none',
			});
		});

		it('400 — bad input shape returns the degraded envelope', async () => {
			const resp = await handler({
				request: makeReq('http://localhost/api/research/topological-encyclopedia?q=x'),
				locals: { user: { id: '1' } },
				url: makeUrl('?q=x'),
				params: {},
			});

			expect(resp.status).toBe(400);
			await expect(resp.json()).resolves.toMatchObject({
				query: 'x',
				repoId: 'default',
				fallback: true,
				weightsReady: false,
				rankingSource: 'none',
				clusters: [],
			});
		});

		it('200 — summary-embedding fallback returns a ranked cluster envelope', async () => {
			const queryVector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));
			const summaryVector = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));
			const rows = [
				{
					gpuCluster: 7,
					summary: 'Topology cluster summary',
					purpose: 'Topology index',
					tags: ['topology', 'cluster'],
					representativeChunkIds: ['chunk-a', 'chunk-b'],
					memberCount: 4,
					centroidDistanceMean: 0.25,
					summaryEmbedding: summaryVector,
					hasSummaryEmbedding: true,
				},
			];

			mockGenerateSingleEmbedding.mockResolvedValue(queryVector);
			mockProbeAutoencoderWeights.mockResolvedValue({ ok: false, reason: 'missing' });
			mockReadLatestQdrantClusterTags.mockReturnValue([]);
			mockScoreClusterRelevance.mockReturnValue(0);
			mockDbSelect.mockImplementation(() => ({
				from: () => ({
					where: () => ({
						orderBy: () => Promise.resolve(rows),
					}),
				}),
			}));

			const resp = await handler({
				request: makeReq('http://localhost/api/research/topological-encyclopedia?q=topology&repoId=default&topK=3'),
				locals: { user: { id: '1' } },
				url: makeUrl('?q=topology&repoId=default&topK=3'),
				params: {},
			});

			expect(resp.status).toBe(200);
			const body = (await resp.json()) as Record<string, unknown>;
			expect(body).toMatchObject({
				query: 'topology',
				repoId: 'default',
				fallback: true,
				weightsReady: false,
				rankingSource: 'summary-embedding-cosine',
				centroidCount: 0,
				clusterId: 7,
				label: 'Topology index',
				summary: 'Topology cluster summary',
				error: null,
			});
			expect(body.clusterIds).toEqual([7]);
			expect(body.didYouMean).toEqual(['Topology index']);
			expect(Array.isArray(body.encoded64)).toBe(true);
			expect(Array.isArray(body.clusters)).toBe(true);
			expect((body.clusters as Array<Record<string, unknown>>)[0]).toMatchObject({
				clusterId: 7,
				rankingSource: 'summary-embedding-cosine',
				label: 'Topology index',
				memberCount: 4,
			});
		});
	});
});
