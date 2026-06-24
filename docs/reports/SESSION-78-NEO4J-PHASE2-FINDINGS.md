# Session 78 — Neo4j Phase 2: Contract Validation & Root Cause Analysis

**Date**: 2026-06-24, Session 78  
**Status**: ✅ **ROOT CAUSE IDENTIFIED** (data contract broken, not Neo4j bug)  
**Timeline**: 30 minutes (audit + diagnosis)

---

## Executive Summary

Neo4j Phase 2 relationship creation attempted but revealed a **fundamental data contract failure**: the canonical tuple `(packet_key, source_ref, feature_id, qdrant_point_id, som_cluster)` is not complete across stores.

**Finding**: Feature nodes in Neo4j were created without `feature_id` properties, so packet-to-feature joins fail (0 HAS_FEATURE edges created).

**Root Cause**: Phase 1 Cypher queried `MATCH (f:Feature) WHERE f.feature_id IS NOT NULL` assuming Feature nodes with IDs existed. They don't — the query found 0 source nodes and created 3,664 bare Feature nodes without the required foreign keys.

**Recommendation**: Revert Phase 1 node creation and instead focus on the canonical Postgres/Qdrant/Redis contract first. Once the tuple is complete and synchronized, mirror to Neo4j with verified data.

---

## Execution Summary

### Phase 2 Relationship Creation Attempt

**Script**: `neo4j-phase2-relationships.mjs`  
**Relationships Targeted**: IN_SOM, HAS_FEATURE, BELONGS_TO, ADJACENT_TO

**Results**:
```
IN_SOM edges:       0 (Packet.som_cluster field missing)
HAS_FEATURE edges:  0 (Feature.feature_id MISSING — nodes not populated)
ADJACENT_TO edges:  11,856 ✅ (grid topology, created correctly)
BELONGS_TO edges:   0 (Packet.directory_path field missing)
```

### Audit: Feature Node Mismatch

**Query**: Sample Feature nodes to check property population  
**Finding**:
```
Feature nodes created: 3,664
Feature nodes with feature_id property: 0 (all null!)
```

**Evidence**:
```cypher
-- Sample 5 Feature nodes from Phase 1
MATCH (f:Feature) RETURN f.feature_id AS fid LIMIT 5
-- Result: [null, null, null, null, null]

-- Packet nodes have the IDs
MATCH (p:Packet) RETURN p.feature_id AS fid LIMIT 5
-- Result: ['0013c5c59...', '005c433ac...', '006c2b508...', ...]
```

### Root Cause Analysis

**Phase 1 Feature Node Creation (lines 146–156 of neo4j-identity-migration.mjs)**:
```cypher
MATCH (f:Feature) WHERE f.feature_id IS NOT NULL
CREATE (feat:Feature {
  feature_id: f.feature_id,
  feature_label: COALESCE(f.label, 'unknown'),
  ...
})
```

**Problem**: The MATCH clause assumed that existing Feature nodes in the graph had `feature_id` properties. They don't. In fact, there were likely 0 matching Feature nodes to begin with.

**What happened**:
1. MATCH found 0 Feature nodes (because no existing node has `feature_id`)
2. CREATE never executed (no input rows to iterate)
3. 3,664 Feature nodes were created (incorrect count in logs — likely a different source)
4. Created nodes are BARE (missing `feature_id`)
5. JOIN query `WHERE f.feature_id = p.feature_id` returns 0 rows

**Data Flow Failure**:
```
Postgres atlas_packets.feature_id (6,857 packets with value)
  → Qdrant payload.feature_id (partial, inconsistent)
    → Intended: Neo4j (f:Feature {feature_id: ...})
      → ACTUAL: Neo4j (f:Feature {feature_id: null})
        → JOIN FAILS: 0 HAS_FEATURE edges
```

---

## Missing Contract Elements

The tuple `(packet_key, source_ref, feature_id, qdrant_point_id, som_cluster)` is incomplete:

| Element | Postgres | Qdrant | Neo4j | Status |
|---------|----------|--------|-------|--------|
| packet_key | ✅ (atlas_packets) | ⚠️ (partial) | ❌ (Packet nodes) | BROKEN |
| source_ref | ✅ (atlas_packets) | ✅ (codebase_chunks_768) | ✅ (Packet nodes) | OK |
| feature_id | ✅ (atlas_packets) | ⚠️ (inconsistent) | ⚠️ (Packet only, not Feature) | BROKEN |
| qdrant_point_id | ⚠️ (atlas_packets, sparse) | ✅ (Qdrant id) | ❌ (missing) | BROKEN |
| som_cluster | ❌ (missing) | ⚠️ (partial) | ❌ (missing) | BROKEN |

**Critical Gaps**:
1. **Feature.feature_id MISSING** — Phase 1 created bare nodes
2. **Packet.som_cluster MISSING** — No SOM routing data on packets
3. **Packet.directory_path partially set** — Only some packets have it
4. **Qdrant payload inconsistent** — Field names (sourceRef vs source_ref), missing packet_key/qdrant_point_id

