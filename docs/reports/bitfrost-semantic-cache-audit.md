# Bitfrost Semantic Cache Audit

Generated: 2026-08-24T21:50:57.986Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 46
- centroid keys: 66
- som keys: 0

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 46 | bifrost:sem:packet:175066b8a4ceee3c, bifrost:sem:packet:packet:0011712c94d1, bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z, bifrost:sem:packet:packet:0004b466d863 | bifrost:sem:packet:175066b8a4ceee3c:19064, bifrost:sem:packet:packet:0011712c94d1:19109, bifrost:sem:feature:.tmp.0056213574662f41:19085, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z:19089, bifrost:sem:packet:packet:0004b466d863:19075 |
| `centroid:*` | 66 | centroid:kmeans:17, centroid:kmeans:20, centroid:kmeans:23, centroid:kmeans:meta, centroid:kmeans:34 | centroid:kmeans:17:19113, centroid:kmeans:20:19114, centroid:kmeans:23:19114, centroid:kmeans:meta:19119, centroid:kmeans:34:19115 |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 25 | bifrost:sem:packet:175066b8a4ceee3c, bifrost:sem:packet:packet:0011712c94d1, bifrost:sem:packet:packet:0004b466d863, bifrost:sem:packet:packet:000f704e5207, bifrost:sem:packet:0ee918abc8c53e8d | bifrost:sem:packet:175066b8a4ceee3c:19061, bifrost:sem:packet:packet:0011712c94d1:19106, bifrost:sem:packet:packet:0004b466d863:19073, bifrost:sem:packet:packet:000f704e5207:19100, bifrost:sem:packet:0ee918abc8c53e8d:19055 |
| `bifrost:sem:feature:*` | 21 | bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z, bifrost:sem:feature:simd-bridge.LLMS, bifrost:sem:feature:neschrom97.93f973562fff24ed, bifrost:sem:feature:sveltekit-frontend.keyboard-shortcuts.svelte | bifrost:sem:feature:.tmp.0056213574662f41:19081, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z:19086, bifrost:sem:feature:simd-bridge.LLMS:19097, bifrost:sem:feature:neschrom97.93f973562fff24ed:19069, bifrost:sem:feature:sveltekit-frontend.keyboard-shortcuts.svelte:19090 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 6 | ace:feature:ACE-MATERIALIZATION-BLOCKER-1-FIXED, ace:feature:claude, ace:feature:AGENTIC-WORKFLOW-PLAN-SUMMARY, ace:feature:ACE-TO-RETRIEVAL-COMPLETION-AUDIT, ace:feature:ATLAS-STATUS-RECONCILIATION | ace:feature:ACE-MATERIALIZATION-BLOCKER-1-FIXED:507151, ace:feature:claude:507144, ace:feature:AGENTIC-WORKFLOW-PLAN-SUMMARY:507146, ace:feature:ACE-TO-RETRIEVAL-COMPLETION-AUDIT:507106, ace:feature:ATLAS-STATUS-RECONCILIATION:507148 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
