# Bitfrost Semantic Cache Audit

Generated: 2026-06-20T16:41:00.721Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 62
- centroid keys: 85
- som keys: 152

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 62 | bifrost:packet:58e6adafde74465d, bifrost:packet:de3c1300921c8d5d, bifrost:packet:891b73e8db9c3bb7, bifrost:packet:1d5eba7211dea6f9, bifrost:packet:0bffe0382a0d44bb | bifrost:packet:58e6adafde74465d:603833, bifrost:packet:de3c1300921c8d5d:603833, bifrost:packet:891b73e8db9c3bb7:603833, bifrost:packet:1d5eba7211dea6f9:603833, bifrost:packet:0bffe0382a0d44bb:603833 |
| `centroid:*` | 85 | centroid:60, centroid:84, centroid:11, centroid:73, centroid:47 | centroid:60:452322, centroid:84:452326, centroid:11:452311, centroid:73:452324, centroid:47:452319 |
| `som:*` | 152 | som:135, som:3, som:37, som:cell:8, som:cell:44 | som:135:452353, som:3:452328, som:37:452332, som:cell:8:452344, som:cell:44:452346 |
| `bifrost:sem:packet:*` | 0 | none | none |
| `bifrost:sem:feature:*` | 0 | none | none |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 19 | ace:feature:indexer, ace:feature:tests, ace:feature:ace, ace:feature:analytics, ace:feature:simulation | ace:feature:indexer:521291, ace:feature:tests:521291, ace:feature:ace:521290, ace:feature:analytics:521290, ace:feature:simulation:521290 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 1 | ace:authority:top | ace:authority:top:16648 |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
