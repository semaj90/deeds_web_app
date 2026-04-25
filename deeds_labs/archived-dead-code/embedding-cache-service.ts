/**
 * Enhanced Embedding Cache Service
 * Redis-based caching for embeddings and frequently accessed data
 */
import { redisService } from './redis-service.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
// Using direct type access or any to bypass strict type checking during recovery
const typedRedisService = redisService as any;

interface EmbeddingCacheEntry {
    text: string;
	embedding: number[] | string; // number[] raw or string compressed
    model: string;
	timestamp: number;
    accessCount: number;
	lastAccessed: number;
    compressed: boolean;
}

interface QueryCacheEntry {
    query: string;
	results: unknown[];
    metadata: Record<string, unknown>;
    timestamp: number;
	ttl: number;
}

interface CacheStats {
    embeddings: {
	hits: number, misses: number;
	size: number };
    queries: {
	hits: number, misses: number;
	size: number };
    sessions: {
	active: number; total: number };
}

class EmbeddingCacheService {
    // Cache prefixes
    private readonly EMBEDDING_PREFIX = 'emb:';
    private readonly QUERY_PREFIX = 'query:';
    private readonly HOT_CACHE_PREFIX = 'hot:';
    private readonly SESSION_PREFIX = 'session:';
    private readonly STATS_PREFIX = 'stats:';

    // Cache settings
    private readonly EMBEDDING_TTL = 7 * 24 * 60 * 60; // 7 days
    private readonly HOT_CACHE_TTL = 5 * 60; // 5 minutes
    private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours
    private readonly HOT_ACCESS_THRESHOLD = 5;

    /**
     * Cache embedding with automatic hot-cache promotion
     */
    async cacheEmbedding(
        text: string,
        embedding: number[],
        model: string = 'embeddinggemma:latest'
    ): Promise<void> {
        if (!typedRedisService.isHealthy() || !text || !Array.isArray(embedding) || embedding.length === 0) return;
        try {
            const key = this.generateEmbeddingKey(text, model);
            const compressed = this.compressEmbedding(embedding);

            const entry: EmbeddingCacheEntry = {
                text,
                embedding: compressed,
                model,
                timestamp: Date.now(),
                accessCount: 0,
                lastAccessed: Date.now(),
                compressed: true,
            };

            await typedRedisService.set(
                `${this.EMBEDDING_PREFIX}${key}`,
                JSON.stringify(entry),
                this.EMBEDDING_TTL
            );
            await this.updateStats('embeddings', 'store');
            console.log(`🔗 Cached embedding for text (${text.length}chars, ${embedding.length}dims)`);
        } catch (error) {
            console.warn('Embedding cache error: ', error);
        }
    }

    /**
     * Retrieve cached embedding with hot-cache optimization
     */
    async getEmbedding(
        text: string,
        model: string = 'embeddinggemma:latest'
    ): Promise<number[] | null> {
        try {
            const key = this.generateEmbeddingKey(text, model);
            const cacheKey = `${this.EMBEDDING_PREFIX}${key}`;
            const hotCacheKey = `${this.HOT_CACHE_PREFIX}${key}`;

            // 1. Check hot cache first (fastest)
            const hotCached = await typedRedisService.get(hotCacheKey);
            if (hotCached) {
                const entry = JSON.parse(hotCached) as EmbeddingCacheEntry;
                // Refresh TTL and stats
                await typedRedisService.expire(hotCacheKey, this.HOT_CACHE_TTL);
                await this.updateStats('embeddings', 'hit');
                return this.decompressEmbedding(entry.embedding);
            }

            // 2. Check main cache
            const cached = await typedRedisService.get(cacheKey);
            if (cached) {
                const entry = JSON.parse(cached) as EmbeddingCacheEntry;
                entry.lastAccessed = Date.now();
                entry.accessCount = (entry.accessCount || 0) + 1;

                // Update entry directly
                await typedRedisService.set(cacheKey, JSON.stringify(entry), this.EMBEDDING_TTL);

                // Promote to hot cache if popular
                if (entry.accessCount > this.HOT_ACCESS_THRESHOLD) {
                    await this.promoteToHotCache(key, entry);
                }

                await this.updateStats('embeddings', 'hit');
                return this.decompressEmbedding(entry.embedding);
            }

            await this.updateStats('embeddings', 'miss');
            return null;
        } catch (error) {
            console.warn('Embedding retrieval error:', error);
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
        if (!typedRedisService.isHealthy()) return;
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
        if (!typedRedisService.isHealthy()) return null;
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

    private generateEmbeddingKey(text: string, model: string): string {
        const content = `${model}:${text}`;
        return Buffer.from(content).toString('base64').substring(0, 40);
    }

    private generateQueryKey(query: string, metadata: Record<string, unknown>): string {
        const content = `${query}:${JSON.stringify(metadata)}`;
        return Buffer.from(content).toString('base64').substring(0, 40);
    }

    private compressEmbedding(embedding: number[]): string {
        // Simple compression: round to 4 decimals to save space
        const rounded = embedding.map((n) => Math.round(n * 10000) / 10000);
        return Buffer.from(JSON.stringify(rounded)).toString('base64');
    }

    private decompressEmbedding(compressed: string | number[]): number[] {
        if (Array.isArray(compressed)) return compressed;
        try {
            const json = Buffer.from(compressed, 'base64').toString();
            return JSON.parse(json);
        } catch {
            return [];
        }
    }

    private async promoteToHotCache(key: string, entry: EmbeddingCacheEntry): Promise<void> {
        try {
            const hotKey = `${this.HOT_CACHE_PREFIX}${key}`;
            await typedRedisService.set(hotKey, JSON.stringify(entry), this.HOT_CACHE_TTL);
            console.log(`🔥 Promoted to hot cache: ${entry.text.substring(0, 20)}...`);
        } catch (error) {
            console.warn('Hot cache promotion error:', error);
        }
    }

    private calculateQueryTTL(resultCount: number, metadata: Record<string, unknown>): number {
        // Shorter TTL for empty/small results to ensure freshness
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
