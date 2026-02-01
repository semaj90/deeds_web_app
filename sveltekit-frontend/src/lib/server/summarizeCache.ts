import { redis } from '$lib/server/redis';
import crypto from 'crypto';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Centralized cache utilities for summarize endpoint (memory + optional Redis)
// Provides LRU + TTL eviction and write-through to Redis if available.

export interface CachePerformanceMeta {
    duration: number;
	tokens: number;
    promptTokens: number;
	tokensPerSecond: number | string;
    modelUsed: string;
	fallbackUsed: boolean;
}

export interface SummarizeCacheEntry {
    summary: string;
    structured?: any;
	model: string;
    mode?: string;
    type?: string;
	ts: number; // creation timestamp
    lastAccess: number; // last access timestamp (for LRU)
    perf: CachePerformanceMeta;
	ttlMs: number; // ttl applied when stored
}

const MAX_ITEMS = Number(
    (import.meta as any).env?.SUMMARIZE_CACHE_MAX_ITEMS ??
        import.meta.env?.SUMMARIZE_CACHE_MAX_ITEMS ??
        200
);
const TTL_MS = Number(
    (import.meta as any).env?.SUMMARIZE_CACHE_TTL_MS ??
        import.meta.env?.SUMMARIZE_CACHE_TTL_MS ??
        15 * 60 * 1000 // 15m default
);
const REDIS_TTL_SECS = Math.round(TTL_MS / 1000);
const REDIS_PREFIX = 'summarize:';

// Simple Map used as LRU | on get/set we delete & re-set to push to end (iteration order)
const memoryCache: Map<string, SummarizeCacheEntry> = new Map();

function getRedisClient(): any | null {
    // @ts-ignore
    return (globalThis as any).__REDIS ?? redis ?? null;
}

function evictIfNeeded() {
    // Remove expired first
    const now = Date.now();
    for (const [k, v] of memoryCache) {
        if (now - v.ts > v.ttlMs) {
            memoryCache.delete(k);
        }
    }
    // Size-based LRU eviction
    while (memoryCache.size > MAX_ITEMS) {
        // oldest = first inserted (Map preserves insertion order; we refresh on access)
        const oldestKey = memoryCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        memoryCache.delete(oldestKey);
    }
}

export function getFromMemory(key: string): SummarizeCacheEntry | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttlMs) {
        // expired
        memoryCache.delete(key);
        return null;
    }
    // refresh LRU
    entry.lastAccess = Date.now();
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry;
}

export async function getFromRedis(key: string): Promise<SummarizeCacheEntry | null> {
    const redisClient = getRedisClient();
    if (!redisClient) return null;
    try {
        const raw = await redisClient.get(REDIS_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SummarizeCacheEntry;
        // Check TTL client-side in case Redis TTL not enforced (should be though)
        if (Date.now() - parsed.ts > parsed.ttlMs) {
            return null;
        }
        // Populate memory (without re-writing to redis) for faster subsequent access
        setInMemory(key, parsed);
        return parsed;
    } catch (err: unknown) {
        console.error('[summarizeCache] Redis get error', err);
        return null;
    }
}

export function setInMemory(
    key: string,
    entry: Omit<SummarizeCacheEntry, 'lastAccess'>
): SummarizeCacheEntry {
    const full: SummarizeCacheEntry = { ...entry, lastAccess: Date.now() };
    memoryCache.delete(key); // refresh order
    memoryCache.set(key, full);
    evictIfNeeded();
    return full;
}

export async function writeThroughRedis(
    key: string,
    entry: SummarizeCacheEntry
): Promise<void> {
    const redisClient = getRedisClient();
    if (!redisClient) return;
    try {
        await redisClient.set(REDIS_PREFIX + key, JSON.stringify(entry), 'EX', REDIS_TTL_SECS);
    } catch (err: unknown) {
        console.warn('[summarizeCache] Redis set failed (non-fatal)', err);
    }
}

export async function getCache(
    key: string
): Promise<{
	entry: SummarizeCacheEntry | null; source: string }> {
    const mem = getFromMemory(key);
    if (mem) return { entry: mem, source: 'memory' };
    const red = await getFromRedis(key);
    if (red) return { entry: red, source: 'redis' };
    return { entry: null, source: 'miss' };
}

export async function setCache(
    key: string,
    entry: Omit<SummarizeCacheEntry, 'lastAccess'>
): Promise<SummarizeCacheEntry> {
    const full = setInMemory(key, entry);
    writeThroughRedis(key, full); // fire & forget
    return full;
}

export async function deleteCache(key: string): Promise<void> {
    memoryCache.delete(key);
    const redisClient = getRedisClient();
    if (redisClient) {
        try {
            await redisClient.del(REDIS_PREFIX + key);
        } catch {
            /* ignore */
        }
    }
}

export function memoryStats() {
    return {
        size: memoryCache.size,
        keys: Array.from(memoryCache.keys()).slice(0, 20),
        maxItems: MAX_ITEMS,
        ttlMs: TTL_MS
    };
}

export async function redisHas(key: string): Promise<boolean> {
    const redisClient = getRedisClient();
    if (!redisClient) return false;
    try {
        return !!(await redisClient.exists(REDIS_PREFIX + key));
    } catch {
        return false;
    }
}

export async function redisTtl(key: string): Promise<number | null> {
    const redisClient = getRedisClient();
    if (!redisClient) return null;
    try {
        const ttl = await redisClient.ttl(REDIS_PREFIX + key);
        return ttl >= 0 ? ttl : null;
    } catch {
        return null;
    }
}

export async function hashPayload(data: string): Promise<string> {
    if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
        const buf = new TextEncoder().encode(data);
        const digest = await crypto.subtle.digest('SHA-1', buf);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
    let h = 0;
    for (let i = 0; i < data.length; i++) {
        h = (h * 31 + data.charCodeAt(i)) | 0;
    }
    return `fh_${h > 0 ? h : -h}`;
}

export const CACHE_CONSTANTS = {
    MAX_ITEMS: 500, TTL_MS: 3600000, REDIS_TTL_SECS: 3600
};
