/**
 * CachingLayer — 3-tier cache: Hot (in-memory) → LRU → Redis
 * Features: tag-based invalidation, zlib compression for large payloads,
 * probabilistic hot-tier promotion, detailed statistics.
 */

import { getRedis } from '$lib/server/redis.js';
import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry<T = unknown> {
	data: T;
	expiresAt: number;
	tags: string[];
	compressed: boolean;
}

export interface CacheStats {
	hotTier: { size: number; hitRate: number };
	lruTier: { size: number; hitRate: number; evictions: number };
	redisTier: { hitRate: number };
	totalHits: number;
	totalMisses: number;
	overallHitRate: number;
	memoryEstimateBytes: number; // approximate
}

export interface CacheOptions {
	ttlSeconds?: number;
	tags?: string[];
	skipCompression?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOT_MAX_SIZE = 100;
const HOT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HOT_PROMOTION_PROBABILITY = 0.1; // 10% chance to promote to hot tier

const LRU_MAX_SIZE = 2000;
const LRU_DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

const COMPRESSION_THRESHOLD_BYTES = 1024; // Compress payloads > 1KB
const REDIS_DEFAULT_TTL_SECONDS = 600; // 10 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CachingLayer {
	// Hot tier: ultra-fast, small, probabilistic promotion
	private hotCache = new Map<string, CacheEntry>();

	// LRU tier: larger, evicts least-recently-used
	private lruCache = new Map<string, CacheEntry>();
	private lruAccessOrder: string[] = [];
	private lruEvictions = 0;

	// Stats
	private hotHits = 0;
	private hotChecks = 0;
	private lruHits = 0;
	private lruChecks = 0;
	private redisHits = 0;
	private redisChecks = 0;
	private totalMisses = 0;

	/**
	 * Generate a deterministic cache key from params
	 */
	generateKey(prefix: string, params: Record<string, unknown>): string {
		const normalized = JSON.stringify(params, Object.keys(params).sort());
		const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
		return `cl:${prefix}:${hash}`;
	}

	/**
	 * Get a value from the cache (hot → LRU → Redis)
	 */
	async get<T>(key: string): Promise<T | null> {
		const now = Date.now();

		// Tier 1: Hot cache
		this.hotChecks++;
		const hotEntry = this.hotCache.get(key);
		if (hotEntry && hotEntry.expiresAt > now) {
			this.hotHits++;
			return hotEntry.data as T;
		}
		if (hotEntry) this.hotCache.delete(key); // expired

		// Tier 2: LRU cache
		this.lruChecks++;
		const lruEntry = this.lruCache.get(key);
		if (lruEntry && lruEntry.expiresAt > now) {
			this.lruHits++;
			this.touchLru(key);

			// Probabilistic promotion to hot tier
			if (Math.random() < HOT_PROMOTION_PROBABILITY) {
				this.setHot(key, lruEntry);
			}

			return lruEntry.data as T;
		}
		if (lruEntry) {
			this.lruCache.delete(key);
			this.lruAccessOrder = this.lruAccessOrder.filter((k) => k !== key);
		}

		// Tier 3: Redis
		this.redisChecks++;
		try {
			const redis = getRedis();
			const raw = await redis.get(key);
			if (raw) {
				this.redisHits++;
				const parsed = this.deserialize<T>(raw);

				// Promote to LRU
				this.setLru(key, {
					data: parsed,
					expiresAt: now + LRU_DEFAULT_TTL_MS,
					tags: [],
					compressed: false
				});

				return parsed;
			}
		} catch {
			// Redis failure is non-fatal
		}

		this.totalMisses++;
		return null;
	}

	/**
	 * Set a value in all tiers
	 */
	async set<T>(key: string, data: T, options: CacheOptions = {}): Promise<void> {
		const now = Date.now();
		const ttlMs = (options.ttlSeconds ?? REDIS_DEFAULT_TTL_SECONDS) * 1000;
		const tags = options.tags ?? [];

		const entry: CacheEntry<T> = {
			data,
			expiresAt: now + ttlMs,
			tags,
			compressed: false
		};

		// LRU tier
		this.setLru(key, entry);

		// Redis tier
		try {
			const redis = getRedis();
			const serialized = this.serialize(data, options.skipCompression);
			await redis.set(key, serialized, 'EX', options.ttlSeconds ?? REDIS_DEFAULT_TTL_SECONDS);

			// Tag indexing in Redis (for tag-based invalidation)
			if (tags.length > 0) {
				const pipeline = redis.pipeline();
				for (const tag of tags) {
					pipeline.sadd(`cl:tag:${tag}`, key);
					pipeline.expire(`cl:tag:${tag}`, (options.ttlSeconds ?? REDIS_DEFAULT_TTL_SECONDS) + 60);
				}
				await pipeline.exec();
			}
		} catch {
			// Redis failure is non-fatal
		}
	}

