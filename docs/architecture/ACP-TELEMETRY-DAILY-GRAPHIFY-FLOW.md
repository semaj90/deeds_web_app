# ACP Telemetry + Daily Graphify: Canonical Task Pipeline

**Date**: June 30, 2026  
**Context**: Phase C Option B execution requires clean integration of agentic control plane (ACP) telemetry with daily background indexing (graphify).

---

## Problem Statement

Current state (scattered):
- Telemetry writes to packet_centric_telemetry (optional)
- Graphify runs daily but doesn't read telemetry
- ACP decisions aren't logged structurally
- Daily indexing doesn't adjust weights based on retrieval signals
- RL training data isn't collected

**Required**: Single canonical flow where telemetry informs daily decisions.

---

## Canonical ACP Decision Cycle

### Stage 1: Query Arrives

```
User: "auth session validation"
  ↓
TS orchestrator (src/lib/server/ace/query-router.ts)
  ├─ story_id: gen_uuid()
  ├─ task_id: gen_uuid()
  ├─ created_at: now()
  └─ routing_decision: PENDING
```

### Stage 2: Routing Decision

```
decision_type ∈ { CACHE_HIT, SKIP_RERANK, GPU_RERANK, SEMANTIC_SEARCH, GRAPH_EXPAND }

switch(candidate_count) {
  case < 5:  decision = SKIP_RERANK;       reason = "too few candidates"
  case 5-500: decision = GPU_RERANK;        reason = "batch size in sweet spot"
  case > 500: decision = SKIP_RERANK;       reason = "batch too large"
}

INSERT INTO acp_decisions (
  story_id, task_id, decision, candidate_count, 
  confidence_score, reasoning_json, created_at
) VALUES (...);
```

### Stage 3: Retrieval Execution

```
Parallel lanes:
  ├─ Redis cache check (5ms)
  ├─ Qdrant ANN (100-200ms)
  ├─ Topology prefilter (10-20ms)
  └─ (optional) Neo4j expansion (50ms)
  
Merge results via RRF fusion
Sort by confidence

INSERT INTO retrieval_traces (
  story_id, task_id, query, lane, 
  candidate_count, cache_hit, latency_ms, 
  telemetry_json, created_at
) VALUES (...);
```

### Stage 4: GPU Rerank (if triggered)

```
rerank_decision ∈ { CACHE_HIT, DIRECT_GPU, FALLBACK_CPU }

if (shouldRerank(candidates.length)) {
  const rerank_start = Date.now();
  
  result = await reankWithGraphCache(queryVec, candidates);
  
  const rerank_latency = Date.now() - rerank_start;
  
  INSERT INTO gpu_rerank_telemetry (
    story_id, task_id, batch_size, 
    rerank_decision, cache_hit, latency_ms, 
    telemetry_json, created_at
  ) VALUES (...);
}
```

### Stage 5: Synthesis

```
Gemma4 answer generation
  ↓
Log final trace

INSERT INTO synthesis_traces (
  story_id, task_id, token_count, 
  latency_ms, model, temperature, 
  created_at
) VALUES (...);
```

---

## Telemetry Tables: What Gets Logged

