import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';

const evidenceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(500).optional().default(''),
  caseId: z.string().max(100).optional().default(''),
  type: z.string().max(100).optional().default(''),
});

/**
 * GET /api/evidence
 * List evidence items with optional filtering and pagination
 */
export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = evidenceListSchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    search: url.searchParams.get('search')?.trim(),
    caseId: url.searchParams.get('caseId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
  });
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  const { page, limit, search, caseId, type } = parsed.data;
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    conditions.push(eq(evidence.userId, Number(locals.user.id)));
    if (caseId) conditions.push(eq(evidence.caseId, caseId));
    if (type) conditions.push(eq(evidence.evidenceType, type as (typeof evidence.evidenceType.enumValues)[number]));
    if (search) {
      conditions.push(
        or(
          ilike(evidence.title, `%${search}%`),
          ilike(evidence.description, `%${search}%`),
          ilike(evidence.fileName, `%${search}%`)
        )!
      );
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: evidence.id,
          caseId: evidence.caseId,
          title: evidence.title,
          description: evidence.description,
          type: evidence.type,
          evidenceType: evidence.evidenceType,
          fileName: evidence.fileName,
          fileType: evidence.fileType,
          fileSize: evidence.fileSize,
          mimeType: evidence.mimeType,
          fileUrl: evidence.fileUrl,
          evidenceNumber: evidence.evidenceNumber,
          source: evidence.source,
          summary: evidence.summary,
          tags: evidence.tags,
          aiTags: evidence.aiTags,
          collectedAt: evidence.collectedAt,
          collectedBy: evidence.collectedBy,
          createdAt: evidence.createdAt,
          updatedAt: evidence.updatedAt,
        })
        .from(evidence)
        .where(where)
        .orderBy(desc(evidence.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(evidence)
        .where(where),
    ]);

    const responseData = {
      evidence: items,
      total: countResult[0]?.count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
    };

    // ETag check for 304 response
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.private, ETag: etag }
    });
  } catch (err) {
    console.error('[evidence] GET list error:', err);
    return json(
      { evidence: [], total: 0, page: 1, limit, totalPages: 0 },
      { headers: cacheControl.private }
    );
  }
};
