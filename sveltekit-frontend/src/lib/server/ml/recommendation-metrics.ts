/**
 * Recommendation Metrics Tracking
 * Records and aggregates recommendation performance for A/B testing + analytics
 *
 * Metrics tracked:
 *   - CTR (Click-Through Rate): clicks / impressions
 *   - Dwell Time: average seconds spent viewing recommendations
 *   - Diversity Score: topic distribution entropy across served recommendations
 *   - Coverage: percentage of unique documents recommended
 *   - Freshness: average age of recommended documents
 *
 * Storage: Redis sorted sets + hash maps for time-series aggregation
 *
 * Usage:
 *   const metrics = new RecommendationMetrics();
 *   await metrics.recordImpression(userId, docIds);
 *   await metrics.recordClick(userId, docId);
 *   const summary = await metrics.getSummary('24h');
 */

import { redis } from '$lib/server/redis.js';

export interface MetricsSummary {
	period: string;
	impressions: number;
	clicks: number;
	ctr: number; // Click-Through Rate [0, 1]
	avgDwellTimeSeconds: number;
	diversityScore: number; // Shannon entropy [0, 1]
	coveragePercent: number; // Unique docs served / total docs
	topTopics: Array<{ topicId: number; count: number; percentage: number }>;
	topDocuments: Array<{ documentId: string; impressions: number; clicks: number; ctr: number }>;
	timestamp: string;
}

export interface ABTestConfig {
	testId: string;
	variant: 'control' | 'treatment';
	weights: {
		vectorSimilarity: number;
		tagOverlap: number;
		topicAffinity: number;
		graphCentrality: number;
		profileMatch: number;
	};
}

const REDIS_PREFIX = 'rec_metrics';
const DEFAULT_TTL = 30 * 24 * 60 * 60; // 30 days

export class RecommendationMetrics {
	/**
	 * Record impression event (recommendations shown to user)
	 */
	async recordImpression(
		userId: string,
		documentIds: string[],
		topicIds: number[]
	): Promise<void> {
		try {
			const timestamp = Date.now();
			const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

			// Increment daily impression count
			await redis.hincrby(`${REDIS_PREFIX}:daily:${dayKey}`, 'impressions', documentIds.length);

			// Track per-document impressions
			for (const docId of documentIds) {
				await redis.hincrby(`${REDIS_PREFIX}:doc:${docId}`, 'impressions', 1);
			}

			// Track per-topic impressions
			for (const topicId of topicIds) {
				await redis.hincrby(`${REDIS_PREFIX}:topic:${dayKey}`, String(topicId), 1);
			}

			// Record in time-series
			await redis.zadd(
				`${REDIS_PREFIX}:impressions:ts`,
				timestamp,
				JSON.stringify({ userId, documentIds, topicIds, timestamp })
			);

			// Set TTL
			await redis.expire(`${REDIS_PREFIX}:daily:${dayKey}`, DEFAULT_TTL);
			await redis.expire(`${REDIS_PREFIX}:topic:${dayKey}`, DEFAULT_TTL);
			await redis.expire(`${REDIS_PREFIX}:impressions:ts`, DEFAULT_TTL);
		} catch (err) {
			console.warn('[RecMetrics] Failed to record impression:', err);
		}
	}

	/**
	 * Record click event (user clicked a recommendation)
	 */
	async recordClick(userId: string, documentId: string): Promise<void> {
		try {
			const dayKey = new Date().toISOString().slice(0, 10);

			await redis.hincrby(`${REDIS_PREFIX}:daily:${dayKey}`, 'clicks', 1);
			await redis.hincrby(`${REDIS_PREFIX}:doc:${documentId}`, 'clicks', 1);

			await redis.zadd(
				`${REDIS_PREFIX}:clicks:ts`,
				Date.now(),
				JSON.stringify({ userId, documentId, timestamp: Date.now() })
			);

			await redis.expire(`${REDIS_PREFIX}:daily:${dayKey}`, DEFAULT_TTL);
			await redis.expire(`${REDIS_PREFIX}:clicks:ts`, DEFAULT_TTL);
		} catch (err) {
			console.warn('[RecMetrics] Failed to record click:', err);
		}
	}

