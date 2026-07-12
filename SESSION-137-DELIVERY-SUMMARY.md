# Session 137: Stage 0–7 Architecture & Execution Framework Complete

**Date**: July 11, 2026  
**Status**: ✅ Ready for execution  
**Deliverables**: 5 scripts, 1 index, 6 npm commands, 2 guides

---

## What Was Built

### Canonical Dependency Pipeline (Stages 0–7)

Following your corrected execution order, we built a strict 8-layer feature alignment pipeline:

| Stage | Component | Approach | Output | Coverage Target | Status |
|-------|-----------|----------|--------|-----------------|--------|
| **0** | Identity Lock | Verification | packet_key 100% | 100% | ✅ READY |
| **1** | Structural (AST) | ast-grep + TS Compiler | tree_node_ids JSONB | 80% | ✅ READY |
| **2** | Lexical (BM25) | Deterministic tokenization | lexical_features JSONB | 85% | ✅ READY |
| **3** | Semantic (Gemma4) | Grounded to AST facts | summary_text | 85% | To build |
| **4** | Feature Envelope | JSONB consolidation | feature_envelope | 100% | To build |
| **5** | Named Embeddings | 4-lane vectors | content/summary/sig/topology | 100% | To build |
| **6** | Topology | SOM + KMeans + PageRank | GPU acceleration | 100% | To build |
| **7** | Classifier | XGBoost on full features | domain prediction | Trained | To build |

### Scripts Delivered

**Stage 0: Identity Verification** (`scripts/graphify/stages/stage0-identity-verify.mjs`)
- Node.js verification gate
- Checks: packet_key non-null, source_ref non-null, content_hash non-null
- Detects duplicates, reports gaps
- Exit codes: 0 (pass), 1 (fail), 2 (DB error)
- ~300 lines

**Stage 1: Structural Extraction** (`scripts/graphify/stages/stage1-structural-extract.py`)
- Python AST extractor
- Priority: TypeScript Compiler API → ast-grep (fallback)
- Extracts: functions, classes, interfaces, imports, exports, enums, type aliases
- Output: tree_node_ids JSONB with kind, name, start_line, end_line, hash
- Async batch processing, 100 packets/batch
- ~380 lines

**Stage 2: Lexical Extraction** (`scripts/graphify/stages/stage2-lexical-extract.py`)
- Python BM25 tokenizer
- Extracts: identifiers (camelCase, snake_case), paths, error codes, constants, comment terms
- BM25 scoring per term
- Output: lexical_features JSONB with term, frequency, score, type
- Top 50 terms per packet
- ~420 lines

**TypeScript AST Helper** (`scripts/graphify/lib/ts-ast-extractor.mjs`)
- Node.js subprocess for Stage 1
- Calls TypeScript Compiler API on .ts/.tsx/.js/.jsx files
- Parses AST, extracts node kinds and metadata
- JSON output for batch processing
- ~180 lines

### Configuration & Documentation

**Master Index** (`scripts/graphify/INDEX.md`)
- Complete dependency graph
- Stage 0–7 deep reference (parameters, output, coverage targets)
- RabbitMQ worker pool pattern
- Success criteria per stage
- Troubleshooting guide
- ~1,200 lines

**Quick Start Guide** (`STAGE-0-7-QUICK-START.md`)
- Execution order with timing
- npm command reference
- Parallel execution strategy
- Current state vs. target table
- Success criteria checklist
- ~400 lines

**Session Summary** (this file)
- Deliverables overview
- Key architectural decisions
- npm scripts mapping
- Next immediate action
- ~300 lines

### npm Scripts Added

From `sveltekit-frontend/package.json`:
```bash
npm run graphify:stage0:verify              # Verify identity (blocking gate)
npm run graphify:stage1:dry                 # Test AST extraction (no writes)
npm run graphify:stage1:apply               # Apply AST extraction
npm run graphify:stage2:dry                 # Test lexical extraction (no writes)
npm run graphify:stage2:apply               # Apply lexical extraction
npm run graphify:index                      # View full index
```

---

## Architectural Decisions (Why This Order)

### 1. Identity First (Stage 0)

**Rationale**: Nothing downstream is authoritative until packet_key, source_ref, content_hash are 100% locked.

