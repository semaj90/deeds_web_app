/**
 * /api/cache — CRUD cache operations
 * Used by: CacheDemo.svelte
 *
 * GET ?action=stats — cache statistics
 * GET ?action=health — cache health
 * GET ?key=xxx — retrieve cached value
 * POST { key, value, options } — set cached value
 * DELETE ?key=xxx — delete single key
 * DELETE ?action=clear — clear all cache
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis.js';

const memoryCache = new Map<string, { value: unknown; expires: number; priority?: string; tags?: string[] }>();

function getMemoryStats() {
	let totalSize = 0;
	let expired = 0;
	const now = Date.now();
	for (const [, entry] of memoryCache) {
		if (entry.expires < now) expired++;
		totalSize++;
	}
	return { totalSize, expired, active: totalSize - expired };
}

export const GET: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action');
	const key = url.searchParams.get('key');

	if (action === 'stats') {
		const mem = getMemoryStats();
		let redisKeys = 0;
		let redisMemory = '0';
		try {
			redisKeys = await redis.dbsize();
			const info = await redis.info('memory');
			const match = info.match(/used_memory_human:(\S+)/);
			redisMemory = match?.[1] ?? '0';
		} catch { /* Redis unavailable */ }

		return json({
			success: true,
			stats: {
				memory: { items: mem.active, expired: mem.expired, total: mem.totalSize },
				redis: { keys: redisKeys, memoryUsed: redisMemory },
				combined: { totalItems: mem.active + redisKeys }
			}
		});
	}

	if (action === 'health') {
		let redisHealthy = false;
		try {
			const pong = await redis.ping();
			redisHealthy = pong === 'PONG';
		} catch { /* Redis down */ }

		return json({
			success: true,
			health: {
				memory: { status: 'healthy', items: getMemoryStats().active },
				redis: { status: redisHealthy ? 'healthy' : 'unavailable' },
				overall: redisHealthy ? 'healthy' : 'degraded'
			}
		});
	}

	if (key) {
		// Try memory first
		const memEntry = memoryCache.get(key);
		if (memEntry && memEntry.expires > Date.now()) {
			return json({ success: true, cached: true, value: memEntry.value, source: 'memory' });
		}
		// Try Redis
		try {
			const result = await redis.get(key);
			if (result) {
				try {
					return json({ success: true, cached: true, value: JSON.parse(result), source: 'redis' });
				} catch {
					return json({ success: true, cached: true, value: result, source: 'redis' });
				}
			}
		} catch { /* Redis unavailable */ }
		return json({ success: true, cached: false });
	}

	return json({ success: false, error: 'Missing action or key parameter' }, { status: 400 });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { key, value, options } = body;

	if (!key || value === undefined) {
		return json({ success: false, error: 'key and value are required' }, { status: 400 });
	}

	const ttl = options?.ttl ?? 300000; // 5min default
	const expires = Date.now() + ttl;

	// Store in memory
	memoryCache.set(key, { value, expires, priority: options?.priority, tags: options?.tags });

	// Also store in Redis
	try {
		const ttlSeconds = Math.ceil(ttl / 1000);
		await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
	} catch { /* Redis unavailable, memory-only */ }

	return json({ success: true, key, ttl });
};

export const DELETE: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action');
	const key = url.searchParams.get('key');

	if (action === 'clear') {
		memoryCache.clear();
		try { await redis.flushdb(); } catch { /* Redis unavailable */ }
		return json({ success: true, message: 'Cache cleared' });
	}

	if (key) {
		memoryCache.delete(key);
		try { await redis.del(key); } catch { /* Redis unavailable */ }
		return json({ success: true, key });
	}

	return json({ success: false, error: 'Missing action or key parameter' }, { status: 400 });
};
