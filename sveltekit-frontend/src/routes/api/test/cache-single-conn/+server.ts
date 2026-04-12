/**
 * POST /api/test/cache-single-conn
 *
 * Test Redis cache using SINGLE connection (not pool) to isolate pooling issues.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';
import { generateCacheKey } from '$lib/server/cache/redis-exact-match.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { query?: string };
		const query = body.query || 'What is hearsay evidence in criminal law?';

		// Get SINGLE Redis connection for entire test
		const redis = getRedis();

		// Generate cache key
		const cacheKey = generateCacheKey({
			model: 'gemma4-legal',
			messages: [{ role: 'user', content: query }],
			temperature: 0.3,
			maxTokens: 200
		});

		// Test 1: Ensure key doesn't exist
		await redis.del(cacheKey);

		// Test 2: SET a value
		const testResponse = {
			content: 'Hearsay is an out-of-court statement offered to prove the truth of the matter asserted.',
			model: 'gemma4-legal',
			backend: 'test',
			cachedAt: new Date().toISOString()
		};

		const setStart = performance.now();
		await redis.set(cacheKey, JSON.stringify(testResponse), 'EX', 3600);
		const setTime = performance.now() - setStart;

		// Test 3: GET the value IMMEDIATELY (same connection)
		const getStart = performance.now();
		const retrieved = await redis.get(cacheKey);
		const getTime = performance.now() - getStart;

		const parsed = retrieved ? JSON.parse(retrieved) : null;
		const contentMatches = parsed?.content === testResponse.content;

		// Test 4: Delete
		await redis.del(cacheKey);

		return json({
			success: true,
			cacheKey: cacheKey.slice(-16),
			tests: {
				set: {
					timeMs: Math.round(setTime),
					result: '✅ SET successful'
				},
				get: {
					timeMs: Math.round(getTime),
					found: !!retrieved,
					result: retrieved ? '✅ GET successful' : '❌ GET returned null'
				},
				verify: {
					contentMatches,
					result: contentMatches ? '✅ Content matches' : '❌ Content mismatch'
				}
			},
			diagnosis: retrieved
				? '✅ Redis cache working with single connection'
				: '❌ GET failed even with single connection - Redis server issue?'
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: (err as Error)?.message ?? 'Test failed'
			},
			{ status: 500 }
		);
	}
};
