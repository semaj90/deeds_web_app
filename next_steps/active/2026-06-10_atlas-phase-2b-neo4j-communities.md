# ATLAS-2.0 Phase 2B: Neo4j Sync + Community Detection + Manifold4[3]
**Date:** 2026-06-10  
**Phase:** 2B (follows Phase 2A Materialization completion)  
**Duration:** ~20-30 minutes total  

---

## Overview

Phase 2B executes the Neo4j graph projection and Rust-based community detection, then enriches the `glyph_records` table with community assignments and the community dimension of the manifold4 quaternion.

**Phase 2B Order:**
1. Run Neo4j sync (sync graph-truth-neo4j.mjs)
2. Export SIMILAR_TOPOLOGY edges from Neo4j (implicit via sync)
3. Run Rust graph-engine community detection (graphrag-kmeans-communities.mjs)
4. Update glyph_records.community_id from Rust results
5. Recompute manifold4[3] as the community dimension

**Hard Gates (end of Phase 2B):**
- community_id coverage > 80%
- manifold4 non-zero coverage > 80%
- packet_key coverage remains 100% (from Phase 2A — DO NOT BREAK)
- ATLAS-1.0 completion gate still 100% (from Phase 2A — DO NOT BREAK)

---

## Prerequisites

✅ **Phase 2A complete:** 14,471 packets materialized with 100% deterministic packet_key coverage  
✅ **Neo4j service running:** `docker compose ps legal-ai-neo4j` → healthy  
✅ **Postgres connection ready:** `legal-ai-postgres:5432` accessible from host or Docker  
✅ **Rust graph-engine addon available:** `simd-bridge/rust/graph-engine/index.js` compiled  

---

## Execution

### Via Docker atlas-runner (Recommended)

```bash
# Dry-run (no database writes)
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:phase2b:dry"

# Full execution with Neo4j sync
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:phase2b"

# Execute community detection only (skip Neo4j sync)
npm run atlas:runner -- "cd sveltekit-frontend && npm run atlas:phase2b:skip-neo4j"
```

### Direct (if Neo4j/Postgres accessible locally)

```bash
# From sveltekit-frontend directory
npm run atlas:phase2b:dry        # Preview
npm run atlas:phase2b             # Execute
npm run atlas:phase2b:skip-neo4j  # Skip Neo4j, run communities + glyph updates
```

---

## What Happens

### Step 1: Neo4j Sync (sync-graph-truth-neo4j.mjs)

**Input:** 
- parent_atlas_documents (file truth, ~14K rows)
- atlas_feature_map (feature mappings, ~14K rows)
- deep-import-edges.jsonl (import graph)

**Output:**
- **Nodes:**
  - CodebaseFile (14K, short paths like `src/routes/api/...`)
  - ParentAtlasFeature (unique feature_ids)
  - Centroid (cluster centers)
  
- **Relationships:**
  - BELONGS_TO_FEATURE (file → feature mapping)
  - IMPORTS (static + dynamic import edges)
  - TEST_COVERS_FILE (test coverage)
  - SIMILAR_TOPOLOGY (SOM grid proximity, cost = grid distance)
  - HAS_CENTROID (cluster membership)

**Invariant:** All relationships have `cost` and `updatedAt` timestamps for graph traversal.

### Step 2: Community Detection (graphrag-kmeans-communities.mjs)

**Input:** 
- Scans sveltekit-frontend/src (2000+ files)
- Parses import dependencies recursively
- Builds directed import graph

**Process:**
- Calls native Rust `graphEngine.detectCommunitiesRust(nodeIds, edgesFrom, edgesTo, k=20)`
- Computes structural communities (strongly connected components + modularity optimization)
- Outputs 20 community clusters with member lists

**Output:**
- community_id assignments for each file
- Persists to `codebase_files.community_id` (upserts by file_path)

### Step 3-4: Update glyph_records + Manifold4[3]

**Input:**
- community_id assignments from codebase_files
- glyph_records rows with source_ref

**Process:**
1. Map source_ref (e.g., `src/routes/api/auth.ts`) to file_path
2. Look up community_id from codebase_files
3. Compute manifold4 quaternion: `[SOM_x, SOM_y, semantic_z, community_w]`
   - Phase 2B only: set `community_w = min(1.0, community_id / 100)` (normalized weight)
4. INSERT/UPDATE glyph_records with community_id + topology.manifold4

**Output:**
- glyph_records.community_id = integer community assignment
- glyph_records.topology['manifold4'] = quaternion including community dimension

---

## Monitoring Progress

### During Execution

Watch for these log sections:

