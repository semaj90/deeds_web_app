/**
 * Unified Embedding Cache — Consolidates multiple fragmented cache formats
 *
 * Replaces:
 * - embed: Redis key pattern
 * - embeddings: Redis key pattern
 * - cache:embedding: Redis key pattern
 * - emb: Redis key pattern (embedding-cache-service.ts)
 *
 * Dual API: supports both JSON (Zod-validated) and binary buffer formats.
 */

import { getRedis } from '$lib/server/redis.js';
import { CACHE_KEYS, CACHE_TTL, EmbeddingSchema } from './cache-config.js';
import crypto from 'crypto';

const DEFAULT_MODEL = 'embeddinggemma:latest';
const EMBEDDING_TTL = CACHE_TTL.EMBEDDING; // 7 days
const SEMANTIC_EMBEDDING_DIMENSIONS = 768;

function decodeCanonicalEmbedding(buffer: Buffer): Float32Array | null {
  if (buffer.byteLength !== SEMANTIC_EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT) return null;
  const vector = new Float32Array(buffer.buffer, buffer.byteOffset, SEMANTIC_EMBEDDING_DIMENSIONS);
  return Array.from(vector).every(Number.isFinite) ? vector : null;
}

function assertCanonicalEmbedding(vector: Float32Array): void {
  if (vector.length !== SEMANTIC_EMBEDDING_DIMENSIONS) {
    throw new Error(`SEMANTIC_768_CACHE_INVALID_DIMENSIONS:${vector.length}`);
  }
  if (!Array.from(vector).every(Number.isFinite)) {
    throw new Error('SEMANTIC_768_CACHE_NON_FINITE_VALUE');
  }
}

/**
 * Hash text using SHA-256 for the new unified format
 */
export function hashTextSha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Fetch embedding from the API endpoint
 */
async function fetchEmbedding(
  text: string,
  model: string = DEFAULT_MODEL
): Promise<Float32Array> {
  // /api/embed's request schema only accepts model: 'embeddinggemma' | 'mock'.
  // The `model` param here is a cache-key label (e.g. 'embeddinggemma:latest'),
  // not a route selector — sending it verbatim always fails schema validation
  // with a 400. embedText() on the server owns the canonical EmbeddingGemma
  // lane, so no client-side model substitution retry is permitted.
  // with a different model name is needed here.
  const response = await fetch('/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: 'embeddinggemma' }),
  });

  if (!response.ok) {
    throw new Error(`Embed API error: ${response.status}`);
  }

  const data = await response.json();
  return new Float32Array(data.embedding);
}

/**
 * Retrieve only representation-sized entries from the model-qualified key.
 */
export async function getEmbedding(
  text: string,
  model: string = DEFAULT_MODEL
): Promise<Float32Array | null> {
  const redis = getRedis();
  const sha256 = hashTextSha256(text);
  const cacheKey = CACHE_KEYS.EMBEDDING(model, sha256);

  // 1. Try reading the new binary key format
  const buffer = await redis.getBuffer(cacheKey).catch(() => null);
  if (buffer) {
    return decodeCanonicalEmbedding(buffer);
  }

  return null;
}

/**
 * Cache embedding in Redis (binary format)
 */
export async function cacheEmbedding(
  text: string,
  embedding: Float32Array,
  model: string = DEFAULT_MODEL
): Promise<void> {
  assertCanonicalEmbedding(embedding);
  const key = CACHE_KEYS.EMBEDDING(model, hashTextSha256(text));
  const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  const redis = getRedis();
  await redis.setex(key, EMBEDDING_TTL, buffer);
}

/**
 * Batch cache multiple embeddings
 */
export async function batchCacheEmbeddings(
  entries: Array<{ text: string; embedding: Float32Array }>,
  model: string = DEFAULT_MODEL
): Promise<void> {
  if (entries.length === 0) return;
  for (const { embedding } of entries) assertCanonicalEmbedding(embedding);

  const redis = getRedis();
  const pipeline = redis.pipeline();

  for (const { text, embedding } of entries) {
    const key = CACHE_KEYS.EMBEDDING(model, hashTextSha256(text));
    const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    pipeline.setex(key, EMBEDDING_TTL, buffer);
  }

  await pipeline.exec();
}

/**
 * Batch get multiple cached embeddings
 */
export async function batchGetCachedEmbeddings(
  texts: string[],
  model: string = DEFAULT_MODEL
): Promise<Array<Float32Array | null>> {
  if (texts.length === 0) return [];

  // Check new binary format first
  const keys = texts.map((text) => CACHE_KEYS.EMBEDDING(model, hashTextSha256(text)));
  const redis = getRedis();
  const pipeline = redis.pipeline();

  for (const key of keys) {
    pipeline.getBuffer(key);
  }

  const results = await pipeline.exec();
  const outputs: Array<Float32Array | null> = [];

  for (let i = 0; i < texts.length; i++) {
    const [err, buffer] = results![i];
    if (!err && buffer) {
      const buf = buffer as Buffer;
      outputs.push(decodeCanonicalEmbedding(buf));
    } else {
      // Fallback to single get (which handles lazy rehashing)
      const fallback = await getEmbedding(texts[i], model);
      outputs.push(fallback);
    }
  }

  return outputs;
}

/**
 * Clear embedding cache
 */
export async function clearEmbeddingCache(model?: string): Promise<void> {
  const redis = getRedis();
  const pattern = model ? `embed:v2:${model}:*` : 'embed:v2:*';
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
