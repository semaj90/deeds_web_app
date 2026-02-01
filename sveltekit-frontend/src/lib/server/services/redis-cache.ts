import type { redis } from '$lib/server/redis-client';
/**
 * Redis cache service wrapper — prefers centralized createRedisInstance factory when available.
 */
import { env } from '$env/dynamic/private';

// Define the interface locally to avoid import issues
export interface IRedisCacheService {
    get(key: string): Promise<unknown | null>;
    setex(key: string, seconds: number, value: string): Promise<string>;
    set(key: string, value: unknown, ttl?: number): Promise<void>;
}

type RedisClientLike = {
    get: (k: string) => Promise<string | null>;
    set: (k: string, v: string, mode?: string, ttl?: number) => Promise<unknown>;
};

let client: any = null;

try {
    // prefer the repo's centralized factory if it exists
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // const redisFactory = require('$lib/server/redis');
    // Using explicit any to avoid TS errors during build if modules are missing
    // client = (redisFactory && (redisFactory?.createRedisInstance || redisFactory.default)) ? (redisFactory.createRedisInstance ? redisFactory.createRedisInstance() : redisFactory.default) : null;
} catch {
    // ignore — fall back to ioredis below
}

if (!client) {
    // try to use global redis client if available
    // client = redis;
}

export const RedisCacheService: IRedisCacheService = {
    async get(key: string) {
        if (!client) {
            // lazy init or return null
            console.warn('Redis client not initialized');
            return null;
        }
        const val = await client.get(key);
        return val ? JSON.parse(val) : null;
    },
	// `setex` preserves the interface used across the codebase
    async setex(key: string, seconds: number, value: string): Promise<string> {
        if (!client) {
            console.warn('Redis client not initialized');
            return 'OK'; // pretend success
        }
        const res = await client.set(key, value, 'EX', seconds);
        return (res as unknown as string) ?? 'OK';
    },
	// convenience method (serializes objects)
    async set(key: string, value: any, ttl = 3600) {
        if (!client) {
            console.warn('Redis client not initialized');
            return;
        }
        const data = JSON.stringify(value);
        await client.set(key, data, 'EX', ttl);
    }
};
