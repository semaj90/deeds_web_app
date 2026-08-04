# Session 180 — S180-3: Qdrant Payload Inventory Audit

**Status**: COMPLETED (READ-ONLY)
**Date**: 2026-08-04T04:15:00Z
**Scope**: Qdrant collection metadata + payload schema analysis

---

## Collection Overview

| Metric | Value |
|--------|-------|
| Collection | `codebase_chunks_768` |
| Total Points | 105,761 |
| Payload Schema | Defined (31 fields) |
| Status | ACTIVE |

---

## Canonical Field Coverage (vs S180-4 Contract)

**CRITICAL FINDINGS**:

| Field | Status | Coverage | Notes |
|-------|--------|----------|-------|
| `packet_key` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — This is the canonical identity field |
| `workspace_id` | ⚠️ PARTIAL | 52,381/105,761 (49.6%) | ~53K points lacking workspace scope |
| `workspace_revision` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — Version tracking absent |
| `source_ref` | ✅ COMPLETE | 105,761/105,761 (100%) | Only canonical field fully populated |
| `source_revision` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — Source version absent |
| `feature_id` | ❌ **SPARSE** | 1/105,761 (0.001%) | Essentially unpopulated |
| `feature_label` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — Feature semantics lost |
| `symbol_id` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** |
| `symbol_version_id` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** |
| `content_hash` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — Content validation absent |
| `tree_node_id` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** |
| `schema_version` | ❌ **MISSING** | 0/105,761 | **NOT IN SCHEMA** — Version tracking absent |

---

## Additional/Legacy Fields (Populated)

| Field | Coverage | Type | Purpose |
|-------|----------|------|---------|
| `kind` | 6,907/105,761 (6.5%) | keyword | Point classification (sparse) |
| `workspace_id` | 52,381/105,761 (49.6%) | keyword | Workspace scope (partial) |
| `source_ref` | 105,761/105,761 (100%) | keyword | ✅ Source reference (complete) |
| `semantic_path` | 0/105,761 | keyword | (unused) |
| `point_kind` | 0/105,761 | keyword | (unused) |
| `next_action` | 0/105,761 | keyword | (unused) |
| `language` | 0/105,761 | keyword | (unused) |
| `som_cluster` | 0/105,761 | integer | (unused) |
| `observed_at` | 0/105,761 | keyword | (unused) |
| `sourceRefs` | 0/105,761 | keyword | (legacy/duplicate) |
| `repo` | 0/105,761 | keyword | (unused) |
| `updated_at` | 0/105,761 | integer | (unused) |
| `parent_centroid_id` | 0/105,761 | keyword | (unused) |
| `centroid_id` | 0/105,761 | keyword | (unused) |
| `tags` | 1/105,761 | keyword | (sparse) |
| `agent_pickup_ready` | 0/105,761 | keyword | (unused) |
| `symbol_name` | 0/105,761 | keyword | (unused) |
| `summary_hash` | 0/105,761 | keyword | (unused) |
| `path` | 0/105,761 | keyword | (unused) |
| `workspace_task_id` | 0/105,761 | keyword | (unused) |
| `file_path` | 1/105,761 | keyword | (sparse) |
| `cluster_key` | 0/105,761 | keyword | (unused) |
| `error_id` | 0/105,761 | keyword | (unused) |
| `cluster_id` | 0/105,761 | keyword | (unused) |
| `topo_class` | 0/105,761 | keyword | (unused) |

---

## S180-3 Assessment

### Critical Issues

1. **Missing Canonical Identity**
   - `packet_key` field completely absent from schema
   - Cannot uniquely identify packets in Qdrant → Postgres join will be ambiguous
   - **Impact**: Patch context handler cannot reliably look up candidates

2. **Workspace Scope Gap**
   - 52,381 points missing `workspace_id` (49.6% loss)
   - Multi-tenant queries will miss half the data
   - **Impact**: Phase 5A orphan reconciliation cannot scope work

