# Layered Knowledge Model Review Todo

Generated: 2026-07-21

## What Is Already Aligned

- `packet-canonical.ts` already separates identity, extraction payload, embedding, topology, semantic labels, fan-out, validation, and summary.
- `vector-contracts.ts` already separates canonical semantic embedding, topology embedding, latent routing vectors, and legacy Qdrant vector names.
- `retrieval-semantics.ts` already separates the 768 source embedding from the 384 retrieval projection and marks the projection as non-canonical.
- `kag-cluster-source.ts` already treats SOM clusters as read-side navigation objects, not as ontology truth.

## What Still Needs Review

1. Legacy vector lanes still carry old sizes and names in a few search and bootstrap files.
2. SOM/K-means/HNSW are still sometimes described in comments as if they were semantic labels instead of routing structures.
3. A few runtime helpers still mix canonical meaning with derived navigation metadata in the same payload.
4. Some older scripts still assume 768 or 1536 without a named contract at the call site.

## Finish-Review To-Do

- Audit remaining `768` and `1536` defaults in server-side retrieval/bootstrap code.
- Keep the canonical knowledge model distinct from derived navigation.
- Ensure SOM cells, K-means clusters, and HNSW neighborhoods are only used as evidence or routing priors.
- Keep taxonomy, glossary, ontology, and curated wiki content as the canonical meaning layer.
- Review graph/PageRank lanes separately from retrieval-vector lanes.
- Re-run the dimension-contract sweep after any remaining legacy fallback is removed.

## Current Conclusion

The layered knowledge model is conceptually aligned in the repo, but the review is not finished until the remaining legacy dimension defaults and mixed-lane comments are cleaned up.

