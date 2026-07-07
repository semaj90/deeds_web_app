# Production System Roadmap: Evidence-Driven Architecture

**Date**: July 7, 2026  
**Reference**: Your system model (LangGraph → Dispatcher → Bitmap Gate → Retrieval → RRF → Reasoning)  
**Approach**: Evidence-driven checkpoints, measurable gates at each step

---

## Your Vision: Full Production System

```
         LangGraph (Agent State Machine)
                    │
         Dispatcher (Route Decision)
                    │
         Bitmap Gate (Valkey L1 Authority)
                    │
      ┌─────────────┴──────────────┐
      │                            │
  Go Retrieval                RabbitMQ Worker DAG
  (Qdrant/Neo4j/PG)                │
      │                       (Async Processing)
  ┌───┴────┬───────────┐           │
  │        │           │           │
Qdrant  Neo4j    PostgreSQL        │
  │        │           │           │
  └────────┼───────────┘           │
           │                       │
       RRF Fusion                  │
           │                       │
      Gemma4 Reasoning             │
           │                       │
  Explanation + Evidence ←─────────┘
```

**Key Properties**:
- LangGraph = orchestration only (no datastore ownership)
- Dispatcher = routing decision authority (rule engine + Naive Bayes + HMM advisory)
- Bitmap Gate = current-state truth (Valkey, immediate consistency)
- Retrieval = read-only mirrors (Qdrant ANN, Neo4j topology, Postgres canonical)
- RRF = evidence fusion (6 signals, normalized 0-1 scale)
- Gemma4 = reasoning + explanation (no search)
- RabbitMQ DAG = async worker loop (error handling, recovery)

---

## Execution Roadmap: Five Production Gates

### Gate 1: Correlation Benchmark (Week 1) ✅ **COMPLETE**

**What**: Validate latent64 prefilter ranking preservation  
**Evidence**: Spearman >0.85, Recall@K, NDCG, latency improvement  
**Result**: ❌ Simple averaging fails (Spearman 0.595). Blocks deployment without autoencoder.  
**Decision Point**: Option A (train autoencoder) or Option B (skip latent64)

**Checkpoint**:
- ✅ Benchmark harness operational
- ❌ G4 gate failed
- ⏳ Design decision pending

---

### Gate 2: Confidence Scoring Normalization (Week 2) ⏳ **DESIGN PHASE**

**What**: Normalize all confidence signals to [0, 1] scale across all systems  
**Systems to normalize**:
1. **Ontology**: `ontology.confidence` (keyword overlap 0-1)
2. **Engram**: `feature_confidence` (AST coverage 0-1)
3. **Dispatcher**: routing decision confidence (Naive Bayes posterior 0-1)
4. **Telemetry**: `signal_confidence` (tool execution success 0-1)
5. **Retrieval**: `fusion_score` (RRF normalized 0-1)
6. **Reranking**: `semantic_score` (cosine similarity 0-1)

**Canonical Scales**:
```sql
-- Postgres: confidence REAL CHECK (confidence >= 0 AND confidence <= 1)
-- Qdrant payload: "confidence": 0.85 (numeric, 0-1)
-- Redis: bitfrost:*:confidence = (integer 0-100, divide by 100 on read)
-- HMM observation: confidence_score (0-1, Bayesian posterior)
```

**Integration Points**:
- Dispatcher uses normalized scores for routing (all on same scale)
- RRF fusion uses normalized scores (0.30·score1 + 0.20·score2 + ...)
- Telemetry reports confidence aligned with HMM observations

**Gate Success Criteria**:
- ✅ All 6 signal sources report 0-1 scale
- ✅ Dispatcher routing uses normalized scores
- ✅ RRF formula applies to 0-1 range (no rescaling)
- ✅ Telemetry and HMM agree on confidence interpretation

---

### Gate 3: Symbol → Packet_Key Resolver + Structural Edges (Week 2-3) ⏳ **READY TO WIRE**

