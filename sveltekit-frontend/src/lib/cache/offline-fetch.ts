/**
 * Offline-First Fetch Helper
 * Automatically falls back to cache when offline
 */

import { browser } from '$app/environment';
import { cache } from './cache-service.svelte';

export interface OfflineFetchOptions {
	/** Cache key for storing/retrieving data */
	cacheKey: string;
	/** Time to live in milliseconds (default: 1 hour) */
	ttl?: number;
	/** Use memory cache (default: true) */
	memory?: boolean;
	/** Use persistent cache (default: true) */
	persistent?: boolean;
	/** Force fresh fetch even if cached (default: false) */
	forceFresh?: boolean;
}

/**
 * Offline-first fetch wrapper
 * 1. If online and not forceFresh: try cache first, then API
 * 2. If online and forceFresh: fetch from API, update cache
 * 3. If offline: use cached data only
 */
export async function offlineFetch<T>(
	url: string,
	options: OfflineFetchOptions
): Promise<T | null> {
	const {
		cacheKey,
		ttl = 3600000,
		memory = true,
		persistent = true,
		forceFresh = false
	} = options;

	const isOnline = browser && navigator.onLine;

	// Offline - use cache only
	if (!isOnline) {
		console.log('📴 Offline: using cache for', cacheKey);
		const cached = await cache.get<T>(cacheKey);
		if (cached) {
			return cached;
		}
		throw new Error('No offline data available for ' + cacheKey);
	}

	// Online - try cache first (unless forceFresh)
	if (!forceFresh) {
		const cached = await cache.get<T>(cacheKey);
		if (cached) {
			console.log('✅ Cache hit:', cacheKey);
			return cached;
		}
	}

	// Fetch from API
	try {
		console.log('📡 Fetching from API:', url);
		const response = await fetch(url);

		if (!response.ok) {
			// API error - try cache as fallback
			const cached = await cache.get<T>(cacheKey);
			if (cached) {
				console.log('⚠️ API error, using stale cache:', cacheKey);
				return cached;
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		// Cache the result
		await cache.set(cacheKey, data, { memory, persistent, ttl });
		console.log('💾 Cached:', cacheKey);

		return data;
	} catch (error) {
		// Network error - try cache as fallback
		const cached = await cache.get<T>(cacheKey);
		if (cached) {
			console.log('⚠️ Network error, using stale cache:', cacheKey);
			return cached;
		}

		console.error('Failed to fetch:', error);
		throw error;
	}
}

/**
 * Offline-first POST/PUT/PATCH helper
 * Queues mutations when offline and syncs when online
 */
export async function offlineMutate<T>(
	url: string,
	options: RequestInit,
	cacheInvalidationKeys: string[] = []
): Promise<T> {
	const isOnline = browser && navigator.onLine;

	if (!isOnline) {
		// Queue mutation for later (simple implementation)
		console.log('📴 Offline: queuing mutation for', url);

		// Store in pending mutations queue
		const queueKey = 'pending-mutations';
		const queue = (await cache.get<any[]>(queueKey)) || [];
		queue.push({ url, options, timestamp: Date.now() });
		await cache.set(queueKey, queue, { persistent: true, ttl: Infinity });

		throw new Error('Mutation queued for sync when online');
	}

	// Execute mutation
	const response = await fetch(url, options);

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();

	// Invalidate related caches
	if (cacheInvalidationKeys.length > 0) {
		await Promise.all(cacheInvalidationKeys.map(key => cache.delete(key)));
		console.log('🗑️ Invalidated caches:', cacheInvalidationKeys.join(', '));
	}

	return data;
}

/**
 * Process pending mutations queue
 * Call this when app comes back online
 */
export async function syncPendingMutations(): Promise<void> {
	if (!browser || !navigator.onLine) return;

	const queueKey = 'pending-mutations';
	const queue = (await cache.get<any[]>(queueKey)) || [];

	if (queue.length === 0) {
		console.log('✅ No pending mutations to sync');
		return;
	}

	console.log(`🔄 Syncing ${queue.length} pending mutations...`);

	const results = await Promise.allSettled(
		queue.map(async (mutation) => {
			const response = await fetch(mutation.url, mutation.options);
			if (!response.ok) {
				throw new Error(`Failed to sync mutation: ${mutation.url}`);
			}
			return response.json();
		})
	);

	const successful = results.filter(r => r.status === 'fulfilled').length;
	const failed = results.filter(r => r.status === 'rejected').length;

	console.log(`✅ Synced ${successful} mutations, ${failed} failed`);

	// Clear queue
	await cache.delete(queueKey);
}

/**
 * Setup auto-sync when coming back online
 */
if (browser) {
	window.addEventListener('online', () => {
		console.log('✅ Back online - syncing pending mutations');
		syncPendingMutations();
	});
}
