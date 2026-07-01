# Phase C Option B: Architecture Decision — Datastores & GPU Orchestration

**Date**: June 30, 2026  
**Status**: Decision checkpoint before full Option B execution  
**Objective**: Map datastores cleanly; define GPU sidecar boundary; establish telemetry pipeline

---

## The Problem: Too Many Layers

Current state (problematic):
- Postgres (truth) → Qdrant (mirror) → Redis (cache) → Neo4j (topology) → CouchDB (archive?) → ClickHouse (telemetry?)
- RAPIDS, cuVS, PyTorch, CUDA kernels all claimed but unclear ownership
- TensorRT bridge, LibTorch, simdjson overlapping
- Telemetry writes scattered (packet-centric, analysis-pass, GPU logs)

**This is too many layers.** Clean it up first.

---

## Clean Architecture: Canonical Datastores Only

### Tier 1: Canonical Truth (Postgres)

**Owns**: packet identity, lineage, variant tracking, decision audit trail

Tables:
- `atlas_packets` — packet_key, source_ref, summary, created_at
- `analysis_pass_results` — pass_key, packet_id, variant (enum: hard_fail / soft_warn / passed), reason, latency_ms, telemetry_json
- `retrieval_traces` — story_id, query, candidate_count, ranked_count, rerank_ms, cache_hit (enum: redis / qdrant / postgres / none)
- `acp_decisions` — task_id, decision (enum: skip / fetch / rerank / synthesize), reasoning_json, confidence_score, latency_ms

**Hard rule**: Every decision that affects packet state or ranking gets an audit row.

### Tier 2: ANN Search Mirror (Qdrant)

**Owns**: dense vector search only. Read-only from retrieval perspective.

Collections:
- `codebase_chunks_768` — 40.5K points, payload indexed by source_ref + feature_id
- Rebuilt from Postgres `codebase_chunk_index` on demand

**Hard rule**: Qdrant is a mirror. Rebuild from Postgres if diverged.

### Tier 3: Hot Cache (Redis/Valkey)

**Owns**: session state, locks, hot packet keys, temporary computations.

Keys:
- `bifrost:packet:{key}` — cached packet (TTL 5min)
- `bifrost:feature:{id}` — cached feature metadata (TTL 24h)
- `lock:packet:{key}` — distributed lock for concurrent writes
- `gpu:karpathy:scores` — GPU authority blend (TTL 24h)

**Hard rule**: Redis is ephemeral. Never rely on it for correctness; invalidate after Postgres writes.

### Tier 4: Topology Mirror (Neo4j)

**Owns**: relationship queries only. Read-only from retrieval.

Relationships:
- `IMPORTS`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY` (SOM edges)
- `SHARES_TAGS`, `USED_CONCEPT` (semantic relationships)

**Hard rule**: Neo4j is rebuilt from Postgres + Qdrant. Do not write to Neo4j directly from TypeScript.

### ~~Tier 5: Document Store~~ **REMOVE CouchDB**

**Decision**: CouchDB is not needed unless you specifically need document replication or offline sync. We don't.

**Action**: Delete references to CouchDB from Phase C roadmap.

### Optional Tier: Offline Analytics (DuckDB)

**Owns**: batch analysis, local exploration, reproducible reports.

**When to use**: After decisions are finalized in Postgres. Not in the hot path.

**Examples**:
- Batch GAN validation audit
- Offline feature importance ranking
- Reproducible experiment reports

### Optional Tier: High-Volume Telemetry (ClickHouse)

**Owns**: event streams when Postgres gets too heavy (>10K rows/min sustained).

**Current status**: Not needed yet. Postgres telemetry is fine for Phase C.

**When to add**: Post-Phase C, if telemetry row insert rate exceeds Postgres OLTP capacity.

---

## GPU Sidecar Boundary: What Belongs Where

### ✅ TypeScript Orchestrator (SvelteKit server)

**Owns**: HTTP routing, cache checks, Postgres reads, Qdrant queries, telemetry row assembly.

**Does NOT own**: Matrix multiplication, tensor allocation, GPU kernels.

Code lives in:
- `src/lib/server/ace/` — orchestration
- `src/routes/api/` — HTTP boundaries
- `scripts/atlas/` — CLI orchestration

### ✅ GPU Sidecar (Python worker or N-API bridge)

**Owns**: Tensor operations only.

**Available options** (pick one):

| Option | Technology | Pros | Cons | Effort |
|--------|-----------|------|------|--------|
| **A: N-API LibTorch** | tensorrt_bridge.node + LibTorch | No subprocess, low latency | C++ build complexity | 1 day (already done) |
| **B: Python FastAPI** | RAPIDS cuVS + PyTorch | Battle-tested, flexible | Subprocess overhead | 3-5 days |
| **C: Go service** | Go + libtorch bindings | High performance, simple deploy | Ecosystem smaller | 2-3 days |
| **D: CUDA kernels (DIY)** | Raw CUDA C++ | Maximum control | Maintenance burden | 5-7 days |

**Recommendation for Phase C**: Use Option A (N-API LibTorch via tensorrt_bridge.node). It's already integrated. Don't add Python or Go now.

### GPU Sidecar: What it does

```
TS app: "Rerank these 50 candidates"
  ↓
