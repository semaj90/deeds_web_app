# System Architecture Blueprint: Evidence-Driven Retrieval + Reasoning

**Date**: July 7, 2026  
**Vision**: Your full production system (LangGraph → Dispatcher → Bitmap → Retrieval → RRF → Reasoning)  
**Approach**: Five validation gates, each evidence-driven, each unblocks the next  

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ LangGraph Agent (State Machine)                                  │
│  - Orchestration only (no datastore ownership)                   │
│  - Routes between: Dispatcher, Worker DAG, Gemma4               │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌─────────────────────────▼────────────────────────────────────────┐
│ Dispatcher Node                                                   │
│  - Rule Engine (hard constraints)                                │
│  - Naive Bayes (advisory confidence)                             │
│  - HMM State Predictor (advisory lifecycle)                      │
│  - Bitmap Gate (current state authority)                         │
│  Decision: Route to Go Retrieval, RabbitMQ Worker, or Reject     │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                │                ▼
    Go Retrieval    RabbitMQ Worker   Gemma4 Reasoning
        │           (Async DAG)            │
    ┌───┴──────┐                      Explanation +
    │   │      │                      Evidence
 Qdrant Neo4j PG
    │   │      │
    └───┴──────┘
        │
   RRF Fusion
   (6 signals)
        │
   Reranking
   (384/768-d)
        │
   Final Candidates
