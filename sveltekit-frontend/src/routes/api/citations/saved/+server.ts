import { db, savedCitations } from '$lib/server/db/client';
import { json, error } from '@sveltejs/kit';
import { eq, and, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const saveCitationSchema = z.object({
	statute_code: z.string().max(500).optional().default(''),
	citationText: z.string().max(500).optional().default(''),
	statute_title: z.string().max(1000).nullable().optional(),
	statuteTitle: z.string().max(1000).nullable().optional(),
	jurisdiction: z.string().max(200).nullable().optional(),
	severity: z.string().max(100).nullable().optional(),
	year: z.union([z.number(), z.string().max(10)]).nullable().optional(),
	case_id: z.string().max(500).nullable().optional(),
	caseId: z.string().max(500).nullable().optional(),
	source_type: z.string().max(100).optional(),
	sourceType: z.string().max(100).optional(),
	highlighted_text: z.string().max(50000).nullable().optional(),
	highlightedText: z.string().max(50000).nullable().optional(),
	contextText: z.string().max(50000).nullable().optional(),
	notes: z.string().max(50000).nullable().optional()
}).refine(d => (d.statute_code?.trim() || d.citationText?.trim()), {
	message: 'Missing required field: statute_code'
});

/**
 * GET /api/citations/saved
 * List the current user's saved citations
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = locals.user?.id ?? 'anonymous';
	const caseId = url.searchParams.get('caseId');
	const statuteCode = url.searchParams.get('statute_code');
	const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);

	try {
		let query = db
			.select()
			.from(savedCitations)
			.where(eq(savedCitations.userId, userId))
			.orderBy(desc(savedCitations.createdAt))
			.limit(limit);

		if (caseId) {
			query = db
				.select()
				.from(savedCitations)
				.where(and(eq(savedCitations.userId, userId), eq(savedCitations.caseId, caseId)))
				.orderBy(desc(savedCitations.createdAt))
				.limit(limit);
		}

		if (statuteCode) {
			query = db
				.select()
				.from(savedCitations)
				.where(and(eq(savedCitations.userId, userId), eq(savedCitations.statuteCode, statuteCode)))
				.orderBy(desc(savedCitations.createdAt))
				.limit(limit);
		}

		const results = await query;
		return json({ success: true, citations: results });
	} catch (err) {
		console.error('Error fetching saved citations:', err);
		return json({ success: true, citations: [] });
	}
};

/**
 * POST /api/citations/saved
 * Save a new citation for the current user
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = locals.user?.id ?? 'anonymous';

	try {
		// Zod validates statute_code or citationText required via .refine()
		const parsed = saveCitationSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		const body = parsed.data;
		const statuteCode = (body.statute_code ?? body.citationText ?? '').trim();

		const [newCitation] = await db
			.insert(savedCitations)
			.values({
				userId,
				statuteCode,
				statuteTitle: body.statute_title ?? body.statuteTitle ?? null,
				jurisdiction: body.jurisdiction ?? null,
				severity: body.severity ?? null,
				year: body.year ? Number(body.year) : null,
				caseId: body.case_id ?? body.caseId ?? null,
				sourceType: body.source_type ?? body.sourceType ?? 'manual',
				highlightedText: body.highlighted_text ?? body.highlightedText ?? body.contextText ?? null,
				notes: body.notes ?? null,
			})
			.returning();

		return json(
			{ success: true, citation: newCitation, message: 'Citation saved' },
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error saving citation:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to save citation');
	}
};

/**
 * DELETE /api/citations/saved
 * Remove a saved citation (user can only delete own)
 */
export const DELETE: RequestHandler = async ({ locals, url }) => {
	const userId = locals.user?.id ?? 'anonymous';
	const id = url.searchParams.get('id');

	if (!id) {
		throw error(400, 'Missing required query param: id');
	}

	try {
		const deleted = await db
			.delete(savedCitations)
			.where(and(eq(savedCitations.id, id), eq(savedCitations.userId, userId)))
			.returning();

		if (deleted.length === 0) {
			return json({ success: false, error: 'Citation not found or not owned by user' }, { status: 404 });
		}

		return json({ success: true, message: 'Citation removed' });
	} catch (err) {
		console.error('Error deleting saved citation:', err);
		throw error(500, 'Failed to delete citation');
	}
};
