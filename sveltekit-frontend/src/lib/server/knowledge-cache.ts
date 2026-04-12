/**
 * Redis caching layer for knowledge base queries
 */
import type { Redis } from 'ioredis';
import type { ScoredPoint } from '$lib/types/qdrant';
import crypto from 'crypto';
import { getRedis } from '$lib/server/redis.js';

const TTL = {
    embeddings: 3600, // 1 hour
    search: 1800, // 30 minutes
    stats: 300, // 5 minutes
    health: 60 // 1 minute
};

// Cache key generators
function getEmbeddingCacheKey(text: string, model: string = 'text-embedding-3-small'): string {
    const hash = crypto.createHash('sha256').update(`${model}:${text}`).digest('hex');
    return `emb:${model}:${hash.substring(0, 16)}`;
}

function getSearchCacheKey(collection: string, queryHash: string, filters?: Record<string, unknown>): string {
    const filterHash = filters
        ? crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex').substring(0, 8)
        : 'none';

    return `search:${collection}:${queryHash}:${filterHash}`;
}

async function recordCacheMetric(type: 'hit' | 'miss', cacheType: string): Promise<void> {
    const key = `metrics:cache:${cacheType}`;
    const field = type === 'hit' ? 'hits' : 'misses';
    try {
        const redis: Redis = getRedis();
        const pipeline = redis.pipeline();
        pipeline.hincrby(key, field, 1);
        pipeline.expire(key, 3600);
        await pipeline.exec();
    } catch {
        // ignore
    }
}

export async function getCacheStats(cacheType: string) {
    try {
        const key = `metrics:cache:${cacheType}`;
        const redis: Redis = getRedis();
        const stats = await redis.hgetall(key);
        const hits = parseInt(stats?.hits ?? '0');
        const misses = parseInt(stats?.misses ?? '0');
        const total = hits + misses;
        return {
            hits,
            misses,
            total,
            hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00'
        };
    } catch {
        return { hits: 0, misses: 0, total: 0, hitRate: '0.00' };
    }
}

export async function getAllCacheStats() {
    try {
        const redis: Redis = getRedis();
        const pipeline = redis.pipeline();
        pipeline.hgetall('metrics:cache:embeddings');
        pipeline.hgetall('metrics:cache:search');
        const results = await pipeline.exec();
        const parse = (r: [Error | null, unknown] | undefined) => {
            const stats = (r && !r[0] ? r[1] : null) as Record<string, string> | null;
            const hits = parseInt(stats?.hits ?? '0');
            const misses = parseInt(stats?.misses ?? '0');
            const total = hits + misses;
            return { hits, misses, total, hitRate: total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00' };
        };
        return { embeddings: parse(results?.[0]), search: parse(results?.[1]) };
    } catch {
        const empty = { hits: 0, misses: 0, total: 0, hitRate: '0.00' };
        return { embeddings: empty, search: empty };
    }
}

// Embedding cache
export async function getCachedEmbedding(text: string, model: string): Promise<number[] | null> {
    const cacheKey = getEmbeddingCacheKey(text, model);
    try {
        const redis: Redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
            await recordCacheMetric('hit', 'embeddings');
            return JSON.parse(cached);
        }
        await recordCacheMetric('miss', 'embeddings');
        return null;
    } catch {
        await recordCacheMetric('miss', 'embeddings');
        return null;
    }
}

export async function setCachedEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
    const cacheKey = getEmbeddingCacheKey(text, model);
    try {
        const redis: Redis = getRedis();
        await redis.setex(cacheKey, TTL.embeddings, JSON.stringify(embedding));
    } catch (error) {
        console.error('Failed to cache embedding', error);
    }
}

// Search result cache
export async function getCachedSearchResults(
  collection: string,
  query: string,
  filters?: Record<string, unknown>
): Promise<ScoredPoint[] | null> {
  const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
  const cacheKey = getSearchCacheKey(collection, queryHash, filters);

  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      await recordCacheMetric('hit', 'search');
      return JSON.parse(cached);
    }
    await recordCacheMetric('miss', 'search');
    return null;
  } catch {
    await recordCacheMetric('miss', 'search');
    return null;
  }
}

export async function setCachedSearchResults(
  collection: string,
  query: string,
  results: ScoredPoint[],
  filters?: Record<string, unknown>
): Promise<void> {
  const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
  const cacheKey = getSearchCacheKey(collection, queryHash, filters);
  try {
    const redis = getRedis();
    await redis.setex(cacheKey, TTL.search, JSON.stringify(results));
  } catch (error) {
    console.error('Failed to cache search results', error);
  }
}

// Invalidation
export async function invalidatePattern(pattern: string): Promise<number> {
    try {
        const redis: Redis = getRedis();
        const keys = await redis.keys(pattern);
        if (keys.length === 0) return 0;
        return await redis.del(...keys);
    } catch {
        return 0;
    }
}

export async function invalidateAllSearchCaches() {
    return await invalidatePattern('search:*');
}

export async function invalidateCollectionCache(collection: string) {
    return await invalidatePattern(`search:${collection}:*`);
}

export async function invalidateModelCache(model: string) {
    return await invalidatePattern(`emb:${model}:*`);
}

// Event driven
export async function onDocumentIndexed(docId: string): Promise<void> {
    console.log(`📝 Document indexed: ${docId}`);
    try {
      await invalidateAllSearchCaches();
      const redis = getRedis();
      await redis.del('stats:knowledge_base');
      await redis.publish(
        'kb:invalidate',
        JSON.stringify({ action: 'document_indexed', timestamp: Date.now() })
      );
    } catch (error) {
      console.error('[knowledge-cache] onDocumentIndexed cache invalidation failed:', error);
    }
}

export async function onModelUpdated(model: string): Promise<void> {
    await invalidateModelCache(model);
}

// Health config
export async function getCacheHealth() {
    try {
        const redis: Redis = getRedis();
        const ping = await redis.ping();
        const info = await redis.info('memory');
        const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
        const maxMemoryMatch = info.match(/maxmemory_human:(\S+)/);
        const stats = await getAllCacheStats();

        return {
            connected: ping === 'PONG',
            usedMemory: usedMemoryMatch ? usedMemoryMatch[1] : 'unknown',
            maxMemory: maxMemoryMatch ? maxMemoryMatch[1] : 'unlimited',
            stats
        };
    } catch (error) {
        return {
            connected: error instanceof Error ? error.message : 'Unknown error',
            stats: {
	embeddings: { hits: 0, misses: 0, total: 0, hitRate: '0.00' },
	search: {
	hits: 0, misses: 0, total: 0, hitRate: '0.00' }
            }
        };
    }
}

export async function closeCache(): Promise<void> {
    const redis = getRedis();
    await redis.quit();
}
