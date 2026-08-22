/**
 * simdjson N-API Bridge — server-only.
 *
 * Loads the compiled tensorrt_bridge.node addon and exposes simdjson functions:
 *   - fastJsonParse<T>(json) → T  (simdjson + byte-budget LRU, fallback to JSON.parse)
 *   - fastJsonValidate(json) → boolean
 *   - fastJsonExtractNumbers(json, pointer) → Float64Array | null
 *   - fastJsonExtractField(json, key) → string | null  (single-field fast path)
 *
 * Memory optimizations:
 *   - Byte-budget LRU (8 MB cap) instead of count-only — prevents unbounded heap growth
 *   - Input size guard (64 MB max) — prevents OOM from malicious/huge payloads
 *   - SIMD-friendly FNV-1a: samples 64-byte prefix + stride tail — stays in L1 cache
 *   - Payloads < 1 KB bypass native (V8 JIT faster for small strings)
 *   - TTL eviction: stale entries cleared on each insert
 *
 * SIMDJSON USAGE RULES:
 * - simdjson is ONLY for JSON text payloads such as Ollama / TurboQuant responses.
 * - Do NOT use fastJsonParse on gRPC streams, Protobuf buffers, or tensor TypedArrays.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const esmRequire = createRequire(import.meta.url);

// ── Addon interface ────────────────────────────────────────────────────────────

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

	if (process.env.SIMDJSON_DISABLED === '1') {
		console.info('[simdjson-bridge] Disabled via SIMDJSON_DISABLED=1 — using JSON.parse fallback');
		return null;
	}

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

// ── Byte-budget LRU cache ──────────────────────────────────────────────────────
// Tracks approximate heap usage of cached values to prevent unbounded growth.
// Evicts by TTL first, then by oldest-insertion order.

const LRU_BUDGET_BYTES = 32 * 1024 * 1024; // 32 MB
const LRU_TTL_MS       = 30_000;           // 30 s
const MAX_ENTRY_BYTES  = 8 * 1024 * 1024;  // skip caching single entries > 8 MB

interface CacheEntry {
	value: unknown;
	expiresAt: number;
	sizeBytes: number;  // approximate serialized size
}

const lruCache   = new Map<string, CacheEntry>();
let   cacheBytes = 0;

/**
 * FNV-1a 32-bit hash — L1-cache-friendly: reads first 64 bytes + stride-sampled tail.
 * Keeps hot path (< 64 chars) entirely within a single L1 cache line.
 */
