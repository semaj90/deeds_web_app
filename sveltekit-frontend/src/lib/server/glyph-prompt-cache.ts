/**
 * L0.5 Glyph Prompt-Fragment Cache
 *
 * NES/CHR-ROM-inspired binary cache for SSE chat prompt fragments.
 * Sits between client caches (L0 LokiJS / L1 IndexedDB) and server
 * caches (L2 Memory Map / L3 Redis / L4 Qdrant semantic).
 *
 * Each entry is a 16-byte header + deflate-compressed UTF-8 payload.
 * In-process Map gives O(1) lookup with <0.1ms decode latency.
 *
 * Binary header layout (16 bytes):
 *   [0-3]   magic: 0x474C5950 ("GLYP")
 *   [4]     version: 0x01
 *   [5]     fragmentType: 0-5
 *   [6-7]   uncompressedLength: uint16
 *   [8-11]  createdAt: uint32 (epoch seconds)
 *   [12-13] ttlSeconds: uint16
 *   [14]    compressionMethod: 0=none, 1=deflate
 *   [15]    flags: reserved
 */

import { deflateSync, inflateSync } from 'node:zlib';

// ============================================================================
// Constants
// ============================================================================

const MAGIC = 0x474c5950; // "GLYP"
const HEADER_SIZE = 16;
const MAX_ENTRIES = 2048;
const MIN_COMPRESS_BYTES = 128;

/** Fragment type slots — maps to prompt assembly stages */
export const FragmentType = {
	CASE: 0,
	RAG: 1,
	KAG: 2,
	CODE: 3,
	CONV: 4,
	SYSTEM: 5
} as const;

export type FragmentTypeValue = (typeof FragmentType)[keyof typeof FragmentType];

// ============================================================================
// Metrics
// ============================================================================

export interface GlyphCacheMetrics {
	entries: number;
	hits: number;
	misses: number;
	evictions: number;
	hitRate: number;
	totalCompressedBytes: number;
	avgCompressionRatio: number;
}

let hits = 0;
let misses = 0;
let evictions = 0;
let totalCompressedBytes = 0;
let totalUncompressedBytes = 0;

// ============================================================================
// L0.5 In-Process Cache
// ============================================================================

const cache = new Map<string, Uint8Array>();

// ============================================================================
// Binary Encoding / Decoding
// ============================================================================

function encode(text: string, type: number, ttlMs: number): Uint8Array | null {
	const textBytes = new TextEncoder().encode(text);

	// Cap at uint16 max (65535 bytes uncompressed)
	if (textBytes.length > 65535) return null;

	// Compress if payload exceeds threshold
	let payload: Uint8Array;
	let isCompressed = false;

	if (textBytes.length > MIN_COMPRESS_BYTES) {
		try {
			const compressed = deflateSync(textBytes, { level: 1 }); // fastest
			if (compressed.length < textBytes.length) {
				payload = compressed;
				isCompressed = true;
			} else {
				payload = textBytes;
			}
		} catch {
			payload = textBytes;
		}
	} else {
		payload = textBytes;
	}

	// Build 16-byte header
	const entry = new Uint8Array(HEADER_SIZE + payload.length);
	const dv = new DataView(entry.buffer);

	dv.setUint32(0, MAGIC);
	entry[4] = 0x01; // version
	entry[5] = type & 0xff;
	dv.setUint16(6, textBytes.length);
	dv.setUint32(8, Math.floor(Date.now() / 1000));
	dv.setUint16(12, Math.min(65535, Math.floor(ttlMs / 1000)));
	entry[14] = isCompressed ? 1 : 0;
	entry[15] = 0; // flags reserved

	entry.set(payload, HEADER_SIZE);

	// Track compression metrics
	totalCompressedBytes += payload.length;
	totalUncompressedBytes += textBytes.length;

	return entry;
}

function decode(entry: Uint8Array): string | null {
	if (entry.length < HEADER_SIZE) return null;

	const dv = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
	if (dv.getUint32(0) !== MAGIC) return null;

	// TTL check
	const createdAt = dv.getUint32(8) * 1000;
	const ttlMs = dv.getUint16(12) * 1000;
	if (Date.now() > createdAt + ttlMs) return null; // expired

	const isCompressed = entry[14] === 1;
	const payload = entry.subarray(HEADER_SIZE);

	try {
		const textBytes = isCompressed ? inflateSync(payload) : payload;
		return new TextDecoder().decode(textBytes);
	} catch {
		return null;
	}
}

/**
 * Extract createdAt timestamp from entry header without full decode.
 * Used for LRU eviction sorting.
 */
function getCreatedAt(entry: Uint8Array): number {
	if (entry.length < HEADER_SIZE) return 0;
	const dv = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
	return dv.getUint32(8);
}

// ============================================================================
// LRU Eviction
// ============================================================================

function evictOldest(): void {
	if (cache.size < MAX_ENTRIES) return;

	// Collect timestamps and sort — evict oldest 25%
	const entries: Array<[string, number]> = [];
	for (const [key, value] of cache) {
		entries.push([key, getCreatedAt(value)]);
	}
	entries.sort((a, b) => a[1] - b[1]);

	const evictCount = Math.floor(MAX_ENTRIES * 0.25);
	for (let i = 0; i < evictCount && i < entries.length; i++) {
		cache.delete(entries[i][0]);
		evictions++;
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a cached prompt fragment by key.
 * Returns decompressed text on hit, null on miss or expiry.
 */
export function getFragment(key: string): string | null {
	const entry = cache.get(key);
	if (!entry) {
		misses++;
		return null;
	}

	const text = decode(entry);
	if (text === null) {
		// Expired or corrupted — remove
		cache.delete(key);
		misses++;
		return null;
	}

	hits++;
	return text;
}

/**
 * Store a prompt fragment with binary compression.
 * Silently drops entries that exceed 65535 bytes uncompressed.
 */
export function setFragment(
	key: string,
	text: string,
	type: FragmentTypeValue,
	ttlMs: number
): void {
	const entry = encode(text, type, ttlMs);
	if (!entry) return; // too large

	evictOldest();
	cache.set(key, entry);
}

/**
 * Invalidate all cached fragments for a conversation.
 * Removes conv and system prompt entries matching the conversationId.
 */
export function invalidateConversation(conversationId: string): void {
	const prefix = `glyph:conv:${conversationId}`;
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) {
			cache.delete(key);
		}
	}
}

/**
 * Invalidate all cached fragments for a case.
 * Removes case context and associated RAG/KAG entries.
 */
export function invalidateCase(caseId: string): void {
	for (const key of cache.keys()) {
		if (key.includes(caseId)) {
			cache.delete(key);
		}
	}
}

/**
 * Get current cache performance metrics.
 */
export function getGlyphCacheMetrics(): GlyphCacheMetrics {
	const totalRequests = hits + misses;
	return {
		entries: cache.size,
		hits,
		misses,
		evictions,
		hitRate: totalRequests > 0 ? hits / totalRequests : 0,
		totalCompressedBytes,
		avgCompressionRatio:
			totalUncompressedBytes > 0 ? totalCompressedBytes / totalUncompressedBytes : 1
	};
}
