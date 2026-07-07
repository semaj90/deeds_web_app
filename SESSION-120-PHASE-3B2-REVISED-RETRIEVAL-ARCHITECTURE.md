# Session 120: Phase 3b.2 Revised Retrieval Architecture

**Status**: ✅ **ARCHITECTURE REFINED** | Evidence-Driven Deployment | Latent64 = Routing Optimization (NOT Semantic Truth)

**Date**: July 7, 2026 | **Session**: 120 Continuation

---

## EXECUTIVE SUMMARY

Latent64 is a **fast prefilter and routing signal**, not the primary semantic retrieval lane. All semantic truth remains in **384-d or 768-d named vectors**. The autoencoder is a **speed optimization** that must pass strict **correlation benchmarks** before joining the production retrieval path.

**Key Constraint**: Do not assume latent64 performance gains. **Measure first, deploy second.**

---

## REVISED SIX-STAGE RETRIEVAL PIPELINE

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Query + Ontology Classification                   │
│ • Extract query embedding (384-d or 768-d)                 │
│ • Classify query node_type (api_endpoint / function / etc) │
│ • Set confidence threshold for this query type              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Bitmap Gate (Valkey)                              │
│ • Check: feature:bitmap:{feature_id} (exact match cache)   │
│ • Hit: return cached packet IDs → skip to Stage 6          │
│ • Miss: continue to Stage 3                                 │
│ • Latency: <1ms (hits), 5ms (misses)                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Latent64 Fast Prefilter + Routing                 │
│ • Encode query to latent64 (64-dim via autoencoder)        │
│ • Cosine search in latent64: top-1000 candidates           │
│ • Classify retrieval lane (Naive Bayes on latent features) │
│ • Predict packet state (HMM: canonical/recoverable/etc)    │
│ • Latency: 4ms (fast prefilter)                             │
│ • Output: lane recommendation, state prediction, top-1000   │
│ • NOTE: latent64 is gating, NOT ranking truth              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Named Vector Retrieval (Semantic Truth)           │
│ • Search only top-1000 from Stage 3 (via Qdrant)           │
│ • Run 6 named vectors in parallel (RRF fusion):            │
│   ├─ content (384-d, SEMANTIC BASELINE)                    │
│   ├─ summary (384-d, abstraction)                          │
│   ├─ title (384-d, navigation)                             │
│   ├─ keywords (384-d, lexical bridge)                      │
│   ├─ feature_embedding (384-d, feature-level semantics)    │
│   └─ latent64 (64-d, topology hints only)                  │
│ • RRF weights: content=1.0, summary=0.8, title=0.6,        │
│               keywords=0.9, feature=0.7, latent64=0.3      │
│ • Output: top-500 candidates with RRF scores               │
│ • Latency: 15-20ms (parallel Qdrant ops)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 5: Graph Expansion (Neo4j Topology)                  │
│ • For each candidate, expand k-hop neighbors (k ≤ 2)       │
│ • Retrieve: SIMILAR_TOPOLOGY, IMPORTS, USES edges          │
│ • PageRank score (cached from couchdb:pagerank_scores)     │
│ • Community ID (Louvain community membership)              │
│ • Output: augmented candidates with topology signals       │
│ • Latency: 10-15ms (bounded k-hop)                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 6: Truth Join + Rerank + RRF                         │
│ • Join Qdrant candidates with Postgres canonical packets   │
│ • Final rerank: Karpathy blend                              │
│   ├─ Cosine (384-d full vector): 0.4 weight               │
│   ├─ Attention score (GPU): 0.3 weight                     │
│   ├─ PageRank authority: 0.3 weight                        │
│ • HMM state classifier: filter by packet lifecycle         │
│ • Confidence threshold filter: drop scores < threshold     │
│ • Output: top-50 final candidates with confidence          │
│ • Latency: 8-10ms (Postgres join + GPU rerank)             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 7: Gemma4 Synthesis                                   │
│ • Prompt: question + top-50 context packets                │
│ • LLM: gemma4-legal:latest via llama-server :8090          │
│ • Output: natural language answer + citations              │
│ • Latency: 3-5s (Gemma4 inference)                          │
└─────────────────────────────────────────────────────────────┘

