# Redis Caching Patterns for Knowledge Base

## Tags
#redis #caching #performance #ttl #invalidation #clustering

## Overview

Redis caching significantly improves knowledge base performance by:
- Reducing embedding API calls (expensive operation)
- Caching Qdrant search results (network latency)
- Storing LLM responses (deterministic queries)
- Enabling distributed caching across services

## Cache Key Strategies

### Embedding Cache Keys

```typescript
// Deterministic embedding cache
function getEmbeddingCacheKey(text: string, model: string): string {
  const hash = crypto.createHash('sha256')
    .update(`${model}:${text}`)
    .digest('hex');
  return `emb:${model}:${hash.substring(0, 16)}`;
}

// Usage
const cacheKey = getEmbeddingCacheKey(query, 'embeddinggemma:latest');
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const embedding = await generateEmbedding(text, model);
await redis.setex(cacheKey, 3600, JSON.stringify(embedding)); // 1 hour TTL
```

### Search Result Cache Keys

```typescript
function getSearchCacheKey(
  collection: string,
  queryHash: string,
  filters?: Record<string, any>
): string {
  const filterHash = filters
    ? crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex').substring(0, 8)
    : 'none';

  return `search:${collection}:${queryHash}:${filterHash}`;
}

// Example
const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
const cacheKey = getSearchCacheKey('knowledge_base', queryHash, { source: 'local' });

const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const results = await qdrant.search(collection, { vector: embedding, filters });
await redis.setex(cacheKey, 1800, JSON.stringify(results)); // 30 min TTL
```

## TTL Strategies

### Time-Based Expiration

```typescript
const TTL_PATTERNS = {
  embeddings: 3600,      // 1 hour - embeddings are deterministic
  search: 1800,          // 30 min - results may change with new data
  llm: 7200,             // 2 hours - LLM responses (deterministic prompts)
  metadata: 300,         // 5 min - frequently changing data
  session: 86400,        // 24 hours - user sessions
  permanent: null        // No expiration (manual invalidation)
};

// Set with TTL
await redis.setex(key, TTL_PATTERNS.embeddings, value);

// Set without expiration
await redis.set(key, value);
```

### Sliding Window Expiration

```typescript
async function getWithSlidingTTL(
  key: string,
  ttl: number
): Promise<string | null> {
  const value = await redis.get(key);

  if (value) {
    // Extend TTL on access
    await redis.expire(key, ttl);
  }

  return value;
}

// Usage: frequently accessed data stays cached longer
const data = await getWithSlidingTTL('hot:data:123', 1800);
```

## Cache Invalidation

### Pattern-Based Invalidation

```typescript
async function invalidatePattern(pattern: string): Promise<number> {
  const keys = await redis.keys(pattern);

  if (keys.length === 0) return 0;

  return await redis.del(...keys);
}

// Invalidate all embeddings for a model
await invalidatePattern('emb:embeddinggemma:latest:*');

// Invalidate all search results for a collection
await invalidatePattern('search:knowledge_base:*');

// Invalidate specific source
await invalidatePattern('search:*:*:source=local:*');
```

### Event-Driven Invalidation

```typescript
// When new knowledge base document is indexed
export async function onDocumentIndexed(docId: string) {
  // Invalidate all search caches (new data available)
  await invalidatePattern('search:knowledge_base:*');

  // Clear stats cache
  await redis.del('stats:knowledge_base');

  // Publish event for distributed invalidation
  await redis.publish('kb:invalidate', JSON.stringify({
    action: 'document_indexed',
    docId,
    timestamp: Date.now()
  }));
}

// When embedding model is updated
export async function onModelUpdated(model: string) {
  await invalidatePattern(`emb:${model}:*`);
}
```

### Dependency-Based Invalidation

```typescript
// Track cache dependencies
async function setCacheWithDeps(
  key: string,
  value: string,
  ttl: number,
  deps: string[]
) {
  await redis.setex(key, ttl, value);

  // Store dependency relationships
  for (const dep of deps) {
    await redis.sadd(`deps:${dep}`, key);
  }
}

// Invalidate with dependencies
async function invalidateWithDeps(depKey: string) {
  // Get all caches dependent on this key
  const dependents = await redis.smembers(`deps:${depKey}`);

  if (dependents.length > 0) {
    await redis.del(...dependents);
  }

  // Clean up dependency tracking
  await redis.del(`deps:${depKey}`);
}

// Example: invalidate all caches dependent on a document
await invalidateWithDeps(`doc:${docId}`);
```

## Cache Layers

### L1: In-Memory Cache (Application)

```typescript
// Simple LRU cache for ultra-hot data
const lruCache = new Map<string, { value: any; expires: number }>();
const MAX_SIZE = 100;

function lruGet(key: string): any | null {
  const item = lruCache.get(key);

  if (!item) return null;
  if (Date.now() > item.expires) {
    lruCache.delete(key);
    return null;
  }

  // Move to end (LRU)
  lruCache.delete(key);
  lruCache.set(key, item);

  return item.value;
}

function lruSet(key: string, value: any, ttl: number) {
  // Evict oldest if at capacity
  if (lruCache.size >= MAX_SIZE) {
    const firstKey = lruCache.keys().next().value;
    lruCache.delete(firstKey);
  }

  lruCache.set(key, {
    value,
    expires: Date.now() + ttl * 1000
  });
}
```

