# XGBoost Classifier in Context: Complete Routing Architecture

## The Real Architecture (Not Just XGBoost)

```
Query + Features
    ↓
[1] XGBoost Lane Recommendation
    - Input: 10 features (pagerank, SOM, vectors, graph degree, BM25)
    - Output: lane + confidence (99.90% accuracy BUT imbalanced data)
    - Time: <1ms
    ↓
[2] Fallback Rules Validation
    - If confidence < 0.70 → use density-based fallback
    - If rare class (som-topology, neo4j-authority) → validate prerequisites
    - If qdrant-dense but no embeddings → downgrade to bm25
    - If neo4j-authority but no pagerank → downgrade to bm25
    ↓
[3] HMM State Gate (Phase 6-7)
    - Validate packet identity (canonical, recoverable, quarantine)
    - Validate lane recovery state (can we actually execute this lane?)
    - Log state transition for observability
    ↓
[4] Hybrid Search Execution
    - Dense: Qdrant ANN (768-dim) → 20-50ms
    - Sparse: PostgreSQL BM25 → 10-30ms
    - Parallel execution (not sequential)
    ↓
[5] RRF Final Fusion
    - Blend: 0.6 × dense_rank + 0.4 × sparse_rank
    - Re-score candidates
    - Truncate to top-K
    ↓
[6] Golden Replay Audit
    - Compute per-lane NDCG@K
    - Track recall@10, recall@100
    - Detect lane drift (e.g., qdrant-dense losing accuracy)
    - Feed back to retraining
    ↓
[7] Langfuse / OpenTelemetry Traces
    - Log decision tree (classifier → fallback → HMM → search → RRF)
    - Capture latency breakdown
    - Attribute errors to specific lane failures
    ↓
Final Ranked Results
```

## Why XGBoost Alone Is Not Enough

### The Imbalance Problem

```
Training data distribution:
  bm25-fallback:    54,158 (93%)  ← Dominant
  qdrant-dense:      4,047  (6.9%)
  som-topology:        157  (0.27%)
  neo4j-authority:       3  (0.01%)  ← Rare

XGBoost learned split: if no special signals → bm25-fallback (93% prior)
```

**Result:** 99.90% accuracy is MISLEADING because the classifier just predicts the dominant class most of the time.

### Validation Gates

| Scenario | XGBoost Output | Fallback Rule | Reason |
|----------|----------------|---------------|--------|
| Confidence 0.65 on qdrant-dense | ✓ qdrant-dense | ✗ bm25-fallback | Too low confidence |
| Confidence 0.95 on qdrant-dense but no embeddings | ✓ qdrant-dense | ✗ bm25-fallback | No vectors available |
| Confidence 0.92 on neo4j-authority (rare) | ✓ neo4j-authority | ✗ bm25-fallback | Requires confidence > 0.95 |
| Confidence 0.78 on som-topology but som_row=0 | ✓ som-topology | ✗ bm25-fallback | Missing SOM coordinates |
| Confidence 0.88 on bm25-fallback with vectors | ✓ bm25-fallback | ✓ bm25-fallback | No validation needed |

## File Structure

### Training Phase

```
scripts/atlas/
├── export-classifier-dataset.mjs       # 58K packets → CSV
├── train-xgboost-classifier.py         # CSV → XGBoost model
├── extract-ast-keywords.mjs            # (NEW) rg + ast-grep → keyword signals
└── smoke-test-lane-classifier.mjs      # (NEW) Validates model sanity
```

### Go Sidecar with Safety

```
go-retrieval-classifier/
├── cmd/classifier-sidecar/main.go
│   ├── Loads XGBoost model (JSON)
│   ├── Calls classifier.Predict()
│   ├── Applies fallback_rules.ApplyFallback()
│   ├── Executes hybrid search
│   └── Returns decision + trace
│
└── internal/classifier/
    ├── classifier.go              # Tree parser + inference
    ├── fallback_rules.go          # (NEW) Safety validation
    └── features.go                # Feature definitions
```

### Observability

```
Langfuse / OpenTelemetry traces capture:
  1. Classifier output (lane + confidence)
  2. Fallback rule application (rule triggered + reason)
  3. HMM state validation (passed / failed)
  4. Hybrid search execution (Qdrant + PostgreSQL latency)
  5. RRF fusion (rank changes, score changes)
  6. Final result (top-K candidates)
```

## The Complete Flow (Annotated)

### Example: Query for "validate session tokens"

