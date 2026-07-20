/**
 * ACP KV Cache Statistics endpoint
 * GET /api/acp/kv-cache-stats
 *
 * Monitor KV cache effectiveness across all llama-server requests
 * Used by dashboard + observability stack
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvCacheMonitor } from '$lib/server/ai/context-prompt-streamer.js';

export const GET: RequestHandler = async () => {
  const stats = kvCacheMonitor.getAllStats();

  // Aggregate stats
  const total = {
    totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
    totalContextTokens: stats.reduce((sum, s) => sum + s.contextTokens, 0),
    totalCachedTokens: stats.reduce((sum, s) => sum + s.cachedTokens, 0),
    totalNewTokens: stats.reduce((sum, s) => sum + s.newTokens, 0),
    averageCacheHitRate: stats.length > 0 ? stats.reduce((sum, s) => sum + s.cacheHitRate, 0) / stats.length : 0,
  };

  // Speedup estimate (tokens not re-evaluated)
  const estimatedSpeedup = total.totalCachedTokens > 0 ? (total.totalContextTokens / (total.totalNewTokens + 1)) * 10 : 1; // rough estimate

  return json({
    timestamp: new Date().toISOString(),
    status: 'operational',
    kvCacheEnabled: true,
    stats,
    aggregates: {
      ...total,
      estimatedSpeedup: `${(estimatedSpeedup * 100).toFixed(1)}%`,
      costSavings: `${((total.totalCachedTokens / (total.totalContextTokens + 1)) * 100).toFixed(1)}% of context re-computed`,
    },
    recommendation:
      total.averageCacheHitRate > 0.5
        ? 'KV cache is effective. Consider increasing cache_reuse window.'
        : 'KV cache hit rate is low. Verify cache_prompt is enabled and multi-turn patterns are consistent.',
  });
};
