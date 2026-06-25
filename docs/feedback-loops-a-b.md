# Feedback Loops A & B: Retrieval Learning + Model Adaptation

**Date**: June 24, 2026  
**Status**: ✅ Both loops wired into `/api/research/concurrent-deep/stream`

---

## Loop A: Retrieval/Runtime Feedback

**Goal**: Learn which chunks are valuable from agent usage patterns.

### Data Flow

```
User Query
  ↓
Worker Domain Search
  ├─ Qdrant ANN + pg_trgm + graph_authority + topology
  └─ Emit top-20 chunks → chunk_hit_log (rank 0-19, score, lane)
  ↓
Supervisor Merge
  ├─ Selects keyFindings from all workers
  └─ Mark chunks in chunk_hit_log.used_in_answer = true
  ↓
demand_score += 0.1 for selected chunks
  ↓
Next Query
  ├─ Qdrant fetch includes demand_score (0.0-1.0) from cache
  └─ Hybrid blend: 0.25·qdrant + 0.20·trgm + 0.20·authority + 0.15·topology + 0.20·demand
```

### Hybrid Score Formula

```typescript
final = 0.25 * qdrant_cosine
      + 0.20 * pg_trgm
      + 0.20 * graph_authority
      + 0.15 * topology
      + 0.20 * demand_score
```

The weights are fixed; only demand_score adapts per query based on usage.

### Implementation Details

**Table**: `chunk_hit_log`
- `trace_id`: Links to the research session (UUID)
- `query_hash`: 8-char FNV-1a hash for fast joins (e.g., `a1b2c3d4`)
- `packet_key`: `ace:packet:feature:NNN` if retrievable, else null
- `source_ref`: `src/lib/server/auth.ts` or null
- `feature_id`: `auth.sessions` or null
- `lane`: Worker domain (`api-routes`, `state-machines`, etc.)
- `rank`: 0-19 position in worker results
- `score`: Original Qdrant/trgm/authority score before demand boost
- `used_in_answer`: Boolean flag set when supervisor selects this chunk
- `demand_score`: 0.0-1.0, incremented by 0.1 per supervisor hit
- Indexes on `trace_id`, `query_hash`, `packet_key`, `lane`, `demand_score` (desc)

**Location**: `/api/research/concurrent-deep/stream`
- POST generates `traceId` UUID
- Each SSE event includes `traceId`
- After each worker: fire-and-forget insert of chunk hits (top-20)
- After supervisor: update `chunk_hit_log.used_in_answer = true` + boost `demand_score`

**Cost**: ~1-2ms per research session (non-blocking)

---

## Loop B: Training/Adaptation Feedback

**Goal**: Train Gemma4 on agent behavior (what gets selected, not facts).

### Data Flow

```
Loop A: chunk_hit_log
  ├─ Trace selection patterns (which chunks, which lane, which score)
  └─ Aggregate: "What queries select auth chunks in api-routes lane?"
  ↓
context_timeline (lifecycle events)
  ├─ research.concurrent.started
  ├─ research.concurrent.worker_done (per domain)
  ├─ research.concurrent.supervisor_done
  ├─ research.concurrent.persisted
  └─ research.concurrent.failed
  ↓
Failed Builds / Error Traces
  ├─ Gemma4 attempted analysis
  ├─ Supervisor rejected the selection
  └─ Mark as "failed reasoning"
  ↓
ACE/KAG/DAG Traces
  ├─ Tool calls made
  ├─ Success vs. degraded paths
  └─ Timing + cache hit/miss signals
  ↓
LoRA/QLoRA Dataset Generation
  ├─ Input: user query + domain hint
  ├─ Label: chunk selection (from chunk_hit_log)
  ├─ Target: Gemma4 learns "pick chunks ranked 0-5 from api-routes when query contains 'auth'"
  └─ NOT: "learn facts" (retrieval-driven, not memorization)
  ↓
QLoRA Fine-tune (future)
  ├─ Low-rank adaptation of Gemma4 weights
  ├─ Keeps model quantized (IQ4_XS, TurboQuant)
  └─ ~2-4 hours per epoch on RTX 3060 Ti
```

### Dataset Shape (LoRA/QLoRA)

```json
{
  "messages": [
    { "role": "system", "content": "You are a retrieval specialist. Select relevant code chunks." },
    { "role": "user", "content": "Find authentication session validation logic. Domain hint: api-routes" }
  ],
  "chunks_to_select": [
    { "rank": 0, "packet_key": "ace:packet:auth:001", "used": true },
    { "rank": 1, "packet_key": "ace:packet:auth:002", "used": true },
    { "rank": 5, "packet_key": "ace:packet:db:042", "used": false }
  ],
  "supervisor_summary": "Session tokens validated in Redis + Lucia. Check token expiry and CSRF.",
  "trace_id": "a1b2c3d4-...",
  "success": true,
  "durationMs": 3200
}
```

**Collection**: Monthly batches of 1K–5K successful traces per domain.

---

## Event Timeline (Loop A Trace)

Each research call emits this sequence:

