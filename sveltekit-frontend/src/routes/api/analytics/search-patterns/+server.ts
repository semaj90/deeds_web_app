/**
 * GET /api/analytics/search-patterns
 *
 * Returns hot queries, cluster heat map, Bifrost hit rate, and top variance pairs.
 * Powers the admin "Search Intelligence" dashboard and predictive to-do generation.
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHotQueries, getClusterHeatMap } from '$lib/server/analytics/search-analytics.js';
import { pgRows } from '$lib/server/db/client';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const days = Math.min(Number(url.searchParams.get('days') ?? 7), 30);

  const [hotQueries, clusterHeat, variancePairs, qlораStats] = await Promise.all([
    getHotQueries(20).catch(() => []),
    getClusterHeatMap(days).catch(() => []),
    pgRows<{ query_a: string; query_b: string; similarity: number; hit_count: number }>(
      `SELECT query_a, query_b, similarity, hit_count
       FROM   query_variance_pairs
       ORDER  BY hit_count DESC
       LIMIT  20`
    ).catch(() => []),
    pgRows<{ quality_tier: string; cnt: number; avg_score: number }>(
      `SELECT quality_tier, COUNT(*)::int AS cnt, AVG(response_score)::real AS avg_score
       FROM   qlora_examples
       GROUP  BY quality_tier`
    ).catch(() => []),
  ]);

  return json({
    hotQueries,
    clusterHeat,
    variancePairs,
    qlораStats,
    windowDays: days,
  });
};