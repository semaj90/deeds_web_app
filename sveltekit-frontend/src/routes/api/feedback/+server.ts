/**
 * POST /api/feedback
 * Record user feedback for document relevance ranking
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { feedbackStore } from '$lib/server/ml/feedback-store.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { z } from 'zod';

const feedbackSchema = z.object({
	documentId: z.string().min(1, 'documentId is required').max(200),
	rating: z.number().min(0).max(1)
});

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	await requireAuth(event);

	try {
		const raw = await event.request.json();
		const parsed = feedbackSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { documentId, rating } = parsed.data;

		feedbackStore.recordFeedback(documentId, rating);

		return json({
			success: true,
			boost: feedbackStore.getFeedbackBoost(documentId),
			totalTracked: feedbackStore.size
		});
	} catch (err) {
		console.error('[feedback] Error:', err);
		return json({ success: false, error: 'Failed to record feedback' }, { status: 500 });
	}
};
