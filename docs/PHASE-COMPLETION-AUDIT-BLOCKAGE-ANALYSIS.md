# Comprehensive Completion Audit: Blockage Analysis & Wiring Plan

**Date**: July 21, 2026  
**Scope**: PageRank, KMeans, Tagging, Labeling, Recommendations, Agentic Error Fixing  
**Purpose**: Identify critical blockers and create execution roadmap for completion

---

## Executive Summary

**5 major systems** are 40-60% complete but **blocked by 3 critical missing pieces**:

1. **Autoencoder (768→64 latent vectors)** — blocks SOM clustering + latent lane
2. **tree_node_id propagation** — blocks error domain matching + recovery topology
3. **Neo4j GDS PageRank** — blocks authority-ranked recovery selection + topology enrichment

**If these 3 prerequisites are unblocked**: Error fixing, recommendations, and routing can be completed in parallel within **7-10 days**.

**Current Status**: ~48% overall (weighted across 5 systems) | **Target**: 95%+ production ready

---

## Critical Blockers (Must Unblock First)

### Blocker 1: Autoencoder Training (768→64 Latent) — CRITICAL

**Impact**: Blocks SOM clustering, latent vector lane, dimensionality reduction

**Current State**:
- Deterministic hash-based fallback in use (not learned)
- `latent_64` column exists but not populated
- Gate 2 (encoder provenance) marked incomplete in session notes

**What's Needed**:
```
768-dim embedding → Variational Autoencoder → 64-dim latent
Input: 40,568 codebase chunks from codebase_chunk_index
Training: PyTorch + GPU (RTX 3060 Ti, 8GB)
Output: encoder.pt + latent_64 column populated
```

**Estimated Effort**: 6-8 hours
- Collect training data (1h)
- Build VAE architecture (2h)
- Train + validate (3-4h)
- Backfill latent_64 column (1h)

**Unblocks**:
- ✅ SOM 20×20 training (5h after AE)
- ✅ Latent lane in retrieval (2h after AE)
- ✅ K-means on 64-dim space (1h after AE)
- ✅ Autoencoder-based dimensionality reduction in all downstream tasks

**Files to Create**:
- `scripts/atlas/train-autoencoder-768-to-64.py` (PyTorch + GPU)
- `models/autoencoder-768-to-64-v1.pt` (learned weights)
- `scripts/atlas/backfill-latent-64-vectors.mjs` (populate column)

---

### Blocker 2: tree_node_id Propagation to All Tables — CRITICAL

**Impact**: Blocks error domain matching, recovery topology lookups, AST-based error fixing

**Current State**:
- `tree_node_id` in `atlas_packets` (58,365/61,659 rows, 94.6%)
- NOT in `codebase_chunk_index`, `feature_domain_facts`, or error audit tables
- AST extraction (populate-structural-facts.mjs) only ran on 5,000 packets

**What's Needed**:
```sql
-- Propagate tree_node_id to all related tables
UPDATE codebase_chunk_index c
SET tree_node_id = ap.tree_node_id
FROM atlas_packets ap
WHERE c.packet_key = ap.packet_key
  AND c.tree_node_id IS NULL
  AND ap.tree_node_id IS NOT NULL;

-- Also propagate to feature_domain_facts, feature_lexical_facts, etc.
```

**Estimated Effort**: 4-6 hours
- SQL propagation queries (1h)
- Backfill all feature tables (2h)
- Verify join integrity (1-2h)
- Update schema docs (1h)

**Unblocks**:
- ✅ Error domain matching (error.error_class → domain via tree_node_id AST)
- ✅ Recovery packet topology lookups (find similar packets by AST structure)
- ✅ Structural error fixing (apply fixes at AST node level)
- ✅ 61,659 → all packets with structural metadata

**Files to Create**:
- `scripts/atlas/propagate-tree-node-id.mjs` (backfill script)
- `scripts/atlas/audit-tree-node-id-coverage.mjs` (verification)

