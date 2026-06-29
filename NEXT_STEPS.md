# Next Steps: Gemma4 Summaries → RFF Index Pipeline

**Date**: June 29, 2026 | **Status**: Awaiting Gemma4 summaries | **Target**: Index summaries for RFF retrieval

---

## Current Summaries Infrastructure

### Summary Generation (Gemma4)

**Script**: `sveltekit-frontend/scripts/atlas/gemma4-batch-summarize-packets.mjs`

**Flow**:
1. Query packets WHERE `summary IS NULL` from `atlas_packets`
2. Batch into 10-packet chunks (configurable)
3. Call Gemma4 at `:8090` (TurboQuant) with source_ref + feature_id context
4. Strip reasoning blocks (`<think>`, `<|assistant_thinking|>`, etc.)
5. Write summaries back to `atlas_packets.summary` (upsert)
6. Emit telemetry: successes, failures, tokens, latency

**Status**: ✅ READY TO RUN
```bash
npm run gemma4:batch:summarize-packets              # Dry-run
npm run gemma4:batch:summarize-packets -- --apply   # Execute
```

**Batch Size**: 10 packets  
**Concurrency**: 2 parallel batches  
**Model**: `gemma4-rotorquant:latest` at :8090 (TurboQuant GGUF)

---

## Reranking Strategy (Multi-Lane)

### Lane 1: XGBoost Reranker (Phase 18)

**Script**: `sveltekit-frontend/scripts/atlas/phase18-xgboost-reranker.mjs`

**Input**: PyTorch feature embeddings (Phase 17)  
**Output**: Ranked candidates with scores and reasoning  
**Fallback**: JS heuristic (card_id % 100 heuristic if Python unavailable)

**Status**: ✅ WIRED
```bash
npm run phase18:xgboost:rerank -- --input <path> --out <path> --publish
```

### Lane 2: Topology Reranker (4D Manifold)

**Script**: `sveltekit-frontend/scripts/atlas/topology-rerank.mjs`

**Method**: 4D Euclidean distance in feature-state topology
- x-axis: Semantic focus (feature/architecture vs error/bug)
- y-axis: Complexity (simple vs deep/comprehensive)
- z-axis: Linkage density
- w-axis: Entropy (chaos metric)

**Status**: ✅ WIRED
```bash
node scripts/atlas/topology-rerank.mjs \
  --input tmp/chunks/parents-corpus-4d.ndjson \
  --query "how does kmeans-worker handle errors" \
  --limit 5
```

### Lane 3: LangExtract (Information Extraction)

**Location**: `src/lib/server/services/langextract-service.ts`  
**Role**: Extract entities, relationships, error patterns from code  
**Integration**: Feeds into ACE context assembly

**Status**: ✅ WIRED (referenced in multiple task distillates)

---

## Summary Indexing Pipeline (After Gemma4)

Once Gemma4 summaries are written to `atlas_packets.summary`:

### Step 1: Embed Summaries (384-dim)

**Script**: TBD (similar to Phase 1 backfill pattern)

```bash
npm run atlas:phase1:backfill:summary:embeddings:apply
```

**Details**:
- Read `atlas_packets.summary` from Postgres
- Embed via Ollama `embeddinggemma:latest` (384-dim)
- Write `summary_embedding` column
- Time: ~30 minutes for ~58K packets

### Step 2: Sync Summary Vectors to Qdrant

**Script**: Extend Phase 2 sync pattern

**Add to Qdrant payload**:
- `summary_embedding_id` → Reference to summary vector
- `summary_bm25_score` → Full-text relevance
- `summary_confidence` → Quality metric

### Step 3: Create BM25 Index (Stage 4)

**Integration**: Go semantic search service at `:8096`

**BM25 on**: summaries + source_ref + feature_id (inverted index)

---

## RFF Lane 4: BM25 Full-Text (Summary-Based)

Currently deferred, required for complete RFF:

