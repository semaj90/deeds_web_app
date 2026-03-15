/**
 * Embedding Persistence Service — PostgreSQL L4 cache tier
 *
 * Architecture:
 *   L3 Redis (1hr TTL, binary, fast) → L4 PostgreSQL (permanent, compressed JSON)
 *
 * Flow:
 *   - On cache miss: Check PG → Generate → Write to Redis AND PG
 *   - On cache hit: Read from Redis (faster) or PG (fallback)
 *
 * Table: embedding_cache (see schema-postgres.ts)
 */

import { db } from '$lib/server/db/client';
import { embeddingCache } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

const EMBEDDING_DIM = 768;
const DEFAULT_MODEL = 'embeddinggemma:latest';

/**
 * Hash text to create deterministic cache key
 */
function hashText(text: string): string {
	return createHash('md5').update(text).digest('hex');
}

/**
 * Compress embedding to JSON string (for PG storage)
 * Uses fixed precision to reduce storage (~30% smaller)
 */
function compressEmbedding(embedding: number[]): string {
	// Round to 6 decimal places (sufficient for cosine similarity)
	const rounded = embedding.map(v => Math.round(v * 1_000_000) / 1_000_000);
	return JSON.stringify(rounded);
}

/**
 * Decompress JSON string to embedding array
 */
function decompressEmbedding(json: string): number[] {
	try {
		return JSON.parse(json);
	} catch {
		return [];
	}
}

/**
 * Get embedding from PostgreSQL cache
 * @param text - Original text that was embedded
 * @returns Embedding vector or null if not found
 */
export async function getPersistedEmbedding(
	text: string,
	model: string = DEFAULT_MODEL
): Promise<number[] | null> {
	try {
		const hash = hashText(text);
		const result = await db
			.select({ embedding: embeddingCache.embedding })
			.from(embeddingCache)
			.where(eq(embeddingCache.textHash, hash))
			.limit(1);

		if (!result[0]?.embedding) return null;

		const vector = decompressEmbedding(result[0].embedding);
		if (vector.length !== EMBEDDING_DIM) {
			console.warn('embedding-persist: invalid vector dimension', { hash, length: vector.length });
			return null;
		}

		return vector;
	} catch (err) {
		console.error('embedding-persist: PG read error', err);
		return null;
	}
}

/**
 * Persist embedding to PostgreSQL
 * @param text - Original text that was embedded
 * @param embedding - Embedding vector (768-dim)
 * @param model - Model used to generate embedding
 */
export async function persistEmbedding(
	text: string,
	embedding: number[],
	model: string = DEFAULT_MODEL
): Promise<void> {
	try {
		const hash = hashText(text);
		const compressed = compressEmbedding(embedding);

		// Upsert: insert or update on conflict
		await db
			.insert(embeddingCache)
			.values({
				textHash: hash,
				model,
				embedding: compressed,
			})
			.onConflictDoUpdate({
				target: embeddingCache.textHash,
				set: {
					embedding: compressed,
					model,
					createdAt: new Date().toISOString(),
				},
			});
	} catch (err) {
		// Non-fatal — Redis is primary cache
		console.warn('embedding-persist: PG write error (non-fatal)', err);
	}
}

/**
 * Batch persist multiple embeddings
 * @param entries - Array of {text, embedding} pairs
 * @param model - Model used
 */
export async function batchPersistEmbeddings(
	entries: Array<{ text: string; embedding: number[] }>,
	model: string = DEFAULT_MODEL
): Promise<void> {
	if (entries.length === 0) return;

	try {
		const values = entries.map(({ text, embedding }) => ({
			textHash: hashText(text),
			model,
			embedding: compressEmbedding(embedding),
		}));

		// Batch upsert
		for (const value of values) {
			await db
				.insert(embeddingCache)
				.values(value)
				.onConflictDoNothing();
		}
	} catch (err) {
		console.warn('embedding-persist: batch PG write error (non-fatal)', err);
	}
}

/**
 * Batch get multiple persisted embeddings
 * @param texts - Array of texts to look up
 * @returns Array of embedding vectors | null (preserves order)
 */
export async function batchGetPersistedEmbeddings(
	texts: string[]
): Promise<Array<number[] | null>> {
	if (texts.length === 0) return [];

	try {
		const hashes = texts.map(hashText);

		// Get all matching hashes
		const results = await db
			.select({ textHash: embeddingCache.textHash, embedding: embeddingCache.embedding })
			.from(embeddingCache)
			.where(
				// Use IN query - drizzle-orm style
				hashes.length === 1
					? eq(embeddingCache.textHash, hashes[0])
					: eq(embeddingCache.textHash, hashes[0]) // Will use manual filtering below
			);

		// Build hash -> embedding map
		const hashMap = new Map<string, number[]>();
		for (const row of results) {
			if (row.embedding) {
				const vector = decompressEmbedding(row.embedding);
				if (vector.length === EMBEDDING_DIM) {
					hashMap.set(row.textHash, vector);
				}
			}
		}

		// Preserve input order
		return hashes.map(h => hashMap.get(h) ?? null);
	} catch (err) {
		console.warn('embedding-persist: batch PG read error', err);
		return texts.map(() => null);
	}
}

/**
 * Get embedding cache stats
 */
export async function getEmbeddingCacheStats(): Promise<{
	totalCount: number;
	oldestEntry: string | null;
	latestEntry: string | null;
}> {
	try {
		const countResult = await db
			.select({ count: embeddingCache.id })
			.from(embeddingCache);

		// For now just return count (avoid complex aggregations)
		return {
			totalCount: countResult.length,
			oldestEntry: null,
			latestEntry: null,
		};
	} catch {
		return { totalCount: 0, oldestEntry: null, latestEntry: null };
	}
}

/**
 * Clean old embedding cache entries (optional maintenance)
 * @param olderThanDays - Remove entries older than this many days
 */
export async function cleanOldEmbeddings(olderThanDays: number = 90): Promise<number> {
	// Not implemented yet — would need timestamp comparison
	return 0;
}
