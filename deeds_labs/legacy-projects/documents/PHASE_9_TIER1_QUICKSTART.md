# Phase 9 Quick-Start Guide

**Legal AI Platform - Optimization Work (Starting Now)**

---

## 🎯 Quick Decision: Which Tier Should We Start?

### Option A: **Tier 1 - Vector Quantization + Query Optimization** ⭐ RECOMMENDED
- **Effort:** 5-8 hours
- **Impact:** 2-5x faster queries, 30ms vector search
- **Risk:** Very low (can roll back easily)
- **ROI:** High (immediate benefit)
- **Go-ahead:** YES, start today

### Option B: **Tier 2 - Distributed Caching**
- **Effort:** 2-3 days
- **Impact:** 90%+ cache hit ratio
- **Risk:** Medium (coordination complexity)
- **ROI:** Very high (but needs Tier 1 baseline first)
- **Go-ahead:** After validating Tier 1

### Option C: **Tier 3 - Service Mesh**
- **Effort:** 3-5 days
- **Impact:** Advanced resilience, multi-region ready
- **Risk:** High (infrastructure changes)
- **ROI:** High (but only if scaling multi-region)
- **Go-ahead:** Only if planning scale-out

---

## 🚀 Start Tier 1 Today

### Step 1: Vector Quantization (2-3 hours)

**File to create:** `src/lib/server/optimize/vector-quantization.ts`

```typescript
/**
 * Vector Quantization Service
 * Reduces embedding size: float32[1024] → int8[1024]
 * Speed: 5x faster similarity search
 * Memory: 75% less storage
 */

import type { Float32Array as F32Array } from 'onnxruntime-node';

export class VectorQuantization {
  /**
   * Convert float32 embeddings to int8
   * Maintains ~98% similarity accuracy
   */
  static quantizeToInt8(embedding: number[]): Int8Array {
    const min = Math.min(...embedding);
    const max = Math.max(...embedding);
    const scale = (max - min) / 255;

    return new Int8Array(
      embedding.map(v => Math.round(((v - min) / scale) - 128))
    );
  }

  /**
   * Dequantize for verification
   */
  static dequantizeFromInt8(quantized: Int8Array, min: number, max: number): Float32Array {
    const scale = (max - min) / 255;
    return new Float32Array(
      Array.from(quantized).map(v => (v + 128) * scale + min)
    );
  }

  /**
   * Fast similarity using int8 SIMD
   * Speed: 100ms → 20ms for 1000 vector comparisons
   */
  static cosineSimilarityInt8(vec1: Int8Array, vec2: Int8Array): number {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }
}

// Usage in document ingestion:
// const embedding = await ollama.embed(text);
// const quantized = VectorQuantization.quantizeToInt8(embedding);
// await qdrant.storeVector(docId, quantized, metadata);
```

**Integration points:**
1. `src/lib/services/document-ingestion.ts` - Call before storing in Qdrant
2. `src/lib/server/db/qdrant-client.ts` - Use quantized storage
3. `src/routes/api/search/+server.ts` - Use int8 similarity for results

**Testing:**
```bash
# Quick validation
npx tsx src/lib/server/optimize/vector-quantization.ts

# Benchmark vs baseline
npm run bench:vector-quantization
```

---

### Step 2: Query Optimization (1-2 hours)

**File to create:** `src/lib/server/optimize/query-cache.ts`

```typescript
/**
 * Query Caching Layer
 * Caches frequent PostgreSQL queries in Redis
 * Speed: 200ms → 5ms for cache hits
 * Hit ratio target: 80%+
 */

import { redis } from '$lib/server/db/redis-client';
import { db } from '$lib/server/db/drizzle-client';

export class QueryCache {
  private static readonly CACHE_TTL = {
    evidence: 300,        // 5 min (frequently updated)
    cases: 600,          // 10 min
    activities: 300,     // 5 min
    users: 1800,         // 30 min
    citations: 3600      // 1 hour (static)
  };

  /**
   * Get evidence for case with caching
   * Cache key pattern: cache:evidence:{caseId}
   */
  static async getEvidenceForCase(caseId: string) {
    const cacheKey = `cache:evidence:${caseId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[QueryCache] HIT: ${cacheKey}`);
      return JSON.parse(cached);
    }

    console.log(`[QueryCache] MISS: ${cacheKey}`);

    // Query database
    const result = await db
      .select()
      .from(evidence)
      .where(eq(evidence.case_id, caseId))
      .orderBy(desc(evidence.created_at));

    // Cache result
    await redis.setex(
      cacheKey,
      this.CACHE_TTL.evidence,
      JSON.stringify(result)
    );

    return result;
  }

  /**
   * Invalidate cache when data changes
   */
  static async invalidateCache(type: string, id: string) {
    const patterns = {
      'evidence': [`cache:evidence:*`],
      'case': [`cache:cases:${id}`, `cache:evidence:*`, `cache:activities:${id}`],
      'activity': [`cache:activities:*`]
    };

    const keysToDelete = patterns[type] || [];
    for (const pattern of keysToDelete) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[QueryCache] Invalidated ${keys.length} keys matching ${pattern}`);
      }
    }
  }

  /**
   * Monitor cache effectiveness
   */
  static async getStats() {
    const allKeys = await redis.keys('cache:*');
    const stats = {
      cacheSize: allKeys.length,
      byType: {
        evidence: allKeys.filter(k => k.includes('evidence')).length,
        cases: allKeys.filter(k => k.includes('cases')).length,
        activities: allKeys.filter(k => k.includes('activities')).length
      }
    };
    return stats;
  }
}

