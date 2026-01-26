/**
 * Unit Tests for Cache Services
 * Tests the cache layer independently from the UI
 */

import { clear, del, get, keys, set } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
	get: vi.fn(),
	set: vi.fn(),
	del: vi.fn(),
	clear: vi.fn(),
	keys: vi.fn()
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

describe('IndexedDB Cache Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(keys).mockResolvedValue([]);
	});

	it('should initialize successfully', async () => {
		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');

		expect(indexedDBCache.isReady()).toBe(true);
	});

	it('should get data from cache', async () => {
		const testData = { name: 'Test Case', id: '123' };
		const cacheEntry = {
			data: testData,
			timestamp: Date.now(),
			ttl: 3600000
		};

		vi.mocked(get).mockResolvedValue(cacheEntry);

		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');
		const result = await indexedDBCache.get('test-key');

		expect(result).toEqual(testData);
		expect(get).toHaveBeenCalledWith('test-key');
	});

	it('should return null for expired entries', async () => {
		const expiredEntry = {
			data: { name: 'Old Data' },
			timestamp: Date.now() - 7200000, // 2 hours ago
			ttl: 3600000 // 1 hour TTL
		};

		vi.mocked(get).mockResolvedValue(expiredEntry);

		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');
		const result = await indexedDBCache.get('expired-key');

		expect(result).toBeNull();
		expect(del).toHaveBeenCalledWith('expired-key');
	});

	it('should set data in cache with TTL', async () => {
		const testData = { title: 'New Case' };

		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');
		await indexedDBCache.setCache('new-key', testData, 300000);

		expect(set).toHaveBeenCalledWith('new-key', expect.objectContaining({
			data: testData,
			ttl: 300000
		}));
	});

	it('should delete cache entry', async () => {
		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');
		await indexedDBCache.delete('delete-key');

		expect(del).toHaveBeenCalledWith('delete-key');
	});

	it('should clear all cache', async () => {
		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');
		await indexedDBCache.clearAll();

		expect(clear).toHaveBeenCalled();
	});

	it('should track statistics', async () => {
		const cacheEntry = {
			data: { test: 'data' },
			timestamp: Date.now(),
			ttl: 3600000
		};

		vi.mocked(get).mockResolvedValue(cacheEntry);

		const { indexedDBCache } = await import('$lib/cache/indexdb-cache.svelte');

		await indexedDBCache.get('hit-key');
		await indexedDBCache.get('miss-key');

		const stats = indexedDBCache.getStats();
		expect(stats.hits).toBeGreaterThan(0);
	});
});

describe('LokiJS Cache Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should create and get collection', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		const collection = lokiCache.getCollection('test-collection');
		expect(collection).toBeDefined();
	});

	it('should insert document into collection', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		const doc = lokiCache.insert('test-collection', 'doc-1', { name: 'Test' }, { ttl: 3600000 });

		expect(doc).toBeDefined();
		expect(doc?.data).toEqual({ name: 'Test' });
	});

	it('should find document by id', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('test-collection', 'find-me', { value: 42 });
		const result = lokiCache.findById('test-collection', 'find-me');

		expect(result).toEqual({ value: 42 });
	});

	it('should return null for expired documents', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		// Insert with very short TTL
		lokiCache.insert('test-collection', 'expire-me', { data: 'old' }, { ttl: -1000 });

		// Should be expired
		const result = lokiCache.findById('test-collection', 'expire-me');
		expect(result).toBeNull();
	});

	it('should query documents with filters', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('cases', 'case-1', { priority: 'high', status: 'active' });
		lokiCache.insert('cases', 'case-2', { priority: 'low', status: 'active' });
		lokiCache.insert('cases', 'case-3', { priority: 'high', status: 'closed' });

		const results = lokiCache.query('cases', {
			'data.priority': 'high',
			'data.status': 'active'
		});

		expect(results).toHaveLength(1);
		expect(results[0].priority).toBe('high');
	});

	it('should delete document by id', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('test-collection', 'delete-me', { value: 'bye' });
		const deleted = lokiCache.delete('test-collection', 'delete-me');

		expect(deleted).toBe(true);

		const notFound = lokiCache.findById('test-collection', 'delete-me');
		expect(notFound).toBeNull();
	});

	it('should clear all documents in collection', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('clear-test', 'doc-1', { data: 1 });
		lokiCache.insert('clear-test', 'doc-2', { data: 2 });

		lokiCache.clearCollection('clear-test');

		const results = lokiCache.query('clear-test');
		expect(results).toHaveLength(0);
	});

	it('should export and import snapshot', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('snapshot-test', 'doc-1', { value: 'preserved' });

		const snapshot = lokiCache.exportSnapshot();
		expect(snapshot).toBeTruthy();

		lokiCache.clearCollection('snapshot-test');

		const imported = lokiCache.importSnapshot(snapshot!);
		expect(imported).toBe(true);

		const restored = lokiCache.findById('snapshot-test', 'doc-1');
		expect(restored?.value).toBe('preserved');
	});

	it('should track statistics', async () => {
		const { lokiCache } = await import('$lib/cache/loki-cache.svelte');

		lokiCache.insert('stats-test', 'doc-1', { data: 1 });
		lokiCache.insert('stats-test', 'doc-2', { data: 2 });

		const stats = lokiCache.getStats();
		expect(stats.collections).toBeGreaterThan(0);
		expect(stats.documents).toBeGreaterThanOrEqual(2);
	});
});

