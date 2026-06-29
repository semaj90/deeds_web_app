# Parent Atlas Open Lanes TODO — Phase Execution Checklist

**Date**: June 23, 2026 (Session 73)  
**Status**: 90% Complete (Core) | Execution Phase Starting | Package boundary CURRENT via `verify:spec-supersedes`
**Authority**: `docs/parent-atlas-100pct-next-steps.md`

---

## Phase Summary

| Phase | Name | Duration | Status | Blocker |
|-------|------|----------|--------|---------|
| **1** | Complete P3g Qdrant Backfill | 45 min | 🔄 IN PROGRESS (33%) | None — autonomous |
| **2** | P4 Verification Gates (Neo4j Audit) | 30 min | ⏳ READY | Phase 1 completion |
| **3** | P4 Graph Enrichment (PageRank/Attention/Karpathy) | 45 min | ⏳ READY | Phase 2 audit PASS |
| **4** | Package Consolidation (@deeds/parent-atlas-* + @deeds/atlas-core) | 120 min | 🚧 CURRENT | Boundary registry verified; historical-only refs isolated |
| **5** | ACE/KAG Integration Final Verification | 30 min | ⏳ READY | Phase 3 completion |

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 5 (Phases run sequentially, Phase 4 optional parallel)

---

## PHASE 1: Complete P3g Qdrant Backfill (45 min)

**Current State**: 4,500/13,545 packets embedded (33.2%)  
**Est. Completion**: ~12:50 UTC (+45 min from checkpoint)  
**Script**: `scripts/atlas/backfill-packets-to-qdrant-ollama.mjs`

### Actions
```bash
# Monitor the backfill progress (if still running)
tail -f .tmp/p3g-backfill-*.log

# If not running, restart:
npm run atlas:backfill:qdrant:embeddings:apply

# Once complete, verify:
npm run atlas:verify:p3g:complete
```

### Expected Output
```json
{
  "total_packets": 17995,
  "with_qdrant_point_id": 17994,
  "coverage_pct": 99.99,
  "status": "PASS"
}
```

### Gate Condition
✅ PASS when: 17,994/17,995 packets have `qdrant_point_id` in Postgres

---

## PHASE 2: P4 Verification Gates — Neo4j Topology Audit (30 min)

**Purpose**: Verify Neo4j SIMILAR_TOPOLOGY edges before running PageRank  
**Authority**: Neo4j Browser (`http://localhost:7474`)

### Queries to Execute (Copy-Paste into Neo4j Browser)

**Query 1: Edge Count**
```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN count(r) AS edge_count;
```
Expected: `edge_count` = 309 (or close to it from P4.1)

**Query 2: Self-Loop Check**
```cypher
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
WHERE a.cell_id = b.cell_id
RETURN count(r) AS self_loop_count;
```
Expected: `self_loop_count` = 0

**Query 3: Isolated Nodes**
```cypher
MATCH (n)
WHERE NOT (n)-[:SIMILAR_TOPOLOGY]-()
AND NOT ()-[:SIMILAR_TOPOLOGY]->(n)
RETURN count(n) AS isolated_node_count;
```
Expected: ≤ 20% of total nodes

**Query 4: Duplicate Edges**
```cypher
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
WITH a.cell_id AS from_cell, b.cell_id AS to_cell, count(r) AS rel_count
WHERE rel_count > 1
RETURN from_cell, to_cell, rel_count
ORDER BY rel_count DESC
LIMIT 20;
```
Expected: Empty result (0 rows)

### Save Results
After each query, copy the JSON result and save to:
```
docs/reports/neo4j-similar-topology-audit.json
```

### Gate Condition
✅ PASS when: All 4 queries return expected results
- Edge count > 0
- Self-loops = 0
- Isolated ≤ 20%
- Duplicate edges = 0 rows

---

## PHASE 3: P4 Graph Enrichment (PageRank, Attention, Karpathy) (45 min)

**Status**: Conditional on Phase 2 PASS  
**Scripts**: GPU-accelerated graph processing

### Step 3A: PageRank Computation (15 min)
```bash
npm run atlas:graph:pagerank:apply
```
Expected output: `docs/reports/p4-pagerank.json`

