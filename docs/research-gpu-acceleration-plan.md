# Research GPU Acceleration Plan — Concurrent-Deep + Summary Pipeline

**Goal**: Accelerate concurrent-deep research (`POST /api/research/concurrent-deep/stream`) with GPU llama-server, summary indexing, cosine similarity error recommendations, and full integration into ACE/KAG/DAG/Bifrost/Go-Retrieval pipeline.

**Status**: Planning phase (validation needed)  
**Effort**: 3-5 sprints (60-100 hours)  
**Payoff**: 5-10× faster research synthesis + semantic error clustering

---

## Current Architecture (Baseline)

```
POST /api/research/concurrent-deep/stream
  ├─ supervisorPlan(query)          [Ollama gemma3-legal]
  ├─ Promise.allSettled(
  │   domains.map(domain =>
  │     runWorker(domain, query, limit)
  │   )
  │ )
  │   ├─ embedText(augmentedQuery)   [Ollama embeddinggemma, 768-dim]
  │   ├─ searchQdrant(vector, ...)   [Qdrant, 2-stage tag→path, then topo-expand]
  │   ├─ extractStructured(          [Ollama gemma3-legal, L1→L2→L3 cache]
  │   │   WorkerSynthesisSchema
  │   │ )
  │   └─ return WorkerFinding        [emit via SSE]
  │
  ├─ supervisorMerge(findings)       [Ollama gemma3-legal, compile results]
  └─ persistGraph(...)               [DB: research_summaries, context_timeline]

Timing: 45s per domain, up to 11 domains = 45s serialized or 45s parallel
Performance: Ollama CPU bound → sequential bottleneck on embeddings + synthesis
```

---

## 3-Phase Optimization Roadmap

### Phase A: GPU + Batching (Weeks 1-2)

**Goal**: Move embedding + synthesis to GPU llama-server.exe + batch 500 chunks at once.

#### A1: Wire GPU llama-server for Gemma4

**Current**:
```typescript
// sveltekit-frontend/src/lib/server/ai/langgraph-research.ts:429
const vector = await embedText(augmentedQuery);  // Ollama :11434
const synthesis = await extractStructured(WorkerSynthesisSchema, ...);  // Ollama :11434
```

**New** (A1):
```typescript
// Use TurboQuant llama-server.exe (:8090) for synthesis
// Keep embeddinggemma (:11434) for embeddings (smaller, faster)

const vector = await embedText(augmentedQuery);  // Ollama :11434 (embeddinggemma:latest)
const synthesis = await extractStructuredGPU(WorkerSynthesisSchema, ...);
  // ↓ POST :8090/v1/chat/completions (Gemma4 FullQuant, GPU)
```

**Files**:
- `src/lib/server/ai/langgraph-research.ts` (update synthesis call)
- `src/lib/server/ai/inference-configs.ts` (add Gemma4 config for research synthesis)

**Test**: Measure latency of synthesis on GPU vs CPU (baseline: 2-3s per domain on CPU, target: 200-400ms on GPU).

---

#### A2: Batch Summary Embedding (500 chunks at a time)

**Current** (summary pipeline):
```bash
npm run atlas:summary:all:apply
# Stage 2: Sequential embedding via Ollama
#   for (const chunk of chunks) {
#     embedding = await embedText(chunk.summary);  // 1 at a time
#   }
```

**New** (A2):
```typescript
// Create batch embedding function in src/lib/server/ai/langgraph-research.ts

async function batchEmbedSummaries(summaries: string[], batchSize = 500): Promise<number[][]> {
  const batches = chunk(summaries, batchSize);
  const results = [];

  for (const batch of batches) {
    // Call llama-server (:8090) with batch mode or loop with keep-alive
    // POST :8090/v1/embeddings { input: batch, model: 'embeddinggemma:latest' }
    const embeddings = await embedBatch(batch);  // NEW
    results.push(...embeddings);
  }

  return results;
}

// Update summary pipeline Stage 2:
// await batchEmbedSummaries(toEmbed.rows.map(r => r.summary), 500);
```

**Files**:
- `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` (Stage 2 refactor)
- `src/lib/server/ai/langgraph-research.ts` (new `batchEmbedSummaries` function)

**Test**: Measure throughput (baseline: 1 chunk/50ms = 20 chunks/s; target: 500 chunks/5s = 100 chunks/s with batching).

---

#### A3: PowerShell Launcher for TurboQuant

**Goal**: Standardized GPU llama-server startup with KV cache tuning.

**Files**:
- `scripts/launch-turboquant-research.ps1` (NEW)

