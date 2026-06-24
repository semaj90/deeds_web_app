# Store Parity Verification Checkpoint
**Date**: 2026-06-24  
**Status**: 🔴 CRITICAL GAPS IDENTIFIED

## Executive Summary

Built a **store parity verification framework** to measure actual sync state across 4 mirrors (Postgres, Qdrant, Neo4j, Redis). Results show:

- ✅ **Postgres→Redis**: 100% sync (17,995/17,995 packets cached in 9.2s)
- ✅ **Postgres canonical**: 17,995 packets, 99.99% have qdrant_point_id
- ⚠️ **Neo4j mirror**: 49% coverage (8,804/17,995 nodes)
- 🔴 **Qdrant mirror**: 0% coverage (0/17,995 — write failures)

## Verified Scripts

### `npm run atlas:verify:store-parity`
Multi-store health audit. Output:
```json
{
  "pg_total": 17995,
  "qdrant_total": 0,
  "neo4j_total": 8804,
  "redis_bifrost_packets": 17995,
  "coverage_percent": {
    "qdrant": 0.0,
    "neo4j": 48.9,
    "redis": 100.0
  },
  "gaps": {
    "qdrant_missing": 17995,
    "neo4j_missing": 9191,
    "redis_missing": 0
  }
}
```

### `npm run atlas:backfill:redis-cache`
Syncs all Postgres packets to Redis/BitFrost cache (minimal: packet_key, feature_id, source_ref, qdrant_point_id).
- Tested: ✅ 5,000 packets in 2.7s
- Full run: ✅ 17,995 packets in 9.2s

### `npm run atlas:fix:qdrant-named-vectors`
Attempts to repair Qdrant named vector upsert (Stage 2 failure).
- Status: 🔴 **BLOCKED** — collection does not support named_vectors API
- Error: `upsertPoints is not a function` (correct method is `scroll`/`overwritePayload`)
- Root cause: Collection was created without named_vectors config; Qdrant client doesn't support dynamic schema extension

## What Was Claimed vs. Verified

| Claim | Status | Evidence |
|---|---|---|
| GPU active | ✅ | tensorrt_bridge.node loads, CUDA detected |
| 100× speedup | ❌ | GPU active ≠ 100× faster (not benchmarked) |
| Stage 2 embeddings synced | ❌ | 587 pgvector rows, 0 Qdrant writes |
| Redis cache helping | ❌ | Redis:0/17995 before backfill, now 100% |
| End-to-end pipeline | ❌ | Only Stages 1–3 partially functional |

## Critical Failures

### 1. Qdrant Named Vector Upsert (Stage 2)
- **Symptom**: Stage 2 reported "0 Qdrant writes despite pgvector success"
- **Root cause**: Collection `codebase_chunks_768` created without `named_vectors` config
- **Impact**: Cannot use Qdrant as primary retrieval vector store
- **Options**:
  1. Recreate collection with named_vectors (loses 52K existing points)
  2. Use default vector field + payload only (loses named-vector separation)
  3. Accept Qdrant is write-failed mirror, rely on Postgres→Redis→Neo4j

### 2. Neo4j Partial Coverage
- **8,804/17,995 Packet nodes** (49%)
- **0/8,804 have qdrant_id property** (0%)
- **Suggests**: Neo4j sync script never ran OR only partial schema migrated

### 3. Redis Was Cache-Starved
- **Before backfill**: 61 keys (0.3%)
- **After backfill**: 17,995 keys (100%)
- **Lesson**: "Redis helping" required explicit backfill; passive writes failed

## Priority Fix Order

1. **Verify Neo4j Packet node count** — why only 49%?
   ```cypher
   MATCH (p:Packet) RETURN count(p), 
     sum(CASE WHEN p.qdrant_id IS NOT NULL THEN 1 ELSE 0 END) as withId
   ```

2. **Decide on Qdrant strategy** — named vectors vs. default vector + payload

3. **Backfill missing Neo4j Packet nodes** if schema is correct

4. **Measure actual retrieval latency** before claiming "100× speedup"

5. **Document mirror sync contract** — which writes go where, SLA for consistency

## Database Schema Additions

Created:
- `atlas_identity_ledger` — Tracks which stores have indexed each packet (not yet populated)

Scripts created:
- `verify-store-parity.mjs` — Multi-store health check
- `backfill-redis-cache-from-postgres.mjs` — Postgres→Redis sync
- `fix-qdrant-named-vectors.mjs` — Qdrant repair attempt

## Recommendations for Next Session

**Do NOT build LangGraph supervisor until parity gates pass.**

Priority order:
1. Fix Neo4j coverage (or document why it's only 49%)
2. Decide Qdrant strategy (named vectors vs. default vector)
3. Run `npm run atlas:verify:store-parity` weekly — this is your source of truth
4. Add parity checks to CI/CD pre-deployment gate
5. Then build orchestration on top of verified mirrors

## Test Commands

```bash
# Verify all stores
npm run atlas:verify:store-parity

# Verify single store
npm run atlas:verify:store-parity:qdrant
npm run atlas:verify:store-parity:neo4j
npm run atlas:verify:store-parity:redis

# Backfill Redis (dry-run)
npm run atlas:backfill:redis-cache:dry

# Backfill Redis (apply)
npm run atlas:backfill:redis-cache

# Attempt Qdrant fix (dry-run)
npm run atlas:fix:qdrant-named-vectors:dry

# Attempt Qdrant fix (apply)
npm run atlas:fix:qdrant-named-vectors
```

## Report Location
`docs/reports/store-parity-verification.json` — Updated on each run
