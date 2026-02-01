import { redis } from '$lib/server/redis-client';
import * as crypto from 'crypto';
import type { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';

export interface CacheOptions {
    ttl?: number; // Time to live in seconds
    tags?: string[]; // Tags for cache invalidation
    priority?: number; // Cache priority (higher = more important)
}

export interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    memoryUsage: number;
}

interface HotCacheItem {
    data: any;
    hits: number;
    lastAccess: number;
    accessCount: number;
}

class CachingLayer {
    private redisClient: Redis | null = null;
    private lruCache: LRUCache<string, any>;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        memoryUsage: 0
    };
    private hotCache: Map<string, HotCacheItem> = new Map();

    private cacheConfig = {
        maxMemory: 512 * 1024 * 1024, // 512MB max
        maxItems: 10000,
        hotCacheThreshold: 5, // Hits needed to promote to hot
        compressionThreshold: 1024, // Compress items larger than 1KB
    };

    constructor() {
        this.lruCache = new LRUCache({
            max: this.cacheConfig.maxItems,
            maxSize: this.cacheConfig.maxMemory,
            sizeCalculation: (value) => {
                // Estimate memory size
                return JSON.stringify(value).length;
            },
            dispose: (value, key) => {
                this.stats.evictions++;
                logger.debug(`[CachingLayer] Evicted ${key} from LRU cache`);
            },
            ttl: 1000 * 60 * 60, // 1 hour default TTL
        });

        this.initializeCache();

        // Periodic cleanup and stats update
        setInterval(() => this.performMaintenance(), 60000); // Every minute
    }

    private async initializeCache(): Promise<void> {
        // Try to connect to Redis
        try {
            // Check if redis client is ready
            if (redis) {
                this.redisClient = redis;
                logger.info('[CachingLayer] Redis client initialized');

                // Add error handler if not already present
                redis.on('error', (err) => {
                    logger.error('[CachingLayer] Redis error:', err);
                });
            } else {
                logger.warn('[CachingLayer] Redis client not available, ensuring ready...');
                // Try to ensure ready (this might not be needed if imports work)
                // await ensureRedisReady();
                // this.redisClient = redis;
            }
        } catch (error) {
            logger.warn('[CachingLayer] Redis initialization failed, using LRU only:', error);
            this.redisClient = null;
        }
    }

    /**
     * Generate cache key from input parameters
     */
    generateKey(params: Record<string, any>): string {
        const normalized = JSON.stringify(Object.keys(params).sort().reduce((obj: any, key) => {
            obj[key] = params[key];
            return obj;
        }, {}));
        return `ai:synthesis:${crypto.createHash('sha256').update(normalized).digest('hex')}`;
    }

    /**
     * Get item from cache with multi-tier strategy
     */
    async get(key: string): Promise<any | null> {
        try {
            // Check hot cache first (ultra-fast)
            const hotItem = this.hotCache.get(key);
            if (hotItem) {
                hotItem.hits++;
                hotItem.lastAccess = Date.now();
                this.stats.hits++;
                logger.debug(`[CachingLayer] Hot cache hit for ${key}`);
                return hotItem.data;
            }

            // Check LRU cache (fast)
            const lruItem = this.lruCache.get(key);
            if (lruItem) {
                this.stats.hits++;
                // Promote to hot cache if accessed frequently
                this.promoteToHotCache(key, lruItem);
                logger.debug(`[CachingLayer] LRU cache hit for ${key}`);
                return lruItem;
            }

            // Check Redis if available (distributed)
            if (this.redisClient) {
                try {
                    const redisValue = await this.redisClient.get(key);
                    if (redisValue) {
                        const data = JSON.parse(redisValue);
                        // Populate LRU cache
                        this.lruCache.set(key, data);
                        this.stats.hits++;
                        logger.debug(`[CachingLayer] Redis cache hit for ${key}`);
                        return data;
                    }
                } catch (error) {
                    logger.warn(`[CachingLayer] Redis get failed for ${key}:`, error);
                }
            }

            this.stats.misses++;
            return null;
        } catch (error) {
            logger.error(`[CachingLayer] Get failed for ${key}:`, error);
            this.stats.misses++;
            return null;
        }
    }

    /**
     * Set item in cache with multi-tier strategy
     */
    async set(key: string, value: any, options?: CacheOptions): Promise<void> {
        try {
            const ttl = options?.ttl ?? 3600; // Default 1 hour

            // Compress large values (implementation pending, for now just store)
            const dataToStore = value;

            // Store in LRU cache
            this.lruCache.set(key, dataToStore, { ttl: ttl * 1000 });

            // Store in Redis if available
            if (this.redisClient) {
                try {
                    const redisValue = JSON.stringify(dataToStore);
                    const pipeline = this.redisClient.pipeline();

                    pipeline.set(key, redisValue);
                    pipeline.expire(key, ttl);

                    // Add tags for invalidation
                    if (options?.tags) {
                        for (const tag of options.tags) {
                            pipeline.sadd(`tag:${tag}`, key);
                            pipeline.expire(`tag:${tag}`, ttl);
                        }
                    }

                    await pipeline.exec();
                    logger.debug(`[CachingLayer] Stored ${key} in Redis with TTL ${ttl}s`);
                } catch (error) {
                    logger.warn(`[CachingLayer] Redis set failed for ${key}:`, error);
                }
            }

            // Update stats
            this.stats.size = this.lruCache.size;
            // this.stats.memoryUsage = this.lruCache.calculatedSize; // calculatedSize property might depend on lru-cache version

            logger.debug(`[CachingLayer] Cached ${key} with TTL ${ttl}s`);
        } catch (error) {
            logger.error(`[CachingLayer] Set failed for ${key}:`, error);
        }
    }

    /**
     * Invalidate cache by tags
     */
    async invalidateByTags(tags: string[]): Promise<void> {
        try {
            let keysToDelete: string[] = [];

            if (this.redisClient) {
                for (const tag of tags) {
                    try {
                        const members = await this.redisClient.smembers(`tag:${tag}`);
                        if (members && members.length > 0) {
                            keysToDelete.push(...members);
                        }
                        // Clean up tag set
                        await this.redisClient.del(`tag:${tag}`);
                    } catch (e) {
                         logger.warn(`[CachingLayer] Failed to get members for tag ${tag}:`, e);
                    }
                }

                // Remove from Redis
                if (keysToDelete.length > 0) {
                    try {
                        await this.redisClient.del(...keysToDelete);
                    } catch (e) {
                         logger.warn('[CachingLayer] Failed to delete keys from Redis:', e);
                    }
                }
            }

            // Remove from LRU and Hot cache
            // Note: If we didn't get keys from Redis (e.g. Redis down), we might miss some in LRU if we rely only on Redis for tag mapping.
            // Ideally we should store tag mappings in LRU too, but for now we rely on Redis being the source of truth for tags.
            for (const key of keysToDelete) {
                this.lruCache.delete(key);
                this.hotCache.delete(key);
            }

            logger.info(`[CachingLayer] Invalidated ${keysToDelete.length} keys with tags: ${tags.join(', ')}`);

        } catch (error) {
            logger.error('[CachingLayer] Tag invalidation failed:', error);
        }
    }

    /**
     * Clear entire cache
     */
    async clear(): Promise<void> {
        try {
            this.lruCache.clear();
            this.hotCache.clear();

            if (this.redisClient) {
                // Be careful with flushall in production sharing same redis!
                // Ideally we should only flush keys with our prefix, but here we assume dedicated DB or prefix is handled?
                // For safety, maybe just log warning or skip flushing redis entirely unless explicitly requested.
                // await this.redisClient.flushall();
                logger.warn('[CachingLayer] Redis flush skipped for safety. Only local caches cleared.');
            }

            this.stats = {
                hits: 0,
                misses: 0,
                evictions: 0,
                size: 0,
                memoryUsage: 0
            };

            logger.info('[CachingLayer] Local cache cleared');
        } catch (error) {
            logger.error('[CachingLayer] Clear failed:', error);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<any> {
        let redisInfo = null;
        if (this.redisClient) {
            try {
                redisInfo = await this.redisClient.info();
            } catch (e) {
                redisInfo = 'Unavailable';
            }
        }

        const totalReqs = this.stats.hits + this.stats.misses;
        const hitRate = totalReqs > 0 ? this.stats.hits / totalReqs : 0;

        return {
            ...this.stats,
            hitRate,
            hotCacheSize: this.hotCache.size,
            lruCacheSize: this.lruCache.size,
            redisConnected: !!this.redisClient,
            redisStats: redisInfo ? 'Connected' : 'Disconnected'
        };
    }

    // === PRIVATE HELPER METHODS ===

    private promoteToHotCache(key: string, value: any): void {
        const HOT_CACHE_TTL = 30 * 60 * 1000; // 30 mins

        let accessCount = 1;

        // Hacky way to store access count in LRU meta or separate map?
        // Simpler: Just verify if it's already in hot cache? No, this function PROMOTES.
        // We need to track frequency.
        // For simplicity in this fix, we'll use a probability promotion or just check if it was recently accessed.

        // Let's implement a simple probabilistic promotion to avoid overhead
        if (Math.random() < 0.1) { // 10% chance to promote on access
             this.hotCache.set(key, {
                data: value,
                hits: 1,
                lastAccess: Date.now(),
                accessCount: 1
            });

             // Limit hot cache size
            if (this.hotCache.size > 100) {
                this.evictFromHotCache();
            }
        }
    }

    private evictFromHotCache(): void {
        // Find least recently accessed item
        let oldestKey: string | null = null;
        let oldestTime = Date.now();

        for (const [key, item] of this.hotCache.entries()) {
            if (item.lastAccess < oldestTime) {
                oldestTime = item.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.hotCache.delete(oldestKey);
            logger.debug(`[CachingLayer] Evicted ${oldestKey} from hot cache`);
        }
    }

    private async performMaintenance(): Promise<void> {
        // Clean up expired hot cache entries
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        for (const [key, item] of this.hotCache.entries()) {
            if (now - item.lastAccess > maxAge) {
                this.hotCache.delete(key);
            }
        }

        // Log stats periodically
        if (Math.random() < 0.1) { // 10% chance
            // const stats = await this.getStats();
            // logger.info('[CachingLayer] Periodic Stats:', stats);
        }
    }
}

// Export singleton instance
export const cachingLayer = new CachingLayer();








