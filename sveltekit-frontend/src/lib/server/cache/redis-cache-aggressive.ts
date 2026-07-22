import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';

/**
 * Aggressive Bitfrost Redis cache with L1/L2/L3/L4 tiers.
 *
 * Tier structure:
 * - L1: Exact query match (5ms, 1h TTL)
 * - L2: Semantic similarity via Bifrost (2-5s, 1h TTL)
 * - L3: SOM centroids + cluster members (8ms, 24h TTL)
 * - L4: Feature centroids (12ms, 7d TTL)
 */

export interface CacheEntry<T> {
  data: T;
  metadata: {
    tier: 'L1' | 'L2' | 'L3' | 'L4';
    timestamp: number;
    ttl_seconds: number;
    source: string;
  };
}

export interface L1QueryCache {
  query_hash: string;
  embedding: Float32Array;
  results: string[]; // packet_keys
  scores: number[];
  timestamp: number;
  ttl_seconds: 3600;
}

export interface L2SemanticCache {
  query_hash: string;
  similarity_threshold: number; // 0.8 default
  results: string[]; // packet_keys
  scores: number[];
  timestamp: number;
  ttl_seconds: 3600;
}

export interface L3SOMCache {
  cluster_id: string;
  centroid: Float32Array; // 768-dim
  members: Set<string>; // packet_keys in this SOM cell
  timestamp: number;
  ttl_seconds: 86400;
}

export interface L4FeatureCentroid {
  feature_id: string;
  centroid: Float32Array; // 768-dim
  packet_count: number;
  timestamp: number;
  ttl_seconds: 604800;
}

export class AggressiveRedisCache {
  private client: Redis;
  private batchSize = 100;

  constructor(options?: Partial<RedisOptions>) {
    const defaults: RedisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'redis',
      db: 0,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    };

    this.client = new Redis({ ...defaults, ...options });

