/**
 * Cache Statistics API
 * GET /api/cache/stats
 *
 * Returns comprehensive statistics for all cache layers:
 * - Redis (connection, memory, key patterns)
 * - Template Cache (metadata, AI content, rendered)
 * - Export Cache (report exports - HTML, Markdown, JSON)
 * - LLM Response Cache (hits, misses, hit rate)
 * - Memory Cache (size, TTL, hit rate)
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { redisPool } from '$lib/server/redis.js';
import { getTemplateCacheStats } from '$lib/server/cache/report-template-cache.js';
import { getExportCacheStats } from '$lib/server/cache/pdf-export-cache.js';
// redis-metrics module removed — inline fallback below

export const GET: RequestHandler = async () => {
	try {
		const redis = redisPool.getConnection();

		// Redis stats
		const [
			infoMemory,
			infoStats,
			infoServer,
			dbsize,
			templateStats,
			exportStats
		] = await Promise.all([
			redis.info('memory'),
			redis.info('stats'),
			redis.info('server'),
			redis.dbsize(),
			getTemplateCacheStats(),
			getExportCacheStats()
		]);

		// Parse Redis INFO output
		const parseInfo = (info: string): Record<string, string> => {
			const lines = info.split('\r\n');
			const result: Record<string, string> = {};
			for (const line of lines) {
				if (line && !line.startsWith('#')) {
					const [key, value] = line.split(':');
					if (key && value) result[key] = value;
				}
			}
			return result;
		};

		const memInfo = parseInfo(infoMemory);
		const statsInfo = parseInfo(infoStats);
		const serverInfo = parseInfo(infoServer);

		// Get key pattern counts
		const keyPatterns = await Promise.all([
			redis.keys('template:*').then(keys => ({ pattern: 'template:*', count: keys.length })),
			redis.keys('llm:response:*').then(keys => ({ pattern: 'llm:response:*', count: keys.length })),
			redis.keys('case:*').then(keys => ({ pattern: 'case:*', count: keys.length })),
			redis.keys('evidence:*').then(keys => ({ pattern: 'evidence:*', count: keys.length })),
			redis.keys('report:*').then(keys => ({ pattern: 'report:*', count: keys.length })),
			redis.keys('user:*').then(keys => ({ pattern: 'user:*', count: keys.length })),
		]);

		// LLM response cache stats
		const llmKeys = await redis.keys('llm:response:*');
		const llmHits = parseInt(statsInfo.keyspace_hits || '0', 10);
		const llmMisses = parseInt(statsInfo.keyspace_misses || '0', 10);
		const llmTotal = llmHits + llmMisses;
		const llmHitRate = llmTotal > 0 ? (llmHits / llmTotal) * 100 : 0;

		// Inline metrics (redis-metrics module was removed)
		const metricsInsights = {
			overall: { hitRate: `${llmHitRate.toFixed(1)}%`, totalRequests: llmTotal, hits: llmHits, misses: llmMisses, errors: 0, errorRate: '0%' },
			performance: { averageGetTime: 'N/A', averageSetTime: 'N/A' },
			topPatterns: keyPatterns.filter(p => p.count > 0).map(p => ({ pattern: p.pattern, count: p.count })),
			recommendations: []
		};

		return json({
			success: true,
			data: {
				redis: {
					connected: true,
					totalKeys: dbsize,
					memoryUsed: parseInt(memInfo.used_memory || '0', 10),
					memoryPeak: parseInt(memInfo.used_memory_peak || '0', 10),
					uptimeMs: parseInt(serverInfo.uptime_in_seconds || '0', 10) * 1000,
					connectedClients: parseInt(statsInfo.connected_clients || '1', 10),
					keyPatterns
				},
				template: templateStats,
				export: exportStats,
				llm: {
					totalResponses: llmKeys.length,
					hits: llmHits,
					misses: llmMisses,
					hitRate: llmHitRate
				},
				memory: {
					size: dbsize,
					estimatedSize: parseInt(memInfo.used_memory || '0', 10),
					defaultTTL: 300_000,
					hitRate: llmHitRate
				},
				metrics: metricsInsights
			}
		});
	} catch (err) {
		console.error('[CacheStats] Error:', err);
		return json({
			success: false,
			error: 'Failed to fetch cache statistics',
			data: {
				redis: {
					connected: false,
					totalKeys: 0,
					memoryUsed: 0,
					memoryPeak: 0,
					uptimeMs: 0,
					connectedClients: 0,
					keyPatterns: []
				},
				template: {
					totalKeys: 0,
					metadataKeys: 0,
					aiContentKeys: 0,
					renderedKeys: 0
				},
				export: {
					totalKeys: 0,
					formats: {},
					totalSizeBytes: 0,
					oldestExport: null,
					newestExport: null
				},
				llm: {
					totalResponses: 0,
					hits: 0,
					misses: 0,
					hitRate: 0
				},
				memory: {
					size: 0,
					estimatedSize: 0,
					defaultTTL: 300_000,
					hitRate: 0
				},
				metrics: {
					overall: { hitRate: '0%', totalRequests: 0, hits: 0, misses: 0, errors: 0, errorRate: '0%' },
					performance: { averageGetTime: '0ms', averageSetTime: '0ms' },
					topPatterns: [],
					recommendations: []
				}
			}
		}, { status: 500 });
	}
};
