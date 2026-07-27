# Batch Execution Startup — Structural Identity Roadmap (Batches A–G)

**Status**: READY TO EXECUTE  
**Date**: 2026-07-27  
**Canonical Reference**: `docs/openspec/STRUCTURAL-IDENTITY-BATCH-ROADMAP.md`

---

## Quick Start (5 minutes)

```bash
cd sveltekit-frontend

# Pre-flight checks
npm run batch:a:dry          # Dry-run Batch A (no DB writes)
echo $?                      # Should be 0

# If dry-run passes:
npm run batch:a              # Execute Batch A (writes to Postgres)

# Monitor progress
watch -n 2 'tail reports/batch-a/batch-a-structural-audit.json | jq ".gates"'

# Validate determinism (re-run, compare hashes)
npm run batch:a:validate

# Proceed to Batch B (only if A gates PASS)
npm run batch:b
```

---

## What You Just Authorized

You confirmed:
1. ✅ The OpenSpec is correct and complete
2. ✅ Batch A implementation is ready
3. ✅ Proceed with structural authority materialization

**This means**:
- Materializing tree_node_id, tree_node_version_id for 27K+ source files
- Recording AST parent/child relationships
- Writing to Postgres `atlas_tree_nodes` (27K+ rows) and `atlas_tree_edges` (40K+ rows)
- Validating determinism (re-run produces identical hashes)

**After Batch A completes** (and gates PASS):
- Batches B–G proceed sequentially (control-set review is human step in C)
- GPU work (SOM, K-means) remains blocked until Batch E search experiments PASS

---

## Batches at a Glance

| Batch | Purpose | Inputs | Outputs | Effort | Blocker |
|-------|---------|--------|---------|--------|---------|
| **A** | Tree node materialization | 27K files | atlas_tree_nodes, atlas_tree_edges | 4–6h | A gates |
| **B** | Feature identity derivation | atlas_tree_nodes | atlas_features, mappings | 3–4h | B gates |
| **C** | Ontology observations | atlas_features, ontology | control-set-1k (locked labels) | 5–7h | C gates |
| **D** | Semantic embeddings | control-set-1k, Ollama | atlas_semantic_embeddings (768-dim) | 3–4h | D gates |
| **E** | Search baselines | embeddings, Qdrant, pgvector | batch-e-search-baselines.json | 4–5h | **E gates (GPU BLOCKER)** |
| **F** | Domain classifier | embeddings + locked labels | Naive Bayes + XGBoost models | 6–8h | F gates |
| **G** | Ranking model | candidates + relevance judgments | XGBRanker LTR model | 4–5h | G gates |

**Total**: 29–39 hours (critical path A→B→C→D→E = 19–27h)

---

## Environment Setup (Pre-flight)

### 1. Verify Postgres Connection

```bash
# Check that legal-ai-postgres is running
docker-compose ps | grep legal-ai-postgres
# Should show: legal-ai-postgres  ... Up

# Test connection
psql -U legal_admin -d legal_ai_db -c "SELECT 1"
# Should return: 1 (success)
```

### 2. Set Environment Variables

Create or update `.env.local` in `sveltekit-frontend/`:

```bash
# Database (required)
DB_HOST=127.0.0.1
DB_PORT=5434
DB_NAME=legal_ai_db
DB_USER=legal_admin
DB_PASS=<your_postgres_password>

# Ollama (required for Batch D)
OLLAMA_HOST=http://127.0.0.1:11434
EMBEDDING_MODEL=embeddinggemma:latest

# Optional: git HEAD (auto-detected)
# GIT_REV=<commit_sha>
```

### 3. Install Dependencies

```bash
cd sveltekit-frontend

# If not already installed:
npm install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-go pg zod uuid

# Verify tree-sitter is available:
npm list tree-sitter
```

### 4. Create Reports Directory

```bash
mkdir -p reports/batch-{a,b,c,d,e,f,g}
```

---

## Execution Flow

### Batch A: Structural Authority (4–6 hours)

```bash
# Dry-run first (no DB writes)
npm run batch:a:dry
# Output: sample tree_node with all fields

# If dry-run succeeds (exit code 0):
npm run batch:a
# Output: "✓ Extracted X nodes, Y edges, Z parse errors"
#         "✓ Wrote X nodes to atlas_tree_nodes"
#         "✓ Wrote Y edges to atlas_tree_edges"

# Monitor gates
cat reports/batch-a/batch-a-structural-audit.json | jq '.gates'
# All must show: "pass": true

# Validate determinism (re-run, compare hashes)
npm run batch:a:validate
# Output: "✓ Determinism proven: X/X rows match hash"
```

