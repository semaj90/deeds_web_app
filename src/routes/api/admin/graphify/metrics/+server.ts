import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis';

export const GET: RequestHandler = async ({ locals }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const redis = getRedis();
    const metricsKey = 'graphify:daily:metrics';
    const metricsJson = await redis.get(metricsKey);

    if (!metricsJson) {
      return json({
        last_run: 'never',
        duration_seconds: 0,
        successful_stages: 0,
        failed_stages: 0,
        cache_hit_rate: 0,
        packets_processed: 0,
      });
    }

    const metrics = JSON.parse(metricsJson);

    // Fetch cache stats
    const cacheStatsKey = 'bifrost:cache:stats';
    const cacheStatsJson = await redis.get(cacheStatsKey);
    const cacheStats = cacheStatsJson ? JSON.parse(cacheStatsJson) : { hits: 0, total: 0 };
    const cacheHitRate = cacheStats.total > 0 ? ((cacheStats.hits / cacheStats.total) * 100).toFixed(2) : '0.00';

    return json({
      last_run: metrics.last_run,
      duration_seconds: metrics.duration_seconds,
      successful_stages: metrics.successful_stages,
      failed_stages: metrics.failed_stages,
      cache_hit_rate: parseFloat(cacheHitRate),
      packets_processed: metrics.packets_processed || 0,
    });
  } catch (err) {
    console.error('[Admin Graphify Metrics] Error:', err);
    return json(
      {
        last_run: 'error',
        duration_seconds: 0,
        successful_stages: 0,
        failed_stages: 0,
        cache_hit_rate: 0,
        packets_processed: 0,
      },
      { status: 500 }
    );
  }
};
