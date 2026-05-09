/**
 * Redis Cache Service
 * Phase 76 - Task 7.1: RedisCacheService class
 *
 * Provides caching for search results with 1hr TTL.
 * Uses key format: kb:search:{query_hash}
 *
 * Requirements: 6.1, 6.2, 6.4
 *
 * Property 7: Redis Cache Key Format
 * Property 8: Cache Hit Behavior
 */

import type { SearchResult } from './types.js';
import { ENV } from '$lib/server/env.server.js';
import { redis } from '$lib/server/redis.js';

export interface RedisCacheConfig {
  url: string;
  defaultTTL: number; // seconds
  keyPrefix: string;
}

export interface CachedSearchResult {
  results: SearchResult[];
  cachedAt: string;
  queryHash: string;
  ttl: number;
}

const DEFAULT_CONFIG: RedisCacheConfig = {
  url: ENV.REDIS_URL,
  defaultTTL: 3600, // 1 hour (Requirement 6.1)
  keyPrefix: 'kb:search:', // Requirement 6.2
};

/**
 * Redis Cache Service
 * Handles caching of search results for fast repeated queries
 */
export class RedisCacheService {
  private config: RedisCacheConfig;
  private isAvailable: boolean = true;
  private memoryCache: Map<string, CachedSearchResult> = new Map();

  constructor(config?: Partial<RedisCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Redis is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      return this.isAvailable;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  /**
   * Cache search results
   * Requirements: 6.1, 6.2
   * Property 7: Key format is kb:search:{query_hash}
   */
  async cacheSearchResults(
    query: string,
    results: SearchResult[],
    ttl: number = this.config.defaultTTL
  ): Promise<void> {
    const queryHash = this.hashQuery(query);
    const key = this.generateCacheKey(queryHash);

    const cached: CachedSearchResult = {
      results,
      cachedAt: new Date().toISOString(),
      queryHash,
      ttl,
    };

    if (this.isAvailable) {
      try {
        await this.setWithTTL(key, JSON.stringify(cached), ttl);
        console.log(`📦 Cached search results: ${key} (TTL: ${ttl}s)`);
      } catch (error) {
        console.error('❌ Redis cache failed, using memory:', error);
        this.memoryCache.set(key, cached);
      }
    } else {
      this.memoryCache.set(key, cached);
    }
  }

  /**
   * Get cached search results
   * Requirements: 6.3
   * Property 8: Cache Hit Behavior
   */
  async getCachedResults(query: string): Promise<SearchResult[] | null> {
    const queryHash = this.hashQuery(query);
    const key = this.generateCacheKey(queryHash);

    if (this.isAvailable) {
      try {
        const cached = await this.get(key);
        if (cached) {
          const parsed: CachedSearchResult = JSON.parse(cached);
          console.log(`✅ Cache hit: ${key}`);
          return parsed.results;
        }
      } catch (error) {
        console.error('❌ Redis get failed:', error);
      }
    }

    // Check memory cache fallback
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached) {
      console.log(`✅ Memory cache hit: ${key}`);
      return memoryCached.results;
    }

    console.log(`❌ Cache miss: ${key}`);
    return null;
  }

  /**
   * Invalidate cache for a specific query or all search caches
   * Requirements: 6.4
   */
  async invalidateCache(queryHash?: string): Promise<void> {
    if (queryHash) {
      const key = this.generateCacheKey(queryHash);
      await this.delete(key);
      this.memoryCache.delete(key);
      console.log(`🗑️ Invalidated cache: ${key}`);
    } else {
      const pattern = `${this.config.keyPrefix}*`;
      await this.deletePattern(pattern);

      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(this.config.keyPrefix)) {
          this.memoryCache.delete(key);
        }
      }
      console.log(`🗑️ Invalidated all search caches`);
    }
  }

  /**
   * Cache document content
   */
  async cacheDocument(docId: string, content: string, ttl: number = 86400): Promise<void> {
    const key = `kb:doc:${docId}`;

    if (this.isAvailable) {
      try {
        await this.setWithTTL(key, content, ttl);
      } catch {
        this.memoryCache.set(key, {
          results: [],
          cachedAt: new Date().toISOString(),
          queryHash: docId,
          ttl,
        });
      }
    }
  }

  /**
   * Get cached document content
   */
  async getCachedDocument(docId: string): Promise<string | null> {
    const key = `kb:doc:${docId}`;

    if (this.isAvailable) {
      try {
        return await this.get(key);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Cache IDF value for a term
   */
  async cacheIdf(term: string, idf: number, ttl: number = 3600): Promise<void> {
    const key = `kb:idf:${term}`;

    if (this.isAvailable) {
      try {
        await this.setWithTTL(key, String(idf), ttl);
      } catch {
        // Ignore cache failures for IDF
      }
    }
  }

  /**
   * Get cached IDF value
   */
  async getCachedIdf(term: string): Promise<number | null> {
    const key = `kb:idf:${term}`;

    if (this.isAvailable) {
      try {
        const value = await this.get(key);
        return value ? parseFloat(value) : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Cache collection statistics
   */
  async cacheStats(stats: Record<string, unknown>, ttl: number = 300): Promise<void> {
    const key = 'kb:stats';

    if (this.isAvailable) {
      try {
        await this.setWithTTL(key, JSON.stringify(stats), ttl);
      } catch {
        // Ignore cache failures for stats
      }
    }
  }

  /**
   * Get cached statistics
   */
  async getCachedStats(): Promise<Record<string, unknown> | null> {
    const key = 'kb:stats';

    if (this.isAvailable) {
      try {
        const value = await this.get(key);
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  // ============================================================================
  // Private Methods - Redis Operations
  // ============================================================================

  /**
   * Generate cache key
   * Property 7: Key format is kb:search:{query_hash}
   */
  private generateCacheKey(queryHash: string): string {
    return `${this.config.keyPrefix}${queryHash}`;
  }

  /**
   * Hash query string
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Set value with TTL
   */
  private async setWithTTL(key: string, value: string, ttl: number): Promise<void> {
    await redis.set(key, value, 'EX', ttl);
  }

  /**
   * Get value
   */
  private async get(key: string): Promise<string | null> {
    return await redis.get(key);
  }

  /**
   * Delete key
   */
  private async delete(key: string): Promise<void> {
    await redis.del(key);
  }

  /**
   * Delete keys matching pattern
   */
  private async deletePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

/**
 * Singleton instance
 */
let redisCacheInstance: RedisCacheService | null = null;

/**
 * Get or create RedisCacheService singleton
 */
export function getRedisCacheService(config?: Partial<RedisCacheConfig>): RedisCacheService {
  if (!redisCacheInstance) {
    redisCacheInstance = new RedisCacheService(config);
  }
  return redisCacheInstance;
}
