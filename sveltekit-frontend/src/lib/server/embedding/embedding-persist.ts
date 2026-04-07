/**
 * Embedding Persistence Service — PostgreSQL L4 cache tier
 *
 * Architecture:
 *   L3 Redis (1hr TTL, binary, fast) → L4 PostgreSQL (permanent, pgvector)
 *
 * Flow:
 *   - On cache miss: Check PG → Generate → Write to Redis AND PG
 *   - On cache hit: Read from Redis (faster) or PG (fallback)
 *
 * Table: embedding_cache (see schema-postgres.ts)
 * Column: embedding vector(768) — native pgvector type, cosine via <=>
 */

import { db } from '$lib/server/db/client';
import { embeddingCache } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
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
 * Serialize number[] to pgvector literal '[0.1,0.2,...]'
 */
function toVectorLiteral(embedding: number[]): string {
	return `[${embedding.join(',')}]`;
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
		// Cast vector column to text for JS retrieval; pgvector returns '[0.1,...]' strings
		const result = await db.execute<{ embedding: string }>(
			sql`SELECT embedding::text AS embedding FROM embedding_cache WHERE text_hash = ${hash} LIMIT 1`
		);

		if (!result.rows[0]?.embedding) return null;
		const vector: number[] = JSON.parse(result.rows[0].embedding);
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
		const vectorLiteral = toVectorLiteral(embedding);

		await db.execute(
      sql`INSERT INTO embedding_cache (text_hash, model, embedding)
			    VALUES (${hash}, ${model}, ${vectorLiteral}::vector )
			    ON CONFLICT (text_hash) DO UPDATE
			    SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = now()`
    );
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
		for (const { text, embedding } of entries) {
			await persistEmbedding(text, embedding, model);
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
		const result = await db.execute<{ text_hash: string; embedding: string }>(
			sql`SELECT text_hash, embedding::text AS embedding
			    FROM embedding_cache
			    WHERE text_hash = ANY(${hashes})`
		);

		const hashMap = new Map<string, number[]>();
		for (const row of result.rows) {
			if (row.embedding) {
				const vector: number[] = JSON.parse(row.embedding);
				if (vector.length === EMBEDDING_DIM) {
					hashMap.set(row.text_hash, vector);
				}
			}
		}

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
