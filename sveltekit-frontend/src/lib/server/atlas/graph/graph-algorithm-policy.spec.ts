import { describe, expect, it } from 'vitest';
import { selectGraphAlgorithm } from './graph-algorithm-policy.js';

const envelope = {
	maxVramBytes: 8 * 1024 ** 3,
	maxContextTokens: 8192,
	maxCandidates: 64,
	maxGraphHops: 4,
	maxHyperedges: 64,
	maxToolCalls: 8,
	maxWallMs: 3000
};

describe('Parent Atlas graph algorithm policy', () => {
	it('uses BFS for unweighted local dependency traversal', () => {
		const decision = selectGraphAlgorithm({
			intent: 'dependency_path',
			direction: 'out',
			envelope
		});
		expect(decision.algorithm).toBe('bfs');
		expect(decision.backend).toBe('neo4j');
		expect(decision.reasonCodes).toContain('UNIT_HOP_COST');
	});

	it('uses SSSP when positive relationship costs are meaningful', () => {
		const decision = selectGraphAlgorithm({
			intent: 'dependency_path',
			direction: 'out',
			hasPositiveEdgeWeights: true,
			gpuAvailable: true,
			frozenSnapshotAvailable: true,
			envelope
		});
		expect(decision.algorithm).toBe('sssp');
		expect(decision.backend).toBe('cugraph');
	});

	it('uses personalized PageRank for query-conditioned authority', () => {
		const decision = selectGraphAlgorithm({
			intent: 'authority',
			direction: 'both',
			gpuAvailable: true,
			frozenSnapshotAvailable: true,
			envelope
		});
		expect(decision.algorithm).toBe('personalized_pagerank');
		expect(decision.backend).toBe('cugraph');
	});

	it('uses promoted community labels as a filter rather than re-running Leiden', () => {
		const decision = selectGraphAlgorithm({
			intent: 'community_context',
			direction: 'both',
			hasCommunityLabels: true,
			envelope
		});
		expect(decision.algorithm).toBe('leiden_filtered_bfs');
		expect(decision.reasonCodes).toContain('USE_PROMOTED_COMMUNITY_LABELS');
	});

	it('keeps revision lineage in the temporal DP lane', () => {
		const decision = selectGraphAlgorithm({
			intent: 'revision_lineage',
			direction: 'both',
			envelope
		});
		expect(decision.algorithm).toBe('k_best_viterbi');
		expect(decision.backend).toBe('temporal_dp');
	});

	it('routes exploratory expansion to bounded neighborhood sampling', () => {
		const decision = selectGraphAlgorithm({
			intent: 'explore',
			direction: 'both',
			gpuAvailable: true,
			frozenSnapshotAvailable: true,
			envelope
		});
		expect(decision.algorithm).toBe('neighbor_sampling');
		expect(decision.backend).toBe('cugraph');
	});
});
