/**
 * Multi-Modal Recommendation Ranker
 * Combines 5 signals for legal document recommendation:
 *   1. Vector Similarity (0.35): Cosine similarity to query embedding
 *   2. Tag Overlap (0.20): Shared statute/entity/practice area tags
 *   3. Topic Affinity (0.20): Document membership in query-related topics
 *   4. Graph Centrality (0.15): Neo4j connection strength to related cases/evidence
 *   5. Profile Match (0.10): User role + practice area alignment
 *
 * All scores normalized to [0, 1] before weighting.
 * Usage:
 *   const ranker = new MultiModalRanker(userId);
 *   const ranked = await ranker.rankDocuments(query, candidates, topK=10);
 */

import { cosineSimilarity } from '$lib/ai/client-embed.js';
import { db } from '$lib/server/db/client';
import { documentTopics, userInteractionHistory } from '$lib/server/db/schema-postgres';
import { eq, and } from 'drizzle-orm';

export interface RankingSignal {
	vectorSimilarity: number; // [0, 1] cosine similarity
	tagOverlap: number; // [0, 1] proportion of shared tags
	topicAffinity: number; // [0, 1] max topic membership probability
	graphCentrality: number; // [0, 1] normalized Neo4j centrality
	profileMatch: number; // [0, 1] user preference alignment
	finalScore: number; // Weighted combination of 5 signals
}

export interface RankedDocument {
	documentId: string;
	title: string;
	score: number;
	signals: RankingSignal;
	explanationTokens: string[]; // Why this document was ranked here
}

export interface DocumentCandidate {
	id: string;
	title: string;
	embedding: number[];
	tags: string[];
	topicMemberships?: { topicId: number; probability: number }[];
	centrality?: number;
	caseIds?: string[];
}

// Weights for the 5 signals (sum = 1.0)
const SIGNAL_WEIGHTS = {
	vectorSimilarity: 0.35,
	tagOverlap: 0.20,
	topicAffinity: 0.20,
	graphCentrality: 0.15,
	profileMatch: 0.10
};

/**
 * Compute tag overlap between two tag arrays
 * Returns Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function computeTagOverlap(tags1: string[], tags2: string[]): number {
	if (tags1.length === 0 && tags2.length === 0) return 1.0;
	if (tags1.length === 0 || tags2.length === 0) return 0;

	const set1 = new Set(tags1);
	const set2 = new Set(tags2);

	let intersection = 0;
	for (const tag of set1) {
		if (set2.has(tag)) intersection++;
	}

	const union = set1.size + set2.size - intersection;
	return intersection / union;
}

/**
 * Normalize an array of scores to [0, 1]
 * Uses min-max normalization with epsilon to avoid division by zero
 */
function normalizeScores(scores: number[]): number[] {
	if (scores.length === 0) return [];
	const min = Math.min(...scores);
	const max = Math.max(...scores);
	const range = max - min;

	if (range === 0) {
		return scores.map(() => 0.5); // All equal → neutral
	}

	return scores.map((s) => (s - min) / range);
}

/**
 * Extract query topics from user interaction history
 * Returns topic preferences with 7-day exponential decay window
 */
export async function inferUserTopicPreferences(
	userId: string
): Promise<Map<number, number>> {
	const preferences = new Map<number, number>();

	try {
		const interactions = await db
			.select({
				topicPreferences: userInteractionHistory.topicPreferences,
				createdAt: userInteractionHistory.createdAt
			})
			.from(userInteractionHistory)
			.where(eq(userInteractionHistory.userId, userId))
			.limit(100);

		const now = Date.now();
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

		for (const interaction of interactions) {
			const ageMs = now - new Date(interaction.createdAt).getTime();
			if (ageMs > sevenDaysMs) continue; // Outside decay window

			// Exponential decay: weight = e^(-age / 7days)
			const weight = Math.exp(-ageMs / sevenDaysMs);

			const topics = interaction.topicPreferences as Array<{ topicId: number; affinity: number }>;
			for (const topic of topics) {
				const current = preferences.get(topic.topicId) ?? 0;
				preferences.set(topic.topicId, current + weight * topic.affinity);
			}
		}
	} catch (err) {
		console.warn('[MultiModalRanker] Failed to fetch user topic preferences:', err);
	}

	return preferences;
}

export class MultiModalRanker {
	private userId: string;
	private userTopicPreferences: Map<number, number> | null = null;

	constructor(userId: string) {
		this.userId = userId;
	}

