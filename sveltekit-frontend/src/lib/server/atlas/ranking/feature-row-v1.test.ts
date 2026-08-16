import { describe, expect, it } from 'vitest';
import { buildFeatureRowV1, featureRowV1ToFloat32 } from './feature-row-v1.js';

const locator = {
	schema: 'atlas.evidence-locator.v1' as const,
	canonicalId: 'symbol:demo',
	packetKey: 'packet:demo',
	sourceRef: 'sveltekit-frontend/src/demo.ts',
	sourceKind: 'code_file' as const,
	filePath: 'sveltekit-frontend/src/demo.ts',
	sourceUrl: null,
	contentHash: 'sha256:abc',
	workspaceRevision: 'workspace:1',
	sourceRevision: 'source:1',
	span: { startByte: 0, endByte: 10 },
	domain: {
		taxonomyRevision: 'taxonomy:1',
		labels: ['typescript'],
		evidenceRefs: ['evidence:domain'],
		producerRevision: 'classifier:1',
	},
};

describe('FeatureRowV1', () => {
	it('keeps locator identity separate and wires one PageRank authority signal', () => {
		const row = buildFeatureRowV1({
			locator,
			featureRevision: 'feature:1',
			graphRevision: 'graph:1',
			semanticRevision: 'semantic:1',
			dense: 0.9,
			sparse: 0.7,
			rrf: 0.8,
			ast: 0.6,
			pagerank: { pagerank_l1: 0.4, pagerank_raw: 0.3, authority_score: 0.5 },
			pprAffinity: 0.2,
			domainAffinity: 1,
			freshness: 0.75,
			crossEncoder: 0.95,
			executionUtility: 0.5,
			evidenceRefs: ['evidence:b', 'evidence:a', 'evidence:a'],
		});

		expect(row.pagerankAuthority).toBe(0.4);
		expect(row.sourceRef).toBe(locator.sourceRef);
		expect(row.evidenceRefs).toEqual(['evidence:a', 'evidence:b']);
		expect(featureRowV1ToFloat32(row)).toHaveLength(10);
	});

	it('rejects a row with no PageRank authority source', () => {
		expect(() => buildFeatureRowV1({
			locator,
			featureRevision: 'feature:1',
			graphRevision: 'graph:1',
			semanticRevision: 'semantic:1',
			dense: 0,
			sparse: 0,
			rrf: 0,
			ast: 0,
			pagerank: null,
			domainAffinity: 0,
			freshness: 0,
			executionUtility: 0,
			evidenceRefs: ['evidence:1'],
		})).toThrow(/PageRank authority/);
	});
});
