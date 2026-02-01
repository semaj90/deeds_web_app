/**
 * 🚀 Multi-Layer Caching System for Legal AI
 * Implements Loki.js (memory), Fuse.js (search), IndexedDB (browser), Redis (server)
 */
import { browser } from '$app/environment';
import Fuse from 'fuse.js';
import type { Collection } from 'lokijs';
import Loki from 'lokijs';
import type {
    CachingTypes,
    LokiTypes,
    IndexedDBTypes,
    RedisTypes
} from '$lib/types/enhanced-svelte5-types';

// Use enhanced types with proper structure
interface CacheEntry<T = unknown> extends CachingTypes.CacheEntry<T> {
    key: string;
    value: T;
    timestamp: number;
    ttl: number;
    layer: CachingTypes.CacheLayer;
    priority: number;
    accessCount: number;
    sizeBytes: number;
}

interface CacheLayer {
    name: string;
    maxSize: number;
    currentSize: number;
    hitRate: number;
    missRate: number;
}

export class MultiLayerCacheSystem {
    // Layer: In-memory cache (Loki.js) - Fastest
    private lokiDB: Loki;
    private memoryCollection: Collection<CacheEntry>;

    // Layer: Search index (Fuse.js) - For fuzzy searching
    private fuseIndex: Fuse<CacheEntry> | null = null;

    // Layer: Browser storage (IndexedDB) - Persistent client cache
    private indexedDB: IDBDatabase | null = null;

    // Layer: Server cache (Redis) - Shared cache
    private redisClient: any | null = null;
    private redisInitialized = false;

    // Cache statistics
    private stats = {
        hits: { l1: 0, l2: 0, l3: 0, l4: 0 },
	misses: { l1: 0, l2: 0, l3: 0, l4: 0 },
	evictions: 0,
        writes: 0
    };

    // Configuration
    private readonly config = {
        l1MaxSize: 10 * 1024 * 1024, // 10MB memory cache
        l2MaxSize: 50 * 1024 * 1024, // 50MB IndexedDB
        l3MaxSize: 100 * 1024 * 1024, // 100MB Redis
        defaultTTL: 3600, // 1 hour default TTL
        evictionPolicy: 'lru' as 'lru' | 'lfu' | 'fifo'
    };

    constructor() {
        // Initialize Loki.js in-memory database
        this.lokiDB = new Loki('legal-ai-cache.db', {
            env: 'BROWSER',
            autosave: false,
            persistenceMethod: 'memory'
        });

        this.memoryCollection = this.lokiDB.addCollection('cache', { indices: ['key'] }) as unknown as Collection<CacheEntry>;

        // Initialize Fuse.js
        this.fuseIndex = new Fuse([], { keys: ['key', 'value'], includeScore: true });

        if (browser && window.indexedDB) {
             const request = window.indexedDB.open('LegalAICache', 1);
             request.onupgradeneeded = (event) => {
                 const db = (event.target as IDBOpenDBRequest).result;
                 if (!db.objectStoreNames.contains('cache')) {
                     db.createObjectStore('cache', { keyPath: 'key' });
                 }
             };
             request.onsuccess = (event) => {
                 this.indexedDB = (event.target as IDBOpenDBRequest).result;
             };
        }
    }

    /**
     * Initialize Redis connection if on server
     */
    private async ensureRedis(): Promise<any | null> {
        if (browser) return null;
        if (this.redisInitialized) return this.redisClient;

        try {
            // Dynamically import to avoid bundling issues
            const redisModule = await import('$lib/server/redis-client');
            this.redisClient = (redisModule as any).redis;
            this.redisInitialized = true;
            return this.redisClient;
        } catch (error) {
            console.warn('Failed to initialize Redis client:', error);
            return null;
        }
    }

    /**
     * Multi-layer cache GET operation
     */
    async get<T>(key: string): Promise<T | null> {
        // L1: Memory
        const memoryEntry = this.memoryCollection.findOne({ key });
        if (memoryEntry) {
            if (this.isExpired(memoryEntry)) {
                this.memoryCollection.remove(memoryEntry);
            } else {
                this.stats.hits.l1++;
                memoryEntry.accessCount++;
                this.memoryCollection.update(memoryEntry);
                return memoryEntry.value as T;
            }
        } else {
            this.stats.misses.l1++;
        }

        // L2: IndexedDB (Browser only)
        if (browser && this.indexedDB) {
            try {
                const dbEntry = await this.getFromIndexedDB<T>(key);
                if (dbEntry) {
                     if (this.isExpired(dbEntry)) {
                        // Delete expired?
                     } else {
                         this.stats.hits.l2++;
                         // Promote to L1
                         this.setInMemory(key, dbEntry.value, dbEntry.ttl, dbEntry.priority);
                         return dbEntry.value as T;
                     }
                }
            } catch (err) { /* ignore */ }
            this.stats.misses.l2++;
        }

        // L3: Redis (Server only)
        if (!browser) {
            const redisEntry = await this.getFromRedis<T>(key);
            if (redisEntry) {
                this.stats.hits.l3++;
                // Promote to L1
                this.setInMemory(key, redisEntry.value, redisEntry.ttl, redisEntry.priority);
                return redisEntry.value as T;
            }
            this.stats.misses.l3++;
        }

        return null;
    }

