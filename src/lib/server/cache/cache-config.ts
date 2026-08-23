// =============================================================================
// src/lib/server/cache/cache-config.ts
// =============================================================================
// Centralized cache configuration store. All cache implementations must be registered here.
// This file acts as the single source of truth for cache availability and implementation details.

import { EmbeddingCache } from './embedding-cache';
import { AuthorityScorer } from './authority-scorer';
// import { RedisClient } from 'redis'; // Assuming client connection is handled externally

/**
 * Defines the configuration structure for a single cache type.
 * @typedef {object} CacheConfig
 * @property {string} cacheName - A human-readable name for the cache type (e.g., 'embedding').
 * @property {object} module - The imported class or module providing the cache logic.
 * @property {string} description - A brief description of what this cache tracks.
 * @property {function} getCacheInstance - Functionality to initialize the cache client/connection context.
 */

/** @type {Record<string, CacheConfig>} */
export const cacheConfigurations = {
    /**
     * Cache for vector embeddings, storing high-dimensional vectors derived from documents.
     */
    embedding: {
        cacheName: 'Embedding',
        module: EmbeddingCache,
        description: 'Stores document embedding vectors for similarity search.',
        getCacheInstance: (client: RedisClient) => EmbeddingCache.initialize(client)
    },
    /**
     * Cache for Authority Scoring, storing derived metadata scores for source credibility.
     */
    authority: {
        cacheName: 'Authority',
        module: AuthorityScorer,
        description: 'Stores composite scores based on source authority signals (PR, ATTN, etc.).',
        getCacheInstance: (client: RedisClient) => AuthorityScorer.initialize(client)
    }
    // Add other caches here:
    // 'other_cache_type': {
    //     cacheName: 'OtherType',
    //     module: OtherCacheImplementation,
    //     description: 'A description of the other cache.',
    //     getCacheInstance: (client: RedisClient) => OtherCacheImplementation.initialize(client)
    // }
};

/**
 * Retrieves configuration details for a given cache type key.
 * @param {string} cacheTypeKey - The unique key used in the cacheConfigurations map.
 * @returns {CacheConfig | undefined} The configuration object.
 */
export function getCacheConfig(cacheTypeKey: string): { cacheName: string; module: any; description: string; getCacheInstance: (client: RedisClient) => any } | undefined {
    return cacheConfigurations[cacheTypeKey];
}