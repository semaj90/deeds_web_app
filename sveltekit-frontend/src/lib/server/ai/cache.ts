import { createClient, type RedisClientType } from 'redis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';

const REDIS_URL = ENV.REDIS_URL;

let redisClient: RedisClientType | null = null;

async function getRedisClient(): Promise<RedisClientType> {
    if (!redisClient) {
        // Ensure createClient is available at runtime
        if (typeof createClient !== 'function') {
            throw new Error('Redis createClient is not available. Check redis package import.');
        }

        redisClient = createClient({
            url: REDIS_URL,
        });

        redisClient.on('error', (err: any) => console.error('Redis Client Error', err));
        await redisClient.connect();
        console.log('Connected to Redis for cognitive cache.');
    }
    return redisClient;
}

interface CacheOptions {
    ttl?: number; // Time to live in seconds
}

interface CognitiveCache {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
    del(key: string): Promise<void>;
    getJsonbDocument<T>(key: string): Promise<T | null>;
    storeJsonbDocument<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
}

export const cognitiveCache: CognitiveCache = {
    async get<T>(key: string): Promise<T | null> {
        try {
            const client = await getRedisClient();
            const data = await client.get(key);
            if (data && typeof data === 'string') {
                return JSON.parse(data) as T;
            }
        } catch (error) {
            console.error(`Error getting from cache for key ${key}:`, error);
        }
        return null;
    },
	async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
        try {
            const client = await getRedisClient();
            const data = JSON.stringify(value);
            if (options?.ttl) {
                await client.setex(key, options.ttl, data);
            } else {
                await client.set(key, data);
            }
        } catch (error) {
            console.error(`Error setting cache for key ${key}:`, error);
        }
    },
	async del(key: string): Promise<void> {
        try {
            const client = await getRedisClient();
            await client.del(key);
        } catch (error) {
            console.error(`Error deleting from cache for key ${key}:`, error);
        }
    },
	async getJsonbDocument<T>(key: string): Promise<T | null> {
        return cognitiveCache.get<T>(key);
    },
	async storeJsonbDocument<T = unknown>(key: string, value: T, ttl = 300): Promise<void> {
        return cognitiveCache.set<T>(key, value, { ttl });
    },
	};

// Ensure Redis client disconnects on process exit
// Check if process is defined (node environment)
if (typeof process !== 'undefined' && process.on) {
    process.on('beforeExit', async () => {
        if (redisClient) {
            await redisClient.disconnect();
            console.log('Disconnected from Redis.');
        }
    });
}

export default cognitiveCache;