N-API bridge: allocate Float32Array matrix, call LibTorch cosine similarity
  ↓
Return: Float32Array of scores
  ↓
TS app: sort candidates by score, assemble telemetry row, write to Postgres
```

**Does NOT own**:
- Database writes
- HTTP responses
- Caching logic
- Telemetry assembly

---

## Message Formats: HTTP vs. Binary

### Small Requests: JSON over HTTP/gRPC

**When**: Single query, single result.

**Format**:
```json
{
  "query": "auth session validation",
  "limit": 50,
  "trace": { "story_id": "...", "task_id": "..." }
}
```

**Response**:
```json
{
  "hits": [{ "id": "...", "score": 0.95 }, ...],
  "cache_hit": "qdrant",
  "latency_ms": 145,
  "telemetry_id": "trace_123"
}
```

### Large Batches: NDJSON or Parquet

**When**: Batch re-embedding, bulk GAN audit, overnight indexing.

**Format**:
```ndjson
{"packet_key":"auth:001","embedding":[0.1,0.2,...]}
{"packet_key":"auth:002","embedding":[0.3,0.4,...]}
```

**Process**:
1. Write to temp file in `/scratch/batch-{uuid}.ndjson`
2. Stream to GPU sidecar or Qdrant bulk API
3. On success, upsert to Postgres `codebase_chunk_index`
4. Invalidate Redis keys
5. Delete temp file

### Binary Fast Path: Arrow IPC / MsgPack (ONLY if profiling proves JSON is too slow)

**Current status**: JSON is fine. Do NOT add Arrow/MsgPack yet.

**When to reconsider**: If GPU rerank latency > 50ms consistently (it's not; we measured 0-1ms).

---

## Telemetry Pipeline: Single Source of Truth

### Step 1: Assemble telemetry row in TypeScript

```typescript
const telemetry = {
  story_id: "story_123",
  task_id: "task_456",
  query: "auth session validation",
  candidate_count: 50,
  ranked_count: 50,
  cache_hit: "qdrant", // enum
  retrieval_latency_ms: 145,
  rerank_latency_ms: 12.3,
  total_latency_ms: 157.3,
  rerank_cache_hit: true, // GPU graph cache
  confidence_score: 0.92,
  telemetry_json: { /* full trace */ },
  created_at: new Date(),
};
```

### Step 2: Write to Postgres (append-only)

```sql
INSERT INTO retrieval_traces (
  story_id, task_id, query, candidate_count, ranked_count,
  cache_hit, retrieval_latency_ms, rerank_latency_ms, total_latency_ms,
  rerank_cache_hit, confidence_score, telemetry_json, created_at
) VALUES ($1, $2, $3, ...);
```

### Step 3: Optional: Export to Langfuse/ClickHouse (async, non-blocking)

```typescript
// Do NOT block retrieval on this
queueTelemetryExport(telemetry).catch(err => {
  console.warn('[telemetry] export failed (non-blocking):', err.message);
});
```

### Hard rules

- ✅ Write to Postgres FIRST (atomic, durable)
- ✅ Assemble telemetry in TS orchestrator (not GPU sidecar)
- ✅ Export is async and non-blocking
- ❌ Never rely on ClickHouse for correctness (it's analytics only)
- ❌ Never return to user before Postgres write succeeds

---

## Reinforcement Learning: Only AFTER signals are logged

### Current status: NOT READY FOR RL

RL requires:
1. Query logged
2. Candidates logged
3. Rerank order logged
4. User outcome (click / reject / dwell) logged
5. Success/failure labeling
6. Latency tracking

**We have**: 1, 2, 3, 4, 5, 6 ✅ (all in telemetry rows)

**We're missing**: User feedback integration + outcome labels

### Phase C RL roadmap: DEFER

1. ✅ Phase C: Log signals (query, candidates, rerank, latency)
2. ⏳ Post-Phase C: Collect user feedback (click/reject)
3. ⏳ Later: Train router policy on logged signals
4. ⏳ Later: A/B test policy in production

**Do NOT add PyTorch training to core graph path yet.** Only log signals.

---

## Clean Retrieval Pipeline

```
User query (JSON over HTTP)
  ↓
