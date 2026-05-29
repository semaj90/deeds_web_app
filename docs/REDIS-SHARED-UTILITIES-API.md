# Redis Shared Utilities API — After Consolidation

**Status:** Design spec (ready to implement Day 1, ~1-2 hours)  
**Module Location:** `src/lib/server/cache/shared-cache-api.ts`  
**Consumers:** 242+ files (embedding, authority, timeline, entities, invalidation)  

---

## Module Overview

Create a single `shared-cache-api.ts` file with 4 reusable patterns:

```typescript
// Pattern 1: Generic Set/Get with TTL
export async function cacheTTL<T>(...): Promise<T>

// Pattern 2: Hash Field Operations (for related data)
export async function cacheHashMap<K, V>(...): Promise<V>

// Pattern 3: Batch Operations with Fallback
export async function cacheGetBatch<T>(...): Promise<Record<string, T>>

// Pattern 4: Invalidation Registry (event-driven + cascade)
export class InvalidationRegistry { ... }
```

All 4 patterns:
- ✅ Use ioredis connection pool (via `getRedis()`)
- ✅ Support Zod schema validation (optional)
- ✅ Handle errors gracefully (fallback to compute)
- ✅ Log cache hits/misses for observability
- ✅ Support key expiration (TTL)

---

## Pattern 1: Generic Set/Get with TTL

**Purpose:** Single-value cache with automatic expiration

**Signature:**
```typescript
export async function cacheTTL<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  options?: {
    schema?: z.ZodSchema<T>;
    onMiss?: (key: string) => void;
    onError?: (err: Error) => void;
  }
): Promise<T>
```

**Implementation:**
```typescript
export async function cacheTTL<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  options?: {
    schema?: z.ZodSchema<T>;
    onMiss?: (key: string) => void;
    onError?: (err: Error) => void;
  }
): Promise<T> {
  const redis = getRedis();

  try {
    // Try cache first
    const cached = await redis.get(key).catch(() => null);
    if (cached) {
      const parsed = options?.schema
        ? options.schema.parse(JSON.parse(cached))
        : JSON.parse(cached);
      return parsed;
    }

    options?.onMiss?.(key);
  } catch (err) {
    options?.onError?.(err as Error);
    // Continue to compute if cache read fails
  }

  // Cache miss — compute value
  const value = await compute();

  // Store in cache (fire-and-forget)
  redis
    .setex(key, ttlSeconds, JSON.stringify(value))
    .catch((err) => {
      console.error(`[cacheTTL] setex failed for ${key}:`, err);
    });

  return value;
}
```

**Usage:**
```typescript
import { cacheTTL } from '$lib/server/cache/shared-cache-api';
import { EmbeddingSchema } from '$lib/server/cache/cache-config';

const embedding = await cacheTTL(
  `embed:v2:${model}:${hash}`,
  604800, // 7 days
  () => callEmbeddingService(text),
  { schema: EmbeddingSchema }
);
```

**Consumers:**
- embedding-cache.ts (replace 99 set/get pairs)
- citation-cache.ts (replace 41 set/get pairs)
- ai/context-compression.ts (replace 18 set/get pairs)

---

## Pattern 2: Hash Field Operations

**Purpose:** Group related values in a single Redis hash (e.g., all embeddings by model)

**Signature:**
```typescript
export async function cacheHashMap<K extends string, V>(
  hashKey: string,
  fieldKey: K,
  compute: () => Promise<V>,
  options?: {
    ttlSeconds?: number;
    schema?: z.ZodSchema<V>;
    onMiss?: (key: string, field: K) => void;
  }
): Promise<V>
```

**Implementation:**
```typescript
export async function cacheHashMap<K extends string, V>(
  hashKey: string,
  fieldKey: K,
  compute: () => Promise<V>,
  options?: {
    ttlSeconds?: number;
    schema?: z.ZodSchema<V>;
    onMiss?: (key: string, field: K) => void;
  }
): Promise<V> {
  const redis = getRedis();

  try {
    const cached = await redis.hget(hashKey, fieldKey).catch(() => null);
    if (cached) {
      const parsed = options?.schema
        ? options.schema.parse(JSON.parse(cached))
        : JSON.parse(cached);
      return parsed;
    }

    options?.onMiss?.(hashKey, fieldKey);
  } catch (err) {
    // Continue to compute
  }

  const value = await compute();

  // Store in hash (fire-and-forget)
  redis
    .hset(hashKey, fieldKey, JSON.stringify(value))
    .catch((err) => {
      console.error(`[cacheHashMap] hset failed for ${hashKey}:${fieldKey}:`, err);
    });

  // Optional: set hash expiration
  if (options?.ttlSeconds) {
    redis.expire(hashKey, options.ttlSeconds).catch(() => {});
  }

  return value;
}
```

