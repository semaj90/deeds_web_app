# OpenSpec: Structural Identity + Semantic Indexing (Batches A–G)

**Status**: ✅ COMPLETE, AUTHORIZED FOR EXECUTION  
**Date**: 2026-07-27  
**Critical Constraint**: "Do not start with PyTorch, K-means, DiskANN, or TurboVec. They all need stable rows and labels to operate on."

---

## What This Is

A **comprehensive, gates-validated roadmap** for transitioning from incomplete structural identity to production-ready semantic indexing. It replaces premature GPU work with deterministic, reproducible infrastructure.

**Timeline**: 29–39 hours of work across 7 sequential batches (A–G), unblocking GPU acceleration only after Batch E search experiments PASS.

---

## Documents

### 1. Master Roadmap
**File**: `STRUCTURAL-IDENTITY-BATCH-ROADMAP.md` (2,100+ lines)

Complete OpenSpec for all 7 Batches with:
- Objective, inputs, outputs for each batch
- 5 hard gates per batch (all must PASS)
- Estimated effort breakdown
- Parent Atlas contracts (Zod schemas)
- Determinism rules
- Confidence tracking
- Dependencies & risk mitigation

**Read this first** to understand the full architecture.

### 2. Batch A Implementation
**File**: `BATCH-A-STRUCTURAL-MATERIALIZER.md` (500+ lines)

Implementation guide for Batch A (tree node materialization):
- Complete TypeScript implementation (copy-paste ready)
- npm script entries for package.json
- Pre-flight checklist
- Gate validation details
- Troubleshooting guide

**Start here** when ready to execute Batch A.

### 3. Execution Startup
**File**: `BATCH-EXECUTION-STARTUP.md` (350+ lines)

Quick-start guide with:
- 5-minute quick start commands
- Pre-flight environment setup
- Execution flow for all 7 batches
- Real-time monitoring
- Common issues & rollback procedures
- Success checklist

**Use this** to monitor progress and debug issues.

### 4. This File
**File**: `README.md` (this document)

Index and navigation guide.

---

## Quick Start (5 Minutes)

```bash
cd sveltekit-frontend

# Pre-flight: dry-run Batch A (no DB writes)
npm run batch:a:dry

# If successful (exit 0):
npm run batch:a              # Execute Batch A

# Monitor gates (all must PASS)
watch -n 2 'tail reports/batch-a/batch-a-structural-audit.json | jq ".gates"'

# Validate determinism
npm run batch:a:validate

# If all gates PASS:
npm run batch:b              # Proceed to Batch B
```

---

## Batches at a Glance

| Batch | Purpose | Effort | Gate Blocker | Prerequisites |
|-------|---------|--------|--------------|---------------|
| **A** | Tree node materialization | 4–6h | A1–A5 | Postgres, git HEAD |
| **B** | Feature identity derivation | 3–4h | B1–B5 | Batch A PASS |
| **C** | Ontology observations (human review) | 5–7h | C1–C5 | Batch B PASS |
| **D** | Semantic embeddings (768-dim) | 3–4h | D1–D5 | Batch C PASS, Ollama |
| **E** | Search baselines (validation) | 4–5h | **E1–E5 (GPU BLOCKER)** | Batch D PASS, Qdrant |
| **F** | Domain classifier (NB + XGB) | 6–8h | F1–F5 | Batch D+C PASS |
| **G** | Ranking model (LTR) | 4–5h | G1–G5 | Batch E+A PASS |

**Total**: 29–39 hours (critical path A→B→C→D→E = 19–27h)

---

## Execution Order

### Phase 1: Structural Foundation (Week 1, 12–17 hours)

1. **Batch A**: tree_node_version_id + tree_node_id materialization
   - Parse 27K files with tree-sitter
   - Generate stable identifiers
   - Record parent/child edges
   - Validate determinism
   - **Gates**: A1–A5 (all must PASS)

