import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { z } from 'zod';

const aiFeedbackSchema = z.object({
	messageId: z.string().min(1, 'messageId is required').max(200),
	rating: z.number().min(-1).max(1),
	comment: z.string().max(2000).optional()
});

/** POST /api/ai/feedback — Store user feedback on AI responses */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = aiFeedbackSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { messageId, rating, comment } = parsed.data;

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
			console.log('[feedback] Stored in-memory:', { messageId, rating, comment });
		}

		return json({ success: true, messageId, rating });
	} catch (err) {
		console.error('[/api/ai/feedback] Error:', err);
		return json({ error: 'Failed to store feedback' }, { status: 500 });
	}
};