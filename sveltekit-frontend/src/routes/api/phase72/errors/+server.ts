import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

const querySchema = z.object({
	route: z.string().max(500).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

/**
 * GET /api/phase72/errors?route=<path>&limit=50
 * Returns errors from phase72_error table for Phase72ErrorBrain modal.
 * Route filter is optional — returns all errors if omitted.
 */
export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ errors: [], stats: null, error: parsed.error.issues[0]?.message }, { status: 400 });
	}
	const { route, limit } = parsed.data;

	try {
		const whereClause = route
			? sql`WHERE file_path LIKE ${'%' + route + '%'}`
			: sql``;

		const errorsResult = await db.execute(sql`
			SELECT
				id,
				error_hash,
				code AS error_code,
				file_path,
				COALESCE(line, 0) AS line_num,
				COALESCE("column", 0) AS column_num,
				COALESCE(occurrence_count, 1) AS occurrence_count,
				message,
				COALESCE(severity, 'error') AS severity,
				COALESCE(updated_at, created_at) AS last_seen,
				cycle,
				created_at
			FROM phase72_error
			${whereClause}
			ORDER BY updated_at DESC NULLS LAST, created_at DESC
			LIMIT ${limit}
		`);

		const errors = (errorsResult as any).rows ?? errorsResult ?? [];

		// Stats aggregation
		const statsResult = await db.execute(sql`
			SELECT
				COUNT(*)::int AS total_errors,
				COUNT(DISTINCT code)::int AS unique_codes,
				COUNT(DISTINCT file_path)::int AS affected_files,
				COALESCE(SUM(COALESCE(occurrence_count, 1)), 0)::int AS total_occurrences
			FROM phase72_error
			${whereClause}
		`);

		const statsRow = ((statsResult as any).rows ?? statsResult ?? [])[0];
		const stats = statsRow ? {
			total_errors: statsRow.total_errors ?? 0,
			unique_codes: statsRow.unique_codes ?? 0,
			affected_files: statsRow.affected_files ?? 0,
			total_occurrences: statsRow.total_occurrences ?? 0,
		} : null;

		return json({ errors, stats });
	} catch (err) {
		// Table doesn't exist or DB unavailable — return empty with null stats
		console.warn('[phase72/errors] Query failed:', (err as Error).message);
		return json({ errors: [], stats: null });
	}
};