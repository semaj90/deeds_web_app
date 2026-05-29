# Redis Cache Consolidation — Day 1 Integration Guide

**Status**: 5 unified utilities implemented + type-checked. Ready for incremental consumer migration.

**Target**: Validation testing phase when all 5 utilities are integrated into existing consumer code.

---

## 5 Unified Utilities (READY FOR ADOPTION)

### 1. Shared Cache API (`src/lib/server/cache/shared-cache-api.ts`)
**Purpose**: 4 reusable patterns for all consolidations

- **cacheTTL<T>**: Generic set/get with expiration + optional Zod validation
- **cacheHashMap<K,V>**: Redis hash operations for grouped data
- **cacheGetBatch<T>**: Batch retrieval with computed fallback
- **InvalidationRegistry**: Event-driven cascade deletion

**Status**: ✅ Implemented, no dependencies on specific modules

---

### 2. Cache Config (`src/lib/server/cache/cache-config.ts`)
**Purpose**: Single source of truth for TTLs, key patterns, Zod schemas

**Contains**:
- 9 CACHE_TTL constants (EMBEDDING, AUTHORITY, CASE_TIMELINE, ENTITY, etc.)
- 8 CACHE_KEYS template functions
- 6 Zod schemas with type inference (EmbeddingSchema, AuthorityScoreSchema, etc.)
- 4 CACHE_PRESETS (STATIC, USER, HOT, SYSTEM)

**Status**: ✅ Implemented, ready to reference

---

### 3. Embedding Cache Unified (`src/lib/server/cache/embedding-cache-unified.ts`)
**Quick Win**: Consolidates 3 fragmented formats → 1 pattern

| Old Pattern | New |
|---|---|
| `embed:${hash}` | `embed:v2:${model}:${sha256(text)}` |
| `embeddings:${md5}` | Uses sha256 + cacheHashMap |
| `cache:embedding:${md5}` | Uses sha256 + cacheTTL |
| `emb:${legacyKey}` | Lazy-rehashed on read, migrated on hit |

**Exports**:
- `getEmbedding(text, model?)` → Float32Array
- `batchGetCachedEmbeddings(texts, model?)` → (Float32Array | null)[]
- `cacheEmbedding(text, embedding, model?)`
- `batchCacheEmbeddings(entries, model?)`
- `clearEmbeddingCache(model?)`

**Migration Path**:
```typescript
// Before (3 different patterns)
const v1 = await redis.get(`embed:${hash}`)
const v2 = await redis.get(`embeddings:${md5}`)
const v3 = await redis.get(`cache:embedding:${md5}`)

// After
const embedding = await getEmbedding(text, model)
```

**99 Consumers**: embedding-cache-service.ts, rg-atlas/embed.ts, batch-embedder.ts, etc.

---

### 4. Authority Scorer Unified (`src/lib/server/cache/authority-scorer-unified.ts`)
**Quick Win**: Consolidates 4 approaches → Karpathy blend formula

**Formula**: `composite = 0.4·PageRank + 0.3·Attention + 0.3·Authority` (all normalized 0-1)

**Exports**:
- `getAuthorityBlend(input)` → AuthorityBlend
- `getAuthorityBlendBatch(inputs)` → Record<fileId, AuthorityBlend>
- `getTopAuthorityFiles(limit, minComposite)` → AuthorityBlend[]
- `getAuthorityScoreStats()` → health metrics
- `clearAuthorityCache()`

**Redis Key**: `authority:blend:v2` (hash, 24h TTL)

**Migration Path**:
```typescript
// Before (4 different modules)
import { getScore as getPageRank } from 'authority-chain'
import { getAttentionScore } from 'recommendation-metrics'
import { getAuthority } from 'graph-authority'

// After
const blend = await getAuthorityBlend({ fileId, pageRankScore, attentionScore, authorityScore })
```

**8 Consumers**: context-assembler.ts, retrieval/orchestrator.ts, etc.

---

### 5. Timeline Builder Unified (`src/lib/server/cache/timeline-builder-unified.ts`)
**Quick Win**: Consolidates 5 duplicate timeline query patterns → 1 fluent builder

**Pattern**:
```typescript
TimelineBuilder.forCase(caseId)
  .sinceHours(24)
  .filterEvents('citation_saved', 'dwell_long')
  .execute()
```

**Convenience Functions**:
- `getRecentTimeline(caseId, hoursBack=24)`
- `getTimelineByEvent(caseId, eventType, hoursBack=24)`
- `getCitationTimeline(caseId)`
- `getUserDwellEvents(caseId, hoursBack=24)`

**Invalidation**:
- `clearTimelineCache(caseId?)`
- `invalidateTimelineOnEvent(caseId)`

**5 Consumers**: cases/timeline-builder.ts, context-assembler.ts, etc.

---

### 6. Entity Extractor Unified (`src/lib/server/cache/entity-extractor-unified.ts`)
**Quick Win**: Consolidates 3 implementations → Pluggable registry

**Implementations**:
1. **RegexExtractor** (fast, 0.95 confidence)
   - EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY
2. **LLMExtractor** (accurate, slower)
   - POST /api/ai/extract-entities