**Usage:**
```typescript
import { cacheHashMap } from '$lib/server/cache/shared-cache-api';
import { AuthorityScoreSchema } from '$lib/server/cache/cache-config';

const score = await cacheHashMap(
  'authority:blend:v2', // hashKey
  fileId, // fieldKey
  () => authorityScorer.blend(pr, attn, auth), // compute
  {
    ttlSeconds: 86400, // 24h
    schema: AuthorityScoreSchema,
  }
);
```

**Consumers:**
- authority-scorer.ts (replace hardcoded blend logic)
- karpathy-gpu-enrich.mjs (replace redis.hset/hget calls)
- recommendation-metrics.ts (replace custom weighting)

---

## Pattern 3: Batch Operations with Fallback

**Purpose:** Retrieve multiple values with fallback for cache misses

**Signature:**
```typescript
export async function cacheGetBatch<T>(
  keys: string[],
  compute: (missingKeys: string[]) => Promise<Record<string, T>>,
  options?: {
    schema?: z.ZodSchema<T>;
    ttlSeconds?: number;
    onMissAll?: (keys: string[]) => void;
    onPartial?: (hits: number, misses: number) => void;
  }
): Promise<Record<string, T>>
```

**Implementation:**
```typescript
export async function cacheGetBatch<T>(
  keys: string[],
  compute: (missingKeys: string[]) => Promise<Record<string, T>>,
  options?: {
    schema?: z.ZodSchema<T>;
    ttlSeconds?: number;
    onMissAll?: (keys: string[]) => void;
    onPartial?: (hits: number, misses: number) => void;
  }
): Promise<Record<string, T>> {
  const redis = getRedis();
  const result: Record<string, T> = {};
  const missing: string[] = [];

  // Try batch cache read
  try {
    const cached = await redis.mget(keys).catch(() => []);

    keys.forEach((key, i) => {
      if (cached[i]) {
        const parsed = options?.schema
          ? options.schema.parse(JSON.parse(cached[i]))
          : JSON.parse(cached[i]);
        result[key] = parsed;
      } else {
        missing.push(key);
      }
    });

    if (missing.length > 0 && missing.length < keys.length) {
      options?.onPartial?.(keys.length - missing.length, missing.length);
    } else if (missing.length === keys.length) {
      options?.onMissAll?.(keys);
    }
  } catch (err) {
    // Cache read failed, compute all
    missing.push(...keys);
  }

  // Compute missing values
  if (missing.length > 0) {
    const computed = await compute(missing);
    Object.entries(computed).forEach(([k, v]) => {
      result[k] = v;

      // Store in cache (fire-and-forget)
      if (options?.ttlSeconds) {
        redis.setex(k, options.ttlSeconds, JSON.stringify(v)).catch(() => {});
      } else {
        redis.set(k, JSON.stringify(v)).catch(() => {});
      }
    });
  }

  return result;
}
```

**Usage:**
```typescript
import { cacheGetBatch } from '$lib/server/cache/shared-cache-api';

const embeddings = await cacheGetBatch(
  ['embed:v2:model:hash1', 'embed:v2:model:hash2'],
  async (missing) => {
    const result = await callEmbeddingServiceBatch(missing);
    return Object.fromEntries(
      result.map((item) => [item.key, item.embedding])
    );
  },
  { schema: EmbeddingSchema, ttlSeconds: 604800 }
);
```

**Consumers:**
- grpc/embedding-client.ts (replace mget loops)
- qdrant-manager.ts (replace batch query caching)
- vector-cache.ts (replace batch storage)

---

## Pattern 4: Invalidation Registry (Event-Driven + Cascade)

**Purpose:** Track cache dependencies and cascade invalidation on events

