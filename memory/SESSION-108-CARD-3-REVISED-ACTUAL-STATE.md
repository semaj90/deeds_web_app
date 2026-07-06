---
name: Session 108 Card 3 REVISED - Actual State Map (What's Done vs. What's Blocking)
description: Reality-checked CARD 3 - most infrastructure exists, gaps are integration/depth/evidence-quality not missing primitives
type: project
---

# CARD 3 REVISED: Actual State Map — What's Done vs. Blocking

**Critical Reframe**: The architect's detailed status shows most infrastructure EXISTS. The gaps are NOT "build from scratch" but "complete/integrate/deepen what's there."

---

## ✅ WHAT'S ALREADY DONE (Architect Confirmation)

### Phase 16-H SOM/AE Alignment
- **Status**: ✅ Read-only evidence lane complete
- **Location**: `docs/reports/phase-16-som-ae-schema-alignment.md`
- **Proof commands ready**:
  ```bash
  npm run atlas:phase16:join:audit
  npm run atlas:concept-evidence:audit
  npm run atlas:packet-verify:strict
  npm run smoke:hyperrag-packet-rpc
  npm run atlas:retrieval:e2e
  ```
- **Next**: Join-key audit and packet verification, NOT packet-metadata backfill

### Contract Repair Work
- **Status**: ✅ Audit green for packet identity/index repair
- **Additive columns/indexes**: ✅ Aligned
- **Remaining**: Domain_class gap review (rows lacking trustworthy domain source)
- **Action**: Review + apply additive SQL only (audit-first, migration-second)

### Neo4j USED_CONCEPT Edge Seeding
- **Status**: ✅ Live and proven
- **Applied to**: 1,134 traces
- **Results**: 25 USED_CONCEPT edges created
- **Concepts**: agent_intelligence, database_orm, observability_telemetry, ui_components
- **Next**: Retrieval fusion, telemetry, optional query-time mirrors (not more seeding)

### Telemetry & Provenance Surfaces
- **Status**: ✅ Tables already exist
- **Files**:
  - `drizzle/manual/0049_atlas_retrieval_eval_times.sql` (exists)
  - `scripts/atlas/materialize-provenance-tree.mjs` (exists)
  - `sveltekit-frontend/scripts/atlas/logger-parent-atlas-health.mjs` (exists)
- **Gap**: NOT missing scaffolds. Gap is **telemetry depth + evidence quality**

### GPU Health Monitoring
- **Status**: ✅ Already in place
- **What exists**: GPU health monitoring, RabbitMQ boot, service-worker cache warming, SharedArrayBuffer compute-worker paths
- **Current symptom**: "Stuck" is usually `graphify:daily` cooldown + deep-ingest stage, NOT missing primitives
- **Fix**: Orchestration, not new infrastructure

### Retrieval & Ranking Surfaces
- **Status**: ✅ Functional
- **Contract**: Dense cosine (candidate generation) + Hilbert (locality) + SOM/PageRank (topology) all wired
- **Gap**: Promotion gate before ACP dispatch (this is CARD 3 P6 work)
- **Existing**: Karpathy GPU authority blend, RRF fusion, cache proof, provenance tracking

---

## ⏳ WHAT'S BLOCKING (Real Gaps)

### 1. SOM Contract Enforcement
- **Issue**: 799 coordinates detected vs. 400 contract
- **Root cause**: Coordinate clamping NOT applied in derive-topology.mjs
- **Fix**: Add deterministic normalization
- **Blocks**: Tree-node-ID ancestry, topology promotion gate, HMM classification
- **Session 108 status**: [P1 SOM Contract Fix](SESSION-108-P1-SOM-CONTRACT-FIX.md) documented, awaiting audit

### 2. Tree-Node-ID Propagation
- **Current coverage**: 65%
- **Target**: 100% across Postgres/Neo4j/Qdrant
- **Blocker**: SOM contract must be fixed first (tree_node_id calculation depends on 400 cells)
- **Work**: Backfill + sync to Neo4j payload + Qdrant payload

### 3. Domain_Class Gap Review
- **Issue**: Rows without trustworthy domain_class source
- **Action**: Manual review + correction
- **Blocker**: None (can proceed in parallel)
- **Effort**: 2-3h (audit + fix)

### 4. Schema Reconciliation (Alias Bridging)
- **Issue**: Old aliases on `atlas_tree_nodes`, `atlas_summary_layers`, `atlas_topology_index`
- **Target**: Bridge before promoting package scaffold as writable contract
- **Migration path**: `drizzle/manual/0046_phase_16_topology_gds.sql`
- **After**: Run KNN/PageRank/Centrality, then backfill SOM

