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

// Base64 helper for legacy emb: key format
function generateLegacyEmbKey(text: string, model: string): string {
  const content = `${model}:${text}`;
  return Buffer.from(content).toString('base64').substring(0, 40);
}

/**
 * Hash text using SHA-256 for the new unified format
 */
export function hashTextSha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Hash text using MD5 for legacy formats
 */
export function hashTextMd5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Fetch embedding from the API endpoint
 */
async function fetchEmbedding(
  text: string,
  model: string = DEFAULT_MODEL
): Promise<Float32Array> {
  try {
    const response = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model }),
    });

    if (!response.ok) {
      throw new Error(`Embed API error: ${response.status}`);
    }

    const data = await response.json();
    return new Float32Array(data.embedding);
  } catch (err) {
    if (model === DEFAULT_MODEL) {
      console.warn('[EmbeddingCache] Fallback to nomic-embed-text:', err);
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: 'nomic-embed-text' }),
      });

      if (!response.ok) {
        throw new Error(`Embed fallback failed: ${response.status}`);
      }

      const data = await response.json();
      return new Float32Array(data.embedding);
    }
    throw err;
  }
}

/**
 * Retrieve cached embedding with incremental lazy key rehashing
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
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  // 2. Lazy Rehashing: Check legacy key formats
  const md5 = hashTextMd5(text);
  const legacyKeys = [
    `emb:${generateLegacyEmbKey(text, model)}`,
    `embeddings:${md5}`,
    `embed:${md5}`,
    `cache:embedding:${md5}`
  ];

  for (const legKey of legacyKeys) {
    try {
      const cached = await redis.get(legKey);
      if (cached) {
        let embedding: number[] | null = null;
        if (legKey.startsWith('emb:')) {
          // JSON string containing base64 encoded compressed list
          const entry = JSON.parse(cached);
          if (entry.embedding) {
            if (typeof entry.embedding === 'string') {
              const json = Buffer.from(entry.embedding, 'base64').toString();
              embedding = JSON.parse(json);
            } else {
              embedding = entry.embedding;
            }
          }
        } else {
          // MD5 keys can store JSON of number[] or EmbeddingData schema
          const data = JSON.parse(cached);
          if (Array.isArray(data)) {
            embedding = data;
          } else if (data && Array.isArray(data.embedding)) {
            embedding = data.embedding;
          }
        }

        if (embedding && embedding.length > 0) {
          const vector = new Float32Array(embedding);
          // Migrate/rehash to the new binary format
          const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
          await redis.setex(cacheKey, EMBEDDING_TTL, buf).catch(() => {});
          // Del legacy key to cleanup
          redis.del(legKey).catch(() => {});
          console.debug(`[EmbeddingCache] Rehashed legacy key ${legKey} -> ${cacheKey}`);
          return vector;
        }
      } else {
        // Also check if any legacy keys are stored as binary buffers
        const bufCached = await redis.getBuffer(legKey).catch(() => null);
        if (bufCached && bufCached.length > 0) {
          const vector = new Float32Array(bufCached.buffer, bufCached.byteOffset, bufCached.byteLength / 4);
          const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
          await redis.setex(cacheKey, EMBEDDING_TTL, buf).catch(() => {});
          redis.del(legKey).catch(() => {});
          console.debug(`[EmbeddingCache] Rehashed legacy buffer key ${legKey} -> ${cacheKey}`);
          return vector;
        }
      }
    } catch (err) {
      console.warn(`[EmbeddingCache] Legacy key parse error for ${legKey}:`, err);
    }
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
      outputs.push(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
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