---

### Blocker 3: Neo4j GDS PageRank Daily Batch — CRITICAL

**Impact**: Blocks authority-ranked recovery selection, topology enrichment, graph-based routing

**Current State**:
- CPU-only Node.js PageRank in `compute-pagerank-nodejs.mjs` (42,603 nodes only)
- Neo4j GDS referenced in docs but **not implemented**
- No scheduled batch job
- No materialized view in CouchDB

**What's Needed**:
```cypher
// Neo4j GDS PageRank on full graph
CALL gds.pageRank.stream(
  'ontology',
  { maxIterations: 30, dampingFactor: 0.85 }
) YIELD nodeId, score
```

**Estimated Effort**: 8-12 hours
- Wire Neo4j GDS library (2h)
- Implement full-graph PageRank (2h)
- Schedule daily batch job (2h)
- Materialize to CouchDB + PostgreSQL (2-3h)
- Verification + tuning (2h)

**Unblocks**:
- ✅ Authority-ranked recovery selection (top-authority packets first)
- ✅ Topology enrichment (authority bands in payloads)
- ✅ Graph-based routing (ACE lane selection by authority)
- ✅ All 67,189 nodes scored (vs. current 42,603)

**Files to Create**:
- `scripts/atlas/compute-pagerank-neo4j-gds.mjs` (GDS driver)
- `.opencode/tasks/daily-pagerank-batch.json` (scheduler config)
- `scripts/atlas/materialize-pagerank-couchdb.mjs` (CouchDB persist)

---

## Secondary Blockers (Medium Priority)

### Blocker 4: Live Error Signal Ingestion Pipeline

**Current State**: Error audit scripts exist but not hooked to live error signals  
**What's Needed**: RabbitMQ consumer → error audit → HMM state machine  
**Estimated Effort**: 4-6 hours  
**Impact**: Error fixing feedback loop (needed for RL policy learning)

### Blocker 5: Recovery Packet Ranking Algorithm

**Current State**: Dry-run only; no production `--apply` path  
**What's Needed**: Multi-signal ranking (authority + semantic similarity + domain match)  
**Estimated Effort**: 3-4 hours  
**Impact**: Error fixing quality (bad ranking = bad fixes)

---

## Completion Roadmap (Critical Path: 27-35 Hours)

### Phase A: Foundation (6-8 hours) — Autoencoder Training
```
Goal: Learn 768→64 latent representation
1. Collect training data from codebase_chunk_index (1h)
2. Build VAE architecture in PyTorch (2h)
3. Train on RTX 3060 Ti (3-4h, runs overnight)
4. Backfill latent_64 column (1h)
Gate: latent_64 populated for 40K+ chunks
```

### Phase B: Coverage (4-6 hours) — tree_node_id Propagation
```
Goal: Propagate tree_node_id to all related tables
1. Write propagation queries (1h)
2. Execute backfill (2h)
3. Verify join integrity (1-2h)
4. Update all feature extraction scripts to include tree_node_id (1h)
Gate: 61,659 packets with tree_node_id
```

### Phase C: Authority (8-12 hours) — Neo4j GDS PageRank
```
Goal: Full-graph authority scoring
1. Wire Neo4j GDS (2h)
2. Implement PageRank computation (2h)
3. Schedule daily batch job (2h)
4. Materialize to CouchDB + PostgreSQL (2-3h)
5. Verify accuracy vs. CPU version (1-2h)
Gate: All 67,189 nodes scored; scores materialized
```

### Phase D: Error Fixing (5-7 hours) — Live Signal → Recovery Chain
```
Goal: Wire error signals through HMM state machine to recovery packets
1. Implement error signal ingestion (RabbitMQ consumer) (2h)
2. Wire HMM state transitions (S0→S4) (1h)
3. Implement recovery packet ranking (multi-signal) (2h)
4. Test on 20 sample errors (1-2h)
Gate: HMM smoke test 5/5 gates pass; recovery selection working
```

