/**
 * Cache Invalidation Utilities
 * Centralized cache key management and invalidation
 */

import { cache } from './cache-service.svelte';

/**
 * Standardized cache keys for the application
 */
export const CacheKeys = {
	// Case-related
	CASES_LIST: 'cases-list',
	CASE_DETAIL: (id: string) => `case-${id}`,
	CASE_EVIDENCE: (caseId: string) => `case-${caseId}-evidence`,
	CASE_TIMELINE: (caseId: string) => `case-${caseId}-timeline`,

	// User-related
	USER_PROFILE: (userId: string) => `user-${userId}`,
	USER_SETTINGS: (userId: string) => `user-${userId}-settings`,

	// Dashboard
	DASHBOARD_STATS: 'dashboard-stats',
	RECENT_ACTIVITY: 'recent-activity',

	// Search
	SEARCH_RESULTS: (query: string) => `search-${query}`,

	// Legal engine
	LEGAL_ANALYSIS: (caseId: string) => `legal-analysis-${caseId}`,
	CITATIONS: (documentId: string) => `citations-${documentId}`,
} as const;

/**
 * Cache invalidation patterns
 * When certain actions occur, invalidate related caches
 */
export const CacheInvalidation = {
	/**
	 * Invalidate all case-related caches
	 */
	async invalidateAllCases() {
		await Promise.all([
			cache.delete(CacheKeys.CASES_LIST),
			cache.clear() // Clear all for simplicity, or iterate case IDs
		]);
		console.log('🗑️ Invalidated all case caches');
	},
	/**
	 * Invalidate caches for a specific case
	 */
	async invalidateCase(caseId: string) {
		await Promise.all([
			cache.delete(CacheKeys.CASES_LIST), // List might have changed
			cache.delete(CacheKeys.CASE_DETAIL(caseId)),
			cache.delete(CacheKeys.CASE_EVIDENCE(caseId)),
			cache.delete(CacheKeys.CASE_TIMELINE(caseId)),
			cache.delete(CacheKeys.LEGAL_ANALYSIS(caseId))
		]);
		console.log(`🗑️ Invalidated caches for case ${caseId}`);
	},
	/**
	 * Invalidate evidence-related caches
	 */
	async invalidateEvidence(caseId: string) {
		await Promise.all([
			cache.delete(CacheKeys.CASE_EVIDENCE(caseId)),
			cache.delete(CacheKeys.CASE_DETAIL(caseId)), // Evidence count might be in detail
			cache.delete(CacheKeys.CASE_TIMELINE(caseId)) // Evidence might affect timeline
		]);
		console.log(`🗑️ Invalidated evidence caches for case ${caseId}`);
	},
	/**
	 * Invalidate user-related caches
	 */
	async invalidateUser(userId: string) {
		await Promise.all([
			cache.delete(CacheKeys.USER_PROFILE(userId)),
			cache.delete(CacheKeys.USER_SETTINGS(userId))
		]);
		console.log(`🗑️ Invalidated user caches for ${userId}`);
	},
	/**
	 * Invalidate dashboard caches
	 */
	async invalidateDashboard() {
		await Promise.all([
			cache.delete(CacheKeys.DASHBOARD_STATS),
			cache.delete(CacheKeys.RECENT_ACTIVITY)
		]);
		console.log('🗑️ Invalidated dashboard caches');
	},
	/**
	 * Invalidate search caches
	 */
	async invalidateSearch(query?: string) {
		if (query) {
			await cache.delete(CacheKeys.SEARCH_RESULTS(query));
		} else {
			// Invalidate all search results - would need pattern matching
			console.log('🗑️ Invalidating all search caches not implemented yet');
		}
	}
} as const;

/**
 * Cache warming utilities
 * Pre-load commonly accessed data into cache
 */
export const CacheWarming = {
	/**
	 * Warm up dashboard caches
	 */
	async warmDashboard(fetch: typeof globalThis.fetch) {
		try {
			const [stats, activity] = await Promise.all([
				fetch('/api/dashboard/stats').then(r => r.json()),
				fetch('/api/activity/recent').then(r => r.json())
			]);

			await Promise.all([
				cache.set(CacheKeys.DASHBOARD_STATS, stats, {
					memory: true,
					persistent: true,
					ttl: 5 * 60 * 1000 // 5 minutes
				}),
				cache.set(CacheKeys.RECENT_ACTIVITY, activity, {
					memory: true,
					persistent: true,
					ttl: 2 * 60 * 1000 // 2 minutes
				})
			]);

			console.log('🔥 Dashboard caches warmed');
		} catch (error) {
			console.error('Failed to warm dashboard cache:', error);
		}
	},
	/**
	 * Warm up case list cache
	 */
	async warmCaseList(fetch: typeof globalThis.fetch) {
		try {
			const cases = await fetch('/api/cases').then(r => r.json());
			await cache.set(CacheKeys.CASES_LIST, cases, {
				memory: true,
				persistent: true,
				ttl: 5 * 60 * 1000 // 5 minutes
			});
			console.log('🔥 Case list cache warmed');
		} catch (error) {
			console.error('Failed to warm case list cache:', error);
		}
	}
} as const;

/**
 * Cache statistics and monitoring
 */
export const CacheMonitoring = {
	/**
	 * Get cache health status
	 */
	async getHealth() {
		return await cache.health();
	},
	/**
	 * Get cache statistics
	 */
	getStats() {
		return cache.getStats();
	},
	/**
	 * Log cache performance metrics
	 */
	logMetrics() {
		const stats = cache.getStats();
		console.table({
			'Total Operations': stats.total,
			'Cache Hits': stats.hits,
			'Cache Misses': stats.misses,
			'Hit Rate': `${stats.hitRate.toFixed(2)}%`,
			'Memory Items': stats.memoryItems,
			'Persistent Items': stats.persistentItems
		});
	}
} as const;
