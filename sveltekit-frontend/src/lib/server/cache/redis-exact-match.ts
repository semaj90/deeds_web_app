/**
 * Redis Exact-Match Cache Layer (L1)
 *
 * Ultra-fast exact-match cache that sits BEFORE Bifrost semantic search.
 * Provides sub-millisecond lookup for repeated queries.
 *
 * Cache Hierarchy:
 *   L1: Redis exact-match (this module) → 0-5ms lookup, 17,500× speedup
 *   L2: Bifrost semantic search (Qdrant) → 5s lookup, 6.9× speedup
 *   L3: Direct Ollama inference → 35s generation
 *
 * Performance:
 *   - Exact match HIT: ~2ms (Redis GET)
 *   - Exact match MISS: 0ms overhead (falls through to L2/L3)
 *   - MGET batch (N keys): same 2ms round-trip regardless of N
 *   - Total speedup on repeated queries: 35,000ms → 2ms = 17,500×
 *
 * Batch API:
 *   - getExactMatchCacheBatch(keys) — single MGET, O(1) round-trips
 *   - getExactMatchStats() — pipelined MEMORY USAGE + TTL, O(1) round-trips
 */

import { getRedis } from '../redis.js';
import { LLM_EXACT_CACHE_PREFIX, generateCacheKey } from '../cache-keys.js';

export { generateCacheKey };

const CACHE_PREFIX = LLM_EXACT_CACHE_PREFIX;
const DEFAULT_TTL_SECONDS = 3600; // 1 hour

