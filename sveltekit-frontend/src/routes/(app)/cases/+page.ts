/**
 * Client-side load function with caching
 * Uses two-layer cache (LokiJS + IndexedDB) for case list data
 */
import { cache } from '$lib/cache/cache-service.svelte';
import type { PageLoad } from './$types';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

export const load: PageLoad = async ({ data, fetch }) => {
	const cacheKey = 'cases-list';
	const cacheTTL = 5 * 60 * 1000; // 5 minutes

	// Try cache first
	const cached = await cache.get<typeof data>(cacheKey);
	if (cached) {
		console.log('✅ Cache hit: cases list');
		return cached;
	}

	// Cache miss - use server data and cache it
	console.log('📡 Cache miss: using fresh data');
	await cache.set(cacheKey, data, {
		memory: true,
		persistent: true,
		ttl: cacheTTL
	});

	return data;
};
