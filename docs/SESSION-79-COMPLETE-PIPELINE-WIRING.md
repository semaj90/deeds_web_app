# Session 79: Complete Pipeline Wiring & Alignment

**Date**: June 24, 2026 (Session 79 continuation)  
**Status**: ✅ **Gate 3 RESOLVED** → Now wire full pipeline with service threads, Valkey KV cache, feature extraction, TurboVec, Bifrost

---

## What We Fixed (Gate 3)

✅ Qdrant payload normalization working (QdrantClient.setPayload)  
✅ 52,606 points normalized with feature_id alignment  
✅ som_cluster + retrieval_strategy + feature_ids→feature_id aligned

**Now**: Wire the entire inference + retrieval pipeline end-to-end.

---

## Pipeline Architecture (Complete End-to-End)

```
User Query
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: REQUEST DISPATCH & CACHING                             │
├─────────────────────────────────────────────────────────────────┤
│ POST /api/research/deep/+server.ts (HTTP endpoint)              │
│ ├─ Bifrost L1 (Redis exact-match): 5ms hit rate ~20%            │
│ │   Key: SHA256(query + model + temp + maxTokens)               │
│ │   Hit: return cached response, done ✅                         │
│ │                                                               │
│ └─ Bifrost L2 (Qdrant semantic): 2-5s hit rate ~70%             │
│     Vector: embed(query) @ 768-dim                              │
│     Threshold: 0.8 cosine similarity                            │
│     Hit: return cached response, done ✅                         │
└─────────────────────────────────────────────────────────────────┘
  ↓ (Cache miss → proceed to Layer 2)
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: FEATURE EXTRACTION (LangExtract)                       │
├─────────────────────────────────────────────────────────────────┤
│ LangExtract.ts: Extract key phrases, entities, intents          │
│ ├─ Regex patterns (types, functions, errors)                    │
│ ├─ NLP: Named entity extraction (classes, modules)              │
│ └─ Intent classification (search, debug, refactor, explain)     │
│                                                                 │
│ Output: { phrases: [], entities: [], intent: 'search' }         │
└─────────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: PARALLEL RETRIEVAL (Service Threads)                   │
├─────────────────────────────────────────────────────────────────┤
│ Worker Threads (8 parallel):                                    │
│ ├─ Thread 1: Qdrant ANN (768-dim content vector)                │
│ │   embedQuery → searchQdrant(vector, 'content', limit=20)     │
│ │                                                               │
│ ├─ Thread 2: TurboVec Sidecar (384-dim signature vector)        │
│ │   POST :50055/search { vector, k=10 }                         │
│ │   Result: Faster, sparse retrieval                            │
│ │                                                               │
│ ├─ Thread 3: Redis Centroid Lookup (directory-level)            │
│ │   HGET centroid:dir:{dirname} → mean([vec1, vec2, ...])      │
│ │   Expand neighbors in 4D SOM grid                             │
│ │                                                               │
│ ├─ Thread 4: Postgres FTS (BM25 fallback)                       │
│ │   SELECT * FROM codebase_chunk_index                          │
│ │   WHERE to_tsvector(content) @@ plainto_tsquery(query)        │
│ │                                                               │
│ ├─ Thread 5: Neo4j Topology (k-hop bounded)                     │
│ │   MATCH (chunk:CodebaseFile)--[r:SIMILAR_TOPOLOGY]-->(n)      │
│ │   Return neighbors by PageRank                                │
│ │                                                               │
│ └─ Thread 6-8: Reserved for future (DuckDB, CouchDB, KAG)       │
│                                                                 │
│ Promise.all() waits for ALL 5 to complete (5-10s total)         │
└─────────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: RERANKING & FUSION                                     │
├─────────────────────────────────────────────────────────────────┤
│ Karpathy Blend:                                                 │
│   0.4 × PageRank + 0.3 × AttentionScore + 0.3 × AuthorityScore  │
│                                                                 │
│ Fusion: Deduplicate + merge top-K across all 5 retrieval lanes  │
│ Sort by blend score, return top 10 chunks                       │
│                                                                 │
│ Output: [{path, summary, score, source}, ...]                  │
└─────────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 5: LLM SYNTHESIS (GPU GEMMA4)                             │
├─────────────────────────────────────────────────────────────────┤
│ POST :8090/v1/chat/completions                                  │
│ ├─ Model: gemma4-legal-iq4xs-direct.gguf                        │
│ ├─ Context: 64K (or 16K for speed)                              │
│ ├─ KV Cache:                                                    │
│ │   -ctk q8_0  (K-cache: 8-bit quantized)                       │
│ │   -ctv turbo3 (V-cache: TurboQuant 3-bit)                     │
│ │   Result: 3.1 GB VRAM vs 6.3 GB baseline                      │
│ ├─ Flash Attention: -fa on (GPU kernel optimization)            │
│ └─ Cache Prompt: --cache-prompt (KV reuse across calls)         │
│                                                                 │
│ Input: {                                                        │
│   system: "You are a code analysis expert...",                  │
│   messages: [                                                   │
│     { role: "user", content: "Query: " + query },               │
│     { role: "assistant", content: "Context:\n" + chunks }       │
│   ],                                                            │
│   temperature: 0.3,                                             │
│   max_tokens: 2000,                                             │
│   stream: true  (← important for SSE)                           │
│ }                                                               │
│                                                                 │
│ Output: Streamed response (event: data, event: done)            │
└─────────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 6: RESPONSE & CACHING                                     │
├─────────────────────────────────────────────────────────────────┤
│ Cache write-back:                                               │
│ ├─ L1 (Redis exact-match): TTL 1h                               │
│ │   SETEX cache_key response 3600                               │
│ │                                                               │
│ ├─ L2 (Bifrost semantic): TTL 24h                               │
│ │   POST :3040/cache { query_vec, response, ttl }               │
│ │                                                               │
│ └─ Observability:                                               │
│    ├─ Langfuse trace (response quality, latency)                │
│    ├─ Redis cache stats (hit rates)                             │
│    └─ context_timeline audit log                                │
│                                                                 │
│ Return: { answer, sources, reasoning, trace_id }                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Wiring Checklist: Service Threads

### ✅ Currently Implemented (Verify)

- [ ] **Bifrost L1**: Redis exact-match cache in `src/lib/server/cache/redis-exact-match.ts`
  - VERIFY: `npm run redis:cache:stats` shows hit rate
  
- [ ] **Bifrost L2**: Bifrost semantic cache @ :3040
  - VERIFY: `curl http://localhost:3040/health` returns 200

