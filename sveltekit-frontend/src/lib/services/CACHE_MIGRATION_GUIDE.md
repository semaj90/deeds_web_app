# Cache Service Migration Guide

**Date**: February 7, 2026
**Status**: ✅ Consolidation Complete
**Impact**: 7 caching services → 1 unified service

---

## 📦 What Changed

### Old Caching Services (ARCHIVED)

All these files have been moved to `_archive/caching-services-feb-7-2026/`:

1. `caching-service.ts` (19KB)
2. `caching-service-stub.ts` (971 bytes)
3. `comprehensive-caching-architecture.ts` (42KB)
4. `comprehensive-caching-service.ts` (5.3KB)
5. `enhanced-caching-optimizer.ts` (11KB)
6. `enhanced-caching-revolutionary-bridge.ts` (1.2KB)
7. `enhanced-caching-service.ts` (224 bytes)

### New Unified Service

**Location**: `unified-cache-service.ts`

**Features**:
- ✅ Redis cache (persistent, distributed)
- ✅ NES GPU cache (in-memory, ultra-fast)
- ✅ Embedding cache (specialized for `embeddinggemma:latest`)
- ✅ Hybrid caching strategy
- ✅ Automatic cache invalidation
- ✅ Performance monitoring

---

## 🚀 Migration Examples

### Basic Get/Set Operations

**Old (caching-service.ts)**:
```typescript
import cachingService from '$lib/services/caching-service';

// Get from cache
const value = await cachingService.get('myKey');

// Set to cache
await cachingService.set('myKey', myValue, 3600);
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// Get from cache (tries GPU → Redis)
const value = await cache.get('myKey');

// Set to cache (stores in both GPU + Redis)
await cache.set('myKey', myValue, { ttl: 3600 });
```

---

### Embedding Cache

**Old (enhanced-caching-service.ts)**:
```typescript
import enhancedCaching from '$lib/services/enhanced-caching-service';

const embedding = await enhancedCaching.getEmbedding(text);
await enhancedCaching.setEmbedding(text, embeddingData);
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// Specialized embedding cache with hash-based keys
const embedding = await cache.getEmbedding(text);
await cache.setEmbedding(text, embeddingResponse);
```

---

### GPU-Only Cache (Ultra-Fast)

**Old (comprehensive-caching-architecture.ts)**:
```typescript
import { comprehensiveCaching } from '$lib/services/comprehensive-caching-architecture';

const gpuValue = comprehensiveCaching.getFromGpu('myKey');
comprehensiveCaching.setToGpu('myKey', myValue);
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// GPU-only operations (synchronous, no Redis)
const gpuValue = cache.getNesGpu('myKey');
cache.setNesGpu('myKey', myValue, 300); // 5 min TTL
```

---

### Redis-Only Cache

**Old (caching-service.ts)**:
```typescript
import cachingService from '$lib/services/caching-service';

const redisValue = await cachingService.getFromRedis('myKey');
await cachingService.setToRedis('myKey', myValue, 3600);
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// Redis-only operations
const redisValue = await cache.getRedis('myKey');
await cache.setRedis('myKey', myValue, 3600);
```

---

### Cache Configuration

**Old (comprehensive-caching-architecture.ts)**:
```typescript
import { createCacheService } from '$lib/services/comprehensive-caching-architecture';

const cache = createCacheService({
  redisUrl: 'redis://localhost:6379',
  enableGpu: true,
  maxSize: 5000
});
```

**New (unified-cache-service.ts)**:
```typescript
import { UnifiedCacheService } from '$lib/services/unified-cache-service';

const cache = new UnifiedCacheService({
  redis: {
    url: 'redis://localhost:6379',
    maxRetries: 3,
    retryDelay: 1000
  },
  nesGpu: {
    maxSize: 10000,
    enabled: true
  },
  embedding: {
    ttl: 3600,
    maxDimensions: 768
  },
  strategy: 'hybrid' // 'redis-only' | 'gpu-only' | 'hybrid' | 'fallback'
});
```

---

### Cache Invalidation

**Old (caching-service.ts)**:
```typescript
import cachingService from '$lib/services/caching-service';

await cachingService.invalidate('user:*');
await cachingService.clear();
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// Invalidate by pattern (clears both Redis + GPU)
const deletedCount = await cache.invalidatePattern('user:*');

// Clear all caches
await cache.clear();

// Delete specific key
await cache.delete('myKey');
```

---

### Performance Monitoring

**Old (comprehensive-caching-architecture.ts)**:
```typescript
import { comprehensiveCaching } from '$lib/services/comprehensive-caching-architecture';

const stats = comprehensiveCaching.getStats();
console.log('Hit rate:', stats.hitRate);
```

**New (unified-cache-service.ts)**:
```typescript
import { getCache } from '$lib/services/unified-cache-service';

const cache = getCache();

// Get detailed statistics
const stats = cache.getStats();
console.log('Redis hits:', stats.redis.hits);
console.log('GPU hits:', stats.nesGpu.hits);
console.log('Embedding hits:', stats.embedding.hits);

// Get hit rates
const hitRates = cache.getHitRate();
console.log('Overall hit rate:', hitRates.overall);
console.log('Redis hit rate:', hitRates.redis);
console.log('GPU hit rate:', hitRates.nesGpu);
console.log('Embedding hit rate:', hitRates.embedding);
```

