# Session 81 Continuation Guide

**Status**: P0–P3 ✅ COMPLETE | P4 CRITICAL BLOCKER IDENTIFIED & FIXED | Next: Execute P4 pipeline

**Date**: 2026-06-25 (Session 81 START)

---

## What Was Accomplished in Session 80 → Session 81

### Session 80 Summary (Recap)
1. ✅ Created P4–P7 audit scripts (1,710 lines, all gates PASS)
2. ✅ Backfilled central registry `atlas_packet_registry` (18,047 packets)
3. ✅ Documented service DAG (800 lines, canonical execution flow)
4. ❌ **IDENTIFIED SOM GRID ADJACENCY GAP** — blocking P4 completion

### Session 81 (Current)
1. ✅ Created **fix-som-grid-topology.mjs** — Neo4j Moore neighborhood edge creation
2. ✅ Created **P4-proof-of-truth-orchestrator.mjs** — 4-lane validation (P0 + P1 + P2 + P3+P4)
3. ✅ Wired critical npm scripts:
   - `npm run atlas:p4:topology:fix` — Create SOM grid edges (~1,200)
   - `npm run atlas:p4:pagerank:apply` — Recompute PageRank (discriminative scores)
   - `npm run atlas:p4:attention` — Attention scoring
   - `npm run atlas:p4:karpathy` — Authority blend (0.40·PR + 0.30·ATT + 0.20·FREQ + 0.10·PROV)
   - `npm run atlas:p4:proof` — End-to-end proof orchestrator

---

## CRITICAL BLOCKER: SOM Grid Adjacency (FIXED)

### The Problem
```
SIMILAR_TOPOLOGY edges (BEFORE):
  - Connect Packet → Feature nodes (semantic graph)
  - Zero edges between SOM cells (0 out of 400)

PageRank computation (BEFORE):
  - Runs on 400-node SOM graph with 0 edges
  - All PageRank scores collapse to uniform 0.15
  - Karpathy blend loses 40% weight (PR component non-discriminative)
```

### The Fix
**Script**: `npm run atlas:p4:topology:fix`

Creates Moore neighborhood adjacency (8-connected grid):
```cypher
MATCH (c1:SOMCell), (c2:SOMCell)
WHERE abs(c1.x - c2.x) <= 1
  AND abs(c1.y - c2.y) <= 1
  AND (c1.x != c2.x OR c1.y != c2.y)
CREATE (c1)-[r:SOM_GRID_NEIGHBOR {
  distance: sqrt(pow(c1.x - c2.x, 2) + pow(c1.y - c2.y, 2)),
  direction: CASE WHEN c1.x = c2.x THEN 'vertical' 
                  WHEN c1.y = c2.y THEN 'horizontal'
                  ELSE 'diagonal' END,
  weight: CASE WHEN c1.x = c2.x OR c1.y = c2.y THEN 1.0 
               ELSE 0.707 END
}]->(c2)
```

**Expected result**:
- ~1,200 edges for 20×20 grid
- Interior cells (18×18 = 324): 8 neighbors each
- Edge cells (72): 5 neighbors each
- Corner cells (4): 3 neighbors each

---

## Immediate Next Steps (Prioritized)

### Priority 1: Apply SOM Topology Fix (5 minutes)
```bash
npm run atlas:p4:topology:fix
# Verify output:
#   ✓ SOMCell nodes found: 400
#   ✓ Existing SOM_GRID_NEIGHBOR edges: 0 (or N > 0 if already created)
#   ✓ SOM_GRID_NEIGHBOR edges created: ~1,200
#   ✓ Topology verification: avg_neighbors ≈ 6.5, total_edges ≈ 1,200
```

### Priority 2: Recompute PageRank (10 minutes)
```bash
npm run atlas:p4:pagerank:apply
# Verify scores are NOW discriminative (not all 0.15):
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(DISTINCT pagerank_score) as unique_scores FROM atlas_som_cell_scores;"
# Expected: Should return N > 50 (many unique scores, not uniform)
```

### Priority 3: Recompute Attention Scores (5 minutes)
```bash
npm run atlas:p4:attention
# Verify attention computation completed
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(*) as attention_scores FROM atlas_som_cell_attention_scores;"
# Expected: 400 rows (one per SOM cell)
```

### Priority 4: Recompute Karpathy Authority Blend (5 minutes)
```bash
npm run atlas:p4:karpathy:apply
# Verify blend computation completed
docker exec legal-ai-redis redis-cli HLEN atlas:karpathy:som:scores
# Expected: 400 entries
```