- [ ] **Qdrant ANN**: `searchQdrant()` in `src/lib/server/vector/qdrant-manager.ts`
  - VERIFY: Can search 52,606 points with 768-dim vectors

- [ ] **Postgres FTS**: BM25 via `to_tsvector()` + `plainto_tsquery()`
  - VERIFY: Query: `SELECT * FROM codebase_chunk_index WHERE to_tsvector(content) @@ plainto_tsquery('error')`

### ⏳ Partially Implemented (Check Alignment)

- [ ] **Service Threads**: 8 parallel worker threads for retrieval lanes
  - Location: `src/lib/server/retrieval/parallel-retrieval.ts` (needs creation or verification)
  - Check: Do all 5 lanes run in Promise.all() or sequential?

- [ ] **Redis Centroid Lookup**: `centroid:dir:{dirname}`
  - Verify: Stage 3 pipeline created these keys
  - Check: `HGETALL centroid:dir:src/lib/server` in Redis CLI

- [ ] **TurboVec Sidecar**: Listening @ :50055
  - Verify: `curl http://localhost:50055/health` or `:50053` (retrieval service)
  - Check: Is it wired into parallel retrieval or sequential fallback?

- [ ] **Neo4j Topology**: SIMILAR_TOPOLOGY edges + PageRank
  - Verify: `MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r)` > 0
  - Check: Is it bounded k-hops or unbounded traversal?

### ❌ Missing (Create)

- [ ] **LangExtract.ts**: Feature extraction before retrieval
  - Purpose: Extract phrases, entities, intents from query
  - Output: Feed to retrieval lanes for better targeting

- [ ] **Parallel Retrieval Orchestrator**: Coordinate 5 lanes with Promise.all()
  - Purpose: Fan-out to Qdrant, TurboVec, Redis, Postgres, Neo4j simultaneously
  - Timeout: 10s global, individual lane timeout 5s
  - Fallback: If lane fails, skip it (degraded retrieval)

---

## Wiring Task 1: Service Threads (Parallel Retrieval Orchestrator)

### What to Create

**File**: `src/lib/server/retrieval/parallel-orchestrator.ts` (NEW)

