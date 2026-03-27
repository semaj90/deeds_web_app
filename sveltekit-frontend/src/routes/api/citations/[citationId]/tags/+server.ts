import { db } from '$lib/server/db/client';
import { json, error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { invalidateCitationCache } from '$lib/server/cache/invalidation.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const addTagSchema = z.object({
	tag: z.string().trim().min(1, 'Tag is required').max(200),
	color: z.string().max(20).optional().default('#6b7280')
});

const removeTagSchema = z.object({
	tag: z.string().min(1, 'Tag is required').max(200)
});

/**
 * GET /api/citations/[citationId]/tags
 * List all tags for a citation (from citation_tag_links table)
 */
export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.citationId)) return json({ error: 'Invalid ID format' }, { status: 400 });
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
	if (!isUuid(params.citationId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const parsed = addTagSchema.safeParse(await request.json());
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	const tag = parsed.data.tag.toLowerCase();
	const color = parsed.data.color;

	try {
		const result = await db.execute(
			sql`INSERT INTO citation_tag_links (citation_id, tag, color, created_by)
				VALUES (${params.citationId}, ${tag}, ${color}, ${locals.user.id})
				ON CONFLICT (citation_id, tag) DO NOTHING
				RETURNING id, tag, color, created_at`
		);
		const rows = (result as unknown as { rows?: any[] }).rows ?? [];
		const inserted = rows[0] ?? { tag, color };

		// Invalidate citation cache
		await invalidateCitationCache(params.citationId, 'citation_update', locals.user.id)
			.catch(err => console.warn('[Citations] Cache invalidation failed:', err));

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
	if (!isUuid(params.citationId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const delParsed = removeTagSchema.safeParse(await request.json());
	if (!delParsed.success) return json({ error: delParsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

	try {
		await db.execute(
			sql`DELETE FROM citation_tag_links WHERE citation_id = ${params.citationId} AND tag = ${delParsed.data.tag}`
		);

		// Invalidate citation cache
		await invalidateCitationCache(params.citationId, 'citation_update', locals.user.id)
			.catch(err => console.warn('[Citations] Cache invalidation failed:', err));

		return json({ success: true });
	} catch (err) {
		console.error('[citation-tags] DELETE error:', err);
		return json({ error: 'Failed to remove tag' }, { status: 500 });
	}
};
