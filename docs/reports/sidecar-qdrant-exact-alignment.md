# Sidecar–Qdrant exact-store alignment (2026-08-21)

**Status: ALIGNED** — proves the live `python/atlas_rapids_sidecar.py` (`:8098`) HTTP
service boundary agrees with Qdrant's own exact search on a real, live, same-corpus
sample. Closes the "same-corpus Qdrant oracle comparison" item on the GPU/RAPIDS
sidecar workstation track.

## What this proves (and doesn't)

Proves: the sidecar's `/v1/knn/exact` endpoint — the actual HTTP request/response
contract a real TypeScript caller would hit — produces the same nearest-neighbor
rankings as Qdrant's own `exact: true` full-scan search, when both are given the
same corpus subset. This is distinct from `compare_pytorch_and_qdrant_exact` in
`python/atlas_compute/qdrant_exact_alignment.py`, which proves the cuVS *algorithm*
(run in-process) agrees with Qdrant — this proof instead validates the *service
boundary* the sidecar actually exposes.

Does not prove: CAGRA (ANN) recall, production-scale corpus alignment beyond the
200-row sample, or anything about the `semantic_512` canonical persisted lane —
`codebase_chunks_768_v2` is the separate general codebase corpus (see
`openspec/changes/parent-atlas-semantic-512-canonicalization/tasks.md` for why
these are legitimately distinct representations).

## Method

- `python/atlas_compute/qdrant_exact_alignment.py::compare_sidecar_and_qdrant_exact()`
  (new function, added alongside the existing `compare_pytorch_and_qdrant_exact`,
  reusing its Qdrant-query helper).
- Fetched 200 real points (vector + `postgres_id` identity) live from the running
  `codebase_chunks_768_v2` Qdrant collection (`content` named vector, 768-dim).
- For 20 of those rows used as queries: self-excluded, sent the remaining 199-row
  corpus inline to the sidecar's `POST /v1/knn/exact` (k=10), and queried Qdrant's
  own `exact: true` search filtered (`must: match.any`) to that identical 199-row
  subset — otherwise Qdrant would search its full 52,380-point collection while
  the sidecar only saw the small sample, an unfair comparison.
- Compared the two top-10 rankings per query via set-overlap and a stable checksum
  of the full ranking list.

## Result

Two independent runs, both fully deterministic:

```json
{
  "status": "ALIGNED",
  "mean_overlap_at_k": 1.0,
  "minimum_query_overlap_at_k": 1.0,
  "query_count": 20,
  "corpus_sample_rows": 200,
  "k": 10,
  "sidecar_result_checksum": "950afcc47630c58ef69840b470652a9b86c259f134287f39201afe9689a027c7",
  "qdrant_result_checksum": "950afcc47630c58ef69840b470652a9b86c259f134287f39201afe9689a027c7"
}
```

Rankings were byte-identical (not merely overlapping) across all 20 queries, both
runs. Latency: sidecar ~173–191ms mean (rebuilds a fresh GPU brute-force index per
call — no persistent server-side index, by design), Qdrant ~4–26ms mean (native
local exact search). This is expected overhead for the sidecar's documented use
case (large-batch prefilter/offline benchmarking, not a per-query interactive
hot path — see the policy comment atop `cuvs-sidecar-client.ts`).

Full receipt: `docs/reports/sidecar-qdrant-exact-alignment.json`.
