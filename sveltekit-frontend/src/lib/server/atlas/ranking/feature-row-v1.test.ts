import { describe, expect, it } from 'vitest';
import {
	assembleRankingFeatureVectorV1,
	buildCandidateStaticFeaturesV1,
	buildQueryCandidateFeaturesV1,
	rankingFeatureVectorV1ToFloat32,
	RANKING_FEATURE_VECTOR_V1_FIELDS,
} from './feature-row-v1.js';

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

const promotedPageRank = {
	schema: 'atlas.promoted-pagerank-evidence.v1' as const,
	runId: 'pagerank-run:1',
	runStatus: 'promoted' as const,
	graphRevision: 'graph:1',
	projectionRevision: 'projection:1',
	normalizationRevision: 'l1-percentile:1',
	algorithmRevision: 'pagerank:0.85:v1',
	pagerankRaw: 0.00042,
	pagerankL1: 0.00042,
	authorityPercentile: 0.91,
	authorityBand: 'high',
	receiptRef: 'receipt:pagerank:1',
};

describe('ranking feature ownership', () => {
	it('uses promoted PageRank percentile in static state and query features only in the overlay', () => {
		const staticFeatures = buildCandidateStaticFeaturesV1({
			locator,
			featureRevision: 'feature:1',
			graphRevision: 'graph:1',
			semanticRevision: 'semantic:768:1',
			pagerank: promotedPageRank,
			communitySnapshotId: 'community-snapshot:1',
			communityFingerprint: 'sha256:community-a',
			historicalSuccess: 0.7,
			failureFrequency: 0.2,
			freshness: 0.8,
			structuralDegree: 12,
			estimatedTokenCost: 480,
			evidenceRefs: ['evidence:static'],
		});

		expect(staticFeatures.pagerankAuthority).toBe(0.91);
		expect(staticFeatures).not.toHaveProperty('dense');
		expect(staticFeatures).not.toHaveProperty('crossEncoder');

		const queryFeatures = buildQueryCandidateFeaturesV1({
			queryId: 'query:1',
			queryRevision: 'query-revision:1',
			candidateId: locator.canonicalId,
			packetKey: locator.packetKey,
			dense: 0.9,
			sparse: 0.7,
			rrf: 0.8,
			astAffinity: 0.6,
			pprAffinity: 0.5,
			domainMatch: 1,
			crossEncoder: 0.95,
			crossEncoderRawScore: 7.2,
			crossEncoderCalibrationRevision: 'ce-calibration:1',
			evidenceRefs: ['evidence:query'],
		});

		const row = assembleRankingFeatureVectorV1({ staticFeatures, queryFeatures });
		expect(row.values).toHaveLength(RANKING_FEATURE_VECTOR_V1_FIELDS.length);
		expect(rankingFeatureVectorV1ToFloat32(row)).toHaveLength(RANKING_FEATURE_VECTOR_V1_FIELDS.length);
		expect(row.evidenceRefs).toContain('receipt:pagerank:1');
	});

	it('rejects mismatched graph lineage before constructing static features', () => {
		expect(() => buildCandidateStaticFeaturesV1({
			locator,
			featureRevision: 'feature:1',
			graphRevision: 'graph:DIFFERENT',
			semanticRevision: 'semantic:768:1',
			pagerank: promotedPageRank,
			historicalSuccess: 0,
			failureFrequency: 0,
			freshness: 0,
			structuralDegree: 0,
			estimatedTokenCost: 0,
			evidenceRefs: ['evidence:1'],
		})).toThrow(/graphRevision/);
	});
});
