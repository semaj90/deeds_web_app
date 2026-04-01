/**
 * GET /api/evidence/analysis/cache?evidenceId=...&caseId=...&type=...
 *
 * Fast Drizzle-backed analysis cache query for client-side.
 * Returns cached YOLO detections, LLM synthesis, and graph connections
 * without parsing evidence JSONB metadata.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
    return json({ error: 'Unauthorized', data: [], cacheHit: false, count: 0 }, { status: 401 });
  }

  const evidenceId = url.searchParams.get('evidenceId');
  const caseId = url.searchParams.get('caseId');
  const analysisType = url.searchParams.get('type'); // 'yolo' | 'vlm' | 'llm_synthesis' | 'combined'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

  if (!evidenceId && !caseId) {
    return json(
      { error: 'Provide evidenceId or caseId', data: [], cacheHit: false, count: 0 },
      { status: 400 }
    );
  }

  // L0: Memory cache check
  const cacheKey = `analysis_cache:${evidenceId ?? ''}:${caseId ?? ''}:${analysisType ?? 'all'}`;
  const mem = getFromMemoryCache(cacheKey);
  if (mem.found) {
    const data = Array.isArray(mem.value) ? mem.value : [];
    return json({ data, cacheHit: 'memory', count: data.length });
  }

  // L1: Redis cache check
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const data = Array.isArray(parsed) ? parsed : [];
      return json({ data, cacheHit: 'redis', count: data.length });
    }
  } catch {
    /* miss */
  }

  // L2: Drizzle query
  try {
    let rows;
    if (evidenceId && !caseId && !analysisType) {
      rows = await db.execute(
        sql`SELECT id, evidence_id, case_id, analysis_type, result, confidence,
					object_count, tags, llm_escalated, processing_time_ms, created_at
				FROM evidence_analysis_cache
				WHERE evidence_id = ${evidenceId}
				AND (expires_at IS NULL OR expires_at > NOW())
				ORDER BY created_at DESC
				LIMIT ${limit}`
      );
    } else if (caseId && !evidenceId) {
      rows = await db.execute(
        sql`SELECT id, evidence_id, case_id, analysis_type, result, confidence,
					object_count, tags, llm_escalated, processing_time_ms, created_at
				FROM evidence_analysis_cache
				WHERE case_id = ${caseId}
				${analysisType ? sql`AND analysis_type = ${analysisType}` : sql``}
				AND (expires_at IS NULL OR expires_at > NOW())
				ORDER BY confidence DESC, created_at DESC
				LIMIT ${limit}`
      );
    } else {
      rows = await db.execute(
        sql`SELECT id, evidence_id, case_id, analysis_type, result, confidence,
					object_count, tags, llm_escalated, processing_time_ms, created_at
				FROM evidence_analysis_cache
				WHERE evidence_id = ${evidenceId}
				${caseId ? sql`AND case_id = ${caseId}` : sql``}
				${analysisType ? sql`AND analysis_type = ${analysisType}` : sql``}
				AND (expires_at IS NULL OR expires_at > NOW())
				ORDER BY created_at DESC
				LIMIT ${limit}`
      );
    }

    const data = (rows as any).rows ?? [];

    // Cache for 5 minutes (memory + Redis)
    await setCache(cacheKey, data, 5 * 60 * 1000).catch(() => {});

    return json({ data, cacheHit: false, count: data.length });
  } catch (err) {
    console.error('[analysis/cache] Query failed:', err);
    return json({ data: [], cacheHit: false, count: 0 });
  }
};
