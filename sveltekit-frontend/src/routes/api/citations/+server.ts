import { citations, statutes, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/citations
 * Fetch citations with optional case filter
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('case_id');
	const limit = Number(url.searchParams.get('limit')) || 50;

	try {
		const query = db.select().from(citations).orderBy(desc(citations.createdAt)).limit(limit);

		const results = caseId
			? await query.where(eq(citations.caseId, caseId))
			: await query;

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
		const body = await request.json();

		if (!body?.statute_code?.trim()) {
			throw error(400, 'Missing required field: statute_code');
		}

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
				createdBy: null, // TODO: map locals.user.id (uuid) to integer FK
			})
			.returning();

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
