/**
 * IndexedDB Cache Service with Svelte 5 Runes
 * Provides reactive caching layer for browser-side data
 */

import { browser } from '$app/environment';
import { clear, del, get, keys, set } from 'idb-keyval';

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // Time to live in milliseconds
}

interface CacheStats {
	hits: number;
	misses: number;
	size: number;
}

class IndexedDBCache {
	private stats = $state<CacheStats>({ hits: 0, misses: 0, size: 0 });
	private ready = $state(false);

	constructor() {
		if (browser) {
			this.initialize();
		}
	}

	private async initialize() {
		try {
			// Test IndexedDB availability
			await keys();
			this.ready = true;
			await this.updateSize();
			console.log('✅ IndexedDB cache initialized');
		} catch (error) {
			console.error('❌ IndexedDB initialization failed:', error);
		}
	}

	/**
	 * Get data from cache with reactive state
	 */
	async get<T>(key: string): Promise<T | null> {
		if (!browser || !this.ready) return null;

		try {
			const entry = await get<CacheEntry<T>>(key);

			if (!entry) {
				this.stats.misses++;
				return null;
			}

			// Check if entry is expired
			const now = Date.now();
			if (now - entry.timestamp > entry.ttl) {
				await this.delete(key);
				this.stats.misses++;
				return null;
			}

			this.stats.hits++;
			return entry.data;
		} catch (error) {
			console.error('Cache get error:', error);
			this.stats.misses++;
			return null;
		}
	}

	/**
	 * Set data in cache with TTL
	 */
	async setCache<T>(key: string, data: T, ttl: number = 3600000): Promise<void> {
		if (!browser || !this.ready) return;

		try {
			const entry: CacheEntry<T> = {
				data,
				timestamp: Date.now(),
				ttl
			};

			await set(key, entry);
			await this.updateSize();
		} catch (error) {
			console.error('Cache set error:', error);
		}
	}

	/**
	 * Delete entry from cache
	 */
	async delete(key: string): Promise<void> {
		if (!browser || !this.ready) return;

		try {
			await del(key);
			await this.updateSize();
		} catch (error) {
			console.error('Cache delete error:', error);
		}
	}

	/**
	 * Clear all cache
	 */
	async clearAll(): Promise<void> {
		if (!browser || !this.ready) return;

		try {
			await clear();
			this.stats = { hits: 0, misses: 0, size: 0 };
			console.log('✅ Cache cleared');
		} catch (error) {
			console.error('Cache clear error:', error);
		}
	}

	/**
	 * Get all cache keys
	 */
	async getKeys(): Promise<IDBValidKey[]> {
		if (!browser || !this.ready) return [];

		try {
			return await keys();
		} catch (error) {
			console.error('Cache keys error:', error);
			return [];
		}
	}

	/**
	 * Update cache size
	 */
	private async updateSize(): Promise<void> {
		try {
			const allKeys = await keys();
			this.stats.size = allKeys.length;
		} catch (error) {
			console.error('Cache size update error:', error);
		}
	}

	/**
	 * Get cache statistics (reactive)
	 */
	getStats() {
		return this.stats;
	}

	/**
	 * Check if cache is ready
	 */
	isReady() {
		return this.ready;
	}

	/**
	 * Get hit rate
	 */
	getHitRate(): number {
		const total = this.stats.hits + this.stats.misses;
		return total === 0 ? 0 : (this.stats.hits / total) * 100;
	}
}

// Singleton instance with reactive state
export const indexedDBCache = new IndexedDBCache();

// Export class for testing
export { IndexedDBCache as IndexedDBCacheService };

/**
 * Composable for cache operations with reactive state
 */
export function useCache() {
	return {
		get: <T>(key: string) => indexedDBCache.get<T>(key),
		set: <T>(key: string, data: T, ttl?: number) => indexedDBCache.setCache(key, data, ttl),
		delete: (key: string) => indexedDBCache.delete(key),
		clear: () => indexedDBCache.clearAll(),
		getKeys: () => indexedDBCache.getKeys(),
		stats: indexedDBCache.getStats(),
		hitRate: indexedDBCache.getHitRate(),
		isReady: indexedDBCache.isReady()
	};
}
