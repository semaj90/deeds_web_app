# Qdrant/Postgres Mismatch — Root Cause Analysis

**Generated**: 2026-06-14T04:05:00Z  
**Status**: ❌ BLOCKER — Do NOT start higher-hop enrichment

## Executive Summary

The 0/50 agreement between Qdrant and Postgres is **NOT** a schema or comparator mismatch. It's a **data coverage gap**:

- **Qdrant codebase_chunks_768**: 54,898 points
- **Postgres atlas_packets**: 17,476 rows (only 8,823 with source_ref)
- **Sampled Qdrant points**: 50/50 have NO match in Postgres

## Root Cause

**Qdrant was enriched from a parallel pipeline** (likely the pre-Phase-3I MapReduce feature-map lane) and never backfilled into Postgres. The reconciliation script (3,027 patches) only synchronized a small subset of Postgres rows back to Qdrant, but the majority of Qdrant points remain isolated from the Postgres source of truth.

## Evidence

**Sample points from Qdrant that don't exist in Postgres**:
1. `src/routes/api/research/concurrent-deep/stream/+server.ts` (feature_id: routes, community_id: 2)
2. `src/routes/api/recommendations/+server.ts` (feature_id: routes, community_id: 6)
3. `src/lib/server/ai/contextual-tools.ts` (feature_id: ai, community_id: community:1305)
4. `src/lib/server/gpu/libtorch-bridge.ts` (feature_id: utility, packet_key: present, community_id: 3)
5. All 50 sampled points follow the same pattern: **NOT FOUND in atlas_packets**

**Postgres coverage**:
```sql
SELECT COUNT(*) as total, COUNT(DISTINCT source_ref) as unique_source_refs 
FROM atlas_packets 
WHERE source_ref IS NOT NULL;
-- Result: 8823 rows with source_ref out of 17476 total
```

## Implications

**Do NOT proceed with higher-hop enrichment** until this is resolved:

1. **Data Loss Risk**: Writing higher-hop fields (somCluster, glyphRecord, qdrantHit, etc.) to Qdrant points that don't exist in Postgres creates orphaned enrichment with no audit trail.

2. **Identity Mismatch**: The Qdrant points use a different community_id scheme (`community:1305` vs integer `1305`), suggesting they came from a different source pipeline.

3. **Source of Truth Violation**: Postgres is the canonical ledger. Enriching Qdrant without ensuring Postgres has the source record violates the single-source-of-truth principle.

## Repair Strategy

**Option A: Back-sync Qdrant → Postgres** (Safe, recommended)
- Write script to insert missing Qdrant source_refs into Postgres
- Use Qdrant payload fields as source
- Requires validation that the backfill doesn't conflict with Phase 3I packets

**Option B: Prune Qdrant** (Destructive)
- Delete Qdrant points without Postgres rows
- Risk: Lose work from the parallel enrichment pipeline
- Not recommended without understanding why the parallel pipeline existed

**Option C: Reconcile & Gate** (Hybrid)
- Identify which Qdrant points are "legacy" (pre-Phase-3I) vs "current" (Phase 3I+)
- Only enrich current points
- Keep legacy points for reference (read-only)

## Recommended Next Action

**Do NOT run**:
- `npm run atlas:qdrant:payload:verify`
- Higher-hop enrichment scripts
- Any Qdrant mutation

**Do run** (investigation):
1. Determine the source of the 54,898 Qdrant points (which pipeline populated them)
2. Audit whether the 46,075 "orphaned" points overlap with the 17,476 Phase-3I Postgres packets
3. Decide on back-sync strategy (Option A, B, or C)
4. Update Postgres schema if needed for the source_ref fields

## Deferred Decision

This is **not a schema issue**—it's a **data pipeline alignment issue**. The comparator contracts in both scripts are correct; the data simply doesn't overlap as expected.

---

**Blockers**:
- ❌ Higher-hop enrichment (somCluster, glyphRecord, qdrantHit, redisHotKey, neo4jNode)
- ❌ Karpathy re-indexing (would index orphaned points)
- ❌ Neo4j topology edges (would reference non-existent Postgres rows)

**Safe to do**:
- ✓ Continue Phase 3I backfill (Postgres → Qdrant sync for existing packets)
- ✓ Continue Phase 4A retrieval ranking (use existing Postgres/Qdrant overlap)
- ✓ Investigate data pipeline sources
