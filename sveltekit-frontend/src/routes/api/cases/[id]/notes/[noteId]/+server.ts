import { db } from '$lib/server/db/client';
import { caseNotes } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/cases/[id]/notes/[noteId]
 * Fetch a single note
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [note] = await db
			.select()
			.from(caseNotes)
			.where(and(eq(caseNotes.id, params.noteId), eq(caseNotes.caseId, params.id)))
			.limit(1);

		if (!note) {
			return json({ error: 'Note not found' }, { status: 404 });
		}

		return json({ success: true, note });
	} catch (err) {
		console.error('[notes] GET single error:', err);
		return json({ error: 'Failed to load note' }, { status: 500 });
	}
};

/**
 * PATCH /api/cases/[id]/notes/[noteId]
 * Update a note's title, content, or isPinned status
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const updates: Record<string, unknown> = { updatedAt: sql`now()` };

		if (body.title !== undefined) updates.title = body.title;
		if (body.content !== undefined) updates.content = body.content;
		if (body.isPinned !== undefined) updates.isPinned = body.isPinned;

		const [note] = await db
			.update(caseNotes)
			.set(updates)
			.where(and(eq(caseNotes.id, params.noteId), eq(caseNotes.caseId, params.id)))
			.returning();

		if (!note) {
			return json({ error: 'Note not found' }, { status: 404 });
		}

		return json({ success: true, note });
	} catch (err) {
		console.error('[notes] PATCH error:', err);
		return json({ error: 'Failed to update note' }, { status: 500 });
	}
};

/**
 * DELETE /api/cases/[id]/notes/[noteId]
 * Delete a note
 */
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const [deleted] = await db
			.delete(caseNotes)
			.where(and(eq(caseNotes.id, params.noteId), eq(caseNotes.caseId, params.id)))
			.returning();

		if (!deleted) {
			return json({ error: 'Note not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('[notes] DELETE error:', err);
		return json({ error: 'Failed to delete note' }, { status: 500 });
	}
};
