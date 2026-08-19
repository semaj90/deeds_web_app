import { describe, expect, it } from 'vitest';
import { computeRelationshipProjectionHashV3 } from './graph-projection-manifest.js';
import { computeGraphProjectionSnapshotHashV1 } from './graph-projection-snapshot-v1.js';
import { buildPageRankCrossExecutorProofV1 } from './pagerank-cross-executor-proof.js';
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
		schema: 'atlas.graph-projection-manifest.v3' as const, projectionRevision: 'projection-v3-test', graphRevision: 'graph-rev-test',
		projectionName: 'atlas_dependency_test', nodeLabels: ['CodebaseFile'], relationships, projectionHash, nodeCount: 3, relationshipCount: 2,
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

function executionReceipt(
	executorId: 'NEO4J_GDS' | 'CUGRAPH',
	snapshot: ReturnType<typeof fixture>['snapshot'],
	rawOutputHash: string,
) {
	const common = {
		algorithm: 'pagerank' as const, parityCoordinate: 'graph_node_key' as const,
		graphRevision: snapshot.projection.graphRevision, projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash, projectionName: snapshot.projection.projectionName,
		projectionSnapshotHash: snapshot.contentHash, nodeCount: 3, relationshipCount: 2, relationshipTypes: ['IMPORTS'],
		weighted: true, dampingFactor: 0.85, maxIterations: 100, tolerance: 1e-8,
		convergenceStatus: 'CONVERGED', ranIterations: null, rawOutputHash, readMillis: 1, computeMillis: 2, scoresOut: 'scores.ndjson',
	};
	const data = executorId === 'NEO4J_GDS'
		? { ...common, executorId, role: 'REFERENCE_EXECUTOR' as const, executionMode: 'STREAM_ON_CONSTRUCTED_DATAFRAME_GRAPH' as const, graphConstructMillis: 1 }
		: { ...common, executorId, role: 'GPU_CHALLENGER' as const, failOnNonconvergence: false, graphBuildMillis: 1 };
	return {
		receipt_id: `receipt-${executorId.toLowerCase()}`, receipt_kind: executorId === 'NEO4J_GDS' ? 'GRAPH_PAGERANK_NEO4J_GDS_EXECUTED' as const : 'GRAPH_PAGERANK_CUGRAPH_EXECUTED' as const,
		producer_id: 'run_fabric_benchmark.py' as const, producer_revision: '2026-08-19.graph-pagerank-v3',
		started_at: '2026-08-19T20:02:00Z', completed_at: '2026-08-19T20:03:00Z', input_hash: '1'.repeat(64), output_hash: '2'.repeat(64),
		workspace_revision: null, source_revision: null, graph_revision: snapshot.projection.graphRevision,
		representation_revision: 'graph-pagerank-raw-v2' as const, status: 'EXECUTED' as const, data,
	};
}

function verifiedProof(plan: ReturnType<typeof fixture>['plan'], snapshot: ReturnType<typeof fixture>['snapshot']) {
	const referenceHash = 'a'.repeat(64);
	const challengerHash = 'b'.repeat(64);
	return buildPageRankCrossExecutorProofV1({
		plan, snapshot,
		referenceExecutionReceipt: executionReceipt('NEO4J_GDS', snapshot, referenceHash),
		challengerExecutionReceipt: executionReceipt('CUGRAPH', snapshot, challengerHash),
		referenceScoreSet: { scores: [...identicalScores], rawOutputHash: referenceHash, rowCount: 3 },
		challengerScoreSet: { scores: [...identicalScores], rawOutputHash: challengerHash, rowCount: 3 },
		producerRevision: 'proof-test-v1', generatedAt: '2026-08-19T20:04:00.000Z',
	});
}

describe('cuGraph PageRank qualification', () => {
	it('does not promote the legacy NetworkX↔cuGraph PASS by itself', () => {
		const { snapshot, plan } = fixture();
		const qualification = qualifyCugraphFromFrozenParity({ plan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), producerRevision: 'test-v1' });
		expect(qualification.status).toBe('PROJECTION_LINEAGE_PROVEN');
		expect(() => assertCanonicalPageRankExecutorQualified(qualification)).toThrow(/not canonical-eligible/);
	});

	it('promotes only with the execution-bound exact-plan proof', () => {
		const { snapshot, plan } = fixture();
		const proof = verifiedProof(plan, snapshot);
		const qualification = qualifyCugraphFromFrozenParity({
			plan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), canonicalReferenceParityProof: proof, producerRevision: 'test-v1',
		});
		expect(proof.parityReceipt.status).toBe('PASS');
		expect(qualification.status).toBe('CANONICAL_ELIGIBLE');
		expect(qualification.parameterHash).toBe(proof.parameterHash);
	});

	it('rejects reusing a proof for changed PageRank parameters', () => {
		const { snapshot, plan } = fixture();
		const proof = verifiedProof(plan, snapshot);
		const changedPlan = { ...plan, parameters: { ...plan.parameters, dampingFactor: 0.9 } };
		const qualification = qualifyCugraphFromFrozenParity({
			plan: changedPlan, snapshot, legacyParityReceipt: legacyReceipt(snapshot), canonicalReferenceParityProof: proof, producerRevision: 'test-v1',
		});
		expect(qualification.status).toBe('PROJECTION_LINEAGE_PROVEN');
		expect(qualification.canonicalReferenceParityProven).toBe(false);
	});

	it('rejects a score artifact whose raw bytes do not match its worker receipt', () => {
		const { snapshot, plan } = fixture();
		const referenceHash = 'a'.repeat(64);
		expect(() => buildPageRankCrossExecutorProofV1({
			plan, snapshot,
			referenceExecutionReceipt: executionReceipt('NEO4J_GDS', snapshot, referenceHash),
			challengerExecutionReceipt: executionReceipt('CUGRAPH', snapshot, 'b'.repeat(64)),
			referenceScoreSet: { scores: [...identicalScores], rawOutputHash: 'c'.repeat(64), rowCount: 3 },
			challengerScoreSet: { scores: [...identicalScores], rawOutputHash: 'b'.repeat(64), rowCount: 3 },
			producerRevision: 'proof-test-v1',
		})).toThrow(/artifact hash/);
	});
});
