/**
 * /api/cache/nintendo — Nintendo-themed memory bank stats
 * Used by: CachePerformanceDashboard.svelte
 *
 * Maps Redis memory usage to NES/CHR-ROM bank metaphor
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis.js';

export const GET: RequestHandler = async () => {
	const maxMemory = 8192; // 8KB banks metaphor

	try {
		const memInfo = await redis.info('memory');
		const statsInfo = await redis.info('stats');

		const usedMemory = parseInt(memInfo.match(/used_memory:(\d+)/)?.[1] ?? '0');
		const evictedKeys = parseInt(statsInfo.match(/evicted_keys:(\d+)/)?.[1] ?? '0');
		const dbSize = await redis.dbsize();

		// Map real memory to NES bank metaphor (scale to 8192 range)
		const memoryUsage = Math.min((usedMemory / (1024 * 1024)) * 1024, maxMemory);

		return json({
			memoryUsage,
			maxMemory,
			activeBankId: Math.floor((memoryUsage / maxMemory) * 8) % 8,
			textureCount: dbSize,
			activeStreams: 1,
			evictions: evictedKeys,
			bankSwitches: Math.floor(evictedKeys / 10)
		});
	} catch {
		// Redis unavailable
		return json({
			memoryUsage: 0,
			maxMemory,
			activeBankId: 0,
			textureCount: 0,
			activeStreams: 0,
			evictions: 0,
			bankSwitches: 0
		});
	}
};