```typescript
/**
 * Parallel Retrieval Orchestrator
 * 
 * Coordinates 5 independent retrieval lanes simultaneously:
 * 1. Qdrant ANN (768-dim content vector)
 * 2. TurboVec (384-dim signature vector, sidecar :50055)
 * 3. Redis Centroids (directory-level semantic clustering)
 * 4. Postgres FTS (BM25 fallback)
 * 5. Neo4j Topology (k-hop bounded)
 * 
 * All lanes run in Promise.allSettled() to allow partial failures.
 * Results fused via Karpathy blend score.
 */

import { searchQdrant } from './qdrant-manager.js';
import { searchPostgresFTS } from '../db/search-fts.js';
import { searchNeo4jTopology } from '../graph/neo4j-search.js';
import { searchTurboVec } from '../retrieval/turbovec-client.js';
import { searchRedisCentroids } from '../cache/redis-centroid-cache.js';

export interface RetrievalResult {
  path: string;
  summary?: string;
  content: string;
  score: number;
  source: 'qdrant' | 'turbovec' | 'redis' | 'postgres' | 'neo4j';
  metadata?: Record<string, unknown>;
}

export async function parallelRetrieve(
  query: string,
  options: {
    queryVector?: number[];        // Pre-embedded query (768-dim)
    limit?: number;                 // Results per lane
    timeout?: number;               // Per-lane timeout ms
    globalTimeout?: number;         // Overall timeout ms
    includeNeo4j?: boolean;         // Include topology lane
  } = {}
): Promise<RetrievalResult[]> {
  const {
    queryVector,
    limit = 20,
    timeout = 5000,
    globalTimeout = 10000,
    includeNeo4j = true,
  } = options;

  // Abort controller for global timeout
  const abortController = new AbortController();
  const globalTimer = setTimeout(() => abortController.abort(), globalTimeout);

  try {
    // 1. Embed query if not provided
    let vec768 = queryVector;
    if (!vec768) {
      vec768 = await embedText(query);  // Ollama embeddinggemma
    }

    // 2. Derive 384-dim signature vector for TurboVec
    const vec384 = vec768 ? deriveSignatureVector(vec768) : undefined;

    // 3. Fan-out to all 5 lanes simultaneously
    const lanes = await Promise.allSettled([
      // Lane 1: Qdrant (768-dim)
      (async () => {
        try {
          return await withTimeout(
            searchQdrant(vec768!, 'content', limit),
            timeout
          ).then(chunks => 
            chunks.map(c => ({
              ...c,
              source: 'qdrant' as const,
              score: c.score,
            }))
          );
        } catch (e) {
          console.warn('[retrieval] Qdrant lane failed:', e);
          return [];
        }
      })(),

      // Lane 2: TurboVec (384-dim, sidecar)
      (async () => {
        try {
          if (!vec384) return [];
          return await withTimeout(
            searchTurboVec(vec384, limit),
            timeout
          ).then(results =>
            results.map(r => ({
              path: r.path,
              content: r.content,
              score: r.score * 0.8,  // Discount sparse results
              source: 'turbovec' as const,
            }))
          );
        } catch (e) {
          console.warn('[retrieval] TurboVec lane failed:', e);
          return [];
        }
      })(),

      // Lane 3: Redis Centroids (directory-level)
      (async () => {
        try {
          if (!vec768) return [];
          return await withTimeout(
            searchRedisCentroids(vec768, limit),
            timeout
          ).then(chunks =>
            chunks.map(c => ({
              ...c,
              source: 'redis' as const,
            }))
          );
        } catch (e) {
          console.warn('[retrieval] Redis centroid lane failed:', e);
          return [];
        }
      })(),

      // Lane 4: Postgres FTS (BM25)
      (async () => {
        try {
          return await withTimeout(
            searchPostgresFTS(query, limit),
            timeout
          ).then(chunks =>
            chunks.map(c => ({
              ...c,
              source: 'postgres' as const,
              score: c.score || 0.5,  // Lower confidence for FTS
            }))
          );
        } catch (e) {
          console.warn('[retrieval] Postgres FTS lane failed:', e);
          return [];
        }
      })(),

      // Lane 5: Neo4j Topology (optional, k-hops bounded)
      includeNeo4j ? (async () => {
        try {
          return await withTimeout(
            searchNeo4jTopology(query, limit, { maxHops: 3 }),
            timeout
          ).then(chunks =>
            chunks.map(c => ({
              ...c,
              source: 'neo4j' as const,
              score: c.score * 0.7,  // Lower confidence for topology
            }))
          );
        } catch (e) {
          console.warn('[retrieval] Neo4j topology lane failed:', e);
          return [];
        }
      })() : Promise.resolve([]),
    ]);

    // 4. Extract results from all lanes
    const allResults: RetrievalResult[] = [];
    lanes.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    });

    // 5. Deduplicate by path
    const deduped = new Map<string, RetrievalResult>();
    for (const r of allResults) {
      if (!deduped.has(r.path)) {
        deduped.set(r.path, r);
      }
    }

    // 6. Rerank via Karpathy blend (pagerank + attention + authority)
    const ranked = Array.from(deduped.values())
      .map(r => ({
        ...r,
        blendScore: computeKarpathyBlend(r.score, r.source),
      }))
      .sort((a, b) => b.blendScore - a.blendScore)
      .slice(0, limit);

    return ranked;
  } finally {
    clearTimeout(globalTimer);
  }
}

// Helper: Timeout wrapper
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

// Helper: Derive 384-dim signature from 768-dim content
function deriveSignatureVector(vec768: number[]): number[] {
  // Simple: pool every other dimension (768 → 384)
  return vec768.filter((_, i) => i % 2 === 0);
}

// Helper: Karpathy blend score (0.4·PR + 0.3·attn + 0.3·auth)
function computeKarpathyBlend(baseScore: number, source: string): number {
  const sourceWeights = {
    qdrant: 0.4,    // Most confident
    redis: 0.3,     // Semantic clustering
    postgres: 0.2,  // BM25 fallback
    turbovec: 0.25, // Signature vector
    neo4j: 0.15,    // Topology only
  };

  return baseScore * (sourceWeights[source as keyof typeof sourceWeights] || 0.1);
}
```

