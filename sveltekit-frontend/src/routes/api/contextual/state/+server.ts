import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const querySchema = z.object({
	sessionId: z.string().min(1, 'sessionId required').max(200)
});

/**
 * GET /api/contextual/state?sessionId=...&userId=...
 * Get HMM contextual state for a session
 */
export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ success: false, error: parsed.error.issues[0]?.message ?? 'sessionId required' }, { status: 400 });
	}
	const { sessionId } = parsed.data;

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
	const delParsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!delParsed.success) {
		return json({ success: false, error: delParsed.error.issues[0]?.message ?? 'sessionId required' }, { status: 400 });
	}
	const sessionId = delParsed.data.sessionId;

	try {
		const redis = getRedis();
		await redis.del(`contextual:state:${sessionId}`);
		await redis.del(`contextual:history:${sessionId}`);
	} catch {
		// Non-blocking
	}

	return json({ success: true });
};
