/**
 * Unified Cache Service
 * Consolidates 8 caching services into one production-ready implementation
 *
 * Features:
 * - Redis cache (persistent, distributed)
 * - NES GPU cache (in-memory, ultra-fast)
 * - Embedding cache (specialized for embeddinggemma:latest)
 * - Multi-layer caching strategy
 * - Automatic cache invalidation
 * - Performance monitoring
 *
 * Date: February 7, 2026
 */

import Redis from 'ioredis';
import type { EmbeddingResponse } from '$lib/types/enhanced-rag-types';
import type { RAGSource, RAGResponse } from '$lib/types/knowledge-graph';

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════

export interface CacheConfig {
  redis: {
    url: string;
    maxRetries: number;
    retryDelay: number;
  };
  nesGpu: {
    maxSize: number; // Max entries in GPU cache
    enabled: boolean;
  };
  embedding: {
    ttl: number; // Time to live in seconds
    maxDimensions: number;
  };
  strategy: 'redis-only' | 'gpu-only' | 'hybrid' | 'fallback';
}

const DEFAULT_CONFIG: CacheConfig = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    maxRetries: 3,
    retryDelay: 1000
  },
  nesGpu: {
    maxSize: 10000,
    enabled: true
  },
  embedding: {
    ttl: 3600, // 1 hour
    maxDimensions: 768
  },
  strategy: 'hybrid'
};

// ═══════════════════════════════════════════════════════════
// Cache Entry Types
// ═══════════════════════════════════════════════════════════

interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl?: number;
  hits: number;
  size?: number;
}

interface CacheStats {
  redis: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
  };
  nesGpu: {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
  };
  embedding: {
    hits: number;
    misses: number;
    totalDimensions: number;
  };
}

// ═══════════════════════════════════════════════════════════
// Unified Cache Service Class
// ═══════════════════════════════════════════════════════════

export class UnifiedCacheService {
  private redis: Redis;
  private nesGpuCache: Map<string, CacheEntry<unknown>>;
  private embeddingCache: Map<string, CacheEntry<EmbeddingResponse>>;
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize Redis
    this.redis = new Redis(this.config.redis.url, {
      maxRetriesPerRequest: this.config.redis.maxRetries,
      retryStrategy: (times) => {
        if (times > this.config.redis.maxRetries) return null;
        return Math.min(times * this.config.redis.retryDelay, 3000);
      },
      lazyConnect: true
    });

    // Initialize in-memory caches
    this.nesGpuCache = new Map();
    this.embeddingCache = new Map();

    // Initialize stats
    this.stats = {
      redis: { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 },
      nesGpu: { hits: 0, misses: 0, size: 0, maxSize: this.config.nesGpu.maxSize },
      embedding: { hits: 0, misses: 0, totalDimensions: 0 }
    };

    // Start cleanup interval
    this.startCleanup();

    // Handle Redis errors
    this.redis.on('error', (err) => {
      console.error('[UnifiedCache] Redis error:', err.message);
      this.stats.redis.errors++;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Redis Operations
  // ═══════════════════════════════════════════════════════════

  async getRedis<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (value) {
        this.stats.redis.hits++;
        return JSON.parse(value) as T;
      }
      this.stats.redis.misses++;
      return null;
    } catch (error) {
      console.error('[UnifiedCache] Redis get error:', error);
      this.stats.redis.errors++;
      return null;
    }
  }