```powershell
# scripts/launch-turboquant-research.ps1
# Launches llama-server.exe configured for concurrent-deep research synthesis
# Balances context length (16K) with KV cache compression (turbo3)

param(
  [string]$LlamaServerPath = 'C:\path\to\llama-server.exe',
  [int]$GpuLayers = 99,
  [int]$ContextLength = 16384,
  [string]$KvCacheType = 'turbo3'  # or 'q8_0' for stock llama.cpp
)

$env:LLAMA_CPU_THREADS = [Environment]::ProcessorCount
$port = 8090

Write-Host "🚀 Launching TurboQuant llama-server for concurrent-deep research..."
Write-Host "Port: $port | Context: $ContextLength | KV: $KvCacheType | GPU Layers: $GpuLayers"

& $LlamaServerPath `
  -m 'C:\path\to\gemma4-legal-iq4xs.gguf' `
  -ngl $GpuLayers `
  -c $ContextLength `
  -p $port `
  -fa on `
  -ctk q8_0 `
  -ctv $KvCacheType `
  --cache-prompt `
  --cache-reuse 256
```

**Usage**:
```bash
# From Windows (native PowerShell)
.\scripts\launch-turboquant-research.ps1

# From WSL2 bash
pwsh scripts/launch-turboquant-research.ps1

# Health check (bash)
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0].id'
```

---

### Phase B: Distributed Chunking (Weeks 3)

**Goal**: Run chunk processing across multiple worker threads (avoid blocking the main thread during backfill).

#### B1: Worker Thread Pool for Summary Backfill

**Current**:
```typescript
// Stage 1: Sequential Gemma4 calls
for (const chunk of missingChunks) {
  const summary = await callGemma4(chunk.content);  // Main thread blocks
}
```

**New** (B1):
```typescript
// Use worker-thread pool via Piscina or Node.js Worker Threads

import { Worker } from 'worker_threads';

const workerPool = createWorkerPool(8);  // 8 workers, one per CPU core

const summaries = await Promise.all(
  missingChunks.map(chunk => 
    workerPool.run({ chunkId: chunk.id, content: chunk.content })
  )
);

// Each worker:
// 1. Call Gemma4 (:8090) with chunk content
// 2. Update DB via dedicated connection pool
// 3. Return summary
```

**Files**:
- `scripts/atlas/summary-ranking-retrieval-pipeline.mjs` (Stage 1 refactor)
- `scripts/workers/summary-backfill-worker.mjs` (NEW)

**Performance**: 8 parallel Gemma4 calls vs 1 sequential = 8× speedup (limited by llama-server throughput, not parallelism).

---

### Phase C: Integration into ACE/KAG/DAG/Bifrost/Go-Retrieval (Weeks 4-5)

**Goal**: Wire summaries + embeddings + centroids into the full retrieval pipeline.

#### C1: Summary-Backed Error Recommendations (Cosine Similarity)

**Current**:
```typescript
// Error analysis uses Neo4j graph + heuristics
// POST /api/error-analysis
//   → Neo4j: MATCH (e:Error) WHERE ... RETURN e
//   → Manual heuristic scoring
```

**New** (C1):
```typescript
// Error analysis uses Qdrant cosine similarity on summary embeddings

async function findSimilarErrorPatterns(errorPattern: string): Promise<string[]> {
  // 1. Embed error pattern
  const errorVector = await embedText(errorPattern);  // 768-dim

  // 2. Search Qdrant for similar summary embeddings in 'error-patterns' domain
  const similar = await searchQdrant(
    errorVector,
    'content',          // Named vector
    20,                 // Top 20
    ['error'],          // Domain filter
    undefined           // No path filter
  );

  // 3. Return ranked error recommendations
  return similar.map(chunk => ({
    file: chunk.path,
    summary: chunk.meta?.summary,
    score: chunk.score,      // Cosine similarity [0, 1]
    domain: 'error-patterns',
  }));
}

// Integrate into POST /api/error-analysis:
const recommendations = await findSimilarErrorPatterns(userError);
return json({ recommendations, ... });
```

**Files**:
- `src/routes/api/error-analysis/+server.ts` (add summary-backed recommendation)
- `src/lib/server/ai/langgraph-research.ts` (export helper function)

**Test**: User reports TypeScript error → system returns top-5 similar errors from codebase with fixes applied.

---

#### C2: Summary-Backed KAG (Knowledge-Augmented Generation)

**Current**:
```typescript
// KAG uses Neo4j schema validation + Drizzle type inference