	/**
	 * Record dwell time (seconds user spent viewing a recommendation)
	 */
	async recordDwellTime(userId: string, documentId: string, seconds: number): Promise<void> {
		try {
			const dayKey = new Date().toISOString().slice(0, 10);

			// Store dwell times in a list for averaging
			await redis.rpush(
				`${REDIS_PREFIX}:dwell:${dayKey}`,
				String(seconds)
			);
			await redis.expire(`${REDIS_PREFIX}:dwell:${dayKey}`, DEFAULT_TTL);
		} catch (err) {
			console.warn('[RecMetrics] Failed to record dwell time:', err);
		}
	}

	/**
	 * Get metrics summary for a time period
	 */
	async getSummary(period: '24h' | '7d' | '30d' = '24h'): Promise<MetricsSummary> {
		try {
			const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
			let totalImpressions = 0;
			let totalClicks = 0;
			const dwellTimes: number[] = [];
			const topicCounts = new Map<number, number>();

			// Aggregate across days
			for (let i = 0; i < days; i++) {
				const date = new Date();
				date.setDate(date.getDate() - i);
				const dayKey = date.toISOString().slice(0, 10);

				const daily = await redis.hgetall(`${REDIS_PREFIX}:daily:${dayKey}`);
				totalImpressions += parseInt(daily.impressions || '0');
				totalClicks += parseInt(daily.clicks || '0');

				// Dwell times
				const dwells = await redis.lrange(`${REDIS_PREFIX}:dwell:${dayKey}`, 0, -1);
				for (const d of dwells) {
					dwellTimes.push(parseFloat(d));
				}

				// Topic distribution
				const topics = await redis.hgetall(`${REDIS_PREFIX}:topic:${dayKey}`);
				for (const [topicId, count] of Object.entries(topics)) {
					const tid = parseInt(topicId);
					topicCounts.set(tid, (topicCounts.get(tid) ?? 0) + parseInt(count));
				}
			}

			// Compute CTR
			const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

			// Compute average dwell time
			const avgDwellTimeSeconds =
				dwellTimes.length > 0
					? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length
					: 0;

			// Compute topic diversity (Shannon entropy normalized to [0, 1])
			const totalTopicImpressions = Array.from(topicCounts.values()).reduce((a, b) => a + b, 0);
			let entropy = 0;
			if (totalTopicImpressions > 0) {
				for (const count of topicCounts.values()) {
					const p = count / totalTopicImpressions;
					if (p > 0) entropy -= p * Math.log2(p);
				}
				// Normalize by log2(15) for k=15 clusters
				entropy /= Math.log2(15);
			}

			// Top topics
			const topTopics = Array.from(topicCounts.entries())
				.map(([topicId, count]) => ({
					topicId,
					count,
					percentage: totalTopicImpressions > 0 ? (count / totalTopicImpressions) * 100 : 0
				}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			return {
				period,
				impressions: totalImpressions,
				clicks: totalClicks,
				ctr,
				avgDwellTimeSeconds,
				diversityScore: entropy,
				coveragePercent: 0, // Would need total doc count
				topTopics,
				topDocuments: [], // Would need per-doc aggregation
				timestamp: new Date().toISOString()
			};
		} catch (err) {
			console.error('[RecMetrics] Failed to get summary:', err);
			return {
				period,
				impressions: 0,
				clicks: 0,
				ctr: 0,
				avgDwellTimeSeconds: 0,
				diversityScore: 0,
				coveragePercent: 0,
				topTopics: [],
				topDocuments: [],
				timestamp: new Date().toISOString()
			};
		}
	}
}

export const recommendationMetrics = new RecommendationMetrics();
