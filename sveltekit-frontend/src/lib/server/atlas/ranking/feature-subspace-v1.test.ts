import { describe, expect, it } from 'vitest';
import {
	FeatureMatrixSnapshotV1Schema,
	FeatureProjectionV1Schema,
	FeatureSubspaceSnapshotV1Schema,
} from './feature-subspace-v1.js';

describe('feature subspace contracts', () => {
	it('requires named matrix columns and row-major executor projection', () => {
		const parsed = FeatureMatrixSnapshotV1Schema.parse({
			schema: 'atlas.feature-matrix-snapshot.v1',
			snapshotId: 'feature-snapshot:1',
			contentHash: 'sha256:matrix',
			workspaceRevision: 'workspace:1',
			sourceRevision: 'source:1',
			graphRevision: 'graph:1',
			semanticRevision: 'semantic:768:1',
			featureSchemaRevision: 'atlas.ranking-feature-vector.v1',
			rowOrdinalRevision: 'ordinal:1',
			candidateIdsRef: 'arrow://feature-snapshot/ids',
			featureNames: ['pagerankAuthority', 'dense'],
			rows: 100,
			cols: 2,
			valuesRef: 'mmap://feature-snapshot/values.f32',
			dtype: 'float32',
			layout: 'row_major',
			arrowManifestRef: 'arrow://feature-snapshot/manifest',
			checksum: 'sha256:matrix',
		});
		expect(parsed.cols).toBe(2);
	});

	it('treats SVD as revisioned derived state, not identity or another retrieval lane', () => {
		const subspace = FeatureSubspaceSnapshotV1Schema.parse({
			schema: 'atlas.feature-subspace-snapshot.v1',
			sourceFeatureSnapshotHash: 'sha256:matrix',
			featureSchemaRevision: 'atlas.ranking-feature-vector.v1',
			featureNames: ['pagerankAuthority', 'dense'],
			preprocessingRevision: 'center-v1',
			centering: true,
			scaling: 'none',
			algorithm: 'svd',
			algorithmRevision: 'torch-linalg-svd-v1',
			backend: 'torch_cuda_cusolver',
			rankK: 2,
			singularValues: [4, 1],
			rightBasisRef: 'mmap://subspace/vh.f32',
			explainedEnergy: [0.94, 1],
			reconstructionErrorMean: 0.01,
			reconstructionErrorP95: 0.03,
			basisCanonicalizationRevision: 'largest-loading-positive-v1',
			producerRevision: 'parent-atlas-svd-v1',
			artifactHash: 'sha256:svd',
			receiptRef: 'receipt:svd:1',
		});
		expect(subspace.algorithm).toBe('svd');

		const projection = FeatureProjectionV1Schema.parse({
			schema: 'atlas.feature-projection.v1',
			candidateId: 'candidate:1',
			sourceFeatureSnapshotHash: subspace.sourceFeatureSnapshotHash,
			subspaceArtifactHash: subspace.artifactHash,
			coordinates: [0.4, -0.2],
			reconstructionError: 0.01,
		});
		expect(projection.coordinates).toHaveLength(2);
	});
});
