# Critical Blockers Checklist — Quick Reference

## 3 Must-Unblock Items (Sequential Dependency)

### ✅ Blocker 1: Autoencoder Training (768→64 Latent)
**Priority**: CRITICAL  
**Status**: NOT STARTED  
**Effort**: 8 hours (6-8h training + 1h backfill)  
**Unblocks**: K-Means, SOM, latent lane, dimensionality reduction  

**What to do**:
```bash
# Day 1 (2h)
1. Create train-autoencoder-768-to-64.py
   - VAE architecture (encoder: 768→512→128→64, decoder reverse)
   - Training data: codebase_chunk_index (40,568 rows)
   - Hyperparams: learning_rate=0.001, batch=256, epochs=50
   - Early stopping: validation loss plateau

2. Start training (runs overnight on RTX 3060 Ti)
   python train-autoencoder-768-to-64.py --output models/ae-768-64-v1.pt

# Day 2 (1h)
3. Verify training complete
   - Check reconstruction loss < 0.15
   - Check latent silhouette score > 0.5

4. Backfill latent_64 column
   node backfill-latent-64-vectors.mjs --apply

# Verify
5. docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(*) FROM codebase_chunk_index WHERE latent_64 IS NOT NULL;"
   Expected: 40,568
```

**Gate**: latent_64 populated for all chunks ✅

---

### ✅ Blocker 2: tree_node_id Propagation (58.3K → 61.6K packets)
**Priority**: CRITICAL  
**Status**: PARTIAL (58.3K in atlas_packets only)  
**Effort**: 6 hours (1h queries + 2h backfill + 2-3h verify)  
**Unblocks**: Error domain matching, recovery topology, AST-based error fixing  

**What to do**:
```bash
# Day 1-2 (1h)
1. Write propagation queries
   - codebase_chunk_index.tree_node_id ← atlas_packets.tree_node_id
   - feature_domain_facts.tree_node_id ← atlas_packets.tree_node_id
   - feature_lexical_facts.tree_node_id ← atlas_packets.tree_node_id
   - feature_structural_facts.tree_node_id ← (already there)

2. Create propagate-tree-node-id.mjs script

# Day 2 (2h backfill)
3. Execute backfill
   node propagate-tree-node-id.mjs --apply

# Day 2-3 (2-3h verify)
4. Verify join integrity
   - Check for orphaned rows
   - Confirm 61,659 packets have tree_node_id or NULL (expected)
   - Check feature_* tables have non-NULL tree_node_id

# Commands
5. docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(*) FROM atlas_packets WHERE tree_node_id IS NOT NULL;"
   Expected: 58,365 (correct — not all code packets)

6. docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(*) FROM codebase_chunk_index WHERE tree_node_id IS NOT NULL;"
   Expected: 40,568 (after propagation)
```

**Gate**: 99%+ of related tables have tree_node_id propagated ✅

---

### ✅ Blocker 3: Neo4j GDS PageRank (Daily Batch)
**Priority**: CRITICAL  
**Status**: NOT STARTED (CPU-only PoC exists)  
**Effort**: 12 hours (2h GDS + 2h PageRank + 2h schedule + 3h materialize + 2h verify)  
**Unblocks**: Authority-ranked recovery, topology enrichment, ACE routing, SOM initialization  

**What to do**:
```bash
# Day 1-2 (2h setup)
1. Wire Neo4j GDS library
   - Add neo4j-driver to package.json (if not present)
   - Test connection: docker exec legal-ai-neo4j neo4j-cli help

2. Create compute-pagerank-neo4j-gds.mjs
   ```typescript
   const gds = require('@neo4j/graph-data-science');
   const query = `
     CALL gds.pageRank.stream('ontology', {
       maxIterations: 30,
       dampingFactor: 0.85
     })
     YIELD nodeId, score
   `;
   ```

# Day 2 (2h implementation)
3. Implement full-graph PageRank
   - Load 'ontology' projection (if not exists, create with all nodes/edges)
   - Run GDS PageRank
   - Stream results back to Postgres

4. Test on subset (1K nodes) to verify accuracy
   - Compare with CPU version: results should match within 0.01

# Day 3 (2h scheduling + 3h materialization)
5. Create .opencode/tasks/daily-pagerank-batch.json
   - Schedule: 2:00 AM UTC daily
   - Timeout: 1 hour
   - Fallback: if fails, re-run in 2 hours

6. Create materialize-pagerank-couchdb.mjs
   - Read PageRank scores from Postgres
   - Group into authority bands [0, 0.25, 0.5, 0.75, 1.0]
   - Write to CouchDB materialized_view: pagerank_by_authority_band

7. Materialize to Postgres atlas_topology_index
   - UPDATE atlas_topology_index SET pagerank = gds_score, authority_band = band
   - (re-run daily after batch completes)

# Day 3 (2h verification)
8. Verify all nodes scored
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
     -c "SELECT COUNT(*) FROM atlas_topology_index WHERE pagerank IS NOT NULL;"
   Expected: 67,189 (all nodes)

9. Verify CouchDB materialization
   curl http://localhost:5984/analytics/_design/pagerank/_view/by_authority
   Expected: 5 docs (one per authority band)

10. Test daily batch
    docker logs legal-ai-neo4j | grep pagerank
    Expected: daily task fires at 2:00 AM UTC
```