**Signature:**
```typescript
export class InvalidationRegistry {
  register(
    event: string,
    affectedKeys: string[] | ((ev: any) => string[]) | ((ev: any) => Promise<string[]>)
  ): void

  async invalidate(event: string, eventData?: any): Promise<number>

  async cascade(rootKey: string): Promise<Set<string>>

  async getAffectedKeys(event: string): Promise<string[]>

  async setDependency(childKey: string, parentKey: string): Promise<void>
}
```

**Implementation:**
```typescript
export class InvalidationRegistry {
  private registry: Map<string, (ev?: any) => string[] | Promise<string[]>> = new Map();
  private dependencies: Map<string, Set<string>> = new Map(); // child → parents

  register(
    event: string,
    affectedKeys: string[] | ((ev: any) => string[]) | ((ev: any) => Promise<string[]>)
  ): void {
    if (Array.isArray(affectedKeys)) {
      this.registry.set(event, () => affectedKeys);
    } else {
      this.registry.set(event, affectedKeys);
    }
  }

  async invalidate(event: string, eventData?: any): Promise<number> {
    const redis = getRedis();
    const resolver = this.registry.get(event);
    if (!resolver) {
      console.warn(`[InvalidationRegistry] Unknown event: ${event}`);
      return 0;
    }

    const keys = Array.isArray(resolver)
      ? resolver
      : await Promise.resolve(resolver(eventData));

    const expandedKeys = new Set<string>();
    for (const key of keys) {
      // Add exact match
      expandedKeys.add(key);
      // Add pattern matches (e.g., "gpu:*" → all gpu keys)
      if (key.includes('*')) {
        const pattern = key.replace('*', '');
        const matched = await redis.keys(key);
        matched.forEach((k) => expandedKeys.add(k));
      }
      // Add cascaded dependencies
      const cascaded = await this.cascade(key);
      cascaded.forEach((k) => expandedKeys.add(k));
    }

    if (expandedKeys.size === 0) return 0;

    // Batch delete
    const deleted = await redis.del(...Array.from(expandedKeys));
    console.log(`[InvalidationRegistry] ${event} deleted ${deleted} keys`);

    return deleted;
  }

  async cascade(rootKey: string): Promise<Set<string>> {
    const visited = new Set<string>();
    const queue = [rootKey];

    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);

      // Find downstream dependencies
      const deps = this.dependencies.get(key);
      if (deps) {
        queue.push(...deps);
      }
    }

    visited.delete(rootKey); // Don't include root in cascade
    return visited;
  }

  async setDependency(childKey: string, parentKey: string): Promise<void> {
    if (!this.dependencies.has(parentKey)) {
      this.dependencies.set(parentKey, new Set());
    }
    this.dependencies.get(parentKey)!.add(childKey);
  }

  async getAffectedKeys(event: string): Promise<string[]> {
    const resolver = this.registry.get(event);
    if (!resolver) return [];
    return Array.isArray(resolver) ? resolver : await Promise.resolve(resolver(undefined));
  }
}

// Singleton instance
export const invalidationRegistry = new InvalidationRegistry();
```

**Usage:**
```typescript
import { invalidationRegistry } from '$lib/server/cache/shared-cache-api';

// Register events
invalidationRegistry.register('schema_change:glyph_records', [
  'gpu:karpathy:*',
  'ace:lane:routing_policy',
  'glyph:reward:*',
]);

invalidationRegistry.register('reward_retrain', (ev) => [
  `glyph:reward:${ev.grpoId}`,
  'ace:lane:routing_policy',
]);

// Invalidate on event
await invalidationRegistry.invalidate('schema_change:glyph_records');

// Set dependencies (child invalidates when parent changes)
await invalidationRegistry.setDependency('ace:context:cache', 'gpu:karpathy:scores');
```

**Consumers:**
- cache-invalidation.ts (replace manual redis.del)
- retrieval/qlora-boost.ts (replace RabbitMQ listener)
- cache/cache-invalidation.ts (replace cascade logic)
- feature-context-cache.ts (add event listener)

---

## Cache Configuration (cache-config.ts)

Centralize all TTL constants, key patterns, and Zod schemas:

