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

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import IORedis, { type Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { getTemplateCacheStats } from '$lib/server/cache/report-template-cache.js';
import { getExportCacheStats } from '$lib/server/cache/pdf-export-cache.js';
// redis-metrics module removed — inline fallback below

/** Count keys matching a pattern using SCAN (non-blocking, unlike KEYS) */
async function scanCount(redis: Redis, pattern: string): Promise<number> {
	let count = 0;
	let cursor = '0';
	do {
		const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
		cursor = next;
		count += keys.length;
	} while (cursor !== '0');
	return count;
}

export const GET: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	// Pattern-count fast path — `?pattern=turbo:*` returns just { count, pattern }
	// Allowed prefixes match the invalidation cascade so the admin pipeline panel
	// can display live key counts without a full stats dump.
	const patternParam = url.searchParams.get('pattern');
	if (patternParam) {
		const ALLOWED_COUNT_PREFIXES = [
			'turbo:',
			'summary:cluster:',
			'research_bundle:',
			'kb_bundle:',
			'graph:case:',
			'rag:search',
			'llm:semantic:',
			'wiki:',
			'embed:',
			'template:',
			'case:',
			'evidence:',
			'report:',
			'user:'
		];
		if (!ALLOWED_COUNT_PREFIXES.some((p) => patternParam.startsWith(p))) {
			return json({ error: 'Pattern prefix not allowed' }, { status: 400 });
		}
		try {
			let count: number;
			try {
				count = await scanCount(getRedis(), patternParam);
			} catch (innerErr) {
				// Pool connection may have gone stale (e.g., Docker restart).
				// One-shot retry with a fresh ioredis client bypasses the pool.
				const msg = String(innerErr);
				if (/closed|ECONNRESET|ENOTFOUND/i.test(msg)) {
					// D16: `await using` auto-disconnects on scope exit (even on throw)
					const { attachDispose } = await import('$lib/server/redis-disposable.js');
					await using fresh = attachDispose(new IORedis(ENV.REDIS_URL, {
						maxRetriesPerRequest: 1,
						connectTimeout: 3000,
						lazyConnect: false
					}));
					count = await scanCount(fresh, patternParam);
				} else {
					throw innerErr;
				}
			}
			return json({ success: true, pattern: patternParam, count });
		} catch (err) {
			return json(
				{ success: false, pattern: patternParam, count: 0, error: String(err) },
				{ status: 200 } // degraded shape, same keys
			);
		}
	}

	try {
		const redis: Redis = getRedis();

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

		// Get key pattern counts using SCAN (non-blocking)
		const patterns = ['template:*', 'llm:response:*', 'case:*', 'evidence:*', 'report:*', 'user:*'];
		const counts = await Promise.all(patterns.map(p => scanCount(redis, p)));
		const keyPatterns = patterns.map((pattern, i) => ({ pattern, count: counts[i] }));

		// LLM response cache stats (reuse count from above)
		const llmKeyCount = counts[1];
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

		const responseData = {
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
					totalResponses: llmKeyCount,
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
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('[CacheStats] Error:', err);
		const fallbackData = {
      success: false,
      degraded: true,
      data: {
        redis: {
          connected: false,
          totalKeys: 0,
          memoryUsed: 0,
          memoryPeak: 0,
          uptimeMs: 0,
          connectedClients: 0,
          keyPatterns: [],
        },
        template: {
          totalKeys: 0,
          metadataKeys: 0,
          aiContentKeys: 0,
          renderedKeys: 0,
        },
        export: {
          totalKeys: 0,
          formats: {},
          totalSizeBytes: 0,
          oldestExport: null,
          newestExport: null,
        },
        llm: {
          totalResponses: 0,
          hits: 0,
          misses: 0,
          hitRate: 0,
        },
        memory: {
          size: 0,
          estimatedSize: 0,
          defaultTTL: 300_000,
          hitRate: 0,
        },
        metrics: {
          overall: {
            hitRate: '0%',
            totalRequests: 0,
            hits: 0,
            misses: 0,
            errors: 0,
            errorRate: '0%',
          },
          performance: { averageGetTime: '0ms', averageSetTime: '0ms' },
          topPatterns: [],
          recommendations: [],
        },
      },
    };
		return json(fallbackData, {
			headers: cacheControl.short
		});
	}
};
