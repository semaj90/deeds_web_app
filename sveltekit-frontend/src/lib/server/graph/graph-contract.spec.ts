import { describe, expect, it } from 'vitest';
import {
	ExternalSearchEvidenceSchema,
	GraphEdgeSchema,
	normalizePageRankL1,
	TraversalRequestSchema
} from './graph-contract.js';

describe('Atlas contextual graph contract', () => {
	it('normalizes authority in Atlas and preserves tied score percentiles', () => {
		const rows = normalizePageRankL1([
			{ nodeKey: 'packet:a', pagerankRaw: 1 },
			{ nodeKey: 'packet:b', pagerankRaw: 1 },
			{ nodeKey: 'packet:c', pagerankRaw: 2 }
		]);

		expect(rows.reduce((sum, row) => sum + row.pagerankL1, 0)).toBeCloseTo(1, 12);
		expect(rows[0].authorityPercentile).toBe(rows[1].authorityPercentile);
		expect(rows[2].authorityBand).toBe('very-high');
	});

	it('rejects unrestricted traversal and unknown relationship types', () => {
		expect(() => TraversalRequestSchema.parse({
			queryId: '00000000-0000-0000-0000-000000000001',
			snapshotId: '00000000-0000-0000-0000-000000000002',
			seedNodeKeys: ['packet:a'],
			allowedEdgeTypes: ['CALLS'],
			maxHops: 4,
			maxFanout: 20,
			maxResults: 100,
			minimumConfidence: 0.65
		})).toThrow();

		expect(() => GraphEdgeSchema.parse({
			snapshotId: '00000000-0000-0000-0000-000000000001',
			edgeKey: 'edge:a',
			sourceNodeKey: 'packet:a',
			targetNodeKey: 'packet:b',
			edgeType: 'UNKNOWN',
			weight: 1,
			confidence: 1,
			provenance: 'test',
			extractorVersion: 'v1'
		})).toThrow();
	});

	it('keeps SearXNG evidence explicitly untrusted', () => {
		expect(() => ExternalSearchEvidenceSchema.parse({
			evidenceType: 'external_web',
			trusted: true,
			url: 'https://example.com',
			title: 'Example',
			snippet: '',
			engine: 'searxng',
			retrievedAt: '2026-07-23T00:00:00.000Z',
			queryHash: 'abc'
		})).toThrow();
	});
});
