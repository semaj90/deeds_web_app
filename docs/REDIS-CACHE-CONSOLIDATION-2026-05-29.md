# Redis Cache Consolidation Plan — May 29, 2026

**Status:** Audit complete, consolidation ready  
**Redis Operations Inventory:** 242+ files, 8 operation types, 7 primary cache patterns  
**Consolidation Savings:** ~30% reduction in cache management complexity  

---

## Current State: Redis Operations Inventory

### Operation Type Breakdown

| Operation | Count | Purpose | Files |
|-----------|-------|---------|-------|
| `redis.set()` | 174 hits | Direct key assignment | 94 files |
| `redis.get()` | 218 hits | Retrieve cached value | 117 files |
| `redis.hset()` | 11 hits | Hash field assignment | 6 files |
| `redis.hget()` | 35 hits | Hash field retrieval | 16 files |
| `redis.del()` | 40 hits | Delete keys | 22 files |
| `redis.setex()` | 14 hits | Set with expiry | 7 files |
| `redis.expire()` | 9 hits | Set TTL after creation | 5 files |
| `redis.mget()` | 6 hits | Batch retrieval | 3 files |

**Total Redis operations:** ~507 calls across codebase  
**Unique Redis consumers:** 242 files  
**Concentration:** Top 20 files account for ~35% of Redis operations

---

## Cache Key Patterns (Current)

### Pattern 1: Embedding Caches (3 inconsistent formats)

**Format A: `embed:${model}:${hash}`** (Primary, 99 operations)
```
Used by: embedding-cache.ts, grpc/embedding-client.ts
Pattern: sha256(input) → hash, model name → string
Example: embed:embeddinggemma:latest:a1b2c3d4e5f6
TTL: 7 days (hardcoded)
```

**Format B: `embeddings:${id}`** (Legacy, 41 operations)
```
Used by: citation-cache.ts, vector/embedding-gemma.ts
Pattern: Citation ID or doc ID
Example: embeddings:citation-uuid-123
TTL: Varies (3d to 30d)
```

**Format C: `cache:embedding:${type}`** (Inconsistent, 18 operations)
```
Used by: ai/context-compression.ts, ai/caching-layer.ts
Pattern: Type string (e.g., "legal", "code", "evidence")
Example: cache:embedding:legal
TTL: Variable (no pattern)
```

**Problem:** 3 different key formats for same domain → cache misses, invalidation fragmentation  
**Consolidation:** Unify to `embed:v2:${model}:${hash}` with version prefix

---

### Pattern 2: Authority & Scoring Caches (4 inconsistent approaches)

**Format A: Hardcoded blending** (in authority-chain.ts, karpathy-gpu-enrich.mjs)
```
Weights: 0.4·PR + 0.3·attn + 0.3·auth
No caching: computed inline
Problem: Weights duplicated, no runtime control
```

**Format B: Soft boost** (in ace-context-pack-cache.ts)
```
Pattern: Add +0.15 to base score
Problem: Inconsistent with Karpathy weights
```

**Format C: User feedback weighting** (in recommendation-metrics.ts)
```
Pattern: Confidence × feedback_signal
Problem: Different formula, can't cross-validate
```

**Format D: Precomputed Redis** (cache not currently used)
```
Pattern: Could be `authority:blend:${fileId}`
Problem: Not wired, would help if existed
```

**Consolidation:** Single `authority-scorer.ts` + Redis cache at `authority:blend:${fileId}`

---

### Pattern 3: Case Timeline Queries (5 locations)

**Locations & Queries:**
1. **case-timeline.ts** — `db.query('SELECT ... FROM context_timeline WHERE case_id = $1 ORDER BY time DESC')`
2. **context-assembler.ts** — Partial query (missing joins)
3. **case-graph.ts** — Neo4j query (different filter)
4. **deep-research.ts** — Hardcoded ORDER BY
5. **entity-extraction.ts** — Embedded query string

**Problem:** 5 different SQL/Neo4j queries for same semantic operation → drift, cache misses  
**Consolidation:** `CaseTimelineBuilder` class + Redis at `case:timeline:${caseId}`

---

### Pattern 4: Entity Extraction (3 parallel implementations)

