import { caseStatuteLinks, statutes, cases, db } from '$lib/server/db/client';
import { error, isHttpError, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

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
        (result as Array<Record<string, unknown>>)[0]);
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
 * GET /api/cases/[id]/laws
 * Fetch all statute links for a case
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const caseId = params.id;
  const hasLinksTable = await hasCaseStatuteLinksTable();

  if (!hasLinksTable) {
    return json({ success: true, data: [] });
  }

  try {
    const links = await db
      .select({
        id: caseStatuteLinks.id,
        linkType: caseStatuteLinks.linkType,
        notes: caseStatuteLinks.notes,
        createdAt: caseStatuteLinks.createdAt,
        statuteId: statutes.id,
        statuteTitle: statutes.title,
        statuteSection: statutes.section,
        statuteJurisdiction: statutes.jurisdiction,
      })
      .from(caseStatuteLinks)
      .leftJoin(statutes, eq(caseStatuteLinks.statuteId, statutes.id))
      .where(eq(caseStatuteLinks.caseId, caseId));

    return json({ success: true, data: links });
  } catch (err) {
    if (hasPgErrorCode(err, '42P01')) {
      return json({ success: true, data: [] });
    }

    console.error('Error fetching case laws:', err);
    throw error(500, 'Failed to fetch case laws');
  }
};

const caseLawSchema = z.object({
  statute_code: z.string().min(1, 'statute_code is required').max(500),
  link_type: z
    .enum(['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'])
    .optional()
    .default('CITED_IN'),
  notes: z.string().max(5000).optional(),
});

/**
 * POST /api/cases/[id]/laws
 * Link a statute to a case
 * Body: { statute_code, link_type, notes? }
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const caseId = params.id;
  const hasLinksTable = await hasCaseStatuteLinksTable();

  if (!hasLinksTable) {
    throw error(503, 'Case statute links are unavailable');
  }

  try {
    const raw = await request.json();
    const parsed = caseLawSchema.safeParse(raw);
    if (!parsed.success) {
      throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const body = parsed.data;

    // Verify case exists
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (!targetCase) {
      throw error(404, 'Case not found');
    }

    // Find or create statute by section code
    let statute = await db
      .select()
      .from(statutes)
      .where(eq(statutes.section, body.statute_code.trim()))
      .limit(1)
      .then((rows) => rows[0]);

    if (!statute) {
      const [newStatute] = await db
        .insert(statutes)
        .values({
          title: body.statute_code.trim(),
          content: body.statute_code.trim(),
          section: body.statute_code.trim(),
        })
        .returning();
      statute = newStatute;
    }

    // Create the link
    const [link] = await db
      .insert(caseStatuteLinks)
      .values({
        caseId,
        statuteId: statute.id,
        linkType: body.link_type || 'CITED_IN',
        notes: body.notes || null,
        createdBy: locals.user.id,
      })
      .returning();

    return json(
      {
        success: true,
        data: link,
        message: 'Statute linked to case',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error linking statute to case:', err);
    if (isHttpError(err)) {
      throw err;
    }
    if (hasPgErrorCode(err, '42P01')) {
      throw error(503, 'Case statute links are unavailable');
    }
    throw error(500, 'Failed to link statute to case');
  }
};