Total Pipeline Latency: ~50-100ms retrieval + 3-5s synthesis = 3.05-5.1s
(Gemma4 dominates; retrieval is negligible)
```

---

## VECTOR ROLE CLARIFICATION

| Vector | Dimension | Purpose | Storage | Status |
|--------|-----------|---------|---------|--------|
| **content** | 384-d | 🎯 **SEMANTIC TRUTH** | Qdrant named vector | ✅ LIVE |
| **summary** | 384-d | Abstraction/overview | Qdrant named vector | ⏳ Phase 7 |
| **title** | 384-d | Navigation/labeling | Qdrant named vector | ⏳ AST extraction |
| **keywords** | 384-d | Lexical bridge (BM25) | Qdrant named vector | ✅ Phase 3b.2 |
| **feature_embedding** | 384-d | Feature-level semantics | Qdrant named vector | ⏳ Phase 3b.2 |
| **latent64** | 64-d | **ROUTING ONLY** (prefilter) | Qdrant named vector + Postgres BYTEA | ⏳ Gated deployment |

**Hard Rule**: Only `content` is canonical semantic truth. All others are auxiliary signals. Latent64 is **not** a vector lane; it's a **gating mechanism**.

---

## LATENT64 ROLE: FAST PREFILTER + ROUTING

### What Latent64 Does

```
Query (768-d)
  ↓
Autoencoder: 768-d → 64-d (latent encoding)
  ↓
Fast cosine in 64-d: O(K × 64) ≈ 4ms
  ↓
Returns: top-1000 candidates (cheaply)
  ↓
Only these 1000 proceed to Stage 4 (semantic reranking)
```

### What Latent64 Does NOT Do

- ❌ It is NOT the semantic ranking signal
- ❌ It does NOT replace 384-d/768-d content search
- ❌ It does NOT carry the same meaning across dimensions
- ❌ It does NOT guarantee ranking order preservation

### Why Latent64 Matters

1. **Speed**: 4ms vs 50ms (12.5× faster per candidate)
2. **Gating**: Reduces from 40K candidates to 1K before expensive reranking
3. **Routing**: Latent space variance reveals which lane is best
4. **Clustering**: SOM topology uses latent64 to group similar concepts

---

## EXPANDED HMM: PACKET LIFECYCLE STATES

**Previous (Too Simple):**
```
canonical / recoverable / quarantine / unknown (4 states)
```

**Revised (Lifecycle-Aware):**
```
UNKNOWN
  ↓ (indexed)
INDEXED (packet_key assigned)
  ↓ (enriched)
ENRICHED (metadata populated: source_ref, feature_id, summary)
  ↓ (graphed)
GRAPHED (Neo4j edges, topology assigned)
  ↓ (validated)
VALIDATED (identity verified, cross-store consistency check)
  ↓ (trusted)
TRUSTED (used in synthesis, high confidence)
  ├→ STALE (not updated in 30 days)
  ├→ REPAIR (detected inconsistency, recovery attempted)
  └→ QUARANTINE (unrecoverable, excluded from retrieval)
```

### Expanded Observation Space

Instead of 5 observations, track 10:

| Observation | Source | Type | Range |
|-------------|--------|------|-------|
| **bitmap_score** | Valkey gate | float | [0, 1] |
| **symbol_resolver** | symbol_resolver table | float | [0, 1] (confidence) |
| **qdrant_exists** | Qdrant point_id | binary | {0, 1} |
| **neo4j_exists** | Neo4j node | binary | {0, 1} |
| **telemetry_score** | Dispatch telemetry | float | [0, 1] |
| **pagerank** | Neo4j + couchdb cache | float | [0, 1] (percentile) |
| **community_id** | Louvain community | int | [1, K] |
| **freshness** | Postgres updated_at | int | [0, 30] (days stale) |
| **feature_confidence** | Phase 3b ontology | float | [0, 1] |
| **reconstruction_error** | Autoencoder eval | float | [0, 1] (normalized) |

### HMM Transition Rules

Example transition `INDEXED → ENRICHED`:
```
P(ENRICHED | INDEXED) = 0.9 if source_ref ≠ NULL
P(ENRICHED | INDEXED) = 0.3 if source_ref = NULL
P(STALE | ENRICHED) = 0.1 if (NOW() - updated_at) > 30 days
P(REPAIR | ENRICHED) = 0.05 if reconstruction_error > 0.15
```

**Inference**: Viterbi algorithm over the packet's observation sequence + lifecycle history → predict current state + confidence

---

## STAGED ROUTER: RULES + NAIVE BAYES + HMM + DISPATCHER

**Instead of**: Naive Bayes makes all routing decisions

**Use this pipeline**:

```
Query + Context
  ↓
┌─────────────────────────────┐
│ Stage 3a: Rule Engine       │
├─────────────────────────────┤
│ • Reject impossible lanes   │
│ • Filter by query type      │
│ • Hard constraints          │
└─────────────────────────────┘
  ↓
┌─────────────────────────────┐
│ Stage 3b: Naive Bayes       │
├─────────────────────────────┤
│ • Recommend best lane       │
│ • Produce probabilities     │
│ • Advisory, not final       │
└─────────────────────────────┘
  ↓