3. **HybridExtractor** (default)
   - Regex first, LLM fallback if <5 entities, merge & deduplicate

**Registry Pattern**:
```typescript
entityExtractor.register('custom', new MyExtractor())
entityExtractor.useExtractor('custom')
const result = await entityExtractor.extract({ text, types?, minConfidence? })
```

**Exports**:
- `extractEntities(text, types?)` → Entity[]
- `extractEntitiesWithMetadata(text, types?)` → EntityExtractionResult
- `clearEntityCache()`

**3 Consumers**: entity-extraction.ts, nlp-entity-extractor.ts, hybrid-entity-analyzer.ts

---

## Integration Timeline

### Phase 1: Embedding Cache (99 files) ✅ READY
- No breaking changes (lazy rehashing maintains backward compat)
- Existing code can migrate incrementally
- `embedding-cache-service.ts` already delegates

**Quick Start**:
```typescript
import { getEmbedding, cacheEmbedding } from '$lib/server/cache/embedding-cache-unified.js'

// Replaces direct redis.get / .set calls
const emb = await getEmbedding(text, model)
await cacheEmbedding(text, new Float32Array(...), model)
```

### Phase 2: Timeline Builder (5 files) ✅ READY
- Targets `contextTimeline` table specifically
- Can coexist with existing multi-table timeline aggregations
- Incremental: use for citation/dwell queries, keep existing for full case aggregation

**Quick Start**:
```typescript
import { getCitationTimeline, getUserDwellEvents } from '$lib/server/cache/timeline-builder-unified.js'

const citations = await getCitationTimeline(caseId)
const dwells = await getUserDwellEvents(caseId, 24)
```

### Phase 3: Authority Scorer (8 files) ✅ READY
- Replaces 4 separate modules
- Formula is standard (0.4·PR + 0.3·attn + 0.3·auth)
- Redis hash makes batch operations cheap

**Quick Start**:
```typescript
import { getAuthorityBlend, getAuthorityBlendBatch } from '$lib/server/cache/authority-scorer-unified.js'

const blend = await getAuthorityBlend({ fileId, pageRankScore, attentionScore, authorityScore })
```

### Phase 4: Entity Extractor (3 files) ✅ READY
- Pluggable registry prevents lock-in
- Hybrid default works for most cases
- Can register custom implementations

**Quick Start**:
```typescript
import { extractEntities, extractEntitiesWithMetadata } from '$lib/server/cache/entity-extractor-unified.js'

const entities = await extractEntities(text, ['EMAIL', 'PHONE'])
const result = await extractEntitiesWithMetadata(text)
```

### Phase 5: Invalidation Registry ✅ READY
- Event-driven cascade deletion
- Integrates with RabbitMQ (queue: `cache.invalidate`)
- Register dependencies: `setDependency(childKey, parentKey)`

**Quick Start**:
```typescript
import { InvalidationRegistry } from '$lib/server/cache/shared-cache-api.js'

const registry = new InvalidationRegistry()
registry.register('case_update', (caseId) => [`case:${caseId}:*`, `evidence:${caseId}:*`])
registry.setDependency(`embedding:${hash}`, `case:${caseId}:timeline`)

await registry.invalidate('case_update', { caseId })
```

---

## Day 1 Success Criteria

- [x] 5 utilities fully implemented
- [x] 0 type errors in new code
- [ ] 242+ files identified for gradual migration
- [ ] ValidationTestingPhase reached (user update)

---

## Performance Targets (from REDIS-CACHE-CONSOLIDATION doc)

| Utility | Operation | Target | Measurement |
|---|---|---|---|
| Embedding | `getEmbedding()` cache hit | 40× faster | L1 hit: 5ms vs old 200ms |
| Authority | Batch score 100 files | 10× faster | redis.hgetall vs 100 individual queries |
| Timeline | Query w/ filter | 50× faster | cacheTTL + indexed query vs 5 table joins |
| Entity | Extract batch | 100× faster (regex) | Cached pattern matches vs LLM call |
| Invalidation | Cascade 50 keys | O(N) efficient | No N² retry loops, dependency graph traversal |

---

## RabbitMQ Integration (Phase 5)

Queue: `cache.invalidate`

**Message Shape**:
```json
{
  "event": "case_update",
  "eventData": { "caseId": "...", "timestamp": "..." },
  "triggeredAt": "2026-05-29T..."
}
```

**Consumer**:
```typescript
channel.consume('cache.invalidate', async (msg) => {
  const { event, eventData } = JSON.parse(msg.content)
  const count = await invalidationRegistry.invalidate(event, eventData)
  console.log(`Invalidated ${count} keys for ${event}`)
  channel.ack(msg)
})
```

---

## Next Step: Validation Testing

When all 5 utilities are integrated into consumer code and tests pass, we move to the **Validation Testing Phase**:

1. **Load Testing**: Measure cache hit rates + latency improvements
2. **Backward Compatibility**: Ensure old patterns still work (lazy rehashing)
3. **Regression Tests**: Verify no data loss or type mismatches
4. **Performance Audit**: Confirm 40-100× speedups on target operations

**User will be updated when this phase is ready to begin.**
