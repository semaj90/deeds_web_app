/**
 * Redis Cache Wrapper
 * Simple wrapper around Redis client with common operations
 */

import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';

let client: ReturnType<typeof createClient> | null = null;

/**
 * Get or create Redis client
 */
export async function getRedisClient() {
    if (!client) {
        client = createClient({ url: redisUrl });
        client.on('error', (err) => console.error('Redis error:', err));
        await client.connect();
    }
    return client;
}

export const cache = {
    get: async <T>(key: string): Promise<T | null> => {
        const client = await getRedisClient();
        if (!client) return null;
        const result = await client.get(key);
        if (!result) return null;
        try {
            return JSON.parse(result as string) as T;
        } catch (e) {
            console.error('Cache parse error', e);
            return null;
        }
    },
    set: async (key: string, value: any, ttlSeconds?: number) => {
        const client = await getRedisClient();
        if (!client) return;
        const str = JSON.stringify(value);
        if (ttlSeconds) {
            await client.set(key, str, { EX: ttlSeconds });
        } else {
            await client.set(key, str);
        }
    },
    del: async (key: string) => {
        const client = await getRedisClient();
        await client?.del(key);
    }
};

