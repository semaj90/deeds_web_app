import { describe, expect, it } from 'vitest';
import {
	buildCentroidManifestV1,
	centroidClusteringParametersChecksumV1,
	verifyCentroidManifestParametersV1,
	type CentroidClusteringParametersV1,
} from './centroid-artifact-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const params: CentroidClusteringParametersV1 = {
	schema: 'atlas.centroid-clustering-parameters.v1',
	executorRevision: 'cuvs-kmeans:26.06',
	k: 2,
	seed: 42,
	metric: 'cosine',
	init: 'k-means++',
	maxIterations: 100,
};
const h = (label: string) => canonicalSha256V1({ label });

function manifestFor(parametersChecksum: string, count = 2) {
	return buildCentroidManifestV1({
		workspaceRevision: 'workspace:r1',
		candidateSnapshotRevision: 'snapshot:r1',
		representationRevision: 'semantic_768:r1',
		ordinalMapChecksum: h('ordinals'),
		clusteringPassId: 'pass:1',
		algorithmRevision: 'kmeans:v1',
		parametersChecksum,
		candidateCount: 10,
		centroids: Array.from({ length: count }, (_, i) => ({
			centroidId: `centroid:${i}`,
			artifactRef: `artifact:${i}`,
			artifactChecksum: h(`a${i}`),
			memberCount: 5,
			memberSetChecksum: h(`m${i}`),
		})),
		memberAssignmentChecksum: h('assign'),
	});
}

describe('HASHCENT-02 clustering parameters', () => {
	it('checksum is deterministic and changes with seed, k and executor', () => {
		const base = centroidClusteringParametersChecksumV1(params);
		expect(centroidClusteringParametersChecksumV1({ ...params })).toBe(base);
		expect(centroidClusteringParametersChecksumV1({ ...params, seed: 43 })).not.toBe(base);
		expect(centroidClusteringParametersChecksumV1({ ...params, k: 3 })).not.toBe(base);
		expect(centroidClusteringParametersChecksumV1({ ...params, executorRevision: 'sklearn-minibatch-kmeans:1.5' })).not.toBe(base);
	});

	it('verifies a manifest built with that checksum', () => {
		const manifest = manifestFor(centroidClusteringParametersChecksumV1(params));
		expect(verifyCentroidManifestParametersV1(manifest, params)).toEqual({ matches: true });
	});

	it('detects a different seed/executor than the manifest was built with', () => {
		const manifest = manifestFor(centroidClusteringParametersChecksumV1(params));
		expect(verifyCentroidManifestParametersV1(manifest, { ...params, seed: 7 })).toEqual({ matches: false, reason: 'PARAMETERS_CHECKSUM_MISMATCH' });
	});

	it('detects k that disagrees with the centroid count', () => {
		const wrongK = { ...params, k: 3 };
		const manifest = manifestFor(centroidClusteringParametersChecksumV1(wrongK), 2);
		expect(verifyCentroidManifestParametersV1(manifest, wrongK)).toEqual({ matches: false, reason: 'K_CENTROID_COUNT_MISMATCH' });
	});

	it('rejects malformed parameters (negative seed, zero k, unknown metric)', () => {
		for (const bad of [{ seed: -1 }, { k: 0 }, { metric: 'dot' }]) {
			expect(() => centroidClusteringParametersChecksumV1({ ...params, ...bad } as never)).toThrow();
		}
	});
});
