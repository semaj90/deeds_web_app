/**
 * GET /api/admin/cache-stats
 *
 * Real-time LLM cache performance monitoring
 * AUTH REQUIRED: Admin only
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExactMatchStats } from '$lib/server/cache/redis-exact-match.js';
import { getRedis } from '$lib/server/redis.js';
import { degradedJson } from '$lib/server/api-response.js';

export const GET: RequestHandler = async ({ locals }) => {
	// Auth check
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const redis = getRedis();

		// L1 Redis stats
		const l1Stats = await getExactMatchStats();

		// Get all LLM cache keys
		const llmKeys = await redis.keys('llm:*');

		// Calculate hit rate from Redis INFO stats
		const statsInfo = await redis.info('stats');
		const hitsMatch = statsInfo.match(/keyspace_hits:(\d+)/);
		const missesMatch = statsInfo.match(/keyspace_misses:(\d+)/);

		const hits = parseInt(hitsMatch?.[1] ?? '0');
		const misses = parseInt(missesMatch?.[1] ?? '0');
		const total = hits + misses;
		const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';

		// Sample recent cache keys (first 10)
		const sampleKeys = llmKeys.slice(0, 10);
		const samples = await Promise.all(
			sampleKeys.map(async (key) => {
				const value = await redis.get(key);
				const ttl = await redis.ttl(key);
				return {
					key: key.replace('llm:', '').slice(0, 50) + '...',
					sizeBytes: value?.length ?? 0,
					ttlSeconds: ttl,
					expiresIn: ttl > 0 ? `${Math.floor(ttl / 60)}m ${ttl % 60}s` : 'expired',
				};
			})
		);

		// Memory info
		const memoryInfo = await redis.info('memory');
		const usedMemoryMatch = memoryInfo.match(/used_memory:(\d+)/);
		const usedMemoryBytes = parseInt(usedMemoryMatch?.[1] ?? '0');

		return json({
			success: true,
			timestamp: new Date().toISOString(),
			l1_redis: {
				totalKeys: l1Stats.totalKeys,
				llmCacheKeys: llmKeys.length,
				memoryMB: (l1Stats.memoryUsedBytes / (1024 * 1024)).toFixed(2),
				usedMemoryMB: (usedMemoryBytes / (1024 * 1024)).toFixed(2),
				hitRate: `${hitRate}%`,
				keyspaceHits: hits,
				keyspaceMisses: misses,
			},
			samples,
			performance: {
				expectedHitRate: '70-90% (production steady-state)',
				avgCacheLatency: '2-5ms',
				avgColdLatency: '3.2s (gemma3:270m)',
				speedup: '157-1,084×',
			},
			recommendations: getRecommendations(parseFloat(hitRate), llmKeys.length),
		});
	} catch (err) {
		console.error('[cache-stats] Error:', err);
		return degradedJson({
			success: false,
			timestamp: new Date().toISOString(),
			l1_redis: {
				totalKeys: 0,
				llmCacheKeys: 0,
				memoryMB: '0.00',
				usedMemoryMB: '0.00',
				hitRate: '0%',
				keyspaceHits: 0,
				keyspaceMisses: 0,
			},
			samples: [] as unknown[],
			performance: {
				expectedHitRate: 'N/A',
				avgCacheLatency: 'N/A',
				avgColdLatency: 'N/A',
				speedup: 'N/A',
			},
			recommendations: ['Cache stats unavailable — Redis may be offline'],
		});
	}
};

/**
 * Generate recommendations based on current cache performance
 */
function getRecommendations(hitRate: number, totalKeys: number): string[] {
	const recs: string[] = [];

	if (hitRate < 50) {
		recs.push('⚠️ Low hit rate - Consider running pre-warming script');
	}

	if (hitRate < 70 && totalKeys < 100) {
		recs.push('📊 Cache is still warming up - Hit rate will improve over time');
	}

	if (hitRate > 90) {
		recs.push('✅ Excellent hit rate - Cache is performing optimally');
	}

	if (totalKeys > 10000) {
		recs.push('💾 High key count - Monitor Redis memory usage');
	}

	if (totalKeys < 50) {
		recs.push('🔥 Run cache pre-warming script: node scripts/cache/prewarm-legal-cache.mjs');
	}

	return recs.length > 0 ? recs : ['✅ Cache performance is healthy'];
}
