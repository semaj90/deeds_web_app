import { db } from '$lib/server/db/client';
import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/citations/[citationId]/tags
 * List all tags for a citation (from citation_tag_links table)
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await db.execute(
			sql`SELECT id, tag, color, created_at FROM citation_tag_links WHERE citation_id = ${params.citationId} ORDER BY created_at`
		);
		const rows = (result as unknown as { rows?: any[] }).rows ?? [];
		return json({ success: true, tags: rows });
	} catch (err) {
		console.error('[citation-tags] GET error:', err);
		return json({ success: true, tags: [] });
	}
};

/**
 * POST /api/citations/[citationId]/tags
 * Add a tag to a citation
 * Body: { tag: string, color?: string }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	if (!body?.tag?.trim()) throw error(400, 'Tag is required');

	const tag = body.tag.trim().toLowerCase();
	const color = body.color || '#6b7280';

	try {
		const result = await db.execute(
			sql`INSERT INTO citation_tag_links (citation_id, tag, color, created_by)
				VALUES (${params.citationId}, ${tag}, ${color}, ${locals.user.id})
				ON CONFLICT (citation_id, tag) DO NOTHING
				RETURNING id, tag, color, created_at`
		);
		const rows = (result as unknown as { rows?: any[] }).rows ?? [];
		const inserted = rows[0] ?? { tag, color };

		return json({ success: true, tag: inserted }, { status: 201 });
	} catch (err) {
		console.error('[citation-tags] POST error:', err);
		return json({ error: 'Failed to add tag' }, { status: 500 });
	}
};

/**
 * DELETE /api/citations/[citationId]/tags
 * Remove a tag from a citation
 * Body: { tag: string }
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	if (!body?.tag) throw error(400, 'Tag is required');

	try {
		await db.execute(
			sql`DELETE FROM citation_tag_links WHERE citation_id = ${params.citationId} AND tag = ${body.tag}`
		);
		return json({ success: true });
	} catch (err) {
		console.error('[citation-tags] DELETE error:', err);
		return json({ error: 'Failed to remove tag' }, { status: 500 });
	}
};