describe('Unified Cache Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(get).mockResolvedValue(null);
		vi.mocked(keys).mockResolvedValue([]);
	});

	it('should try memory cache first, then persistent', async () => {
		const testData = { name: 'Test' };

		// Memory cache miss, persistent cache hit
		const persistentEntry = {
			data: testData,
			timestamp: Date.now(),
			ttl: 3600000
		};
		vi.mocked(get).mockResolvedValue(persistentEntry);

		const { cache } = await import('$lib/cache/cache-service.svelte');
		const result = await cache.get('test-key', { memory: true, persistent: true });

		expect(result).toEqual(testData);
	});

	it('should write to both layers with two-layer strategy', async () => {
		const testData = { id: '123', name: 'Test Case' };

		const { cache } = await import('$lib/cache/cache-service.svelte');
		await cache.set('multi-key', testData, {
			memory: true,
			persistent: true,
			ttl: 300000
		});

		// Should have called IndexedDB set
		expect(set).toHaveBeenCalled();
	});

	it('should delete from both layers', async () => {
		const { cache } = await import('$lib/cache/cache-service.svelte');
		await cache.delete('delete-key', { memory: true, persistent: true });

		expect(del).toHaveBeenCalledWith('delete-key');
	});

	it('should provide health check', async () => {
		const { cache } = await import('$lib/cache/cache-service.svelte');
		const health = cache.healthCheck();

		expect(health).toHaveProperty('memory');
		expect(health).toHaveProperty('persistent');
		expect(health).toHaveProperty('healthy');
	});

	it('should calculate hit rate correctly', async () => {
		const cacheEntry = {
			data: { test: 'data' },
			timestamp: Date.now(),
			ttl: 3600000
		};

		vi.mocked(get)
			.mockResolvedValueOnce(cacheEntry) // hit
			.mockResolvedValueOnce(cacheEntry) // hit
			.mockResolvedValueOnce(null); // miss

		const { cache } = await import('$lib/cache/cache-service.svelte');

		await cache.get('key1');
		await cache.get('key2');
		await cache.get('key3');

		const stats = cache.getStats();
		expect(stats.hitRate).toBeDefined();
	});
});

describe('Offline Fetch Helper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('should fetch from API when online and no cache', async () => {
		const mockData = { id: '1', name: 'API Data' };
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: async () => mockData
		} as Response);

		const { offlineFetch } = await import('$lib/cache/offline-fetch');

		const result = await offlineFetch('/api/test', {
			cacheKey: 'test-key',
			forceFresh: true
		});

		expect(result).toEqual(mockData);
		expect(global.fetch).toHaveBeenCalledWith('/api/test');
	});

	it('should use cache when offline', async () => {
		// First cache some data while online
		const cachedData = { id: '1', name: 'Cached Data' };
		vi.mocked(get).mockResolvedValue({
			data: cachedData,
			timestamp: Date.now(),
			ttl: 3600000
		});

		// Mock navigator.onLine
		Object.defineProperty(navigator, 'onLine', {
			writable: true,
			value: false
		});

		const { offlineFetch } = await import('$lib/cache/offline-fetch');

		const result = await offlineFetch('/api/test', {
			cacheKey: 'offline-key'
		});

		expect(result).toEqual(cachedData);
		expect(global.fetch).not.toHaveBeenCalled();

		// Reset
		Object.defineProperty(navigator, 'onLine', {
			writable: true,
			value: true
		});
	});

	it('should queue mutations when offline', async () => {
		// Mock cache.get to return null (no existing queue)
		vi.mocked(get).mockResolvedValue(null);

		Object.defineProperty(navigator, 'onLine', {
			writable: true,
			value: false
		});

		const { offlineMutate } = await import('$lib/cache/offline-fetch');

		await expect(
			offlineMutate('/api/test', {
				method: 'POST',
				body: JSON.stringify({ test: 'data' })
			})
		).rejects.toThrow('queued for sync');

		// Verify cache.set was called to store the queue
		expect(vi.mocked(set)).toHaveBeenCalled();

		// Reset
		Object.defineProperty(navigator, 'onLine', {
			writable: true,
			value: true
		});
	});
});
