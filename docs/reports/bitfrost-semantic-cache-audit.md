# Bitfrost Semantic Cache Audit

Generated: 2026-07-14T16:13:26.136Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 140
- centroid keys: 66
- som keys: 0

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 140 | bifrost:summary:summary:69a4728a49940ebe, bifrost:summary:summary:f4b2a3dc8df030f8, bifrost:summary:summary:1fe26c21f0cfda8a, bifrost:summary:summary:372601efabd34eab, bifrost:sem:feature:sveltekit-frontend.prefilter.types | bifrost:summary:summary:69a4728a49940ebe:532650, bifrost:summary:summary:f4b2a3dc8df030f8:532651, bifrost:summary:summary:1fe26c21f0cfda8a:532670, bifrost:summary:summary:372601efabd34eab:532670, bifrost:sem:feature:sveltekit-frontend.prefilter.types:532662 |
| `centroid:*` | 66 | centroid:kmeans:31, centroid:kmeans:1, centroid:kmeans:25, centroid:kmeans:33, centroid:kmeans:41 | centroid:kmeans:31:42675, centroid:kmeans:1:42675, centroid:kmeans:25:42675, centroid:kmeans:33:42675, centroid:kmeans:41:42675 |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 0 | none | none |
| `bifrost:sem:feature:*` | 40 | bifrost:sem:feature:sveltekit-frontend.prefilter.types, bifrost:sem:feature:sveltekit-frontend.relationship_map, bifrost:sem:feature:llama-cpp-turboquant-gemma4.fattn-vec-instance-q4_0-f16, bifrost:sem:feature:sveltekit-frontend.graph_nodes, bifrost:sem:feature:sveltekit-frontend.20260601_research_summaries_source_refs_backfill | bifrost:sem:feature:sveltekit-frontend.prefilter.types:532661, bifrost:sem:feature:sveltekit-frontend.relationship_map:532673, bifrost:sem:feature:llama-cpp-turboquant-gemma4.fattn-vec-instance-q4_0-f16:532660, bifrost:sem:feature:sveltekit-frontend.graph_nodes:532677, bifrost:sem:feature:sveltekit-frontend.20260601_research_summaries_source_refs_backfill:532675 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 100 | ace:summary:summary:3ffcb2db93a1b932, ace:summary:summary:b948ec52fe38a0c2, ace:summary:summary:29f9da7e53884e0d, ace:summary:summary:84ad0b303222653b, ace:summary:summary:342a13fc935ff793 | ace:summary:summary:3ffcb2db93a1b932:532649, ace:summary:summary:b948ec52fe38a0c2:532672, ace:summary:summary:29f9da7e53884e0d:532660, ace:summary:summary:84ad0b303222653b:532669, ace:summary:summary:342a13fc935ff793:532643 |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