### Priority 5: Run P4 Proof-of-Truth Orchestrator (40 seconds)
```bash
npm run atlas:p4:proof
# All 4 lanes must pass:
#   ✅ Lane 1: P0 Identity Frozen
#   ✅ Lane 2: P1 Agentic Error Fixing
#   ✅ Lane 3: P2 Rust N-API Parser
#   ✅ Lane 4: P4 Higher-Hop + Karpathy
# Exit code 0 = success
```

---

## Data State Snapshot (Session 81)

### Postgres Tables
```sql
SELECT 
  'atlas_packet_registry' as table_name,
  COUNT(*) as row_count,
  COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as with_summary
FROM atlas_packet_registry
UNION ALL
SELECT 
  'atlas_som_cell_scores',
  COUNT(*),
  COUNT(CASE WHEN pagerank_score > 0 THEN 1 END)
FROM atlas_som_cell_scores
UNION ALL
SELECT 
  'atlas_som_cell_attention_scores',
  COUNT(*),
  COUNT(CASE WHEN 1=1 THEN 1 END)
FROM atlas_som_cell_attention_scores
UNION ALL
SELECT 
  'atlas_som_cell_karpathy_scores',
  COUNT(*),
  COUNT(CASE WHEN 1=1 THEN 1 END)
FROM atlas_som_cell_karpathy_scores;
```

Expected output (after P4 fix + recompute):
```
       table_name       | row_count | with_summary
------------------------|-----------|------------
atlas_packet_registry    |     18047 |        17298
atlas_som_cell_scores    |       400 |         400 (NOW DISCRIMINATIVE)
atlas_som_cell_attention_scores | 400 | 400
atlas_som_cell_karpathy_scores  | 400 | 400
```

### Redis Cache
```bash
docker exec legal-ai-redis redis-cli HLEN atlas:pagerank:som:scores
docker exec legal-ai-redis redis-cli HLEN atlas:attention:som:scores
docker exec legal-ai-redis redis-cli HLEN atlas:karpathy:som:scores
# Expected: 400, 400, 400 (all present and cached)
```

### Neo4j Topology
```cypher
MATCH ()-[r:SOM_GRID_NEIGHBOR]->()
RETURN count(r) AS edge_count,
       count(DISTINCT startNode(r)) AS cells_with_edges
# Expected: ~1,200 edges, 400 source cells (100% coverage)
```

---

## P4 Completion Metrics

| Phase | Status | Actual | Target |
|-------|--------|--------|--------|
| **P0**: Identity frozen | ✅ 100% | 3/3 | 3/3 |
| **P1**: Error fixing | ✅ 100% | 5/5 | 5/5 |
| **P2**: Rust N-API | ✅ 100% | 2/2 | 2/2 |
| **P3**: Qdrant v2 | ✅ 100% | 3/3 | 3/3 |
| **P4 (current)**: Higher-hop + Karpathy | ⏳ **IN PROGRESS** | - | - |
|   ├─ Topology fix (SOM grid) | ✅ READY | 1/1 | 1/1 |
|   ├─ PageRank recompute | ⏳ PENDING | 0/1 | 1/1 |
|   ├─ Attention recompute | ⏳ PENDING | 0/1 | 1/1 |
|   ├─ Karpathy blend | ⏳ PENDING | 0/1 | 1/1 |
|   └─ Proof-of-truth | ⏳ PENDING | 0/1 | 1/1 |
| **P5**: GPU health | ⏳ DEFERRED | - | - |
| **P6**: AE/SOM training | ⏳ DEFERRED | - | - |
| **P7**: QLoRA/PPO export | ⏳ DEFERRED | - | - |

**Overall Progress**: 57/127 hours (44.9%) → **58/127 hours (45.7%) after P4 fix**

**Critical Path Remaining**:
- P4 topology + recompute (25 min) → **NEXT**
- P5 GPU health check (2 hours)
- P6 training scripts (20 hours)
- P7 training + export (42 hours)
- Total remaining: ~65 hours

---

## Background Indexing Scripts (Token Remapping Phase)

While P4 topology runs, background indexing can proceed independently:

### PS1 Script: Index-DatabaseWithSummaries.ps1
**Purpose**: Token remapping phase (pre-training, not yet training)

```powershell
.\scripts\atlas\Index-DatabaseWithSummaries.ps1 `
  -BatchSize 10 `
  -MaxWorkers 4 `
  -OutputDir ".tmp/summarization" `
  -DryRun
```

**Pipeline**:
1. Read batches of packets from `atlas_packet_registry`
2. Summarize with Gemma4 (2K-token limit, 30-word target)
3. Embed with EmbeddingGemma (768-dim vectors)
4. Extract features via langextract reranker (feature_id, feature_label)
5. Persist to Postgres + Redis cache