```
Step 1: Feature Extraction
  Query: "validate session tokens"
  packet_key: "ace:packet:auth:001"
  Features extracted from Postgres:
    pagerank: 0.5
    som_row: 10, som_col: 15
    community_id: 5
    days_old: 3.2
    has_content_vec: 1, has_summary_vec: 1, has_keyword_vec: 0
    graph_degree: 2
    bm25_score: 0.75

Step 2: XGBoost Prediction
  Input: [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75]
  Classifier output: lane=qdrant-dense, confidence=0.92
  [!] High confidence but imbalanced training data!

Step 3: Fallback Rules
  Rule 1: confidence 0.92 > 0.70 ✓ (pass low confidence gate)
  Rule 2: lane is qdrant-dense (rare) + confidence 0.92 < 0.95 (borderline)
    → But has_content_vec=1 (embeddings exist) ✓
    → Confidence sufficient for qdrant-dense ✓
  Rule 3: Validate prerequisites
    - qdrant-dense requires embeddings: has_content_vec=1 ✓
    - All validations passed
  Fallback output: lane=qdrant-dense, reason="classifier (passed all validation rules)"

Step 4: HMM State Validation (Phase 6-7)
  packet_key="ace:packet:auth:001"
  → Query identity lane from Postgres
  → Check if canonical or recoverable
  → Validate lane recovery state
  → Log state transition to RabbitMQ
  [Assume: canonical packet, can route ✓]

Step 5: Hybrid Search Execution
  Query embedding: embed("validate session tokens") → 768-dim vector
  
  Parallel:
    Dense: Qdrant ANN on codebase_chunks_768 → top 20 candidates (45ms)
    Sparse: Postgres FTS on atlas_packets → top 20 candidates (25ms)
  
  Dense results:
    1. ace:packet:042 (src/lib/server/auth.ts) score=0.95
    2. ace:packet:101 (src/lib/server/session.ts) score=0.87
    3. ace:packet:156 (src/lib/utils/tokens.ts) score=0.82
  
  Sparse results:
    1. ace:packet:042 (src/lib/server/auth.ts) score=0.92
    2. ace:packet:103 (src/lib/server/middleware.ts) score=0.78
    3. ace:packet:042 (appears again!) score=0.91

Step 6: RRF Fusion
  RRF formula: 0.6 × dense_rank + 0.4 × sparse_rank
  
  ace:packet:042: rank_dense=1, rank_sparse=1
    score = 0.6 × 1/(60+1) + 0.4 × 1/(60+1) = 0.0164 ← Highest!
  
  ace:packet:101: rank_dense=2, rank_sparse=N/A
    score = 0.6 × 1/(60+2) + 0.4 × 0 = 0.0093
  
  ace:packet:103: rank_dense=N/A, rank_sparse=2
    score = 0.6 × 0 + 0.4 × 1/(60+2) = 0.0062
  
  Final ranking:
    1. ace:packet:042 (RRF score 0.0164)
    2. ace:packet:101 (RRF score 0.0093)
    3. ace:packet:103 (RRF score 0.0062)

Step 7: Langfuse Trace
  {
    "classifier": {
      "lane": "qdrant-dense",
      "confidence": 0.92,
      "reason": "features indicate vector-first search"
    },
    "fallback": {
      "applied": false,
      "rule": "passed all validation rules"
    },
    "hmm": {
      "state": "canonical",
      "lane_recovery": "valid"
    },
    "search": {
      "mode": "hybrid",
      "dense_latency_ms": 45,
      "sparse_latency_ms": 25,
      "dense_candidates": 20,
      "sparse_candidates": 20,
      "rrf_fused": 3
    },
    "result": {
      "top_candidate": "ace:packet:042",
      "top_score": 0.0164,
      "execution_time_ms": 72
    }
  }

Step 8: Golden Replay Audit
  Track this query:
    Lane used: qdrant-dense
    Top result: ace:packet:042
    User feedback: ✓ Relevant
  
  Aggregate metrics:
    qdrant-dense NDCG@5: 0.89 (good)
    qdrant-dense NDCG@10: 0.85 (good)
    qdrant-dense recall@10: 0.92 (tracking)
  
  If metrics drift, trigger retraining cycle
```

## Safety Contracts

### Contract 1: Fallback Rule Enforcement

**If XGBoost predicts a lane, fallback rules MUST validate it:**

```go
decision := rules.ApplyFallback(classifierLane, confidence, featureMap)
finalLane := decision.Lane  // May differ from classifierLane!
```

**Forbidden:** Trust XGBoost output directly without fallback validation.

### Contract 2: Lane Executability

**Before executing a lane, check prerequisites:**

```go
if !rules.ValidateLaneRequirements(lane, features) {
  return fallbackLane  // Cannot execute this lane
}
```

### Contract 3: HMM State Gate

**Every packet routing decision must pass HMM validation:**

```
XGBoost recommendation
  ↓
HMM state validation (identity + recovery)
  ↓
IF passed: execute lane
IF failed: fallback or quarantine
```

### Contract 4: Observability Chain

**Every decision must be traceable:**

```
Langfuse trace includes:
  - Classifier input + output
  - Fallback rule applied (yes/no + reason)
  - HMM state validation (pass/fail + state)
  - Search execution (latency breakdown)
  - RRF fusion (rank changes)
  - Final result (top-K + scores)
```

## Performance Expectations

| Stage | Time | Throughput | Fail Rate |
|-------|------|-----------|-----------|
| Feature extraction | 0ms | ∞ | 0% (local compute) |
| XGBoost inference | <1ms | >1000 req/s | 0% |
| Fallback rules | <1ms | >1000 req/s | <0.1% (rare) |
| HMM validation | 5-10ms | 100-200 req/s | <1% (identity issues) |
| Hybrid search | 40-60ms | 17-25 req/s | <5% (missing vectors) |
| RRF fusion | <5ms | >200 req/s | 0% |
| **Total** | **50-80ms** | **12-16 req/s** | **<2%** |

## Deployment Checklist

- [ ] Run smoke test: `npm run atlas:lane-classifier:smoke`
- [ ] Build sidecar: `cd go-retrieval-classifier && go build`
- [ ] Start sidecar: `./bin/classifier-sidecar -port 8095`
- [ ] Test /predict endpoint with fallback rules enabled
- [ ] Verify fallback triggers on low confidence (<0.70)
- [ ] Verify rare class validation (som-topology, neo4j-authority)
- [ ] Enable HMM state validation in sidecar
- [ ] Wire Langfuse/OpenTelemetry tracing
- [ ] Set up golden replay audit dashboard
- [ ] Monitor per-lane NDCG metrics

## Next: Phase 6-7 Integration

This classifier + fallback layer is ready.

**Next phase:** Wire HMM state machine (identity validation) into the decision path.

See `docs/PHASE-6-7-IDENTITY-VALIDATION.md` for state machine details.
