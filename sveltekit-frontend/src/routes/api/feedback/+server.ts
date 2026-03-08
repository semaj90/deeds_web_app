/**
 * POST /api/feedback
 * Record user feedback for document relevance ranking
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { feedbackStore } from '$lib/server/ml/feedback-store.js';
import { requireAuth } from '$lib/server/auth-helpers.js';

export const POST: RequestHandler = async (event) => {
	await requireAuth(event);

	try {
		const { documentId, rating } = await event.request.json();

		if (!documentId || typeof documentId !== 'string') {
			return json({ success: false, error: 'documentId is required' }, { status: 400 });
		}

		if (typeof rating !== 'number' || rating < 0 || rating > 1) {
			return json({ success: false, error: 'rating must be a number between 0 and 1' }, { status: 400 });
		}

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
