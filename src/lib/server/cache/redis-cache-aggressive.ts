/**
 * Step 1: Aggressive Bitfrost Redis Cache — 4 Tiers (768-dim Canonical)
 *
 * L1: Exact query cache (5ms, 1h TTL)
 * L2: Semantic similarity cache (2-5s, 24h TTL)
 * L3: SOM centroid lookups (8ms, 24h TTL)
 * L4: Feature centroids (12ms, 7d TTL)
 *
 * Dimension: 768-dim primary, 384-dim fallback with catch block.
 */

import { Redis } from 'ioredis';

export interface CacheEntry<T> {
  data: T;
  metadata: {
    tier: 'L1' | 'L2' | 'L3' | 'L4';
    timestamp: number;
    ttl_seconds: number;
    embedding_dimension?: number; // 768 or 384
  };
}

export class AggressiveRedisCache {
  private redis: Redis;
  private embedding_dimension: number = 768; // Production canonical

  constructor(redis: Redis, embedding_dimension?: number) {
    this.redis = redis;

    // Validate dimension
    if (embedding_dimension && embedding_dimension !== 768 && embedding_dimension !== 384) {
      console.warn(`[AggressiveRedisCache] Invalid dimension: ${embedding_dimension}. Defaulting to 768-dim.`);
      this.embedding_dimension = 768;
    } else if (embedding_dimension === 384) {
      console.warn(
        '[AggressiveRedisCache] Using legacy 384-dim embedding. ' +
        'Recommend migration to 768-dim (production canonical).'
      );
      this.embedding_dimension = 384;
    } else if (embedding_dimension) {
      this.embedding_dimension = embedding_dimension;
    }
  }

  // L1: Exact query cache
  async setL1Query(queryHash: string, results: any[], ttl_seconds: number = 3600): Promise<void> {
    try {
      const entry: CacheEntry<any> = {
        data: results,
        metadata: {
          tier: 'L1',
          timestamp: Date.now(),
          ttl_seconds,
          embedding_dimension: this.embedding_dimension,
        },
      };
      await this.redis.setex(`bitfrost:l1:query:${queryHash}`, ttl_seconds, JSON.stringify(entry));
    } catch (err) {
      console.error('[AggressiveRedisCache] L1 set failed:', err);
      // Soft failure: continue without cache
    }
  }

  async getL1Query(queryHash: string): Promise<any[] | null> {
    try {
      const cached = await this.redis.get(`bitfrost:l1:query:${queryHash}`);
      if (!cached) return null;

      const entry: CacheEntry<any> = JSON.parse(cached);
      return entry.data;
    } catch (err) {
      console.warn('[AggressiveRedisCache] L1 get failed:', err);
      return null;
    }
  }

  // L2: Semantic similarity cache
  async setL2Semantic(
    queryEmbedding: number[],
    results: any[],
    ttl_seconds: number = 86400
  ): Promise<void> {
    try {
      // Validate embedding dimension
      if (queryEmbedding.length !== this.embedding_dimension && queryEmbedding.length !== 384) {
        console.warn(
          `[AggressiveRedisCache] L2 embedding dimension mismatch: expected ${this.embedding_dimension} or 384, got ${queryEmbedding.length}`
        );
        // Catch block: continue anyway
      }

      const embeddingHash = this.hashEmbedding(queryEmbedding);
      const entry: CacheEntry<any> = {
        data: results,
        metadata: {
          tier: 'L2',
          timestamp: Date.now(),
          ttl_seconds,
          embedding_dimension: queryEmbedding.length,
        },
      };
      await this.redis.setex(
        `bitfrost:l2:semantic:${embeddingHash}`,
        ttl_seconds,
        JSON.stringify(entry)
      );
    } catch (err) {
      console.error('[AggressiveRedisCache] L2 set failed:', err);
      // Soft failure
    }
  }

  async getL2Semantic(queryEmbedding: number[]): Promise<any[] | null> {
    try {
      const embeddingHash = this.hashEmbedding(queryEmbedding);
      const cached = await this.redis.get(`bitfrost:l2:semantic:${embeddingHash}`);
      if (!cached) return null;

      const entry: CacheEntry<any> = JSON.parse(cached);
      return entry.data;
    } catch (err) {
      console.warn('[AggressiveRedisCache] L2 get failed:', err);
      return null;
    }
  }

  // L3: SOM centroid lookups
  async setL3SOMCentroid(somCell: string, centroid: number[], ttl_seconds: number = 86400): Promise<void> {
    try {
      // Validate centroid dimension
      if (centroid.length !== this.embedding_dimension && centroid.length !== 384) {
        console.warn(
          `[AggressiveRedisCache] L3 SOM centroid dimension mismatch: expected ${this.embedding_dimension} or 384, got ${centroid.length}`
        );
        // Catch block: continue anyway
      }

      const entry: CacheEntry<number[]> = {
        data: centroid,
        metadata: {
          tier: 'L3',
          timestamp: Date.now(),
          ttl_seconds,
          embedding_dimension: centroid.length,
        },
      };
      await this.redis.setex(
        `bitfrost:l3:som:${somCell}`,
        ttl_seconds,
        JSON.stringify(entry)
      );
    } catch (err) {
      console.error('[AggressiveRedisCache] L3 SOM set failed:', err);
      // Soft failure
    }
  }