  async setRedis<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      this.stats.redis.sets++;
    } catch (error) {
      console.error('[UnifiedCache] Redis set error:', error);
      this.stats.redis.errors++;
    }
  }

  async deleteRedis(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.stats.redis.deletes++;
    } catch (error) {
      console.error('[UnifiedCache] Redis delete error:', error);
      this.stats.redis.errors++;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NES GPU Cache Operations (In-Memory, Ultra-Fast)
  // ═══════════════════════════════════════════════════════════

  getNesGpu<T = unknown>(key: string): T | null {
    if (!this.config.nesGpu.enabled) return null;

    const entry = this.nesGpuCache.get(key);
    if (!entry) {
      this.stats.nesGpu.misses++;
      return null;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.nesGpuCache.delete(key);
      this.stats.nesGpu.misses++;
      return null;
    }

    entry.hits++;
    this.stats.nesGpu.hits++;
    return entry.value as T;
  }

  setNesGpu<T = unknown>(key: string, value: T, ttl?: number): void {
    if (!this.config.nesGpu.enabled) return;

    // Evict oldest entry if cache is full
    if (this.nesGpuCache.size >= this.config.nesGpu.maxSize) {
      const oldestKey = this.findOldestEntry(this.nesGpuCache);
      if (oldestKey) {
        this.nesGpuCache.delete(oldestKey);
      }
    }

    this.nesGpuCache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0
    });

    this.stats.nesGpu.size = this.nesGpuCache.size;
  }

  deleteNesGpu(key: string): void {
    this.nesGpuCache.delete(key);
    this.stats.nesGpu.size = this.nesGpuCache.size;
  }

  // ═══════════════════════════════════════════════════════════
  // Embedding Cache (Specialized for embeddinggemma:latest)
  // ═══════════════════════════════════════════════════════════

  async getEmbedding(text: string): Promise<EmbeddingResponse | null> {
    const key = this.hashText(text);

    // Try in-memory cache first
    const cached = this.embeddingCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.embedding.ttl * 1000) {
      cached.hits++;
      this.stats.embedding.hits++;
      return cached.value;
    }

    // Try Redis
    const redisValue = await this.getRedis<EmbeddingResponse>(`embedding:${key}`);
    if (redisValue) {
      // Populate in-memory cache
      this.embeddingCache.set(key, {
        key,
        value: redisValue,
        timestamp: Date.now(),
        hits: 1
      });
      this.stats.embedding.hits++;
      return redisValue;
    }

    this.stats.embedding.misses++;
    return null;
  }

  async setEmbedding(text: string, embedding: EmbeddingResponse): Promise<void> {
    const key = this.hashText(text);

    // Store in both caches
    this.embeddingCache.set(key, {
      key,
      value: embedding,
      timestamp: Date.now(),
      hits: 0
    });

    await this.setRedis(`embedding:${key}`, embedding, this.config.embedding.ttl);

    this.stats.embedding.totalDimensions += embedding.dimensions;
  }

  // ═══════════════════════════════════════════════════════════
  // Hybrid Caching Strategy
  // ═══════════════════════════════════════════════════════════

  async get<T = unknown>(key: string, options?: { useGpu?: boolean }): Promise<T | null> {
    const strategy = this.config.strategy;

    // GPU-first strategy (ultra-fast)
    if ((strategy === 'hybrid' || strategy === 'gpu-only') && options?.useGpu !== false) {
      const gpuValue = this.getNesGpu<T>(key);
      if (gpuValue) return gpuValue;
    }

    // Redis fallback or primary
    if (strategy === 'hybrid' || strategy === 'redis-only' || strategy === 'fallback') {
      const redisValue = await this.getRedis<T>(key);
      if (redisValue) {
        // Populate GPU cache for next time
        if (strategy === 'hybrid' && options?.useGpu !== false) {
          this.setNesGpu(key, redisValue);
        }
        return redisValue;
      }
    }

    return null;
  }

  async set<T = unknown>(key: string, value: T, options?: { ttl?: number; useGpu?: boolean }): Promise<void> {
    const strategy = this.config.strategy;

    // Store in GPU cache
    if ((strategy === 'hybrid' || strategy === 'gpu-only') && options?.useGpu !== false) {
      this.setNesGpu(key, value, options?.ttl);
    }

    // Store in Redis
    if (strategy === 'hybrid' || strategy === 'redis-only' || strategy === 'fallback') {
      await this.setRedis(key, value, options?.ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.deleteNesGpu(key);
    await this.deleteRedis(key);
  }

  // ═══════════════════════════════════════════════════════════
  // Cache Invalidation
  // ═══════════════════════════════════════════════════════════

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      // Clear matching keys from GPU cache
      let gpuDeleted = 0;
      for (const key of this.nesGpuCache.keys()) {
        if (this.matchPattern(key, pattern)) {
          this.nesGpuCache.delete(key);
          gpuDeleted++;
        }
      }

      return keys.length + gpuDeleted;
    } catch (error) {
      console.error('[UnifiedCache] Invalidate pattern error:', error);
      return 0;
    }
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
    this.nesGpuCache.clear();
    this.embeddingCache.clear();
    this.stats.nesGpu.size = 0;
  }

  // ═══════════════════════════════════════════════════════════
  // Statistics & Monitoring
  // ═══════════════════════════════════════════════════════════

  getStats(): CacheStats {
    return { ...this.stats };
  }

  getHitRate(): {
    redis: number;
    nesGpu: number;
    embedding: number;
    overall: number;
  } {
    const redisTotal = this.stats.redis.hits + this.stats.redis.misses;
    const gpuTotal = this.stats.nesGpu.hits + this.stats.nesGpu.misses;
    const embeddingTotal = this.stats.embedding.hits + this.stats.embedding.misses;
    const overallTotal = redisTotal + gpuTotal + embeddingTotal;

    return {
      redis: redisTotal > 0 ? this.stats.redis.hits / redisTotal : 0,
      nesGpu: gpuTotal > 0 ? this.stats.nesGpu.hits / gpuTotal : 0,
      embedding: embeddingTotal > 0 ? this.stats.embedding.hits / embeddingTotal : 0,
      overall: overallTotal > 0 ? (this.stats.redis.hits + this.stats.nesGpu.hits + this.stats.embedding.hits) / overallTotal : 0
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Cleanup & Lifecycle
  // ═══════════════════════════════════════════════════════════

  private startCleanup(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean up GPU cache
    for (const [key, entry] of this.nesGpuCache.entries()) {
      if (entry.ttl && now - entry.timestamp > entry.ttl * 1000) {
        this.nesGpuCache.delete(key);
      }
    }

    // Clean up embedding cache
    for (const [key, entry] of this.embeddingCache.entries()) {
      if (now - entry.timestamp > this.config.embedding.ttl * 1000) {
        this.embeddingCache.delete(key);
      }
    }

    this.stats.nesGpu.size = this.nesGpuCache.size;
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.redis.quit();
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════

  private hashText(text: string): string {
    // Simple hash function for text keys
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `emb_${Math.abs(hash).toString(36)}`;
  }

  private findOldestEntry(cache: Map<string, CacheEntry<unknown>>): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private matchPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(key);
  }
}

// ═══════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════

let cacheInstance: UnifiedCacheService | null = null;

export function getCache(config?: Partial<CacheConfig>): UnifiedCacheService {
  if (!cacheInstance) {
    cacheInstance = new UnifiedCacheService(config);
  }
  return cacheInstance;
}

export default UnifiedCacheService;