**Impact**:
- Prevents cascading identity drift
- All downstream layers can assume canonical identity
- Detects duplicates early (before expensive processing)

### 2. Deterministic Before Semantic (Stages 1–2 before 3)

**Rationale**: AST and lexical extraction are pure CPU, no ML, no GPU, fully deterministic.

**Impact**:
- Stages 1–2 are fast (20–40 min total)
- Reduce risk of reprocessing (semantic may change with model updates)
- AST and lexical facts are stable ground truth for grounding Gemma4 in Stage 3

### 3. Grounded Semantic (Stage 3 → Stage 4)

**Rationale**: Instead of "summarize this file," ask Gemma4 "Given these verified AST symbols, describe primary capability, failure modes, business meaning."

**Impact**:
- Summaries stay grounded in code structure
- No hallucinated functions
- Provenance clear: AST → semantic derivation

### 4. Envelope Before Embeddings (Stage 4 → Stage 5)

**Rationale**: Feature envelope = checkpoint. Only embed after it's locked.

**Impact**:
- If upstream features change, don't re-embed (saves ~1 hour)
- Embeddings are expensive; minimize reprocessing
- Envelope is canonical form; embeddings are derived caches

### 5. Topology After Embeddings (Stage 5 → Stage 6)

**Rationale**: SOM, KMeans, PageRank need stable vector representations.

**Impact**:
- Topology converges better with mature embeddings
- GPU acceleration (PyTorch KMeans = 100–500× faster)
- Centroids are stable after topology completes

### 6. Classifier Last (Stage 7)

**Rationale**: XGBoost trains on full feature matrix (AST + lexical + semantic + topology + concepts + PageRank + SOM + community).

**Impact**:
- All features available and stable
- No need for retraining if features change mid-pipeline
- Synthesis layer: classifier confidence → agent routing

---

## Comparison to Your Original Feedback

**You said**: "I would instead make the dependency graph explicit. Stage 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7, nothing else is authoritative until this layer is complete."

**What we built**: Exact match. Each stage is gated on prior stages. Stage 0 is a **blocking verification gate** (identity must be 100%). Stages 1–7 are **sequential**, though some can run in parallel once their dependencies complete.

**You said**: "Finish tree_node_id backfill and canonical feature envelopes. Complete the semantic (Gemma4) backfill with provenance attached."

**What we built**: 
- Stage 1 extracts tree_node_id (AST symbols)
- Stage 3 (to be built) will backfill semantic with provenance
- Stage 4 (to be built) consolidates into canonical feature envelope

**You said**: "GPU work (PyTorch, cuML, cuVS, Triton) is generally limited by GPU scheduling rather than the GIL."

**What we built**: Stage 6 (topology) will use PyTorch GPU for KMeans/SOM, NetworkX CPU for PageRank. No cuVS (deferred, 8GB GPU insufficient).

---

## Key Design Principles

### 1. Canonical Identity is Immutable
- Stage 0 verifies and locks it
- All downstream layers reference it
- No synthetic keys persisted (discovery aliases only)

### 2. Postgres is Truth
- All writes go to Postgres first
- Qdrant/Redis are mirrors/caches
- Recovery order: Postgres → rebuild downstream

### 3. Deterministic Before Probabilistic
- Stages 1–2 are pure CPU, no ML
- Stage 3+ can be probabilistic (LLM, GPU)
- Risk of reprocessing is lower for deterministic stages

### 4. Feature Stability Before Consumption
- Envelope must be ≥75% complete before embeddings
- Embeddings must be complete before topology
- Topology must be complete before classifier

### 5. GPU Acceleration Where It Matters
- KMeans: GPU (100–500× speedup)
- SOM: GPU (10–50× speedup)
- PageRank: CPU (graph is small)
- Classifier: GPU tree-building (XGBoost native support)

---

## Execution Path (Your Next Steps)

### Immediate (Next 30 min)

1. **Verify Stage 0** (5 min)
   ```bash
   npm run graphify:stage0:verify
   ```
   Expected: All 3 gates pass ✅

2. **Test Stage 1** (10 min)
   ```bash
   npm run graphify:stage1:dry --batch=10
   ```
   Expected: Sample output showing AST extraction works