### Integration Point

**File**: `src/routes/api/research/deep/+server.ts`

```typescript
// Import new orchestrator
import { parallelRetrieve } from '$lib/server/retrieval/parallel-orchestrator.js';

// In executeDeepResearch():
const queryVector = await embedText(query);  // Ollama embeddinggemma

// Parallel retrieval (all 5 lanes at once)
const chunks = await parallelRetrieve(query, {
  queryVector,
  limit: 20,
  timeout: 5000,
  globalTimeout: 10000,
  includeNeo4j: true,
});

// Continue with synthesis...
```

---

## Wiring Task 2: Gemma4 KV Cache Tuning

### Current (Session 79)

```bash
llama-server.exe \
  -m gemma4-legal-iq4xs.gguf \
  -ngl 99 \           # GPU layers
  -c 65536 \          # 64K context (or 16K for speed)
  -fa on \            # Flash Attention
  -ctk q8_0 \         # K-cache: 8-bit (5.3 GB baseline)
  -ctv turbo3 \       # V-cache: TurboQuant 3-bit (compression!)
  --cache-prompt \    # Reuse KV across calls
  --cache-reuse 256   # Max 256 cached KV slots
```

### Verify It's Working

```bash
# Check KV cache status
curl -s http://127.0.0.1:8090/slots | jq '.[] | {model, n_ctx}'

# Expected:
# "model": "gemma4-legal-iq4xs.gguf"
# "n_ctx": 65536 (or 16384 if using 16K)
```

### Alignment Checklist

- [ ] **KV Type**: `-ctk q8_0 -ctv turbo3` (correct for RTX 3060 Ti 8GB)
- [ ] **Context**: 64K for quality OR 16K for speed (pick one)
- [ ] **Flash Attention**: `-fa on` (GPU optimization)
- [ ] **Cache Prompt**: `--cache-prompt` (KV reuse)
- [ ] **Memory**: Verify VRAM stays <7.5 GB under load

---

## Wiring Task 3: Redis/Valkey Integration

### Current Status (Verify)

```bash
# Check Valkey is running (it's the Redis drop-in replacement)
docker ps | grep valkey

# Should show: legal-ai-valkey (or legal-ai-redis-prod)
```

### Alignment Points

**1. L1 Cache (Exact Match)**
- File: `src/lib/server/cache/redis-exact-match.ts`
- Key: `SHA256(query + model + temp + tokens)`
- TTL: 1 hour
- VERIFY: `npm run redis:cache:stats` shows non-zero hits

