# Project Status: Corrected Understanding (July 12, 2026)

**Prior assessment**: "Measurement boundary is solved"  
**Corrected**: "Measurement framework is implemented. Gate 1 data-quality refinement in progress."

---

## Architecture vs Measurement Maturity

### 6 Days Ago (70% arch / 30% measurement)
- ✅ Qdrant indexed (40.5K chunks, 768-dim)
- ✅ TurboVec prefilter ready
- ✅ Neo4j topology built
- ✅ Redis cache operational
- ❌ **Evaluation data unusable** (all grade 1, zero variance)
- ❌ **No baseline metrics** (can't measure anything)

### Today (85% arch / 70% measurement)
- ✅ All infrastructure from above
- ✅ **Evaluation framework** implemented (schema + audits)
- ✅ **Weak labels generated** (17.5K with grades 0-3)
- ✅ **Feature correlation validated** (0.909)
- ✅ **Query variance confirmed** (100% have span ≥2)
- ⏳ **Per-query label diversity** audit pending
- ⏳ **Dataset versioning** schema ready
- ⏳ **Baseline metrics** (NDCG@5, Recall@20, MRR) not yet collected

---

## Phase Reordering (Blocks Removed)

### ❌ Old Ordering (Infrastructure-First)
```
Phase 5: Domain Classification  ← Required for Phase 7?
    ↓
Phase 6: Canonical Qdrant       ← Required for Phase 7?
    ↓
Phase 7: XGBoost Training       ← BLOCKED until above complete
```

### ✅ New Ordering (Measurement-First)
```
Gate 1 Final Audit (per-query)
    ↓
Freeze evaluation_dataset_v1
    ↓
Create train/validation/test splits
    ↓
Train Baseline XGBoost          ← Unblocked! (uses existing features)
    ↓
Domain Classification           ← Now a feature, not a blocker
Canonical Qdrant                ← Retrieval improvement, not a blocker
CrossEncoder                    ← Top-20 refinement
    ↓
Full Pipeline Evaluation
```

**Why reordering works**: Domain classification and Qdrant are features/optimizations. XGBoost can already learn from:
- Dense similarity (0-1)
- Lexical score (BM25)
- AST structure (0-1)
- Graph authority (0-1)
- Telemetry signals

Adding domain_class and domain_confidence later is a feature addition, not architectural requirement.

---

## What Gate 1 Actually Requires

### ✅ Currently Done
- Overall grade distribution audit: PASS (3 of 4 gates)
- Feature-grade correlation: 0.909 (PASS)
- Query variance: 100% with span ≥2 (PASS)
- Sample diversity: 87% unique packets (PASS)

### ⏳ Remaining (Gate 1 Closure)
- **Per-query audit**: Does each query have grades 0, 1, 2, 3? (NEW script)
- **Dataset versioning**: Freeze as dataset_v1 (not mutable)
- **Train/validation/test splits**: By query_id (stratified)
- **Baseline metrics**: NDCG@5, Recall@20, MRR on held-out queries
- **Reproducible runs**: evaluation_runs table with git_commit, versions

### ❌ Not Required for XGBoost Start
- Domain classification
- Qdrant multi-vector
- Neo4j enrichment
- CrossEncoder implementation

---

## Immediate Action Items (Priority Order)

### 1. Per-Query Audit (Gate 1 Validation)
```bash
npx tsx scripts/atlas/gate-1-per-query-audit.mts
```
**Output**: 
- Per-query grade breakdown (G0/G1/G2/G3 counts)
- Positives + negatives check per query
- Flagged queries with insufficient signal

**Pass criteria**:
- ≥80% of queries with span ≥2
- ≥70% of queries with positives AND negatives

---

### 2. Evaluation Runs Infrastructure (Reproducibility)
```bash
npx tsx scripts/atlas/create-evaluation-runs-schema.mts
```
**Creates**:
- evaluation_datasets (versioned snapshots)
- evaluation_runs (experiment metadata)
- evaluation_results (metrics: NDCG@5, Recall@20, MRR)
- evaluation_splits (train/val/test by query_id)

**Output**: dataset_v1 registered

---

### 3. Create Train/Validation/Test Splits
```bash
# Stratified split by query_id (80/10/10)
npx tsx scripts/atlas/create-evaluation-splits.mts
```
**Output**:
- 110 queries → train (80%)
- 14 queries → validation (10%)
- 13 queries → test (10%)

---

### 4. Train Baseline XGBoost
**After splits created**:
```bash
npm run atlas:xgboost:train:baseline
```

**Input**: evaluation_judgments + feature_envelope (from training set queries)

**Output**:
- evaluation_runs entry (id: baseline_v1)
- evaluation_results: NDCG@5, Recall@20, MRR on test queries
- Baseline model artifact

**Metrics expected**:
- NDCG@5: 0.5–0.6 (baseline from weak labels)
- Recall@20: 0.7–0.8
- MRR: 0.4–0.5

---

### 5. After Baseline: Phase Parallelization
```
Baseline metrics collected
    ├─ Domain Classification (feature development)
    ├─ Canonical Qdrant (retrieval optimization)
    └─ CrossEncoder prep (top-20 refinement)
    
    → Combined improvement experiment → Compare vs baseline
```

---

## Versioning Strategy

### Data
```
dataset_v1  ← 17.5K judgments, weak labels, grades 0-3
dataset_v2  ← Same + 200 Gemma4 refined labels
dataset_v3  ← Same + 1000 manual gold labels (if needed)
```

**Never mutate training data.** Version everything.

### Models
```
baseline_v1       ← XGBoost on dataset_v1
domain_v1         ← Domain classifier
qdrant_multi_v1   ← Multi-vector Qdrant
xgboost_v2        ← XGBoost with domain features
xgboost_v3        ← XGBoost with domain + multi-vector
crossencoder_v1   ← CrossEncoder top-20
```

Each experiment creates a new evaluation_run entry with:
- git_commit (exact code version)
- model_version (artifact reference)
- dataset_version (exact data snapshot)
- feature_version (extracted features)
- embedding_version (embedding model)

---

## Realistic Timeline (Unblocked)

| Phase | Duration | Blocker | Notes |
|-------|----------|---------|-------|
| Gate 1 per-query audit | 30 min | None | Run + review flagged queries |
| Evaluation runs schema | 15 min | None | DDL only |
| Train/test splits | 15 min | None | Stratified by query |
| Baseline XGBoost | 2-4 hours | None | Training + metric calculation |
| Domain classification | 1-2 hours | None | Can run in parallel |
| Canonical Qdrant | 1-2 hours | None | Can run in parallel |
| CrossEncoder prep | 1-2 hours | None | Can run in parallel |
| **Total (parallel)** | **2-4 hours** | None | Baseline + 3 features in parallel |

---

## The Correct Statement

### ❌ "The measurement boundary is now a solved problem"
(Implies: measurement is done, XGBoost can start immediately)

### ✅ "The measurement framework is implemented, and Gate 1 has moved from a structural blocker to a data-quality refinement phase"
(Implies: infrastructure exists, data quality audit in progress, XGBoost can start after per-query audit + baseline metrics)

---

## What Changed in This Session

### Error Corrected
- **Conflated**: "infrastructure to measure" with "measurement validated"
- **Reality**: Infrastructure exists, but Gate 1 is only closed after:
  1. Per-query label diversity confirmed
  2. Train/validation/test splits created
  3. Baseline metrics collected (NDCG@5, Recall@20, MRR)
  4. Reproducible run tracked

### Understanding Sharpened
- **Per-query audit** is the right metric (not overall percentages)
- **Dataset versioning** prevents data leakage and enables reproducibility
- **Baseline metrics** are the proof (not correlation coefficients)
- **Domain/Qdrant** are features, not blockers

---

## Next Session Entry Point

1. Run per-query audit (gate-1-per-query-audit.mts)
2. If PASS: Proceed immediately to baseline XGBoost
3. If PARTIAL: Phase 4 Gemma4 refinement, re-audit
4. Create evaluation runs schema and splits
5. Train baseline, log results to evaluation_runs
6. Begin parallel feature development (domain, Qdrant, CrossEncoder)

**Expected outcome**: Baseline NDCG@5 ~0.55, reproducible in evaluation_runs ledger.