### 5. Promotion Policy Implementation
- **Status**: Designed (CARD 3 P6)
- **Gap**: Hard gates not yet wired (qdrant_point_id check, tree_node_id check, topology score threshold)
- **Blocker**: None (can code once P2-P3 blocked items clear)

### 6. Retrieval-Attempt Ledger
- **Status**: Schema ready (P5)
- **Gap**: Not yet populated (no logging calls yet)
- **Blocker**: None (can wire logging once gate logic in place)

### 7. ACP Loop Closure
- **Status**: Designed (P7)
- **Gap**: Validation + tracing not yet integrated
- **Blocker**: Promotion gate must exist first (P6)

### 8. Recommendation Materialization (NEW)
- **Issue**: "Still suspicious" — only 5 recommendations emitted
- **Stale claim**: "4173-seed collapse" was old, needs replacement
- **Audit tool**: `scripts/atlas/audit-recommendation-merge.mjs` (exists, ready to run)
- **Action**: Run audit, review merge logic, fix if incorrect

---

## ✅ REVISED CARD 3 ROADMAP (Based on Actual State)

### Phase 0: Pre-Execution Validation (1-2h)
**Not CARD 3 P1, but prerequisite audit**:
- Run `npm run atlas:phase16:join:audit` (SOM/join keys)
- Run `npm run atlas:concept-evidence:audit` (concepts in Neo4j)
- Run `npm run atlas:packet-verify:strict` (packet identity integrity)
- Run `npm run smoke:hyperrag-packet-rpc` (HyperRAG packet validation)
- Audit SOM contract (max coordinates should be 19, not 799)
- If any fail → fix before proceeding

### Phase 1: SOM Contract Fix (1-2h) [CARD 3 P1]
**Prerequisite for P2-P7**:
- Apply deterministic coordinate clamping to `derive-topology.mjs`
- Recover invalid rows via SQL UPDATE
- Validate: max(som_row)=19, max(som_col)=19, unique_cells=400
- ✅ If pass → unblock P2-P7

### Phase 2: Qdrant Point ID Determinism (1-2h) [CARD 3 P2]
**Extend CARD 2**:
- Run full backfill without limit (estimated 250-400 packets)
- Mark non-file packets with qdrant_point_id=NULL + payload flag not_indexed=true
- Verify bijection: 1:1 packet_key ↔ qdrant_point_id for indexed packets

### Phase 3: Tree-Node-ID Propagation (4-6h) [CARD 3 P3]
**Depends on P1 + P2**:
- Backfill NULL tree_node_id values (derive from som_cluster hierarchy)
- Sync to Neo4j nodes (add tree_node_id property)
- Update Qdrant payload (include tree_node_id + parent_tree_node_id)
- Verify: 100% coverage across all three stores

### Phase 3B: Schema Reconciliation (2-3h) [PARALLEL]
**Independent of P1-P3**:
- Run adaptive schema reconciler audit
- Review generated additive SQL
- Apply non-destructive alias bridges (atlas_tree_nodes, atlas_summary_layers, atlas_topology_index)
- Apply missing columns/indexes
- Target: `drizzle/manual/0046_phase_16_topology_gds.sql`

### Phase 3C: Domain_Class Gap Review (2-3h) [PARALLEL]
**Independent of P1-P3**:
- Audit rows with NULL or untrusted domain_class
- Review domain source options (derived vs. manual)
- Apply corrections
- Verify: 100% coverage with trusted sources

### Phase 4: Recommendation Audit & Fix (1-2h) [PARALLEL]
**Independent of P1-P3**:
- Run `npm run atlas:audit-recommendation-merge`
- Review merge logic (why only 5 emitted?)
- Fix if incorrect
- Verify: Recommendations align with retrieval quality

### Phase 5: Retrieval-Attempt Ledger Population (2-3h) [CARD 3 P5]
**Depends on P3 (tree_node_id)**:
- Wire logging calls into retrieval pipeline
- Start populating atlas_retrieval_attempts on every retrieval attempt
- Log: candidates, promotion decisions, winners, cache targets

### Phase 6: Promotion Policy Gate Implementation (6-8h) [CARD 3 P6]
**Depends on P1 + P2 + P3 + P5**:
- Implement hard gates in `src/lib/server/retrieval/promotion-gate.ts`:
  - qdrant_point_id IS NOT NULL (indexed)
  - tree_node_id IS NOT NULL (in topology)
  - topology_score ≥ 0.4 (SOM + PageRank blend)
- Implement soft gates:
  - concept_overlap ≥ 0.1 (query-candidate concept match)
  - confidence threshold ≥ 0.3 (final gate)
- Test: 7/7 validation gates pass

