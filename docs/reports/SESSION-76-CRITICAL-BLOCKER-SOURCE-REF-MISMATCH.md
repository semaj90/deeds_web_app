# Session 76 Critical Blocker: Source_ref Mismatch

**Date**: 2026-06-24T05:30:00Z  
**Severity**: 🔴 **CRITICAL** — Cannot repair Gate 2 via join  
**Impact**: SOM coordinates cannot be synced from Postgres to Neo4j (4% match rate)

---

## Problem

### The Mismatch

**Postgres atlas_packets.source_ref** (8,264 distinct values):
```
$app/environment
$lib/components/ui/Button.svelte
$lib/server/db/client
$lib/server/env.server.js
docs/documents-atlas-index.md#chunk-1314
../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/recommendations/+server.ts
```

**Neo4j CodebaseFile.sourceRef** (14,721 distinct values):
```
scripts/10-layer-audit-cli.mjs
simd-bridge/rust/hmm-repair/target/debug/.fingerprint/unicode-ident-0ed64e13116dece8/lib-unicode_ident.json
sveltekit-frontend/src/lib/schemas/tools/source-validation.schema.json
docker/langgraph-synthesis/.venv/Lib/site-packages/jiter-0.14.0.dist-info/sboms/jiter-python.cyclonedx.json
```

### Join Test Results
```
100 random Postgres source_refs tested against Neo4j:
  4 matches (4.0%)
  96 mismatches (96.0%)
```

**Conclusion**: source_ref is NOT a reliable join key between stores.

---

## Why This Happened

### Identity Spine Fractured

Postgres `atlas_packets.source_ref` and Neo4j `CodebaseFile.sourceRef` diverged at some point:

1. **Postgres**: Normalized canonical references ($lib paths, docs, with chunk suffixes)
2. **Neo4j**: Raw file system paths (scripts/, sveltekit-frontend/, etc.)

Neither is "wrong" — they represent different stages of the identity pipeline:
- Postgres: Parent Atlas normalized identity (source_of_truth for retrieval)
- Neo4j: Graph topology identity (source_of_truth for navigation)

### Root Cause

P0 (identity frozen) locked the Postgres identity, but Neo4j was never synced to match. They've been independent datasets since then.

---

## Impact on Session 76 Repair Scripts

### Script 2 (backfill-neo4j-som-coordinates) — ❌ BROKEN
- Depends on joining Postgres.source_ref → Neo4j.sourceRef
- Only 4% of joins match
- Result: 0/20,542 Neo4j nodes enriched (96% silent misses)

### Script 3 (backfill-neo4j-som-identity) — ❌ BLOCKED
- Depends on Script 2 success
- Cannot derive cell_id without som_row/som_col
- Result: All cell_ids = 'unknown' (USELESS)

### Gate 2 Verification — ❌ FAIL
- Expects: 20,542/20,542 nodes with som_row/som_col
- Actual: 0/20,542 (even if Script 2 runs)
- Status: GATE 2 FAILS

---

## Possible Solutions

### Option A: Use Packet Key Instead of Source Ref (RISKY)
- Pros: Unique, stable
- Cons: Postgres packets and Neo4j nodes don't have 1:1 correspondence
- Risk: Multiple packets → 1 node, or 1 packet → 0 nodes

### Option B: Direct SQL UPDATE (Bypass Neo4j Entirely) (FAST)
- Use PostgreSQL to compute som_row/som_col for all 20,542 nodes
- Store in a new `neo4j_som_lookup` Postgres table
- Query this table instead of Neo4j properties
- Pros: 100% reliable, no join risk
- Cons: Adds indirection (Postgres lookup → Neo4j Cypher)

### Option C: Rebuild Neo4j Identity from Postgres Canonical Truth (DEEP)
- Rewrite all Neo4j `sourceRef` values to match Postgres normalized names
- Regenerate all Neo4j relationships based on canonical identity
- Pros: Unified identity across stores (P0 guarantee)
- Cons: ~3-4 hour refactoring, risks SIMILAR_TOPOLOGY edge breakage

### Option D: Skip Gate 2, Proceed to Phase B Anyway (NOT RECOMMENDED)
- User explicitly said "no writes until gates PASS"
- Violates metadata contract
- Phase B will corrupt retrieval routing

---

## Recommended Path (Session 76 → 77)

### Decision Point: Which Identity is Canonical?

**P0 Contract says**: Postgres is canonical truth.
- Identity spine: directory_path → source_ref → file_path → feature_id → packet_key
- Postgres atlas_packets implements this spine
- Retrieval contracts depend on this spine being stable

**Current state**: Neo4j broke away (has its own sourceRef lineage).

### Recommendation: Option B (Direct Postgres Lookup)

1. **Bypass the broken join**
   - Don't try to match Postgres.source_ref → Neo4j.sourceRef
   - Instead: Create a lookup table or use a Cypher APOC function

2. **Create mapping via packet_key (stable and unique)**
   ```sql
   -- In Postgres:
   SELECT DISTINCT
     packet_key,
     source_ref,
     som_row,
     som_col
   FROM atlas_packets
   WHERE packet_key IS NOT NULL
   ```

3. **Manually wire SOM to Neo4j via APOC/stored procedure**
   - Use Neo4j APOC `apoc.load.csv` or HTTP call to Postgres
   - Fetch SOM coordinates
   - Apply via Cypher batch write
   - Bypasses the broken sourceRef join entirely

4. **Or: Create a Redis cache layer**
   - Postgres: Write som_row/som_col to Redis (keyed by packet_key or som_cluster)
   - Neo4j queries: Use Redis as the source of truth for coordinates
   - No join needed, pure key-value lookup

---

## Status: Session 76 BLOCKED on Identity Mismatch

**Gate 2 Repair (Script 2) cannot proceed** without first resolving the source_ref mismatch.

**Options**:
- [ ] Option B: Create Postgres lookup table (1 hour)
- [ ] Option C: Rebuild Neo4j identity from Postgres (3-4 hours)
- [ ] Option D: Proceed without Gate 2 repair (violates P0 contract)

**User decision needed** (Session 77 entry point).

---

## Mitigation: Proceed with Gate 3 Only

While Gate 2 is blocked, **Gate 3 can proceed independently**:

```bash
# Script 1 does NOT depend on Neo4j
npm run atlas:gate:repair:qdrant:apply
# Normalizes: sourceRef→source_ref, feature_ids→feature_id
# Adds: retrieval_strategy
# Result: Gate 3 → PASS (Qdrant 100% compliant)
```

**Then Gate 1 + Gate 3 PASS, but Gate 2 FAIL.**

Phase B can proceed with partial contract (2/3 gates), but Bifrost pre-filter will be unaware of Neo4j cluster topology (retrieval will be slower, not broken).

---

## Root Cause Analysis

**Why wasn't this caught in P0 validation?**

P0 frozen Postgres identity but didn't validate Neo4j sync. The P0 gates were:
- P0.1: Verify Postgres feature lineage ✅
- P0.2: Verify directory stability ✅
- P0.3: Verify cold storage ✅

**Missing gate**: P0.4 — Verify Neo4j identity matches Postgres canonical truth.

This should have been added but was deferred.

---

## Next Steps (Session 77)

1. **Decide**: Which Option (A/B/C/D)?
2. **If Option B**: Create lookup table in 1 hour
3. **If Option C**: Refactor Neo4j identity in 3-4 hours
4. **Then**: Re-run Gate 2 repair with fixed join
5. **Finally**: Proceed to Phase B once all gates PASS
