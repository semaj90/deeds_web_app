import { caseStatuteLinks, citations, cases, db } from '$lib/server/db/client';
import { error, isHttpError, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

function hasPgErrorCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

async function hasCaseStatuteLinksTable(): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('public.case_statute_links') IS NOT NULL AS exists`
    );

    const firstRow = Array.isArray(result)
      ? result[0]
      : ((result as { rows?: Array<Record<string, unknown>> }).rows?.[0] ??
        (result as unknown as Array<Record<string, unknown>>)[0]);
    const existsValue = (firstRow as { exists?: unknown } | undefined)?.exists;

    return (
      existsValue === true || existsValue === 't' || existsValue === 'true' || existsValue === 1
    );
  } catch (err) {
    console.error('Error checking case_statute_links table:', err);
    return false;
  }
}

/**
 * GET /api/cases/[id]/citations
 * Fetch all citation links for a case
 */
export const GET: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const caseId = params.id;
  if (!isUuid(caseId)) return json({ error: 'Invalid case ID format' }, { status: 400 });

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, Number(locals.user.id))))
    .limit(1);

  if (!targetCase) {
    return json(
      { success: true, data: [] },
      { headers: cacheControl.private }
    );
  }

  const hasLinksTable = await hasCaseStatuteLinksTable();

  if (!hasLinksTable) {
    return json(
      { success: true, data: [] },
      { headers: cacheControl.private }
    );
  }

  try {
    // citations Drizzle fields do not match the live table in this environment
    // (citationText/sourceUrl vs formatted_citation/quoted_text).
    const links = await db
      .select({
        id: caseStatuteLinks.id,
        linkType: caseStatuteLinks.linkType,
        notes: caseStatuteLinks.notes,
        createdAt: caseStatuteLinks.createdAt,
        citationId: citations.id,
        citationText: citations.citationText,
        sourceUrl: citations.sourceUrl,
      })
      .from(caseStatuteLinks)
      .leftJoin(citations, eq(caseStatuteLinks.citationId, citations.id))
      .where(eq(caseStatuteLinks.caseId, caseId));

    const responseData = { success: true, data: links };

    // ETag check for 304 response (case citations are user-specific)
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.private, ETag: etag }
    });
  } catch (err) {
    if (hasPgErrorCode(err, '42P01')) {
      return json(
        { success: true, data: [] },
        { headers: cacheControl.private }
      );
    }

    console.error('Error fetching case citations:', err);
    return json(
      { success: false, data: [] },
      { headers: cacheControl.private }
    );
  }
};

const caseCitationSchema = z.object({
  citation_id: z.string().min(1, 'citation_id is required').max(500),
  link_type: z
    .enum(['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'])
    .optional()
    .default('CITED_IN'),
  notes: z.string().max(5000).optional(),
});

/**
 * POST /api/cases/[id]/citations
 * Link an existing citation to a case
 * Body: { citation_id, link_type, notes? }
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const caseId = params.id;
  if (!isUuid(caseId)) throw error(400, 'Invalid case ID format');

  const hasLinksTable = await hasCaseStatuteLinksTable();

  if (!hasLinksTable) {
    throw error(503, 'Case citation links are unavailable');
  }

  try {
    const raw = await request.json();
    const parsed = caseCitationSchema.safeParse(raw);
    if (!parsed.success) {
      throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const body = parsed.data;

    // Verify case exists
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, Number(locals.user.id))))
      .limit(1);

    if (!targetCase) {
      throw error(404, 'Case not found');
    }

    // Verify citation exists
    const [targetCitation] = await db
      .select({ id: citations.id })
      .from(citations)
      .where(eq(citations.id, body.citation_id.trim()))
      .limit(1);

    if (!targetCitation) {
      throw error(404, 'Citation not found');
    }

    // Create the link
    const [link] = await db
      .insert(caseStatuteLinks)
      .values({
        caseId,
        citationId: body.citation_id.trim(),
        linkType: body.link_type || 'CITED_IN',
        notes: body.notes || null,
        createdBy: Number(locals.user.id),
      })
      .returning();

    return json(
      {
        success: true,
        data: link,
        message: 'Citation linked to case',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error linking citation to case:', err);
    if (isHttpError(err)) {
      throw err;
    }
    if (hasPgErrorCode(err, '42P01')) {
      throw error(503, 'Case citation links are unavailable');
    }
    throw error(500, 'Failed to link citation to case');
  }
};

const deleteCaseCitationSchema = z.object({
  linkId: z.string().min(1, 'linkId required').max(500),
});

/**
 * DELETE /api/cases/[id]/citations
 * Remove a citation link from a case
 * Body: { linkId: string }
 */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const hasLinksTable = await hasCaseStatuteLinksTable();

  if (!hasLinksTable) {
    throw error(503, 'Case citation links are unavailable');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = deleteCaseCitationSchema.safeParse(body);
    if (!parsed.success) {
      throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    }

    const [deleted] = await db
      .delete(caseStatuteLinks)
      .where(eq(caseStatuteLinks.id, parsed.data.linkId))
      .returning({ id: caseStatuteLinks.id });

    if (!deleted) {
      throw error(404, 'Citation link not found');
    }

    return json({ success: true, message: 'Citation unlinked from case' });
  } catch (err) {
    console.error('Error unlinking citation from case:', err);
    if (isHttpError(err)) {
      throw err;
    }
    if (hasPgErrorCode(err, '42P01')) {
      throw error(503, 'Case citation links are unavailable');
    }
    throw error(500, 'Failed to unlink citation from case');
  }
};
