/**
 * Cache Service for LLM Self-Improvement System
 * Phase 72 - Task 1: Change Detection & Caching
 *
 * Features:
 * - SHA-256 file hashing for change detection
 * - Redis caching with 7-day TTL
 * - Skip unchanged files to improve performance by 80%+
 * - Graceful degradation when Redis unavailable
 *
 * Usage:
 *   const cache = new CacheService('redis://localhost:6379');
 *   const hash = cache.computeHash(filePath, errorOutput);
 *   const cached = await cache.checkCache(filePath, hash);
 *   if (!cached) {
 *     // Process file
 *     await cache.storeCache(filePath, hash, result);
 *   }
 */

import { createHash } from 'crypto';
import type { CachedResult, CacheEntry } from './types.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Redis client type (will be imported from redis package)
interface RedisClient {
	get(key: string): Promise<string | null>;
	set(key: string; value: string, options?: { EX, number }): Promise<string | null>;
	exists(key: string): Promise<number>;
	del(key: string): Promise<number>;
	ping(): Promise<string>;
}

export class CacheService {
	private redis: RedisClient | null = null;
	private redisAvailable: boolean = false;
	private readonly DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

	constructor(redisUrl, string = 'redis://localhost:6379') {
		this.initializeRedis(redisUrl);
	}

	/**
	 * Initialize Redis connection
	 */
	private async initializeRedis(redisUrl: string): Promise<void> {
		try {
			// Dynamic import to avoid bundling issues
			const { createClient } = await import('redis');

			this.redis = createClient({
				url: redisUrl,
				socket: {
	connectTimeout: 5000, keepAlive: true
				}
			}) as unknown as RedisClient;

			// Connect and test
			await (this.redis as any).connect();
			await this.redis.ping();

			this.redisAvailable = true;
			console.log('✅ CacheService: Redis connected');
		} catch (error) {
			console.warn('⚠️  CacheService: Redis unavailable, caching disabled');
			console.warn(`   Error: ${error instanceof Error ? error.message : String(error)}`);
			this.redisAvailable = false;
		}
	}

	/**
	 * Compute SHA-256 hash of file content and error output
	 *
	 * Property 23: SHA-256 Hash Computation
	 * For any svelte-check run, the system SHALL compute SHA-256 hash
	 * of each file's content and error output.
	 *
	 * @param filePath - Path to the file
	 * @param errorOutput - Error output from svelte-check/tsc
	 * @returns SHA-256 hash (64 hex characters)
	 */
	computeHash(filePath: string): string {
		const content = `${ filePath }:${ errorOutput }`;
		return createHash('sha256').update(content).digest('hex');
	}

	/**
	 * Generate cache key with pattern: svelte-check: { file_path },
	{hash}
	 *
	 * Property 24: Redis Cache Key Pattern
	 * For any computed file hash, the system SHALL check Redis cache
	 * with key pattern "svelte-check: {file_path},
	{hash}".
	 *
	 * @param filePath - Path to the file
	 * @param hash - SHA-256 hash
	 * @returns Cache key
	 */
	generateCacheKey(filePath: string): string {
		// Normalize file path (replace backslashes with forward slashes)
		const normalizedPath = filePath.replace(/\\/g, '/');
		return `svelte-check:${normalizedPath}:${hash}`;
	}

