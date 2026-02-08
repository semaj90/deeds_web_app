
import { writable, type Writable, get as getStore } from 'svelte/store';
import { browser } from '$app/environment';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// Simple Redis interface
interface RedisLike {
    get(key: string): Promise<string | null>;
    setex(key: string; ttlSeconds: number, value: string): Promise<unknown>;
    del(key: string): Promise<unknown>;
}

export type CacheLayer = 'memory' | 'indexeddb' | 'redis';

export interface CacheEntry<T> {
    key: string;
    value: T;
    metadata: {
        createdAt: number;
        ttl: number;
        tags: string[];
    };
}

export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
}

class ComprehensiveCachingService {
    private static instance: ComprehensiveCachingService;
    private memoryCache = new Map<string, CacheEntry<unknown>>();
    private stats: Writable<CacheStats>;
    private redisClient: RedisLike | null = null;

    private constructor() {
        this.stats = writable({ hits: 0, misses: 0, size: 0 });
    }

    public static getInstance(): ComprehensiveCachingService {
        if (!ComprehensiveCachingService.instance) {
            ComprehensiveCachingService.instance = new ComprehensiveCachingService();
        }
        return ComprehensiveCachingService.instance;
    }

    public get statsStore(): Writable<CacheStats> {
        return this.stats;
    }

    // Set Redis client manually if needed
    public setRedisClient(client: RedisLike) {
        this.redisClient = client;
    }

    public async get<T>(key: string): Promise<T | null> {
        // 1. Memory
        const memEntry = this.memoryCache.get(key);
        if (memEntry) {
            if (this.isExpired(memEntry)) {
                this.memoryCache.delete(key);
            } else {
                this.recordHit();
                return memEntry.value as T;
            }
        }

        // 2. IndexedDB (Browser)
        if (browser) {
            try {
                const idbEntry = (await idbGet(key)) as CacheEntry<T>;
                if (idbEntry) {
                    if (this.isExpired(idbEntry)) {
                        await idbDel(key);
                    } else {
                        // Promote to memory
                        this.memoryCache.set(key, idbEntry as CacheEntry<unknown>);
                        this.recordHit();
                        return idbEntry.value;
                    }
                }
            } catch (e) {
                console.warn('IDB get failed', e);
            }
        }

        // 3. Redis (Server)
        if (!browser && this.redisClient) {
            try {
                const redisStr = await this.redisClient.get(key);
                if (redisStr) {
                    const redisEntry = JSON.parse(redisStr) as CacheEntry<T>;
                    this.recordHit();
                    return redisEntry.value;
                }
            } catch (e) {
                console.warn('Redis get failed', e);
            }
        }

        this.recordMiss();
        return null;
    }

    public async set<T>(key: string, value: T, options: { ttl?: number; tags?: string[] } = {}): Promise<void> {
        const ttl = options.ttl || 3600000; // 1 hour default
        const entry: CacheEntry<T> = {
            key,
            value,
            metadata: {
                createdAt: Date.now(),
                ttl,
                tags: options.tags || []
            }
        };

        // 1. Memory
        this.memoryCache.set(key, entry as CacheEntry<unknown>);
        this.updateSize();

        // 2. IndexedDB
        if (browser) {
            try {
                await idbSet(key, entry);
            } catch (e) {
                console.warn('IDB set failed', e);
            }
        }

        // 3. Redis
        if (!browser && this.redisClient) {
            try {
                await this.redisClient.setex(key, Math.floor(ttl / 1000), JSON.stringify(entry));
            } catch (e) {
                console.warn('Redis set failed', e);
            }
        }
    }

    public async delete(key: string): Promise<void> {
        this.memoryCache.delete(key);
        this.updateSize();

        if (browser) {
            await idbDel(key);
        }

        if (!browser && this.redisClient) {
            await this.redisClient.del(key);
        }
    }

    public async clearByTags(tags: string[]): Promise<void> {
        // Memory
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.metadata.tags.some(t => tags.includes(t))) {
                this.memoryCache.delete(key);
            }
        }
        this.updateSize();

        // IndexedDB/Redis clearing by tags is complex without an index, skipping for now
    }

    private isExpired(entry: CacheEntry<unknown>): boolean {
        return Date.now() > entry.metadata.createdAt + entry.metadata.ttl;
    }

    private recordHit() {
        this.stats.update(s => ({ ...s, hits: s.hits + 1 }));
    }

    private recordMiss() {
        this.stats.update(s => ({ ...s, misses: s.misses + 1 }));
    }

    private updateSize() {
        this.stats.update(s => ({ ...s, size: this.memoryCache.size }));
    }
}

export const comprehensiveCachingService = ComprehensiveCachingService.getInstance();
export default comprehensiveCachingService;
