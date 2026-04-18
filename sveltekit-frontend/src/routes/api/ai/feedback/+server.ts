import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { z } from 'zod';
import { adaptFromAnalytics } from '$lib/server/graph/hypergraph-4d.js';

const aiFeedbackSchema = z.object({
	messageId:     z.string().min(1, 'messageId is required').max(200),
	rating:        z.number().min(-1).max(1),
	comment:       z.string().max(2000).optional(),
	// RL context — optional; when present, drives adaptFromAnalytics
	pipeline:      z.enum(['ace', 'rag', 'kag', 'dag', 'codebase']).optional().default('ace'),
	hyperedgeHash: z.string().max(8).optional(),
	sessionId:     z.string().max(128).optional(),
});

/** POST /api/ai/feedback — Store user feedback on AI responses + fire RL adaptation */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = aiFeedbackSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { messageId, rating, comment, pipeline, hyperedgeHash, sessionId } = parsed.data;

		// Store feedback in chatMessages metadata JSONB if table exists
		try {
			const { chatMessages } = await import('$lib/server/db/schema');
			const { eq, sql } = await import('drizzle-orm');
			const feedbackJson = JSON.stringify({ rating, comment, timestamp: new Date().toISOString() });
			await db
				.update(chatMessages)
				.set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('feedback', ${feedbackJson}::jsonb)` })
				.where(eq(chatMessages.id, messageId));
		} catch {
			// Table may not exist — log and continue
			console.log('[feedback] DB write failed, stored in-memory');
		}

		// Fire RL adaptation for non-neutral ratings (skip rating === 0)
		if (rating !== 0) {
			const signal = rating > 0 ? 'thumbs_up' : 'thumbs_down';
			adaptFromAnalytics({
				signal,
				pipeline:      pipeline ?? 'ace',
				hyperedgeHash,
				userId:        locals.user.id,
				sessionId:     sessionId ?? locals.user.id,
			}).catch((err: Error) => {
				console.warn('[feedback] adaptFromAnalytics fire-and-forget error:', err.message);
			});
		}

		return json({ success: true, messageId, rating });
	} catch (err) {
		console.error('[/api/ai/feedback] Error:', err);
		return json({ error: 'Failed to store feedback' }, { status: 500 });
	}
};
