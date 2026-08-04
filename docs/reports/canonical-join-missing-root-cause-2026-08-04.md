# canonical_join_missing Root Cause — RUNTIME_PROVEN

**Status**: FIXED | **Date**: 2026-08-04 | **Session**: 188D

## Case record

| Field | Value |
|---|---|
| source_ref | `src/lib/server/__tests__/cache-smoke.test.ts` |
| packetKey / candidateKey | `0e832006-6108-4025-8186-ee4a48cc37cc` |
| Postgres row | **EXISTS** — `codebase_chunk_index.id = 0e832006-...`, `source_ref` matches exactly |
| Qdrant point | not queried (irrelevant — this is a Postgres-only hydration path) |
| Expected canonical relation | `id::text` or `metadata->>'packet_key'` exact match |
| Which join predicate failed | Neither predicate is wrong — the row was **excluded by the query's `LIMIT`** before Postgres could return it |

## CANONICAL_JOIN_MISSING_CAUSE: **WRONG_JOIN_FIELD** (query-shape defect, not identity defect)

The row was never orphaned, stale, filtered, or missing. The hydration SQL used `WHERE (chunk.source_ref IN (...) OR packet_key IN (...)) LIMIT N` with **no `ORDER BY`**. `source_ref` is not unique — `codebase_chunk_index` carries up to **369 duplicate rows for a single source_ref** (`src/lib/server/db/schema-postgres.ts`, from repeated re-indexing without cleanup). When a batch's other candidates hit a heavily-duplicated file, those duplicates consume the small `LIMIT` budget (`candidates.length + 10`) before Postgres — with no deterministic ordering — happens to return the specific row this candidate needed. This is silent and non-deterministic: the same candidate can hydrate successfully or fail depending on which other candidates share the batch.

## Duplicate magnitude (informational, not remediated here)

```
src/lib/server/db/schema-postgres.ts             369 rows
src/lib/server/ai/gemma4-agent.ts                270 rows
src/routes/api/evidence/upload/+server.ts        245 rows
src/lib/server/gpu/libtorch-bridge.ts            159 rows
```
Root cause of the duplication itself is out of scope for this fix (indexing pipeline hygiene — separate lane).

## Fix applied

Split the single OR'd query into two deterministic, bounded queries:
1. **Exact identity match** (`id::text` or `metadata/output_meta packet_key` IN the candidate id list) — bounded by the count of distinct requested identities; a primary key can never be starved by duplicates.
2. **`source_ref` fallback** using `DISTINCT ON (source_ref) ... ORDER BY source_ref, updated_at DESC` — returns exactly one deterministic row per distinct source_ref (the most recently updated), regardless of how many duplicates exist.

Results merged, deduped by row id, in favor of the exact match. `sql.join()` used instead of template-array interpolation (Drizzle's `sql\`ANY(${array})\`` expands to a positional-parameter tuple, not an array literal — caught and fixed in the same pass, see commit).

## Verification

- 8 consecutive live requests: 0 `canonical_join_missing` occurrences (previously observed intermittently)
- `search-unified?q=test&topK=3` still returns packets (170 retrieved → 163 scored → 3 reranked → 1 post-processed → 1 packet)
- tsgo: 0 errors; touched suites 14/14 pass

## Not yet resolved (separate lane)

- Why `codebase_chunk_index` has hundreds of duplicate rows per file (indexing pipeline dedup)
- `packet_key` grain/derivation (task in progress)
