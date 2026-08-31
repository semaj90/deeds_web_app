import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { runCuGraphPageRankAnalysis } from './cugraph-pagerank-adapter.js';

function fakePool(): Pool {
	return {} as unknown as Pool;
}

describe('cuGraph PageRank adapter (GPU backend, fail-closed)', () => {
	it('skips (does not throw, does not write) when the sidecar is unreachable', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
		const result = await runCuGraphPageRankAnalysis(fakePool(), { sidecarUrl: 'http://127.0.0.1:8098' });
		expect(result.metricsWritten).toBe(0);
		expect(result.skippedReason).toMatch(/ATLAS_RAPIDS_GRAPH_SIDECAR_UNREACHABLE/);
		expect(result.run.status).toBe('succeeded');
		expect(result.run.backendActual).toBe('gpu-sidecar');
		vi.unstubAllGlobals();
	});

	it('skips (does not auto-load) when no graph projection is resident', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			schema: 'atlas.graph-residency.v1',
			capability: { available: true, backend: 'cugraph.pagerank', backendVersion: null, algorithmRevision: 'atlas.cugraph-pagerank.v1', maxSeeds: 64, maxResultNodes: 512, minGraphFreeGpuMb: 768, importError: null },
			resident: null,
		}), { status: 200, headers: { 'content-type': 'application/json' } })));
		const result = await runCuGraphPageRankAnalysis(fakePool(), { sidecarUrl: 'http://127.0.0.1:8098' });
		expect(result.metricsWritten).toBe(0);
		expect(result.skippedReason).toMatch(/ATLAS_RAPIDS_GRAPH_NOT_RESIDENT/);
		vi.unstubAllGlobals();
	});

	it('writes only shadow PageRank metrics for bounded top-K results', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith('/v1/graph/resident')) {
				return new Response(JSON.stringify({
					schema: 'atlas.graph-residency.v1',
					capability: { available: true, backend: 'cugraph.pagerank', backendVersion: '26.08', algorithmRevision: 'atlas.cugraph-pagerank.v1', maxSeeds: 64, maxResultNodes: 512, minGraphFreeGpuMb: 768, importError: null },
					resident: { graphRevision: 'g-1', projectionRevision: 'p-1', nodeCount: 4, edgeCount: 3, nodeTableHash: 'n', edgeTableHash: 'e', loadedAtUnixMs: 1 },
				}), { status: 200, headers: { 'content-type': 'application/json' } });
			}
			return new Response(JSON.stringify({
				schema: 'atlas.graph-pagerank-receipt.v1',
				operation: 'pagerank',
				backend: 'cugraph.pagerank',
				algorithmRevision: 'atlas.cugraph-pagerank.v1',
				graphRevision: 'g-1',
				projectionRevision: 'p-1',
				nodeTableHash: 'n',
				edgeTableHash: 'e',
				seedChecksum: 's',
				seedCount: 0,
				candidateFilterCount: 0,
				alpha: 0.85,
				tol: 1e-6,
				maxIter: 100,
				didConverge: true,
				precomputedOutWeight: true,
				cacheHit: false,
				nodeCount: 4,
				edgeCount: 3,
				results: [
					{ rank: 1, gpuNodeId: 0, nodeKey: 'k0', packetKey: 'pk:0', score: 0.9 },
					{ rank: 2, gpuNodeId: 1, nodeKey: 'k1', packetKey: null, score: 0.1 },
				],
				timings: { kernelMs: 1, resultSelectMs: 1 },
			}), { status: 200, headers: { 'content-type': 'application/json' } });
		});
		vi.stubGlobal('fetch', fetchMock);

		const queries: Array<{ sql: string; params: unknown[] }> = [];
		const fakeClient = {
			query: vi.fn(async (sql: string, params?: unknown[]) => {
				queries.push({ sql, params: params ?? [] });
				return { rows: [] };
			}),
			release: vi.fn(),
		} as unknown as PoolClient;
		const db = { connect: vi.fn(async () => fakeClient) } as unknown as Pool;

		const result = await runCuGraphPageRankAnalysis(db, {
			sidecarUrl: 'http://127.0.0.1:8098',
			limit: 2,
		});

		expect(result.skippedReason).toBeUndefined();
		expect(result.metricsWritten).toBe(1); // null-packetKey result excluded, not written
		expect(result.unresolvedPacketKeys).toBe(1);
		expect(result.run.backendActual).toBe('gpu-sidecar');
		expect(result.run.gpuAccelerated).toBe(true);
		expect(result.resultSemantics).toEqual({
			algorithm: 'pagerank',
			backend: 'cugraph',
			selectionMode: 'TOP_K_SHADOW',
			vertexCount: 4,
			resultVertexCount: 2,
			resultCoverage: 0.5,
			graphRevision: 'g-1',
			projectionRevision: 'p-1',
			metricName: 'pagerank_cugraph_shadow',
			canonicalMetricEligible: false,
		});
		expect(result.run.parameters).toMatchObject({ topK: 2, selectionMode: 'TOP_K_SHADOW' });
		expect(result.run.metrics).toMatchObject({
			metricName: 'pagerank_cugraph_shadow',
			canonicalMetricEligible: false,
			resultCoverage: 0.5,
		});
		expect(queries.map((q) => q.sql.trim().slice(0, 6))).toEqual(['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);

		const metricInsert = queries.find((q) => q.sql.includes('INSERT INTO graph_node_metrics'));
		expect(metricInsert).toBeDefined();
		expect(metricInsert?.params).toContain('pagerank_cugraph_shadow');
		expect(metricInsert?.params).not.toContain('pagerank');
		vi.unstubAllGlobals();
	});
});
