/**
 * Cache Service
 * Manages Redis caching for summaries, similar cases, RAG results, citations, statutes
 */

import { redis } from '$lib/server/redis';

export interface CacheOptions {
	ttl?: number;
	namespace?: string;
}

const DEFAULT_TTL = 24 * 60 * 60; // 24 hours
const NAMESPACES = {
	summary: 'summary',
	similarCases: 'similar-cases',
	ragResults: 'rag-results',
	citations: 'citations',
	statutes: 'statutes',
	tensor: 'tensor',
};

export class CacheService {
	async get<T>(key: string, namespace: string = NAMESPACES.summary): Promise<T | null> {
		try {
			const cacheKey = this.buildKey(key, namespace);
			const cached = await redis.get(cacheKey);
			if (!cached) return null;
			return JSON.parse(cached) as T;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
		try {
			const { ttl = DEFAULT_TTL, namespace = NAMESPACES.summary } = options;
			const cacheKey = this.buildKey(key, namespace);
			await redis.setex(cacheKey, ttl, JSON.stringify(value));
		} catch {
			// Caching failures shouldn't break the app
		}
	}

	async delete(key: string, namespace: string = NAMESPACES.summary): Promise<void> {
		try {
			const cacheKey = this.buildKey(key, namespace);
			await redis.del(cacheKey);
		} catch {
			// Best-effort
		}
	}

	async getOrSet<T>(key: string, fetcher: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
		const cached = await this.get<T>(key, options.namespace);
		if (cached) return cached;
		const value = await fetcher();
		await this.set(key, value, options);
		return value;
	}

	async cacheSummary(caseId: string, summary: unknown, ttl?: number): Promise<void> {
		await this.set(caseId, summary, { ttl: ttl || DEFAULT_TTL, namespace: NAMESPACES.summary });
	}

	async getSummary(caseId: string): Promise<unknown | null> {
		return this.get(caseId, NAMESPACES.summary);
	}

	async invalidateSummary(caseId: string): Promise<void> {
		await this.delete(caseId, NAMESPACES.summary);
	}

	async cacheSimilarCases(caseId: string, cases: unknown[], ttl?: number): Promise<void> {
		await this.set(caseId, cases, { ttl: ttl || DEFAULT_TTL, namespace: NAMESPACES.similarCases });
	}

	async getSimilarCases(caseId: string): Promise<unknown[] | null> {
		return this.get(caseId, NAMESPACES.similarCases);
	}

	async invalidateSimilarCases(caseId: string): Promise<void> {
		await this.delete(caseId, NAMESPACES.similarCases);
	}

	async cacheRagResults(query: string, results: unknown[], ttl?: number): Promise<void> {
		const key = this.hashQuery(query);
		await this.set(key, results, { ttl: ttl || DEFAULT_TTL, namespace: NAMESPACES.ragResults });
	}

	async getRagResults(query: string): Promise<unknown[] | null> {
		const key = this.hashQuery(query);
		return this.get(key, NAMESPACES.ragResults);
	}

	async cacheCitations(caseId: string, citations: unknown[], ttl?: number): Promise<void> {
		await this.set(caseId, citations, { ttl: ttl || DEFAULT_TTL, namespace: NAMESPACES.citations });
	}

	async getCitations(caseId: string): Promise<unknown[] | null> {
		return this.get(caseId, NAMESPACES.citations);
	}

	async cacheStatutes(jurisdiction: string, statutes: unknown[], ttl?: number): Promise<void> {
		await this.set(jurisdiction, statutes, { ttl: ttl || DEFAULT_TTL, namespace: NAMESPACES.statutes });
	}

	async getStatutes(jurisdiction: string): Promise<unknown[] | null> {
		return this.get(jurisdiction, NAMESPACES.statutes);
	}

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
				statutes: (await redis.keys(`${NAMESPACES.statutes}:*`)).length,
			};
			return { ...stats, total: Object.values(stats).reduce((a, b) => a + b, 0) };
		} catch {
			return { summaries: 0, similarCases: 0, ragResults: 0, citations: 0, statutes: 0, total: 0 };
		}
	}

	private buildKey(key: string, namespace: string): string {
		return `${namespace}:${key}`;
	}

	private hashQuery(query: string): string {
		let hash = 0;
		for (let i = 0; i < query.length; i++) {
			const char = query.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(36);
	}
}

export const cacheService = new CacheService();