**What**: Build deterministic symbol resolution and structural graph edges  
**Current State**:
- ✅ `packet_key` exists (58,365 packets)
- ✅ `symbol` exists in codebase_chunk_index (function names, class names)
- ✅ Phase 3b.1 semantic edges exist (106K edges)
- ❌ Structural edges (CALLS, IMPORTS, USES, TESTED_BY) not extracted

**Work Required**:
1. **Symbol Resolver** (`src/lib/server/graph/symbol-resolver.ts`):
   - Input: symbol (e.g., `auth.validateSession`)
   - Output: packet_key + confidence
   - Strategy: AST-grep for function/class definitions + imports
   - Fallback: Levenshtein distance on codebase_chunk_index

2. **Structural Edge Extraction** (`scripts/atlas/extract-structural-edges.mjs`):
   - CALLS: function A calls function B
   - IMPORTS: module A imports from module B
   - USES: component A uses type/constant B
   - TESTED_BY: test file tests target function
   - Source: AST walk + import statements + test file analysis
   - Target: Neo4j edge creation (deterministic, idempotent)

3. **Neo4j Integration** (`scripts/atlas/sync-structural-edges-to-neo4j.mjs`):
   - Sync extracted edges to Neo4j (CALLS, IMPORTS, USES, TESTED_BY)
   - Join with ontology edges (SIMILAR_TO from Phase 3b.1)
   - Result: hybrid graph (semantic + structural)

**Gate Success Criteria**:
- ✅ Resolve 95%+ of symbols to packet_keys
- ✅ Extract 10K+ structural edges (CALLS, IMPORTS)
- ✅ Neo4j contains both semantic + structural edges
- ✅ Graph traversal returns both edge types

---

### Gate 4: Go Retrieval Stable API (Week 3-4) ⏳ **READY TO EXPOSE**

**What**: Expose Go retrieval sidecar with stable HTTP API (gRPC deferred)  
**Current State**:
- ✅ Go retrieval sidecar running (:8100, :8096)
- ✅ Unified search endpoint exists
- ✅ Cluster discovery wired
- ❌ Stable API contract documented

**Work Required**:
1. **HTTP API Contract** (`docs/architecture/GO-RETRIEVAL-HTTP-CONTRACT.md`):
   - Endpoint: `POST /search`
   - Input: query, top_k, filters (optional)
   - Output: candidates[], metadata, timing
   - Error handling: 400 (bad query), 503 (service down)

2. **Response Envelope** (Canonical shape):
   ```json
   {
     "candidates": [
       {
         "packet_key": "auth:001",
         "feature_id": "auth.validateSession",
         "similarity": 0.92,
         "confidence": 0.85,
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
   - ✅ Query execution (happy path)
   - ✅ Filter application
   - ✅ Error handling (400/503)
   - ✅ Response shape validation (Zod)
   - ✅ Latency SLA (<100ms p99)

**Gate Success Criteria**:
- ✅ API contract documented and tested
- ✅ Response envelope matches Go code + TypeScript consumers
- ✅ Error handling covers 5+ failure modes
- ✅ Latency stable (<100ms p99)

---

### Gate 5: Bitmap Gate + HMM Dispatcher Integration (Week 4-5) ⏳ **DESIGN COMPLETE, WIRING PHASE**

**What**: Wire bitmap gate as current-state authority; HMM as advisory predictor  
**Architecture**:

```
Dispatcher Decision Flow:
  1. Read bitmap gate (Valkey) → current state authority
  2. Query HMM for state prediction (advisory only)
  3. Apply rule engine (hard constraints)
  4. Blend rule output + HMM advisory → routing decision
  5. Execute (Go Retrieval, RabbitMQ Worker, etc.)
  6. Emit telemetry + update bitmap gate
```

**Bitmap Gate Signals** (Valkey keys):
```
bitfrost:state:{packet_key} = {
  "identity_lane": "canonical" | "recoverable" | "quarantine",
  "sync_status": "in_sync" | "stale" | "diverged",
  "pagerank": 0.87,
  "confidence": 0.92,
  "freshness": 0.95,
  "last_updated": 1720346400
}

