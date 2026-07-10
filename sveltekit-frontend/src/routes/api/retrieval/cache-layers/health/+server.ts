/**
 * GET /api/retrieval/cache-layers/health
 *
 * Read-only health check for cache layers 2-4.
 * No side effects, used by monitoring/telemetry only.
 *
 * Returns availability of:
 * - Layer 2: OpenCode adapter (port 8091)
 * - Layer 3: Valkey exact cache
 * - Layer 4: Valkey semantic cache
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkCacheLayersHealth } from '$lib/server/retrieval/cache-layers-orchestrator.js';

export const GET: RequestHandler = async () => {
  const start = performance.now();

  try {
    const health = await checkCacheLayersHealth();
    const latency = performance.now() - start;

    const allHealthy = Object.values(health).every((v) => v);

    return json({
      success: true,
      healthy: allHealthy,
      layers: {
        layer2_adapter: health.layer2_adapter ? 'UP' : 'DOWN',
        layer3_exact_cache: health.layer3_valkey ? 'UP' : 'DOWN',
        layer4_semantic_cache: health.layer4_valkey ? 'UP' : 'DOWN'
      },
      check_latency_ms: Math.round(latency),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[cache-layers-health] check failed:', error);
    return json(
      {
        success: false,
        healthy: false,
        error: String(error),
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
};
