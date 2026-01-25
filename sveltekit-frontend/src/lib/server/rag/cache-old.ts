// src/lib/server/rag/cache-old.ts

import { createHash } from 'crypto';
import { getRedisClient, isRedisAvailable } from '../redis.js';

// Cache TTL configuration from environment (in seconds)
const CACHE_TTL_SEARCH = parseInt(process.env.RAG_CACHE_TTL_SEARCH ?? '300'); // 5 minutes
const CACHE_TTL_CHAT = parseInt(process.env.RAG_CACHE_TTL_CHAT ?? '1800'); // 30 minutes
const CACHE_TTL_HEALTH = parseInt(process.env.RAG_CACHE_TTL_HEALTH ?? '60'); // 1 minute
const CACHE_TTL_TAGS = parseInt(process.env.RAG_CACHE_TTL_TAGS ?? '3600'); // 1 hour

type CacheType = 'search' | 'chat' | 'health' | 'tags';

/**
 * Generate consistent cache key for RAG operations
 */
function generateCacheKey(type: CacheType, params: Record<string, any>): string {
    // Sort keys for consistent hashing
    const sortedParams = Object.keys(params)
        .sort()
        .reduce(
            (obj, key) => {
                obj[key] = params[key];
                return obj;
            },
            {} as Record<string, any>
        );

    // Create hash of parameters
    const paramsHash = createHash('sha256')
        .update(JSON.stringify(sortedParams))
        .digest('hex')
        .substring(0, 16); // Use first 16 chars for brevity

    return `rag:${type}:${paramsHash}`;
}

/**
 * Get TTL for cache type
 */
function getTTL(type: CacheType): number {
    switch (type) {
        case 'search':
            return CACHE_TTL_SEARCH;
        case 'chat':
            return CACHE_TTL_CHAT;
        case 'health':
            return CACHE_TTL_HEALTH;
        case 'tags':
            return CACHE_TTL_TAGS;
        default:
            return 300; // Default 5 minutes
    }
}

/**
 * Safe JSON parse with fallback
 */
function safeJsonParse<T>(json: string | null): T | null {
    if (!json) return null;

    try {
        return JSON.parse(json) as T;
    } catch (error) {
        console.warn('Failed to parse cached JSON:', error);
        return null;
    }
}

/**
 * Get cached data for RAG operation
 */
export async function getCached<T>(
    type: CacheType, params: Record<string, any>
): Promise<T | null> {
    try {
        if (!(await isRedisAvailable())) {
            return null;
        }

        const redis = await getRedisClient();
        const key = generateCacheKey(type, params);
        const cached = await redis.get(key);

        return safeJsonParse<T>(cached);
    } catch (error) {
        console.warn(`Cache get failed for ${type}:`, error);
        return null;
    }
}

/**
 * Set cached data for RAG operation
 */
export async function setCached<T>(
    type: CacheType, params: Record<string, any>,
    data: T,
    customTTL?: number
): Promise<void> {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }

        const redis = await getRedisClient();
        const key = generateCacheKey(type, params);
        const ttl = customTTL ?? getTTL(type);

        await redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
        console.warn(`Cache set failed for ${type}:`, error);
        // Don't throw - caching is optional
    }
}

/**
 * Invalidate cache for specific type and params
 */
export async function invalidateCache(type: CacheType, params: Record<string, any>): Promise<void> {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }

        const redis = await getRedisClient();
        const key = generateCacheKey(type, params);
        await redis.del(key);
    } catch (error) {
        console.warn(`Cache invalidation failed for ${type}:`, error);
    }
}

/**
 * Invalidate all cache entries for a type
 */
export async function invalidateCacheByType(type: CacheType): Promise<void> {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }

        const redis = await getRedisClient();
        const pattern = `rag:${type}:*`;

        // Use SCAN for safe key iteration
        const keys: string[] = [];
        for await (const key of redis.scanIterator({ MATCH: pattern })) {
            keys.push(key);
        }

        if (keys.length > 0) {
            await redis.del(keys);
        }
    } catch (error) {
        console.warn(`Cache type invalidation failed for ${type}:`, error);
    }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    available: boolean;
    keyCount: number;
    memoryUsage?: string;
} | null> {
    try {
        if (!(await isRedisAvailable())) {
            return { available: false, keyCount: 0 };
        }

        const redis = await getRedisClient();

        // Count RAG-related keys
        let keyCount = 0;
        for await (const key of redis.scanIterator({ MATCH: 'rag:*' })) {
             // @ts-ignore
            keyCount++;
        }

        // Get memory info if available
        let memoryUsage: string | undefined;
        try {
            const info = await redis.info('memory');
            const match = info.match(/used_memory_human:([^\r\n]+)/);
            memoryUsage = match?.[1]?.trim();
        } catch {
            // Memory info not available
        }

        return {
            available: true,
            keyCount,
            memoryUsage,
        };
    } catch (error) {
        console.warn('Failed to get cache stats:', error);
        return null;
    }
}

