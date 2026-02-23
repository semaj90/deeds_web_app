import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/errors/summary
 * Error counts aggregated by route — used by /cases/[id]/overview diagnostics
 */
export const GET: RequestHandler = async () => {
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

		return json({ total, byRoute });
	} catch {
		// Table may not exist yet — return empty
		return json({ total: 0, byRoute: {} });
	}
};
