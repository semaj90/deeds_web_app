# Stage 0–7 Execution: Quick Start Guide

**Date**: July 11, 2026  
**Status**: Ready to execute  
**Timeline**: 5–7 hours wall-clock (can parallelize phases)

---

## What Was Just Created

### Stage Scripts (Ready to Run)
✅ **Stage 0**: `scripts/graphify/stages/stage0-identity-verify.mjs` (Node.js)
- Verifies packet_key, source_ref, content_hash are 100% non-null
- Checks for duplicates
- Exit codes: 0 (pass), 1 (fail), 2 (DB error), 3 (config error)

✅ **Stage 1**: `scripts/graphify/stages/stage1-structural-extract.py` (Python)
- Extracts AST symbols via TypeScript Compiler API + ast-grep
- Output: tree_node_ids (JSONB)
- Target: 80% coverage (~5,600 packets)

✅ **Stage 2**: `scripts/graphify/stages/stage2-lexical-extract.py` (Python)
- Extracts BM25 lexical terms (identifiers, paths, error codes, API names)
- Output: lexical_features (JSONB)
- Target: 85% coverage (~6,000 packets)

✅ **TypeScript Extractor**: `scripts/graphify/lib/ts-ast-extractor.mjs` (helper for Stage 1)

### Configuration & Index
✅ **Master Index**: `scripts/graphify/INDEX.md`
- Full dependency graph (Stage 0 → 1 → 2 → ... → 7)
- Execution order and success criteria
- RabbitMQ worker pool pattern
- Troubleshooting guide

### npm Scripts
Added 6 new scripts to `sveltekit-frontend/package.json`:
```bash
npm run graphify:stage0:verify           # Run Stage 0 verification
npm run graphify:stage1:dry              # Test Stage 1 (no writes)
npm run graphify:stage1:apply            # Apply Stage 1
npm run graphify:stage2:dry              # Test Stage 2 (no writes)
npm run graphify:stage2:apply            # Apply Stage 2
npm run graphify:index                   # View full index
```

---

## Execution Order (Recommended)

### Phase 1: Verification (5 min)
**Purpose**: Confirm identity layer is locked before any downstream work

```bash
# From sveltekit-frontend/
npm run graphify:stage0:verify

# Expected: All gates pass ✅
#   ✅ Gate 1: All packets have (packet_key, source_ref, content_hash)
#   ✅ Gate 2: No duplicate packet_keys
#   ✅ Gate 3: No duplicate (source_ref, hash) pairs
```

**Exit code 0 = Proceed to Stage 1. Exit code 1 = Stop, fix identity layer first.**

---

### Phase 2: Structural Extraction (20–40 min)
**Purpose**: Extract AST symbols (functions, classes, interfaces, imports, exports)

```bash
# Test first (no database writes)
npm run graphify:stage1:dry

# If satisfied, apply
npm run graphify:stage1:apply
```

**What happens**:
1. Queries `atlas_packets` for files with `source_ref` populated but no AST extracted
2. For each file: TypeScript Compiler API → ast-grep (fallback)
3. Writes `payload['tree_node_ids']` (JSONB array of symbols) to Postgres
4. Expected coverage: ~80% (5,600/7,000 eligible packets)

**Monitor**:
```bash
# After Stage 1 completes:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN payload->'tree_node_ids' IS NOT NULL THEN 1 END) as with_ast,
    ROUND(COUNT(CASE WHEN payload->'tree_node_ids' IS NOT NULL THEN 1 END)::numeric / COUNT(*) * 100, 1) as pct
  FROM atlas_packets
"
```

---

### Phase 3: Lexical Extraction (15–30 min)
**Purpose**: Extract BM25 lexical features (deterministic tokenization)

```bash
# Test first (no database writes)
npm run graphify:stage2:dry

# If satisfied, apply
npm run graphify:stage2:apply
```

**What happens**:
1. Queries `atlas_packets` for files not yet analyzed lexically
2. For each file: Tokenize (camelCase, paths, constants, comments) → BM25 scoring
3. Writes `metadata['lexical_features']` (JSONB array of terms with scores) to Postgres
4. Expected coverage: ~85% (6,000/7,000 eligible packets)

