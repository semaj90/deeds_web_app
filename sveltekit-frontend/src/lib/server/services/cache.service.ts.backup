/**
 * Cache Service
 * Manages Redis caching for summaries, similar cases, and RAG results
 */

import { redis } from '$lib/server/redis';

export interface CacheOptions {
	ttl?: number; // Time to live in seconds
	namespace?: string;
}

const DEFAULT_TTL = 24 * 60 * 60; // 24 hours
const NAMESPACES = {
	summary: 'summary',
	similarCases: 'similar-cases',
	ragResults: 'rag-results',
	citations: 'citations',
	statutes: 'statutes'
};

export class CacheService {
	/**
	 * Get cached value
	 */
	async get<T>(key: string, namespace: string = NAMESPACES.summary): Promise<T | null> {
		try {
			const cacheKey = this.buildKey(key, namespace);
			const cached = await redis.get(cacheKey);

			if (!cached) {
				return null;
			}

			return JSON.parse(cached) as T;
		} catch (error) {
			console.error('Cache get error:', error);
			return null;
		}
	}

	/**
	 * Set cached value
	 */
	async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
		try {
			const { ttl = DEFAULT_TTL, namespace = NAMESPACES.summary } = options;
			const cacheKey = this.buildKey(key, namespace);

			await redis.setex(cacheKey, ttl, JSON.stringify(value));
		} catch (error) {
			console.error('Cache set error:', error);
			// Don't throw - caching failures shouldn't break the app
		}
	}

	/**
	 * Delete cached value
	 */
	async delete(key: string, namespace: string = NAMESPACES.summary): Promise<void> {
		try {
			const cacheKey = this.buildKey(key, namespace);
			await redis.del(cacheKey);
		} catch (error) {
			console.error('Cache delete error:', error);
		}
	}

	/**
	 * Clear all cache for a namespace
	 */
	async clearNamespace(namespace: string): Promise<void> {
		try {
			const pattern = `${namespace}:*`;
			const keys = await redis.keys(pattern);

			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			console.error('Cache clear namespace error:', error);
		}
	}

	/**
	 * Get or set cached value (cache-aside pattern)
	 */
	async getOrSet<T>(
		key: string,
		fetcher: () => Promise<T>,
		options: CacheOptions = {}
	): Promise<T> {
		try {
			// Try to get from cache
			const cached = await this.get<T>(key, options.namespace);
			if (cached) {
				return cached;
			}

			// Fetch fresh value
			const value = await fetcher();

			// Cache it
			await this.set(key, value, options);

			return value;
		} catch (error) {
			console.error('Cache getOrSet error:', error);
			// Fallback to fetcher if cache fails
			return fetcher();
		}
	}

	/**
	 * Cache summary
	 */
	async cacheSummary(caseId: string, summary: any, ttl?: number): Promise<void> {
		await this.set(caseId, summary, {
			ttl: ttl || DEFAULT_TTL,
			namespace: NAMESPACES.summary
		});
	}

	/**
	 * Get cached summary
	 */
	async getSummary(caseId: string): Promise<any | null> {
		return this.get(caseId, NAMESPACES.summary);
	}

	/**
	 * Invalidate summary cache
	 */
	async invalidateSummary(caseId: string): Promise<void> {
		await this.delete(caseId, NAMESPACES.summary);
	}

	/**
	 * Cache similar cases
	 */
	async cacheSimilarCases(caseId: string, cases: any[], ttl?: number): Promise<void> {
		await this.set(caseId, cases, {
			ttl: ttl || DEFAULT_TTL,
			namespace: NAMESPACES.similarCases
		});
	}

	/**
	 * Get cached similar cases
	 */
	async getSimilarCases(caseId: string): Promise<any[] | null> {
		return this.get(caseId, NAMESPACES.similarCases);
	}

	/**
	 * Invalidate similar cases cache
	 */
	async invalidateSimilarCases(caseId: string): Promise<void> {
		await this.delete(caseId, NAMESPACES.similarCases);
	}

	/**
	 * Cache RAG results
	 */
	async cacheRagResults(query: string, results: any[], ttl?: number): Promise<void> {
		const key = this.hashQuery(query);
		await this.set(key, results, {
			ttl: ttl || DEFAULT_TTL,
			namespace: NAMESPACES.ragResults
		});
	}

	/**
	 * Get cached RAG results
	 */
	async getRagResults(query: string): Promise<any[] | null> {
		const key = this.hashQuery(query);
		return this.get(key, NAMESPACES.ragResults);
	}

	/**
	 * Cache citations
	 */
	async cacheCitations(caseId: string, citations: any[], ttl?: number): Promise<void> {
		await this.set(caseId, citations, {
			ttl: ttl || DEFAULT_TTL,
			namespace: NAMESPACES.citations
		});
	}

	/**
	 * Get cached citations
	 */
	async getCitations(caseId: string): Promise<any[] | null> {
		return this.get(caseId, NAMESPACES.citations);
	}

	/**
	 * Cache statutes
	 */
	async cacheStatutes(jurisdiction: string, statutes: any[], ttl?: number): Promise<void> {
		await this.set(jurisdiction, statutes, {
			ttl: ttl || DEFAULT_TTL,
			namespace: NAMESPACES.statutes
		});
	}

	/**
	 * Get cached statutes
	 */
	async getStatutes(jurisdiction: string): Promise<any[] | null> {
		return this.get(jurisdiction, NAMESPACES.statutes);
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{
		summaries: number;
		similarCases: number;
		ragResults: number;
		citations: number;
		statutes: number;
		total: number;
	}> {
		try {
			const stats = {
				summaries: (await redis.keys(`${NAMESPACES.summary}:*`)).length,
				similarCases: (await redis.keys(`${NAMESPACES.similarCases}:*`)).length,
				ragResults: (await redis.keys(`${NAMESPACES.ragResults}:*`)).length,
				citations: (await redis.keys(`${NAMESPACES.citations}:*`)).length,
				statutes: (await redis.keys(`${NAMESPACES.statutes}:*`)).length
			};

			return {
				...stats,
				total: Object.values(stats).reduce((a, b) => a + b, 0)
			};
		} catch (error) {
			console.error('Cache stats error:', error);
			return {
				summaries: 0,
				similarCases: 0,
				ragResults: 0,
				citations: 0,
				statutes: 0,
				total: 0
			};
		}
	}

	/**
	 * Build cache key
	 */
	private buildKey(key: string, namespace: string): string {
		return `${namespace}:${key}`;
	}

	/**
	 * Hash query for consistent key generation
	 */
	private hashQuery(query: string): string {
		let hash = 0;
		for (let i = 0; i < query.length; i++) {
			const char = query.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(36);
	}
}

export const cacheService = new CacheService();

