# Bitfrost Semantic Cache Audit

Generated: 2026-08-27T17:41:01.467Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 1
- gpu:karpathy:encoded: 0
- bifrost keys: 0
- centroid keys: 0
- som keys: 0

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 1 | gpu:karpathy:scores | gpu:karpathy:scores:455759 |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 0 | none | none |
| `centroid:*` | 0 | none | none |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 0 | none | none |
| `bifrost:sem:feature:*` | 0 | none | none |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