### Phase 7: ACP Loop Closure & Tracing (4-6h) [CARD 3 P7]
**Depends on P6**:
- Add validation in ACP dispatch:
  - Verify packet envelope structure
  - Check qdrant_point_id + tree_node_id
  - Log to retrieval_attempts
- Add tracing to synthesis:
  - Capture Gemma4 output
  - Log success/failure to ledger
- Wire feedback loop:
  - User confirms/rejects synthesis
  - Update retrieval_attempts.success
- Tune promotion policy:
  - Analyze ledger: which stages filter winners?
  - Adjust thresholds (topology_score, confidence)

---

## Execution Order (Hard Dependencies)

```
Phase 0: Pre-execution Validation
  ↓ (if SOM audit fails)
Phase 1: SOM Contract Fix (BLOCKER)
  ↓ (unblocks everything)
Phase 2: Qdrant Point ID Determinism
  ↓
Phase 3: Tree-Node-ID Propagation
  ↓
Parallel:
  Phase 3B: Schema Reconciliation
  Phase 3C: Domain_Class Review
  Phase 4: Recommendation Audit
  Phase 5: Ledger Population
  ↓
Phase 6: Promotion Policy Gate
  ↓
Phase 7: ACP Loop Closure
```

---

## Estimated Effort (Revised)

| Phase | Prereq | Effort | Status |
|-------|--------|--------|--------|
| 0 | None | 1-2h | ⏳ Run proofs |
| 1 | Phase 0 | 1-2h | ⏳ Awaiting audit |
| 2 | Phase 1 | 1-2h | ✅ CARD 2 done, extend |
| 3 | Phase 2 | 4-6h | ⏳ Ready to code |
| 3B | None | 2-3h | ⏳ Ready (parallel) |
| 3C | None | 2-3h | ⏳ Ready (parallel) |
| 4 | None | 1-2h | ✅ Audit tool exists |
| 5 | Phase 3 | 2-3h | ⏳ Ready to code |
| 6 | Phase 1,2,3,5 | 6-8h | ⏳ Ready to code |
| 7 | Phase 6 | 4-6h | ⏳ Ready to code |

**Total**: 24-35h (most of Phase 0 + 1 can run quickly)

---

## Critical Reframes

1. **Not "build from scratch"**: Infrastructure (GPU monitoring, RabbitMQ, telemetry tables, SOM/AE lane) EXISTS. We're completing/integrating.

2. **Not "missing primitives"**: The "stuck" symptom is orchestration (graphify:daily cooldown) not missing pieces.

3. **Not "new storage work"**: pgvector/Qdrant/Zod already in contract-reconciliation lane. Gap is telemetry DEPTH + evidence QUALITY.

4. **SOM contract enforcement is the real blocker**: 799/400 breaks tree_node_id + topology promotion. Fix that first, everything else unblocks.

5. **Promotion policy gate is what's missing**: Not more embeddings, not more scoring. We need the GATE that filters before ACP.

6. **Recommendation audit exists**: Don't reimplement. Run `audit-recommendation-merge.mjs`, review merge logic, fix if broken.

---

## Session 108 Immediate Action

1. **Run Phase 0 proofs** (1-2h):
   ```bash
   npm run atlas:phase16:join:audit
   npm run atlas:concept-evidence:audit
   npm run atlas:packet-verify:strict
   npm run smoke:hyperrag-packet-rpc
   npm run atlas:retrieval:e2e
   ```

2. **Audit SOM contract** (0.5h):
   ```sql
   SELECT MAX(som_row), MAX(som_col) FROM atlas_packets WHERE som_row IS NOT NULL;
   -- Expected: 19, 19 (not 799)
   ```

3. **Decision Point**:
   - All Phase 0 pass + SOM=19 → Skip Phase 1, proceed to Phase 2
   - SOM > 19 → Execute Phase 1 fix (1-2h), then Phase 2-7
   - Any Phase 0 fail → Debug + fix before proceeding

---

## Success Criteria

- Phase 0: All proof commands exit 0
- Phase 1: SOM max(row)=19, max(col)=19, unique_cells=400
- Phase 2: All indexed packets have qdrant_point_id, no duplicates
- Phase 3: tree_node_id 100% coverage, synced to Neo4j + Qdrant
- Phase 6: 7/7 promotion gate tests pass
- Phase 7: 80%+ success rate on promoted packets to ACP

---

**Status**: ✅ **PHASE 0 READY TO RUN** | ⏳ **PHASE 1 CONTINGENT ON AUDIT**

**Not Blocked**: Phases 2, 3, 3B, 3C, 4, 5, 6, 7 can all be coded in parallel once their prerequisites clear.

**Key Insight**: This is NOT a "design from scratch" roadmap. It's a "complete/integrate/deepen" roadmap. The infrastructure exists; we're wiring the promotion semantics.
