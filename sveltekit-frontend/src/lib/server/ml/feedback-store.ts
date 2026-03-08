/**
 * Feedback Store — In-memory document feedback tracking
 *
 * Tracks user feedback (0-1 ratings) per document for use in ranking pipelines.
 * Provides:
 *   - Running average feedback boost per document
 *   - Novelty penalty based on similarity to already-returned results
 *   - Exponential decay toward neutral (0.5) for stale entries
 *
 * Used by: MultiModalRanker (signal weighting)
 */

const MAX_RATINGS_PER_DOC = 100;
const NEUTRAL = 0.5;
const DECAY_RATE = 0.995; // Per-query decay toward neutral

export class FeedbackStore {
	private ratings = new Map<string, number[]>();
	private lastAccess = new Map<string, number>();

	/**
	 * Record a user feedback rating for a document
	 * @param documentId - The document identifier
	 * @param rating - Feedback score in [0, 1] (0 = irrelevant, 1 = highly relevant)
	 */
	recordFeedback(documentId: string, rating: number): void {
		const clamped = Math.max(0, Math.min(1, rating));
		const existing = this.ratings.get(documentId) ?? [];
		existing.push(clamped);

		// Keep only the most recent ratings
		if (existing.length > MAX_RATINGS_PER_DOC) {
			existing.splice(0, existing.length - MAX_RATINGS_PER_DOC);
		}

		this.ratings.set(documentId, existing);
		this.lastAccess.set(documentId, Date.now());
	}

	/**
	 * Get feedback-based boost for a document
	 * Returns weighted average with 60/40 split (recent/historical)
	 * Decays toward 0.5 (neutral) for documents not recently rated
	 */
	getFeedbackBoost(documentId: string): number {
		const docRatings = this.ratings.get(documentId);
		if (!docRatings || docRatings.length === 0) return NEUTRAL;

		// Split into recent (last 40%) and historical
		const splitIdx = Math.floor(docRatings.length * 0.6);
		const historical = docRatings.slice(0, splitIdx);
		const recent = docRatings.slice(splitIdx);

		const avgHistorical = historical.length > 0
			? historical.reduce((a, b) => a + b, 0) / historical.length
			: NEUTRAL;
		const avgRecent = recent.length > 0
			? recent.reduce((a, b) => a + b, 0) / recent.length
			: NEUTRAL;

		// 60% recent, 40% historical
		let boost = 0.6 * avgRecent + 0.4 * avgHistorical;

		// Apply decay based on time since last access
		const lastTime = this.lastAccess.get(documentId) ?? Date.now();
		const hoursSinceAccess = (Date.now() - lastTime) / (1000 * 60 * 60);
		const decayFactor = Math.pow(DECAY_RATE, hoursSinceAccess);

		// Decay toward neutral
		boost = NEUTRAL + (boost - NEUTRAL) * decayFactor;

		return boost;
	}

	/**
	 * Compute novelty penalty for a candidate based on similarity to already-returned docs
	 * High similarity to existing results = low novelty = penalty
	 * @param similarities - Array of cosine similarities to already-returned documents
	 * @returns Novelty score in [0, 1] where 1 = highly novel, 0 = redundant
	 */
	getNoveltyPenalty(similarities: number[]): number {
		if (similarities.length === 0) return 1.0; // No prior results = fully novel
		const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
		return Math.max(0, Math.min(1, 1 - avgSimilarity));
	}

	/** Get total number of tracked documents */
	get size(): number {
		return this.ratings.size;
	}

	/** Clear all feedback data */
	clear(): void {
		this.ratings.clear();
		this.lastAccess.clear();
	}
}

/** Singleton feedback store instance */
export const feedbackStore = new FeedbackStore();