TS orchestrator (src/lib/server/ace/query-router.ts)
  ├─ Check Redis cache (bifrost:packet:{key})
  ├─ If miss: embed query (Ollama :11434)
  ├─ If miss: BM25 + Qdrant ANN (parallel, :6333)
  ├─ RRF fusion (combine BM25 + cosine scores)
  ├─ Pre-filter via topology search (:8101, manifold-4D distance)
  ├─ GPU rerank sidecar (tensorrt_bridge.node, cosine similarity)
  │   ├─ Try CUDA graph cache (replay)
  │   ├─ Fallback to direct GPU compute (capture)
  │   └─ Fallback to CPU cosine (no GPU available)
  ├─ Write telemetry row to Postgres (atomic)
  ├─ Invalidate Redis keys (async, non-blocking)
  ├─ Optional: export to Langfuse/ClickHouse (async, non-blocking)
  └─ Return JSON response to user
      ↓
Optional: Langfuse tracing (separate SaaS, not blocking)
Optional: ClickHouse event sink (separate batch process, not blocking)
```

**Latency breakdown (RTX 3060 Ti)**:
- Redis check: 5ms (cache hit) or cache miss path
- Ollama embed: 500ms (first call, cached after)
- Qdrant ANN: 50-200ms (50K points, top-50)
- GPU rerank: 0-50ms (cache hit 2-5ms, direct 10-50ms, fallback 25-100ms)
- Telemetry write: 10-20ms
- **Total**: 50-300ms (expected 150-200ms typical)

---

## Decision for Phase C Option B

### ✅ Approved datastores

1. **Postgres** — canonical state machine (packets, variants, audit trail)
2. **Qdrant** — ANN mirror (read-only from TS)
3. **Redis/Valkey** — ephemeral cache (invalidate after writes)
4. **Neo4j** — topology mirror (read-only from TS)
5. **N-API LibTorch** — GPU math sidecar (tensor ops only)

### ❌ Do NOT add in Phase C

- CouchDB (unnecessary)
- RAPIDS cuGraph/cuVS (use LibTorch for Phase C)
- PyTorch RL (log signals first, train later)
- ClickHouse (use Postgres for Phase C)
- Go/Python sidecars (use N-API for Phase C)
- Arrow IPC / binary formats (JSON is fast enough)

### ⏳ Post-Phase C roadmap

1. **Phase D**: User feedback integration (clicks, dwells, rejects)
2. **Phase E**: RL training on logged signals (PyTorch router/ranker)
3. **Phase F**: A/B testing production policies
4. **Phase G**: ClickHouse for high-volume analytics (if needed)

---

## Pre-Phase C Execution Checklist

Before proceeding to Option B telemetry + provenance work:

- [ ] Valkey/Redis running (:6379)
- [ ] Topology Search Server running (:8101)
- [ ] Postgres telemetry tables created (`retrieval_traces`, `acp_decisions`)
- [ ] N-API LibTorch bridge verified (tensorrt_bridge.node loads)
- [ ] Telemetry row assembly code written (TS orchestrator)
- [ ] Postgres write path for telemetry tested
- [ ] Redis invalidation path tested (non-blocking)
- [ ] Langfuse/ClickHouse export is optional (async, non-blocking)

**GO/NO-GO Decision**: All 8 boxes checked → Proceed to Option B execution.

---

## References

- `SESSION-98-CUDA-GRAPH-CACHING-WIRED.md` — GPU bridge integration (✅ complete)
- `SESSION-98-E2E-TESTING-PLAN.md` — telemetry verification gates
- `PHASE-B-MULTI-PASS-ENRICHMENT-COMPLETE.md` — variant tracking (already done)
- `provenance-first-architecture.md` — 4-tier separation (already done)
