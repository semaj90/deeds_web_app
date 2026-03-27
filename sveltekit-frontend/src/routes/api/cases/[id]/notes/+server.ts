import { db } from '$lib/server/db/client';
import { caseNotes, cases } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const noteCreateSchema = z.object({
	title: z.string().max(500).optional(),
	content: z.string().min(1, 'Content is required').max(50000),
	isAI: z.boolean().optional().default(false)
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/cases/[id]/notes
 * List all notes for a case (pinned first, then most recent)
 */
export const GET: RequestHandler = async ({ params }) => {
	const caseId = params.id;

	if (!caseId || !UUID_RE.test(caseId)) {
		return json({ success: true, notes: [] });
	}

	try {
		const notes = await db
			.select()
			.from(caseNotes)
			.where(eq(caseNotes.caseId, caseId))
			.orderBy(desc(caseNotes.isPinned), desc(caseNotes.updatedAt));

		return json({ success: true, notes });
	} catch (err) {
		console.error('[notes] GET error:', err);
		return json({ success: true, notes: [] });
	}
};

/**
 * POST /api/cases/[id]/notes
 * Create a new note
 * Body: { title?, content, isAI? }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const caseId = params.id;

	if (!caseId || !UUID_RE.test(caseId)) {
		return json({ error: 'Invalid case ID' }, { status: 400 });
	}

	try {
		const raw = await request.json();
		const parsed = noteCreateSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

		// Verify case exists
		const [targetCase] = await db
			.select({ id: cases.id })
			.from(cases)
			.where(eq(cases.id, caseId))
			.limit(1);

		if (!targetCase) {
			return json({ error: 'Case not found' }, { status: 404 });
		}

		const [note] = await db
			.insert(caseNotes)
			.values({
				caseId,
				title: body.title?.trim() || null,
				content: body.content.trim(),
				isAI: body.isAI,
				createdBy: locals.user?.id ?? null
			})
			.returning();

		return json({ success: true, note }, { status: 201 });
	} catch (err) {
		console.error('[notes] POST error:', err);
		return json({ error: 'Failed to create note' }, { status: 500 });
	}
};
