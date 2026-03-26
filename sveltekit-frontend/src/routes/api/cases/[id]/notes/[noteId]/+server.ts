import { db } from '$lib/server/db/client';
import { caseNotes, caseNoteVersions } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, sql, desc, count } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const updateNoteSchema = z.object({
	title: z.string().max(1000).optional(),
	content: z.string().max(100000).optional(),
	isPinned: z.boolean().optional(),
});

/**
 * GET /api/cases/[id]/notes/[noteId]
 * Fetch a single note
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
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
 * Auto-saves previous content as a version snapshot
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = updateNoteSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;
		const updates: Record<string, unknown> = { updatedAt: sql`now()` };

		if (body.title !== undefined) updates.title = body.title;
		if (body.content !== undefined) updates.content = body.content;
		if (body.isPinned !== undefined) updates.isPinned = body.isPinned;

		// If content is changing, save the old version first
		if (body.content !== undefined) {
			const [oldNote] = await db
				.select()
				.from(caseNotes)
				.where(and(eq(caseNotes.id, params.noteId), eq(caseNotes.caseId, params.id)))
				.limit(1);

			if (oldNote && oldNote.content !== body.content) {
				// Get next version number
				const [versionCount] = await db
					.select({ value: count() })
					.from(caseNoteVersions)
					.where(eq(caseNoteVersions.noteId, params.noteId));

				const nextVersion = (versionCount?.value ?? 0) + 1;

				await db.insert(caseNoteVersions).values({
					noteId: params.noteId,
					title: oldNote.title,
					content: oldNote.content,
					versionNumber: nextVersion,
				});
			}
		}

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
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
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
