/**
 * Binary embedding cache for Redis
 * Stores Float32Array embeddings in binary format (4x smaller than JSON)
 */

import type { Redis } from 'ioredis';
import { getRedis } from './redis.js';
import { createHash } from 'crypto';

const EMBEDDING_TTL = 3600; // 1 hour

/**
 * Hash text to create deterministic cache key
 */
function hashText(text: string): string {
	return createHash('md5').update(text).digest('hex');
}

/**
 * Cache embedding in Redis (binary format)
 * @param text - Original text that was embedded
 * @param embedding - Float32Array embedding vector (768-dim)
 */
export async function cacheEmbedding(
	text: string,
	embedding: Float32Array
): Promise<void> {
	const key = `embed:${hashText(text)}`;

	// Convert Float32Array to Buffer (binary)
	const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

	const redis: Redis = getRedis();
	await redis.setex(key, EMBEDDING_TTL, buffer);
}

/**
 * Get cached embedding from Redis
 * @param text - Original text to look up
 * @returns Float32Array or null if not cached
 */
export async function getCachedEmbedding(text: string): Promise<Float32Array | null> {
	const key = `embed:${hashText(text)}`;
	const redis: Redis = getRedis();
	const buffer = await redis.getBuffer(key);

	if (!buffer) return null;

	// Convert Buffer back to Float32Array
	return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/**
 * Batch cache multiple embeddings
 * @param entries - Array of {text, embedding} pairs
 */
export async function batchCacheEmbeddings(
	entries: Array<{ text: string; embedding: Float32Array }>
): Promise<void> {
	if (entries.length === 0) return;

	const redis: Redis = getRedis();
	const pipeline = redis.pipeline();

	for (const { text, embedding } of entries) {
		const key = `embed:${hashText(text)}`;
		const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
		pipeline.setex(key, EMBEDDING_TTL, buffer);
	}

	await pipeline.exec();
}

/**
 * Batch get multiple cached embeddings
 * @param texts - Array of texts to look up
 * @returns Array of Float32Array | null (preserves order)
 */
export async function batchGetCachedEmbeddings(
	texts: string[]
): Promise<Array<Float32Array | null>> {
	if (texts.length === 0) return [];

	const keys = texts.map((text) => `embed:${hashText(text)}`);
	const redis: Redis = getRedis();
	const pipeline = redis.pipeline();

	for (const key of keys) {
		pipeline.getBuffer(key);
	}

	const results = await pipeline.exec();

	return results!.map(([err, buffer]) => {
		if (err || !buffer) return null;
		const buf = buffer as Buffer;
		return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
	});
}

/**
 * Clear embedding cache (use sparingly)
 */
export async function clearEmbeddingCache(): Promise<void> {
	const redis: Redis = getRedis();
	const keys = await redis.keys('embed:*');
	if (keys.length > 0) {
		await redis.del(...keys);
	}
}