```
Lane 4: BM25 Full-Text
  ↓
Query: "TypeError: undefined is not a function"
  ↓
BM25 search on summaries:
  - "Error handling patterns"
  - "TypeError fixes in upload handler"
  - "Async/await function calls"
  ↓
Top-K candidates ranked by BM25
  ↓
Fused with Lanes 1,2,3,5 via RRF
```

**Action**: Wire Go semantic search `/api/search/bm25` endpoint

---

## Execution Roadmap

### Phase A: Gemma4 Summaries (Waiting for you)
- [ ] Run `npm run gemma4:batch:summarize-packets -- --apply`
- [ ] Verify: `SELECT count(*) FROM atlas_packets WHERE summary IS NOT NULL`
- [ ] Expected: ~58K summaries written
- **Time**: 30-45 minutes

### Phase B: Summary Embedding Backfill (New script needed)
- [ ] Create `phase1-backfill-summary-embeddings.mjs`
- [ ] Run backfill: `npm run atlas:phase1:backfill:summary:apply`
- [ ] Verify: `SELECT count(*) FROM atlas_packets WHERE summary_embedding IS NOT NULL`
- **Time**: 30 minutes

### Phase C: Qdrant Payload Sync (Extend Phase 2)
- [ ] Extend Phase 2 to include summary vectors
- [ ] Run: `npm run atlas:phase2:sync:summaries:apply`
- **Time**: 15 minutes

### Phase D: RFF Index Warmup (New script)
- [ ] Create `phase4-rff-cache-warmup.mjs`
- [ ] Pre-compute RRF scores for hot queries
- **Time**: 5 minutes

### Phase E: Verify RFF Search End-to-End
- [ ] Test RFF search endpoint
- [ ] Verify all 5 lanes returning ranked results
- **Time**: 10 minutes

---

## Summary Statistics (Expected)

| Metric | Current | After Gemma4 | After Indexing |
|--------|---------|--------------|-----------------|
| **atlas_packets** rows | 58,304 | 58,304 | 58,304 |
| With summary | ~50% | ~100% | 100% |
| With embedding | 0% | 0% | 100% |
| Qdrant points | 40,568 | 40,568 | 40,568 |
| BM25 indexed | 0% | 0% | 100% |
| RFF lanes active | 3 of 5 | 4 of 5 | 5 of 5 |

---

## Scripts to Create

### 1. Phase 1: Summary Embedding Backfill

**Location**: `sveltekit-frontend/scripts/atlas/phase1-backfill-summary-embeddings.mjs`

**Pattern**: Similar to Phase 1 error/signature backfill
- Read from `atlas_packets.summary`
- Embed via Ollama
- Write to `atlas_packets.summary_embedding`

```bash
npm run atlas:phase1:backfill:summary:dry
npm run atlas:phase1:backfill:summary:apply
```

### 2. Phase 2: Extend Qdrant Sync

**Location**: Extend `phase2-sync-qdrant-rff-payloads.mjs`

**Add fields**:
- `summary_embedding_id`
- `summary_bm25_score`
- `summary_confidence`

```bash
npm run atlas:phase2:sync:summaries:apply
```

### 3. Phase 4: RFF Cache Warmup

**Location**: `sveltekit-frontend/scripts/atlas/phase4-rff-cache-warmup.mjs`

**Pre-compute**: Top 100 RFF queries, cache in Redis

```bash
npm run atlas:phase4:rff:warm-cache:apply
```

---

## Integration Points

### Gemma4 Summary Path
```
atlas_packets.summary (NULL)
  ↓ [Gemma4 at :8090]
atlas_packets.summary (written)
  ↓ [Ollama embed]
atlas_packets.summary_embedding (384-dim)
  ↓ [Qdrant sync]
Qdrant codebase_chunks_768.payload.summary_embedding_id
  ↓ [BM25 index]
Go service :8096 (summary inverted index)
  ↓ [RFF fusion]
Lane 4 (BM25) active
```

