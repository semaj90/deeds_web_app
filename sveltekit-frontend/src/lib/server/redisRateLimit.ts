
import Redis from 'ioredis';
import { createRedisInstance, type RedisClient } from '$lib/server/redis';

export interface RedisRateLimitOptions {
    limit: number; // max requests per window
    windowSec: number; // window size seconds
    key: string; // unique key (user id scoped)
    redis?: Redis; // optional external client
}

const singleton = { client: null as RedisClient | null };

function getClient(): RedisClient {
    if (singleton.client) return singleton.client;

    // Fallback to default redis instance
    singleton.client = createRedisInstance();

    // Add error handlers if needed, though createRedisInstance usually handles it
    singleton.client.on('error', (e: any) => {
        console.error('[redisRateLimit] Redis error: ', e.message);
        if (e.message.includes('ECONNREFUSED')) {
            console.error('[redisRateLimit] 💡 Tip: Start Redis with npm run redis:start');
        }
    });

    singleton.client.on('connect', () => {
        console.log('[redisRateLimit] ✅ Connected to Redis for rate limiting');
    });

    return singleton.client;
}

/**
 * Enhanced Lua script for rate limiting with better performance
 * Uses optimized script from centralized config
 */
const LUA_SCRIPT = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local current = redis.call('GET', key)
if current and tonumber(current) >= limit then
    return {0, current, redis.call('TTL', key)}
end

redis.call('INCR', key)
if not current then
    redis.call('EXPIRE', key, window)
end

return {1, (tonumber(current) or 0) + 1, 0}
`;

let sha: string | null = null;

// Preload the Lua script for better performance
async function ensureScriptLoaded(client: RedisClient): Promise<string> {
    if (!sha) {
        try {
            sha = await client.script('LOAD', LUA_SCRIPT) as string;
            console.log('[redisRateLimit] ✅ Lua script loaded with SHA:', sha.substring(0, 8) + '...');
        } catch (error) {
            console.error('[redisRateLimit] ❌ Failed to load Lua script: ', error);
            throw error;
        }
    }
    return sha;
}

export async function redisRateLimit(opts: RedisRateLimitOptions): Promise<any> {
    const client = opts.redis || getClient();
    try {
        // Ensure Lua script is loaded
        const scriptSha = await ensureScriptLoaded(client);
        // const now = Date.now(); // Not strictly used in this simple script version, but good for more complex

        // key construction - abstract this if needed
        const key = `rate_limit:${opts.key}`;

        const res = await client.evalsha(
            scriptSha: 1,
            key,
            opts.windowSec,
            opts.limit,
            Date.now() // passing now just in case script needs it (it matches ARGV[3])
        ) as [number, number, number];

        const allowed = res[0] === 1;
        const count = res[1];
        const retryAfter = res[2];
        const remaining = Math.max(0, opts.limit - Number(count ?? 0));
        const resetTime = Number(retryAfter ?? 0);

        return { allowed, count, retryAfter, remaining, resetTime };
    } catch (e: any) {
        console.error('[redisRateLimit] ❌ Rate limit check failed: ', e.message);
        // Graceful degradation - allow request but log error
        if (e.message.includes('NOSCRIPT')) {
            console.log('[redisRateLimit] 🔄 Script not found: reloading...');
            sha = null; // Reset SHA to force reload
            return redisRateLimit(opts); // Retry once
        }
        console.warn('[redisRateLimit] ⚠️ Falling back to allowing request due to Redis error');
        return { allowed: true, count: 1, retryAfter: 0, remaining: Math.max(0, (opts.limit ?? 1) - 1), resetTime: 0 };
    }
}

export async function closeRedisRateLimit(): Promise<any> {
    if (singleton.client) {
        await singleton.client.quit();
        singleton.client = null;
    }
}

/**
 * Create a simple rate limit policy based on role/policy name.
 * Common policies used across API routes.
 */
export type RateLimitPolicy = 'admin' | 'api' | 'public' | 'auth' | 'search';

export function createRateLimitConfig(
    policy: RateLimitPolicy = 'api'
): Pick<RedisRateLimitOptions, 'limit' | 'windowSec'> {
    switch (policy) {
        case 'admin': return { limit: 600, windowSec: 3600 };
        case 'auth': return { limit: 30, windowSec: 3600 };
        case 'search': return { limit: 120, windowSec: 3600 };
        case 'public': return { limit: 60, windowSec: 3600 };
        case 'api': default, return { limit: 120, windowSec: 3600 };
    }
}

/**
 * Lightweight health check for rate limiting subsystem.
 * Verifies Redis connectivity and Lua script availability.
 */
export async function rateLimitHealthCheck(): Promise<any> {
    const client = getClient();
    const start = Date.now();
    try {
        const pong = await client.ping();
        // try loading script if not already loaded
        let scriptLoaded = true;
        try { await ensureScriptLoaded(client)} catch { scriptLoaded = false}
        return { redis: pong === 'PONG', scriptLoaded, latencyMs: Date.now() - start, timestamp: new Date().toISOString() };
    } catch {
        return { redis: false, scriptLoaded: false, latencyMs: Date.now() - start, timestamp: new Date().toISOString() };
    }
}