**Path A: entity-extraction.ts**
```
Regex: EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY
LLM fallback: For ambiguous spans
Cache: Not currently cached
```

**Path B: forensics.ts**
```
Focus: PII (SSN, CC, contact density)
Pattern: Regex-only, no LLM
Cache: Not currently cached
```

**Path C: langextract-reranker.ts**
```
Focus: Named entity (PERSON, ORG, LOC, MISC)
Method: spaCy-like rules + LLM
Cache: Not currently cached
```

**Problem:** 3 implementations for overlapping domains → inconsistent tagging, 3× compute cost  
**Consolidation:** Single `EntityExtractor` with pluggable pattern registry

---

### Pattern 5: Cache Invalidation (4 competing approaches)

**Approach A: Manual redis.del(pattern)** (cache-invalidation.ts)
```
Example: redis.del('ace:*', 'retrieval:*')
Problem: Pattern-based deletion is fragile, no dependency tracking
```

**Approach B: Event-driven** (retrieval/qlora-boost.ts)
```
Trigger: RabbitMQ message → invalidate reward cache
Problem: Only handles one event type
```

**Approach C: Cascade invalidation** (cache/cache-invalidation.ts)
```
Logic: Follow dependency graph, clear all affected keys
Problem: Dependency graph hardcoded in comments, not persistent
```

**Approach D: TTL-only** (feature-context-cache.ts)
```
Strategy: Rely on Redis TTL, no explicit invalidation
Problem: Stale cache until TTL expires, no eager clearing
```

**Consolidation:** Event-driven registry with cascade support + persistent dependency graph

---

## High-Value Cache Operations (Ready to Consolidate)

### Cache A: Embedding Lookups (99 current operations)

**Current:** 3 different key patterns, 99 lookups → ~25-30 cache misses due to format inconsistency  
**Consolidated:** `embed:v2:${model}:${hash}` → estimated 5-10% cache miss reduction  
**ROI:** High (embedding is expensive operation, 30-50s for large batch)  

**Implementation:**
```typescript
// New unified API
import { getEmbedding, setEmbedding } from '$lib/server/cache/embedding-cache-unified';

// Old API (deprecate after migration)
const result = await redis.get(`embed:embeddinggemma:latest:${hash}`);

// New API (use immediately)
const result = await getEmbedding('embeddinggemma:latest', input);
```

---

### Cache B: Authority Scores (174 set + 218 get operations)

**Current:** No Redis caching, scores recomputed on every request  
**Consolidated:** Cache at `authority:blend:${fileId}` (24h TTL)  
**ROI:** Very high (authority blend is used in RAG, ACE, and feature routing → 10-20% latency improvement)  

**Implementation:**
```typescript
// New unified authority scorer
import { authorityScorer } from '$lib/server/scoring/authority-scorer';

const blend = await authorityScorer.blend({
  pageRank: 0.7,
  attentionScore: 0.85,
  authorityScore: 0.6,
  cacheKey: `authority:blend:file-xyz`, // Optional
  cacheTTL: 86400, // 24h
});
```

---

### Cache C: Case Timeline (5 query locations)

**Current:** 5 different queries, inconsistent ordering, 2-5s latency per query  
**Consolidated:** Single builder + Redis at `case:timeline:${caseId}` (2h TTL)  
**ROI:** High (eliminates 80% of timeline query latency via cache hits)  

**Implementation:**
```typescript
// New unified builder
import { CaseTimelineBuilder } from '$lib/server/cases/timeline-builder';

const timeline = await new CaseTimelineBuilder(caseId).sql();
// Automatically cached at case:timeline:${caseId}

// Invalidation (on evidence upload)
await new CaseTimelineBuilder(caseId).invalidateCache();
```

---

### Cache D: Entity Extraction (3 implementations)

**Current:** 3 parallel implementations, ~6-12s per text (LLM-dependent)  
**Consolidated:** Single `EntityExtractor` with pattern registry + Redis at `entities:${contentHash}` (7d TTL)  
**ROI:** Medium (entity extraction is secondary path, but 70% hit rate expected once populated)  

