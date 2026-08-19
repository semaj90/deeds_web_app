import { describe, expect, it } from 'vitest';
import { computeRelationshipProjectionHashV3 } from './graph-projection-manifest.js';
import { computeGraphProjectionSnapshotHashV1 } from './graph-projection-snapshot-v1.js';
import { buildPageRankCrossExecutorParityReceiptV2 } from './pagerank-cross-executor-parity.js';
import {
	assertCanonicalPageRankExecutorQualified,
	qualifyCugraphFromFrozenParity,
} from './pagerank-executor-qualification.js';

function fixtureSnapshot() {
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
	const contentHash = computeGraphProjectionSnapshotHashV1({
		projectionRevision: projection.projectionRevision,
		projectionHash,
		projectionName: projection.projectionName,
		graphRevision: parityManifest.graphRevision,
		nodeTableHash: parityManifest.nodeTableHash,
		edgeTableHash: parityManifest.edgeTableHash,
		nodeCount: parityManifest.nodeCount,
		edgeCount: parityManifest.edgeCount,
	});
	return {
		schema: 'atlas.graph-projection-snapshot.v1' as const,
		projection,
		parityManifest,
		artifactPaths: { nodesParquet: 'nodes.parquet', edgesParquet: 'edges.parquet', manifestJson: 'manifest.json' },
		materialization: 'PARQUET_DIRECTED_EDGE_LIST' as const,
		edgeWeightColumn: 'weight' as const,
		contentHash,
		producerRevision: 'projection-snapshot-v1-test',
		createdAt: '2026-08-19T20:00:00.000Z',
	};
}

function legacyReceipt(snapshot = fixtureSnapshot()) {
	return {
		graphRevision: snapshot.projection.graphRevision,
		artifactPaths: snapshot.artifactPaths,
		manifest: snapshot.parityManifest,
		networkx: { backend: 'networkx' as const, status: 'PROVEN' as const, nodeCount: 3, edgeCount: 2, componentCount: 1 },
		cugraph: { backend: 'cugraph' as const, status: 'PROVEN' as const, nodeCount: 3, edgeCount: 2, componentCount: 1 },
		componentCount: 1,
		pagerankTopKOverlap: 1,
		pagerankCorrelation: 1,
		pagerankMaxDelta: 1e-10,
		louvainCommunityAgreement: 1,
		excludedNodeCount: 0,
		excludedEdgeCount: 0,
		unresolvedCount: 0,
		status: 'PASS' as const,
		generatedAt: '2026-08-19T20:01:00.000Z',
		notes: 'fixture parity proof',
	};
}

const identicalScores = [
	{ parityNodeKey: 'tree:a', score: 0.6 },
	{ parityNodeKey: 'tree:b', score: 0.3 },
	{ parityNodeKey: 'packet:c', score: 0.1 },
] as const;

describe('cuGraph PageRank qualification', () => {
	it('does not promote the legacy NetworkX↔cuGraph PASS by itself', () => {
		const snapshot = fixtureSnapshot();
		const qualification = qualifyCugraphFromFrozenParity({
			snapshot,
			legacyParityReceipt: legacyReceipt(snapshot),
			producerRevision: 'qualification-test-v1',
			createdAt: '2026-08-19T20:02:00.000Z',
		});
		expect(qualification.status).toBe('PROJECTION_LINEAGE_PROVEN');
		expect(qualification.canonicalReferenceParityProven).toBe(false);
		expect(() => assertCanonicalPageRankExecutorQualified(qualification)).toThrow(/not canonical-eligible/);
	});

	it('promotes only with a derived PASS Neo4j↔cuGraph receipt on the exact V3 snapshot', () => {
		const snapshot = fixtureSnapshot();
		const parity = buildPageRankCrossExecutorParityReceiptV2({
			snapshot,
			referenceExecutorId: 'NEO4J_GDS',
			challengerExecutorId: 'CUGRAPH',
			referenceScores: identicalScores,
			challengerScores: identicalScores,
			topK: 3,
			producerRevision: 'cross-executor-test-v2',
			generatedAt: '2026-08-19T20:03:00.000Z',
		});
		expect(parity.status).toBe('PASS');
		expect(parity.parityCoordinate).toBe('graph_node_key');
		const qualification = qualifyCugraphFromFrozenParity({
			snapshot,
			legacyParityReceipt: legacyReceipt(snapshot),
			canonicalReferenceParityReceipt: parity,
			producerRevision: 'qualification-test-v1',
			createdAt: '2026-08-19T20:04:00.000Z',
		});
		expect(qualification.status).toBe('CANONICAL_ELIGIBLE');
		expect(qualification.canonicalReferenceParityProven).toBe(true);
		expect(assertCanonicalPageRankExecutorQualified(qualification).executorId).toBe('CUGRAPH');
	});

	it('keeps math parity separate from V3 lineage', () => {
		const snapshot = fixtureSnapshot();
		const legacy = { ...legacyReceipt(snapshot), graphRevision: 'other-graph-revision' };
		const qualification = qualifyCugraphFromFrozenParity({
			snapshot,
			legacyParityReceipt: legacy,
			producerRevision: 'qualification-test-v1',
			createdAt: '2026-08-19T20:05:00.000Z',
		});
		expect(qualification.status).toBe('MATH_PARITY_PROVEN');
		expect(qualification.projectionLineageMatched).toBe(false);
	});

	it('blocks legacy parity that fails thresholds', () => {
		const snapshot = fixtureSnapshot();
		const qualification = qualifyCugraphFromFrozenParity({
			snapshot,
			legacyParityReceipt: { ...legacyReceipt(snapshot), pagerankCorrelation: 0.8, status: 'PARTIAL' },
			producerRevision: 'qualification-test-v1',
			createdAt: '2026-08-19T20:06:00.000Z',
		});
		expect(qualification.status).toBe('BLOCKED');
	});
});
