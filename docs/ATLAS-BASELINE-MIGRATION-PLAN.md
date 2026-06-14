# Atlas Clustering Health Baseline & Migration Plan

**Baseline Established**: June 14, 2026  
**Status**: ✅ Read-only diagnostic complete  
**Next**: Schema migrations in priority order

---

## Baseline Summary

### Identity Contract Freeze

The canonical packet identity is frozen for this migration plan:

- `packet_key` is immutable identity.
- `source_ref` is canonical provenance.
- `feature_id` may be enriched, not reassigned.
- `feature_label` remains human-readable ownership.
- `metadata` may grow.

Compare-only future surfaces until the derived contract exists:

- `atlas_tree_nodes`
- `atlas_topology_index`
- `atlas_svg_glyphs`

### PostgreSQL State

| Table | Rows | Status |
|-------|------|--------|
| atlas_packets | 17,485 | ✅ Canonical spine |
| atlas_feature_map | 19,611 | ✅ Feature taxonomy |
| atlas_cards | 0 | Empty (for future use) |
| **Total** | **37,096** | **Core schema live** |

### Field Coverage (atlas_packets)

| Field | Coverage | Status | Action |
|-------|----------|--------|--------|
| packet_key | 100% | ✅ Perfect | None |
| source_ref | 100% | ✅ Perfect | None |
| feature_id | 100% | ✅ Perfect | None |
| feature_label | 100% | ✅ Perfect | None |
| summary | 99.9% | ✅ Excellent | None |
| community_id | 99.5% | ✅ Excellent | None |
| **file_path** | **0%** | ❌ **CRITICAL** | **Backfill required** |
| **tree_node_id** | **0%** | ❌ **CRITICAL** | **Backfill required** |

### Index Coverage

| Type | Count | Status |
|------|-------|--------|
| B-tree | 43 | ✅ Strong foundation |
| GIN | 15 | ✅ Good JSONB support |
| GIST | 0 | ⏳ None yet |
| HASH | 2 | ⏳ Limited |
| **Total** | **60** | **Well-indexed** |

**Key Indexes Present**:
- packet_key (B-tree) ✅
- source_ref (B-tree) ✅
- feature_id (B-tree) ✅
- summary (FTS) ✅
- GIN on JSONB payload/metadata ✅

### Qdrant State

| Collection | Points | Status | Note |
|------------|--------|--------|------|
| codebase_chunks_768 | 52,606 | ✅ Live | Main semantic index |
| feature_cards_768 | 0 | ⏳ Ready to create | New (Phase 2) |
| summary_layers_768 | 0 | ⏳ Ready to create | New (Phase 2) |
| memory_cards_768 | 0 | ⏳ Ready to create | New (Phase 2) |
| glyph_vectors_768 | 0 | ⏳ Ready to create | New (Phase 2) |

**Payload Coverage** (sample of 100 points from codebase_chunks_768):

| Field | Coverage | Status |
|-------|----------|--------|
| source_ref | 100% | ✅ Perfect |
| feature_id | 100% | ✅ Perfect |
| feature_label | 100% | ✅ Perfect |
| file_path | 100% | ✅ Perfect |
| tags | 100% | ✅ Perfect |
| packet_key | 92% | ⚠️ Good |
| lineage_version | 90% | ⚠️ Good |
| som_cluster | 83% | ⚠️ Fair |
| community_id | 72% | ⚠️ Fair |

### Redis/Valkey State

| Key Pattern | Count | Status |
|-------------|-------|--------|
| gpu:karpathy:scores | 179 | ✅ Seeded |
| gpu:karpathy:encoded | 217 | ✅ Seeded |
| bifrost:* | 79 | ✅ Active cache |
| centroid:* | 0 | ⏳ Ready to populate |
| som:* | 0 | ⏳ Ready to populate |

---

## Critical Gaps (Must Fix Before Migrations)