**Gate**: All 67,189 nodes scored; scores materialized; daily batch running ✅

---

## Secondary Blockers (Medium Priority)

### Blocker 4: Live Error Signal Ingestion
**Priority**: HIGH  
**Status**: NOT STARTED  
**Effort**: 6 hours (can proceed after Blockers 1-3 complete)  
**Unblocks**: Error fixing feedback loop, RL policy training  

**Quick Start**:
```bash
# Create RabbitMQ consumer for error signals
node ingest-live-error-signals.mjs --queue atlas.errors --consumer error-fixer-1

# Wire to HMM state machine
node validate-hmm-agentic-error.mjs --apply
```

---

### Blocker 5: Recovery Packet Ranking (Multi-Signal)
**Priority**: HIGH  
**Status**: DRY_RUN ONLY  
**Effort**: 4 hours (after Blockers 1-4)  
**Unblocks**: Error fixing application, fix quality improvement  

**Quick Start**:
```bash
# Multi-signal ranking: authority (40%) + semantic (40%) + domain (20%)
node rank-recovery-packets.mjs --apply --scoring-model multi-signal-v1
```

---

## Execution Timeline (Best Case)

| Day | Track 1 (AE) | Track 2 (PageRank) | Track 3 (tree_node_id) | Track 4 (Error Signal) | Status |
|-----|-------------|-------------------|------------------------|----------------------|--------|
| 1 | Build VAE (2h) | Wire GDS (2h) | Write queries (1h) | Setup RabbitMQ | 3 parallel start |
| 2 | Train (8h overnight) | Implement PR (2h) | Backfill (2h) | Waiting | AE training |
| 3 | Backfill (1h) | Schedule + materialize (5h) | Verify (2h) | Ingest signals (4h) | Convergence |
| 4 | **DONE** | Verify (2h) | **DONE** | Rank recovery (4h) | Parallel complete |
| 5 | — | **DONE** | — | **DONE** | All blockers unblocked |
| 6 | — | — | — | — | Ready for L4-L7 wiring |

**Sequential Dependency**: Blocker 3 can run in parallel with 1-2, but Blockers 4-5 require 1-3 first.

**Critical Path**: ~30 hours with parallelization (vs. 36 hours sequential)

---

## Smoke Tests (Run After Each Blocker)

### After Blocker 1 (Autoencoder)
```bash
node smoke-autoencoder-test.mjs
# Gate: VAE reconstruction loss < 0.15, latent_64 populated for 40K+ chunks
```

### After Blocker 2 (tree_node_id)
```bash
node smoke-tree-node-id-test.mjs
# Gate: 99%+ of related tables have tree_node_id, no orphaned rows
```

### After Blocker 3 (PageRank)
```bash
node smoke-pagerank-neo4j-test.mjs
# Gate: All 67,189 nodes scored, daily batch running, materialization working
```

### After Blocker 4 (Error Signals)
```bash
node smoke-agentic-error-fixing.mjs
# Gate: HMM smoke test 5/5 gates pass, recovery selection >14/16 domains working
```

### After Blocker 5 (Recovery Ranking)
```bash
node smoke-error-recovery-ranking.mjs
# Gate: Recovery packet selection >80% accurate, fix success rate acceptable
```

### Full Integration Test (After All Blockers)
```bash
node smoke-integration-test.mjs --full
# Gate 1: Error signal → HMM → recovery packet → ranking → fix applied
# Gate 2: Recommendation workflow produces valid patch suggestions
# Gate 3: ACE routing selects correct lanes for 100 test queries
# Gate 4: Zero critical errors in 24h test run
```

---

## Confirm Before Starting

**Prerequisites** (must be available):
- [ ] RTX 3060 Ti available for 8h AE training (GPU memory 8GB)
- [ ] Neo4j GDS library available (`neo4j-admin commands help | grep gds`)
- [ ] RabbitMQ consumer pattern working (can receive from `atlas.errors` queue)
- [ ] CouchDB available for materialization (port 5984)
- [ ] PostgreSQL 18.4 available with pgvector
- [ ] Postgres disk space: 10GB free (for latent_64 + indexes)

**If any prerequisite missing**: Document and adapt execution plan

---

## Success Criteria (MUST PASS)

- ✅ Autoencoder training completes (loss < 0.15)
- ✅ tree_node_id propagated to 99%+ of related tables
- ✅ PageRank: all 67,189 nodes scored + materialized
- ✅ Error signals flowing through HMM → recovery pipeline
- ✅ Recovery packet ranking >80% accurate
- ✅ Integration test: full error→fix→apply cycle works
- ✅ Zero production blockers remaining

---

**Status**: Ready to proceed when all prerequisites confirmed.  
**Next Action**: Confirm prerequisites → Start Day 1 (Blocker 1 + Blocker 3 in parallel).