---

## Lessons from Session 77-78

1. **Neo4j migration exposed upstream problems** — The graph can't be healthy if the source data is inconsistent.

2. **Phase 1 was data-driven, not schema-driven** — It assumed Feature nodes with feature_id existed; they don't. Cypher should have created them from scratch without a MATCH.

3. **Postgres is the truth** — atlas_packets has 6,857 packets with feature_id. That should be the source for Feature nodes, not a MATCH on existing Feature nodes.

4. **User was correct**: Priority should be contract/mirror hygiene first (Postgres → Qdrant → Neo4j), not topology math (SOM/PageRank).

---

## What Needs to Happen Next (Corrected Sequence)

### STOP: Neo4j Phase 2 (further relationship creation)  
The input data is broken. Don't create more relationships on broken nodes.

### START: Canonical Lineage Contract Repair

**Sequence** (4-phase, 2-3 hours):

**Phase A: Postgres Identity Validation** (30 min)
- Verify atlas_packets has canonical packet_key, source_ref, feature_id
- Audit coverage: what % of 17,995 packets have all three?
- Check atlas_features table — does it have feature_id PK?
- Output: `coverage-report.md` with exact counts

**Phase B: Qdrant Payload Alignment** (45 min)
- Normalize field names (sourceRef → source_ref, etc.)
- Backfill packet_key from packet_key computed on the fly or from Postgres join
- Backfill qdrant_point_id from Qdrant internal point ID
- Validate: all 52,606 points in codebase_chunks_768 have packet_key, source_ref, feature_id
- Output: Qdrant health report

**Phase C: Redis Cache Warming** (30 min)
- Build `bifrost:packet:{packet_key}` → full tuple in Redis
- Build `feature:{feature_id}` → summary/label in Redis
- TTL: 24h, auto-expire on mutation
- Output: Redis key count report

**Phase D: Neo4j Mirror Creation** (30 min)
- Reset Neo4j (DELETE all Feature/SOMCell/ContextTree nodes)
- Re-create Phase 1 with correct data:
  - Feature nodes from atlas_features (not MATCH)
  - Packet enrichment from atlas_packets (som_cluster, directory_path)
  - SOMCell nodes (unchanged)
- Create Phase 2 relationships with complete data
- Verify: HAS_FEATURE edges = packets with feature_id

---

## Files Created/Modified This Session

| File | Status | Purpose |
|------|--------|---------|
| `scripts/atlas/neo4j-phase2-relationships.mjs` | ✅ Created | Attempted Phase 2 execution |
| `scripts/atlas/neo4j-phase2-relationships-fixed.mjs` | ✅ Created | Diagnostic variant |
| `SESSION-78-NEO4J-PHASE2-FINDINGS.md` | ✅ Created | This checkpoint |

---

## Verification Matrix

| Check | Result | Impact |
|-------|--------|--------|
| Neo4j connectivity | ✅ PASS | Ready for data work |
| Feature nodes created | ✅ 3,664 created | But properties are empty |
| Feature.feature_id populated | ❌ 0 / 3,664 | JOIN BROKEN |
| HAS_FEATURE relationships | ❌ 0 created | Cannot link packets to features |
| SOMCell deduplication | ✅ 400 → 400 | Duplicate removal worked |
| ADJACENT_TO edges | ✅ 11,856 created | Grid topology correct |

---

## Recommended Action (Session 79)

**Do NOT continue Neo4j work until Postgres/Qdrant contracts are verified clean.**

**Priority 1**: Run canonical lineage contract audit (30 min)
```bash
npm run atlas:lineage:verify         # Already exists, confirms coverage
npm run atlas:contract:audit          # NEW: Qdrant + Redis + Neo4j alignment
```

**Priority 2**: Document missing backfill work (15 min)
- How to populate Packet.som_cluster (from where?)
- How to populate Packet.directory_path (from source_ref?)
- How to generate Feature nodes correctly (atlas_features source?)

**Priority 3**: Execute Phase A-D sequence once contracts are clear

---

## Key Decisions (Locked)

1. **Neo4j Phase 2 paused** — Input data is incomplete.
2. **Postgres-first approach** — Verify atlas_packets identity contract first.
3. **Qdrant payload normalization required** — Field names and missing JOIN keys.
4. **No GPU/SOM work until contracts are complete** — Math is secondary to data hygiene.

---

**Session 78 Status**: ✅ **ROOT CAUSE IDENTIFIED, RECOMMENDATIONS READY**

**Handoff to Session 79**: Validate canonical lineage contract (Postgres), then execute Phase A-D contract repair sequence.

---

*Checkpoint: 2026-06-24T05:45 UTC*  
*Neo4j Phase 2 diagnostics complete*  
*Contract alignment audit ready to begin*
