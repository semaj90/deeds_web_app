# Cache Invalidation Strategy

## Overview

Comprehensive cache invalidation system to ensure data consistency across Redis + Qdrant + Memory caches.

**Status**: ✅ Implemented (Priority #8)
**Coverage**: Reports, Cases, Evidence, Citations

---

## Architecture

### Multi-Tier Cache Hierarchy

```
L0: Memory Cache (in-process Map, 5min TTL)
  ↓ invalidated synchronously
L1: Redis (distributed, configurable TTL)
  ↓ invalidated via queue OR synchronously
L2: RabbitMQ (cache.invalidate queue)
  ↓ async distributed invalidation
L3: Qdrant (vector index refresh)
  ↓ future: trigger re-indexing
```

### Invalidation Flow

```
CRUD Operation (POST/PATCH/DELETE)
  ↓
Cache Invalidation Service
  ├─ Memory Cache: Synchronous pattern-match deletion
  ├─ Redis: Async (RabbitMQ queue) OR Immediate (for critical ops)
  └─ RabbitMQ: Publishes to cache.invalidation exchange
       ↓
     RabbitMQ Consumer (rabbitmq-manager-fixed.ts)
       ├─ Single key: redis.del(key)
       └─ Pattern: redis.keys(pattern) → redis.del(...keys)
```

---

## API

### Core Service

```typescript
import {
  cacheInvalidation,
  invalidateReportCache,
  invalidateCaseCache,
  invalidateEvidenceCache,
  invalidateCitationCache
} from '$lib/server/cache/invalidation.js';
```

### High-Level Helpers (Recommended)

```typescript
// Reports: Invalidates report + export + preview caches
await invalidateReportCache(reportId, 'report_update', userId);

// Cases: Invalidates case + list + stats + dashboard
await invalidateCaseCache(caseId, 'case_update', userId);

// Evidence: Invalidates evidence + search + case evidence list
await invalidateEvidenceCache(evidenceId, caseId, 'evidence_create', userId);

// Citations: Invalidates citation + tags
await invalidateCitationCache(citationId, 'citation_update', userId);
```

### Low-Level API

```typescript
// Single key invalidation
await cacheInvalidation.invalidateKey('report:123', {
  type: 'manual',
  userId: 'user-id',
  immediate: false // Use RabbitMQ queue (default)
});

// Pattern-based invalidation (e.g., "report:123*")
await cacheInvalidation.invalidatePattern('report:123*', {
  type: 'manual',
  userId: 'user-id',
  immediate: true // Bypass queue, invalidate now
});

// Multiple patterns atomically
await cacheInvalidation.invalidateMultiple([
  'report:123*',
  'reports:case:456*',
  'dashboard:stats*'
], { type: 'report_update', userId: 'user-id' });
```

---

## Cache Key Patterns

All patterns defined in `CACHE_PATTERNS` constant:

| Entity | Pattern Example | Description |
|--------|-----------------|-------------|
| Report | `report:123*` | Single report + metadata |
| Report Export | `report:export:123*` | Export cache (HTML/PDF/JSON) |
| Report Preview | `report:preview:123*` | Data URL previews |
| Report List | `reports:case:456*` | Case-specific report list |
| Case | `case:123*` | Single case + metadata |
| Case List | `cases:list*` | All user cases list |
| Case Stats | `cases:stats*` | Case statistics |
| Evidence | `evidence:123*` | Single evidence + metadata |
| Evidence List | `evidence:case:456*` | Case-specific evidence list |
| Evidence Search | `evidence:search*` | Search result caches |
| Citation | `citation:123*` | Single citation + metadata |
| Citation Tags | `citation:tags:123*` | Citation tag relationships |
| LLM Response | `llm:response:{hash}` | Semantic cache (Priority #7) |
| LLM Semantic | `llm:semantic:*` | All LLM semantic caches |
| Embedding | `embedding:{hash}` | Embedding cache by text hash |
| RAG Search | `rag:search*` | RAG search result caches |
| Analytics | `analytics:*` | All analytics data |
| Dashboard | `dashboard:stats*` | Dashboard statistics |

---

## Integrated Endpoints

### Reports (`/api/reports/`)

| Endpoint | Method | Invalidation |
|----------|--------|--------------|
| `/api/reports` | POST | Report + Case cache |
| `/api/reports` | PATCH | Report cache (per updated) |
| `/api/reports` | DELETE | Report cache (per deleted) |
| `/api/reports/[id]/export` | POST | Export cache |
| `/api/reports/preview/[id]` | POST | Preview cache |

### Cases (`/api/cases/`)

| Endpoint | Method | Invalidation |
|----------|--------|--------------|
| `/api/cases` | POST | Case cache |
| `/api/cases` | PATCH | Case cache (per updated) |
| `/api/cases` | DELETE | Case cache (per archived) |

### Evidence (`/api/evidence/`)

| Endpoint | Method | Invalidation |
|----------|--------|--------------|
| `/api/evidence/upload` | POST | Evidence + Case + Search cache |

### Citations (`/api/citations/`)

| Endpoint | Method | Invalidation |
|----------|--------|--------------|
| `/api/citations/[id]/tags` | POST | Citation cache |
| `/api/citations/[id]/tags` | DELETE | Citation cache |

---

## Invalidation Types

```typescript
type InvalidationType =
  | 'report_create'
  | 'report_update'
  | 'report_delete'
  | 'case_update'
  | 'evidence_create'
  | 'evidence_update'
  | 'evidence_delete'
  | 'person_update'
  | 'citation_update'
  | 'manual';
```

Used for audit logging and debugging. Appears in console logs as:
```
🗑️ Cache invalidated: report:123* (type: report_update)
```

---

## RabbitMQ Integration

### Queue: `cache.invalidate`

**Exchange**: `cache.invalidation` (topic)
**Routing Key**: `cache.invalidate`

**Message Format**:
```json
{
  "type": "report_update",
  "key": "report:123",          // Single key
  "pattern": "report:123*",     // OR pattern (wildcards)
  "userId": "user-uuid",
  "metadata": {}
}
```

**Consumer** (`rabbitmq-manager-fixed.ts`):
```typescript
private async handleCacheInvalidation(msg: AmqpMessage): Promise<void> {
  const data = this.parseMessage(msg);

  if (data.key) {
    await this.redisService.del(data.key);
  } else if (data.pattern) {
    const keys = await this.redisService.keys(data.pattern);
    if (keys?.length) {
      await Promise.all(keys.map(k => this.redisService.del(k)));
    }
  }

  this.channel.ack(msg);
}
```

---

## Performance Characteristics

### Memory Cache Invalidation
- **Latency**: <1ms (synchronous in-process)
- **Scope**: Single process only
- **Method**: RegExp pattern match on Map keys

### Redis Invalidation (Immediate)
- **Latency**: 3-10ms (network + Redis op)
- **Scope**: Global (all servers)
- **Method**: `redis.del(key)` or `redis.keys(pattern) + del(...)`
- **Use case**: Critical operations requiring instant consistency

### Redis Invalidation (Queue)
- **Latency**: 50-500ms (RabbitMQ routing + consumer)
- **Scope**: Global (all servers)
- **Method**: Publish to RabbitMQ → consumer deletes from Redis
- **Use case**: Default for all CRUD operations

### Pattern Matching
- **Cost**: O(N) where N = total Redis keys
- **Optimization**: Use specific patterns (e.g., `report:123*` not `report:*`)
- **Warning**: Avoid `*` (matches all keys) except for admin flush

---

## Testing

### Manual Testing

```bash
# 1. Create a report
curl -X POST http://localhost:5173/api/reports \
  -H "Cookie: session=xxx" \
  -d '{"caseId": "uuid", "title": "Test"}'

# 2. Check Redis cache (should be empty after invalidation)
redis-cli KEYS "report:*"

# 3. Update the report
curl -X PATCH http://localhost:5173/api/reports \
  -H "Cookie: session=xxx" \
  -d '{"ids": ["report-id"], "status": "finalized"}'

# 4. Export the report
curl -X POST http://localhost:5173/api/reports/{id}/export \
  -H "Cookie: session=xxx" \
  -d '{"format": "html"}'
```

### Integration Tests

```typescript
import { invalidateReportCache } from '$lib/server/cache/invalidation';
import { getRedis } from '$lib/server/redis';

test('Report cache invalidation', async () => {
  const redis = getRedis();

  // Seed cache
  await redis.set('report:123', JSON.stringify({ title: 'Test' }));
  await redis.set('report:export:123:html', 'cached-export');

  // Invalidate
  await invalidateReportCache('123', 'manual');

  // Verify
  const report = await redis.get('report:123');
  const exportCache = await redis.get('report:export:123:html');

  expect(report).toBeNull();
  expect(exportCache).toBeNull();
});
```

---

## Monitoring

### Cache Hit/Miss Metrics

**Future**: Add to `/api/health/cache-stats`

```typescript
{
  "memory": {
    "size": 1234,
    "hits": 5678,
    "misses": 123,
    "hitRate": 0.978
  },
  "redis": {
    "totalKeys": 45678,
    "invalidationsToday": 234
  },
  "qdrant": {
    "collections": 6,
    "totalVectors": 123456
  }
}
```

### RabbitMQ Queue Depth

```bash
# Check queue backlog
rabbitmqctl list_queues name messages consumers

# Expected output:
# cache.invalidate    0    1
```

---

## Future Enhancements

### Phase 2: Qdrant Vector Invalidation

```typescript
// When evidence is deleted, remove from Qdrant
await qdrant.deletePoints({
  collection: 'evidence_items',
  ids: [evidenceId]
});
```

### Phase 3: Cache Warming

```typescript
// Pre-populate hot caches on server startup
await warmCache({
  patterns: ['dashboard:stats*', 'cases:list*'],
  ttl: 3600
});
```

### Phase 4: Smart Invalidation

```typescript
// Invalidate only if data actually changed (diff-based)
if (hasChanges(oldReport, newReport)) {
  await invalidateReportCache(reportId, 'report_update');
}
```

### Phase 5: Cache Dependency Graph

```typescript
// Invalidate dependent caches automatically
CACHE_DEPENDENCIES = {
  'report': ['case', 'dashboard:stats'],
  'evidence': ['case', 'evidence:search', 'rag:search']
};
```

---

## Troubleshooting

### Problem: Cache not invalidating

**Check**:
1. Is RabbitMQ consumer running? `rabbitmqctl list_consumers`
2. Are messages published? Check logs for `🗑️ Cache invalidation`
3. Is Redis connection healthy? `redis-cli PING`

**Solution**:
```bash
# Restart RabbitMQ consumers
docker restart deeds-rabbitmq

# Manually flush cache
redis-cli FLUSHDB
```

### Problem: High Redis memory usage

**Check**:
```bash
redis-cli INFO memory
```

**Solution**:
- Reduce TTLs in `cache.ts` (default 5min → 2min)
- Implement LRU eviction: `redis-cli CONFIG SET maxmemory-policy allkeys-lru`
- Clear unused patterns: `redis-cli KEYS "old-pattern:*" | xargs redis-cli DEL`

### Problem: Slow pattern invalidation

**Cause**: `redis.keys(pattern)` is O(N) and blocks Redis

**Solution**:
- Use more specific patterns (e.g., `report:123*` not `report:*`)
- Implement SCAN-based iteration for large pattern sets
- Use Redis keyspace notifications (subscribe to `__keyevent@0__:del`)

---

## References

- [Redis DEL](https://redis.io/commands/del/)
- [Redis KEYS](https://redis.io/commands/keys/) (blocking, use with caution)
- [Redis SCAN](https://redis.io/commands/scan/) (non-blocking alternative)
- [RabbitMQ Topic Exchange](https://www.rabbitmq.com/tutorials/tutorial-five-python.html)
- [Qdrant Delete Points](https://qdrant.tech/documentation/concepts/points/#delete-points)
- [Cache Invalidation Patterns](https://martinfowler.com/bliki/TwoHardThings.html)

---

## Implementation Checklist

- [x] Cache invalidation service (`invalidation.ts`)
- [x] RabbitMQ `cache.invalidate` queue consumer
- [x] Report CRUD endpoints (POST/PATCH/DELETE)
- [x] Report export endpoint (POST)
- [x] Report preview endpoint (POST)
- [x] Case CRUD endpoints (POST/PATCH/DELETE)
- [x] Evidence upload endpoint (POST)
- [x] Citation tags endpoints (POST/DELETE)
- [x] Cache key pattern definitions
- [x] High-level helper functions
- [x] Audit logging integration
- [ ] Qdrant vector invalidation (Phase 2)
- [ ] Cache warming on startup (Phase 3)
- [ ] Smart diff-based invalidation (Phase 4)
- [ ] Dependency graph auto-invalidation (Phase 5)
- [ ] Cache metrics endpoint `/api/health/cache-stats`

---

**Last Updated**: March 2, 2026
**Session**: 93r28c+
**Status**: ✅ Production Ready
