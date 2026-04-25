/**
 * HMM Engine — Bigram Transition Model for Query Prediction
 *
 * Tracks bigram frequencies from user query history and predicts
 * likely follow-up search terms. Uses Redis for persistent transition storage.
 *
 * Usage:
 *   await updateTransitions(userId, ['tort', 'negligence', 'damages']);
 *   const predictions = await predictNextContext(['negligence'], 3);
 */

import { getRedis } from '$lib/server/redis.js';

export interface HMMState {
	id: string;
	probability: number;
}

const REDIS_PREFIX = 'hmm:transitions';
const MAX_TRANSITIONS = 1000; // cap per user to prevent unbounded growth

/**
 * Predict next likely query terms given a sequence of tokens.
 * Uses bigram transition frequencies stored in Redis.
 *
 * @param sequence - Recent query tokens (uses last token for lookup)
 * @param topK - Number of predictions to return
 * @param userId - Optional user ID for personalized predictions
 */
export async function predictNextContext(
	sequence: string[],
	topK: number = 3,
	userId?: string
): Promise<HMMState[]> {
	if (!sequence || sequence.length === 0) return [];

	try {
		const redis = getRedis();
		const lastToken = sequence[sequence.length - 1].toLowerCase();
		const key = userId
			? `${REDIS_PREFIX}:${userId}:${lastToken}`
			: `${REDIS_PREFIX}:global:${lastToken}`;

		// Get all transitions from this token
		const transitions = await redis.hgetall(key);
		if (!transitions || Object.keys(transitions).length === 0) {
			return [];
		}

		// Convert to scored entries
		const entries = Object.entries(transitions).map(([term, countStr]) => ({
			term,
			count: parseInt(countStr) || 0
		}));

		// Calculate total for probability normalization
		const total = entries.reduce((sum, e) => sum + e.count, 0);
		if (total === 0) return [];

		// Sort by frequency, take top K
		entries.sort((a, b) => b.count - a.count);

		return entries.slice(0, topK).map((e) => ({
			id: e.term,
			probability: e.count / total
		}));
	} catch {
		return [];
	}
}

/**
 * Update bigram transition counts from a query token sequence.
 * For each consecutive pair (a, b), increments the a → b transition count.
 *
 * @param userId - User ID for personalized transitions
 * @param tokens - Tokenized query terms
 */
export async function updateTransitions(
	userId: string,
	tokens: string[]
): Promise<boolean> {
	if (!tokens || tokens.length < 2) return false;

	try {
		const redis = getRedis();
		const normalized = tokens.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 1);

		for (let i = 0; i < normalized.length - 1; i++) {
			const from = normalized[i];
			const to = normalized[i + 1];

			// Update user-specific transitions
			const userKey = `${REDIS_PREFIX}:${userId}:${from}`;
			await redis.hincrby(userKey, to, 1);
			await redis.expire(userKey, 30 * 24 * 60 * 60); // 30-day TTL

			// Also update global transitions
			const globalKey = `${REDIS_PREFIX}:global:${from}`;
			await redis.hincrby(globalKey, to, 1);
			await redis.expire(globalKey, 90 * 24 * 60 * 60); // 90-day TTL

			// Enforce max transitions per key
			const userLen = await redis.hlen(userKey);
			if (userLen > MAX_TRANSITIONS) {
				// Prune least frequent entries
				const all = await redis.hgetall(userKey);
				const sorted = Object.entries(all)
					.map(([k, v]) => ({ k, v: parseInt(v) }))
					.sort((a, b) => a.v - b.v);
				const toRemove = sorted.slice(0, sorted.length - MAX_TRANSITIONS);
				if (toRemove.length > 0) {
					await redis.hdel(userKey, ...toRemove.map((e) => e.k));
				}
			}
		}

		return true;
	} catch (err) {
		console.warn('[HMM] Failed to update transitions:', err);
		return false;
	}
}

/**
 * Build transition summary for analytics/debugging.
 * Returns top transitions from the most frequent starting tokens.
 */
export async function getTransitionSummary(
	userId: string,
	limit: number = 10
): Promise<Array<{ from: string; topNext: Array<{ term: string; count: number }> }>> {
	try {
		const redis = getRedis();
		const pattern = `${REDIS_PREFIX}:${userId}:*`;
		const keys = await redis.keys(pattern);

		const results: Array<{
			from: string;
			topNext: Array<{ term: string; count: number }>;
		}> = [];

		for (const key of keys.slice(0, limit)) {
			const from = key.split(':').pop() ?? '';
			const transitions = await redis.hgetall(key);
			const topNext = Object.entries(transitions)
				.map(([term, count]) => ({ term, count: parseInt(count) }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 5);

			if (topNext.length > 0) {
				results.push({ from, topNext });
			}
		}

		return results.sort((a, b) => {
			const aTotal = a.topNext.reduce((s, t) => s + t.count, 0);
			const bTotal = b.topNext.reduce((s, t) => s + t.count, 0);
			return bTotal - aTotal;
		});
	} catch {
		return [];
	}
}

export default { predictNextContext, updateTransitions, getTransitionSummary };
