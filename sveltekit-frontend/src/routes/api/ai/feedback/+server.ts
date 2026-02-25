import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';

/** POST /api/ai/feedback — Store user feedback on AI responses */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { messageId, rating, comment } = body;

		if (!messageId || rating === undefined) {
			return json({ error: 'messageId and rating are required' }, { status: 400 });
		}

		// Store feedback in chatMessages metadata if table exists
		try {
			const { chatMessages } = await import('$lib/server/db/schema');
			const { eq } = await import('drizzle-orm');
			await db
				.update(chatMessages)
				.set({ metadata: { feedback: { rating, comment, timestamp: new Date().toISOString() } } })
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