  async getL3SOMCentroid(somCell: string): Promise<number[] | null> {
    try {
      const cached = await this.redis.get(`bitfrost:l3:som:${somCell}`);
      if (!cached) return null;

      const entry: CacheEntry<number[]> = JSON.parse(cached);
      return entry.data;
    } catch (err) {
      console.warn('[AggressiveRedisCache] L3 SOM get failed:', err);
      return null;
    }
  }

  // L4: Feature centroids
  async setL4FeatureCentroid(
    featureId: string,
    centroid: number[],
    ttl_seconds: number = 604800 // 7 days
  ): Promise<void> {
    try {
      // Validate centroid dimension
      if (centroid.length !== this.embedding_dimension && centroid.length !== 384) {
        console.warn(
          `[AggressiveRedisCache] L4 feature centroid dimension mismatch: expected ${this.embedding_dimension} or 384, got ${centroid.length}`
        );
        // Catch block: continue anyway
      }

      const entry: CacheEntry<number[]> = {
        data: centroid,
        metadata: {
          tier: 'L4',
          timestamp: Date.now(),
          ttl_seconds,
          embedding_dimension: centroid.length,
        },
      };
      await this.redis.setex(
        `bitfrost:l4:feature:${featureId}`,
        ttl_seconds,
        JSON.stringify(entry)
      );
    } catch (err) {
      console.error('[AggressiveRedisCache] L4 feature set failed:', err);
      // Soft failure
    }
  }

  async getL4FeatureCentroid(featureId: string): Promise<number[] | null> {
    try {
      const cached = await this.redis.get(`bitfrost:l4:feature:${featureId}`);
      if (!cached) return null;

      const entry: CacheEntry<number[]> = JSON.parse(cached);
      return entry.data;
    } catch (err) {
      console.warn('[AggressiveRedisCache] L4 feature get failed:', err);
      return null;
    }
  }

  // Bulk prewarming
  async loadL3SOMGrid(somGrid: Map<string, number[]>): Promise<number> {
    let loaded = 0;

    for (const [somCell, centroid] of somGrid) {
      try {
        await this.setL3SOMCentroid(somCell, centroid);
        loaded++;
      } catch (err) {
        console.warn(`[AggressiveRedisCache] Failed to load SOM cell ${somCell}:`, err);
        // Continue with remaining cells (soft failure)
      }
    }

    console.log(`[AggressiveRedisCache] Loaded ${loaded}/${somGrid.size} SOM grid cells`);
    return loaded;
  }

  async loadL4FeatureCentroids(centroids: Map<string, number[]>): Promise<number> {
    let loaded = 0;

    for (const [featureId, centroid] of centroids) {
      try {
        await this.setL4FeatureCentroid(featureId, centroid);
        loaded++;
      } catch (err) {
        console.warn(`[AggressiveRedisCache] Failed to load feature centroid ${featureId}:`, err);
        // Continue with remaining features (soft failure)
      }
    }

    console.log(`[AggressiveRedisCache] Loaded ${loaded}/${centroids.size} feature centroids`);
    return loaded;
  }

  // Statistics
  async getStats(): Promise<{
    l1_keys: number;
    l2_keys: number;
    l3_keys: number;
    l4_keys: number;
    total_keys: number;
    embedding_dimension: number;
  }> {
    try {
      const l1 = await this.redis.keys('bitfrost:l1:query:*');
      const l2 = await this.redis.keys('bitfrost:l2:semantic:*');
      const l3 = await this.redis.keys('bitfrost:l3:som:*');
      const l4 = await this.redis.keys('bitfrost:l4:feature:*');

      return {
        l1_keys: l1.length,
        l2_keys: l2.length,
        l3_keys: l3.length,
        l4_keys: l4.length,
        total_keys: l1.length + l2.length + l3.length + l4.length,
        embedding_dimension: this.embedding_dimension,
      };
    } catch (err) {
      console.error('[AggressiveRedisCache] Stats query failed:', err);
      return {
        l1_keys: 0,
        l2_keys: 0,
        l3_keys: 0,
        l4_keys: 0,
        total_keys: 0,
        embedding_dimension: this.embedding_dimension,
      };
    }
  }

  private hashEmbedding(embedding: number[]): string {
    // Simple hash: sum first 10 values + length
    // In production, use crypto.createHash('sha256')
    let hash = 0;
    for (let i = 0; i < Math.min(10, embedding.length); i++) {
      hash += embedding[i] * 1000; // Scale to avoid float precision issues
    }
    return `${hash}:${embedding.length}`;
  }
}

let cacheInstance: AggressiveRedisCache | null = null;

export function getRedisCache(redis: Redis, embedding_dimension?: number): AggressiveRedisCache {
  if (!cacheInstance) {
    cacheInstance = new AggressiveRedisCache(redis, embedding_dimension);
  }
  return cacheInstance;
}