bitfrost:dispatch:{query_hash} = {
  "decision": "go_retrieval" | "fallback_rg" | "reject",
  "route": "dense_vector" | "lexical" | "graph",
  "heuristic": "confidence > 0.85",
  "latency_ms": 45
}
```

**HMM Advisory** (10 observations, 9 states):
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
              ↓          ↓         ↓         ↓
            STALE     REPAIR    STALE    STALE
                                  ↓
                             QUARANTINE

Dispatcher uses HMM state as advisory confidence modifier.
```

**Integration Points**:
1. Dispatcher reads bitmap gate (Valkey) for current state
2. HMM predicts next state (advisory)
3. Rule engine applies hard constraints
4. Blend: dispatcher_confidence *= hmmAdvisoryWeight
5. Route decision: if confidence > threshold → execute; else → reject

**Gate Success Criteria**:
- ✅ Bitmap gate read/write under 5ms (Valkey)
- ✅ HMM prediction matches observed state in 85%+ cases
- ✅ Dispatcher routing uses normalized scores (Gate 2)
- ✅ Error recovery via worker DAG (RabbitMQ)
- ✅ Telemetry reports both bitmap + HMM signals

---

## Latent64 Strategy (Conditional on Gates 1-5)

**Current Gate 1 Status**: ❌ Simple averaging fails

**Decision Tree**:

| Path | Timeline | Evidence Gate | Blocker |
|------|----------|---------------|---------|
| **A: Train Autoencoder** | 1-2w | Re-run correlation (target: Spearman >0.85) | Training data collection |
| **B: Skip Latent64** | 2-3d | Deploy multi-vector lanes (no latent64) | None (ready immediately) |

**If Path A (Autoencoder)**:
- Phase 3b2.1: Collect 5K query-result pairs
- Phase 3b2.2: Train VAE (768→64→768)
- Phase 3b2.3: Validate reconstruction error <0.1
- Phase 3b2.4: Re-run correlation benchmark (expect G4 pass)
- **Then**: Deploy as prefilter at Gate 5 (after bitmap + dispatcher)

**If Path B (Skip Latent64)**:
- Deploy multi-vector Qdrant named vectors immediately:
  - content (768-d): semantic truth
  - summary (768-d): summary-based ranking
  - keywords (tfidf): lexical precision
  - graph (entity overlap): structural relevance
- **Then**: RRF fusion uses 4 signals instead of latent64

**Hard Rule**: Latent64 deployment gated on correlation benchmark passing G4 (Spearman >0.85). No exceptions.

---

## Full Roadmap Summary

### Timeline

```
Week 1: ✅ Gate 1 (Correlation Benchmark)
        ❌ G4 failed → Design decision needed (Path A vs B)

Week 2: Gate 2 (Confidence Normalization)
        Gate 3 starts (Symbol Resolver + Structural Edges)

Week 3: Gate 3 completes (Structural Edges in Neo4j)
        Gate 4 starts (Go Retrieval Stable API)

Week 4: Gate 4 completes (HTTP API contract + tests)
        Gate 5 starts (Bitmap Gate + HMM Dispatcher)

Week 5: Gate 5 completes (Dispatcher routing operational)
        Path A/B execution (Autoencoder OR Multi-Vector)

Week 6+: Production deployment (all gates pass)
         A/B testing in 5% traffic
         Ramp to 100% (based on metrics)
```

### Parallel Tracks

**Track 1: Core Infrastructure** (Gates 1-5)
- Correlation benchmark ✅
- Confidence normalization
- Symbol resolver + structural edges
- Go retrieval API
- Bitmap gate + HMM dispatcher

**Track 2: Optional (Latent64 Path A)**
- Autoencoder training
- Correlation re-validation
- Prefilter integration

**Track 3: Required (Multi-Vector Lane Deployment)**
- Keyword extraction (ready: `npm run atlas:phase3b2:keywords:apply`)
- Qdrant named-vector sync
- RRF fusion (4-5 signals)

