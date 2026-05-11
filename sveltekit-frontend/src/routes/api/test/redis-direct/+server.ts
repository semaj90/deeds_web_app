/**
 * POST /api/test/redis-direct
 *
 * Direct test of Redis get/set to verify cache module is working.
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
	try {
		const redis = getRedis();
		const testKey = 'test:redis:direct:' + Date.now();
		const testValue = JSON.stringify({ message: 'Hello from Redis!', timestamp: new Date().toISOString() });

		// Test 1: SET
		const setStart = performance.now();
		await redis.set(testKey, testValue, 'EX', 60);
		const setTime = performance.now() - setStart;

		// Test 2: GET
		const getStart = performance.now();
		const retrieved = await redis.get(testKey);
		const getTime = performance.now() - getStart;

		// Test 3: Verify value matches
		const matches = retrieved === testValue;

		// Test 4: DELETE
		await redis.del(testKey);

		return json({
			success: true,
			redis: {
				connectionType: redis.constructor.name,
				setTimeMs: Math.round(setTime),
				getTimeMs: Math.round(getTime),
				valueMatches: matches,
				testKey: testKey.slice(-20),
			},
			results: {
				set: '✅ SET successful',
				get: retrieved ? '✅ GET successful' : '❌ GET returned null',
				verify: matches ? '✅ Values match' : '❌ Values mismatch',
				delete: '✅ Cleanup successful',
			},
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: (err as Error)?.message ?? 'Redis test failed',
			},
			{ status: 500 }
		);
	}
};