Verifies:
- Neo4j GDS projection created
- PageRank algorithm converged
- Top-100 scores cached in Redis

### Step 3B: Attention Scores (15 min)
```bash
npm run atlas:graph:attention:apply
```
Expected output: `docs/reports/p4-attention-scores.json`

Requires: TurboQuant `:8090` or Ollama `:11434` healthy

### Step 3C: Karpathy Authority Blend (15 min)
```bash
npm run atlas:karpathy:gpu
```
Expected output: `docs/reports/p4-karpathy-blend.json`

Blend formula:
```
karpathy_score = 0.40 × pagerank_score 
               + 0.30 × attention_score 
               + 0.30 × authority_score
               (all normalized 0.0–1.0)
```

### Gate Condition
✅ PASS when: All 3 outputs written to docs/reports/

---

## PHASE 4: Package Consolidation (120 min) — OPTIONAL, PARALLELIZABLE

**Authority**: `docs/PARENT-ATLAS-CONSOLIDATION-INVENTORY.md`  
**Boundary verifier**: `npm run verify:spec-supersedes`

### Package Structure (4 packages)

**Package 1: `packages/parent-atlas-core/` (20 min)**
- Identity schema files
- Adapter layer (Postgres/Qdrant/Neo4j/Redis/CouchDB)
- Export: `identity`, `schemas`, `adapters`

**Package 2: `packages/parent-atlas-retrieval/` (80 min)**
- Bifrost (L1/L2 cache)
- TurboVec (prefilter + rerank)
- LibTorch N-API + GPU bridges
- simd-bridge/cpp/build/Release/tensorrt_bridge.node binary
- Export: `retrievePacketsGPU`, `bifrostChat`, `turbovecPrefilter`

**Package 3: `packages/parent-atlas-ingest/` (20 min)**
- Scanner + parser bridge
- AST extraction
- Export: `scanRepository`, `parsePacket`, `ingestPipeline`

**Package 4: `packages/parent-atlas-opencode/` (1 min)**
- Symlink `.opencode/skills/parent-atlas-*.md` as SKILL.md
- Export CLI: `atlas:search`, `atlas:analyze`, `atlas:gpu-stats`

### Gate Condition
✅ PASS when: All 4 package surfaces are aligned, `npm run verify:spec-supersedes` returns `CURRENT`, and historical-only references remain isolated

### Boundary Roles
- Canonical: `packages/atlas-core`
- Operational: `packages/parent-atlas`
- Bridge: `packages/parent-atlas-core`
- Specialized: `packages/parent-atlas-retrieval`, `packages/parent-atlas-ingest`, `packages/parent-atlas-opencode`
- Historical only: `packages/atlas`, `packages/parent-atlas-sveltekit`

---

## PHASE 5: ACE/KAG Integration Final Verification (30 min)

**Status**: Conditional on Phase 3 PASS  
**Purpose**: Validate end-to-end retrieval with full payload coverage

### Actions
```bash
# 1. Verify Postgres/Qdrant payload alignment
npm run atlas:packet:contract:mirrors

# 2. Run retrieval smoke test
npm run smoke:hyperrag:packet-rpc

# 3. Run ACE context assembly with full blend
npm run atlas:ace:verify

# 4. Verify Neo4j traversal with pagerank scores
npm run atlas:neo4j:topology:verify
```

### Expected Outputs
```
✅ Packet contract mirrors: PASS
✅ HyperRAG packet RPC: PASS (latency <500ms)
✅ ACE context assembly: PASS (full 5-field blend)
✅ Neo4j topology: PASS (k-hop expansion with scores)
```

### Gate Condition
✅ PASS when: All 4 verifications succeed

---

## Checkpoint: What "100%" Means

At completion of Phases 1-5:

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Qdrant coverage | 100% | 99.99% (17,994/17,995) | ✅ PASS |
| SOM assignment | 100% | 100% (4,808/4,808 prod) | ✅ PASS |
| Neo4j topology edges | 309+ | 309 (P4.1) | ✅ PASS |
| PageRank scores | All files | Pending Phase 3A | ⏳ TODO |
| Attention scores | All files | Pending Phase 3B | ⏳ TODO |
| Karpathy blend | All files | Pending Phase 3C | ⏳ TODO |
| ACE retrieval accuracy | 5-field blend | Pending Phase 5 | ⏳ TODO |