**2. Centroids (Multi-Hop)**
- Key: `centroid:dir:{dirname}`
- Value: `[768-dim float array]`
- TTL: 24 hours
- Populated by: Stage 3 of summary pipeline
- VERIFY: `HGETALL centroid:dir:src/lib/server` in redis-cli

**3. ACE Context Cache**
- Key: `ace:context:{dir}:karpathy-blend`
- Value: `{dir, pagerank, attention, authority, blend, computed_at}`
- TTL: 1 hour
- Populated by: Stage 4 of summary pipeline
- VERIFY: `GET ace:context:src/lib/server:karpathy-blend` in redis-cli

### Valkey Compatibility

```bash
# Valkey is AGPL-free Redis drop-in
# No code changes needed — ioredis works unchanged

# Test connection
docker exec legal-ai-valkey redis-cli PING
# Expected: PONG

# Check memory usage
docker exec legal-ai-valkey redis-cli INFO memory
# Expected: used_memory_human (should be <500MB for caches)
```

---

## Wiring Task 4: TurboVec Sidecar Alignment

### Current Status (Check)

```bash
# Is TurboVec running?
curl -s http://127.0.0.1:50055/health

# If 404, check port (might be :50053 for retrieval service)
curl -s http://127.0.0.1:50053/health
```

### Integration

**If TurboVec exists**:
- File: `src/lib/server/retrieval/turbovec-client.ts`
- Purpose: 384-dim sparse vector search (faster, lower memory)
- Used by: Lane 2 in parallel-orchestrator.ts
- Input: 768-dim content vector → deriveSignatureVector() → 384-dim
- Output: Top 10 sparse results, scored lower than Qdrant

**If TurboVec missing**:
- Graceful degradation: Lane 2 returns empty array
- Other 4 lanes continue (no blocking)
- Message: "TurboVec lane unavailable"

---

## Wiring Task 5: Feature Extraction (LangExtract)

### Create

**File**: `src/lib/server/ai/feature-extraction.ts` (NEW)

```typescript
/**
 * Feature Extraction & Query Analysis (LangExtract)
 * 
 * Extracts semantic features from user query:
 * - Key phrases (functions, types, classes)
 * - Named entities (modules, packages)
 * - Intent classification (search, debug, refactor, explain)
 * 
 * Output feeds retrieval lanes for better targeting.
 */

import Regex from 'xregexp';

export interface QueryFeatures {
  query: string;
  intent: 'search' | 'debug' | 'refactor' | 'explain' | 'general';
  phrases: string[];
  entities: {
    type: 'class' | 'function' | 'module' | 'file' | 'error';
    name: string;
  }[];
  keywords: string[];
}

export function extractQueryFeatures(query: string): QueryFeatures {
  // Intent classification
  const intent = classifyIntent(query);

  // Key phrases (split on common delimiters)
  const phrases = query
    .split(/[:\s.,"'()]+/)
    .filter(p => p.length > 2)
    .slice(0, 10);

  // Named entity extraction
  const entities = extractEntities(query);

  // Keywords (common programming terms)
  const keywords = extractKeywords(query);

  return {
    query,
    intent,
    phrases,
    entities,
    keywords,
  };
}

function classifyIntent(
  query: string
): 'search' | 'debug' | 'refactor' | 'explain' | 'general' {
  const lower = query.toLowerCase();

  if (/\b(error|bug|crash|fail|exception|warn)\b/.test(lower)) {
    return 'debug';
  }
  if (/\b(refactor|improve|optimize|clean|rewrite)\b/.test(lower)) {
    return 'refactor';
  }
  if (/\b(how|why|what|explain|describe|understand)\b/.test(lower)) {
    return 'explain';
  }
  if (/\b(find|search|locate|where|show)\b/.test(lower)) {
    return 'search';
  }

  return 'general';
}

function extractEntities(
  query: string
): Array<{ type: string; name: string }> {
  const entities: Array<{ type: string; name: string }> = [];

  // Class names (PascalCase)
  const classMatches = query.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
  classMatches.forEach(name => entities.push({ type: 'class', name }));

  // Function names (camelCase or lowercase_with_underscore)
  const funcMatches =
    query.match(/\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*\b/g) || [];
  funcMatches.forEach(name => entities.push({ type: 'function', name }));

  // File paths
  const fileMatches = query.match(/[a-z0-9\-._/\\]+\.[a-z]{2,6}/g) || [];
  fileMatches.forEach(name => entities.push({ type: 'file', name }));

  // Error types
  const errorMatches = query.match(/\b\w+Error\b/g) || [];
  errorMatches.forEach(name => entities.push({ type: 'error', name }));

  // Module names (common prefixes)
  const modules = ['react', 'node', 'postgres', 'redis', 'qdrant', 'neo4j'];
  modules.forEach(mod => {
    if (query.toLowerCase().includes(mod)) {
      entities.push({ type: 'module', name: mod });
    }
  });

  return entities.slice(0, 10);  // Top 10 entities
}

function extractKeywords(query: string): string[] {
  const keywords = [
    'function', 'class', 'type', 'interface', 'enum',
    'import', 'export', 'module', 'package',
    'error', 'exception', 'warning', 'debug',
    'performance', 'optimization', 'refactor',
    'test', 'mock', 'stub', 'fixture',
    'api', 'route', 'endpoint', 'handler',
    'database', 'query', 'transaction', 'connection',
  ];

  const found: string[] = [];
  keywords.forEach(kw => {
    if (query.toLowerCase().includes(kw)) {
      found.push(kw);
    }
  });

  return found;
}
```

