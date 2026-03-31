import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

const querySchema = z.object({
	q: z.string().min(2, 'Search query must be at least 2 characters').max(500)
});

/**
 * GET /api/cases/[id]/notes/search?q=...
 * Full-text search across case notes (title + content)
 * Uses PostgreSQL to_tsvector/plainto_tsquery with ILIKE fallback
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const caseId = params.id;
	if (!isUuid(caseId)) return json({ error: 'Invalid case ID format' }, { status: 400 });

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const query = parsed.data.q.trim();

	try {
		// FTS ranked search
		const ftsRows = await db.execute(sql`
			SELECT id, case_id, title, content, is_ai, is_pinned,
				created_by, created_at, updated_at,
				ts_rank(
					to_tsvector('english', coalesce(title, '') || ' ' || content),
					plainto_tsquery('english', ${query})
				) AS rank
			FROM case_notes
			WHERE case_id = ${caseId}
				AND to_tsvector('english', coalesce(title, '') || ' ' || content)
					@@ plainto_tsquery('english', ${query})
			ORDER BY rank DESC, updated_at DESC
			LIMIT 50
		`);

		// ILIKE fallback for partial/short queries FTS might miss
		const likeRows = await db.execute(sql`
			SELECT id, case_id, title, content, is_ai, is_pinned,
				created_by, created_at, updated_at, 0.1 AS rank
			FROM case_notes
			WHERE case_id = ${caseId}
				AND (title ILIKE ${'%' + query + '%'} OR content ILIKE ${'%' + query + '%'})
				AND id NOT IN (
					SELECT id FROM case_notes
					WHERE case_id = ${caseId}
						AND to_tsvector('english', coalesce(title, '') || ' ' || content)
							@@ plainto_tsquery('english', ${query})
				)
			ORDER BY updated_at DESC
			LIMIT 20
		`);

		const fts = (ftsRows.rows ?? ftsRows) as Record<string, unknown>[];
		const like = (likeRows.rows ?? likeRows) as Record<string, unknown>[];
		const notes = [...fts, ...like];

		return json({ success: true, notes, query, total: notes.length });
	} catch (err) {
		console.error('[notes-search] error:', err);
		return json(
      { success: false, notes: [], query, total: 0, error: 'Search failed' },
      { status: 500 }
    );
	}
};