2. **Batch B**: Feature identity from tree nodes
   - Derive feature_id from tree node clusters
   - Map tree nodes → features
   - Handle unresolved features
   - **Gates**: B1–B5 (all must PASS)

3. **Batch C**: Ontology observations + human review
   - Emit observations via ast-grep rules
   - Human review → promotion → locked labels
   - Build 1,000-feature control set
   - **Gates**: C1–C5 (all must PASS)
   - **Note**: Human step (interactive UI review)

### Phase 2: Semantic Grounding (Week 2, 7–9 hours)

4. **Batch D**: Semantic embeddings
   - Generate deterministic semantic text per feature
   - Embed via Ollama embeddinggemma (768-dim)
   - Validate finiteness + confidence
   - **Gates**: D1–D5 (all must PASS)

5. **Batch E**: Search baselines (CRITICAL GATE)
   - Benchmark exact search, pgvector HNSW, Qdrant
   - Measure recall@10 and latency
   - Validate reproducibility
   - **Gates**: E1–E5 (all must PASS)
   - **⚠️ CRITICAL**: If E FAILS, GPU work remains BLOCKED

### Phase 3: Ranking Pipelines (Week 3, 10–13 hours)

6. **Batch F**: Domain classifier
   - Naive Bayes baseline (accuracy ≥0.55)
   - XGBoost classifier (accuracy ≥0.75)
   - Per-domain metrics, feature importance
   - **Gates**: F1–F5 (all must PASS)

7. **Batch G**: Ranking model
   - XGBRanker learning-to-rank
   - Rerank top-20 candidates
   - Measure NDCG@5, recall@10
   - **Gates**: G1–G5 (all must PASS)

### Phase 4: GPU Acceleration (Week 4, after Batch G)

Once Batch G gates PASS:
- **SOM training** (requires stable identity + domain labels)
- **K-means clustering** (requires stable embeddings + confidence)
- **TurboVec prefilter** (optional, requires E validation)

---

## Critical Gates

### Batch A: Structural Authority
- **A1**: Coverage ≥95% of nodes assigned tree_node_version_id
- **A2**: Zero duplicate tree_node_version_id
- **A3**: Determinism (re-run produces identical hashes)
- **A4**: Zero cycles in parent_tree_node_id
- **A5**: All edge references exist

### Batch E: Search Validation (CRITICAL)
- **E1**: All 3 engines (exact, pgvector, Qdrant) complete 23 queries
- **E2**: Qdrant recall@10 ≥0.80 **(UNBLOCKS GPU)**
- **E3**: Qdrant latency p95 <150ms
- **E4**: 2nd run ±5% latency variance
- **E5**: Embeddings + results reproducible

**⚠️ If E fails, GPU work (SOM, K-means) remains BLOCKED.**

---

## Parent Atlas Contracts

### Determinism
- Same input + same code + same model version → identical output
- SHA256 hashing for reproducibility
- Fixed random seeds (random_state=42 in Python)
- Database writes are idempotent (ON CONFLICT DO UPDATE)

### Confidence Tracking
Every artifact carries confidence (0.0–1.0):
- **Structural confidence**: parser quality (0.95+)
- **Feature identity confidence**: extraction rules (0.70–0.90)
- **Label confidence**: observation quality (0.50–0.80)
- **Embedding confidence**: input quality (0.85–0.95)
- **Classifier confidence**: training data quality (varies by domain)

### Identity Chain
```
directory_path → source_ref → file_path → function_symbol 
→ feature_id → feature_label → packet_key
```

---

## Key Files Created

| File | Purpose | Status |
|------|---------|--------|
| `STRUCTURAL-IDENTITY-BATCH-ROADMAP.md` | Master OpenSpec (2,100 lines) | ✅ COMPLETE |
| `BATCH-A-STRUCTURAL-MATERIALIZER.md` | Batch A implementation (500 lines) | ✅ READY |
| `BATCH-EXECUTION-STARTUP.md` | Execution startup guide (350 lines) | ✅ READY |
| `README.md` | This file | ✅ COMPLETE |
| `package.json` | npm scripts added | ✅ UPDATED |

