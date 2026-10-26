import { describe, expect, it } from 'vitest';
import { mineHardNegativesV1, type HardNegativeCandidateInputV1 } from './hard-negative-miner-v1.js';

describe('hard-negative-miner-v1', () => {
	const samplePositives = ['packet::sveltekit-frontend/src/lib/foo.ts#func1'];
	const sampleGoldRefs = ['file:///src/lib/foo.ts'];

	it('throws fail-closed if no gold repair targets are provided', () => {
		expect(() =>
			mineHardNegativesV1({
				goldTargetKeys: [],
				candidates: [],
			}),
		).toThrow('NO_GOLD_REPAIR_TARGETS_PROVIDED');
	});

	it('never mines candidates marked isInVerifiedRepair or matching gold keys/refs', () => {
		const candidates: HardNegativeCandidateInputV1[] = [
			{
				candidateKey: 'packet::sveltekit-frontend/src/lib/foo.ts#func1',
				sourceRef: 'file:///src/lib/foo.ts',
				semanticScore: 0.95,
				pagerankScore: 0.1,
				pprScore: 0.05,
				isInVerifiedRepair: true,
			},
			{
				candidateKey: 'packet::other.ts#func2',
				sourceRef: 'file:///src/lib/foo.ts', // matches gold ref
				semanticScore: 0.9,
				pagerankScore: 0.1,
				pprScore: 0.05,
				isInVerifiedRepair: false,
			},
			{
				candidateKey: 'packet::valid-distractor.ts#bar',
				sourceRef: 'file:///src/lib/bar.ts',
				semanticScore: 0.85,
				pagerankScore: 0.05,
				pprScore: 0.02,
				isInVerifiedRepair: false,
			},
		];

		const result = mineHardNegativesV1({
			goldTargetKeys: samplePositives,
			goldSourceRefs: sampleGoldRefs,
			candidates,
		});

		expect(result).toHaveLength(1);
		expect(result[0].candidateKey).toBe('packet::valid-distractor.ts#bar');
	});

	it('mines hard negatives based on high semantic, PageRank, PPR, and same community', () => {
		const candidates: HardNegativeCandidateInputV1[] = [
			{
				candidateKey: 'packet::semantic-only.ts',
				sourceRef: 'file:///src/lib/semantic-only.ts',
				semanticScore: 0.75,
				pagerankScore: 0.001, // below minPageRankScore (0.01)
				pprScore: 0.001, // below minPprScore (0.01)
				communityId: 'cluster_99',
				isInVerifiedRepair: false,
			},
			{
				candidateKey: 'packet::pagerank-high.ts',
				sourceRef: 'file:///src/lib/pagerank-high.ts',
				semanticScore: 0.50, // below minSemanticScore (0.60)
				pagerankScore: 0.08,
				pprScore: 0.02,
				communityId: 'cluster_99',
				isInVerifiedRepair: false,
			},
			{
				candidateKey: 'packet::community-match.ts',
				sourceRef: 'file:///src/lib/community-match.ts',
				semanticScore: 0.55, // below minSemanticScore
				pagerankScore: 0.005, // below minPageRankScore
				pprScore: 0.005, // below minPprScore
				communityId: 'cluster_12', // matches positive community
				isInVerifiedRepair: false,
			},
			{
				candidateKey: 'packet::easy-negative.ts',
				sourceRef: 'file:///src/lib/easy.ts',
				semanticScore: 0.1,
				pagerankScore: 0.001,
				pprScore: 0.0,
				communityId: 'cluster_99',
				isInVerifiedRepair: false,
			},
		];

		const result = mineHardNegativesV1({
			goldTargetKeys: samplePositives,
			positiveCommunityIds: ['cluster_12'],
			candidates,
		});

		expect(result).toHaveLength(3); // semantic-only, pagerank-high, and community-match; easy-negative excluded
		const keys = result.map((r) => r.candidateKey);
		expect(keys).toContain('packet::semantic-only.ts');
		expect(keys).toContain('packet::pagerank-high.ts');
		expect(keys).toContain('packet::community-match.ts');
		expect(keys).not.toContain('packet::easy-negative.ts');
	});

	it('orders candidates by descending composite hardness and respects maxNegatives', () => {
		const candidates: HardNegativeCandidateInputV1[] = [
			{
				candidateKey: 'packet::medium-hard.ts',
				sourceRef: 'file:///src/lib/med.ts',
				semanticScore: 0.65,
				pagerankScore: 0.02,
				pprScore: 0.01,
				isInVerifiedRepair: false,
			},
			{
				candidateKey: 'packet::very-hard.ts',
				sourceRef: 'file:///src/lib/very-hard.ts',
				semanticScore: 0.95,
				pagerankScore: 0.15,
				pprScore: 0.10,
				isInVerifiedRepair: false,
			},
		];

		const result = mineHardNegativesV1({
			goldTargetKeys: samplePositives,
			candidates,
			options: { maxNegatives: 1 },
		});

		expect(result).toHaveLength(1);
		expect(result[0].candidateKey).toBe('packet::very-hard.ts');
		expect(result[0].hardnessScore).toBeGreaterThan(0.4);
	});
});