**Monitor**:
```bash
# After Stage 2 completes:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN metadata->'lexical_features' IS NOT NULL THEN 1 END) as with_lexical,
    ROUND(COUNT(CASE WHEN metadata->'lexical_features' IS NOT NULL THEN 1 END)::numeric / COUNT(*) * 100, 1) as pct
  FROM atlas_packets
"
```

---

### Phase 4: Semantic Layer (2–3 hours)
**Purpose**: Grounded semantic summaries via Gemma4 (TO BE CREATED)

After Stage 2 completes, will create:
- `stage3-semantic-backfill.py` (grounded to AST facts from Stage 1)
- Prompt strategy: "Given these verified AST symbols, describe primary capability, failure modes, business meaning"
- Do NOT invent functions; stay grounded in Stage 1 output
- Target: 85% coverage (currently 7.2% / 4,180 packets → 50K packets)

---

### Phase 5: Feature Envelope (10 min)
**Purpose**: Assemble canonical feature envelope JSONB (TO BE CREATED)

After Stage 4, will create:
- `stage4-feature-envelope.py`
- Combines: identity + AST + lexical + semantic + domain + topology + metrics + provenance
- Only runs after upstream layers are stable

---

### Phase 6: Named Embeddings (45 min)
**Purpose**: Generate 4 embedding lanes (TO BE CREATED)

After Phase 5, will create:
- `stage5-embeddings.py`
- Lanes: content_768, summary_768, signature_768, topology_128
- Via Ollama `:11434` (embeddinggemma, 384-dim projected to various spaces)

---

### Phase 7: Topology (1–2 hours)
**Purpose**: GPU acceleration: SOM, KMeans, PageRank, communities (TO BE CREATED)

After Phase 6, will create:
- `stage6-topology.py` (PyTorch + NetworkX)
- **KMeans**: PyTorch GPU, cluster into K=25 groups (~500× faster than NumPy)
- **SOM**: PyTorch GPU, 20×20 self-organizing map
- **PageRank**: NetworkX CPU (graph is small enough)
- **Communities**: NetworkX Louvain detection
- **Centroids**: Domain-level aggregation

---

### Phase 8: Classifier (30 min)
**Purpose**: Train XGBoost on full feature matrix (TO BE CREATED)

After Phase 7, will create:
- `stage7-classifier.py`
- Feature matrix: AST + lexical + semantic + topology + concepts + PageRank + SOM + community
- Train XGBoost with GPU tree-building (`tree_method='gpu_hist'`)
- Target domain classification

---

## Current State vs. Target

| Layer | Component | Current | Target | Gap | Blocker? |
|-------|-----------|---------|--------|-----|----------|
| **0** | Identity | 100% | 100% | ✅ Done | YES |
| **1** | Structural (AST) | 0% | 80% | To build | YES |
| **2** | Lexical (BM25) | 0% | 85% | To build | YES |
| **3** | Semantic (Gemma4) | 7.2% | 85% | To build | NO |
| **4** | Feature Envelope | 0% | 100% | To build | NO |
| **5** | Named Embeddings | 0% | 100% | To build | NO |
| **6** | Topology (SOM, KMeans, PR) | In progress | 100% | Monitor | NO |
| **7** | Classifier (XGBoost) | N/A | Trained | To build | NO |

---

## Why This Order Matters

**Dependency Graph**:
```
Stage 0: Identity ✅
    ↓ (everything downstream depends on this)
Stage 1: AST (deterministic, CPU) ← blocks Stages 3, 4
    ↓
Stage 2: Lexical (deterministic, CPU) ← blocks Stages 4, 7
    ↓
Stage 3: Semantic (grounded to 1+2)
    ↓
Stage 4: Feature Envelope (consolidation)
    ↓
Stage 5: Embeddings (after envelope stable)
    ↓
Stage 6: Topology (GPU, after embeddings)
    ↓
Stage 7: Classifier (trains on all above)
```

**Why no embedding before envelope?**
- Embeddings are expensive (50+ matrix multiplications per packet)
- If upstream features change, re-embed everything (~1 hour wasted)
- Feature envelope = checkpoint. Embed only after it's locked.

**Why no classifier before topology?**
- Classifier features include PageRank + SOM + cluster membership
- These come from topology (Stage 6)
- Train classifier last; it's the synthesis layer

---

## Parallel Execution (Optional)

**Phase 1 (Verification)**: 5 min — must complete first