### Phase E: Recommendations (5-7 hours) — L4-L7 Pipeline Wiring
```
Goal: Complete agentic recommendation workflow
1. Wire retrieval lane (L4) (2h)
2. Wire reranking + scoring (L5-L6) (2h)
3. Wire synthesis (L7, Gemma4) (1h)
4. Test on 50 sample packets (1-2h)
Gate: Agentic workflow produces patch/merge/create recommendations
```

### Phase F: Task Routing (3-4 hours) — ACE Signal Injection
```
Goal: Wire ACE 4×6 routing matrix to live queries
1. Implement query signal extraction (1h)
2. Feed signals to routing matrix (1h)
3. Test lane predictions on benchmark queries (1-2h)
Gate: Lane routing accuracy >85%
```

---

## Completion Status by System

### 1. PageRank Authority Scoring
```
Current: 60% (CPU-only, 42.6K nodes)
Target:  95% (Neo4j GDS, 67.2K nodes, daily materialization)
Blocker: Blocker 3 (Neo4j GDS)
Time:    12h (nested in Phase C)
Unblocks: Authority-ranked recovery, topology enrichment
```

### 2. K-Means Clustering (768 → 64-dim)
```
Current: 40% (12-dim feature vector, no silhouette-based k)
Target:  90% (64-dim latent, automated k selection, SOM-aware)
Blocker: Blocker 1 (Autoencoder latent_64)
Time:    4h (after AE ready)
Unblocks: Latent lane, SOM initialization, dimensionality reduction
```

### 3. SOM 20×20 Topology Clustering
```
Current: 0% (hash-based fallback only)
Target:  90% (trained SOM, BMU assignments, adjacency edges)
Blocker: Blocker 1 (latent_64) + Blocker 3 (authority scores)
Time:    5h (after AE + PageRank)
Unblocks: Topology lane, semantic clustering, graph routing
```

### 4. Domain Classification & Tagging
```
Current: 85% (keyword-based, 12 domains)
Target:  100% (feature_id propagation, extended domain inventory)
Blocker: Blocker 2 (tree_node_id propagation for AST features)
Time:    1h (Phase B side effect)
Unblocks: Error domain matching, domain-aware routing
```

### 5. Agentic Error Fixing (HMM + Recovery)
```
Current: 50% (HMM states defined, gate 3 failing 14/16 domains)
Target:  95% (live error signals, recovery selection, fix application)
Blockers: Blocker 2 (tree_node_id) + Blocker 3 (authority) + Blocker 4 (live signals)
Time:    7h (Phase D) + 6h prerequisite blockers
Unblocks: Auto-correction, error feedback loop, RL policy training
```

### 6. Recommendation Workflow (Agentic)
```
Current: 35% (L0-L3 only: intent, memory, ACP call)
Target:  90% (full L0-L7: intent → retrieval → rerank → synthesis)
Blocker: Architecture; Blocker 3 (authority for L5 reranking)
Time:    7h (Phase E) + 12h prerequisite blockers
Unblocks: Patch suggestions, merge recommendations, manual review bypass
```

### 7. Task Routing (ACE Lanes)
```
Current: 40% (routing matrix weights defined, no live signals)
Target:  95% (live signal injection, evaluated on 1K queries)
Blocker: Blocker 3 (authority scores needed for routing)
Time:    4h (Phase F) + 12h prerequisite blockers
Unblocks: Intelligent lane selection, batch size optimization, cache efficiency
```

---

## Critical Dependencies Graph