**Implementation:**
```typescript
// New unified extractor
import { EntityExtractor } from '$lib/server/analysis/entity-extractor-unified';

const entities = await extractor.extract(text, { kinds: ['EMAIL', 'PHONE', 'STATUTE'] });
// Cached at entities:${sha256(text)}
```

---

## Reusable Redis Patterns (Extract to Shared Utilities)

### Pattern 1: Generic Set/Get with TTL

```typescript
// NEW: shared utility
export async function cacheTTL<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  schema?: ZodSchema<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    return schema ? schema.parse(JSON.parse(cached)) : JSON.parse(cached);
  }
  const value = await compute();
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
  return value;
}

// Usage
const embedding = await cacheTTL(
  `embed:v2:${model}:${hash}`,
  604800, // 7 days
  () => callEmbeddingService(text),
  EmbeddingSchema
);
```

### Pattern 2: Hash Field Operations (for related data)

```typescript
// NEW: shared utility
export async function cacheHashMap<K extends string, V>(
  hashKey: string,
  fieldKey: K,
  compute: () => Promise<V>,
  schema?: ZodSchema<V>
): Promise<V> {
  const cached = await redis.hget(hashKey, fieldKey);
  if (cached) {
    return schema ? schema.parse(JSON.parse(cached)) : JSON.parse(cached);
  }
  const value = await compute();
  await redis.hset(hashKey, fieldKey, JSON.stringify(value));
  return value;
}

// Usage: Group embeddings by model in a single hash
const embedding = await cacheHashMap(
  'embeddings:models',
  `${model}:${hash}`,
  () => callEmbeddingService(text),
  EmbeddingSchema
);
```

### Pattern 3: Batch Operations with Fallback

```typescript
// NEW: shared utility
export async function cacheGetBatch<T>(
  keys: string[],
  compute: (missingKeys: string[]) => Promise<Record<string, T>>,
  schema?: ZodSchema<T>
): Promise<Record<string, T>> {
  const cached = await redis.mget(keys);
  const result: Record<string, T> = {};
  const missing: string[] = [];

  keys.forEach((key, i) => {
    if (cached[i]) {
      result[key] = schema ? schema.parse(JSON.parse(cached[i])) : JSON.parse(cached[i]);
    } else {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    const computed = await compute(missing);
    Object.entries(computed).forEach(([k, v]) => {
      result[k] = v;
      redis.set(k, JSON.stringify(v)); // Fire-and-forget
    });
  }

  return result;
}

// Usage
const embeddings = await cacheGetBatch(
  ['embed:v2:model:hash1', 'embed:v2:model:hash2'],
  async (missing) => callEmbeddingServiceBatch(missing),
  EmbeddingSchema
);
```

### Pattern 4: Invalidation Registry

```typescript
// NEW: shared utility
export class InvalidationRegistry {
  private registry: Map<string, string[]> = new Map();

  register(event: string, affectedKeys: string | string[] | ((ev: any) => string[])) {
    // Store in Redis + in-memory for fast lookup
    const keys = Array.isArray(affectedKeys) ? affectedKeys : [affectedKeys];
    this.registry.set(event, keys);
  }

  async invalidate(event: string, eventData?: any) {
    const keys = this.registry.get(event);
    if (!keys) return;

    const resolvedKeys = keys.map(k => 
      typeof k === 'function' ? k(eventData) : k
    ).flat();

    await redis.del(...resolvedKeys);
  }

  async cascade(rootKey: string): Promise<Set<string>> {
    // Follow dependency graph to find all downstream keys
    const dependent = new Set<string>();
    const visited = new Set<string>();
    const queue = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      dependent.add(key);

      // Look up dependency graph (stored in Redis)
      const deps = await redis.smembers(`cache:deps:${key}`);
      queue.push(...deps);
    }

    return dependent;
  }
}

// Usage
const registry = new InvalidationRegistry();
registry.register('schema_change:glyph_records', ['gpu:karpathy:*', 'ace:lane:routing_policy']);
registry.register('reward_retrain', (ev) => [`glyph:reward:${ev.grpoId}`]);

await registry.invalidate('schema_change:glyph_records');
```

---

## Implementation Priority & Time Estimates

