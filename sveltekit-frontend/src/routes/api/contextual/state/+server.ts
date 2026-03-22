import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

/**
 * GET /api/contextual/state?sessionId=...&userId=...
 * Get HMM contextual state for a session
 */
export const GET: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get('sessionId');
	if (!sessionId) {
		return json({ success: false, error: 'sessionId required' }, { status: 400 });
	}

	try {
		const redis = getRedis();
		const cached = await redis.get(`contextual:state:${sessionId}`);

		if (cached) {
			return json({ success: true, data: JSON.parse(cached) });
		}

		// Default initial state
		return json({
			success: true,
			data: {
				hmmState: {
					currentState: 0,
					stateHistory: [0],
					transitionMatrix: []
				},
				confidence: 0.5,
				extractedEntities: [],
				turnCount: 0
			}
		});
	} catch {
		return json({
			success: true,
			data: {
				hmmState: { currentState: 0, stateHistory: [0], transitionMatrix: [] },
				confidence: 0.5,
				extractedEntities: [],
				turnCount: 0
			}
		});
	}
};

/**
 * DELETE /api/contextual/state?sessionId=...
 * Clear session state and history
 */
export const DELETE: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get('sessionId');
	if (!sessionId) {
		return json({ success: false, error: 'sessionId required' }, { status: 400 });
	}

	try {
		const redis = getRedis();
		await redis.del(`contextual:state:${sessionId}`);
		await redis.del(`contextual:history:${sessionId}`);
	} catch {
		// Non-blocking
	}

	return json({ success: true });
};