```
Step 1: Running Neo4j sync...
  ✓ Loaded 14471 files from parent_atlas_documents
  ✓ Similar topology edges (bounded): 28942
  ⏳ Projecting 14471 CodebaseFile nodes...
  ✓ Persisted 6 SIMILAR_TOPOLOGY relationships...

Step 3: Running Rust community detection...
⚡ Rust Community Detection completed in 2500ms
👥 Found 20 distinct structural communities

Step 4-5: Checking schema and updating glyph_records...
  Processing 14471 glyph_records...
  ✓ Updated 12000 glyph_records with community_id
  ✓ Computed manifold4[3] for 12000 records
```

### Hard Gates Check

```
═══════════════════════════════════════════════════════════════
Phase 2B Hard Gates:
═══════════════════════════════════════════════════════════════

community_id coverage:    85.3% (gate: > 80%)  ✅
manifold4[3] coverage:    85.3% (gate: > 80%)  ✅
packet_key coverage (P2A): 100% (gate: = 100%)  ✅

✅ Phase 2B HARD GATES: PASS
```

If **any gate fails**, rollback and investigate:

```bash
# Rollback glyph_records community_id updates
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<SQL
UPDATE glyph_records SET community_id = NULL;
UPDATE glyph_records SET topology = topology - 'manifold4';
SQL

# Or full rollback (if Neo4j sync was applied):
npm run atlas:phase2b:dry  # Re-inspect before re-running
```

---

## Debugging

### Issue: Rust community detection fails

**Symptom:** `Error: detectCommunitiesRust is not a function`

**Causes:**
1. Native addon not compiled: `simd-bridge/rust/graph-engine/index.js` missing
2. Node.js module cache stale
3. Rust FFI binding mismatch

**Fix:**
```bash
# Rebuild addon
cd simd-bridge/rust/graph-engine
cargo build --release
cd ../../../

# Clear node cache
rm -rf node_modules/.vite

# Retry Phase 2B
npm run atlas:phase2b:dry
```

### Issue: Neo4j sync hangs

**Symptom:** Stuck at "Projecting 14471 CodebaseFile nodes..."

**Causes:**
1. Neo4j memory limit reached (16GB+ queries)
2. Database connection pool exhausted
3. Cypher query timeout

**Fix:**
```bash
# Monitor Neo4j memory
docker exec legal-ai-neo4j curl http://localhost:7474/db/neo4j/exec
# If VRAM > 90%, increase Docker memory allocation

# Or skip Neo4j and run community detection only
npm run atlas:phase2b:skip-neo4j
```

### Issue: community_id coverage < 80%

**Symptom:** Low community coverage suggests import graph is sparse

**Causes:**
1. Many glyph_records don't have a source_ref (no file mapping)
2. Import graph missing (deep-import-edges.jsonl incomplete)
3. Rust community detection failed silently

**Mitigation:**
- Phase 2B is designed to tolerate ~20% enrichment gaps
- Run Phase 2C to populate SOM BMU coordinates (alternative path to manifold4[0..1])
- Coverage > 80% is sufficient to proceed

---

## Next Phase (Phase 2C)

After Phase 2B completes:

**Phase 2C Goals:**
1. Populate SOM BMU row/col if missing (from Qdrant payload)
2. Recompute manifold4[0..1] from SOM coordinates
3. Audit non-zero manifold distribution

**Hard Gates (Phase 2C):**
- SOM coordinate coverage > 80%
- manifold4[0] and manifold4[1] non-zero coverage > 80%
- community_id coverage ≥ 80% (from Phase 2B — do NOT regress)
- packet_key coverage = 100% (from Phase 2A — do NOT break)

---

## Summary

**Phase 2B locks the Neo4j graph projection and community topology into the glyph record layer.**

The combined 4D manifold4 quaternion now encodes:
- **manifold4[0]:** SOM X coordinate (space)
- **manifold4[1]:** SOM Y coordinate (space)
- **manifold4[2]:** Semantic dimension (context — deferred to Phase 2C or later)
- **manifold4[3]:** Community dimension (connectivity — Phase 2B)

This provides the foundation for Phase 2D (HMM calibration on code/glyph summaries) and the full hyperRAG retrieval pipeline.

---

## Quick Reference

| Component | Status | Coverage | Gate |
|-----------|--------|----------|------|
| **Phase 2A (Materialization)** | ✅ COMPLETE | 100% packet_key | LOCKED |
| **Phase 2B (Communities)** | 🔄 IN PROGRESS | ~85% expected | > 80% |
| **Phase 2C (SOM Topology)** | ⏳ PENDING | — | > 80% |
| **Phase 2D (HMM Summaries)** | ⏳ PENDING | — | > 80% |

**Runbook:** This document + `phase-2b-neo4j-communities.mjs` orchestrator + verified `sync-graph-truth-neo4j.mjs` and `graphrag-kmeans-communities.mjs` implementations.