    /**
     * Multi-layer cache SET operation
     */
    async set<T>(key: string, value: T, ttl: number = this.config.defaultTTL, priority: number = 10): Promise<void> {
        this.stats.writes++;

        // Always write to L1 (Memory)
        await this.setInMemory(key, value, ttl, priority);

        // L2: IndexedDB (Browser only)
        if (browser && this.indexedDB) {
            // Fire and forget or await? Await to ensure persistence.
            await this.setInIndexedDB(key, value, ttl, priority).catch(err => console.error('IndexedDB error', err));
        }

        // L3: Redis (Server only)
        if (!browser) {
             await this.setInRedis(key, value, ttl, priority).catch(err => console.error('Redis error', err));
        }
    }

    /**
     * Fuzzy search using Fuse.js
     */
    async search<T>(query: string, limit: number = 10): Promise<T[]> {
        if (!this.fuseIndex) return [];
        const results = this.fuseIndex.search(query);
        return results
            .slice(0, limit)
            .filter(result => !this.isExpired(result.item))
            .map(result => result.item.value as T);
    }

    /**
     * Set in Loki.js memory cache with eviction
     */
    async setInMemory<T>(key: string, value: T, ttl: number = this.config.defaultTTL, priority: number = 10): Promise<void> {
        const sizeBytes = this.estimateSize(value);
        // Check if we need to evict
        const currentSize = this.getCurrentMemorySize();
        if (currentSize + sizeBytes > this.config.l1MaxSize) {
            await this.evictFromMemory(sizeBytes);
        }

        const entry: CacheEntry<T> = {
            key,
            value,
            timestamp: Date.now(),
            ttl,
            priority,
            accessCount: 1,
            sizeBytes
        };

        // Remove existing entry if present
        const existing = this.memoryCollection.findOne({ key });
        if (existing) {
            this.memoryCollection.remove(existing);
        }
        this.memoryCollection.insert(entry);

        if (this.fuseIndex) {
           this.fuseIndex.add(entry);
        }
        this.stats.writes++;
    }