**Phases 2–3 (Deterministic extraction)**: 35–70 min
- Can run Stage 1 and Stage 2 in parallel (independent file reads)
- However: Stage 3 (semantic) depends on Stage 1 output
- Recommendation: Serial (1 → 2) is safer; parallel saves ~20 min if both finish before Stage 3 starts

**Phases 4–5 (Semantic + Envelope)**: 2–3 hours
- Must be serial (4 then 5)
- But can start Stage 4 while Stages 1–2 still running

**Phases 6–7 (GPU + Classifier)**: 1.5–2.5 hours
- Must be serial (6 then 7)
- Can start Stage 6 while Stages 4–5 running (GPU independent)

**Optimal Timeline** (parallel where safe):
- T=0–5 min: Stage 0 (blocking gate)
- T=5–35 min: Stages 1+2 in parallel
- T=35–200 min: Stage 3 (Gemma4, longest)
- T=200–210 min: Stage 4 (quick)
- T=210–255 min: Stage 5 (embeddings)
- T=255–375 min: Stage 6 (topology)
- T=375–405 min: Stage 7 (classifier)
- **Total: ~7 hours** (vs 5–7 hour sequential estimate, overlaps compress some phases)

---

## Success Criteria

✅ **Stage 0**: All 3 gates pass (identity 100%)
✅ **Stage 1**: 80% of eligible packets have tree_node_ids
✅ **Stage 2**: 85% of eligible packets have lexical_features
✅ **Stage 3**: 85% of packets have summary_text (grounded to AST)
✅ **Stage 4**: 100% of packets have feature_envelope JSONB
✅ **Stage 5**: 100% of packets have named embeddings (4 lanes)
✅ **Stage 6**: 100% of packets have SOM/KMeans/PageRank/community
✅ **Stage 7**: XGBoost model trained, saved to disk

---

## Troubleshooting

**ast-grep not found** → `cargo install ast-grep`

**TypeScript Compiler API not available** → `npm install --save-dev typescript`

**Python psycopg3 not installed** → `pip install psycopg asyncio rank_bm25`

**Database connection fails** → Check `.env.local` (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD)

**No eligible packets found** → Check if upstream stage marked all as complete (query `payload['tree_node_ids'] IS NULL`)

**GPU not available for Stage 6** → Fall back to CPU (NetworkX + NumPy works, just slower)

---

## Next After Stage 0–7

Once all 7 stages complete, implement:
1. **Recommendation Engine**
   - "Did you mean?" (typo + semantic recovery)
   - Related functions (topology + similarity)
   - Missing imports (AST analysis)
   - Similar fixes (stored patterns + KAG)
   - Neighboring APIs (authority score)

2. **Multi-Vector RRF Fusion** (Go Retrieval)
   - Blend: content_768 (0.40) + summary_768 (0.30) + signature_768 (0.15) + topology_128 (0.10) + lexical_bm25 (0.05)
   - Powered by Stage 5 + Stage 7 output

3. **Agent Routing**
   - Stage 7 classifier confidence → tool selection
   - XGBoost predicts best MCP tool for query

---

## Files Created This Session

```
scripts/graphify/
  INDEX.md                              (1,200 lines)
  stages/
    stage0-identity-verify.mjs           (300 lines) ✅ READY
    stage1-structural-extract.py         (380 lines) ✅ READY
    stage2-lexical-extract.py            (420 lines) ✅ READY
  lib/
    ts-ast-extractor.mjs                 (180 lines) ✅ READY

sveltekit-frontend/package.json
  +6 npm scripts (graphify:*)

Top-level (this file):
  STAGE-0-7-QUICK-START.md
```

---

## Start Now

```bash
cd sveltekit-frontend

# 1. View the full index
npm run graphify:index

# 2. Verify identity (blocking gate)
npm run graphify:stage0:verify

# 3. If Stage 0 passes, extract AST
npm run graphify:stage1:dry     # Test first
npm run graphify:stage1:apply   # Then apply

# 4. Extract lexical
npm run graphify:stage2:dry     # Test first
npm run graphify:stage2:apply   # Then apply

# 5. Monitor progress
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN payload->'tree_node_ids' IS NOT NULL THEN 1 END) as ast_count,
    COUNT(CASE WHEN metadata->'lexical_features' IS NOT NULL THEN 1 END) as lexical_count
  FROM atlas_packets
"
```

**Ready?** Start with `npm run graphify:stage0:verify` 🚀
