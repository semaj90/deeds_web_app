/**
 * Unified Cache Service - Two-Layer Architecture
 * Layer 1: LokiJS (in-memory, fast queries)
 * Layer 2: IndexedDB (persistent, survives reload)
 */

import { browser } from '$app/environment';
import { indexedDBCache } from './indexdb-cache.svelte';
import { lokiCache } from './loki-cache.svelte';

export interface CacheStrategy {
	/** Use in-memory cache (LokiJS) */
	memory?: boolean;
	/** Use persistent cache (IndexedDB) */
	persistent?: boolean;
	/** Time to live in milliseconds */
	ttl?: number;
	/** Collection name for LokiJS */
	collection?: string;
}

class UnifiedCacheService {
	private stats = $state({
		memoryHits: 0,
		persistentHits: 0,
		misses: 0,
		writes: 0
	});

	/**
	 * Get data with two-layer cache strategy
	 * 1. Try LokiJS (fast)
	 * 2. Try IndexedDB (persistent)
	 * 3. Return null (cache miss)
	 */
	async get<T>(key: string, strategy: CacheStrategy = {}): Promise<T | null> {
		if (!browser) return null;

		const { memory = true, persistent = true, collection = 'default' } = strategy;

		// Layer 1: Try in-memory cache
		if (memory && lokiCache.isReady()) {
			const memData = lokiCache.findById(collection, key);
			if (memData !== null) {
				this.stats.memoryHits++;
				return memData as T;
			}
		}

		// Layer 2: Try persistent cache
		if (persistent && indexedDBCache.isReady()) {
			const diskData = await indexedDBCache.get<T>(key);
			if (diskData !== null) {
				this.stats.persistentHits++;

				// Hydrate memory cache if enabled
				if (memory && lokiCache.isReady()) {
					lokiCache.insert(collection, key, diskData, { ttl: strategy.ttl });
				}

				return diskData;
			}
		}

		this.stats.misses++;
		return null;
	}

	/**
	 * Set data in both cache layers
	 */
	async set<T>(key: string, data: T, strategy: CacheStrategy = {}): Promise<void> {
		if (!browser) return;

		const {
			memory = true,
			persistent = true,
			ttl = 3600000, // 1 hour default
			collection = 'default'
		} = strategy;

		// Write to in-memory cache
		if (memory && lokiCache.isReady()) {
			lokiCache.insert(collection, key, data, { ttl });
		}

		// Write to persistent cache
		if (persistent && indexedDBCache.isReady()) {
			await indexedDBCache.setCache(key, data, ttl);
		}

		this.stats.writes++;
	}

	/**
	 * Delete from both cache layers
	 */
	async delete(key: string, strategy: CacheStrategy = {}): Promise<void> {
		if (!browser) return;

		const { memory = true, persistent = true, collection = 'default' } = strategy;

		if (memory && lokiCache.isReady()) {
			lokiCache.delete(collection, key);
		}

		if (persistent && indexedDBCache.isReady()) {
			await indexedDBCache.delete(key);
		}
	}

	/**
	 * Clear all caches
	 */
	async clearAll(): Promise<void> {
		if (!browser) return;

		if (lokiCache.isReady()) {
			lokiCache.clearAll();
		}

		if (indexedDBCache.isReady()) {
			await indexedDBCache.clearAll();
		}

		this.stats = {
			memoryHits: 0,
			persistentHits: 0,
			misses: 0,
			writes: 0
		};

		console.log('✅ All caches cleared');
	}

	/**
	 * Query LokiJS collections (memory only)
	 */
	query<T>(collection: string, queryObj: any = {}): T[] {
		if (!browser || !lokiCache.isReady()) return [];
		return lokiCache.query(collection, queryObj);
	}

	/**
	 * Get cache statistics
	 */
	getStats() {
		const totalHits = this.stats.memoryHits + this.stats.persistentHits;
		const totalRequests = totalHits + this.stats.misses;
		const hitRate = totalRequests === 0 ? 0 : (totalHits / totalRequests) * 100;

		return {
			...this.stats,
			totalHits,
			totalRequests,
			hitRate: hitRate.toFixed(2) + '%',
			memoryStats: lokiCache.getStats(),
			persistentStats: indexedDBCache.getStats()
		};
	}

