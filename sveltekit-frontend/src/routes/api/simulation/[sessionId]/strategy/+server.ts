/**
 * POST /api/simulation/[sessionId]/strategy
 *
 * GRPO Strategy Wizard — runs 4-step reasoning chain (RAG → KAG → Semantic → LLM)
 * and returns 4 ranked strategic recommendations with who/what/why/how taxonomy.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis.js';
import { isUuid } from '$lib/server/validation.js';
import { generateStrategyRecommendations } from '$lib/server/simulation/grpo-strategy.js';
import type { SimulationSession } from '../../+server';

const SESSION_PREFIX = 'sim:session:';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!isUuid(params.sessionId)) {
		return json({ error: 'Invalid session ID' }, { status: 400 });
	}

	try {
		const raw = await redis.get(SESSION_PREFIX + params.sessionId);
		if (!raw) {
			return json({ error: 'Session not found or expired' }, { status: 404 });
		}

		const session = JSON.parse(raw) as SimulationSession;
		if (session.userId !== locals.user.id) {
			return json({ error: 'Access denied' }, { status: 403 });
		}
		if (session.status !== 'active') {
			return json({ error: 'Session is no longer active' }, { status: 400 });
		}

		const result = await generateStrategyRecommendations(session);

		return json({
			recommendations: result.recommendations,
			thinking: result.thinking,
			searchTimings: result.searchTimings,
		});
	} catch (err) {
		console.error('[simulation/strategy] POST error:', err);
		return json({ error: 'Failed to generate strategy recommendations' }, { status: 500 });
	}
};
