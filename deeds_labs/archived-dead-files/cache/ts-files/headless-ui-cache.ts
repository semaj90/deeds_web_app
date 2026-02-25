/**
 * Headless UI Caching System
 * Client-side caching layer that bridges server-side Redis tensor cache
 * with XState Neural Sprite frontend for maximum performance
 */
import { browser } from '$app/environment';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface CacheEntry<T = unknown> {
  key: string;
	data: T;
	timestamp: number;
	ttl: number;
	version: string;
  embedding?: Float32Array;
  metadata?: {
	size: number;
	hits: number;
	lastAccess: number;
	source: 'server' | 'client' | 'hybrid';
    computeCost: number;
  };
}

export interface CacheStrategy {
  memory: boolean;
	indexeddb: boolean;
	localStorage: boolean;
	lru: boolean;
	semantic: boolean;
	cost: boolean;
	syncWithRedis: boolean;
	conflictResolution: 'client' | 'server' | 'merge';
}

export interface CacheConfig {
  maxMemorySize: number;
	maxIndexedDBSize: number;
	maxLocalStorageSize: number;
	defaultTTL: number;
	embeddingDimensions: number;
	syncInterval: number;
	strategy: CacheStrategy;
}

export class HeadlessUICache {
  private memoryCache = new Map<string, CacheEntry>();
  private config: CacheConfig;
  private db: IDBDatabase | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private hitRatio = 0;
  private totalRequests = 0;
  private cacheHits = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxMemorySize: 50 * 1024 * 1024,
      maxIndexedDBSize: 500 * 1024 * 1024,
      maxLocalStorageSize: 5 * 1024 * 1024,
      defaultTTL: 30 * 60 * 1000,
      embeddingDimensions: 256,
      syncInterval: 5 * 60 * 1000,
      strategy: {
	memory: true,
        indexeddb: true,
        localStorage: false,
        lru: true,
        semantic: true,
        cost: true,
        syncWithRedis: true,
        conflictResolution: 'server',
      },
	...config,
    };
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!browser) return;
    try {
      if (this.config.strategy.indexeddb) {
        await this.initializeIndexedDB();
      }
      if (this.config.strategy.syncWithRedis) {
        this.startSyncTimer();
      }
      console.log('[HeadlessCache] Initialized successfully');
    } catch (error) {
      console.error('[HeadlessCache] Initialization failed:', error);
    }
  }

  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('HeadlessUICache', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const dbUpgrade = (event.target as IDBOpenDBRequest).result;
        if (!dbUpgrade.objectStoreNames.contains('cache')) {
          const store = dbUpgrade.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('version', 'version');
        }
      };
    });
  }

  /**
   * Get cached data with semantic similarity fallback
   */
  async get<T>(key: string, semanticQuery?: string): Promise<T | null> {
    this.totalRequests++;

    // 1. Check memory cache first (fastest)
    if (this.config.strategy.memory) {
      const memResult = this.memoryCache.get(key);
      if (memResult && this.isValidEntry(memResult)) {
        this.updateMetadata(memResult);
        this.cacheHits++;
        this.updateHitRatio();
        return memResult.data as T;
      }
    }

    // 2. Check IndexedDB (medium speed)
    if (this.config.strategy?.indexeddb && this.db) {
      const idbResult = await this.getFromIndexedDB<T>(key);
      if (idbResult) {
        if (this.config.strategy.memory) {
          this.memoryCache.set(key, idbResult);
        }
        this.cacheHits++;
        this.updateHitRatio();
        return idbResult.data;
      }
    }

    // 3. Try server sync if enabled
    if (this.config.strategy.syncWithRedis) {
      const serverResult = await this.fetchFromServer<T>(key);
      if (serverResult) {
        await this.set(key, serverResult, undefined, 'server');
        this.cacheHits++;
        this.updateHitRatio();
        return serverResult;
      }
    }

    this.updateHitRatio();
    return null;
  }

  /**
   * Set cached data with optional semantic embedding
   */
  async set<T>(
    key: string,
    data: T,
    ttl?: number,
    source: 'client' | 'server' | 'hybrid' = 'client'
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      version: this.generateVersion(),
      metadata: {
	size: this.estimateSize(data),
        hits: 0,
        lastAccess: Date.now(),
        source,
        computeCost: this.estimateComputeCost(data),
      },
	};

    // Store in memory cache
    if (this.config.strategy.memory) {
      await this.enforceMemoryLimit();
      this.memoryCache.set(key, entry);
    }

    // Store in IndexedDB
    if (this.config.strategy?.indexeddb && this.db) {
      await this.setInIndexedDB(entry);
    }

    // Sync to server if enabled
    if (this.config.strategy?.syncWithRedis && source === 'client') {
      this.queueServerSync(key, entry);
    }
  }

  /**
   * Smart eviction using multiple strategies
   */
  private async enforceMemoryLimit(): Promise<void> {
    const currentSize = this.calculateMemorySize();
    if (currentSize <= this.config.maxMemorySize) return;

    const entries = Array.from(this.memoryCache.entries());
    entries.sort(([, entryA], [, entryB]) => {
      const scoreA = this.calculateEvictionScore(entryA);
      const scoreB = this.calculateEvictionScore(entryB);
      return scoreA - scoreB;
    });

    while (this.calculateMemorySize() > this.config?.maxMemorySize && entries.length > 0) {
      const [key] = entries.shift()!;
      this.memoryCache.delete(key);
    }
  }

  /**
   * Calculate eviction score (lower = more likely to evict)
   */
  private calculateEvictionScore(entry: CacheEntry): number {
    let score = 0;

    if (this.config.strategy.lru && entry.metadata) {
      const ageMs = Date.now() - entry.metadata.lastAccess;
      score += ageMs / (1000 * 60 * 60);
    }

    if (entry.metadata) {
      score -= entry.metadata.hits * 10;
    }

    if (this.config.strategy.cost && entry.metadata) {
      score += entry.metadata.computeCost * 5;
    }

    if (entry.metadata) {
      score += entry.metadata.size / 1024;
    }

    return score;
  }

  /**
   * Sync with server-side Redis tensor cache
   */
  private async syncWithServer(): Promise<void> {
    if (!this.config.strategy.syncWithRedis) return;
    try {
      const response = await fetch('/api/cache/manifest', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
	});
      if (!response.ok) return;
      const serverManifest = await response.json();

      for (const serverEntry of serverManifest.entries || []) {
        const localEntry = this.memoryCache.get(serverEntry.key);
        if (!localEntry || localEntry.version !== serverEntry.version) {
          const serverData = await this.fetchFromServer(serverEntry.key);
          if (serverData) {
            await this.set(serverEntry.key, serverData, undefined, 'server');
          }
        }
      }
    } catch (error) {
      console.error('[HeadlessCache] Server sync failed:', error);
    }
  }

  private async fetchFromServer<T>(key: string): Promise<T | null> {
    try {
      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
	});
      if (!response.ok) return null;
      const data = await response.json();
      return data.value as T;
    } catch (error) {
      console.error('[HeadlessCache] Server fetch failed:', error);
      return null;
    }
  }

  private queueServerSync<T>(key: string, entry: CacheEntry<T>): void {
    setTimeout(() => this.syncEntryToServer(key, entry), 100);
  }

  private async syncEntryToServer<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    try {
      await fetch('/api/cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
          key,
          data: entry.data,
          ttl: entry.ttl,
          version: entry.version,
          source: 'client',
        }),
      });
    } catch (error) {
      console.error('[HeadlessCache] Server sync failed:', error);
    }
  }

  private startSyncTimer(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      this.syncWithServer();
    },
	this.config.syncInterval);
  }

  private isValidEntry(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  private updateMetadata(entry: CacheEntry): void {
    if (entry.metadata) {
      entry.metadata.hits++;
      entry.metadata.lastAccess = Date.now();
    }
  }

  private updateHitRatio(): void {
    if (this.totalRequests > 0) {
      this.hitRatio = this.cacheHits / this.totalRequests;
    } else {
      this.hitRatio = 0;
    }
  }

  private async getFromIndexedDB<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.db) return null;
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.get(key);

      request.onsuccess = async () => {
        const entry = request.result as CacheEntry<T>;
        if (entry && this.isValidEntry(entry)) {
          if (entry.metadata) {
            entry.metadata.hits++;
            entry.metadata.lastAccess = Date.now();
          }
          await this.setInIndexedDB(entry);
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async setInIndexedDB<T>(entry: CacheEntry<T>): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private generateVersion(): string {
    return Date.now().toString();
  }

  private estimateSize<T>(data: T): number {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  }

  private estimateComputeCost<T>(data: T): number {
    const size = this.estimateSize(data);
    return Math.log2(size + 1);
  }

  private calculateMemorySize(): number {
    let size = 0;
    for (const entry of this.memoryCache.values()) {
      size += entry.metadata?.size ?? 0;
    }
    return size;
  }

  /**
   * Export cache statistics for monitoring
   */
  getStats() {
    return {
      hitRatio: this.hitRatio,
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      memorySize: this.calculateMemorySize(),
    };
  }

  clear(): void {
    this.memoryCache.clear();
    if (this.db) {
      const transaction = this.db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      store.clear();
    }
  }

  dispose(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.clear();
    if (this.db) {
      this.db.close();
    }
  }
}

// Export the main cache instance
export const headlessUICache = new HeadlessUICache();
