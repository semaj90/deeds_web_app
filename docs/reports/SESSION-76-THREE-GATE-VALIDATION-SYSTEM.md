# Session 76: Three-Gate Validation System for Phase B

**Date**: 2026-06-24  
**Status**: 🟡 **GATES 1 ✅ | GATES 2 ❌ | GATES 3 ⚠️** — **BLOCKED PENDING REPAIRS**  
**Action**: Execute repair scripts, re-verify all gates before Phase B `--apply`

---

## Three-Gate System Overview

The metadata contract three-gate system enforces that Phase B (cluster sync & partition) can only proceed when all stores (Postgres, Neo4j, Qdrant) align on the SOM identity contract.

### Gate 1: Postgres SOM Coverage ✅ **PASS**
**Status**: 17,995/17,995 packets (100%) have som_row, som_col, directory_path  
**Verification**: `atlas:gate:1:postgres-som`  
**Verdict**: Ready for Phase B  
**Action**: No repair needed

### Gate 2: Neo4j Topology Identity ❌ **FAIL**
**Status**: 5,199 CodebaseFile nodes lack cell_id and som_cluster properties  
**Missing**: 0/5,199 cell_id, 0/5,199 som_cluster  
**Verification**: Dry-run via `atlas:gate:repair:neo4j`  
**Verdict**: Blocked — cannot route cluster-aware retrieval without Neo4j identity  
**Action**: Run `npm run atlas:gate:repair:neo4j:apply` to backfill 5,199 nodes

### Gate 3: Qdrant Metadata Contract ⚠️ **PARTIAL**
**Status**: 52,606 points scanned, 9 PASS, 1 FAIL, 3 WARN  
**Critical Blocker**: `retrieval_strategy` missing from 100% of points (FAIL)  
**Field Normalization**: sourceRef vs source_ref, feature_ids vs feature_id (WARN)  
**Verification**: `atlas:gate:repair:qdrant --limit=100`  
**Verdict**: Blocked — ACE/KAG/DAG retrieval cannot filter by missing field  
**Action**: Run `npm run atlas:gate:repair:qdrant:apply` to normalize all payloads

---

## Repair Workflow (Session 76)

### Prerequisites
- **Postgres 18.4** running, user legal_admin accessible
- **Neo4j 5.x** running, auth neo4j/neo4j123
- **Qdrant** running, REST API at :6333
- **Valkey/Redis** running at 127.0.0.1:6379, password "redis"
- **Env vars set**: `DATABASE_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASS`, `QDRANT_URL`, `REDIS_URL`

### Step 1: Verify Current Gate State
```bash
npm run atlas:gate:verify:all
# Output: JSON report showing all three gate statuses
```

**Expected output**:
```json
{
  "gate1": { "status": "PASS", "total_packets": 17995, "with_som": 17995 },
  "gate2": { "status": "FAIL", "total_nodes": 5199, "with_cell_id": 0, "with_som_cluster": 0 },
  "gate3": { "status": "PARTIAL", "retrieval_strategy_coverage_pct": 0, "critical_field_coverage_pct": 100 }
}
```

### Step 2: Repair Gate 2 (Neo4j Identity) — 30 minutes
```bash
# Dry-run to preview changes
npm run atlas:gate:repair:neo4j --limit=1000

# Apply backfill
npm run atlas:gate:repair:neo4j:apply --phase=all

# Verbose mode for detailed logging
npm run atlas:gate:repair:neo4j:verbose
```

**What it does**:
- Phase 1: Adds `cell_id` and `som_cluster` properties to 5,199 CodebaseFile nodes
- Phase 2: Creates SIMILAR_SOM_CELL edges within 3-cell neighborhood
- Phase 3: Reports on existing SIMILAR_TOPOLOGY edges (non-destructive)

**Expected output**:
```
   ✅ Added SOM identity to 5199 nodes
   ✅ Created XXXX SIMILAR_SOM_CELL edges
   ✅ Topology edges: 25888 (for backward compat)
```

### Step 3: Repair Gate 3 (Qdrant Payloads) — 20 minutes
```bash
# Dry-run on 100 points to preview normalization
npm run atlas:gate:repair:qdrant --limit=100

# Apply normalization to all 52,606 points
npm run atlas:gate:repair:qdrant:apply

# Verbose with change logging
npm run atlas:gate:repair:qdrant:verbose
```

**What it does**:
- Normalizes `sourceRef` → `source_ref` (canonical Postgres name)
- Normalizes `feature_ids` → `feature_id` (singular)
- Adds `retrieval_strategy` derivation (from som_cluster or default 'hybrid')
- Adds `som_row`/`som_col` if missing (split from som_cluster)

