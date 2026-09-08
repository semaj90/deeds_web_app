import { describe, expect, it } from 'vitest';

import {
  assertGraphProjectionFreshness,
  buildProjectionManifest,
  buildRevisionedProjectionName,
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

	// GDS1.9 — revisioned named projection naming
	describe('buildRevisionedProjectionName', () => {
		it('builds the atlas_code_graph__<workspace>__<revision> shape', () => {
			expect(buildRevisionedProjectionName('default', 'abc123')).toBe(
				'atlas_code_graph__default__abc123',
			);
		});

		it('sanitizes non-alphanumeric characters in either input', () => {
			expect(buildRevisionedProjectionName('deeds-web-app', 'sha:abcdef/1')).toBe(
				'atlas_code_graph__deeds_web_app__sha_abcdef_1',
			);
		});

		it('throws if an input has no alphanumeric content', () => {
			expect(() => buildRevisionedProjectionName('///', 'abc')).toThrow(/no alphanumeric content/);
		});

		it('is deterministic for the same inputs', () => {
			const a = buildRevisionedProjectionName('ws1', 'rev1');
			const b = buildRevisionedProjectionName('ws1', 'rev1');
			expect(a).toBe(b);
		});
	});

	describe('buildProjectionManifest', () => {
		it('assembles a schema-valid manifest with a matching relationshipProjectionHash', () => {
			const relationships = {
				IMPORTS: {
					sourceType: 'IMPORTS',
					projectedType: 'IMPORTS',
					orientation: 'NATURAL' as const,
					aggregation: 'NONE' as const,
				},
			};
			const manifest = buildProjectionManifest({
				projectionName: buildRevisionedProjectionName('default', 'rev-1'),
				graphRevision: 'graph:rev:1',
				nodeLabels: ['CodebaseFile'],
				relationships,
				nodeCount: 42,
				relationshipCount: 7,
			});

			expect(manifest.projectionName).toBe('atlas_code_graph__default__rev_1');
			expect(manifest.projectionRevision).toBe(computeRelationshipProjectionHash(relationships));
			expect(manifest.relationshipProjectionHash).toBe(manifest.projectionRevision);
			expect(manifest.nodeCount).toBe(42);
			expect(manifest.relationshipCount).toBe(7);
			expect(() => GraphProjectionManifestSchema.parse(manifest)).not.toThrow();
		});
	});
});
