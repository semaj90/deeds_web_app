export type RecommendationRetrievalSignalV1 =
	| { kind: 'COSINE'; similarity: number; modelRevision: string; vectorRevision: string; dimensions: number }
	| { kind: 'QDRANT_HYBRID'; value: number; retrievalPolicyRevision: string; rank: number; resultCount: number }
	| { kind: 'SOURCE_RANKED'; rank: number; resultCount: number; source: string };

export interface RankingEmbeddingIdentityV1 {
	modelRevision: string;
	vectorRevision: string;
	dimensions: number;
}

export function hasCompatibleRankingEmbeddingIdentity(
	queryIdentity: RankingEmbeddingIdentityV1 | undefined,
	candidateIdentity: RankingEmbeddingIdentityV1 | undefined,
	expectedDimensions: number
): boolean {
	return Boolean(
		queryIdentity
		&& candidateIdentity
		&& queryIdentity.modelRevision.trim()
		&& queryIdentity.vectorRevision.trim()
		&& candidateIdentity.modelRevision.trim()
		&& candidateIdentity.vectorRevision.trim()
		&& queryIdentity.modelRevision === candidateIdentity.modelRevision
		&& queryIdentity.vectorRevision === candidateIdentity.vectorRevision
		&& queryIdentity.dimensions === expectedDimensions
		&& candidateIdentity.dimensions === expectedDimensions
	);
}

export function relevanceFromSignal(
	signal: RecommendationRetrievalSignalV1,
	queryIdentity?: RankingEmbeddingIdentityV1
): number {
	if (signal.kind === 'COSINE') {
		const candidateIdentity = {
			modelRevision: signal.modelRevision,
			vectorRevision: signal.vectorRevision,
			dimensions: signal.dimensions,
		};
		if (!hasCompatibleRankingEmbeddingIdentity(queryIdentity, candidateIdentity, signal.dimensions)) return 0;
		return normalizeCosineRelevance(signal.similarity) ?? 0;
	}
	return relevanceFromRank(signal.rank, signal.resultCount);
}

export function isUsableRankingEmbedding(
	embedding: number[] | undefined,
	expectedDimensions: number
): embedding is number[] {
	return (
		Array.isArray(embedding) &&
		embedding.length === expectedDimensions &&
		embedding.every(Number.isFinite) &&
		embedding.some((value) => value !== 0)
	);
}

export function normalizeCosineRelevance(score: number): number | null {
	if (!Number.isFinite(score) || score < -1 || score > 1) return null;
	return (score + 1) / 2;
}

export function relevanceFromRank(rank: number, resultCount: number): number {
	if (!Number.isSafeInteger(rank) || !Number.isSafeInteger(resultCount) || rank < 0 || resultCount <= 0 || rank >= resultCount) {
		return 0;
	}
	return (resultCount - rank) / resultCount;
}

export function clampRankingRelevance(score: number | undefined): number {
	if (score === undefined || !Number.isFinite(score)) return 0;
	return Math.max(0, Math.min(1, score));
}
