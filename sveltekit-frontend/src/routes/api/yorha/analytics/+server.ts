import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const querySchema = z.object({
	period: z.enum(['7d', '30d', '90d']).default('30d')
});

/**
 * GET /api/yorha/analytics
 * Unified analytics dashboard data: case trends, evidence pipeline, error-brain, system health
 */
export const GET: RequestHandler = async ({ locals, url, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const period = parsed.success ? parsed.data.period : '30d';
	const intervalDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;

	// Parallel aggregation queries
	try {
    const [caseStats, evidenceStats, errorStats, poiStats, systemHealth] = await Promise.all([
      // Case trends
      db
        .execute(
          sql`
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE status IN ('open', 'active', 'investigating'))::int AS active,
				COUNT(*) FILTER (WHERE status = 'closed')::int AS closed,
				COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(days => ${intervalDays}))::int AS recent
			FROM cases
		`
        )
        .then((r) => (r.rows[0] ?? {}) as Record<string, number>)
        .catch(() => ({}) as Record<string, number>),

      // Evidence pipeline stats
      db
        .execute(
          sql`
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(days => ${intervalDays}))::int AS recent,
				COUNT(DISTINCT case_id)::int AS cases_with_evidence,
				COUNT(*) FILTER (WHERE file_type IS NOT NULL)::int AS with_files
			FROM evidence
		`
        )
        .then((r) => (r.rows[0] ?? {}) as Record<string, number>)
        .catch(() => ({}) as Record<string, number>),

      // Error brain stats (if phase72_error table exists)
      db
        .execute(
          sql`
			SELECT
				COUNT(*)::int AS total_errors,
				COUNT(*) FILTER (WHERE status = 'fixed')::int AS fixed,
				COUNT(DISTINCT file_path)::int AS affected_files,
				COUNT(*) FILTER (WHERE created_at > NOW() - make_interval(days => ${intervalDays}))::int AS recent
			FROM phase72_error
		`
        )
        .then((r) => (r.rows[0] ?? {}) as Record<string, number>)
        .catch(
          () =>
            ({ total_errors: 0, fixed: 0, affected_files: 0, recent: 0 }) as Record<string, number>
        ),

      // POI stats
      db
        .execute(
          sql`
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE threat_level = 'critical')::int AS critical,
				COUNT(*) FILTER (WHERE threat_level = 'high')::int AS high,
				COUNT(*) FILTER (WHERE status = 'active')::int AS active
			FROM persons_of_interest
		`
        )
        .then((r) => (r.rows[0] ?? {}) as Record<string, number>)
        .catch(() => ({}) as Record<string, number>),

      // System health: Redis + Qdrant + Ollama
      Promise.all([
        // Redis ping
        (async () => {
          try {
            const { getRedis } = await import('$lib/server/redis.js');
            const redis = getRedis();
            await redis.ping();
            return { redis: 'up' };
          } catch {
            return { redis: 'down' };
          }
        })(),
        // Qdrant health
        (async () => {
          try {
            const res = await fetch(`${ENV.QDRANT_URL}/healthz`, {
              signal: AbortSignal.timeout(2000),
            });
            return { qdrant: res.ok ? 'up' : 'degraded' };
          } catch {
            return { qdrant: 'down' };
          }
        })(),
        // Ollama health
        (async () => {
          try {
            const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
              signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
              const data = await res.json();
              return { ollama: 'up', models: (data.models ?? []).length };
            }
            return { ollama: 'degraded', models: 0 };
          } catch {
            return { ollama: 'down', models: 0 };
          }
        })(),
      ]).then(([redis, qdrant, ollama]) => ({ ...redis, ...qdrant, ...ollama })),
    ]);

    const responseData = {
      period,
      cases: {
        total: Number(caseStats.total ?? 0),
        active: Number(caseStats.active ?? 0),
        closed: Number(caseStats.closed ?? 0),
        recentCreated: Number(caseStats.recent ?? 0),
      },
      evidence: {
        total: Number(evidenceStats.total ?? 0),
        recentUploaded: Number(evidenceStats.recent ?? 0),
        casesWithEvidence: Number(evidenceStats.cases_with_evidence ?? 0),
        withFiles: Number(evidenceStats.with_files ?? 0),
      },
      errorBrain: {
        totalErrors: Number(errorStats.total_errors ?? 0),
        fixed: Number(errorStats.fixed ?? 0),
        affectedFiles: Number(errorStats.affected_files ?? 0),
        recentErrors: Number(errorStats.recent ?? 0),
        fixRate:
          Number(errorStats.total_errors) > 0
            ? Math.round((Number(errorStats.fixed) / Number(errorStats.total_errors)) * 100)
            : 100,
      },
      personsOfInterest: {
        total: Number(poiStats.total ?? 0),
        critical: Number(poiStats.critical ?? 0),
        high: Number(poiStats.high ?? 0),
        active: Number(poiStats.active ?? 0),
      },
      system: systemHealth,
      generatedAt: new Date().toISOString(),
    };

    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.short, ETag: etag },
    });
  } catch (err) {
    console.error('[YorhaAnalytics] Error:', err);
    return json(
      {
        period,
        cases: { total: 0, active: 0, closed: 0, recentCreated: 0 },
        evidence: { total: 0, recentUploaded: 0, casesWithEvidence: 0, withFiles: 0 },
        errorBrain: { totalErrors: 0, fixed: 0, affectedFiles: 0, recentErrors: 0, fixRate: 100 },
        personsOfInterest: { total: 0, critical: 0, high: 0, active: 0 },
        system: { redis: 'down', qdrant: 'down', ollama: 'down', models: 0 },
        generatedAt: new Date().toISOString(),
        degraded: true,
      },
      { headers: cacheControl.short }
    );
  }
};
