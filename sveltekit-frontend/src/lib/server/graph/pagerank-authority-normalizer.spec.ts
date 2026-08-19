import { describe, expect, it } from 'vitest';
import { computeRelationshipProjectionHashV3 } from './graph-projection-manifest.js';
import { PageRankExecutionPlanV1Schema, PageRankExecutionReceiptV1Schema } from './pagerank-execution-contract.js';
import { buildPageRankAuthorityBatchV2 } from './pagerank-authority-normalizer.js';

function fixtures() {
	const relationships = {
		IMPORTS: {
			sourceType: 'IMPORTS',
			projectedType: 'IMPORTS',
			orientation: 'NATURAL' as const,
			aggregation: 'NONE' as const,
			properties: {},
		},
	};
	const projection = {
		schema: 'atlas.graph-projection-manifest.v3' as const,
		projectionRevision: 'projection-r1',
		graphRevision: 'graph-r1',
		projectionName: 'atlas_dependency_v1',
		nodeLabels: ['CodebaseFile'],
		relationships,
		projectionHash: computeRelationshipProjectionHashV3(relationships),
		nodeCount: 3,
		relationshipCount: 2,
		createdAt: '2026-08-19T20:00:00.000Z',
	};
	const plan = PageRankExecutionPlanV1Schema.parse({
		schema: 'atlas.pagerank-execution-plan.v1',
		runId: 'run-1',
		canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS',
		algorithmFamily: 'PAGERANK',
		algorithm: 'pagerank',
		algorithmRevision: 'pagerank-v1',
		executor: { executorId: 'NEO4J_GDS', role: 'CANONICAL_EXECUTOR' },
		projection,
		parameters: {
			dampingFactor: 0.85,
			maxIterations: 100,
			tolerance: 0.0001,
			relationshipTypes: ['IMPORTS'],
			weighted: false,
			relationshipWeightProperty: null,
			personalization: { mode: 'GLOBAL' },
		},
		producerRevision: 'producer-r1',
		createdAt: '2026-08-19T20:00:00.000Z',
	});
	const receipt = PageRankExecutionReceiptV1Schema.parse({
		schema: 'atlas.pagerank-execution-receipt.v1',
		runId: 'run-1',
		algorithmFamily: 'PAGERANK',
		algorithm: 'pagerank',
		algorithmRevision: 'pagerank-v1',
		graphRevision: 'graph-r1',
		projectionRevision: 'projection-r1',
		projectionHash: projection.projectionHash,
		projectionName: 'atlas_dependency_v1',
		nodeCount: 3,
		relationshipCount: 2,
		telemetry: {
			executorId: 'NEO4J_GDS', convergenceStatus: 'CONVERGED', ranIterations: 10,
			preProcessingMillis: 1, computeMillis: 2, postProcessingMillis: 1,
		},
		rawOutputHash: 'raw-hash',
		producerRevision: 'producer-r1',
		completedAt: '2026-08-19T20:01:00.000Z',
	});
	return { plan, receipt };
}

describe('PageRank authority normalization', () => {
	it('L1-normalizes raw scores and assigns deterministic tie-aware percentiles', () => {
		const { plan, receipt } = fixtures();
		const batch = buildPageRankAuthorityBatchV2({
			plan,
			receipt,
			producerRevision: 'normalizer-r1',
			scores: [
				{ nodeId: 1, canonicalId: 'a', score: 1 },
				{ nodeId: 2, canonicalId: 'b', score: 1 },
				{ nodeId: 3, canonicalId: 'c', score: 2 },
			],
		});
		expect(batch.records.reduce((sum, row) => sum + row.pagerankL1, 0)).toBeCloseTo(1, 12);
		const byId = new Map(batch.records.map((row) => [row.canonicalId, row]));
		expect(byId.get('a')?.authorityPercentile).toBe(0.25);
		expect(byId.get('b')?.authorityPercentile).toBe(0.25);
		expect(byId.get('c')?.authorityPercentile).toBe(1);
		expect(byId.get('c')?.authorityNorm).toBe(1);
	});

	it('rejects an empty raw score set', () => {
		const { plan, receipt } = fixtures();
		expect(() => buildPageRankAuthorityBatchV2({ plan, receipt, scores: [], producerRevision: 'normalizer-r1' })).toThrow(/empty/);
	});
});
