import { caseStatuteLinks, citations, cases, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

/**
 * GET /api/cases/[id]/citations
 * Fetch all citation links for a case
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = params.id;

	try {
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

		return json({ success: true, data: links });
	} catch (err) {
		console.error('Error fetching case citations:', err);
		throw error(500, 'Failed to fetch case citations');
	}
};

const caseCitationSchema = z.object({
	citation_id: z.string().min(1, 'citation_id is required').max(500),
	link_type: z.enum(['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY']).optional().default('CITED_IN'),
	notes: z.string().max(5000).optional()
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
			.where(eq(cases.id, caseId))
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
				createdBy: locals.user.id,
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
		if (err instanceof Error && 'status' in err) {
			throw err;
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
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to unlink citation from case');
	}
};
