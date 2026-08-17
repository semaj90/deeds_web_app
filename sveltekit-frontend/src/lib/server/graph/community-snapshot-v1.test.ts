import { describe, expect, it } from 'vitest';
import {
	ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
	buildCommunityFingerprintV1,
	buildCommunitySnapshotV1,
} from './community-snapshot-v1.js';

describe('CommunitySnapshotV1', () => {
	it('uses the actual custom union-find algorithm identity', () => {
		const snapshot = buildCommunitySnapshotV1({
			graphRevision: 'graph:1',
			topologyHash: 'sha256:topology',
			semanticRevision: 'semantic:768:1',
			clusterAssignmentRevision: 'clusters:1',
			edgeKinds: ['IMPORTS'],
			edgeWeightThreshold: 3,
			receiptRef: 'receipt:community:1',
			records: [{
				id: 99,
				clusterIds: [7, 3, 7],
				memberCount: 42,
				cohesionScore: 0.5,
				summary: 'demo',
				purpose: 'demo purpose',
				tags: ['b', 'a'],
			}],
		});

		expect(snapshot.algorithmId).toBe(ATLAS_IMPORT_CLUSTER_UNION_FIND_V1);
		expect(snapshot.communities[0].clusterIds).toEqual([3, 7]);
		expect(snapshot.communities[0].communityOrdinal).toBe(0);
	});

	it('does not use sequential runtime id as stable community identity', () => {
		const left = buildCommunityFingerprintV1({
			clusterIds: [1, 2, 3],
			edgeKinds: ['IMPORTS'],
			edgeWeightThreshold: 3,
			clusterAssignmentRevision: 'clusters:1',
		});
		const right = buildCommunityFingerprintV1({
			clusterIds: [3, 2, 1],
			edgeKinds: ['IMPORTS'],
			edgeWeightThreshold: 3,
			clusterAssignmentRevision: 'clusters:1',
		});
		expect(left).toBe(right);
	});
});