    this.client.on('error', (err) => {
      console.error('[RedisCache] Connection error:', err.message);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      const pong = await this.client.ping();
      if (pong !== 'PONG') throw new Error('Redis PING failed');
      console.log('[RedisCache] Connected successfully');
    } catch (err) {
      console.error('[RedisCache] Failed to connect:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * L1: Exact query cache (query_hash → results + scores)
   */
  async setL1Query(
    queryHash: string,
    results: string[],
    scores: number[],
    embedding: Float32Array
  ): Promise<void> {
    const key = `l1:query:${queryHash}`;
    const value = JSON.stringify({
      results,
      scores,
      embedding: Array.from(embedding),
      timestamp: Date.now(),
    });

    await this.client.setex(key, 3600, value);
  }

  async getL1Query(queryHash: string): Promise<L1QueryCache | null> {
    const key = `l1:query:${queryHash}`;
    const cached = await this.client.get(key);

    if (!cached) return null;

    try {
      const parsed = JSON.parse(cached);
      return {
        query_hash: queryHash,
        embedding: new Float32Array(parsed.embedding),
        results: parsed.results,
        scores: parsed.scores,
        timestamp: parsed.timestamp,
        ttl_seconds: 3600,
      };
    } catch (err) {
      console.error('[L1Cache] Parse error:', err);
      return null;
    }
  }

  /**
   * L2: Semantic similarity cache (Bifrost-backed, similarity threshold 0.8)
   */
  async setL2Semantic(
    queryHash: string,
    results: string[],
    scores: number[],
    threshold: number = 0.8
  ): Promise<void> {
    const key = `l2:semantic:${queryHash}`;
    const value = JSON.stringify({
      results,
      scores,
      threshold,
      timestamp: Date.now(),
    });

    await this.client.setex(key, 3600, value);
  }

  async getL2Semantic(queryHash: string): Promise<L2SemanticCache | null> {
    const key = `l2:semantic:${queryHash}`;
    const cached = await this.client.get(key);

    if (!cached) return null;

    try {
      const parsed = JSON.parse(cached);
      return {
        query_hash: queryHash,
        similarity_threshold: parsed.threshold,
        results: parsed.results,
        scores: parsed.scores,
        timestamp: parsed.timestamp,
        ttl_seconds: 3600,
      };
    } catch (err) {
      console.error('[L2Cache] Parse error:', err);
      return null;
    }
  }

  /**
   * L3: SOM grid centroids + cluster membership
   */
  async setL3SOMCentroid(
    clusterId: string,
    centroid: Float32Array
  ): Promise<void> {
    const key = `l3:som:centroid:${clusterId}`;
    const value = Buffer.from(centroid.buffer);

    await this.client.setex(key, 86400, value);
  }

  async getL3SOMCentroid(clusterId: string): Promise<Float32Array | null> {
    const key = `l3:som:centroid:${clusterId}`;
    const cached = await this.client.getBuffer(key);

    if (!cached) return null;

    return new Float32Array(cached.buffer, cached.byteOffset, cached.length / 4);
  }

  async setL3ClusterMembers(
    clusterId: string,
    members: Set<string>
  ): Promise<void> {
    const key = `l3:cluster:members:${clusterId}`;

    if (members.size === 0) {
      await this.client.del(key);
      return;
    }

    // Batch SADD to avoid command size limits
    const batch = Array.from(members);
    for (let i = 0; i < batch.length; i += this.batchSize) {
      const chunk = batch.slice(i, i + this.batchSize);
      await this.client.sadd(key, ...chunk);
    }

    await this.client.expire(key, 86400);
  }

  async getL3ClusterMembers(clusterId: string): Promise<Set<string> | null> {
    const key = `l3:cluster:members:${clusterId}`;
    const members = await this.client.smembers(key);

    if (!members || members.length === 0) return null;

    return new Set(members);
  }

  /**
   * L4: Feature centroids (top-100 by packet count)
   */
  async setL4FeatureCentroid(
    featureId: string,
    centroid: Float32Array,
    packetCount: number
  ): Promise<void> {
    const key = `l4:feature:centroid:${featureId}`;
    const value = JSON.stringify({
      centroid: Array.from(centroid),
      packet_count: packetCount,
      timestamp: Date.now(),
    });

    await this.client.setex(key, 604800, value); // 7 days
  }

  async getL4FeatureCentroid(featureId: string): Promise<L4FeatureCentroid | null> {
    const key = `l4:feature:centroid:${featureId}`;
    const cached = await this.client.get(key);

    if (!cached) return null;

    try {
      const parsed = JSON.parse(cached);
      return {
        feature_id: featureId,
        centroid: new Float32Array(parsed.centroid),
        packet_count: parsed.packet_count,
        timestamp: parsed.timestamp,
        ttl_seconds: 604800,
      };
    } catch (err) {
      console.error('[L4Cache] Parse error:', err);
      return null;
    }
  }

  /**
   * Bulk load L3 SOM grid (all centroids + all cluster members)
   */
  async loadL3SOMGrid(
    cellIds: string[],
    centroidData: Map<string, Float32Array>,
    memberData: Map<string, Set<string>>
  ): Promise<void> {
    console.log(`[L3SOMGrid] Prewarming ${cellIds.length} cells...`);

    for (const cellId of cellIds) {
      const centroid = centroidData.get(cellId);
      const members = memberData.get(cellId);

      if (centroid) {
        await this.setL3SOMCentroid(cellId, centroid);
      }

      if (members) {
        await this.setL3ClusterMembers(cellId, members);
      }
    }

    console.log('[L3SOMGrid] Prewarming complete');
  }

  /**
   * Bulk load L4 feature centroids
   */
  async loadL4FeatureCentroids(
    featureCentroids: Array<{
      feature_id: string;
      centroid: Float32Array;
      packet_count: number;
    }>
  ): Promise<void> {
    console.log(`[L4Features] Prewarming ${featureCentroids.length} feature centroids...`);

    for (const feature of featureCentroids) {
      await this.setL4FeatureCentroid(
        feature.feature_id,
        feature.centroid,
        feature.packet_count
      );
    }

    console.log('[L4Features] Prewarming complete');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    l1_hits: number;
    l2_hits: number;
    l3_hits: number;
    l4_hits: number;
    memory_used_mb: number;
    keys_count: number;
  }> {
    try {
      const info = await this.client.info('memory');
      const keys = await this.client.dbsize();

      const l1 = await this.client.keys('l1:*');
      const l2 = await this.client.keys('l2:*');
      const l3 = await this.client.keys('l3:*');
      const l4 = await this.client.keys('l4:*');

      const memoryMatch = info.match(/used_memory_human:(.+)\r/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

      return {
        l1_hits: l1.length,
        l2_hits: l2.length,
        l3_hits: l3.length,
        l4_hits: l4.length,
        memory_used_mb: parseFloat(memoryUsed) || 0,
        keys_count: keys,
      };
    } catch (err) {
      console.error('[RedisCache] Stats error:', err);
      return {
        l1_hits: 0,
        l2_hits: 0,
        l3_hits: 0,
        l4_hits: 0,
        memory_used_mb: 0,
        keys_count: 0,
      };
    }
  }

  /**
   * Clear all cache tiers
   */
  async clear(): Promise<void> {
    await this.client.flushdb();
    console.log('[RedisCache] All tiers cleared');
  }
}

// Singleton instance
let cacheInstance: AggressiveRedisCache | null = null;

export async function getRedisCache(): Promise<AggressiveRedisCache> {
  if (!cacheInstance) {
    cacheInstance = new AggressiveRedisCache();
    await cacheInstance.connect();
  }
  return cacheInstance;
}

export async function closeRedisCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.disconnect();
    cacheInstance = null;
  }
}
