/**
 * /api/cache/recent-queries — Recent query history with cache status
 * Used by: CachePerformanceDashboard.svelte
 *
 * Returns Array<{ query, cached, responseTime }>
 * Tracks recent queries in a Redis sorted set (by timestamp)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis.js';

const RECENT_KEY = 'cache:recent_queries';
const MAX_RECENT = 20;

export const GET: RequestHandler = async () => {
	try {
		// Get recent queries from Redis sorted set (newest first)
		const entries = await redis.zrevrange(RECENT_KEY, 0, MAX_RECENT - 1, 'WITHSCORES');

		const queries: Array<{ query: string; cached: boolean; responseTime: number }> = [];

		for (let i = 0; i < entries.length; i += 2) {
			try {
				const data = JSON.parse(entries[i]);
				queries.push(data);
			} catch {
				// Skip malformed entries
			}
		}

		return json(queries);
	} catch {
		// Redis unavailable — return empty
		return json([]);
	}
};

/** POST to record a new query (called internally by search endpoints) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { query, cached, responseTime } = body;

		if (!query) {
			return json({ success: false, error: 'query is required' }, { status: 400 });
		}

		const entry = JSON.stringify({ query, cached: !!cached, responseTime: responseTime ?? 0 });
		const score = Date.now();

		await redis.zadd(RECENT_KEY, score, entry);
		// Trim to keep only recent entries
		await redis.zremrangebyrank(RECENT_KEY, 0, -(MAX_RECENT + 1));

		return json({ success: true });
	} catch {
		return json({ success: false, error: 'Redis unavailable' }, { status: 503 });
	}
};
