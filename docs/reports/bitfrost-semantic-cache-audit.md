# Bitfrost Semantic Cache Audit

Generated: 2026-06-19T17:22:45.064Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 148
- centroid keys: 85
- som keys: 152

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 148 | bifrost:packet:885c6c04322f6095, bifrost:packet:4b6c2a8267660eb3, bifrost:packet:bbbe630740c5d753, bifrost:sem:intent:6df9c92c207644b6, bifrost:packet:17dc1fe9f5f8a021 | bifrost:packet:885c6c04322f6095:102614, bifrost:packet:4b6c2a8267660eb3:77310, bifrost:packet:bbbe630740c5d753:102614, bifrost:sem:intent:6df9c92c207644b6:43381, bifrost:packet:17dc1fe9f5f8a021:102614 |
| `centroid:*` | 85 | centroid:68, centroid:98, centroid:16, centroid:69, centroid:78 | centroid:68:536214, centroid:98:536220, centroid:16:536203, centroid:69:536214, centroid:78:536215 |
| `som:*` | 152 | som:80, som:cell:9, som:cell:17, som:cell:42, som:cell:71 | som:80:536235, som:cell:9:536218, som:cell:17:536222, som:cell:42:536247, som:cell:71:536248 |
| `bifrost:sem:packet:*` | 45 | bifrost:sem:packet:6a058b76b6d7100c, bifrost:sem:packet:ebc8cdd4145caacf, bifrost:sem:packet:evidence_search_a3e84056, bifrost:sem:packet:473463c5ae07ef36, bifrost:sem:packet:codebase_stats_a3e84056 | bifrost:sem:packet:6a058b76b6d7100c:43372, bifrost:sem:packet:ebc8cdd4145caacf:43371, bifrost:sem:packet:evidence_search_a3e84056:43371, bifrost:sem:packet:473463c5ae07ef36:43370, bifrost:sem:packet:codebase_stats_a3e84056:43370 |
| `bifrost:sem:feature:*` | 10 | bifrost:sem:feature:legal-statutes, bifrost:sem:feature:ai-agent, bifrost:sem:feature:unknown, bifrost:sem:feature:sveltekit-frontend, bifrost:sem:feature:evidence-pipeline | bifrost:sem:feature:legal-statutes:43367, bifrost:sem:feature:ai-agent:43367, bifrost:sem:feature:unknown:43367, bifrost:sem:feature:sveltekit-frontend:43367, bifrost:sem:feature:evidence-pipeline:43367 |
| `bifrost:sem:intent:*` | 13 | bifrost:sem:intent:6df9c92c207644b6, bifrost:sem:intent:e09efdc95c9548f9, bifrost:sem:intent:c182e42d4c34122d, bifrost:sem:intent:1184fb07bfe6ed33, bifrost:sem:intent:31b013e3547d56c4 | bifrost:sem:intent:6df9c92c207644b6:43365, bifrost:sem:intent:e09efdc95c9548f9:43364, bifrost:sem:intent:c182e42d4c34122d:43364, bifrost:sem:intent:1184fb07bfe6ed33:43364, bifrost:sem:intent:31b013e3547d56c4:43364 |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 1 | ace:authority:top | ace:authority:top:13823 |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
