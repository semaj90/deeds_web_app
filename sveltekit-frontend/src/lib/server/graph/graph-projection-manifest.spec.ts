import { describe, expect, it } from 'vitest';

import {
  assertGraphProjectionFreshness,
  computeRelationshipProjectionHash,
  GraphProjectionManifestSchema,
} from './graph-projection-manifest.js';

describe('graph-projection-manifest', () => {
	it('rejects stale projection revisions', () => {
		expect(() =>
			assertGraphProjectionFreshness({
				graphRevision: 'graph:rev:old',
				projectionRevision: 'projection:rev:old',
				expectedGraphRevision: 'graph:rev:new',
				expectedProjectionRevision: 'projection:rev:new',
			})
		).toThrow(/stale graph projection rejected/);
	});

	it('accepts matching projection revisions', () => {
		expect(
			assertGraphProjectionFreshness({
				graphRevision: 'graph:rev:1',
				projectionRevision: 'projection:rev:1',
				expectedGraphRevision: 'graph:rev:1',
				expectedProjectionRevision: 'projection:rev:1',
			})
		).toEqual({
			graphRevision: 'graph:rev:1',
			projectionRevision: 'projection:rev:1',
			expectedGraphRevision: 'graph:rev:1',
			expectedProjectionRevision: 'projection:rev:1',
		});
	});

	it('keeps relationship projection hashes stable under ordering changes', () => {
		const a = computeRelationshipProjectionHash({
			BELONGS_TO_CLUSTER: {
				sourceType: 'BELONGS_TO_CLUSTER',
				projectedType: 'BELONGS_TO_CLUSTER',
				orientation: 'UNDIRECTED',
				aggregation: 'NONE',
				properties: ['communityId', 'graphRevision'],
			},
			DEPENDS_ON: {
				sourceType: 'DEPENDS_ON',
				projectedType: 'DEPENDS_ON',
				orientation: 'NATURAL',
				aggregation: 'NONE',
				properties: ['sourceRef'],
			},
		});

		const b = computeRelationshipProjectionHash({
			DEPENDS_ON: {
				sourceType: 'DEPENDS_ON',
				projectedType: 'DEPENDS_ON',
				orientation: 'NATURAL',
				aggregation: 'NONE',
				properties: ['sourceRef'],
			},
			BELONGS_TO_CLUSTER: {
				sourceType: 'BELONGS_TO_CLUSTER',
				projectedType: 'BELONGS_TO_CLUSTER',
				orientation: 'UNDIRECTED',
				aggregation: 'NONE',
				properties: ['graphRevision', 'communityId'],
			},
		});

		expect(a).toBe(b);
		expect(
			GraphProjectionManifestSchema.parse({
				graphRevision: 'graph:rev:1',
				projectionRevision: 'projection:rev:1',
				projectionName: 'atlas_combined_v1',
				nodeLabels: ['CodebaseFile'],
				relationships: {
					BELONGS_TO_CLUSTER: {
						sourceType: 'BELONGS_TO_CLUSTER',
						projectedType: 'BELONGS_TO_CLUSTER',
						orientation: 'UNDIRECTED',
						aggregation: 'NONE',
					},
				},
				relationshipProjectionHash: a,
				relationshipWeights: {},
				nodeCount: 1,
				relationshipCount: 1,
				createdAt: '2026-08-13T00:00:00.000Z',
			}).projectionRevision
		).toBe('projection:rev:1');
	});
});