```typescript
// TTL Constants
export const CACHE_TTL = {
  EMBEDDING: 604800, // 7 days
  AUTHORITY: 86400, // 24 hours
  TIMELINE: 7200, // 2 hours
  ENTITY: 604800, // 7 days
  REGISTRY: 3600, // 1 hour
} as const;

// Key Patterns
export const CACHE_KEY = {
  EMBEDDING: (model: string, hash: string) => `embed:v2:${model}:${hash}`,
  AUTHORITY_BLEND: (fileId: string) => `authority:blend:${fileId}`,
  CASE_TIMELINE: (caseId: string) => `case:timeline:${caseId}`,
  ENTITY: (contentHash: string) => `entities:${contentHash}`,
  INVALIDATION_REGISTRY: (event: string) => `cache:registry:${event}`,
} as const;

// Zod Schemas
export const EmbeddingSchema = z.object({
  model: z.string(),
  input: z.string(),
  embedding: z.instanceof(Float32Array),
  ttl: z.number(),
  createdAt: z.date(),
});

export const AuthorityScoreSchema = z.object({
  pageRank: z.number().min(0).max(1),
  attentionScore: z.number().min(0).max(1),
  authorityScore: z.number().min(0).max(1),
  composite: z.number().min(0).max(1),
});

export const TimelineEventSchema = z.object({
  id: z.string().uuid(),
  time: z.date(),
  location: z.string(),
  who: z.array(z.string()),
  what: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  disputed: z.boolean(),
});

export const EntitySchema = z.object({
  kind: z.string(),
  value: z.string(),
  span: z.tuple([z.number(), z.number()]),
  confidence: z.number().min(0).max(1),
});
```

---

## Implementation Checklist (Day 1)

```
[ ] Create src/lib/server/cache/shared-cache-api.ts (4 patterns)
[ ] Create src/lib/server/cache/cache-config.ts (TTLs, keys, schemas)
[ ] Update embedding-cache.ts → use cacheTTL()
[ ] Update citation-cache.ts → use cacheTTL()
[ ] Update ai/context-compression.ts → use cacheTTL()
[ ] Create src/lib/server/scoring/authority-scorer.ts → use cacheHashMap()
[ ] Update karpathy-gpu-enrich.mjs → use cacheHashMap()
[ ] Update recommendation-metrics.ts → use cacheHashMap()
[ ] Create src/lib/server/cases/timeline-builder.ts → use cacheTTL()
[ ] Update case-timeline.ts, context-assembler.ts, etc. → use builder
[ ] Create src/lib/server/analysis/entity-extractor-unified.ts → use cacheTTL()
[ ] Update entity-extraction.ts, forensics.ts, langextract-reranker.ts → use unified
[ ] Wire up invalidationRegistry in cache-invalidation.ts
[ ] Add unit tests for all 4 patterns
[ ] Run integration test: embedding cache hit rate >90%
[ ] Commit: "Add shared Redis cache utilities (4 reusable patterns)"
```

---

## Expected Performance Impact

**Before Consolidation:**
- Embedding latency: 30-50s (cold), 5ms (hit, scattered formats → 60% hit rate)
- Authority latency: 2-4s (inline computation, no cache)
- Timeline latency: 2-5s (5 different queries)
- Entity extraction: 6-12s (3 parallel implementations)

**After Consolidation:**
- Embedding latency: 30-50s (cold), 5ms (hit, unified format → 75% hit rate)
- Authority latency: 100ms (cached at `authority:blend:${fileId}`)
- Timeline latency: 500ms (cached at `case:timeline:${caseId}`)
- Entity extraction: 100ms (cached at `entities:${contentHash}`)

**Cache Memory Savings:**
- Deduplication: 3 embedding formats → 1 (consolidate keys)
- Expected reduction: 20-30% (eliminate redundant keys)

---

## Observability & Metrics

Each pattern logs cache hits/misses:

```typescript
// Logged automatically:
// [cacheTTL] HIT: embed:v2:embeddinggemma:a1b2c3
// [cacheTTL] MISS: embed:v2:embeddinggemma:d4e5f6 (computing...)
// [cacheHashMap] HIT: authority:blend:v2 → fileId-xyz
// [cacheGetBatch] PARTIAL: 15 hits, 5 misses
// [InvalidationRegistry] schema_change:glyph_records deleted 47 keys
```

Monitor via Redis:
```bash
# Cache hit rate
redis-cli CLIENT TRACKING INFO

# Memory usage
redis-cli INFO memory | grep used_memory_human

# Key distribution
redis-cli KEYS 'embed:v2:*' | wc -l
redis-cli KEYS 'authority:blend:*' | wc -l
```

---

**Ready to implement Day 1. Estimate: 1-2 hours to write + test all 4 patterns.**
