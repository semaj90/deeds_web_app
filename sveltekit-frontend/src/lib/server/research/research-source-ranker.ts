/**
 * Research Source Ranker: Implements the trust hierarchy for external knowledge.
 * 
 * Hierarchy:
 * - Official Documentation (high trust)
 * - GitHub (Issues/PRs/Code)
 * - Blog posts/Tutorials
 * - Community sentiment (Reddit/Forums - low trust)
 */

export type ResearchSourceType = 
	| 'official_docs' 
	| 'github_repo' 
	| 'github_issue' 
	| 'github_pr' 
	| 'maintainer_comment' 
	| 'blog_post' 
	| 'reddit_post' 
	| 'unknown';

export type SourceTrustTier = 'official_or_primary' | 'trusted_community' | 'unverified';

const TRUST_SCORES: Record<ResearchSourceType, number> = {
	official_docs: 0.30,
	github_repo: 0.25,
	github_issue: 0.18,
	github_pr: 0.18,
	maintainer_comment: 0.18,
	blog_post: 0.08,
	reddit_post: 0.03,
	unknown: -0.10
};

export function getSourceTrustScore(sourceType: ResearchSourceType): number {
	return TRUST_SCORES[sourceType] || TRUST_SCORES.unknown;
}

export function getTrustTier(sourceType: ResearchSourceType): SourceTrustTier {
	if (sourceType === 'official_docs' || sourceType === 'github_repo') return 'official_or_primary';
	if (sourceType.startsWith('github_') || sourceType === 'maintainer_comment') return 'trusted_community';
	return 'unverified';
}

/**
 * Calculates the final research quality score for a finding.
 */
export function calculateResearchScore(params: {
	relevance: number;       // 0.0 - 1.0
	informationGain: number; // 0.0 - 1.0
	sourceType: ResearchSourceType;
	recency: number;         // 0.0 - 1.0 (1.0 = brand new)
	internalAlignment: number; // 0.0 - 1.0 (how well it maps to our code)
}) {
	const sourceTrust = getSourceTrustScore(params.sourceType);
	
	const score = 
		(0.35 * params.relevance) +
		(0.25 * params.informationGain) +
		(0.20 * sourceTrust) +
		(0.10 * params.recency) +
		(0.10 * params.internalAlignment);
		
	return {
		finalScore: Math.min(Math.max(score, 0), 1),
		sourceTrust,
		tier: getTrustTier(params.sourceType)
	};
}
