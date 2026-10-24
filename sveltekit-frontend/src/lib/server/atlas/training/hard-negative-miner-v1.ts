import { z } from 'zod';

export const HardNegativeCandidateInputV1Schema = z.object({
	candidateKey: z.string().min(1),
	sourceRef: z.string().min(1),
	semanticScore: z.number().finite().min(0).max(1).default(0),
	pagerankScore: z.number().finite().min(0).max(1).default(0),
	pprScore: z.number().finite().min(0).max(1).default(0),
	communityId: z.union([z.string(), z.number()]).optional(),
	isInVerifiedRepair: z.boolean().default(false),
}).strict();

export type HardNegativeCandidateInputV1 = z.infer<typeof HardNegativeCandidateInputV1Schema>;

export const HardNegativeMiningOptionsV1Schema = z.object({
	minSemanticScore: z.number().finite().min(0).max(1).default(0.60),
	minPageRankScore: z.number().finite().min(0).max(1).default(0.01),
	minPprScore: z.number().finite().min(0).max(1).default(0.01),
	matchCommunityOfPositives: z.boolean().default(true),
	maxNegatives: z.number().int().positive().default(10),
	semanticWeight: z.number().finite().min(0).default(0.4),
	pagerankWeight: z.number().finite().min(0).default(0.3),
	pprWeight: z.number().finite().min(0).default(0.2),
	communityWeight: z.number().finite().min(0).default(0.1),
}).strict();

export type HardNegativeMiningOptionsV1 = z.infer<typeof HardNegativeMiningOptionsV1Schema>;

export const MiningStrategyV1Schema = z.enum([
	'HIGH_SEMANTIC_NON_TARGET',
	'HIGH_PAGERANK_NON_TARGET',
	'HIGH_PPR_NON_TARGET',
	'SAME_COMMUNITY_NON_TARGET',
]);

export type MiningStrategyV1 = z.infer<typeof MiningStrategyV1Schema>;

export const MinedHardNegativeV1Schema = z.object({
	candidateKey: z.string().min(1),
	sourceRef: z.string().min(1),
	miningStrategies: z.array(MiningStrategyV1Schema).min(1),
	hardnessScore: z.number().finite().min(0),
	semanticScore: z.number().finite().min(0).max(1),
	pagerankScore: z.number().finite().min(0).max(1),
	pprScore: z.number().finite().min(0).max(1),
	communityId: z.union([z.string(), z.number()]).optional(),
}).strict();

export type MinedHardNegativeV1 = z.infer<typeof MinedHardNegativeV1Schema>;

export interface MineHardNegativesInputV1 {
	goldTargetKeys: readonly string[];
	goldSourceRefs?: readonly string[];
	positiveCommunityIds?: readonly (string | number)[];
	candidates: readonly HardNegativeCandidateInputV1[];
	options?: Partial<HardNegativeMiningOptionsV1>;
}

/**
 * Mines hard negative candidates for cross-encoder/ranking model training.
 * Selects non-target candidates that scored high on semantic similarity, PageRank authority,
 * PPR, or shared community membership with true positives.
 *
 * Invariants:
 * 1. Fail-closed: requires non-empty goldTargetKeys.
 * 2. Absolute exclusion: candidates in the verified repair (or matching gold keys/refs) are never mined.
 * 3. Hardness ranking: candidates are ranked by weighted composite hardness and bounded by maxNegatives.
 */
export function mineHardNegativesV1(input: MineHardNegativesInputV1): MinedHardNegativeV1[] {
	if (!input.goldTargetKeys || input.goldTargetKeys.length === 0) {
		throw new Error('NO_GOLD_REPAIR_TARGETS_PROVIDED');
	}

	const options = HardNegativeMiningOptionsV1Schema.parse(input.options ?? {});
	const goldTargetSet = new Set(input.goldTargetKeys);
	const goldSourceSet = new Set(input.goldSourceRefs ?? []);
	const positiveCommunitySet = new Set(
		(input.positiveCommunityIds ?? []).map((id) => String(id)),
	);

	const mined: MinedHardNegativeV1[] = [];

	for (const rawCand of input.candidates) {
		const cand = HardNegativeCandidateInputV1Schema.parse(rawCand);

		// Discard any candidate that was part of the verified repair
		if (cand.isInVerifiedRepair) continue;
		if (goldTargetSet.has(cand.candidateKey)) continue;
		if (goldSourceSet.has(cand.sourceRef)) continue;

		const strategies: MiningStrategyV1[] = [];
		let isSameCommunity = false;

		if (cand.semanticScore >= options.minSemanticScore) {
			strategies.push('HIGH_SEMANTIC_NON_TARGET');
		}
		if (cand.pagerankScore >= options.minPageRankScore) {
			strategies.push('HIGH_PAGERANK_NON_TARGET');
		}
		if (cand.pprScore >= options.minPprScore) {
			strategies.push('HIGH_PPR_NON_TARGET');
		}
		if (
			options.matchCommunityOfPositives &&
			cand.communityId !== undefined &&
			positiveCommunitySet.has(String(cand.communityId))
		) {
			strategies.push('SAME_COMMUNITY_NON_TARGET');
			isSameCommunity = true;
		}

		if (strategies.length === 0) {
			// Not hard enough to qualify as a hard negative distractor
			continue;
		}

		const hardnessScore = Number(
			(
				options.semanticWeight * cand.semanticScore +
				options.pagerankWeight * cand.pagerankScore +
				options.pprWeight * cand.pprScore +
				(isSameCommunity ? options.communityWeight : 0)
			).toFixed(6),
		);

		mined.push({
			candidateKey: cand.candidateKey,
			sourceRef: cand.sourceRef,
			miningStrategies: strategies,
			hardnessScore,
			semanticScore: cand.semanticScore,
			pagerankScore: cand.pagerankScore,
			pprScore: cand.pprScore,
			communityId: cand.communityId,
		});
	}

	// Sort descending by composite hardness score, then tie-break by candidateKey
	mined.sort((a, b) => {
		const diff = b.hardnessScore - a.hardnessScore;
		if (diff !== 0) return diff;
		return a.candidateKey.localeCompare(b.candidateKey);
	});

	return mined.slice(0, options.maxNegatives);
}