**Expected output**:
```
   ✅ Normalized: 52606 points
   Change breakdown:
     - retrieval_strategy: 52606  (100% coverage restored)
     - sourceRef→source_ref: 0    (or some count if present)
     - feature_ids→feature_id: 0  (or some count if present)
```

### Step 4: Verify All Gates Pass
```bash
npm run atlas:gate:verify:all --verbose
```

**Expected output after repairs**:
```
  ✅ Gate 1: Postgres SOM: PASS
  ✅ Gate 2: Neo4j Identity: PASS
  ✅ Gate 3: Qdrant Contract: PASS

  🟢 PHASE B READY — All gates PASS, proceed with --apply
```

---

## Phase B Execution (After All Gates PASS)

Once all three gates PASS:

```bash
# Dry-run Stage 5.5 cluster sync & partition
npm run atlas:cluster-sync:partition:dry

# Apply Stage 5.5 with gate guards active
npm run atlas:cluster-sync:partition:apply

# Verify Stage 5.5 results
npm run atlas:cluster-sync:partition:verify
```

**Gate guards ensure**:
- SOM identity is present and consistent across all stores
- Neo4j topology-aware retrieval can route by cell_id
- Qdrant payloads support retrieval_strategy filtering
- Bifrost L2 semantic cache can partition by SOM cluster

---

## Troubleshooting

### Gate 1 fails (Postgres SOM)
**Issue**: Some packets missing som_row/som_col  
**Fix**: Run `npm run atlas:backfill:som:apply` to populate from som_cluster  
**Blocker level**: CRITICAL — P0 must complete first

### Gate 2 fails (Neo4j timeout)
**Issue**: Neo4j transaction times out on large updates  
**Fix**: Reduce batch size in backfill script (lower --limit=100)  
**Workaround**: Run in phases: `--phase=1`, then `--phase=2` separately  
**Blocker level**: HIGH — prevents cluster-aware routing

### Gate 3 fails (Qdrant connectivity)
**Issue**: Cannot reach Qdrant on :6333  
**Fix**: Verify Qdrant is running: `curl http://127.0.0.1:6333/collections`  
**Workaround**: Check `QDRANT_URL` env var  
**Blocker level**: HIGH — prevents retrieval filtering

### Repair script crashes
**Issue**: Missing npm dependencies (@qdrant/js-client-rest, neo4j-driver)  
**Fix**: Run `cd sveltekit-frontend && npm install`  
**Blocker level**: MEDIUM — fix dependencies, re-run repair

---

## NPM Scripts Reference

**Repair scripts**:
- `atlas:gate:repair:neo4j` — Dry-run Neo4j backfill
- `atlas:gate:repair:neo4j:apply` — Apply Neo4j backfill
- `atlas:gate:repair:neo4j:verbose` — Neo4j backfill with logging
- `atlas:gate:repair:qdrant` — Dry-run Qdrant normalization
- `atlas:gate:repair:qdrant:apply` — Apply Qdrant normalization
- `atlas:gate:repair:qdrant:verbose` — Qdrant normalization with logging

**Verification**:
- `atlas:gate:verify:all` — Run all three gates
- `atlas:gate:verify:all:verbose` — With detailed logging

**Phase B execution** (after gates PASS):
- `atlas:cluster-sync:partition:dry` — Preview Stage 5.5
- `atlas:cluster-sync:partition:apply` — Execute Stage 5.5
- `atlas:cluster-sync:partition:verify` — Verify results

---

## Critical Rules (Do NOT Skip)

1. **Gate 1 must PASS first** — No Postgres SOM = no routing possible
2. **Gate 2 must PASS before Gate 3** — Neo4j identity needed for Qdrant correlation
3. **All gates must PASS before Phase B `--apply`** — Mixed contract states break retrieval
4. **Re-verify gates after each repair** — Ensure changes took effect
5. **Use `--verbose` for debugging** — Detailed logging helps diagnose failures

---

## Timeline Estimate

- **Step 1 (Verify)**: 2 minutes
- **Step 2 (Repair Gate 2)**: 30 minutes
- **Step 3 (Repair Gate 3)**: 20 minutes
- **Step 4 (Final Verify)**: 2 minutes
- **Total**: ~54 minutes to all gates PASS
- **Then Phase B execution**: +90 minutes (cluster_sync stage, TurboVec loading, Redis partitioning, Bifrost pre-filter, dry-run test)

---

## Session 76 Decision Summary

**User blocked further writes** on June 24 at 04:41:20 UTC until all three gates PASS.

This document and the three repair scripts (`normalize-qdrant-payloads`, `backfill-neo4j-som-identity`, `verify-metadata-contract-gates`) provide the complete infrastructure to:

1. Verify current state (all gates)
2. Repair defects (Gate 2 + Gate 3)
3. Confirm readiness (re-run all gates)
4. Proceed to Phase B with confidence

**Status**: Ready to execute repairs. No further action until user confirms.
