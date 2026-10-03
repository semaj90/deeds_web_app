import { describe, expect, it } from 'vitest';
import { parseStructuralFeatureSnapshotV1 } from './structural-feature-snapshot-v1.js';

describe('StructuralFeatureSnapshotV1 derived graph metrics', () => {
	const base = {
		schema: 'atlas.structural-feature-snapshot.v1' as const,
		workspaceRevision: 'workspace:r1',
		graphRevision: 'graph:r1',
		projectionRevision: 'projection:r1',
		producerRevision: 'producer:r1',
		executor: 'networkx' as const,
		algorithmSet: ['pagerank'],
		rows: [{
			candidateOrdinal: 0,
			canonicalId: 'candidate:0',
			graphAuthority: null,
			queryProximity: null,
			communityId: null,
			neighborhoodOverlap: null,
			structuralDistance: null,
			structuralAffinity: null
		}],
		generatedAt: '2026-09-15T00:00:00.000Z'
	};

	it('preserves measured derived metrics while allowing unrun algorithms to remain null', () => {
		const parsed = parseStructuralFeatureSnapshotV1({
			...base,
			rows: [{ ...base.rows[0], pageRank: 0.25, cheiRank: null }]
		});
		expect(parsed.rows[0].pageRank).toBe(0.25);
		expect(parsed.rows[0].cheiRank).toBeNull();
		expect(parsed.rows[0].hitsAuthority).toBeNull();
	});

	it('does not admit invented non-finite metric values', () => {
		expect(() => parseStructuralFeatureSnapshotV1({
			...base,
			rows: [{ ...base.rows[0], pageRank: Number.NaN }]
		})).toThrow();
	});
});
