import { describe, expect, it } from 'vitest';
import {
	clampRankingRelevance,
	isUsableRankingEmbedding,
	normalizeCosineRelevance,
	relevanceFromRank,
	relevanceFromSignal,
	hasCompatibleRankingEmbeddingIdentity
} from './recommendation-score-contract.js';

describe('recommendation score contract', () => {
	it('accepts only finite, non-zero embeddings of the expected dimension', () => {
		expect(isUsableRankingEmbedding([1, 2], 2)).toBe(true);
		expect(isUsableRankingEmbedding([1], 2)).toBe(false);
		expect(isUsableRankingEmbedding([0, 0], 2)).toBe(false);
		expect(isUsableRankingEmbedding([1, Number.NaN], 2)).toBe(false);
	});

	it('requires matching model and representation revisions before comparing vectors', () => {
		const query = { modelRevision: 'embeddinggemma-v1', vectorRevision: 'semantic_768-v1', dimensions: 768 };
		expect(hasCompatibleRankingEmbeddingIdentity(query, { ...query }, 768)).toBe(true);
		expect(hasCompatibleRankingEmbeddingIdentity(query, { ...query, modelRevision: 'embeddinggemma-2' }, 768)).toBe(false);
		expect(hasCompatibleRankingEmbeddingIdentity(query, { ...query, vectorRevision: 'semantic_256-v1' }, 768)).toBe(false);
		expect(hasCompatibleRankingEmbeddingIdentity(undefined, { ...query }, 768)).toBe(false);
	});

	it('maps raw cosine scores from [-1, 1] into bounded relevance', () => {
		expect(normalizeCosineRelevance(-1)).toBe(0);
		expect(normalizeCosineRelevance(0)).toBe(0.5);
		expect(normalizeCosineRelevance(1)).toBe(1);
		expect(normalizeCosineRelevance(Number.NaN)).toBeNull();
		expect(normalizeCosineRelevance(2)).toBeNull();
	});

	it('uses deterministic bounded relevance from retrieval rank', () => {
		expect(relevanceFromRank(0, 4)).toBe(1);
		expect(relevanceFromRank(3, 4)).toBe(0.25);
		expect(relevanceFromRank(4, 4)).toBe(0);
		expect(clampRankingRelevance(1.4)).toBe(1);
		expect(clampRankingRelevance(-0.2)).toBe(0);
	});

	it('keeps hybrid fusion distinct and uses retrieval rank for bounded relevance', () => {
		expect(relevanceFromSignal({
			kind: 'QDRANT_HYBRID',
			value: 0.83,
			retrievalPolicyRevision: 'rrf-v1',
			rank: 1,
			resultCount: 4,
		})).toBe(0.75);
		expect(relevanceFromSignal({ kind: 'SOURCE_RANKED', rank: 2, resultCount: 4, source: 'postgres-tags' })).toBe(0.5);
		expect(relevanceFromSignal({
			kind: 'COSINE',
			similarity: 0.5,
			modelRevision: 'embeddinggemma-v1',
			vectorRevision: 'semantic_768-v1',
			dimensions: 768,
		}, { modelRevision: 'embeddinggemma-v1', vectorRevision: 'semantic_768-v1', dimensions: 768 })).toBe(0.75);
		expect(relevanceFromSignal({
			kind: 'COSINE',
			similarity: 0.5,
			modelRevision: 'embeddinggemma-v1',
			vectorRevision: 'semantic_768-v1',
			dimensions: 768,
		})).toBe(0);
	});
});