/**
 * RAG Response Caching (Simple Key-Based)
 */
export function ragCacheKey(input: unknown): string {
    const s = JSON.stringify(input);
    return 'rag:ans:' + createHash('sha256').update(s).digest('hex');
}

export async function ragCacheGet(key: string) {
    try {
        if (!(await isRedisAvailable())) {
            return null;
        }
        const r = await getRedisClient();
        const v = await r.get(key);
        return v ? safeJsonParse(v) : null;
    } catch (error) {
        console.warn('RAG cache get failed:', error);
        return null;
    }
}

export async function ragCacheSet(key: string, value: unknown): Promise<void> {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }
        const r = await getRedisClient();
        await r.setex(key, CACHE_TTL_SEARCH, JSON.stringify(value));
    } catch (error) {
        console.warn('RAG cache set failed:', error);
    }
}

// GPU Engine Manifest Caching
export interface GpuEngineManifest {
    engineId: string;
    sha256: string;
    path: string;
    model: string;
    version: string;
    createdAt: string;
    sizeBytes: number;
}

export async function gpuEngineSet(manifest: GpuEngineManifest) {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }
        const r = await getRedisClient();
        const key = `gpu:engine:${manifest.engineId}`;
        const shaKey = `gpu:engine:by_sha:${manifest.sha256}`;
        await r.setex(key, CACHE_TTL_TAGS * 7, JSON.stringify(manifest)); // 7 days for engines
        await r.setex(shaKey, CACHE_TTL_TAGS * 7, manifest.engineId);
    } catch (error) {
        console.warn('GPU engine cache set failed:', error);
    }
}

export async function gpuEngineGet(engineId: string): Promise<GpuEngineManifest | null> {
    try {
        if (!(await isRedisAvailable())) {
            return null;
        }
        const r = await getRedisClient();
        const key = `gpu:engine:${engineId}`;
        const v = await r.get(key);
        return safeJsonParse<GpuEngineManifest>(v);
    } catch (error) {
        console.warn('GPU engine cache get failed:', error);
        return null;
    }
}

export async function gpuEngineGetBySha(sha256: string): Promise<string | null> {
    try {
        if (!(await isRedisAvailable())) {
            return null;
        }
        const r = await getRedisClient();
        const key = `gpu:engine:by_sha:${sha256}`;
        return await r.get(key);
    } catch (error) {
        console.warn('GPU engine SHA cache get failed:', error);
        return null;
    }
}

// Semantic Caching with Embeddings
export interface SemanticCacheEntry {
    query: string;
    embedding: number[];
    result: unknown;
    timestamp: number;
}

export async function semanticCacheSet(query: string, embedding: number[], result: unknown): Promise<void> {
    try {
        if (!(await isRedisAvailable())) {
            return;
        }
        const r = await getRedisClient();
        const key = `semantic:query:${ragCacheKey(query)}`;
        const entry: SemanticCacheEntry = {
            query,
            embedding,
            result,
            timestamp: Date.now(),
        };
        await r.setex(key, CACHE_TTL_CHAT, JSON.stringify(entry)); // 30 minutes for semantic cache
    } catch (error) {
        console.warn('Semantic cache set failed:', error);
    }
}

export async function semanticCacheSearch(
    embedding: number[],
    threshold = 0.95
): Promise<SemanticCacheEntry | null> {
    try {
        if (!(await isRedisAvailable())) {
            return null;
        }
        const r = await getRedisClient();
        const keys = await r.keys('semantic:query:*');
        for (const key of keys.slice(0, 10)) {
            // Check last 10
            const v = await r.get(key);
            if (v) {
                const entry = safeJsonParse<SemanticCacheEntry>(v);
                if (entry) {
                    const similarity = cosineSimilarity(embedding, entry.embedding);
                    if (similarity >= threshold) {
                        return entry;
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.warn('Semantic cache search failed:', error);
        return null;
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Utility function for safe keyword extraction from cached JSON
 */
export function extractKeywords(data: any): string[] {
    try {
        if (!data) return [];

        // Handle different possible structures
        if (Array.isArray(data)) {
            return data.filter((item) => typeof item === 'string');
        }

        if (typeof data === 'object') {
            // Look for common keyword fields
            const keywordFields = ['keywords', 'tags', 'terms', 'entities'];
            for (const field of keywordFields) {
                if (Array.isArray(data[field])) {
                    return data[field].filter((item: any) => typeof item === 'string');
                }
            }
        }

        if (typeof data === 'string') {
            // Try to parse as JSON first
            const parsed = safeJsonParse(data);
            if (parsed) {
                return extractKeywords(parsed);
            }

            // Split by common delimiters
            return data
                .split(/[,|\n]/)
                .map((s) => s.trim())
                .filter(Boolean);
        }

        return [];
    } catch (error) {
        console.warn('Failed to extract keywords:', error);
        return [];
    }
}
