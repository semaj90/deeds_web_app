/**
 * Redis Cache Layer for pgvector Search Results
 * Caches search results (NOT embeddings) for fast retrieval
 *
 * Architecture:
 * - Redis: Caches search results + metadata (TTL: 1 hour)
 * - PostgreSQL: Primary vector storage with HNSW index
 * - Ollama: Embedding generation
 */

import crypto from 'crypto';
import { redis } from './redis'; // Use local wrapper

const SEARCH_CACHE_PREFIX = 'search:pgvector:';
const EMBEDDING_CACHE_PREFIX = 'embedding:';
const STATS_KEY_HITS = 'search:cache:stats:hits';
const STATS_KEY_MISSES = 'search:cache:stats:misses';
const DEFAULT_TTL = 3600; // 1 hour

/**
 * Interface for cached search result
 */
export interface CachedSearchResult {
    query: string;
    results: Array<{
        id: string;
        title: string;
        content?: string;
        score: number;
        [key: string]: unknown;
    }>;
    stats: {
        totalResults: number;
        processingTimeMs: number;
    };
    timestamp: number;
    ttl: number;
}

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
 * Sets a value in Redis cache with TTL
 */
export async function setCache(key: string, value: string, ttl?: number): Promise<void> {
    try {
        if (typeof ttl === 'number') {
            await redis.setex(key, ttl, value);
        } else {
            await redis.set(key, value);
        }
    } catch (error) {
        console.error('Redis error:', error);
    }
}

/**
 * Gets a value from Redis cache
 */
export async function getCache(key: string): Promise<string | null> {
    try {
        return await redis.get(key);
    } catch (error) {
        console.error('Redis error:', error);
        return null;
    }
}

/**
 * Deletes a value from Redis cache
 */
export async function deleteCache(key: string): Promise<boolean> {
    try {
        return await redis.del(key) > 0;
    } catch (error) {
        console.error('Redis error:', error);
        return false;
    }
}

/**
 * Cache search results with metadata
 */
export async function cacheSearchResult(
    key: string,
    data: CachedSearchResult,
    ttl: number = DEFAULT_TTL
): Promise<boolean> {
    try {
        await setCache(key, JSON.stringify(data), ttl);
        return true;
    } catch (error) {
        console.error('Error caching result:', error);
        return false;
    }
}

/**
 * Retrieve cached search result
 */
export async function getCachedSearchResult(key: string): Promise<CachedSearchResult | null> {
    try {
        const cached = await getCache(key);
        if (!cached) {
            await recordCacheHit(false);
            return null;
        }
        await recordCacheHit(true);
        return JSON.parse(cached) as CachedSearchResult;
    } catch (error) {
        console.error('Error getting cached result:', error);
        return null;
    }
}

/**
 * Cache embedding vector
 */
export async function cacheEmbedding(
    text: string,
    embedding: number[],
    ttl: number = DEFAULT_TTL
): Promise<boolean> {
    try {
        const key = generateEmbeddingCacheKey(text);
        await setCache(key, JSON.stringify(embedding), ttl);
        return true;
    } catch (error) {
        console.error('Error embedding cache:', error);
        return false;
    }
}

/**
 * Get cached embedding
 */
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
    try {
        const key = generateEmbeddingCacheKey(text);
        const cached = await getCache(key);
        return cached ? (JSON.parse(cached) as number[]) : null;
    } catch (error) {
        console.error('Error getting embedding:', error);
        return null;
    }
}

/**
 * Record cache statistics (hits/misses)
 */
async function recordCacheHit(hit: boolean): Promise<void> {
    try {
        const key = hit ? STATS_KEY_HITS : STATS_KEY_MISSES;
        await redis.incr(key);
    } catch (error) {
        console.error('Error recording stat:', error);
    }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ hits: number; misses: number; hitRate: number }> {
    try {
        const hitsStart = await redis.get(STATS_KEY_HITS);
        const missesStart = await redis.get(STATS_KEY_MISSES);

        const hits = parseInt(hitsStart ?? '0', 10);
        const misses = parseInt(missesStart ?? '0', 10);
        const total = hits + misses;

        return {
            hits,
            misses,
            hitRate: total > 0 ? hits / total : 0
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return { hits: 0, misses: 0, hitRate: 0 };
    }
}

/**
 * Clear all search cache
 * Note: Uses basic keys command which is not optimal for production but fine for development/admin
 */
export async function clearSearchCache(): Promise<number> {
    try {
        // Implementation note: In production, scan should be used instead of keys
        // Since the wrapper doesn't expose keys/scan, we can't do this easily without direct client access
        // For now, this is a placeholder or requires extending the wrapper
        console.warn('clearSearchCache not fully implemented via wrapper');
        return 0;
    } catch (error) {
        console.error('Error clearing cache:', error);
        return 0;
    }
}
