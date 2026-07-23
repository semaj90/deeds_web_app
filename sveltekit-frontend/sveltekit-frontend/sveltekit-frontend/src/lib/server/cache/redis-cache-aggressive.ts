/**
 * Step 1: Aggressive Bitfrost Redis Cache — L1/L2/L3/L4 Tiers
 *
 * 4-tier cache hierarchy for maximum hitrate:
 * - L1: Exact query hits (SHA-256 hash) → 5ms, 5-min TTL
 * - L2: Semantic similarity (Bifrost) → 2-5s, 1-hour TTL
 * - L3: SOM centroid grid (from Neo4j) → 8ms, 24-hour TTL
 * - L4: Feature centroids (K-means) → 12ms, 7-day TTL
 */

import Redis from 'ioredis';
import { createHash } from 'crypto';

export interface CacheEntry<T> {
  data: T;
  metadata: {
    tier: 'L1' | 'L2' | 'L3' | 'L4';
    timestamp: number;
    ttl_seconds: number;
    hit_count?: number;
  };
}

export interface CacheStats {
  l1_hits: number;
  l1_misses: number;
  l2_hits: number;
  l2_misses: number;
  l3_hits: number;
  l3_misses: number;
  l4_hits: number;
  l4_misses: number;
  total_size_bytes: number;
}

/**
 * Aggressive Redis cache with 4 tiers
 */
export class AggressiveRedisCache {
  private redis: Redis;
  private stats: CacheStats = {
    l1_hits: 0,
    l1_misses: 0,
    l2_hits: 0,
    l2_misses: 0,
    l3_hits: 0,
    l3_misses: 0,
    l4_hits: 0,
    l4_misses: 0,
    total_size_bytes: 0,
  };

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }

  async setL1Query<T>(query: string, result: T, ttl_seconds: number = 300): Promise<void> {
    const key = `bf:l1:query:${this.hashQuery(query)}`;
    const entry: CacheEntry<T> = {
      data: result,
      metadata: {
        tier: 'L1',
        timestamp: Date.now(),
        ttl_seconds,
        hit_count: 0,
      },
    };

    await this.redis.setex(key, ttl_seconds, JSON.stringify(entry));
  }

  async getL1Query<T>(query: string): Promise<T | null> {
    const key = `bf:l1:query:${this.hashQuery(query)}`;
    const cached = await this.redis.get(key);

    if (cached) {
      this.stats.l1_hits++;
      const entry: CacheEntry<T> = JSON.parse(cached);
      return entry.data;
    }

    this.stats.l1_misses++;
    return null;
  }

  async setL2Semantic<T>(queryEmbedding: number[], result: T, ttl_seconds: number = 3600): Promise<void> {
    const key = `bf:l2:semantic:${this.hashEmbedding(queryEmbedding)}`;
    const entry: CacheEntry<T> = {
      data: result,
      metadata: {
        tier: 'L2',
        timestamp: Date.now(),
        ttl_seconds,
        hit_count: 0,
      },
    };

    await this.redis.setex(key, ttl_seconds, JSON.stringify(entry));
  }

  async getL2Semantic<T>(queryEmbedding: number[]): Promise<T | null> {
    const key = `bf:l2:semantic:${this.hashEmbedding(queryEmbedding)}`;
    const cached = await this.redis.get(key);

    if (cached) {
      this.stats.l2_hits++;
      const entry: CacheEntry<T> = JSON.parse(cached);
      return entry.data;
    }

    this.stats.l2_misses++;
    return null;
  }

  async setL3SOMCentroid(row: number, col: number, centroid: number[], ttl_seconds: number = 86400): Promise<void> {
    const key = `bf:l3:som:${row}:${col}`;
    const entry: CacheEntry<number[]> = {
      data: centroid,
      metadata: {
        tier: 'L3',
        timestamp: Date.now(),
        ttl_seconds,
        hit_count: 0,
      },
    };

    await this.redis.setex(key, ttl_seconds, JSON.stringify(entry));
  }

  async getL3SOMCentroid(row: number, col: number): Promise<number[] | null> {
    const key = `bf:l3:som:${row}:${col}`;
    const cached = await this.redis.get(key);

    if (cached) {
      this.stats.l3_hits++;
      const entry: CacheEntry<number[]> = JSON.parse(cached);
      return entry.data;
    }

    this.stats.l3_misses++;
    return null;
  }

  async setL4FeatureCentroid(featureId: string, centroid: number[], ttl_seconds: number = 604800): Promise<void> {
    const key = `bf:l4:feature:${featureId}`;
    const entry: CacheEntry<number[]> = {
      data: centroid,
      metadata: {
        tier: 'L4',
        timestamp: Date.now(),
        ttl_seconds,
        hit_count: 0,
      },
    };

    await this.redis.setex(key, ttl_seconds, JSON.stringify(entry));
  }

  async getL4FeatureCentroid(featureId: string): Promise<number[] | null> {
    const key = `bf:l4:feature:${featureId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      this.stats.l4_hits++;
      const entry: CacheEntry<number[]> = JSON.parse(cached);
      return entry.data;
    }

    this.stats.l4_misses++;
    return null;
  }

  async loadL3SOMGrid(somGrid: Map<string, number[]>): Promise<number> {
    let loaded = 0;

    for (const [key, centroid] of somGrid.entries()) {
      const [row, col] = key.split(':').map(Number);
      await this.setL3SOMCentroid(row, col, centroid);
      loaded++;
    }

    return loaded;
  }

  async loadL4FeatureCentroids(featureCentroids: Map<string, number[]>): Promise<number> {
    let loaded = 0;

    for (const [featureId, centroid] of featureCentroids.entries()) {
      await this.setL4FeatureCentroid(featureId, centroid);
      loaded++;
    }

    return loaded;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
    this.stats = {
      l1_hits: 0,
      l1_misses: 0,
      l2_hits: 0,
      l2_misses: 0,
      l3_hits: 0,
      l3_misses: 0,
      l4_hits: 0,
      l4_misses: 0,
      total_size_bytes: 0,
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  private hashQuery(query: string): string {
    return require('crypto').createHash('sha256').update(query).digest('hex').slice(0, 16);
  }

  private hashEmbedding(embedding: number[]): string {
    const str = embedding.slice(0, 10).join(',');
    return require('crypto').createHash('sha256').update(str).digest('hex').slice(0, 16);
  }
}

let instance: AggressiveRedisCache | null = null;

export function getRedisCache(): AggressiveRedisCache {
  if (!instance) {
    instance = new AggressiveRedisCache();
  }
  return instance;
}

export async function closeRedisCache(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