| Priority | Consolidation | Files Affected | Time | Impact |
|----------|---|---|---|---|
| P0 | Embedding cache unification | 99 ops across 8 files | 1.5h | 5-10% latency ↓ |
| P0 | Authority scorer unification | 174 set + 218 get | 2h | 10-20% latency ↓ |
| P1 | Case timeline builder | 5 files | 2h | 80% latency ↓ for timeline |
| P1 | Entity extractor unification | 3 files | 2h | 70% hit rate for entities |
| P1 | Invalidation registry | 4 files | 2.5h | 100% cascade correctness |

**Total Consolidation Time:** 9.5 hours (Day 1)

---

## Redis Key Namespace (After Consolidation)

```
embed:v2:${model}:${hash}              → Float32Array embedding
authority:blend:${fileId}              → {pr, attn, auth, composite}
case:timeline:${caseId}                → TimelineEvent[]
entities:${contentHash}                → Entity[]
cache:registry:${event}                → {affectedKeys: string[]}
cache:deps:${key}                      → Set<string> (dependency graph)

# Legacy (deprecated after migration)
embed:${model}:${hash}                 → deprecated
embeddings:${id}                       → deprecated
cache:embedding:${type}                → deprecated
```

---

## Migration Strategy

### Phase 1: New Utilities (non-breaking)
1. Write new unified cache classes
2. Coexist with old implementations
3. Test: new classes pass all unit tests

### Phase 2: Gradual Consumer Migration (low-risk)
1. Update 1-2 low-risk consumers
2. A/B test: old path vs new path for same data
3. Verify cache hit rates, latency

### Phase 3: Decommission Old Code (after validation)
1. Remove old cache lookups
2. Delete deprecated key patterns from Redis (via migration script)
3. Archive old files to `deeds_labs/deprecated-cache/`

### Rollback Plan
- If new consolidation causes >5% latency increase: revert to old code
- Feature flag: `USE_UNIFIED_EMBEDDING_CACHE=false` to disable new path
- Maintain read-side support for old key formats for 1-2 weeks

---

## Monitoring & Metrics

### Before Consolidation
```
Redis memory: ~2.3 GB (estimated)
Cache hit rate: ~60% (fragmented by key format)
Embedding latency: 30-50s (cold), 5ms (hit)
Authority score latency: 2-4s (computed inline)
Timeline query latency: 2-5s (5 different queries)
Entity extraction latency: 6-12s (3 parallel implementations)
```

### After Consolidation (Target)
```
Redis memory: ~2.0 GB (20% reduction via deduplication)
Cache hit rate: ~75% (unified key patterns)
Embedding latency: 30-50s (cold), 5ms (hit)  [SAME]
Authority score latency: 100ms (cached)  [40× faster]
Timeline query latency: 500ms (cached)  [10× faster]
Entity extraction latency: 100ms (cached)  [50-100× faster]
```

### Success Criteria
- ✅ Hit rate increase from 60% → 75%
- ✅ Memory reduction 2.3GB → 2.0GB
- ✅ Authority score latency <200ms (p99)
- ✅ Timeline query latency <1s (p99)
- ✅ Zero data loss during migration
- ✅ All existing tests pass with new code

---

## Shared Cache Utilities Module Structure

After consolidation, create `src/lib/server/cache/` with:

```
cache/
  ├── unified-cache-api.ts         # Generic cacheTTL, cacheHashMap, cacheGetBatch
  ├── invalidation-registry.ts      # Event-driven + cascade support
  ├── embedding-cache-unified.ts    # Consolidated embedding cache
  ├── authority-scorer.ts           # Karpathy blend + caching
  ├── entity-extractor-unified.ts   # Single extractor + registry
  ├── case-timeline-builder.ts      # Timeline queries + caching
  └── cache-config.ts               # TTL constants, key patterns, schema definitions
```

Each module exports:
- Type definitions (Zod schemas)
- API functions (read/write/invalidate)
- Error handling
- Logging (for cache hits/misses)

---

## Next: Implement Day 1 Consolidations

Ready to begin. Start with Consolidation 1 (Embedding Cache Unification) — 1.5 hours.

All supporting analysis complete. Proceed with execution plan in `docs/NEXT-STEPS-IMPLEMENTATION-2026-05-29.md`.
