/**
 * Enhanced Embedding Cache Service
 * Redis-based caching for embeddings and frequently accessed data
 * Refactored to delegate embedding methods to the unified binary cache.
 */
import { redis } from './redis.js';
import { getEmbedding as getUnifiedEmbedding, cacheEmbedding as cacheUnifiedEmbedding } from './cache/embedding-cache-unified.js';

const typedRedisService = redis as any;

interface QueryCacheEntry {
    query: string;
    results: unknown[];
    metadata: Record<string, unknown>;
    timestamp: number;
    ttl: number;
}

class EmbeddingCacheService {
    // Cache prefixes
    private readonly QUERY_PREFIX = 'query:';
    private readonly STATS_PREFIX = 'stats:';

    /**
     * Cache embedding with automatic unified binary format delegating
     */
    async cacheEmbedding(
        text: string,
        embedding: number[],
        model: string = 'embeddinggemma:latest'
    ): Promise<void> {
        if (typedRedisService.status !== 'ready' || !text || !Array.isArray(embedding) || embedding.length === 0) return;
        try {
            const floatArray = new Float32Array(embedding);
            await cacheUnifiedEmbedding(text, floatArray, model);
            await this.updateStats('embeddings', 'store');
            console.log(`🔗 Consolidator: Cached embedding for text (${text.length}chars, ${embedding.length}dims) via Unified Cache`);
        } catch (error) {
            console.warn('Embedding cache service error: ', error);
        }
    }

    /**
     * Retrieve cached embedding via Unified cache
     */
    async getEmbedding(
        text: string,
        model: string = 'embeddinggemma:latest'
    ): Promise<number[] | null> {
        try {
            const floatArray = await getUnifiedEmbedding(text, model);
            if (floatArray) {
                await this.updateStats('embeddings', 'hit');
                return Array.from(floatArray);
            }
            await this.updateStats('embeddings', 'miss');
            return null;
        } catch (error) {
            console.warn('Embedding retrieval service error:', error);
            return null;
        }
    }

    /**
     * Cache query results with intelligent TTL
     */
    async cacheQuery(
        query: string,
        results: unknown[],
        metadata: Record<string, unknown> = {},
        customTTL?: number
    ): Promise<void> {
        if (typedRedisService.status !== 'ready') return;
        try {
            const key = this.generateQueryKey(query, metadata);
            const ttl = customTTL || this.calculateQueryTTL(results.length, metadata);

            const entry: QueryCacheEntry = {
                query,
                results,
                metadata: {
                    ...metadata,
                    resultCount: results.length,
                },
                timestamp: Date.now(),
                ttl,
            };

            await typedRedisService.set(`${this.QUERY_PREFIX}${key}`, JSON.stringify(entry), ttl);
            await this.updateStats('queries', 'store');
        } catch (error) {
            console.warn('Query cache error:', error);
        }
    }

    /**
     * Retrieve cached query results
     */
    async getQueryResults(
        query: string,
        metadata: Record<string, unknown> = {}
    ): Promise<unknown[] | null> {
        if (typedRedisService.status !== 'ready') return null;
        try {
            const key = this.generateQueryKey(query, metadata);
            const cached = await typedRedisService.get(`${this.QUERY_PREFIX}${key}`);

            if (cached) {
                const entry = JSON.parse(cached) as QueryCacheEntry;
                await this.updateStats('queries', 'hit');
                return entry.results;
            }

            await this.updateStats('queries', 'miss');
            return null;
        } catch (error) {
            console.warn('Query retrieval error:', error);
            return null;
        }
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    private generateQueryKey(query: string, metadata: Record<string, unknown>): string {
        const content = `${query}:${JSON.stringify(metadata)}`;
        return Buffer.from(content).toString('base64').substring(0, 40);
    }

    private calculateQueryTTL(resultCount: number, metadata: Record<string, unknown>): number {
        if (resultCount === 0) return 60; // 1 min
        if (resultCount < 5) return 300;  // 5 mins
        return 3600; // 1 hour default
    }

    private async updateStats(type: string, operation: string, count: number = 1): Promise<void> {
        try {
            const field = `${type}_${operation}`;
            await typedRedisService.hincrby(`${this.STATS_PREFIX}all`, field, count);
        } catch {
            // Ignore stats errors
        }
    }
}

export const embeddingCacheService = new EmbeddingCacheService();