┌─────────────────────────────┐
│ Stage 3c: HMM State Pred    │
├─────────────────────────────┤
│ • Predict packet lifecycle  │
│ • Confidence score          │
│ • Filter by state validity  │
└─────────────────────────────┘
  ↓
┌─────────────────────────────┐
│ Stage 3d: Dispatcher        │
├─────────────────────────────┤
│ • Deterministic decision    │
│ • Resolve conflicts         │
│ • Route to lane + reranker  │
└─────────────────────────────┘
  ↓
Final Lane Assignment
```

**Dispatcher Logic**:
```
if rule_engine.rejects(lane):
  skip lane
else if hmm_state == QUARANTINE:
  skip packet
else if naive_bayes.confidence > 0.8:
  route to recommended_lane
else:
  route to default_lane (content semantic search)
```

This keeps the probabilistic model **advisory**, not authoritative.

---

## AUTOENCODER DEPLOYMENT SEQUENCE (EVIDENCE-DRIVEN)

### Phase 1: Validation (2 days)

```
Day 1:
  ├─ Run autoencoder on full 40K embeddings
  ├─ Compute reconstruction error per packet
  ├─ Gate G1: recon_error < 0.1 for 99%+ of packets
  ├─ Gate G2: clipping < 5% of values
  └─ Gate G3: latent64 distribution is not pathological (0.1%-99% span > 2σ)

Day 2:
  ├─ Sample 1,000 random queries
  ├─ For each query:
  │   ├─ Compute top-100 via content (768-d, semantic truth)
  │   ├─ Compute top-100 via latent64 (64-d, fast prefilter)
  │   ├─ Measure Spearman correlation of rank positions
  │   ├─ Measure Recall@K (K=10, 20, 50, 100)
  │   ├─ Compute NDCG@20 vs baseline
  │   └─ Record p50/p95 latency for each method
  └─ Aggregate results:
      ├─ Gate G4: Spearman correlation > 0.85
      ├─ Gate G5: Recall@100 ≥ 98% of baseline
      ├─ Gate G6: NDCG@20 no statistically significant regression (p < 0.05)
      └─ Gate G7: p95 latency improved (target: 4ms vs 50ms)
```

### Phase 2: Named Vector Enrichment (1 day)

**Only if Phase 1 gates PASS**:

```
├─ Upload latent64 to Qdrant codebase_chunks_768 (named vector)
├─ Deploy Postgres BYTEA storage (atlas_packets.latent_64)
├─ Cache latent64 in Valkey (gpu:karpathy:encoded, 24h TTL)
└─ Update Neo4j payload (som_cluster, latent64_exists flags)
```

### Phase 3: Retriever Integration (2 days)

**Latent64 enters the pipeline as prefilter only**:

```
├─ Wire Stage 3: latent64 prefilter in Go Retrieval
├─ Set top-K=1000 from latent64 (not top-50)
├─ Stage 4 still runs full RRF on all 6 named vectors (content=truth)
├─ Measure end-to-end latency + quality metrics
└─ A/B test: with latent64 gate vs without
    ├─ Hypothesis: 30-40% latency improvement, no recall regression
    └─ Monitor: actual latency, recall@K, NDCG@20 over 1 week
