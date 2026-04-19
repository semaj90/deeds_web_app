import type { PageServerLoad } from './$types';
/**
 * Analytics Dashboard — Server Load
 * Fetches weekly summary + query patterns for the current user.
 */
import { getWeeklySummary, getTopQueryPatterns } from '$lib/server/analytics/event-logger.js';

const safe = <T>(p: Promise<T>, fallback: T): Promise<T> =>
	Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej('timeout'), 5000))]).catch(
		() => fallback
	);

export const load: PageServerLoad = async ({ locals }) => {
	const userId = (locals as Record<string, unknown>).userId as string | undefined;
	const uid = userId ?? 'anonymous';

	const [summary, patterns] = await Promise.all([
		safe(getWeeklySummary(uid), {
			totalQueries: 0,
			topIntents: [],
			avgLatencyMs: 0,
			cacheHitRate: 0,
			mostUsedTools: [],
			slowEndpoints: []
		}),
		safe(
			getTopQueryPatterns(uid, 10),
			[] as Array<{ query_hash: string; count: number; last_seen: string }>
		)
	]);

	return { summary, patterns, userId: uid };
}