### 1. file_path Coverage (0% in atlas_packets)
- **Impact**: File location data missing from canonical spine
- **Severity**: 🔴 CRITICAL
- **Action**: Backfill from filesystem traversal or ingestion source
- **Timeline**: Before any higher-hop enrichment

### 2. tree_node_id Coverage (0% in atlas_packets)
- **Impact**: Tree node linkage missing (needed for topology)
- **Severity**: 🔴 CRITICAL
- **Action**: Compute tree structure from source_ref hierarchies
- **Timeline**: Before Phase 2 migrations

### 3. som_cluster Column (missing from schema)
- **Impact**: SOM grid assignment not possible
- **Severity**: 🟡 HIGH
- **Action**: Add som_cluster integer column + populate via k-means
- **Timeline**: Phase 2

---

## Existing Optional Tables

| Table | Status | Used By |
|-------|--------|---------|
| atlas_tree_nodes | ✅ **EXISTS** | Topology indexing |
| atlas_svg_glyphs | ⏳ To create | Glyph rendering |
| atlas_topology_index | ⏳ To create | Higher-hop traversal |
| atlas_summary_layers | ⏳ To create | Semantic layers |
| atlas_feature_cards | ⏳ To create | Feature profiles |
| atlas_feature_edges | ⏳ To create | Feature relationships |
| atlas_dependency_edges | ⏳ To create | Code dependencies |
| atlas_qdrant_mirror | ⏳ To create | Postgres↔Qdrant sync |
| atlas_redis_mirror | ⏳ To create | Postgres↔Redis sync |

---

## Migration Order (Data-Driven)

Each step **MUST** measurably improve coverage vs baseline before next step.

### Phase 1: Fix Critical Gaps (Required)
```
1. Backfill file_path in atlas_packets
   - Migrate: Add file_path column (if missing)
   - Backfill: From packet source_ref or existing filenames
   - Gate: file_path coverage → 95%+ before proceeding
   - Verification: SELECT COUNT(*) FROM atlas_packets WHERE file_path IS NOT NULL

2. Backfill tree_node_id in atlas_packets
   - Build: Tree structure from source_ref hierarchies
   - Link: Each packet to nearest tree_node
   - Gate: tree_node_id coverage → 90%+ before proceeding
   - Verification: SELECT COUNT(*) FROM atlas_packets WHERE tree_node_id IS NOT NULL

3. Add som_cluster column to atlas_packets
   - Create: Integer column (nullable initially)
   - Compute: K-means on full embeddings (via separate GPU job)
   - Gate: som_cluster coverage → 85%+ before proceeding
```

### Phase 2: Optional Table Migrations (Additive)

**In recommended order** (each proven to improve some signal):

```
1. atlas_svg_glyphs
   - Purpose: Store SVG rendering metadata per packet
   - Depends on: file_path populated (Phase 1)
   - Validation: COUNT(*) ≈ 0.8 * atlas_packets rows

2. atlas_topology_index
   - Purpose: Pre-computed higher-hop neighbor lists
   - Depends on: tree_node_id populated (Phase 1)
   - Validation: COUNT(*) > atlas_packets rows (duplicates = multiple paths)

3. atlas_summary_layers
   - Purpose: Semantic hierarchical summaries
   - Depends on: summary column in atlas_packets (already 99.9%)
   - Validation: COUNT(*) ≈ atlas_packets rows

4. atlas_feature_cards
   - Purpose: Feature-level profile cards
   - Depends on: atlas_feature_map (already 19,611 rows)
   - Validation: COUNT(*) ≤ atlas_feature_map rows

5. atlas_feature_edges
   - Purpose: Feature→Feature relationships
   - Depends on: atlas_feature_cards populated
   - Validation: Edge count > 0

6. atlas_dependency_edges
   - Purpose: Code-level dependencies (imports, calls, etc.)
   - Depends on: source_ref and file_path (Phase 1)
   - Validation: Edge count > 0

7. atlas_qdrant_mirror
   - Purpose: Postgres copy of Qdrant payload (read-only)
   - Depends on: Nothing (independent)
   - Validation: COUNT(*) ≈ codebase_chunks_768 points

8. atlas_redis_mirror
   - Purpose: Postgres copy of Redis scores (read-only)
   - Depends on: gpu:karpathy:scores populated (currently 179)
   - Validation: COUNT(*) ≈ GPU score count
```

