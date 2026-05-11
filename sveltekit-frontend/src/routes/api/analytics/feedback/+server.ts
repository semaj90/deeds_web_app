import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema/context-timeline';
import { z } from 'zod';

const feedbackSchema = z.object({
	eventType: z.enum(['feedback', 'citation', 'research']),
	signal: z.enum(['thumbs_up', 'thumbs_down', 'dwell_long', 'dwell_short', 'citation_saved']),
	pipeline: z.string().default('ace'),
	summaryId: z.string().uuid().optional(),
	payload: z.record(z.string(), z.any()).default({}),
	sessionId: z.string().optional()
});

/**
 * POST /api/analytics/feedback
 * Records user interaction signals for the RL self-modification loop.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Authentication optional but preferred for RL personalization.
	// context_timeline.user_id is integer; locals.user.id is a Lucia string. Coerce.
	const userIdRaw  = locals.user?.id;
	const userIdNum  = userIdRaw !== undefined ? Number(userIdRaw) : undefined;
	const userId     = Number.isFinite(userIdNum) ? userIdNum : undefined;

	try {
		const body = await request.json();
		const parsed = feedbackSchema.safeParse(body);

		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback data' }, { status: 400 });
		}

		const { eventType, signal, pipeline, summaryId, payload, sessionId } = parsed.data;

		// 1. Record event in context_timeline (Audit trail & RL seed)
		await db.insert(contextTimeline).values({
			userId,
			sessionId: sessionId ?? '',
			eventType,
			pipeline,
			summaryId,
			signal,
			payload,
			// Initial reward estimate (to be refined by GRPO/RL logic)
			grpoReward: signal === 'thumbs_up' || signal === 'citation_saved' ? 1.0 : signal === 'thumbs_down' ? -1.0 : 0.1
		});

		// 2. Trigger async hypergraph adaptation if signal is significant
		if (signal === 'thumbs_up' || signal === 'citation_saved') {
			// In production, this would increment the 'hg:adapt:pending' counter in Redis
			// and trigger building the 4D hypergraph if the threshold is met.
			console.log(`[RL-Loop] Recorded ${signal} signal for pipeline ${pipeline}. Adaptation pending.`);
		}

		return json({ success: true });
	} catch (err) {
		console.error('[feedback-api] error:', err);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