### L2: Redis Cache (Distributed)

```typescript
async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  // L1: Check in-memory
  const l1 = lruGet(key);
  if (l1) return l1;

  // L2: Check Redis
  const l2 = await redis.get(key);
  if (l2) {
    const parsed = JSON.parse(l2);
    lruSet(key, parsed, Math.min(ttl, 60)); // L1 gets shorter TTL
    return parsed;
  }

  // L3: Fetch from source
  const data = await fetcher();

  // Populate both layers
  await redis.setex(key, ttl, JSON.stringify(data));
  lruSet(key, data, Math.min(ttl, 60));

  return data;
}
```

## Compression

### Compress Large Payloads

```typescript
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

async function setCompressed(
  key: string,
  value: any,
  ttl: number
) {
  const json = JSON.stringify(value);
  const compressed = await gzipAsync(Buffer.from(json));

  await redis.setex(`gz:${key}`, ttl, compressed.toString('base64'));
}

async function getCompressed(key: string): Promise<any | null> {
  const compressed = await redis.get(`gz:${key}`);

  if (!compressed) return null;

  const buffer = Buffer.from(compressed, 'base64');
  const decompressed = await gunzipAsync(buffer);

  return JSON.parse(decompressed.toString());
}

// Auto-compress if over threshold
async function setSmartCompressed(
  key: string,
  value: any,
  ttl: number,
  threshold = 1024
) {
  const json = JSON.stringify(value);

  if (json.length > threshold) {
    await setCompressed(key, value, ttl);
  } else {
    await redis.setex(key, ttl, json);
  }
}
```

## Monitoring

### Cache Hit Rate

```typescript
// Track cache metrics
async function recordCacheMetric(type: 'hit' | 'miss', cacheType: string) {
  const key = `metrics:cache:${cacheType}`;
  const field = type === 'hit' ? 'hits' : 'misses';

  await redis.hincrby(key, field, 1);
  await redis.expire(key, 3600); // Reset hourly
}

async function getCacheStats(cacheType: string) {
  const key = `metrics:cache:${cacheType}`;
  const stats = await redis.hgetall(key);

  const hits = parseInt(stats.hits || '0');
  const misses = parseInt(stats.misses || '0');
  const total = hits + misses;

  return {
    hits,
    misses,
    total,
    hitRate: total > 0 ? (hits / total * 100).toFixed(2) : '0.00'
  };
}

// Usage
const embedding = await redis.get(cacheKey);
if (embedding) {
  await recordCacheMetric('hit', 'embeddings');
} else {
  await recordCacheMetric('miss', 'embeddings');
}
```

### Cache Size Monitoring

```typescript
async function getCacheSizeStats(pattern: string) {
  const keys = await redis.keys(pattern);
  let totalBytes = 0;

  for (const key of keys.slice(0, 100)) { // Sample for large sets
    const value = await redis.get(key);
    if (value) {
      totalBytes += Buffer.byteLength(value);
    }
  }

  return {
    keyCount: keys.length,
    sampleSize: Math.min(keys.length, 100),
    estimatedBytes: totalBytes * (keys.length / Math.min(keys.length, 100)),
    estimatedMB: (totalBytes * (keys.length / Math.min(keys.length, 100)) / 1024 / 1024).toFixed(2)
  };
}
```

## Best Practices

1. **Cache Deterministic Operations**: Embeddings, search results with fixed filters
2. **Use Shorter TTLs for Volatile Data**: User sessions, search results
3. **Invalidate Proactively**: Clear caches when source data changes
4. **Monitor Hit Rates**: Adjust TTLs and patterns based on metrics
5. **Compress Large Payloads**: Use gzip for payloads > 1KB
6. **Namespace Keys**: Use prefixes (`emb:`, `search:`, `llm:`) for organization
7. **Handle Failures Gracefully**: Cache unavailable should not break app
8. **Use Pipelining**: Batch Redis operations for better performance
9. **Implement Circuit Breakers**: Prevent cascade failures
10. **Log Cache Operations**: Track invalidations and misses for debugging

## Integration Example

```typescript
// src/lib/server/knowledge-cache.ts
import Redis from 'ioredis';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function searchKnowledgeBase(
  query: string,
  collection: string,
  options?: { topK?: number; filters?: any }
) {
  // Generate cache key
  const embedding = await getCachedEmbedding(query);
  const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
  const cacheKey = getSearchCacheKey(collection, queryHash, options?.filters);

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    await recordCacheMetric('hit', 'search');
    return JSON.parse(cached);
  }

  await recordCacheMetric('miss', 'search');

  // Fetch from Qdrant
  const results = await qdrant.search(collection, {
    vector: embedding,
    limit: options?.topK || 5,
    filter: options?.filters
  });

  // Cache for 30 minutes
  await redis.setex(cacheKey, 1800, JSON.stringify(results));

  return results;
}

async function getCachedEmbedding(text: string): Promise<number[]> {
  const model = 'embeddinggemma:latest';
  const cacheKey = getEmbeddingCacheKey(text, model);

  const cached = await redis.get(cacheKey);
  if (cached) {
    await recordCacheMetric('hit', 'embeddings');
    return JSON.parse(cached);
  }

  await recordCacheMetric('miss', 'embeddings');

  const embedding = await generateEmbedding(text, model);
  await redis.setex(cacheKey, 3600, JSON.stringify(embedding));

  return embedding;
}
```
