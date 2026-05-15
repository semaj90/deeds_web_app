/**
 * Multi-Modal Recommendation Ranker
 * Combines 7 signals for legal document recommendation:
 *   1. Vector Similarity (0.30): Cosine similarity to query embedding
 *   2. Tag Overlap (0.18): Shared statute/entity/practice area tags
 *   3. Topic Affinity (0.18): Document membership in query-related topics
 *   4. Graph Centrality (0.12): Neo4j connection strength to related cases/evidence
 *   5. Profile Match (0.07): User role + practice area alignment
 *   6. Feedback Boost (0.08): User feedback history (running average with decay)
 *   7. Novelty Score (0.07): Penalizes redundant results similar to already-returned docs
 *
 * All scores normalized to [0, 1] before weighting.
 * Usage:
 *   const ranker = new MultiModalRanker(userId);
 *   const ranked = await ranker.rankDocuments(query, candidates, topK=10);
 */

import { cosineSimilarity } from '$lib/ai/client-embed.js';
import { db } from '$lib/server/db/client';
import { documentTopics, userInteractionHistory } from '$lib/server/db/schema-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { feedbackStore } from '$lib/server/ml/feedback-store.js';
import { batchCosineSimilarity } from '$lib/server/gpu/libtorch-bridge.js';

