import { describe, expect, it } from 'vitest';
import {
	buildGraphSnapshotParityReceipt,
	GraphSnapshotParityArtifactPathsSchema,
	GraphSnapshotParityBackendSummarySchema,
	GraphSnapshotParityManifestSchema,
	GraphSnapshotParityReceiptSchema
} from './graph-snapshot-parity-contract.js';

const artifactPaths = {
	nodesParquet: 'artifacts/graph-snapshot/nodes.parquet',
	edgesParquet: 'artifacts/graph-snapshot/edges.parquet',
	manifestJson: 'artifacts/graph-snapshot/manifest.json'
} as const;

const manifest = {
	graphRevision: 'graph-revision-2026-08-11',
	nodeCount: 251613,
	edgeCount: 1872044,
	producerRevision: 'materialize-full-corpus-graph-snapshot@1',
	nodeTableHash: 'node-table-hash',
	edgeTableHash: 'edge-table-hash',
	identityContractVersion: 'graph-snapshot-parity-v1',
	projectionRevision: 'projection-v3'
} as const;

const backend = {
	backend: 'networkx',
	status: 'PROVEN',
	nodeCount: 251613,
	edgeCount: 1872044,
	componentCount: 42,
	pagerankTopKOverlap: 1,
	pagerankCorrelation: 0.995,
	pagerankMaxDelta: 0,
	louvainCommunityAgreement: 1
} as const;

describe('graph snapshot parity contract', () => {
	it('accepts the frozen artifact, manifest, and backend summaries', () => {
		expect(GraphSnapshotParityArtifactPathsSchema.parse(artifactPaths)).toEqual(artifactPaths);
		expect(GraphSnapshotParityManifestSchema.parse(manifest)).toEqual(manifest);
		expect(GraphSnapshotParityBackendSummarySchema.parse(backend)).toEqual(backend);

		const receipt = buildGraphSnapshotParityReceipt({
			graphRevision: manifest.graphRevision,
			artifactPaths,
			manifest,
			networkx: backend,
			cugraph: { ...backend, backend: 'cugraph' },
			componentCount: 42,
			pagerankTopKOverlap: 1,
			pagerankCorrelation: 0.995,
			pagerankMaxDelta: 0,
			louvainCommunityAgreement: 1,
			excludedNodeCount: 17,
			excludedEdgeCount: 4,
			unresolvedCount: 0,
			generatedAt: '2026-08-11T12:00:00.000Z'
		});

		expect(receipt).toMatchObject({
			graphRevision: manifest.graphRevision,
			artifactPaths,
			manifest,
			componentCount: 42,
			pagerankTopKOverlap: 1,
			pagerankCorrelation: 0.995,
			pagerankMaxDelta: 0,
			louvainCommunityAgreement: 1,
			excludedNodeCount: 17,
			excludedEdgeCount: 4,
			unresolvedCount: 0,
			status: 'PASS'
		});

		expect(GraphSnapshotParityReceiptSchema.parse(receipt)).toEqual(receipt);
	});

	it('marks unresolved parity as partial instead of silently promoting it', () => {
		const receipt = buildGraphSnapshotParityReceipt({
			graphRevision: manifest.graphRevision,
			artifactPaths,
			manifest,
			networkx: { ...backend, backend: 'networkx' },
			cugraph: { ...backend, backend: 'cugraph' },
			componentCount: 42,
			pagerankTopKOverlap: 1,
			pagerankCorrelation: 0.995,
			pagerankMaxDelta: 0,
			louvainCommunityAgreement: 1,
			excludedNodeCount: 17,
			excludedEdgeCount: 4,
			unresolvedCount: 71,
			generatedAt: '2026-08-11T12:00:00.000Z'
		});

		expect(receipt.status).toBe('PARTIAL');
		expect(receipt.unresolvedCount).toBe(71);
	});

	it('rejects incomplete manifest data', () => {
		expect(() =>
			GraphSnapshotParityManifestSchema.parse({
				...manifest,
				nodeCount: -1
			})
		).toThrow();
	});
});
