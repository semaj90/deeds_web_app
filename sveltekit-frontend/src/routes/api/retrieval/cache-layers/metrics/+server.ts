/**
 * GET /api/retrieval/cache-layers/metrics
 *
 * Prometheus-compatible metrics endpoint for cache layers.
 * Returns aggregated decision counters, hit rates, and latency percentiles.
 *
 * Scraper: curl http://localhost:5173/api/retrieval/cache-layers/metrics
 */

import type { RequestHandler } from './$types';
import { getPrometheusMetrics } from '$lib/server/retrieval/cache-layers-telemetry.js';

export const GET: RequestHandler = async () => {
  try {
    const prometheusText = await getPrometheusMetrics();

    return new Response(prometheusText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('[cache-layers-metrics] Export failed:', error);

    return new Response(
      `# ERROR: Failed to export metrics\n# Error: ${String(error)}\n`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      }
    );
  }
};
