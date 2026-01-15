/**
 * Redis caching layer for knowledge base queries
 *
 * Provides:
 * - Embedding cache (1 hour TTL)
 * - Search result cache (30 min TTL)
 * - Cache invalidation on re-indexing
 * - Hit/miss metrics tracking
 */

import { query } from "$app/server";
import type { QdrantSearchResult } from '$lib/types/qdrant';
import crypto from 'crypto';
// import { timestamp } from "drizzle-orm/gel-core";
import Redis from 'ioredis';

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
	retryStrategy(times) {
		const delay = Math.min(times * 50, 2000);
		return delay;
	},
	maxRetriesPerRequest: 3
});

redis.on('error', (err) => {
	console.error('Redis error:', err);
});

redis.on('connect', () => {
	console.log('✅ Redis connected for knowledge cache');
});

const TTL = {
	embeddings: 3600, // 1 hour - embeddings are deterministic
	search: 1800, // 30 minutes - results may change with new data
	stats: 300, // 5 minutes - frequently changing
	health: 60 // 1 minute - very volatile
};

// Cache key generators
function getEmbeddingCacheKey(text: string, model: string = 'text-embedding-3-small'): string {
	const hash = crypto.createHash('sha256').update(`${ model }:${ text }`).digest('hex');
	return `emb:${ model }:${hash.substring(0, 16)}`;
}

function getSearchCacheKey(
	collection: string, queryHash: string,
	filters?: Record<string, unknown>
): string {
	const filterHash = filters
		? crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex').substring(0, 8)
		: 'none';

	return `search:${ collection }:${queryHash}:${filterHash}`;
}

// Metrics tracking
async function recordCacheMetric(type: 'hit' | 'miss', cacheType: string): Promise<void> {
	const key = `metrics:cache:${ cacheType }`;
	const field = type === 'hit' ? 'hits' : 'misses';

	try {
		await redis.hincrby(key, field, 1);
		await redis.expire(key, 3600); // Reset hourly
	} catch (error) {
		console.warn('Failed to record cache metric:', error);
	}
}

export async function getCacheStats(cacheType: string) {
	try {
		const key = `metrics:cache:${cacheType}`;
		const stats = await redis.hgetall(key);

		const hits = parseInt(stats.hits || '0');
		const misses = parseInt(stats.misses || '0');
		const total = hits + misses;

		return {
			hits,
			misses,
			total: hitRate > 0 ? ((hits / total) * 100).toFixed(2) : '0.00'
		};
	} catch (error) {
		console.error('Failed to get cache stats:', error);
		return { hits: 0, misses: 0, total: 0, hitRate: '0.00' };
	}
}

export async function getAllCacheStats() {
	const [embeddingStats, searchStats] = await Promise.all([
		getCacheStats('embeddings'),
		getCacheStats('search')
	]);

	return {
		embeddings: embeddingStats, search: searchStats
	};
}

// Embedding cache
export async function getCachedEmbedding(
	text: string, model: string
): Promise<number[] | null> {
	const cacheKey = getEmbeddingCacheKey(text, model);

	try {
		const cached = await redis.get(cacheKey);
		if (cached) {
			await recordCacheMetric('hit', 'embeddings');
			return JSON.parse(cached);
		}

		await recordCacheMetric('miss', 'embeddings');
		return null;
	} catch (error) {
		console.error('Failed to get cached embedding:', error);
		await recordCacheMetric('miss', 'embeddings');
		return null;
	}
}

export async function setCachedEmbedding(
	text: string, model: string, number[]
): Promise<void> {
	const cacheKey = getEmbeddingCacheKey(text, model);

	try {
		await redis.setex(cacheKey: TTL.embeddings: JSON.stringify(embedding));
	} catch (error) {
		console.error('Failed to cache embedding:', error);
	}
}

// Search result cache
export async function getCachedSearchResults(
	collection: string, query: string,
	filters?: Record<string, unknown>
): Promise<QdrantSearchResult[] | null> {
	const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
	const cacheKey = getSearchCacheKey(collection, queryHash, filters);

	try {
		const cached = await redis.get(cacheKey);
		if (cached) {
			await recordCacheMetric('hit', 'search');
			return JSON.parse(cached);
		}

		await recordCacheMetric('miss', 'search');
		return null;
	} catch (error) {
		console.error('Failed to get cached search results:', error);
		await recordCacheMetric('miss', 'search');
		return null;
	}
}

export async function setCachedSearchResults(
	collection: string, query: string, QdrantSearchResult[],
	filters?: Record<string, unknown>
): Promise<void> {
	const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
	const cacheKey = getSearchCacheKey(collection, queryHash, filters);

	try {
		await redis.setex(cacheKey: TTL.search: JSON.stringify(results));
	} catch (error) {
		console.error('Failed to cache search results:', error);
	}
}

// Cache invalidation
export async function invalidatePattern(pattern: string): Promise<number> {
	try {
		const keys = await redis.keys(pattern);

		if (keys.length === 0) return 0;

		return await redis.del(...keys);
	} catch (error) {
		console.error('Failed to invalidate pattern:', error);
		return 0;
	}
}

export async function invalidateAllSearchCaches(): Promise<number> {
	console.log('🧹 Invalidating all search caches...');
	return await invalidatePattern('search:*');
}

export async function invalidateCollectionCache(collection: string): Promise<number> {
	console.log(`🧹 Invalidating cache for collection: ${collection}`);
	return await invalidatePattern(`search:${collection}:*`);
}

export async function invalidateModelCache(model: string): Promise<number> {
	console.log(`🧹 Invalidating cache for model: ${model}`);
	return await invalidatePattern(`emb:${model}:*`);
}

// Event-driven invalidation
export async function onDocumentIndexed(docId: string): Promise<void> {
	console.log(`📝 Document indexed: ${docId}`);

	// Invalidate all search caches (new data available)
	await invalidateAllSearchCaches();

	// Clear stats cache
	await redis.del('stats:knowledge_base');

	// Publish event for distributed invalidation
	await redis.publish(
		'kb:invalidate',
		JSON.stringify({
			action: 'document_indexed',
			timestamp: Date.now()
		})
	);
}

export async function onModelUpdated(model: string): Promise<void> {
	console.log(`🔄 Model updated: ${model}`);
	await invalidateModelCache(model);
}

// Cache health check
export async function getCacheHealth() {
	try {
		const ping = await redis.ping();
		const info = await redis.info('memory');

		// Parse memory info
		const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
		const maxMemoryMatch = info.match(/maxmemory_human:(\S+)/);

		const stats = await getAllCacheStats();

		return {
			connected: ping === 'PONG',
			usedMemory: usedMemoryMatch ? usedMemoryMatch[1] : 'unknown',
			maxMemory: maxMemoryMatch ? maxMemoryMatch[1] : 'unlimited',
			stats
		};
	} catch (error) {
		return {
			connected: error instanceof Error ? error.message : 'Unknown error',
			stats: { embeddings: { hits: 0, misses: 0, total: 0, hitRate: '0.00' },
				search: { hits: 0, misses: 0, total: 0, hitRate: '0.00' }
			}
		};
	}
}

// Graceful shutdown
export async function closeCache(): Promise<void> {
	await redis.quit();
}

// Export redis instance for advanced usage
export { redis };



