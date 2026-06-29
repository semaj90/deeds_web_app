# TurboVec Evaluation + Lane 5 Policy Integration

**Date**: June 28, 2026  
**Status**: ✅ **Infrastructure wired, Phase 1 evaluation ready**

---

## Executive Summary

TurboVec GPU acceleration and Lane 5 PyTorch policy reranker are now **integrated into a single retrieval cascade**. TurboVec evaluation data flows directly into policy training, enabling data-driven ranking learned from GPU-accelerated candidates.

### Unified Architecture

```
Query (384-dim embed)
  ↓ [Qdrant ANN: 54K → 100 candidates] (~120ms)
  ↓
TurboVec.Rerank (GPU cosine similarity) (~25-50ms)
  → Scores: ann_turbovec_score [0, 1]
  → Metrics logged to Redis (Phase 1 eval)
  ↓
Feature Engineering (16 scalars + SOM embedding)
  → Compute: cosine, bm25, turbovec, pagerank, etc.
  ↓
PolicyRanker (PyTorch sidecar @ :8765) (~15-25ms)
  → Final relevance scores
  ↓
ACE Context Assembly (top-K ranked packets)
```

---

## Phase 1: TurboVec Baseline Evaluation (Weeks 1-2)

### Objective
Establish latency and accuracy baseline for TurboVec GPU acceleration.

### Metrics Captured
- **Latency**: P50/P95/P99 latencies (Qdrant ANN, TurboVec rerank, total)
- **Throughput**: Candidates before/after reranking
- **Accuracy**: Recall@K, MRR, NDCG (if gold standard available)

### Command Flow

**1. Verify measurement infrastructure:**
```bash
npm run dev  # Start SvelteKit (metrics API available at :5173)
```

**2. Check metrics API health:**
```bash
curl http://127.0.0.1:5173/api/metrics/retrieval
# Expected: sampleCount=0 (no queries yet), ready for data
```

**3. Run 10-query smoke test:**
```bash
node scripts/eval/turbovec-baseline-test.mjs --dry-run
# Expected: ✅ API is up, ✅ Metrics API available
```

**4. Collect 50-100 live queries** (days 1-3):
- Users search via the app with TurboVec enabled
- Metrics auto-logged via `recordRetrievalMetrics()` to Redis
- Each query: qdrantLatencyMs + turbovecLatencyMs → totalLatencyMs

**5. Query baseline dashboard** (after 24-48h):
```bash
curl "http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24"
# Returns: P50, P95, P99, avgCandidates, turbovecLatencyAvg
```

**6. Establish Qdrant-only baseline** (days 3-4):
```bash
# Set in .env: TURBOVEC_SIDECAR_GRPC_ENABLED=false
npm run dev
# Rerun 50 queries through app
curl "http://127.0.0.1:5173/api/metrics/retrieval?branch=qdrant-only&hours=24"
```

**7. Compare branches:**
```bash
# Side-by-side latency: turbovec-enabled vs qdrant-only
# Expected: TurboVec 5-10× faster, ≥5% recall improvement
```

### Success Criteria

| Metric | Baseline (Qdrant) | Target (TurboVec) | Status |
|--------|-------------------|------------------|--------|
| P95 latency | ~250ms | <200ms | TBD |
| P99 latency | ~500ms | <400ms | TBD |
| TurboVec avg time | — | 15-50ms | TBD |
| Recall@10 | baseline | +5-15% | TBD |
| MRR | baseline | +10-20% | TBD |
| Uptime | 99%+ | 99.5%+ | TBD |

---

## Phase 2: Feature Extraction for Policy Training (Weeks 2-3)

### Objective
Export TurboVec evaluation data as policy training features.

### Data Pipeline

**Input**: 50-100 successful queries from Phase 1
- Query hash, user ID, session ID
- TurboVec reranking scores
- Redis metrics (latencies, candidate counts)

**Processing**:
```
Each query result
  ↓ [Log TurboVecMetrics to retrieval-metrics.ts]
  ↓ [Export 16-scalar feature row]
  ↓ [Append to xgboost-features.csv]
  ↓ [Compute som_cell_id from packet metadata]
  ↓ [Set label=1 (positive: shown to user)]
```

**Output**: Enhanced CSV rows for policy training

### Feature Row Schema (16 scalars + metadata)

```json
{
  "cosine_score": 0.85,           // Qdrant ANN similarity
  "bm25_rank_norm": 0.60,         // Sparse search score
  "ann_turbovec_score": 0.78,     // ← NEW: TurboVec GPU rerank
  "concept_overlap": 0.50,
  "same_feature": 1,
  "community_conf": 0.90,
  "reward_prior": 0.30,
  "domain_class_match": 1,
  "freshness_score": 0.95,
  "pagerank_score": 0.40,
  "som_cache_hit": 0,             // ← NEW: Redis cache hit
  "packet_hit_count_norm": 0.60,
  "n_retrieved_norm": 0.80,
  "n_concepts_norm": 0.70,
  "trace_score": 0.85,
  "provenance_git_age": 0.10,
  
  "som_cell_id": 142,             // SOM topology cell
  "packet_id": "ace:packet:001",  // Evaluation reference
  "trace_id": "trace:abc123",
  "label": 1                       // Positive (shown to user)
}
```