```

---

## Five Production Gates (Sequential, Evidence-Driven)

### Gate 1: Correlation Benchmark ✅ **COMPLETE**

**Purpose**: Validate latent64 prefilter ranking preservation  
**Evidence Collected**:
- Spearman rank correlation (0.595 vs need 0.85) ❌ FAIL
- Recall@100 (100% vs need ≥98%) ✅ PASS
- NDCG@20 regression (0.0 vs need >-0.05) ✅ PASS
- Latency improvement (66.7% vs need >50%) ✅ PASS

**Result**: Simple averaging insufficient. Blocks latent64 deployment without autoencoder.

**Blocks**: Nothing (Gate 1 is advisory on latent64 path only)  
**Enables**: Design decision (Path A vs B) for latent64  
**Next**: Gate 2 (independent)

---

### Gate 2: Confidence Scoring Normalization ⏳ **DESIGN READY**

**Purpose**: Align all confidence signals to [0, 1] scale  
**Systems to Normalize**:

| System | Current Scale | Target Scale | Owner |
|--------|--------------|--------------|-------|
| Ontology | 0-1 (keyword overlap) | 0-1 | Phase 3b.1 ✅ |
| Engram | 0-1 (AST coverage) | 0-1 | Feature tracking |
| Dispatcher | Posterior (Naive Bayes) | 0-1 | Gate 2 work |
| Telemetry | Tool success rate | 0-1 | Gate 2 work |
| Retrieval (RRF) | Varies per signal | 0-1 | Gate 2 work |
| Reranking | Cosine similarity | 0-1 | Already normalized |

**Execution**:
1. Audit all confidence sources in codebase
2. Create normalization functions (confidence_0_to_1_scale.ts)
3. Wire into: Dispatcher routing, RRF fusion, Telemetry
4. Validate: All signals on same scale

**Gate Success Criteria**:
- ✅ All 6 signal sources report 0-1
- ✅ Dispatcher uses normalized scores for routing
- ✅ RRF formula applies without rescaling
- ✅ Telemetry + HMM agree on confidence interpretation

**Blocks**: Gate 5 (Dispatcher needs normalized scores)  
**Enables**: RRF fusion to work correctly  
**Effort**: 2-3 days  
**Next**: Gate 3 (parallel)

---

### Gate 3: Symbol Resolver + Structural Edges ⏳ **READY TO EXECUTE**

**Purpose**: Build deterministic symbol resolution and structural graph  
**Current State**:
- ✅ Packets exist (58,365)
- ✅ Symbols exist (function/class names)
- ✅ Semantic edges exist (106K from Phase 3b.1)
- ❌ Structural edges missing (CALLS, IMPORTS, USES, TESTED_BY)

**Execution**:
1. **Symbol Resolver** (`src/lib/server/graph/symbol-resolver.ts`):
   - Input: symbol name (e.g., `auth.validateSession`)
   - Output: packet_key + confidence
   - Strategy: AST-grep for definitions, imports, usage
   - Fallback: Levenshtein on codebase_chunk_index

2. **Structural Edge Extraction** (`scripts/atlas/extract-structural-edges.mjs`):
   - CALLS: A calls B
   - IMPORTS: A imports from B
   - USES: A uses constant/type B
   - TESTED_BY: test X tests function Y
   - Source: AST walk + import analysis
   - Target: Neo4j (deterministic, idempotent)

3. **Neo4j Sync** (`scripts/atlas/sync-structural-edges-to-neo4j.mjs`):
   - Merge semantic edges (Phase 3b.1) + structural edges (new)
   - Result: Hybrid graph (semantic + structural)

**Gate Success Criteria**:
- ✅ Resolve 95%+ of symbols to packet_keys
- ✅ Extract 10K+ CALLS + IMPORTS edges
- ✅ Neo4j contains both edge types
- ✅ Graph traversal uses both signals

**Blocks**: Gate 4 (optional dependency)  
**Enables**: Hybrid graph traversal in retrieval  
**Effort**: 3-4 days  
**Next**: Gate 4 (parallel)

---

### Gate 4: Go Retrieval Stable API ⏳ **READY TO WIRE**

**Purpose**: Expose Go retrieval as stable HTTP interface  
**Current State**:
- ✅ Go sidecar running (:8100, :8096)
- ✅ Unified search wired
- ❌ Stable API contract missing

**Execution**:
1. **HTTP API Contract** (`docs/architecture/GO-RETRIEVAL-HTTP-CONTRACT.md`):
   ```
   POST /search
   Input:  { query, top_k, filters? }
   Output: { candidates[], metadata, timing }
   ```

2. **Response Envelope** (Canonical shape):
   ```json
   {
     "candidates": [
       {
         "packet_key": "auth:001",
         "feature_id": "auth.validateSession",
         "similarity": 0.92,
         "confidence": 0.85,      // Normalized (Gate 2)
         "source": "qdrant_dense"
       }
     ],
     "metadata": {
       "query_hash": "abc123",
       "total_candidates": 1000,
       "retrieved": 100,
       "stages_completed": ["qdrant", "neo4j", "rrf"]
     },
     "timing": {
       "qdrant_ms": 45,
       "neo4j_ms": 12,
       "rrf_ms": 8,
       "total_ms": 65
     }
   }
   ```

3. **Integration Tests** (`tests/e2e/go-retrieval-contract.spec.ts`):
   - Happy path (query execution)
   - Filters (ontology tags, domain class)
   - Error handling (400 bad query, 503 service down)
   - Response shape validation (Zod)
   - Latency SLA (<100ms p99)

**Gate Success Criteria**:
- ✅ API contract documented
- ✅ Response shape matches Go + TypeScript
- ✅ Error handling covers 5+ modes
- ✅ Latency stable (<100ms p99)

**Blocks**: Gate 5 (Dispatcher calls this)  
**Enables**: Stable retrieval interface  
**Effort**: 2-3 days  
**Next**: Gate 5 (dependent)

---

### Gate 5: Bitmap Gate + HMM Dispatcher ⏳ **WIRING PHASE**

**Purpose**: Wire dispatcher as routing authority (bitmap gate + HMM advisory)  
**Architecture**:

```
Dispatcher Decision Flow:
  1. Read Bitmap Gate (Valkey)
     ↓ (current state authority)
  2. Query HMM (advisory state prediction)
     ↓
  3. Rule Engine (hard constraints)
     ↓
  4. Blend (rule + HMM advisory)
     ↓
  5. Route Decision
     ↓
  6. Emit Telemetry → Update Bitmap
```

**Bitmap Gate Signals** (Valkey):
```
bitfrost:state:{packet_key} = {
  "identity_lane": "canonical" | "recoverable" | "quarantine",
  "sync_status": "in_sync" | "stale" | "diverged",
  "pagerank": 0.87,
  "confidence": 0.92,            // Normalized (Gate 2)
  "freshness": 0.95,
  "last_updated": 1720346400
}
```

**HMM Model** (10 observations, 9 states):
```
Observations:
  - bitmap_score (0-1)
  - symbol_resolver_success (0-1)
  - qdrant_exists (0-1)
  - neo4j_exists (0-1)
  - telemetry_score (0-1)
  - pagerank (0-1)
  - community_id_consistency (0-1)
  - freshness (0-1)
  - feature_confidence (0-1)
  - reconstruction_error (0-1)