### acp_decisions
```sql
CREATE TABLE acp_decisions (
  story_id UUID PRIMARY KEY,
  task_id UUID,
  decision ENUM('CACHE_HIT','SKIP_RERANK','GPU_RERANK','SEMANTIC_SEARCH','GRAPH_EXPAND'),
  candidate_count INT,
  confidence_score REAL,
  reasoning_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### retrieval_traces
```sql
CREATE TABLE retrieval_traces (
  story_id UUID,
  task_id UUID,
  query TEXT,
  lane ENUM('redis','qdrant','topology','neo4j','hybrid'),
  candidate_count INT,
  cache_hit BOOLEAN,
  latency_ms REAL,
  telemetry_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### gpu_rerank_telemetry
```sql
CREATE TABLE gpu_rerank_telemetry (
  story_id UUID,
  task_id UUID,
  batch_size INT,
  rerank_decision ENUM('CACHE_HIT','DIRECT_GPU','FALLBACK_CPU'),
  cache_hit BOOLEAN,
  latency_ms REAL,
  telemetry_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### synthesis_traces
```sql
CREATE TABLE synthesis_traces (
  story_id UUID,
  task_id UUID,
  token_count INT,
  latency_ms REAL,
  model TEXT,
  temperature REAL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Daily Graphify: Reads Telemetry

### Morning (6 AM UTC): Run daily graphify

```bash
npm run graphify:daily:from-telemetry
```

### What graphify does (NEW)

**Old flow**:
```
graphify → index all files → recompute authority → done
```

**New flow (Phase C)**:
```
graphify
  ├─ Read telemetry from past 24h (acp_decisions + retrieval_traces)
  ├─ Identify "hot" packets (queried multiple times)
  ├─ Identify "cold" packets (never queried)
  ├─ Identify "misprioritized" packets (low confidence rerank)
  ├─ Re-weight authority based on query signals
  ├─ Update Qdrant payload tags: hot/cold/trending
  ├─ Update Neo4j authority scores
  ├─ Update Redis Karpathy blend (0.4·PR + 0.3·attention + 0.3·authority)
  └─ Log summary to Postgres
```

### Implementation: graphify:daily:from-telemetry

```typescript
// scripts/graphify/daily-from-telemetry.mts

async function main() {
  // 1. Read telemetry from past 24h
  const traces = await db
    .select()
    .from(retrievalTraces)
    .where(gte(retrievalTraces.created_at, sql`NOW() - INTERVAL '24 hours'`));

  // 2. Aggregate signals per packet
  const signals = new Map<string, {
    query_count: number,
    avg_confidence: number,
    cache_hit_rate: number,
    avg_latency_ms: number,
    is_trending: boolean,
  }>();

  for (const trace of traces) {
    const packet_key = extractPacketKeyFromQuery(trace.query);
    const signal = signals.get(packet_key) ?? {
      query_count: 0,
      avg_confidence: 0,
      cache_hit_rate: 0,
      avg_latency_ms: 0,
      is_trending: false,
    };
    
    signal.query_count++;
    signal.avg_confidence = (signal.avg_confidence + trace.confidence_score) / 2;
    signal.cache_hit_rate = (signal.cache_hit_rate + (trace.cache_hit ? 1 : 0)) / 2;
    signal.avg_latency_ms = Math.max(signal.avg_latency_ms, trace.latency_ms);
    
    signals.set(packet_key, signal);
  }

  // 3. Tag packets as hot/cold/trending
  const hot_threshold = 10;  // queries/day
  const trending_threshold = 5;

  for (const [packet_key, signal] of signals) {
    const tags = [];
    
    if (signal.query_count >= hot_threshold) {
      tags.push('hot');
    } else if (signal.query_count >= trending_threshold) {
      tags.push('trending');
    }
    
    if (signal.cache_hit_rate < 0.3) {
      tags.push('misprioritized');
    }

    // Update Qdrant payload
    await updateQdrantPayload(packet_key, { tags });
  }

  // 4. Recompute Karpathy blend
  await recomputeKarpathyBlend();

  // 5. Log summary
  await insertGraphifyRun({
    run_date: new Date(),
    packets_processed: signals.size,
    hot_count: Array.from(signals.values()).filter(s => s.query_count >= hot_threshold).length,
    trending_count: Array.from(signals.values()).filter(s => s.query_count >= trending_threshold).length,
    summary: JSON.stringify({ signals }),
  });
}
```

---

## RL Training Data: Post-Phase C Preparation

### What we log NOW (Phase C)

✅ Query text
✅ Candidates shown
✅ Rerank order
✅ Latency
✅ Cache hit rate
✅ Confidence score
✅ Decision made (GPU rerank or skip)

### What we need to add LATER (Phase D+)

⏳ User outcome (clicked, rejected, dwelt)
⏳ Outcome label (good / bad / neutral)
⏳ Time-to-click (dwell seconds)
⏳ Downstream task success/failure

### RL training loop (Phase E+)

```
1. Batch collect data (7 days of traces)
2. Label outcomes (manual or heuristic)
3. Create training dataset (query, candidates, rerank_order, outcome)
4. Train PyTorch policy (MLP router: query_emb + candidate_embs → logits)
5. Evaluate on holdout set
6. A/B test in production
7. Log A/B results back to telemetry
```

**For now (Phase C)**: Just log the signals. RL comes later.

---

## Service Dependencies for Phase C Telemetry

### Required

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| Postgres | 5432 | Telemetry tables | ✅ Ready |
| Redis | 6379 | Cache + locks | ⚠️ Down, needs restart |
| Qdrant | 6333 | ANN search | ✅ Ready |
| Ollama | 11434 | Embeddings | ✅ Ready |
| TurboQuant | 8090 | GPU synthesis | ✅ Ready |
| tensorrt_bridge.node | N-API | GPU rerank | ✅ Ready |

### Optional (can skip for Phase C)

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| Topology Search | 8101 | 4D prefilter | ⏳ Not running (can degrade) |
| Langfuse | 3000 | External traces | ⏳ Not needed yet |
| ClickHouse | 9000 | High-volume telemetry | ⏳ Not needed yet |

---

## Phase C Option B Execution Order

### Step 1: Start required services

```bash
docker-compose up legal-ai-redis
docker-compose up legal-ai-qdrant
docker-compose up legal-ai-postgres
# Ollama + TurboQuant should already be running
```

### Step 2: Create telemetry tables

```bash
npm run db:migrate  # Applies new schema
```

### Step 3: Wire telemetry assembly in query-router.ts

```typescript
// After GPU rerank, before response
const telemetry = {
  story_id,
  task_id,
  query,
  candidate_count,
  ranked_count,
  cache_hit,
  retrieval_latency_ms,
  rerank_latency_ms,
  total_latency_ms,
  confidence_score,
  telemetry_json,
  created_at: new Date(),
};

await db.insert(retrievalTraces).values(telemetry);
```

### Step 4: Test end-to-end

```bash
npm run test:cuda-graph-rerank  # Integration test
npm run bench:cuda-graph-cache  # Benchmark
npm run test:e2e-telemetry      # New: telemetry write test
```

### Step 5: Run daily graphify to validate

```bash
npm run graphify:daily:from-telemetry
```

### Step 6: Make go/no-go decision

Check success criteria:
- [ ] Telemetry rows written (> 100 in first hour)
- [ ] Cache hit rate > 50%
- [ ] GPU rerank latency < 50ms
- [ ] Graphify processes telemetry without errors
- [ ] Daily blend scores updated in Redis

**If all pass**: Proceed to full Option B (provenance + gates).

---

## Success Metrics for Phase C

| Metric | Target | Measurement |
|--------|--------|-------------|
| Telemetry write latency | <20ms | SELECT AVG(write_latency_ms) FROM telemetry_audit |
| Cache hit rate | >50% | SELECT cache_hit_count / total FROM retrieval_traces |
| GPU rerank latency | <50ms | SELECT AVG(latency_ms) FROM gpu_rerank_telemetry WHERE decision='GPU_RERANK' |
| Graphify daily run time | <5min | SELECT runtime_ms FROM graphify_runs WHERE run_date=TODAY() |
| Misprioritized packets detected | >5% | SELECT COUNT(*) FROM packets WHERE tags @> '["misprioritized"]' |

---

## References

- `PHASE-C-OPTION-B-ARCHITECTURE-DECISION.md` — Datastores + GPU boundary
- `SESSION-98-E2E-TESTING-PLAN.md` — Telemetry verification gates
- `PHASE-B-MULTI-PASS-ENRICHMENT-COMPLETE.md` — Variant tracking setup
- `provenance-first-architecture.md` — 4-tier identity/variance separation