	/**
	 * Invalidate all cache entries with a given tag
	 */
	async invalidateByTags(tags: string[]): Promise<number> {
		let invalidated = 0;

		// Local tiers: scan for matching tags
		for (const [key, entry] of this.hotCache) {
			if (entry.tags.some((t) => tags.includes(t))) {
				this.hotCache.delete(key);
				invalidated++;
			}
		}
		for (const [key, entry] of this.lruCache) {
			if (entry.tags.some((t) => tags.includes(t))) {
				this.lruCache.delete(key);
				this.lruAccessOrder = this.lruAccessOrder.filter((k) => k !== key);
				invalidated++;
			}
		}

		// Redis tier: use tag sets
		try {
			const redis = getRedis();
			for (const tag of tags) {
				const keys = await redis.smembers(`cl:tag:${tag}`);
				if (keys.length > 0) {
					await redis.del(...keys, `cl:tag:${tag}`);
					invalidated += keys.length;
				}
			}
		} catch {
			// Redis failure is non-fatal
		}

		return invalidated;
	}

	/**
	 * Clear all local caches
	 */
	clear(): void {
		this.hotCache.clear();
		this.lruCache.clear();
		this.lruAccessOrder = [];
	}

	/**
	 * Get detailed cache statistics
	 */
	getStats(): CacheStats {
		const totalHits = this.hotHits + this.lruHits + this.redisHits;
		const totalChecks = totalHits + this.totalMisses;

		// Memory estimate (approximate): each entry ~200 bytes overhead + data size
		const estimateSize = (map: Map<string, CacheEntry>) => {
			let bytes = 0;
			for (const [key, entry] of map) {
				bytes += key.length * 2 + 200;
				bytes += JSON.stringify(entry.data).length * 2;
			}
			return bytes;
		};

		return {
			hotTier: {
				size: this.hotCache.size,
				hitRate: this.hotChecks > 0 ? this.hotHits / this.hotChecks : 0
			},
			lruTier: {
				size: this.lruCache.size,
				hitRate: this.lruChecks > 0 ? this.lruHits / this.lruChecks : 0,
				evictions: this.lruEvictions
			},
			redisTier: {
				hitRate: this.redisChecks > 0 ? this.redisHits / this.redisChecks : 0
			},
			totalHits,
			totalMisses: this.totalMisses,
			overallHitRate: totalChecks > 0 ? totalHits / totalChecks : 0,
			memoryEstimateBytes: estimateSize(this.hotCache) + estimateSize(this.lruCache)
		};
	}

	// -------------------------------------------------------------------
	// Warmup
	// -------------------------------------------------------------------

	/**
	 * Pre-populate cache with commonly accessed keys from Redis
	 * Call at boot time for faster first requests
	 */
	async warmup(keyPatterns: string[]): Promise<number> {
		let warmed = 0;
		try {
			const redis = getRedis();
			for (const pattern of keyPatterns) {
				const keys = await redis.keys(pattern);
				for (const key of keys.slice(0, 50)) {
					// Cap per pattern
					const raw = await redis.get(key);
					if (raw) {
						const data = this.deserialize(raw);
						this.setLru(key, {
							data,
							expiresAt: Date.now() + LRU_DEFAULT_TTL_MS,
							tags: [],
							compressed: false
						});
						warmed++;
					}
				}
			}
		} catch {
			// Warmup failure is non-fatal
		}
		return warmed;
	}

	// -------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------

	private setHot(key: string, entry: CacheEntry): void {
		if (this.hotCache.size >= HOT_MAX_SIZE) {
			// Evict oldest
			const firstKey = this.hotCache.keys().next().value;
			if (firstKey) this.hotCache.delete(firstKey);
		}
		this.hotCache.set(key, {
			...entry,
			expiresAt: Date.now() + HOT_TTL_MS
		});
	}

	private setLru(key: string, entry: CacheEntry): void {
		if (this.lruCache.has(key)) {
			this.lruCache.set(key, entry);
			this.touchLru(key);
			return;
		}

		while (this.lruCache.size >= LRU_MAX_SIZE) {
			const evictKey = this.lruAccessOrder.shift();
			if (evictKey) {
				this.lruCache.delete(evictKey);
				this.lruEvictions++;
			}
		}

		this.lruCache.set(key, entry);
		this.lruAccessOrder.push(key);
	}

	private touchLru(key: string): void {
		const idx = this.lruAccessOrder.indexOf(key);
		if (idx !== -1) {
			this.lruAccessOrder.splice(idx, 1);
		}
		this.lruAccessOrder.push(key);

		// Compact if access order has diverged from cache (stale entries)
		if (this.lruAccessOrder.length > this.lruCache.size * 2) {
			this.lruAccessOrder = this.lruAccessOrder.filter(k => this.lruCache.has(k));
		}
	}

	private serialize<T>(data: T, skipCompression?: boolean): string {
		const json = JSON.stringify(data);
		if (!skipCompression && json.length > COMPRESSION_THRESHOLD_BYTES) {
			const compressed = gzipSync(Buffer.from(json)).toString('base64');
			return `gz:${compressed}`;
		}
		return json;
	}

	private deserialize<T>(raw: string): T {
		if (raw.startsWith('gz:')) {
			try {
				const decompressed = gunzipSync(Buffer.from(raw.slice(3), 'base64')).toString();
				return JSON.parse(decompressed) as T;
			} catch {
				// Safe fallback: try parsing as raw JSON
				return JSON.parse(raw) as T;
			}
		}
		return JSON.parse(raw) as T;
	}
}

// Singleton
export const cachingLayer = new CachingLayer();

/**
 * Boot-time warmup function
 * Call from hooks.server.ts or startup module
 */
export async function warmupCachingLayer(): Promise<number> {
	return cachingLayer.warmup(['cl:*', 'vss:*', 'citation-graph:*']);
}