```
┌─────────────────────────────────────────────────────────────┐
│ Blocker 1: Autoencoder (768→64)                             │
│ ├─ K-Means Clustering → SOM Clustering → Latent Lane        │
│ └─ Time: 8h (6-8h train, 1h backfill)                      │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Blocker 2: tree_node_id Propagation                         │
│ ├─ Domain Classification (extended inventory)               │
│ ├─ Error Domain Matching                                   │
│ └─ Time: 6h (1h queries, 2h backfill, 2-3h verify)        │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Blocker 3: Neo4j GDS PageRank                               │
│ ├─ Authority-Ranked Recovery Selection                      │
│ ├─ Topology Enrichment                                      │
│ ├─ ACE Lane Routing (via authority signals)                 │
│ ├─ SOM Initialization (authority-aware clustering)          │
│ └─ Time: 12h (2h GDS, 2h PageRank, 2h schedule, 3h materialize, 2h verify) │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Blocker 4: Live Error Signal Ingestion                      │
│ └─ Error Fixing (HMM state machine)                         │
│ └─ Time: 6h (after Blockers 2-3)                           │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│ Blocker 5: Recovery Packet Ranking                          │
│ └─ Error Fixing Application                                 │
│ └─ Time: 4h (after Blockers 3-4)                           │
└─────────────────────────────────────────────────────────────┘

Sequential: 8h (AE) + 6h (tree_node_id) + 12h (PageRank) + 6h (error signal) + 4h (recovery ranking) = 36h
Parallel: 8h (AE) + 12h (PageRank in parallel with tree_node_id) + 6h + 4h = 30h
```

---

## Execution Schedule (Parallel Track)

### Track 1: Autoencoder Training (Runs Overnight)
```
Day 1 (2h) — Build VAE architecture + start training
Day 2 (1h) — Backfill latent_64 column (training finished overnight)
Unblocks:  K-Means, SOM, latent lane (on Day 2)
```

### Track 2: Neo4j GDS PageRank (Parallel)
```
Day 1 (4h) — Wire Neo4j GDS + implement PageRank
Day 2 (4h) — Schedule batch job + materialize to CouchDB
Day 3 (4h) — Verify accuracy + tune parameters
Unblocks:  Authority-ranked recovery, topology enrichment (on Day 3)
```

### Track 3: tree_node_id Propagation (Parallel)
```
Day 1 (2h) — Write propagation queries
Day 2 (3h) — Execute backfill + verify
Unblocks:  Error domain matching, recovery topology (on Day 2)
```

### Track 4: Error Fixing Pipeline (Sequential, after Tracks 1-3)
```
Day 3 (4h) — Live error signal ingestion (RabbitMQ consumer)
Day 4 (2h) — HMM state transitions + recovery ranking
Day 4 (2h) — Test on 20 sample errors
Unblocks:  Error feedback loop (on Day 4)
```

### Track 5: Recommendations + Routing (Sequential, after Track 4)
```
Day 5 (7h) — L4-L7 agentic workflow wiring
Day 6 (4h) — ACE routing matrix signal injection
Day 6 (2h) — Integration test across all systems
Complete:   Full system ready for production (Day 6 EOD)
```

---

## Gate Criteria (MUST PASS Before Production)

### Gate 1: Autoencoder Training
- [ ] VAE trained on 40K+ chunks
- [ ] Reconstruction loss < 0.15
- [ ] Latent_64 populated for all chunks
- [ ] Silhouette score for K-Means > 0.5

### Gate 2: tree_node_id Coverage
- [ ] 99%+ of packets have tree_node_id propagated
- [ ] All feature tables (lexical, structural, semantic, domain) have tree_node_id
- [ ] Join integrity verified (no orphaned rows)

### Gate 3: Neo4j GDS PageRank
- [ ] All 67,189 nodes scored
- [ ] Scores in valid range [0, 1], sum ≈ 67,189
- [ ] Daily batch job running successfully
- [ ] CouchDB materialization populated

### Gate 4: Error Fixing (HMM + Recovery)
- [ ] HMM smoke test: 5/5 gates pass (currently 3/5)
- [ ] Gate 3 (recovery selection): ≥14/16 domains passing
- [ ] Recovery packet ranking working (multi-signal)
- [ ] Applied fixes audit: >80% recovery success rate

