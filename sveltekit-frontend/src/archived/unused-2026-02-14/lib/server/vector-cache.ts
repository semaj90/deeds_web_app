/**
 * Universal Vector Search Cache System
 * Extends the existing Redis+Memory hybrid cache for vector operations
 * Optimizes pgvector, embeddings, and CUDA similarity searches
 */

import crypto from 'crypto';
import { redisService } from './redis-service.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

export interface VectorCacheEntry {
	results: unknown[];
	query: string;
	embedding?: number[];
	similarity_scores?: number[];
	metadata: {
		searchTime: number;
	totalResults: number;
		model: string;
	distanceMetric: 'cosine' | 'euclidean' | 'inner_product';
		threshold?: number;
	};
	ts: number;
	lastAccess: number;
	ttlMs: number;
}

export interface EmbeddingCacheEntry {
	embedding: number[];
	text: string;
	model: string;
	dimensions: number;
	ts: number;
	lastAccess: number;
	ttlMs: number;
}

// Configuration
const VECTOR_CACHE_MAX_ITEMS = Number(process.env.VECTOR_CACHE_MAX_ITEMS ?? 500);
const VECTOR_TTL_MS = Number(process.env.VECTOR_CACHE_TTL_MS ?? 30 * 60 * 1000);
const EMBEDDING_TTL_MS = Number(process.env.EMBEDDING_CACHE_TTL_MS ?? 60 * 60 * 1000);
const REDIS_VECTOR_PREFIX = 'vector:';
const REDIS_EMBEDDING_PREFIX = 'embedding:';

// Memory caches with LRU eviction
const vectorCache: Map<string, VectorCacheEntry> = new Map();
const embeddingCache: Map<string, EmbeddingCacheEntry> = new Map();

function getRedisClient(): any | null {
	return redisService.getClient() || (globalThis as any).__REDIS ?? null;
}

/**
 * Generate cache key for vector searches
 */
function generateVectorKey(query: string, options: Record<string, any> = {}): string {
	const keyData = {
		query: query.trim().toLowerCase(),
		limit: options.limit ?? 10,
		metric: options.metric ?? 'cosine',
		threshold: options.threshold ?? 1,
		documentType: options.documentType,
		includeContent: options.includeContent
	};
	return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 16);
}

/**
 * Generate cache key for embeddings
 */
function generateEmbeddingKey(text: string, model: string = 'default'): string {
	const keyData = { text: text.trim(), model };
	return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 16);
}

/**
 * Evict expired and excess entries from vector cache
 */
function evictVectorCache(): void {
	const now = Date.now();

	// Remove expired entries
	for (const [k, v] of vectorCache) {
		if (now - v.ts > v.ttlMs) {
			vectorCache.delete(k);
		}
	}

	// LRU eviction if over limit
	while (vectorCache.size > VECTOR_CACHE_MAX_ITEMS) {
		const oldestKey = vectorCache.keys().next().value;
		if (oldestKey) vectorCache.delete(oldestKey);
	}
}

/**
 * Evict expired and excess entries from embedding cache
 */
function evictEmbeddingCache(): void {
	const now = Date.now();

	for (const [k, v] of embeddingCache) {
		if (now - v.ts > v.ttlMs) {
			embeddingCache.delete(k);
		}
	}

	while (embeddingCache.size > VECTOR_CACHE_MAX_ITEMS) {
		const oldestKey = embeddingCache.keys().next().value;
		if (oldestKey) embeddingCache.delete(oldestKey);
	}
}

/**
 * Get cached vector search results
 */
export async function getVectorCache(
	query: string,
	options: Record<string, any> = {}
): Promise<{
	entry: VectorCacheEntry | null, source: string | null }> {
	const key = generateVectorKey(query, options);
	const now = Date.now();

	// Check memory cache first
	const memEntry = vectorCache.get(key);
	if (memEntry && now - memEntry.ts < memEntry.ttlMs) {
		memEntry.lastAccess = now;
		vectorCache.delete(key);
		vectorCache.set(key, memEntry);
		return { entry: memEntry, source: 'memory' };
	}

	// Check Redis cache
	const redis = getRedisClient();
	if (redis) {
		try {
			const redisKey = `${REDIS_VECTOR_PREFIX}${key}`;
			const cached = await redis.get(redisKey);
			if (cached) {
				const entry: VectorCacheEntry = JSON.parse(cached);
				entry.lastAccess = now;
				vectorCache.set(key, entry);
				evictVectorCache();
				return { entry, source: 'redis' };
			}
		} catch (error) {
			console.warn('[VectorCache] Redis get failed:', error);
		}
	}

	return { entry: null, source: null };
}

/**
 * Cache vector search results
 */