3. **Test Stage 2** (10 min)
   ```bash
   npm run graphify:stage2:dry --batch=10
   ```
   Expected: Sample output showing BM25 extraction works

### Short Term (Next 2 hours)

4. **Apply Stage 1 & 2 sequentially** (50 min total)
   ```bash
   npm run graphify:stage1:apply       # 20–40 min
   npm run graphify:stage2:apply       # 15–30 min
   ```
   Monitor via:
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
     SELECT COUNT(*) total, COUNT(CASE WHEN payload->'tree_node_ids' IS NOT NULL THEN 1 END) ast
     FROM atlas_packets"
   ```

5. **Build & Apply Stages 3–7** (4–5 hours)
   - Stage 3: Semantic backfill (Gemma4) — 2–3 hours
   - Stage 4: Feature envelope consolidation — 10 min
   - Stage 5: Embeddings (Ollama) — 45 min
   - Stage 6: Topology (PyTorch GPU) — 1–2 hours
   - Stage 7: Classifier (XGBoost) — 30 min

---

## Files Location Reference

```
sveltekit-frontend/
  package.json
    + graphify:* scripts (6 new)

scripts/graphify/
  INDEX.md                                  (master reference)
  stages/
    stage0-identity-verify.mjs              ✅ READY
    stage1-structural-extract.py            ✅ READY
    stage2-lexical-extract.py               ✅ READY
    stage3-semantic-backfill.py             (to build)
    stage4-feature-envelope.py              (to build)
    stage5-embeddings.py                    (to build)
    stage6-topology.py                      (to build)
    stage7-classifier.py                    (to build)
  lib/
    ts-ast-extractor.mjs                    ✅ READY
  config/
    stage-config.yaml                       (optional)
    worker-pool.yaml                        (optional)

Project root/
  STAGE-0-7-QUICK-START.md                  (execution guide)
  SESSION-137-DELIVERY-SUMMARY.md           (this file)
```

---

## Success Metrics

**After Stage 0–2 (1 hour)**:
- Identity: 100% verified ✅
- Structural: ≥80% coverage (≥4,650 packets with tree_node_ids)
- Lexical: ≥85% coverage (≥6,000 packets with lexical_features)

**After Stage 0–7 (5–7 hours)**:
- All 8 layers ≥85% coverage
- Feature envelope consolidated
- 4 embedding lanes populated
- Topology complete (SOM, KMeans, PageRank, communities)
- XGBoost classifier trained and saved

**Quality Gate**: No reprocessing needed → features stable for consumption (RRF fusion, agent routing, recommendations)

---

## Why This Matters

### Before (Scattered Approach)
- Jumped to semantic/embeddings without structural foundation
- Risked reprocessing if upstream changed
- No clear dependency order
- GPU work not optimized

### After (This Pipeline)
- Strict dependency order (identity → structure → lexical → semantic → envelope → embeddings → topology → classifier)
- Each stage is a checkpoint; minimal reprocessing risk
- Deterministic stages completed first (fast, low risk)
- GPU work isolated and optimized (Stage 6)
- Recommendation engine can be built on stable foundation

---

## Desktop Agent Notes

You asked about Hermes Agent desktop app and which agent to use (Gemma4 vs OpenCode vs Pi Coding Agent).

**Status**: Unable to confirm definitively, but:
- **OpenCode**: Confirmed desktop app available (SvelteKit app, native wrapper)
- **Hermes**: Unknown (research needed)
- **Pi Coding Agent**: Unknown (research needed)
- **Gemma4**: LLM server only (:8090), no UI agent

**Recommendation for now**: Use **OpenCode** (confirmed working, can call Gemma4 via HTTP, has desktop app). If you want to verify Hermes/Pi Coding Agent desktop options, that's a separate research task.

---

## Done ✅

You now have:
1. ✅ Stage 0–2 scripts (ready to run)
2. ✅ Stage 3–7 architecture (ready to build)
3. ✅ Master index (reference doc)
4. ✅ Quick start guide (execution playbook)
5. ✅ npm scripts (easy commands)
6. ✅ Dependency graph (clear blocking order)

**Next**: `npm run graphify:stage0:verify` 🚀
