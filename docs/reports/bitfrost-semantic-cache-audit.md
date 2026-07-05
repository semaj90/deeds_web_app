# Bitfrost Semantic Cache Audit

Generated: 2026-07-05T00:02:41.860Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 13277
- centroid keys: 807
- som keys: 62

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 13277 | bifrost:packet:packet:c94fa6dc124e, bifrost:summary:summary:a6da58c7e12a0e09, bifrost:packet:packet:8fb96779c206, bifrost:feature:uuid_aliases, bifrost:packet:packet:c2a01e2c5f67 | bifrost:packet:packet:c94fa6dc124e:519600, bifrost:summary:summary:a6da58c7e12a0e09:589425, bifrost:packet:packet:8fb96779c206:519599, bifrost:feature:uuid_aliases:519599, bifrost:packet:packet:c2a01e2c5f67:519599 |
| `centroid:*` | 807 | centroid:som:366, centroid:som:104, centroid:som:187, centroid:som:357, centroid:som:-302 | centroid:som:366:34814, centroid:som:104:34806, centroid:som:187:34808, centroid:som:357:34812, centroid:som:-302:34811 |
| `som:*` | 62 | som:12, som:14, som:72, som:33, som:53 | som:12:-1, som:14:-1, som:72:-1, som:33:-1, som:53:-1 |
| `bifrost:sem:packet:*` | 26 | bifrost:sem:packet:packet:0014d8ac7795, bifrost:sem:packet:packet:0003850e84ca, bifrost:sem:packet:packet:0003dda5e534, bifrost:sem:packet:packet:0003ab694534, bifrost:sem:packet:packet:000db15dc8ef | bifrost:sem:packet:packet:0014d8ac7795:85252, bifrost:sem:packet:packet:0003850e84ca:85123, bifrost:sem:packet:packet:0003dda5e534:85134, bifrost:sem:packet:packet:0003ab694534:85127, bifrost:sem:packet:packet:000db15dc8ef:85191 |
| `bifrost:sem:feature:*` | 364 | bifrost:sem:feature:neschrom97.e81f3b25f72346e6, bifrost:sem:feature:sveltekit-frontend.llm-paths, bifrost:sem:feature:crates.libryu-555024bdb0a51304, bifrost:sem:feature:neschrom97.e5b71494c1198d9a, bifrost:sem:feature:sveltekit-frontend.run | bifrost:sem:feature:neschrom97.e81f3b25f72346e6:589418, bifrost:sem:feature:sveltekit-frontend.llm-paths:589403, bifrost:sem:feature:crates.libryu-555024bdb0a51304:85195, bifrost:sem:feature:neschrom97.e5b71494c1198d9a:589391, bifrost:sem:feature:sveltekit-frontend.run:589094 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 26 | ace:context:packet:0014d8ac7795, ace:context:packet:0011a232d0b8, ace:context:packet:0003dda5e534, ace:context:packet:000b2df0cfdf, ace:context:packet:000e4d5a58e7 | ace:context:packet:0014d8ac7795:2434, ace:context:packet:0011a232d0b8:2416, ace:context:packet:0003dda5e534:2320, ace:context:packet:000b2df0cfdf:2367, ace:context:packet:000e4d5a58e7:2377 |
| `ace:summary:*` | 559 | ace:summary:packet:0003dda5e534, ace:summary:summary:27ca5ce439cb1df7, ace:summary:packet:0006ca4a45e3, ace:summary:summary:f4a55002b431b471, ace:summary:summary:6d468906c8c5722a | ace:summary:packet:0003dda5e534:2322, ace:summary:summary:27ca5ce439cb1df7:589441, ace:summary:packet:0006ca4a45e3:2335, ace:summary:summary:f4a55002b431b471:589038, ace:summary:summary:6d468906c8c5722a:589046 |
| `ace:feature:*` | 25 | ace:feature:sveltekit-frontend.sprint5-6-monitoring.spec, ace:feature:llama-cpp-turboquant-gemma4.completion, ace:feature:sveltekit-frontend.phase76-acp-tools.property.test, ace:feature:neschrom97.a45aa64da8f0240c, ace:feature:scripts.generate-concept-temperature-report | ace:feature:sveltekit-frontend.sprint5-6-monitoring.spec:2324, ace:feature:llama-cpp-turboquant-gemma4.completion:2333, ace:feature:sveltekit-frontend.phase76-acp-tools.property.test:2358, ace:feature:neschrom97.a45aa64da8f0240c:2434, ace:feature:scripts.generate-concept-temperature-report:2395 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 1 | ace:authority:top | ace:authority:top:15261 |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
