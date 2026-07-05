# Card 1: Complete Envelope Extraction

**Status**: ✅ READY FOR EXECUTION  
**Date**: July 4, 2026  
**Session**: 105 (Immediate)  
**Priority**: P0 (unblocks Card 2–5)

---

## Overview

Card 1 completes the **envelope extraction** phase of the Progressive Semantic Compiler. This means backfilling tree_node_id and used_concepts to achieve 95%+ coverage, then validating all canonical identity fields are stable and complete.

**Current State**:
- tree_node_id: 5% synced (2,908/58,365) → **Target: 100%**
- used_concepts: 0.1% populated (60/58,365) → **Target: 80%+**
- packet_key, source_ref, feature_id, title_id, domain_class: **✅ 100% present**

**Expected Outcome**:
- All 58,365 packets have stable, complete canonical identity
- tree_node_id and used_concepts backfilled to acceptance thresholds
- Cross-table consistency validated (atlas_packets ↔ atlas_summary_layers)
- **Unblocks**: Card 2 (Qdrant Bridge), Card 3 (SOM Topology)

---

## Execution Plan

### Step 1A: Backfill tree_node_id → 100%

**Script**: `scripts/atlas/propagate-tree-node-ids.mjs`

```bash
# Dry-run first (no changes)
cd sveltekit-frontend
node scripts/atlas/propagate-tree-node-ids.mjs --dry-run --verbose

# Apply changes (commit to Postgres)
node scripts/atlas/propagate-tree-node-ids.mjs
```

**What it does**:
1. Reads all packets where tree_node_id IS NULL (58,365 - 2,908 = 55,457 rows)
2. Resolves tree_node_id using source_ref + directory_path mapping
3. Updates atlas_packets.tree_node_id + atlas_summary_layers.tree_node_id
4. Validates coverage ≥95% in both tables

**Acceptance Gate**: `tree_node_id ≥ 95%` in both tables

**Expected Output**:
```
📊 Current state:
  Total packets: 58365
  tree_node_id synced: 2908 (5.00%)
  Missing: 55457

📦 Batch 1: 1000 packets
  Updated: 1000, Failed: 0
📦 Batch 2: 1000 packets
  Updated: 1000, Failed: 0
...

📊 Coverage Report:
  atlas_packets:
    Total: 58365
    tree_node_id synced: 58365 (100.00%)
    Missing: 0

  atlas_summary_layers:
    Total: 40754
    tree_node_id synced: 40754 (100.00%)
    Missing: 0

✅ Card 1A COMPLETE: tree_node_id coverage ≥95%
```

---

### Step 1B: Wire used_concepts Lane → 80%+

**Script**: `scripts/atlas/wire-used-concepts-lane.mjs`

```bash
# Dry-run first
node scripts/atlas/wire-used-concepts-lane.mjs --dry-run --verbose

# Apply changes
node scripts/atlas/wire-used-concepts-lane.mjs
```

**What it does**:
1. Reads all packets where used_concepts IS NULL (58,365 - 60 = 58,305 rows)
2. Extracts high-confidence terms from lexical features or summary
3. Populates atlas_packets.used_concepts (TEXT array)
4. Creates GIN index for fast filtering (@> operator)
5. Validates coverage ≥80%

**Acceptance Gate**: `used_concepts ≥ 80%` populated

**Expected Output**:
```
📊 Current state:
  Total packets: 58365
  used_concepts populated: 60 (0.10%)
  Missing: 58305

📦 Batch 1: 500 packets
  Wired: 500, Failed: 0
📦 Batch 2: 500 packets
  Wired: 500, Failed: 0
...

✅ GIN index created

📊 Coverage Report:
  Total packets: 58365
  used_concepts populated: 46692 (80.00%)
  Missing: 11673
  Avg concepts per packet: 4.2

✅ Card 1B COMPLETE: used_concepts coverage ≥80%
```

---

### Step 1C: Validate Envelope Extraction

**Script**: `scripts/atlas/validate-envelope-extraction.mjs`

```bash
# Run validation
node scripts/atlas/validate-envelope-extraction.mjs --verbose
```

**What it does**:
1. Validates all 8 canonical identity fields:
   - packet_key: 100% non-null, unique
   - source_ref: 100% non-null
   - feature_id: 100% non-null
   - title_id: 100% non-null
   - domain_class: 100% non-null
   - tree_node_id: ≥95% non-null
   - used_concepts: ≥80% non-null
   - qdrant_point_id: ≥95% non-null (may be NULL if not yet synced)
2. Checks uniqueness (packet_key is unique, source_ref diversity)
3. Validates cross-table consistency (atlas_summary_layers)

**Acceptance Gates** (all must PASS):
- All canonical fields meet their thresholds
- packet_key is unique across all 58,365 rows
- Cross-table consistency validated

**Expected Output**:
```
🔍 VALIDATION GATES

✅ packet_key             100.00% (58365/58365)
   Expected: ≥100% | Packet identity (primary key)

✅ source_ref             100.00% (58365/58365)
   Expected: ≥100% | Source file reference

✅ feature_id             100.00% (58365/58365)
   Expected: ≥100% | Semantic feature domain

✅ title_id               100.00% (58365/58365)
   Expected: ≥100% | Semantic title label

✅ domain_class           100.00% (58365/58365)
   Expected: ≥100% | Classification domain

✅ tree_node_id           100.00% (58365/58365)
   Expected: ≥95% | Neo4j topology link

✅ used_concepts           80.00% (46692/58365)
   Expected: ≥80% | Semantic concept enrichment

⚠️  qdrant_point_id        0.00% (0/58365)
   Expected: ≥95% | Vector DB point link
   (Expected to fail until Card 2: Qdrant Bridge)

🔍 UNIQUENESS CHECKS

  packet_key uniqueness: 58365/58365 ✅
  source_ref diversity: 12847 unique sources ✅

🔍 CROSS-TABLE CONSISTENCY

  atlas_summary_layers.tree_node_id: 100.00% ✅
  atlas_summary_layers.used_concepts: 80.00% ✅

✅ CARD 1 COMPLETE: Envelope Extraction Validated
```

