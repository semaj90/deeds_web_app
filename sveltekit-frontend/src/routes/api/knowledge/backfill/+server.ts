/**
 * POST /api/knowledge/backfill — Direct backfill trigger
 *
 * Allows MCP tools, agents, and admin UI to trigger knowledge backfill
 * without going through SSE chat. Wraps executeBackfill() from auto-backfill.ts.
 *
 * Body: { query: string, caseId?: string, maxWebResults?: number, wikiLimit?: number }
 * Returns: BackfillResult
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { executeBackfill } from '$lib/server/retrieval/auto-backfill.js';

const backfillSchema = z.object({
	query: z.string().trim().min(1, 'Query required').max(2000, 'Query too long'),
	caseId: z.string().uuid().optional(),
	maxWebResults: z.number().int().min(1).max(20).optional(),
	wikiLimit: z.number().int().min(1).max(10).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = backfillSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, caseId, maxWebResults, wikiLimit } = parsed.data;

	try {
		const result = await executeBackfill({
			query,
			caseId,
			maxWebResults,
			wikiLimit,
		});

		return json({
			success: !result.skipped,
			...result,
		});
	} catch (err) {
		console.error('[/api/knowledge/backfill] Failed:', (err as Error)?.message);
		return json({ error: 'Backfill execution failed' }, { status: 500 });
	}
};
