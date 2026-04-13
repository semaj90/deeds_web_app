import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/errors/summary
 * Error counts aggregated by route — used by /cases/[id]/overview diagnostics
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const result = await db.execute(sql`
			SELECT code, file_path, COUNT(*) as count
			FROM phase72_error
			GROUP BY code, file_path
			ORDER BY count DESC
			LIMIT 50
		`);

		const rows = Array.isArray(result) ? result : [];
		const byRoute: Record<string, number> = {};
		let total = 0;

		for (const row of rows as Record<string, unknown>[]) {
			const route = String(row.file_path ?? 'unknown');
			const count = Number(row.count ?? 0);
			byRoute[route] = (byRoute[route] ?? 0) + count;
			total += count;
		}

		const responseData = { total, byRoute };

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch {
		// Table may not exist yet — return empty
		const fallbackData = { total: 0, byRoute: {} };
		return json(fallbackData, {
			headers: cacheControl.short
		});
	}
};