---

## How to Use These Documents

### For Understanding the Architecture
1. Read **STRUCTURAL-IDENTITY-BATCH-ROADMAP.md** (master reference)
2. Review "Batches at a Glance" table above
3. Understand gates and dependencies

### For Execution
1. Follow **BATCH-EXECUTION-STARTUP.md** quick-start section
2. Run `npm run batch:a:dry` to verify setup
3. Execute `npm run batch:a` when ready
4. Monitor gates with `watch -n 2 'tail reports/batch-a/batch-a-structural-audit.json | jq ".gates"'`

### For Troubleshooting
1. Check "Common Issues" in **BATCH-EXECUTION-STARTUP.md**
2. Review gate definitions in **STRUCTURAL-IDENTITY-BATCH-ROADMAP.md**
3. Check batch-specific implementation guide (e.g., **BATCH-A-STRUCTURAL-MATERIALIZER.md**)

### For Deep Dives
- **Batch A details**: `BATCH-A-STRUCTURAL-MATERIALIZER.md`
- **All batch details**: `STRUCTURAL-IDENTITY-BATCH-ROADMAP.md` sections B–G
- **npm scripts**: `sveltekit-frontend/package.json` (search for `batch:`)

---

## Environment Prerequisites

### Required Services
- ✅ **Postgres** (legal-ai-postgres, port 5434)
- ✅ **Ollama** (embeddinggemma:latest, port 11434) — required for Batch D
- ✅ **Qdrant** (codebase_chunks_768 collection, port 6333) — required for Batch E

### Required Packages
```bash
npm install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-go pg zod uuid
```

### Environment Variables (.env.local)
```bash
DB_HOST=127.0.0.1
DB_PORT=5434
DB_NAME=legal_ai_db
DB_USER=legal_admin
DB_PASS=<your_password>
```

---

## Success Criteria (Overall)

✅ **Batch A–E complete and PASS all gates** = Structural identity stable + search baseline validated  
✅ **Batch F–G complete and PASS all gates** = Classifiers + ranking pipeline ready  
✅ **GPU work unblocked** = SOM, K-means, TurboVec can now proceed safely  

---

## After Batch G: Next Steps

Once all Batches A–G gates PASS:

```bash
# GPU acceleration is now safe:
npm run som:train               # SOM topology

npm run kmeans:cluster          # K-means clustering

npm run turbovec:prefilter:build # TurboVec optional prefilter
```

No more identity rebuilds. Stable foundation locked in.

---

## Timeline Summary

| Phase | Duration | Output | Gate Status |
|-------|----------|--------|-------------|
| Week 1: A–C | 12–17h | control-set-1k (locked labels) | A1–A5, B1–B5, C1–C5 PASS |
| Week 2: D–E | 7–9h | search baselines + embeddings | D1–D5, E1–E5 PASS |
| Week 3: F–G | 10–13h | classifiers + ranking models | F1–F5, G1–G5 PASS |
| **Total** | **29–39h** | **Production-ready pipeline** | **ALL gates PASS** |

---

## Status

- ✅ OpenSpec COMPLETE
- ✅ Batch A implementation READY
- ✅ All 7 batches designed with gates
- ✅ npm scripts added to package.json
- ✅ **AUTHORIZED FOR EXECUTION**

---

## Start Here

```bash
cd sveltekit-frontend
npm run batch:a:dry
```

**If dry-run succeeds, proceed**:
```bash
npm run batch:a
```

---

**Canonical Authority**: Parent Atlas P0–P7 Roadmap  
**Constraint**: No GPU work until Batch E PASS  
**Created**: 2026-07-27  
**Next**: Execute Batch A