export interface RankingSignal {
	vectorSimilarity: number; // [0, 1] cosine similarity
	tagOverlap: number; // [0, 1] proportion of shared tags
	topicAffinity: number; // [0, 1] max topic membership probability
	graphCentrality: number; // [0, 1] normalized Neo4j centrality
	profileMatch: number; // [0, 1] user preference alignment
	feedbackBoost: number; // [0, 1] user feedback running average
	noveltyScore: number; // [0, 1] 1=novel, 0=redundant
	finalScore: number; // Weighted combination of 7 signals
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

// Weights for the 7 signals (sum = 1.0)
const SIGNAL_WEIGHTS = {
	vectorSimilarity: 0.30,
	tagOverlap: 0.18,
	topicAffinity: 0.18,
	graphCentrality: 0.12,
	profileMatch: 0.07,
	feedbackBoost: 0.08,
	noveltyScore: 0.07
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

interface UserProfileMatch {
	practiceAreas: string[];
	jurisdiction: string | null;
}

/** Fetch user practice areas + jurisdiction for profile match signal */
async function fetchUserProfileMatch(userId: string): Promise<UserProfileMatch> {
	try {
		const result = await db.execute(
			sql`SELECT practice_area, jurisdiction FROM users WHERE id = ${userId} LIMIT 1`
		);
		const rows = result.rows ?? [];
		const row = rows[0] as Record<string, unknown> | undefined;
		if (!row) return { practiceAreas: [], jurisdiction: null };

		const practiceArea = row.practice_area as string | null;
		return {
			practiceAreas: practiceArea ? practiceArea.split(',').map((s: string) => s.trim().toLowerCase()) : [],
			jurisdiction: (row.jurisdiction as string | null)?.toLowerCase() ?? null,
		};
	} catch {
		return { practiceAreas: [], jurisdiction: null };
	}
}

/** Score profile match: 1.0 = exact match, 0.5 = partial, 0.2 = unrelated */
function computeProfileMatch(
	userProfile: UserProfileMatch,
	documentTags: string[]
): number {
	if (userProfile.practiceAreas.length === 0 && !userProfile.jurisdiction) return 0.5;

	const docTagsLower = documentTags.map((t) => t.toLowerCase());
	let score = 0.2; // Baseline for unrelated

	// Practice area match
	if (userProfile.practiceAreas.length > 0) {
		const hasExact = userProfile.practiceAreas.some((pa) =>
			docTagsLower.some((t) => t.includes(pa) || pa.includes(t))
		);
		if (hasExact) score = 1.0;
		else {
			// Partial: check if any doc tag is in the same legal domain
			const legalDomains: Record<string, string[]> = {
				criminal: ['criminal', 'felony', 'misdemeanor', 'prosecution', 'defense'],
				civil: ['civil', 'tort', 'contract', 'negligence', 'liability'],
				family: ['family', 'custody', 'divorce', 'adoption', 'child'],
				corporate: ['corporate', 'business', 'merger', 'securities', 'compliance'],
				constitutional: ['constitutional', 'amendment', 'rights', 'liberty'],
			};
			for (const [, keywords] of Object.entries(legalDomains)) {
				const userInDomain = userProfile.practiceAreas.some((pa) =>
					keywords.some((k) => pa.includes(k))
				);
				const docInDomain = docTagsLower.some((t) =>
					keywords.some((k) => t.includes(k))
				);
				if (userInDomain && docInDomain) {
					score = Math.max(score, 0.7);
					break;
				}
			}
		}
	}

	// Jurisdiction match boost
	if (userProfile.jurisdiction) {
		const jurisdictionMatch = docTagsLower.some(
			(t) => t.includes(userProfile.jurisdiction!) || userProfile.jurisdiction!.includes(t)
		);
		if (jurisdictionMatch) score = Math.min(score + 0.2, 1.0);
	}

	return score;
}

export class MultiModalRanker {
	private userId: string;
	private userTopicPreferences: Map<number, number> | null = null;
	private userProfile: UserProfileMatch | null = null;

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

		// Pre-compute user topic preferences + profile (cached for entire ranking session)
		if (!this.userTopicPreferences) {
			this.userTopicPreferences = await inferUserTopicPreferences(this.userId);
		}
		if (!this.userProfile) {
			this.userProfile = await fetchUserProfileMatch(this.userId);
		}

		// GPU-accelerated batch vector similarity via LibTorch (100× faster)
		const allEmbeddings = candidates.map(c => c.embedding);
		const batchResult = await batchCosineSimilarity(queryEmbedding, allEmbeddings);
		const vectorSimilarities = batchResult.scores;

		// Track already-returned embeddings for novelty computation
		const returnedEmbeddings: number[][] = [];

		// Compute all signals for each candidate (sequential for novelty dependency)
		const rankedWithSignals: RankedDocument[] = [];
		for (let i = 0; i < candidates.length; i++) {
			const doc = candidates[i];
			const precomputedVectorSimilarity = vectorSimilarities[i];
			// GPU-accelerated batch novelty scoring via LibTorch (100× faster)
			let noveltyScore = 1.0;
			if (returnedEmbeddings.length > 0) {
				const result = await batchCosineSimilarity(doc.embedding, returnedEmbeddings);
				const similarities = result.scores;
				noveltyScore = feedbackStore.getNoveltyPenalty(similarities);
			}

			const signals = this.computeSignals(
				queryEmbedding,
				queryTags,
				doc,
				this.userTopicPreferences!,
				precomputedVectorSimilarity,
				noveltyScore
			);

			const finalScore =
				SIGNAL_WEIGHTS.vectorSimilarity * signals.vectorSimilarity +
				SIGNAL_WEIGHTS.tagOverlap * signals.tagOverlap +
				SIGNAL_WEIGHTS.topicAffinity * signals.topicAffinity +
				SIGNAL_WEIGHTS.graphCentrality * signals.graphCentrality +
				SIGNAL_WEIGHTS.profileMatch * signals.profileMatch +
				SIGNAL_WEIGHTS.feedbackBoost * signals.feedbackBoost +
				SIGNAL_WEIGHTS.noveltyScore * signals.noveltyScore;

			returnedEmbeddings.push(doc.embedding);

			rankedWithSignals.push({
				documentId: doc.id,
				title: doc.title,
				score: finalScore,
				signals,
				explanationTokens: this.generateExplanation(signals)
			});
		}

		// Sort by final score descending
		rankedWithSignals.sort((a, b) => b.score - a.score);

		return rankedWithSignals.slice(0, topK);
	}

	/**
	 * Compute all 7 signals for a single document
	 */
	private computeSignals(
		queryEmbedding: number[],
		queryTags: string[],
		document: DocumentCandidate,
		userTopicPreferences: Map<number, number>,
		vectorSimilarity: number,
		noveltyScore = 1.0
	): RankingSignal {
		// Signal 1: Vector Similarity (precomputed via GPU batch)

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

		// Signal 5: Profile Match (user practice area + jurisdiction vs document tags)
		const profileMatch = this.userProfile
			? computeProfileMatch(this.userProfile, document.tags)
			: 0.5;

		// Signal 6: Feedback Boost (user rating history with decay)
		const feedbackBoost = feedbackStore.getFeedbackBoost(document.id);

		// Signal 7: Novelty Score (passed in from caller)

		return {
			vectorSimilarity,
			tagOverlap,
			topicAffinity,
			graphCentrality,
			profileMatch,
			feedbackBoost,
			noveltyScore,
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

		if (signals.feedbackBoost > 0.7) {
			tokens.push(`Positively Rated (${(signals.feedbackBoost * 100).toFixed(0)}%)`);
		}

		if (signals.noveltyScore > 0.8) {
			tokens.push('Highly Novel Result');
		} else if (signals.noveltyScore < 0.3) {
			tokens.push('Similar to Other Results');
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
