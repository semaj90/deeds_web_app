/**
 * GET /api/analytics/mirror-health
 *
 * Diagnostic endpoint for the Postgres ↔ Qdrant manifold4/som_cluster mirror.
 *
 * Returns:
 *   - postgres.total             — total rows in research_summaries
 *   - postgres.withManifold4     — rows with non-null manifold4 (Postgres durable truth)
 *   - qdrant.totalPoints         — total points in research_summaries Qdrant collection
 *   - qdrant.withSomCluster      — points with som_cluster payload field set
 *   - mismatch                   — |postgres.withManifold4 - qdrant.withSomCluster|
 *   - mirrorHealth               — 'ok' | 'stale' | 'empty' | 'unknown'
 *
 * Auth: admin only (locals.user required).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = {
    postgres: { total: 0, withManifold4: 0 },
    qdrant: { totalPoints: 0, withSomCluster: 0 },
    mismatch: 0,
    mirrorHealth: 'unknown' as 'ok' | 'stale' | 'empty' | 'unknown',
    checkedAt: new Date().toISOString(),
  };

  // ── Postgres: count research_summaries ─────────────────────────────────
  try {
    const { pool } = await import('$lib/server/db/client');
    const pgRes = await pool.query(
      `SELECT
         COUNT(*)                                  AS total,
         COUNT(manifold4)                          AS with_manifold4
       FROM research_summaries`
    );
    const row = pgRes.rows[0];
    result.postgres.total = Number(row?.total ?? 0);
    result.postgres.withManifold4 = Number(row?.with_manifold4 ?? 0);
  } catch (err) {
    console.warn('[mirror-health] Postgres query failed:', (err as Error).message);
  }

  // ── Qdrant: count research_summaries collection ────────────────────────
  try {
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');

    // Total point count
    const info = await qdrantMgr.client.getCollection('research_summaries').catch(() => null);
    result.qdrant.totalPoints = info?.points_count ?? 0;

    // Points with som_cluster payload set (non-null, non-zero-exclusive)
    const countRes = await qdrantMgr.client
      .count('research_summaries', {
        filter: {
          must: [
            {
              key: 'som_cluster',
              range: { gte: 0 },
            },
          ],
        },
        exact: false, // approximate is fine for diagnostics
      })
      .catch(() => null);
    result.qdrant.withSomCluster = countRes?.count ?? 0;
  } catch (err) {
    console.warn('[mirror-health] Qdrant query failed:', (err as Error).message);
  }

  // ── Derive mismatch + health status ───────────────────────────────────
  result.mismatch = Math.abs(result.postgres.withManifold4 - result.qdrant.withSomCluster);

  if (result.postgres.withManifold4 === 0 && result.qdrant.withSomCluster === 0) {
    result.mirrorHealth = 'empty';
  } else {
    const mismatchRatio =
      result.postgres.withManifold4 > 0
        ? result.mismatch / result.postgres.withManifold4
        : 1;
    result.mirrorHealth = mismatchRatio < 0.05 ? 'ok' : 'stale';
  }

  return json(result);
};