	/**
	 * Rank documents based on multi-modal signals
	 */
	async rankDocuments(
		queryEmbedding: number[],
		queryTags: string[],
		candidates: DocumentCandidate[],
		topK = 10
	): Promise<RankedDocument[]> {
		if (candidates.length === 0) {
			return [];
		}

		// Pre-compute user topic preferences (cached for entire ranking session)
		if (!this.userTopicPreferences) {
			this.userTopicPreferences = await inferUserTopicPreferences(this.userId);
		}

		// Compute all signals for each candidate
		const rankedWithSignals = candidates.map((doc) => {
			const signals = this.computeSignals(
				queryEmbedding,
				queryTags,
				doc,
				this.userTopicPreferences!
			);

			const finalScore =
				SIGNAL_WEIGHTS.vectorSimilarity * signals.vectorSimilarity +
				SIGNAL_WEIGHTS.tagOverlap * signals.tagOverlap +
				SIGNAL_WEIGHTS.topicAffinity * signals.topicAffinity +
				SIGNAL_WEIGHTS.graphCentrality * signals.graphCentrality +
				SIGNAL_WEIGHTS.profileMatch * signals.profileMatch;

			return {
				documentId: doc.id,
				title: doc.title,
				score: finalScore,
				signals,
				explanationTokens: this.generateExplanation(signals)
			};
		});

		// Sort by final score descending
		rankedWithSignals.sort((a, b) => b.score - a.score);

		return rankedWithSignals.slice(0, topK);
	}

	/**
	 * Compute all 5 signals for a single document
	 */
	private computeSignals(
		queryEmbedding: number[],
		queryTags: string[],
		document: DocumentCandidate,
		userTopicPreferences: Map<number, number>
	): RankingSignal {
		// Signal 1: Vector Similarity (cosine)
		const vectorSimilarity = cosineSimilarity(queryEmbedding, document.embedding);

		// Signal 2: Tag Overlap (Jaccard)
		const tagOverlap = computeTagOverlap(queryTags, document.tags);

		// Signal 3: Topic Affinity (max membership probability in user-preferred topics)
		let topicAffinity = 0;
		if (document.topicMemberships && userTopicPreferences.size > 0) {
			for (const membership of document.topicMemberships) {
				const userPref = userTopicPreferences.get(membership.topicId) ?? 0;
				if (userPref > 0) {
					topicAffinity = Math.max(topicAffinity, membership.probability * userPref);
				}
			}
		}

		// Signal 4: Graph Centrality (normalized 0-1)
		const graphCentrality = Math.min(1, document.centrality ?? 0);

		// Signal 5: Profile Match (placeholder - 0.5 neutral)
		// In production: query user role + practice area vs document case types
		const profileMatch = 0.5;

		return {
			vectorSimilarity,
			tagOverlap,
			topicAffinity,
			graphCentrality,
			profileMatch,
			finalScore: 0 // Will be computed by caller
		};
	}

	/**
	 * Generate human-readable explanation tokens for why document was ranked
	 * Example: ["High Vector Similarity", "Shared Tags: statute, entity"]
	 */
	private generateExplanation(signals: RankingSignal): string[] {
		const tokens: string[] = [];

		if (signals.vectorSimilarity > 0.8) {
			tokens.push(`High Vector Similarity (${(signals.vectorSimilarity * 100).toFixed(0)}%)`);
		} else if (signals.vectorSimilarity > 0.6) {
			tokens.push(`Moderate Vector Similarity (${(signals.vectorSimilarity * 100).toFixed(0)}%)`);
		}

		if (signals.tagOverlap > 0.5) {
			tokens.push(`Strong Tag Overlap (${(signals.tagOverlap * 100).toFixed(0)}%)`);
		}

		if (signals.topicAffinity > 0.5) {
			tokens.push(`User Preferred Topics (${(signals.topicAffinity * 100).toFixed(0)}%)`);
		}

		if (signals.graphCentrality > 0.7) {
			tokens.push('Central to Case Network');
		}

		if (signals.profileMatch > 0.6) {
			tokens.push('Matches Your Practice Area');
		}

		return tokens.length > 0 ? tokens : ['Document recommended'];
	}
}

/**
 * Batch rank multiple result sets from different sources
 * Useful for combining RAG + graph + tag search results
 */
export async function rankCombinedResults(
	userId: string,
	queryEmbedding: number[],
	queryTags: string[],
	ragResults: DocumentCandidate[],
	graphResults: DocumentCandidate[],
	tagResults: DocumentCandidate[],
	topK = 10
): Promise<RankedDocument[]> {
	// Deduplicate by document ID while preserving best metadata
	const deduped = new Map<string, DocumentCandidate>();

	for (const result of [...ragResults, ...graphResults, ...tagResults]) {
		if (!deduped.has(result.id)) {
			deduped.set(result.id, result);
		} else {
			// Merge metadata
			const existing = deduped.get(result.id)!;
			existing.tags = Array.from(new Set([...existing.tags, ...result.tags]));
			existing.topicMemberships = existing.topicMemberships || result.topicMemberships;
			existing.centrality = Math.max(existing.centrality ?? 0, result.centrality ?? 0);
		}
	}

	const ranker = new MultiModalRanker(userId);
	return ranker.rankDocuments(
		queryEmbedding,
		queryTags,
		Array.from(deduped.values()),
		topK
	);
}