export interface CachedLLMResponse {
	content: string;
	model: string;
	backend: string;
	cachedAt: string;
	promptTokens?: number;
	completionTokens?: number;
	cachedPromptTokens?: number;   // Ollama cache_prompt saved tokens
	somCluster?: number;           // SOM cluster of query embedding at cache time
	gpuCluster?: number;           // GPU k-means cluster
	hyperedgeGrade?: string;       // A/B/C/D from run-hypergraph.ts
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Per-call parser injection — simdjson when bulk threshold trips, else V8. */
type EntryParseFn = (s: string) => CachedLLMResponse;
const v8Parse: EntryParseFn = (s) => JSON.parse(s) as CachedLLMResponse;

function parseEntry(raw: string, key: string, parser: EntryParseFn = v8Parse): CachedLLMResponse | null {
	try {
		const parsed = parser(raw);
		if (!parsed.content || !parsed.model) {
			console.warn('[Redis Exact-Match] Invalid cache entry, deleting:', key);
			// Fire-and-forget delete — don't block the caller
			getRedis().del(key).catch(() => {});
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

// ── Single-key API ────────────────────────────────────────────────────────────

/**
 * Try to get a cached LLM response from Redis.
 * Returns null on cache miss (no overhead).
 */
export async function getExactMatchCache(cacheKey: string): Promise<CachedLLMResponse | null> {
	try {
		const redis = getRedis();
		const cached = await redis.get(cacheKey);
		if (!cached) return null;

		const entry = parseEntry(cached, cacheKey);
		if (!entry) return null;

		const ageS = Math.round((Date.now() - new Date(entry.cachedAt).getTime()) / 1000);
		const hitMeta = [
			`age=${ageS}s`,
			entry.promptTokens != null ? `tokens=${entry.promptTokens}+${entry.completionTokens ?? 0}` : '',
			entry.cachedPromptTokens ? `ollama_cached=${entry.cachedPromptTokens}` : '',
			entry.somCluster != null ? `som=${entry.somCluster}` : '',
			entry.hyperedgeGrade ? `grade=${entry.hyperedgeGrade}` : '',
		].filter(Boolean).join(' ');
		console.log(`[Redis Exact-Match] HIT key=${cacheKey.slice(-8)} ${hitMeta}`);
		return entry;
	} catch (err) {
		console.error('[Redis Exact-Match] GET error:', (err as Error)?.message ?? err);
		return null;
	}
}

/**
 * Store LLM response in Redis exact-match cache.
 * Fire-and-forget (errors logged but not thrown).
 */
export async function setExactMatchCache(
	cacheKey: string,
	response: Omit<CachedLLMResponse, 'cachedAt'>,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
	try {
		const redis = getRedis();
		const payload: CachedLLMResponse = {
			...response,
			cachedAt: new Date().toISOString(),
		};
		await redis.set(cacheKey, JSON.stringify(payload), 'EX', ttlSeconds);
		const tokenInfo = response.promptTokens != null
			? ` prompt=${response.promptTokens} completion=${response.completionTokens ?? 0}` +
			  (response.cachedPromptTokens ? ` cached=${response.cachedPromptTokens}` : '')
			: '';
		const graphInfo = response.somCluster != null ? ` som=${response.somCluster}` : '';
		console.log(
			`[Redis Exact-Match] SET key=${cacheKey.slice(-8)} ` +
				`model=${response.model} backend=${response.backend} ttl=${ttlSeconds}s${tokenInfo}${graphInfo}`
		);
	} catch (err) {
		console.error('[Redis Exact-Match] SET error (non-fatal):', (err as Error)?.message ?? err);
		// Don't throw — cache write failures should not break inference
	}
}

/**
 * Delete a cached response (useful for invalidation).
 */
export async function deleteExactMatchCache(cacheKey: string): Promise<void> {
	try {
		const redis = getRedis();
		await redis.del(cacheKey);
		console.log(`[Redis Exact-Match] DEL key=${cacheKey.slice(-8)}`);
	} catch (err) {
		console.error('[Redis Exact-Match] DEL error:', (err as Error)?.message ?? err);
	}
}

// ── Batch API (MGET) ──────────────────────────────────────────────────────────
//
// Redis MGET fetches N keys in ONE round-trip.  Calling getExactMatchCache()
// N times would issue N sequential GETs: N × 2ms = potentially 100ms+ for 50
// concurrent inference requests.  MGET collapses that to a single 2ms call.

/**
 * Fetch multiple cached responses in a single MGET round-trip.
 * Returns a Map<cacheKey, CachedLLMResponse> containing only the keys that hit.
 * Keys that miss are absent from the map (not null entries).
 *
 * @example
 * const hits = await getExactMatchCacheBatch([key1, key2, key3]);
 * for (const [key, response] of hits) { ... }
 */
export async function getExactMatchCacheBatch(
	cacheKeys: string[]
): Promise<Map<string, CachedLLMResponse>> {
	const result = new Map<string, CachedLLMResponse>();
	if (cacheKeys.length === 0) return result;

	try {
		const redis = getRedis();
		// MGET returns null for missing keys, string for hits — same order as input
		const values = await redis.mget(...cacheKeys);

		// simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. Cached LLM responses
		// can be 5-30KB each (full chat completion + metadata + token timings).
		const totalChars = values.reduce((sum, v) => sum + (v?.length ?? 0), 0);
		let parser: EntryParseFn = v8Parse;
		if (values.length >= 10 && totalChars >= 5_000) {
			try {
				const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
				if (isSimdJsonAvailable()) parser = fastJsonParse<CachedLLMResponse>;
			} catch { /* addon unavailable — keep V8 */ }
		}

		let hits = 0;
		for (let i = 0; i < cacheKeys.length; i++) {
			const raw = values[i];
			if (!raw) continue;
			const entry = parseEntry(raw, cacheKeys[i], parser);
			if (entry) {
				result.set(cacheKeys[i], entry);
				hits++;
			}
		}

		if (hits > 0) {
			console.log(`[Redis Exact-Match] MGET ${cacheKeys.length} keys → ${hits} hits`);
		}
	} catch (err) {
		console.error('[Redis Exact-Match] MGET error:', (err as Error)?.message ?? err);
	}

	return result;
}

/**
 * Store multiple responses in a single pipelined batch.
 * Uses Redis pipeline to send all SET commands in one TCP round-trip.
 *
 * @example
 * await setExactMatchCacheBatch([
 *   { key: key1, response: resp1 },
 *   { key: key2, response: resp2 },
 * ]);
 */
export async function setExactMatchCacheBatch(
	entries: Array<{ key: string; response: Omit<CachedLLMResponse, 'cachedAt'> }>,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
	if (entries.length === 0) return;
	try {
		const redis = getRedis();
		const pipeline = redis.pipeline();
		const now = new Date().toISOString();
		for (const { key, response } of entries) {
			const payload: CachedLLMResponse = { ...response, cachedAt: now };
			pipeline.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
		}
		await pipeline.exec();
		console.log(`[Redis Exact-Match] pipeline SET ${entries.length} keys ttl=${ttlSeconds}s`);
	} catch (err) {
		console.error('[Redis Exact-Match] pipeline SET error (non-fatal):', (err as Error)?.message ?? err);
	}
}

// ── Stats (pipelined) ─────────────────────────────────────────────────────────
//
// Original stats used N individual MEMORY USAGE calls + N TTL calls via
// Promise.all — that's 2N round-trips (each ~2ms → ~200ms for 50 keys).
// Redis pipeline sends all commands in one TCP write and reads responses in one
// TCP read: O(1) round-trips regardless of key count.

/**
 * Get cache statistics (monitoring/admin panel).
 * Uses a Redis pipeline for MEMORY USAGE + TTL — O(1) round-trips.
 */
export async function getExactMatchStats(): Promise<{
	totalKeys: number;
	memoryUsedBytes: number;
	avgTtlSeconds: number;
}> {
	try {
		const redis = getRedis();

		// SCAN for all exact-match keys
		const keys: string[] = [];
		let cursor = '0';
		do {
			const result = await redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 100);
			cursor = result[0];
			keys.push(...result[1]);
		} while (cursor !== '0');

		if (keys.length === 0) {
			return { totalKeys: 0, memoryUsedBytes: 0, avgTtlSeconds: 0 };
		}

		// Pipeline MEMORY USAGE + TTL for all keys in one round-trip
		const pipeline = redis.pipeline();
		for (const k of keys) pipeline.memory('USAGE', k);
		for (const k of keys) pipeline.ttl(k);

		const responses = await pipeline.exec();
		// responses = [[err, memBytes], ...keys.length times, [err, ttlSecs], ...]
		const n = keys.length;

		let totalMemory = 0;
		let ttlSum = 0;
		let ttlCount = 0;

		for (let i = 0; i < n; i++) {
			const memResult = responses?.[i];
			if (memResult && !memResult[0]) {
				totalMemory += (memResult[1] as number) ?? 0;
			}
		}
		for (let i = n; i < n * 2; i++) {
			const ttlResult = responses?.[i];
			if (ttlResult && !ttlResult[0]) {
				const ttl = (ttlResult[1] as number) ?? -1;
				if (ttl > 0) {
					ttlSum += ttl;
					ttlCount++;
				}
			}
		}

		return {
			totalKeys: keys.length,
			memoryUsedBytes: totalMemory,
			avgTtlSeconds: ttlCount > 0 ? Math.round(ttlSum / ttlCount) : 0,
		};
	} catch (err) {
		console.error('[Redis Exact-Match] Stats error:', (err as Error)?.message ?? err);
		return { totalKeys: 0, memoryUsedBytes: 0, avgTtlSeconds: 0 };
	}
}