**Success Criteria**: All 5 gates (A1–A5) PASS

**Next Step** (if gates PASS):
```bash
npm run batch:b
```

### Batch B: Feature Identity (3–4 hours)

```bash
npm run batch:b
# Requires: atlas_tree_nodes exists (from Batch A)
# Output: "✓ Assigned feature_id to X nodes"
#         "✓ Created Y tree-to-feature mappings"

# Validate
npm run batch:b:validate

# Check gates
cat reports/batch-b/batch-b-feature-identity-audit.json | jq '.gates'
```

**Success Criteria**: All 5 gates (B1–B5) PASS

**Next Step** (if gates PASS):
```bash
npm run batch:c:emit
```

### Batch C: Ontology Observations (5–7 hours)

```bash
# Emit observations (ast-grep rules → observations)
npm run batch:c:emit
# Output: "✓ Generated X observations from Y rules"

# Human review of observations (required)
# This opens an interactive UI for reviewing 1,000 features
npm run batch:c:review
# User action: Accept/reject observations, lock labels

# Validate
npm run batch:c:validate

# Check gates
cat reports/batch-c/batch-c-ontology-audit.json | jq '.gates'
```

**Success Criteria**: All 5 gates (C1–C5) PASS + control-set-1k-reviewed.ndjson created with locked labels

**Next Step** (if gates PASS):
```bash
npm run batch:d
```

### Batch D: Semantic Embeddings (3–4 hours)

```bash
# Requires: Ollama running on :11434
npm run gemma4:rotorquant:health  # Verify embeddings service is up

npm run batch:d
# Output: "✓ Generated X embeddings (768-dim)"
#         "✓ All embeddings finite"

# Validate
npm run batch:d:validate

# Check gates
cat reports/batch-d/batch-d-embedding-audit.json | jq '.gates'
```

**Success Criteria**: All 5 gates (D1–D5) PASS

**Next Step** (if gates PASS):
```bash
npm run batch:e:benchmark
```

### **Batch E: Search Baselines (4–5 hours) — CRITICAL GATE FOR GPU WORK**

```bash
# Requires: Qdrant running + embeddings from Batch D

npm run batch:e:benchmark
# Output: "✓ Exact search: recall@10 = 0.42, latency p95 = 450ms"
#         "✓ pgvector HNSW: recall@10 = 0.88, latency p95 = 120ms"
#         "✓ Qdrant: recall@10 = 0.91, latency p95 = 95ms"

# Check results
cat reports/batch-e/batch-e-search-baselines.json | jq '.experiments'

# Validate
npm run batch:e:validate

# Check gates
cat reports/batch-e/batch-e-search-audit.json | jq '.gates'
```

**Success Criteria**: 
- Gate E2 (recall@10 ≥0.80): ✅ PASS → GPU work UNBLOCKED
- Gate E3 (latency <150ms): ✅ PASS → Production acceptable
- All 5 gates (E1–E5): ✅ PASS

**⚠️ CRITICAL**: If **E FAILS**, do NOT proceed to Batch F. Diagnose, fix baseline retrieval, re-run E.

**If E PASSES**, GPU work is now safe:
```bash
# Proceed to classifier training
npm run batch:f:nb
```

### Batches F & G: Classifiers & Ranking (10–13 hours)

```bash
# Batch F: Naive Bayes + XGBoost
npm run batch:f:nb   # Naive Bayes training
npm run batch:f:xgb  # XGBoost training
npm run batch:f:validate

# Batch G: Ranking model
npm run batch:g      # XGBRanker training
npm run batch:g:validate
```

**Success Criteria**: All gates F1–F5 and G1–G5 PASS

---

## Monitoring & Debugging

### Real-time Progress

```bash
# Watch Batch A progress (if long-running)
watch -n 2 'cat reports/batch-a/batch-a-structural-audit.json | jq ".total_nodes"'

# Stream logs to file
npm run batch:a 2>&1 | tee batch-a.log

# Monitor Postgres during write
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_tree_nodes; SELECT COUNT(*) FROM atlas_tree_edges;"
```

### Common Issues

| Error | Diagnosis | Fix |
|-------|-----------|-----|
| `Postgres connection refused` | Database not running | `docker-compose up legal-ai-postgres` |
| `Cannot find module 'tree-sitter'` | Dependency missing | `npm install tree-sitter` |
| `Parse errors exceed threshold` | Bad file encoding or tree-sitter bug | Re-run with `--verbose`, skip problematic files |
| `Coverage <95%` | rg not finding files | Check file patterns with `rg --files -t ts \| wc -l` |
| `Gate A2 failed (duplicates found)` | Non-deterministic UUID generation | Check node_content_hash uniqueness, add workspace_revision to hash |
| `determinism validator fails` | Re-run produced different hashes | Likely timestamp or random seed issue, check materialization code |

