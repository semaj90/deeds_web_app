# OpenSpec multi-hop workboard run — 2026-09-27 17:18Z

The fresh projection covers **89 change boards and 9,891 checklist rows**:
6,516 checked, 3,375 open, 2,532 heuristically actionable, 787 waiting, and
54 historical/superseded. These are planning counts, not execution authority:
no controller snapshot was supplied and **zero tasks were scheduler-selected**.
ETA remains unknown.

## Pivot recorded

This run pivots from the focused `parent-atlas-repair-candidate-feature-matrix`
content-policy slice back to the portfolio's corpus/index chain in
`parent-atlas-candidate-feature-execution-fabric`. The purpose is to keep the
large-corpus objective moving across owners instead of equating progress on one
gate with completion of the end-to-end pipeline.

## Fresh corpus evidence

The streamed re-census completed with zero malformed rows and no datastore,
model, or Graphify calls. Both input checksums match the prior census:

- `.tmp/mapreduce-full-v5.ndjson`: 5,000 metadata rows; it has `stableKey`,
  `filePath`, and `contentHash`, but no packet/source/workspace revisions or
  summaries.
- `sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson`: 76,261
  768-dimensional vectors and 61,738 distinct `source_ref` values, including
  14,503 duplicate rows; packet/source/workspace revisions and summaries are
  absent.

Neither export is canonical-enrichment-ready. Existing exact packet/chunk
crosswalk receipts remain the identity authority; this census does not
reinterpret export IDs or ordinals.

## Next dependency, not a live claim

`CONTENT-POLICY-01A` is now code/contract tested. `CONTENT-POLICY-01B` remains
unproven: local `:8081` is unreachable, and `:8097` does not currently expose
the immutable encoder/tokenizer/runtime identity needed for a strict receipt.
The scoped 1,520-row feature snapshot remains blocked on immutable
representation provenance and absent canonical summaries. The next code-only
owner is the existing Go embedding service; service/container deployment and
the live canary remain deferred until code and tests are ready.

Detailed projections and receipts:

- [Timestamped workboard projection](openspec-workboard-projection-run-20260927T1715Z.md)
- [Large-corpus census](large-corpus-enrichment-census-v2-20260927T1718Z.json)
- [Current feature-matrix tasks](../../openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md)
- [Current candidate-feature execution tasks](../../openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md)
