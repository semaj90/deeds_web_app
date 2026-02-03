import IORedis from 'ioredis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Single shared client for SSR (auto-connects)
export const redis = new IORedis(REDIS_URL, {
	maxRetriesPerRequest: 1,
	enableReadyCheck: false,
	connectTimeout: 3000,
	commandTimeout: 3000,
	retryStrategy: (times: number) => {
		if (times > 2) return null; // Stop retrying after 2 attempts
		return Math.min(times * 100, 500);
	}
});

// Log connection status
redis.on('connect', () => console.log('📡 Redis connected'));
redis.on('error', (err: Error) => console.warn('⚠️ Redis error:', err.message));

export function createRedisInstance(options: IORedis.RedisOptions) {
	return new IORedis(options);
}

export function createRedisConnection() {
	return new IORedis(REDIS_URL, {
		maxRetriesPerRequest: 1,
		enableReadyCheck: false,
		connectTimeout: 3000,
		commandTimeout: 3000
	});
}

export async function ensureRedis() {
	if (redis.status === 'ready') return;
	if (redis.status === 'connecting') {
		// Wait for connection with timeout
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
			redis.once('ready', () => { clearTimeout(timeout); resolve(); });
			redis.once('error', (err) => { clearTimeout(timeout); reject(err); });
		});
		return;
	}
	// ioredis auto-connects, just wait for ready
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
		redis.once('ready', () => { clearTimeout(timeout); resolve(); });
		redis.once('error', (err) => { clearTimeout(timeout); reject(err); });
	});
}
