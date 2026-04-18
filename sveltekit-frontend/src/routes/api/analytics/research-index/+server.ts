/**
 * /api/analytics/research-index
 *
 * Centralized management endpoint for the Redis-cached JSONL research index.
 * Triggered by: QLoRA distillation, MapReduce job completion, glyph atlas rebuild,
 * or any pipeline that produces new qlora_examples rows.
 *
 * GET  — index stats: { builtAt, totalByPipeline, stale }
 * POST — build/rebuild: { action: 'build'|'invalidate', pipeline?: string }
 *        Returns { indexed, durationMs } on build, { cleared } on invalidate
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	buildResearchIndex,
	invalidateResearchIndex,
	getResearchIndexStats,
} from '$lib/server/analytics/research-cache.js';

const postSchema = z.object({
	action: z.enum(['build', 'invalidate']),
});

// ── GET — stats ───────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ builtAt: null, totalByPipeline: {}, stale: true });

	try {
		const stats = await getResearchIndexStats();
		const stale = !stats.builtAt || (
			Date.now() - new Date(stats.builtAt).getTime() > 25 * 60 * 1000 // >25 min = near expiry
		);
		return json({ ...stats, stale });
	} catch {
		return json({ builtAt: null, totalByPipeline: {}, stale: true });
	}
};

// ── POST — build or invalidate ────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { action } = parsed.data;

	if (action === 'invalidate') {
		await invalidateResearchIndex();
		return json({ cleared: true });
	}

	// action === 'build'
	try {
		const result = await buildResearchIndex();
		return json({ success: true, ...result });
	} catch (err) {
		return json({ error: 'Index build failed', detail: (err as Error).message }, { status: 502 });
	}
};