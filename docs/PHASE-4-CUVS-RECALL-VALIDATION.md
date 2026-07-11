# Phase 4: cuVS Recall Baseline Validation

**Status**: ✅ READY FOR EXECUTION
**Created**: 2026-07-10
**Purpose**: Establish ground truth for IVF-Flat GPU vector search accuracy vs Qdrant brute-force

## Overview

Phase 4 validates that NVIDIA cuVS IVF-Flat GPU vector search meets accuracy targets for the 40.5K codebase embeddings (768-dim normalized).

**Key metrics**:
- Recall@10 ≥ 0.95 (95% of top-10 brute-force results found by IVF)
- Recall@50 ≥ 0.97
- Recall@100 ≥ 0.98
- Latency < 10ms per query (batch 100 queries)

**Architecture**:
```
Postgres codebase_chunk_index (40.5K embeddings, 768-dim)
  → Transfer to GPU (cuPy)
  → Build IVF-Flat index (n_lists=100)
  → Search with varying n_probes (5, 10, 20, 30)
  → Compare against brute-force ground truth
  → Report recall@K and latency
```

## Prerequisites

### 1. WSL2 RAPIDS Environment
The validation script requires cuVS 26.06.00 running in WSL2.

**Status**: `npm run atlas:gpu:readiness` should report ✅ all systems operational.

**If not set up yet**:
```bash
npm run atlas:gpu:wsl2-rapids:bootstrap:apply
# Wait ~20 minutes for conda environment to build
```

### 2. Postgres Connectivity
The script reads embeddings directly from `codebase_chunk_index`.

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL"
# Expected: ~40,554
```

### 3. Python Dependencies
The validation script requires:
- `cuvs` 26.06.00 (GPU vector search)
- `cupy` (CUDA-accelerated NumPy)
- `pandas` (results formatting)
- `psycopg[binary]` (Postgres client)

**All installed by** `npm run atlas:gpu:wsl2-rapids:bootstrap:apply`

## Running Phase 4

### Quick Start
```bash
cd sveltekit-frontend
npm run phase4:cuVS:recall:baseline
```

### With Verbose Output
```bash
npm run phase4:cuVS:recall:baseline:verbose
```

### Direct Python (Advanced)
```bash
python ../scripts/gpu/phase4-cuVS-recall-validation.py
```

### From PowerShell (Advanced)
```powershell
.\scripts/gpu/run-phase4-validation.ps1
.\scripts/gpu/run-phase4-validation.ps1 -NumQueries 50 -NLists 100
```

## What Happens

1. **Environment verification** (10s)
   - Check cuVS, CuPy, psycopg installed
   - Verify conda environment active

2. **Database check** (5s)
   - Connect to Postgres
   - Count available embeddings (target: 40K+)

3. **Load embeddings** (30s)
   - Fetch 40.5K embeddings from `codebase_chunk_index`
   - Normalize to unit vectors (L2 norm)
   - Transfer to GPU (cuPy array)

4. **Select queries** (1s)
   - Randomly sample 100 test embeddings
   - Reserve for validation

5. **Compute ground truth** (60s)
   - Brute-force cosine similarity (100 queries × 40K candidates)
   - Get exact top-100 neighbors per query
   - Store as reference

6. **Build IVF-Flat index** (30s)
   - Create `n_lists=100` clusters
   - Store on GPU

7. **Test with different n_probes** (10-20s per n_probes value)
   - n_probes ∈ [5, 10, 20, 30]
   - For each:
     - Run 5 warmup + timing iterations
     - Compute Recall@10, Recall@50, Recall@100
     - Measure latency (mean, p50, p95, p99)

8. **Report results** (1s)
   - Print table of results
   - Save JSON to `phase4-cuVS-recall-results.json`
   - Print recommendations

**Total time**: ~3-5 minutes

## Expected Output

### Results Table
```
n_probes  recall@10  recall@50  recall@100  latency_ms_mean  latency_ms_p50  latency_ms_p95  latency_ms_p99
       5      0.9234      0.9512       0.9698             8.23            7.89           10.45           12.34
      10      0.9567      0.9745       0.9852             9.12            8.76           11.23           13.45
      20      0.9812      0.9923       0.9945            10.56           10.12           12.89           14.67
      30      0.9891      0.9964       0.9978            11.89           11.34           14.12           15.89
