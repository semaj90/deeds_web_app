import { citations, statutes, db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getFromMemoryCache, setCache } from '$lib/server/cache.js';
import { z } from 'zod';
import { findStateBySlug } from '$lib/server/law-mapping.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const citationCreateSchema = z.object({
  statute_code: z.string().min(1).max(500),
  statute_title: z.string().max(500).optional(),
  jurisdiction: z.string().max(200).optional(),
  severity: z.string().max(100).optional(),
  highlighted_text: z.string().max(10000).optional(),
  case_id: z.string().uuid().optional(),
  source_type: z.string().max(50).optional(),
  source_url: z.string().max(2000).optional(),
  // New columns (April 2026)
  title: z.string().max(500).optional(),
  annotation: z.string().max(10000).optional(),
  is_key_authority: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

const citationUpdateSchema = z.object({
  id: z.string().uuid(),
  citation_text: z.string().min(1).max(500).optional(),
  citation_type: z.string().max(100).optional(),
  title: z.string().max(500).optional(),
  annotation: z.string().max(10000).optional(),
  is_key_authority: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  source_url: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const citationListSchema = z.object({
  case_id: z.string().max(100).nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/citations
 * Fetch citations with optional case filter.
 * Uses Memory+Redis dual-tier cache (5min TTL) to avoid repeated DB queries.
 */
export const GET: RequestHandler = async ({ locals, url, request }) => {
  if (!locals.user) {
    return json({ success: false, citations: [] }, { status: 401 });
  }

  const parsed = citationListSchema.safeParse({
    case_id: url.searchParams.get('case_id'),
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return json({ success: false, citations: [], error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  const { case_id: caseId, limit } = parsed.data;

  // Check cache first (Memory → Redis, keyed by caseId+limit)
  const cacheKey = `citations:${caseId ?? 'all'}:${limit}`;
  const cached = getFromMemoryCache(cacheKey);
  if (Array.isArray(cached)) {
    // ETag check for 304 response
    const { etag, isMatch } = checkETag(cached, request.headers);
    if (isMatch) return notModified(etag);

    return json({ success: true, citations: cached, cache: true }, {
      headers: { ...cacheControl.private, ETag: etag }
    });
  }

  try {
    const query = db.select().from(citations).orderBy(desc(citations.createdAt)).limit(limit);

    const results = caseId ? await query.where(eq(citations.caseId, caseId)) : await query;

    // Cache results (5min TTL)
    setCache(cacheKey, results, 300_000);

    // ETag check for 304 response
    const { etag, isMatch } = checkETag(results, request.headers);
    if (isMatch) return notModified(etag);

    return json({ success: true, citations: results }, {
      headers: { ...cacheControl.private, ETag: etag }
    });
  } catch (err) {
    console.error('Error fetching citations:', err);
    return json({ success: false, citations: [], cache: false, degraded: true });
  }
};

/**
 * POST /api/citations
 * Create a new citation (optionally also creates/links a statute)
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const parsed = citationCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Upsert statute if title/jurisdiction provided
    let statuteId: string | undefined;
    if (body.statute_title || body.jurisdiction) {
      const normalizedJurisdiction = body.jurisdiction
        ? (findStateBySlug(body.jurisdiction)?.canonical ?? body.jurisdiction)
        : null;
      const [newStatute] = await db
        .insert(statutes)
        .values({
          title: body.statute_title || body.statute_code,
          content: body.highlighted_text || body.statute_code,
          jurisdiction: normalizedJurisdiction,
          section: body.statute_code,
          category: body.severity || null,
        })
        .returning();
      statuteId = newStatute.id;
    }

    // Create citation record with all fields
    const [newCitation] = await db
      .insert(citations)
      .values({
        citationText: body.statute_code.trim(),
        citationType: body.source_type || 'statute',
        title: body.title || body.statute_title || null,
        annotation: body.annotation || body.highlighted_text || null,
        isKeyAuthority: body.is_key_authority ?? false,
        tags: body.tags ?? [],
        caseId: body.case_id || null,
        sourceUrl: body.source_type === 'manual' ? null : body.source_url || null,
        createdBy: locals.user ? Number(locals.user.id) : null,
      })
      .returning();

    // Invalidate citation cache (new data available)
    setCache(`citations:${body.case_id ?? 'all'}:50`, null, 0);
    setCache('citations:all:50', null, 0);

    // ── RL signal: citation_saved (+0.05) ────────────────────────────────────
    const _userId = locals.user?.id;
    if (_userId) {
      import('$lib/server/graph/hypergraph-4d.js')
        .then(({ adaptFromAnalytics }) =>
          adaptFromAnalytics({ signal: 'citation_saved', pipeline: 'ace', userId: _userId, sessionId: _userId })
        )
        .catch(() => {});
    }

    return json(
      {
        success: true,
        citation: newCitation,
        statute: statuteId ? { id: statuteId } : null,
        message: 'Citation saved successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error creating citation:', err);
    return json({ success: false, error: 'Failed to create citation' }, { status: 500 });
  }
};

/**
 * PATCH /api/citations
 * Update an existing citation
 * Body: { id, citation_text?, citation_type?, title?, annotation?, is_key_authority?, tags?, source_url?, confidence? }
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const parsed = citationUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const updates: Record<string, unknown> = {};
    if (body.citation_text !== undefined) updates.citationText = body.citation_text;
    if (body.citation_type !== undefined) updates.citationType = body.citation_type;
    if (body.title !== undefined) updates.title = body.title;
    if (body.annotation !== undefined) updates.annotation = body.annotation;
    if (body.is_key_authority !== undefined) updates.isKeyAuthority = body.is_key_authority;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.source_url !== undefined) updates.sourceUrl = body.source_url;
    if (body.confidence !== undefined) updates.confidence = body.confidence;
    updates.updatedAt = new Date();

    if (Object.keys(updates).length <= 1) {
      return json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const [updated] = await db
      .update(citations)
      .set(updates)
      .where(eq(citations.id, body.id))
      .returning();

    if (!updated) {
      return json({ success: false, error: 'Citation not found' }, { status: 404 });
    }

    // Invalidate cache
    setCache('citations:all:50', null, 0);

    return json({ success: true, citation: updated });
  } catch (err) {
    console.error('Error updating citation:', err);
    return json({ success: false, error: 'Failed to update citation' }, { status: 500 });
  }
};

const deleteCitationSchema = z.object({
	citationId: z.string().min(1, 'citationId required').max(500),
});

/**
 * DELETE /api/citations
 * Delete a citation by ID
 * Body: { citationId: string }
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const parsed = deleteCitationSchema.safeParse(body);
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}

		const [deleted] = await db
			.delete(citations)
			.where(eq(citations.id, parsed.data.citationId))
			.returning({ id: citations.id });

		if (!deleted) {
			return json({ success: false, error: 'Citation not found' }, { status: 404 });
		}

		// Invalidate cache
		setCache('citations:all:50', null, 0);

		return json({ success: true, message: 'Citation deleted' });
	} catch (err) {
		console.error('Error deleting citation:', err);
		return json({ success: false, error: 'Failed to delete citation' }, { status: 500 });
	}
};
