import { citations, statutes, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getFromMemoryCache, setCache } from '$lib/server/cache.js';
import { z } from 'zod';

const citationCreateSchema = z.object({
	statute_code: z.string().min(1).max(500),
	statute_title: z.string().max(500).optional(),
	jurisdiction: z.string().max(200).optional(),
	severity: z.string().max(100).optional(),
	highlighted_text: z.string().max(10000).optional(),
	case_id: z.string().uuid().optional(),
	source_type: z.string().max(50).optional(),
	source_url: z.string().max(2000).optional()
});

/**
 * GET /api/citations
 * Fetch citations with optional case filter.
 * Uses Memory+Redis dual-tier cache (5min TTL) to avoid repeated DB queries.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('case_id');
	const limit = Number(url.searchParams.get('limit')) || 50;

	// Check cache first (Memory → Redis, keyed by caseId+limit)
	const cacheKey = `citations:${caseId ?? 'all'}:${limit}`;
	const cached = getFromMemoryCache(cacheKey);
	if (cached) {
		return json({ success: true, citations: cached, cache: true });
	}

	try {
		const query = db.select().from(citations).orderBy(desc(citations.createdAt)).limit(limit);

		const results = caseId
			? await query.where(eq(citations.caseId, caseId))
			: await query;

		// Cache results (5min TTL)
		setCache(cacheKey, results, 300_000);

		return json({ success: true, citations: results });
	} catch (err) {
		console.error('Error fetching citations:', err);
		return json({ success: false, citations: [], error: 'Database unavailable' }, { status: 200 });
	}
};

/**
 * POST /api/citations
 * Create a new citation (optionally also creates/links a statute)
 * Body: { statute_code, statute_title?, jurisdiction?, severity?, year?,
 *         highlighted_text?, notes?, case_id?, source_type? }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const raw = await request.json();
		const parsed = citationCreateSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

		// Upsert statute if title/jurisdiction provided
		let statuteId: string | undefined;
		if (body.statute_title || body.jurisdiction) {
			const [newStatute] = await db
				.insert(statutes)
				.values({
					title: body.statute_title || body.statute_code,
					content: body.highlighted_text || body.statute_code,
					jurisdiction: body.jurisdiction || null,
					section: body.statute_code,
					category: body.severity || null,
				})
				.returning();
			statuteId = newStatute.id;
		}

		// Create citation record
		const [newCitation] = await db
			.insert(citations)
			.values({
				citationText: body.statute_code.trim(),
				caseId: body.case_id || null,
				sourceUrl: body.source_type === 'manual' ? null : body.source_url || null,
				createdBy: locals.user?.id ?? null,
			})
			.returning();

		// Invalidate citation cache (new data available)
		setCache(`citations:${body.case_id ?? 'all'}:50`, null, 0);
		setCache('citations:all:50', null, 0);

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
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create citation');
	}
};
