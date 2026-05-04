/**
 * POST /api/test/redis-write
 *
 * Minimal test to verify Redis writes work from SvelteKit
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const POST: RequestHandler = async () => {
  if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
  try {
    const redis = getRedis();
    const testKey = `test:${Date.now()}`;
    const testValue = JSON.stringify({ test: true, timestamp: new Date().toISOString() });

    // Write to Redis
    await redis.set(testKey, testValue, 'EX', 60);
    console.log(`[test-redis-write] Wrote key: ${testKey}`);

    // Read back
    const retrieved = await redis.get(testKey);
    console.log(`[test-redis-write] Read back: ${retrieved}`);

    // Count all keys
    const allKeys = await redis.keys('*');
    console.log(`[test-redis-write] Total keys in Redis: ${allKeys.length}`);

    return json({
      success: true,
      wrote: testKey,
      retrieved: retrieved ? JSON.parse(retrieved) : null,
      totalKeys: allKeys.length,
    });
  } catch (err) {
    console.error('[test-redis-write] Error:', err);
    return json({
      success: false,
      error: (err as Error).message,
    }, { status: 500 });
  }
};
