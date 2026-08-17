import { describe, expect, it } from 'vitest';
import {
	ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
	CUGRAPH_LEIDEN_26_06,
	buildCommunityFingerprintV1,
	buildCommunitySnapshotV1,
} from './community-snapshot-v1.js';

describe('CommunitySnapshotV1', () => {
	it('uses the actual custom union-find algorithm identity', () => {
		const snapshot = buildCommunitySnapshotV1({
			graphRevision: 'graph:1',
			topologyHash: 'sha256:topology',
			semanticRevision: 'semantic:768:1',
			partitionInputRevision: 'clusters:1',
			projectionRevision: 'projection:1',
			projectionSemantics: 'atlas.import-cluster-projection.v1',
			algorithmId: ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
			backend: 'native-ts',
			backendVersion: '1',
			algorithmParameters: { edgeWeightThreshold: 3 },
			edgeKinds: ['IMPORTS'],
			receiptRef: 'receipt:community:1',
			records: [{
				id: 99,
				memberIds: ['cluster:7', 'cluster:3', 'cluster:7'],
				memberCount: 42,
				cohesionScore: 0.5,
				summary: 'demo',
				purpose: 'demo purpose',
				tags: ['b', 'a'],
			}],
		});

		expect(snapshot.algorithmId).toBe(ATLAS_IMPORT_CLUSTER_UNION_FIND_V1);
		expect(snapshot.communities[0].memberIds).toEqual(['cluster:3', 'cluster:7']);
		expect(snapshot.communities[0].communityOrdinal).toBe(0);
	});

	it('does not use sequential backend partition id as stable community identity', () => {
		const base = {
			algorithmId: CUGRAPH_LEIDEN_26_06,
			partitionInputRevision: 'graph:1',
			projectionRevision: 'projection:1',
			projectionSemantics: 'atlas.undirected-weighted-projection.v1',
			algorithmParameters: { resolution: 1, random_state: 0, theta: 1 },
		} as const;
		const left = buildCommunityFingerprintV1({ ...base, memberIds: ['packet:a', 'packet:b', 'packet:c'] });
		const right = buildCommunityFingerprintV1({ ...base, memberIds: ['packet:c', 'packet:b', 'packet:a'] });
		expect(left).toBe(right);
	});

	it('changes identity when the real algorithm contract changes', () => {
		const base = {
			memberIds: ['packet:a', 'packet:b'],
			algorithmId: CUGRAPH_LEIDEN_26_06,
			partitionInputRevision: 'graph:1',
			projectionRevision: 'projection:1',
			projectionSemantics: 'atlas.undirected-weighted-projection.v1',
		} as const;
		const left = buildCommunityFingerprintV1({ ...base, algorithmParameters: { resolution: 1 } });
		const right = buildCommunityFingerprintV1({ ...base, algorithmParameters: { resolution: 2 } });
		expect(left).not.toBe(right);
	});
});
