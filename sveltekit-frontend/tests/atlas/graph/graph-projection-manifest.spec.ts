// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	GraphProjectionManifestSchema,
	computeRelationshipProjectionHash,
	expandLegacyOrientation,
	type GraphRelationshipProjection,
} from '../../../src/lib/server/graph/graph-projection-manifest.js';

function baseManifest(relationships: Record<string, GraphRelationshipProjection>) {
	return {
		projectionRevision: 'rev-1',
		graphRevision: 'graph-1',
		projectionName: 'test_projection',
		nodeLabels: ['CodebaseFile'],
		relationships,
		relationshipProjectionHash: computeRelationshipProjectionHash(relationships),
		relationshipWeights: {},
		nodeCount: 10,
		relationshipCount: 5,
		createdAt: new Date().toISOString(),
	};
}

describe('graph-projection-manifest V2', () => {
	it('validates a homogeneous (all-NATURAL) projection', () => {
		const relationships = expandLegacyOrientation({
			orientation: 'NATURAL',
			relationshipTypes: ['CALLS', 'IMPORTS'],
		});
		const manifest = baseManifest(relationships);
		expect(() => GraphProjectionManifestSchema.parse(manifest)).not.toThrow();
	});

	it('validates a heterogeneous (mixed NATURAL/UNDIRECTED) projection — the regression case for the gap Patch H exposed', () => {
		const relationships: Record<string, GraphRelationshipProjection> = {
			CALLS: { sourceType: 'CALLS', projectedType: 'CALLS', orientation: 'NATURAL', aggregation: 'NONE' },
			SIMILAR_TOPOLOGY: {
				sourceType: 'SIMILAR_TOPOLOGY',
				projectedType: 'SIMILAR_TOPOLOGY',
				orientation: 'UNDIRECTED',
				aggregation: 'NONE',
			},
			BELONGS_TO_FEATURE: {
				sourceType: 'BELONGS_TO_FEATURE',
				projectedType: 'BELONGS_TO_FEATURE',
				orientation: 'UNDIRECTED',
				aggregation: 'NONE',
			},
		};
		const manifest = baseManifest(relationships);
		const parsed = GraphProjectionManifestSchema.parse(manifest);
		expect(parsed.relationships.CALLS.orientation).toBe('NATURAL');
		expect(parsed.relationships.SIMILAR_TOPOLOGY.orientation).toBe('UNDIRECTED');
		expect(parsed.relationships.BELONGS_TO_FEATURE.orientation).toBe('UNDIRECTED');
	});

	it('produces different hashes when only orientation differs', () => {
		const natural: Record<string, GraphRelationshipProjection> = {
			CALLS: { sourceType: 'CALLS', projectedType: 'CALLS', orientation: 'NATURAL', aggregation: 'NONE' },
		};
		const undirected: Record<string, GraphRelationshipProjection> = {
			CALLS: { sourceType: 'CALLS', projectedType: 'CALLS', orientation: 'UNDIRECTED', aggregation: 'NONE' },
		};
		expect(computeRelationshipProjectionHash(natural)).not.toBe(computeRelationshipProjectionHash(undirected));
	});

	it('produces the same hash regardless of relationship-map key order', () => {
		const a: Record<string, GraphRelationshipProjection> = {
			IMPORTS: { sourceType: 'IMPORTS', projectedType: 'IMPORTS', orientation: 'NATURAL', aggregation: 'NONE' },
			CALLS: { sourceType: 'CALLS', projectedType: 'CALLS', orientation: 'NATURAL', aggregation: 'NONE' },
			SIMILAR_TOPOLOGY: {
				sourceType: 'SIMILAR_TOPOLOGY',
				projectedType: 'SIMILAR_TOPOLOGY',
				orientation: 'UNDIRECTED',
				aggregation: 'NONE',
			},
		};
		const b: Record<string, GraphRelationshipProjection> = {
			SIMILAR_TOPOLOGY: a.SIMILAR_TOPOLOGY,
			CALLS: a.CALLS,
			IMPORTS: a.IMPORTS,
		};
		expect(computeRelationshipProjectionHash(a)).toBe(computeRelationshipProjectionHash(b));
	});
});