**Track 4: Background (Always Running)**
- Phase 7: Summarization (31.2% complete, 24/7)
- Phase 7.1: Error handling hardening
- Telemetry collection + HMM training

---

## Success Metrics (Post-Deployment)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Latency (p99)** | <100ms | End-to-end from query to RRF fusion |
| **Recall@10** | ≥95% | Relevant results in top-10 |
| **NDCG@20** | ≥0.80 | Ranking quality |
| **Confidence Calibration** | 0.85 avg | Predicted confidence vs observed accuracy |
| **HMM Accuracy** | ≥85% | State prediction match observed |
| **Cache Hit Rate (Bitmap)** | ≥40% | Queries hitting L1 bitmap gate |
| **Error Recovery** | <5% | Fallback to RabbitMQ worker DAG |

---

## Implementation Order (Non-Negotiable)

1. **Finish Gate 1** (correlation benchmark) → Decision Point ✅
2. **Execute Gate 2** (confidence normalization) → Enables dispatcher
3. **Execute Gate 3** (structural edges) → Hybrid graph
4. **Execute Gate 4** (Go retrieval API) → Stable interface
5. **Execute Gate 5** (bitmap + HMM) → Production routing
6. **Execute Path A or B** (latent64 or multi-vector) → Retrieval optimization
7. **Deploy to production** → Evidence-driven confidence

**Why this order**:
- Gates 2-5 are independent (can parallelize)
- Path A/B decision deferred until Gate 1 complete
- Gate 1 blocks nothing (correlation is advisory)
- Gate 5 (dispatcher) is load-bearing (orchestration point)

---

## Next Week (Session 121+)

### Immediate Actions (User Decision)

1. **Review Correlation Benchmark Gate 1 Results**
   - File: [CORRELATION-BENCHMARK-WEEK1-VALIDATION.md](CORRELATION-BENCHMARK-WEEK1-VALIDATION.md)
   - Decision: Path A (autoencoder) or Path B (skip latent64)?

2. **Choose Implementation Order**
   - Parallel Gates 2-4 while Gate 1 result matures
   - Or defer Gate 2-4 pending Path A/B decision?
   - Recommendation: Parallelize (Gates are independent)

3. **Assign Resources**
   - Gate 2: Confidence normalization script
   - Gate 3: Symbol resolver + structural edge extraction
   - Gate 4: Go retrieval HTTP API contract + tests
   - Gate 5: Dispatcher routing integration (dependent on Gate 2)

### Session 121 Execution (If Parallel Track)

- Execute Gate 2: `scripts/normalize-confidence-scores.mjs`
- Execute Gate 3: `scripts/extract-structural-edges.mjs` + Neo4j sync
- Test Gate 4: HTTP contract validation (`tests/e2e/go-retrieval-contract.spec.ts`)
- Plan Gate 5: Dispatcher routing architecture (blocked on Gate 2)

---

## References

- **Your System Model**: Full LangGraph → Dispatcher → Bitmap → Retrieval → RRF → Reasoning pipeline
- **Current Gate 1 Status**: [CORRELATION-BENCHMARK-WEEK1-VALIDATION.md](CORRELATION-BENCHMARK-WEEK1-VALIDATION.md)
- **Multi-Vector Alternative**: [SESSION-120-PHASE-3B2-REVISED-RETRIEVAL-ARCHITECTURE.md](SESSION-120-PHASE-3B2-REVISED-RETRIEVAL-ARCHITECTURE.md)
- **Memory**: [SESSION-120-WEEK1-CORRELATION-GATE.md](.claude/projects/c--Users-james-Videos-deeds-web-app/memory/SESSION-120-WEEK1-CORRELATION-GATE.md)

---

**Status**: Evidence-driven roadmap defined. Waiting for user design decision on Gate 1 → Path A/B → Execute Gates 2-5.

**Principle**: Every optimization is gated on measurable evidence before production deployment. No assumptions. No optimizations without validation.