---

## Verification Gates (Per Migration)

Before each new table is considered "done":

1. **Coverage Gate**: Target table has expected row count
   - `SELECT COUNT(*) FROM <new_table>;` must show >0
   - Compare against baseline or related table

2. **Integrity Gate**: No null key columns (unless explicitly optional)
   - `SELECT COUNT(*) FROM <new_table> WHERE id IS NULL;` must be 0

3. **Baseline Comparison**: Measure improvement
   - Run health logger AFTER migration
   - Compare against baseline JSON report
   - Commit baseline + post-migration reports

4. **Performance Gate**: No new slow queries
   - Check query plans for new indexes
   - Verify <100ms for common access patterns

---

## How to Validate Each Migration

```bash
# 1. Run baseline BEFORE any migrations
npm run atlas:clustering:health

# 2. Make migration (add DDL file to drizzle/manual/)
# 3. Apply migration
drizzle-kit migrate

# 4. Run health logger AFTER migration
npm run atlas:clustering:health

# 5. Compare reports
diff docs/reports/atlas-clustering-health-before.json \
    docs/reports/atlas-clustering-health-after.json

# 6. Commit both reports + git tag migration
git add docs/reports/atlas-clustering-health*.json
git commit -m "Phase 2.X: <table_name> — improved <metric> from X% to Y%"
git tag migration/phase-2-x-<table_name>
```

---

## Timeline Estimate

| Phase | Task | Effort | Blocker |
|-------|------|--------|---------|
| **Phase 1a** | Backfill file_path | 30 min | YES |
| **Phase 1b** | Backfill tree_node_id | 1 hour | YES |
| **Phase 1c** | Add som_cluster column | 30 min | YES |
| **Phase 2.1** | atlas_svg_glyphs | 1 hour | No |
| **Phase 2.2** | atlas_topology_index | 1.5 hours | No |
| **Phase 2.3** | atlas_summary_layers | 1 hour | No |
| **Phase 2.4** | atlas_feature_cards | 45 min | No |
| **Phase 2.5-8** | Remaining tables | 3-4 hours | No |
| **Total** | Full plan | 8-10 hours | Phase 1 first |

---

## Baseline Reports Location

All baseline data saved to `docs/reports/`:

- **`atlas-clustering-health.json`** — Structured report (for programmatic comparison)
- **`atlas-clustering-health.md`** — Human-readable summary
- **`atlas-clustering-health-history.jsonl`** — Append-only audit trail (one JSON per run)

Each migration run should produce new reports for diff comparison.

---

## Key Rules

✅ **DO**:
- Run health logger before and after each migration
- Compare JSON reports to quantify improvement
- Commit baseline reports alongside code changes
- Use structured recommendations from logger output

❌ **DON'T**:
- Skip the baseline (this is the reference)
- Add DDL without health check before + after
- Claim "success" without metrics
- Migrate optional tables out of order (they may have dependencies)

---

## Next Immediate Action

1. **Archive this baseline**
   ```bash
   cp docs/reports/atlas-clustering-health.json \
      docs/reports/atlas-clustering-health.baseline-2026-06-14.json
   ```

2. **Start Phase 1: Fix Critical Gaps**
   - Backfill file_path in atlas_packets
   - Backfill tree_node_id in atlas_packets
   - Add som_cluster column

3. **Validate Phase 1**
   ```bash
   npm run atlas:clustering:health
   # Compare new report vs baseline
   ```

4. **Plan Phase 2 migrations** based on coverage improvements

---

**Baseline Established**: June 14, 2026  
**Ready for migrations**: ✅ YES  
**Data-driven approach**: ✅ ENABLED
