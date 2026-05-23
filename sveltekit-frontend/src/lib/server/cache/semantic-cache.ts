import { db } from '../db/client.js';
import { semanticCache } from '../db/schema/schema-semantic-cache.js';
import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { getRedis } from '../redis.js';
import {
  searchSemanticCache as searchRedisSemanticCache,
  storeSemanticCache as storeRedisSemanticCache,
} from './redis-semantic-cache.js';

const KARPATHY_ENCODED_TTL_SECONDS = 24 * 60 * 60;

// In a real scenario, this connects to Ollama embeddinggemma
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
    });
    if (!res.ok) throw new Error('Ollama not running');
    const data = await res.json();
    return data.embedding;
  } catch (e) {
    // Fallback stub if ollama is offline during test
    console.warn("Ollama unavailable, using stub 768-dim embedding");
    return new Array(768).fill(0.01);
  }
}

/**
 * Step 1-3 of the semantic cache flow.
 */
export async function checkSemanticCache(prompt: string, modelName: string, threshold = 0.90) {
  const hash = crypto.createHash('sha256').update(prompt).digest('hex');

  // 1. Check exact match via hash
  const exact = await db.query.semanticCache.findFirst({
    where: (cache, { eq }) => eq(cache.promptHash, hash)
  });
  if (exact) {
    console.log("[Semantic Cache] EXACT HIT:", hash);
    return exact.responseText;
  }

  // 2. Build query embedding once for downstream semantic checks
  const embedding = await generateEmbedding(prompt);

  // 3. Phase 2 (L1.5): Redis semantic cache
  try {
    const redisHit = await searchRedisSemanticCache(getRedis(), embedding, modelName, threshold);
    if (redisHit?.response) {
      console.log("[Semantic Cache] REDIS SEMANTIC HIT (score: " + redisHit.score + ")");
      return redisHit.response;
    }
  } catch (err) {
    console.warn('[Semantic Cache] Redis semantic lookup failed (non-fatal):', err);
  }

  // 4. Phase 1 fallback: pgvector semantic search
  const vectorStr = `[${embedding.join(',')}]`;

  // PGVector cosine distance is <=>; Cosine similarity is 1 - distance
  const results = await db.select({
    id: semanticCache.id,
    responseText: semanticCache.responseText,
    similarity: sql<number>`1 - (${semanticCache.embedding} <=> ${vectorStr}::vector)`.as('similarity')
  })
  .from(semanticCache)
  .where(sql`1 - (${semanticCache.embedding} <=> ${vectorStr}::vector) >= ${threshold}`)
  .orderBy(sql`1 - (${semanticCache.embedding} <=> ${vectorStr}::vector) DESC`)
  .limit(1);

  if (results.length > 0) {
    console.log("[Semantic Cache] SEMANTIC HIT (score: " + results[0].similarity + ")");
    return results[0].responseText;
  }

  console.log("[Semantic Cache] MISS");
  return null; // Call streamText()
}

function projectEmbeddingTo64(embedding: number[]): number[] {
  const TARGET_DIM = 64;
  if (embedding.length === 0) return new Array(TARGET_DIM).fill(0);

  const out = new Array(TARGET_DIM).fill(0);
  const counts = new Array(TARGET_DIM).fill(0);

  for (let i = 0; i < embedding.length; i++) {
    const bucket = Math.floor((i * TARGET_DIM) / embedding.length);
    out[bucket] += embedding[i];
    counts[bucket] += 1;
  }

  for (let i = 0; i < TARGET_DIM; i++) {
    out[i] = counts[i] > 0 ? out[i] / counts[i] : 0;
  }

  return out;
}

async function publishKarpathyEncodedStub(
  promptHash: string,
  embedding768: number[],
  modelName: string,
  response: string,
) {
  try {
    const redis = getRedis();
    const encoded64 = projectEmbeddingTo64(embedding768);
    const key = `gpu:karpathy:encoded:${promptHash.slice(0, 24)}`;
    const createdAt = new Date().toISOString();

    const pipeline = redis.pipeline();
    pipeline.hset(key, {
      promptHash,
      model: modelName,
      encoded64: JSON.stringify(encoded64),
      source: 'semantic-cache-phase3-stub',
      responsePreview: response.slice(0, 300),
      createdAt,
    });
    pipeline.expire(key, KARPATHY_ENCODED_TTL_SECONDS);
    pipeline.zadd('gpu:karpathy:encoded', Date.now(), key);
    pipeline.expire('gpu:karpathy:encoded', KARPATHY_ENCODED_TTL_SECONDS);
    await pipeline.exec();
  } catch (err) {
    console.warn('[Semantic Cache] Karpathy publish stub failed (non-fatal):', err);
  }
}

/**
 * Step 5: Save prompt and response
 */
export async function saveToSemanticCache(prompt: string, response: string, modelName: string) {
  const hash = crypto.createHash('sha256').update(prompt).digest('hex');
  const embedding = await generateEmbedding(prompt);

  await db.insert(semanticCache).values({
    id: crypto.randomUUID(),
    promptHash: hash,
    promptText: prompt,
    responseText: response,
    embedding: embedding,
    model: modelName
  }).onConflictDoNothing(); // If exact hash already exists, ignore

  // Phase 2 bridge: keep Redis semantic cache warm on misses.
  try {
    await storeRedisSemanticCache(getRedis(), embedding, response, modelName);
  } catch (err) {
    console.warn('[Semantic Cache] Redis semantic store failed (non-fatal):', err);
  }

  // Phase 3 hook stub: publish 64d compact vector to Karpathy lane.
  await publishKarpathyEncodedStub(hash, embedding, modelName, response);
}