---

## Parallel Optional Work (Phase 4)

**Can start immediately** (does not block critical path):
```bash
# Create package directory structure
mkdir -p packages/parent-atlas-{core,retrieval,ingest,opencode}

# Copy schema files
cp scripts/atlas/*schema*.mjs packages/parent-atlas-core/

# Create package.json files
# See PARENT-ATLAS-CONSOLIDATION-INVENTORY.md for details
```

---

## Quick Reference: Command Aliases

```bash
# Phase 1: Backfill monitor/verify
npm run atlas:backfill:qdrant:embeddings:apply
npm run atlas:verify:p3g:complete

# Phase 2: Neo4j queries (manual in browser http://localhost:7474)
# Use copy-paste queries above

# Phase 3: Graph enrichment
npm run atlas:graph:pagerank:apply
npm run atlas:graph:attention:apply
npm run atlas:karpathy:gpu

# Phase 5: ACE integration
npm run atlas:packet:contract:mirrors
npm run smoke:hyperrag:packet-rpc
npm run atlas:ace:verify
npm run atlas:neo4j:topology:verify
```

---

## Decision Points

**At Phase 2 Gate**:
- If Neo4j audit **PASS** → Proceed to Phase 3
- If Neo4j audit **FAIL** → Stop and repair topology

**At Phase 3 Complete**:
- All scores cached in Redis
- Karpathy blend live
- Ready for ACE integration

**At Phase 5 Gate**:
- If all verifications **PASS** → Parent Atlas 100% COMPLETE
- If any fail → Investigate and re-run Phase 3

---

## Known Issues & Workarounds

**Issue 1: P3g Backfill Stuck**
- Check: `curl http://localhost:6333/collections/codebase_chunks_768`
- If OOM: Reduce batch size (default 100 → try 50)
- If network timeout: Increase timeout to 60s in script

**Issue 2: Neo4j Not Accessible**
- Check: `curl http://localhost:7474/browser`
- If down: Restart Neo4j container
- Auth: Default `neo4j` / `neo4j`

**Issue 3: TurboQuant Not Healthy**
- Check: `curl http://localhost:8090/v1/models`
- Fallback: Use Ollama `:11434` instead
- GPU check: `nvidia-smi` (if CUDA available)

**Issue 4: Redis Not Accessible**
- Check: `redis-cli ping`
- If down: Restart Redis container
- Port: Default 6379

---

## Timeline Estimate

| Phase | Duration | Cumulative | Status |
|-------|----------|-----------|--------|
| **1** | 45 min | 45 min | 🔄 IN PROGRESS (33% done) |
| **2** | 30 min | 75 min | ⏳ Next (blocked by Phase 1) |
| **3** | 45 min | 120 min | ⏳ Next (blocked by Phase 2) |
| **4** | 120 min | 240 min | 🚫 Optional, parallel with Phase 3 |
| **5** | 30 min | 150 min (total critical path) | ⏳ Final (blocked by Phase 3) |

**ETA Critical Path Completion**: ~2.5 hours from now (assuming Phase 1 finishes in 45 min at current throughput)

---

## Session Notes

- **Session 72**: Preflight audit discovered Qdrant mirror integrity issues (75 collisions, 34,687 orphans) → Decision: Path C (accept partial state, fix async)
- **Session 73**: Comprehensive audit reveals 90% completion, clarifies actual blockers (not packet materialization, but P4 verification gates)
- **Next**: Execute Phase 1-5 checklist in order, monitor gates at each step

---

## References

- Authority: `docs/parent-atlas-100pct-next-steps.md`
- Consolidation: `docs/PARENT-ATLAS-CONSOLIDATION-INVENTORY.md`
- Neo4j Queries: Manual execution in http://localhost:7474/browser
- Memory: `memory/p3g-qdrant-upsert-fix.md`, `memory/parent-atlas-frozen-identity-contract.md`
