/**
 * GET  /api/codebase-index/claude-assist/defaults — read current applied defaults
 * POST /api/codebase-index/claude-assist/defaults — persist tuned defaults
 *
 * Applied defaults are stored in context_timeline with eventType
 * 'assist.tuned_defaults'. The assist endpoint reads the latest row
 * to layer between code defaults and per-request overrides.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { ASSIST_BUDGETS } from '$lib/server/ai/compact-budgets.js';

const EVENT_TYPE = 'assist.tuned_defaults';

const applySchema = z.object({
	maxGraphNeighbors: z.number().int().min(0).max(30).optional(),
	maxAceChunks:      z.number().int().min(1).max(30).optional(),
	compact:           z.boolean().optional(),
	cacheTtlHint:      z.enum(['shorter', 'keep', 'longer']).optional(),
});

export type TunedDefaults = z.infer<typeof applySchema>;

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const { eq, desc } = await import('drizzle-orm');
		const rows = await db
			.select()
			.from(contextTimeline)
			.where(eq(contextTimeline.eventType, EVENT_TYPE))
			.orderBy(desc(contextTimeline.createdAt))
			.limit(2);

		const applied = rows[0]?.payload as TunedDefaults | undefined;
		const previous = rows[1]?.payload as TunedDefaults | undefined;
		return json({
			codeDefaults: {
				maxGraphNeighbors: ASSIST_BUDGETS.maxGraphNeighbors,
				maxAceChunks:      ASSIST_BUDGETS.maxAceChunks,
				compact:           true,
				cacheTtlHint:      'keep' as const,
			},
			applied: applied ?? null,
			appliedAt: rows[0]?.createdAt ?? null,
			previous: previous ?? null,
			previousAt: rows[1]?.createdAt ?? null,
		});
	} catch {
		return json({
			codeDefaults: {
				maxGraphNeighbors: ASSIST_BUDGETS.maxGraphNeighbors,
				maxAceChunks:      ASSIST_BUDGETS.maxAceChunks,
				compact:           true,
				cacheTtlHint:      'keep' as const,
			},
			applied: null,
			appliedAt: null,
			previous: null,
			previousAt: null,
		});
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const parsed = applySchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid defaults' }, { status: 400 });
	}

	// Must have at least one field
	if (Object.keys(parsed.data).length === 0) {
		return json({ error: 'No defaults provided' }, { status: 400 });
	}

	try {
		await db.insert(contextTimeline).values({
			userId:    Number(locals.user.id),
			sessionId: '',
			eventType: EVENT_TYPE,
			pipeline:  'claude-assist',
			payload:   parsed.data,
		});

		return json({ ok: true, applied: parsed.data });
	} catch {
		return json({ error: 'Failed to persist defaults' }, { status: 500 });
	}
};
