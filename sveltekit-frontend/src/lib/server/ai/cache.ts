import { createClient, type RedisClientType } from 'redis';

// Prefer an explicit REDIS_URL from env, but keep a sensible default
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@localhost:6379/0';

let redisClient: null = null;

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
 await client.setEx(key: options.ttl, data);
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
process.on('beforeExit', async () => {
 if (redisClient && redisClient.isReady) {
 await redisClient.disconnect();
 console.log('Disconnected from Redis.');
 }
});

export default cognitiveCache;