### RFF Complete Flow (All 5 Lanes)
```
User error query
  ↓
Embed error (384-dim)
  ↓
┌─ Lane 1: Content semantic (Qdrant content vector)
├─ Lane 2: Error pattern (Qdrant error vector) [Phase 1]
├─ Lane 3: Code signature (Qdrant signature vector) [Phase 1]
├─ Lane 4: BM25 summaries (Go service, requires this work)
└─ Lane 5: Neo4j topology (graph edges) [Phase 3]
  ↓
Fuse via RRF: score = Σ(1 / (k + rank_i))
  ↓
Top-20 candidates
  ↓
ACE synthesis + Gemma4 fix proposal
```

---

## Verification Gates (After Each Phase)

### After Phase A (Gemma4)
```sql
SELECT 
  count(*) as total,
  count(summary) as with_summary,
  ROUND(count(summary)::numeric / count(*) * 100, 1) as coverage_pct
FROM atlas_packets;
-- Expected: 58304, ~58304, ~100%
```

### After Phase B (Summary Embeddings)
```sql
SELECT 
  count(*) as total,
  count(summary_embedding) as with_embedding
FROM atlas_packets;
-- Expected: 58304, ~58304
```

### After Phase C (Qdrant Sync)
```bash
curl "http://127.0.0.1:6333/collections/codebase_chunks_768/points?ids=1&with_payload=true" \
  | jq '.result.points[0].payload | keys' | grep summary_embedding_id
# Expected: ["summary_embedding_id", ...]
```

### After Phase E (RFF Complete)
```bash
curl -X POST http://localhost:8096/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "TypeError: undefined is not a function",
    "vectors": ["error", "content"],
    "fusion": "rrf",
    "k": 20
  }' | jq '.results[0] | {rank, score, summary}'
# Expected: RRF scores with summaries visible in results
```

---

## Status Dashboard

| Phase | Status | Blocker |
|-------|--------|---------|
| **A**: Gemma4 summaries | ⏳ WAITING | Running `--apply` |
| **B**: Summary embeddings | ⏳ WAITING | Gemma4 completion |
| **C**: Qdrant sync summaries | ⏳ WAITING | Phase B |
| **D**: RFF cache warmup | ⏳ WAITING | Phase C |
| **E**: RFF end-to-end test | ⏳ WAITING | Phase D |
| **Lanes 1-3**: Error/Signature | ✅ READY | — |
| **Lane 4**: BM25 summaries | ⏳ THIS PHASE | Go service integration |
| **Lane 5**: Topology | ✅ READY | — |

---

## Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| A: Gemma4 | 45 min | 45 min |
| B: Summary embeddings | 30 min | 75 min |
| C: Qdrant sync | 15 min | 90 min |
| D: Cache warmup | 5 min | 95 min |
| E: Verification | 10 min | **105 min (~1.75 hr)** |

---

## Commands to Run (In Order)

```bash
# Phase A: Gemma4 Summaries
cd sveltekit-frontend
npm run gemma4:batch:summarize-packets -- --apply

# Phase B: Summary Embedding Backfill (after script created)
npm run atlas:phase1:backfill:summary:apply

# Phase C: Qdrant Sync (after script extended)
npm run atlas:phase2:sync:summaries:apply

# Phase D: RFF Cache Warmup (after script created)
npm run atlas:phase4:rff:warm-cache:apply

# Phase E: Verify
curl -X POST http://localhost:8096/search \
  -H "Content-Type: application/json" \
  -d '{"query": "TypeError", "vectors": ["error", "content"], "fusion": "rrf", "k": 20}'
```

---

## Next Instructions for You

1. **Execute Phase A**: Run Gemma4 batch summarizer to populate `atlas_packets.summary`
2. **Notify when complete**: Message "summaries written" and I'll:
   - Create Phase B script (summary embedding backfill)
   - Create Phase C extension (Qdrant summary sync)
   - Create Phase D script (RFF cache warmup)
   - Wire all 5 RFF lanes into retrieval pipeline

---

**Status**: Ready for Gemma4 execution  
**Next Signal**: "summaries written" → proceed with Phases B-E  
**Target Completion**: June 29, 2026 20:00 UTC