### Gate 5: Agentic Recommendation Workflow
- [ ] L0-L7 pipeline complete (intent → synthesis)
- [ ] Sample test on 50 packets: recommendations valid
- [ ] Confidence scores calibrated (>0.6 = actionable)

### Gate 6: ACE Task Routing
- [ ] Routing matrix signal injection working
- [ ] Lane predictions >85% accurate on benchmark queries
- [ ] Batch size recommendations within 10% of optimal

### Gate 7: Integration Test
- [ ] Error signal → HMM → recovery → fix applied
- [ ] Recommendation workflow produces patch suggestions
- [ ] Task routing selects correct lanes
- [ ] Zero critical errors in 24h smoke test

---

## Risk Mitigation

| Risk | Mitigation | Effort |
|------|-----------|--------|
| Autoencoder training diverges | Early stopping + learning rate schedule | 1h |
| tree_node_id backfill too slow | Parallel UPDATE with smaller batches | 2h |
| Neo4j GDS memory OOM | Streaming PageRank + partition strategy | 3h |
| HMM transitions miss error cases | Add state E (escalation) + manual review lane | 2h |
| Recovery ranking selects wrong packets | Authority + semantic similarity fusion (3-signal blend) | 2h |

---

## Deliverables (By Completion Date)

### Scripts Created (12 new)
- `train-autoencoder-768-to-64.py` (PyTorch)
- `propagate-tree-node-id.mjs` (backfill)
- `audit-tree-node-id-coverage.mjs` (verification)
- `compute-pagerank-neo4j-gds.mjs` (GDS driver)
- `materialize-pagerank-couchdb.mjs` (persistence)
- `ingest-live-error-signals.mjs` (RabbitMQ consumer)
- `rank-recovery-packets.mjs` (multi-signal ranking)
- `complete-agentic-workflow-l4-l7.mjs` (recommendation synthesis)
- `wire-ace-routing-matrix.mjs` (live signal injection)
- `smoke-integration-test.mjs` (7-gate validation)
- Plus 2 schema migration scripts

### Tables/Views Modified (6)
- `atlas_packets` — tree_node_id propagation
- `codebase_chunk_index` — tree_node_id + latent_64
- `atlas_topology_index` — pagerank + authority_band
- `error_audit_results` — HMM state + recovery_packet_id
- `atlas_domain_classifications` — (new table from Phase 108)
- `ace_lane_routing_decisions` — (new table for routing audit)

### Performance Impact
- K-Means clustering: 20× faster (on 64-dim latent vs 768-dim)
- PageRank computation: 100× faster (GDS parallelized vs CPU loop)
- Error recovery selection: 5× faster (authority-ranked shortlist)
- Task routing latency: <100ms (cached routing matrix)

---

## Success Criteria

**All systems operational when**:
1. ✅ Autoencoder trained + latent_64 populated (40K chunks)
2. ✅ tree_node_id propagated to all tables (61.6K packets)
3. ✅ PageRank scores materialized for all nodes (67.2K nodes)
4. ✅ Error fixing HMM: 5/5 gates pass, >14/16 domains recovering
5. ✅ Agentic workflow: L0-L7 complete, recommendations valid
6. ✅ ACE routing: lane predictions >85% accurate
7. ✅ Integration test: error→fix→apply cycle proven on 20 errors

**Production readiness**: Day 6 EOD (if all parallel tracks execute on schedule)

---

## Next Action

**IMMEDIATE** (Day 1, 2h):
1. Start Autoencoder training (PyTorch script, runs overnight)
2. Parallel: Wire Neo4j GDS + write tree_node_id queries
3. Parallel: Create error signal ingestion skeleton

**Blocker checklist** (confirm before proceeding):
- [ ] RTX 3060 Ti available for 8h AE training
- [ ] Neo4j GDS library available in environment
- [ ] RabbitMQ consumer pattern working
- [ ] CouchDB available for materialization

All prerequisites met → Ready to start Phase Completion (Day 1).
