/**
 * GET /api/metrics/retrieval — Retrieval lane performance dashboard
 *
 * Query params:
 *   - branch: 'turbovec-enabled' | 'qdrant-only' | 'karpathy-blend' (optional, defaults to all)
 *   - hours: 1 | 24 | 72 (default 24)
 *
 * Response: Latency percentiles (P50/P95/P99) + accuracy metrics (recall/MRR/NDCG)
 */

import type { RequestHandler } from './$types';
import { getRetrievalMetricsSummary } from '$lib/server/telemetry/retrieval-metrics.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const branch = url.searchParams.get('branch') || undefined;
    const hoursStr = url.searchParams.get('hours') || '24';
    const hours = Math.max(1, Math.min(72, parseInt(hoursStr, 10)));

    const summary = await getRetrievalMetricsSummary(branch, hours);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[/api/metrics/retrieval] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
