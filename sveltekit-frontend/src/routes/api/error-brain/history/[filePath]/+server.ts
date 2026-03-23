import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * GET /api/error-brain/history/[filePath]
 * Return fix history for a specific file path
 * filePath param is URL-encoded (e.g. src%2Froutes%2Fapi%2Ffoo)
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const filePath = decodeURIComponent(params.filePath);
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const limit = parsed.success ? parsed.data.limit : 20;

	try {
		const results = await db.execute(sql`
			SELECT
				fix_id, file_path, error_context, original_code, fixed_code,
				explanation, source_ids, confidence, applied_at, applied_by,
				user_approved, success
			FROM kb_provenance_graph
			WHERE file_path ILIKE ${'%' + filePath.split('/').pop() + '%'}
			ORDER BY applied_at DESC
			LIMIT ${limit}
		`).catch(() => ({ rows: [] }));

		return json({
			filePath,
			fixes: results.rows,
			total: results.rows.length,
			limit,
		});
	} catch (e) {
		// Table might not exist
		console.warn('[error-brain/history]', (e as Error).message);
		return json({ filePath, fixes: [], total: 0, limit });
	}
};