States:
  UNKNOWN → INDEXED → ENRICHED → GRAPHED → VALIDATED → TRUSTED
    ↓        ↓         ↓         ↓         ↓
  (seed)   STALE    REPAIR    STALE    STALE
                      ↓
                 QUARANTINE
```

**Dispatcher Integration**:
1. Read bitmap gate (Valkey) → current state
2. HMM predicts next state (advisory)
3. Rule engine applies constraints
4. Blend: confidence *= hmmWeight
5. Route: if confidence > threshold → Go Retrieval; else → Worker DAG

**Gate Success Criteria**:
- ✅ Bitmap gate reads/writes <5ms
- ✅ HMM prediction matches observed state ≥85%
- ✅ Dispatcher routing uses normalized scores (Gate 2)
- ✅ Error recovery via Worker DAG
- ✅ Telemetry reports bitmap + HMM signals

**Blocks**: Production deployment (this is the orchestration point)  
**Enables**: Evidence-driven routing decision  
**Effort**: 4-5 days  
**Next**: Path A/B execution (Latent64 or Multi-Vector)

---

## Latent64 Path (Conditional on Gate 1)

### Current Status
- Gate 1: ❌ Simple averaging fails (Spearman 0.595)
- Requires: Path A (autoencoder) or Path B (skip)

### Path A: Train Autoencoder (1-2 weeks)

```
Gate 1 ❌ → Autoencoder Training → Correlation Revalidation → Deploy as Prefilter
```

**Steps**:
1. Collect 5K-10K query-result pairs (training data)
2. Train VAE (768→64→768, reconstruction loss <0.1)
3. Re-run correlation benchmark (expect Spearman >0.85)
4. If pass: Deploy latent64 prefilter at Gate 5
5. A/B test: 5% traffic → 100%

**Timeline**: Weeks 2-4 (training + validation)  
**Risk**: Autoencoder may not reach >0.85 correlation  
**Benefit**: Fast prefilter (12× speedup possible)

### Path B: Skip Latent64 (2-3 days)

```
Gate 1 ❌ → Multi-Vector Lanes → RRF Fusion → Deploy Immediately
```

**Steps**:
1. Deploy Qdrant named-vector lanes (already wired Phase 3b.1):
   - `content` (768-d): semantic search
   - `summary` (768-d): summary ranking
   - `keywords` (tfidf): lexical precision
   - `graph` (entity overlap): structural relevance
2. Implement RRF fusion (4-5 signals, normalized scores)
3. A/B test: 5% traffic → 100%

**Timeline**: Weeks 2-3 (deployment only)  
**Risk**: Lower (no new training)  
**Benefit**: Fast deployment, proven lanes

---

## Data Flow: Query → Reasoning

### Query Ingestion
```
User Query
  │
  ├─ Embed (embeddinggemma:384d)
  │
  └─ Hash (query_hash)
```

### Dispatcher Decision
```
Dispatcher reads Bitmap Gate (Valkey)
  │
  ├─ Rule Engine: Is this query type allowed?
  │
  ├─ Naive Bayes: What confidence do we have?
  │
  ├─ HMM: What lifecycle state?
  │
  └─ Blend: confidence *= hmmWeight
     │
     ├─ If confidence > 0.85 → Go Retrieval
     │
     └─ Else → RabbitMQ Worker DAG (async recovery)
```

### Go Retrieval Pipeline
```
Query Embedding (384-d)
  │
  ├─ Qdrant ANN (768-d content vector)
  │  └─ Top-20 candidates
  │
  ├─ Neo4j Graph Traversal (structural + semantic edges)
  │  └─ Expand by 1 hop (CALLS, IMPORTS, SIMILAR_TO)
  │
  └─ RRF Fusion (6 signals, normalized 0-1)
     ├─ qdrant_dense (0.30)
     ├─ qdrant_keywords (0.20)
     ├─ neo4j_graph (0.20)
     ├─ postgres_rg (0.15)
     ├─ ontology_confidence (0.10)
     └─ freshness_boost (0.05)
     │
     └─ Top-10 candidates + confidence scores
