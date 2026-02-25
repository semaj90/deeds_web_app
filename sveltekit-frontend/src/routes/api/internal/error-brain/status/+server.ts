import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/** GET /api/internal/error-brain/status — Aggregate error analysis status */
export const GET: RequestHandler = async () => {
	try {
		const stats = await db.execute(sql`
			SELECT
				COUNT(*)::int AS total_errors,
				COUNT(DISTINCT file_path)::int AS affected_files,
				COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS recent_errors,
				COUNT(*) FILTER (WHERE status = 'fixed')::int AS fixed_count
			FROM phase72_error
		`).catch(() => ({ rows: [{ total_errors: 0, affected_files: 0, recent_errors: 0, fixed_count: 0 }] }));

		const row = stats.rows[0] as Record<string, number>;

		return json({
			status: 'operational',
			totalErrors: row.total_errors || 0,
			affectedFiles: row.affected_files || 0,
			recentErrors: row.recent_errors || 0,
			fixedCount: row.fixed_count || 0,
			fixRate: row.total_errors > 0
				? Math.round((row.fixed_count / row.total_errors) * 100)
				: 100,
			lastAnalysis: new Date().toISOString()
		});
	} catch (err) {
		console.error('[error-brain/status]', err);
		return json({
			status: 'degraded',
			totalErrors: 0,
			affectedFiles: 0,
			recentErrors: 0,
			fixedCount: 0,
			fixRate: 0,
			lastAnalysis: null
		});
	}
};
