/**
 * POST /api/codebase-index/claude-assist/feedback
 *
 * Records human feedback (useful / not-useful) for a claude-assist run.
 * Stored in context_timeline so it can be correlated with the original
 * assist run via queryHash / cacheSlot.
 *
 * Body: {
 *   queryHash:   string   — FNV-1a hash of the original query
 *   cacheSlot?:  string   — cache key from the assist response
 *   useful:      boolean  — thumbs up (true) or down (false)
 *   comment?:    string   — optional freeform note (max 500 chars)
 *   editedFiles?: string[] — files the operator actually edited after assist
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';

const feedbackSchema = z.object({
	queryHash:   z.string().min(1).max(20),
	cacheSlot:   z.string().max(100).optional(),
	useful:      z.boolean(),
	comment:     z.string().max(500).optional(),
	editedFiles: z.array(z.string().max(200)).max(20).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = feedbackSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid' }, { status: 400 });
	}

	const { queryHash, cacheSlot, useful, comment, editedFiles } = parsed.data;

	try {
		await db.insert(contextTimeline).values({
			userId:    Number(locals.user.id),
			sessionId: '',
			eventType: 'claude_assist.feedback',
			pipeline:  'claude-assist',
			payload: {
				queryHash,
				cacheSlot: cacheSlot ?? null,
				useful,
				comment: comment ?? null,
				editedFiles: editedFiles ?? [],
			},
		});
	} catch {
		// Non-fatal — DB may be unavailable
	}

	return json({ ok: true });
};

/** GET — recent feedback summary for the operator dashboard */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);

	try {
		const { desc, eq } = await import('drizzle-orm');
		const rows = await db
			.select()
			.from(contextTimeline)
			.where(eq(contextTimeline.eventType, 'claude_assist.feedback'))
			.orderBy(desc(contextTimeline.createdAt))
			.limit(limit);

		const total = rows.length;
		const useful = rows.filter(r => (r.payload as any)?.useful === true).length;
		const notUseful = total - useful;

		return json({
			total,
			useful,
			notUseful,
			usefulPct: total > 0 ? Math.round((useful / total) * 100) : 0,
			recent: rows.slice(0, 10).map(r => ({
				queryHash:   (r.payload as any)?.queryHash,
				useful:      (r.payload as any)?.useful,
				comment:     (r.payload as any)?.comment,
				editedFiles: (r.payload as any)?.editedFiles,
				createdAt:   r.createdAt,
			})),
		});
	} catch {
		return json({ total: 0, useful: 0, notUseful: 0, usefulPct: 0, recent: [] });
	}
};
