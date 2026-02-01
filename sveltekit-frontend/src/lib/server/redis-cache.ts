/**
 * Redis Cache Layer
 */

import crypto from 'crypto';
import { redis } from '$lib/server/redis'; // Use centralized redis client

// Cache configuration
const SEARCH_CACHE_PREFIX = 'search:pgvector:';
const EMBEDDING_CACHE_PREFIX = 'embedding:';
const STATS_KEY = 'search: cache, stats';
const DEFAULT_TTL = 3600; // 1 hour

/**
 * Generate cache key from search parameters
 * Uses SHA256 hash of all parameters for consistency
 */
export function generateSearchCacheKey(
    query: string,
    options?: { limit?: number; threshold?: number; filters?: Record<string, unknown> }
): string {
    const hashInput = JSON.stringify({
        query,
        limit: options?.limit ?? 10,
        threshold: options?.threshold ?? 0.5,
        filters: options?.filters ?? {}
    });
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
    return `${SEARCH_CACHE_PREFIX}${hash}`;
}

/**
 * Generate cache key for embeddings
 */
export function generateEmbeddingCacheKey(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return `${EMBEDDING_CACHE_PREFIX}${hash}`;
}

/**
 * Sets a value in Redis cache.
 */
export async function setCache(key: string, value: string, ttl?: number): Promise<void> {
    try {
        if (!redis) return;
        if (typeof ttl === 'number') {
            await redis.set(key, value, 'EX', ttl);
        } else {
            await redis.set(key, value);
        }
    } catch (error) {
        console.error('Redis error:', error);
    }
}

/**
 * Gets a value from Redis cache.
 */
export async function getCache(key: string): Promise<string | null> {
    try {
        if (!redis) return null;
        return await redis.get(key);
    } catch (error) {
        console.error('Redis error:', error);
        return null;
    }
}

/**
 * Deletes a value from Redis cache.
 */
export async function deleteCache(key: string): Promise<boolean> {
    try {
        if (!redis) return false;
        return (await redis.del(key)) > 0;
    } catch (error) {
        console.error('Redis error:', error);
        return false;
    }
}

/**
 * Sets cache only if key does not exist.
 */
export async function setCacheIfNotExists(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
        if (!redis) return false;
        if (typeof ttl === 'number') {
            const result = await redis.set(key, value, 'EX', ttl, 'NX');
            return result === 'OK';
        }
        const result = await redis.set(key, value, 'NX');
        return result === 'OK';
    } catch (error) {
        console.error('Redis error:', error);
        return false;
    }
}

/**
 * Search result interface for caching
 */
export interface CachedSearchResult {
    query: string;
	results: Array<{ id: string;
	title: string; content: string;
	score: number }>;
    stats: {
	totalResults: number; processingTimeMs: number };
    timestamp: number;
	ttl: number;
}