async function kagValidation(code: string): Promise<ValidationResult> {
  const schema = await fetchNeo4jSchema();
  const types = await infertypesFromDrizzle();
  return validateAgainstSchema(code, schema, types);
}
```

**New** (C2):
```typescript
// KAG uses summary context from Qdrant for semantic validation

async function kagValidationWithSummary(code: string): Promise<ValidationResult> {
  // 1. Extract key phrases from code (functions, types, etc.)
  const keyPhrases = extractKeyPhrases(code);

  // 2. Search summaries for related code patterns
  const summaryContext = await Promise.all(
    keyPhrases.map(phrase => 
      searchQdrant(
        await embedText(phrase),
        'content',
        5,
        undefined,
        undefined
      )
    )
  );

  // 3. Synthesize validation rule from summaries
  const rule = await extractStructuredGPU(
    ValidationRuleSchema,
    `Related code patterns:\n${summaryContext.map(c => c.summary).join('\n')}`
  );

  // 4. Apply validation
  return validateAgainstRule(code, rule);
}
```

**Files**:
- `src/lib/server/rag-pipeline.ts` (add summary-backed KAG path)

---

#### C3: Summary → Bifrost L2 Semantic Cache

**Current**:
```typescript
// Bifrost caches LLM responses by semantic similarity
// Key: (model + messages + temperature)
// Value: LLM response

// But summaries aren't cached because they're not LLM outputs yet
```

**New** (C3):
```typescript
// Cache summary embeddings + recommendations in Bifrost

// Before running error recommendations:
const cacheKey = generateCacheKey('error-recommendation', errorPattern);
const cached = await bifrostCheck(cacheKey);

if (cached?.score > 0.85) {
  return cached.recommendations;  // Bifrost hit → 2-5s
}

// Cache miss → run full cosine similarity search
const recommendations = await findSimilarErrorPatterns(errorPattern);
await bifrostStore(cacheKey, recommendations, { ttl: 3600 });

return recommendations;  // 25-45s first time, 2-5s cached
```

**Files**:
- `src/lib/server/bifrost/bifrost-manager.ts` (add summary caching logic)
- `src/routes/api/error-analysis/+server.ts` (wire Bifrost checks)

---

#### C4: Summary → Go-Retrieval Multi-Hop Cache

**Current**:
```typescript
// Go-retrieval uses Redis centroids for directory-level traversal
// Key: centroid:dir:{dirname}
// Value: mean([embedding(chunk) for chunk in dir])
```

**New** (C4):
```typescript
// Go-retrieval uses summary embeddings for semantic cluster navigation

// Stage 3 (already in pipeline):
// centroid:dir:{dirname} = mean([summary_embedding(chunk) for chunk in dir])

// Go-retrieval multi-hop:
// 1. User query → Qdrant ANN → top chunk
// 2. Get chunk's directory → Redis centroid:dir:{dirname}
// 3. Expand: neighbors = findNeighborsInCluster(centroid, k=5)
// 4. Recursively traverse to adjacent directories
// 5. Compile findings from all hops

// This is already wired — just need summary embeddings populated (which pipeline does)
```

**Files**:
- No new files — integration is automatic once summaries are indexed

---

#### C5: DAG (Directed Acyclic Graph) Task Orchestration

**Current**:
```typescript
// Research follows linear path:
// supervisorPlan → workers (parallel) → supervisorMerge

// But Stage 1 (summary backfill) and concurrent-deep are independent
// Can be scheduled as DAG tasks
```

**New** (C5):
```typescript
// Create task DAG for nightly research + summary indexing

// DAG node 1: Summary backfill (Stage 1)
// DAG node 2: Summary embedding (Stage 2)  [depends on 1]
// DAG node 3: Redis centroids (Stage 3)    [depends on 2]
// DAG node 4: ACE cache warming (Stage 4)  [depends on 3]
// DAG node 5: Concurrent-deep research     [depends on 4, optional]

// Orchestrator: RabbitMQ queue or LangGraph state machine
// → Async task scheduling
// → Retry logic (failed Stage 1 → skip Stage 2-4)
// → Observability (context_timeline audit trail)

await queueTask('summary-backfill', { limit: 50000, priority: 1 });
await queueTask('summary-embedding', { batchSize: 500, priority: 2, dependsOn: 1 });
await queueTask('redis-centroids', { priority: 3, dependsOn: 2 });
await queueTask('ace-cache-warming', { priority: 4, dependsOn: 3 });
await queueTask('concurrent-deep-research', { priority: 5, dependsOn: 4 });

