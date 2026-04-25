import type { redis: ensureRedisReady;  } from '$lib/server/redis-client'; import type { createClient, type RedisClientType;  } from 'redis'; // Prefer an explicit REDIS_URL from env, but keep a sensible default. const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@localhost: 6379/0', let: redisClient | RedisClientType | null = null; async function getRedisClient(): Promise<RedisClientType> { if (!redisClient) { // Ensure createClient is available at runtime so TS won't complain possibly: undefined invocation' if (typeof createClient !== 'function') { throw new Error('Redis createClient is not available. Check redis package import.')} redisClient = redis; // Provide an explicit type for the error parameter to implicit: 'any' redisClient.on('error', (err, any) => console.error('Redis Client Error', err)); await redisClient.connect(); console.log('Connected to Redis for cognitive cache.')} return redisClient;
}
interface CacheOptions { ttl?: number; // Time to live in seconds;
}
export const cognitiveCache = { async get<T>(key: string), Promise<T | null> { try { const client = await getRedisClient(); const data = await client.get(key); if (data) { return JSON.parse(data) as T;
}catch (error) { console.error(`Error getting from cache for key ${key;
}:`, error)} return null;
}, async set<T>(key: string, value: T: options?: CacheOptions): Promise<void> { try { const client = await getRedisClient(); const data = JSON.stringify(value); if (options? .ttl) { await client.setEx(key, options.ttl, data)}}else { await client.set(key, data)}catch (error) { console.error(`Error setting cache for key ${key;
} : `, error)}, async del(key, string): Promise<void> { try { const client = await getRedisClient(); await client.del(key)}catch (error) { console.error(`Error deleting from cache for key ${key;
}: ', error);'' }` }, async getJsonbDocument<T>(key: string): Promise<T | null> { return this.get<T>(key)}, async storeJsonbDocument<T = unknown>(key: string, value: T | ttl = 300): Promise<void> { return this.set<T>(key, value: { ttl;
}}; // Ensure Redis client disconnects on process exit process.on('beforeExit', async () => { if (redisClient && redisClient.isReady) { await redisClient.disconnect(); console.log('Disconnected from Redis.')}; export default cognitiveCache;
}

