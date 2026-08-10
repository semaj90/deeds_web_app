import { describe, expect, it } from 'vitest';
import {
	GraphHierarchyManifestSchema,
	ProjectionDistortionStatsSchema,
	RoutingMapManifestSchema,
} from './routing-manifest.js';

describe('routing manifest contracts', () => {
	it('accepts graph hierarchy manifests', () => {
		const manifest = GraphHierarchyManifestSchema.parse({
			graphRevision: 'graph:r-27',
			projectionRevision: 'proj:r-03',
			communityLevel: 2,
			communityId: 'community:42',
			parentCommunityId: 'community:7',
			memberCount: 128,
			createdAt: '2026-08-09T00:00:00.000Z',
		});

		expect(manifest.communityLevel).toBe(2);
		expect(manifest.parentCommunityId).toBe('community:7');
	});

	it('accepts routing map manifests for SOM locality', () => {
		const manifest = RoutingMapManifestSchema.parse({
			graphRevision: 'graph:r-27',
			projectionRevision: 'proj:r-03',
			somRevision: 'som:r-20x20',
			somRow: 7,
			somCol: 12,
			clusterId: 'cluster:4',
			routeNeighborhood: ['cluster:4', 'cluster:5'],
			createdAt: '2026-08-09T00:00:00.000Z',
		});

		expect(manifest.somRow).toBe(7);
		expect(manifest.routeNeighborhood).toContain('cluster:5');
	});

	it('accepts projection distortion stats when a geometric signal exists', () => {
		const stats = ProjectionDistortionStatsSchema.parse({
			graphRevision: 'graph:r-27',
			projectionRevision: 'proj:r-03',
			jacobianNorm: 1.42,
			singularValues: [1.42, 0.88, 0.4],
			neighborhoodPreservation: 0.91,
			createdAt: '2026-08-09T00:00:00.000Z',
		});

		expect(stats.singularValues.length).toBe(3);
		expect(stats.neighborhoodPreservation).toBe(0.91);
	});

	it('rejects distortion stats with no geometric evidence', () => {
		expect(() =>
			ProjectionDistortionStatsSchema.parse({
				graphRevision: 'graph:r-27',
				projectionRevision: 'proj:r-03',
				jacobianNorm: null,
				singularValues: [],
				neighborhoodPreservation: 0.5,
				createdAt: '2026-08-09T00:00:00.000Z',
			}),
		).toThrow();
	});
});