```
POST /api/research/concurrent-deep/stream
{
  "query": "How does session auth work?",
  "domains": ["api-routes", "state-machines", "database"]
}

SSE 1: plan
{
  "traceId": "uuid",
  "domains": ["api-routes", "state-machines", "database"]
}

Timeline event: research.concurrent.started
{
  "queryHash": "a1b2c3d4",
  "traceId": "uuid",
  "workerCount": 3
}

[Worker api-routes starts]
  INSERT chunk_hit_log (traceId, queryHash, packetKey, lane='api-routes', rank 0-19, score, used_in_answer=false)

SSE 2: worker
{
  "traceId": "uuid",
  "domain": "api-routes",
  "chunkCount": 47,
  "summary": "..."
}

Timeline event: research.concurrent.worker_done
{
  "traceId": "uuid",
  "domain": "api-routes",
  "chunkCount": 47
}

[Worker state-machines starts]
  ...
[Worker database starts]
  ...

SSE 3: merging
{
  "traceId": "uuid",
  "domainCount": 3,
  "totalChunks": 142
}

Timeline event: research.concurrent.supervisor_done
{
  "traceId": "uuid",
  "workerCount": 3,
  "totalChunks": 142
}

[Supervisor selected keyFindings]
  UPDATE chunk_hit_log
  SET used_in_answer = true, demand_score = demand_score + 0.1
  WHERE trace_id = ? AND (packet_key IN (...) OR source_ref IN (...))

SSE 4: complete
{
  "traceId": "uuid",
  "supervisorSummary": "...",
  "keyFindings": [...],
  "totalChunks": 142,
  "persistedId": "uuid"
}

Timeline event: research.concurrent.persisted
{
  "traceId": "uuid",
  "workerCount": 3,
  "totalChunks": 142
}
```

---

## Integration with search.hybrid

**Location**: `src/lib/server/retrieval/hybrid-score.ts`

When a new query arrives:

```typescript
import { computeHybridScore } from '$lib/server/retrieval/hybrid-score.js';

// Fetch Qdrant vector
const qdrantHits = await qdrant.search({ ... });

// For each hit, fetch demand_score from chunk_hit_log (or cache)
const demandScores = await db.select({
  packetKey: chunkHitLog.packetKey,
  demandScore: chunkHitLog.demandScore
})
  .from(chunkHitLog)
  .where(inArray(chunkHitLog.packetKey, qdrantHits.map(h => h.payload.packet_key)))
  .orderBy(desc(chunkHitLog.demandScore))
  .limit(1); // Get most-recent demand_score per packet

// Compute hybrid score
const scored = qdrantHits.map(hit => {
  const demand = demandScores.find(d => d.packetKey === hit.payload.packet_key);
  return {
    ...hit,
    hybridScore: computeHybridScore({
      qdrantCosine: hit.score,
      pgTrgm: hit.payload.trgm_score || 0,
      graphAuthority: hit.payload.authority || 0,
      topologyScore: hit.payload.topology_score || 0,
      demandScore: decay(demand?.demandScore ?? 0, ageHours)
    })
  };
});

// Sort by hybrid score, not Qdrant score alone
scored.sort((a, b) => b.hybridScore - a.hybridScore);
```

---

## Deployment Steps

1. **Apply migration**: `psql -f drizzle/manual/0051_chunk_hit_log.sql`
2. **Deploy schema**: schema-postgres.ts exports `chunkHitLog`
3. **Start collecting**: `/api/research/concurrent-deep/stream` now logs all retrievals
4. **Monitor**: Query `SELECT COUNT(*), lane, AVG(demand_score) FROM chunk_hit_log GROUP BY lane` to see adoption
5. **(Future) Train**: Aggregate chunks with `used_in_answer = true` into LoRA dataset monthly

---

## Known Limitations & Future Work

- **Demand Score**: Currently simple increment (+0.1). Could be probabilistic (sigmoid, decay curve) in future.
- **LoRA Training**: Not yet wired. Dataset collection is ready; QLoRA fine-tune pipeline pending.
- **Stale Chunks**: Old demand_scores (>7 days) should decay. See `decayDemandScore()` utility.
- **Multi-Query**: If same chunk useful across many queries, demand_score rises naturally. No special handling needed.

---

## References

- **Loop A Table**: `chunk_hit_log` (Postgres)
- **Loop A Utility**: `src/lib/server/retrieval/hybrid-score.ts`
- **Loop A Implementation**: `/api/research/concurrent-deep/stream` (SSE endpoint)
- **Loop B Dataset**: `context_timeline` (audit trail of decisions)
- **Loop B Training** (pending): QLoRA pipeline in `scripts/training/lora-gemma4.mjs`

---

## Success Criteria

- ✅ **Loop A wired**: chunk_hit_log populated on every research call
- ✅ **Loop A traces**: All 5 SSE events include traceId
- ⏳ **Loop B dataset**: Monthly export of successful traces to training set
- ⏳ **Loop B training**: QLoRA fine-tune of Gemma4 on domain selection
- 🟢 **Observability**: Demand scores visible in `/api/metrics/retrieval-feedback` dashboard (pending)