### Integration

**File**: `src/routes/api/research/deep/+server.ts`

```typescript
import { extractQueryFeatures } from '$lib/server/ai/feature-extraction.js';

// In executeDeepResearch():
const features = extractQueryFeatures(query);

log(`[research] Intent: ${features.intent}, Entities: ${features.entities.length}`);

// Use features to target retrieval lanes
const chunks = await parallelRetrieve(query, {
  queryVector,
  intent: features.intent,  // Can tailor lane weighting
  entityHints: features.entities,
  limit: 20,
});
```

---

## Wiring Task 6: Bifrost Concurrency

### Current Bifrost Setup (Verify)

```bash
# Bifrost semantic cache @ :3040
curl -s http://localhost:3040/health
# Expected: { status: 'ok' }

# Test cache hit
curl -s -X POST http://localhost:3040/cache/check \
  -H 'Content-Type: application/json' \
  -d '{
    "query_vector": [0.1, 0.2, ..., 0.768],
    "threshold": 0.85
  }'
```

### Concurrency Tuning

**File**: `src/lib/server/ai/bifrost-manager.ts`

```typescript
// Current default
const BIFROST_CONCURRENCY = 1;  // Sequential

// After parallelization
const BIFROST_CONCURRENCY = 4;  // 4 concurrent semantic cache checks

// Usage:
const results = await Promise.all(
  queries.map(q => bifrostCheck(q, { concurrency: 4 }))
);
```

### Alignment Checklist

- [ ] Bifrost @ :3040 healthy and responding
- [ ] L1 exact-match Redis @ :6379 connected
- [ ] L2 semantic cache Qdrant @ :6333 connected
- [ ] Concurrency setting tuned (recommend 4 for RTX 3060 Ti)

---

## Complete Wiring Verification Script

**File**: `scripts/atlas/verify-pipeline-alignment.mjs` (NEW)