### Rollback (if needed)

```bash
# If Batch A gates fail and you want to start over:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "DELETE FROM atlas_tree_edges; DELETE FROM atlas_tree_nodes;"

# Re-run Batch A
npm run batch:a
```

---

## Gate Validation Reference

Each batch has 5 gates that must ALL PASS:

### Batch A Gates
- **A1**: Coverage ≥95% of files have tree_node_version_id
- **A2**: Uniqueness — 0 duplicate tree_node_version_id values
- **A3**: Determinism — re-run produces identical hashes (proven in validator)
- **A4**: Parent/child integrity — 0 cycles in parent pointers
- **A5**: Edge integrity — all referenced nodes exist

### Batch E Gates (CRITICAL)
- **E1**: Coverage — all 3 engines complete 23 queries
- **E2**: Recall — Qdrant recall@10 ≥0.80 (gates GPU work)
- **E3**: Latency — Qdrant p95 <150ms (production acceptable)
- **E4**: Consistency — 2nd run ±5% latency variance
- **E5**: Determinism — query embedding + results reproducible

---

## Time Estimate Breakdown

| Phase | Batch(es) | Effort | Parallelizable? |
|-------|-----------|--------|-----------------|
| Week 1: Structural Foundation | A–C | 12–17h | No (sequential) |
| Week 2: Semantic Grounding | D–E | 7–9h | No (E depends on D) |
| Week 3: Ranking Pipelines | F–G | 10–13h | Partial (F/G parallel OK) |
| **Total** | **A–G** | **29–39h** | **Mostly sequential** |

**Critical Path** (minimum work to unblock GPU):
- A (4–6h) → B (3–4h) → C (5–7h) → D (3–4h) → E (4–5h) = **19–27 hours**

---

## After Batch G: GPU Work Unblocked

Once Batch G gates PASS (all F1–F5 and G1–G5):

```bash
# Now GPU acceleration is safe:

# SOM training (requires stable identity + domain labels)
npm run som:train

# K-means clustering (requires stable embeddings + confidence)
npm run kmeans:cluster

# TurboVec prefilter (optional, requires E validation)
npm run turbovec:prefilter:build
```

---

## Success Checklist

- [ ] Postgres running + connection verified
- [ ] Environment variables set (.env.local)
- [ ] Dependencies installed (tree-sitter, pg, zod, uuid)
- [ ] Reports directories created
- [ ] Batch A dry-run succeeds
- [ ] Batch A executes without errors
- [ ] All 5 Batch A gates PASS (A1–A5)
- [ ] Batch A determinism validated (re-run matches)
- [ ] Batch B–C complete (control-set locked)
- [ ] Batch D embeddings generated (768-dim, all finite)
- [ ] **Batch E PASSES (E2 recall ≥0.80, E3 latency <150ms)**
- [ ] Batch F classifiers trained (accuracy ≥0.75)
- [ ] Batch G ranking model trained (NDCG@5 ≥0.70)
- [ ] GPU work scheduled (SOM, K-means, TurboVec)

---

## Support & Questions

**If you encounter issues**:
1. Check the relevant batch implementation guide (e.g., `BATCH-A-STRUCTURAL-MATERIALIZER.md`)
2. Review "Common Issues" table above
3. Run with `--verbose` flag for detailed output
4. Check reports JSON files: `cat reports/batch-X/batch-X-*-audit.json | jq '.gates'`

**Critical contacts**:
- Postgres issues: `docker logs legal-ai-postgres`
- Ollama issues: `curl http://127.0.0.1:11434/api/tags`
- Qdrant issues: `curl http://127.0.0.1:6333/health`

---

## Ready to Begin

**Start here**:

```bash
cd sveltekit-frontend
npm run batch:a:dry
```

If dry-run succeeds (exit 0), proceed:

```bash
npm run batch:a
```

Monitor:

```bash
watch -n 2 'tail reports/batch-a/batch-a-structural-audit.json | jq ".gates"'
```

When all A gates PASS:

```bash
npm run batch:b
```

---

**Canonical Reference**: `docs/openspec/STRUCTURAL-IDENTITY-BATCH-ROADMAP.md`  
**Status**: READY FOR IMMEDIATE EXECUTION  
**Authorized By**: User confirmation (2026-07-27)