```

### Reranking + Reasoning
```
Top-10 Candidates
  │
  ├─ Semantic Rerank (384/768-d cosine similarity)
  │
  └─ Gemma4 Reasoning
     ├─ Generate explanation
     ├─ Cite evidence
     └─ Confidence assessment
```

### RabbitMQ Worker DAG (Async)
```
If Go Retrieval fails OR confidence < threshold:
  │
  ├─ Try fallback RG search
  │
  ├─ Symbol resolution retry
  │
  ├─ Neo4j graph expansion (deeper hops)
  │
  ├─ Manual reassembly (if all fail)
  │
  └─ Emit recovery telemetry
     │
     └─ Update Bitmap Gate (next query learns)
```

---

## Confidence Calibration (Gate 2 Artifact)

**All signals normalized to [0, 1]**:

```
RRF Formula (normalized weights):
  score = 0.30 × qdrant_score + 0.20 × keyword_score + 0.20 × graph_score + ...

Final confidence = score × dispatcher_confidence × hmmAdvisoryWeight

Telemetry captures:
  - Original confidence (per signal)
  - Normalized confidence (0-1)
  - HMM advisory (0-1)
  - Dispatcher blend (0-1)
  - Final confidence (0-1)
```

**Calibration checks** (post-deployment):
- Predicted confidence vs observed accuracy
- Per-signal contribution (which signal drives decisions?)
- Calibration curves (does 0.85 confidence = 85% accuracy?)

---

## Testing Strategy

### Gate 1: Correlation Benchmark ✅ **DONE**
- Spearman, Recall, NDCG, Latency
- 10-query dry-run ✅ (ready for 1000-query live)

### Gate 2: Confidence Normalization
- `tests/normalization/confidence-scale.spec.ts`
- All signals in [0, 1]
- No NaN, no Infinity, no negative values

### Gate 3: Symbol Resolver
- `tests/graph/symbol-resolver.spec.ts`
- Resolve 95%+ symbols
- Structural edges exist in Neo4j

### Gate 4: Go Retrieval API
- `tests/e2e/go-retrieval-contract.spec.ts`
- Happy path, error handling, latency SLA
- Response shape matches Zod schema

### Gate 5: Dispatcher + Bitmap
- `tests/dispatcher/routing-decision.spec.ts`
- Bitmap gate reads/writes <5ms
- HMM state prediction ≥85% accuracy
- Normalized scores flow through routing

### Post-Deployment: A/B Test
- 5% traffic: New system vs baseline
- Metrics: Latency, Recall, NDCG, User satisfaction
- SLO: If superior on 3/4 metrics, ramp to 100%

---

## Success Criteria (End-to-End)

| Criteria | Target | Owner |
|----------|--------|-------|
| **Latency (p99)** | <100ms | Gate 4 + Go Retrieval |
| **Recall@10** | ≥95% | RRF fusion (Gate 2) |
| **NDCG@20** | ≥0.80 | Reranking (384/768-d) |
| **Confidence Calibration** | 0.85 avg | Gate 2 normalization |
| **HMM Accuracy** | ≥85% | Gate 5 dispatcher |
| **Cache Hit Rate (Bitmap)** | ≥40% | Bitmap gate (Gate 5) |
| **Error Recovery** | <5% fallback | Worker DAG |

---

## References

- **Production Roadmap**: [SESSION-120-PRODUCTION-ROADMAP.md](SESSION-120-PRODUCTION-ROADMAP.md)
- **Correlation Benchmark**: [CORRELATION-BENCHMARK-WEEK1-VALIDATION.md](CORRELATION-BENCHMARK-WEEK1-VALIDATION.md)
- **Multi-Vector Architecture**: [SESSION-120-PHASE-3B2-REVISED-RETRIEVAL-ARCHITECTURE.md](SESSION-120-PHASE-3B2-REVISED-RETRIEVAL-ARCHITECTURE.md)

---

**Status**: Full architecture blueprint complete. Five sequential gates defined. Evidence-driven approach locked in. Ready for execution starting Gate 2 (after user Path A/B decision on latent64).
