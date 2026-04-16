import { db } from '$lib/server/db/client';
import { caseNoteVersions, cases } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { validateUuidParams } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

/**
 * GET /api/cases/[id]/notes/[noteId]/versions
 * List all versions for a note (most recent first)
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const invalid = validateUuidParams(params, 'id', 'noteId');
	if (invalid) return invalid;

	try {
		const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, params.id), eq(cases.userId, locals.user.id)))
      .limit(1);

    if (!targetCase) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

		const versions = await db
			.select()
			.from(caseNoteVersions)
			.where(eq(caseNoteVersions.noteId, params.noteId))
			.orderBy(desc(caseNoteVersions.versionNumber))
			.limit(50);

		return json({ success: true, versions }, { headers: cacheControl.short });
	} catch (err) {
		console.error('[note-versions] GET error:', err);
		return json({ success: true, versions: [] }, { headers: cacheControl.short });
	}
};