### Commands

**1. Aggregate evaluation metrics:**
```bash
npm run atlas:eval:aggregate:turbovec
# Reads from Redis retrieval:metrics:* keys
# Outputs to docs/reports/xgboost-features.csv (append mode)
```

**2. Validate feature completeness:**
```bash
npm run atlas:policy:train:dry
# Checks CSV has 16 scalars, som_cell_id, som_cell_id < 400
# Expected: ✅ All features present, ✅ 100+ rows ready
```

---

## Phase 3: Policy Training (Weeks 3-4)

### Objective
Train PyTorch policy reranker using TurboVec evaluation data.

### Data Requirements

- **Rows**: ≥100 (from Phase 1-2)
- **Features**: All 16 scalars present (100% completeness)
- **Labels**: Positive labels (assumption: user-shown = relevant)
- **Traces**: ≥10 unique evaluation traces (for stratified split)

### Training

**1. Quick validation:**
```bash
npm run atlas:policy:train:dry
# Checks CSV format, feature presence, trace distribution
```

**2. Train on RTX 3060 Ti:**
```bash
npm run atlas:policy:train
# GPU: ~8-12 minutes for 80 epochs
# CPU: ~45-60 minutes
# Output: models/policy-reranker.pt
```

**3. Check performance:**
```bash
cat docs/reports/policy-reranker-training-report.md
# Expected metrics:
#   - NDCG@10 ≥ 0.70 (gate pass)
#   - MRR ≥ 0.75
#   - Validation loss < 0.3
```

**4. Interpret feature importance:**
```bash
# In training report, check which features matter most:
# Expected top contributors:
#   - cosine_score: 0.15 (Qdrant baseline)
#   - ann_turbovec_score: 0.10 (TurboVec adds signal)
#   - same_feature: 0.12 (domain matching)
#   - pagerank_score: 0.10 (graph authority)
```

---

## Phase 4: Production Wiring (Weeks 4-5)

### Objective
Deploy policy sidecar and wire into retrieval cascade.

### Step 1: Start policy sidecar

```bash
npm run atlas:policy:serve
# Listens on http://localhost:8765
# Health check: curl http://localhost:8765/health
# Expected response: {"status": "ok", "model_loaded": true, "ndcg_at_10": 0.70+}
```

### Step 2: Wire into retrieval API

**File**: `src/routes/api/rag/search/+server.ts`

**Add** (after Qdrant ANN, before return):

```typescript
// Feature engineering for policy reranker
const policyFeatures = allChunks.slice(0, top_k).map(chunk => ({
  cosine_score: chunk.score,
  bm25_rank_norm: chunk.bm25_score ?? 0,
  ann_turbovec_score: chunk.rerank_score ?? chunk.score,  // TurboVec
  concept_overlap: computeConceptOverlap(query, chunk),
  same_feature: chunk.feature_id === queryFeatureId ? 1 : 0,
  community_conf: chunk.community_confidence ?? 0.5,
  reward_prior: chunk.reward_prior ?? 0,
  domain_class_match: chunk.domain_class === userDomain ? 1 : 0,
  freshness_score: computeFreshnessScore(chunk.updated_at),
  pagerank_score: chunk.pagerank_score ?? 0,
  som_cache_hit: chunk.som_cache_hit ? 1 : 0,
  packet_hit_count_norm: Math.min(chunk.hit_count / 100, 1),
  n_retrieved_norm: Math.log1p(allChunks.length) / Math.log1p(200),
  n_concepts_norm: Math.min(queryConceptCount / 20, 1),
  trace_score: chunk.trace_confidence ?? 0.5,
  provenance_git_age: computeGitAge(chunk.mtime),
  som_cell_id: chunk.som_cell,
}));

// Call policy sidecar
const policyRes = await fetch('http://localhost:8765/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows: policyFeatures }),
});

const { scores } = await policyRes.json();

// Apply policy scores and re-sort
for (let i = 0; i < allChunks.length && i < scores.length; i++) {
  allChunks[i].policy_score = scores[i];
}
allChunks.sort((a, b) => (b.policy_score ?? 0) - (a.policy_score ?? 0));
```

### Step 3: Enable in `.env`

```bash
POLICY_RERANKER_ENABLED=true
POLICY_RERANKER_PORT=8765
POLICY_RERANKER_PATH=models/policy-reranker.pt
TURBOVEC_SIDECAR_GRPC_ENABLED=true
TURBOVEC_SIDECAR_GRPC_URL=127.0.0.1:50062
```

