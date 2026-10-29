import { pgRows } from '$lib/server/db/client';
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
import { z } from 'zod';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

const analysisCacheSchema = z
  .object({
    evidenceId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      .optional(),
    caseId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      .optional(),
    type: z.enum(['yolo', 'vlm', 'llm_synthesis', 'combined']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((data) => data.evidenceId || data.caseId, {
    message: 'Provide evidenceId or caseId',
  });

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized', data: [], cacheHit: false, count: 0 }, { status: 401 });
  }

  const parsed = analysisCacheSchema.safeParse({
    evidenceId: url.searchParams.get('evidenceId') ?? undefined,
    caseId: url.searchParams.get('caseId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return json(
      {
        error: parsed.error.issues[0]?.message ?? 'Invalid params',
        data: [],
        cacheHit: false,
        count: 0,
      },
      { status: 400 }
    );
  }

  const { evidenceId, caseId, type: analysisType, limit } = parsed.data;

  const ownerId = Number(locals.user.id);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    return json({ error: 'Not found', data: [], cacheHit: false, count: 0 }, { status: 404 });
  }

  try {
    const ownershipRows = evidenceId
      ? await db.execute(sql`
          SELECT EXISTS (
            SELECT 1
            FROM evidence e
            LEFT JOIN cases c ON c.id = e.case_id
            WHERE e.id = ${evidenceId}::uuid
              ${caseId ? sql`AND e.case_id = ${caseId}::uuid` : sql``}
              AND (e.user_id = ${ownerId} OR c.user_id = ${ownerId} OR c.assigned_attorney = ${ownerId})
          ) AS authorized
        `)
      : await db.execute(sql`
          SELECT EXISTS (
            SELECT 1
            FROM cases c
            WHERE c.id = ${caseId}::uuid
              AND (c.user_id = ${ownerId} OR c.assigned_attorney = ${ownerId})
          ) AS authorized
        `);
    const ownership = pgRows(ownershipRows)[0] as { authorized?: boolean | string } | undefined;
    if (ownership?.authorized !== true && ownership?.authorized !== 'true') {
      return json({ error: 'Not found', data: [], cacheHit: false, count: 0 }, { status: 404 });
    }
  } catch (err) {
    console.error('[analysis/cache] Ownership check failed:', err);
    return json({ error: 'Unavailable', data: [], cacheHit: false, count: 0 }, { status: 503 });
  }

  // L0: Memory cache check
  const cacheKey = `analysis_cache:${ownerId}:${evidenceId ?? ''}:${caseId ?? ''}:${analysisType ?? 'all'}:${limit}`;
  const mem = getFromMemoryCache(cacheKey);
  if (mem.found) {
    const data = Array.isArray(mem.value) ? mem.value : [];
    return json({ data, cacheHit: 'memory', count: data.length }, { headers: cacheControl.short });
  }

  // L1: Redis cache check
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const data = Array.isArray(parsed) ? parsed : [];
      return json({ data, cacheHit: 'redis', count: data.length }, { headers: cacheControl.short });
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

    const data = pgRows(rows) ?? [];

    // Cache for 5 minutes (memory + Redis)
    await setCache(cacheKey, data, 5 * 60 * 1000).catch(() => {});

    return json({ data, cacheHit: false, count: data.length }, { headers: cacheControl.short });
  } catch (err) {
    console.error('[analysis/cache] Query failed:', err);
    return json({ data: [], cacheHit: false, count: 0 }, { headers: cacheControl.short });
  }
};