	/**
	 * Persist LokiJS snapshot to IndexedDB for warm starts
	 */
	async persistMemorySnapshot(): Promise<boolean> {
		if (!browser || !lokiCache.isReady() || !indexedDBCache.isReady()) {
			return false;
		}

		try {
			const snapshot = lokiCache.exportSnapshot();
			if (snapshot) {
				await indexedDBCache.setCache('__loki_snapshot__', snapshot, 86400000); // 24 hours
				console.log('✅ LokiJS snapshot persisted to IndexedDB');
				return true;
			}
			return false;
		} catch (error) {
			console.error('Snapshot persist error:', error);
			return false;
		}
	}

	/**
	 * Restore LokiJS from persisted snapshot
	 */
	async restoreMemorySnapshot(): Promise<boolean> {
		if (!browser || !lokiCache.isReady() || !indexedDBCache.isReady()) {
			return false;
		}

		try {
			const snapshot = await indexedDBCache.get<string>('__loki_snapshot__');
			if (snapshot) {
				const success = lokiCache.importSnapshot(snapshot);
				if (success) {
					console.log('✅ LokiJS snapshot restored from IndexedDB');
				}
				return success;
			}
			return false;
		} catch (error) {
			console.error('Snapshot restore error:', error);
			return false;
		}
	}

	/**
	 * Check system health
	 */
	healthCheck(): {, memory: boolean;, persistent: boolean;, healthy: boolean;
	} {
		const memory = lokiCache.isReady();
		const persistent = indexedDBCache.isReady();

		return {
			memory,
			persistent,
			healthy: memory && persistent
		};
	}
}

// Singleton instance with reactive state
export const cache = new UnifiedCacheService();

// Export class for testing
export { UnifiedCacheService };

/**
 * Svelte 5 composable for cache operations
 */
export function useCache() {
	return {
		get: <T>(key: string, strategy?: CacheStrategy) => cache.get<T>(key, strategy),
		set: <T>(key: string, data: T, strategy?: CacheStrategy) => cache.set(key, data, strategy),
		delete: (key: string, strategy?: CacheStrategy) => cache.delete(key, strategy),
		query: <T>(collection: string, queryObj?: any) => cache.query<T>(collection, queryObj),
		clearAll: () => cache.clearAll(),
		persistSnapshot: () => cache.persistMemorySnapshot(),
		restoreSnapshot: () => cache.restoreMemorySnapshot(),
		healthCheck: () => cache.healthCheck(),
		stats: cache.getStats()
	};
}

/**
 * Predefined cache strategies
 */
export const CacheStrategies = {
	/** Memory-only (fastest, not persistent) */
	MEMORY_ONLY: {, memory: true, persistent: false, ttl: 3600000 } as CacheStrategy,

	/** Persistent-only (slower, survives reload) */
	PERSISTENT_ONLY: {, memory: false, persistent: true, ttl: 86400000 } as CacheStrategy,

	/** Two-layer (fast + persistent) */
	TWO_LAYER: {, memory: true, persistent: true, ttl: 3600000 } as CacheStrategy,

	/** Short-term (5 minutes) */
	SHORT_TERM: {, memory: true, persistent: true, ttl: 300000 } as CacheStrategy,

	/** Long-term (24 hours) */
	LONG_TERM: {, memory: true, persistent: true, ttl: 86400000 } as CacheStrategy,

	/** Session-only (memory, expires on reload) */
	SESSION: {, memory: true, persistent: false, ttl: Infinity } as CacheStrategy
};

// Auto-persist LokiJS snapshot every 10 minutes
if (browser) {
	setInterval(async () => {
		await cache.persistMemorySnapshot();
	}, 600000);

	// Restore snapshot on load
	cache.restoreMemorySnapshot();
}