```

### Recommendations
```
✅ n_probes=10: Recall@10=0.9567, @50=0.9745, @100=0.9852, Latency=9.12ms
✅ n_probes=20: Recall@10=0.9812, @50=0.9923, @100=0.9945, Latency=10.56ms
```

## Interpreting Results

### Success Criteria
- **All** Recall@10 ≥ 0.95 ✅
- **All** Recall@50 ≥ 0.97 ✅
- **All** Recall@100 ≥ 0.98 ✅
- **Any** Latency < 10ms ✅

### If Recall is Too Low
**Possible causes**:
1. **Embedding quality** — verify Postgres embeddings are normalized and 768-dim
2. **n_lists too large** — try n_lists=50 (requires script modification)
3. **Distance metric** — script uses cosine; verify Qdrant also uses cosine

**Recovery**:
```bash
# Edit the script to adjust n_lists
sed -i 's/n_lists = 100/n_lists = 50/' ../scripts/gpu/phase4-cuVS-recall-validation.py
npm run phase4:cuVS:recall:baseline
```

### If Latency is Too High
**Possible causes**:
1. **n_probes too large** — only low n_probes values matter (5-10)
2. **GPU thermal throttling** — check GPU temp with `nvidia-smi`
3. **System load** — close other GPU apps

**Recovery**:
```bash
# Check GPU
nvidia-smi

# Close other GPU apps, then re-run
npm run phase4:cuVS:recall:baseline
```

## Next Steps (Phase 5+)

### Phase 5: Domain Classification
Once Phase 4 recall targets are met:
- Train XGBoost on domain labels
- Use cuVS scoring + topology features as input
- Target: 92%+ F1 on domain classification

### Phase 6: AST Extraction
Parallel work:
- Extract AST symbols (ast-grep)
- Expand `ast_symbols` coverage from 0.88% → 100%
- Populate Neo4j `DEFINES_SYMBOL` edges

### Phase 7: LangExtract Integration
Semantic entity extraction from summaries:
- LangExtract tool chain
- Extract: classes, functions, APIs, data structures
- Populate Neo4j `EXTRACTS_ENTITY` edges

### Phase 8: Unified Reranking
Merge all scoring lanes:
- Vector + SOM + domain + recency + depth (current)
- Plus: AST match, community authority, topology
- Plus: LangExtract entity match
- Plus: Karpathy GPU authority blend
- Train XGBoost meta-ranker

### Phase 9: Neo4j Writeback
Topology mirror synchronization:
- Write cluster membership to Neo4j
- Write similarity edges (SOM adjacency)
- Write authority scores (PageRank)
- Verify cycle consistency

## Troubleshooting

### Script doesn't find embeddings
```bash
# Check Postgres connection
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL"

# Check if embeddings are normalized
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT AVG(pow(content_embedding <-> ARRAY[0,0,...,0]::vector, 2)) FROM codebase_chunk_index LIMIT 1"
# Should be close to 1.0 (unit vectors have L2 norm = 1)
```

### cuVS import error
```bash
# Verify conda environment
conda activate atlas-rapids-cu13
python -c "import cuvs; print(cuvs.__version__)"

# If missing, reinstall
conda install cuvs-cu13 cupy-cuda12x -c conda-forge
```

### Recall is exactly 0.0
```bash
# This indicates a crash in cuVS search
# Check NVIDIA GPU driver
nvidia-smi

# Check CUDA availability
python -c "import cupy as cp; print(cp.cuda.Device())"

# If failing, rebuild cuVS from source (advanced)
```

## Files

- `scripts/gpu/phase4-cuVS-recall-validation.py` — Core validation script (Python)
- `scripts/gpu/phase4-cuVS-recall-runner.mjs` — Node.js wrapper
- `scripts/gpu/run-phase4-validation.ps1` — PowerShell wrapper
- `phase4-cuVS-recall-results.json` — Output (generated)

## References

- **cuVS docs**: https://docs.rapids.ai/api/cuvs/stable/
- **IVF-Flat algorithm**: https://en.wikipedia.org/wiki/Locality-sensitive_hashing
- **Recall@K metric**: https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval)#Recall
- **Qdrant ANN**: https://qdrant.tech/documentation/concepts/indexing/

## Support

For issues:
1. Check troubleshooting section above
2. Run `npm run atlas:gpu:readiness` to verify environment
3. Check logs: `phase4-cuVS-recall-results.json`
4. Open an issue with error output
