import { describe, expect, it } from 'vitest';
import { computeRelationshipProjectionHashV3 } from './graph-projection-manifest.js';
import { computeGraphProjectionSnapshotHashV1 } from './graph-projection-snapshot-v1.js';
import { compilePageRankGpuFabricRequest, pageRankGpuFabricRequestToArgs } from './pagerank-gpu-fabric-request.js';

function fixture() {
	const relationships = {
		IMPORTS: {
			sourceType: 'IMPORTS',
			projectedType: 'IMPORTS',
			orientation: 'NATURAL' as const,
			aggregation: 'NONE' as const,
			properties: {
				weight: {
					projectedProperty: 'weight',
					sourceProperty: 'weight',
					defaultValue: 1,
					aggregation: 'NONE' as const,
				},
			},
		},
	};
	const projectionHash = computeRelationshipProjectionHashV3(relationships);
	const projection = {
		schema: 'atlas.graph-projection-manifest.v3' as const,
		projectionRevision: 'projection-v3-test',
		graphRevision: 'graph-rev-test',
		projectionName: 'atlas_dependency_test',
		nodeLabels: ['CodebaseFile'],
		relationships,
		projectionHash,
		nodeCount: 3,
		relationshipCount: 2,
		createdAt: '2026-08-19T20:00:00.000Z',
	};
	const parityManifest = {
		graphRevision: projection.graphRevision,
		nodeCount: 3,
		edgeCount: 2,
		producerRevision: 'fixture-exporter-v1',
		nodeTableHash: 'node-table-hash',
		edgeTableHash: 'edge-table-hash',
		identityContractVersion: 'identity-contract-v1',
		projectionRevision: 'graph-snapshot-parity-v1',
	};
	const snapshot = {
		schema: 'atlas.graph-projection-snapshot.v1' as const,
		projection,
		parityManifest,
		artifactPaths: { nodesParquet: 'nodes.parquet', edgesParquet: 'edges.parquet', manifestJson: 'manifest.json' },
		materialization: 'PARQUET_DIRECTED_EDGE_LIST' as const,
		edgeWeightColumn: 'weight' as const,
		contentHash: computeGraphProjectionSnapshotHashV1({
			projectionRevision: projection.projectionRevision,
			projectionHash,
			projectionName: projection.projectionName,
			graphRevision: parityManifest.graphRevision,
			nodeTableHash: parityManifest.nodeTableHash,
			edgeTableHash: parityManifest.edgeTableHash,
			nodeCount: parityManifest.nodeCount,
			edgeCount: parityManifest.edgeCount,
		}),
		producerRevision: 'snapshot-test-v1',
		createdAt: '2026-08-19T20:01:00.000Z',
	};
	const plan = {
		schema: 'atlas.pagerank-execution-plan.v1' as const,
		runId: 'run-test',
		canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS' as const,
		algorithmFamily: 'PAGERANK' as const,
		algorithm: 'pagerank' as const,
		algorithmRevision: 'cugraph-pagerank-challenger-v1',
		executor: { executorId: 'CUGRAPH' as const, role: 'GPU_CHALLENGER' as const },
		projection,
		parameters: {
			dampingFactor: 0.85,
			maxIterations: 100,
			tolerance: 1e-8,
			relationshipTypes: ['IMPORTS'],
			weighted: true,
			relationshipWeightProperty: 'weight',
			personalization: { mode: 'GLOBAL' as const },
		},
		producerRevision: 'request-test-v1',
		createdAt: '2026-08-19T20:02:00.000Z',
	};
	return { snapshot, plan };
}

describe('PageRank GPU fabric request compiler', () => {
	it('compiles a global cuGraph challenger plan into the single GPU worker mode', () => {
		const { snapshot, plan } = fixture();
		const request = compilePageRankGpuFabricRequest({ snapshot, plan });
		expect(request.mode).toBe('graph_pagerank_cugraph');
		expect(request.projectionHash).toBe(snapshot.projection.projectionHash);
		expect(request.projectionSnapshotHash).toBe(snapshot.contentHash);
		expect(request.relationshipTypes).toEqual(['IMPORTS']);
		const args = pageRankGpuFabricRequestToArgs(request);
		expect(args).toContain('graph_pagerank_cugraph');
		expect(args).toContain('--projection-snapshot-hash');
		expect(args).toContain('--weighted');
	});

	it('rejects PPR until the frozen snapshot proves canonical seed identity', () => {
		const { snapshot, plan } = fixture();
		const ppr = {
			...plan,
			algorithm: 'personalized_pagerank' as const,
			parameters: {
				...plan.parameters,
				personalization: { mode: 'PERSONALIZED' as const, seeds: [{ canonicalId: 'packet:seed', weight: 1 }] },
			},
		};
		expect(() => compilePageRankGpuFabricRequest({ snapshot, plan: ppr })).toThrow(/global PageRank only/);
	});

	it('rejects a plan bound to a different projection hash', () => {
		const { snapshot, plan } = fixture();
		const mismatchedPlan = {
			...plan,
			projection: { ...plan.projection, projectionHash: 'different-hash' },
		};
		expect(() => compilePageRankGpuFabricRequest({ snapshot, plan: mismatchedPlan })).toThrow();
	});
});
