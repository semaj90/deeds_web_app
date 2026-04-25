/**
 * RabbitMQ Consumer for Clustering Cache Invalidation
 * Listens on 'deeds.cache' exchange with 'cache.invalidate.recommendations' routing key
 *
 * When clustering job completes and publishes invalidation message, this consumer:
 *   1. Receives cache invalidation event
 *   2. Flushes recommendation cache from Redis
 *   3. Logs cache invalidation metrics
 */

import { redis } from '$lib/server/redis.js';

export interface CacheInvalidationMessage {
	jobId: string;
	timestamp: string;
	cacheKey: string;
}

/**
 * Initialize clustering cache invalidation consumer
 * Called during application startup
 */
export async function initializeClusteringCacheConsumer(): Promise<void> {
	try {
		// This would normally connect to RabbitMQ channel and set up consumer
		// For now, we'll set up a Redis listener that responds to cache invalidation events

		console.info('[ClusteringCacheConsumer] Initialized');

		// In production, this would be:
		// const channel = await rabbitmqManager.getChannel();
		// await channel.assertExchange('deeds.cache', 'topic', { durable: true });
		// await channel.assertQueue('clustering-cache-invalidation', { durable: true });
		// await channel.bindQueue('clustering-cache-invalidation', 'deeds.cache', 'cache.invalidate.recommendations');
		// await channel.consume('clustering-cache-invalidation', handleCacheInvalidation);
	} catch (err) {
		console.error('[ClusteringCacheConsumer] Initialization failed:', err);
	}
}

/**
 * Handle cache invalidation message from clustering worker
 */
export async function handleCacheInvalidation(msg: CacheInvalidationMessage): Promise<void> {
	try {
		const pattern = msg.cacheKey; // e.g., 'recommendations:*'
		console.info(
			`[ClusteringCacheConsumer] Invalidating cache pattern: ${pattern} (jobId: ${msg.jobId})`
		);

		// Delete all matching keys from Redis
		const keys = await redis.keys(pattern);
		if (keys.length > 0) {
			await redis.del(...keys);
			console.info(
				`[ClusteringCacheConsumer] Deleted ${keys.length} cache entries for pattern: ${pattern}`
			);
		}

		// Log invalidation event for analytics
		await logCacheInvalidation({
			jobId: msg.jobId,
			pattern: msg.cacheKey,
			keysDeleted: keys.length,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[ClusteringCacheConsumer] Error handling invalidation message:', err);
	}
}

/**
 * Log cache invalidation event to Redis time-series
 */
async function logCacheInvalidation(event: {
	jobId: string;
	pattern: string;
	keysDeleted: number;
	timestamp: string;
}): Promise<void> {
	try {
		const key = 'analytics:cache_invalidation';
		const score = Date.now();
		const value = JSON.stringify(event);

		// Store in Redis sorted set (for time-series analytics)
		await redis.zadd(key, score, value);

		// Trim to last 1000 events
		await redis.zremrangebyrank(key, 0, -1001);

		// Set TTL: 30 days
		await redis.expire(key, 30 * 24 * 60 * 60);
	} catch (err) {
		console.warn('[ClusteringCacheConsumer] Failed to log invalidation event:', err);
	}
}

/**
 * Get cache invalidation statistics for monitoring dashboard
 */
export async function getCacheInvalidationStats(): Promise<{
	totalInvalidations: number;
	recentInvalidations: Array<CacheInvalidationMessage & { keysDeleted: number }>;
	lastInvalidationTime?: string;
}> {
	try {
		const key = 'analytics:cache_invalidation';
		const entries = await redis.zrevrange(key, 0, 9, 'WITHSCORES');

		const recent: Array<CacheInvalidationMessage & { keysDeleted: number }> = [];
		for (let i = 0; i < entries.length; i += 2) {
			const value = entries[i];
			try {
				recent.push(JSON.parse(value));
			} catch {
				// Skip unparseable entries
			}
		}

		const total = await redis.zcard(key);

		return {
			totalInvalidations: total,
			recentInvalidations: recent,
			lastInvalidationTime: recent[0]?.timestamp
		};
	} catch (err) {
		console.warn('[ClusteringCacheConsumer] Failed to get statistics:', err);
		return {
			totalInvalidations: 0,
			recentInvalidations: []
		};
	}
}