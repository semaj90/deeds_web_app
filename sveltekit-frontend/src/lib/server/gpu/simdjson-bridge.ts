/**
 * simdjson N-API Bridge — server-only.
 *
 * Loads the compiled tensorrt_bridge.node addon and exposes simdjson functions:
 *   - fastJsonParse<T>(json) → T (simdjson + LRU cache, fallback to JSON.parse)
 *   - fastJsonValidate(json) → boolean (fast structural check)
 *   - fastJsonExtractNumbers(json, pointer) → Float64Array | null
 *
 * Auto-fallback: if the native addon is unavailable, all functions degrade to
 * V8 built-ins. Payloads < 1KB skip the addon (V8 is faster for small strings).
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const esmRequire = createRequire(import.meta.url);

// ── Addon interface ────────────────────────────────────────────────────

interface SimdJsonAddon {
	simdJsonParse: (json: string) => string;
	simdJsonValidate: (json: string) => boolean;
	simdJsonExtractNumbers: (json: string, pointer: string) => Float64Array;
}

let addon: SimdJsonAddon | null = null;
let loadAttempted = false;

function getSimdJsonAddon(): SimdJsonAddon | null {
	if (loadAttempted) return addon;
	loadAttempted = true;

	const paths = [
		resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/cpp/build/tensorrt_bridge.node'),
		resolve(process.cwd(), '../simd-bridge/build/Release/tensorrt_bridge.node'),
	];

	for (const p of paths) {
		try {
			if (!existsSync(p)) continue;
			const mod = esmRequire(p) as Record<string, unknown>;
			if (typeof mod.simdJsonParse === 'function') {
				addon = mod as unknown as SimdJsonAddon;
				console.log(`[simdjson-bridge] Loaded native addon from ${p}`);
				return addon;
			}
		} catch (err) {
			console.warn(`[simdjson-bridge] Failed to load ${p}:`, (err as Error).message);
		}
	}

	console.warn('[simdjson-bridge] Native addon not available, using JSON.parse fallback');
	return null;
}

// ── LRU Cache ──────────────────────────────────────────────────────────

const LRU_MAX = 200;
const LRU_TTL_MS = 30_000;

interface CacheEntry {
	value: unknown;
	expiresAt: number;
}

const lruCache = new Map<string, CacheEntry>();

/** FNV-1a hash of (first 128 bytes + length) for cache key */
function fnv1aKey(input: string): string {
	const len = input.length;
	const prefix = input.length > 128 ? input.slice(0, 128) : input;
	let hash = 0x811c9dc5;
	for (let i = 0; i < prefix.length; i++) {
		hash ^= prefix.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	// Mix in length to differentiate strings with same 128-byte prefix
	hash ^= len;
	hash = (hash * 0x01000193) >>> 0;
	return hash.toString(36);
}

function lruGet(key: string): unknown | undefined {
	const entry = lruCache.get(key);
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) {
		lruCache.delete(key);
		return undefined;
	}
	// Move to end (most recently used)
	lruCache.delete(key);
	lruCache.set(key, entry);
	return entry.value;
}

function lruSet(key: string, value: unknown): void {
	// Evict oldest if at capacity
	if (lruCache.size >= LRU_MAX) {
		const oldest = lruCache.keys().next().value;
		if (oldest) lruCache.delete(oldest);
	}
	lruCache.set(key, { value, expiresAt: Date.now() + LRU_TTL_MS });
}

// ── Minimum payload size for native path ──────────────────────────────

const MIN_NATIVE_BYTES = 1024;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Parse JSON with simdjson (large payloads) or V8 JSON.parse (small/fallback).
 * Results are LRU-cached for 30s.
 */
export function fastJsonParse<T = unknown>(input: string): T {
	// Check LRU cache
	const cacheKey = fnv1aKey(input);
	const cached = lruGet(cacheKey);
	if (cached !== undefined) return cached as T;

	let result: T;

	const native = input.length >= MIN_NATIVE_BYTES ? getSimdJsonAddon() : null;
	if (native) {
		try {
			// simdjson validates + minifies, then V8 parses the validated string
			const validated = native.simdJsonParse(input);
			result = JSON.parse(validated) as T;
		} catch {
			// Fallback on any native error
			result = JSON.parse(input) as T;
		}
	} else {
		result = JSON.parse(input) as T;
	}

	lruSet(cacheKey, result);
	return result;
}

/**
 * Fast JSON structural validation via simdjson.
 * Falls back to try/catch JSON.parse if addon unavailable.
 */
export function fastJsonValidate(input: string): boolean {
	const native = getSimdJsonAddon();
	if (native) {
		try {
			return native.simdJsonValidate(input);
		} catch {
			// fallback
		}
	}

	try {
		JSON.parse(input);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract a numeric array at a JSON Pointer path directly into a Float64Array.
 * Skips JS object allocation entirely — ideal for embedding vectors.
 * Returns null if addon is unavailable.
 */
export function fastJsonExtractNumbers(input: string, pointer: string): Float64Array | null {
	const native = getSimdJsonAddon();
	if (!native) return null;

	try {
		return native.simdJsonExtractNumbers(input, pointer);
	} catch {
		return null;
	}
}

/**
 * Check if the simdjson native addon is loaded.
 */
export function isSimdJsonAvailable(): boolean {
	return getSimdJsonAddon() !== null;
}
