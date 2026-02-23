import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/index.js';
import { sql } from 'drizzle-orm';

/**
 * GET /api/phase72/errors?route=<path>
 * Returns recent error snapshot for a given route path.
 * Queries the phase72_error table if it exists, gracefully returns empty if not.
 */
export const GET: RequestHandler = async ({ url }) => {
	const route = url.searchParams.get('route');
	if (!route) {
		return json({ error: 'Missing "route" query parameter' }, { status: 400 });
	}

	try {
		// Try to query phase72_error table — it may not exist
		const result = await db.execute(
			sql`SELECT code, message, occurrence_count as count, last_seen, created_at
				FROM phase72_error
				WHERE file_path LIKE ${'%' + route + '%'}
				ORDER BY last_seen DESC
				LIMIT 10`
		);
		const rows = Array.isArray(result) ? result : [];

		return json({
			errorCount: rows.length,
			errors: rows,
			lastError: rows[0] ?? null,
		});
	} catch {
		// Table doesn't exist or DB unavailable — return empty
		return json({ errorCount: 0, errors: [], lastError: null });
	}
};
