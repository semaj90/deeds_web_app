# Topology + Admin Thoughts

Timestamp: `2026-05-08 23:30:42`

## Current priority

- Fix topology retrieval semantics before adding more agent features.
- Keep `:8090` reserved for TurboQuant / llama-server generation.
- Keep rerank on a separate URL and degrade cleanly when unavailable.

## Retrieval rules

- `768d embedding` -> semantic anchor / semantic rerank inputs
- `som_bmu_row` / `som_bmu_col` -> SOM neighborhood expansion
- `manifold4` -> topology metadata, 4D proximity, visualization
- `PageRank` / `risk` -> tie-break and explanation
- `search.rerank` -> optional final precision layer

## Known blocker

- `embedded_summaries` currently does not expose a 768d embedding column in Postgres.
- That means direct `query_embedding <=> embedded_summaries.embedding` cannot be done there yet.
- Current repair path uses semantic anchoring from the existing semantic lane / topology sidecar and treats `manifold4` as metadata only.

## Admin chat notes

- Restored the admin chat files instead of deleting them.
- They are not the focus of this pass, but they are preserved so they can be edited later.

## Next topology follow-ups

- Add explicit BMU coverage / manifold4 coverage reporting.
- Add `topology.recompute_manifold` hydration/backfill path.
- If a true reranker service is introduced, point `RERANK_BASE_URL` to it.