```

### Phase 4: Mahalanobis Reranking (CONDITIONAL)

**Only if correlation testing shows latent64 variance is meaningful**:

```
├─ Fit diagonal covariance matrix from 40K latent embeddings
├─ Wire Mahalanobis as Stage 4b: rerank latent64 top-1000 → top-200
├─ Measure: NDCG@20 improvement vs cosine alone
└─ Decision: keep if +2% improvement, else revert to cosine
```

### Phase 5: ML Algorithms (GATED)

```
├─ Naive Bayes lane classifier (requires labeled query set)
├─ HMM lifecycle routing (requires labeled packet states)
└─ Only deploy if eval harness shows predictive power > 75%
```

---

## VALIDATION GATES (HARD STOPS)

**All gates must PASS before production deployment**:

| Gate | Metric | Threshold | Status | Impact |
|------|--------|-----------|--------|--------|
| **G1** | Reconstruction MSE | <0.1 | ⏳ TODO | Compression quality |
| **G2** | Clipping % (values outside [0,255]) | <5% | ⏳ TODO | Quantization safety |
| **G3** | Latent distribution span | >2σ across dataset | ⏳ TODO | Variance is meaningful |
| **G4** | Spearman(full_vector, latent64) | >0.85 | ⏳ TODO | Ranking correlation |
| **G5** | Recall@100 (latent vs full) | ≥98% baseline | ⏳ TODO | Recall preservation |
| **G6** | NDCG@20 regression | p > 0.05 (not significant) | ⏳ TODO | Quality preservation |
| **G7** | p95 latency improvement | <10ms (vs 50ms baseline) | ⏳ TODO | Speed gain |
| **G8** | A/B test duration | ≥7 days, ≥1K queries | ⏳ TODO | Statistical power |
| **G9** | Production recall@K | No regression after 1 week | ⏳ TODO | Real-world validation |

**Gate Failure**: Latent64 remains in evaluation mode (not production retrieval).

---

## DEPLOYMENT ROADMAP: REVISED PHASE 3B.2

### Week 1: Validation

| Day | Task | Owner | Deliverable | Gate |
|-----|------|-------|-------------|------|
| 1-2 | Autoencoder batch + reconstruction audit | ML | reconstruction_errors.jsonl | G1-G3 |
| 3-5 | Correlation benchmark (1K queries) | Retrieval | correlation_report.md | G4-G7 |
| 6-7 | Gate review + decision | Team | go/no-go decision | All |

### Week 2-3: Conditional Deployment

**If gates PASS:**

| Day | Task | Owner | Deliverable | Gate |
|-----|------|-------|-------------|------|
| 8-9 | Named vectors + storage | Data | qdrant upload complete | — |
| 10-11 | Retriever integration (prefilter) | Backend | Stage 3 wired | — |
| 12-14 | A/B test (with/without latent64) | Ops | a/b_results.md | G8-G9 |

**If gates FAIL:**

```
├─ Analyze failure mode
├─ Retrain autoencoder with different architecture
├─ Return to Week 1 validation
```

### Week 4+: Conditional Enhancements

**Only if Week 2-3 A/B test passes**:

```
├─ Mahalanobis reranking (eval variance)
├─ Naive Bayes lane classifier (labeled queries)
├─ HMM lifecycle routing (state prediction)
└─ Golden replay evaluation (synthetic + real workloads)
```

---

## TIMELINE SUMMARY

| Phase | Duration | Critical Path | Go/No-Go |
|-------|----------|----------------|----------|
| **Validation** | 5 days | Correlation testing | All gates |
| **Conditional Deployment** | 7 days | A/B test | Recall regression |
| **Enhancements** | 5 days (if passed) | ML model training | Predictive power |
| **Total** | 17 days (nominal) | — | — |

**If any gate fails**: +7 days to redesign + revalidate

---

## REVISED PROJECT STATUS

| Component | Status | Blocker | Next |
|-----------|--------|---------|------|
| Autoencoder bridge | ✅ Implemented | None | Run batch |
| Latent64 schema | ✅ Defined | None | Populate BYTEA |
| Compression pipeline | ✅ Implemented | None | Validate gates G1-G3 |
| **Quantization validation** | 🟡 Pending execution | Above | Week 1 |
| **Latent correlation testing** | 🟡 Required gate | Above | Week 1 |
| **A/B test design** | 🟡 Ready to wire | G1-G7 | Week 2 |
| Named vectors | 🟡 Ready (conditional) | G1-G7 | After gates |
| Mahalanobis reranker | 🟡 Next (conditional) | G4+ | Week 3+ |
| Naive Bayes lane predictor | 🟡 Next (conditional) | Labeled data | Week 3+ |
| HMM lifecycle routing | 🟡 Next (conditional) | Labeled states | Week 3+ |
| **Production latent retrieval** | ❌ Not yet | G1-G9 | After validation |

---

## KEY DECISION POINTS

### 1. Do NOT assume latent64 gains

**Assume**: Latent64 might break ranking. Measure first.

**Test**: Sample 1,000 queries, check Spearman correlation. If <0.85, investigate why before deploying.

### 2. Semantic truth stays in 384-d/768-d

**Rule**: Only `content` named vector is the semantic truth. Latent64 is a **gating signal**, not a rank signal.

**Test**: Verify that top-50 from Stage 6 (semantic rerank) still match user expectations.

### 3. Mahalanobis is optional

**Conditional**: Only implement Mahalanobis if variance testing shows meaningful differences per dimension.

**Test**: Compute diagonal covariance; if off-diagonal near zero, skip Mahalanobis (cosine is sufficient).

### 4. HMM and Naive Bayes require labeled data

**Requirement**: 500-1000 labeled queries for Naive Bayes, packet state labels for HMM.

**Fallback**: If labeling is expensive, use rule-based routing (Stage 3a) instead.

---

## SUCCESS CRITERIA

✅ **Success**: All gates pass AND A/B test shows latency improvement without recall regression

❌ **Failure**: Any gate fails OR A/B test shows regression → redesign and revalidate

---

**Session 120 Revised Status**: ✅ **EVIDENCE-DRIVEN ARCHITECTURE LOCKED** | Ready for Week 1 Validation

**Next Action**: Build correlation benchmark harness (1K query eval script)

