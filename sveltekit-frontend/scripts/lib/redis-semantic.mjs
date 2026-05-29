/**
 * redis-semantic.mjs
 *
 * Semantic caching helpers for Redis/Valkey with embedding support.
 * Caches embeddings in Redis hash, uses Valkey :stream for event streaming.
 *
 * Features:
 *   - Embed text via Ollama embeddinggemma (768-dim)
 *   - Cache embeddings in Redis hash with configurable TTL
 *   - Stream updates via Valkey :stream (XREAD)
 *   - Fallback to Qdrant on cache miss
 *   - Vector similarity scoring
 */

import Redis from 'ioredis';
import crypto from 'crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

export class SemanticRedisCache {
  constructor(redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379') {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
  }

  async connect() {
    try {
      await this.redis.connect();
      await this.redis.ping();
      console.log('[OK] Redis connected');
      return true;
    } catch (err) {
      console.warn(`[WARN] Redis connection failed: ${err.message}`);
      this.redis = null;
      return false;
    }
  }

  async disconnect() {
    if (this.redis) await this.redis.disconnect();
  }

  /**
   * Embed text vector (768-dim) via Ollama.
   * Cached to avoid repeated computation.
   */
  async embedText(text) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { embedding } = await res.json();
      return embedding; // Float32Array or Array<number>
    } catch (err) {
      throw new Error(`Embedding failed: ${err.message}`);
    }
  }

  /**
   * Hash vector to short string for cache keys.
   * Uses sum of vector elements for fast collision-unlikely hash.
   */
  hashVector(vec) {
    const sum = vec.reduce((a, b) => a + b, 0);
    return crypto
      .createHash('sha256')
      .update(`${sum.toFixed(6)}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Cache embedding in Redis hash.
   * @param {string} hashKey Redis hash name (e.g., "semantic_cache:codebase")
   * @param {string} text Text that was embedded
   * @param {Array<number>} embedding 768-dim vector
   * @param {number} ttlSeconds Cache TTL (default: 3600)
   */
  async cacheEmbedding(hashKey, text, embedding, ttlSeconds = 3600) {
    if (!this.redis) return null;

    try {
      const embeddingKey = this.hashVector(embedding);
      const field = `embedding:${embeddingKey}`;
      const value = JSON.stringify({
        text,
        embedding,
        cached_at: new Date().toISOString(),
      });

      await this.redis.hset(hashKey, field, value);
      await this.redis.expire(hashKey, ttlSeconds);

      return {
        status: 'cached',
        hashKey,
        field,
        embeddingHash: embeddingKey,
        ttl: ttlSeconds,
      };
    } catch (err) {
      console.warn(`[WARN] Cache embedding failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Retrieve cached embedding from Redis.
   * @param {string} hashKey Redis hash name
   * @param {string} embeddingHash Pre-computed embedding hash
   * @returns {object|null} { text, embedding } or null if not found
   */
  async getCachedEmbedding(hashKey, embeddingHash) {
    if (!this.redis) return null;

    try {
      const field = `embedding:${embeddingHash}`;
      const value = await this.redis.hget(hashKey, field);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.warn(`[WARN] Get cached embedding failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Semantic search with cache fallback to Qdrant.
   * @param {string} query Search text
   * @param {string} qdrantCollection Qdrant collection name
   * @param {number} limit Max results
   * @param {string} cacheHashKey Redis hash for caching (e.g., "semantic_cache:search")
   * @returns {object} { source: 'redis'|'qdrant', results, cached: boolean }
   */
  async semanticSearch(query, qdrantCollection = 'codebase_chunks_768', limit = 10, cacheHashKey = 'semantic_cache:search') {
    // Embed query
    const queryEmbedding = await this.embedText(query);
    const embeddingHash = this.hashVector(queryEmbedding);

    // Try Redis cache
    if (this.redis) {
      const cached = await this.getCachedEmbedding(cacheHashKey, embeddingHash);
      if (cached) {
        return {
          source: 'redis_cache',
          results: cached.embedding,
          cached: true,
          embeddingHash,
        };
      }
    }

    // Cache miss → Qdrant ANN
    const qdrantResults = await this.qdrantSearch(queryEmbedding, qdrantCollection, limit);

    // Store in cache + stream
    if (this.redis) {
      await this.cacheEmbedding(cacheHashKey, query, queryEmbedding, 3600);
      await this.publishStreamEvent('semantic:updates', {
        query,
        results_count: qdrantResults.length,
        source: 'qdrant_miss',
        embedding_hash: embeddingHash,
      });
    }

    return {
      source: 'qdrant_fallback',
      results: qdrantResults,
      cached: false,
      embeddingHash,
    };
  }

  /**
   * Qdrant vector search (ANN).
   */
  async qdrantSearch(embedding, collection, limit) {
    try {
      const res = await fetch(
        `${QDRANT_URL}/collections/${collection}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit,
            with_payload: true,
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { result } = await res.json();
      return result || [];
    } catch (err) {
      console.warn(`[WARN] Qdrant search failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Cosine similarity between two vectors.
   */
  cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return magA && magB ? dotProduct / (magA * magB) : 0;
  }

  /**
   * Publish event to Valkey :stream.
   * @param {string} streamKey Stream name (e.g., "semantic:updates")
   * @param {object} data Event fields
   */
  async publishStreamEvent(streamKey, data) {
    if (!this.redis) return null;

    try {
      const fields = [];
      Object.entries(data).forEach(([k, v]) => {
        fields.push(k);
        fields.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
      });

      const messageId = await this.redis.xadd(streamKey, '*', ...fields);
      return { status: 'published', streamKey, messageId };
    } catch (err) {
      console.warn(`[WARN] Stream publish failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Subscribe to stream updates (async generator).
   * @param {string} streamKey Stream name
   * @param {string} startId Stream position ('$' for new, '0-0' for all)
   */
  async *subscribeToStream(streamKey, startId = '$') {
    if (!this.redis) return;

    let lastId = startId;

    while (true) {
      try {
        // XREAD BLOCK: wait for new messages
        const messages = await this.redis.xread('BLOCK', 0, 'STREAMS', streamKey, lastId);

        if (messages && messages.length > 0) {
          const [stream, entries] = messages[0];
          for (const [id, fields] of entries) {
            // Convert fields array to object
            const event = {};
            for (let i = 0; i < fields.length; i += 2) {
              event[fields[i]] = fields[i + 1];
            }
            lastId = id;
            yield { id, event };
          }
        }
      } catch (err) {
        console.error(`[ERROR] Stream subscription failed: ${err.message}`);
        break;
      }
    }
  }

  /**
   * Stream search results as JSONL (one result per line).
   * Useful for large result sets or real-time updates.
   */
  async *streamSearchResults(query, qdrantCollection, limit) {
    const results = await this.semanticSearch(query, qdrantCollection, limit);

    for (const result of results.results) {
      yield JSON.stringify(result) + '\n';
    }
  }
}

// Standalone helper for scripts
export async function semanticCacheMain() {
  const args = process.argv.slice(2);
  const command = args[0];

  const cache = new SemanticRedisCache();
  const connected = await cache.connect();

  if (!connected) {
    console.error('[ERROR] Redis not available');
    process.exit(1);
  }

  try {
    if (command === 'embed') {
      const text = args[1];
      const embedding = await cache.embedText(text);
      console.log(JSON.stringify({ text, embedding }));
    } else if (command === 'cache') {
      const hashKey = args[1];
      const text = args[2];
      const embedding = await cache.embedText(text);
      const result = await cache.cacheEmbedding(hashKey, text, embedding);
      console.log(JSON.stringify(result));
    } else if (command === 'search') {
      const query = args[1];
      const collection = args[2] || 'codebase_chunks_768';
      const limit = parseInt(args[3] || '10', 10);
      const result = await cache.semanticSearch(query, collection, limit);
      console.log(JSON.stringify(result));
    } else {
      console.log('Usage: node redis-semantic.mjs <embed|cache|search> <args...>');
    }
  } finally {
    await cache.disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  semanticCacheMain().catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
}

export default SemanticRedisCache;