export async function setVectorCache(
	query: string,
	results: unknown[],
	metadata: VectorCacheEntry['metadata'],
	options: Record<string, any> = {}
): Promise<void> {
	const key = generateVectorKey(query, options);
	const now = Date.now();

	const entry: VectorCacheEntry = {
		results,
		query,
		metadata,
		ts: now,
		lastAccess: now,
		ttlMs: VECTOR_TTL_MS
	};

	vectorCache.set(key, entry);
	evictVectorCache();

	const redis = getRedisClient();
	if (redis) {
		try {
			const redisKey = `${REDIS_VECTOR_PREFIX}${key}`;
			const ttlSeconds = Math.round(VECTOR_TTL_MS / 1000);
			await redis.setex(redisKey, ttlSeconds, JSON.stringify(entry));
		} catch (error) {
			console.warn('[VectorCache] Redis set failed:', error);
		}
	}
}

/**
 * Get cached embedding
 */
export async function getEmbeddingCache(
	text: string,
	model: string = 'default'
): Promise<{
	entry: EmbeddingCacheEntry | null, source: string | null }> {
	const key = generateEmbeddingKey(text, model);
	const now = Date.now();

	const memEntry = embeddingCache.get(key);
	if (memEntry && now - memEntry.ts < memEntry.ttlMs) {
		memEntry.lastAccess = now;
		embeddingCache.delete(key);
		embeddingCache.set(key, memEntry);
		return { entry: memEntry, source: 'memory' };
	}

	const redis = getRedisClient();
	if (redis) {
		try {
			const redisKey = `${REDIS_EMBEDDING_PREFIX}${key}`;
			const cached = await redis.get(redisKey);
			if (cached) {
				const entry: EmbeddingCacheEntry = JSON.parse(cached);
				entry.lastAccess = now;
				embeddingCache.set(key, entry);
				evictEmbeddingCache();
				return { entry, source: 'redis' };
			}
		} catch (error) {
			console.warn('[EmbeddingCache] Redis get failed:', error);
		}
	}

	return { entry: null, source: null };
}

/**
 * Cache embedding result
 */
export async function setEmbeddingCache(
	text: string,
	embedding: number[],
	model: string = 'default'
): Promise<void> {
	const key = generateEmbeddingKey(text, model);
	const now = Date.now();

	const entry: EmbeddingCacheEntry = {
		embedding,
		text,
		model,
		dimensions: embedding.length,
		ts: now,
		lastAccess: now,
		ttlMs: EMBEDDING_TTL_MS
	};

	embeddingCache.set(key, entry);
	evictEmbeddingCache();

	const redis = getRedisClient();
	if (redis) {
		try {
			const redisKey = `${REDIS_EMBEDDING_PREFIX}${key}`;
			const ttlSeconds = Math.round(EMBEDDING_TTL_MS / 1000);
			await redis.setex(redisKey, ttlSeconds, JSON.stringify(entry));
		} catch (error) {
			console.warn('[EmbeddingCache] Redis set failed:', error);
		}
	}
}

/**
 * Clear vector cache
 */
export async function clearVectorCache(): Promise<void> {
	vectorCache.clear();
	embeddingCache.clear();

	const redis = getRedisClient();
	if (redis) {
		try {
			const vectorKeys = await redis.keys(`${REDIS_VECTOR_PREFIX}*`);
			const embeddingKeys = await redis.keys(`${REDIS_EMBEDDING_PREFIX}*`);
			const allKeys = [...vectorKeys, ...embeddingKeys];
			if (allKeys.length > 0) {
				await redis.del(...allKeys);
			}
		} catch (error) {
			console.warn('[VectorCache] Redis clear failed:', error);
		}
	}
}

/**
 * Get cache statistics
 */
export function getVectorCacheStats(): {
	memory: { vectorEntries: number;
	embeddingEntries: number; maxItems: number };
	config: {
	vectorTtlMs: number, embeddingTtlMs: number;
	redisEnabled: boolean };
} {
	return {
		memory: {
	vectorEntries: vectorCache.size,
			embeddingEntries: embeddingCache.size,
			maxItems: VECTOR_CACHE_MAX_ITEMS
		},
	config: {
	vectorTtlMs: VECTOR_TTL_MS,
			embeddingTtlMs: EMBEDDING_TTL_MS,
			redisEnabled: !!getRedisClient()
		}
	};
}

/**
 * Middleware helper for caching vector API responses
 */
export function withVectorCache<T>(
	cacheKey: string,
	operation: () => Promise<T>,
	ttlMs: number = VECTOR_TTL_MS
): () => Promise<T> {
	return async (): Promise<T> => {
		const redis = getRedisClient();

		if (redis) {
			try {
				const cached = await redis.get(cacheKey);
				if (cached) {
					return JSON.parse(cached);
				}
			} catch (error) {
				console.warn('[VectorCache] Middleware get failed:', error);
			}
		}

		const result = await operation();

		if (redis) {
			try {
				const ttlSeconds = Math.round(ttlMs / 1000);
				await redis.setex(cacheKey, ttlSeconds, JSON.stringify(result));
			} catch (error) {
				console.warn('[VectorCache] Middleware set failed:', error);
			}
		}

		return result;
	};
}