3. **Version Tracking Absent**
   - No `workspace_revision`, `source_revision`, or `schema_version`
   - Cannot detect stale points or migration state
   - **Impact**: Drift detection impossible

4. **Feature Semantics Lost**
   - `feature_id`: 1/105,761 (essentially unpopulated)
   - `feature_label`: completely absent
   - **Impact**: Semantic grouping broken

---

## Data Counts Discrepancy

**Previous Session Reports**: 40,568 points in `codebase_chunks_768`
**Current Audit**: 105,761 points in `codebase_chunks_768`

**Likely Explanations**:
1. Collection was repopulated/rebuit since last audit
2. Multiple index operations added duplicates
3. Data migration included additional point types (not just code chunks)

**Action Required**: Verify why point count increased 2.6× (40.5K → 105.7K)

---

## Comparison to S180-4 Contract

**Expected Canonical Fields** (from S180-4 contract):
```json
{
  "packet_key": "required",
  "workspace_id": "required",
  "workspace_revision": "required",
  "source_ref": "required",
  "source_revision": "required",
  "feature_id": "required",
  "feature_label": "optional",
  "symbol_id": "optional",
  "symbol_version_id": "optional",
  "content_hash": "required",
  "tree_node_id": "optional",
  "schema_version": 2,
  "migration_date": "ISO timestamp",
  "rollback_identifier": "string"
}
```

**Actual Qdrant Payload**:
- ✅ Has: `source_ref` (100%), `workspace_id` (50%)
- ❌ Missing: `packet_key`, `workspace_revision`, `source_revision`, `feature_label`, `content_hash`, `schema_version`, `migration_date`, `rollback_identifier`
- ⚠️ Sparse: `feature_id` (0.001%), `kind` (6.5%), `tags` (0.001%)

**Contract Alignment**: ~20% (only 2 of 12 required fields present)

---

## S180-3 Status

| Check | Result | Evidence |
|-------|--------|----------|
| Collection exists | ✅ PASS | 105,761 points found |
| Schema defined | ✅ PASS | 31 fields in schema |
| Canonical `packet_key` field | ❌ FAIL | Not in schema |
| Canonical `workspace_id` field | ⚠️ PARTIAL | 49.6% coverage (should be 100%) |
| Canonical `source_ref` field | ✅ PASS | 100% coverage |
| Version tracking fields | ❌ FAIL | All 3 missing |
| Feature semantics fields | ❌ FAIL | Both missing |
| Overall S180-4 contract alignment | ❌ NOT_PROVEN | 20% coverage only |

**S180-3 Result**: `PARTIAL_PROVEN`
- Collection infrastructure exists
- Critical identity fields missing or underpopulated
- Payload schema incompatible with S180-4 contract

---

## Blocking Issues for Phase 5A

1. **Cannot reliably join Qdrant → Postgres** without `packet_key` field
2. **Cannot scope work by workspace** without full `workspace_id` coverage
3. **Cannot detect data drift** without version/revision fields
4. **Cannot run patch context handler** — it depends on canonical identity fields being present

**S180-3 Verdict**: Backfill required before S180-4 contract can be signed

---

## Next Steps

**S180-4**: Define formal v2 payload contract
- Specify required vs optional fields
- Specify migration plan to populate missing fields
- Specify data validation rules

**S180-5**: Plan bounded dry-run reconciliation (after S180-4 signed)
- Sample 10 Postgres packets
- Attempt Qdrant lookup by `source_ref` (only field we have)
- Report join success rate

**Backfill Lane** (parallel, lower priority):
- Script to populate `packet_key`, `workspace_id`, `workspace_revision` from Postgres
- Backfill `feature_id`, `feature_label` from payload analysis
- Verify coverage reaches 95%+ before Phase 5A entry

---

**Session 180 — S180-3 Complete**: Qdrant payload audit reveals critical gaps. Canonical identity fields missing or severely underpopulated. Backfill required before proceeding to S180-4.