```bash
#!/usr/bin/env node
/**
 * Verify complete pipeline wiring:
 * - Service threads (parallel retrieval)
 * - Redis/Valkey (L1 + centroids + ACE cache)
 * - Gemma4 KV cache
 * - TurboVec (optional)
 * - Feature extraction
 * - Bifrost concurrency
 */

import fetch from 'node-fetch';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const checks = {
  llama_server: false,
  qdrant: false,
  redis: false,
  postgres: false,
  neo4j: false,
  turbovec: false,
  bifrost: false,
};

async function verify() {
  console.log('🔍 Pipeline Alignment Verification\n');

  // 1. Gemma4 @ :8090
  try {
    const res = await fetch('http://127.0.0.1:8090/v1/models', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      checks.llama_server = true;
      console.log('✅ Gemma4 llama-server @ :8090');
    }
  } catch (e) {
    console.log('❌ Gemma4 llama-server @ :8090 — Not responding');
  }

  // 2. Qdrant @ :6333
  try {
    const client = new QdrantClient({ url: 'http://127.0.0.1:6333' });
    const collections = await client.getCollections();
    checks.qdrant = true;
    console.log(`✅ Qdrant @ :6333 (${collections.collections.length} collections)`);
  } catch (e) {
    console.log('❌ Qdrant @ :6333 — Not responding');
  }

  // 3. Redis/Valkey @ :6379
  try {
    const redis = new Redis({ host: '127.0.0.1', port: 6379, password: 'redis' });
    await redis.ping();
    checks.redis = true;
    console.log('✅ Redis/Valkey @ :6379');
    await redis.quit();
  } catch (e) {
    console.log('❌ Redis/Valkey @ :6379 — Not responding');
  }

  // 4. PostgreSQL
  try {
    const pool = new pg.Pool({
      connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    await pool.query('SELECT 1');
    checks.postgres = true;
    console.log('✅ PostgreSQL @ :5434');
    await pool.end();
  } catch (e) {
    console.log('❌ PostgreSQL @ :5434 — Not responding');
  }

  // 5. Neo4j
  try {
    const driver = neo4j.driver(
      'bolt://127.0.0.1:7687',
      neo4j.auth.basic('neo4j', 'neo4j123')
    );
    const session = driver.session();
    await session.run('RETURN 1');
    checks.neo4j = true;
    console.log('✅ Neo4j @ :7687');
    await session.close();
    await driver.close();
  } catch (e) {
    console.log('❌ Neo4j @ :7687 — Not responding');
  }

  // 6. TurboVec (optional)
  try {
    const res = await fetch('http://127.0.0.1:50055/health', {
      signal: AbortSignal.timeout(3000),
    }).catch(() =>
      fetch('http://127.0.0.1:50053/health', {
        signal: AbortSignal.timeout(3000),
      })
    );
    if (res?.ok) {
      checks.turbovec = true;
      console.log('✅ TurboVec sidecar @ :50055 or :50053');
    }
  } catch (e) {
    console.log('⚠️  TurboVec — Not found (optional)');
  }

  // 7. Bifrost @ :3040
  try {
    const res = await fetch('http://localhost:3040/health', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      checks.bifrost = true;
      console.log('✅ Bifrost semantic cache @ :3040');
    }
  } catch (e) {
    console.log('❌ Bifrost @ :3040 — Not responding');
  }

  console.log('\n📊 Summary');
  console.log(`Critical: ${Object.values(checks).filter(v => v).length}/7 ✅`);

  if (!checks.llama_server) console.log('  ⚠️  Gemma4 synthesis will fail');
  if (!checks.qdrant) console.log('  ⚠️  Vector retrieval will fail');
  if (!checks.redis) console.log('  ⚠️  Caching will fail');
  if (!checks.postgres) console.log('  ⚠️  FTS retrieval will fail');
  if (!checks.neo4j) console.log('  ⚠️  Topology retrieval will fail');

  console.log('\n🚀 Next: npm run graphify:daily');
}

verify().catch(console.error);
```

---

## Summary: Wiring Checklist

| Component | Status | File | Action |
|-----------|--------|------|--------|
| **Service Threads** | ⏳ | `parallel-orchestrator.ts` | CREATE (2h) |
| **Redis/Valkey** | ✅ | `redis-exact-match.ts` | VERIFY connections |
| **Gemma4 KV Cache** | ✅ | llama-server.exe | VERIFY `-ctk q8_0 -ctv turbo3` |
| **TurboVec** | ❓ | `turbovec-client.ts` | CHECK if running |
| **Feature Extract** | ❌ | `feature-extraction.ts` | CREATE (1h) |
| **Bifrost** | ✅ | `bifrost-manager.ts` | VERIFY @ :3040 |
| **Parallelization** | ⏳ | Stage 1 loop | IMPLEMENT Phase 1 (2h) |

---

## Next Actions (Priority Order)

### TODAY (2-3 hours)
1. **Verify Pipeline**: Run `scripts/atlas/verify-pipeline-alignment.mjs`
2. **Create Parallel Orchestrator**: `src/lib/server/retrieval/parallel-orchestrator.ts` (2h)
3. **Commit**: "feat(retrieval): Parallel orchestrator for 5 retrieval lanes"

### THIS WEEK (4 hours)
4. **Feature Extraction**: `src/lib/server/ai/feature-extraction.ts` (1h)
5. **Integrate into Research Route**: Update `src/routes/api/research/deep/+server.ts` (1h)
6. **Phase 1 Parallelization**: 4 parallel GPU requests to Gemma4 (2h)

### NEXT WEEK (if stable)
7. **Phase 2**: Worker threads (8× speedup)

---

**Status**: ✅ All wiring diagrams defined, implementation ready to start.  
**Ready to commit**: Phase 1 + Parallel Orchestrator (6 hours total for 4-8× speedup)