### Step 4: Test end-to-end

```bash
# In app: search for a query
# Check logs for:
#   - TurboVec rerank: 25-50ms ✓
#   - Policy inference: 15-25ms ✓
#   - Final ranking differs from Qdrant-only ✓

curl http://127.0.0.1:5173/api/metrics/retrieval?branch=karpathy-blend&hours=1
# Expected: new branch with blended metrics
```

---

## Monitoring & Debugging

### Check TurboVec metrics

```bash
# Real-time summary (last 24 hours)
curl "http://127.0.0.1:5173/api/metrics/retrieval?branch=turbovec-enabled&hours=24"

# Response example:
{
  "branch": "turbovec-enabled",
  "sampleCount": 87,
  "latencyP50": 145,
  "latencyP95": 285,
  "latencyP99": 510,
  "qdrantLatencyAvg": 120,
  "turbovecLatencyAvg": 35,
  "recallAvg": 0.88
}
```

### Check policy sidecar health

```bash
curl http://localhost:8765/health

# Response example:
{
  "status": "ok",
  "model_loaded": true,
  "model_type": "pytorch_policy",
  "n_params": 42369,
  "ndcg_at_10": 0.73,
  "mrr_at_10": 0.82,
  "use_som": true,
  "device": "cuda"
}
```

### Debug low policy scores

**If policy scores are all <0.3:**
1. Check feature ranges (should be [0, 1] normalized)
2. Verify som_cell_id is in [0, 400)
3. Run `npm run atlas:policy:train:dry` to re-validate CSV

**If policy inference times out:**
1. Check sidecar is running: `curl http://localhost:8765/health`
2. Restart sidecar: `npm run atlas:policy:serve`
3. Check batch size isn't too large (max ~1000 rows recommended)

---

## Integration Checklist

- [ ] Phase 1: Collect 50-100 TurboVec evaluation queries
- [ ] Phase 1: Verify P95 latency < 200ms
- [ ] Phase 2: Export evaluation data to CSV
- [ ] Phase 2: Verify 16 scalars present, 100% completeness
- [ ] Phase 3: Train policy on TurboVec data
- [ ] Phase 3: Confirm NDCG@10 ≥ 0.70
- [ ] Phase 4: Start policy sidecar @ :8765
- [ ] Phase 4: Wire policy into `/api/rag/search`
- [ ] Phase 4: End-to-end test (query → TurboVec → Policy → results)
- [ ] Phase 4: Verify policy scores used in final ranking
- [ ] Monitoring: Set up Langfuse traces for policy inference
- [ ] Monitoring: Dashboard for P50/P95/P99 latencies by branch

---

## Files Modified/Created

✅ **New**:
- `src/lib/server/retrieval/turbovec-policy-bridge.ts` — Integration layer
- `scripts/eval/turbovec-baseline-test.mjs` — Phase 1 smoke test
- `src/routes/api/metrics/retrieval/+server.ts` — Metrics dashboard API
- `src/lib/server/telemetry/retrieval-metrics.ts` — Metrics logging

✅ **Updated**:
- `sveltekit-frontend/package.json` — npm scripts for eval + policy
- `.env` — TURBOVEC_SIDECAR_GRPC_ENABLED, POLICY_RERANKER_* flags

✅ **Lane 5 (pre-existing)**:
- `scripts/atlas/train-policy-reranker.py`
- `scripts/atlas/serve-policy-reranker.py`

---

## Success Criteria

| Phase | Milestone | Target | Status |
|-------|-----------|--------|--------|
| **1** | TurboVec baseline latency | P95 < 200ms | TBD |
| **1** | Qdrant-only baseline | P95 ~250ms | TBD |
| **1** | Recall improvement | +5-15% | TBD |
| **2** | Feature CSV rows | ≥100 with all 16 scalars | TBD |
| **2** | Feature completeness | 100% | TBD |
| **3** | Policy NDCG@10 | ≥0.70 | TBD |
| **4** | Policy sidecar health | /health returns 200 OK | TBD |
| **4** | End-to-end latency | <350ms (ANN + TurboVec + Policy) | TBD |

---

## Next Steps

1. **This week**: Run Phase 1 evaluation (smoke test + baseline collection)
2. **Next week**: Export Phase 1 data, train policy on TurboVec signals
3. **Week 3**: Deploy policy sidecar, wire into `/api/rag/search`
4. **Week 4+**: Monitor NDCG, feedback loop, Lane 13 GRPO optimization

---

## References

- `docs/TURBOVEC-EVAL-PLAN.md` — Detailed TurboVec evaluation roadmap
- `LANE5_POLICY_RERANKER_IMPLEMENTATION.md` — Policy reranker architecture
- `src/lib/server/telemetry/retrieval-metrics.ts` — Metrics recording interface
- `src/lib/server/retrieval/turbovec-policy-bridge.ts` — This integration layer
