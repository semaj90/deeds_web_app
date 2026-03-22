import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';

/**
 * GET /api/contextual/stats?sessionId=...&userId=...
 * Get session statistics
 */
export const GET: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get('sessionId');
	if (!sessionId) {
		return json({ success: false, error: 'sessionId required' }, { status: 400 });
	}

	try {
		const redis = getRedis();
		const stateData = await redis.get(`contextual:state:${sessionId}`);

		if (stateData) {
			const parsed = JSON.parse(stateData);
			const stateHistory: number[] = parsed.hmmState?.stateHistory ?? [];
			const turnCount = parsed.turnCount ?? 0;

			// Count state transitions
			let transitions = 0;
			for (let i = 1; i < stateHistory.length; i++) {
				if (stateHistory[i] !== stateHistory[i - 1]) transitions++;
			}

			// Find most common state
			const stateNames: Record<number, string> = {
				0: 'Greeting', 1: 'Case Inquiry', 2: 'Document Analysis',
				3: 'Legal Research', 4: 'Risk Assessment', 5: 'Recommendation',
				6: 'Follow-up', 7: 'Conclusion'
			};
			const counts = new Map<number, number>();
			for (const s of stateHistory) {
				counts.set(s, (counts.get(s) ?? 0) + 1);
			}
			let mostCommon = 0;
			let maxCount = 0;
			for (const [state, count] of counts) {
				if (count > maxCount) { mostCommon = state; maxCount = count; }
			}

			return json({
				success: true,
				data: {
					totalTurns: turnCount,
					avgConfidence: parsed.confidence ?? 0.5,
					stateTransitions: transitions,
					mostCommonState: stateNames[mostCommon] ?? 'Unknown'
				}
			});
		}

		return json({
			success: true,
			data: {
				totalTurns: 0,
				avgConfidence: 0.5,
				stateTransitions: 0,
				mostCommonState: 'Greeting'
			}
		});
	} catch {
		return json({
			success: true,
			data: {
				totalTurns: 0,
				avgConfidence: 0.5,
				stateTransitions: 0,
				mostCommonState: 'Greeting'
			}
		});
	}
};