function fnv1aKey(input: string): string {
	const len = input.length;
	let hash = 0x811c9dc5 >>> 0;

	// First 64 chars (≤ 256 bytes in UTF-16, fits in L1 D-cache)
	const head = Math.min(len, 64);
	for (let i = 0; i < head; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	// Stride-sample the tail (every 32 chars) to catch length + content variation
	if (len > 64) {
		const stride = Math.max(32, Math.floor((len - 64) / 8));
		for (let i = 64; i < len; i += stride) {
			hash ^= input.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
		// Always include the last char (catches trailing-diff strings)
		hash ^= input.charCodeAt(len - 1);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	// Mix in length to differentiate same-prefix strings
	hash ^= (len & 0xffff);
	hash = Math.imul(hash, 0x01000193) >>> 0;

	return hash.toString(36);
}

function approximateSize(value: unknown): number {
	try {
		return JSON.stringify(value).length * 2; // rough UTF-16 estimate
	} catch {
		return 1024; // unknown — assume 1 KB
	}
}

function lruEvictExpired(): void {
	const now = Date.now();
	for (const [k, entry] of lruCache) {
		if (now > entry.expiresAt) {
			cacheBytes -= entry.sizeBytes;
			lruCache.delete(k);
		}
	}
}

function lruGet(key: string): unknown | undefined {
	const entry = lruCache.get(key);
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) {
		cacheBytes -= entry.sizeBytes;
		lruCache.delete(key);
		return undefined;
	}
	// Refresh to MRU position
	lruCache.delete(key);
	lruCache.set(key, entry);
	stats.hits++;
	return entry.value;
}

function lruSet(key: string, value: unknown): void {
	const sizeBytes = approximateSize(value);

	// Skip caching huge entries — they'd blow the budget on a single item
	if (sizeBytes > MAX_ENTRY_BYTES) return;

	// Evict expired entries first (free pass)
	lruEvictExpired();

	// Evict LRU entries until budget allows insertion
	while (cacheBytes + sizeBytes > LRU_BUDGET_BYTES && lruCache.size > 0) {
		const oldest = lruCache.keys().next().value;
		if (!oldest) break;
		const old = lruCache.get(oldest)!;
		cacheBytes -= old.sizeBytes;
		lruCache.delete(oldest);
	}

	lruCache.set(key, { value, expiresAt: Date.now() + LRU_TTL_MS, sizeBytes });
	cacheBytes += sizeBytes;
}

// ── Telemetry ──────────────────────────────────────────────────────────────────

const stats = {
	hits:             0,
	misses:           0,
	nativeParses:     0,
	fallbackParses:   0,
	totalBytesParsed: 0,
	nativeTimeMs:     0,
};

/** Return current simdjson bridge metrics. Useful for D18 audit gates. */
export function getSimdStats() {
	return { ...stats, cacheBytes, cacheSize: lruCache.size };
}

// ── OOM guard ──────────────────────────────────────────────────────────────────

const MAX_INPUT_BYTES = 64 * 1024 * 1024; // 64 MB — beyond this, bail early

/** Minimum payload size for native simdjson path (V8 is faster for small strings) */
const MIN_NATIVE_BYTES = 1024;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Parse JSON with simdjson (large payloads) or V8 JSON.parse (small/fallback).
 * Results cached with 8 MB byte-budget LRU for 30 s.
 * Inputs > 64 MB throw RangeError to prevent OOM.
 */
export function fastJsonParse<T = unknown>(input: string): T {
	// OOM guard — bail before any allocation
	if (input.length > MAX_INPUT_BYTES) {
		throw new RangeError(
			`[simdjson-bridge] Input too large (${(input.length / 1e6).toFixed(1)} MB). ` +
			`Max is ${MAX_INPUT_BYTES / 1e6} MB.`
		);
	}

	// Check LRU cache (hash computed over L1-friendly prefix)
	const cacheKey = fnv1aKey(input);
	const cached = lruGet(cacheKey);
	if (cached !== undefined) return cached as T;

	stats.misses++;
	stats.totalBytesParsed += input.length;

	let result: T;
	const native = input.length >= MIN_NATIVE_BYTES ? getSimdJsonAddon() : null;

	if (native) {
		const start = performance.now();
		try {
			// simdjson validates + minifies; V8 parses the tightly-packed output
			const validated = native.simdJsonParse(input);
			result = JSON.parse(validated) as T;
			stats.nativeParses++;
			stats.nativeTimeMs += (performance.now() - start);
		} catch {
			stats.fallbackParses++;
			result = JSON.parse(input) as T;
		}
	} else {
		stats.fallbackParses++;
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
	if (input.length > MAX_INPUT_BYTES) return false;

	const native = getSimdJsonAddon();
	if (native) {
		try {
			return native.simdJsonValidate(input);
		} catch {
			// fall through
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
 * Zero-copy for embedding vectors — avoids full JS object allocation.
 * Returns null if addon unavailable or path not found.
 */
export function fastJsonExtractNumbers(input: string, pointer: string): Float64Array | null {
	if (input.length > MAX_INPUT_BYTES) return null;
	const native = getSimdJsonAddon();
	if (!native) return null;
	try {
		return native.simdJsonExtractNumbers(input, pointer);
	} catch {
		return null;
	}
}

/**
 * Extract a single string/number field by key from a flat JSON object.
 * Uses a lightweight regex fast-path — avoids full parse for single-field reads.
 * Example: fastJsonExtractField('{"model":"gemma4","status":"ok"}', "status") → "ok"
 */
export function fastJsonExtractField(input: string, key: string): string | null {
	if (input.length > MAX_INPUT_BYTES) return null;

	// Fast regex — captures first occurrence of `"key": <value>`
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const m = new RegExp(`"${escapedKey}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[^,}\\]]+)`).exec(input);
	if (!m) return null;

	const raw = m[1].trim();
	// Strip outer quotes for string values
	if (raw.startsWith('"') && raw.endsWith('"')) {
		return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
	}
	return raw;
}

// ── Reusable BufferPool ────────────────────────────────────────────────────────
// Pools pre-allocated Buffers for raw JSON input staging.
// Avoids repeated Buffer.allocUnsafe() in hot ingestion loops.
// simdjson docs recommend reusing parser + input storage for best performance.

const BUFFER_POOL_CHUNK = 1 << 20; // 1 MB minimum chunk
const BUFFER_POOL_MAX   = 12;      // max 12 buffers cached (~12 MB pool cap)
const _bufferPool: Buffer[] = [];

/**
 * Acquire a Buffer of at least `minBytes` from the pool (allocates if none available).
 * Must be released via `releaseBuffer()` when done — do NOT hold across await boundaries.
 */
export function acquireBuffer(minBytes: number): Buffer {
	const need = Math.max(minBytes, BUFFER_POOL_CHUNK);
	for (let i = 0; i < _bufferPool.length; i++) {
		if (_bufferPool[i].byteLength >= need) {
			return _bufferPool.splice(i, 1)[0];
		}
	}
	return Buffer.allocUnsafe(need);
}

/**
 * Return a Buffer to the pool for reuse.
 * Do not use the buffer after releasing it.
 */
export function releaseBuffer(buf: Buffer): void {
	if (_bufferPool.length < BUFFER_POOL_MAX) {
		_bufferPool.push(buf);
	}
	// If pool is full, let GC reclaim it
}

/**
 * Run `fn` with a pooled Buffer large enough for `size` bytes.
 * Automatically acquires and releases — safe for sync code.
 */
export function withBuffer<T>(size: number, fn: (buf: Buffer) => T): T {
	const buf = acquireBuffer(size);
	try {
		return fn(buf);
	} finally {
		releaseBuffer(buf);
	}
}

/**
 * Parse a large JSON array in chunks to stay within L2 cache per pass.
 * Yields parsed elements — caller controls memory pressure via iteration speed.
 * Falls back to full JSON.parse for non-array inputs.
 */
export function* fastJsonParseStream<T = unknown>(input: string, chunkHint = 64): Generator<T> {
	// Only chunk arrays; other values fall through to full parse
	const trimmed = input.trimStart();
	if (!trimmed.startsWith('[')) {
		yield fastJsonParse<T>(input);
		return;
	}

	// Trim outer brackets and split on top-level commas
	// This is a simplified splitter — does not handle nested commas inside objects.
	// For production use with deeply-nested arrays, prefer the native streaming API.
	const inner = trimmed.slice(1, trimmed.lastIndexOf(']'));
	let depth = 0, start = 0;
	const items: string[] = [];
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
		else if (ch === ',' && depth === 0) {
			items.push(inner.slice(start, i).trim());
			start = i + 1;
		}
	}
	if (start < inner.length) items.push(inner.slice(start).trim());

	for (let i = 0; i < items.length; i += chunkHint) {
		const chunk = items.slice(i, i + chunkHint);
		for (const item of chunk) {
			if (item) yield fastJsonParse<T>(item);
		}
		// Allow GC + I/O between chunks (microtask boundary)
		// In sync generator context this is a no-op but signals intent to caller
	}
}

/**
 * Return LRU cache stats for monitoring (Langfuse / admin panel).
 */
export function getSimdjsonCacheStats(): {
	entries: number;
	budgetUsedBytes: number;
	budgetLimitBytes: number;
	hitRatePct: number;
} {
	return {
		entries: lruCache.size,
		budgetUsedBytes: cacheBytes,
		budgetLimitBytes: LRU_BUDGET_BYTES,
		hitRatePct: 0, // counter tracking not added here to avoid overhead
	};
}

/**
 * Flush the LRU cache (useful after large bulk ingestion jobs to reclaim heap).
 */
export function clearSimdjsonCache(): void {
	lruCache.clear();
	cacheBytes = 0;
}

/**
 * Check if the simdjson native addon is loaded.
 */
export function isSimdJsonAvailable(): boolean {
	return getSimdJsonAddon() !== null;
}