    /**
     * Set in IndexedDB
     */
    private async setInIndexedDB<T>(key: string, value: T, ttl: number = this.config.defaultTTL, priority: number = 10): Promise<void> {
        if (!this.indexedDB) return;
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB!.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
             const entry: CacheEntry<T> = {
                key,
                value,
                timestamp: Date.now(),
                ttl,
                priority,
                accessCount: 1,
                sizeBytes: this.estimateSize(value)
            };
            const request = store.put(entry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Set in Redis (Server only)
     */
    private async setInRedis<T>(key: string, value: T, ttl: number = this.config.defaultTTL, priority: number = 10): Promise<void> {
        const client = await this.ensureRedis();
        if (!client) return;

        const entry: CacheEntry<T> = {
            key,
            value,
            timestamp: Date.now(),
            ttl,
            priority,
            accessCount: 1,
            sizeBytes: this.estimateSize(value)
        };

        try {
            const serialized = JSON.stringify(entry);
            if (ttl > 0) {
               await client.set(key, serialized, 'EX', ttl);
            } else {
               await client.set(key, serialized);
            }
        } catch (error) {
            console.error('Redis set error:', error);
        }
    }

    /**
     * Get from Redis (Server only)
     */
    private async getFromRedis<T>(key: string): Promise<CacheEntry<T> | null> {
         const client = await this.ensureRedis();
         if (!client) return null;

         try {
             const result = await client.get(key);
             if (!result) return null;
             return JSON.parse(result) as CacheEntry<T>;
         } catch (error) {
             console.error('Redis get error:', error);
             return null;
         }
    }

    /**
     * Get from IndexedDB
     */
    private async getFromIndexedDB<T>(key: string): Promise<CacheEntry<T> | null> {
        if (!this.indexedDB) return null;
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB!.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            const request = store.get(key);
            request.onsuccess = () => {
                resolve((request.result as CacheEntry<T>) || null);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Evict entries from memory based on policy
     */
    private async evictFromMemory(bytesNeeded: number): Promise<void> {
        let evicted = 0;
        const entries = this.memoryCollection.find();
        // Sort based on eviction policy
        let sorted: CacheEntry[] = [];
        switch (this.config.evictionPolicy) {
            case 'lru':
                sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
                break;
            case 'lfu':
                sorted = entries.sort((a, b) => a.accessCount - b.accessCount);
                break;
            case 'fifo':
                sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
                break;
            default:
                sorted = entries;
        }
        // Evict until we have enough space
        for (const entry of sorted) {
            if (evicted >= bytesNeeded) break;
            // Don't evict high-priority items unless necessary'
            if (entry.priority < 200 || evicted < bytesNeeded / 2) {
                this.memoryCollection.remove(entry);
                if (this.fuseIndex) {
                     this.fuseIndex.remove((doc) => doc.key === entry.key);
                }
                evicted += entry.sizeBytes;
                this.stats.evictions++;
            }
        }
    }

    /**
     * Check if cache entry is expired
     */
    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl * 1000;
    }

    /**
     * Estimate size of value in bytes
     */
    private estimateSize(value: any): number {
        const str = JSON.stringify(value);
        return new Blob([str]).size;
    }

    /**
     * Get current memory cache size
     */
    private getCurrentMemorySize(): number {
        return this.memoryCollection.find().reduce((total, entry) => total + entry.sizeBytes, 0);
    }

    /**
     * Clear specific cache layer or all layers
     */
    async clear(layer?: 'memory' | 'indexeddb' | 'redis' | 'all'): Promise<void> {
        switch (layer) {
            case 'memory':
                this.memoryCollection.clear();
                break;
            case 'indexeddb':
                if (this.indexedDB) {
                    const transaction = this.indexedDB.transaction(['cache'], 'readwrite');
                    const store = transaction.objectStore('cache');
                    // await store.clear() is not valid IDB API directly, returns request
                    await new Promise<void>((resolve, reject) => {
                         const req = store.clear();
                         req.onsuccess = () => resolve();
                         req.onerror = () => reject(req.error);
                    });
                }
                break;
            case 'redis':
                if (!browser) {
                    const client = await this.ensureRedis();
                    if (client) {
                        try {
                            await client.flushdb();
                        } catch (e) { console.error('Redis clear failed', e); }
                    }
                }
                break;
            case 'all': default, this.memoryCollection.clear();
                if (browser && this.indexedDB) {
                    const transaction = this.indexedDB.transaction(['cache'], 'readwrite');
                    const store = transaction.objectStore('cache');
                     await new Promise<void>((resolve, reject) => {
                         const req = store.clear();
                         req.onsuccess = () => resolve();
                         req.onerror = () => reject(req.error);
                    });
                }
                 if (!browser) {
                    const client = await this.ensureRedis();
                    if (client) {
                        try {
                            await client.flushdb();
                        } catch (e) { console.error('Redis clear failed', e); }
                    }
                }
                break;
        }
        // Reset Fuse.js index
        if (this.fuseIndex) {
            this.fuseIndex.remove(() => true);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): { layers: CacheLayer[];
	totalHits: number, totalMisses: number, hitRate: number, evictions: number, writes: number } {
        const totalHits = Object.values(this.stats.hits).reduce((a, b) => a + b, 0);
        const totalMisses = Object.values(this.stats.misses).reduce((a, b) => a + b, 0);
        return {
            layers: [
                {
                    name: 'Memory (Loki.js)',
                    maxSize: this.config.l1MaxSize,
                    currentSize: this.getCurrentMemorySize(),
                    hitRate: this.stats.hits.l1 / (this.stats.hits.l1 + this.stats.misses.l1) || 0,
                    missRate: this.stats.misses.l1 / (this.stats.hits.l1 + this.stats.misses.l1) || 0
                },
	{
                    name: 'IndexedDB',
                    maxSize: this.config.l2MaxSize,
                    currentSize: 0, // Would need async calculation
                    hitRate: this.stats.hits.l2 / (this.stats.hits.l2 + this.stats.misses.l2) || 0,
                    missRate: this.stats.misses.l2 / (this.stats.hits.l2 + this.stats.misses.l2) || 0
                },
	{
                    name: 'Redis',
                    maxSize: this.config.l3MaxSize,
                    currentSize: 0, // Hard to calculate efficiently without scanning
                    hitRate: this.stats.hits.l3 / (this.stats.hits.l3 + this.stats.misses.l3) || 0,
                    missRate: this.stats.misses.l3 / (this.stats.hits.l3 + this.stats.misses.l3) || 0
                }
            ],
            totalHits: totalHits,
            totalMisses: totalMisses,
            hitRate: totalHits / (totalHits + totalMisses) || 0,
            evictions: this.stats.evictions,
            writes: this.stats.writes
        };
    }
}

// Export singleton instance
export const multiLayerCache = new MultiLayerCacheSystem();