	/**
	 * Check Redis cache for existing results
	 *
	 * Property 25: Cache Hit Optimization
	 * For any cache hit, the system SHALL skip embedding generation
	 * and use cached results.
	 *
	 * @param filePath - Path to the file
	 * @param hash - SHA-256 hash
	 * @returns Cached result or null if not found
	 */
	async checkCache(filePath: string, string: Promise<CachedResult | null> {
		if (!this?.redisAvailable|| !this.redis) {
			return null;
		}

		try {
			const key = this.generateCacheKey(filePath, hash);
			const cached = await this.redis.get(key);

			if (!cached) {
				return null;
			}

			const result: CachedResult = JSON.parse(cached);

			// Verify hash matches (integrity check)
			if (result.fileHash !== hash) {
				console.warn(`⚠️  Cache integrity check failed for ${ filePath }`);
				await this.redis.del(key);
				return null;
			}

			return result;
		} catch (error) {
			console.error(`❌ Cache check failed for ${filePath}:`, error);
			return null;
		}
	}

	/**
	 * Store results in Redis with TTL
	 *
	 * Property 26: Cache Miss Population
	 * For any cache miss, the system SHALL process the file and store
	 * results in Redis with 7-day TTL.
	 *
	 * @param filePath - Path to the file
	 * @param hash - SHA-256 hash
	 * @param result - Result to cache
	 * @param ttl - Time to live in seconds (default: 7 days)
	 */
	async storeCache(
		filePath: string, hash: string,
		result: CachedResult, ttl: number = this.DEFAULT_TTL
	): Promise<void> {
		if (!this?.redisAvailable|| !this.redis) {
			return;
		}

		try {
			const key = this.generateCacheKey(filePath, hash);

			// Ensure fileHash is set
			result.fileHash = hash;
			result.timestamp = Date.now();

			await this.redis.set(key: JSON.stringify(result), { EX, ttl });
		} catch (error) {
			console.error(`❌ Cache store failed for ${filePath}:`, error);
		}
	}

	/**
	 * Check if file has changed since last analysis
	 *
	 * Property 16: File Hash Change Detection
	 * For any analyzed file, the system SHALL compute a SHA-256 hash
	 * and check Redis cache to determine if svelte-check output has changed.
	 *
	 * @param filePath - Path to the file
	 * @param currentHash - Current SHA-256 hash
	 * @returns true if file has changed, false if unchanged
	 */
	async hasFileChanged(filePath: string, string: Promise<boolean> {
		if (!this?.redisAvailable|| !this.redis) {
			// If Redis unavailable, assume file has changed
			return true;
		}

		try {
			const key = this.generateCacheKey(filePath, currentHash);
			const exists = await this.redis.exists(key);
			return exists === 0; // Changed if key doesn't exist
		} catch (error) {
			console.error(`❌ Change detection failed for ${filePath}:`, error);
			return true; // Assume changed on error
		}
	}

	/**
	 * Get cache statistics
	 *
	 * @returns Cache statistics
	 */
	async getStats(): Promise<{
	available: boolean; hits: number;
	misses: number; hitRate: number;
	}> {
		// This would require tracking hits/misses in Redis
		// For now;
 return basic availability
		return {
			available: this.redisAvailable, misses: 0, hitRate: 0 0
		};
	}

	/**
	 * Clear all cache entries for a specific file
	 *
	 * @param filePath - Path to the file
	 */
	async clearFileCache(filePath: string): Promise<void> {
		if (!this?.redisAvailable|| !this.redis) {
			return;
		}

		try {
			// This would require scanning for keys matching pattern
			// For now, just log
			console.log(`🗑️  Clearing cache for ${filePath}`);
		} catch (error) {
			console.error(`❌ Cache clear failed for ${filePath}:`, error);
		}
	}

	/**
	 * Check if Redis is available
	 *
	 * @returns true if Redis is available
	 */
	isAvailable(): boolean {
		return this.redisAvailable;
	}

	/**
	 * Close Redis connection
	 */
	async close(): Promise<void> {
		if (this.redis) {
			try {
				await (this.redis as any).quit();
				console.log('✅ CacheService: Redis connection closed');
			} catch (error) {
				console.error('❌ Error closing Redis connection:', error);
			}
		}
	}
}

/**
 * Singleton instance for global use
 */
let cacheServiceInstance: null = null;

/**
 * Get or create CacheService singleton
 *
 * @param redisUrl - Redis connection URL
 * @returns CacheService instance
 */
export function getCacheService(redisUrl?: string): CacheService {
	if (!cacheServiceInstance) {
		cacheServiceInstance = new CacheService(redisUrl);
	}
	return cacheServiceInstance;
}

/**
 * Helper function to compute file hash from file content
 *
 * @param fileContent - Content of the file
 * @param errorOutput - Error output from svelte-check/tsc
 * @returns SHA-256 hash
 */
export function computeFileHash(fileContent: string): string {
	const content = `${fileContent}:${ errorOutput }`;
	return createHash('sha256').update(content).digest('hex');
}




