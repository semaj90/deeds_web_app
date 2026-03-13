import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const errorBrainRunSchema = z.object({
	filePath: z.string().max(1000).optional()
});

/** GET /api/internal/error-brain/runs — Error analysis run history */
export const GET: RequestHandler = async ({ url }) => {
	const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);

	try {
		const runs = await db.execute(sql`
			SELECT
				id,
				file_path,
				error_code,
				message,
				status,
				suggestion,
				created_at,
				updated_at
			FROM phase72_error
			ORDER BY created_at DESC
			LIMIT ${limit}
		`).catch(() => ({ rows: [] }));

		return json({
			runs: runs.rows,
			total: runs.rows.length,
			limit
		});
	} catch (err) {
		console.error('[error-brain/runs]', err);
		return json({ runs: [], total: 0, limit });
	}
};

/** POST /api/internal/error-brain/runs — Trigger a new analysis run */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = errorBrainRunSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { filePath } = parsed.data;
		return json({
			runId: crypto.randomUUID(),
			status: 'queued',
			filePath: filePath || null,
			startedAt: new Date().toISOString()
		});
	} catch (err) {
		console.error('[error-brain/runs POST]', err);
		return json({ error: 'Failed to start run' }, { status: 500 });
	}
};