// Each task emits context_timeline events on start/complete/fail
```

**Files**:
- `src/lib/server/task-orchestrator.ts` (NEW, DAG runner)
- `scripts/nightly-research-dag.mjs` (NEW, cron task)

---

## Implementation Checklist

### Phase A (GPU + Batching)

- [ ] A1: Add Gemma4 inference config for research synthesis (GPU llama-server)
- [ ] A1: Update `runWorker()` to call GPU synthesis instead of Ollama CPU
- [ ] A1: Test latency improvement (baseline 2-3s → target 200-400ms per domain)
- [ ] A2: Create `batchEmbedSummaries()` function with 500-chunk batching
- [ ] A2: Refactor summary pipeline Stage 2 to use batch embedding
- [ ] A2: Test throughput (baseline 20 chunks/s → target 100 chunks/s)
- [ ] A3: Create `scripts/launch-turboquant-research.ps1` for TurboQuant startup
- [ ] A3: Document GPU launch procedure in README

### Phase B (Distributed Chunking)

- [ ] B1: Create worker thread pool via Piscina or Worker Threads
- [ ] B1: Create `scripts/workers/summary-backfill-worker.mjs`
- [ ] B1: Refactor Stage 1 to use worker pool (8 parallel workers)
- [ ] B1: Test 8× parallelism within llama-server throughput ceiling
- [ ] B1: Monitor CPU/GPU utilization during backfill

### Phase C (Full Integration)

- [ ] C1: Create `findSimilarErrorPatterns()` function using cosine similarity
- [ ] C1: Wire into `POST /api/error-analysis` endpoint
- [ ] C1: Test error recommendation quality
- [ ] C2: Add summary-backed KAG validation path
- [ ] C2: Test KAG precision improvements
- [ ] C3: Integrate Bifrost L2 caching for error recommendations
- [ ] C4: Verify Go-retrieval multi-hop uses summary centroids (automatic)
- [ ] C5: Create task DAG orchestrator with RabbitMQ
- [ ] C5: Create nightly cron task for full pipeline
- [ ] C5: Monitor via context_timeline audit trail

---

## Performance Targets

| Metric | Baseline | Target | Effort |
|--------|----------|--------|--------|
| **Synthesis latency per domain** | 2-3s | 200-400ms | Phase A1 |
| **Summary embedding throughput** | 20 chunks/s | 100 chunks/s | Phase A2 |
| **Stage 1 (50K chunks)** | 41.6h | 8.3h | Phase B1 |
| **Error recommendation latency (cold)** | N/A (no feature) | 5-10s | Phase C1 |
| **Error recommendation latency (cached)** | N/A | 2-5s (Bifrost L2) | Phase C3 |
| **Full pipeline (daily)** | N/A | 15-20 min | Phase C5 |

---

## Risk Mitigation

### Risk 1: GPU OOM (Out of Memory)
**Mitigation**: 
- Keep KV cache in q8_0 + V-cache in turbo3 (tested on RTX 3060 Ti 8GB)
- If OOM: reduce context length (16K → 8K) or use CPU fallback
- Add memory monitoring in worker threads

### Risk 2: llama-server Throughput Bottleneck
**Mitigation**:
- Batch size 500 is safe (fits memory)
- If sequential embedding is slower than parallel synthesis: reduce batch to 100
- Alternative: Use TensorRT-LLM embedding sidecar on different port

### Risk 3: Qdrant Payload Explosion
**Mitigation**:
- Summary embeddings are already in pgvector (768-dim halfvec)
- Only store summary text + score in Qdrant payload (already done)
- No additional storage beyond summary pipeline

### Risk 4: Cache Invalidation Complexity
**Mitigation**:
- Bifrost handles semantic similarity thresholds (configurable)
- ACE context TTL 1h (acceptable staleness)
- Redis centroids TTL 24h (can be refreshed nightly)

---

## References

- **Baseline**: `sveltekit-frontend/src/routes/api/research/concurrent-deep/stream/+server.ts`
- **Summary pipeline**: `scripts/atlas/summary-ranking-retrieval-pipeline.mjs`
- **LangGraph research**: `sveltekit-frontend/src/lib/server/ai/langgraph-research.ts`
- **Bifrost integration**: `sveltekit-frontend/src/lib/server/ai/bifrost-manager.ts`
- **Go-retrieval**: Parent Atlas retrieval contract + Redis centroid logic
- **Error analysis**: `sveltekit-frontend/src/routes/api/error-analysis/+server.ts` (when it exists)

---

**Next Step**: Start with Phase A1 (wire Gemma4 synthesis) — lowest effort, highest impact (2.5-6× latency improvement per domain).
