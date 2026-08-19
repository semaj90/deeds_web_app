import { describe, expect, it } from 'vitest';
import { computeRelationshipProjectionHashV3 } from './graph-projection-manifest.js';
import { computeGraphProjectionSnapshotHashV1 } from './graph-projection-snapshot-v1.js';
import { buildPageRankCrossExecutorParityReceiptV2 } from './pagerank-cross-executor-parity.js';
import {
	assertCanonicalPageRankExecutorQualified,
	qualifyCugraphFromFrozenParity,
} from './pagerank-executor-qualification.js';

function fixture() {
	const relationships = {
		IMPORTS: {
			sourceType: 'IMPORTS', projectedType: 'IMPORTS', orientation: 'NATURAL' as const, aggregation: 'NONE' as const,
			properties: { weight: { projectedProperty: 'weight', sourceProperty: 'weight', defaultValue: 1, aggregation: 'NONE' as const } },
		},
	};
	const projectionHash = computeRelationshipProjectionHashV3(relationships);
	const projection = {
		schema: 'atlas.graph-projection-manifest.v3' as const,
		projectionRevision: 'projection-v3-test', graphRevision: 'graph-rev-test', projectionName: 'atlas_dependency_test',
		nodeLabels: ['CodebaseFile'], relationships, projectionHash, nodeCount: 3, relationshipCount: 2,
		createdAt: '2026-08-19T20:00:00.000Z',
	};
	const parityManifest = {
		graphRevision: projection.graphRevision, nodeCount: 3, edgeCount: 2, producerRevision: 'fixture-exporter-v1',
		nodeTableHash: 'node-table-hash', edgeTableHash: 'edge-table-hash', identityContractVersion: 'identity-contract-v1',
		projectionRevision: 'graph-snapshot-parity-v1',
	};
	const snapshot = {
		schema: 'atlas.graph-projection-snapshot.v1' as const, projection, parityManifest,
		artifactPaths: { nodesParquet: 'nodes.parquet', edgesParquet: 'edges.parquet', manifestJson: 'manifest.json' },
		materialization: 'PARQUET_DIRECTED_EDGE_LIST' as const, edgeWeightColumn: 'weight' as const,
		contentHash: computeGraphProjectionSnapshotHashV1({
			projectionRevision: projection.projectionRevision, projectionHash, projectionName: projection.projectionName,
			graphRevision: parityManifest.graphRevision, nodeTableHash: parityManifest.nodeTableHash,
			edgeTableHash: parityManifest.edgeTableHash, nodeCount: 3, edgeCount: 2,
		}),
		producerRevision: 'projection-snapshot-v1-test', createdAt: '2026-08-19T20:00:00.000Z',
	};
	const plan = {
		schema: 'atlas.pagerank-execution-plan.v1' as const, runId: 'qualification-run',
		canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS' as const, algorithmFamily: 'PAGERANK' as const,
		algorithm: 'pagerank' as const, algorithmRevision: 'pagerank-parity-test-v1',
		executor: { executorId: 'CUGRAPH' as const, role: 'GPU_CHALLENGER' as const }, projection,
		parameters: { dampingFactor: 0.85, maxIterations: 100, tolerance: 1e-8, relationshipTypes: ['IMPORTS'], weighted: true,
			relationshipWeightProperty: 'weight', personalization: { mode: 'GLOBAL' as const } },
		producerRevision: 'qualification-plan-test-v1', createdAt: '2026-08-19T20:00:00.000Z',
	};
	return { snapshot, plan };
}

function legacyReceipt(snapshot: ReturnType<typeof fixture>['snapshot']) {
	return {
		graphRevision: snapshot.projection.graphRevision, artifactPaths: snapshot.artifactPaths, manifest: snapshot.parityManifest,
		networkx: { backend: 'networkx' as const, status: 'PROVEN' as const, nodeCount: 3, edgeCount: 2, componentCount: 1 },
		cugraph: { backend: 'cugraph' as const, status: 'PROVEN' as const, nodeCount: 3, edgeCount: 2, componentCount: 1 },
		componentCount: 1, pagerankTopKOverlap: 1, pagerankCorrelation: 1, pagerankMaxDelta: 1e-10,
		louvainCommunityAgreement: 1, excludedNodeCount: 0, excludedEdgeCount: 0, unresolvedCount: 0,
		status: 'PASS' as const, generatedAt: '2026-08-19T20:01:00.000Z', notes: 'fixture parity proof',
	};
}

const identicalScores = [
	{ parityNodeKey: 'tree:a', score: 0.6 }, { parityNodeKey: 'tree:b', score: 0.3 }, { parityNodeKey: 'packet:c', score: 0.1 },
] as const;

describe('cuGraph PageRank qualification', () => {
	it('does not promote the legacy NetworkX↔cuGraph PASS by itself', () => {
		const { snapshot, plan } = fixture();
		const qualification = qualifyCugraphFromFrozenParity({ plan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), producerRevision: 'test-v1' });
		expect(qualification.status).toBe('PROJECTION_LINEAGE_PROVEN');
		expect(() => assertCanonicalPageRankExecutorQualified(qualification)).toThrow(/not canonical-eligible/);
	});

	it('promotes only with derived exact-plan Neo4j↔cuGraph parity', () => {
		const { snapshot, plan } = fixture();
		const parity = buildPageRankCrossExecutorParityReceiptV2({
			plan, snapshot, referenceExecutorId: 'NEO4J_GDS', challengerExecutorId: 'CUGRAPH',
			referenceScores: identicalScores, challengerScores: identicalScores, topK: 3,
			producerRevision: 'parity-test-v2', generatedAt: '2026-08-19T20:03:00.000Z',
		});
		const qualification = qualifyCugraphFromFrozenParity({
			plan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), canonicalReferenceParityReceipt: parity, producerRevision: 'test-v1',
		});
		expect(parity.status).toBe('PASS');
		expect(parity.parityCoordinate).toBe('graph_node_key');
		expect(qualification.status).toBe('CANONICAL_ELIGIBLE');
		expect(qualification.parameterHash).toBe(parity.parameterHash);
	});

	it('rejects reusing a PASS for changed PageRank parameters', () => {
		const { snapshot, plan } = fixture();
		const parity = buildPageRankCrossExecutorParityReceiptV2({
			plan, snapshot, referenceExecutorId: 'NEO4J_GDS', challengerExecutorId: 'CUGRAPH',
			referenceScores: identicalScores, challengerScores: identicalScores, producerRevision: 'parity-test-v2',
		});
		const changedPlan = { ...plan, parameters: { ...plan.parameters, dampingFactor: 0.9 } };
		const qualification = qualifyCugraphFromFrozenParity({
			plan: changedPlan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), canonicalReferenceParityReceipt: parity, producerRevision: 'test-v1',
		});
		expect(qualification.status).toBe('PROJECTION_LINEAGE_PROVEN');
		expect(qualification.canonicalReferenceParityProven).toBe(false);
	});

	it('keeps legacy math parity separate from V3 lineage', () => {
		const { snapshot, plan } = fixture();
		const legacy = { ...legacyReceipt(snapshot), graphRevision: 'other-graph-revision' };
		const qualification = qualifyCugraphFromFrozenParity({ plan, snapshot, legacyParityReceipt: legacy, producerRevision: 'test-v1' });
		expect(qualification.status).toBe('MATH_PARITY_PROVEN');
	});
});