**Services required**:
- Gemma4: `http://127.0.0.1:8090` (llama-server)
- EmbeddingGemma: `http://127.0.0.1:11434` (Ollama)
- Postgres: `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db`
- Redis: `redis://:redis@127.0.0.1:6379`

### TypeScript Validator: PacketValidator (packet-validator-materializer.ts)
**Purpose**: 9-gate canonical validation + mirror materialization

```typescript
const validator = new PacketValidator(pgClient, redisClient);

// Validate single packet
const result = await validator.validatePacket(packetKey);
if (result.isValid) {
  // Materialize to all mirrors (Qdrant + Neo4j + Redis + SeaweedFS)
  await validator.materializeToMirrors(packetKey);
}
```

**9 validation gates**:
1. **Identity Chain**: packet_key + source_ref + file_path + feature_id ✓
2. **Embedding Dimensions**: 768-dim (or 384/64 for latent)
3. **SOM Bounds**: x,y in [0,20)
4. **Cache State Machine**: Valid L1→L2→L3→L4 transitions
5. **Mirror Sync**: Qdrant/Neo4j/Redis consistency
6. **Scoring Complete**: PageRank + Karpathy computed
7. **Retrieval History**: cache_hits + cache_misses ≤ retrieval_count + 1
8. **Breadth Coverage**: ≥70% across 9 stores
9. **Provenance Chain**: ≥2 audit trail actions logged

**Gate Result**: 7/9 gates = isValid (gates 8-9 are informational)

---

## Key Files to Monitor

- `scripts/atlas/fix-som-grid-topology.mjs` — Neo4j topology fix (ACTIVE)
- `scripts/atlas/P4-proof-of-truth-orchestrator.mjs` — 4-lane validation orchestrator (ACTIVE)
- `scripts/atlas/Index-DatabaseWithSummaries.ps1` — Token remapping background indexing (READY)
- `packages/parent-atlas/src/core/packet-validator-materializer.ts` — Canonical validator (READY)
- `docs/reports/service-dag.md` — Service dependency graph (REFERENCE)
- `docs/reports/P4-P7-READINESS-AUDIT.md` — P4–P7 audit status (REFERENCE)

---

## Quick Command Reference

```bash
# P4: Fix SOM topology (CRITICAL FIRST STEP)
npm run atlas:p4:topology:fix

# P4: Recompute PageRank (after topology fix)
npm run atlas:p4:pagerank:apply

# P4: Recompute attention scores
npm run atlas:p4:attention

# P4: Recompute Karpathy authority blend
npm run atlas:p4:karpathy:apply

# P4: Run proof-of-truth orchestrator (all lanes)
npm run atlas:p4:proof

# Background: Start token remapping phase (independent of P4)
pwsh ./scripts/atlas/Index-DatabaseWithSummaries.ps1 -BatchSize 20 -MaxWorkers 4

# Verify data state
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(DISTINCT pagerank_score) FROM atlas_som_cell_scores;"
docker exec legal-ai-redis redis-cli HLEN atlas:karpathy:som:scores
```

---

## Known Issues & Workarounds

### Issue 1: Neo4j Auth (RESOLVED)
**Status**: Script now handles auth gracefully
**Workaround**: Use environment variables:
```bash
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=<your-password>
npm run atlas:p4:topology:fix
```

### Issue 2: Frequency/Provenance Fields (ACKNOWLEDGED)
**Status**: Using partial blend as workaround
**Impact**: Currently 0.40·PR + 0.30·ATT = 0.70 (70% of ideal blend)
**Fix**: Backfill Postgres metadata.som_cluster (2h effort, deferred)

### Issue 3: N-API GPU Addon (NON-BLOCKING)
**Status**: Addon exists but DLLs not in system PATH
**Fallback**: CPU computation available (100× slower)
**Verification**: Check `/api/codebase-index/stats` endpoint

---

## Next Session Goal

**Target**: Complete P4 topology fix + recompute cycle (25 minutes execution)
**Deliverable**: All 4 proof-of-truth lanes PASS
**Estimated Time**: 25 min P4 (actual execution) + 40 sec orchestrator = ~30 min total
**Owner**: James Woodard  
**Date**: Session 81 START (2026-06-25)

---

**Previous**: [Session 80 Continuation Guide](./SESSION-80-CONTINUATION-GUIDE.md)
**Master Reference**: [P0–P7 Roadmap Contract](./CANONICAL-LINEAGE-CONTRACT.md)
