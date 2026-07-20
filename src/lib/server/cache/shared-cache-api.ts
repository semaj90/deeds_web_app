// =============================================================================
// src/lib/server/cache/shared-cache-api.ts
// =============================================================================
// This module centralizes the 4 reusable cache patterns identified in the
// REDIS-CACHE-CONSOLIDATION-2026-05-29.md audit.
// All implementations should import and use patterns defined here.
//
// @param {object} config - The centralized cache configuration.
// @param {object} client - The Redis client instance.
// @param {string} keyPattern - The key pattern used for this cache.
// @param {number} ttlSeconds - The default Time-ToLive in seconds.
// @param {boolean} useHashes - Whether the cache stores data within a Redis Hash.
//
// @returns {object} An object containing cache management functions.
import { getCacheConfig } from './cache-config';
import { RedisClient } from 'redis'; // Assuming 'redis' client type is available
import { EmbeddingCache } from './embedding-cache';
import { AuthorityScorer } from './authority-scorer'; // <-- New Import

export class CacheManager {
    /**
     * Retrieves a value from a cache key, supporting TTL, hash lookups, and batch retrieval.
     * @param {string} cacheTypeKey - The key identifying the cache implementation (e.g., 'embedding').
     * @param {string} key - The unique cache key.
     * @param {number} [ttlSeconds=3600] - Time to live for this specific retrieval.
     * @returns {Promise<T | null>} The retrieved data or null.
     */
    static async get<T>(cacheTypeKey: string, key: string, ttlSeconds: number = 3600): Promise<T | null> {
        const config = getCacheConfig(cacheTypeKey);

        if (!config) {
            throw new Error(`Cache type "${cacheTypeKey}" is not configured.`);
        }

        if (config.cacheName.includes("Embedding")) {
            // Dispatch to the specific embedding cache implementation
            const embeddingCache = config.module as typeof EmbeddingCache;
            return embeddingCache.getEmbedding(key, /* client here */) as Promise<T | null>;
        } else if (config.cacheName.includes("Authority")) {
            // Dispatch to the specific authority scorer implementation
            const authorityCache = config.module as typeof AuthorityScorer;
            return authorityCache.getScore(key, /* client here */) as Promise<T | null>;
        } else if (config.cacheName.includes("Timeline")) {
            // Dispatch to the specific timeline scorer implementation
            const timelineCache = config.module as typeof TimelineScorer;
            return timelineCache.getScore(key, /* client here */) as Promise<T | null>;
        }

        throw new Error(`Get operation not implemented for cache type: ${cacheTypeKey}`);
    }

    /**
     * Sets a value in the cache, optionally setting a custom TTL.
     * @param {string} cacheTypeKey - The key identifying the cache implementation (e.g., 'embedding').
     * @param {string} key - The unique cache key.
     * @param {T} value - The data to store.
     * @param {number} [ttlSeconds] - Optional TTL, overrides global config.
     * @returns {Promise<void>}
     */
    static async set<T>(cacheTypeKey: string, key: string, value: T, ttlSeconds?: number): Promise<void> {
        const config = getCacheConfig(cacheTypeKey);

        if (!config) {
            throw new Error(`Cache type "${cacheTypeKey}" is not configured.`);
        }

        if (config.cacheName.includes("Embedding")) {
            // Dispatch to the specific embedding cache implementation
            const embeddingCache = config.module as typeof EmbeddingCache;
            await embeddingCache.setEmbedding(key, value, /* client here */);
            return;
        } else if (config.cacheName.includes("Authority")) {
            // Dispatch to the specific authority scorer implementation
            const authorityCache = config.module as typeof AuthorityScorer;
            await authorityCache.setScore(key, value, /* client here */);
            return;
        }

        throw new Error(`Set operation not implemented for cache type: ${cacheTypeKey}`);
    }

    /**
     * Retrieves multiple related keys in a batch operation, useful for dependency checking.
     * @param {string[]} cacheTypeKeys - Array of cache types to batch retrieve.
     * @param {number} [ttlSeconds=3600] - Optional TTL.
     * @returns {Promise<Record<string, any>> | null} A map of key to value.
     */
    static async getBatch(cacheTypeKeys: string[], ttlSeconds: number = 3600): Promise<Record<string, any> | null> {
        // Placeholder for batch implementation
        throw new Error("Batch retrieval not implemented yet.");
    }

    /**
     * Deletes a key or set of keys, handling potential cascading deletions.
     * @param {string|string[]} keysToDelete - The key(s) to invalidate.
     * @returns {Promise<void>}
     */
    static async deleteKeys(cacheTypeKey: string, keysToDelete: string | string[]): Promise<void> {
        const config = getCacheConfig(cacheTypeKey);

        if (!config) {
            throw new Error(`Cache type "${cacheTypeKey}" is not configured.`);
        }

        if (config.cacheName.includes("Embedding")) {
            // Dispatch to the specific embedding cache implementation
            const embeddingCache = config.module as typeof EmbeddingCache;
            await embeddingCache.deleteKeys(key, keysToDelete, /* client here */);
            return;
        } else if (config.cacheName.includes("Authority")) {
            // Dispatch to the specific authority scorer implementation
            const authorityCache = config.module as typeof AuthorityScorer;
            await authorityCache.deleteKeys(key, keysToDelete, /* client here */);
            return;
        }
        // Implementations for other types will go here.
    }
}