---

## 🔧 Configuration Options

### Cache Strategies

```typescript
import { getCache } from '$lib/services/unified-cache-service';

// Redis-only (persistent, distributed)
const redisCache = getCache({ strategy: 'redis-only' });

// GPU-only (ultra-fast, in-memory)
const gpuCache = getCache({ strategy: 'gpu-only' });

// Hybrid (GPU → Redis fallback) - RECOMMENDED
const hybridCache = getCache({ strategy: 'hybrid' });

// Fallback (Redis → GPU fallback)
const fallbackCache = getCache({ strategy: 'fallback' });
```

### Environment Variables

The unified cache service uses these environment variables:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# Optional overrides
CACHE_STRATEGY=hybrid           # redis-only | gpu-only | hybrid | fallback
NES_GPU_MAX_SIZE=10000         # Max entries in GPU cache
EMBEDDING_CACHE_TTL=3600       # TTL for embeddings (seconds)
```

---

## ✅ Migration Checklist

For each service using old caching:

1. [ ] Replace old import with `import { getCache } from '$lib/services/unified-cache-service'`
2. [ ] Update `get()` calls to use new async API
3. [ ] Update `set()` calls to use new options object: `{ ttl: number }`
4. [ ] Replace embedding-specific calls with `getEmbedding()` / `setEmbedding()`
5. [ ] Update GPU-specific calls to use `getNesGpu()` / `setNesGpu()`
6. [ ] Test that caching still works correctly

---

## 🎯 Benefits

1. **Simpler API**: One service instead of 7
2. **Better Performance**: GPU-first hybrid caching strategy
3. **Specialized Embedding Cache**: Optimized for `embeddinggemma:latest`
4. **Automatic Cleanup**: TTL-based expiration and periodic cleanup
5. **Better Monitoring**: Detailed stats for all cache layers
6. **Type Safety**: Full TypeScript support with generics

---

## 📚 API Reference

### Core Methods

```typescript
class UnifiedCacheService {
  // Hybrid get (tries GPU → Redis)
  async get<T>(key: string, options?: { useGpu?: boolean }): Promise<T | null>

  // Hybrid set (stores in GPU + Redis)
  async set<T>(key: string, value: T, options?: { ttl?: number; useGpu?: boolean }): Promise<void>

  // Delete from all caches
  async delete(key: string): Promise<void>

  // Redis operations
  async getRedis<T>(key: string): Promise<T | null>
  async setRedis<T>(key: string, value: T, ttl?: number): Promise<void>
  async deleteRedis(key: string): Promise<void>

  // NES GPU cache operations (synchronous)
  getNesGpu<T>(key: string): T | null
  setNesGpu<T>(key: string, value: T, ttl?: number): void
  deleteNesGpu(key: string): void

  // Embedding cache operations
  async getEmbedding(text: string): Promise<EmbeddingResponse | null>
  async setEmbedding(text: string, embedding: EmbeddingResponse): Promise<void>

  // Cache invalidation
  async invalidatePattern(pattern: string): Promise<number>
  async clear(): Promise<void>

  // Monitoring
  getStats(): CacheStats
  getHitRate(): { redis: number; nesGpu: number; embedding: number; overall: number }

  // Lifecycle
  async disconnect(): Promise<void>
}
```

### Singleton Access

```typescript
import { getCache } from '$lib/services/unified-cache-service';

// Get singleton instance (recommended)
const cache = getCache();

// Get with custom config (creates new instance)
const cache = getCache({
  strategy: 'hybrid',
  nesGpu: { maxSize: 5000 }
});
```

---

## 🐛 Troubleshooting

### Cache misses on GPU

**Problem**: GPU cache always returns `null`

**Solution**: Check if GPU cache is enabled:
```typescript
const cache = getCache({ nesGpu: { enabled: true } });
```

### Redis connection errors

**Problem**: `Redis connection failed`

**Solution**: Check `REDIS_URL` environment variable:
```bash
export REDIS_URL=redis://localhost:6379
```

### Embedding cache not working

**Problem**: Embeddings not being cached

**Solution**: Use the specialized embedding methods:
```typescript
// ❌ Wrong - uses generic cache
await cache.set('embedding:' + text, embeddingData);

// ✅ Correct - uses specialized embedding cache
await cache.setEmbedding(text, embeddingResponse);
```

---

## 📞 Need Help?

- Read the source: [unified-cache-service.ts](./unified-cache-service.ts)
- Check MEMORY.md: [.claude/projects/c--Users-james-Videos-deeds-web-app/memory/MEMORY.md](../../../../../../.claude/projects/c--Users-james-Videos-deeds-web-app/memory/MEMORY.md)
- Review types: [knowledge-graph.ts](../types/knowledge-graph.ts)

---

**Migration Status**: ✅ Ready for use
**Old Services**: 🗄️ Archived in `_archive/caching-services-feb-7-2026/`
**New Service**: 🚀 Production-ready