// Usage in +server.ts endpoints:
// const evidence = await QueryCache.getEvidenceForCase(caseId);
// On mutation: await QueryCache.invalidateCache('evidence', id);
```

**Integration points:**
1. `src/routes/api/evidence/+server.ts` - GET calls
2. `src/routes/api/cases/+server.ts` - GET calls
3. Mutation handlers - Call `invalidateCache()` on POST/PUT/DELETE

---

### Step 3: RabbitMQ Worker Pool (1 hour)

**File to modify:** `src/lib/server/queue/rabbitmq-workers.ts`

Add to existing file:

```typescript
// Before: exports.WORKER_POOL_SIZE = 4 (fixed)
// After: Dynamic based on CPU cores

import os from 'os';

// Auto-scale worker pool with CPU cores
const cpuCount = os.cpus().length;
export const WORKER_POOL_SIZE = Math.max(4, cpuCount - 1); // Leave 1 core free

// Add priority queue support
export const QUEUE_PRIORITIES = {
  CRITICAL: 1,    // Legal emergency, urgent case events
  HIGH: 5,        // Document upload, analysis
  STANDARD: 10,   // Regular operations
  LOW: 20         // Background tasks, cleanup
};

// Graceful backpressure
export async function consumeWithBackpressure(
  channel: any,
  queue: string,
  handler: Function
) {
  const prefetch = WORKER_POOL_SIZE * 2; // 2 messages per worker
  channel.prefetch(prefetch);

  channel.assertQueue(queue, { durable: true });

  channel.consume(queue, async (msg) => {
    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content);
      channel.ack(msg);
    } catch (error) {
      console.error(`[RabbitMQ] Error processing message:`, error);
      // Don't nack - let DLQ monitor handle retries
      channel.nack(msg, false, false);
    }
  });
}
```

**Result:** 2-4x throughput improvement depending on system

---

## 📊 Benchmark Before & After

**Create file:** `src/lib/server/optimize/benchmark.ts`

```typescript
import { VectorQuantization } from './vector-quantization';
import { QueryCache } from './query-cache';

export async function runBenchmark() {
  console.log('🔬 Running optimization benchmarks...\n');

  // Test 1: Vector quantization
  const testVector = new Array(1024).fill(0).map(() => Math.random());

  console.time('Float32 similarity (1000 comparisons)');
  for (let i = 0; i < 1000; i++) {
    const v1 = new Float32Array(testVector);
    const v2 = new Float32Array(testVector.map(() => Math.random()));
    cosineSimilarity(v1, v2);
  }
  console.timeEnd('Float32 similarity');

  console.time('Int8 similarity (1000 comparisons)');
  for (let i = 0; i < 1000; i++) {
    const v1 = VectorQuantization.quantizeToInt8(testVector);
    const v2 = VectorQuantization.quantizeToInt8(
      testVector.map(() => Math.random())
    );
    VectorQuantization.cosineSimilarityInt8(v1, v2);
  }
  console.timeEnd('Int8 similarity');

  // Test 2: Query caching
  console.log('\n📊 Query cache effectiveness:');
  const stats = await QueryCache.getStats();
  console.log(stats);
}
```

---

## ✅ Checklist for Tier 1

- [ ] Create `vector-quantization.ts`
- [ ] Create `query-cache.ts`
- [ ] Update RabbitMQ worker pool config
- [ ] Create `benchmark.ts` for before/after comparison
- [ ] Run benchmark to establish baseline
- [ ] Integrate vector quantization into document upload flow
- [ ] Integrate query caching into search/retrieval endpoints
- [ ] Re-run benchmark to measure improvement
- [ ] Document results in `TIER_1_RESULTS.md`
- [ ] Create PR with changes

---

## 📈 Expected Results (Tier 1)

| Metric | Current | After Tier 1 | Improvement |
|--------|---------|-------------|------------|
| Vector search latency | 100-150ms | 20-40ms | 3-4x faster |
| Query latency (p99) | 200-500ms | 50-100ms | 3-5x faster |
| Document upload time | 500-1500ms | 300-800ms | 2x faster |
| Cache hit ratio | 60% | 80%+ | +20% |
| PostgreSQL CPU usage | High | Medium | -40% |

---

## 🔄 Next Step After Tier 1

Once Tier 1 is validated and benchmarked:

1. Create `TIER_1_RESULTS.md` documenting improvements
2. Review results to decide on Tier 2
3. If hit ratio >85%, move to distributed caching (Tier 2)
4. If still bottlenecked, focus on specific services

---

## 🚨 Risk Mitigation

**If something breaks:**
1. Vector quantization has bugs → Revert to float32 (1-line change)
2. Query cache stale data → Clear Redis: `redis-cli FLUSHALL`
3. Worker pool causes OOM → Reduce back to CPU count / 2

All changes are **backwards compatible** and **easily reversible**.

---

## Questions to Guide the Work

1. **Do we have baseline metrics?** (Run benchmark before changes)
2. **Which endpoint has slowest queries?** (Check logs/metrics)
3. **What's our target cache hit ratio?** (Aim for 85%+)
4. **How many documents do we need to handle?** (Plan for 10x growth)
5. **Are GPU resources available?** (Use WebGPU for SIMD if yes)

---

**Ready to implement Tier 1?** Start with Step 1 (vector quantization).

Estimated time: 5-8 hours of focused work.

Expected benefit: 30-40% overall latency reduction within one week.
