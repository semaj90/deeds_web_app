import { db } from '$lib/server/db/client';
import { caseNoteVersions } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/cases/[id]/notes/[noteId]/versions
 * List all versions for a note (most recent first)
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const versions = await db
			.select()
			.from(caseNoteVersions)
			.where(eq(caseNoteVersions.noteId, params.noteId))
			.orderBy(desc(caseNoteVersions.versionNumber))
			.limit(50);

		return json({ success: true, versions });
	} catch (err) {
		console.error('[note-versions] GET error:', err);
		return json({ success: true, versions: [] });
	}
};
