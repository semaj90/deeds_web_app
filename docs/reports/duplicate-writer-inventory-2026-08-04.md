# codebase_chunk_index Duplicate-Writer Inventory (PARTIAL — leading hypothesis, not fully proven)
**Status**: LEADING_HYPOTHESIS | **Date**: 2026-08-04 | **Session**: 188G

## Real writers found (grounded, via `rg`, not inferred)

| File | Dedup key | Idempotent by itself? |
|---|---|---|
| `src/routes/api/codebase-index/index-stream/+server.ts:126` | `ON CONFLICT (qdrant_id) DO UPDATE` | Yes, if `qdrant_id` stable |
| `scripts/batch-upsert-codeintel.mjs:53` | `ON CONFLICT (qdrant_id) DO UPDATE` | Yes, if `qdrant_id` stable |
| `scripts/mirror-qdrant-to-postgres.ts:184` | `ON CONFLICT (qdrant_id) ...` (truncated in this pass) | Presumed yes |
| `scripts/kb/run-embedding-jobs.mjs:199` | `onConflictDoNothing({ target: qdrantId })` | Yes, if `qdrant_id` stable |

**All four writers key their conflict resolution on `qdrant_id`.** None of them are individually buggy — each correctly no-ops or updates on a repeat `qdrant_id`. This redirects the investigation: the duplication isn't in these four INSERT statements, it's in whatever assigns `qdrant_id`/`chunk_id` upstream of them.

## Leading hypothesis (found, not yet traced end-to-end)

`scripts/atlas/backfill-unified-id-hierarchy.mjs:64` — `chunk_id: randomUUID()`, generated fresh with no derivation from `source_ref`/`content_hash`/span. If this (or similar logic) runs on every re-index pass, the same logical chunk gets a new identity every time, which cascades into "new" rows for all four `ON CONFLICT (qdrant_id)` writers simultaneously — consistent with the observed up-to-369-duplicates-per-file pattern (~369 historical re-index passes touching that file, not necessarily 369 bugs).

**Not yet proven**: I have not traced `backfill-unified-id-hierarchy.mjs` into an actual cron/pipeline trigger, confirmed it's the specific writer that produced the 369 duplicates on `schema-postgres.ts`, or ruled out other id-generation sites. This is the strongest lead found this pass, not a closed case.

## Next steps (not done this pass — stopped for context budget)

1. Trace `backfill-unified-id-hierarchy.mjs` call sites — is it wired into `npm run graphify:*` or a cron task?
2. Confirm/deny: does its `randomUUID()` chunk_id flow into the `qdrant_id` used by the four writers above, or is it a separate identity lane?
3. True-duplicate classification per the user's spec: same `source_ref` + `source_revision` + span + `chunker_revision` + `content_hash` = true duplicate; anything differing on span/revision = legitimate distinct chunk, not a bug.
4. Content-hash completeness: row-level (not just percentage) comparison of Qdrant-missing-hash IDs vs Postgres-missing-hash IDs — intersection/union, not just matching percentages.

## Deferred this pass (per user's ordered list, not started)

- Qdrant ANN recall vs cuVS exact oracle (Lane B GPU task — ready, not run)
- CAGRA benchmark
- Manifest sharding + snapshot-stability metadata
- Packet-key derivation pure function + test suite
- LDR MCP attach via TRACE/OpenCode