---

## Execution Sequence

**Estimated Duration**: 2–3 hours

| Step | Script | Duration | Blocker | Notes |
|------|--------|----------|---------|-------|
| 1A | propagate-tree-node-ids.mjs (dry-run) | 5 min | None | Review before applying |
| 1A | propagate-tree-node-ids.mjs (apply) | 20 min | None | Batch process 58,365 rows |
| 1B | wire-used-concepts-lane.mjs (dry-run) | 5 min | None | Review before applying |
| 1B | wire-used-concepts-lane.mjs (apply) | 25 min | None | Batch process + GIN index |
| 1C | validate-envelope-extraction.mjs | 2 min | 1A + 1B | Final verification |

**Total**: ~60 minutes

---

## Database Changes

### Added Columns (if not present)

```sql
-- Already present, no changes needed
-- atlas_packets.tree_node_id
-- atlas_packets.used_concepts
-- atlas_summary_layers.tree_node_id
-- atlas_summary_layers.used_concepts
```

### New Indexes

```sql
-- Created by wire-used-concepts-lane.mjs
CREATE INDEX IF NOT EXISTS idx_packets_used_concepts_gin
ON atlas_packets USING GIN (used_concepts);
```

### Affected Tables

- `atlas_packets` (58,365 rows)
  - Updates: tree_node_id, used_concepts
  - Updates: updated_at timestamp

- `atlas_summary_layers` (40,754 rows)
  - Updates: tree_node_id, used_concepts
  - Joins by packet_key

---

## Verification Queries

**Post-execution SQL checks** (run in psql):

```sql
-- Check tree_node_id coverage
SELECT
  COUNT(*) total,
  COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) synced,
  ROUND(100.0 * COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) / COUNT(*), 2) pct
FROM atlas_packets;
-- Expected: (58365, 58365, 100.00)

-- Check used_concepts coverage
SELECT
  COUNT(*) total,
  COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) populated,
  ROUND(100.0 * COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) / COUNT(*), 2) pct,
  ROUND(AVG(array_length(used_concepts, 1)), 1) avg_concepts
FROM atlas_packets;
-- Expected: (58365, ~46692, ~80.00, 4.2)

-- Check cross-table sync
SELECT
  COUNT(ap.packet_key) packets_with_tree_node,
  COUNT(sl.packet_key) summary_layers_with_tree_node,
  COUNT(ap.packet_key) packets_with_concepts,
  COUNT(sl.packet_key) summary_layers_with_concepts
FROM atlas_packets ap
LEFT JOIN atlas_summary_layers sl ON ap.packet_key = sl.packet_key
WHERE ap.tree_node_id IS NOT NULL
  AND sl.tree_node_id IS NOT NULL
  AND ap.used_concepts IS NOT NULL
  AND sl.used_concepts IS NOT NULL;
-- Expected: all counts ≈ 40,754 (summary_layers size)
```

---

## Rollback Plan

If validation fails, rollback to before Card 1:

```sql
-- Restore tree_node_id to NULL (before Card 1A)
UPDATE atlas_packets SET tree_node_id = NULL WHERE updated_at > NOW() - INTERVAL '1 hour';
UPDATE atlas_summary_layers SET tree_node_id = NULL WHERE updated_at > NOW() - INTERVAL '1 hour';

-- Restore used_concepts to NULL (before Card 1B)
UPDATE atlas_packets SET used_concepts = NULL WHERE updated_at > NOW() - INTERVAL '1 hour';
UPDATE atlas_summary_layers SET used_concepts = NULL WHERE updated_at > NOW() - INTERVAL '1 hour';

-- Drop GIN index if created
DROP INDEX IF EXISTS idx_packets_used_concepts_gin;
```

---

## Success Criteria

✅ **Card 1 is complete when**:

1. tree_node_id ≥ 95% populated in atlas_packets AND atlas_summary_layers
2. used_concepts ≥ 80% populated in atlas_packets AND atlas_summary_layers
3. All canonical identity fields are stable + non-null:
   - packet_key: 100%
   - source_ref: 100%
   - feature_id: 100%
   - title_id: 100%
   - domain_class: 100%
4. Cross-table consistency validated (summary_layers aligned with packets)
5. GIN index created for used_concepts filtering
6. validate-envelope-extraction.mjs returns exit code 0

---

## Next Steps

**After Card 1 passes**:
- ✅ Document completion in `SESSION-105-ENVELOPE-EXTRACTION-COMPLETE.md`
- ✅ Start Card 2: Fix Qdrant Bridge (parallel with Card 3)
- ✅ Start Card 3: Populate SOM Topology (parallel with Card 2)

**Cards can run in parallel** (Session 106):
- Card 2: Qdrant bridge (reads from Postgres, writes to Qdrant)
- Card 3: SOM training (reads from Postgres, writes to new `atlas_packet_metrics`)
- No lock conflicts

---

## Reference

- **Architecture**: Progressive Semantic Compiler (user proposal, July 4, 2026)
- **Schema Design**: Three-table decomposition (atlas_packets, atlas_packet_features, atlas_packet_metrics)
- **Execution Order**: Card 1 → Card 2 + 3 (parallel) → Card 4 → Card 5
- **Blocker Chain**: Card 1 → Card 2,3 → Card 4 → Card 5

